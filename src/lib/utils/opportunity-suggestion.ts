/**
 * Opportunity Next Step Generator
 * Story: 21.5 - Ações do Card + Próximo Passo por IA
 *
 * Gera o rascunho de próximo passo de uma oportunidade (resposta de e-mail ou
 * sinal de engajamento). Espelha `approach-suggestion.ts` (Epic 13): funções puras
 * + fetch direto na OpenAI, contexto-agnóstico (recebe `supabase` + `openaiKey` por
 * parâmetro) — logo serve tanto cron quanto request-time. Aqui o uso é request-time
 * (rota POST /api/opportunities/:id/suggestion), com cache em `opportunities.suggestion`.
 *
 * AC: #1 - Rascunho contextualizado (KB + tom + lead + resposta + intenção)
 * AC: #5 - Falha na geração → suggestion=null (o fail-open é de UX, no card)
 * AC: #6 - Tokens retornados para o caller registrar o custo em api_usage_logs
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIPromptMetadata } from "@/types/ai-prompt";
import type { OpportunityIntent } from "@/types/opportunity";
import { getIntentConfig } from "@/types/opportunity";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";
import { interpolateTemplate } from "@/lib/utils/relevance-classifier";
// Tipos/custo reusados do gerador do Epic 13 — mesma tarifa (gpt-4o-mini), mesma forma.
import { calculateSuggestionCost } from "@/lib/utils/approach-suggestion";
import type {
  LeadContextForSuggestion,
  KBContextForSuggestion,
  SuggestionResult,
} from "@/lib/utils/approach-suggestion";

export { calculateSuggestionCost };
export type { LeadContextForSuggestion, KBContextForSuggestion, SuggestionResult };

// ==============================================
// TYPES
// ==============================================

/**
 * Contexto da oportunidade. Todos nullable de propósito — são casos reais:
 * `source='engagement'` não tem reply_text/reply_subject (21.6) e `intent` é
 * null quando a 21.3 falha (fail-open) ou quando a fonte é engajamento.
 */
export interface OpportunityContextForSuggestion {
  replyText: string | null;
  replySubject: string | null;
  intent: OpportunityIntent | null;
}

const PROMPT_KEY = "opportunity_next_step";

/** Teto do prompt (guarda de custo — decisão Fabossi #1). Espelha approach-suggestion. */
const MAX_REPLY_TEXT_CHARS = 4000;

// ==============================================
// PROMPT LOADING (3 níveis: tenant → global → código)
// ==============================================

async function loadNextStepPromptTemplate(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ template: string; modelPreference: string; metadata: AIPromptMetadata }> {
  // Level 1: Tenant-specific
  const { data: tenantPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, model_preference, metadata")
    .eq("prompt_key", PROMPT_KEY)
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
    .eq("prompt_key", PROMPT_KEY)
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

  // Level 3: Code default (00038: código é a fonte de verdade dos prompts)
  const codeDefault = CODE_DEFAULT_PROMPTS[PROMPT_KEY];
  return {
    template: codeDefault.template,
    modelPreference: codeDefault.modelPreference || "gpt-4o-mini",
    metadata: codeDefault.metadata ?? {},
  };
}

// ==============================================
// OPENAI CALL (fetch direto, texto livre)
// ==============================================

/**
 * Texto livre (NÃO JSON): temperatura alta (0.7), 500 tokens, timeout 30s e
 * SEM `response_format` — ao contrário do classificador da 21.3.
 */
async function callOpenAI(
  apiKey: string,
  prompt: string,
  model: string = "gpt-4o-mini",
  temperature: number = 0.7,
  maxTokens: number = 500
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
    }),
    signal: AbortSignal.timeout(30000),
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
// MAIN GENERATION FUNCTION
// ==============================================

/**
 * Gera o rascunho de próximo passo para uma oportunidade.
 *
 * Como o `approach-suggestion`, NÃO forja texto em erro: falha → suggestion=null
 * (+ `error`). O "fail-open" do AC5 é de UX — quem trata é o card, que segue
 * utilizável com as demais ações.
 */
export async function generateOpportunityNextStep(
  oppContext: OpportunityContextForSuggestion,
  leadContext: LeadContextForSuggestion,
  kbContext: KBContextForSuggestion,
  openaiKey: string | null,
  supabase: SupabaseClient,
  tenantId: string
): Promise<SuggestionResult> {
  const noTokens = { promptTokens: 0, completionTokens: 0 };

  // Sem chave — não gera e não gasta (AC5: fail-open sem custo)
  if (!openaiKey) {
    return { suggestion: null, ...noTokens, error: "OpenAI key não configurada" };
  }

  try {
    const { template, modelPreference, metadata } = await loadNextStepPromptTemplate(
      supabase,
      tenantId
    );

    // Guarda de custo: teto do prompt (decisão #1)
    const replyText = oppContext.replyText ?? "";
    const truncatedReplyText =
      replyText.length > MAX_REPLY_TEXT_CHARS
        ? replyText.substring(0, MAX_REPLY_TEXT_CHARS) + "..."
        : replyText;

    const prompt = interpolateTemplate(template, {
      company_name: kbContext.companyName,
      company_context: kbContext.companyContext,
      products_services: kbContext.productsServices,
      competitive_advantages: kbContext.competitiveAdvantages,
      icp_summary: kbContext.icpSummary,
      tone_description: kbContext.toneDescription,
      tone_style: kbContext.toneStyle,
      lead_name: leadContext.leadName,
      lead_title: leadContext.leadTitle,
      lead_company: leadContext.leadCompany,
      lead_industry: leadContext.leadIndustry,
      reply_subject: oppContext.replySubject ?? "",
      // Vazio quando source='engagement' — o template instrui a abordagem por
      // engajamento (aberturas/cliques) nesse caso.
      reply_text: truncatedReplyText,
      // Rótulo pt-BR legível (fonte única: types/opportunity.ts). intent null
      // (21.3 fail-open / engagement) vira "Não classificado".
      intent: getIntentConfig(oppContext.intent).label,
    });

    const model = modelPreference;
    const temperature = metadata.temperature ?? 0.7;
    const maxTokens = metadata.maxTokens ?? 500;

    const { text, promptTokens, completionTokens } = await callOpenAI(
      openaiKey,
      prompt,
      model,
      temperature,
      maxTokens
    );

    const suggestion = text.trim();
    if (!suggestion) {
      return {
        suggestion: null,
        promptTokens,
        completionTokens,
        error: "Rascunho vazio retornado",
      };
    }

    return { suggestion, promptTokens, completionTokens };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return { suggestion: null, ...noTokens, error: message };
  }
}
