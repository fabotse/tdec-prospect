/**
 * Tests for ImportResultsSummary Component
 * Story: 4.7 - Import Campaign Results
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportResultsSummary } from "@/components/leads/ImportResultsSummary";
import type { ImportCampaignResultsResponse } from "@/types/campaign-import";

describe("ImportResultsSummary", () => {
  const baseResult: ImportCampaignResultsResponse = {
    matched: 5,
    updated: 3,
    unmatched: [],
    errors: [],
  };

  describe("Basic rendering", () => {
    it("should render the summary container", () => {
      render(<ImportResultsSummary result={baseResult} />);
      expect(screen.getByTestId("import-results-summary")).toBeInTheDocument();
    });

    it("should display matched count", () => {
      render(<ImportResultsSummary result={baseResult} />);
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Leads encontrados")).toBeInTheDocument();
    });

    it("should display updated count", () => {
      render(<ImportResultsSummary result={baseResult} />);
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("Leads atualizados")).toBeInTheDocument();
    });

    it("should show singular form for single lead", () => {
      render(
        <ImportResultsSummary result={{ ...baseResult, matched: 1, updated: 1 }} />
      );
      expect(screen.getByText("Lead encontrado")).toBeInTheDocument();
      expect(screen.getByText("Lead atualizado")).toBeInTheDocument();
    });
  });

  describe("Unmatched emails", () => {
    it("should display unmatched count when present", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            unmatched: ["a@test.com", "b@test.com"],
          }}
        />
      );
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("Nao encontrados")).toBeInTheDocument();
    });

    it("should show singular form for single unmatched", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            unmatched: ["a@test.com"],
          }}
        />
      );
      expect(screen.getByText("Nao encontrado")).toBeInTheDocument();
    });

    it("should display list of unmatched emails", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            unmatched: ["notfound@test.com", "missing@test.com"],
          }}
        />
      );
      expect(screen.getByText("notfound@test.com")).toBeInTheDocument();
      expect(screen.getByText("missing@test.com")).toBeInTheDocument();
    });

    it("should show create leads button when onCreateMissingLeads provided", () => {
      const mockOnCreate = vi.fn();
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            unmatched: ["test@test.com"],
          }}
          onCreateMissingLeads={mockOnCreate}
        />
      );

      expect(
        screen.getByTestId("create-missing-leads-button")
      ).toBeInTheDocument();
    });

    it("should not show create button when onCreateMissingLeads not provided", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            unmatched: ["test@test.com"],
          }}
        />
      );

      expect(
        screen.queryByTestId("create-missing-leads-button")
      ).not.toBeInTheDocument();
    });

    it("should call onCreateMissingLeads when button clicked", () => {
      const mockOnCreate = vi.fn();
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            unmatched: ["test@test.com"],
          }}
          onCreateMissingLeads={mockOnCreate}
        />
      );

      fireEvent.click(screen.getByTestId("create-missing-leads-button"));
      expect(mockOnCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("Created leads", () => {
    it("should display created count when present", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            created: 2,
          }}
        />
      );
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("Leads criados")).toBeInTheDocument();
    });

    it("should show singular form for single created", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            created: 1,
          }}
        />
      );
      expect(screen.getByText("Lead criado")).toBeInTheDocument();
    });

    it("should not show created section when count is 0", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            created: 0,
          }}
        />
      );
      expect(screen.queryByText("Leads criados")).not.toBeInTheDocument();
    });
  });

  describe("Errors", () => {
    it("should display errors when present", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            errors: ["Erro ao atualizar test@test.com"],
          }}
        />
      );
      expect(
        screen.getByText("Erro ao atualizar test@test.com")
      ).toBeInTheDocument();
    });

    it("should show errors section title", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            errors: ["Error 1"],
          }}
        />
      );
      expect(screen.getByText("Erros encontrados")).toBeInTheDocument();
    });
  });

  describe("Success message", () => {
    it("should show success message when no unmatched or errors", () => {
      render(<ImportResultsSummary result={baseResult} />);
      expect(
        screen.getByText("Todos os resultados foram processados com sucesso!")
      ).toBeInTheDocument();
    });

    it("should not show success message when there are unmatched emails", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            unmatched: ["test@test.com"],
          }}
        />
      );
      expect(
        screen.queryByText("Todos os resultados foram processados com sucesso!")
      ).not.toBeInTheDocument();
    });

    it("should not show success message when there are errors", () => {
      render(
        <ImportResultsSummary
          result={{
            ...baseResult,
            errors: ["Some error"],
          }}
        />
      );
      expect(
        screen.queryByText("Todos os resultados foram processados com sucesso!")
      ).not.toBeInTheDocument();
    });
  });
});
