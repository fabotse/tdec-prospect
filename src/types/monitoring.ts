/**
 * Monitoring Types
 * Story: 13.1 - Schema de Monitoramento e Tipos
 *
 * Types for LinkedIn lead monitoring and insight management.
 */

// ==============================================
// INSIGHT STATUS ENUM
// ==============================================

export const insightStatusValues = ["new", "used", "dismissed"] as const;
export type InsightStatus = (typeof insightStatusValues)[number];

export const insightStatusLabels: Record<InsightStatus, string> = {
  new: "Novo",
  used: "Usado",
  dismissed: "Descartado",
};

export const insightStatusVariants: Record<InsightStatus, "default" | "secondary" | "destructive"> = {
  new: "default",
  used: "secondary",
  dismissed: "destructive",
};

// ==============================================
// MONITORING FREQUENCY ENUM
// ==============================================

export const monitoringFrequencyValues = ["weekly", "biweekly"] as const;
export type MonitoringFrequency =
  (typeof monitoringFrequencyValues)[number];

export const monitoringFrequencyLabels: Record<
  MonitoringFrequency,
  string
> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
};

// ==============================================
// LEAD INSIGHTS — DB Row (snake_case)
// ==============================================

export interface LeadInsightRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  post_url: string;
  post_text: string;
  post_published_at: string | null;
  relevance_reasoning: string | null;
  suggestion: string | null;
  status: InsightStatus;
  created_at: string;
  updated_at: string;
}

// ==============================================
// LEAD INSIGHTS — TS Type (camelCase)
// ==============================================

export interface LeadInsight {
  id: string;
  tenantId: string;
  leadId: string;
  postUrl: string;
  postText: string;
  postPublishedAt: string | null;
  relevanceReasoning: string | null;
  suggestion: string | null;
  status: InsightStatus;
  createdAt: string;
  updatedAt: string;
}

export function transformLeadInsightRow(row: LeadInsightRow): LeadInsight {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    postUrl: row.post_url,
    postText: row.post_text,
    postPublishedAt: row.post_published_at,
    relevanceReasoning: row.relevance_reasoning,
    suggestion: row.suggestion,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==============================================
// MONITORING CONFIGS — DB Row (snake_case)
// ==============================================

export interface MonitoringConfigRow {
  id: string;
  tenant_id: string;
  frequency: MonitoringFrequency;
  max_monitored_leads: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

// ==============================================
// MONITORING CONFIGS — TS Type (camelCase)
// ==============================================

export interface MonitoringConfig {
  id: string;
  tenantId: string;
  frequency: MonitoringFrequency;
  maxMonitoredLeads: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function transformMonitoringConfigRow(
  row: MonitoringConfigRow
): MonitoringConfig {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    frequency: row.frequency,
    maxMonitoredLeads: row.max_monitored_leads,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
