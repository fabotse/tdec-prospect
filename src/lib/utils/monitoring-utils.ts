/**
 * Monitoring Utilities
 * Story: 13.3 - Edge Function de Verificação Semanal
 *
 * Pure functions for LinkedIn monitoring: post detection and scheduling.
 */

import type { LinkedInPost } from "@/types/apify";
import type { MonitoringFrequency } from "@/types/monitoring";

// ==============================================
// TYPES
// ==============================================

export interface MonitoringBatchResult {
  status:
    | "batch_processed"
    | "run_completed"
    | "no_run_due"
    | "no_config"
    | "no_apify_key";
  leadsProcessed: number;
  newPostsFound: number;
  postsFiltered: number;
  suggestionsGenerated: number;
  cursor: string | null;
  errors: Array<{ leadId: string; error: string }>;
}

// ==============================================
// PURE FUNCTIONS
// ==============================================

/**
 * Detect new posts by comparing URLs. A post is new if its postUrl
 * does NOT exist in the cached posts list.
 */
export function detectNewPosts(
  cachedPosts: LinkedInPost[],
  freshPosts: LinkedInPost[]
): LinkedInPost[] {
  const cachedUrls = new Set(cachedPosts.map((p) => p.postUrl));
  return freshPosts.filter((p) => p.postUrl && !cachedUrls.has(p.postUrl));
}

/**
 * Calculate next run date based on frequency.
 * weekly = +7 days, biweekly = +14 days.
 */
export function calculateNextRunAt(
  frequency: MonitoringFrequency,
  fromDate: Date = new Date()
): Date {
  const next = new Date(fromDate);
  next.setDate(next.getDate() + (frequency === "weekly" ? 7 : 14));
  return next;
}
