/**
 * Engagement Processor — Story 21.6 (Janela de Oportunidade Cross-Campanha)
 *
 * Pipeline PARALELO ao de resposta (21.2): NÃO passa por `campaign_events` (opens/clicks
 * não viram evento via polling — só replies viram). Lê o tracking ao vivo por campanha
 * exportada (`TrackingService.getLeadTracking` → opens/clicks por lead), qualifica com o
 * `opportunity-engine` estendido (opens OU ≥1 clique) e persiste `opportunities`
 * (source='engagement') com métricas open/click/último engajamento.
 *
 * Espelha estruturalmente `reply-sweep.ts`: iteração de tenants + Promise.allSettled +
 * fail-open per-tenant. Cliente Supabase parametrizado (service-role no cron, admin no
 * backfill). Idempotente: dedup app-level ("ativo do mesmo lead") + índice parcial
 * `uq_opportunities_engagement` (00057) + `23505` benigno.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TrackingService } from "@/lib/services/tracking";
import { getApiKey } from "@/lib/utils/monitoring-processor";
import { matchLeadId, normalizeEmail } from "@/lib/utils/reply-processor";
import {
  evaluateOpportunityWindow,
  getDefaultConfig,
} from "@/lib/services/opportunity-engine";
import {
  transformOpportunityConfigRow,
  type OpportunityConfig,
  type OpportunityConfigRow,
  type OpportunityLead,
} from "@/types/tracking";
import { ACTIVE_OPPORTUNITY_STATUSES } from "@/types/opportunity";
import { normalizeLtInterestStatus } from "@/lib/utils/lt-interest";

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Cap defensivo de campanhas por ciclo (NFR5 — rate limit 20 req/min). O cliente tem
 * ~7 campanhas exportadas hoje, folgado; o cap protege contra crescimento. O remanescente
 * é logado e entra no próximo ciclo (idempotente, então nada se perde).
 */
export const MAX_CAMPAIGNS_PER_CYCLE = 15;

// ==============================================
// TYPES
// ==============================================

export interface EngagementParams {
  /** Se informado, processa apenas este tenant (backfill admin). */
  tenantId?: string;
}

export interface EngagementResult {
  created: number;
  skipped: number;
  errors: Array<{ tenantId: string; campaignId?: string; error: string }>;
}

interface ExportedCampaign {
  id: string;
  external_campaign_id: string;
}

// ==============================================
// STRUCTURED LOGGING (fail-open — nunca quebra o cron)
// ==============================================

function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(`[engagement-processor] ${message}`, meta ?? "");
}

function logWarn(message: string, meta?: Record<string, unknown>): void {
  console.warn(`[engagement-processor] ${message}`, meta ?? "");
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

/** Enumera campanhas exportadas do tenant (têm external_campaign_id). */
async function listExportedCampaigns(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ExportedCampaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, external_campaign_id")
    .eq("tenant_id", tenantId)
    .not("external_campaign_id", "is", null);

  if (error || !data) {
    logError("failed to list exported campaigns", { tenantId, error: error?.message });
    return [];
  }

  return (data as Array<{ id: string; external_campaign_id: string | null }>)
    .filter((c): c is ExportedCampaign => c.external_campaign_id != null);
}

/**
 * Carrega o OpportunityConfig do tenant/campanha; fallback para o default quando não há
 * linha configurada (mesmo fallback do `useOpportunityConfig`). O threshold de clique é
 * constante (MIN_CLICKS_FOR_OPPORTUNITY), não vive no config.
 */
async function loadCampaignConfig(
  supabase: SupabaseClient,
  campaignId: string
): Promise<OpportunityConfig | null> {
  const { data, error } = await supabase
    .from("opportunity_configs")
    .select("*")
    .eq("campaign_id", campaignId)
    .limit(1)
    .maybeSingle();

  // Erro transitório NÃO pode virar fallback silencioso para o default: aplicaria
  // minOpens=3/period=7 no lugar do threshold do tenant → cards espúrios. Sinaliza
  // skip (null) — a campanha é reprocessada no próximo ciclo (fail-open observável).
  if (error) {
    logError("failed to load opportunity config — skipping campaign this cycle", {
      campaignId,
      error: error.message,
    });
    return null;
  }
  if (data) {
    return transformOpportunityConfigRow(data as OpportunityConfigRow);
  }
  // Sem linha configurada (não é erro) → default, igual ao useOpportunityConfig.
  return getDefaultConfig(campaignId);
}

/**
 * Cria a oportunidade de engajamento de um lead qualificado, com dedup em duas camadas.
 * Retorna "created" | "skipped" (dedup/23505/sem lead local) | erro.
 */
async function createEngagementOpportunity(
  supabase: SupabaseClient,
  tenantId: string,
  localCampaignId: string,
  lead: OpportunityLead
): Promise<{ outcome: "created" | "skipped"; error?: string }> {
  // Match de lead local OBRIGATÓRIO. LeadTracking.leadId é o id do lead no Instantly,
  // não o local → casar por e-mail. Sem lead local → PULAR (não é erro; ver Dev Notes
  // "Por que engajamento exige lead local").
  const leadEmail = normalizeEmail(lead.leadEmail);
  const leadId = await matchLeadId(supabase, tenantId, leadEmail);
  if (!leadId) {
    logWarn("engagement lead has no local match — skipping", { tenantId, leadEmail });
    return { outcome: "skipped" };
  }

  // Dedup app-level (AC1 "ativo do mesmo lead"): se já há oportunidade ativa do lead —
  // QUALQUER source/campanha — não duplica card para lead já na Central.
  const { data: active, error: activeError } = await supabase
    .from("opportunities")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .in("status", ACTIVE_OPPORTUNITY_STATUSES as unknown as string[])
    .limit(1)
    .maybeSingle();

  if (activeError) {
    logError("active-opportunity dedup check failed", { tenantId, leadId, error: activeError.message });
    return { outcome: "skipped", error: activeError.message };
  }
  if ((active as { id: string } | null)?.id) {
    return { outcome: "skipped" };
  }

  // Story 21.3 (Task 3.2): normaliza string→int. `LeadTracking.ltInterestStatus` é `string`,
  // então o ramo `typeof === "number"` anterior era MORTO e gravava sempre null. Fecha o
  // defer da 21.6 (lt_interest_status sempre null p/ engagement) — aditivo: só "null → valor real".
  const ltInterestStatus = normalizeLtInterestStatus(lead.ltInterestStatus);

  const { error } = await supabase.from("opportunities").insert({
    tenant_id: tenantId,
    campaign_id: localCampaignId,
    lead_id: leadId,
    source: "engagement",
    reply_event_id: null,
    open_count: lead.openCount,
    click_count: lead.clickCount,
    last_engagement_at: lead.lastEngagementAt,
    lt_interest_status: ltInterestStatus,
  });

  if (error) {
    // uq_opportunities_engagement (reprocesso do mesmo campaign+lead) → sucesso benigno.
    if (error.code === "23505") {
      return { outcome: "skipped" };
    }
    logError("failed to insert engagement opportunity", { tenantId, leadId, error: error.message });
    return { outcome: "skipped", error: error.message };
  }

  // NÃO registra lead_interaction: o enum PG `interaction_type` (00013) não tem valor de
  // engajamento (só `campaign_reply`), e adicionar exigiria ALTER TYPE (fora de escopo).
  return { outcome: "created" };
}

/** Processa uma campanha exportada: tracking ao vivo → engine → oportunidades. */
async function processCampaign(
  supabase: SupabaseClient,
  tenantId: string,
  apiKey: string,
  campaign: ExportedCampaign,
  tracking: TrackingService
): Promise<{ created: number; skipped: number; error?: string; rowErrors?: string[] }> {
  let leads;
  try {
    leads = await tracking.getLeadTracking({
      apiKey,
      externalCampaignId: campaign.external_campaign_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logError("getLeadTracking failed — degrading gracefully", {
      tenantId,
      campaignId: campaign.id,
      message,
    });
    return { created: 0, skipped: 0, error: message };
  }

  const config = await loadCampaignConfig(supabase, campaign.id);
  if (!config) {
    // Config indisponível (erro transitório): pula a campanha este ciclo em vez de
    // qualificar com thresholds default. Surface no resumo (fail-open).
    return { created: 0, skipped: 0, error: "config-load-failed" };
  }
  const qualified = evaluateOpportunityWindow(leads, config);

  let created = 0;
  let skipped = 0;
  const rowErrors: string[] = [];

  for (const lead of qualified) {
    const res = await createEngagementOpportunity(supabase, tenantId, campaign.id, lead);
    if (res.outcome === "created") created++;
    else skipped++;
    if (res.error) rowErrors.push(res.error);
  }

  return { created, skipped, rowErrors };
}

/** Processa um tenant: enumera campanhas exportadas e qualifica cada uma. */
async function processTenant(
  supabase: SupabaseClient,
  tenantId: string,
  tracking: TrackingService
): Promise<{ created: number; skipped: number; error?: string; rowErrors?: string[] }> {
  const apiKey = await getApiKey(supabase, tenantId, "instantly");
  if (!apiKey) {
    logWarn("no instantly api key — skipping tenant (fail-open)", { tenantId });
    return { created: 0, skipped: 0, error: "no-instantly-key" };
  }

  const campaigns = await listExportedCampaigns(supabase, tenantId);
  if (campaigns.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // NFR5: cap defensivo de campanhas por ciclo. O remanescente entra no próximo ciclo.
  const batch = campaigns.slice(0, MAX_CAMPAIGNS_PER_CYCLE);
  if (campaigns.length > MAX_CAMPAIGNS_PER_CYCLE) {
    logWarn("campaign batch hit cap — remainder processed next cycle", {
      tenantId,
      cap: MAX_CAMPAIGNS_PER_CYCLE,
      total: campaigns.length,
    });
  }

  let created = 0;
  let skipped = 0;
  const rowErrors: string[] = [];

  // Sequencial por campanha (1 getLeadTracking cada) — respeita o rate limit (NFR5).
  for (const campaign of batch) {
    const res = await processCampaign(supabase, tenantId, apiKey, campaign, tracking);
    created += res.created;
    skipped += res.skipped;
    if (res.error) rowErrors.push(res.error);
    for (const rowError of res.rowErrors ?? []) rowErrors.push(rowError);
  }

  return { created, skipped, rowErrors };
}

// ==============================================
// PUBLIC: processEngagement
// ==============================================

/**
 * Varre engajamento (opens/clicks) por campanha exportada e cria opportunities
 * (source='engagement'). Isola falha por-tenant com Promise.allSettled (fail-open).
 * Idempotente por construção (dedup app-level + uq_opportunities_engagement + 23505).
 */
export async function processEngagement(
  supabase: SupabaseClient,
  params: EngagementParams = {}
): Promise<EngagementResult> {
  const tracking = new TrackingService();
  const tenantIds = await listInstantlyTenants(supabase, params.tenantId);

  const settled = await Promise.allSettled(
    tenantIds.map((tenantId) => processTenant(supabase, tenantId, tracking))
  );

  let created = 0;
  let skipped = 0;
  const errors: Array<{ tenantId: string; campaignId?: string; error: string }> = [];

  settled.forEach((result, i) => {
    const tenantId = tenantIds[i];
    if (result.status === "fulfilled") {
      created += result.value.created;
      skipped += result.value.skipped;
      if (result.value.error) errors.push({ tenantId, error: result.value.error });
      for (const rowError of result.value.rowErrors ?? []) {
        errors.push({ tenantId, error: rowError });
      }
    } else {
      errors.push({ tenantId, error: String(result.reason) });
    }
  });

  return { created, skipped, errors };
}
