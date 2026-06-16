import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock server actions
vi.mock("@/actions/team", () => ({
  getTeamMembers: vi.fn(),
  inviteUser: vi.fn(),
  removeTeamMember: vi.fn(),
  cancelInvitation: vi.fn(),
  isOnlyAdmin: vi.fn(),
  updateMemberRole: vi.fn(),
}));

import {
  getTeamMembers,
  inviteUser,
  removeTeamMember,
  cancelInvitation,
  isOnlyAdmin,
  updateMemberRole,
} from "@/actions/team";
import { useTeamMembers, useIsOnlyAdmin } from "@/hooks/use-team-members";

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useTeamMembers", () => {
  const mockMembers = [
    {
      id: "user-1",
      full_name: "John Doe",
      email: "john@example.com",
      role: "gestor" as const,
      status: "active" as const,
      created_at: "2026-01-01",
    },
    {
      id: "inv-1",
      full_name: null,
      email: "pending@example.com",
      role: "sdr" as const,
      status: "pending" as const,
      created_at: "2026-01-02",
      invitation_id: "inv-1",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(getTeamMembers).mockResolvedValue({
      success: true,
      data: mockMembers,
    });
  });

  describe("fetching members", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should fetch team members on mount", async () => {
      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(getTeamMembers).toHaveBeenCalledTimes(1);
      expect(result.current.members).toHaveLength(2);
    });

    it("should return members data after fetch", async () => {
      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.members[0]).toMatchObject({
        id: "user-1",
        full_name: "John Doe",
        email: "john@example.com",
        role: "gestor",
        status: "active",
      });
    });

    it("should handle loading state correctly", async () => {
      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.members).toEqual([]);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.members).toHaveLength(2);
    });

    it("should set error message on fetch failure", async () => {
      vi.mocked(getTeamMembers).mockResolvedValue({
        success: false,
        error: "Erro ao carregar equipe",
      });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      // Wait for error to be set
      await waitFor(
        () => {
          expect(result.current.error).toBeTruthy();
        },
        { timeout: 2000 }
      );
    });
  });

  describe("inviteUser", () => {
    it("should call inviteUser action", async () => {
      vi.mocked(inviteUser).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.inviteUser({
          email: "new@example.com",
          role: "sdr",
        });
      });

      expect(inviteUser).toHaveBeenCalledWith({
        email: "new@example.com",
        role: "sdr",
      });
    });

    it("should have isInviting property", async () => {
      vi.mocked(inviteUser).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // isInviting should be a boolean property
      expect(typeof result.current.isInviting).toBe("boolean");
    });

    it("should return success result", async () => {
      vi.mocked(inviteUser).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let inviteResult: unknown;
      await act(async () => {
        inviteResult = await result.current.inviteUser({
          email: "new@example.com",
          role: "sdr",
        });
      });

      expect(inviteResult).toEqual({ success: true });
    });

    it("should return error result", async () => {
      vi.mocked(inviteUser).mockResolvedValue({
        success: false,
        error: "Email inválido",
      });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let inviteResult: unknown;
      await act(async () => {
        inviteResult = await result.current.inviteUser({
          email: "invalid",
          role: "sdr",
        });
      });

      expect(inviteResult).toEqual({ success: false, error: "Email inválido" });
    });
  });

  describe("removeMember", () => {
    it("should call removeTeamMember action", async () => {
      vi.mocked(removeTeamMember).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.removeMember("user-1");
      });

      expect(removeTeamMember).toHaveBeenCalledWith("user-1");
    });

    it("should have isRemoving property", async () => {
      vi.mocked(removeTeamMember).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // isRemoving should be a boolean property
      expect(typeof result.current.isRemoving).toBe("boolean");
    });

    it("should call removeTeamMember and complete successfully", async () => {
      vi.mocked(removeTeamMember).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let removeResult: unknown;
      await act(async () => {
        removeResult = await result.current.removeMember("user-1");
      });

      expect(removeResult).toEqual({ success: true });
    });

    it("should return error result on failure", async () => {
      vi.mocked(removeTeamMember).mockResolvedValue({
        success: false,
        error: "Não é possível remover o único administrador.",
      });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let removeResult: unknown;
      await act(async () => {
        removeResult = await result.current.removeMember("user-1");
      });

      expect(removeResult).toEqual({
        success: false,
        error: "Não é possível remover o único administrador.",
      });
    });
  });

  describe("updateMemberRole", () => {
    it("should call updateMemberRole action with userId and role", async () => {
      vi.mocked(updateMemberRole).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateMemberRole("user-1", "diretor");
      });

      expect(updateMemberRole).toHaveBeenCalledWith("user-1", "diretor");
    });

    it("should have isUpdatingRole property", async () => {
      vi.mocked(updateMemberRole).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.isUpdatingRole).toBe("boolean");
    });

    it("should invalidate team and only-admin queries on success", async () => {
      vi.mocked(updateMemberRole).mockResolvedValue({ success: true });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useTeamMembers(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateMemberRole("user-1", "diretor");
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["team", "members"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["team", "isOnlyAdmin"],
      });
    });

    it("should return error result on failure", async () => {
      vi.mocked(updateMemberRole).mockResolvedValue({
        success: false,
        error: "Não é possível rebaixar o único administrador.",
      });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updateResult: unknown;
      await act(async () => {
        updateResult = await result.current.updateMemberRole("user-1", "sdr");
      });

      expect(updateResult).toEqual({
        success: false,
        error: "Não é possível rebaixar o único administrador.",
      });
    });
  });

  describe("cancelInvite", () => {
    it("should call cancelInvitation action", async () => {
      vi.mocked(cancelInvitation).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.cancelInvite("inv-1");
      });

      expect(cancelInvitation).toHaveBeenCalledWith("inv-1");
    });

    it("should have isCanceling property", async () => {
      vi.mocked(cancelInvitation).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // isCanceling should be a boolean property
      expect(typeof result.current.isCanceling).toBe("boolean");
    });

    it("should call cancelInvitation and complete successfully", async () => {
      vi.mocked(cancelInvitation).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useTeamMembers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let cancelResult: unknown;
      await act(async () => {
        cancelResult = await result.current.cancelInvite("inv-1");
      });

      expect(cancelResult).toEqual({ success: true });
    });
  });
});

describe("useIsOnlyAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when only admin", async () => {
    vi.mocked(isOnlyAdmin).mockResolvedValue(true);

    const { result } = renderHook(() => useIsOnlyAdmin(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe(true);
  });

  it("should return false when multiple admins", async () => {
    vi.mocked(isOnlyAdmin).mockResolvedValue(false);

    const { result } = renderHook(() => useIsOnlyAdmin(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe(false);
  });

  it("should call isOnlyAdmin action", async () => {
    vi.mocked(isOnlyAdmin).mockResolvedValue(true);

    renderHook(() => useIsOnlyAdmin(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(isOnlyAdmin).toHaveBeenCalledTimes(1);
    });
  });
});
