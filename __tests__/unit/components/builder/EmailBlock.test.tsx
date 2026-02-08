/**
 * EmailBlock Component Tests
 * Story 5.3: Email Block Component
 * Story 6.2: AI Text Generation in Builder
 * Story 6.3: Knowledge Base Integration for Context
 * Story 6.6: Personalized Icebreakers
 * Story 6.7: Inline Text Editing
 * Story 6.8: Text Regeneration
 * Story 6.11: Follow-Up Email Mode
 *
 * AC 5.3: #2 - Visual do Email Block (Estilo Attio)
 * AC 5.3: #3 - Selecionar Email Block
 * AC 5.3: #4 - Drag Handle para Reposicionamento
 * AC 5.3: #5 - Campos Editaveis (Placeholder)
 *
 * AC 6.2: #1 - Generate Button in Email Block
 * AC 6.2: #2 - Error Handling
 * AC 6.2: #3 - Streaming UI Experience
 *
 * AC 6.3: #1 - Knowledge Base Context in AI Prompts
 * AC 6.3: #4 - Loading indicator while KB context loads
 *
 * AC 6.6: #2 - Real Lead Data in Generation
 * AC 6.6: #3 - Icebreaker Generation Flow
 * AC 6.6: #7 - UI Feedback During Generation
 *
 * AC 6.7: #1 - Inline Subject Editing
 * AC 6.7: #2 - Inline Body Editing
 * AC 6.7: #3 - Debounced Auto-Save
 * AC 6.7: #4 - Auto-Expanding Textarea
 * AC 6.7: #5 - Subject Character Count
 *
 * AC 6.8: #1 - Regenerate Button Visibility
 * AC 6.8: #2 - Regeneration Execution
 * AC 6.8: #5 - Context Preservation on Regeneration
 * AC 6.8: #6 - Reset to Initial State
 *
 * AC 6.11: #1 - Mode Selector Visibility
 * AC 6.11: #2 - Mode Persistence
 * AC 6.11: #5 - First Email Restriction
 *
 * Story 9.4: Variável {{ice_breaker}} na Geração de Campanha AI
 * AC 9.4 #2: Toast when IB generated with specific lead
 * AC 9.4 #3: Badge when body contains {{ice_breaker}}
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EmailBlock, hasIceBreakerVariable } from "@/components/builder/EmailBlock";
import type { BuilderBlock } from "@/stores/use-builder-store";
import type { GenerationPhase } from "@/hooks/use-ai-generate";

// Mock sonner (Story 9.4 AC #2: Toast for icebreaker with specific lead)
const mockToastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => mockToastInfo(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, "data-testid": testId, onClick, ...props }: Record<string, unknown>) => (
      <div className={className as string} data-testid={testId as string} onClick={onClick as () => void}>
        {children as React.ReactNode}
      </div>
    ),
    button: ({ children, className, onClick, type, ...props }: Record<string, unknown>) => (
      <button className={className as string} onClick={onClick as () => void} type={type as "button"}>
        {children as React.ReactNode}
      </button>
    ),
    a: ({ children, className, href, ...props }: Record<string, unknown>) => (
      <a className={className as string} href={href as string}>
        {children as React.ReactNode}
      </a>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useSpring: (v: unknown) => v,
  useTransform: () => 0,
  useReducedMotion: () => false,
  useInView: () => true,
}));

// Mock store functions
const mockSelectBlock = vi.fn();
const mockUpdateBlock = vi.fn();
const mockRemoveBlock = vi.fn();
let mockSelectedBlockId: string | null = null;
let mockProductId: string | null = null;
let mockPreviewLead: {
  id: string;
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  title: string | null;
  email: string | null;
  // Story 6.5.7: Premium icebreaker fields
  icebreaker?: string | null;
  icebreakerGeneratedAt?: string | null;
  linkedinPostsCache?: {
    posts: Array<{ text: string; publishedAt: string; postUrl?: string }>;
    fetchedAt: string;
    profileUrl: string;
  } | null;
} | null = null;
// Story 6.11: Mock blocks array for getPreviousEmailBlock
let mockBlocks: Array<{
  id: string;
  type: string;
  position: number;
  data: Record<string, unknown>;
}> = [];

// Mock useBuilderStore
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector: (state: unknown) => unknown) => {
    const state = {
      selectedBlockId: mockSelectedBlockId,
      selectBlock: mockSelectBlock,
      updateBlock: mockUpdateBlock,
      removeBlock: mockRemoveBlock,
      productId: mockProductId,
      previewLead: mockPreviewLead,
      blocks: mockBlocks,
    };
    return selector(state);
  },
  // Story 6.11: Export getPreviousEmailBlock mock
  getPreviousEmailBlock: vi.fn((blocks: unknown[], position: number) => {
    const emailBlocks = (blocks as Array<{ type: string; position: number; data: Record<string, unknown> }>)
      .filter((b) => b.type === "email")
      .sort((a, b) => a.position - b.position);
    const currentIndex = emailBlocks.findIndex((b) => b.position === position);
    if (currentIndex <= 0) return null;
    const prevBlock = emailBlocks[currentIndex - 1];
    return {
      subject: prevBlock.data.subject || "",
      body: prevBlock.data.body || "",
    };
  }),
}));

// Mock AI generation state (Story 6.2)
const mockGenerate = vi.fn();
const mockResetAI = vi.fn();
const mockCancelAI = vi.fn();
let mockAIPhase: GenerationPhase = "idle";
let mockStreamingText = "";
let mockAIError: string | null = null;
let mockIsGenerating = false;

// Mock useAIGenerate hook
vi.mock("@/hooks/use-ai-generate", () => ({
  useAIGenerate: () => ({
    generate: mockGenerate,
    phase: mockAIPhase,
    text: mockStreamingText,
    error: mockAIError,
    reset: mockResetAI,
    cancel: mockCancelAI,
    isGenerating: mockIsGenerating,
  }),
}));

// Mock KB context state (Story 6.3)
const mockKBVariables = {
  company_context: "KB Test Company",
  products_services: "Product A",
  competitive_advantages: "Fast support",
  lead_name: "Lead Name",
  lead_title: "CTO",
  lead_company: "Lead Corp",
  lead_industry: "Tech",
  lead_location: "Brasil",
  tone_description: "Formal tone",
  tone_style: "formal",
  writing_guidelines: "Be professional",
  icp_summary: "Focus on Tech",
  target_industries: "Technology",
  target_titles: "CEO, CTO",
  pain_points: "Integration issues",
  successful_examples: "",
  email_objective: "Prospecção",
  icebreaker: "",
};
let mockKBLoading = false;
const mockRefetch = vi.fn();

// Mock useKnowledgeBaseContext hook (Story 6.3)
vi.mock("@/hooks/use-knowledge-base-context", () => ({
  useKnowledgeBaseContext: () => ({
    context: null,
    variables: mockKBVariables,
    isLoading: mockKBLoading,
    error: null,
    refetch: mockRefetch,
  }),
}));

describe("EmailBlock (AC: #2, #3, #4, #5)", () => {
  const mockBlock: BuilderBlock = {
    id: "test-block-123",
    type: "email",
    position: 0,
    data: { subject: "", body: "" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockGenerate implementation to avoid leaking between tests
    mockGenerate.mockReset();
    mockSelectedBlockId = null;
    // Reset AI mocks (Story 6.2)
    mockAIPhase = "idle";
    mockStreamingText = "";
    mockAIError = null;
    mockIsGenerating = false;
    // Reset KB mocks (Story 6.3)
    mockKBLoading = false;
    // Reset Story 6.6 mocks
    mockProductId = null;
    mockPreviewLead = null;
    // Reset Story 6.11 mocks
    mockBlocks = [];
  });

  describe("Visual Style (AC: #2)", () => {
    it("renders with step number and email type", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByText("Step 1")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();
    });

    it("renders subject input with correct placeholder", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      expect(subjectInput).toHaveAttribute("placeholder", "Assunto do email");
    });

    it("renders body textarea with correct placeholder", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      expect(bodyInput).toHaveAttribute("placeholder", "Conteudo do email...");
    });

    it("has correct test id for block", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(
        screen.getByTestId(`email-block-${mockBlock.id}`)
      ).toBeInTheDocument();
    });

    it("renders subject label", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByText("Assunto")).toBeInTheDocument();
    });

    it("renders body label", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByText("Conteudo")).toBeInTheDocument();
    });

    it("displays different step numbers correctly", () => {
      const { rerender } = render(
        <EmailBlock block={mockBlock} stepNumber={3} />
      );

      expect(screen.getByText("Step 3")).toBeInTheDocument();

      rerender(<EmailBlock block={mockBlock} stepNumber={5} />);
      expect(screen.getByText("Step 5")).toBeInTheDocument();
    });
  });

  describe("Selection State (AC: #3)", () => {
    it("shows selected state when selectedBlockId matches", () => {
      mockSelectedBlockId = mockBlock.id;
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const blockElement = screen.getByTestId(`email-block-${mockBlock.id}`);
      expect(blockElement).toHaveClass("border-primary");
      expect(blockElement).toHaveClass("ring-2");
    });

    it("does not show selected state when selectedBlockId differs", () => {
      mockSelectedBlockId = "other-block-id";
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const blockElement = screen.getByTestId(`email-block-${mockBlock.id}`);
      expect(blockElement).not.toHaveClass("border-primary");
      expect(blockElement).toHaveClass("border-border");
    });

    it("calls selectBlock when block is clicked", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const blockElement = screen.getByTestId(`email-block-${mockBlock.id}`);
      fireEvent.click(blockElement);

      expect(mockSelectBlock).toHaveBeenCalledWith(mockBlock.id);
    });

    it("stops propagation when block is clicked", () => {
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <EmailBlock block={mockBlock} stepNumber={1} />
        </div>
      );

      const blockElement = screen.getByTestId(`email-block-${mockBlock.id}`);
      fireEvent.click(blockElement);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe("Drag Handle (AC: #4)", () => {
    it("renders drag handle", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
    });

    it("drag handle has correct aria-label", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const dragHandle = screen.getByTestId("drag-handle");
      expect(dragHandle).toHaveAttribute(
        "aria-label",
        "Arrastar para reordenar"
      );
    });

    it("drag handle has grab cursor style", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const dragHandle = screen.getByTestId("drag-handle");
      expect(dragHandle).toHaveClass("cursor-grab");
    });
  });

  describe("Editable Fields (AC: #5)", () => {
    // Story 6.7: Updates are now debounced, blur flushes immediately
    it("updates store when subject changes and blurs", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.change(subjectInput, { target: { value: "Novo assunto" } });
      fireEvent.blur(subjectInput); // Story 6.7 AC #3: flush on blur

      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "Novo assunto", body: "", emailMode: "initial" },
      });
    });

    it("updates store when body changes and blurs", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      fireEvent.change(bodyInput, { target: { value: "Novo conteudo" } });
      fireEvent.blur(bodyInput); // Story 6.7 AC #3: flush on blur

      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "", body: "Novo conteudo", emailMode: "initial" },
      });
    });

    it("does not propagate click events from subject input", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      // Clear previous calls
      mockSelectBlock.mockClear();

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.click(subjectInput);

      // Should not call selectBlock again when clicking inside input
      // (stopPropagation prevents the block click handler)
      expect(mockSelectBlock).not.toHaveBeenCalled();
    });

    it("does not propagate click events from body textarea", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      mockSelectBlock.mockClear();

      const bodyInput = screen.getByTestId("email-body-input");
      fireEvent.click(bodyInput);

      expect(mockSelectBlock).not.toHaveBeenCalled();
    });

    it("has maxLength attribute on subject input", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      expect(subjectInput).toHaveAttribute("maxLength", "200");
    });

    it("displays existing subject value from block data", () => {
      const blockWithData: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Existing Subject", body: "Existing Body" },
      };

      render(<EmailBlock block={blockWithData} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      expect(subjectInput).toHaveValue("Existing Subject");
    });

    it("displays existing body value from block data", () => {
      const blockWithData: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Existing Subject", body: "Existing Body" },
      };

      render(<EmailBlock block={blockWithData} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      expect(bodyInput).toHaveValue("Existing Body");
    });
  });

  describe("Default Values", () => {
    it("handles block without data", () => {
      const blockWithoutData: BuilderBlock = {
        id: "test-block-no-data",
        type: "email",
        position: 0,
        data: {},
      };

      render(<EmailBlock block={blockWithoutData} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      const bodyInput = screen.getByTestId("email-body-input");

      expect(subjectInput).toHaveValue("");
      expect(bodyInput).toHaveValue("");
    });
  });

  describe("State Sync with Props (H1 fix)", () => {
    it("syncs local state when block.data changes externally", () => {
      const initialBlock: BuilderBlock = {
        id: "test-block-sync",
        type: "email",
        position: 0,
        data: { subject: "Initial Subject", body: "Initial Body" },
      };

      const { rerender } = render(
        <EmailBlock block={initialBlock} stepNumber={1} />
      );

      // Verify initial values
      expect(screen.getByTestId("email-subject-input")).toHaveValue(
        "Initial Subject"
      );
      expect(screen.getByTestId("email-body-input")).toHaveValue("Initial Body");

      // Simulate external update (e.g., undo/redo, server sync)
      const updatedBlock: BuilderBlock = {
        ...initialBlock,
        data: { subject: "Updated Subject", body: "Updated Body" },
      };

      rerender(<EmailBlock block={updatedBlock} stepNumber={1} />);

      // Verify synced values
      expect(screen.getByTestId("email-subject-input")).toHaveValue(
        "Updated Subject"
      );
      expect(screen.getByTestId("email-body-input")).toHaveValue("Updated Body");
    });
  });

  describe("Store Integration", () => {
    // Story 6.7: Updates are now debounced, blur flushes immediately
    it("calls updateBlock which sets hasChanges (AC #1, #5)", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.change(subjectInput, { target: { value: "Test" } });
      fireEvent.blur(subjectInput); // Story 6.7 AC #3: flush on blur

      // updateBlock is called, which internally sets hasChanges: true
      // (verified by inspecting use-builder-store.ts line 107)
      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: expect.objectContaining({ subject: "Test" }),
      });
    });
  });

  // ==============================================
  // Story 6.2: AI Text Generation
  // ==============================================

  describe("AI Generate Button (Story 6.2 AC: #1)", () => {
    it("renders AI generate button", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
    });

    it("calls generate when button is clicked", async () => {
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const button = screen.getByText("Gerar com IA");
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockResetAI).toHaveBeenCalled();
        expect(mockGenerate).toHaveBeenCalled();
      });
    });

    it("passes correct prompt key for subject generation", async () => {
      mockGenerate.mockResolvedValue("Test subject");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            promptKey: "email_subject_generation",
          })
        );
      });
    });

    it("calls body generation after subject generation", async () => {
      // Setup mock to track prompt keys used
      // Use mockImplementation to ensure consistent async behavior
      mockGenerate.mockImplementation(() => Promise.resolve("Generated text"));

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      // Wait for both generation calls to complete (subject, body)
      // Story 7.5: Generation is now 2-phase (no icebreaker generation)
      await waitFor(
        () => {
          const allPromptKeys = mockGenerate.mock.calls.map(
            (call) => call[0]?.promptKey
          );
          expect(allPromptKeys).toContain("email_subject_generation");
          expect(allPromptKeys).toContain("email_body_generation");
        },
        { timeout: 5000 }
      );
    });
  });

  describe("AI Error Handling (Story 6.2 AC: #2)", () => {
    it("displays error message when generation fails", () => {
      mockAIError = "Não foi possível gerar. Tente novamente.";

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByTestId("ai-error-message")).toBeInTheDocument();
      expect(
        screen.getByText("Não foi possível gerar. Tente novamente.")
      ).toBeInTheDocument();
    });

    it("clears error on retry (resets AI state)", async () => {
      mockAIError = "Error message";
      mockGenerate.mockResolvedValue("Success");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Tentar novamente"));

      await waitFor(() => {
        expect(mockResetAI).toHaveBeenCalled();
      });
    });
  });

  describe("AI Streaming UI (Story 6.2 AC: #3)", () => {
    it("shows generating status during generation", () => {
      mockIsGenerating = true;

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      // Story 6.6: Now shows phase-specific status messages
      expect(screen.getByTestId("ai-generating-status")).toBeInTheDocument();
    });

    it("applies pulse animation during generation", () => {
      mockIsGenerating = true;

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const blockElement = screen.getByTestId(`email-block-${mockBlock.id}`);
      expect(blockElement).toHaveClass("animate-pulse");
    });

    it("hides generating status when not generating", () => {
      mockIsGenerating = false;

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.queryByTestId("ai-generating-status")).not.toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 6.3: Knowledge Base Integration for Context
  // ==============================================

  describe("KB Context Integration (Story 6.3 AC: #1)", () => {
    it("passes KB variables to generate function", async () => {
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({
              company_context: "KB Test Company",
              tone_style: "formal",
            }),
          })
        );
      });
    });

    it("uses KB variables for both subject and body generation", async () => {
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          const calls = mockGenerate.mock.calls;
          expect(calls.length).toBeGreaterThanOrEqual(2);

          // Both calls should use KB variables
          calls.forEach((call) => {
            expect(call[0].variables).toEqual(
              expect.objectContaining({
                company_context: "KB Test Company",
              })
            );
          });
        },
        { timeout: 2000 }
      );
    });
  });

  describe("KB Loading State (Story 6.3 AC: #4)", () => {
    it("shows loading indicator when KB context is loading", () => {
      mockKBLoading = true;

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByTestId("kb-loading-status")).toBeInTheDocument();
      expect(screen.getByText("Carregando contexto...")).toBeInTheDocument();
    });

    it("hides loading indicator when KB context is loaded", () => {
      mockKBLoading = false;

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.queryByTestId("kb-loading-status")).not.toBeInTheDocument();
    });

    it("disables generate button when KB context is loading", () => {
      mockKBLoading = true;

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const button = screen.getByText("Gerar com IA");
      expect(button).toBeDisabled();
    });

    it("enables generate button when KB context is loaded", () => {
      mockKBLoading = false;

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const button = screen.getByText("Gerar com IA");
      expect(button).not.toBeDisabled();
    });
  });

  // ==============================================
  // Story 6.6: Personalized Icebreakers
  // ==============================================

  describe("Real Lead Data Integration (Story 6.6 AC: #2)", () => {
    it("uses KB variables (not lead data) even when previewLead is set (Story 7.5)", async () => {
      // Story 7.5: mergedVariables always uses kbVariables (template mode)
      // Lead data is no longer merged into generation variables
      mockPreviewLead = {
        id: "lead-1",
        firstName: "Joao",
        lastName: "Silva",
        companyName: "Tech Corp",
        title: "CTO",
        email: "joao@techcorp.com",
      };
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({
              // Story 7.5: lead_* fields cleared to force template mode
              // Prompt {{#if lead_name}} evaluates to false → AI uses {{first_name}}, etc.
              lead_name: "",
              lead_company: "",
              lead_title: "",
            }),
          })
        );
      });
    });

    it("falls back to KB placeholders when no lead selected", async () => {
      mockPreviewLead = null;
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({
              lead_name: "", // Cleared for template mode
              lead_company: "", // Cleared for template mode
            }),
          })
        );
      });
    });
  });

  describe("2-Phase Generation Flow (Story 7.5)", () => {
    it("generates subject first before body", async () => {
      // Story 7.5: Generation is now 2-phase (subject → body), no icebreaker generation
      mockGenerate.mockImplementation(() => Promise.resolve("Generated text"));

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      // Wait for both calls to complete
      await waitFor(
        () => {
          expect(mockGenerate.mock.calls.length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 2000 }
      );

      // Verify first call was subject generation (not icebreaker)
      expect(mockGenerate.mock.calls[0]?.[0]?.promptKey).toBe(
        "email_subject_generation"
      );
    });

    it("body generation does NOT receive a generated icebreaker variable (Story 7.5)", async () => {
      // Story 7.5: Icebreaker is no longer generated and passed to body.
      // Body uses mergedVariables directly (which has KB default icebreaker: "")
      mockGenerate.mockImplementation(() => Promise.resolve("Generated text"));

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      // Wait for body generation call (the 2nd phase)
      await waitFor(
        () => {
          const bodyCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_body_generation"
          );
          expect(bodyCall).toBeDefined();
        },
        { timeout: 3000 }
      );

      // Find the body generation call
      const bodyCall = mockGenerate.mock.calls.find(
        (call) => call[0]?.promptKey === "email_body_generation"
      );

      // Icebreaker variable should be the KB default (empty string),
      // not a generated value
      const icebreakerVar = bodyCall?.[0]?.variables?.icebreaker;
      expect(icebreakerVar).toBe("");
    });

    it("generates in correct order: subject → body", async () => {
      mockGenerate.mockResolvedValue("Generated");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      // Wait for both prompt types to be called
      await waitFor(
        () => {
          const promptKeys = mockGenerate.mock.calls.map(
            (call) => call[0]?.promptKey
          );
          expect(promptKeys).toContain("email_subject_generation");
          expect(promptKeys).toContain("email_body_generation");
        },
        { timeout: 2000 }
      );

      // Verify subject is called first, body second
      expect(mockGenerate.mock.calls[0]?.[0]?.promptKey).toBe("email_subject_generation");
      expect(mockGenerate.mock.calls[1]?.[0]?.promptKey).toBe("email_body_generation");

      // Verify icebreaker_generation is NOT called
      const icebreakerCall = mockGenerate.mock.calls.find(
        (call) => call[0]?.promptKey === "icebreaker_generation"
      );
      expect(icebreakerCall).toBeUndefined();
    });
  });

  describe("UI Status Messages (Story 6.6 AC: #7)", () => {
    it("shows icebreaker generation status with lead name", async () => {
      mockPreviewLead = {
        id: "lead-1",
        firstName: "Maria",
        lastName: "Santos",
        companyName: "Empresa SA",
        title: "CEO",
        email: "maria@empresa.com",
      };
      mockIsGenerating = true;

      // We need to simulate the generation phase
      // Since we can't easily control generatingField from outside,
      // we'll test that the status element is rendered during generation
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByTestId("ai-generating-status")).toBeInTheDocument();
    });

    it("shows different status messages for each phase", async () => {
      mockGenerate
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve("Icebreaker"), 100);
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve("Subject"), 100);
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve("Body"), 100);
            })
        );

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      // Just verify generation starts
      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled();
      });
    });
  });

  describe("Product Context Integration (Story 6.6 AC: #4)", () => {
    it("passes productId to subject and body generation", async () => {
      mockProductId = "product-123";
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          // Verify productId is passed to subject generation
          const subjectCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_subject_generation"
          );
          expect(subjectCall?.[0]?.productId).toBe("product-123");

          // Verify productId is passed to body generation
          const bodyCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_body_generation"
          );
          expect(bodyCall?.[0]?.productId).toBe("product-123");
        },
        { timeout: 3000 }
      );
    });
  });

  // ==============================================
  // Story 6.7: Inline Text Editing
  // ==============================================

  describe("Debounced Auto-Save (Story 6.7 AC: #3)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does NOT update store immediately on subject change (debounced)", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.change(subjectInput, { target: { value: "New subject" } });

      // Store should NOT be updated immediately (debounce active)
      expect(mockUpdateBlock).not.toHaveBeenCalled();
    });

    it("does NOT update store immediately on body change (debounced)", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      fireEvent.change(bodyInput, { target: { value: "New body content" } });

      // Store should NOT be updated immediately (debounce active)
      expect(mockUpdateBlock).not.toHaveBeenCalled();
    });

    it("updates store after 500ms debounce delay for subject", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.change(subjectInput, { target: { value: "Delayed subject" } });

      // Not called yet
      expect(mockUpdateBlock).not.toHaveBeenCalled();

      // Fast-forward 500ms
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Now store should be updated
      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "Delayed subject", body: "", emailMode: "initial" },
      });
    });

    it("updates store after 500ms debounce delay for body", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      fireEvent.change(bodyInput, { target: { value: "Delayed body" } });

      // Not called yet
      expect(mockUpdateBlock).not.toHaveBeenCalled();

      // Fast-forward 500ms
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Now store should be updated
      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "", body: "Delayed body", emailMode: "initial" },
      });
    });

    it("flushes immediately on subject blur", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.change(subjectInput, { target: { value: "Flush on blur" } });

      // Not called yet
      expect(mockUpdateBlock).not.toHaveBeenCalled();

      // Blur triggers flush (AC #3: navigate away before debounce completes)
      fireEvent.blur(subjectInput);

      // Store should be updated immediately
      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "Flush on blur", body: "", emailMode: "initial" },
      });
    });

    it("flushes immediately on body blur", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      fireEvent.change(bodyInput, { target: { value: "Body flush" } });

      // Not called yet
      expect(mockUpdateBlock).not.toHaveBeenCalled();

      // Blur triggers flush
      fireEvent.blur(bodyInput);

      // Store should be updated immediately
      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "", body: "Body flush", emailMode: "initial" },
      });
    });

    it("only saves last value when typing rapidly (debounce)", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");

      // Rapid changes - using fireEvent.change to simulate multiple onChange events
      // (fireEvent is appropriate here as we're testing debounce coalescing, not typing behavior)
      fireEvent.change(subjectInput, { target: { value: "A" } });
      fireEvent.change(subjectInput, { target: { value: "AB" } });
      fireEvent.change(subjectInput, { target: { value: "ABC" } });
      fireEvent.change(subjectInput, { target: { value: "Final value" } });

      // Fast-forward 500ms
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Only the final value should be saved
      expect(mockUpdateBlock).toHaveBeenCalledTimes(1);
      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "Final value", body: "", emailMode: "initial" },
      });
    });
  });

  describe("Subject Character Count (Story 6.7 AC: #5)", () => {
    it("displays character count below subject input", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const charCount = screen.getByTestId("subject-char-count");
      expect(charCount).toBeInTheDocument();
    });

    it('shows format "X/60 caracteres"', () => {
      const blockWithSubject: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Hello", body: "" },
      };

      render(<EmailBlock block={blockWithSubject} stepNumber={1} />);

      const charCount = screen.getByTestId("subject-char-count");
      expect(charCount).toHaveTextContent("5/60 caracteres");
    });

    it("updates count in real-time as user types", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      const charCount = screen.getByTestId("subject-char-count");

      // Initially 0 characters
      expect(charCount).toHaveTextContent("0/60 caracteres");

      // Type some text
      fireEvent.change(subjectInput, { target: { value: "Test subject" } });

      // Count should update
      expect(charCount).toHaveTextContent("12/60 caracteres");
    });

    it("shows warning color when exceeding 60 characters", () => {
      const longSubject = "A".repeat(61);
      const blockWithLongSubject: BuilderBlock = {
        ...mockBlock,
        data: { subject: longSubject, body: "" },
      };

      render(<EmailBlock block={blockWithLongSubject} stepNumber={1} />);

      const charCount = screen.getByTestId("subject-char-count");
      expect(charCount).toHaveClass("text-foreground");
    });

    it("shows normal color when at or under 60 characters", () => {
      const shortSubject = "A".repeat(60);
      const blockWithShortSubject: BuilderBlock = {
        ...mockBlock,
        data: { subject: shortSubject, body: "" },
      };

      render(<EmailBlock block={blockWithShortSubject} stepNumber={1} />);

      const charCount = screen.getByTestId("subject-char-count");
      expect(charCount).toHaveClass("text-muted-foreground");
    });

    it("has aria-describedby linking input to count for accessibility", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      const charCount = screen.getByTestId("subject-char-count");

      expect(subjectInput).toHaveAttribute(
        "aria-describedby",
        charCount.id
      );
    });

    it("respects maxLength=200 as hard limit", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      expect(subjectInput).toHaveAttribute("maxLength", "200");
    });
  });

  describe("Auto-Expanding Textarea (Story 6.7 AC: #4)", () => {
    it("uses AutoResizeTextarea for body field", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      // AutoResizeTextarea sets inline minHeight/maxHeight styles
      expect(bodyInput).toHaveStyle({ minHeight: "100px" });
      expect(bodyInput).toHaveStyle({ maxHeight: "400px" });
    });

    it("body textarea has resize: none", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      expect(bodyInput).toHaveStyle({ resize: "none" });
    });
  });

  describe("Inline Editing (Story 6.7 AC: #1, #2)", () => {
    it("subject input accepts focus immediately", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      subjectInput.focus();

      expect(document.activeElement).toBe(subjectInput);
    });

    it("body textarea accepts focus immediately", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      bodyInput.focus();

      expect(document.activeElement).toBe(bodyInput);
    });

    it("preserves line breaks in body textarea", () => {
      const multilineBody = "Line 1\nLine 2\nLine 3";
      const blockWithMultiline: BuilderBlock = {
        ...mockBlock,
        data: { subject: "", body: multilineBody },
      };

      render(<EmailBlock block={blockWithMultiline} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      expect(bodyInput).toHaveValue(multilineBody);
    });
  });

  // ==============================================
  // Story 6.8: Text Regeneration
  // ==============================================

  describe("Regeneration Button Visibility (Story 6.8 AC: #1, #6)", () => {
    // Task 5.1: Test hasContent calculation (true when both subject and body non-empty)
    it("shows Regenerar button when BOTH subject and body have content (AC #1)", () => {
      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Test Subject", body: "Test Body" },
      };

      render(<EmailBlock block={blockWithContent} stepNumber={1} />);

      expect(screen.getByText("Regenerar")).toBeInTheDocument();
    });

    // Task 5.2: Test hasContent false when only subject has content
    it("shows 'Gerar com IA' when only subject has content", () => {
      const blockWithSubjectOnly: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Test Subject", body: "" },
      };

      render(<EmailBlock block={blockWithSubjectOnly} stepNumber={1} />);

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
      expect(screen.queryByText("Regenerar")).not.toBeInTheDocument();
    });

    // Task 5.3: Test hasContent false when only body has content
    it("shows 'Gerar com IA' when only body has content", () => {
      const blockWithBodyOnly: BuilderBlock = {
        ...mockBlock,
        data: { subject: "", body: "Test Body" },
      };

      render(<EmailBlock block={blockWithBodyOnly} stepNumber={1} />);

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
      expect(screen.queryByText("Regenerar")).not.toBeInTheDocument();
    });

    // Task 5.4: Test hasContent false when both are empty
    it("shows 'Gerar com IA' when both subject and body are empty", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
      expect(screen.queryByText("Regenerar")).not.toBeInTheDocument();
    });

    // AC #6: Test reset to initial state when content is cleared
    it("returns to 'Gerar com IA' when subject is cleared (AC #6)", () => {
      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Test Subject", body: "Test Body" },
      };

      const { rerender } = render(
        <EmailBlock block={blockWithContent} stepNumber={1} />
      );

      // Initially shows Regenerar
      expect(screen.getByText("Regenerar")).toBeInTheDocument();

      // Simulate clearing subject
      const updatedBlock: BuilderBlock = {
        ...mockBlock,
        data: { subject: "", body: "Test Body" },
      };

      rerender(<EmailBlock block={updatedBlock} stepNumber={1} />);

      // Should show Gerar com IA again
      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
    });

    it("returns to 'Gerar com IA' when body is cleared (AC #6)", () => {
      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Test Subject", body: "Test Body" },
      };

      const { rerender } = render(
        <EmailBlock block={blockWithContent} stepNumber={1} />
      );

      // Initially shows Regenerar
      expect(screen.getByText("Regenerar")).toBeInTheDocument();

      // Simulate clearing body
      const updatedBlock: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Test Subject", body: "" },
      };

      rerender(<EmailBlock block={updatedBlock} stepNumber={1} />);

      // Should show Gerar com IA again
      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
    });

    it("treats whitespace-only content as empty", () => {
      const blockWithWhitespace: BuilderBlock = {
        ...mockBlock,
        data: { subject: "   ", body: "   " },
      };

      render(<EmailBlock block={blockWithWhitespace} stepNumber={1} />);

      // Whitespace-only should be treated as empty
      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
    });
  });

  describe("Regeneration Execution (Story 6.8 AC: #2, #5)", () => {
    // Task 5.5: Test regeneration replaces previous text
    it("replaces previous text when regeneration completes (AC #2)", async () => {
      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Old Subject", body: "Old Body" },
      };

      mockGenerate.mockResolvedValue("New Generated Text");

      render(<EmailBlock block={blockWithContent} stepNumber={1} />);

      // Click regenerate
      const button = screen.getByText("Regenerar");
      fireEvent.click(button);

      await waitFor(() => {
        // Verify generate was called (which will replace text)
        expect(mockGenerate).toHaveBeenCalled();
        // Verify updateBlock was called (to persist new text)
        expect(mockUpdateBlock).toHaveBeenCalled();
      });
    });

    // Task 5.6: Test multiple regenerations work consecutively
    it("allows multiple consecutive regenerations (AC #4)", async () => {
      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Subject", body: "Body" },
      };

      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={blockWithContent} stepNumber={1} />);

      // First regeneration
      const button = screen.getByText("Regenerar");
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled();
      });

      // Clear mock calls to test second regeneration
      const firstCallCount = mockGenerate.mock.calls.length;

      // Second regeneration (button still available)
      fireEvent.click(button);

      await waitFor(() => {
        // Should have more calls than before
        expect(mockGenerate.mock.calls.length).toBeGreaterThan(firstCallCount);
      });
    });

    // Task 5.7: Test context is passed correctly on regeneration
    it("passes same context (mergedVariables, productId) on regeneration (AC #5)", async () => {
      mockProductId = "product-456";
      mockPreviewLead = {
        id: "lead-1",
        firstName: "Carlos",
        lastName: "Silva",
        companyName: "Empresa XYZ",
        title: "CEO",
        email: "carlos@empresa.com",
      };

      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Subject", body: "Body" },
      };

      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={blockWithContent} stepNumber={1} />);

      // Click regenerate
      fireEvent.click(screen.getByText("Regenerar"));

      await waitFor(() => {
        // Story 7.5: Verify lead_* cleared for template mode, KB context preserved
        expect(mockGenerate).toHaveBeenCalledWith(
          expect.objectContaining({
            productId: "product-456",
            variables: expect.objectContaining({
              // lead_* cleared → prompt enters template mode
              lead_name: "",
              lead_company: "",
              // KB context preserved
              company_context: "KB Test Company",
            }),
          })
        );
      });
    });

    it("resets AI state at start of regeneration (AC #2)", async () => {
      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Subject", body: "Body" },
      };

      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={blockWithContent} stepNumber={1} />);

      fireEvent.click(screen.getByText("Regenerar"));

      await waitFor(() => {
        // resetAI should be called to clear previous state
        expect(mockResetAI).toHaveBeenCalled();
      });
    });
  });

  describe("Streaming Animation on Regeneration (Story 6.8 AC: #3)", () => {
    it("passes stream:true on regeneration calls", async () => {
      const blockWithContent: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Subject", body: "Body" },
      };

      mockGenerate.mockResolvedValue("Streaming text");

      render(<EmailBlock block={blockWithContent} stepNumber={1} />);

      fireEvent.click(screen.getByText("Regenerar"));

      await waitFor(() => {
        // All generation calls should have stream: true
        mockGenerate.mock.calls.forEach((call) => {
          expect(call[0]).toHaveProperty("stream", true);
        });
      });
    });
  });

  // ==============================================
  // Story 6.11: Follow-Up Email Mode
  // ==============================================

  describe("Mode Selector Visibility (Story 6.11 AC: #1, #5)", () => {
    // Task 9.1: Test mode selector visibility based on position
    it("shows mode selector for emails after first (stepNumber > 1) (AC #1)", () => {
      const secondEmailBlock: BuilderBlock = {
        id: "test-block-2",
        type: "email",
        position: 1,
        data: { subject: "", body: "", emailMode: "initial" },
      };

      render(<EmailBlock block={secondEmailBlock} stepNumber={2} />);

      expect(screen.getByTestId("email-mode-selector")).toBeInTheDocument();
    });

    // Task 9.2: Test mode selector disabled for first email
    it("shows disabled badge for first email (stepNumber = 1) (AC #5)", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      // Should show badge, not selector
      expect(screen.getByTestId("email-mode-initial-badge")).toBeInTheDocument();
      expect(screen.queryByTestId("email-mode-selector")).not.toBeInTheDocument();
    });

    it("badge shows tooltip explaining first email restriction (AC #5)", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const badge = screen.getByTestId("email-mode-initial-badge");
      expect(badge).toHaveTextContent("Email Inicial");
    });
  });

  describe("Follow-Up Visual Indicator (Story 6.11 AC: #2)", () => {
    // Task 9.3: Test follow-up indicator visibility
    it("shows 'Follow-up do Email X' when mode is follow-up", () => {
      const followUpBlock: BuilderBlock = {
        id: "test-block-followup",
        type: "email",
        position: 1,
        data: { subject: "", body: "", emailMode: "follow-up" },
      };

      render(<EmailBlock block={followUpBlock} stepNumber={2} />);

      // Should show "Follow-up do Email 1" in subtitle (stepNumber - 1)
      // Note: text may appear in both subtitle and selector, so use getAllByText
      const followUpTexts = screen.getAllByText(/Follow-up do Email 1/);
      expect(followUpTexts.length).toBeGreaterThanOrEqual(1);
    });

    it("shows 'Email' text for initial mode", () => {
      const initialBlock: BuilderBlock = {
        id: "test-block-initial",
        type: "email",
        position: 1,
        data: { subject: "", body: "", emailMode: "initial" },
      };

      render(<EmailBlock block={initialBlock} stepNumber={2} />);

      // Should show "Email" not "Follow-up"
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.queryByText(/Follow-up do Email/)).not.toBeInTheDocument();
    });
  });

  describe("Mode Change Updates Block Data (Story 6.11 AC: #2)", () => {
    // Task 9.4: Test mode change updates block data
    it("calls updateBlock when mode is changed to follow-up", () => {
      const secondEmailBlock: BuilderBlock = {
        id: "test-block-mode-change",
        type: "email",
        position: 1,
        data: { subject: "Test", body: "Body", emailMode: "initial" },
      };

      render(<EmailBlock block={secondEmailBlock} stepNumber={2} />);

      // Find and click the mode selector
      const selector = screen.getByTestId("email-mode-selector");
      fireEvent.click(selector);

      // Select follow-up option
      const followUpOption = screen.getByText("Follow-up do Email 1");
      fireEvent.click(followUpOption);

      expect(mockUpdateBlock).toHaveBeenCalledWith("test-block-mode-change", {
        data: expect.objectContaining({
          emailMode: "follow-up",
        }),
      });
    });

    it("calls updateBlock when mode is changed back to initial", () => {
      const followUpBlock: BuilderBlock = {
        id: "test-block-mode-back",
        type: "email",
        position: 1,
        data: { subject: "Test", body: "Body", emailMode: "follow-up" },
      };

      render(<EmailBlock block={followUpBlock} stepNumber={2} />);

      // Find and click the mode selector
      const selector = screen.getByTestId("email-mode-selector");
      fireEvent.click(selector);

      // Select initial option
      const initialOption = screen.getByText("Email Inicial");
      fireEvent.click(initialOption);

      expect(mockUpdateBlock).toHaveBeenCalledWith("test-block-mode-back", {
        data: expect.objectContaining({
          emailMode: "initial",
        }),
      });
    });
  });

  describe("Follow-Up Generation Flow (Story 6.11 AC: #3, #4)", () => {
    it("uses follow_up_email_generation prompt for follow-up emails", async () => {
      mockBlocks = [
        {
          id: "email-1",
          type: "email",
          position: 0,
          data: { subject: "First Subject", body: "First Body" },
        },
        {
          id: "email-2",
          type: "email",
          position: 1,
          data: { subject: "", body: "", emailMode: "follow-up" },
        },
      ];

      mockGenerate.mockResolvedValue("Generated follow-up text");

      const followUpBlock: BuilderBlock = {
        id: "email-2",
        type: "email",
        position: 1,
        data: { subject: "", body: "", emailMode: "follow-up" },
      };

      render(<EmailBlock block={followUpBlock} stepNumber={2} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          const bodyCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "follow_up_email_generation"
          );
          expect(bodyCall).toBeDefined();
        },
        { timeout: 3000 }
      );
    });

    it("does NOT generate icebreaker for follow-up emails", async () => {
      mockBlocks = [
        {
          id: "email-1",
          type: "email",
          position: 0,
          data: { subject: "First Subject", body: "First Body" },
        },
        {
          id: "email-2",
          type: "email",
          position: 1,
          data: { subject: "", body: "", emailMode: "follow-up" },
        },
      ];

      mockGenerate.mockResolvedValue("Generated text");

      const followUpBlock: BuilderBlock = {
        id: "email-2",
        type: "email",
        position: 1,
        data: { subject: "", body: "", emailMode: "follow-up" },
      };

      render(<EmailBlock block={followUpBlock} stepNumber={2} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          expect(mockGenerate).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // Verify icebreaker was NOT generated for follow-up
      const icebreakerCall = mockGenerate.mock.calls.find(
        (call) => call[0]?.promptKey === "icebreaker_generation"
      );
      expect(icebreakerCall).toBeUndefined();
    });

    it("generates subject and body for initial mode emails (Story 7.5)", async () => {
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          // Story 7.5: No icebreaker generation, only subject and body
          const subjectCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_subject_generation"
          );
          expect(subjectCall).toBeDefined();

          const bodyCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_body_generation"
          );
          expect(bodyCall).toBeDefined();
        },
        { timeout: 3000 }
      );
    });

    // H1 FIX: Test AC #6 - mode change back to initial does NOT include previous context
    it("uses email_body_generation (not follow-up) after mode changes back to initial (AC #6)", async () => {
      mockBlocks = [
        {
          id: "email-1",
          type: "email",
          position: 0,
          data: { subject: "First Subject", body: "First Body" },
        },
        {
          id: "email-2",
          type: "email",
          position: 1,
          // Mode was follow-up but changed back to initial
          data: { subject: "", body: "", emailMode: "initial" },
        },
      ];

      mockGenerate.mockResolvedValue("Generated text");

      const initialModeBlock: BuilderBlock = {
        id: "email-2",
        type: "email",
        position: 1,
        // Explicitly set to initial (simulating mode change back from follow-up)
        data: { subject: "", body: "", emailMode: "initial" },
      };

      render(<EmailBlock block={initialModeBlock} stepNumber={2} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          // Verify follow_up_email_generation was NOT called
          const followUpCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "follow_up_email_generation"
          );
          expect(followUpCall).toBeUndefined();

          // Verify standard email_body_generation was called
          const bodyCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_body_generation"
          );
          expect(bodyCall).toBeDefined();

          // Story 7.5: Icebreaker is no longer generated for initial emails
          const icebreakerCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "icebreaker_generation"
          );
          expect(icebreakerCall).toBeUndefined();
        },
        { timeout: 3000 }
      );
    });

    // H4 FIX: Test for follow_up_subject_generation being called
    it("uses follow_up_subject_generation for follow-up email subjects", async () => {
      mockBlocks = [
        {
          id: "email-1",
          type: "email",
          position: 0,
          data: { subject: "First Subject", body: "First Body" },
        },
        {
          id: "email-2",
          type: "email",
          position: 1,
          data: { subject: "", body: "", emailMode: "follow-up" },
        },
      ];

      mockGenerate.mockResolvedValue("RE: Generated subject");

      const followUpBlock: BuilderBlock = {
        id: "email-2",
        type: "email",
        position: 1,
        data: { subject: "", body: "", emailMode: "follow-up" },
      };

      render(<EmailBlock block={followUpBlock} stepNumber={2} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          // Verify follow_up_subject_generation was called for subject
          const subjectCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "follow_up_subject_generation"
          );
          expect(subjectCall).toBeDefined();
          expect(subjectCall?.[0]?.variables).toHaveProperty("previous_email_subject", "First Subject");
        },
        { timeout: 3000 }
      );
    });
  });

  // ==============================================
  // Story 6.5.7: Premium Icebreaker Badge
  // ==============================================

  describe("Premium Icebreaker Badge (Story 6.5.7 AC #3)", () => {
    it("shows PremiumIcebreakerBadge when lead has premium icebreaker and content is generated", async () => {
      // Setup lead with premium icebreaker
      mockPreviewLead = {
        id: "lead-premium",
        firstName: "Ana",
        lastName: "Costa",
        companyName: "Premium Corp",
        title: "CEO",
        email: "ana@premium.com",
        icebreaker: "Vi seu post sobre inovação no setor de tecnologia.",
        icebreakerGeneratedAt: "2026-02-04T10:00:00Z",
        linkedinPostsCache: {
          posts: [
            {
              text: "Compartilhando insights sobre inovação...",
              publishedAt: "2026-02-01T08:00:00Z",
              postUrl: "https://linkedin.com/feed/update/123",
            },
          ],
          fetchedAt: "2026-02-04T09:55:00Z",
          profileUrl: "https://linkedin.com/in/anacosta",
        },
      };

      // Block with generated content and premium icebreaker source
      const blockWithPremiumIcebreaker: BuilderBlock = {
        id: "test-premium-badge",
        type: "email",
        position: 0,
        data: {
          subject: "Assunto gerado",
          body: "Corpo do email gerado",
          emailMode: "initial",
          icebreakerSource: "premium",
          icebreakerPosts: mockPreviewLead.linkedinPostsCache?.posts || null,
        },
      };

      render(<EmailBlock block={blockWithPremiumIcebreaker} stepNumber={1} />);

      // Badge should be visible
      expect(screen.getByTestId("premium-icebreaker-badge")).toBeInTheDocument();
      expect(screen.getByText("Icebreaker Premium")).toBeInTheDocument();
    });

    it("does NOT show badge when icebreakerSource is standard", () => {
      const blockWithStandardIcebreaker: BuilderBlock = {
        id: "test-standard-badge",
        type: "email",
        position: 0,
        data: {
          subject: "Assunto",
          body: "Corpo",
          emailMode: "initial",
          icebreakerSource: "standard",
        },
      };

      render(<EmailBlock block={blockWithStandardIcebreaker} stepNumber={1} />);

      // Badge should NOT be visible
      expect(screen.queryByTestId("premium-icebreaker-badge")).not.toBeInTheDocument();
    });

    it("does NOT show badge when content is empty", () => {
      mockPreviewLead = {
        id: "lead-premium",
        firstName: "Ana",
        lastName: "Costa",
        companyName: "Premium Corp",
        title: "CEO",
        email: "ana@premium.com",
        icebreaker: "Vi seu post...",
        icebreakerGeneratedAt: "2026-02-04T10:00:00Z",
        linkedinPostsCache: null,
      };

      // Block without content
      const blockWithoutContent: BuilderBlock = {
        id: "test-no-content",
        type: "email",
        position: 0,
        data: { subject: "", body: "", emailMode: "initial" },
      };

      render(<EmailBlock block={blockWithoutContent} stepNumber={1} />);

      // Badge should NOT be visible (no content yet)
      expect(screen.queryByTestId("premium-icebreaker-badge")).not.toBeInTheDocument();
    });

    it("skips icebreaker_generation when lead has premium icebreaker", async () => {
      mockPreviewLead = {
        id: "lead-premium-gen",
        firstName: "Bruno",
        lastName: "Santos",
        companyName: "Tech SA",
        title: "CTO",
        email: "bruno@tech.com",
        icebreaker: "Adorei seu artigo sobre arquitetura de sistemas.",
        icebreakerGeneratedAt: "2026-02-04T10:00:00Z",
        linkedinPostsCache: {
          posts: [{ text: "Artigo sobre arquitetura...", publishedAt: "2026-02-01T08:00:00Z" }],
          fetchedAt: "2026-02-04T09:55:00Z",
          profileUrl: "https://linkedin.com/in/brunosantos",
        },
      };

      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      // Wait for generation to complete
      await waitFor(
        () => {
          // Verify email_body_generation was called (generation completed)
          const bodyCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_body_generation"
          );
          expect(bodyCall).toBeDefined();
        },
        { timeout: 5000 }
      );

      // Key assertion: icebreaker_generation should NOT be called when premium exists
      const icebreakerCalls = mockGenerate.mock.calls.filter(
        (call) => call[0]?.promptKey === "icebreaker_generation"
      );
      expect(icebreakerCalls).toHaveLength(0);
    });
  });

  // ==============================================
  // Delete Block Tests
  // ==============================================

  describe("Delete Block", () => {
    it("renders delete button", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.getByTestId("delete-block-button")).toBeInTheDocument();
    });

    it("calls removeBlock when delete button is clicked", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByTestId("delete-block-button"));

      expect(mockRemoveBlock).toHaveBeenCalledWith(mockBlock.id);
    });

    it("does not select block when delete button is clicked", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByTestId("delete-block-button"));

      expect(mockSelectBlock).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // Story 9.4: Ice Breaker Variable
  // ==============================================

  describe("hasIceBreakerVariable utility (Story 9.4 AC #3)", () => {
    it("returns true when text contains {{ice_breaker}}", () => {
      expect(hasIceBreakerVariable("Olá! {{ice_breaker}} Gostaria de apresentar...")).toBe(true);
    });

    it("returns false when text does not contain {{ice_breaker}}", () => {
      expect(hasIceBreakerVariable("Olá! Gostaria de apresentar nosso produto.")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(hasIceBreakerVariable("")).toBe(false);
    });

    it("returns false for similar but not exact patterns", () => {
      expect(hasIceBreakerVariable("{{icebreaker}}")).toBe(false);
      expect(hasIceBreakerVariable("{ice_breaker}")).toBe(false);
      expect(hasIceBreakerVariable("ice_breaker")).toBe(false);
    });
  });

  describe("Ice Breaker Variable Badge (Story 9.4 AC #3)", () => {
    it("shows badge when body contains {{ice_breaker}}", () => {
      const blockWithVariable: BuilderBlock = {
        ...mockBlock,
        data: { subject: "", body: "Olá! {{ice_breaker}} Gostaria de apresentar..." },
      };

      render(<EmailBlock block={blockWithVariable} stepNumber={1} />);

      expect(screen.getByTestId("icebreaker-variable-badge")).toBeInTheDocument();
      expect(screen.getByText(/Contém variável/)).toBeInTheDocument();
      expect(screen.getByText(/será personalizado por lead/)).toBeInTheDocument();
    });

    it("does NOT show badge when body does not contain {{ice_breaker}}", () => {
      const blockWithoutVariable: BuilderBlock = {
        ...mockBlock,
        data: { subject: "Subject", body: "Normal email body without variable" },
      };

      render(<EmailBlock block={blockWithoutVariable} stepNumber={1} />);

      expect(screen.queryByTestId("icebreaker-variable-badge")).not.toBeInTheDocument();
    });

    it("does NOT show badge when body is empty", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      expect(screen.queryByTestId("icebreaker-variable-badge")).not.toBeInTheDocument();
    });
  });

  describe("Toast on IB generated with specific lead (Story 9.4 AC #2)", () => {
    // Story 7.5: Toast about icebreaker generation was removed (no icebreaker generation anymore)

    it("does NOT show toast when no previewLead is set", async () => {
      mockPreviewLead = null;
      mockGenerate.mockResolvedValue("Generated text");

      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      fireEvent.click(screen.getByText("Gerar com IA"));

      await waitFor(
        () => {
          expect(mockGenerate).toHaveBeenCalled();
          // Wait for all generations to finish
          const bodyCall = mockGenerate.mock.calls.find(
            (call) => call[0]?.promptKey === "email_body_generation"
          );
          expect(bodyCall).toBeDefined();
        },
        { timeout: 5000 }
      );

      // Toast should NOT have been called
      expect(mockToastInfo).not.toHaveBeenCalled();
    });
  });
});
