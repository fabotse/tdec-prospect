/**
 * Tests for Campaign Import Types
 * Story: 4.7 - Import Campaign Results
 */

import { describe, it, expect } from "vitest";
import {
  responseTypeValues,
  responseTypeLabels,
  responseToStatus,
  getStatusForResponse,
  importCampaignResultsSchema,
  campaignResultRowSchema,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  type ResponseType,
} from "@/types/campaign-import";

describe("Campaign Import Types", () => {
  describe("responseTypeValues", () => {
    it("should contain all expected response types", () => {
      expect(responseTypeValues).toContain("replied");
      expect(responseTypeValues).toContain("clicked");
      expect(responseTypeValues).toContain("opened");
      expect(responseTypeValues).toContain("bounced");
      expect(responseTypeValues).toContain("unsubscribed");
      expect(responseTypeValues).toContain("unknown");
      expect(responseTypeValues).toHaveLength(6);
    });
  });

  describe("responseTypeLabels", () => {
    it("should have labels for all response types", () => {
      for (const type of responseTypeValues) {
        expect(responseTypeLabels[type]).toBeDefined();
        expect(typeof responseTypeLabels[type]).toBe("string");
      }
    });

    it("should have Portuguese labels", () => {
      expect(responseTypeLabels.replied).toBe("Respondeu");
      expect(responseTypeLabels.bounced).toBe("Bounce");
      expect(responseTypeLabels.unsubscribed).toBe("Descadastrou");
    });
  });

  describe("responseToStatus mapping", () => {
    it("should map replied to interessado", () => {
      expect(responseToStatus.replied).toBe("interessado");
    });

    it("should map bounced to nao_interessado", () => {
      expect(responseToStatus.bounced).toBe("nao_interessado");
    });

    it("should map unsubscribed to nao_interessado", () => {
      expect(responseToStatus.unsubscribed).toBe("nao_interessado");
    });

    it("should map clicked to null (no status change)", () => {
      expect(responseToStatus.clicked).toBeNull();
    });

    it("should map opened to null (no status change)", () => {
      expect(responseToStatus.opened).toBeNull();
    });

    it("should map unknown to null (no status change)", () => {
      expect(responseToStatus.unknown).toBeNull();
    });
  });

  describe("getStatusForResponse", () => {
    it("should return interessado for replied", () => {
      expect(getStatusForResponse("replied")).toBe("interessado");
    });

    it("should return nao_interessado for bounced", () => {
      expect(getStatusForResponse("bounced")).toBe("nao_interessado");
    });

    it("should return null for clicked", () => {
      expect(getStatusForResponse("clicked")).toBeNull();
    });

    it("should return null for unknown", () => {
      expect(getStatusForResponse("unknown")).toBeNull();
    });
  });

  describe("campaignResultRowSchema", () => {
    it("should validate valid row data", () => {
      const validRow = {
        email: "test@example.com",
        responseType: "replied" as ResponseType,
      };

      const result = campaignResultRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const invalidRow = {
        email: "not-an-email",
        responseType: "replied" as ResponseType,
      };

      const result = campaignResultRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject empty email", () => {
      const invalidRow = {
        email: "",
        responseType: "replied" as ResponseType,
      };

      const result = campaignResultRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject invalid response type", () => {
      const invalidRow = {
        email: "test@example.com",
        responseType: "invalid_type",
      };

      const result = campaignResultRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should accept all valid response types", () => {
      for (const type of responseTypeValues) {
        const row = {
          email: "test@example.com",
          responseType: type,
        };

        const result = campaignResultRowSchema.safeParse(row);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("importCampaignResultsSchema", () => {
    it("should validate valid import request", () => {
      const validRequest = {
        results: [{ email: "test@example.com", responseType: "replied" }],
      };

      const result = importCampaignResultsSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("should validate request with createMissingLeads flag", () => {
      const validRequest = {
        results: [{ email: "test@example.com", responseType: "bounced" }],
        createMissingLeads: true,
      };

      const result = importCampaignResultsSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createMissingLeads).toBe(true);
      }
    });

    it("should default createMissingLeads to false", () => {
      const validRequest = {
        results: [{ email: "test@example.com", responseType: "replied" }],
      };

      const result = importCampaignResultsSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createMissingLeads).toBe(false);
      }
    });

    it("should reject empty results array", () => {
      const invalidRequest = {
        results: [],
      };

      const result = importCampaignResultsSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("should reject results with invalid emails", () => {
      const invalidRequest = {
        results: [{ email: "invalid", responseType: "replied" }],
      };

      const result = importCampaignResultsSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("should validate multiple results", () => {
      const validRequest = {
        results: [
          { email: "test1@example.com", responseType: "replied" },
          { email: "test2@example.com", responseType: "bounced" },
          { email: "test3@example.com", responseType: "clicked" },
        ],
      };

      const result = importCampaignResultsSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe("File size constants", () => {
    it("should have correct file size limit in bytes", () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    });

    it("should have correct file size limit in MB", () => {
      expect(MAX_FILE_SIZE_MB).toBe(5);
    });

    it("should have consistent MB and bytes values", () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(MAX_FILE_SIZE_MB * 1024 * 1024);
    });
  });
});
