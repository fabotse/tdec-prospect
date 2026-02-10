/**
 * Tracking Service
 * Story 10.3: Instantly Analytics Service (Polling)
 *
 * Polling-based analytics from Instantly API V2.
 * Provides: getCampaignAnalytics, getDailyAnalytics, syncAnalytics, getLeadTracking
 *
 * Separated from InstantlyService (deployment) — Single Responsibility.
 * Polling is read-only: data comes directly from Instantly API, not persisted.
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";
import type {
  GetAnalyticsParams,
  GetDailyAnalyticsParams,
  SyncAnalyticsParams,
  GetLeadTrackingParams,
  CampaignAnalytics,
  DailyAnalyticsEntry,
  SyncResult,
  LeadTracking,
  InstantlyAnalyticsResponse,
  InstantlyLeadListResponse,
} from "@/types/tracking";

// ==============================================
// CONSTANTS
// ==============================================

const INSTANTLY_API_BASE = "https://api.instantly.ai";
const ANALYTICS_ENDPOINT = "/api/v2/campaigns/analytics";
const DAILY_ANALYTICS_ENDPOINT = "/api/v2/campaigns/analytics/daily";
const LEADS_LIST_ENDPOINT = "/api/v2/leads/list";
const MAX_PAGINATION_PAGES = 50;

// ==============================================
// HELPERS
// ==============================================

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Maps Instantly analytics response to CampaignAnalytics.
 * Uses unique counts to avoid inflation from tracking pixels.
 *
 * Note: `campaignId` is passed through as-is. At service level this is the
 * externalCampaignId; API routes override to local campaignId before returning.
 */
export function mapToCampaignAnalytics(
  response: InstantlyAnalyticsResponse,
  campaignId: string
): CampaignAnalytics {
  const totalSent = response.emails_sent_count;

  return {
    campaignId,
    totalSent,
    totalOpens: response.open_count_unique,
    totalClicks: response.link_click_count_unique,
    totalReplies: response.reply_count_unique,
    totalBounces: response.bounced_count,
    openRate: totalSent > 0 ? response.open_count_unique / totalSent : 0,
    clickRate: totalSent > 0 ? response.link_click_count_unique / totalSent : 0,
    replyRate: totalSent > 0 ? response.reply_count_unique / totalSent : 0,
    bounceRate: totalSent > 0 ? response.bounced_count / totalSent : 0,
    lastSyncAt: new Date().toISOString(),
  };
}

/**
 * Maps Instantly lead entry to LeadTracking.
 * Events array is empty — granular events come from webhooks, not polling.
 *
 * Note: `campaignId` is passed through as-is. API routes override to local ID.
 * Accepts partial lead data defensively — fields default to 0/false/null when missing.
 */
export function mapToLeadTracking(
  item: { email: string; email_open_count?: number; email_click_count?: number; email_reply_count?: number; timestamp_last_open?: string | null },
  campaignId: string
): LeadTracking {
  return {
    leadEmail: item.email,
    campaignId,
    openCount: item.email_open_count ?? 0,
    clickCount: item.email_click_count ?? 0,
    hasReplied: (item.email_reply_count ?? 0) > 0,
    lastOpenAt: item.timestamp_last_open ?? null,
    events: [],
  };
}

// ==============================================
// TRACKING SERVICE
// ==============================================

export class TrackingService extends ExternalService {
  readonly name = "instantly";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async testConnection(_apiKey: string): Promise<TestConnectionResult> {
    throw new ExternalServiceError(this.name, 501, "Use InstantlyService.testConnection");
  }

  /**
   * Get campaign analytics from Instantly API.
   * AC: #1 — GET /api/v2/campaigns/analytics
   */
  async getCampaignAnalytics(params: GetAnalyticsParams): Promise<CampaignAnalytics> {
    const { apiKey, externalCampaignId } = params;

    if (!externalCampaignId) {
      throw new ExternalServiceError(
        this.name,
        400,
        "Esta campanha ainda não foi exportada para o Instantly. Exporte a campanha primeiro."
      );
    }

    const url = `${INSTANTLY_API_BASE}${ANALYTICS_ENDPOINT}?id=${encodeURIComponent(externalCampaignId)}&exclude_total_leads_count=true`;

    const response = await this.request<InstantlyAnalyticsResponse[]>(url, {
      method: "GET",
      headers: buildAuthHeaders(apiKey),
    });

    if (!response.length) {
      throw new ExternalServiceError(
        this.name,
        404,
        "Nenhum dado de analytics encontrado para esta campanha."
      );
    }

    return mapToCampaignAnalytics(response[0], params.externalCampaignId);
  }

  /**
   * Get daily analytics for chart/graph data.
   * AC: #2 — GET /api/v2/campaigns/analytics/daily
   */
  async getDailyAnalytics(params: GetDailyAnalyticsParams): Promise<DailyAnalyticsEntry[]> {
    const { apiKey, externalCampaignId, startDate, endDate } = params;

    if (!externalCampaignId) {
      throw new ExternalServiceError(
        this.name,
        400,
        "Esta campanha ainda não foi exportada para o Instantly. Exporte a campanha primeiro."
      );
    }

    let url = `${INSTANTLY_API_BASE}${DAILY_ANALYTICS_ENDPOINT}?campaign_id=${encodeURIComponent(externalCampaignId)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;

    return this.request<DailyAnalyticsEntry[]>(url, {
      method: "GET",
      headers: buildAuthHeaders(apiKey),
    });
  }

  /**
   * Orchestrate analytics + daily analytics into SyncResult.
   * AC: #2 — Combined sync operation
   */
  async syncAnalytics(params: SyncAnalyticsParams): Promise<SyncResult> {
    const { apiKey, externalCampaignId } = params;

    const [analytics, dailyAnalytics] = await Promise.all([
      this.getCampaignAnalytics({ apiKey, externalCampaignId }),
      this.getDailyAnalytics({ apiKey, externalCampaignId }),
    ]);

    const lastSyncAt = new Date().toISOString();

    return {
      campaignId: externalCampaignId,
      analytics: { ...analytics, lastSyncAt },
      dailyAnalytics,
      lastSyncAt,
      source: "polling",
    };
  }

  /**
   * Get lead tracking data with cursor-based pagination.
   * AC: #3 — POST /api/v2/leads/list
   */
  async getLeadTracking(params: GetLeadTrackingParams): Promise<LeadTracking[]> {
    const { apiKey, externalCampaignId } = params;

    if (!externalCampaignId) {
      throw new ExternalServiceError(
        this.name,
        400,
        "Esta campanha ainda não foi exportada para o Instantly. Exporte a campanha primeiro."
      );
    }

    const allLeads: LeadTracking[] = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    do {
      const body: Record<string, unknown> = {
        campaign: externalCampaignId,
        limit: 100,
      };
      if (cursor) body.starting_after = cursor;

      const url = `${INSTANTLY_API_BASE}${LEADS_LIST_ENDPOINT}`;

      const response = await this.request<InstantlyLeadListResponse>(url, {
        method: "POST",
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify(body),
      });

      const mapped = response.items.map((item) =>
        mapToLeadTracking(item, externalCampaignId)
      );
      allLeads.push(...mapped);

      cursor = response.next_starting_after ?? undefined;
      pageCount++;
    } while (cursor && pageCount < MAX_PAGINATION_PAGES);

    return allLeads;
  }
}
