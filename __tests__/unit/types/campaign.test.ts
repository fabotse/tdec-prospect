/**
 * Campaign Types Tests
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #2 - Campaign data model
 * AC: #6 - Status badge variants
 */

import { describe, it, expect } from "vitest";
import {
  campaignStatusValues,
  campaignStatusLabels,
  campaignStatusVariants,
  getCampaignStatusConfig,
  transformCampaignRow,
  transformCampaignRowWithCount,
  createCampaignSchema,
  type CampaignRow,
  type CampaignRowWithCount,
  type CampaignStatus,
} from "@/types/campaign";

describe("Campaign Types", () => {
  describe("campaignStatusValues (AC: #2)", () => {
    it("contains all valid campaign statuses", () => {
      expect(campaignStatusValues).toEqual([
        "draft",
        "active",
        "paused",
        "completed",
      ]);
    });

    it("has 4 status values", () => {
      expect(campaignStatusValues).toHaveLength(4);
    });
  });

  describe("campaignStatusLabels (AC: #6)", () => {
    it("has Portuguese labels for all statuses", () => {
      expect(campaignStatusLabels.draft).toBe("Rascunho");
      expect(campaignStatusLabels.active).toBe("Ativa");
      expect(campaignStatusLabels.paused).toBe("Pausada");
      expect(campaignStatusLabels.completed).toBe("Concluida");
    });
  });

  describe("campaignStatusVariants (AC: #6)", () => {
    it("has correct color variants for statuses", () => {
      // draft: secondary (gray)
      expect(campaignStatusVariants.draft).toBe("secondary");
      // active: success (green)
      expect(campaignStatusVariants.active).toBe("success");
      // paused: warning (yellow)
      expect(campaignStatusVariants.paused).toBe("warning");
      // completed: default (neutral)
      expect(campaignStatusVariants.completed).toBe("default");
    });
  });

  describe("getCampaignStatusConfig", () => {
    it.each<CampaignStatus>(["draft", "active", "paused", "completed"])(
      "returns correct config for %s status",
      (status) => {
        const config = getCampaignStatusConfig(status);

        expect(config.value).toBe(status);
        expect(config.label).toBe(campaignStatusLabels[status]);
        expect(config.variant).toBe(campaignStatusVariants[status]);
      }
    );

    it("returns complete config object structure", () => {
      const config = getCampaignStatusConfig("draft");

      expect(config).toHaveProperty("value");
      expect(config).toHaveProperty("label");
      expect(config).toHaveProperty("variant");
    });
  });

  describe("transformCampaignRow", () => {
    it("transforms snake_case to camelCase", () => {
      const row: CampaignRow = {
        id: "campaign-123",
        tenant_id: "tenant-456",
        name: "Test Campaign",
        status: "draft",
        product_id: null,
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformCampaignRow(row);

      expect(result).toEqual({
        id: "campaign-123",
        tenantId: "tenant-456",
        name: "Test Campaign",
        status: "draft",
        productId: null,
        createdAt: "2026-02-01T10:00:00Z",
        updatedAt: "2026-02-01T12:00:00Z",
      });
    });
  });

  describe("transformCampaignRowWithCount (AC: #5)", () => {
    it("transforms row with lead count", () => {
      const row: CampaignRowWithCount = {
        id: "campaign-123",
        tenant_id: "tenant-456",
        name: "Test Campaign",
        status: "active",
        product_id: null,
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
        lead_count: 42,
      };

      const result = transformCampaignRowWithCount(row);

      expect(result.leadCount).toBe(42);
      expect(result.tenantId).toBe("tenant-456");
    });

    it("handles zero lead count", () => {
      const row: CampaignRowWithCount = {
        id: "campaign-123",
        tenant_id: "tenant-456",
        name: "Test Campaign",
        status: "draft",
        product_id: null,
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
        lead_count: 0,
      };

      const result = transformCampaignRowWithCount(row);

      expect(result.leadCount).toBe(0);
    });

    it("handles string lead count from database", () => {
      const row = {
        id: "campaign-123",
        tenant_id: "tenant-456",
        name: "Test Campaign",
        status: "draft" as const,
        product_id: null,
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
        lead_count: "15" as unknown as number, // DB might return string
      };

      const result = transformCampaignRowWithCount(row);

      expect(result.leadCount).toBe(15);
    });

    it("defaults to 0 for NaN lead count", () => {
      const row = {
        id: "campaign-123",
        tenant_id: "tenant-456",
        name: "Test Campaign",
        status: "draft" as const,
        product_id: null,
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
        lead_count: NaN as unknown as number,
      };

      const result = transformCampaignRowWithCount(row);

      expect(result.leadCount).toBe(0);
    });
  });

  describe("createCampaignSchema (AC: #4)", () => {
    it("validates valid campaign name", () => {
      const result = createCampaignSchema.safeParse({ name: "My Campaign" });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createCampaignSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Nome e obrigatorio");
      }
    });

    it("rejects name exceeding 200 characters", () => {
      const longName = "a".repeat(201);
      const result = createCampaignSchema.safeParse({ name: longName });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Nome muito longo");
      }
    });

    it("accepts name at exactly 200 characters", () => {
      const maxName = "a".repeat(200);
      const result = createCampaignSchema.safeParse({ name: maxName });
      expect(result.success).toBe(true);
    });

    it("rejects missing name field", () => {
      const result = createCampaignSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
