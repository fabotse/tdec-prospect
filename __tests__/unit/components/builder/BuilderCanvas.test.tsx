/**
 * BuilderCanvas Component Tests
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #2 - Canvas Visual (Estilo Attio)
 * AC: #5 - Estado Vazio do Canvas
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BuilderCanvas } from "@/components/builder/BuilderCanvas";

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

    it("renders block placeholders for each block", () => {
      render(<BuilderCanvas />);

      expect(screen.getByTestId("block-block-1")).toBeInTheDocument();
      expect(screen.getByTestId("block-block-2")).toBeInTheDocument();
    });
  });

  describe("Drag State (AC: #5)", () => {
    it("highlights drop zone when dragging", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = {
          blocks: [],
          isDragging: true,
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
        };
        return selector(state);
      });

      render(<BuilderCanvas />);

      const canvas = screen.getByTestId("builder-canvas");
      expect(canvas).not.toHaveClass("ring-2");
    });
  });
});
