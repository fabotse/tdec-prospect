/**
 * ExtractedFiltersDisplay Component Tests
 * Story: 3.4 - AI Conversational Search
 * AC: #3 - Show filter badges: "Tecnologia", "São Paulo", "51-200 func"
 * AC: #5 - "Editar filtros" button to open FilterPanel
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtractedFiltersDisplay } from "@/components/search/ExtractedFiltersDisplay";

describe("ExtractedFiltersDisplay", () => {
  it("renders nothing when no filters are provided", () => {
    const { container } = render(
      <ExtractedFiltersDisplay filters={{}} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when all filter arrays are empty", () => {
    const { container } = render(
      <ExtractedFiltersDisplay
        filters={{
          industries: [],
          locations: [],
          companySizes: [],
          titles: [],
          keywords: "",
        }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("displays industry badges with Portuguese labels", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology", "finance"],
        }}
      />
    );

    expect(screen.getByText("Tecnologia")).toBeInTheDocument();
    expect(screen.getByText("Finanças")).toBeInTheDocument();
  });

  it("displays unknown industries as-is", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["unknown_industry"],
        }}
      />
    );

    expect(screen.getByText("unknown_industry")).toBeInTheDocument();
  });

  it("displays location badges", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          locations: ["São Paulo, Brazil", "Rio de Janeiro, Brazil"],
        }}
      />
    );

    expect(screen.getByText("São Paulo, Brazil")).toBeInTheDocument();
    expect(screen.getByText("Rio de Janeiro, Brazil")).toBeInTheDocument();
  });

  it("displays company size badges with 'func' suffix", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          companySizes: ["1-10", "51-200"],
        }}
      />
    );

    expect(screen.getByText("1-10 func")).toBeInTheDocument();
    expect(screen.getByText("51-200 func")).toBeInTheDocument();
  });

  it("displays title badges", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          titles: ["CTO", "CEO", "VP Engineering"],
        }}
      />
    );

    expect(screen.getByText("CTO")).toBeInTheDocument();
    expect(screen.getByText("CEO")).toBeInTheDocument();
    expect(screen.getByText("VP Engineering")).toBeInTheDocument();
  });

  it("displays keywords in quotes", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          keywords: "fintech startup",
        }}
      />
    );

    expect(screen.getByText('"fintech startup"')).toBeInTheDocument();
  });

  it("shows low confidence indicator when confidence < 0.7", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
        confidence={0.5}
      />
    );

    expect(screen.getByText("Baixa confiança")).toBeInTheDocument();
  });

  it("does not show low confidence indicator when confidence >= 0.7", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
        confidence={0.9}
      />
    );

    expect(screen.queryByText("Baixa confiança")).not.toBeInTheDocument();
  });

  it("does not show low confidence indicator when confidence is undefined", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
      />
    );

    expect(screen.queryByText("Baixa confiança")).not.toBeInTheDocument();
  });

  it("shows edit button when onEdit is provided", () => {
    const onEdit = vi.fn();
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
        onEdit={onEdit}
      />
    );

    expect(screen.getByTestId("edit-filters-button")).toBeInTheDocument();
    expect(screen.getByText("Editar filtros")).toBeInTheDocument();
  });

  it("does not show edit button when onEdit is not provided", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
      />
    );

    expect(screen.queryByTestId("edit-filters-button")).not.toBeInTheDocument();
  });

  it("calls onEdit when edit button is clicked", async () => {
    const onEdit = vi.fn();
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
        onEdit={onEdit}
      />
    );

    await userEvent.click(screen.getByTestId("edit-filters-button"));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("displays header text", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
      />
    );

    expect(screen.getByText("Filtros extraídos:")).toBeInTheDocument();
  });

  it("displays multiple filter types together", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
          locations: ["São Paulo, Brazil"],
          companySizes: ["51-200"],
          titles: ["CTO"],
          keywords: "startup",
        }}
      />
    );

    expect(screen.getByText("Tecnologia")).toBeInTheDocument();
    expect(screen.getByText("São Paulo, Brazil")).toBeInTheDocument();
    expect(screen.getByText("51-200 func")).toBeInTheDocument();
    expect(screen.getByText("CTO")).toBeInTheDocument();
    expect(screen.getByText('"startup"')).toBeInTheDocument();
  });

  it("has correct test id for container", () => {
    render(
      <ExtractedFiltersDisplay
        filters={{
          industries: ["technology"],
        }}
      />
    );

    expect(screen.getByTestId("extracted-filters-display")).toBeInTheDocument();
  });
});
