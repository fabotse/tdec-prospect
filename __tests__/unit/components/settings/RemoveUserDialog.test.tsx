import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock hooks
vi.mock("@/hooks/use-team-members", () => ({
  useTeamMembers: vi.fn(),
}));

import { RemoveUserDialog } from "@/components/settings/RemoveUserDialog";
import { useTeamMembers } from "@/hooks/use-team-members";
import { toast } from "sonner";
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

describe("RemoveUserDialog", () => {
  const mockRemoveMember = vi.fn();
  const mockCancelInvite = vi.fn();
  const mockOnOpenChange = vi.fn();

  const activeMember: TeamMember = {
    id: "user-1",
    full_name: "John Doe",
    email: "john@example.com",
    role: "user",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
  };

  const pendingMember: TeamMember = {
    id: "inv-1",
    full_name: null,
    email: "pending@example.com",
    role: "user",
    status: "pending",
    created_at: "2026-01-02T00:00:00Z",
    invitation_id: "inv-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useTeamMembers).mockReturnValue({
      members: [],
      isLoading: false,
      error: null,
      inviteUser: vi.fn(),
      isInviting: false,
      removeMember: mockRemoveMember,
      isRemoving: false,
      cancelInvite: mockCancelInvite,
      isCanceling: false,
    });
  });

  // ==============================================
  // DIALOG VISIBILITY
  // ==============================================

  describe("dialog visibility", () => {
    it("should not render when not open", () => {
      render(
        <RemoveUserDialog
          member={activeMember}
          open={false}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("should render when open", () => {
      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  // ==============================================
  // REMOVE MODE
  // ==============================================

  describe("remove mode", () => {
    it("should show correct title for remove mode", () => {
      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Remover Usuário")).toBeInTheDocument();
    });

    it("should show member name in confirmation message", () => {
      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(
        screen.getByText(/Tem certeza que deseja remover/i)
      ).toBeInTheDocument();
    });

    it("should show email if full_name is null", () => {
      const memberWithoutName: TeamMember = {
        ...activeMember,
        full_name: null,
      };

      render(
        <RemoveUserDialog
          member={memberWithoutName}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("john@example.com")).toBeInTheDocument();
    });

    it("should show warning about irreversibility", () => {
      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      expect(
        screen.getByText(/Esta ação não pode ser desfeita/i)
      ).toBeInTheDocument();
    });

    it("should call removeMember when confirming", async () => {
      const user = userEvent.setup();
      mockRemoveMember.mockResolvedValue({ success: true });

      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      const confirmButton = screen.getByRole("button", { name: /Remover/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockRemoveMember).toHaveBeenCalledWith("user-1");
      });
    });

    it("should show success toast on successful removal", async () => {
      const user = userEvent.setup();
      mockRemoveMember.mockResolvedValue({ success: true });

      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByRole("button", { name: /Remover/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Usuário removido com sucesso"
        );
      });
    });

    it("should close dialog on successful removal", async () => {
      const user = userEvent.setup();
      mockRemoveMember.mockResolvedValue({ success: true });

      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByRole("button", { name: /Remover/i }));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("should show error toast on failed removal", async () => {
      const user = userEvent.setup();
      mockRemoveMember.mockResolvedValue({
        success: false,
        error: "Não é possível remover o único administrador.",
      });

      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByRole("button", { name: /Remover/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Não é possível remover o único administrador."
        );
      });
    });
  });

  // ==============================================
  // CANCEL INVITE MODE
  // ==============================================

  describe("cancel-invite mode", () => {
    it("should show correct title for cancel-invite mode", () => {
      render(
        <RemoveUserDialog
          member={pendingMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="cancel-invite"
        />,
        { wrapper: createWrapper() }
      );

      // Use heading role to specifically target the title, not the button
      expect(
        screen.getByRole("heading", { name: /Cancelar Convite/i })
      ).toBeInTheDocument();
    });

    it("should show email in confirmation for pending invitation", () => {
      render(
        <RemoveUserDialog
          member={pendingMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="cancel-invite"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("pending@example.com")).toBeInTheDocument();
      expect(
        screen.getByText(/Tem certeza que deseja cancelar o convite/i)
      ).toBeInTheDocument();
    });

    it("should call cancelInvite when confirming", async () => {
      const user = userEvent.setup();
      mockCancelInvite.mockResolvedValue({ success: true });

      render(
        <RemoveUserDialog
          member={pendingMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="cancel-invite"
        />,
        { wrapper: createWrapper() }
      );

      const confirmButton = screen.getByRole("button", {
        name: /Cancelar Convite/i,
      });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockCancelInvite).toHaveBeenCalledWith("inv-1");
      });
    });

    it("should show success toast on successful cancellation", async () => {
      const user = userEvent.setup();
      mockCancelInvite.mockResolvedValue({ success: true });

      render(
        <RemoveUserDialog
          member={pendingMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="cancel-invite"
        />,
        { wrapper: createWrapper() }
      );

      await user.click(
        screen.getByRole("button", { name: /Cancelar Convite/i })
      );

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Convite cancelado");
      });
    });

    it("should show error toast on failed cancellation", async () => {
      const user = userEvent.setup();
      mockCancelInvite.mockResolvedValue({
        success: false,
        error: "Erro ao cancelar convite",
      });

      render(
        <RemoveUserDialog
          member={pendingMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="cancel-invite"
        />,
        { wrapper: createWrapper() }
      );

      await user.click(
        screen.getByRole("button", { name: /Cancelar Convite/i })
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao cancelar convite");
      });
    });
  });

  // ==============================================
  // LOADING STATE
  // ==============================================

  describe("loading state", () => {
    it("should show loading state during removal", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: mockRemoveMember,
        isRemoving: true,
        cancelInvite: mockCancelInvite,
        isCanceling: false,
      });

      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Removendo.../i)).toBeInTheDocument();
    });

    it("should show loading state during cancellation", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: mockRemoveMember,
        isRemoving: false,
        cancelInvite: mockCancelInvite,
        isCanceling: true,
      });

      render(
        <RemoveUserDialog
          member={pendingMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="cancel-invite"
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Cancelando.../i)).toBeInTheDocument();
    });

    it("should disable buttons during loading", () => {
      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: false,
        error: null,
        inviteUser: vi.fn(),
        isInviting: false,
        removeMember: mockRemoveMember,
        isRemoving: true,
        cancelInvite: mockCancelInvite,
        isCanceling: false,
      });

      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      const cancelButton = screen.getByRole("button", { name: /Cancelar/i });
      const confirmButton = screen.getByText(/Removendo.../i).closest("button");

      expect(cancelButton).toBeDisabled();
      expect(confirmButton).toBeDisabled();
    });
  });

  // ==============================================
  // CANCEL BUTTON
  // ==============================================

  describe("cancel button", () => {
    it("should close dialog when clicking cancel", async () => {
      const user = userEvent.setup();

      render(
        <RemoveUserDialog
          member={activeMember}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByRole("button", { name: /Cancelar/i }));

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ==============================================
  // NULL MEMBER HANDLING
  // ==============================================

  describe("null member handling", () => {
    it("should not crash with null member", async () => {
      const user = userEvent.setup();

      render(
        <RemoveUserDialog
          member={null}
          open={true}
          onOpenChange={mockOnOpenChange}
          mode="remove"
        />,
        { wrapper: createWrapper() }
      );

      // Should render without crashing
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      // Clicking confirm should not call removeMember
      await user.click(screen.getByRole("button", { name: /Remover/i }));

      expect(mockRemoveMember).not.toHaveBeenCalled();
    });
  });
});
