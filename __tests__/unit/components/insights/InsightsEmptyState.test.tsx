/**
 * Tests for InsightsEmptyState Component
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #9 - Empty state quando nao ha insights
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsightsEmptyState } from "@/components/insights/InsightsEmptyState";

describe("InsightsEmptyState", () => {
  it("should render default empty state without filters", () => {
    render(<InsightsEmptyState hasFilters={false} />);

    expect(screen.getByText("Nenhum insight ainda")).toBeInTheDocument();
    expect(
      screen.getByText(/Quando leads monitorados publicarem posts relevantes/i)
    ).toBeInTheDocument();
  });

  it("should render filter-specific message when hasFilters is true", () => {
    render(<InsightsEmptyState hasFilters={true} />);

    expect(screen.getByText("Nenhum insight encontrado")).toBeInTheDocument();
    expect(
      screen.getByText(/Tente ajustar os filtros/i)
    ).toBeInTheDocument();
  });

  it("should render lightbulb icon", () => {
    const { container } = render(<InsightsEmptyState hasFilters={false} />);

    // Lightbulb icon from lucide-react renders as SVG with specific class
    const svg = container.querySelector("svg.lucide-lightbulb");
    expect(svg).toBeInTheDocument();
  });
});
