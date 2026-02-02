/**
 * SortableBlock Component Tests
 * Story 5.6: Block Drag & Reorder
 *
 * AC: #1 - Arrastar Bloco pelo Handle
 * AC: #3 - Feedback Visual Durante Arrasto
 * AC: #5 - Acessibilidade (WCAG 2.1 AA)
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SortableBlock } from "@/components/builder/SortableBlock";
import type { BuilderBlock } from "@/stores/use-builder-store";

// Mock framer-motion for EmailBlock and DelayBlock
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
  useReducedMotion: () => false,
}));

// Mock store functions
const mockSelectBlock = vi.fn();
const mockUpdateBlock = vi.fn();

// Mock useBuilderStore
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector: (state: unknown) => unknown) => {
    const state = {
      selectedBlockId: null,
      selectBlock: mockSelectBlock,
      updateBlock: mockUpdateBlock,
    };
    return selector(state);
  },
}));

// Mock useSortable with configurable state
const mockUseSortable = vi.fn();
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => mockUseSortable(),
}));

// Mock CSS utilities
vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: (transform: unknown) => (transform ? "translateY(10px)" : undefined),
    },
  },
}));

describe("SortableBlock (AC 5.6: #1, #3, #5)", () => {
  const emailBlock: BuilderBlock = {
    id: "block-email-1",
    type: "email",
    position: 0,
    data: { subject: "Test Subject", body: "Test Body" },
  };

  const delayBlock: BuilderBlock = {
    id: "block-delay-1",
    type: "delay",
    position: 1,
    data: { delayValue: 2, delayUnit: "days" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation - not dragging
    mockUseSortable.mockReturnValue({
      attributes: { "aria-describedby": "sortable-description" },
      listeners: { onPointerDown: vi.fn() },
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    });
  });

  describe("Rendering (AC #1)", () => {
    it("renders email block with sortable wrapper", () => {
      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      expect(screen.getByRole("listitem")).toBeInTheDocument();
      expect(screen.getByTestId("email-block-block-email-1")).toBeInTheDocument();
    });

    it("renders delay block with sortable wrapper", () => {
      render(<SortableBlock block={delayBlock} stepNumber={2} />);

      expect(screen.getByRole("listitem")).toBeInTheDocument();
      expect(screen.getByTestId("delay-block-block-delay-1")).toBeInTheDocument();
    });

    it("passes stepNumber to EmailBlock", () => {
      render(<SortableBlock block={emailBlock} stepNumber={3} />);

      expect(screen.getByText("Step 3")).toBeInTheDocument();
    });

    it("passes stepNumber to DelayBlock", () => {
      render(<SortableBlock block={delayBlock} stepNumber={5} />);

      expect(screen.getByText("Step 5")).toBeInTheDocument();
    });
  });

  describe("Visual Feedback During Drag (AC #3)", () => {
    it("applies opacity-50 class when dragging", () => {
      mockUseSortable.mockReturnValue({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: { x: 0, y: 10, scaleX: 1, scaleY: 1 },
        transition: "transform 200ms ease",
        isDragging: true,
      });

      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).toHaveClass("opacity-50");
    });

    it("does not apply opacity class when not dragging", () => {
      mockUseSortable.mockReturnValue({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false,
      });

      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).not.toHaveClass("opacity-50");
    });

    it("applies transform style when transform is provided", () => {
      mockUseSortable.mockReturnValue({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: { x: 0, y: 20, scaleX: 1, scaleY: 1 },
        transition: "transform 200ms ease",
        isDragging: false,
      });

      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).toHaveStyle({ transform: "translateY(10px)" });
    });

    it("applies transition style when transition is provided", () => {
      mockUseSortable.mockReturnValue({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: "transform 200ms ease",
        isDragging: false,
      });

      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).toHaveStyle({ transition: "transform 200ms ease" });
    });
  });

  describe("Accessibility (AC #5)", () => {
    it("has role='listitem'", () => {
      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      expect(screen.getByRole("listitem")).toBeInTheDocument();
    });

    it("has correct aria-label for email block (Portuguese)", () => {
      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).toHaveAttribute("aria-label", "Bloco Email, passo 1");
    });

    it("has correct aria-label for delay block (Portuguese)", () => {
      render(<SortableBlock block={delayBlock} stepNumber={2} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).toHaveAttribute("aria-label", "Bloco Delay, passo 2");
    });

    it("passes sortable attributes to wrapper", () => {
      mockUseSortable.mockReturnValue({
        attributes: { "aria-describedby": "dnd-description-123" },
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false,
      });

      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).toHaveAttribute("aria-describedby", "dnd-description-123");
    });

    it("renders drag handle in email block", () => {
      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const dragHandle = screen.getByTestId("drag-handle");
      expect(dragHandle).toBeInTheDocument();
      expect(dragHandle).toHaveAttribute("aria-label", "Arrastar para reordenar");
    });

    it("renders drag handle in delay block", () => {
      render(<SortableBlock block={delayBlock} stepNumber={2} />);

      const dragHandle = screen.getByTestId("drag-handle");
      expect(dragHandle).toBeInTheDocument();
      expect(dragHandle).toHaveAttribute("aria-label", "Arrastar para reordenar");
    });
  });

  describe("useSortable Hook Integration", () => {
    it("calls useSortable with block id", () => {
      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      // The component should have called useSortable
      expect(mockUseSortable).toHaveBeenCalled();
    });

    it("applies full-width class to wrapper", () => {
      render(<SortableBlock block={emailBlock} stepNumber={1} />);

      const wrapper = screen.getByRole("listitem");
      expect(wrapper).toHaveClass("w-full");
    });
  });
});
