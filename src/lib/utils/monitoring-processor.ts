/**
 * Monitoring Processor
 * Story: 13.9 - Verificação Inicial ao Ativar Monitoramento
 *
 * Shared module for processing monitored leads.
 * Extracted from process-batch/route.ts to be reusable by both
 * the cron endpoint (service role) and initial-scan endpoint (user session).
 *
 * The Supabase client is parameterized — works with both service role and user session.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApifyService } from "@/lib/services/apify";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { calculateApifyCost } from "@/types/api-usage";
import type { LogApiUsageParams } from "@/types/api-usage";
import {
  detectNewPosts,
} from "@/lib/utils/monitoring-utils";
import {
  classifyPostRelevance,
  calculateClassificationCost,
} from "@/lib/utils/relevance-classifier";
import type { KBContextForClassification } from "@/lib/utils/relevance-classifier";
import {
  generateApproachSuggestion,
  calculateSuggestionCost,
} from "@/lib/utils/approach-suggestion";
import type {
  LeadContextForSuggestion,
  KBContextForSuggestion,
} from "@/lib/utils/approach-suggestion";
import type { LinkedInPostsCache } from "@/types/lead";
import type { CompanyProfile, ICPDefinition, ToneOfVoice } from "@/types/knowledge-base";

// ==============================================
// CONSTANTS
// ==============================================

export const BATCH_SIZE = 5;

// ==============================================
// DEV LOGGING (only in development)
// ==============================================

const IS_DEV = process.env.NODE_ENV === "development";

function devLog(...args: unknown[]): void {
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.log("[monitoring]", ...args);
  }
}

// ==============================================
// TYPES
// ==============================================

export interface ToneContext {
  toneDescription: string;
  toneStyle: string;
}

export interface ProcessLeadInput {
  id: string;
  linkedin_url: string | null;
  linkedin_posts_cache: LinkedInPostsCache | null;
  first_name: string;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  industry: string | null;
}

export interface PostClassificationDetail {
  postUrl: string;
  isRelevant: boolean;
  reasoning: string;
  suggestionGenerated: boolean;
}

export interface ProcessLeadResult {
  leadId: string;
  success: boolean;
  newPostsFound: number;
  postsFiltered: number;
  suggestionsGenerated: number;
  error?: string;
  // Dev details for pipeline visibility
  totalPostsFetched?: number;
  leadName?: string;
  postDetails?: PostClassificationDetail[];
}

// ==============================================
// HELPER: Log API Usage
// ==============================================

export async function logMonitoringUsage(
  supabase: SupabaseClient,
  params: LogApiUsageParams
): Promise<void> {
  try {
    let estimatedCost = params.estimatedCost;
    if (
      params.serviceName === "apify" &&
      params.postsFetched !== undefined &&
      estimatedCost === undefined
    ) {
      estimatedCost = calculateApifyCost(params.postsFetched);
    }

    await supabase.from("api_usage_logs").insert({
      tenant_id: params.tenantId,
      service_name: params.serviceName,
      request_type: params.requestType,
      external_request_id: params.externalRequestId ?? null,
      lead_id: params.leadId ?? null,
      posts_fetched: params.postsFetched ?? null,
      estimated_cost: estimatedCost ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
      raw_response: params.rawResponse ?? null,
      metadata: params.metadata ?? {},
      duration_ms: params.durationMs ?? null,
    });
  } catch {
    // Logging should never break the main flow
  }
}

// ==============================================
// HELPER: Get API Key for Tenant (by service name)
// ==============================================

export async function getApiKey(
  supabase: SupabaseClient,
  tenantId: string,
  serviceName: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("service_name", serviceName)
    .single();

  if (error || !data) return null;

  try {
    return decryptApiKey(data.encrypted_key);
  } catch {
    return null;
  }
}

// ==============================================
// HELPER: Load Tone Context for Suggestion (Story 13.5)
// ==============================================

export async function loadToneContext(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ToneContext> {
  const { data: toneRecord } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", "tone")
    .single();

  const tone = toneRecord?.content as ToneOfVoice | null;
  if (!tone) {
    return { toneDescription: "", toneStyle: "casual" };
  }

  const parts: string[] = [];
  if (tone.preset) parts.push(`Estilo: ${tone.preset}`);
  if (tone.custom_description) parts.push(tone.custom_description);
  if (tone.writing_guidelines) parts.push(`Diretrizes: ${tone.writing_guidelines}`);

  return {
    toneDescription: parts.join(". ") || "",
    toneStyle: tone.preset || "casual",
  };
}

// ==============================================
// HELPER: Load KB Context for Classification (Story 13.4)
// ==============================================

export async function loadKBContext(
  supabase: SupabaseClient,
  tenantId: string
): Promise<KBContextForClassification | null> {
  const { data: companyRecord } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", "company")
    .single();

  const company = companyRecord?.content as CompanyProfile | null;
  if (!company || !company.business_description) return null;

  const { data: icpRecord } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", "icp")
    .single();

  const icp = icpRecord?.content as ICPDefinition | null;

  // Build ICP summary from available fields
  const icpParts: string[] = [];
  if (icp?.job_titles?.length) icpParts.push(`Cargos: ${icp.job_titles.join(", ")}`);
  if (icp?.industries?.length) icpParts.push(`Setores: ${icp.industries.join(", ")}`);
  if (icp?.pain_points) icpParts.push(`Dores: ${icp.pain_points}`);

  return {
    companyContext: company.business_description,
    productsServices: company.products_services || "",
    competitiveAdvantages: company.competitive_advantages || "",
    icpSummary: icpParts.join(". ") || "",
  };
}

// ==============================================
// CORE: Process Single Lead
// ==============================================

export async function processLead(
  lead: ProcessLeadInput,
  apifyKey: string,
  apifyService: ApifyService,
  supabase: SupabaseClient,
  tenantId: string,
  openaiKey: string | null,
  kbContext: KBContextForClassification | null,
  toneContext: ToneContext
): Promise<ProcessLeadResult> {
  const startTime = Date.now();
  const leadName = `${lead.first_name}${lead.last_name ? ` ${lead.last_name}` : ""}`;
  const postDetails: PostClassificationDetail[] = [];

  devLog(`━━━ Processando lead: ${leadName} (${lead.id}) ━━━`);
  devLog(`LinkedIn: ${lead.linkedin_url || "N/A"}`);

  // Skip leads without linkedin_url
  if (!lead.linkedin_url) {
    await logMonitoringUsage(supabase, {
      tenantId,
      serviceName: "apify",
      requestType: "monitoring_posts_fetch",
      leadId: lead.id,
      status: "failed",
      errorMessage: "Lead sem linkedin_url",
      durationMs: Date.now() - startTime,
      metadata: { source: "monitoring" },
    });
    return { leadId: lead.id, success: false, newPostsFound: 0, postsFiltered: 0, suggestionsGenerated: 0, error: "Lead sem linkedin_url" };
  }

  const result = await apifyService.fetchLinkedInPosts(apifyKey, lead.linkedin_url, 3);

  if (!result.success) {
    devLog(`✗ Falha ao buscar posts: ${result.error}`);
    await logMonitoringUsage(supabase, {
      tenantId,
      serviceName: "apify",
      requestType: "monitoring_posts_fetch",
      leadId: lead.id,
      status: "failed",
      errorMessage: result.error,
      durationMs: Date.now() - startTime,
      metadata: { source: "monitoring" },
    });
    return { leadId: lead.id, success: false, newPostsFound: 0, postsFiltered: 0, suggestionsGenerated: 0, error: result.error, leadName };
  }

  devLog(`Posts buscados: ${result.posts.length}`);

  // Detect new posts
  const cachedPosts = lead.linkedin_posts_cache?.posts ?? [];
  const newPosts = detectNewPosts(cachedPosts, result.posts);

  // Update cache
  const updatedCache: LinkedInPostsCache = {
    posts: result.posts,
    fetchedAt: result.fetchedAt,
    profileUrl: result.profileUrl,
  };

  const { error: cacheUpdateError } = await supabase
    .from("leads")
    .update({
      linkedin_posts_cache: updatedCache,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (cacheUpdateError) {
    devLog(`✗ Erro ao atualizar cache: ${cacheUpdateError.message}`);
  }

  devLog(`Posts novos detectados: ${newPosts.length} (cache anterior: ${cachedPosts.length} posts)`);

  // Classify new posts for relevance (Story 13.4) + generate suggestions (Story 13.5)
  let postsFiltered = 0;
  let suggestionsGenerated = 0;
  if (newPosts.length > 0) {
    const relevantInsights: Array<{
      tenant_id: string;
      lead_id: string;
      post_url: string;
      post_text: string;
      post_published_at: string | null;
      relevance_reasoning: string;
      suggestion: string | null;
      status: "new";
    }> = [];

    for (const post of newPosts) {
      const classification = await classifyPostRelevance(
        post.text,
        post.postUrl,
        kbContext,
        openaiKey,
        supabase,
        tenantId
      );

      devLog(`┣ Post: ${post.postUrl}`);
      devLog(`┃ Texto: ${post.text.substring(0, 100)}${post.text.length > 100 ? "..." : ""}`);
      devLog(`┃ Classificação: ${classification.isRelevant ? "RELEVANTE ✓" : "NÃO RELEVANTE ✗"}`);
      devLog(`┃ Motivo: ${classification.reasoning}`);

      if (classification.isRelevant) {
        // Generate approach suggestion (Story 13.5)
        let suggestion: string | null = null;
        let suggestionTokens = { promptTokens: 0, completionTokens: 0 };

        // Only generate suggestion if we have openaiKey AND kbContext (classification used AI)
        if (openaiKey && kbContext) {
          const leadContext: LeadContextForSuggestion = {
            leadName: `${lead.first_name}${lead.last_name ? ` ${lead.last_name}` : ""}`,
            leadTitle: lead.title || "",
            leadCompany: lead.company_name || "",
            leadIndustry: lead.industry || "",
          };

          const suggestionKBContext: KBContextForSuggestion = {
            ...kbContext,
            toneDescription: toneContext.toneDescription,
            toneStyle: toneContext.toneStyle,
          };

          const suggestionResult = await generateApproachSuggestion(
            post.text,
            post.postUrl,
            leadContext,
            suggestionKBContext,
            openaiKey,
            supabase,
            tenantId
          );

          suggestion = suggestionResult.suggestion;
          suggestionTokens = {
            promptTokens: suggestionResult.promptTokens,
            completionTokens: suggestionResult.completionTokens,
          };

          // Log suggestion cost/failure (AC #7)
          if (suggestionTokens.promptTokens > 0 || suggestionTokens.completionTokens > 0) {
            await logMonitoringUsage(supabase, {
              tenantId,
              serviceName: "openai",
              requestType: "monitoring_approach_suggestion",
              leadId: lead.id,
              estimatedCost: calculateSuggestionCost(
                suggestionTokens.promptTokens,
                suggestionTokens.completionTokens
              ),
              status: suggestion !== null ? "success" : "failed",
              errorMessage: suggestionResult.error,
              metadata: {
                source: "monitoring",
                postUrl: post.postUrl,
                hasSuggestion: suggestion !== null,
              },
            });
          } else if (suggestionResult.error) {
            // Log failure even without tokens (timeout, HTTP error)
            await logMonitoringUsage(supabase, {
              tenantId,
              serviceName: "openai",
              requestType: "monitoring_approach_suggestion",
              leadId: lead.id,
              estimatedCost: 0,
              status: "failed",
              errorMessage: suggestionResult.error,
              metadata: {
                source: "monitoring",
                postUrl: post.postUrl,
                hasSuggestion: false,
              },
            });
          }

          devLog(`┃ Sugestão: ${suggestion ? "Gerada ✓" : "Não gerada ✗"}`);
          if (suggestion) suggestionsGenerated++;
        }

        postDetails.push({
          postUrl: post.postUrl,
          isRelevant: true,
          reasoning: classification.reasoning,
          suggestionGenerated: suggestion !== null,
        });

        relevantInsights.push({
          tenant_id: tenantId,
          lead_id: lead.id,
          post_url: post.postUrl,
          post_text: post.text,
          post_published_at: post.publishedAt || null,
          relevance_reasoning: classification.reasoning,
          suggestion,
          status: "new" as const,
        });
      } else {
        postsFiltered++;
        postDetails.push({
          postUrl: post.postUrl,
          isRelevant: false,
          reasoning: classification.reasoning,
          suggestionGenerated: false,
        });
      }

      // Log classification cost (AC #10)
      if (classification.promptTokens > 0 || classification.completionTokens > 0) {
        await logMonitoringUsage(supabase, {
          tenantId,
          serviceName: "openai",
          requestType: "monitoring_relevance_filter",
          leadId: lead.id,
          estimatedCost: calculateClassificationCost(
            classification.promptTokens,
            classification.completionTokens
          ),
          status: "success",
          metadata: {
            source: "monitoring",
            isRelevant: classification.isRelevant,
            promptTokens: classification.promptTokens,
            completionTokens: classification.completionTokens,
            postUrl: post.postUrl,
          },
        });
      }
    }

    if (relevantInsights.length > 0) {
      const { error: insightsError } = await supabase.from("lead_insights").insert(relevantInsights);
      if (insightsError) {
        devLog(`✗ Erro ao inserir insights: ${insightsError.message}`);
      }
    }
  }

  // Log Apify usage (AC #8 from 13.3)
  await logMonitoringUsage(supabase, {
    tenantId,
    serviceName: "apify",
    requestType: "monitoring_posts_fetch",
    leadId: lead.id,
    postsFetched: result.posts.length,
    estimatedCost: calculateApifyCost(result.posts.length),
    status: "success",
    durationMs: Date.now() - startTime,
    metadata: {
      source: "monitoring",
      newPostsFound: newPosts.length,
      postsFiltered,
      linkedinUrl: lead.linkedin_url,
    },
  });

  devLog(`━━━ Lead concluído: ${newPosts.length} novos, ${postsFiltered} filtrados, ${suggestionsGenerated} insights ━━━\n`);

  return {
    leadId: lead.id,
    success: true,
    newPostsFound: newPosts.length,
    postsFiltered,
    suggestionsGenerated,
    leadName,
    totalPostsFetched: result.posts.length,
    postDetails,
  };
}
