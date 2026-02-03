/**
 * Knowledge Base Context Service
 * Story 6.3: Knowledge Base Integration for Context
 * Story 6.5: Campaign Product Context
 * Story 6.9: Tone of Voice Application
 *
 * AC 6.3: #1 - Knowledge Base Context in AI Prompts
 * AC 6.3: #5 - Graceful Degradation when KB empty
 * AC 6.5: #3 - AI Uses Product Context
 * AC 6.5: #4 - General Context Fallback
 * AC 6.9: #4 - Custom Guidelines Application
 * AC 6.9: #7 - Graceful Degradation (No Tone Configured)
 *
 * Compiles knowledge base data into AI context variables.
 */

import {
  type CompanyProfile,
  type ToneOfVoice,
  type ICPDefinition,
  type EmailExample,
  type TonePreset,
  TONE_PRESET_LABELS,
} from "@/types/knowledge-base";
import type { Product } from "@/types/product";

// ==============================================
// TYPES
// ==============================================

/**
 * Knowledge base context structure returned by API
 * Contains all KB sections for AI context
 */
export interface KnowledgeBaseContext {
  company: CompanyProfile | null;
  tone: ToneOfVoice | null;
  icp: ICPDefinition | null;
  examples: EmailExample[];
}

/**
 * AI context variables compiled from KB
 * Used for prompt variable interpolation
 * AC: #1 - Includes all KB sections
 * AC 6.5 #3 - Includes product context when selected
 */
export interface AIContextVariables {
  // Company context (AC: #2)
  company_context: string;
  products_services: string;
  competitive_advantages: string;

  // Product context (Story 6.5 AC #3)
  product_name: string;
  product_description: string;
  product_features: string;
  product_differentials: string;
  product_target_audience: string;

  // Tone context (AC: #3)
  tone_description: string;
  tone_style: string;
  writing_guidelines: string;

  // ICP context
  icp_summary: string;
  target_industries: string;
  target_titles: string;
  pain_points: string;

  // Examples context (AC: #4)
  successful_examples: string;

  // Lead context (Story 6.4 placeholder)
  lead_name: string;
  lead_title: string;
  lead_company: string;
  lead_industry: string;
  lead_location: string;

  // Email context
  email_objective: string;
  icebreaker: string;
}

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Default values when KB sections are empty
 * AC: #5 - Graceful Degradation
 * AC 6.9: #7 - Default to "casual" when no tone configured
 */
export const DEFAULT_COMPANY_CONTEXT = "Empresa de tecnologia focada em soluções B2B";
export const DEFAULT_TONE_DESCRIPTION = "Profissional e amigável";
export const DEFAULT_TONE_STYLE: TonePreset = "casual";

/**
 * Maximum number of email examples to include in prompts
 * Keeps prompts concise while providing reference
 */
export const MAX_EXAMPLES_IN_PROMPT = 3;

/**
 * Tone preset vocabulary hints for AI context
 * Story 6.9 AC: #1, #2, #3 - Tone-specific vocabulary guidance
 *
 * These brief hints complement the detailed tone guides in prompts.
 */
export const TONE_PRESET_HINTS: Record<TonePreset, string> = {
  casual: "Linguagem amigável e próxima, evite formalidades",
  formal: "Linguagem corporativa e respeitosa, mantenha distância profissional",
  technical: "Linguagem técnica e precisa, use terminologia do setor",
};

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Compile company profile into context string
 * AC: #2 - Company Context Alignment
 */
function compileCompanyContext(company: CompanyProfile | null): string {
  if (!company || !company.company_name) {
    return DEFAULT_COMPANY_CONTEXT;
  }

  const parts: string[] = [];

  // Company name and description
  if (company.business_description) {
    parts.push(`${company.company_name} - ${company.business_description}`);
  } else {
    parts.push(company.company_name);
  }

  return parts.join(". ");
}

/**
 * Compile tone settings into description string with vocabulary hints
 * AC 6.3: #3 - Tone of Voice Matching
 * AC 6.9: #1, #2, #3 - Include tone-specific vocabulary hints
 * AC 6.9: #4 - Custom description takes precedence
 *
 * Format: "Tom [Label]. [Vocabulary Hint]. [Custom Description if any]"
 */
function compileToneDescription(tone: ToneOfVoice | null): string {
  if (!tone) {
    return DEFAULT_TONE_DESCRIPTION;
  }

  const presetLabel = TONE_PRESET_LABELS[tone.preset] || tone.preset;
  const presetHint = TONE_PRESET_HINTS[tone.preset] || "";

  const parts: string[] = [`Tom ${presetLabel}`];

  // Add vocabulary hint for the preset (Story 6.9 AC #1, #2, #3)
  if (presetHint) {
    parts.push(presetHint);
  }

  // Custom description takes precedence (Story 6.9 AC #4)
  if (tone.custom_description) {
    parts.push(tone.custom_description);
  }

  return parts.join(". ");
}

/**
 * Compile ICP definition into summary string
 */
function compileICPSummary(icp: ICPDefinition | null): string {
  if (!icp) {
    return "";
  }

  const parts: string[] = [];

  if (icp.industries.length > 0) {
    parts.push(`Foco em ${icp.industries.slice(0, 5).join(", ")}`);
  }

  if (icp.job_titles.length > 0) {
    parts.push(`Cargos: ${icp.job_titles.slice(0, 5).join(", ")}`);
  }

  return parts.join(" | ");
}

/**
 * Format email examples for prompt inclusion
 * AC: #4 - Email Examples Reference
 */
function formatEmailExamples(examples: EmailExample[]): string {
  if (examples.length === 0) {
    return "";
  }

  // Take most recent examples up to max limit
  const recentExamples = examples.slice(0, MAX_EXAMPLES_IN_PROMPT);

  return recentExamples
    .map((ex, idx) => {
      const lines = [`Exemplo ${idx + 1}:`, `Assunto: ${ex.subject}`, `Corpo: ${ex.body}`];
      if (ex.context) {
        lines.push(`Contexto: ${ex.context}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Compile product context into AI-friendly format
 * Story 6.5 AC: #3 - AI Uses Product Context
 *
 * When a product is selected, its details replace generic company product info
 */
function compileProductContext(product: Product | null): {
  name: string;
  description: string;
  features: string;
  differentials: string;
  targetAudience: string;
} {
  if (!product) {
    return {
      name: "",
      description: "",
      features: "",
      differentials: "",
      targetAudience: "",
    };
  }

  return {
    name: product.name,
    description: product.description,
    features: product.features || "",
    differentials: product.differentials || "",
    targetAudience: product.targetAudience || "",
  };
}

// ==============================================
// MAIN FUNCTION
// ==============================================

/**
 * Build AI context variables from knowledge base data
 * AC 6.3: #1 - Knowledge Base Context in AI Prompts
 * AC 6.3: #5 - Graceful Degradation (uses defaults when KB empty)
 * AC 6.5: #3 - AI Uses Product Context
 * AC 6.5: #4 - General Context Fallback
 *
 * @param kb - Knowledge base context (can be null/partial)
 * @param product - Optional product for campaign-specific context (Story 6.5)
 * @returns AI context variables for prompt interpolation
 *
 * @example
 * ```ts
 * // Without product (general context)
 * const variables = buildAIVariables(kb);
 *
 * // With product (campaign-specific context)
 * const variables = buildAIVariables(kb, product);
 * ```
 */
export function buildAIVariables(
  kb: KnowledgeBaseContext | null,
  product?: Product | null
): AIContextVariables {
  // Handle null context (AC: #5 - Graceful Degradation)
  const context = kb || {
    company: null,
    tone: null,
    icp: null,
    examples: [],
  };

  const { company, tone, icp, examples } = context;

  // Compile product context (Story 6.5 AC #3)
  const productContext = compileProductContext(product ?? null);

  // AC 6.5 #3: When product is selected, use product description as primary context
  // AC 6.5 #4: When no product, use company's general products_services
  const productsServices = product
    ? `${productContext.name}: ${productContext.description}`
    : company?.products_services || "";

  return {
    // Company context (AC: #2)
    company_context: compileCompanyContext(company),
    products_services: productsServices,
    competitive_advantages: company?.competitive_advantages || "",

    // Product context (Story 6.5 AC #3)
    product_name: productContext.name,
    product_description: productContext.description,
    product_features: productContext.features,
    product_differentials: productContext.differentials,
    product_target_audience: productContext.targetAudience,

    // Tone context (AC: #3)
    tone_description: compileToneDescription(tone),
    tone_style: tone?.preset || DEFAULT_TONE_STYLE,
    writing_guidelines: tone?.writing_guidelines || "",

    // ICP context
    icp_summary: compileICPSummary(icp),
    target_industries: icp?.industries.join(", ") || "",
    target_titles: icp?.job_titles.join(", ") || "",
    pain_points: icp?.pain_points || "",

    // Examples context (AC: #4)
    successful_examples: formatEmailExamples(examples),

    // Lead placeholders (Story 6.4 will provide real values)
    lead_name: "Nome",
    lead_title: "Cargo",
    lead_company: "Empresa",
    lead_industry: "Tecnologia",
    lead_location: "Brasil",

    // Email context
    email_objective: "Prospecção inicial para apresentar soluções",
    icebreaker: "",
  };
}

/**
 * Get default AI variables when KB is not configured
 * AC: #5 - Graceful Degradation
 */
export function getDefaultAIVariables(): AIContextVariables {
  return buildAIVariables(null);
}
