/**
 * Notification Processor — Story 21.7 (Notificações Proativas + Configurações)
 *
 * A camada de PROATIVIDADE do Loop de Resposta: a oportunidade já é detectada (21.2/21.6),
 * classificada (21.3) e exibida na Central (21.4/21.5) — este passe leva o alerta ao vendedor
 * (WhatsApp + notificação in-app persistida) mesmo fora da plataforma.
 *
 * Espelha estruturalmente `classifyPendingReplies` (reply-classifier.ts, 21.3): seleciona
 * pendentes por marcador nullable (`notified_at IS NULL` aqui, `intent IS NULL` lá), agrupa por
 * tenant, carrega config 1×/tenant, `Promise.allSettled` por-item em lotes, fail-open. Cliente
 * Supabase parametrizado (service-role no cron). Encadeado POR ÚLTIMO no cron (depois do
 * classify — o WhatsApp por intent depende de `intent` já setado).
 *
 * FAIL-OPEN (AC4): a notificação in-app é sempre criada quando habilitada, e `notified_at` é
 * setado, MESMO que o WhatsApp falhe (Z-API fora, sem número, sem chave) — o erro é logado e
 * nunca quebra o cron.
 *
 * NÃO usa IA (mensagem é template puro — sem custo, sem api_usage_logs). NÃO grava em
 * `whatsapp_messages` (aquela tabela é p/ mensagens ao LEAD — Epic 11/13.7/21.5; aqui é alerta
 * INTERNO ao vendedor). NÃO reusa a server action `sendWhatsApp*` (depende de sessão).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getApiKey } from "@/lib/utils/monitoring-processor";
import { ZApiService } from "@/lib/services/zapi";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  toNotificationSettings,
  OPPORTUNITY_INTENT_CONFIG,
  type NotificationSettings,
  type NotificationSettingsRow,
  type OpportunityIntent,
  type OpportunitySource,
} from "@/types/opportunity";

// ==============================================
// CONSTANTS
// ==============================================

/** Cap defensivo de oportunidades avaliadas por execução (custo/latência). */
export const MAX_NOTIFY_PER_RUN = 200;

/** Concorrência do passe — isolamento por-item com Promise.allSettled em lotes (in-app inserts). */
export const NOTIFY_CONCURRENCY = 10;

/** Acima deste nº de WhatsApp-elegíveis no ciclo/tenant, agrupa numa mensagem por número (AC6). */
export const NOTIFY_GROUP_THRESHOLD = 3;

/**
 * Freshness-guard (Task 4.4) — belt-and-suspenders do backfill: só envia WhatsApp de
 * oportunidades criadas nos últimos 60 min. Protege contra qualquer backlog residual mesmo
 * se a supressão do backfill (suppressOnly) falhar. Fora da janela: in-app ainda é criada.
 */
export const MAX_WHATSAPP_NOTIFY_AGE_MS = 60 * 60 * 1000;

// ==============================================
// STRUCTURED LOGGING (fail-open — nunca quebra o cron)
// ==============================================

function logWarn(message: string, meta?: Record<string, unknown>): void {
  console.warn(`[notification-processor] ${message}`, meta ?? "");
}

function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(`[notification-processor] ${message}`, meta ?? "");
}

// ==============================================
// TYPES
// ==============================================

export interface NotifyParams {
  /** Se informado, avalia apenas oportunidades deste tenant (backfill admin). */
  tenantId?: string;
  /**
   * Backfill (Task 3.3 — TRAP central): NÃO envia nada; apenas marca `notified_at = now()`
   * em todo o backlog do tenant. Sem isto, o 1º ciclo do cron pós-backfill dispararia WhatsApp
   * para meses de histórico (spam do vendedor).
   */
  suppressOnly?: boolean;
}

export interface NotifyResult {
  /** Notificações in-app persistidas (1 por oportunidade). */
  inAppCreated: number;
  /** Mensagens WhatsApp individuais enviadas com sucesso. */
  whatsappSent: number;
  /** Mensagens WhatsApp agrupadas enviadas com sucesso (AC6). */
  whatsappGrouped: number;
  /** Oportunidades marcadas SEM enviar (modo suppressOnly / canais desabilitados). */
  suppressed: number;
  /** Oportunidades avaliadas que não geraram nenhum canal. */
  skipped: number;
  errors: Array<{ scope: string; tenantId?: string; opportunityId?: string; error: string }>;
}

interface PendingNotifyOpportunity {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  campaign_id: string;
  source: OpportunitySource;
  intent: OpportunityIntent | null;
  // Story 21.6: métricas de engajamento (nullable — só source='engagement'). Alimentam a
  // cópia do WhatsApp de engajamento ("abriu o e-mail 3× e clicou em 1 link").
  open_count: number | null;
  click_count: number | null;
  created_at: string;
  leads: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  } | null;
}

/** WhatsApp-elegível coletado no ciclo — enviado (agrupado ou individual) na fase B. */
interface WhatsAppEligible {
  opportunityId: string;
  /** Decide a cópia: 'reply' → "respondeu … — {intent}"; 'engagement' → "engajou … {métricas}". */
  source: OpportunitySource;
  leadName: string;
  company: string;
  /** Só usado quando source='reply' (label do intent). Vazio para engagement. */
  intentLabel: string;
  campaignName: string;
  /** Métricas de engajamento (só source='engagement'). */
  openCount: number | null;
  clickCount: number | null;
}

// ==============================================
// PURE HELPERS — composição da mensagem (Task 4.1/4.2)
// ==============================================

/** Nome do lead a partir do embed (trim). Fallback neutro quando não há lead casado. */
export function buildLeadName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  const name = [first, last]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ")
    .trim();
  return name || "Lead";
}

/**
 * Detalhe factual do engajamento a partir das métricas (opens/clicks). Só conta o que de fato
 * aconteceu — engajamento qualifica por `opens OU ≥1 clique` (engagement-processor), então pelo
 * menos um dos ramos é verdadeiro na prática; o fallback cobre métricas ausentes (null) sem
 * mentir. NUNCA usa "respondeu": o lead abriu/clicou, não respondeu.
 */
export function buildEngagementDetail(
  openCount: number | null | undefined,
  clickCount: number | null | undefined
): string {
  const opens = typeof openCount === "number" && openCount > 0 ? openCount : 0;
  const clicks = typeof clickCount === "number" && clickCount > 0 ? clickCount : 0;
  const parts: string[] = [];
  if (opens > 0) parts.push(`abriu o e-mail ${opens}×`);
  if (clicks > 0) parts.push(`clicou em ${clicks} ${clicks === 1 ? "link" : "links"}`);
  return parts.length > 0 ? parts.join(" e ") : "abriu ou clicou no e-mail";
}

/**
 * Task 4.1 (AC1) — mensagem de oportunidade individual. Ramifica pela FONTE do sinal para não
 * mentir sobre o que o lead fez:
 *  - `reply`: o lead RESPONDEU o e-mail. Verbo "respondeu"; o intent (OPPORTUNITY_INTENT_CONFIG,
 *    fonte única) entra como CLASSIFICAÇÃO após "—" (não como objeto do verbo), então
 *    "respondeu na campanha X — Objeção" continua correto mesmo p/ intents não-quentes.
 *  - `engagement`: o lead só ABRIU/CLICOU (não respondeu). Verbo "engajou" + o que fez de fato
 *    (buildEngagementDetail). Emoji 👀 (vs 🔥 do reply) diferencia os dois sinais no celular.
 * Sem link (NEXT_PUBLIC_SITE_URL vazio) → mensagem vai sem a linha da Central (nunca quebra).
 */
export function buildHotLeadMessage(params: {
  source: OpportunitySource;
  leadName: string;
  company: string;
  intentLabel: string;
  campaignName: string;
  openCount?: number | null;
  clickCount?: number | null;
  link: string;
}): string {
  const who = `${params.leadName} (${params.company})`;
  const base =
    params.source === "engagement"
      ? `👀 Lead engajou: ${who} ${buildEngagementDetail(params.openCount, params.clickCount)} na campanha ${params.campaignName}`
      : `🔥 Lead quente: ${who} respondeu na campanha ${params.campaignName} — ${params.intentLabel}`;
  return params.link ? `${base}\n\nAbrir Central: ${params.link}` : base;
}

/**
 * Task 4.2 (AC6) — mensagem agrupada (> NOTIFY_GROUP_THRESHOLD elegíveis no ciclo). Um lote pode
 * misturar respostas e engajamentos, então evita rotular tudo como "quentes" (overclaim): usa o
 * neutro "novos leads". O detalhe por lead fica na Central.
 */
export function buildGroupedMessage(count: number, link: string): string {
  return link
    ? `🔥 ${count} novos leads — abrir Central: ${link}`
    : `🔥 ${count} novos leads`;
}

/** Link direto para a Central (Task 4.3). Leitura guardada de env (no-non-null-assertion). */
function getAppLink(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  return base ? `${base.replace(/\/$/, "")}/opportunities` : "";
}

// ==============================================
// SETTINGS LOADING (1×/tenant — espelha getApiKey do reply-classifier)
// ==============================================

/**
 * Carrega `notification_settings` do tenant. Sem linha (PGRST116) → defaults seguros
 * (DEFAULT_NOTIFICATION_SETTINGS). Service-role bypassa RLS → filtro explícito por tenant_id.
 * Leitura defensiva do JSONB via `toNotificationSettings` (fecha defers 21.1).
 */
async function loadNotificationSettings(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Pick<NotificationSettings, "whatsappNumbers" | "channels" | "notifyIntents">> {
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    // Erro REAL de leitura (não "sem linha"): propaga. O catch por-tenant pula o tenant SEM marcar
    // notified_at → reentra no próximo ciclo. Evita degradar silenciosamente um tenant CONFIGURADO
    // para defaults (whatsappNumbers vazio) e perder o alerta de WhatsApp com notified_at já setado.
    throw new Error(`notification_settings read failed (${tenantId}): ${error.message}`);
  }

  if (!data) {
    // Sem linha configurada (maybeSingle → data null) → defaults seguros (fail-open: só in-app).
    return {
      whatsappNumbers: DEFAULT_NOTIFICATION_SETTINGS.whatsappNumbers,
      channels: DEFAULT_NOTIFICATION_SETTINGS.channels,
      notifyIntents: DEFAULT_NOTIFICATION_SETTINGS.notifyIntents,
    };
  }

  const settings = toNotificationSettings(data as NotificationSettingsRow);
  return {
    whatsappNumbers: settings.whatsappNumbers,
    channels: settings.channels,
    notifyIntents: settings.notifyIntents,
  };
}

/** Nome das campanhas do tenant (opportunities.campaign_id NÃO tem FK → lookup em lote, Map). */
async function loadCampaignNames(
  supabase: SupabaseClient,
  tenantId: string,
  campaignIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(campaignIds)];
  if (unique.length === 0) return map;

  const { data } = await supabase
    .from("campaigns")
    .select("id, name")
    .in("id", unique)
    .eq("tenant_id", tenantId);

  for (const campaign of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(campaign.id, campaign.name);
  }
  return map;
}

// ==============================================
// PER-OPPORTUNITY WORKER (in-app + coleta de elegível + marca notified_at)
// ==============================================

interface WorkerContext {
  supabase: SupabaseClient;
  tenantId: string;
  channels: NotificationSettings["channels"];
  whatsappNumbers: string[];
  notifyIntents: OpportunityIntent[];
  campaignNames: Map<string, string>;
  link: string;
}

/**
 * Processa UMA oportunidade pendente: reivindica `notified_at` (CAS `.is(null).select()`) PRIMEIRO;
 * se ganhou a linha, cria a in-app (se habilitada) e decide se é WhatsApp-elegível (coleta para o
 * agrupamento da fase B). Corrida perdida (0 linhas) → nenhum side-effect. Retorna o elegível
 * coletado (ou null) + flags de contagem. Fail-open: erro isolado, nunca desfaz.
 */
async function notifyOne(
  ctx: WorkerContext,
  opp: PendingNotifyOpportunity
): Promise<{
  eligible: WhatsAppEligible | null;
  inAppCreated: boolean;
  channelHit: boolean;
  error?: string;
}> {
  const leadName = buildLeadName(opp.leads?.first_name, opp.leads?.last_name);
  const company = opp.leads?.company_name?.trim() || "empresa não informada";
  const campaignName = ctx.campaignNames.get(opp.campaign_id) ?? "campanha desconhecida";

  // CLAIM-FIRST (CAS): reivindica a oportunidade ANTES de qualquer side-effect. O UPDATE
  // `.is("notified_at", null).select("id")` garante que só UM passe processa a opp — se outro passe
  // concorrente (cron×backfill, ou um ciclo do cron que sobrepôs o anterior) já a marcou, 0 linhas
  // voltam e este passe NÃO cria in-app nem enfileira WhatsApp. Sem o claim-first, o INSERT in-app e
  // a coleta do WhatsApp aconteciam ANTES da marcação e não eram desfeitos numa corrida perdida →
  // in-app duplicada + WhatsApp duplicado (o exato spam que a story existe para evitar). Espelha o
  // CAS-como-gate do reply-classifier.ts (`.update({intent}).is("intent", null)`).
  const { data: claimed, error: markError } = await ctx.supabase
    .from("opportunities")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", opp.id)
    .is("notified_at", null)
    .select("id");

  if (markError) {
    logError("failed to claim notified_at", { opportunityId: opp.id, error: markError.message });
    return { eligible: null, inAppCreated: false, channelHit: false, error: markError.message };
  }

  // Corrida perdida: outro passe já reivindicou esta opp (0 linhas) → nada a fazer. Idempotência
  // sob concorrência: nenhum side-effect duplicado.
  if (!claimed || claimed.length === 0) {
    return { eligible: null, inAppCreated: false, channelHit: false };
  }

  let inAppCreated = false;
  let channelHit = false;
  let error: string | undefined;

  // In-app (AC2): sempre 1 por oportunidade, quando habilitada.
  if (ctx.channels.inApp) {
    const { error: insertError } = await ctx.supabase.from("app_notifications").insert({
      tenant_id: ctx.tenantId,
      type: "nova_oportunidade",
      payload: {
        opportunityId: opp.id,
        source: opp.source,
        intent: opp.intent,
        leadName,
        company,
        campaignName,
      },
    });
    if (insertError) {
      // Fail-open: erro na in-app NÃO impede o WhatsApp (notified_at já foi reivindicado acima).
      error = insertError.message;
      logWarn("failed to insert app_notification", {
        opportunityId: opp.id,
        error: insertError.message,
      });
    } else {
      inAppCreated = true;
      channelHit = true;
    }
  }

  // WhatsApp-elegível (AC1/AC5): coletado (não enviado aqui) para o agrupamento da fase B.
  let eligible: WhatsAppEligible | null = null;
  const whatsappChannelOn = ctx.channels.whatsapp && ctx.whatsappNumbers.length > 0;
  const intentQualifies =
    opp.source === "reply" &&
    opp.intent !== null &&
    ctx.notifyIntents.includes(opp.intent);
  const engagementQualifies =
    opp.source === "engagement" && ctx.channels.whatsappEngagement === true;

  if (whatsappChannelOn && (intentQualifies || engagementQualifies)) {
    // Freshness-guard (Task 4.4): aplica SÓ a `source='engagement'` — belt-and-suspenders contra
    // backlog de histórico (backfill). `source='reply'` tem reply_event_id = sinal genuíno e fresco,
    // então é ISENTO: senão o upgrade engagement→reply re-armado pela Task 6 (cujo created_at é o do
    // engajamento ORIGINAL, preservado pela 21.6) teria o WhatsApp do reply quente silenciosamente
    // pulado — exatamente o alerta que a Task 6 existe para disparar. (decisão code-review 21.7)
    let fresh = true;
    if (opp.source === "engagement") {
      const ageMs = Date.now() - new Date(opp.created_at).getTime();
      fresh = Number.isFinite(ageMs) && ageMs <= MAX_WHATSAPP_NOTIFY_AGE_MS;
    }
    if (fresh) {
      // intentLabel só faz sentido p/ reply (classificação da resposta). Engagement usa as
      // métricas (open/click), não um label — a cópia é montada por buildHotLeadMessage/source.
      const intentLabel =
        opp.source === "reply" && opp.intent
          ? OPPORTUNITY_INTENT_CONFIG[opp.intent]?.label ?? "novo sinal"
          : "";
      eligible = {
        opportunityId: opp.id,
        source: opp.source,
        leadName,
        company,
        intentLabel,
        campaignName,
        openCount: opp.open_count,
        clickCount: opp.click_count,
      };
      channelHit = true;
    } else {
      logWarn("whatsapp skipped by freshness-guard (in-app still created)", {
        opportunityId: opp.id,
      });
    }
  }

  return { eligible, inAppCreated, channelHit, error };
}

// ==============================================
// WHATSAPP SEND (fase B — sequencial por número; agrupamento AC6)
// ==============================================

/**
 * Envia os WhatsApp-elegíveis coletados no ciclo do tenant. > NOTIFY_GROUP_THRESHOLD → UMA
 * mensagem agrupada por número; ≤ → individuais (uma por oportunidade × cada número). SEQUENCIAL
 * por número/mensagem (respeita Z-API; anti-pattern #12). Cada envio em try/catch — falha isola,
 * conta em `errors`, NÃO desfaz a in-app nem o notified_at (fail-open AC4).
 */
async function sendWhatsAppBatch(
  supabase: SupabaseClient,
  tenantId: string,
  eligible: WhatsAppEligible[],
  whatsappNumbers: string[],
  link: string,
  result: NotifyResult
): Promise<void> {
  if (eligible.length === 0 || whatsappNumbers.length === 0) return;

  // Chave Z-API descriptografada (contexto de cron, sem sessão). null → só in-app, log.
  const zapiKey = await getApiKey(supabase, tenantId, "zapi");
  if (!zapiKey) {
    logWarn("no zapi key — whatsapp skipped for tenant (in-app already created)", { tenantId });
    return;
  }

  const zapi = new ZApiService();
  const grouped = eligible.length > NOTIFY_GROUP_THRESHOLD;

  for (const phone of whatsappNumbers) {
    if (grouped) {
      const message = buildGroupedMessage(eligible.length, link);
      try {
        await zapi.sendText(zapiKey, phone, message);
        result.whatsappGrouped++;
      } catch (err) {
        result.errors.push({
          scope: "whatsapp",
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
        // NÃO logar `phone` (PII do vendedor — lição da 13.11 sobre telefone em log).
        logWarn("grouped whatsapp send failed (fail-open)", {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      for (const item of eligible) {
        const message = buildHotLeadMessage({
          source: item.source,
          leadName: item.leadName,
          company: item.company,
          intentLabel: item.intentLabel,
          campaignName: item.campaignName,
          openCount: item.openCount,
          clickCount: item.clickCount,
          link,
        });
        try {
          await zapi.sendText(zapiKey, phone, message);
          result.whatsappSent++;
        } catch (err) {
          result.errors.push({
            scope: "whatsapp",
            tenantId,
            opportunityId: item.opportunityId,
            error: err instanceof Error ? err.message : String(err),
          });
          // NÃO logar `phone` (PII do vendedor — lição da 13.11 sobre telefone em log).
          logWarn("individual whatsapp send failed (fail-open)", {
            tenantId,
            opportunityId: item.opportunityId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
}

// ==============================================
// SUPPRESS (backfill — Task 3.3): marca notified_at SEM enviar
// ==============================================

async function suppressTenantBacklog(
  supabase: SupabaseClient,
  tenantId: string,
  result: NotifyResult
): Promise<void> {
  const { data, error } = await supabase
    .from("opportunities")
    .update({ notified_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .is("notified_at", null)
    .select("id");

  if (error) {
    result.errors.push({ scope: "suppress", tenantId, error: error.message });
    logError("failed to suppress backlog", { tenantId, error: error.message });
    return;
  }
  result.suppressed += (data ?? []).length;
}

// ==============================================
// PUBLIC: notifyNewOpportunities (passe encadeado) — Task 3.1 / 5
// ==============================================

/**
 * Passe de notificação: varre `opportunities` com `notified_at` null, cria a in-app (AC2),
 * dispara o WhatsApp para leads quentes (AC1/AC5, agrupado se > threshold — AC6) e marca
 * `notified_at`. Idempotente por construção (só seleciona `notified_at IS NULL`). Fail-open
 * por-item e por-tenant. Encadeado POR ÚLTIMO nas rotas do cron/backfill (depois do classify).
 *
 * `suppressOnly` (backfill): marca todo o backlog SEM enviar (guard-rail central contra spam).
 */
export async function notifyNewOpportunities(
  supabase: SupabaseClient,
  params: NotifyParams = {}
): Promise<NotifyResult> {
  const result: NotifyResult = {
    inAppCreated: 0,
    whatsappSent: 0,
    whatsappGrouped: 0,
    suppressed: 0,
    skipped: 0,
    errors: [],
  };

  // Modo backfill: marca notified_at do tenant SEM enviar nada (Task 3.3, TRAP central).
  if (params.suppressOnly) {
    if (!params.tenantId) {
      result.errors.push({ scope: "suppress", error: "suppressOnly requires tenantId" });
      return result;
    }
    await suppressTenantBacklog(supabase, params.tenantId, result);
    return result;
  }

  // Seleciona pendentes (notified_at NULL) com embed do lead. campaign_id via lookup em lote.
  let query = supabase
    .from("opportunities")
    .select(
      "id, tenant_id, lead_id, campaign_id, source, intent, open_count, click_count, created_at, leads(first_name, last_name, company_name)"
    )
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_NOTIFY_PER_RUN);

  if (params.tenantId) query = query.eq("tenant_id", params.tenantId);

  const { data, error } = await query;
  if (error) {
    result.errors.push({ scope: "select", error: error.message });
    return result;
  }

  const pending = (data ?? []) as unknown as PendingNotifyOpportunity[];
  if (pending.length === 0) return result;

  // Agrupa por tenant (config/credencial resolvidas 1×/tenant).
  const byTenant = new Map<string, PendingNotifyOpportunity[]>();
  for (const opp of pending) {
    const list = byTenant.get(opp.tenant_id) ?? [];
    list.push(opp);
    byTenant.set(opp.tenant_id, list);
  }

  const link = getAppLink();

  for (const [tenantId, opps] of byTenant) {
    try {
      const settings = await loadNotificationSettings(supabase, tenantId);

      // Nenhum canal habilitado → marca notified_at e pula envios (nada a fazer).
      if (!settings.channels.whatsapp && !settings.channels.inApp) {
        await suppressTenantBacklog(supabase, tenantId, result);
        continue;
      }

      const campaignNames = await loadCampaignNames(
        supabase,
        tenantId,
        opps.map((o) => o.campaign_id)
      );

      const ctx: WorkerContext = {
        supabase,
        tenantId,
        channels: settings.channels,
        whatsappNumbers: settings.whatsappNumbers,
        notifyIntents: settings.notifyIntents,
        campaignNames,
        link,
      };

      // Fase A: in-app + coleta de elegíveis + marca notified_at, em lotes de NOTIFY_CONCURRENCY.
      const eligible: WhatsAppEligible[] = [];
      for (let i = 0; i < opps.length; i += NOTIFY_CONCURRENCY) {
        const batch = opps.slice(i, i + NOTIFY_CONCURRENCY);
        const settled = await Promise.allSettled(batch.map((opp) => notifyOne(ctx, opp)));
        settled.forEach((res, j) => {
          if (res.status === "fulfilled") {
            if (res.value.inAppCreated) result.inAppCreated++;
            if (res.value.eligible) eligible.push(res.value.eligible);
            if (!res.value.channelHit) result.skipped++;
            if (res.value.error) {
              result.errors.push({
                scope: "notify",
                tenantId,
                opportunityId: batch[j].id,
                error: res.value.error,
              });
            }
          } else {
            result.skipped++;
            result.errors.push({
              scope: "notify",
              tenantId,
              opportunityId: batch[j].id,
              error: String(res.reason),
            });
          }
        });
      }

      // Fase B: envia os WhatsApp-elegíveis (agrupado ou individual) — sequencial por número.
      await sendWhatsAppBatch(
        supabase,
        tenantId,
        eligible,
        settings.whatsappNumbers,
        link,
        result
      );
    } catch (err) {
      // Erro por-tenant isolado — os demais tenants seguem (fail-open).
      result.errors.push({
        scope: "notify",
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      logError("tenant notify pass threw (isolated)", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
