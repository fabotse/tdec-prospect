/**
 * IcebreakerCategorySelect Component Tests
 * Story 9.1: AC #1 - Category selection for icebreaker focus
 *
 * Tests: category selection, default state, post warning badge
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { IcebreakerCategorySelect } from "@/components/leads/IcebreakerCategorySelect";
import { ICEBREAKER_CATEGORIES } from "@/types/ai-prompt";
import type { IcebreakerCategory } from "@/types/ai-prompt";

describe("IcebreakerCategorySelect", () => {
  const defaultProps = {
    value: "empresa" as IcebreakerCategory,
    onValueChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with label", () => {
    render(<IcebreakerCategorySelect {...defaultProps} />);

    expect(screen.getByText("Categoria do Ice Breaker")).toBeInTheDocument();
  });

  it("renders the select trigger with testid", () => {
    render(<IcebreakerCategorySelect {...defaultProps} />);

    expect(screen.getByTestId("icebreaker-category-select")).toBeInTheDocument();
  });

  it("shows post warning when showPostWarning is true and category is post", () => {
    render(
      <IcebreakerCategorySelect
        {...defaultProps}
        value="post"
        showPostWarning={true}
      />
    );

    expect(screen.getByTestId("icebreaker-post-warning")).toBeInTheDocument();
    expect(
      screen.getByText("Lead sem posts do LinkedIn — será gerado com foco no perfil")
    ).toBeInTheDocument();
  });

  it("does not show post warning when category is not post", () => {
    render(
      <IcebreakerCategorySelect
        {...defaultProps}
        value="empresa"
        showPostWarning={true}
      />
    );

    expect(screen.queryByTestId("icebreaker-post-warning")).not.toBeInTheDocument();
  });

  it("does not show post warning when showPostWarning is false", () => {
    render(
      <IcebreakerCategorySelect
        {...defaultProps}
        value="post"
        showPostWarning={false}
      />
    );

    expect(screen.queryByTestId("icebreaker-post-warning")).not.toBeInTheDocument();
  });

  it("renders as disabled when disabled prop is true", () => {
    render(<IcebreakerCategorySelect {...defaultProps} disabled={true} />);

    const trigger = screen.getByTestId("icebreaker-category-select");
    expect(trigger).toBeDisabled();
  });

  it("displays selected category label in trigger", () => {
    render(<IcebreakerCategorySelect {...defaultProps} value="cargo" />);

    expect(screen.getByText("Cargo")).toBeInTheDocument();
  });

  it("has all 4 icebreaker categories defined", () => {
    expect(ICEBREAKER_CATEGORIES).toHaveLength(4);
    const values = ICEBREAKER_CATEGORIES.map((c) => c.value);
    expect(values).toEqual(["lead", "empresa", "cargo", "post"]);
  });

  it("renders trigger with combobox role", () => {
    render(<IcebreakerCategorySelect {...defaultProps} />);

    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-testid", "icebreaker-category-select");
  });
});
