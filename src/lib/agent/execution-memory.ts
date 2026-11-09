/**
 * Story 24.25 — Memória entre execuções (somente leitura).
 *
 * - `findSimilarExecutions`: execuções anteriores parecidas com o briefing atual, com
 *   respostas, oportunidades e reuniões das campanhas que elas geraram (loop do Epic 21).
 * - `findLeadWorkHistory`: histórico resumido (campanha, data, resultado) por lead e por conta.
 *
 * Regras:
 * - Client de SESSÃO e `.eq("tenant_id")` explícito onde a tabela tem `tenant_id`.
 * - Só `.eq`/`.in`/`.neq` com valores; nada de `.or()`, `.filter()` ou `ilike`.
 * - Fail-open: qualquer erro vira "sem memória" (`[]` / mapas vazios) com `console.warn`.
 *   Nunca lança.
 * - Sem LLM, sem serviço externo e sem `api_usage_logs`: a memória não tem custo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBriefing } from "@/types/agent";
import type {
  AccountWorkSummary,
  LeadWorkEntry,
  LeadWorkHistoryResponse,
  LeadWorkResult,
  PreviousExecutionMemory,
} from "@/types/execution-memory";

/** Quantas execuções anteriores são lidas para procurar as parecidas. */
const MAX_EXECUTIONS_SCANNED = 30;
/** Quantas execuções parecidas entram no plano. */
const MAX_MEMORY_ITEMS = 3;
/** Tetos da rota de histórico. */
export const MAX_HISTORY_IDS = 500;
export const MAX_HISTORY_NAMES = 500;
const MAX_ENTRIES_PER_LEAD = 3;
/** Tamanho dos lotes de `.in` (mantém a URL do PostgREST curta). */
const IN_CHUNK_SIZE = 100;
const ROW_LIMIT = 2000;

const CAMPAIGN_STEP_TYPES = ["create_campaign", "export"];

// ==============================================
// Similaridade do briefing (pura)
// ==============================================

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(value: unknown): string {
  return normalizeText(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jobTitleSet(briefing: Partial<ParsedBriefing>): Set<string> {
  return new Set(stringList(briefing.jobTitles).map(normalizeText).filter(Boolean));
}

function domainSet(briefing: Partial<ParsedBriefing>): Set<string> {
  const accounts = Array.isArray(briefing.targetAccounts) ? briefing.targetAccounts : [];
  return new Set(
    accounts
      .map((account) => normalizeDomain((account as { domain?: unknown } | null)?.domain))
      .filter(Boolean)
  );
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

/**
 * Parecido = (cargo em comum OU mesma tecnologia OU domínio de conta em comum) E local
 * compatível (os dois preenchidos e iguais, ou pelo menos um vazio). Pura e defensiva:
 * o briefing anterior vem de JSONB e pode estar incompleto.
 */
export function isSimilarBriefing(
  current: Partial<ParsedBriefing> | null | undefined,
  previous: Partial<ParsedBriefing> | null | undefined
): boolean {
  if (!current || !previous || typeof previous !== "object") return false;

  const currentLocation = normalizeText(current.location);
  const previousLocation = normalizeText(previous.location);
  const locationCompatible =
    !currentLocation || !previousLocation || currentLocation === previousLocation;
  if (!locationCompatible) return false;

  if (intersects(jobTitleSet(current), jobTitleSet(previous))) return true;

  const currentTech = normalizeText(current.technology);
  if (currentTech && currentTech === normalizeText(previous.technology)) return true;

  return intersects(domainSet(current), domainSet(previous));
}

/** "CISO / CTO · São Paulo". Sem cargo: a tecnologia ou "lista de contas". */
export function briefingLabel(briefing: Partial<ParsedBriefing> | null | undefined): string {
  const titles = stringList(briefing?.jobTitles)
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, 2);
  const technology = typeof briefing?.technology === "string" ? briefing.technology.trim() : "";
  const base = titles.length > 0 ? titles.join(" / ") : technology || "lista de contas";
  const location = typeof briefing?.location === "string" ? briefing.location.trim() : "";
  return location ? `${base} · ${location}` : base;
}

// ==============================================
// Leitura em lotes
// ==============================================

function chunk<T>(items: T[], size = IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

type QueryResult = { data: unknown; error: unknown };

/** Roda `build` por lote e junta as linhas. Qualquer erro lança (o chamador faz fail-open). */
async function readInChunks<Row>(
  ids: string[],
  build: (batch: string[]) => PromiseLike<QueryResult>,
  label: string
): Promise<Row[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(chunk(ids).map((batch) => build(batch)));
  const rows: Row[] = [];
  for (const result of results) {
    if (result.error) throw new MemoryReadError(label, result.error);
    rows.push(...((result.data ?? []) as Row[]));
  }
  return rows;
}

class MemoryReadError extends Error {
  constructor(
    readonly table: string,
    readonly cause: unknown
  ) {
    super(`leitura de ${table} falhou`);
    this.name = "MemoryReadError";
  }
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

// ==============================================
// Execuções anteriores parecidas (plano)
// ==============================================

interface ExecutionRow {
  id: string;
  briefing: unknown;
  created_at: string;
}

interface StepRow {
  execution_id: string;
  step_type: string;
  output: unknown;
}

function campaignIdFromOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const direct = record.campaignId;
  if (typeof direct === "string" && direct) return direct;
  // O step guarda o output como `{ data: {...}, cost }` em parte das versões.
  const nested = record.data;
  if (nested && typeof nested === "object") {
    const fromData = (nested as Record<string, unknown>).campaignId;
    if (typeof fromData === "string" && fromData) return fromData;
  }
  return null;
}

/**
 * Até 3 execuções anteriores parecidas que geraram campanha, mais recentes primeiro.
 * Nunca lança: erro → `[]`.
 */
export async function findSimilarExecutions(
  supabase: SupabaseClient,
  tenantId: string,
  briefing: ParsedBriefing,
  currentExecutionId: string
): Promise<PreviousExecutionMemory[]> {
  try {
    const { data: executions, error } = await supabase
      .from("agent_executions")
      .select("id, briefing, created_at")
      .eq("tenant_id", tenantId)
      .neq("id", currentExecutionId)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(MAX_EXECUTIONS_SCANNED);
    if (error) throw new MemoryReadError("agent_executions", error);

    const similar = ((executions ?? []) as ExecutionRow[]).filter((row) =>
      isSimilarBriefing(briefing, row.briefing as Partial<ParsedBriefing> | null)
    );
    if (similar.length === 0) return [];

    const { data: steps, error: stepsError } = await supabase
      .from("agent_steps")
      .select("execution_id, step_type, output")
      .in(
        "execution_id",
        similar.map((row) => row.id)
      )
      .in("step_type", CAMPAIGN_STEP_TYPES);
    if (stepsError) throw new MemoryReadError("agent_steps", stepsError);

    const campaignByExecution = new Map<string, string>();
    for (const step of (steps ?? []) as StepRow[]) {
      const campaignId = campaignIdFromOutput(step.output);
      if (campaignId && !campaignByExecution.has(step.execution_id)) {
        campaignByExecution.set(step.execution_id, campaignId);
      }
    }

    const withCampaign = similar
      .filter((row) => campaignByExecution.has(row.id))
      .slice(0, MAX_MEMORY_ITEMS);
    if (withCampaign.length === 0) return [];

    const campaignIds = unique(withCampaign.map((row) => campaignByExecution.get(row.id)));

    const [campaignsResult, repliesResult, opportunitiesResult] = await Promise.all([
      // Só campanhas exportadas para o Instantly: rascunho nunca enviado não tem resultado.
      supabase
        .from("campaigns")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .in("id", campaignIds)
        .not("external_campaign_id", "is", null),
      supabase
        .from("campaign_events")
        .select("campaign_id, lead_email")
        .eq("tenant_id", tenantId)
        .in("campaign_id", campaignIds)
        .eq("event_type", "email_replied")
        .limit(ROW_LIMIT),
      supabase
        .from("opportunities")
        .select("campaign_id, status")
        .eq("tenant_id", tenantId)
        .in("campaign_id", campaignIds)
        .limit(ROW_LIMIT),
    ]);
    if (campaignsResult.error) throw new MemoryReadError("campaigns", campaignsResult.error);
    if (repliesResult.error) throw new MemoryReadError("campaign_events", repliesResult.error);
    if (opportunitiesResult.error) {
      throw new MemoryReadError("opportunities", opportunitiesResult.error);
    }

    const campaignNames = new Map<string, string>();
    for (const row of (campaignsResult.data ?? []) as Array<{ id: string; name: string | null }>) {
      if (row.name) campaignNames.set(row.id, row.name);
    }

    const repliers = new Map<string, Set<string>>();
    for (const row of (repliesResult.data ?? []) as Array<{
      campaign_id: string;
      lead_email: string | null;
    }>) {
      const email = normalizeText(row.lead_email);
      if (!email) continue;
      const set = repliers.get(row.campaign_id) ?? new Set<string>();
      set.add(email);
      repliers.set(row.campaign_id, set);
    }

    const opportunityCounts = new Map<string, { total: number; meetings: number }>();
    for (const row of (opportunitiesResult.data ?? []) as Array<{
      campaign_id: string;
      status: string | null;
    }>) {
      const counts = opportunityCounts.get(row.campaign_id) ?? { total: 0, meetings: 0 };
      counts.total += 1;
      if (row.status === "meeting_booked") counts.meetings += 1;
      opportunityCounts.set(row.campaign_id, counts);
    }

    const memory: PreviousExecutionMemory[] = [];
    for (const row of withCampaign) {
      const campaignId = campaignByExecution.get(row.id) as string;
      const campaignName = campaignNames.get(campaignId);
      // Campanha apagada, de outro tenant ou nunca exportada: não há o que citar.
      if (!campaignName) continue;
      const counts = opportunityCounts.get(campaignId) ?? { total: 0, meetings: 0 };
      memory.push({
        executionId: row.id,
        createdAt: row.created_at,
        label: briefingLabel(row.briefing as Partial<ParsedBriefing> | null),
        campaignName,
        replies: repliers.get(campaignId)?.size ?? 0,
        opportunities: counts.total,
        meetings: counts.meetings,
      });
    }
    return memory;
  } catch (error) {
    console.warn("[execution-memory] leitura da memória falhou:", error);
    return [];
  }
}

// ==============================================
// Histórico por lead e por conta (revisão)
// ==============================================

interface LeadRow {
  id: string;
  apollo_id: string | null;
  company_name: string | null;
}

interface CampaignLeadRow {
  campaign_id: string;
  lead_id: string;
  added_at: string | null;
}

interface CampaignRow {
  id: string;
  name: string | null;
  created_at: string | null;
}

interface OpportunityRow {
  lead_id: string | null;
  campaign_id: string;
  source: string | null;
  intent: string | null;
  status: string | null;
}

/** Precedência por oportunidade (a ordem do mapeamento da 24.25). */
const OPPORTUNITY_PRECEDENCE: LeadWorkResult[] = [
  "meeting_booked",
  "opt_out",
  "discarded",
  "replied",
  "engaged",
  "opportunity",
  "no_reply",
];

/** "Melhor resultado" da conta: do mais forte para o mais fraco. */
const ACCOUNT_RANK: LeadWorkResult[] = [
  "meeting_booked",
  "opportunity",
  "replied",
  "opt_out",
  "engaged",
  "discarded",
  "no_reply",
];

function opportunityResult(row: OpportunityRow): LeadWorkResult {
  if (row.status === "meeting_booked") return "meeting_booked";
  if (row.intent === "opt_out") return "opt_out";
  if (row.status === "discarded") return "discarded";
  if (row.source === "reply") return "replied";
  if (row.source === "engagement") return "engaged";
  return "opportunity";
}

function pickBy(order: LeadWorkResult[], a: LeadWorkResult, b: LeadWorkResult): LeadWorkResult {
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

function timeOf(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Mapa sem protótipo: chaves vindas de dados ("__proto__", "constructor") viram chaves comuns. */
function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function emptyHistory(): LeadWorkHistoryResponse {
  return { leads: dictionary(), accounts: dictionary() };
}

/**
 * Histórico resumido por `apolloId` e por `companyName` exato. Nunca lança: erro → mapas
 * vazios. A conta exclui os próprios `apolloIds` pedidos (o lead não conta como "outro
 * contato" da conta).
 */
export async function findLeadWorkHistory(
  supabase: SupabaseClient,
  tenantId: string,
  apolloIds: Array<string | null | undefined>,
  companyNames: Array<string | null | undefined>
): Promise<LeadWorkHistoryResponse> {
  const ids = unique(apolloIds).slice(0, MAX_HISTORY_IDS);
  const names = unique(companyNames).slice(0, MAX_HISTORY_NAMES);
  if (ids.length === 0 && names.length === 0) return emptyHistory();

  try {
    const requestedIds = new Set(ids);

    const [leadsById, leadsByCompany] = await Promise.all([
      readInChunks<LeadRow>(
        ids,
        (batch) =>
          supabase
            .from("leads")
            .select("id, apollo_id, company_name")
            .eq("tenant_id", tenantId)
            .in("apollo_id", batch)
            .limit(ROW_LIMIT),
        "leads"
      ),
      readInChunks<LeadRow>(
        names,
        (batch) =>
          supabase
            .from("leads")
            .select("id, apollo_id, company_name")
            .eq("tenant_id", tenantId)
            .in("company_name", batch)
            .limit(ROW_LIMIT),
        "leads"
      ),
    ]);

    const ownLeads = leadsById.filter((row) => row.apollo_id && requestedIds.has(row.apollo_id));
    const ownLeadIds = new Set(ownLeads.map((row) => row.id));
    const accountLeads = leadsByCompany.filter(
      (row) =>
        row.company_name &&
        !ownLeadIds.has(row.id) &&
        !(row.apollo_id && requestedIds.has(row.apollo_id))
    );

    const leadIds = unique([...ownLeads, ...accountLeads].map((row) => row.id));
    if (leadIds.length === 0) return emptyHistory();

    // `campaign_leads` não tem `tenant_id`: a RLS cobre e os `lead_id` já são do tenant.
    const campaignLeads = await readInChunks<CampaignLeadRow>(
      leadIds,
      (batch) =>
        supabase
          .from("campaign_leads")
          .select("campaign_id, lead_id, added_at")
          .in("lead_id", batch)
          .limit(ROW_LIMIT),
      "campaign_leads"
    );
    if (campaignLeads.length === 0) return emptyHistory();

    const campaignIds = unique(campaignLeads.map((row) => row.campaign_id));
    const workedLeadIds = unique(campaignLeads.map((row) => row.lead_id));

    const [campaigns, opportunities] = await Promise.all([
      readInChunks<CampaignRow>(
        campaignIds,
        (batch) =>
          supabase
            .from("campaigns")
            .select("id, name, created_at")
            .eq("tenant_id", tenantId)
            .in("id", batch)
            // Rascunho nunca exportado fica de fora, como campanha apagada.
            .not("external_campaign_id", "is", null),
        "campaigns"
      ),
      readInChunks<OpportunityRow>(
        workedLeadIds,
        (batch) =>
          supabase
            .from("opportunities")
            .select("lead_id, campaign_id, source, intent, status")
            .eq("tenant_id", tenantId)
            .in("lead_id", batch)
            .limit(ROW_LIMIT),
        "opportunities"
      ),
    ]);

    const campaignById = new Map(campaigns.map((row) => [row.id, row]));

    const resultByPair = new Map<string, LeadWorkResult>();
    for (const opp of opportunities) {
      if (!opp.lead_id) continue;
      const key = `${opp.lead_id}:${opp.campaign_id}`;
      const result = opportunityResult(opp);
      const previous = resultByPair.get(key);
      resultByPair.set(key, previous ? pickBy(OPPORTUNITY_PRECEDENCE, previous, result) : result);
    }

    // Entradas por lead_id (uma por campanha).
    const entriesByLeadId = new Map<string, Array<LeadWorkEntry & { campaignId: string }>>();
    for (const row of campaignLeads) {
      const campaign = campaignById.get(row.campaign_id);
      if (!campaign?.name) continue;
      const date = row.added_at ?? campaign.created_at;
      if (!date) continue;
      const list = entriesByLeadId.get(row.lead_id) ?? [];
      list.push({
        campaignId: row.campaign_id,
        campaignName: campaign.name,
        date,
        result: resultByPair.get(`${row.lead_id}:${row.campaign_id}`) ?? "no_reply",
      });
      entriesByLeadId.set(row.lead_id, list);
    }

    const byRecency = (a: { date: string }, b: { date: string }) => timeOf(b.date) - timeOf(a.date);

    // Leads: junta as linhas do mesmo apollo_id, uma entrada por campanha.
    const leads = dictionary<LeadWorkEntry[]>();
    const ownByApollo = new Map<string, string[]>();
    for (const row of ownLeads) {
      const list = ownByApollo.get(row.apollo_id as string) ?? [];
      list.push(row.id);
      ownByApollo.set(row.apollo_id as string, list);
    }
    for (const [apolloId, rowIds] of ownByApollo) {
      const seen = new Set<string>();
      const entries = rowIds
        .flatMap((leadId) => entriesByLeadId.get(leadId) ?? [])
        .sort(byRecency)
        .filter((entry) => {
          if (seen.has(entry.campaignId)) return false;
          seen.add(entry.campaignId);
          return true;
        })
        .slice(0, MAX_ENTRIES_PER_LEAD)
        .map(({ campaignName, date, result }) => ({ campaignName, date, result }));
      if (entries.length > 0) leads[apolloId] = entries;
    }

    // Contas: outros contatos do tenant com o mesmo company_name exato.
    const accounts = dictionary<AccountWorkSummary>();
    const accountLeadsByName = new Map<string, string[]>();
    for (const row of accountLeads) {
      const list = accountLeadsByName.get(row.company_name as string) ?? [];
      list.push(row.id);
      accountLeadsByName.set(row.company_name as string, list);
    }
    for (const [companyName, rowIds] of accountLeadsByName) {
      const workedRows = rowIds.filter((leadId) => (entriesByLeadId.get(leadId)?.length ?? 0) > 0);
      if (workedRows.length === 0) continue;
      const entries = workedRows.flatMap((leadId) => entriesByLeadId.get(leadId) ?? []).sort(byRecency);
      const latest = entries[0];
      const best = entries.reduce<LeadWorkResult>(
        (acc, entry) => pickBy(ACCOUNT_RANK, acc, entry.result),
        "no_reply"
      );
      accounts[companyName] = {
        contacts: workedRows.length,
        lastCampaignName: latest.campaignName,
        lastDate: latest.date,
        result: best,
      };
    }

    return { leads, accounts };
  } catch (error) {
    console.warn("[execution-memory] leitura do histórico falhou:", error);
    return emptyHistory();
  }
}
