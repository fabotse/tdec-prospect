/**
 * Tests for InsightsFilterBar Component
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #7 - Filtros: status (novos/usados/descartados), periodo
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsightsFilterBar } from "@/components/insights/InsightsFilterBar";

describe("InsightsFilterBar", () => {
  const defaultProps = {
    statusFilter: "",
    periodFilter: "all",
    onFilterChange: vi.fn(),
  };

  it("should render status and period select triggers", () => {
    render(<InsightsFilterBar {...defaultProps} />);

    expect(screen.getByText("Todos os Status")).toBeInTheDocument();
    expect(screen.getByText("Todo o periodo")).toBeInTheDocument();
  });

  it("should not show clear button when no active filters", () => {
    render(<InsightsFilterBar {...defaultProps} />);

    expect(screen.queryByText("Limpar")).not.toBeInTheDocument();
  });

  it("should show clear button when status filter active", () => {
    render(
      <InsightsFilterBar
        {...defaultProps}
        statusFilter="new"
      />
    );

    expect(screen.getByText("Limpar")).toBeInTheDocument();
  });

  it("should show clear button when period filter active", () => {
    render(
      <InsightsFilterBar
        {...defaultProps}
        periodFilter="7d"
      />
    );

    expect(screen.getByText("Limpar")).toBeInTheDocument();
  });

  it("should call onFilterChange to clear when clear button clicked", async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();

    render(
      <InsightsFilterBar
        statusFilter="new"
        periodFilter="7d"
        onFilterChange={onFilterChange}
      />
    );

    await user.click(screen.getByText("Limpar"));

    expect(onFilterChange).toHaveBeenCalledWith("", "all");
  });

  it("should render two select triggers (status + period)", () => {
    render(<InsightsFilterBar {...defaultProps} />);

    const triggers = screen.getAllByRole("combobox");
    expect(triggers).toHaveLength(2);
  });

  it("should display selected status filter value", () => {
    render(
      <InsightsFilterBar
        {...defaultProps}
        statusFilter="new"
      />
    );

    expect(screen.getByText("Novos")).toBeInTheDocument();
  });
});
