/**
 * CreateCampaignDialog Component Tests
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #4 - Create campaign with name, redirect to builder
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CreateCampaignDialog } from "@/components/campaigns/CreateCampaignDialog";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("CreateCampaignDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("shows dialog when open is true", () => {
      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Nova Campanha")).toBeInTheDocument();
      expect(
        screen.getByText("Crie uma nova campanha de outreach para seus leads.")
      ).toBeInTheDocument();
    });

    it("does not show dialog when open is false", () => {
      render(
        <CreateCampaignDialog open={false} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByText("Nova Campanha")).not.toBeInTheDocument();
    });

    it("shows name input field", () => {
      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByLabelText("Nome da Campanha")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Ex: Prospecao Q1 2026")
      ).toBeInTheDocument();
    });

    it("shows cancel and create buttons", () => {
      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Criar Campanha" })
      ).toBeInTheDocument();
    });
  });

  describe("Form Submission (AC: #4)", () => {
    it("creates campaign and redirects to builder on success", async () => {
      const user = userEvent.setup();
      const createdCampaign = {
        id: "campaign-new",
        tenantId: "tenant-1",
        name: "Test Campaign",
        status: "draft",
        createdAt: "2026-02-02T10:00:00Z",
        updatedAt: "2026-02-02T10:00:00Z",
        leadCount: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createdCampaign }),
      });

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      const input = screen.getByTestId("campaign-name-input");
      await user.type(input, "Test Campaign");

      const submitButton = screen.getByTestId("create-campaign-submit");
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test Campaign" }),
        });
      });

      await waitFor(() => {
        // Should redirect to builder
        expect(mockPush).toHaveBeenCalledWith("/campaigns/campaign-new/edit");
      });

      await waitFor(() => {
        // Should close dialog
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("shows error toast on creation failure", async () => {
      const user = userEvent.setup();
      const { toast } = await import("sonner");

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao criar campanha" },
        }),
      });

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      const input = screen.getByTestId("campaign-name-input");
      await user.type(input, "Test Campaign");

      const submitButton = screen.getByTestId("create-campaign-submit");
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao criar campanha");
      });
    });

    it("shows loading state while creating", async () => {
      const user = userEvent.setup();

      // Never resolve the fetch to keep loading state
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          })
      );

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      const input = screen.getByTestId("campaign-name-input");
      await user.type(input, "Test Campaign");

      const submitButton = screen.getByTestId("create-campaign-submit");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Criando...")).toBeInTheDocument();
      });
    });
  });

  describe("Form Validation", () => {
    it("shows error for empty name on submit", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      const submitButton = screen.getByTestId("create-campaign-submit");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId("campaign-name-error")).toBeInTheDocument();
      });

      // Should not call API with empty name
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Dialog Controls", () => {
    it("closes dialog when cancel is clicked", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      const cancelButton = screen.getByRole("button", { name: "Cancelar" });
      await user.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("resets form when dialog is closed via cancel button", async () => {
      const user = userEvent.setup();
      let isOpen = true;
      const handleOpenChange = (open: boolean) => {
        isOpen = open;
      };

      const { rerender } = render(
        <CreateCampaignDialog open={isOpen} onOpenChange={handleOpenChange} />,
        { wrapper: createWrapper() }
      );

      // Type something
      const input = screen.getByTestId("campaign-name-input");
      await user.type(input, "Test Campaign");
      expect(input).toHaveValue("Test Campaign");

      // Close dialog via cancel button (this triggers handleOpenChange which resets the form)
      const cancelButton = screen.getByRole("button", { name: "Cancelar" });
      await user.click(cancelButton);

      // Rerender with dialog closed
      rerender(
        <CreateCampaignDialog open={false} onOpenChange={handleOpenChange} />
      );

      // Reopen dialog
      rerender(
        <CreateCampaignDialog open={true} onOpenChange={handleOpenChange} />
      );

      // Input should be reset because handleOpenChange(false) was called
      const newInput = screen.getByTestId("campaign-name-input");
      expect(newInput).toHaveValue("");
    });
  });
});
