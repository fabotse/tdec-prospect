/**
 * Leads Empty State Tests
 * Story: 3.1 - Leads Page & Data Model
 * AC: #5 - Empty state with helpful message and CTA
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeadsEmptyState } from "@/components/leads/LeadsEmptyState";

describe("LeadsEmptyState", () => {
  it("renders icon", () => {
    render(<LeadsEmptyState />);

    // Icon should be inside a rounded container
    const iconContainer = document.querySelector(".rounded-full");
    expect(iconContainer).toBeInTheDocument();
  });

  it("renders title text", () => {
    render(<LeadsEmptyState />);

    expect(screen.getByText("Nenhum lead encontrado")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<LeadsEmptyState />);

    expect(
      screen.getByText(/Comece buscando leads usando a busca conversacional/)
    ).toBeInTheDocument();
  });

  it("renders CTA button with correct text", () => {
    render(<LeadsEmptyState />);

    const button = screen.getByRole("button", { name: /Buscar Leads/i });
    expect(button).toBeInTheDocument();
  });

  it("CTA button is clickable", () => {
    render(<LeadsEmptyState />);

    const button = screen.getByRole("button", { name: /Buscar Leads/i });
    expect(button).not.toBeDisabled();
  });

  it("renders inside a Card component", () => {
    render(<LeadsEmptyState />);

    // Card component has data-slot="card"
    const card = document.querySelector('[data-slot="card"]');
    expect(card).toBeInTheDocument();
  });

  it("renders search icon inside button", () => {
    render(<LeadsEmptyState />);

    // Button should contain an SVG (Search icon)
    const button = screen.getByRole("button", { name: /Buscar Leads/i });
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("has proper styling for empty state", () => {
    render(<LeadsEmptyState />);

    // Check for centered content
    const content = document.querySelector('[data-slot="card-content"]');
    expect(content).toHaveClass("flex");
    expect(content).toHaveClass("flex-col");
    expect(content).toHaveClass("items-center");
    expect(content).toHaveClass("justify-center");
  });
});
