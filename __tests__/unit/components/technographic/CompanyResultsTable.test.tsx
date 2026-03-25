/**
 * CompanyResultsTable Component Tests
 * Story: 15.3 - Resultados de Empresas: Tabela e Selecao
 *
 * AC: #1 - Table with columns, confidence badges
 * AC: #2 - Confidence badge colors (low=amarelo, medium=laranja, high=verde)
 * AC: #3 - Individual checkbox selection + counter
 * AC: #4 - Header checkbox select-all/deselect-all + indeterminate
 * AC: #5 - Pagination
 * AC: #6 - Empty state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompanyResultsTable } from "@/components/technographic/CompanyResultsTable";
import type { TheirStackCompany } from "@/types/theirstack";

const mockCompanies: TheirStackCompany[] = [
  {
    name: "Acme Corp",
    domain: "acme.com",
    url: "https://acme.com",
    country: "Brazil",
    country_code: "BR",
    city: "São Paulo",
    industry: "Software",
    employee_count_range: "100-500",
    apollo_id: "apollo-123",
    annual_revenue_usd: 5000000,
    founded_year: 2015,
    linkedin_url: "https://linkedin.com/company/acme",
    technologies_found: [
      {
        technology: { name: "React", slug: "react" },
        confidence: "high",
        theirstack_score: 0.95,
      },
    ],
    has_blurred_data: false,
  },
  {
    name: "Test Inc",
    domain: "test.com",
    url: null,
    country: null,
    country_code: null,
    city: null,
    industry: null,
    employee_count_range: null,
    apollo_id: null,
    annual_revenue_usd: null,
    founded_year: null,
    linkedin_url: null,
    technologies_found: [
      {
        technology: { name: "Vue.js", slug: "vuejs" },
        confidence: "medium",
        theirstack_score: 0.72,
      },
      {
        technology: { name: "Node.js", slug: "nodejs" },
        confidence: "low",
        theirstack_score: 0.45,
      },
    ],
    has_blurred_data: false,
  },
];

describe("CompanyResultsTable", () => {
  const mockOnPageChange = vi.fn();
  const mockOnSelectionChange = vi.fn();

  const defaultProps = {
    companies: mockCompanies,
    totalResults: 2,
    totalCompanies: 2,
    isLoading: false,
    hasSearched: true,
    page: 0,
    limit: 10,
    onPageChange: mockOnPageChange,
    selectedDomains: [] as string[],
    onSelectionChange: mockOnSelectionChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =====================
  // TABLE RENDERING (AC #1)
  // =====================

  it("renders table with company data", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    expect(screen.getByTestId("company-results")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("acme.com")).toBeInTheDocument();
    expect(screen.getByText("Brazil")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("100-500")).toBeInTheDocument();
  });

  it("renders null fields as dash", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("renders technology names in results", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue.js")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
  });

  it("renders score with 2 decimal places for all technologies", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    expect(screen.getByText("0.95")).toBeInTheDocument();
    expect(screen.getByText("0.72")).toBeInTheDocument();
    expect(screen.getByText("0.45")).toBeInTheDocument();
  });

  it("shows total results and credits info", () => {
    render(<CompanyResultsTable {...defaultProps} creditsUsed={6} />);

    expect(screen.getByText(/2 empresas encontradas/)).toBeInTheDocument();
    expect(screen.getByText(/6 credits consumidos/)).toBeInTheDocument();
  });

  it("renders external link for companies with valid URL", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    const link = screen.getByLabelText("Visitar Acme Corp");
    expect(link).toHaveAttribute("href", "https://acme.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not render external link for companies with invalid URL protocol", () => {
    const companiesWithBadUrl: TheirStackCompany[] = [
      {
        ...mockCompanies[0],
        domain: "evil.com",
        name: "Evil Corp",
        url: "javascript:alert(1)",
      },
    ];

    render(
      <CompanyResultsTable
        {...defaultProps}
        companies={companiesWithBadUrl}
        totalResults={1}
        totalCompanies={1}
      />
    );

    expect(screen.queryByLabelText("Visitar Evil Corp")).not.toBeInTheDocument();
  });

  // =====================
  // CONFIDENCE BADGES (AC #2)
  // =====================

  it("renders confidence badges with correct colors (high=green, medium=orange, low=yellow)", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    const highBadge = screen.getByTestId("confidence-high");
    expect(highBadge).toHaveTextContent("Alto");
    expect(highBadge.className).toContain("bg-green-100");

    const medBadge = screen.getByTestId("confidence-medium");
    expect(medBadge).toHaveTextContent("Médio");
    expect(medBadge.className).toContain("bg-orange-100");

    const lowBadge = screen.getByTestId("confidence-low");
    expect(lowBadge).toHaveTextContent("Baixo");
    expect(lowBadge.className).toContain("bg-yellow-100");
  });

  // =====================
  // INDIVIDUAL SELECTION (AC #3)
  // =====================

  it("renders checkbox for each company row", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    expect(screen.getByTestId("select-row-acme.com")).toBeInTheDocument();
    expect(screen.getByTestId("select-row-test.com")).toBeInTheDocument();
  });

  it("shows checkbox as checked when domain is in selectedDomains", () => {
    render(
      <CompanyResultsTable {...defaultProps} selectedDomains={["acme.com"]} />
    );

    const acmeCheckbox = screen.getByTestId("select-row-acme.com");
    expect(acmeCheckbox).toHaveAttribute("data-state", "checked");

    const testCheckbox = screen.getByTestId("select-row-test.com");
    expect(testCheckbox).toHaveAttribute("data-state", "unchecked");
  });

  it("calls onSelectionChange with added domain when selecting a row", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    fireEvent.click(screen.getByTestId("select-row-acme.com"));
    expect(mockOnSelectionChange).toHaveBeenCalledWith(["acme.com"]);
  });

  it("calls onSelectionChange without domain when deselecting a row", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        selectedDomains={["acme.com", "test.com"]}
      />
    );

    fireEvent.click(screen.getByTestId("select-row-acme.com"));
    expect(mockOnSelectionChange).toHaveBeenCalledWith(["test.com"]);
  });

  it("has correct aria-labels on row checkboxes", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    expect(screen.getByLabelText("Selecionar Acme Corp")).toBeInTheDocument();
    expect(screen.getByLabelText("Selecionar Test Inc")).toBeInTheDocument();
  });

  // =====================
  // SELECT ALL / HEADER CHECKBOX (AC #4)
  // =====================

  it("renders select-all checkbox in header", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    expect(screen.getByTestId("select-all-checkbox")).toBeInTheDocument();
  });

  it("select-all checkbox is unchecked when no domains selected", () => {
    render(<CompanyResultsTable {...defaultProps} selectedDomains={[]} />);

    const selectAll = screen.getByTestId("select-all-checkbox");
    expect(selectAll).toHaveAttribute("data-state", "unchecked");
  });

  it("select-all checkbox is checked when all domains selected", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        selectedDomains={["acme.com", "test.com"]}
      />
    );

    const selectAll = screen.getByTestId("select-all-checkbox");
    expect(selectAll).toHaveAttribute("data-state", "checked");
  });

  it("select-all checkbox is indeterminate when some domains selected", () => {
    render(
      <CompanyResultsTable {...defaultProps} selectedDomains={["acme.com"]} />
    );

    const selectAll = screen.getByTestId("select-all-checkbox");
    expect(selectAll).toHaveAttribute("data-state", "indeterminate");
  });

  it("clicking select-all selects all visible company domains", () => {
    render(<CompanyResultsTable {...defaultProps} selectedDomains={[]} />);

    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    expect(mockOnSelectionChange).toHaveBeenCalledWith(["acme.com", "test.com"]);
  });

  it("clicking select-all when all selected deselects all", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        selectedDomains={["acme.com", "test.com"]}
      />
    );

    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
  });

  it("select-all has correct aria-label", () => {
    render(<CompanyResultsTable {...defaultProps} />);

    expect(screen.getByLabelText("Selecionar todas as empresas")).toBeInTheDocument();
  });

  // =====================
  // SELECTION COUNTER (AC #3)
  // =====================

  it("does not show selection counter when no domains selected", () => {
    render(<CompanyResultsTable {...defaultProps} selectedDomains={[]} />);

    expect(screen.queryByTestId("selection-counter")).not.toBeInTheDocument();
  });

  it("shows selection counter with singular when 1 domain selected", () => {
    render(
      <CompanyResultsTable {...defaultProps} selectedDomains={["acme.com"]} />
    );

    expect(screen.getByTestId("selection-counter")).toHaveTextContent("1 empresa selecionada");
  });

  it("shows selection counter with plural when multiple domains selected", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        selectedDomains={["acme.com", "test.com"]}
      />
    );

    expect(screen.getByTestId("selection-counter")).toHaveTextContent("2 empresas selecionadas");
  });

  it("shows clear selection button when domains are selected", () => {
    render(
      <CompanyResultsTable {...defaultProps} selectedDomains={["acme.com"]} />
    );

    expect(screen.getByTestId("clear-selection")).toBeInTheDocument();
  });

  it("clicking clear selection calls onSelectionChange with empty array", () => {
    render(
      <CompanyResultsTable {...defaultProps} selectedDomains={["acme.com"]} />
    );

    fireEvent.click(screen.getByTestId("clear-selection"));
    expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
  });

  it("does not show clear selection button when no domains selected", () => {
    render(<CompanyResultsTable {...defaultProps} selectedDomains={[]} />);

    expect(screen.queryByTestId("clear-selection")).not.toBeInTheDocument();
  });

  // =====================
  // LOADING & EMPTY (AC #5, #6)
  // =====================

  it("shows loading skeleton when isLoading", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        companies={[]}
        totalResults={0}
        totalCompanies={0}
        isLoading={true}
      />
    );

    expect(screen.getByTestId("table-skeleton")).toBeInTheDocument();
  });

  it("shows empty state with guidance text when no results after search", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        companies={[]}
        totalResults={0}
        totalCompanies={0}
      />
    );

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma empresa encontrada")).toBeInTheDocument();
    expect(screen.getByText(/Tente ajustar as tecnologias ou filtros/)).toBeInTheDocument();
  });

  // =====================
  // PAGINATION (AC #5)
  // =====================

  it("renders pagination buttons when multiple pages", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        totalResults={25}
        totalCompanies={25}
        page={1}
      />
    );

    expect(screen.getByTestId("prev-page")).toBeInTheDocument();
    expect(screen.getByTestId("next-page")).toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("disables prev button on first page", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        totalResults={25}
        totalCompanies={25}
        page={0}
      />
    );

    expect(screen.getByTestId("prev-page")).toBeDisabled();
    expect(screen.getByTestId("next-page")).not.toBeDisabled();
  });

  it("disables next button on last page", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        totalResults={25}
        totalCompanies={25}
        page={2}
      />
    );

    expect(screen.getByTestId("prev-page")).not.toBeDisabled();
    expect(screen.getByTestId("next-page")).toBeDisabled();
  });

  it("calls onPageChange on pagination click", () => {
    render(
      <CompanyResultsTable
        {...defaultProps}
        totalResults={25}
        totalCompanies={25}
        page={1}
      />
    );

    fireEvent.click(screen.getByTestId("next-page"));
    expect(mockOnPageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId("prev-page"));
    expect(mockOnPageChange).toHaveBeenCalledWith(0);
  });
});
