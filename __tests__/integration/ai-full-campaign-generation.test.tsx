/**
 * AI Full Campaign Generation Integration Tests
 * Story 6.12.1: AI Full Campaign Generation
 *
 * AC #1-#7 - Full wizard flow tests
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AICampaignWizard } from "@/components/campaigns/AICampaignWizard";

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
      { id: "product-1", name: "Produto Teste", description: "Descricao do produto teste" },
    ],
    isLoading: false,
  }),
}));

// Mock useToneOfVoice hook
vi.mock("@/hooks/use-tone-of-voice", () => ({
  useToneOfVoice: () => ({
    data: { preset: "formal" },
    isLoading: false,
  }),
}));

// Mock useAICampaignStructure hook
const mockGenerateStructure = vi.fn();
const mockResetStructure = vi.fn();
vi.mock("@/hooks/use-ai-campaign-structure", () => ({
  useAICampaignStructure: () => ({
    generate: mockGenerateStructure,
    isGenerating: false,
    error: null,
    reset: mockResetStructure,
  }),
}));

// Mock useAIFullCampaignGeneration hook
const mockGenerateFullCampaign = vi.fn();
const mockCancelGeneration = vi.fn();
const mockResetContent = vi.fn();
let mockProgress: {
  currentEmail: number;
  totalEmails: number;
  currentContext: string;
  completedEmails: Array<{ id: string; subject: string; body: string }>;
} | null = null;
let mockIsGeneratingContent = false;
let mockContentError: string | null = null;

vi.mock("@/hooks/use-ai-full-campaign-generation", () => ({
  useAIFullCampaignGeneration: () => ({
    generate: mockGenerateFullCampaign,
    isGenerating: mockIsGeneratingContent,
    progress: mockProgress,
    error: mockContentError,
    cancel: mockCancelGeneration,
    reset: mockResetContent,
  }),
}));

// Mock useCreateCampaign hook
const mockMutateAsync = vi.fn();
vi.mock("@/hooks/use-campaigns", () => ({
  useCreateCampaign: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Mock useBuilderStore
const mockLoadBlocks = vi.fn();
const mockSetProductId = vi.fn();
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: () => ({
    loadBlocks: mockLoadBlocks,
    setProductId: mockSetProductId,
  }),
}));

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

describe("AI Full Campaign Generation Integration", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnBack = vi.fn();

  const mockStructureResult = {
    blocks: [
      { id: "email-1", type: "email", position: 0, data: { subject: "", body: "", emailMode: "initial", strategicContext: "Introducao" } },
      { id: "delay-1", type: "delay", position: 1, data: { delayValue: 3, delayUnit: "days" } },
      { id: "email-2", type: "email", position: 2, data: { subject: "", body: "", emailMode: "follow-up", strategicContext: "Proposta" } },
      { id: "delay-2", type: "delay", position: 3, data: { delayValue: 3, delayUnit: "days" } },
      { id: "email-3", type: "email", position: 4, data: { subject: "", body: "", emailMode: "follow-up", strategicContext: "Fechamento" } },
    ],
    totalEmails: 3,
    totalDays: 6,
    rationale: "Esta estrutura foi escolhida para maximizar o engajamento.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProgress = null;
    mockIsGeneratingContent = false;
    mockContentError = null;
  });

  describe("Wizard Flow (AC #1, #2, #7)", () => {
    it("shows form initially", () => {
      render(
        <AICampaignWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          onBack={mockOnBack}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("wizard-campaign-name")).toBeInTheDocument();
      expect(screen.getByTestId("generate-campaign-submit")).toBeInTheDocument();
    });

    it("shows strategy summary after structure generation", async () => {
      const user = userEvent.setup();

      mockGenerateStructure.mockResolvedValueOnce(mockStructureResult);

      render(
        <AICampaignWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          onBack={mockOnBack}
        />,
        { wrapper: createWrapper() }
      );

      // Fill form and submit
      await user.type(screen.getByTestId("wizard-campaign-name"), "Test Campaign");
      await user.click(screen.getByTestId("generate-campaign-submit"));

      // Should show strategy summary
      await waitFor(() => {
        expect(screen.getByTestId("strategy-summary")).toBeInTheDocument();
      });

      // Should display rationale
      expect(screen.getByTestId("strategy-rationale")).toHaveTextContent(
        "Esta estrutura foi escolhida para maximizar o engajamento."
      );

      // Should display email count
      expect(screen.getByTestId("strategy-email-count")).toHaveTextContent("3 emails");

      // Should display duration
      expect(screen.getByTestId("strategy-duration")).toHaveTextContent("6 dias");
    });

    it("calls generate structure with correct parameters", async () => {
      const user = userEvent.setup();

      mockGenerateStructure.mockResolvedValueOnce(mockStructureResult);

      render(
        <AICampaignWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          onBack={mockOnBack}
        />,
        { wrapper: createWrapper() }
      );

      await user.type(screen.getByTestId("wizard-campaign-name"), "Test Campaign");
      await user.click(screen.getByTestId("generate-campaign-submit"));

      await waitFor(() => {
        expect(mockGenerateStructure).toHaveBeenCalledWith({
          productId: null,
          objective: "cold_outreach",
          description: "",
          tone: "formal",
          urgency: "medium",
        });
      });
    });
  });

  describe("Full Generation (AC #2)", () => {
    it("triggers full generation when button clicked", async () => {
      const user = userEvent.setup();

      mockGenerateStructure.mockResolvedValueOnce(mockStructureResult);
      mockMutateAsync.mockResolvedValueOnce({ id: "campaign-new" });
      mockGenerateFullCampaign.mockResolvedValueOnce(mockStructureResult.blocks);

      render(
        <AICampaignWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          onBack={mockOnBack}
        />,
        { wrapper: createWrapper() }
      );

      // Fill form and submit to get to strategy summary
      await user.type(screen.getByTestId("wizard-campaign-name"), "Test Campaign");
      await user.click(screen.getByTestId("generate-campaign-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("generate-full-button")).toBeInTheDocument();
      });

      // Click full generation
      await user.click(screen.getByTestId("generate-full-button"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ name: "Test Campaign" });
      });

      await waitFor(() => {
        expect(mockGenerateFullCampaign).toHaveBeenCalled();
      });
    });
  });

  describe("Structure Only (AC #7)", () => {
    it("creates campaign with structure only when button clicked", async () => {
      const user = userEvent.setup();

      mockGenerateStructure.mockResolvedValueOnce(mockStructureResult);
      mockMutateAsync.mockResolvedValueOnce({ id: "campaign-new" });

      render(
        <AICampaignWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          onBack={mockOnBack}
        />,
        { wrapper: createWrapper() }
      );

      // Fill form and submit
      await user.type(screen.getByTestId("wizard-campaign-name"), "Test Campaign");
      await user.click(screen.getByTestId("generate-campaign-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("structure-only-button")).toBeInTheDocument();
      });

      // Click structure only
      await user.click(screen.getByTestId("structure-only-button"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ name: "Test Campaign" });
      });

      await waitFor(() => {
        expect(mockLoadBlocks).toHaveBeenCalledWith(mockStructureResult.blocks, true);
      });

      expect(mockGenerateFullCampaign).not.toHaveBeenCalled();
    });
  });

  describe("Back Navigation", () => {
    it("returns to form when back button clicked from strategy summary", async () => {
      const user = userEvent.setup();

      mockGenerateStructure.mockResolvedValueOnce(mockStructureResult);

      render(
        <AICampaignWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          onBack={mockOnBack}
        />,
        { wrapper: createWrapper() }
      );

      // Fill form and submit
      await user.type(screen.getByTestId("wizard-campaign-name"), "Test Campaign");
      await user.click(screen.getByTestId("generate-campaign-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("strategy-back-button")).toBeInTheDocument();
      });

      // Click back
      await user.click(screen.getByTestId("strategy-back-button"));

      // Should be back on form
      await waitFor(() => {
        expect(screen.getByTestId("wizard-campaign-name")).toBeInTheDocument();
      });
    });
  });

  describe("Single Email Campaign (AC #7)", () => {
    it("skips strategy summary for single email campaigns", async () => {
      const user = userEvent.setup();

      const singleEmailStructure = {
        blocks: [
          { id: "email-1", type: "email", position: 0, data: { subject: "", body: "" } },
        ],
        totalEmails: 1,
        totalDays: 0,
        rationale: "Single email campaign.",
      };

      mockGenerateStructure.mockResolvedValueOnce(singleEmailStructure);
      mockMutateAsync.mockResolvedValueOnce({ id: "campaign-new" });

      render(
        <AICampaignWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          onBack={mockOnBack}
        />,
        { wrapper: createWrapper() }
      );

      // Fill form and submit
      await user.type(screen.getByTestId("wizard-campaign-name"), "Single Email Campaign");
      await user.click(screen.getByTestId("generate-campaign-submit"));

      // Should go directly to builder (structure only)
      await waitFor(() => {
        expect(mockLoadBlocks).toHaveBeenCalledWith(singleEmailStructure.blocks, true);
      });

      // Strategy summary should not be shown
      expect(screen.queryByTestId("strategy-summary")).not.toBeInTheDocument();
    });
  });
});
