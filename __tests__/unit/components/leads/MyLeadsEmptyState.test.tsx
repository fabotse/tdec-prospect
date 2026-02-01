/**
 * Tests for MyLeadsEmptyState Component
 * Story 4.2.2: My Leads Page
 *
 * AC: #6 - Empty state when no imported leads
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MyLeadsEmptyState } from "@/components/leads/MyLeadsEmptyState";

describe("MyLeadsEmptyState", () => {
  it("should render empty state message", () => {
    render(<MyLeadsEmptyState />);

    expect(
      screen.getByText("Nenhum lead importado ainda")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Importe leads da busca Apollo/i)
    ).toBeInTheDocument();
  });

  it("should render CTA button linking to /leads", () => {
    render(<MyLeadsEmptyState />);

    const ctaButton = screen.getByRole("link", { name: /Buscar Leads/i });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveAttribute("href", "/leads");
  });

  it("should render database icon", () => {
    render(<MyLeadsEmptyState />);

    // Check for the icon container
    const iconContainer = screen.getByTestId("my-leads-empty-state");
    expect(iconContainer).toBeInTheDocument();
  });
});
