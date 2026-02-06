/**
 * EmptyState Component Tests
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Show empty state with CTA when no campaigns exist
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmptyState } from "@/components/campaigns/EmptyState";

describe("EmptyState", () => {
  describe("Rendering (AC: #1)", () => {
    it("displays empty state message", () => {
      render(<EmptyState onCreateClick={vi.fn()} />);

      expect(screen.getByText("Nenhuma campanha encontrada")).toBeInTheDocument();
    });

    it("displays descriptive text", () => {
      render(<EmptyState onCreateClick={vi.fn()} />);

      expect(
        screen.getByText(/Crie sua primeira campanha de outreach/i)
      ).toBeInTheDocument();
    });

    it("displays CTA button", () => {
      render(<EmptyState onCreateClick={vi.fn()} />);

      expect(
        screen.getByRole("button", { name: /Criar sua primeira campanha/i })
      ).toBeInTheDocument();
    });

    it("displays mail icon", () => {
      const { container } = render(<EmptyState onCreateClick={vi.fn()} />);

      // Check for the icon container
      const iconContainer = container.querySelector(".rounded-full.bg-muted");
      expect(iconContainer).toBeInTheDocument();
    });

    it("has correct test id on create button", () => {
      render(<EmptyState onCreateClick={vi.fn()} />);

      expect(screen.getByTestId("empty-state-create-button")).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("calls onCreateClick when CTA button is clicked", () => {
      const handleClick = vi.fn();
      render(<EmptyState onCreateClick={handleClick} />);

      const button = screen.getByTestId("empty-state-create-button");
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("button is clickable multiple times", () => {
      const handleClick = vi.fn();
      render(<EmptyState onCreateClick={handleClick} />);

      const button = screen.getByTestId("empty-state-create-button");
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(3);
    });
  });

  describe("Styling", () => {
    it("centers content", () => {
      const { container } = render(<EmptyState onCreateClick={vi.fn()} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass("flex");
      expect(wrapper).toHaveClass("flex-col");
      expect(wrapper).toHaveClass("items-center");
      expect(wrapper).toHaveClass("justify-center");
    });

    it("has vertical padding", () => {
      const { container } = render(<EmptyState onCreateClick={vi.fn()} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass("py-16");
    });

    it("has centered text", () => {
      const { container } = render(<EmptyState onCreateClick={vi.fn()} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass("text-center");
    });
  });

  describe("Accessibility", () => {
    it("button has accessible name", () => {
      render(<EmptyState onCreateClick={vi.fn()} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAccessibleName(/Criar sua primeira campanha/i);
    });

    it("heading has correct semantic level", () => {
      render(<EmptyState onCreateClick={vi.fn()} />);

      const heading = screen.getByRole("heading", { level: 3 });
      expect(heading).toHaveTextContent("Nenhuma campanha encontrada");
    });
  });
});
