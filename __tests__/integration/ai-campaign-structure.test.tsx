/**
 * AI Campaign Structure Generation Integration Tests
 * Story 6.12: AI Campaign Structure Generation
 *
 * Tests the full AI campaign creation flow from wizard to builder.
 * Note: Complex radix-ui select interactions are tested in unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Mock useProducts hook
vi.mock("@/hooks/use-products", () => ({
  useProducts: () => ({
    data: [
      { id: "product-1", name: "Produto Enterprise", description: "Solucao enterprise para grandes empresas" },
      { id: "product-2", name: "Produto Startup", description: "Plano acessivel para startups" },
    ],
    isLoading: false,
  }),
}));

// Mock useToneOfVoice hook
vi.mock("@/hooks/use-tone-of-voice", () => ({
  useToneOfVoice: () => ({
    data: { preset: "casual" },
    isLoading: false,
  }),
}));

// Mock useBuilderStore
const mockLoadBlocks = vi.fn();
const mockSetProductId = vi.fn();
const mockSetTemplateName = vi.fn();
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: () => ({
    loadBlocks: mockLoadBlocks,
    setProductId: mockSetProductId,
    setTemplateName: mockSetTemplateName,
  }),
}));

// Mock useCampaignTemplates (used by TemplateSelector in AICampaignWizard)
vi.mock("@/hooks/use-campaign-templates", () => ({
  useCampaignTemplates: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("AI Campaign Structure Generation Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: Navigate from CreateCampaignDialog AI mode through template-selection to form step
   * Story 6.13 changed AICampaignWizard default step to "template-selection"
   */
  async function navigateToAIForm(user: ReturnType<typeof userEvent.setup>) {
    // Click AI creation option
    await user.click(screen.getByTestId("create-with-ai-button"));

    // Wait for template-selection step
    await waitFor(() => {
      expect(screen.getByTestId("template-custom-button")).toBeInTheDocument();
    });

    // Click custom campaign to go to form
    await user.click(screen.getByTestId("template-custom-button"));

    // Wait for form to render
    await waitFor(() => {
      expect(screen.getByTestId("wizard-campaign-name")).toBeInTheDocument();
    });
  }

  describe("AC #1: Campaign Creation Options", () => {
    it("shows two creation options when dialog opens", () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      expect(screen.getByTestId("create-manually-button")).toBeInTheDocument();
      expect(screen.getByTestId("create-with-ai-button")).toBeInTheDocument();
      expect(screen.getByText("Criar Manualmente")).toBeInTheDocument();
      expect(screen.getByText("Criar com IA")).toBeInTheDocument();
    });

    it("transitions to AI wizard template selection when AI option is selected", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      const aiCard = screen.getByTestId("create-with-ai-button");
      await user.click(aiCard);

      await waitFor(() => {
        expect(screen.getByTestId("template-selector")).toBeInTheDocument();
      });
    });

    it("transitions to manual form when manual option is selected", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      const manualCard = screen.getByTestId("create-manually-button");
      await user.click(manualCard);

      await waitFor(() => {
        expect(screen.getByTestId("campaign-name-input")).toBeInTheDocument();
      });
    });
  });

  describe("AC #2: AI Wizard Form Rendering", () => {
    it("renders all wizard form fields", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      await navigateToAIForm(user);

      // Verify all form fields are present
      expect(screen.getByTestId("wizard-campaign-name")).toBeInTheDocument();
      expect(screen.getByTestId("wizard-product-select")).toBeInTheDocument();
      expect(screen.getByTestId("wizard-objective-select")).toBeInTheDocument();
      expect(screen.getByTestId("wizard-tone-select")).toBeInTheDocument();
      expect(screen.getByTestId("wizard-urgency-select")).toBeInTheDocument();
      expect(screen.getByTestId("wizard-description")).toBeInTheDocument();
      expect(screen.getByTestId("generate-campaign-submit")).toBeInTheDocument();
      expect(screen.getByTestId("back-to-templates")).toBeInTheDocument();
    });

    it("allows typing campaign name", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      await navigateToAIForm(user);

      const nameInput = screen.getByTestId("wizard-campaign-name");
      await user.type(nameInput, "Test Campaign Name");

      expect(nameInput).toHaveValue("Test Campaign Name");
    });
  });

  describe("AC #3: Generation Flow (Simplified)", () => {
    it("calls structure generation API when form is submitted", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      const mockStructureResponse = {
        structure: {
          totalEmails: 3,
          totalDays: 6,
          items: [
            { position: 0, type: "email", emailMode: "initial" },
            { position: 1, type: "delay", days: 3 },
            { position: 2, type: "email", emailMode: "initial" },
            { position: 3, type: "delay", days: 3 },
            { position: 4, type: "email", emailMode: "initial" },
          ],
        },
        rationale: "Cold outreach sequence",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { text: JSON.stringify(mockStructureResponse) },
          }),
      });

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      await navigateToAIForm(user);

      // Fill campaign name (required field)
      await user.type(screen.getByTestId("wizard-campaign-name"), "Test Campaign");

      // Submit form
      await user.click(screen.getByTestId("generate-campaign-submit"));

      // Verify structure generation API was called with correct endpoint and method
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/ai/campaign-structure",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
        );
      });
    });
  });

  describe("AC #5: Error Handling", () => {
    it("handles API error and stays on wizard", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Nao foi possivel gerar a estrutura" },
          }),
      });

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      await navigateToAIForm(user);

      // Fill form
      await user.type(screen.getByTestId("wizard-campaign-name"), "Error Test");

      // Submit
      await user.click(screen.getByTestId("generate-campaign-submit"));

      // Verify error handling - navigation should not happen
      await waitFor(() => {
        expect(mockPush).not.toHaveBeenCalled();
      });

      // Wizard should still be visible
      expect(screen.getByTestId("wizard-campaign-name")).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    it("allows going back from AI wizard to selection", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      // Open AI wizard (shows template-selection)
      await user.click(screen.getByTestId("create-with-ai-button"));

      await waitFor(() => {
        expect(screen.getByTestId("template-selector-back")).toBeInTheDocument();
      });

      // Click back from template-selection → returns to CreateCampaignDialog selection
      await user.click(screen.getByTestId("template-selector-back"));

      // Should return to selection view
      await waitFor(() => {
        expect(screen.getByTestId("create-manually-button")).toBeInTheDocument();
        expect(screen.getByTestId("create-with-ai-button")).toBeInTheDocument();
      });
    });

    it("allows going back from manual form to selection", async () => {
      const user = userEvent.setup();
      const Wrapper = createWrapper();

      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      // Open manual form
      await user.click(screen.getByTestId("create-manually-button"));

      await waitFor(() => {
        expect(screen.getByTestId("back-to-selection")).toBeInTheDocument();
      });

      // Click back
      await user.click(screen.getByTestId("back-to-selection"));

      // Should return to selection view
      await waitFor(() => {
        expect(screen.getByTestId("create-manually-button")).toBeInTheDocument();
        expect(screen.getByTestId("create-with-ai-button")).toBeInTheDocument();
      });
    });
  });

  describe("Dialog State", () => {
    it("does not render when closed", () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <CreateCampaignDialog open={false} onOpenChange={() => {}} />
        </Wrapper>
      );

      expect(screen.queryByText("Nova Campanha")).not.toBeInTheDocument();
    });

    it("renders when open", () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <CreateCampaignDialog open={true} onOpenChange={() => {}} />
        </Wrapper>
      );

      expect(screen.getByText("Nova Campanha")).toBeInTheDocument();
    });
  });
});
