import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Mock tenant helper
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  getTeamMembers,
  inviteUser,
  removeTeamMember,
  cancelInvitation,
  isOnlyAdmin,
} from "@/actions/team";

describe("team actions", () => {
  const mockSupabase = {
    from: vi.fn(),
  };

  const mockAdminClient = {
    auth: {
      admin: {
        listUsers: vi.fn(),
        inviteUserByEmail: vi.fn(),
      },
    },
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
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient as never);
  });

  // ==============================================
  // GET TEAM MEMBERS
  // ==============================================

  describe("getTeamMembers", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await getTeamMembers();

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await getTeamMembers();

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem gerenciar a equipe.",
      });
    });

    it("should return profiles and invitations combined", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // Mock profiles query
      const mockProfiles = [
        {
          id: "user-1",
          full_name: "John Doe",
          role: "admin",
          created_at: "2026-01-01",
          tenant_id: "tenant-456",
        },
      ];

      // Mock auth users
      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: {
          users: [{ id: "user-1", email: "john@example.com" }],
        },
        error: null,
      });

      // Mock invitations query
      const mockInvitations = [
        {
          id: "inv-1",
          email: "pending@example.com",
          role: "user",
          status: "pending",
          created_at: "2026-01-02",
          tenant_id: "tenant-456",
        },
      ];

      // Setup mock chain for profiles
      const mockProfilesEq = vi.fn().mockResolvedValue({
        data: mockProfiles,
        error: null,
      });

      // Setup mock chain for invitations
      const mockInvitationsEq2 = vi.fn().mockResolvedValue({
        data: mockInvitations,
        error: null,
      });

      const mockInvitationsEq1 = vi.fn().mockReturnValue({
        eq: mockInvitationsEq2,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: mockProfilesEq,
            }),
          };
        }
        if (table === "team_invitations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: mockInvitationsEq1,
            }),
          };
        }
        return {};
      });

      const result = await getTeamMembers();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data![0]).toMatchObject({
          id: "user-1",
          full_name: "John Doe",
          email: "john@example.com",
          role: "admin",
          status: "active",
        });
        expect(result.data![1]).toMatchObject({
          id: "inv-1",
          email: "pending@example.com",
          role: "user",
          status: "pending",
        });
      }
    });

    it("should handle database error for profiles", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Database error" },
          }),
        }),
      });

      const result = await getTeamMembers();

      expect(result).toEqual({
        success: false,
        error: "Erro ao carregar membros da equipe.",
      });
    });

    it("should handle admin client error", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: null,
        error: { message: "Auth error" },
      });

      const result = await getTeamMembers();

      expect(result).toEqual({
        success: false,
        error: "Erro ao carregar dados de usuários.",
      });
    });
  });

  // ==============================================
  // INVITE USER
  // ==============================================

  describe("inviteUser", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await inviteUser({ email: "test@example.com", role: "user" });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await inviteUser({ email: "test@example.com", role: "user" });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem convidar usuários.",
      });
    });

    it("should validate email format", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await inviteUser({ email: "invalid-email", role: "user" });

      expect(result).toEqual({
        success: false,
        error: "Email inválido",
      });
    });

    it("should prevent duplicate pending invites", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "existing-invite" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await inviteUser({ email: "test@example.com", role: "user" });

      expect(result).toEqual({
        success: false,
        error: "Já existe um convite pendente para este email.",
      });
    });

    it("should send invite successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // Mock no existing invite
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });

      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "team_invitations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: mockSingle,
                  }),
                }),
              }),
            }),
            insert: mockInsert,
          };
        }
        if (table === "profiles") {
          return {
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
          };
        }
        return {};
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
        error: null,
      });

      mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
        error: null,
      });

      const result = await inviteUser({ email: "new@example.com", role: "user" });

      expect(result).toEqual({ success: true });
      expect(mockAdminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        "new@example.com",
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: "tenant-456",
            role: "user",
          }),
        })
      );
    });

    it("should handle Supabase invite error", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: "PGRST116" },
                }),
              }),
            }),
          }),
        }),
      });

      mockAdminClient.auth.admin.listUsers.mockResolvedValue({
        data: { users: [] },
        error: null,
      });

      mockAdminClient.auth.admin.inviteUserByEmail.mockResolvedValue({
        error: { message: "Invite failed" },
      });

      const result = await inviteUser({ email: "new@example.com", role: "user" });

      expect(result).toEqual({
        success: false,
        error: "Erro ao enviar convite. Tente novamente.",
      });
    });
  });

  // ==============================================
  // REMOVE TEAM MEMBER
  // ==============================================

  describe("removeTeamMember", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await removeTeamMember("user-id");

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await removeTeamMember("user-id");

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem remover usuários.",
      });
    });

    it("should prevent removing only admin (self)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // Mock count of admins = 1
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              count: 1,
            }),
          }),
        }),
      });

      const result = await removeTeamMember(mockAdminProfile.id);

      expect(result).toEqual({
        success: false,
        error: "Não é possível remover o único administrador.",
      });
    });

    it("should remove user successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "other-user",
                    tenant_id: "tenant-456",
                    role: "user",
                  },
                  error: null,
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        return {};
      });

      const result = await removeTeamMember("other-user");

      expect(result).toEqual({ success: true });
      expect(mockDelete).toHaveBeenCalled();
    });

    it("should prevent removing user from different tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "other-user",
                tenant_id: "different-tenant",
                role: "user",
              },
              error: null,
            }),
          }),
        }),
      });

      const result = await removeTeamMember("other-user");

      expect(result).toEqual({
        success: false,
        error: "Usuário não encontrado.",
      });
    });

    it("should prevent removing only admin in tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // First call for profile fetch, second for admin count
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Profile fetch
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "other-admin",
                    tenant_id: "tenant-456",
                    role: "admin",
                  },
                  error: null,
                }),
              }),
            }),
          };
        } else {
          // Admin count
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  count: 1,
                }),
              }),
            }),
          };
        }
      });

      const result = await removeTeamMember("other-admin");

      expect(result).toEqual({
        success: false,
        error: "Não é possível remover o único administrador.",
      });
    });
  });

  // ==============================================
  // CANCEL INVITATION
  // ==============================================

  describe("cancelInvitation", () => {
    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await cancelInvitation("inv-id");

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await cancelInvitation("inv-id");

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem cancelar convites.",
      });
    });

    it("should cancel invitation successfully", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      const result = await cancelInvitation("inv-id");

      expect(result).toEqual({ success: true });
    });

    it("should handle delete error", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: { message: "Delete error" },
            }),
          }),
        }),
      });

      const result = await cancelInvitation("inv-id");

      expect(result).toEqual({
        success: false,
        error: "Erro ao cancelar convite.",
      });
    });
  });

  // ==============================================
  // IS ONLY ADMIN
  // ==============================================

  describe("isOnlyAdmin", () => {
    it("should return false when not authenticated", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await isOnlyAdmin();

      expect(result).toBe(false);
    });

    it("should return true when only one admin", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              count: 1,
            }),
          }),
        }),
      });

      const result = await isOnlyAdmin();

      expect(result).toBe(true);
    });

    it("should return false when multiple admins", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              count: 2,
            }),
          }),
        }),
      });

      const result = await isOnlyAdmin();

      expect(result).toBe(false);
    });
  });
});
