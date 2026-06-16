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
  updateMemberRole,
  applyInvitedRoleOnAcceptance,
} from "@/actions/team";

describe("team actions", () => {
  const mockSupabase = {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };

  const mockAdminClient = {
    from: vi.fn(),
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
    role: "gestor" as const,
    full_name: "Admin User",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  const mockUserProfile = {
    ...mockAdminProfile,
    role: "sdr" as const,
  };

  const mockDiretorProfile = {
    ...mockAdminProfile,
    role: "diretor" as const,
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
          role: "gestor",
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
          role: "sdr",
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
          role: "gestor",
          status: "active",
        });
        expect(result.data![1]).toMatchObject({
          id: "inv-1",
          email: "pending@example.com",
          role: "sdr",
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

      const result = await inviteUser({ email: "test@example.com", role: "sdr" });

      expect(result).toEqual({
        success: false,
        error: "Não autenticado",
      });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await inviteUser({ email: "test@example.com", role: "sdr" });

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem convidar usuários.",
      });
    });

    it("should validate email format", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const result = await inviteUser({ email: "invalid-email", role: "sdr" });

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

      const result = await inviteUser({ email: "test@example.com", role: "sdr" });

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

      const result = await inviteUser({ email: "new@example.com", role: "sdr" });

      expect(result).toEqual({ success: true });
      expect(mockAdminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        "new@example.com",
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: "tenant-456",
            role: "sdr",
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

      const result = await inviteUser({ email: "new@example.com", role: "sdr" });

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
            in: vi.fn().mockResolvedValue({
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
                    role: "sdr",
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
                role: "sdr",
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
                    role: "gestor",
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
                in: vi.fn().mockResolvedValue({
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

    it("blocks removing an admin when the count is null (fail-closed, Story 20.5 AC6)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "other-admin",
                    tenant_id: "tenant-456",
                    role: "gestor",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: null }),
            }),
          }),
        };
      });

      const result = await removeTeamMember("other-admin");

      expect(result).toEqual({
        success: false,
        error: "Não é possível remover o único administrador.",
      });
    });

    it("allows removing an admin when there are >= 2 admins (count=2)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "other-admin",
                    tenant_id: "tenant-456",
                    role: "gestor",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ count: 2 }),
              }),
            }),
          };
        }
        return { delete: vi.fn().mockReturnValue({ eq: mockDeleteEq }) };
      });

      const result = await removeTeamMember("other-admin");

      expect(result).toEqual({ success: true });
      expect(mockDeleteEq).toHaveBeenCalledWith("id", "other-admin");
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
            in: vi.fn().mockResolvedValue({
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
            in: vi.fn().mockResolvedValue({
              count: 2,
            }),
          }),
        }),
      });

      const result = await isOnlyAdmin();

      expect(result).toBe(false);
    });

    it("should return true (fail-closed) when the count is null (Story 20.5 AC6)", async () => {
      // A read error returning count:null must be treated as "only admin" so the
      // UI keeps the remove action disabled — never fail-open to enabling it.
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ count: null }),
          }),
        }),
      });

      const result = await isOnlyAdmin();

      expect(result).toBe(true);
    });

    it("should return true (fail-closed) when the read throws (Story 20.5 AC6)", async () => {
      // Uma exceção (rede/RLS) NUNCA pode liberar a remoção: o catch fail-closed
      // assume "único admin" (true). Cobre o caminho catch -> return true
      // (antes só o count:null era testado, não a exceção).
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      vi.mocked(getCurrentUserProfile).mockRejectedValue(new Error("boom"));

      const result = await isOnlyAdmin();

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ==============================================
  // UPDATE MEMBER ROLE
  // ==============================================

  describe("updateMemberRole", () => {
    const TARGET_ID = "11111111-1111-4111-8111-111111111111";

    it("should reject an invalid role", async () => {
      const result = await updateMemberRole(TARGET_ID, "superadmin" as never);

      expect(result).toEqual({ success: false, error: "Dados inválidos" });
    });

    it("should require authentication", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

      const result = await updateMemberRole(TARGET_ID, "gestor");

      expect(result).toEqual({ success: false, error: "Não autenticado" });
    });

    it("should require admin role", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockUserProfile);

      const result = await updateMemberRole(TARGET_ID, "gestor");

      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem alterar papéis.",
      });
    });

    it("should prevent updating a user from a different tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "other-user",
                tenant_id: "different-tenant",
                role: "sdr",
              },
              error: null,
            }),
          }),
        }),
      });

      const result = await updateMemberRole(TARGET_ID, "gestor");

      expect(result).toEqual({
        success: false,
        error: "Usuário não encontrado.",
      });
    });

    it("should prevent demoting the only admin of the tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // Named spies so we can assert the last-admin count is correctly scoped
      // (tenant_id + role IN ADMIN_ROLES). A regression dropping either
      // predicate would silently break the last-admin protection.
      const mockCountIn = vi.fn().mockResolvedValue({ count: 1 });
      const mockCountEq = vi.fn().mockReturnValue({ in: mockCountIn });

      // First from() call = profile fetch, second = admin count
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "the-admin",
                    tenant_id: "tenant-456",
                    role: "gestor",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: mockCountEq,
          }),
        };
      });

      const result = await updateMemberRole(TARGET_ID, "sdr");

      expect(result).toEqual({
        success: false,
        error: "Não é possível rebaixar o único administrador.",
      });
      // The count that guards the last admin MUST be scoped to the tenant AND
      // restricted to admin roles — pin both predicates against regression.
      expect(mockCountEq).toHaveBeenCalledWith("tenant_id", "tenant-456");
      expect(mockCountIn).toHaveBeenCalledWith("role", ["gestor", "diretor"]);
    });

    it("blocks demotion when the admin count is null (fail-closed, Story 20.5 AC6)", async () => {
      // A read error returning count:null must NEVER let a demotion proceed —
      // the old `=== 1` check let null fall through (fail-open).
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "the-admin",
                    tenant_id: "tenant-456",
                    role: "gestor",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ count: null }),
            }),
          }),
        };
      });

      const result = await updateMemberRole(TARGET_ID, "sdr");

      expect(result).toEqual({
        success: false,
        error: "Não é possível rebaixar o único administrador.",
      });
    });

    it("allows demotion when there are >= 2 admins (count=2)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      const mockUpdateSelect = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "other-admin" }], error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "other-admin",
                    tenant_id: "tenant-456",
                    role: "gestor",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ count: 2 }),
              }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ select: mockUpdateSelect }),
            }),
          }),
        };
      });

      const result = await updateMemberRole(TARGET_ID, "sdr");

      expect(result).toEqual({ success: true });
      expect(mockUpdateSelect).toHaveBeenCalledWith("id");
    });

    it("should update member role successfully (promote sdr -> gestor)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // Named spies so we can assert the UPDATE is tenant-scoped
      // (.eq("id") + .eq("tenant_id") + .select("id")) — defense-in-depth that
      // a regression must not silently drop.
      const mockUpdateSelect = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "other-user" }], error: null });
      const mockUpdateEqTenant = vi
        .fn()
        .mockReturnValue({ select: mockUpdateSelect });
      const mockUpdateEqId = vi.fn().mockReturnValue({ eq: mockUpdateEqTenant });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEqId });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "other-user",
                    tenant_id: "tenant-456",
                    role: "sdr",
                  },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      });

      const result = await updateMemberRole(TARGET_ID, "gestor");

      expect(result).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalledWith({ role: "gestor" });
      // Pin the tenant-scoped write so a dropped predicate is caught.
      expect(mockUpdateEqId).toHaveBeenCalledWith("id", TARGET_ID);
      expect(mockUpdateEqTenant).toHaveBeenCalledWith("tenant_id", "tenant-456");
      expect(mockUpdateSelect).toHaveBeenCalledWith("id");
    });

    it("should allow a diretor to change a member's role (diretor has admin access)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockDiretorProfile);

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: "other-user" }],
              error: null,
            }),
          }),
        }),
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
                    role: "sdr",
                  },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      });

      const result = await updateMemberRole(TARGET_ID, "diretor");

      expect(result).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalledWith({ role: "diretor" });
    });

    it("should NOT report success when the update affects no rows (RLS blocked / race)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(mockAdminProfile);

      // Update returns no error but zero affected rows (RLS filtered the write)
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
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
                    role: "sdr",
                  },
                  error: null,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      });

      const result = await updateMemberRole(TARGET_ID, "gestor");

      expect(result).toEqual({
        success: false,
        error: "Não foi possível alterar o papel do usuário.",
      });
    });
  });

  // ==============================================
  // APPLY INVITED ROLE ON ACCEPTANCE (Story 20.4 — deliverable B)
  // ==============================================

  describe("applyInvitedRoleOnAcceptance", () => {
    const ACCEPTING_USER = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "invited@tdec.com.br",
    };

    /**
     * Builds the admin client `from()` mock. `team_invitations` exposes BOTH the
     * lookup chain (.select().eq().eq().gt().order().limit()) and the accept chain
     * (.update().eq()); `profiles` exposes the promote chain (.update().eq().select()).
     * Named spies are returned so individual tests can pin the security predicates.
     */
    function buildAdminFrom({
      invitations = [],
      lookupError = null,
      profileUpdated = [{ id: ACCEPTING_USER.id }],
      profileUpdateError = null,
      acceptError = null,
    } = {}) {
      const gt = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue({ data: invitations, error: lookupError }),
        }),
      });
      const lookupEq2 = vi.fn().mockReturnValue({ gt });
      const lookupEq1 = vi.fn().mockReturnValue({ eq: lookupEq2 });
      const lookupSelect = vi.fn().mockReturnValue({ eq: lookupEq1 });

      const acceptEq = vi.fn().mockResolvedValue({ error: acceptError });
      const inviteUpdate = vi.fn().mockReturnValue({ eq: acceptEq });

      const profileSelect = vi
        .fn()
        .mockResolvedValue({ data: profileUpdated, error: profileUpdateError });
      const profileEq = vi.fn().mockReturnValue({ select: profileSelect });
      const profileUpdate = vi.fn().mockReturnValue({ eq: profileEq });

      const spies = {
        lookupSelect,
        lookupEq1,
        lookupEq2,
        gt,
        inviteUpdate,
        acceptEq,
        profileUpdate,
        profileEq,
        profileSelect,
      };

      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === "team_invitations") {
          return { select: lookupSelect, update: inviteUpdate };
        }
        if (table === "profiles") {
          return { update: profileUpdate };
        }
        return {};
      });

      return spies;
    }

    function mockAuthUser(user: unknown) {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user },
        error: null,
      });
    }

    it("(b) no-op (applied:false) when there is no pending invitation", async () => {
      mockAuthUser(ACCEPTING_USER);
      const spies = buildAdminFrom({ invitations: [] });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({ success: true, data: { applied: false } });
      // Never touches the profile when there is nothing to apply.
      expect(spies.profileUpdate).not.toHaveBeenCalled();
    });

    it("no-op (applied:false) when there is no active session", async () => {
      mockAuthUser(null);
      const spies = buildAdminFrom();

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({ success: true, data: { applied: false } });
      // No session → must not even look up invitations or write the profile.
      expect(mockAdminClient.from).not.toHaveBeenCalled();
      expect(spies.profileUpdate).not.toHaveBeenCalled();
    });

    it("(a) applies the invited role+tenant and marks the invitation accepted", async () => {
      mockAuthUser(ACCEPTING_USER);
      const spies = buildAdminFrom({
        invitations: [
          {
            id: "inv-1",
            role: "gestor",
            tenant_id: "tenant-from-invite",
          },
        ],
      });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({ success: true, data: { applied: true } });
      // Role AND tenant come from the invitation row, written by the user id.
      expect(spies.profileUpdate).toHaveBeenCalledWith({
        role: "gestor",
        tenant_id: "tenant-from-invite",
      });
      expect(spies.profileEq).toHaveBeenCalledWith("id", ACCEPTING_USER.id);
      expect(spies.profileSelect).toHaveBeenCalledWith("id");
      // Lookup is scoped to the authenticated e-mail + pending status.
      expect(spies.lookupEq1).toHaveBeenCalledWith("email", ACCEPTING_USER.email);
      expect(spies.lookupEq2).toHaveBeenCalledWith("status", "pending");
      // Invitation is marked accepted afterwards.
      expect(spies.inviteUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted" })
      );
      expect(spies.acceptEq).toHaveBeenCalledWith("id", "inv-1");
    });

    it("(f) supports the diretor role", async () => {
      mockAuthUser(ACCEPTING_USER);
      const spies = buildAdminFrom({
        invitations: [
          { id: "inv-2", role: "diretor", tenant_id: "tenant-x" },
        ],
      });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({ success: true, data: { applied: true } });
      expect(spies.profileUpdate).toHaveBeenCalledWith({
        role: "diretor",
        tenant_id: "tenant-x",
      });
    });

    it("(c) filters expired invitations by expires_at (no-op, profile stays sdr)", async () => {
      mockAuthUser(ACCEPTING_USER);
      // An expired invite is excluded by the .gt("expires_at", now) predicate, so
      // the DB returns no row → the action no-ops and never promotes the profile.
      const spies = buildAdminFrom({ invitations: [] });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({ success: true, data: { applied: false } });
      // Pin the expiry predicate so a regression dropping it is caught.
      expect(spies.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
      expect(spies.profileUpdate).not.toHaveBeenCalled();
    });

    it("(d) ignores raw_user_meta_data.role — no invitation means no promotion", async () => {
      // Even if the user metadata claims an elevated role, with no pending
      // invitation the profile must NOT be promoted (AD-5 anti-escalation).
      mockAuthUser({
        ...ACCEPTING_USER,
        user_metadata: { role: "gestor" },
        raw_user_meta_data: { role: "gestor" },
      });
      const spies = buildAdminFrom({ invitations: [] });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({ success: true, data: { applied: false } });
      expect(spies.profileUpdate).not.toHaveBeenCalled();
    });

    it("rejects an invitation carrying an invalid role (no write)", async () => {
      mockAuthUser(ACCEPTING_USER);
      const spies = buildAdminFrom({
        invitations: [
          { id: "inv-bad", role: "superadmin", tenant_id: "tenant-x" },
        ],
      });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({
        success: false,
        error: "Papel do convite inválido.",
      });
      expect(spies.profileUpdate).not.toHaveBeenCalled();
    });

    it("(e) does NOT report success when the profile update affects 0 rows", async () => {
      mockAuthUser(ACCEPTING_USER);
      const spies = buildAdminFrom({
        invitations: [
          { id: "inv-1", role: "gestor", tenant_id: "tenant-x" },
        ],
        profileUpdated: [], // RLS blocked / profile missing → 0 rows
      });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({
        success: false,
        error: "Não foi possível aplicar o papel do convite.",
      });
      // The invitation must NOT be marked accepted if the role was not applied.
      expect(spies.inviteUpdate).not.toHaveBeenCalled();
    });

    it("returns an error when the invitation lookup itself fails", async () => {
      mockAuthUser(ACCEPTING_USER);
      buildAdminFrom({ lookupError: { message: "db down" } });

      const result = await applyInvitedRoleOnAcceptance();

      expect(result).toEqual({
        success: false,
        error: "Erro ao verificar o convite.",
      });
    });

    it("still succeeds (applied:true) if marking the invitation accepted fails", async () => {
      mockAuthUser(ACCEPTING_USER);
      const spies = buildAdminFrom({
        invitations: [
          { id: "inv-1", role: "sdr", tenant_id: "tenant-x" },
        ],
        acceptError: { message: "update failed" },
      });

      const result = await applyInvitedRoleOnAcceptance();

      // The role was applied; failing to flag the invite must not undo that.
      expect(result).toEqual({ success: true, data: { applied: true } });
      expect(spies.profileUpdate).toHaveBeenCalled();
    });
  });
});
