/**
 * Tests for OpportunitiesEmptyState Component
 * Story 21.4: Central de Oportunidades — AC #6
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpportunitiesEmptyState } from "@/components/opportunities/OpportunitiesEmptyState";

describe("OpportunitiesEmptyState", () => {
  it("should orient the user when there are no opportunities (sem filtros)", () => {
    render(<OpportunitiesEmptyState hasFilters={false} />);

    expect(screen.getByText("Nenhuma oportunidade ainda")).toBeInTheDocument();
    expect(
      screen.getByText(/Quando um lead responder ou engajar com suas campanhas/)
    ).toBeInTheDocument();
  });

  it("should show distinct copy when filters are active", () => {
    render(<OpportunitiesEmptyState hasFilters={true} />);

    expect(
      screen.getByText("Nenhuma oportunidade com esses filtros")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tente ajustar os filtros para ver mais resultados/)
    ).toBeInTheDocument();
  });
});
