/**
 * Reply Intent Classifier — Story 21.3 (Classificação de Intenção por IA)
 *
 * Camada de INTELIGÊNCIA sobre `opportunities` source='reply' já persistidas pela 21.2
 * (a 21.2 cria com `intent` null). Espelha estruturalmente `relevance-classifier.ts`
 * (Epic 13 — classificador em contexto de CRON: service-role, fetch direto p/ OpenAI,
 * sem cookies, fail-open). Passe SEPARADO `classifyPendingReplies` (NÃO inline no INSERT
 * da 21.2): varre oportunidades não classificadas, classifica a intenção por IA, faz
 * ensemble com o sinal nativo do Instantly (`lt_interest_status`), atualiza o status do
 * lead (FR5) e registra o custo (NFR6).
 *
 * Fail-open = `intent: null` (NÃO forja um intent, ao contrário do relevance que fail-opa
 * para `true`): a oportunidade fica visível e reentra no próximo ciclo do passe (AC4).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIPromptMetadata } from "@/types/ai-prompt";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";
import {
  interpolateTemplate,
  calculateClassificationCost,
} from "@/lib/utils/relevance-classifier";
import { getApiKey, logMonitoringUsage } from "@/lib/utils/monitoring-processor";
import { normalizeLtInterestStatus } from "@/lib/utils/lt-interest";
import {
  isValidOpportunityIntent,
  type OpportunityIntent,
} from "@/types/opportunity";
import type { LeadStatus } from "@/types/lead";

// Re-export p/ compat de call sites/testes que importam daqui (helper puro em lt-interest.ts).
export { normalizeLtInterestStatus };

// ==============================================
// CONSTANTS
// ==============================================

/** Cap defensivo de oportunidades classificadas por execução (custo/latência de IA). */
export const MAX_CLASSIFY_PER_RUN = 200;

/** Concorrência do passe — isolamento por-item com Promise.allSettled em lotes. */
export const CLASSIFY_CONCURRENCY = 10;

/** Abaixo deste tamanho o texto não vale uma chamada de IA (AC6 trata no passe). */
const MIN_REPLY_TEXT_LENGTH = 10;

/** Truncagem defensiva do texto de resposta (limite de tokens). */
const MAX_REPLY_TEXT_LENGTH = 4000;

// ==============================================
// STRUCTURED LOGGING (fail-open — nunca quebra o cron)
// ==============================================

function logWarn(message: string, meta?: Record<string, unknown>): void {
  console.warn(`[reply-classifier] ${message}`, meta ?? "");
}

// ==============================================
// TYPES
// ==============================================

export interface IntentClassification {
  intent: OpportunityIntent | null;
  reasoning: string;
}

export interface IntentClassificationResult extends IntentClassification {
  promptTokens: number;
  completionTokens: number;
}

export interface ClassifyParams {
  /** Se informado, classifica apenas oportunidades deste tenant (backfill admin). */
  tenantId?: string;
}

export interface ClassifyResult {
  classified: number;
  skipped: number;
  errors: Array<{ tenantId?: string; opportunityId?: string; error: string }>;
}

/** Prompt resolvido (tenant→global→código). Carregado 1×/tenant no passe (review 21.3, P5). */
interface LoadedPrompt {
  template: string;
  modelPreference: string;
  metadata: AIPromptMetadata;
}

// ==============================================
// PURE HELPERS — normalização, mapas e regras (Tasks 2.4/2.5/2.6, 3.1, 4.2)
// ==============================================

/**
 * Task 2.5 (AC3/FR5) — intent → status do lead. `null` = não altera status.
 * Espelha o precedente `responseToStatus` (campaign-import.ts).
 */
export const INTENT_TO_LEAD_STATUS: Record<OpportunityIntent, LeadStatus | null> = {
  interessado: "interessado",
  pediu_info: "interessado",
  objecao: null,
  nao_agora: null,
  opt_out: "nao_interessado",
};

/**
 * Task 2.6 (AC6) — fallback CONSERVADOR quando não há texto de resposta: só sinais
 * positivos do Instantly (1..4) viram `interessado`. Negativos (-1..-4) e 0 (Out of Office)
 * NÃO casam nenhum dos 5 intents com confiança → tratados como `null` no ponto de uso.
 * Escala documentada (00055:55 / spike): Interested=1, Meeting Booked=2, Meeting Completed=3,
 * Won=4, Out of Office=0, Not Interested=-1, Wrong Person=-2, Lost=-3, No Show=-4.
 */
export const LT_INTEREST_TO_INTENT: Record<number, OpportunityIntent> = {
  1: "interessado",
  2: "interessado",
  3: "interessado",
  4: "interessado",
};

/**
 * Task 3.1 (AC2/FR4) — detecta divergência entre a IA e o sinal nativo do Instantly.
 * NÃO altera o intent (a IA prevalece); só sinaliza para log. Divergência quando o sinal
 * do Instantly contradiz a intenção da IA:
 * - Instantly negativo (Not Interested/Wrong Person/Lost/No Show) vs IA positiva (interessado/pediu_info).
 * - Instantly positivo (Interested/Meeting/Won) vs IA `opt_out`.
 */
export function isEnsembleDivergent(intent: OpportunityIntent, lt: number): boolean {
  const positiveIntent = intent === "interessado" || intent === "pediu_info";
  if (lt <= -1 && positiveIntent) return true;
  if (lt >= 1 && intent === "opt_out") return true;
  return false;
}

/**
 * Task 4.2 (AC3) — resolve o novo status do lead com guarda PROMOTE-ONLY (não rebaixa o
 * funil). Retorna `null` quando não há transição (intent neutro, status já igual, ou o
 * guard bloqueia):
 * - `interessado` só promove `novo`/`em_campanha` (não rebaixa `oportunidade`/`nao_interessado`).
 * - `nao_interessado` (opt_out) é terminal, sobrescreve qualquer status EXCETO `oportunidade`
 *   (lead já convertido não vira "não interessado" por um opt-out tardio).
 */
export function resolveLeadStatusTransition(
  current: LeadStatus,
  intent: OpportunityIntent
): LeadStatus | null {
  const target = INTENT_TO_LEAD_STATUS[intent];
  if (!target || target === current) return null;
  if (target === "interessado") {
    return current === "novo" || current === "em_campanha" ? "interessado" : null;
  }
  if (target === "nao_interessado") {
    return current !== "oportunidade" ? "nao_interessado" : null;
  }
  return null;
}

// ==============================================
// PARSE (fail-open → intent null) — Task 2.2
// ==============================================

/**
 * Parse da resposta JSON da IA. Fail-open = `intent: null` (NÃO inventa um intent) para
 * JSON inválido / campo ausente / valor fora do enum de intents.
 */
export function parseIntentResponse(text: string): IntentClassification {
  try {
    const cleaned = text
      .trim()
      .replace(/^```json\s*/, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const reasoning = typeof parsed?.reasoning === "string" ? parsed.reasoning : "";
    const rawIntent = parsed?.intent;
    if (typeof rawIntent === "string" && isValidOpportunityIntent(rawIntent)) {
      return { intent: rawIntent, reasoning };
    }
    return {
      intent: null,
      reasoning: reasoning || "Intent ausente ou fora do enum — fail-open",
    };
  } catch {
    return { intent: null, reasoning: "JSON inválido retornado — fail-open" };
  }
}

// ==============================================
// PROMPT LOADING (cron context — 3-level fallback tenant→global→código)
// Espelha relevance-classifier.loadPromptTemplate, trocando a prompt_key.
// ==============================================

async function loadPromptTemplate(
  supabase: SupabaseClient,
  tenantId: string
): Promise<LoadedPrompt> {
  // Level 1: Tenant-specific
  const { data: tenantPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, model_preference, metadata")
    .eq("prompt_key", "reply_intent_classification")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (tenantPrompt) {
    return {
      template: tenantPrompt.prompt_template as string,
      modelPreference: (tenantPrompt.model_preference as string) || "gpt-4o-mini",
      metadata: (tenantPrompt.metadata ?? {}) as AIPromptMetadata,
    };
  }

  // Level 2: Global
  const { data: globalPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, model_preference, metadata")
    .eq("prompt_key", "reply_intent_classification")
    .is("tenant_id", null)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (globalPrompt) {
    return {
      template: globalPrompt.prompt_template as string,
      modelPreference: (globalPrompt.model_preference as string) || "gpt-4o-mini",
      metadata: (globalPrompt.metadata ?? {}) as AIPromptMetadata,
    };
  }

  // Level 3: Code default (00038 — código é a fonte de verdade dos prompts)
  const codeDefault = CODE_DEFAULT_PROMPTS["reply_intent_classification"];
  return {
    template: codeDefault.template,
    modelPreference: codeDefault.modelPreference || "gpt-4o-mini",
    metadata: codeDefault.metadata ?? {},
  };
}

// ==============================================
// OPENAI CALL (direct fetch, no SDK) — espelha relevance-classifier.callOpenAI
// ==============================================

async function callOpenAI(
  apiKey: string,
  prompt: string,
  model: string = "gpt-4o-mini",
  temperature: number = 0.2,
  maxTokens: number = 200
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing choices[0].message.content");
  }

  return {
    text: content,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ==============================================
// MAIN CLASSIFICATION FUNCTION — Task 2.3 (AC1/AC4)
// ==============================================

/**
 * Classifica a intenção de UMA resposta. Fail-open → `intent: null` (sem custo) nos guards
 * de curto-circuito (sem chave / texto curto) e em erro de OpenAI/parse.
 */
export async function classifyReplyIntent(
  replyText: string | null,
  replySubject: string | null,
  openaiKey: string | null,
  supabase: SupabaseClient,
  tenantId: string,
  preloadedPrompt?: LoadedPrompt
): Promise<IntentClassificationResult> {
  const noTokens = { promptTokens: 0, completionTokens: 0 };

  // Guard: sem chave de IA → intent null (fail-open, sem custo, sem chamada).
  if (!openaiKey) {
    return { intent: null, reasoning: "OpenAI key não configurada — fail-open", ...noTokens };
  }

  // Guard: texto vazio/curto → intent null (AC6 é tratado no passe, não aqui).
  if (!replyText || replyText.trim().length < MIN_REPLY_TEXT_LENGTH) {
    return { intent: null, reasoning: "Texto de resposta vazio ou muito curto", ...noTokens };
  }

  try {
    // P5 (review 21.3): no passe o prompt é resolvido 1×/tenant e injetado aqui; chamadas
    // diretas (sem preloaded) ainda carregam sob demanda — compat de call sites/testes.
    const { template, modelPreference, metadata } =
      preloadedPrompt ?? (await loadPromptTemplate(supabase, tenantId));

    const truncatedText =
      replyText.length > MAX_REPLY_TEXT_LENGTH
        ? replyText.substring(0, MAX_REPLY_TEXT_LENGTH) + "..."
        : replyText;

    const prompt = interpolateTemplate(template, {
      reply_subject: replySubject ?? "",
      reply_text: truncatedText,
    });

    const model = modelPreference;
    const temperature = metadata.temperature ?? 0.2;
    const maxTokens = metadata.maxTokens ?? 200;

    const { text, promptTokens, completionTokens } = await callOpenAI(
      openaiKey,
      prompt,
      model,
      temperature,
      maxTokens
    );

    const classification = parseIntentResponse(text);
    return { ...classification, promptTokens, completionTokens };
  } catch {
    // Fail-open (AC4): erro de OpenAI/parse → intent null → reentra no próximo ciclo.
    return {
      intent: null,
      reasoning: "Erro na classificação — fail-open (intent null)",
      ...noTokens,
    };
  }
}

// ==============================================
// LEAD STATUS UPDATE (secundário — Task 4)
// ==============================================

/**
 * Atualiza o status do lead conforme o intent, com guarda promote-only (Task 4.2).
 * SECUNDÁRIO (Task 4.3): erro no update NÃO falha a classificação — só loga e segue.
 */
async function updateLeadStatus(
  supabase: SupabaseClient,
  leadId: string | null,
  intent: OpportunityIntent
): Promise<void> {
  if (!leadId) return;
  if (INTENT_TO_LEAD_STATUS[intent] === null) return;

  try {
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("status")
      .eq("id", leadId)
      .maybeSingle();

    if (fetchError) {
      logWarn("failed to fetch lead for status update", { leadId, error: fetchError.message });
      return;
    }
    if (!lead) return;

    const currentStatus = (lead as { status: LeadStatus }).status;
    const newStatus = resolveLeadStatusTransition(currentStatus, intent);
    if (!newStatus) return;

    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (updateError) {
      logWarn("failed to update lead status", { leadId, error: updateError.message });
    }
  } catch (err) {
    logWarn("lead status update threw", {
      leadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ==============================================
// PER-OPPORTUNITY WORKER (classify + ensemble + persist + status + cost)
// ==============================================

interface PendingOpportunity {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  reply_text: string | null;
  reply_subject: string | null;
  lt_interest_status: number | null;
}

async function classifyOne(
  supabase: SupabaseClient,
  tenantId: string,
  opp: PendingOpportunity,
  openaiKey: string,
  prompt: LoadedPrompt
): Promise<{ outcome: "classified" | "skipped"; error?: string }> {
  let intent: OpportunityIntent | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let usedAI = false;

  const hasText =
    !!opp.reply_text && opp.reply_text.trim().length >= MIN_REPLY_TEXT_LENGTH;

  if (hasText) {
    // Caminho normal: classificação por IA (AC1). Prompt já resolvido 1×/tenant (P5).
    usedAI = true;
    const result = await classifyReplyIntent(
      opp.reply_text,
      opp.reply_subject,
      openaiKey,
      supabase,
      tenantId,
      prompt
    );
    intent = result.intent;
    promptTokens = result.promptTokens;
    completionTokens = result.completionTokens;
  } else if (typeof opp.lt_interest_status === "number") {
    // AC6: sem texto → usa só o sinal do Instantly (mapa conservador), sem chamar IA.
    intent = LT_INTEREST_TO_INTENT[opp.lt_interest_status] ?? null;
  }

  // Ensemble IA × lt_interest_status (AC2/FR4): a IA prevalece; só loga a divergência.
  if (intent !== null && typeof opp.lt_interest_status === "number") {
    if (isEnsembleDivergent(intent, opp.lt_interest_status)) {
      logWarn("ensemble divergence — AI prevails", {
        opportunityId: opp.id,
        aiIntent: intent,
        ltInterestStatus: opp.lt_interest_status,
      });
    }
  }

  // Custo de IA (Task 6 / NFR6) — só quando de fato houve tokens.
  // Neste ramo a chamada de OpenAI SUCEDEU (erro duro/timeout retorna 0 tokens e nem entra
  // aqui), então `status: "success"` sempre — `intent: null` com tokens é parse-fail / valor
  // fora do enum (qualidade de dado, não falha de API). O `hasIntent` no metadata distingue.
  // (review 21.3, P4: não poluir a taxa de "failed" de api_usage_logs com chamadas OK.)
  if (usedAI && (promptTokens > 0 || completionTokens > 0)) {
    await logMonitoringUsage(supabase, {
      tenantId,
      serviceName: "openai",
      requestType: "reply_intent_classification",
      leadId: opp.lead_id ?? undefined,
      estimatedCost: calculateClassificationCost(promptTokens, completionTokens),
      status: "success",
      metadata: {
        source: "reply",
        opportunityId: opp.id,
        promptTokens,
        completionTokens,
        hasIntent: intent !== null,
      },
    });
  }

  // Fail-open (AC4/AC6): intent null → NÃO persiste (fica visível, reentra no próximo ciclo).
  if (intent === null) {
    return { outcome: "skipped" };
  }

  // Persiste o intent (só o intent muda de fato para reply; a coluna lt_interest_status já
  // tem o valor da ingestão — Task 3.3). Dispara o trigger update_updated_at_column.
  // P1 (review 21.3): `.is("intent", null)` torna o UPDATE um compare-and-swap — se um passe
  // concorrente (cron × backfill) já classificou esta row, este UPDATE vira no-op em vez de
  // sobrescrever. Não elimina o custo duplicado de OpenAI (exigiria um passo de claim), mas
  // evita o double-write e a re-atualização de status do lead.
  const { error: updateError } = await supabase
    .from("opportunities")
    .update({ intent })
    .eq("id", opp.id)
    .is("intent", null);

  if (updateError) {
    logWarn("failed to persist intent", { opportunityId: opp.id, error: updateError.message });
    return { outcome: "skipped", error: updateError.message };
  }

  // Auto-update do status do lead (FR5) — secundário, não falha a classificação.
  await updateLeadStatus(supabase, opp.lead_id, intent);

  return { outcome: "classified" };
}

// ==============================================
// PUBLIC: classifyPendingReplies (passe encadeado) — Task 5
// ==============================================

/**
 * Passe de classificação: varre `opportunities` source='reply' com `intent` null, classifica
 * por IA (+ ensemble + status + custo) e persiste o intent. Idempotente por construção (só
 * seleciona `intent IS NULL`; a 2ª execução não reclassifica os já classificados). Fail-open
 * por-tenant (sem chave OpenAI → pula, intent segue null → retry). Encadeado DEPOIS de
 * `processReplies` nas rotas da 21.2 (a oportunidade precisa existir antes de classificar).
 */
export async function classifyPendingReplies(
  supabase: SupabaseClient,
  params: ClassifyParams = {}
): Promise<ClassifyResult> {
  const errors: ClassifyResult["errors"] = [];

  let query = supabase
    .from("opportunities")
    .select("id, tenant_id, lead_id, reply_text, reply_subject, lt_interest_status")
    .eq("source", "reply")
    .is("intent", null)
    .order("created_at", { ascending: true })
    .limit(MAX_CLASSIFY_PER_RUN);

  if (params.tenantId) query = query.eq("tenant_id", params.tenantId);

  const { data, error } = await query;
  if (error) {
    errors.push({ error: error.message });
    return { classified: 0, skipped: 0, errors };
  }

  const pending = (data ?? []) as PendingOpportunity[];
  if (pending.length === 0) return { classified: 0, skipped: 0, errors };

  // Agrupa por tenant (a chave de IA é resolvida uma vez por tenant).
  const byTenant = new Map<string, PendingOpportunity[]>();
  for (const opp of pending) {
    const list = byTenant.get(opp.tenant_id) ?? [];
    list.push(opp);
    byTenant.set(opp.tenant_id, list);
  }

  let classified = 0;
  let skipped = 0;

  for (const [tenantId, opps] of byTenant) {
    const openaiKey = await getApiKey(supabase, tenantId, "openai");
    if (!openaiKey) {
      // Fail-open: sem chave → pula o tenant (intent segue null → retry no próximo ciclo).
      logWarn("no openai key — skipping tenant (fail-open)", { tenantId });
      skipped += opps.length;
      continue;
    }

    // P5 (review 21.3): resolve o prompt UMA vez por tenant (como o getApiKey acima), em vez
    // de recarregar por-oportunidade — evita ~2 queries a `ai_prompts` por item.
    const prompt = await loadPromptTemplate(supabase, tenantId);

    // Isola por-item com Promise.allSettled em lotes de CLASSIFY_CONCURRENCY.
    for (let i = 0; i < opps.length; i += CLASSIFY_CONCURRENCY) {
      const batch = opps.slice(i, i + CLASSIFY_CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map((opp) => classifyOne(supabase, tenantId, opp, openaiKey, prompt))
      );
      settled.forEach((res, j) => {
        if (res.status === "fulfilled") {
          if (res.value.outcome === "classified") classified++;
          else skipped++;
          if (res.value.error) {
            errors.push({ tenantId, opportunityId: batch[j].id, error: res.value.error });
          }
        } else {
          skipped++;
          errors.push({ tenantId, opportunityId: batch[j].id, error: String(res.reason) });
        }
      });
    }
  }

  return { classified, skipped, errors };
}
