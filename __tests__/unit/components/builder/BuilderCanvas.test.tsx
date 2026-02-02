/**
 * BuilderCanvas Component Tests
 * Story 5.2: Campaign Builder Canvas
 * Story 5.3: Email Block Component
 * Story 5.4: Delay Block Component
 * Story 5.5: Sequence Connector Lines
 *
 * AC: #2 - Canvas Visual (Estilo Attio)
 * AC: #5 - Estado Vazio do Canvas
 * AC 5.3 #1 - Arrastar Email Block para Canvas
 * AC 5.3 #3 - Selecionar Email Block (click outside to deselect)
 * AC 5.4 #1 - Arrastar Delay Block para Canvas
 * AC 5.4 #3 - Selecionar Delay Block
 * AC 5.5 #1 - Conectores entre Blocos Consecutivos
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BuilderCanvas } from "@/components/builder/BuilderCanvas";

// Mock framer-motion for EmailBlock, DelayBlock, and SequenceConnector
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
    path: ({ d, stroke, strokeWidth, ...props }: Record<string, unknown>) => (
      <path d={d as string} stroke={stroke as string} strokeWidth={strokeWidth as number} {...props} />
    ),
  },
  useReducedMotion: () => false,
}));

// Mock store functions
const mockSelectBlock = vi.fn();

// Mock useBuilderStore
const mockUseBuilderStore = vi.fn();
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector: (state: unknown) => unknown) =>
    mockUseBuilderStore(selector),
}));

// Mock @dnd-kit/core
vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

describe("BuilderCanvas (AC: #2, #5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty State (AC: #5)", () => {
    beforeEach(() => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [],
          isDragging: false,
          selectBlock: mockSelectBlock,
        };
        return selector(state);
      });
    });

    it("displays empty state message when no blocks exist", () => {
      render(<BuilderCanvas />);

      expect(
        screen.getByText("Arraste blocos aqui para comecar")
      ).toBeInTheDocument();
    });

    it("displays empty state icon", () => {
      const { container } = render(<BuilderCanvas />);

      // Check for the icon (Layers icon from lucide)
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("has correct test id for canvas", () => {
      render(<BuilderCanvas />);

      expect(screen.getByTestId("builder-canvas")).toBeInTheDocument();
    });

    it("has correct test id for empty state", () => {
      render(<BuilderCanvas />);

      expect(screen.getByTestId("canvas-empty-state")).toBeInTheDocument();
    });
  });

  describe("Visual Style (AC: #2)", () => {
    beforeEach(() => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [],
          isDragging: false,
          selectBlock: mockSelectBlock,
        };
        return selector(state);
      });
    });

    it("renders canvas container with flex layout", () => {
      render(<BuilderCanvas />);

      const canvas = screen.getByTestId("builder-canvas");
      expect(canvas).toHaveClass("flex-1");
    });

    it("centers empty state content", () => {
      render(<BuilderCanvas />);

      const emptyState = screen.getByTestId("canvas-empty-state");
      expect(emptyState).toHaveClass("items-center");
      expect(emptyState).toHaveClass("justify-center");
    });
  });

  describe("With Blocks", () => {
    beforeEach(() => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [
            { id: "block-1", type: "email", position: 0, data: {} },
            { id: "block-2", type: "delay", position: 1, data: {} },
          ],
          isDragging: false,
          selectBlock: mockSelectBlock,
          selectedBlockId: null,
          updateBlock: vi.fn(),
        };
        return selector(state);
      });
    });

    it("does not show empty state when blocks exist", () => {
      render(<BuilderCanvas />);

      expect(
        screen.queryByText("Arraste blocos aqui para comecar")
      ).not.toBeInTheDocument();
    });

    it("renders EmailBlock for email type blocks (AC 5.3 #1)", () => {
      render(<BuilderCanvas />);

      // EmailBlock uses email-block-{id} testid
      expect(screen.getByTestId("email-block-block-1")).toBeInTheDocument();
    });

    it("renders DelayBlock for delay type blocks (AC 5.4 #1)", () => {
      render(<BuilderCanvas />);

      // DelayBlock uses delay-block-{id} testid
      expect(screen.getByTestId("delay-block-block-2")).toBeInTheDocument();
    });

    it("displays correct step numbers for delay blocks (AC 5.4 #2)", () => {
      render(<BuilderCanvas />);

      // Second block (delay) should show "Step 2"
      expect(screen.getByText("Step 2")).toBeInTheDocument();
    });

    it("displays correct step numbers for email blocks", () => {
      render(<BuilderCanvas />);

      // First block should show "Step 1"
      expect(screen.getByText("Step 1")).toBeInTheDocument();
    });
  });

  describe("Click to Deselect (AC 5.3 #3)", () => {
    beforeEach(() => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [
            { id: "block-1", type: "email", position: 0, data: {} },
          ],
          isDragging: false,
          selectBlock: mockSelectBlock,
          selectedBlockId: "block-1",
          updateBlock: vi.fn(),
        };
        return selector(state);
      });
    });

    it("calls selectBlock with null when clicking canvas", () => {
      render(<BuilderCanvas />);

      const canvas = screen.getByTestId("builder-canvas");
      fireEvent.click(canvas);

      expect(mockSelectBlock).toHaveBeenCalledWith(null);
    });
  });

  describe("Drag State (AC: #5)", () => {
    it("highlights drop zone when dragging", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [],
          isDragging: true,
          selectBlock: mockSelectBlock,
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      const canvas = screen.getByTestId("builder-canvas");
      expect(canvas).toHaveClass("ring-2");
    });

    it("does not highlight when not dragging", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [],
          isDragging: false,
          selectBlock: mockSelectBlock,
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      const canvas = screen.getByTestId("builder-canvas");
      expect(canvas).not.toHaveClass("ring-2");
    });
  });

  describe("Sequence Connectors (AC 5.5 #1)", () => {
    it("renders connectors between multiple blocks", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [
            { id: "block-1", type: "email", position: 0, data: {} },
            { id: "block-2", type: "delay", position: 1, data: {} },
          ],
          isDragging: false,
          selectBlock: mockSelectBlock,
          selectedBlockId: null,
          updateBlock: vi.fn(),
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      // With 2 blocks, there should be 1 connector (n-1 connectors for n blocks)
      const connectors = screen.getAllByTestId("sequence-connector");
      expect(connectors).toHaveLength(1);
    });

    it("renders correct number of connectors for 3 blocks", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [
            { id: "block-1", type: "email", position: 0, data: {} },
            { id: "block-2", type: "delay", position: 1, data: {} },
            { id: "block-3", type: "email", position: 2, data: {} },
          ],
          isDragging: false,
          selectBlock: mockSelectBlock,
          selectedBlockId: null,
          updateBlock: vi.fn(),
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      // With 3 blocks, there should be 2 connectors
      const connectors = screen.getAllByTestId("sequence-connector");
      expect(connectors).toHaveLength(2);
    });

    it("does not render connectors with single block", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [{ id: "block-1", type: "email", position: 0, data: {} }],
          isDragging: false,
          selectBlock: mockSelectBlock,
          selectedBlockId: null,
          updateBlock: vi.fn(),
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      expect(screen.queryByTestId("sequence-connector")).not.toBeInTheDocument();
    });

    it("does not render connectors with empty canvas", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [],
          isDragging: false,
          selectBlock: mockSelectBlock,
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      expect(screen.queryByTestId("sequence-connector")).not.toBeInTheDocument();
    });

    it("connectors have aria-hidden for accessibility", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [
            { id: "block-1", type: "email", position: 0, data: {} },
            { id: "block-2", type: "delay", position: 1, data: {} },
          ],
          isDragging: false,
          selectBlock: mockSelectBlock,
          selectedBlockId: null,
          updateBlock: vi.fn(),
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      const connector = screen.getByTestId("sequence-connector");
      expect(connector).toHaveAttribute("aria-hidden", "true");
    });
  });
});
