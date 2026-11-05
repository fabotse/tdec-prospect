/**
 * Dossie da conta — LEITURA para o painel (somente SELECT)
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade
 *
 * Resolve o dossie do lead aberto (D3) e monta o DTO. Nunca lanca: devolve `{ view }` ou
 * `{ error }`. Nao grava nada, nao chama servico externo e toda query de tabela com
 * `tenant_id` leva `.eq("tenant_id")` (dupla barreira com a RLS da sessao). `agent_steps`
 * nao tem `tenant_id`: so e lida depois de a execucao ser validada no tenant.
 *
 * Proibido `.or()`/`.filter()` com valores da request (injecao de filtro PostgREST):
 * so `.eq` com valores. Nao casa por dominio nem por nome (falso positivo mostraria a
 * pesquisa de outra empresa; o lado seguro e "Sem pesquisa").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadWhyNow } from "@/types/agent";
import type { AccountDossierLookupParams, AccountDossierView } from "@/types/account-dossier";
import { readDossierFacts } from "./repository";
import {
  belongsToOtherLead,
  buildDossierView,
  findLeadWhyNow,
  type DossierRow,
  type LeadIdent,
} from "./dossier-view";

export type AccountDossierLookupResult =
  | {
      view: AccountDossierView;
      /** `executionId` informado, mas inexistente ou de outro tenant (rota -> 404). */
      executionNotFound?: boolean;
    }
  | { error: string };

class LookupError extends Error {}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "erro desconhecido";
}

/** A execucao existe e e do tenant? Erro de banco -> LookupError. */
async function executionBelongsToTenant(
  supabase: SupabaseClient,
  tenantId: string,
  executionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_executions")
    .select("id, tenant_id")
    .eq("id", executionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new LookupError(errorText(error));
  const row = data as { id?: unknown; tenant_id?: unknown } | null;
  return Boolean(row && row.id === executionId && row.tenant_id === tenantId);
}

/** `output.whyNow` da linha `research_accounts` mais recente da execucao (ja validada). */
async function readExecutionWhyNow(supabase: SupabaseClient, executionId: string): Promise<unknown> {
  const { data, error } = await supabase
    .from("agent_steps")
    .select("output")
    .eq("execution_id", executionId)
    .eq("step_type", "research_accounts")
    .order("step_number", { ascending: false })
    .limit(1);
  if (error) throw new LookupError(errorText(error));
  const row = (Array.isArray(data) ? data[0] : data) as { output?: unknown } | null | undefined;
  const output = row?.output;
  return output && typeof output === "object" ? (output as { whyNow?: unknown }).whyNow : undefined;
}

async function readDossierRow(
  supabase: SupabaseClient,
  tenantId: string,
  dossierId: string
): Promise<DossierRow | null> {
  const { data, error } = await supabase
    .from("account_dossiers")
    .select("id, company_domain, company_name, status, failed_sources, researched_at, expires_at")
    .eq("id", dossierId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new LookupError(errorText(error));
  const row = data as DossierRow | null;
  return row && typeof row.id === "string" ? row : null;
}

interface LinkRow {
  dossier_id: string;
  execution_id: string | null;
  created_at: string;
}

/** Identidade canonica do lead aberto: todos os campos sao do MESMO lead. */
interface ResolvedIdent {
  leadId: string | null;
  apolloId: string | null;
  email: string | null;
}

function normEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function normText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * D3.0: resolve UMA identidade coerente a partir da request.
 * - Com `leadId`: le o lead no tenant e usa so o `apollo_id`/e-mail dele. `apolloId`/e-mail
 *   da request que divirjam do lead (ou que o lead nao tenha) -> null ("Sem pesquisa").
 *   Lead inexistente/de outro tenant -> null.
 * - Sem `leadId`: um unico identificador, por prioridade (`apolloId`, depois e-mail).
 */
async function resolveIdent(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string | null,
  apolloId: string | null,
  email: string | null
): Promise<ResolvedIdent | null> {
  if (!leadId) {
    if (apolloId) return { leadId: null, apolloId, email: null };
    if (email) return { leadId: null, apolloId: null, email };
    return null;
  }
  const { data, error } = await supabase
    .from("leads")
    .select("id, apollo_id, email")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new LookupError(errorText(error));
  const row = data as { id?: unknown; apollo_id?: unknown; email?: unknown } | null;
  if (!row || (row.id !== undefined && row.id !== leadId)) return null;
  const leadApollo = normText(row.apollo_id);
  const leadEmail = normEmail(row.email);
  if (apolloId && apolloId !== leadApollo) return null;
  if (email && email !== leadEmail) return null;
  return { leadId, apolloId: leadApollo, email: leadEmail };
}

/** Entrada do whyNow casada com o lead e sem identificador divergente. */
function findOwnWhyNow(whyNow: unknown, ident: ResolvedIdent): LeadWhyNow | null {
  // `findLeadWhyNow` ja descarta entradas com identificador divergente (inclusive leadId).
  return findLeadWhyNow(whyNow, ident);
}

/** D3.2: ligacao mais recente, uma query `.eq` por identificador do MESMO lead. */
async function findLatestLink(
  supabase: SupabaseClient,
  tenantId: string,
  ident: ResolvedIdent
): Promise<LinkRow[]> {
  const filters: Array<[string, string]> = [];
  if (ident.leadId) filters.push(["lead_id", ident.leadId]);
  if (ident.apolloId) filters.push(["lead_apollo_id", ident.apolloId]);
  if (ident.email) filters.push(["lead_email", ident.email]);

  const rows: LinkRow[] = [];
  for (const [column, value] of filters) {
    const { data, error } = await supabase
      .from("account_dossier_leads")
      .select("dossier_id, execution_id, created_at, lead_id, lead_apollo_id, lead_email")
      .eq("tenant_id", tenantId)
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new LookupError(errorText(error));
    for (const row of (Array.isArray(data) ? data : data ? [data] : []) as Record<string, unknown>[]) {
      if (typeof row.dossier_id !== "string") continue;
      // Ligacao com identificador de outro lead (ex.: e-mail igual, apollo diferente): ignora.
      if (
        belongsToOtherLead(
          {
            leadId: normText(row.lead_id),
            apolloId: normText(row.lead_apollo_id),
            email: normEmail(row.lead_email),
          },
          ident
        )
      ) {
        continue;
      }
      rows.push({
        dossier_id: row.dossier_id,
        execution_id: typeof row.execution_id === "string" ? row.execution_id : null,
        created_at: typeof row.created_at === "string" ? row.created_at : "",
      });
    }
  }
  // Mais nova primeiro (ISO compara como texto; empate mantem a ordem das queries).
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

async function buildFound(
  supabase: SupabaseClient,
  tenantId: string,
  dossierRow: DossierRow,
  ident: LeadIdent,
  whyNowEntry: LeadWhyNow | null,
  now: Date
): Promise<AccountDossierView> {
  const { facts, error } = await readDossierFacts(supabase, tenantId, dossierRow.id);
  // Nao mostrar dossie "vazio" falso: falha na leitura dos fatos vira estado de erro.
  if (error) throw new LookupError(error);
  return buildDossierView({ dossierRow, facts, ident, whyNowEntry, now });
}

/**
 * Resolve o dossie do lead (D3) e monta o DTO do painel. Somente leitura; nunca lanca.
 */
export async function lookupAccountDossier(
  supabase: SupabaseClient,
  tenantId: string,
  params: AccountDossierLookupParams,
  now: Date = new Date()
): Promise<AccountDossierLookupResult> {
  try {
    const executionId = params.executionId?.trim() || null;
    const leadId = params.leadId?.trim() || null;
    const apolloId = params.apolloId?.trim() || null;
    const email = params.email?.trim().toLowerCase() || null;

    // D3.0: uma identidade coerente; identificadores conflitantes -> "Sem pesquisa".
    // Feito antes da execucao: nada e lido da execucao para um lead incoerente.
    const resolved = await resolveIdent(supabase, tenantId, leadId, apolloId, email);

    // D3.1: whyNow da execucao informada. Execucao inexistente/de outro tenant: nada e
    // lido dela nem depois dela (a rota responde 404, como o GET .../steps).
    if (executionId) {
      if (!(await executionBelongsToTenant(supabase, tenantId, executionId))) {
        return { view: { status: "none" }, executionNotFound: true };
      }
      if (!resolved) return { view: { status: "none" } };
      const entry = findOwnWhyNow(await readExecutionWhyNow(supabase, executionId), resolved);
      if (entry?.dossierId) {
        const row = await readDossierRow(supabase, tenantId, entry.dossierId);
        if (row) {
          return { view: await buildFound(supabase, tenantId, row, resolved, entry, now) };
        }
      }
    }

    if (!resolved) return { view: { status: "none" } };

    // D3.2: ligacao gravada mais recente.
    const links = await findLatestLink(supabase, tenantId, resolved);
    for (const link of links) {
      const row = await readDossierRow(supabase, tenantId, link.dossier_id);
      if (!row) continue; // inexistente/de outro tenant -> proxima ligacao
      let entry: LeadWhyNow | null = null;
      if (link.execution_id && (await executionBelongsToTenant(supabase, tenantId, link.execution_id))) {
        const found = findOwnWhyNow(await readExecutionWhyNow(supabase, link.execution_id), resolved);
        // So vale o gatilho avaliado para ESTE dossie.
        entry = found && found.dossierId === row.id ? found : null;
      }
      return { view: await buildFound(supabase, tenantId, row, resolved, entry, now) };
    }

    // D3.3
    return { view: { status: "none" } };
  } catch (error) {
    return { error: errorText(error) };
  }
}
