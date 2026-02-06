import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock tenant helper
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  getKnowledgeBaseSection,
  saveKnowledgeBaseSection,
  getCompanyProfile,
  saveCompanyProfile,
  getToneOfVoice,
  saveToneOfVoice,
  getEmailExamples,
  createEmailExample,
  updateEmailExample,
  deleteEmailExample,
  getIcebreakerExamples,
  createIcebreakerExample,
  updateIcebreakerExample,
  deleteIcebreakerExample,
  getICPDefinition,
  saveICPDefinition,
} from "@/actions/knowledge-base";

describe("knowledge-base actions", () => {
  const mockSupabase = {
    from: vi.fn(),
  };

  const mockAdminProfile = {
    id: "user-123",
    tenant_id: "tenant-456",
    role: "admin" as const,
    full_name: "Admin User",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  const mockUserProfile = {
    ...mockAdminProfile,
    role: "user" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
  });

  describe("getKnowledgeBaseSection", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await getKnowledgeBaseSection("company");

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await getKnowledgeBaseSection("company");

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem acessar a base de conhecimento",
      });
    });

    it("should return null when no data exists", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" }, // No rows found
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      });

      const result = await getKnowledgeBaseSection("company");

      expect(result).toEqual({
        success: true,
        data: null,
      });
    });

    it("should return data when it exists", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockContent = {
        company_name: "Test Company",
        business_description: "Description",
      };

      const mockSingle = vi.fn().mockResolvedValue({
        data: { content: mockContent },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      });

      const result = await getKnowledgeBaseSection("company");

      expect(result).toEqual({
        success: true,
        data: mockContent,
      });
    });

    it("should reject invalid section", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // @ts-expect-error - Testing invalid section
      const result = await getKnowledgeBaseSection("invalid");

      expect(result).toEqual({
        success: false,
        error: "Seção inválida",
      });
    });
  });

  describe("saveKnowledgeBaseSection", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await saveKnowledgeBaseSection("company", {
        company_name: "Test",
      });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await saveKnowledgeBaseSection("company", {
        company_name: "Test",
      });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem editar a base de conhecimento",
      });
    });

    it("should upsert data successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockUpsert = vi.fn().mockResolvedValue({
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      });

      const result = await saveKnowledgeBaseSection("company", {
        company_name: "Test Company",
      });

      expect(result).toEqual({ success: true });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-456",
          section: "company",
          content: { company_name: "Test Company" },
        }),
        expect.any(Object)
      );
    });

    it("should return error on database failure", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({
          error: { message: "Database error" },
        }),
      });

      const result = await saveKnowledgeBaseSection("company", {
        company_name: "Test",
      });

      expect(result).toEqual({
        success: false,
        error: "Erro ao salvar. Tente novamente.",
      });
    });
  });

  describe("getCompanyProfile", () => {
    it("should call getKnowledgeBaseSection with company section", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockContent = {
        company_name: "Test",
        business_description: "",
        products_services: "",
        competitive_advantages: "",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { content: mockContent },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await getCompanyProfile();

      expect(result.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith("knowledge_base");
    });
  });

  describe("saveCompanyProfile", () => {
    it("should validate input with zod", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await saveCompanyProfile({
        company_name: "", // Required but empty
        business_description: "",
        products_services: "",
        competitive_advantages: "",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("should save valid company profile", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });

      const result = await saveCompanyProfile({
        company_name: "Test Company",
        business_description: "Description",
        products_services: "Products",
        competitive_advantages: "Advantages",
      });

      expect(result).toEqual({ success: true });
    });
  });

  // ==============================================
  // TONE OF VOICE ACTIONS (Story 2.5)
  // ==============================================

  describe("getToneOfVoice", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await getToneOfVoice();

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await getToneOfVoice();

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem acessar a base de conhecimento",
      });
    });

    it("should return tone data when it exists", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockTone = {
        preset: "formal",
        custom_description: "Professional",
        writing_guidelines: "Use formal language",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { content: mockTone },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await getToneOfVoice();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockTone);
      }
    });
  });

  describe("saveToneOfVoice", () => {
    it("should validate input with zod", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await saveToneOfVoice({
        // @ts-expect-error - Testing invalid preset
        preset: "invalid",
        custom_description: "",
        writing_guidelines: "",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("should save valid tone settings", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });

      const result = await saveToneOfVoice({
        preset: "casual",
        custom_description: "Friendly tone",
        writing_guidelines: "Keep it simple",
      });

      expect(result).toEqual({ success: true });
    });
  });

  // ==============================================
  // EMAIL EXAMPLES ACTIONS (Story 2.5)
  // ==============================================

  describe("getEmailExamples", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await getEmailExamples();

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await getEmailExamples();

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem acessar exemplos de email",
      });
    });

    it("should return examples list", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockExamples = [
        {
          id: "1",
          tenant_id: "tenant-456",
          subject: "Test Subject",
          body: "Test Body",
          context: "Test Context",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockExamples,
              error: null,
            }),
          }),
        }),
      });

      const result = await getEmailExamples();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockExamples);
      }
    });
  });

  describe("createEmailExample", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await createEmailExample({
        subject: "Test",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await createEmailExample({
        subject: "Test",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem adicionar exemplos",
      });
    });

    it("should validate input with zod", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await createEmailExample({
        subject: "", // Required but empty
        body: "Body",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("should create example successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockCreated = {
        id: "new-id",
        tenant_id: "tenant-456",
        subject: "New Subject",
        body: "New Body",
        context: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      };

      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCreated,
              error: null,
            }),
          }),
        }),
      });

      const result = await createEmailExample({
        subject: "New Subject",
        body: "New Body",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockCreated);
      }
    });
  });

  describe("updateEmailExample", () => {
    const validUUID = "550e8400-e29b-41d4-a716-446655440000";

    it("should reject invalid UUID", async () => {
      const result = await updateEmailExample("invalid-id", {
        subject: "Updated",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "ID inválido",
      });
    });

    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await updateEmailExample(validUUID, {
        subject: "Updated",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await updateEmailExample(validUUID, {
        subject: "Updated",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem editar exemplos",
      });
    });

    it("should update example successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockUpdated = {
        id: validUUID,
        tenant_id: "tenant-456",
        subject: "Updated Subject",
        body: "Updated Body",
        context: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-02",
      };

      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockUpdated,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await updateEmailExample(validUUID, {
        subject: "Updated Subject",
        body: "Updated Body",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockUpdated);
      }
    });
  });

  describe("deleteEmailExample", () => {
    const validUUID = "550e8400-e29b-41d4-a716-446655440000";

    it("should reject invalid UUID", async () => {
      const result = await deleteEmailExample("invalid-id");

      expect(result).toEqual({
        success: false,
        error: "ID inválido",
      });
    });

    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await deleteEmailExample(validUUID);

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await deleteEmailExample(validUUID);

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem remover exemplos",
      });
    });

    it("should delete example successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        }),
      });

      const result = await deleteEmailExample(validUUID);

      expect(result).toEqual({ success: true });
    });
  });

  // ==============================================
  // ICEBREAKER EXAMPLES ACTIONS (Story 9.2)
  // ==============================================

  describe("getIcebreakerExamples", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await getIcebreakerExamples();

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await getIcebreakerExamples();

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem acessar exemplos de ice breaker",
      });
    });

    it("should return examples list", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockExamples = [
        {
          id: "1",
          tenant_id: "tenant-456",
          text: "Vi que a Acme está expandindo para SaaS.",
          category: "empresa",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockExamples,
              error: null,
            }),
          }),
        }),
      });

      const result = await getIcebreakerExamples();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockExamples);
      }
      expect(mockSupabase.from).toHaveBeenCalledWith("icebreaker_examples");
    });

    it("should return error on database failure", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Database error" },
            }),
          }),
        }),
      });

      const result = await getIcebreakerExamples();

      expect(result).toEqual({
        success: false,
        error: "Erro ao buscar exemplos",
      });
    });
  });

  describe("createIcebreakerExample", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await createIcebreakerExample({
        text: "Test ice breaker",
      });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await createIcebreakerExample({
        text: "Test ice breaker",
      });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem adicionar exemplos",
      });
    });

    it("should validate input - require text", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await createIcebreakerExample({
        text: "",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("should validate input - reject text over 500 chars", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await createIcebreakerExample({
        text: "a".repeat(501),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("500");
      }
    });

    it("should validate input - reject invalid category", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await createIcebreakerExample({
        text: "Valid text",
        // @ts-expect-error - Testing invalid category
        category: "invalid",
      });

      expect(result.success).toBe(false);
    });

    it("should create example successfully with category", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockCreated = {
        id: "new-id",
        tenant_id: "tenant-456",
        text: "New ice breaker",
        category: "empresa",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      };

      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCreated,
              error: null,
            }),
          }),
        }),
      });

      const result = await createIcebreakerExample({
        text: "New ice breaker",
        category: "empresa",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockCreated);
      }
      expect(mockSupabase.from).toHaveBeenCalledWith("icebreaker_examples");
    });

    it("should create example successfully without category", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockCreated = {
        id: "new-id",
        tenant_id: "tenant-456",
        text: "Generic ice breaker",
        category: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      };

      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCreated,
              error: null,
            }),
          }),
        }),
      });

      const result = await createIcebreakerExample({
        text: "Generic ice breaker",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.category).toBeNull();
      }
    });
  });

  describe("updateIcebreakerExample", () => {
    const validUUID = "550e8400-e29b-41d4-a716-446655440000";

    it("should reject invalid UUID", async () => {
      const result = await updateIcebreakerExample("invalid-id", {
        text: "Updated",
      });

      expect(result).toEqual({
        success: false,
        error: "ID inválido",
      });
    });

    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await updateIcebreakerExample(validUUID, {
        text: "Updated",
      });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await updateIcebreakerExample(validUUID, {
        text: "Updated",
      });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem editar exemplos",
      });
    });

    it("should update example successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockUpdated = {
        id: validUUID,
        tenant_id: "tenant-456",
        text: "Updated ice breaker",
        category: "lead",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      };

      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockUpdated,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await updateIcebreakerExample(validUUID, {
        text: "Updated ice breaker",
        category: "lead",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockUpdated);
      }
      expect(mockSupabase.from).toHaveBeenCalledWith("icebreaker_examples");
    });
  });

  describe("deleteIcebreakerExample", () => {
    const validUUID = "550e8400-e29b-41d4-a716-446655440000";

    it("should reject invalid UUID", async () => {
      const result = await deleteIcebreakerExample("invalid-id");

      expect(result).toEqual({
        success: false,
        error: "ID inválido",
      });
    });

    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await deleteIcebreakerExample(validUUID);

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await deleteIcebreakerExample(validUUID);

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem remover exemplos",
      });
    });

    it("should delete example successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        }),
      });

      const result = await deleteIcebreakerExample(validUUID);

      expect(result).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith("icebreaker_examples");
    });
  });

  // ==============================================
  // ICP DEFINITION ACTIONS (Story 2.6)
  // ==============================================

  describe("getICPDefinition", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await getICPDefinition();

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await getICPDefinition();

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem acessar a base de conhecimento",
      });
    });

    it("should return null when no data exists", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116" },
              }),
            }),
          }),
        }),
      });

      const result = await getICPDefinition();

      expect(result).toEqual({
        success: true,
        data: null,
      });
    });

    it("should return ICP data when it exists", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockICP = {
        company_sizes: ["11-50", "51-200"],
        industries: ["Tecnologia", "SaaS"],
        job_titles: ["CEO", "CTO"],
        geographic_focus: ["São Paulo"],
        pain_points: "Dores",
        common_objections: "Objeções",
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { content: mockICP },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await getICPDefinition();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockICP);
      }
    });
  });

  describe("saveICPDefinition", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await saveICPDefinition({
        company_sizes: ["11-50"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await saveICPDefinition({
        company_sizes: ["11-50"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem editar a base de conhecimento",
      });
    });

    it("should validate input - require at least one company size", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await saveICPDefinition({
        company_sizes: [],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("should validate input - reject invalid company size", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await saveICPDefinition({
        // @ts-expect-error - Testing invalid size
        company_sizes: ["invalid-size"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      });

      expect(result.success).toBe(false);
    });

    it("should save valid ICP settings", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      });

      const result = await saveICPDefinition({
        company_sizes: ["11-50", "51-200"],
        industries: ["Tecnologia", "SaaS"],
        job_titles: ["CEO", "CTO"],
        geographic_focus: ["São Paulo", "Brasil"],
        pain_points: "Dores do cliente",
        common_objections: "Objeções comuns",
      });

      expect(result).toEqual({ success: true });
    });

    it("should save to database with correct section", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({
        upsert: mockUpsert,
      });

      await saveICPDefinition({
        company_sizes: ["11-50"],
        industries: [],
        job_titles: [],
        geographic_focus: [],
        pain_points: "",
        common_objections: "",
      });

      expect(mockSupabase.from).toHaveBeenCalledWith("knowledge_base");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: "tenant-456",
          section: "icp",
          content: expect.objectContaining({
            company_sizes: ["11-50"],
          }),
        }),
        expect.any(Object)
      );
    });
  });
});
