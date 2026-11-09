/**
 * Conversa depois da execucao — contexto (Story 24.24)
 *
 * Modulo PURO. Le o output dos steps (leads com score e justificativa, contas, fatos do
 * dossie, gatilho e e-mails) e monta o catalogo que vai ao LLM entre delimitadores de
 * dados. Nada aqui grava ou chama rede.
 */

import { STEP_LABELS } from "@/types/agent";
import type {
  AgentStep,
  CreateCampaignOutput,
  ParsedBriefing,
  ResearchAccountsOutput,
  SearchLeadResult,
  StepStatus,
  StepType,
} from "@/types/agent";
import type { DossierFact } from "@/lib/agent/dossier/facts";
import { findLeadWhyNow } from "@/lib/agent/dossier/dossier-view";

// ==============================================
// TETOS
// ==============================================

export const CATALOG_MAX_LEADS = 100;
export const CATALOG_MAX_ACCOUNTS = 30;
export const CATALOG_MAX_FACTS_PER_ACCOUNT = 5;
const TEXT_MAX = 300;
const EMAIL_BODY_MAX = 2000;

// ==============================================
// TIPOS
// ==============================================

export type ConversationStep = Pick<AgentStep, "step_number" | "step_type" | "status" | "output">;

export interface CatalogLead {
  /** Numero do lead no catalogo (1..N). */
  n: number;
  name: string;
  title: string | null;
  company: string | null;
  fitScore: string | null;
  fitReason: string | null;
  gatilho: string | null;
  hipoteseDor: string | null;
}

export interface CatalogFact {
  kind: string;
  fato: string;
  data: string;
}

export interface CatalogAccount {
  company: string | null;
  domain: string | null;
  status: string;
  facts: CatalogFact[];
}

export interface CatalogEmail {
  /** Numero do e-mail na sequencia (1 = primeiro), como a previa mostra. */
  n: number;
  /** `position` do bloco no output. */
  blockPosition: number;
  emailMode: "initial" | "follow-up";
  subject: string;
  body: string;
  reviewStatus: string | null;
}

export interface CatalogStep {
  number: number;
  type: StepType;
  label: string;
  status: StepStatus;
}

export interface ConversationCatalog {
  steps: CatalogStep[];
  criteria: Record<string, unknown> | null;
  leads: CatalogLead[];
  /** Total de leads no output (o catalogo corta em CATALOG_MAX_LEADS). */
  leadsTotal: number;
  accounts: CatalogAccount[];
  emails: CatalogEmail[];
}

// ==============================================
// HELPERS
// ==============================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clip(value: string | null, max = TEXT_MAX): string | null {
  if (value === null) return null;
  return value.length > max ? `${value.slice(0, max - 3).trimEnd()}...` : value;
}

function hasOutput(step: ConversationStep): boolean {
  return isRecord(step.output) && Object.keys(step.output).length > 0;
}

/** Ultimo step (maior `step_number`) do tipo, ou null. */
function lastStepOfType(steps: readonly ConversationStep[], type: StepType): ConversationStep | null {
  const matches = steps.filter((s) => s.step_type === type);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.step_number > a.step_number ? b : a));
}

// ==============================================
// API
// ==============================================

/** Ha algum step com output para conversar? Sem output, o chat usa a resposta de status. */
export function hasConversationalOutput(steps: readonly ConversationStep[]): boolean {
  return steps.some(hasOutput);
}

/** Step `create_campaign` da execucao (o de maior `step_number`), ou null. */
export function findCampaignStep(steps: readonly ConversationStep[]): ConversationStep | null {
  return lastStepOfType(steps, "create_campaign");
}

/** E-mails do output do `create_campaign`, na ordem da previa. Output fora do formato = []. */
export function readCampaignEmails(step: ConversationStep | null): CatalogEmail[] {
  if (!step || !isRecord(step.output)) return [];
  const blocks = (step.output as Partial<CreateCampaignOutput>).emailBlocks;
  if (!Array.isArray(blocks)) return [];
  const emails: CatalogEmail[] = [];
  for (const raw of blocks) {
    if (!isRecord(raw)) continue;
    const subject = typeof raw.subject === "string" ? raw.subject : null;
    const body = typeof raw.body === "string" ? raw.body : null;
    if (subject === null || body === null) continue;
    const review = isRecord(raw.review) ? str(raw.review.status) : null;
    emails.push({
      n: emails.length + 1,
      blockPosition: typeof raw.position === "number" ? raw.position : emails.length + 1,
      emailMode: raw.emailMode === "follow-up" ? "follow-up" : "initial",
      subject,
      body,
      reviewStatus: review,
    });
  }
  return emails;
}

function readLeads(steps: readonly ConversationStep[]): SearchLeadResult[] {
  const search = lastStepOfType(steps, "search_leads");
  if (search && isRecord(search.output) && Array.isArray(search.output.leads)) {
    return (search.output.leads as unknown[]).filter(isRecord) as unknown as SearchLeadResult[];
  }
  // Leads importados (sem busca): os da campanha.
  const campaign = findCampaignStep(steps);
  if (campaign && isRecord(campaign.output) && Array.isArray(campaign.output.leadsWithIcebreakers)) {
    return (campaign.output.leadsWithIcebreakers as unknown[]).filter(isRecord) as unknown as SearchLeadResult[];
  }
  return [];
}

function readCriteria(briefing: ParsedBriefing | null | undefined): Record<string, unknown> | null {
  if (!briefing) return null;
  const criteria: Record<string, unknown> = {};
  if (briefing.jobTitles?.length) criteria.cargos = briefing.jobTitles.slice(0, 20);
  if (briefing.technology) criteria.tecnologia = briefing.technology;
  if (briefing.location) criteria.local = briefing.location;
  if (briefing.industry) criteria.setor = briefing.industry;
  if (briefing.companySize) criteria.porte = briefing.companySize;
  if (typeof briefing.leadCount === "number") criteria.quantidade = briefing.leadCount;
  if (briefing.targetAccounts?.length) {
    criteria.contas = briefing.targetAccounts
      .slice(0, 20)
      .map((a) => a.name ?? a.domain)
      .filter(Boolean);
  }
  if (briefing.importedLeads?.length) criteria.leads_importados = briefing.importedLeads.length;
  return Object.keys(criteria).length > 0 ? criteria : null;
}

/**
 * Catalogo da conversa. `facts` = fatos por `dossierId` (lidos pela rota). Tetos: 100
 * leads, 30 contas, 5 fatos por conta e todos os e-mails.
 */
export function buildConversationCatalog(params: {
  steps: readonly ConversationStep[];
  facts: Record<string, DossierFact[]>;
  briefing?: ParsedBriefing | null;
}): ConversationCatalog {
  const ordered = [...params.steps].sort((a, b) => a.step_number - b.step_number);

  const research = lastStepOfType(ordered, "research_accounts");
  const researchOutput =
    research && isRecord(research.output) ? (research.output as Partial<ResearchAccountsOutput>) : null;
  const whyNow = researchOutput?.whyNow;

  const allLeads = readLeads(ordered);
  const leads: CatalogLead[] = allLeads.slice(0, CATALOG_MAX_LEADS).map((lead, index) => {
    const entry = findLeadWhyNow(whyNow, {
      apolloId: str(lead.apolloId),
      email: str(lead.email),
    });
    const trigger = entry?.status === "trigger" ? entry.trigger : undefined;
    return {
      n: index + 1,
      name: clip(str(lead.name), 120) ?? "(sem nome)",
      title: clip(str(lead.title), 120),
      company: clip(str(lead.companyName), 120),
      fitScore: str(lead.fitScore),
      fitReason: clip(str(lead.fitReason)),
      gatilho: clip(str(trigger?.gatilho)),
      hipoteseDor: clip(str(trigger?.hipoteseDor)),
    };
  });

  const rawAccounts = Array.isArray(researchOutput?.accounts) ? researchOutput.accounts : [];
  const accounts: CatalogAccount[] = rawAccounts
    .filter(isRecord)
    .slice(0, CATALOG_MAX_ACCOUNTS)
    .map((account) => {
      const dossierId = str(account.dossierId);
      const facts = (dossierId ? params.facts[dossierId] ?? [] : [])
        .slice(0, CATALOG_MAX_FACTS_PER_ACCOUNT)
        .map((f) => ({ kind: f.kind, fato: clip(str(f.fato)) ?? "", data: f.data }))
        .filter((f) => f.fato);
      return {
        company: clip(str(account.companyName), 120),
        domain: str(account.domain),
        status: str(account.status) ?? "desconhecido",
        facts,
      };
    });

  const emails = readCampaignEmails(findCampaignStep(ordered)).map((e) => ({
    ...e,
    subject: clip(e.subject, TEXT_MAX) ?? "",
    body: clip(e.body, EMAIL_BODY_MAX) ?? "",
  }));

  return {
    steps: ordered.map((s) => ({
      number: s.step_number,
      type: s.step_type,
      label: STEP_LABELS[s.step_type] ?? s.step_type,
      status: s.status,
    })),
    criteria: readCriteria(params.briefing),
    leads,
    leadsTotal: allLeads.length,
    accounts,
    emails,
  };
}

// ==============================================
// TEXTO PARA O PROMPT
// ==============================================

/** Remove os delimitadores do bloco de dados: um dado nunca fecha (nem reabre) o bloco. */
export function stripDataDelimiters(value: string): string {
  return value.replace(/<<<\s*DADOS|DADOS\s*>>>/gi, " ");
}

/** JSON de uma linha, sem delimitadores dentro dos valores. */
function dataLine(value: unknown): string {
  return stripDataDelimiters(JSON.stringify(value));
}

/** Catalogo em linhas de dados (sem os delimitadores de abertura/fecho). */
export function formatCatalogLines(catalog: ConversationCatalog): string[] {
  const lines: string[] = [];
  lines.push("ETAPAS:");
  for (const s of catalog.steps) {
    lines.push(dataLine({ etapa: s.number, nome: s.label, status: s.status }));
  }
  lines.push("");
  lines.push(`CRITERIOS DA BUSCA: ${catalog.criteria ? dataLine(catalog.criteria) : "(nao informado)"}`);
  lines.push("");
  lines.push(
    `LEADS (${catalog.leads.length}${catalog.leadsTotal > catalog.leads.length ? ` de ${catalog.leadsTotal}` : ""}):`
  );
  for (const l of catalog.leads) {
    lines.push(
      dataLine({
        n: l.n,
        nome: l.name,
        cargo: l.title,
        empresa: l.company,
        fit_score: l.fitScore,
        justificativa: l.fitReason,
        gatilho: l.gatilho,
        hipotese_dor: l.hipoteseDor,
      })
    );
  }
  lines.push("");
  lines.push(`CONTAS PESQUISADAS (${catalog.accounts.length}):`);
  for (const a of catalog.accounts) {
    lines.push(dataLine({ empresa: a.company, dominio: a.domain, status: a.status, fatos: a.facts }));
  }
  lines.push("");
  lines.push(`E-MAILS DA CAMPANHA (${catalog.emails.length}):`);
  for (const e of catalog.emails) {
    lines.push(
      dataLine({
        email: e.n,
        tipo: e.emailMode === "follow-up" ? "follow-up" : "inicial",
        assunto: e.subject,
        corpo: e.body,
        revisor: e.reviewStatus,
      })
    );
  }
  return lines;
}
