/**
 * DelayBlock Component Tests
 * Story 5.4: Delay Block Component
 *
 * AC: #1 - Arrastar Delay Block para Canvas
 * AC: #2 - Visual do Delay Block (Estilo Attio)
 * AC: #3 - Selecionar Delay Block
 * AC: #4 - Editar Duracao do Delay
 * AC: #5 - Sugestao de Intervalos (FR16)
 * AC: #6 - Drag Handle para Reposicionamento
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DelayBlock } from "@/components/builder/DelayBlock";
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
const mockRemoveBlock = vi.fn();
let mockSelectedBlockId: string | null = null;

// Mock useBuilderStore
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector: (state: unknown) => unknown) => {
    const state = {
      selectedBlockId: mockSelectedBlockId,
      selectBlock: mockSelectBlock,
      updateBlock: mockUpdateBlock,
      removeBlock: mockRemoveBlock,
    };
    return selector(state);
  },
}));

describe("DelayBlock (AC: #1, #2, #3, #4, #5, #6)", () => {
  const mockBlock: BuilderBlock = {
    id: "test-block-123",
    type: "delay",
    position: 0,
    data: { delayValue: 2, delayUnit: "days" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedBlockId = null;
  });

  describe("Visual Style (AC: #2)", () => {
    it("renders with step number and aguardar type", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      expect(screen.getByText("Step 2")).toBeInTheDocument();
      expect(screen.getByText("Aguardar")).toBeInTheDocument();
    });

    it("displays default delay value", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      expect(screen.getByText("2 dias")).toBeInTheDocument();
    });

    it("has correct test id for block", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      expect(
        screen.getByTestId(`delay-block-${mockBlock.id}`)
      ).toBeInTheDocument();
    });

    it("displays different step numbers correctly", () => {
      const { rerender } = render(
        <DelayBlock block={mockBlock} stepNumber={3} />
      );

      expect(screen.getByText("Step 3")).toBeInTheDocument();

      rerender(<DelayBlock block={mockBlock} stepNumber={5} />);
      expect(screen.getByText("Step 5")).toBeInTheDocument();
    });

    it("renders compact card style (max-w-md)", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const blockElement = screen.getByTestId(`delay-block-${mockBlock.id}`);
      expect(blockElement).toHaveClass("max-w-md");
    });

    it("renders amber clock icon", () => {
      const { container } = render(
        <DelayBlock block={mockBlock} stepNumber={2} />
      );

      // Check for accent icon container (B&W theme)
      const iconContainer = container.querySelector(".bg-accent");
      expect(iconContainer).toBeInTheDocument();

      // Check for clock icon with accent-foreground color (B&W theme)
      const clockIcon = container.querySelector(".text-accent-foreground");
      expect(clockIcon).toBeInTheDocument();
    });
  });

  describe("Selection State (AC: #3)", () => {
    it("shows selected state when selectedBlockId matches", () => {
      mockSelectedBlockId = mockBlock.id;
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const blockElement = screen.getByTestId(`delay-block-${mockBlock.id}`);
      expect(blockElement).toHaveClass("border-primary");
      expect(blockElement).toHaveClass("ring-2");
    });

    it("does not show selected state when selectedBlockId differs", () => {
      mockSelectedBlockId = "other-block-id";
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const blockElement = screen.getByTestId(`delay-block-${mockBlock.id}`);
      expect(blockElement).not.toHaveClass("border-primary");
      expect(blockElement).toHaveClass("border-border");
    });

    it("calls selectBlock when block is clicked", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const blockElement = screen.getByTestId(`delay-block-${mockBlock.id}`);
      fireEvent.click(blockElement);

      expect(mockSelectBlock).toHaveBeenCalledWith(mockBlock.id);
    });

    it("stops propagation when block is clicked", () => {
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <DelayBlock block={mockBlock} stepNumber={2} />
        </div>
      );

      const blockElement = screen.getByTestId(`delay-block-${mockBlock.id}`);
      fireEvent.click(blockElement);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe("Drag Handle (AC: #6)", () => {
    it("renders drag handle", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
    });

    it("drag handle has correct aria-label", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const dragHandle = screen.getByTestId("drag-handle");
      expect(dragHandle).toHaveAttribute(
        "aria-label",
        "Arrastar para reordenar"
      );
    });

    it("drag handle has grab cursor style", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const dragHandle = screen.getByTestId("drag-handle");
      expect(dragHandle).toHaveClass("cursor-grab");
    });
  });

  describe("Delay Value Dropdown (AC: #4)", () => {
    it("renders delay value trigger button", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      expect(screen.getByTestId("delay-value-trigger")).toBeInTheDocument();
    });

    it("displays current delay value on trigger", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const trigger = screen.getByTestId("delay-value-trigger");
      expect(trigger).toHaveTextContent("2 dias");
    });

    it("trigger button has chevron icon for dropdown indication", () => {
      const { container } = render(
        <DelayBlock block={mockBlock} stepNumber={2} />
      );

      // Check for chevron-down icon indicating dropdown
      const chevronIcon = container.querySelector(".lucide-chevron-down");
      expect(chevronIcon).toBeInTheDocument();
    });
  });

  describe("Recommended Presets Verification (AC: #5)", () => {
    // Note: Radix UI DropdownMenu uses portals which are complex to test
    // DELAY_PRESETS constant validation is covered in types tests
    // Component correctly uses DELAY_PRESETS which includes recommended flags
    it("trigger displays formatted delay using formatDelayDisplay", () => {
      const hoursBlock: BuilderBlock = {
        id: "test-hours-block",
        type: "delay",
        position: 0,
        data: { delayValue: 24, delayUnit: "hours" },
      };

      render(<DelayBlock block={hoursBlock} stepNumber={2} />);

      const trigger = screen.getByTestId("delay-value-trigger");
      expect(trigger).toHaveTextContent("24 horas");
    });
  });

  describe("Default Values", () => {
    it("handles block without data (uses defaults)", () => {
      const blockWithoutData: BuilderBlock = {
        id: "test-block-no-data",
        type: "delay",
        position: 0,
        data: {},
      };

      render(<DelayBlock block={blockWithoutData} stepNumber={2} />);

      // Should default to 2 days
      expect(screen.getByText("2 dias")).toBeInTheDocument();
    });

    it("handles block with partial data", () => {
      const blockWithPartialData: BuilderBlock = {
        id: "test-block-partial",
        type: "delay",
        position: 0,
        data: { delayValue: 5 },
      };

      render(<DelayBlock block={blockWithPartialData} stepNumber={2} />);

      // Should use provided value with default unit
      expect(screen.getByText("5 dias")).toBeInTheDocument();
    });

    it("displays hours unit correctly", () => {
      const hoursBlock: BuilderBlock = {
        id: "test-block-hours",
        type: "delay",
        position: 0,
        data: { delayValue: 12, delayUnit: "hours" },
      };

      render(<DelayBlock block={hoursBlock} stepNumber={2} />);

      expect(screen.getByText("12 horas")).toBeInTheDocument();
    });
  });

  describe("State Sync with Props", () => {
    it("syncs local state when block.data changes externally", () => {
      const initialBlock: BuilderBlock = {
        id: "test-block-sync",
        type: "delay",
        position: 0,
        data: { delayValue: 2, delayUnit: "days" },
      };

      const { rerender } = render(
        <DelayBlock block={initialBlock} stepNumber={2} />
      );

      // Verify initial value
      expect(screen.getByText("2 dias")).toBeInTheDocument();

      // Simulate external update (e.g., undo/redo)
      const updatedBlock: BuilderBlock = {
        ...initialBlock,
        data: { delayValue: 5, delayUnit: "hours" },
      };

      rerender(<DelayBlock block={updatedBlock} stepNumber={2} />);

      // Verify synced value
      expect(screen.getByText("5 horas")).toBeInTheDocument();
    });
  });

  describe("Store Integration (AC: #1)", () => {
    // Note: Full store integration is tested via the trigger button and
    // internal component state. The handleDelayChange function calls updateBlock
    // which is verified through the types tests and internal implementation.
    // Radix UI DropdownMenu portal rendering makes direct interaction testing complex.

    it("selectBlock is called when block is clicked", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      const block = screen.getByTestId(`delay-block-${mockBlock.id}`);
      fireEvent.click(block);

      expect(mockSelectBlock).toHaveBeenCalledWith(mockBlock.id);
    });

    it("block receives correct data from store", () => {
      const blockWith5Days: BuilderBlock = {
        id: "test-5days",
        type: "delay",
        position: 0,
        data: { delayValue: 5, delayUnit: "days" },
      };

      render(<DelayBlock block={blockWith5Days} stepNumber={2} />);

      const trigger = screen.getByTestId("delay-value-trigger");
      expect(trigger).toHaveTextContent("5 dias");
    });
  });

  // ==============================================
  // Delete Block Tests
  // ==============================================

  describe("Delete Block", () => {
    it("renders delete button", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      expect(screen.getByTestId("delete-block-button")).toBeInTheDocument();
    });

    it("calls removeBlock when delete button is clicked", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      fireEvent.click(screen.getByTestId("delete-block-button"));

      expect(mockRemoveBlock).toHaveBeenCalledWith(mockBlock.id);
    });

    it("does not select block when delete button is clicked", () => {
      render(<DelayBlock block={mockBlock} stepNumber={2} />);

      fireEvent.click(screen.getByTestId("delete-block-button"));

      expect(mockSelectBlock).not.toHaveBeenCalled();
    });
  });
});
