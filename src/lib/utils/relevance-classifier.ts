/**
 * Relevance Classifier
 * Story: 13.4 - Filtro de Relevância por IA
 *
 * Classifies LinkedIn posts for business relevance using OpenAI.
 * Pure functions + OpenAI fetch call. Designed for cron context (no cookies).
 *
 * AC: #3 - JSON classification { isRelevant, reasoning }
 * AC: #6 - Fallback KB not configured
 * AC: #7 - Fallback OpenAI key missing
 * AC: #8 - Fallback OpenAI error (fail-open)
 * AC: #9 - Model: gpt-4o-mini
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIPromptMetadata } from "@/types/ai-prompt";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";

// ==============================================
// TYPES
// ==============================================

export interface RelevanceClassification {
  isRelevant: boolean;
  reasoning: string;
}

export interface KBContextForClassification {
  companyContext: string;
  productsServices: string;
  competitiveAdvantages: string;
  icpSummary: string;
}

// ==============================================
// PURE FUNCTIONS
// ==============================================

/**
 * Interpolate {{variable}} placeholders in a template string.
 * Unmatched placeholders are left as-is.
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}

/**
 * Parse OpenAI classification response JSON.
 * Returns fail-open (isRelevant: true) for invalid JSON or missing fields.
 */
export function parseClassificationResponse(text: string): RelevanceClassification {
  try {
    // Strip markdown wrapping if present
    const cleaned = text.trim().replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.isRelevant !== "boolean") {
      return { isRelevant: true, reasoning: "Resposta AI sem campo isRelevant — fail-open" };
    }
    return {
      isRelevant: parsed.isRelevant,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return { isRelevant: true, reasoning: "JSON inválido retornado — fail-open" };
  }
}

/**
 * Calculate cost for a classification call.
 * gpt-4o-mini: $0.15/1M input, $0.60/1M output.
 */
export function calculateClassificationCost(
  promptTokens: number,
  completionTokens: number
): number {
  return (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000;
}

// ==============================================
// PROMPT LOADING (cron context — no PromptManager)
// ==============================================

/**
 * Load prompt template with 3-level fallback: tenant → global → code default.
 * Uses service-role client directly (no cookies needed).
 */
async function loadPromptTemplate(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ template: string; modelPreference: string; metadata: AIPromptMetadata }> {
  // Level 1: Tenant-specific
  const { data: tenantPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, model_preference, metadata")
    .eq("prompt_key", "monitoring_relevance_filter")
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
    .eq("prompt_key", "monitoring_relevance_filter")
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

  // Level 3: Code default
  const codeDefault = CODE_DEFAULT_PROMPTS["monitoring_relevance_filter"];
  return {
    template: codeDefault.template,
    modelPreference: codeDefault.modelPreference || "gpt-4o-mini",
    metadata: codeDefault.metadata ?? {},
  };
}

// ==============================================
// OPENAI CALL (direct fetch, no SDK)
// ==============================================

async function callOpenAI(
  apiKey: string,
  prompt: string,
  model: string = "gpt-4o-mini",
  temperature: number = 0.3,
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
// MAIN CLASSIFICATION FUNCTION
// ==============================================

/**
 * Classify a LinkedIn post for business relevance.
 *
 * Fallback strategy (fail-open):
 * - KB not configured → relevant (no AI call)
 * - OpenAI key missing → relevant (no AI call)
 * - OpenAI error → relevant (fail-open)
 * - JSON parse error → relevant (fail-open)
 */
export interface ClassificationResult extends RelevanceClassification {
  promptTokens: number;
  completionTokens: number;
}

export async function classifyPostRelevance(
  postText: string,
  postUrl: string,
  kbContext: KBContextForClassification | null,
  openaiKey: string | null,
  supabase: SupabaseClient,
  tenantId: string
): Promise<ClassificationResult> {
  const noTokens = { promptTokens: 0, completionTokens: 0 };

  // Fallback: KB not configured (AC #6)
  if (!kbContext) {
    return {
      isRelevant: true,
      reasoning: "KB não configurado — post aceito por padrão",
      ...noTokens,
    };
  }

  // Fallback: OpenAI key missing (AC #7)
  if (!openaiKey) {
    return {
      isRelevant: true,
      reasoning: "OpenAI key não configurada — post aceito por padrão",
      ...noTokens,
    };
  }

  // Edge case: empty/very short post text
  if (!postText || postText.trim().length < 10) {
    return {
      isRelevant: false,
      reasoning: "Post com texto vazio ou muito curto — descartado",
      ...noTokens,
    };
  }

  try {
    // Load prompt template (3-level fallback)
    const { template, modelPreference, metadata } = await loadPromptTemplate(supabase, tenantId);

    // Truncate long posts (max 4000 chars to avoid token limit)
    const truncatedText =
      postText.length > 4000 ? postText.substring(0, 4000) + "..." : postText;

    // Interpolate variables
    const prompt = interpolateTemplate(template, {
      company_context: kbContext.companyContext,
      products_services: kbContext.productsServices,
      competitive_advantages: kbContext.competitiveAdvantages,
      icp_summary: kbContext.icpSummary,
      post_text: truncatedText,
      post_url: postUrl,
    });

    // Call OpenAI
    const model = modelPreference;
    const temperature = metadata.temperature ?? 0.3;
    const maxTokens = metadata.maxTokens ?? 200;

    const { text, promptTokens, completionTokens } = await callOpenAI(
      openaiKey,
      prompt,
      model,
      temperature,
      maxTokens
    );

    const classification = parseClassificationResponse(text);
    return { ...classification, promptTokens, completionTokens };
  } catch {
    // Fallback: OpenAI error — fail-open (AC #8)
    return {
      isRelevant: true,
      reasoning: "Erro na classificação — post aceito por padrão (fail-open)",
      ...noTokens,
    };
  }
}
