/**
 * Reply Sweep — Story 21.2 (Ingestão de Respostas por Polling)
 *
 * Busca respostas de leads via GET /api/v2/emails (Instantly) e grava em
 * `campaign_events` (source='polling', event_type='email_replied') com payload
 * equivalente ao do webhook. O processador (reply-processor.ts) consome de lá,
 * independente da source (webhook OU polling) — o receiver do webhook (Epic 10)
 * permanece intocado como upgrade path.
 *
 * Cliente Supabase parametrizado: roda sob service-role no cron e sob admin no
 * backfill. Espelha estruturalmente monitoring-processor.ts (Stories 13.3/13.9).
 *
 * Dedupe: `.insert()` simples + trata Postgres `23505` como sucesso benigno
 * (exatamente como o webhook do Epic 10 — NÃO usa `.upsert` com merge).
 * `event_timestamp = email.timestamp_created` (ISO estável) para o dedupe pela
 * UNIQUE 4-tupla de `campaign_events` funcionar entre polls (risco #1 das Dev Notes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TrackingService } from "@/lib/services/tracking";
import { getApiKey } from "@/lib/utils/monitoring-processor";
import type { InstantlyReceivedEmail } from "@/types/tracking";

// ==============================================
// CONSTANTS
// ==============================================

/** Sobreposição da janela incremental (o dedupe 23505 torna o overlap seguro). */
export const REPLY_SWEEP_OVERLAP_MINUTES = 10;
/** Piso da janela quando não há linhas polling anteriores (primeiro sweep). */
export const REPLY_SWEEP_FLOOR_DAYS = 30;

// ==============================================
// TYPES
// ==============================================

export interface SweepParams {
  /**
   * ISO — janela ampla para backfill. Se omitido, o sweep calcula a janela
   * incremental por tenant a partir do último `event_timestamp` de polling.
   */
  since?: string;
  /** Se informado, varre apenas este tenant (backfill admin). */
  tenantId?: string;
}

export interface SweepResult {
  swept: number;
  skipped: number;
  tenants: number;
  errors: Array<{ tenantId: string; error: string }>;
}

interface CampaignRef {
  id: string;
  tenant_id: string;
}

// ==============================================
// STRUCTURED LOGGING (fail-open — nunca quebra o cron)
// ==============================================

function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(`[reply-sweep] ${message}`, meta ?? "");
}

function logWarn(message: string, meta?: Record<string, unknown>): void {
  console.warn(`[reply-sweep] ${message}`, meta ?? "");
}

// ==============================================
// HELPERS
// ==============================================

/** Lista tenants com `api_config` de `instantly` (ou apenas o tenant informado). */
async function listInstantlyTenants(
  supabase: SupabaseClient,
  tenantId?: string
): Promise<string[]> {
  if (tenantId) return [tenantId];

  const { data, error } = await supabase
    .from("api_configs")
    .select("tenant_id")
    .eq("service_name", "instantly");

  if (error || !data) {
    logError("failed to list instantly tenants", { error: error?.message });
    return [];
  }

  const ids = new Set<string>();
  for (const row of data as Array<{ tenant_id: string | null }>) {
    if (row.tenant_id) ids.add(row.tenant_id);
  }
  return [...ids];
}

/**
 * Janela incremental sem tabela nova: `MAX(event_timestamp)` de polling menos um
 * overlap. Piso default (30 dias atrás) quando não há linhas — o dedupe 23505
 * torna o overlap seguro.
 */
async function computeIncrementalSince(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string> {
  const { data } = await supabase
    .from("campaign_events")
    .select("event_timestamp")
    .eq("tenant_id", tenantId)
    .eq("source", "polling")
    .eq("event_type", "email_replied")
    .order("event_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const last = (data as { event_timestamp?: string } | null)?.event_timestamp;
  if (last) {
    const ms = new Date(last).getTime() - REPLY_SWEEP_OVERLAP_MINUTES * 60_000;
    return new Date(ms).toISOString();
  }

  const floorMs = Date.now() - REPLY_SWEEP_FLOOR_DAYS * 24 * 60 * 60 * 1000;
  return new Date(floorMs).toISOString();
}

/** E-mail do lead (remetente da resposta), normalizado (trim). Null se ausente. */
function resolveLeadEmail(email: InstantlyReceivedEmail): string | null {
  const raw = email.lead;
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Monta o payload equivalente ao body do webhook. O processador extrai
 * `reply_text` <- `body.text`, `reply_subject` <- `subject`. `message_id` vai no
 * payload (a coluna não existe em campaign_events) para threading/dual-source.
 * `unibox_url` NÃO é entregue via polling (fica ausente -> null na oportunidade).
 */
export function buildReplyEventPayload(
  email: InstantlyReceivedEmail
): Record<string, unknown> {
  return {
    message_id: email.message_id ?? null,
    subject: email.subject ?? null,
    body: {
      text: email.body?.text ?? null,
      html: email.body?.html ?? null,
    },
    timestamp_created: email.timestamp_created,
    timestamp_email: email.timestamp_email ?? null,
    i_status: typeof email.i_status === "number" ? email.i_status : null,
    email_type: email.email_type ?? null,
    ue_type: typeof email.ue_type === "number" ? email.ue_type : null,
    to_address_email_list: email.to_address_email_list ?? null,
    source: "polling",
  };
}

/** Lookup de campanha por `external_campaign_id` + tenant (mesmo padrão do webhook). */
async function lookupCampaign(
  supabase: SupabaseClient,
  tenantId: string,
  externalCampaignId: string
): Promise<CampaignRef | null> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, tenant_id")
    .eq("external_campaign_id", externalCampaignId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logError("campaign lookup failed", {
      tenantId,
      externalCampaignId,
      error: error.message,
    });
    return null;
  }
  return (data as CampaignRef | null) ?? null;
}

type InsertOutcome = "inserted" | "duplicate" | "error";

/** INSERT em campaign_events. Distingue inserido / duplicata benigna / erro REAL. */
async function insertReplyEvent(
  supabase: SupabaseClient,
  campaign: CampaignRef,
  email: InstantlyReceivedEmail,
  leadEmail: string
): Promise<{ outcome: InsertOutcome; error?: string }> {
  const { error } = await supabase.from("campaign_events").insert({
    tenant_id: campaign.tenant_id,
    campaign_id: campaign.id,
    event_type: "email_replied",
    lead_email: leadEmail,
    event_timestamp: email.timestamp_created,
    payload: buildReplyEventPayload(email),
    source: "polling",
  });

  if (error) {
    // ON CONFLICT DO NOTHING — 23505 é duplicata (evento já ingerido) = sucesso benigno.
    if (error.code === "23505") return { outcome: "duplicate" };
    // Qualquer outro erro é REAL — precisa aparecer no resumo, não virar "skipped" mudo.
    logError("failed to insert campaign_event", {
      tenantId: campaign.tenant_id,
      emailId: email.id,
      error: error.message,
    });
    return { outcome: "error", error: error.message };
  }
  return { outcome: "inserted" };
}

/** Varre um tenant: busca received emails e grava campaign_events. */
async function sweepTenant(
  supabase: SupabaseClient,
  tenantId: string,
  tracking: TrackingService,
  sinceOverride?: string
): Promise<{ swept: number; skipped: number; error?: string; rowErrors?: string[] }> {
  const apiKey = await getApiKey(supabase, tenantId, "instantly");
  if (!apiKey) {
    logWarn("no instantly api key — skipping tenant (fail-open)", { tenantId });
    return { swept: 0, skipped: 0, error: "no-instantly-key" };
  }

  const since = sinceOverride ?? (await computeIncrementalSince(supabase, tenantId));

  let emails: InstantlyReceivedEmail[];
  try {
    emails = await tracking.getReceivedEmails({ apiKey, since });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logError("getReceivedEmails failed — degrading gracefully", { tenantId, message });
    return { swept: 0, skipped: 0, error: message };
  }

  // Cache de lookups external_campaign_id -> campanha local (por sweep de tenant).
  const campaignCache = new Map<string, CampaignRef | null>();

  let swept = 0;
  let skipped = 0;
  const rowErrors: string[] = [];

  for (const email of emails) {
    const externalId = email.campaign_id ?? email.campaign;
    const leadEmail = resolveLeadEmail(email);
    // `event_timestamp` = timestamp_created é NOT NULL no schema E é a chave de dedupe;
    // sem ele o INSERT falharia com 23502 e não haveria como deduplicar — pular.
    if (!externalId || !leadEmail || !email.timestamp_created) {
      skipped++;
      continue;
    }

    let campaign = campaignCache.get(externalId);
    if (campaign === undefined) {
      campaign = await lookupCampaign(supabase, tenantId, externalId);
      campaignCache.set(externalId, campaign);
    }
    if (!campaign) {
      // Campanha desconhecida — pular silenciosamente (espelha o webhook).
      skipped++;
      continue;
    }

    const res = await insertReplyEvent(supabase, campaign, email, leadEmail);
    if (res.outcome === "inserted") swept++;
    else if (res.outcome === "duplicate") skipped++;
    else rowErrors.push(res.error ?? "campaign_event insert error");
  }

  return { swept, skipped, rowErrors };
}

// ==============================================
// PUBLIC: sweepReplies
// ==============================================

/**
 * Varre respostas via polling e grava em campaign_events. Isola falha por-tenant
 * com Promise.allSettled (fail-open). Idempotente por construção (dedupe 23505).
 */
export async function sweepReplies(
  supabase: SupabaseClient,
  params: SweepParams = {}
): Promise<SweepResult> {
  const tracking = new TrackingService();
  const tenantIds = await listInstantlyTenants(supabase, params.tenantId);

  const settled = await Promise.allSettled(
    tenantIds.map((tenantId) =>
      sweepTenant(supabase, tenantId, tracking, params.since)
    )
  );

  let swept = 0;
  let skipped = 0;
  const errors: Array<{ tenantId: string; error: string }> = [];

  settled.forEach((result, i) => {
    const tenantId = tenantIds[i];
    if (result.status === "fulfilled") {
      swept += result.value.swept;
      skipped += result.value.skipped;
      if (result.value.error) errors.push({ tenantId, error: result.value.error });
      for (const rowError of result.value.rowErrors ?? []) {
        errors.push({ tenantId, error: rowError });
      }
    } else {
      errors.push({ tenantId, error: String(result.reason) });
    }
  });

  return { swept, skipped, tenants: tenantIds.length, errors };
}
