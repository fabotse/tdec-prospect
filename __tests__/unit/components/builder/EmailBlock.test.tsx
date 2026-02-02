/**
 * EmailBlock Component Tests
 * Story 5.3: Email Block Component
 *
 * AC: #2 - Visual do Email Block (Estilo Attio)
 * AC: #3 - Selecionar Email Block
 * AC: #4 - Drag Handle para Reposicionamento
 * AC: #5 - Campos Editaveis (Placeholder)
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailBlock } from "@/components/builder/EmailBlock";
import type { BuilderBlock } from "@/stores/use-builder-store";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      className,
      onClick,
      "data-testid": testId,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
      "data-testid"?: string;
    }) => (
      <div className={className} onClick={onClick} data-testid={testId}>
        {children}
      </div>
    ),
  },
}));

// Mock store functions
const mockSelectBlock = vi.fn();
const mockUpdateBlock = vi.fn();
let mockSelectedBlockId: string | null = null;

// Mock useBuilderStore
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector: (state: unknown) => unknown) => {
    const state = {
      selectedBlockId: mockSelectedBlockId,
      selectBlock: mockSelectBlock,
      updateBlock: mockUpdateBlock,
    };
    return selector(state);
  },
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
    mockSelectedBlockId = null;
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
    it("updates store when subject changes", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.change(subjectInput, { target: { value: "Novo assunto" } });

      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "Novo assunto", body: "" },
      });
    });

    it("updates store when body changes", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const bodyInput = screen.getByTestId("email-body-input");
      fireEvent.change(bodyInput, { target: { value: "Novo conteudo" } });

      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: { subject: "", body: "Novo conteudo" },
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
    it("calls updateBlock which sets hasChanges (AC #1, #5)", () => {
      render(<EmailBlock block={mockBlock} stepNumber={1} />);

      const subjectInput = screen.getByTestId("email-subject-input");
      fireEvent.change(subjectInput, { target: { value: "Test" } });

      // updateBlock is called, which internally sets hasChanges: true
      // (verified by inspecting use-builder-store.ts line 107)
      expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
        data: expect.objectContaining({ subject: "Test" }),
      });
    });
  });
});
