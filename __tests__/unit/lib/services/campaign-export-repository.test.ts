/**
 * Campaign Export Repository Tests
 * Story 7.3.1: Persistência de Campanhas Exportadas no Banco
 *
 * AC: #2 - Export fields are updated after successful export
 * AC: #3 - Duplicate detection via external_campaign_id
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabaseClient,
  mockTableResponse,
  type MockSupabaseClient,
} from "../../../helpers/mock-supabase";
import {
  updateExportStatus,
  getExportRecord,
  findByExternalId,
  hasBeenExported,
  clearExportStatus,
} from "@/lib/services/campaign-export-repository";

describe("Campaign Export Repository", () => {
  let client: MockSupabaseClient;

  beforeEach(() => {
    client = createMockSupabaseClient();
    vi.clearAllMocks();
  });

  // ================================================
  // updateExportStatus (Subtask 3.2, AC: #2)
  // ================================================
  describe("updateExportStatus", () => {
    it("updates all 4 export fields on the campaign", async () => {
      const chain = mockTableResponse(client, "campaigns", {
        data: { id: "c-1" },
      });

      const result = await updateExportStatus(client, "c-1", {
        externalCampaignId: "ext-abc",
        exportPlatform: "instantly",
        exportedAt: "2026-02-06T10:00:00Z",
        exportStatus: "success",
      });

      expect(client.from).toHaveBeenCalledWith("campaigns");
      expect(chain.update).toHaveBeenCalledWith({
        external_campaign_id: "ext-abc",
        export_platform: "instantly",
        exported_at: "2026-02-06T10:00:00Z",
        export_status: "success",
      });
      expect(chain.eq).toHaveBeenCalledWith("id", "c-1");
      expect(result).toEqual({ data: { id: "c-1" }, error: null });
    });

    it("handles partial update (only status)", async () => {
      const chain = mockTableResponse(client, "campaigns", {
        data: { id: "c-1" },
      });

      await updateExportStatus(client, "c-1", {
        exportStatus: "failed",
      });

      expect(chain.update).toHaveBeenCalledWith({
        export_status: "failed",
      });
    });

    it("returns error when update fails", async () => {
      mockTableResponse(client, "campaigns", {
        error: { message: "Not found", code: "PGRST116" },
      });

      const result = await updateExportStatus(client, "c-1", {
        exportStatus: "pending",
      });

      expect(result.error).toBeTruthy();
    });

    it("returns early without calling supabase when data is empty", async () => {
      const result = await updateExportStatus(client, "c-1", {});

      expect(client.from).not.toHaveBeenCalled();
      expect(result).toEqual({ data: null, error: null });
    });
  });

  // ================================================
  // getExportRecord (Subtask 3.3, AC: #2)
  // ================================================
  describe("getExportRecord", () => {
    it("returns export record for a campaign", async () => {
      const chain = mockTableResponse(client, "campaigns", {
        data: {
          id: "c-1",
          external_campaign_id: "ext-abc",
          export_platform: "instantly",
          exported_at: "2026-02-06T10:00:00Z",
          export_status: "success",
        },
      });

      const result = await getExportRecord(client, "c-1");

      expect(client.from).toHaveBeenCalledWith("campaigns");
      expect(chain.select).toHaveBeenCalledWith(
        "id, external_campaign_id, export_platform, exported_at, export_status"
      );
      expect(chain.eq).toHaveBeenCalledWith("id", "c-1");
      expect(chain.single).toHaveBeenCalled();
      expect(result.data).toEqual({
        campaignId: "c-1",
        externalCampaignId: "ext-abc",
        exportPlatform: "instantly",
        exportedAt: "2026-02-06T10:00:00Z",
        exportStatus: "success",
      });
    });

    it("returns null fields for non-exported campaign", async () => {
      mockTableResponse(client, "campaigns", {
        data: {
          id: "c-2",
          external_campaign_id: null,
          export_platform: null,
          exported_at: null,
          export_status: null,
        },
      });

      const result = await getExportRecord(client, "c-2");

      expect(result.data).toEqual({
        campaignId: "c-2",
        externalCampaignId: null,
        exportPlatform: null,
        exportedAt: null,
        exportStatus: null,
      });
    });

    it("returns error when campaign not found", async () => {
      mockTableResponse(client, "campaigns", {
        data: null,
        error: { message: "Not found", code: "PGRST116" },
      });

      const result = await getExportRecord(client, "nonexistent");

      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });

  // ================================================
  // findByExternalId (Subtask 3.4, AC: #3)
  // ================================================
  describe("findByExternalId", () => {
    it("finds campaign by external ID and platform", async () => {
      const chain = mockTableResponse(client, "campaigns", {
        data: {
          id: "c-1",
          external_campaign_id: "ext-abc",
          export_platform: "instantly",
          exported_at: "2026-02-06T10:00:00Z",
          export_status: "success",
        },
      });

      const result = await findByExternalId(client, "ext-abc", "instantly");

      expect(client.from).toHaveBeenCalledWith("campaigns");
      expect(chain.select).toHaveBeenCalledWith(
        "id, external_campaign_id, export_platform, exported_at, export_status"
      );
      expect(chain.eq).toHaveBeenCalledWith(
        "external_campaign_id",
        "ext-abc"
      );
      expect(chain.eq).toHaveBeenCalledWith("export_platform", "instantly");
      expect(chain.maybeSingle).toHaveBeenCalled();
      expect(result.data).toBeTruthy();
    });

    it("returns null when no campaign matches", async () => {
      mockTableResponse(client, "campaigns", {
        data: null,
      });

      const result = await findByExternalId(
        client,
        "nonexistent",
        "snovio"
      );

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // ================================================
  // hasBeenExported (Subtask 3.5, AC: #3)
  // ================================================
  describe("hasBeenExported", () => {
    it("returns exported true when campaign has external_campaign_id", async () => {
      mockTableResponse(client, "campaigns", {
        data: {
          external_campaign_id: "ext-abc",
        },
      });

      const result = await hasBeenExported(client, "c-1");

      expect(result).toEqual({ exported: true, error: null });
    });

    it("returns exported false when campaign has null external_campaign_id", async () => {
      mockTableResponse(client, "campaigns", {
        data: {
          external_campaign_id: null,
        },
      });

      const result = await hasBeenExported(client, "c-2");

      expect(result).toEqual({ exported: false, error: null });
    });

    it("returns exported false with error when DB fails", async () => {
      const dbError = { message: "Not found", code: "PGRST116" };
      mockTableResponse(client, "campaigns", {
        data: null,
        error: dbError,
      });

      const result = await hasBeenExported(client, "nonexistent");

      expect(result.exported).toBe(false);
      expect(result.error).toEqual(dbError);
    });

    it("returns exported false with null error when campaign not found", async () => {
      mockTableResponse(client, "campaigns", {
        data: null,
      });

      const result = await hasBeenExported(client, "nonexistent");

      expect(result).toEqual({ exported: false, error: null });
    });
  });

  // ================================================
  // clearExportStatus (Subtask 3.6, AC: #3)
  // ================================================
  describe("clearExportStatus", () => {
    it("resets all 4 export fields to null", async () => {
      const chain = mockTableResponse(client, "campaigns", {
        data: { id: "c-1" },
      });

      const result = await clearExportStatus(client, "c-1");

      expect(client.from).toHaveBeenCalledWith("campaigns");
      expect(chain.update).toHaveBeenCalledWith({
        external_campaign_id: null,
        export_platform: null,
        exported_at: null,
        export_status: null,
      });
      expect(chain.eq).toHaveBeenCalledWith("id", "c-1");
      expect(result).toEqual({ data: { id: "c-1" }, error: null });
    });

    it("returns error when clear fails", async () => {
      mockTableResponse(client, "campaigns", {
        error: { message: "RLS blocked" },
      });

      const result = await clearExportStatus(client, "c-1");

      expect(result.error).toBeTruthy();
    });
  });
});
