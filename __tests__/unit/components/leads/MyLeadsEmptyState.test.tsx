/**
 * Tests for MyLeadsEmptyState Component
 * Story 4.2.2: My Leads Page
 * Quick Dev: Manual Lead Creation
 *
 * AC: #6 - Empty state when no imported leads
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("should render 'Criar Manualmente' button when onCreateLead is provided", () => {
    render(<MyLeadsEmptyState onCreateLead={() => {}} />);

    expect(
      screen.getByTestId("empty-state-create-lead-button")
    ).toBeInTheDocument();
    expect(screen.getByText("Criar Manualmente")).toBeInTheDocument();
  });

  it("should not render 'Criar Manualmente' button when onCreateLead is not provided", () => {
    render(<MyLeadsEmptyState />);

    expect(
      screen.queryByTestId("empty-state-create-lead-button")
    ).not.toBeInTheDocument();
  });

  it("should call onCreateLead when 'Criar Manualmente' button is clicked", async () => {
    const user = userEvent.setup();
    const mockOnCreateLead = vi.fn();

    render(<MyLeadsEmptyState onCreateLead={mockOnCreateLead} />);

    await user.click(screen.getByTestId("empty-state-create-lead-button"));

    expect(mockOnCreateLead).toHaveBeenCalledTimes(1);
  });
});
