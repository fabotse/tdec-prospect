/**
 * API Usage Logging Service
 * Story: 6.5.8 - Apify Cost Tracking
 *
 * Logs external API usage for cost tracking and monitoring.
 * Designed to be non-blocking (fire and forget) to avoid impacting main flow.
 */

import { createClient } from "@/lib/supabase/server";
import type { LogApiUsageParams, UsageServiceName } from "@/types/api-usage";
import { calculateApifyCost } from "@/types/api-usage";

/**
 * Log API usage to the database
 *
 * AC #1: This function logs usage for any external API call.
 * AC #3.4: Handles errors gracefully - logging should never break main flow.
 *
 * @param params - Usage logging parameters
 * @returns Promise that resolves when logging is complete (or fails silently)
 */
export async function logApiUsage(params: LogApiUsageParams): Promise<void> {
  try {
    const supabase = await createClient();

    // Calculate cost automatically for Apify if not provided
    let estimatedCost = params.estimatedCost;
    if (
      params.serviceName === "apify" &&
      params.postsFetched !== undefined &&
      estimatedCost === undefined
    ) {
      estimatedCost = calculateApifyCost(params.postsFetched);
    }

    const { error } = await supabase.from("api_usage_logs").insert({
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

    if (error) {
      // Log error but don't throw - usage logging should not break main flow
      console.error("[logApiUsage] Failed to log API usage:", error.message);
    }
  } catch (error) {
    // Catch any unexpected errors - graceful degradation
    console.error("[logApiUsage] Unexpected error:", error);
  }
}

/**
 * Log successful Apify API call
 *
 * Helper function specifically for Apify icebreaker generation.
 * Calculates cost automatically based on posts fetched.
 */
export async function logApifySuccess(params: {
  tenantId: string;
  leadId: string;
  postsFetched: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return logApiUsage({
    tenantId: params.tenantId,
    serviceName: "apify",
    requestType: "icebreaker_generation",
    leadId: params.leadId,
    postsFetched: params.postsFetched,
    status: "success",
    durationMs: params.durationMs,
    metadata: params.metadata,
  });
}

/**
 * Log failed Apify API call
 *
 * Helper function for logging Apify failures.
 */
export async function logApifyFailure(params: {
  tenantId: string;
  leadId?: string;
  errorMessage: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return logApiUsage({
    tenantId: params.tenantId,
    serviceName: "apify",
    requestType: "icebreaker_generation",
    leadId: params.leadId,
    status: "failed",
    errorMessage: params.errorMessage,
    durationMs: params.durationMs,
    metadata: params.metadata,
  });
}

/**
 * Get aggregated usage statistics for a tenant
 *
 * AC #2: Returns tenant-scoped usage data with aggregations.
 */
export async function getUsageStatistics(params: {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  serviceName?: UsageServiceName;
}): Promise<{
  serviceName: UsageServiceName;
  totalCalls: number;
  totalPosts: number;
  totalCost: number;
  avgPostsPerLead: number;
  lastUsage: string | null;
}[]> {
  const supabase = await createClient();

  let query = supabase
    .from("api_usage_logs")
    .select("service_name, posts_fetched, estimated_cost, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("status", "success")
    .gte("created_at", params.startDate.toISOString())
    .lt("created_at", params.endDate.toISOString())
    .order("created_at", { ascending: false });

  if (params.serviceName) {
    query = query.eq("service_name", params.serviceName);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getUsageStatistics] Query error:", error.message);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Aggregate by service
  const aggregated = new Map<
    UsageServiceName,
    {
      totalCalls: number;
      totalPosts: number;
      totalCost: number;
      lastUsage: string | null;
    }
  >();

  for (const row of data) {
    const service = row.service_name as UsageServiceName;
    const current = aggregated.get(service) || {
      totalCalls: 0,
      totalPosts: 0,
      totalCost: 0,
      lastUsage: null,
    };

    current.totalCalls += 1;
    current.totalPosts += row.posts_fetched || 0;
    current.totalCost += Number(row.estimated_cost) || 0;

    // First row is the most recent due to ORDER BY
    if (!current.lastUsage) {
      current.lastUsage = row.created_at;
    }

    aggregated.set(service, current);
  }

  // Convert to array with avgPostsPerLead
  return Array.from(aggregated.entries()).map(([serviceName, stats]) => ({
    serviceName,
    totalCalls: stats.totalCalls,
    totalPosts: stats.totalPosts,
    totalCost: stats.totalCost,
    avgPostsPerLead:
      stats.totalCalls > 0 ? stats.totalPosts / stats.totalCalls : 0,
    lastUsage: stats.lastUsage,
  }));
}
