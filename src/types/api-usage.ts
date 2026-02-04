/**
 * API Usage Tracking Types
 * Story: 6.5.8 - Apify Cost Tracking
 *
 * Types for tracking external API usage and costs across services.
 */

/**
 * Supported external services for usage tracking
 */
export type ServiceName =
  | "apify"
  | "apollo"
  | "signalhire"
  | "snovio"
  | "instantly";

/**
 * Status of an API usage log entry
 */
export type UsageStatus = "success" | "failed" | "partial";

/**
 * API Usage Log entry from the database
 */
export interface ApiUsageLog {
  id: string;
  tenantId: string;
  serviceName: ServiceName;
  requestType: string;
  externalRequestId?: string | null;
  leadId?: string | null;
  postsFetched?: number | null;
  estimatedCost?: number | null;
  status: UsageStatus;
  errorMessage?: string | null;
  rawResponse?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  durationMs?: number | null;
  createdAt: string;
}

/**
 * Parameters for logging API usage
 */
export interface LogApiUsageParams {
  tenantId: string;
  serviceName: ServiceName;
  requestType: string;
  externalRequestId?: string;
  leadId?: string;
  postsFetched?: number;
  estimatedCost?: number;
  status: UsageStatus;
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

/**
 * Aggregated usage statistics for a service
 */
export interface UsageStatistics {
  serviceName: ServiceName;
  totalCalls: number;
  totalPosts: number;
  totalCost: number;
  avgPostsPerLead: number;
  lastUsage: string | null;
}

/**
 * Response from the usage statistics API endpoint
 */
export interface UsageStatisticsResponse {
  statistics: UsageStatistics[];
  period: {
    startDate: string;
    endDate: string;
  };
}

/**
 * Query parameters for the usage statistics endpoint
 */
export interface UsageStatisticsQuery {
  startDate?: string;
  endDate?: string;
  serviceName?: ServiceName;
}

/**
 * Cost calculation rates per service
 * Values are cost per unit (e.g., per 1000 posts for Apify)
 */
export const SERVICE_COST_RATES: Record<ServiceName, number> = {
  apify: 1, // $1 per 1000 posts
  apollo: 0, // Not tracked yet
  signalhire: 0, // Not tracked yet
  snovio: 0, // Not tracked yet
  instantly: 0, // Not tracked yet
};

/**
 * Calculate estimated cost for Apify based on posts fetched
 * @param postsFetched Number of LinkedIn posts fetched
 * @returns Estimated cost in dollars
 */
export function calculateApifyCost(postsFetched: number): number {
  return (postsFetched / 1000) * SERVICE_COST_RATES.apify;
}
