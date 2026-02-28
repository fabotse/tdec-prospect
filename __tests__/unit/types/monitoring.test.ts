/**
 * Tests for monitoring types
 * Story 13.1: Schema de Monitoramento e Tipos — AC #9
 */

import { describe, it, expect } from "vitest";
import {
  insightStatusValues,
  insightStatusLabels,
  insightStatusVariants,
  monitoringFrequencyValues,
  monitoringFrequencyLabels,
  transformLeadInsightRow,
  transformMonitoringConfigRow,
} from "@/types/monitoring";
import type {
  InsightStatus,
  MonitoringFrequency,
  LeadInsightRow,
  MonitoringConfigRow,
} from "@/types/monitoring";

// ==============================================
// INSIGHT STATUS ENUM
// ==============================================

describe("InsightStatus enum", () => {
  it("should contain exactly 3 values: new, used, dismissed", () => {
    expect(insightStatusValues).toEqual(["new", "used", "dismissed"]);
    expect(insightStatusValues).toHaveLength(3);
  });

  it("should have PT-BR labels for all statuses", () => {
    expect(insightStatusLabels.new).toBe("Novo");
    expect(insightStatusLabels.used).toBe("Usado");
    expect(insightStatusLabels.dismissed).toBe("Descartado");
  });

  it("should have labels for every status value", () => {
    for (const status of insightStatusValues) {
      expect(insightStatusLabels[status]).toBeDefined();
      expect(typeof insightStatusLabels[status]).toBe("string");
    }
  });

  it("should have variants for every status value", () => {
    expect(insightStatusVariants.new).toBe("default");
    expect(insightStatusVariants.used).toBe("secondary");
    expect(insightStatusVariants.dismissed).toBe("destructive");
  });
});

// ==============================================
// MONITORING FREQUENCY ENUM
// ==============================================

describe("MonitoringFrequency enum", () => {
  it("should contain exactly 2 values: weekly, biweekly", () => {
    expect(monitoringFrequencyValues).toEqual(["weekly", "biweekly"]);
    expect(monitoringFrequencyValues).toHaveLength(2);
  });

  it("should have PT-BR labels for all frequencies", () => {
    expect(monitoringFrequencyLabels.weekly).toBe("Semanal");
    expect(monitoringFrequencyLabels.biweekly).toBe("Quinzenal");
  });

  it("should have labels for every frequency value", () => {
    for (const freq of monitoringFrequencyValues) {
      expect(monitoringFrequencyLabels[freq]).toBeDefined();
      expect(typeof monitoringFrequencyLabels[freq]).toBe("string");
    }
  });
});

// ==============================================
// transformLeadInsightRow
// ==============================================

describe("transformLeadInsightRow", () => {
  const mockRow: LeadInsightRow = {
    id: "insight-1",
    tenant_id: "tenant-1",
    lead_id: "lead-1",
    post_url: "https://linkedin.com/posts/123",
    post_text: "Excited about our new product launch!",
    post_published_at: "2026-02-20T10:00:00Z",
    relevance_reasoning: "Post mentions product launch relevant to ICP",
    suggestion: "Parabenizar pelo lançamento e conectar com nosso produto",
    status: "new" as InsightStatus,
    created_at: "2026-02-27T12:00:00Z",
    updated_at: "2026-02-27T12:00:00Z",
  };

  it("should transform all snake_case fields to camelCase", () => {
    const result = transformLeadInsightRow(mockRow);

    expect(result).toEqual({
      id: "insight-1",
      tenantId: "tenant-1",
      leadId: "lead-1",
      postUrl: "https://linkedin.com/posts/123",
      postText: "Excited about our new product launch!",
      postPublishedAt: "2026-02-20T10:00:00Z",
      relevanceReasoning: "Post mentions product launch relevant to ICP",
      suggestion:
        "Parabenizar pelo lançamento e conectar com nosso produto",
      status: "new",
      createdAt: "2026-02-27T12:00:00Z",
      updatedAt: "2026-02-27T12:00:00Z",
    });
  });

  it("should handle null optional fields", () => {
    const rowWithNulls: LeadInsightRow = {
      ...mockRow,
      post_published_at: null,
      relevance_reasoning: null,
      suggestion: null,
    };

    const result = transformLeadInsightRow(rowWithNulls);

    expect(result.postPublishedAt).toBeNull();
    expect(result.relevanceReasoning).toBeNull();
    expect(result.suggestion).toBeNull();
  });

  it("should preserve the status enum value", () => {
    for (const status of insightStatusValues) {
      const row: LeadInsightRow = { ...mockRow, status };
      const result = transformLeadInsightRow(row);
      expect(result.status).toBe(status);
    }
  });
});

// ==============================================
// transformMonitoringConfigRow
// ==============================================

describe("transformMonitoringConfigRow", () => {
  const mockRow: MonitoringConfigRow = {
    id: "config-1",
    tenant_id: "tenant-1",
    frequency: "weekly" as MonitoringFrequency,
    max_monitored_leads: 100,
    last_run_at: "2026-02-20T08:00:00Z",
    next_run_at: "2026-02-27T08:00:00Z",
    run_status: "idle",
    run_cursor: null,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-20T08:00:00Z",
  };

  it("should transform all snake_case fields to camelCase", () => {
    const result = transformMonitoringConfigRow(mockRow);

    expect(result).toEqual({
      id: "config-1",
      tenantId: "tenant-1",
      frequency: "weekly",
      maxMonitoredLeads: 100,
      lastRunAt: "2026-02-20T08:00:00Z",
      nextRunAt: "2026-02-27T08:00:00Z",
      runStatus: "idle",
      runCursor: null,
      createdAt: "2026-02-01T10:00:00Z",
      updatedAt: "2026-02-20T08:00:00Z",
    });
  });

  it("should handle null optional fields", () => {
    const rowWithNulls: MonitoringConfigRow = {
      ...mockRow,
      last_run_at: null,
      next_run_at: null,
    };

    const result = transformMonitoringConfigRow(rowWithNulls);

    expect(result.lastRunAt).toBeNull();
    expect(result.nextRunAt).toBeNull();
  });

  it("should preserve the frequency enum value", () => {
    for (const freq of monitoringFrequencyValues) {
      const row: MonitoringConfigRow = { ...mockRow, frequency: freq };
      const result = transformMonitoringConfigRow(row);
      expect(result.frequency).toBe(freq);
    }
  });

  it("should correctly map max_monitored_leads to maxMonitoredLeads", () => {
    const row: MonitoringConfigRow = { ...mockRow, max_monitored_leads: 50 };
    const result = transformMonitoringConfigRow(row);
    expect(result.maxMonitoredLeads).toBe(50);
  });
});
