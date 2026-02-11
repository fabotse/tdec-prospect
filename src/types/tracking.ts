import type { WhatsAppMessageStatus } from "@/types/database";

// ==============================================
// EVENT TYPES
// ==============================================

export const EVENT_TYPES = [
  "email_opened",
  "email_clicked",
  "email_replied",
  "email_bounced",
  "email_unsubscribed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isValidEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

// ==============================================
// CAMPAIGN EVENTS — DB Row (snake_case)
// ==============================================

export interface CampaignEventRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  event_type: EventType;
  lead_email: string;
  event_timestamp: string;
  payload: Record<string, unknown>;
  source: "webhook" | "polling";
  processed_at: string;
  created_at: string;
}

// ==============================================
// CAMPAIGN EVENTS — TS Type (camelCase)
// ==============================================

export interface CampaignEvent {
  id: string;
  tenantId: string;
  campaignId: string;
  eventType: EventType;
  leadEmail: string;
  eventTimestamp: string;
  payload: Record<string, unknown>;
  source: "webhook" | "polling";
  processedAt: string;
  createdAt: string;
}

export function transformCampaignEventRow(
  row: CampaignEventRow
): CampaignEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    eventType: row.event_type,
    leadEmail: row.lead_email,
    eventTimestamp: row.event_timestamp,
    payload: row.payload,
    source: row.source,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

// ==============================================
// OPPORTUNITY CONFIGS — DB Row (snake_case)
// ==============================================

export interface OpportunityConfigRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  min_opens: number;
  period_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ==============================================
// OPPORTUNITY CONFIGS — TS Type (camelCase)
// ==============================================

export interface OpportunityConfig {
  id: string;
  tenantId: string;
  campaignId: string;
  minOpens: number;
  periodDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function transformOpportunityConfigRow(
  row: OpportunityConfigRow
): OpportunityConfig {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    minOpens: row.min_opens,
    periodDays: row.period_days,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==============================================
// CAMPAIGN ANALYTICS (computed, no DB row)
// ==============================================

export interface CampaignAnalytics {
  campaignId: string;
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  totalBounces: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  lastSyncAt: string;
}

// ==============================================
// LEAD TRACKING (computed, no DB row)
// ==============================================

export interface LeadTracking {
  leadEmail: string;
  campaignId: string;
  openCount: number;
  clickCount: number;
  hasReplied: boolean;
  lastOpenAt: string | null;
  events: CampaignEvent[];
  firstName?: string;
  lastName?: string;
  phone?: string;
  leadId?: string;
  /** Story 11.7 AC#8 — WhatsApp message stats from aggregate query */
  whatsappMessageCount?: number;
  lastWhatsAppSentAt?: string | null;
  lastWhatsAppStatus?: WhatsAppMessageStatus | null;
}

// ==============================================
// OPPORTUNITY LEAD
// ==============================================

export interface OpportunityLead extends LeadTracking {
  qualifiedAt: string;
  isInOpportunityWindow: boolean;
}

// ==============================================
// INSTANTLY WEBHOOK EVENT (external payload)
// ==============================================

export interface InstantlyWebhookEvent {
  event_type: string;
  lead_email: string;
  campaign_id: string;
  timestamp: string;
  campaign_name?: string;
  workspace?: string;
  email_account?: string;
  step?: number;
  variant?: number;
  is_first?: boolean;
  payload?: Record<string, unknown>;
}

// ==============================================
// SYNC RESULT
// ==============================================

export interface SyncResult {
  campaignId: string;
  analytics: CampaignAnalytics;
  dailyAnalytics: DailyAnalyticsEntry[];
  lastSyncAt: string;
  source: "polling";
}

// ==============================================
// TRACKING SERVICE — Request Params (Story 10.3)
// ==============================================

export interface GetAnalyticsParams {
  apiKey: string;
  externalCampaignId: string;
}

export interface GetDailyAnalyticsParams {
  apiKey: string;
  externalCampaignId: string;
  startDate?: string;
  endDate?: string;
}

export interface SyncAnalyticsParams {
  apiKey: string;
  externalCampaignId: string;
}

export interface GetLeadTrackingParams {
  apiKey: string;
  externalCampaignId: string;
}

// ==============================================
// INSTANTLY API — Response Shapes (Story 10.3)
// ==============================================

export interface InstantlyAnalyticsResponse {
  campaign_id: string;
  campaign_name: string;
  campaign_status: number;
  leads_count: number;
  contacted_count: number;
  emails_sent_count: number;
  open_count: number;
  open_count_unique: number;
  reply_count: number;
  reply_count_unique: number;
  link_click_count: number;
  link_click_count_unique: number;
  bounced_count: number;
  unsubscribed_count: number;
}

export interface DailyAnalyticsEntry {
  date: string;
  sent: number;
  contacted: number;
  opened: number;
  unique_opened: number;
  replies: number;
  unique_replies: number;
  clicks: number;
  unique_clicks: number;
}

export interface InstantlyDailyAnalyticsResponse {
  data: DailyAnalyticsEntry[];
}

export interface InstantlyLeadEntry {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;
  email_open_count: number;
  email_click_count: number;
  email_reply_count: number;
  timestamp_last_open: string | null;
  timestamp_last_click: string | null;
  timestamp_last_reply: string | null;
  status: number;
}

export interface InstantlyLeadListResponse {
  items: InstantlyLeadEntry[];
  next_starting_after?: string;
}
