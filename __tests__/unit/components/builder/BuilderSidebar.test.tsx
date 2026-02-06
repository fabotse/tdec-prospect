/**
 * BuilderSidebar Component Tests
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #3 - Sidebar de Blocos
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BuilderSidebar, AVAILABLE_BLOCKS } from "@/components/builder/BuilderSidebar";

// Mock @dnd-kit/core
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

describe("BuilderSidebar (AC: #3)", () => {
  describe("Rendering", () => {
    it("renders sidebar container", () => {
      render(<BuilderSidebar />);

      expect(screen.getByTestId("builder-sidebar")).toBeInTheDocument();
    });

    it("displays 'Blocos' heading", () => {
      render(<BuilderSidebar />);

      expect(screen.getByText("Blocos")).toBeInTheDocument();
    });

    it("renders all available blocks", () => {
      render(<BuilderSidebar />);

      AVAILABLE_BLOCKS.forEach((block) => {
        expect(screen.getByTestId(`sidebar-block-${block.type}`)).toBeInTheDocument();
      });
    });

    it("displays Email block with correct content", () => {
      render(<BuilderSidebar />);

      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Adicione um email a sequencia")).toBeInTheDocument();
    });

    it("displays Aguardar block with correct content", () => {
      render(<BuilderSidebar />);

      expect(screen.getByText("Aguardar")).toBeInTheDocument();
      expect(screen.getByText("Adicione um intervalo entre emails")).toBeInTheDocument();
    });
  });

  describe("Available Blocks Configuration", () => {
    it("has email block configured", () => {
      const emailBlock = AVAILABLE_BLOCKS.find((b) => b.type === "email");
      expect(emailBlock).toBeDefined();
      expect(emailBlock?.label).toBe("Email");
    });

    it("has delay block configured", () => {
      const delayBlock = AVAILABLE_BLOCKS.find((b) => b.type === "delay");
      expect(delayBlock).toBeDefined();
      expect(delayBlock?.label).toBe("Aguardar");
    });

    it("has exactly 2 block types", () => {
      expect(AVAILABLE_BLOCKS).toHaveLength(2);
    });
  });

  describe("Styling", () => {
    it("has correct width", () => {
      render(<BuilderSidebar />);

      const sidebar = screen.getByTestId("builder-sidebar");
      expect(sidebar).toHaveClass("w-64");
    });

    it("has border on right side", () => {
      render(<BuilderSidebar />);

      const sidebar = screen.getByTestId("builder-sidebar");
      expect(sidebar).toHaveClass("border-r");
    });
  });
});
