/**
 * API Route: POST /api/monitoring/process-batch
 * Story: 13.3 - Edge Function de Verificação Semanal
 *
 * Processes a batch of monitored leads for new LinkedIn posts.
 * Called by pg_cron via Edge Function every 5 minutes.
 *
 * Auth: Bearer token (MONITORING_CRON_SECRET), NOT user session.
 * Uses service role key for multi-tenant access without RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApifyService } from "@/lib/services/apify";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { calculateApifyCost } from "@/types/api-usage";
import type { LogApiUsageParams } from "@/types/api-usage";
import {
  detectNewPosts,
  calculateNextRunAt,
} from "@/lib/utils/monitoring-utils";
import type { MonitoringBatchResult } from "@/lib/utils/monitoring-utils";
import {
  classifyPostRelevance,
  calculateClassificationCost,
} from "@/lib/utils/relevance-classifier";
import type { KBContextForClassification } from "@/lib/utils/relevance-classifier";
import type { LinkedInPostsCache } from "@/types/lead";
import type { MonitoringConfigRow } from "@/types/monitoring";

// ==============================================
// CONSTANTS
// ==============================================

const BATCH_SIZE = 5;

// ==============================================
// HELPER: Log API Usage (service-role client, no cookies)
// ==============================================

async function logMonitoringUsage(
  supabase: ReturnType<typeof createClient>,
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

async function getApiKey(
  supabase: ReturnType<typeof createClient>,
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
// HELPER: Load KB Context for Classification (Story 13.4)
// ==============================================

async function loadKBContext(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<KBContextForClassification | null> {
  const { data: company } = await supabase
    .from("company_profiles")
    .select("description, products_services, competitive_advantages")
    .eq("tenant_id", tenantId)
    .single();

  if (!company || !company.description) return null;

  const { data: icp } = await supabase
    .from("icp_definitions")
    .select("summary")
    .eq("tenant_id", tenantId)
    .single();

  return {
    companyContext: company.description || "",
    productsServices: company.products_services || "",
    competitiveAdvantages: company.competitive_advantages || "",
    icpSummary: icp?.summary || "",
  };
}

// ==============================================
// HELPER: Process Single Lead
// ==============================================

async function processLead(
  lead: {
    id: string;
    linkedin_url: string | null;
    linkedin_posts_cache: LinkedInPostsCache | null;
  },
  apifyKey: string,
  apifyService: ApifyService,
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  openaiKey: string | null,
  kbContext: KBContextForClassification | null
): Promise<{ leadId: string; success: boolean; newPostsFound: number; postsFiltered: number; error?: string }> {
  const startTime = Date.now();

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
    return { leadId: lead.id, success: false, newPostsFound: 0, postsFiltered: 0, error: "Lead sem linkedin_url" };
  }

  const result = await apifyService.fetchLinkedInPosts(apifyKey, lead.linkedin_url, 3);

  if (!result.success) {
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
    return { leadId: lead.id, success: false, newPostsFound: 0, postsFiltered: 0, error: result.error };
  }

  // Detect new posts
  const cachedPosts = lead.linkedin_posts_cache?.posts ?? [];
  const newPosts = detectNewPosts(cachedPosts, result.posts);

  // Update cache
  const updatedCache: LinkedInPostsCache = {
    posts: result.posts,
    fetchedAt: result.fetchedAt,
    profileUrl: result.profileUrl,
  };

  await supabase
    .from("leads")
    .update({
      linkedin_posts_cache: updatedCache,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  // Classify new posts for relevance (Story 13.4)
  let postsFiltered = 0;
  if (newPosts.length > 0) {
    const relevantInsights: Array<{
      tenant_id: string;
      lead_id: string;
      post_url: string;
      post_text: string;
      post_published_at: string | null;
      relevance_reasoning: string;
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

      if (classification.isRelevant) {
        relevantInsights.push({
          tenant_id: tenantId,
          lead_id: lead.id,
          post_url: post.postUrl,
          post_text: post.text,
          post_published_at: post.publishedAt || null,
          relevance_reasoning: classification.reasoning,
          status: "new" as const,
        });
      } else {
        postsFiltered++;
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
      await supabase.from("lead_insights").insert(relevantInsights);
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

  return { leadId: lead.id, success: true, newPostsFound: newPosts.length, postsFiltered };
}

// ==============================================
// POST HANDLER
// ==============================================

export async function POST(req: NextRequest) {
  // AC: Auth validation — cron secret (read at request time for testability)
  const monitoringSecret = process.env.MONITORING_CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${monitoringSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const apifyService = new ApifyService();

    // Find config: running (resume) OR idle with next_run_at <= now
    const { data: configs } = await supabase
      .from("monitoring_configs")
      .select("*")
      .or(
        `run_status.eq.running,and(run_status.eq.idle,next_run_at.lte.${new Date().toISOString()})`
      )
      .limit(1);

    let config: MonitoringConfigRow | null =
      configs && configs.length > 0
        ? (configs[0] as MonitoringConfigRow)
        : null;

    // No config found — check if there are monitored leads needing a default config
    if (!config) {
      const { count } = await supabase
        .from("leads")
        .select("tenant_id", { count: "exact", head: true })
        .eq("is_monitored", true)
        .limit(1);

      if (count && count > 0) {
        // Get tenant_id from a monitored lead
        const { data: monitoredLead } = await supabase
          .from("leads")
          .select("tenant_id")
          .eq("is_monitored", true)
          .limit(1)
          .single();

        if (monitoredLead) {
          // Create default config for this tenant
          const { data: newConfig } = await supabase
            .from("monitoring_configs")
            .insert({
              tenant_id: monitoredLead.tenant_id,
              frequency: "weekly",
              max_monitored_leads: 100,
              next_run_at: new Date().toISOString(),
              run_status: "idle",
              run_cursor: null,
            })
            .select("*")
            .single();

          config = newConfig as MonitoringConfigRow | null;
        }
      }

      if (!config) {
        const result: MonitoringBatchResult = {
          status: "no_config",
          leadsProcessed: 0,
          newPostsFound: 0,
          postsFiltered: 0,
          cursor: null,
          errors: [],
        };
        return NextResponse.json(result);
      }
    }

    // If idle and next_run_at <= now → start new run
    if (config.run_status === "idle") {
      const nextRunAt = config.next_run_at
        ? new Date(config.next_run_at)
        : new Date(0);
      if (nextRunAt > new Date()) {
        const result: MonitoringBatchResult = {
          status: "no_run_due",
          leadsProcessed: 0,
          newPostsFound: 0,
          postsFiltered: 0,
          cursor: null,
          errors: [],
        };
        return NextResponse.json(result);
      }

      // Start run (note: no row-level lock — pg_cron 5min interval makes races unlikely)
      await supabase
        .from("monitoring_configs")
        .update({
          run_status: "running",
          run_cursor: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      config.run_status = "running";
      config.run_cursor = null;
    }

    // Fetch batch of leads
    let query = supabase
      .from("leads")
      .select("id, linkedin_url, linkedin_posts_cache, tenant_id")
      .eq("tenant_id", config.tenant_id)
      .eq("is_monitored", true)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (config.run_cursor) {
      query = query.gt("id", config.run_cursor);
    }

    const { data: leads } = await query;

    // No leads left → run complete (AC #9)
    if (!leads || leads.length === 0) {
      const nextRunAt = calculateNextRunAt(config.frequency, new Date());
      await supabase
        .from("monitoring_configs")
        .update({
          run_status: "idle",
          run_cursor: null,
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      const result: MonitoringBatchResult = {
        status: "run_completed",
        leadsProcessed: 0,
        newPostsFound: 0,
        postsFiltered: 0,
        cursor: null,
        errors: [],
      };
      return NextResponse.json(result);
    }

    // Get Apify key for tenant
    const apifyKey = await getApiKey(supabase, config.tenant_id, "apify");
    if (!apifyKey) {
      // No Apify key — mark run complete, skip tenant
      const nextRunAt = calculateNextRunAt(config.frequency, new Date());
      await supabase
        .from("monitoring_configs")
        .update({
          run_status: "idle",
          run_cursor: null,
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      const result: MonitoringBatchResult = {
        status: "no_apify_key",
        leadsProcessed: 0,
        newPostsFound: 0,
        postsFiltered: 0,
        cursor: null,
        errors: [],
      };
      return NextResponse.json(result);
    }

    // Load OpenAI key and KB context once for the batch (Story 13.4)
    const openaiKey = await getApiKey(supabase, config.tenant_id, "openai");
    const kbContext = await loadKBContext(supabase, config.tenant_id);

    // Process batch with Promise.allSettled (AC #7)
    const results = await Promise.allSettled(
      leads.map((lead) =>
        processLead(
          lead as {
            id: string;
            linkedin_url: string | null;
            linkedin_posts_cache: LinkedInPostsCache | null;
          },
          apifyKey,
          apifyService,
          supabase,
          config!.tenant_id,
          openaiKey,
          kbContext
        )
      )
    );

    // Aggregate results
    let totalNewPosts = 0;
    let totalPostsFiltered = 0;
    const errors: Array<{ leadId: string; error: string }> = [];

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalNewPosts += r.value.newPostsFound;
        totalPostsFiltered += r.value.postsFiltered;
        if (!r.value.success && r.value.error) {
          errors.push({ leadId: r.value.leadId, error: r.value.error });
        }
      } else {
        errors.push({ leadId: "unknown", error: String(r.reason) });
      }
    }

    // Update cursor (AC #11)
    const lastLeadId = leads[leads.length - 1].id;
    await supabase
      .from("monitoring_configs")
      .update({
        run_cursor: lastLeadId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);

    const batchResult: MonitoringBatchResult = {
      status: "batch_processed",
      leadsProcessed: leads.length,
      newPostsFound: totalNewPosts,
      postsFiltered: totalPostsFiltered,
      cursor: lastLeadId,
      errors,
    };

    return NextResponse.json(batchResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
