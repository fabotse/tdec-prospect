/**
 * Approach Suggestion Generator
 * Story: 13.5 - Geração de Sugestão de Abordagem
 *
 * Generates contextual approach suggestions when a relevant LinkedIn post is detected.
 * Pure functions + OpenAI fetch call. Designed for cron context (no cookies).
 *
 * AC: #3 - Contextual suggestion connecting post with product/service
 * AC: #4 - Different from Icebreaker — focus on temporal opportunity
 * AC: #6 - If generation fails, return suggestion=null (NOT fail-open)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIPromptMetadata } from "@/types/ai-prompt";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";
import { interpolateTemplate } from "@/lib/utils/relevance-classifier";
import type { KBContextForClassification } from "@/lib/utils/relevance-classifier";

// ==============================================
// TYPES
// ==============================================

export interface LeadContextForSuggestion {
  leadName: string;
  leadTitle: string;
  leadCompany: string;
  leadIndustry: string;
}

export interface KBContextForSuggestion extends KBContextForClassification {
  toneDescription: string;
  toneStyle: string;
}

export interface SuggestionResult {
  suggestion: string | null;
  promptTokens: number;
  completionTokens: number;
  error?: string;
}

// ==============================================
// COST CALCULATION
// ==============================================

/**
 * Calculate cost for a suggestion generation call.
 * gpt-4o-mini: $0.15/1M input, $0.60/1M output.
 */
export function calculateSuggestionCost(
  promptTokens: number,
  completionTokens: number
): number {
  return (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000;
}

// ==============================================
// PROMPT LOADING (cron context — no PromptManager)
// ==============================================

/**
 * Load suggestion prompt template with 3-level fallback: tenant → global → code default.
 * Uses service-role client directly (no cookies needed).
 */
async function loadSuggestionPromptTemplate(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ template: string; modelPreference: string; metadata: AIPromptMetadata }> {
  // Level 1: Tenant-specific
  const { data: tenantPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, model_preference, metadata")
    .eq("prompt_key", "monitoring_approach_suggestion")
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
    .eq("prompt_key", "monitoring_approach_suggestion")
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
  const codeDefault = CODE_DEFAULT_PROMPTS["monitoring_approach_suggestion"];
  return {
    template: codeDefault.template,
    modelPreference: codeDefault.modelPreference || "gpt-4o-mini",
    metadata: codeDefault.metadata ?? {},
  };
}

// ==============================================
// OPENAI CALL (direct fetch, no SDK)
// ==============================================

/**
 * Call OpenAI for suggestion generation.
 * Different from classifier: higher temperature (0.7), more tokens (500),
 * longer timeout (30s), NO response_format (free text, not JSON).
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
 * Generate a contextual approach suggestion based on a LinkedIn post.
 *
 * Unlike classification (fail-open), suggestion generation is NOT fail-open:
 * - If generation fails → suggestion=null (insight saved without suggestion)
 * - If OpenAI key missing → suggestion=null
 */
export async function generateApproachSuggestion(
  postText: string,
  postUrl: string,
  leadContext: LeadContextForSuggestion,
  kbContext: KBContextForSuggestion,
  openaiKey: string | null,
  supabase: SupabaseClient,
  tenantId: string
): Promise<SuggestionResult> {
  const noTokens = { promptTokens: 0, completionTokens: 0 };

  // No OpenAI key — can't generate
  if (!openaiKey) {
    return { suggestion: null, ...noTokens, error: "OpenAI key não configurada" };
  }

  try {
    const { template, modelPreference, metadata } = await loadSuggestionPromptTemplate(supabase, tenantId);

    // Truncate long posts (max 4000 chars)
    const truncatedText =
      postText.length > 4000 ? postText.substring(0, 4000) + "..." : postText;

    // Interpolate variables
    const prompt = interpolateTemplate(template, {
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
      post_text: truncatedText,
      post_url: postUrl,
    });

    const model = modelPreference;
    const temperature = metadata.temperature ?? 0.7;
    const maxTokens = metadata.maxTokens ?? 500;

    const { text, promptTokens, completionTokens } = await callOpenAI(
      openaiKey, prompt, model, temperature, maxTokens
    );

    const suggestion = text.trim();
    if (!suggestion) {
      return { suggestion: null, promptTokens, completionTokens, error: "Sugestão vazia retornada" };
    }

    return { suggestion, promptTokens, completionTokens };
  } catch (error) {
    // Generation failed — return null (NOT fail-open)
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return { suggestion: null, ...noTokens, error: message };
  }
}
