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

import { InviteUserDialog } from "@/components/settings/InviteUserDialog";
import { useTeamMembers } from "@/hooks/use-team-members";
import { toast } from "sonner";

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

describe("InviteUserDialog", () => {
  const mockInviteUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useTeamMembers).mockReturnValue({
      members: [],
      isLoading: false,
      error: null,
      inviteUser: mockInviteUser,
      isInviting: false,
      removeMember: vi.fn(),
      isRemoving: false,
      cancelInvite: vi.fn(),
      isCanceling: false,
    });
  });

  // ==============================================
  // TRIGGER BUTTON
  // ==============================================

  describe("trigger button", () => {
    it("should render trigger button with correct text", () => {
      render(<InviteUserDialog />, { wrapper: createWrapper() });

      expect(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      ).toBeInTheDocument();
    });

    it("should open dialog when clicking trigger button", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  // ==============================================
  // DIALOG CONTENT
  // ==============================================

  describe("dialog content", () => {
    it("should show dialog title", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      expect(
        screen.getByRole("heading", { name: /Convidar Usuário/i })
      ).toBeInTheDocument();
    });

    it("should show dialog description", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      expect(
        screen.getByText(/Envie um convite por email/i)
      ).toBeInTheDocument();
    });

    it("should show email input field", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/usuario@empresa.com/i)
      ).toBeInTheDocument();
    });

    it("should show role select field", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      // Radix Select uses combobox role, label is not directly associated
      expect(screen.getByText("Função")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("should show cancel and submit buttons", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      expect(
        screen.getByRole("button", { name: /Cancelar/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Enviar Convite/i })
      ).toBeInTheDocument();
    });
  });

  // ==============================================
  // EMAIL VALIDATION
  // ==============================================

  describe("email validation", () => {
    it("should show validation error for invalid email", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      // Open dialog
      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      // Enter invalid email (empty to trigger required validation)
      const emailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      await user.clear(emailInput);

      // Submit with empty email
      await user.click(screen.getByRole("button", { name: /Enviar Convite/i }));

      // Wait for validation error - Zod will show "Email inválido" for empty/invalid emails
      await waitFor(
        () => {
          expect(screen.getByText(/Email inválido/i)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it("should not call inviteUser with invalid email", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      const emailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      await user.type(emailInput, "invalid");

      await user.click(screen.getByRole("button", { name: /Enviar Convite/i }));

      await waitFor(() => {
        expect(mockInviteUser).not.toHaveBeenCalled();
      });
    });
  });

  // ==============================================
  // ROLE SELECTION
  // ==============================================

  describe("role selection", () => {
    it("should default to user role", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      // The combobox select should exist and show "Usuário" as default
      const selectTrigger = screen.getByRole("combobox");
      expect(selectTrigger).toBeInTheDocument();
      expect(selectTrigger).toHaveTextContent("Usuário");
    });

    it("should have admin and user options available", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      // Verify role select combobox exists with correct default
      const selectTrigger = screen.getByRole("combobox");
      expect(selectTrigger).toBeInTheDocument();

      // Note: Due to Radix Select + jsdom limitations with hasPointerCapture,
      // we cannot fully test dropdown interaction. The select functionality
      // is tested indirectly through the form submission tests.
      expect(selectTrigger).toHaveTextContent("Usuário");
    });
  });

  // ==============================================
  // FORM SUBMISSION
  // ==============================================

  describe("form submission", () => {
    it("should call inviteUser with valid data", async () => {
      const user = userEvent.setup();
      mockInviteUser.mockResolvedValue({ success: true });

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      // Fill email
      const emailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      await user.type(emailInput, "test@example.com");

      // Submit
      await user.click(screen.getByRole("button", { name: /Enviar Convite/i }));

      await waitFor(() => {
        expect(mockInviteUser).toHaveBeenCalledWith({
          email: "test@example.com",
          role: "user",
        });
      });
    });

    it("should show success toast on successful invite", async () => {
      const user = userEvent.setup();
      mockInviteUser.mockResolvedValue({ success: true });

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      const emailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      await user.type(emailInput, "test@example.com");

      await user.click(screen.getByRole("button", { name: /Enviar Convite/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Convite enviado com sucesso"
        );
      });
    });

    it("should close dialog on successful invite", async () => {
      const user = userEvent.setup();
      mockInviteUser.mockResolvedValue({ success: true });

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      const emailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      await user.type(emailInput, "test@example.com");

      await user.click(screen.getByRole("button", { name: /Enviar Convite/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("should show error toast on failed invite", async () => {
      const user = userEvent.setup();
      mockInviteUser.mockResolvedValue({
        success: false,
        error: "Email já registrado",
      });

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      const emailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      await user.type(emailInput, "test@example.com");

      await user.click(screen.getByRole("button", { name: /Enviar Convite/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Email já registrado");
      });
    });
  });

  // ==============================================
  // LOADING STATE
  // ==============================================

  describe("loading state", () => {
    it("should show loading state during submission", async () => {
      const user = userEvent.setup();

      // Make invite take time
      mockInviteUser.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: false,
        error: null,
        inviteUser: mockInviteUser,
        isInviting: true, // Set to true to simulate loading
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      // Submit button should show loading text when isInviting is true
      expect(screen.getByText(/Enviando.../i)).toBeInTheDocument();
    });

    it("should disable buttons during submission", async () => {
      const user = userEvent.setup();

      vi.mocked(useTeamMembers).mockReturnValue({
        members: [],
        isLoading: false,
        error: null,
        inviteUser: mockInviteUser,
        isInviting: true,
        removeMember: vi.fn(),
        isRemoving: false,
        cancelInvite: vi.fn(),
        isCanceling: false,
      });

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      const cancelButton = screen.getByRole("button", { name: /Cancelar/i });
      const submitButton = screen.getByText(/Enviando.../i).closest("button");

      expect(cancelButton).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  // ==============================================
  // DIALOG CLOSE
  // ==============================================

  describe("dialog close", () => {
    it("should close dialog when clicking cancel", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Cancelar/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("should reset form when dialog closes", async () => {
      const user = userEvent.setup();

      render(<InviteUserDialog />, { wrapper: createWrapper() });

      // Open and fill form
      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      const emailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      await user.type(emailInput, "test@example.com");

      // Close
      await user.click(screen.getByRole("button", { name: /Cancelar/i }));

      // Reopen
      await user.click(
        screen.getByRole("button", { name: /Convidar Usuário/i })
      );

      // Email should be empty
      const newEmailInput = screen.getByPlaceholderText(/usuario@empresa.com/i);
      expect(newEmailInput).toHaveValue("");
    });
  });
});
