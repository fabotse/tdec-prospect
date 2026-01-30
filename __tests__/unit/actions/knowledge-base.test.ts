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
});
