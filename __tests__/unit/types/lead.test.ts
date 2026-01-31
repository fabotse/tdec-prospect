/**
 * Lead Types Tests
 * Story: 3.1 - Leads Page & Data Model
 * AC: #3 - Leads table with specified columns
 */

import { describe, it, expect } from "vitest";
import {
  leadStatusValues,
  leadStatusLabels,
  leadStatusVariants,
  createLeadSchema,
  updateLeadSchema,
  transformLeadRow,
  type LeadStatus,
  type Lead,
  type LeadRow,
} from "@/types/lead";

describe("lead types", () => {
  // ==============================================
  // LEAD STATUS TYPES
  // ==============================================

  describe("leadStatusValues", () => {
    it("should contain all supported statuses", () => {
      expect(leadStatusValues).toContain("novo");
      expect(leadStatusValues).toContain("em_campanha");
      expect(leadStatusValues).toContain("interessado");
      expect(leadStatusValues).toContain("oportunidade");
      expect(leadStatusValues).toContain("nao_interessado");
    });

    it("should have exactly 5 statuses", () => {
      expect(leadStatusValues).toHaveLength(5);
    });
  });

  describe("leadStatusLabels", () => {
    it("should have Portuguese labels for all statuses", () => {
      expect(leadStatusLabels.novo).toBe("Novo");
      expect(leadStatusLabels.em_campanha).toBe("Em Campanha");
      expect(leadStatusLabels.interessado).toBe("Interessado");
      expect(leadStatusLabels.oportunidade).toBe("Oportunidade");
      expect(leadStatusLabels.nao_interessado).toBe("Não Interessado");
    });

    it("should have a label for every status", () => {
      leadStatusValues.forEach((status) => {
        expect(leadStatusLabels[status]).toBeDefined();
        expect(typeof leadStatusLabels[status]).toBe("string");
      });
    });
  });

  describe("leadStatusVariants", () => {
    it("should have variants for all statuses", () => {
      leadStatusValues.forEach((status) => {
        expect(leadStatusVariants[status]).toBeDefined();
      });
    });

    it("should use valid badge variant values", () => {
      const validVariants = [
        "default",
        "secondary",
        "success",
        "warning",
        "destructive",
      ];
      leadStatusValues.forEach((status) => {
        expect(validVariants).toContain(leadStatusVariants[status]);
      });
    });

    it("should have correct variants for each status", () => {
      // Story 4.2: AC #5 - Status color scheme
      // Novo: gray/default, Em Campanha: blue/secondary, Interessado: green/success
      // Oportunidade: yellow/warning, Não Interessado: red/destructive
      expect(leadStatusVariants.novo).toBe("default");
      expect(leadStatusVariants.em_campanha).toBe("secondary");
      expect(leadStatusVariants.interessado).toBe("success");
      expect(leadStatusVariants.oportunidade).toBe("warning");
      expect(leadStatusVariants.nao_interessado).toBe("destructive");
    });
  });

  // ==============================================
  // CREATE LEAD SCHEMA
  // ==============================================

  describe("createLeadSchema", () => {
    it("should require firstName", () => {
      const result = createLeadSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should accept valid lead with only firstName", () => {
      const validLead = {
        firstName: "João",
      };

      const result = createLeadSchema.safeParse(validLead);
      expect(result.success).toBe(true);
    });

    it("should accept valid lead with all fields", () => {
      const validLead = {
        firstName: "João",
        lastName: "Silva",
        email: "joao@empresa.com",
        phone: "+55 11 99999-9999",
        companyName: "Tech Corp",
        companySize: "11-50",
        industry: "Technology",
        location: "São Paulo, SP",
        title: "CTO",
        linkedinUrl: "https://linkedin.com/in/joaosilva",
        apolloId: "apollo-123",
      };

      const result = createLeadSchema.safeParse(validLead);
      expect(result.success).toBe(true);
    });

    it("should accept valid email", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        email: "test@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        email: "invalid-email",
      });
      expect(result.success).toBe(false);
    });

    it("should accept empty string for email", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        email: "",
      });
      expect(result.success).toBe(true);
    });

    it("should accept valid linkedinUrl", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        linkedinUrl: "https://linkedin.com/in/test",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid linkedinUrl", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        linkedinUrl: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("should accept empty string for linkedinUrl", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        linkedinUrl: "",
      });
      expect(result.success).toBe(true);
    });

    it("should accept empty optional fields", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        lastName: undefined,
        phone: undefined,
        companyName: undefined,
      });
      expect(result.success).toBe(true);
    });

    it("should provide Portuguese error message for required firstName", () => {
      const result = createLeadSchema.safeParse({
        firstName: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toBe("Nome é obrigatório");
      }
    });

    it("should provide Portuguese error message for invalid email", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        email: "invalid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toBe("Email inválido");
      }
    });

    it("should provide Portuguese error message for invalid URL", () => {
      const result = createLeadSchema.safeParse({
        firstName: "Test",
        linkedinUrl: "invalid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toBe("URL inválida");
      }
    });
  });

  // ==============================================
  // UPDATE LEAD SCHEMA
  // ==============================================

  describe("updateLeadSchema", () => {
    it("should allow partial updates", () => {
      const result = updateLeadSchema.safeParse({
        lastName: "Updated",
      });
      expect(result.success).toBe(true);
    });

    it("should allow empty object for no updates", () => {
      const result = updateLeadSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should validate status enum", () => {
      const validStatuses: LeadStatus[] = [
        "novo",
        "em_campanha",
        "interessado",
        "oportunidade",
        "nao_interessado",
      ];

      validStatuses.forEach((status) => {
        const result = updateLeadSchema.safeParse({ status });
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid status", () => {
      const result = updateLeadSchema.safeParse({
        status: "invalid_status",
      });
      expect(result.success).toBe(false);
    });

    it("should allow updating firstName only", () => {
      const result = updateLeadSchema.safeParse({
        firstName: "New Name",
      });
      expect(result.success).toBe(true);
    });

    it("should allow updating status only", () => {
      const result = updateLeadSchema.safeParse({
        status: "interessado",
      });
      expect(result.success).toBe(true);
    });
  });

  // ==============================================
  // TRANSFORM LEAD ROW
  // ==============================================

  describe("transformLeadRow", () => {
    const mockLeadRow: LeadRow = {
      id: "uuid-123",
      tenant_id: "tenant-456",
      apollo_id: "apollo-789",
      first_name: "João",
      last_name: "Silva",
      email: "joao@empresa.com",
      phone: "+55 11 99999-9999",
      company_name: "Tech Corp",
      company_size: "11-50",
      industry: "Technology",
      location: "São Paulo, SP",
      title: "CTO",
      linkedin_url: "https://linkedin.com/in/joaosilva",
      status: "novo",
      has_email: true,
      has_direct_phone: "Yes",
      created_at: "2026-01-30T10:00:00Z",
      updated_at: "2026-01-30T12:00:00Z",
    };

    it("should transform snake_case to camelCase", () => {
      const result = transformLeadRow(mockLeadRow);

      expect(result.tenantId).toBe(mockLeadRow.tenant_id);
      expect(result.apolloId).toBe(mockLeadRow.apollo_id);
      expect(result.firstName).toBe(mockLeadRow.first_name);
      expect(result.lastName).toBe(mockLeadRow.last_name);
      expect(result.companyName).toBe(mockLeadRow.company_name);
      expect(result.companySize).toBe(mockLeadRow.company_size);
      expect(result.linkedinUrl).toBe(mockLeadRow.linkedin_url);
      expect(result.createdAt).toBe(mockLeadRow.created_at);
      expect(result.updatedAt).toBe(mockLeadRow.updated_at);
    });

    it("should preserve null values", () => {
      const rowWithNulls: LeadRow = {
        ...mockLeadRow,
        apollo_id: null,
        last_name: null,
        email: null,
        phone: null,
        company_name: null,
        company_size: null,
        industry: null,
        location: null,
        title: null,
        linkedin_url: null,
      };

      const result = transformLeadRow(rowWithNulls);

      expect(result.apolloId).toBeNull();
      expect(result.lastName).toBeNull();
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.companyName).toBeNull();
      expect(result.companySize).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.location).toBeNull();
      expect(result.title).toBeNull();
      expect(result.linkedinUrl).toBeNull();
    });

    it("should handle all fields correctly", () => {
      const result = transformLeadRow(mockLeadRow);

      expect(result.id).toBe("uuid-123");
      expect(result.tenantId).toBe("tenant-456");
      expect(result.apolloId).toBe("apollo-789");
      expect(result.firstName).toBe("João");
      expect(result.lastName).toBe("Silva");
      expect(result.email).toBe("joao@empresa.com");
      expect(result.phone).toBe("+55 11 99999-9999");
      expect(result.companyName).toBe("Tech Corp");
      expect(result.companySize).toBe("11-50");
      expect(result.industry).toBe("Technology");
      expect(result.location).toBe("São Paulo, SP");
      expect(result.title).toBe("CTO");
      expect(result.linkedinUrl).toBe("https://linkedin.com/in/joaosilva");
      expect(result.status).toBe("novo");
      expect(result.hasEmail).toBe(true);
      expect(result.hasDirectPhone).toBe("Yes");
      expect(result.createdAt).toBe("2026-01-30T10:00:00Z");
      expect(result.updatedAt).toBe("2026-01-30T12:00:00Z");
    });

    // Story 3.5.1: Tests for contact availability fields
    it("should transform hasEmail and hasDirectPhone correctly", () => {
      const result = transformLeadRow(mockLeadRow);

      expect(result.hasEmail).toBe(true);
      expect(result.hasDirectPhone).toBe("Yes");
    });

    it("should handle false hasEmail and null hasDirectPhone", () => {
      const rowWithNoContact: LeadRow = {
        ...mockLeadRow,
        has_email: false,
        has_direct_phone: null,
      };

      const result = transformLeadRow(rowWithNoContact);

      expect(result.hasEmail).toBe(false);
      expect(result.hasDirectPhone).toBeNull();
    });

    it("should handle 'Maybe' hasDirectPhone value", () => {
      const rowMaybePhone: LeadRow = {
        ...mockLeadRow,
        has_direct_phone: "Maybe: please request direct dial via people/bulk_match",
      };

      const result = transformLeadRow(rowMaybePhone);

      expect(result.hasDirectPhone).toBe("Maybe: please request direct dial via people/bulk_match");
    });

    it("should return Lead interface type", () => {
      const result: Lead = transformLeadRow(mockLeadRow);
      expect(result).toBeDefined();
    });

    // Story 4.2.1 Fix: _isImported field tests
    it("should transform _is_imported to _isImported when true", () => {
      const rowImported: LeadRow = {
        ...mockLeadRow,
        _is_imported: true,
      };

      const result = transformLeadRow(rowImported);
      expect(result._isImported).toBe(true);
    });

    it("should transform _is_imported to _isImported when false", () => {
      const rowNotImported: LeadRow = {
        ...mockLeadRow,
        _is_imported: false,
      };

      const result = transformLeadRow(rowNotImported);
      expect(result._isImported).toBe(false);
    });

    it("should handle undefined _is_imported", () => {
      // mockLeadRow doesn't have _is_imported
      const result = transformLeadRow(mockLeadRow);
      expect(result._isImported).toBeUndefined();
    });
  });

  // ==============================================
  // TYPE ASSERTIONS
  // ==============================================

  describe("type assertions", () => {
    it("LeadStatus should be a union of valid statuses", () => {
      const validStatuses: LeadStatus[] = [
        "novo",
        "em_campanha",
        "interessado",
        "oportunidade",
        "nao_interessado",
      ];
      expect(validStatuses).toHaveLength(5);
    });
  });
});
