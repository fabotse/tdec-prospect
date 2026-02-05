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
import type { PromptKey } from "@/types/ai-prompt";
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
const PROMPT_KEY: PromptKey = "icebreaker_premium_generation";

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
const enrichIcebreakerSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead invalido"))
    .min(1, "Pelo menos um lead e necessario")
    .max(MAX_LEADS_PER_REQUEST, `Maximo de ${MAX_LEADS_PER_REQUEST} leads por requisicao`),
  regenerate: z.boolean().optional().default(false),
});

// AC #3: Response structure
interface EnrichIcebreakerResult {
  leadId: string;
  success: boolean;
  icebreaker?: string;
  error?: string;
  /** True if existing icebreaker was returned without regeneration */
  skipped?: boolean;
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
// HELPER: Process Single Lead
// ==============================================

async function processLeadIcebreaker(
  lead: LeadRow,
  apifyService: ApifyService,
  apifyKey: string,
  openaiKey: string,
  tenantId: string,
  regenerate: boolean,
  kbContext: IcebreakerKBContext
): Promise<EnrichIcebreakerResult> {
  const supabase = await createClient();

  // AC #6: Check if lead already has icebreaker
  if (lead.icebreaker && !regenerate) {
    return {
      leadId: lead.id,
      success: true,
      icebreaker: lead.icebreaker,
      skipped: true,
    };
  }

  // AC #2: Validate lead has linkedin_url
  if (!lead.linkedin_url) {
    return {
      leadId: lead.id,
      success: false,
      error: ERROR_MESSAGES.NO_LINKEDIN_URL,
    };
  }

  // AC #2: Call ApifyService.fetchLinkedInPosts()
  // Story 6.5.8: Track timing for usage logging
  const apifyStartTime = Date.now();
  let postsResult: FetchLinkedInPostsResult;
  try {
    postsResult = await apifyService.fetchLinkedInPosts(
      apifyKey,
      lead.linkedin_url,
      3 // Fetch 3 posts as per Dev Notes
    );
  } catch (error) {
    const durationMs = Date.now() - apifyStartTime;
    console.error(`[processLeadIcebreaker] Apify error for lead ${lead.id}:`, error);
    // Story 6.5.8: Log failed Apify call (non-blocking)
    logApifyFailure({
      tenantId,
      leadId: lead.id,
      errorMessage: error instanceof Error ? error.message : ERROR_MESSAGES.APIFY_ERROR,
      durationMs,
      metadata: { linkedinProfileUrl: lead.linkedin_url, postLimit: 3 },
    }).catch(() => {}); // Fire and forget
    return {
      leadId: lead.id,
      success: false,
      error: ERROR_MESSAGES.APIFY_ERROR,
    };
  }

  const apifyDurationMs = Date.now() - apifyStartTime;

  // Check Apify result
  if (!postsResult.success) {
    // Story 6.5.8: Log failed Apify call (non-blocking)
    logApifyFailure({
      tenantId,
      leadId: lead.id,
      errorMessage: postsResult.error || ERROR_MESSAGES.APIFY_ERROR,
      durationMs: apifyDurationMs,
      metadata: { linkedinProfileUrl: lead.linkedin_url, postLimit: 3 },
    }).catch(() => {}); // Fire and forget
    return {
      leadId: lead.id,
      success: false,
      error: postsResult.error || ERROR_MESSAGES.APIFY_ERROR,
    };
  }

  // AC #5: Handle empty posts
  if (postsResult.posts.length === 0) {
    // Story 6.5.8: Log with zero posts (partial success)
    logApifySuccess({
      tenantId,
      leadId: lead.id,
      postsFetched: 0,
      durationMs: apifyDurationMs,
      metadata: { linkedinProfileUrl: lead.linkedin_url, postLimit: 3, noPosts: true },
    }).catch(() => {}); // Fire and forget
    return {
      leadId: lead.id,
      success: false,
      error: ERROR_MESSAGES.NO_POSTS_FOUND,
    };
  }

  // Story 6.5.8: Log successful Apify call (non-blocking)
  logApifySuccess({
    tenantId,
    leadId: lead.id,
    postsFetched: postsResult.posts.length,
    durationMs: apifyDurationMs,
    metadata: {
      linkedinProfileUrl: lead.linkedin_url,
      postLimit: 3,
      deepScrape: true,
    },
  }).catch(() => {}); // Fire and forget

  // AC #2: Build variables for prompt (with KB context)
  const variables = buildIcebreakerVariables(lead, postsResult.posts, kbContext);

  // AC #2: Get rendered prompt
  const renderedPrompt = await promptManager.renderPrompt(PROMPT_KEY, variables, {
    tenantId,
  });

  if (!renderedPrompt) {
    return {
      leadId: lead.id,
      success: false,
      error: ERROR_MESSAGES.PROMPT_NOT_FOUND,
    };
  }

  // AC #2: Call AI to generate icebreaker
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
    console.error(`[processLeadIcebreaker] AI error for lead ${lead.id}:`, error);
    return {
      leadId: lead.id,
      success: false,
      error: ERROR_MESSAGES.AI_ERROR,
    };
  }

  // AC #2: Save results to lead record
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
    console.error(`[processLeadIcebreaker] Update error for lead ${lead.id}:`, updateError);
    return {
      leadId: lead.id,
      success: false,
      error: ERROR_MESSAGES.DB_UPDATE_ERROR,
    };
  }

  return {
    leadId: lead.id,
    success: true,
    icebreaker,
  };
}

// ==============================================
// HELPER: Process Leads in Batches - AC #4
// ==============================================

async function processLeadsInBatches(
  leads: LeadRow[],
  apifyService: ApifyService,
  apifyKey: string,
  openaiKey: string,
  tenantId: string,
  regenerate: boolean,
  kbContext: IcebreakerKBContext
): Promise<EnrichIcebreakerResult[]> {
  const results: EnrichIcebreakerResult[] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((lead) =>
        processLeadIcebreaker(lead, apifyService, apifyKey, openaiKey, tenantId, regenerate, kbContext)
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

  const { leadIds, regenerate } = validation.data;

  // Get API keys
  const [apifyKey, openaiKey] = await Promise.all([
    getApiKey(tenantId, "apify"),
    getApiKey(tenantId, "openai"),
  ]);

  if (!apifyKey) {
    return NextResponse.json(
      { error: { code: "API_KEY_ERROR", message: ERROR_MESSAGES.APIFY_NOT_CONFIGURED } },
      { status: 400 }
    );
  }

  if (!openaiKey) {
    return NextResponse.json(
      { error: { code: "API_KEY_ERROR", message: ERROR_MESSAGES.OPENAI_NOT_CONFIGURED } },
      { status: 400 }
    );
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
    kbContext
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
