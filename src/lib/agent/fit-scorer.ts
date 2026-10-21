/**
 * Fit Scorer — Story 24.16 (SO SERVIDOR)
 *
 * Da a cada lead da busca do agente um Fit Score A/B/C com justificativa de 1 linha:
 * 1. regras deterministicas (`fit-score-rules.ts`) para todos os leads;
 * 2. por cima delas, UMA chamada de LLM barato contra o briefing, o ICP e as dores da KB
 *    (no maximo FIT_SCORE_MAX_LEADS leads na chamada). A nota e o motivo do LLM
 *    substituem os das regras POR LEAD; entrada ausente/invalida fica com as regras.
 *
 * Nunca lanca: sem chave, timeout, erro HTTP ou JSON invalido -> todos os leads ficam so
 * com as regras (NFR9). O prompt e constante do modulo (classificacao, nao copy do
 * cliente), fora do promptManager. O log de uso fica a cargo do step.
 *
 * Privacidade: o LLM recebe so cargo e empresa de cada lead (sem nome nem e-mail).
 */

import OpenAI from "openai";
import { z } from "zod";
import {
  FIT_SCORE_MAX_LEADS,
  FIT_SCORE_MODEL,
  FIT_SCORE_PAIN_POINTS_MAX_CHARS,
  FIT_SCORE_TIMEOUT_MS,
  buildFitScoreRequest,
} from "@/lib/ai/fit-score-config";
import {
  isFitGrade,
  mergeRequestedTitles,
  scoreLeadByRules,
  truncateFitReason,
  type FitScoreResult,
} from "@/lib/agent/fit-score-rules";
import type { TenantICP } from "@/lib/agent/icp-briefing";
import type { ParsedBriefing } from "@/types/agent";
import type { LeadRow } from "@/types/lead";

// ==============================================
// TYPES
// ==============================================

export interface ScoreLeadsParams {
  leads: LeadRow[];
  briefing: Pick<ParsedBriefing, "jobTitles" | "industry" | "location" | "companySize">;
  icp: TenantICP;
  /** Chave OpenAI do tenant. Ausente -> so regras, sem chamada (attempted = false). */
  apiKey?: string;
  tenantId: string;
  executionId: string;
}

export interface FitScorerUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  /** Quantos leads receberam a nota do LLM. */
  llmScored: number;
  errorMessage?: string;
}

export interface ScoreLeadsResult {
  /** Mesma ordem e tamanho de `leads`. */
  results: FitScoreResult[];
  /** "llm" quando ao menos 1 lead ficou com a nota do LLM. */
  source: "llm" | "rules";
  /** A chamada de LLM foi tentada (conta 1 chamada de IA no custo e vira log). */
  attempted: boolean;
  /** A chamada voltou com JSON valido (status do log). */
  succeeded: boolean;
  usage: FitScorerUsage;
}

// ==============================================
// PROMPT
// ==============================================

const FIT_SCORE_SYSTEM_PROMPT = `Voce e um analista de prospeccao B2B. Classifique cada lead pelo encaixe com o PEDIDO do usuario e com o ICP (perfil de cliente ideal) da empresa que vende.

Notas:
- "A": cargo decisor ou influenciador direto para o pedido e para as dores do ICP, numa empresa que parece do perfil. Prioridade maxima.
- "B": encaixe parcial (cargo senior fora da lista pedida, cargo certo com sinal fraco, ou empresa de perfil incerto).
- "C": cargo ou empresa fora do perfil.

Cada lead traz uma nota e um motivo calculados por regras (cargo e e-mail disponivel). Use como ponto de partida: so mude a nota quando o cargo ou a empresa justificarem. Lead sem e-mail disponivel nao deve receber "A".

Justificativa: 1 linha em portugues, sem acentos, com no maximo 120 caracteres, citando o motivo concreto (cargo, empresa ou dor). Nunca invente fatos sobre a empresa.

Responda SOMENTE com JSON no formato:
{"scores":[{"i":<indice do lead>,"grade":"A"|"B"|"C","reason":"<justificativa>"}]}
Inclua todos os leads recebidos.`;

const responseSchema = z.object({ scores: z.array(z.unknown()) });

const entrySchema = z.object({
  i: z.coerce.number().int().nonnegative(),
  grade: z.string(),
  reason: z.string(),
});

function listOrDash(values: Array<string | null | undefined>): string {
  const clean = values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  return clean.length > 0 ? clean.join(", ") : "(nao informado)";
}

function buildUserMessage(
  params: ScoreLeadsParams,
  leads: LeadRow[],
  rules: FitScoreResult[]
): string {
  const { briefing, icp } = params;
  const painPoints = (icp.painPoints ?? "").trim().slice(0, FIT_SCORE_PAIN_POINTS_MAX_CHARS);

  const leadLines = leads.map((lead, i) =>
    JSON.stringify({
      i,
      cargo: lead.title ?? null,
      empresa: lead.company_name ?? null,
      regra: rules[i].fitScore,
      motivo: rules[i].fitReason,
    })
  );

  return [
    "PEDIDO:",
    `- Cargos: ${listOrDash(briefing.jobTitles ?? [])}`,
    `- Setor: ${listOrDash([briefing.industry])}`,
    `- Local: ${listOrDash([briefing.location])}`,
    `- Porte: ${listOrDash([briefing.companySize])}`,
    "",
    "ICP:",
    `- Setores: ${listOrDash(icp.industries)}`,
    `- Portes: ${listOrDash(icp.companySizes)}`,
    `- Foco geografico: ${listOrDash(icp.geographicFocus)}`,
    `- Cargos: ${listOrDash(icp.jobTitles)}`,
    `- Dores: ${painPoints || "(nao informado)"}`,
    "",
    `LEADS (${leads.length}):`,
    ...leadLines,
  ].join("\n");
}

// ==============================================
// PUBLIC API
// ==============================================

/** Pontua os leads (regras + 1 chamada de LLM). Nunca lanca. */
export async function scoreLeads(params: ScoreLeadsParams): Promise<ScoreLeadsResult> {
  const requestedTitles = mergeRequestedTitles(params.briefing.jobTitles, params.icp?.jobTitles);
  const rules: FitScoreResult[] = params.leads.map((lead) =>
    scoreLeadByRules({ title: lead.title, hasEmail: lead.has_email }, requestedTitles)
  );

  const usage: FitScorerUsage = {
    model: FIT_SCORE_MODEL,
    promptTokens: 0,
    completionTokens: 0,
    durationMs: 0,
    llmScored: 0,
  };

  const rulesOnly = (attempted: boolean, errorMessage?: string): ScoreLeadsResult => ({
    results: rules,
    source: "rules",
    attempted,
    succeeded: false,
    usage: errorMessage ? { ...usage, errorMessage } : usage,
  });

  if (!params.apiKey || params.leads.length === 0) return rulesOnly(false);

  const llmLeads = params.leads.slice(0, FIT_SCORE_MAX_LEADS);
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FIT_SCORE_TIMEOUT_MS);

  try {
    const client = new OpenAI({ apiKey: params.apiKey });
    const completion = await client.chat.completions.create(
      buildFitScoreRequest([
        { role: "system", content: FIT_SCORE_SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(params, llmLeads, rules) },
      ]),
      { signal: controller.signal }
    );
    usage.promptTokens = completion.usage?.prompt_tokens ?? 0;
    usage.completionTokens = completion.usage?.completion_tokens ?? 0;
    usage.durationMs = Date.now() - start;

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("fit-scorer: resposta vazia");
    const parsed = responseSchema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new Error("fit-scorer: JSON fora do formato");

    const results = rules.map((rule) => ({ ...rule }));
    const applied = new Set<number>();
    for (const raw of parsed.data.scores) {
      const entry = entrySchema.safeParse(raw);
      if (!entry.success) continue;
      const { i, grade, reason } = entry.data;
      if (i >= llmLeads.length || applied.has(i)) continue;
      const normalizedGrade = grade.trim().toUpperCase();
      const cleanReason = truncateFitReason(reason.replace(/\s+/g, " "));
      if (!isFitGrade(normalizedGrade) || !cleanReason) continue;
      // Lead sem e-mail disponivel nunca fica com "A" (teto B), mantendo o motivo do LLM.
      const cappedGrade =
        normalizedGrade === "A" && llmLeads[i].has_email !== true ? "B" : normalizedGrade;
      results[i] = { fitScore: cappedGrade, fitReason: cleanReason };
      applied.add(i);
    }

    usage.llmScored = applied.size;
    return {
      results,
      source: applied.size > 0 ? "llm" : "rules",
      attempted: true,
      succeeded: true,
      usage,
    };
  } catch (error) {
    usage.durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[fit-scorer] LLM indisponivel (tenant ${params.tenantId}, execucao ${params.executionId}), seguindo so com as regras:`,
      message
    );
    return rulesOnly(true, message);
  } finally {
    clearTimeout(timeoutId);
  }
}
