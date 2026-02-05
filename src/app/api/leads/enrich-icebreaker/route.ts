/**
 * Icebreaker Enrichment API Route
 * Story: 6.5.5 - Icebreaker Enrichment API
 *
 * POST /api/leads/enrich-icebreaker
 * Generates premium icebreakers for leads using LinkedIn posts.
 *
 * AC #1: API Endpoint Structure (auth, validation, tenant isolation)
 * AC #2: Icebreaker Generation Flow
 * AC #3: Response Structure
 * AC #4: Parallel Processing with Rate Limiting
 * AC #5: Missing LinkedIn Posts Handling
 * AC #6: Regeneration Support
 * AC #7: Error Messages in Portuguese
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { ApifyService } from "@/lib/services/apify";
import { createAIProvider, promptManager } from "@/lib/ai";
import { logApifySuccess, logApifyFailure } from "@/lib/services/usage-logger";
import type { LeadRow, LinkedInPostsCache } from "@/types/lead";
import type { FetchLinkedInPostsResult, LinkedInPost } from "@/types/apify";
import type { PromptKey, IcebreakerCategory } from "@/types/ai-prompt";
import { ICEBREAKER_CATEGORY_INSTRUCTIONS } from "@/types/ai-prompt";
import type { AIModel } from "@/types/ai-provider";
import type { CompanyProfile, ToneOfVoice, KnowledgeBaseSection } from "@/types/knowledge-base";

// ==============================================
// KB CONTEXT TYPES
// ==============================================

interface IcebreakerKBContext {
  company: CompanyProfile | null;
  tone: ToneOfVoice | null;
}

// ==============================================
// CONSTANTS
// ==============================================

const BATCH_SIZE = 5; // AC #4: Max concurrent requests
const MAX_LEADS_PER_REQUEST = 50;

// ==============================================
// ERROR MESSAGES (Portuguese) - AC #7
// ==============================================

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Nao autenticado",
  TENANT_NOT_FOUND: "Tenant nao encontrado",
  VALIDATION_ERROR: "Dados invalidos",
  LEAD_NOT_FOUND: "Lead nao encontrado",
  NO_LINKEDIN_URL: "Lead sem LinkedIn URL",
  NO_POSTS_FOUND: "Nenhum post encontrado",
  APIFY_ERROR: "Erro ao buscar posts do LinkedIn",
  AI_ERROR: "Erro ao gerar icebreaker",
  DB_UPDATE_ERROR: "Erro ao salvar icebreaker no banco de dados",
  APIFY_NOT_CONFIGURED:
    "API key do Apify nao configurada. Configure em Configuracoes > Integracoes.",
  OPENAI_NOT_CONFIGURED:
    "API key do OpenAI nao configurada. Configure em Configuracoes > Integracoes.",
  PROMPT_NOT_FOUND: "Prompt de icebreaker nao encontrado",
  DECRYPT_ERROR: "Erro ao descriptografar API key",
} as const;

// ==============================================
// REQUEST/RESPONSE TYPES
// ==============================================

// AC #1: Zod validation schema
// Story 9.1: Added category field (optional, defaults to "empresa")
const enrichIcebreakerSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead invalido"))
    .min(1, "Pelo menos um lead e necessario")
    .max(MAX_LEADS_PER_REQUEST, `Maximo de ${MAX_LEADS_PER_REQUEST} leads por requisicao`),
  regenerate: z.boolean().optional().default(false),
  category: z.enum(["lead", "empresa", "cargo", "post"] as const).optional().default("empresa"),
});

// AC #3: Response structure
// Story 9.1: Added categoryFallback and originalCategory for Post→Lead fallback
interface EnrichIcebreakerResult {
  leadId: string;
  success: boolean;
  icebreaker?: string;
  error?: string;
  /** True if existing icebreaker was returned without regeneration */
  skipped?: boolean;
  /** Story 9.1: True if category was changed due to fallback (e.g., post→lead) */
  categoryFallback?: boolean;
  /** Story 9.1: Original category before fallback */
  originalCategory?: string;
}

interface EnrichIcebreakerResponse {
  success: boolean;
  results: EnrichIcebreakerResult[];
  summary: {
    total: number;
    generated: number;
    skipped: number;
    failed: number;
  };
}

// ==============================================
// HELPER: Get API Keys
// ==============================================

async function getApiKey(
  tenantId: string,
  serviceName: "openai" | "apify"
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("service_name", serviceName)
    .single();

  if (error || !data) {
    return null;
  }

  try {
    return decryptApiKey(data.encrypted_key);
  } catch {
    return null;
  }
}

// ==============================================
// HELPER: Fetch KB Context
// ==============================================

async function fetchKBSection<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  section: KnowledgeBaseSection
): Promise<T | null> {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", section)
    .single();

  if (error || !data) {
    return null;
  }

  return data.content as T;
}

async function fetchKBContext(tenantId: string): Promise<IcebreakerKBContext> {
  const supabase = await createClient();
  const [company, tone] = await Promise.all([
    fetchKBSection<CompanyProfile>(supabase, tenantId, "company"),
    fetchKBSection<ToneOfVoice>(supabase, tenantId, "tone"),
  ]);

  return { company, tone };
}

// ==============================================
// HELPER: Format LinkedIn Posts for Prompt
// ==============================================

function formatLinkedInPostsForPrompt(posts: LinkedInPost[]): string {
  if (posts.length === 0) {
    return "Nenhum post disponivel";
  }

  return posts
    .map((post, idx) => {
      const date = post.publishedAt
        ? new Date(post.publishedAt).toLocaleDateString("pt-BR")
        : "Data desconhecida";
      return `Post ${idx + 1} (${date}):\n${post.text}\nEngajamento: ${post.likesCount} curtidas, ${post.commentsCount} comentarios`;
    })
    .join("\n\n");
}

// ==============================================
// HELPER: Build Icebreaker Variables
// ==============================================

// Default KB values (graceful degradation when KB not configured)
const DEFAULT_COMPANY_CONTEXT = "Empresa de tecnologia B2B";
const DEFAULT_TONE_DESCRIPTION = "Profissional e amigavel";
const DEFAULT_TONE_STYLE = "casual";

function compileCompanyContext(company: CompanyProfile | null): string {
  if (!company || !company.company_name) {
    return DEFAULT_COMPANY_CONTEXT;
  }
  return company.business_description
    ? `${company.company_name} - ${company.business_description}`
    : company.company_name;
}

function compileToneDescription(tone: ToneOfVoice | null): string {
  if (!tone) {
    return DEFAULT_TONE_DESCRIPTION;
  }
  const parts: string[] = [`Tom ${tone.preset}`];
  if (tone.custom_description) {
    parts.push(tone.custom_description);
  }
  return parts.join(". ");
}

function buildIcebreakerVariables(
  lead: LeadRow,
  posts: LinkedInPost[],
  kbContext: IcebreakerKBContext
): Record<string, string> {
  return {
    // Lead context (camelCase as per prompt in 6.5.3)
    firstName: lead.first_name,
    lastName: lead.last_name || "",
    title: lead.title || "",
    companyName: lead.company_name || "",
    industry: lead.industry || "",

    // LinkedIn posts (formatted for prompt)
    linkedinPosts: formatLinkedInPostsForPrompt(posts),

    // Company context from KB (with graceful degradation)
    companyContext: compileCompanyContext(kbContext.company),
    toneDescription: compileToneDescription(kbContext.tone),
    toneStyle: kbContext.tone?.preset || DEFAULT_TONE_STYLE,

    // Product context (optional, empty by default)
    productName: "",
    productDescription: "",
  };
}

// ==============================================
// HELPER: Build Standard Icebreaker Variables (Story 9.1)
// ==============================================

/**
 * Build variables for `icebreaker_generation` prompt (snake_case).
 * Used for Lead, Empresa, Cargo categories.
 * Story 9.1: AC #2 - Category-specific instructions injected via {{category_instructions}}.
 */
function buildStandardIcebreakerVariables(
  lead: LeadRow,
  kbContext: IcebreakerKBContext,
  category: IcebreakerCategory
): Record<string, string> {
  return {
    lead_name: `${lead.first_name} ${lead.last_name || ""}`.trim(),
    lead_title: lead.title || "",
    lead_company: lead.company_name || "",
    lead_industry: lead.industry || "",
    lead_location: "",
    company_context: compileCompanyContext(kbContext.company),
    competitive_advantages: kbContext.company?.competitive_advantages || "",
    tone_description: compileToneDescription(kbContext.tone),
    tone_style: kbContext.tone?.preset || DEFAULT_TONE_STYLE,
    writing_guidelines: kbContext.tone?.custom_description || "",
    product_name: "",
    product_description: "",
    product_differentials: "",
    product_target_audience: "",
    products_services: "",
    successful_examples: "",
    category_instructions: ICEBREAKER_CATEGORY_INSTRUCTIONS[category],
  };
}

// ==============================================
// HELPER: Process Single Lead
// ==============================================

/**
 * Story 9.1: Processes a lead for icebreaker generation based on category.
 * - Lead/Empresa/Cargo: Uses `icebreaker_generation` with category_instructions (no Apify).
 * - Post/LinkedIn: Uses `icebreaker_premium_generation` with Apify posts.
 *   Falls back to Lead category if posts unavailable.
 */
async function processLeadIcebreaker(
  lead: LeadRow,
  apifyService: ApifyService,
  apifyKey: string | null,
  openaiKey: string,
  tenantId: string,
  regenerate: boolean,
  kbContext: IcebreakerKBContext,
  category: IcebreakerCategory
): Promise<EnrichIcebreakerResult> {
  // AC #6: Check if lead already has icebreaker
  if (lead.icebreaker && !regenerate) {
    return {
      leadId: lead.id,
      success: true,
      icebreaker: lead.icebreaker,
      skipped: true,
    };
  }

  // Story 9.1: Route based on category
  if (category === "post") {
    return processPostCategory(lead, apifyService, apifyKey, openaiKey, tenantId, kbContext);
  }

  // Lead/Empresa/Cargo: Standard generation (no Apify needed)
  return processStandardCategory(lead, openaiKey, tenantId, kbContext, category);
}

/**
 * Story 9.1: Standard category processing (Lead, Empresa, Cargo).
 * Uses `icebreaker_generation` prompt with category_instructions variable.
 */
async function processStandardCategory(
  lead: LeadRow,
  openaiKey: string,
  tenantId: string,
  kbContext: IcebreakerKBContext,
  category: IcebreakerCategory
): Promise<EnrichIcebreakerResult> {
  const supabase = await createClient();

  const variables = buildStandardIcebreakerVariables(lead, kbContext, category);

  const promptKey: PromptKey = "icebreaker_generation";
  const renderedPrompt = await promptManager.renderPrompt(promptKey, variables, { tenantId });

  if (!renderedPrompt) {
    return { leadId: lead.id, success: false, error: ERROR_MESSAGES.PROMPT_NOT_FOUND };
  }

  let icebreaker: string;
  try {
    const provider = createAIProvider("openai", openaiKey);
    const result = await provider.generateText(renderedPrompt.content, {
      temperature: renderedPrompt.metadata.temperature,
      maxTokens: renderedPrompt.metadata.maxTokens,
      model: (renderedPrompt.modelPreference as AIModel) ?? undefined,
    });
    icebreaker = result.text.trim().replace(/^[""]|[""]$/g, "");
  } catch (error) {
    console.error(`[processStandardCategory] AI error for lead ${lead.id}:`, error);
    return { leadId: lead.id, success: false, error: ERROR_MESSAGES.AI_ERROR };
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      icebreaker,
      icebreaker_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (updateError) {
    console.error(`[processStandardCategory] Update error for lead ${lead.id}:`, updateError);
    return { leadId: lead.id, success: false, error: ERROR_MESSAGES.DB_UPDATE_ERROR };
  }

  return { leadId: lead.id, success: true, icebreaker };
}

/**
 * Story 9.1 AC #3: Post/LinkedIn category processing.
 * Uses `icebreaker_premium_generation` prompt with Apify LinkedIn posts.
 * Falls back to Lead category if linkedin_url missing or no posts found.
 */
async function processPostCategory(
  lead: LeadRow,
  apifyService: ApifyService,
  apifyKey: string | null,
  openaiKey: string,
  tenantId: string,
  kbContext: IcebreakerKBContext
): Promise<EnrichIcebreakerResult> {
  const supabase = await createClient();

  // Story 9.1 AC #3: Check if lead has linkedin_url; fallback to Lead if not
  if (!lead.linkedin_url || !apifyKey) {
    const fallbackResult = await processStandardCategory(lead, openaiKey, tenantId, kbContext, "lead");
    return { ...fallbackResult, categoryFallback: true, originalCategory: "post" };
  }

  // Fetch LinkedIn posts via Apify
  const apifyStartTime = Date.now();
  let postsResult: FetchLinkedInPostsResult;
  try {
    postsResult = await apifyService.fetchLinkedInPosts(apifyKey, lead.linkedin_url, 3);
  } catch (error) {
    const durationMs = Date.now() - apifyStartTime;
    console.error(`[processPostCategory] Apify error for lead ${lead.id}:`, error);
    logApifyFailure({
      tenantId,
      leadId: lead.id,
      errorMessage: error instanceof Error ? error.message : ERROR_MESSAGES.APIFY_ERROR,
      durationMs,
      metadata: { linkedinProfileUrl: lead.linkedin_url, postLimit: 3 },
    }).catch(() => {});
    // Story 9.1 AC #3: Apify error → fallback to Lead
    const fallbackResult = await processStandardCategory(lead, openaiKey, tenantId, kbContext, "lead");
    return { ...fallbackResult, categoryFallback: true, originalCategory: "post" };
  }

  const apifyDurationMs = Date.now() - apifyStartTime;

  if (!postsResult.success || postsResult.posts.length === 0) {
    // Log Apify result
    if (!postsResult.success) {
      logApifyFailure({
        tenantId,
        leadId: lead.id,
        errorMessage: postsResult.error || ERROR_MESSAGES.APIFY_ERROR,
        durationMs: apifyDurationMs,
        metadata: { linkedinProfileUrl: lead.linkedin_url, postLimit: 3 },
      }).catch(() => {});
    } else {
      logApifySuccess({
        tenantId,
        leadId: lead.id,
        postsFetched: 0,
        durationMs: apifyDurationMs,
        metadata: { linkedinProfileUrl: lead.linkedin_url, postLimit: 3, noPosts: true },
      }).catch(() => {});
    }
    // Story 9.1 AC #3: No posts → fallback to Lead
    const fallbackResult = await processStandardCategory(lead, openaiKey, tenantId, kbContext, "lead");
    return { ...fallbackResult, categoryFallback: true, originalCategory: "post" };
  }

  // Log successful Apify call
  logApifySuccess({
    tenantId,
    leadId: lead.id,
    postsFetched: postsResult.posts.length,
    durationMs: apifyDurationMs,
    metadata: { linkedinProfileUrl: lead.linkedin_url, postLimit: 3, deepScrape: true },
  }).catch(() => {});

  // Build premium variables (camelCase) and use icebreaker_premium_generation
  const variables = buildIcebreakerVariables(lead, postsResult.posts, kbContext);
  const promptKey: PromptKey = "icebreaker_premium_generation";
  const renderedPrompt = await promptManager.renderPrompt(promptKey, variables, { tenantId });

  if (!renderedPrompt) {
    return { leadId: lead.id, success: false, error: ERROR_MESSAGES.PROMPT_NOT_FOUND };
  }

  let icebreaker: string;
  try {
    const provider = createAIProvider("openai", openaiKey);
    const result = await provider.generateText(renderedPrompt.content, {
      temperature: renderedPrompt.metadata.temperature,
      maxTokens: renderedPrompt.metadata.maxTokens,
      model: (renderedPrompt.modelPreference as AIModel) ?? undefined,
    });
    icebreaker = result.text.trim().replace(/^[""]|[""]$/g, "");
  } catch (error) {
    console.error(`[processPostCategory] AI error for lead ${lead.id}:`, error);
    return { leadId: lead.id, success: false, error: ERROR_MESSAGES.AI_ERROR };
  }

  // Save results with posts cache
  const linkedinPostsCache: LinkedInPostsCache = {
    posts: postsResult.posts,
    fetchedAt: postsResult.fetchedAt,
    profileUrl: postsResult.profileUrl,
  };

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      icebreaker,
      icebreaker_generated_at: new Date().toISOString(),
      linkedin_posts_cache: linkedinPostsCache,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (updateError) {
    console.error(`[processPostCategory] Update error for lead ${lead.id}:`, updateError);
    return { leadId: lead.id, success: false, error: ERROR_MESSAGES.DB_UPDATE_ERROR };
  }

  return { leadId: lead.id, success: true, icebreaker };
}

// ==============================================
// HELPER: Process Leads in Batches - AC #4
// ==============================================

async function processLeadsInBatches(
  leads: LeadRow[],
  apifyService: ApifyService,
  apifyKey: string | null,
  openaiKey: string,
  tenantId: string,
  regenerate: boolean,
  kbContext: IcebreakerKBContext,
  category: IcebreakerCategory
): Promise<EnrichIcebreakerResult[]> {
  const results: EnrichIcebreakerResult[] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((lead) =>
        processLeadIcebreaker(lead, apifyService, apifyKey, openaiKey, tenantId, regenerate, kbContext, category)
      )
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          leadId: batch[j].id,
          success: false,
          error: ERROR_MESSAGES.AI_ERROR,
        });
      }
    }
  }

  return results;
}

// ==============================================
// POST /api/leads/enrich-icebreaker
// ==============================================

export async function POST(request: NextRequest) {
  // AC #1: Authentication check
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: ERROR_MESSAGES.UNAUTHORIZED } },
      { status: 401 }
    );
  }

  const tenantId = profile.tenant_id;
  if (!tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: ERROR_MESSAGES.TENANT_NOT_FOUND } },
      { status: 403 }
    );
  }

  // AC #1: Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGES.VALIDATION_ERROR } },
      { status: 400 }
    );
  }

  const validation = enrichIcebreakerSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.issues[0]?.message || ERROR_MESSAGES.VALIDATION_ERROR,
        },
      },
      { status: 400 }
    );
  }

  const { leadIds, regenerate, category } = validation.data;

  // Story 9.1: Get API keys (Apify only required for "post" category)
  const openaiKey = await getApiKey(tenantId, "openai");
  if (!openaiKey) {
    return NextResponse.json(
      { error: { code: "API_KEY_ERROR", message: ERROR_MESSAGES.OPENAI_NOT_CONFIGURED } },
      { status: 400 }
    );
  }

  let apifyKey: string | null = null;
  if (category === "post") {
    apifyKey = await getApiKey(tenantId, "apify");
    // Note: Apify key missing doesn't block — processPostCategory will fallback to Lead
  }

  // AC #1: Fetch leads with tenant isolation
  const supabase = await createClient();
  const { data: leads, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .in("id", leadIds)
    .eq("tenant_id", tenantId);

  if (fetchError) {
    console.error("[POST /api/leads/enrich-icebreaker] Fetch error:", fetchError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGES.LEAD_NOT_FOUND } },
      { status: 500 }
    );
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: ERROR_MESSAGES.LEAD_NOT_FOUND } },
      { status: 404 }
    );
  }

  // Fetch KB context for personalized tone and company context
  const kbContext = await fetchKBContext(tenantId);

  // AC #4: Process leads in parallel batches
  const apifyService = new ApifyService();
  const results = await processLeadsInBatches(
    leads as LeadRow[],
    apifyService,
    apifyKey,
    openaiKey,
    tenantId,
    regenerate,
    kbContext,
    category
  );

  // AC #3: Build response with summary
  const summary = {
    total: leadIds.length,
    generated: results.filter((r) => r.success && r.icebreaker && !r.skipped).length,
    skipped: results.filter((r) => r.skipped === true).length,
    failed: results.filter((r) => !r.success).length,
  };

  const response: EnrichIcebreakerResponse = {
    success: summary.failed < summary.total,
    results,
    summary,
  };

  return NextResponse.json(response);
}
