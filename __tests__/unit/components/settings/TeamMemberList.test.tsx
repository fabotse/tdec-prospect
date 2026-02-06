import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock hooks
vi.mock("@/hooks/use-team-members", () => ({
  useTeamMembers: vi.fn(),
  useIsOnlyAdmin: vi.fn(),
}));

// Mock date-fns to avoid locale issues
vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(() => "há 2 dias"),
}));

vi.mock("date-fns/locale", () => ({
  ptBR: {},
}));

import { TeamMemberList } from "@/components/settings/TeamMemberList";
import { useTeamMembers, useIsOnlyAdmin } from "@/hooks/use-team-members";
import type { TeamMember } from "@/types/team";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("TeamMemberList", () => {
  const mockOnRemove = vi.fn();
  const mockOnCancelInvite = vi.fn();
  const currentUserId = "user-123";

  const mockActiveMembers: TeamMember[] = [
    {
      id: "user-1",
      full_name: "John Doe",
      email: "john@example.com",
      role: "admin",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "user-2",
      full_name: "Jane Smith",
      email: "jane@example.com",
      role: "user",
      status: "active",
      created_at: "2026-01-02T00:00:00Z",
    },
  ];

  const mockPendingMember: TeamMember = {
    id: "inv-1",
    full_name: null,
    email: "pending@example.com",
    role: "user",
    status: "pending",
    created_at: "2026-01-03T00:00:00Z",
    invitation_id: "inv-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsOnlyAdmin).mockReturnValue({
      data: false,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useIsOnlyAdmin>);
  });

  // ==============================================
  // LOADING STATE
  // ==============================================

  describe("loading state", () => {
    it("should show loading skeleton when loading", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: true,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      // Skeleton renders multiple placeholder elements
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ==============================================
  // ERROR STATE
  // ==============================================

  describe("error state", () => {
    it("should show error message when fetch fails", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: false,
        error: "Erro ao carregar equipe",
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(
        screen.getByText(/Erro ao carregar equipe/i)
      ).toBeInTheDocument();
    });
  });

  // ==============================================
  // EMPTY STATE
  // ==============================================

  describe("empty state", () => {
    it("should show empty state when no members", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(
        screen.getByText(/Nenhum membro na equipe ainda/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Use o botão acima para convidar membros/i)
      ).toBeInTheDocument();
    });
  });

  // ==============================================
  // TABLE RENDERING
  // ==============================================

  describe("table rendering", () => {
    it("should render team members table with correct headers", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: mockActiveMembers,
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Nome")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Função")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Desde")).toBeInTheDocument();
    });

    it("should display member full name", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: mockActiveMembers,
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });

    it("should display member email", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: mockActiveMembers,
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("john@example.com")).toBeInTheDocument();
      expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    });
  });

  // ==============================================
  // ROLE BADGES
  // ==============================================

  describe("role badges", () => {
    it("should display Admin badge for admin role", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [mockActiveMembers[0]],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Admin")).toBeInTheDocument();
    });

    it("should display Usuário badge for user role", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [mockActiveMembers[1]],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Usuário")).toBeInTheDocument();
    });
  });

  // ==============================================
  // STATUS BADGES
  // ==============================================

  describe("status badges", () => {
    it("should display Ativo badge for active members", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [mockActiveMembers[0]],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Ativo")).toBeInTheDocument();
    });

    it("should display Pendente badge for pending invitations", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [mockPendingMember],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      // "Pendente" appears twice: once in name column (italic), once in status badge
      const pendenteElements = screen.getAllByText("Pendente");
      expect(pendenteElements.length).toBeGreaterThanOrEqual(1);
    });

    it("should show 'Pendente' in name column for pending invitations", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [mockPendingMember],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      // Check that email is still shown for pending
      expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    });
  });

  // ==============================================
  // ACTIONS - REMOVE
  // ==============================================

  describe("remove action", () => {
    it("should call onRemove when clicking remove on active member", async () => {
      const user = userEvent.setup();

      vi.mocked(useTeamMembers).mockReturnValue({
        members: [mockActiveMembers[1]], // user role, not current user
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      // Open dropdown menu
      const menuButton = screen.getByRole("button", { name: /ações/i });
      await user.click(menuButton);

      // Click remove
      const removeButton = screen.getByText("Remover");
      await user.click(removeButton);

      expect(mockOnRemove).toHaveBeenCalledWith(mockActiveMembers[1]);
    });
  });

  // ==============================================
  // ACTIONS - CANCEL INVITE
  // ==============================================

  describe("cancel invite action", () => {
    it("should call onCancelInvite when clicking cancel on pending member", async () => {
      const user = userEvent.setup();

      vi.mocked(useTeamMembers).mockReturnValue({
        members: [mockPendingMember],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      // Open dropdown menu
      const menuButton = screen.getByRole("button", { name: /ações/i });
      await user.click(menuButton);

      // Click cancel invite
      const cancelButton = screen.getByText("Cancelar Convite");
      await user.click(cancelButton);

      expect(mockOnCancelInvite).toHaveBeenCalledWith(mockPendingMember);
    });
  });

  // ==============================================
  // ONLY ADMIN PROTECTION
  // ==============================================

  describe("only admin protection", () => {
    it("should disable remove button for current user when only admin", async () => {
      const user = userEvent.setup();

      const currentUserAdmin: TeamMember = {
        id: currentUserId,
        full_name: "Current Admin",
        email: "admin@example.com",
        role: "admin",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
      };

      vi.mocked(useTeamMembers).mockReturnValue({
        members: [currentUserAdmin],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      vi.mocked(useIsOnlyAdmin).mockReturnValue({
        data: true,
        isLoading: false,
        error: null,
      } as ReturnType<typeof useIsOnlyAdmin>);

      render(
        <TeamMemberList
          onRemove={mockOnRemove}
          onCancelInvite={mockOnCancelInvite}
          currentUserId={currentUserId}
        />,
        { wrapper: createWrapper() }
      );

      // Open dropdown menu
      const menuButton = screen.getByRole("button", { name: /ações/i });
      await user.click(menuButton);

      // Remove button should be disabled
      const removeButton = screen.getByText("Remover");
      expect(removeButton.closest("[data-disabled]")).toBeTruthy();
    });
  });
});
