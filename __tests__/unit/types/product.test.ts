/**
 * Product Types Tests
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #3, #4, #5 - Product form validation and transformations
 */

import { describe, it, expect } from "vitest";
import {
  transformProductRow,
  createProductSchema,
  updateProductSchema,
  type ProductRow,
} from "@/types/product";

describe("Product Types", () => {
  describe("transformProductRow", () => {
    it("transforms snake_case database row to camelCase frontend model", () => {
      const row: ProductRow = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        tenant_id: "tenant-123",
        name: "Test Product",
        description: "Test Description",
        features: "Feature 1, Feature 2",
        differentials: "Differential 1",
        target_audience: "SMBs",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        campaign_count: 5,
      };

      const product = transformProductRow(row);

      expect(product).toEqual({
        id: "123e4567-e89b-12d3-a456-426614174000",
        tenantId: "tenant-123",
        name: "Test Product",
        description: "Test Description",
        features: "Feature 1, Feature 2",
        differentials: "Differential 1",
        targetAudience: "SMBs",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        campaignCount: 5,
      });
    });

    it("handles null optional fields", () => {
      const row: ProductRow = {
        id: "123",
        tenant_id: "tenant-123",
        name: "Test",
        description: "Desc",
        features: null,
        differentials: null,
        target_audience: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };

      const product = transformProductRow(row);

      expect(product.features).toBeNull();
      expect(product.differentials).toBeNull();
      expect(product.targetAudience).toBeNull();
      expect(product.campaignCount).toBeUndefined();
    });
  });

  describe("createProductSchema", () => {
    it("validates required fields (AC #3)", () => {
      const validData = {
        name: "Product Name",
        description: "Product Description",
      };

      const result = createProductSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("requires name field (empty string)", () => {
      const data = {
        name: "",
        description: "Description",
      };

      const result = createProductSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Nome é obrigatório");
      }
    });

    it("requires description field (empty string)", () => {
      const data = {
        name: "Name",
        description: "",
      };

      const result = createProductSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Descrição é obrigatória");
      }
    });

    it("rejects name longer than 200 characters", () => {
      const data = {
        name: "a".repeat(201),
        description: "Description",
      };

      const result = createProductSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Nome deve ter no máximo 200 caracteres"
        );
      }
    });

    it("rejects description longer than 2000 characters", () => {
      const data = {
        name: "Name",
        description: "a".repeat(2001),
      };

      const result = createProductSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Descrição deve ter no máximo 2000 caracteres"
        );
      }
    });

    it("accepts optional fields", () => {
      const data = {
        name: "Product",
        description: "Description",
        features: "Features",
        differentials: "Differentials",
        targetAudience: "Target",
      };

      const result = createProductSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.features).toBe("Features");
        expect(result.data.differentials).toBe("Differentials");
        expect(result.data.targetAudience).toBe("Target");
      }
    });

    it("transforms empty strings to null for optional fields", () => {
      const data = {
        name: "Product",
        description: "Description",
        features: "",
        differentials: "",
        targetAudience: "",
      };

      const result = createProductSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.features).toBeNull();
        expect(result.data.differentials).toBeNull();
        expect(result.data.targetAudience).toBeNull();
      }
    });

    it("rejects features longer than 2000 characters", () => {
      const data = {
        name: "Name",
        description: "Description",
        features: "a".repeat(2001),
      };

      const result = createProductSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe("updateProductSchema", () => {
    it("allows partial updates", () => {
      const data = {
        name: "Updated Name",
      };

      const result = updateProductSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("allows empty object for no updates", () => {
      const result = updateProductSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("validates fields when provided", () => {
      const data = {
        name: "a".repeat(201),
      };

      const result = updateProductSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
