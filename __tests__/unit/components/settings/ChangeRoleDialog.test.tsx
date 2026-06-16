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

import { ChangeRoleDialog } from "@/components/settings/ChangeRoleDialog";
import { useTeamMembers } from "@/hooks/use-team-members";
import { toast } from "sonner";
import type { TeamMember } from "@/types/team";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("ChangeRoleDialog", () => {
  const mockUpdateMemberRole = vi.fn();
  const mockOnOpenChange = vi.fn();

  const member: TeamMember = {
    id: "member-1",
    full_name: "Jane Smith",
    email: "jane@example.com",
    role: "sdr",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
  };

  function setHookState(overrides: Record<string, unknown> = {}) {
    vi.mocked(useTeamMembers).mockReturnValue({
      members: [],
      isLoading: false,
      error: null,
      inviteUser: vi.fn(),
      isInviting: false,
      updateMemberRole: mockUpdateMemberRole,
      isUpdatingRole: false,
      removeMember: vi.fn(),
      isRemoving: false,
      cancelInvite: vi.fn(),
      isCanceling: false,
      ...overrides,
    } as unknown as ReturnType<typeof useTeamMembers>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setHookState();
  });

  it("should not render dialog content when closed", () => {
    render(
      <ChangeRoleDialog
        member={member}
        open={false}
        onOpenChange={mockOnOpenChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should render title and the member name when open", () => {
    render(
      <ChangeRoleDialog
        member={member}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(
      screen.getByRole("heading", { name: /Alterar Função/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it("should show a role select initialized to the member's current role", () => {
    render(
      <ChangeRoleDialog
        member={member}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
      { wrapper: createWrapper() }
    );

    const selectTrigger = screen.getByRole("combobox");
    expect(selectTrigger).toBeInTheDocument();
    // sdr → "SDR"
    expect(selectTrigger).toHaveTextContent("SDR");
  });

  it("should call updateMemberRole and show success toast on save", async () => {
    const user = userEvent.setup();
    mockUpdateMemberRole.mockResolvedValue({ success: true });

    render(
      <ChangeRoleDialog
        member={member}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
      { wrapper: createWrapper() }
    );

    await user.click(screen.getByRole("button", { name: /Salvar/i }));

    await waitFor(() => {
      expect(mockUpdateMemberRole).toHaveBeenCalledWith("member-1", "sdr");
    });
    expect(toast.success).toHaveBeenCalledWith("Papel atualizado com sucesso");
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("should show error toast and keep dialog open on failure", async () => {
    const user = userEvent.setup();
    mockUpdateMemberRole.mockResolvedValue({
      success: false,
      error: "Não é possível rebaixar o único administrador.",
    });

    render(
      <ChangeRoleDialog
        member={member}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
      { wrapper: createWrapper() }
    );

    await user.click(screen.getByRole("button", { name: /Salvar/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Não é possível rebaixar o único administrador."
      );
    });
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("should disable buttons and show saving label while updating", () => {
    setHookState({ isUpdatingRole: true });

    render(
      <ChangeRoleDialog
        member={member}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/Salvando.../i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar/i })).toBeDisabled();
  });

  it("should close dialog when clicking Cancelar", async () => {
    const user = userEvent.setup();

    render(
      <ChangeRoleDialog
        member={member}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
      { wrapper: createWrapper() }
    );

    await user.click(screen.getByRole("button", { name: /Cancelar/i }));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});
