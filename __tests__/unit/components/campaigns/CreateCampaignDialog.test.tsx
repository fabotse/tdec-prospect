/**
 * CreateCampaignDialog Component Tests
 * Story 5.1: Campaigns Page & Data Model
 * Story 6.12: AI Campaign Structure Generation
 *
 * AC 5.1 #4 - Create campaign with name, redirect to builder
 * AC 6.12 #1 - Two creation options: "Criar Manualmente" and "Criar com IA"
 */

import { render, screen, waitFor } from "@testing-library/react";
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

// Mock AICampaignWizard to simplify testing
vi.mock("@/components/campaigns/AICampaignWizard", () => ({
  AICampaignWizard: ({ open, onBack }: { open: boolean; onBack: () => void }) =>
    open ? (
      <div data-testid="ai-campaign-wizard">
        <button onClick={onBack} data-testid="wizard-back-button">
          Voltar
        </button>
      </div>
    ) : null,
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

  describe("Mode Selection (Story 6.12 AC #1)", () => {
    it("shows mode selection when dialog opens", () => {
      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Nova Campanha")).toBeInTheDocument();
      expect(
        screen.getByText("Escolha como deseja criar sua campanha de outreach.")
      ).toBeInTheDocument();
      expect(screen.getByTestId("creation-mode-selection")).toBeInTheDocument();
    });

    it("shows two creation options as prominent cards", () => {
      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      // Check for AI option
      expect(screen.getByTestId("create-with-ai-button")).toBeInTheDocument();
      expect(screen.getByText("Criar com IA")).toBeInTheDocument();

      // Check for manual option
      expect(screen.getByTestId("create-manually-button")).toBeInTheDocument();
      expect(screen.getByText("Criar Manualmente")).toBeInTheDocument();
    });

    it("switches to manual mode when manual button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      const manualButton = screen.getByTestId("create-manually-button");
      await user.click(manualButton);

      // Should show manual form
      expect(screen.getByText("Criar Manualmente")).toBeInTheDocument();
      expect(screen.getByTestId("campaign-name-input")).toBeInTheDocument();
      expect(screen.getByTestId("back-to-selection")).toBeInTheDocument();
    });

    it("switches to AI wizard when AI button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      const aiButton = screen.getByTestId("create-with-ai-button");
      await user.click(aiButton);

      // Should show AI wizard (mocked)
      expect(screen.getByTestId("ai-campaign-wizard")).toBeInTheDocument();
    });

    it("returns to mode selection when back button is clicked from manual mode", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      // Go to manual mode
      const manualButton = screen.getByTestId("create-manually-button");
      await user.click(manualButton);

      // Click back button
      const backButton = screen.getByTestId("back-to-selection");
      await user.click(backButton);

      // Should be back at mode selection
      expect(screen.getByTestId("creation-mode-selection")).toBeInTheDocument();
    });

    it("returns to mode selection when back button is clicked from AI wizard", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      // Go to AI mode
      const aiButton = screen.getByTestId("create-with-ai-button");
      await user.click(aiButton);

      // Click back button in wizard
      const backButton = screen.getByTestId("wizard-back-button");
      await user.click(backButton);

      // Should be back at mode selection
      expect(screen.getByTestId("creation-mode-selection")).toBeInTheDocument();
    });
  });

  describe("Manual Creation Form (Story 5.1 AC #4)", () => {
    async function goToManualMode(user: ReturnType<typeof userEvent.setup>) {
      const manualButton = screen.getByTestId("create-manually-button");
      await user.click(manualButton);
    }

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

      await goToManualMode(user);

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
        expect(mockPush).toHaveBeenCalledWith("/campaigns/campaign-new/edit");
      });

      await waitFor(() => {
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

      await goToManualMode(user);

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

      await goToManualMode(user);

      const input = screen.getByTestId("campaign-name-input");
      await user.type(input, "Test Campaign");

      const submitButton = screen.getByTestId("create-campaign-submit");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Criando...")).toBeInTheDocument();
      });
    });

    it("shows error for empty name on submit", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      await goToManualMode(user);

      const submitButton = screen.getByTestId("create-campaign-submit");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId("campaign-name-error")).toBeInTheDocument();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Dialog Controls", () => {
    it("does not show dialog when open is false", () => {
      render(
        <CreateCampaignDialog open={false} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByText("Nova Campanha")).not.toBeInTheDocument();
    });

    it("closes dialog when cancel is clicked in manual mode", async () => {
      const user = userEvent.setup();

      render(
        <CreateCampaignDialog open={true} onOpenChange={mockOnOpenChange} />,
        { wrapper: createWrapper() }
      );

      // Go to manual mode
      const manualButton = screen.getByTestId("create-manually-button");
      await user.click(manualButton);

      const cancelButton = screen.getByRole("button", { name: "Cancelar" });
      await user.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("resets to mode selection when dialog reopens after being closed", async () => {
      const user = userEvent.setup();
      let isOpen = true;
      const handleOpenChange = (open: boolean) => {
        isOpen = open;
      };

      const { rerender } = render(
        <CreateCampaignDialog open={isOpen} onOpenChange={handleOpenChange} />,
        { wrapper: createWrapper() }
      );

      // Go to manual mode
      const manualButton = screen.getByTestId("create-manually-button");
      await user.click(manualButton);

      // Verify we're in manual mode
      expect(screen.getByTestId("campaign-name-input")).toBeInTheDocument();

      // Close dialog
      const cancelButton = screen.getByRole("button", { name: "Cancelar" });
      await user.click(cancelButton);

      rerender(
        <CreateCampaignDialog open={false} onOpenChange={handleOpenChange} />
      );

      // Reopen dialog
      rerender(
        <CreateCampaignDialog open={true} onOpenChange={handleOpenChange} />
      );

      // Should be back at mode selection
      expect(screen.getByTestId("creation-mode-selection")).toBeInTheDocument();
    });
  });
});
