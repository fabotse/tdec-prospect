/**
 * Copy Reviewer — Story 24.9
 *
 * Revisor automatico de copy de cold email (SO SERVIDOR). Revisa o e-mail por LLM
 * contra 6 criterios e, se reprovar, reescreve com base nos motivos e revisa de novo,
 * no maximo MAX_REWRITES vezes.
 *
 * Status:
 * - aprovado na 1a revisao        -> `approved` (texto original)
 * - aprovado depois de reescrever -> `rewritten` (texto reescrito)
 * - reprovado apos MAX_REWRITES   -> `needs_human_review` (ultima reescrita + motivos)
 * - qualquer falha                -> `not_reviewed` (texto ORIGINAL, reasons [])
 *
 * Nunca lanca: o revisor nao pode bloquear geracao, approve, save nem export.
 * O prompt e constante do modulo (nao e customizavel por tenant, fora do promptManager).
 */

import OpenAI from "openai";
import { z } from "zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  REVIEWER_MODEL,
  REVIEWER_TIMEOUT_MS,
  MAX_REWRITES,
  buildReviewerRequest,
  calculateReviewCost,
} from "@/lib/ai/copy-review-config";
import { logApiUsage } from "@/lib/services/usage-logger";
import { COPY_REVIEW_CHECKS } from "@/types/copy-review";
import type { CopyReviewResult, CopyReviewCheck } from "@/types/copy-review";

// ==============================================
// TYPES
// ==============================================

export interface CopyReviewContext {
  /** Publico (cargo/setor/local), em texto livre. */
  audience: string;
  productName: string;
  productDescription: string;
  targetIndustries: string;
  painPoints: string;
  icpSummary: string;
  /** Lista fechada de provas autorizadas. Vazia = nenhuma prova permitida. */
  authorizedProofs: string;
}

export interface CopyReviewInput {
  subject: string;
  body: string;
  emailMode: "initial" | "follow-up";
  context: CopyReviewContext;
}

export interface CopyReviewOptions {
  apiKey: string;
  /** Limpeza aplicada a cada reescrita antes da nova revisao. */
  clean?: (subject: string, body: string) => { subject: string; body: string };
}

export interface CopyReviewLogParams {
  tenantId: string;
  source: "agent" | "manual";
  executionId?: string;
  emailPosition: number;
}

// ==============================================
// SCHEMAS
// ==============================================

const reviewResponseSchema = z.object({
  approved: z.boolean(),
  reasons: z
    .array(
      z.object({
        check: z.string(),
        detail: z.string(),
      })
    )
    .optional()
    .default([]),
});

const rewriteResponseSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

type ReviewReason = { check: string; detail: string };

const CHECK_LABELS: Record<CopyReviewCheck, string> = {
  unsupported_claim: "Prova não autorizada",
  cliche: "Clichê",
  placeholder: "Placeholder",
  sector_relevance: "Fora do setor do público",
  length: "Longo demais",
  cta: "CTA pede reunião",
};

function formatReason(reason: ReviewReason): string {
  const label = CHECK_LABELS[reason.check as CopyReviewCheck] ?? reason.check;
  const detail = reason.detail.trim();
  return detail ? `${label}: ${detail}` : label;
}

// ==============================================
// PROMPTS
// ==============================================

const STANDARD_VARIABLES = ["{{first_name}}", "{{company_name}}", "{{title}}", "{{ice_breaker}}"];

const REVIEWER_SYSTEM_PROMPT = `Voce e um editor senior de cold email B2B em portugues do Brasil. Sua tarefa e REVISAR um e-mail de prospeccao e decidir se ele pode ser enviado.

Checagens (use exatamente estes ids no campo "check"):
- "unsupported_claim": o e-mail cita numero, porcentagem, case, nome de cliente, resultado ou certificacao que NAO esta na lista de PROVAS AUTORIZADAS. Se a lista estiver vazia, QUALQUER prova desse tipo reprova.
- "cliche": frases feitas de vendas ("espero que esteja bem", "solucao inovadora", "alavancar", "revolucionar", "sinergia", "tempo e dinheiro", etc.).
- "placeholder": texto entre colchetes ([...]), as palavras "Nome" ou "Empresa" soltas no lugar de um dado real, ou variavel {{x}} que nao esteja na lista de VARIAVEIS PERMITIDAS. As variaveis permitidas NAO sao placeholders: o sistema de envio as preenche por lead.
- "sector_relevance": a oferta nao tem ligacao clara com o setor ou o cargo do publico.
- "length": o corpo passa de ~150 palavras.
- "cta": o fechamento pede reuniao, call, agenda ou horario em vez de uma pergunta simples de baixo atrito.

Aprove quando nenhuma checagem falhar. Nao reprove por estilo ou preferencia pessoal.

Responda SOMENTE com JSON no formato:
{"approved": boolean, "reasons": [{"check": "<id>", "detail": "<o trecho e o problema, em uma frase>"}]}
Quando aprovado, "reasons" e uma lista vazia.`;

const REWRITER_SYSTEM_PROMPT = `Voce e um editor senior de cold email B2B em portugues do Brasil. Reescreva o e-mail corrigindo TODOS os problemas apontados, mantendo a ideia central, o tom e o idioma.

Regras obrigatorias:
- Mantenha exatamente as mesmas variaveis {{...}} do original (mesma grafia); nao crie variaveis novas e nao remova as existentes.
- Nao invente provas: nenhum numero, porcentagem, case, cliente, resultado ou certificacao que nao esteja na lista de PROVAS AUTORIZADAS.
- Nada de texto entre colchetes nem "Nome"/"Empresa" soltos.
- Corpo com no maximo ~120 palavras.
- Feche com uma pergunta simples de baixo atrito, sem pedir reuniao, call ou agenda.
- O assunto nao pode comecar com "RE:" ou "FW:".

Responda SOMENTE com JSON no formato: {"subject": "<assunto>", "body": "<corpo>"}`;

function extractVariables(text: string): string[] {
  return Array.from(new Set(text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []));
}

/** Nomes das variaveis sem espacos (`{{ first_name }}` = `{{first_name}}`), ordenados. */
function variableNames(text: string): string {
  return extractVariables(text)
    .map((v) => v.replace(/[{}\s]/g, ""))
    .filter((name, i, all) => all.indexOf(name) === i)
    .sort()
    .join(",");
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildContextBlock(input: CopyReviewInput, allowedVariables: string[]): string {
  const { context } = input;
  const orDash = (value: string) => (value && value.trim() ? value.trim() : "(nao informado)");
  return [
    `PUBLICO: ${orDash(context.audience)}`,
    `OFERTA: ${orDash([context.productName, context.productDescription].filter((v) => v && v.trim()).join(" — "))}`,
    `SETORES-ALVO: ${orDash(context.targetIndustries)}`,
    `ICP: ${orDash(context.icpSummary)}`,
    `DORES: ${orDash(context.painPoints)}`,
    `PROVAS AUTORIZADAS: ${context.authorizedProofs && context.authorizedProofs.trim() ? context.authorizedProofs.trim() : "(nenhuma — qualquer prova reprova)"}`,
    `VARIAVEIS PERMITIDAS: ${allowedVariables.join(", ")}`,
    `TIPO: ${input.emailMode === "follow-up" ? "follow-up" : "e-mail inicial"}`,
  ].join("\n");
}

function buildEmailBlock(subject: string, body: string): string {
  return `ASSUNTO: ${subject}\n\nCORPO (${countWords(body)} palavras):\n${body}`;
}

// ==============================================
// LLM CALL
// ==============================================

interface CallTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

async function callJson(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  totals: CallTotals
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REVIEWER_TIMEOUT_MS);
  totals.calls++;
  try {
    const completion = await client.chat.completions.create(buildReviewerRequest(messages), {
      signal: controller.signal,
    });
    totals.promptTokens += completion.usage?.prompt_tokens ?? 0;
    totals.completionTokens += completion.usage?.completion_tokens ?? 0;
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("copy-reviewer: resposta vazia");
    return JSON.parse(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==============================================
// PUBLIC API
// ==============================================

/**
 * Revisa (e se preciso reescreve) um e-mail. Nunca lanca.
 */
export async function reviewEmailCopy(
  input: CopyReviewInput,
  options: CopyReviewOptions
): Promise<CopyReviewResult> {
  const totals: CallTotals = { calls: 0, promptTokens: 0, completionTokens: 0 };

  const buildResult = (
    subject: string,
    body: string,
    status: CopyReviewResult["status"],
    reasons: string[]
  ): CopyReviewResult => ({
    subject,
    body,
    status,
    reasons,
    calls: totals.calls,
    promptTokens: totals.promptTokens,
    completionTokens: totals.completionTokens,
    estimatedCost: calculateReviewCost(totals.promptTokens, totals.completionTokens),
  });

  try {
    if (!options.apiKey) {
      return buildResult(input.subject, input.body, "not_reviewed", []);
    }

    const client = new OpenAI({ apiKey: options.apiKey });
    const originalVariables = extractVariables(`${input.subject}\n${input.body}`);
    const originalVariableNames = variableNames(`${input.subject}\n${input.body}`);
    const allowedVariables = Array.from(new Set([...STANDARD_VARIABLES, ...originalVariables]));
    const contextBlock = buildContextBlock(input, allowedVariables);

    let subject = input.subject;
    let body = input.body;
    let rewrites = 0;

    for (;;) {
      const rawReview = await callJson(
        client,
        [
          { role: "system", content: REVIEWER_SYSTEM_PROMPT },
          { role: "user", content: `${contextBlock}\n\n${buildEmailBlock(subject, body)}` },
        ],
        totals
      );
      const review = reviewResponseSchema.safeParse(rawReview);
      if (!review.success) throw new Error("copy-reviewer: revisao invalida");

      // So os 6 criterios conhecidos contam (queixa de estilo nao reprova).
      const reasons = review.data.reasons.filter((r) =>
        (COPY_REVIEW_CHECKS as readonly string[]).includes(r.check)
      );
      // Reprovado sem motivos conta como aprovado.
      if (review.data.approved || reasons.length === 0) {
        return buildResult(subject, body, rewrites === 0 ? "approved" : "rewritten", []);
      }

      if (rewrites >= MAX_REWRITES) {
        return buildResult(subject, body, "needs_human_review", reasons.map(formatReason));
      }

      const problems = reasons.map((r) => `- [${r.check}] ${r.detail}`).join("\n");
      const rawRewrite = await callJson(
        client,
        [
          { role: "system", content: REWRITER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${contextBlock}\n\nVARIAVEIS DO ORIGINAL (manter exatamente): ${originalVariables.length > 0 ? originalVariables.join(", ") : "(nenhuma)"}\n\nPROBLEMAS APONTADOS:\n${problems}\n\n${buildEmailBlock(subject, body)}`,
          },
        ],
        totals
      );
      const rewrite = rewriteResponseSchema.safeParse(rawRewrite);
      if (!rewrite.success) throw new Error("copy-reviewer: reescrita invalida");

      let nextSubject = rewrite.data.subject.trim();
      let nextBody = rewrite.data.body.trim();
      if (options.clean) {
        const cleaned = options.clean(nextSubject, nextBody);
        nextSubject = cleaned.subject.trim();
        nextBody = cleaned.body.trim();
      }
      if (!nextSubject || !nextBody) throw new Error("copy-reviewer: reescrita vazia");
      // A reescrita precisa manter exatamente as variaveis do original: sem perder
      // (personalizacao por lead) nem criar novas (ex.: {{ice_breaker}} num follow-up).
      if (variableNames(`${nextSubject}\n${nextBody}`) !== originalVariableNames) {
        throw new Error("copy-reviewer: reescrita mudou as variaveis do original");
      }

      subject = nextSubject;
      body = nextBody;
      rewrites++;
    }
  } catch (error) {
    console.warn(
      "[copy-reviewer] revisao indisponivel, seguindo com o texto original:",
      error instanceof Error ? error.message : error
    );
    return buildResult(input.subject, input.body, "not_reviewed", []);
  }
}

/**
 * Registra o custo da revisao em `api_usage_logs` (uma linha por e-mail, so quando houve
 * pelo menos 1 chamada). `logApiUsage` nunca lanca.
 */
export async function logCopyReview(
  result: CopyReviewResult,
  params: CopyReviewLogParams
): Promise<void> {
  if (result.calls === 0) return;
  const metadata: Record<string, unknown> = {
    model: REVIEWER_MODEL,
    calls: result.calls,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    reviewStatus: result.status,
    source: params.source,
    emailPosition: params.emailPosition,
  };
  if (params.executionId) metadata.executionId = params.executionId;

  await logApiUsage({
    tenantId: params.tenantId,
    serviceName: "openai",
    requestType: "copy_review",
    estimatedCost: result.estimatedCost,
    status: result.status === "not_reviewed" ? "failed" : "success",
    metadata,
  });
}
