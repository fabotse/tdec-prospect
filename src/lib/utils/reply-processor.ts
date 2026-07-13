/**
 * Reply Processor — Story 21.2 (Ingestão de Respostas por Polling)
 *
 * Consome `campaign_events` (event_type='email_replied' ainda não processados)
 * e cria `opportunities` (source='reply') + `lead_interactions` (campaign_reply).
 * Independe da `source` do evento (webhook OU polling) — por isso o receiver do
 * webhook (Epic 10) fica intocado e vira upgrade path (dual-source deduplica).
 *
 * Idempotência (NFR2): SEMPRE popula `reply_event_id = campaign_events.id` e trata
 * Postgres `23505` (UNIQUE reply_event_id) como sucesso benigno. NÃO classifica
 * intent por IA (21.3) nem cria source='engagement' (21.6).
 *
 * Cliente Supabase parametrizado (service-role no cron, admin no backfill).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignEventRow } from "@/types/tracking";

// ==============================================
// TYPES
// ==============================================

export interface ProcessReplyResult {
  success: boolean;
  opportunityId?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export interface ProcessResult {
  created: number;
  skipped: number;
  errors: Array<{ eventId: string; error: string }>;
}

// ==============================================
// AUTO-REPLY HEURISTIC (AC4) — não há precedente no webhook a copiar
// ==============================================

/**
 * Regex de OOO / resposta automática — modo CONSERVADOR (decisão Fabossi 2026-07-13,
 * code review 21.2): só marcadores INEQUÍVOCOS de autoresponder, para NUNCA dropar
 * resposta humana real. Como `i_status` volta `undefined` nos dados reais, este regex
 * é o filtro efetivo — por isso frases ambíguas ("de férias", "on vacation",
 * "estarei ausente"), que aparecem em respostas legítimas, ficam DE FORA de propósito.
 * Testado acento-insensível (ver `stripDiacritics`), então os termos vão sem acento.
 */
const AUTO_REPLY_REGEX =
  /out of( the)? office|\bOOO\b|automatic reply|auto-?reply|automated response|resposta autom|ausencia do escrit|fora do escrit/i;

/** Remove diacríticos p/ casar OOO acento-insensível (férias→ferias, automática→automatica). */
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Detecta resposta automática (OOO). Heurística combinada:
 * (a) `i_status === 0` (Out of Office — escala nativa do Instantly, validada no spike;
 *     dormente na prática, pois os dados reais trazem `i_status` undefined);
 * (b) regex conservadora de assunto/corpo (filtro efetivo). Item detectado → NÃO gera oportunidade.
 */
export function detectAutoReply(
  payload: Record<string, unknown>
): { isAuto: boolean; reason?: string } {
  const iStatus = payload.i_status;
  if (typeof iStatus === "number" && iStatus === 0) {
    return { isAuto: true, reason: "lt_interest_status=0 (Out of Office)" };
  }

  const subject = typeof payload.subject === "string" ? payload.subject : "";
  const body = payload.body as { text?: unknown } | null | undefined;
  const bodyText = body && typeof body.text === "string" ? body.text : "";

  if (
    AUTO_REPLY_REGEX.test(stripDiacritics(subject)) ||
    AUTO_REPLY_REGEX.test(stripDiacritics(bodyText))
  ) {
    return { isAuto: true, reason: "matched auto-reply heuristic (subject/body)" };
  }
  return { isAuto: false };
}

// ==============================================
// STRUCTURED LOGGING
// ==============================================

function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(`[reply-processor] ${message}`, meta ?? "");
}

function logWarn(message: string, meta?: Record<string, unknown>): void {
  console.warn(`[reply-processor] ${message}`, meta ?? "");
}

// ==============================================
// HELPERS
// ==============================================

/** Normaliza e-mail (trim + lowercase). Null se ausente. */
function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Escapa metacaracteres de LIKE/ILIKE (`%`, `_`, `\`) para tratar o e-mail como
 * literal. Sem isso, `_` (comum em e-mails, ex.: `ana_paula@`) casa QUALQUER
 * caractere → com `.limit(1)` sem `ORDER BY` a resposta é atribuída ao lead errado.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Match de lead por e-mail + tenant. `.ilike` cobre divergência de caixa; sem
 * `.single()` (a tabela não tem UNIQUE(tenant,email) — >1 linha é possível).
 * Zero matches é esperado e válido (AC7) → retorna null.
 */
async function matchLeadId(
  supabase: SupabaseClient,
  tenantId: string,
  email: string | null
): Promise<string | null> {
  if (!email) return null;

  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("email", escapeLikePattern(email))
    .limit(1)
    .maybeSingle();

  if (error) {
    logError("lead match failed", { tenantId, error: error.message });
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

// ==============================================
// CORE: process single reply event (nunca lança para falhas esperadas)
// ==============================================

export async function processReplyEvent(
  event: CampaignEventRow,
  supabase: SupabaseClient
): Promise<ProcessReplyResult> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  // AC4: filtro de auto-reply ANTES de criar a oportunidade.
  const auto = detectAutoReply(payload);
  if (auto.isAuto) {
    logWarn("skipping auto-reply", { eventId: event.id, reason: auto.reason });
    return { success: true, skipped: true, reason: auto.reason };
  }

  // AC5/AC7: match de lead (pode ser null → oportunidade sem lead_id).
  const leadEmail = normalizeEmail(event.lead_email);
  const leadId = await matchLeadId(supabase, event.tenant_id, leadEmail);

  // Extração do payload (mapeamento das Dev Notes).
  const body = payload.body as { text?: unknown } | null | undefined;
  const replyText = body && typeof body.text === "string" ? body.text : null;
  const replySubject = typeof payload.subject === "string" ? payload.subject : null;
  const uniboxUrl = typeof payload.unibox_url === "string" ? payload.unibox_url : null;
  const iStatus = payload.i_status;
  // Normalização string→int é da 21.3 — aqui só grava se já for int, senão null.
  const ltInterestStatus = typeof iStatus === "number" ? iStatus : null;

  // NFR2: reply_event_id SEMPRE setado (idempotência). intent null (21.3);
  // status/id/created_at/updated_at preenchidos pelo DB (payload parcial).
  const { data: inserted, error } = await supabase
    .from("opportunities")
    .insert({
      tenant_id: event.tenant_id,
      campaign_id: event.campaign_id,
      lead_id: leadId,
      source: "reply",
      reply_event_id: event.id,
      reply_text: replyText,
      reply_subject: replySubject,
      unibox_url: uniboxUrl,
      lt_interest_status: ltInterestStatus,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // UNIQUE(reply_event_id) → evento já processado = sucesso benigno (idempotência).
    if (error.code === "23505") {
      return { success: true, skipped: true, reason: "already-processed" };
    }
    logError("failed to insert opportunity", { eventId: event.id, error: error.message });
    return { success: false, error: error.message };
  }

  const opportunityId = (inserted as { id: string } | null)?.id;

  // AC5: lead_interaction só quando o lead casou (lead_id é NOT NULL na tabela —
  // Option A: sem lead → oportunidade criada, interaction pulada).
  if (leadId) {
    const { error: interactionError } = await supabase
      .from("lead_interactions")
      .insert({
        lead_id: leadId,
        tenant_id: event.tenant_id,
        type: "campaign_reply",
        content: `Resposta de campanha: ${replySubject ?? "(sem assunto)"}`,
        created_by: null,
      });

    if (interactionError) {
      // Interaction é secundária — NÃO falha a oportunidade (precedente import-results).
      logWarn("failed to log lead_interaction (secondary)", {
        eventId: event.id,
        error: interactionError.message,
      });
    }
  }

  return { success: true, opportunityId };
}

// ==============================================
// PUBLIC: processReplies
// ==============================================

/** Teto de eventos por execução (torna o cap PostgREST explícito + observável). */
export const MAX_REPLY_EVENTS_PER_RUN = 1000;
/** Concorrência máxima de workers por execução (evita esgotar o pool de conexões). */
export const REPLY_PROCESS_CONCURRENCY = 20;

/**
 * Processa eventos email_replied ainda não convertidos em oportunidade.
 * LEFT ANTI-JOIN por `opportunities.reply_event_id` (otimização; a correção real
 * de idempotência é o UNIQUE(reply_event_id) + 23505 no worker). Isolamento por
 * item com Promise.allSettled (worker nunca lança para falhas esperadas), em
 * lotes de `REPLY_PROCESS_CONCURRENCY` para não disparar concorrência ilimitada.
 */
export async function processReplies(
  supabase: SupabaseClient,
  params: { tenantId?: string } = {}
): Promise<ProcessResult> {
  const { tenantId } = params;

  // Já processados: reply_event_id já presente em opportunities (buscado ANTES dos
  // eventos). Falha aqui é real — não degrada para "reprocessa tudo".
  let oppQuery = supabase
    .from("opportunities")
    .select("reply_event_id")
    .not("reply_event_id", "is", null);
  if (tenantId) oppQuery = oppQuery.eq("tenant_id", tenantId);

  const { data: existing, error: oppError } = await oppQuery;
  if (oppError) {
    logError("failed to fetch processed opportunities", { tenantId, error: oppError.message });
    return { created: 0, skipped: 0, errors: [{ eventId: "-", error: oppError.message }] };
  }
  const processed = new Set(
    ((existing as Array<{ reply_event_id: string | null }> | null) ?? [])
      .map((o) => o.reply_event_id)
      .filter((id): id is string => id !== null)
  );

  // Eventos email_replied, ordenados (determinismo) e limitados (evita fatiar em
  // ordem indefinida e disparar milhares de workers de uma vez).
  let eventsQuery = supabase
    .from("campaign_events")
    .select("*")
    .eq("event_type", "email_replied");
  if (tenantId) eventsQuery = eventsQuery.eq("tenant_id", tenantId);
  eventsQuery = eventsQuery
    .order("event_timestamp", { ascending: true })
    .limit(MAX_REPLY_EVENTS_PER_RUN);

  const { data: events, error } = await eventsQuery;
  if (error) {
    logError("failed to fetch campaign_events", { tenantId, error: error.message });
    return { created: 0, skipped: 0, errors: [{ eventId: "-", error: error.message }] };
  }
  if (!events || events.length === 0) {
    return { created: 0, skipped: 0, errors: [] };
  }
  if (events.length === MAX_REPLY_EVENTS_PER_RUN) {
    // Backlog >= cap: o restante entra no próximo ciclo (23505 mantém idempotência).
    logWarn("event batch hit cap — backlog remainder processed next cycle", {
      tenantId,
      cap: MAX_REPLY_EVENTS_PER_RUN,
    });
  }

  const pending = (events as CampaignEventRow[]).filter((e) => !processed.has(e.id));

  let created = 0;
  let skipped = 0;
  const errors: Array<{ eventId: string; error: string }> = [];

  for (let i = 0; i < pending.length; i += REPLY_PROCESS_CONCURRENCY) {
    const batch = pending.slice(i, i + REPLY_PROCESS_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((event) => processReplyEvent(event, supabase))
    );

    settled.forEach((result, j) => {
      const eventId = batch[j].id;
      if (result.status === "fulfilled") {
        const r = result.value;
        if (r.success && !r.skipped) created++;
        else if (r.skipped) skipped++;
        if (!r.success && r.error) errors.push({ eventId, error: r.error });
      } else {
        errors.push({ eventId, error: String(result.reason) });
      }
    });
  }

  return { created, skipped, errors };
}
