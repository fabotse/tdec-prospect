/**
 * CompanyResultsTable Component Tests
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #3 - Results table with company data, confidence badges, pagination
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders table with company data", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={2}
        totalCompanies={2}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByTestId("company-results")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("acme.com")).toBeInTheDocument();
    expect(screen.getByText("Brazil")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("100-500")).toBeInTheDocument();
  });

  it("renders null fields as dash", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={2}
        totalCompanies={2}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    // Test Inc has null country, industry, employee_count_range
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("renders confidence badges with correct types", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={2}
        totalCompanies={2}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByTestId("confidence-high")).toBeInTheDocument();
    expect(screen.getByTestId("confidence-high")).toHaveTextContent("Alto");
    expect(screen.getByTestId("confidence-medium")).toBeInTheDocument();
    expect(screen.getByTestId("confidence-medium")).toHaveTextContent("Médio");
    expect(screen.getByTestId("confidence-low")).toBeInTheDocument();
    expect(screen.getByTestId("confidence-low")).toHaveTextContent("Baixo");
  });

  it("renders technology names in results", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={2}
        totalCompanies={2}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue.js")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
  });

  it("renders score with 2 decimal places for all technologies", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={2}
        totalCompanies={2}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByText("0.95")).toBeInTheDocument();
    expect(screen.getByText("0.72")).toBeInTheDocument();
    // Test Inc has 2 techs — both scores should be visible now
    expect(screen.getByText("0.45")).toBeInTheDocument();
  });

  it("shows total results and credits info", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={2}
        totalCompanies={2}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
        creditsUsed={6}
      />
    );

    expect(screen.getByText(/2 empresas encontradas/)).toBeInTheDocument();
    expect(screen.getByText(/6 credits consumidos/)).toBeInTheDocument();
  });

  it("shows loading skeleton when isLoading", () => {
    render(
      <CompanyResultsTable
        companies={[]}
        totalResults={0}
        totalCompanies={0}
        isLoading={true}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByTestId("table-skeleton")).toBeInTheDocument();
  });

  it("shows empty state when no results after search", () => {
    render(
      <CompanyResultsTable
        companies={[]}
        totalResults={0}
        totalCompanies={0}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders pagination buttons when multiple pages", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={25}
        totalCompanies={25}
        isLoading={false}
        hasSearched={true}
        page={1}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByTestId("prev-page")).toBeInTheDocument();
    expect(screen.getByTestId("next-page")).toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("disables prev button on first page", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={25}
        totalCompanies={25}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByTestId("prev-page")).toBeDisabled();
    expect(screen.getByTestId("next-page")).not.toBeDisabled();
  });

  it("disables next button on last page", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={25}
        totalCompanies={25}
        isLoading={false}
        hasSearched={true}
        page={2}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.getByTestId("prev-page")).not.toBeDisabled();
    expect(screen.getByTestId("next-page")).toBeDisabled();
  });

  it("calls onPageChange on pagination click", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={25}
        totalCompanies={25}
        isLoading={false}
        hasSearched={true}
        page={1}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    fireEvent.click(screen.getByTestId("next-page"));
    expect(mockOnPageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId("prev-page"));
    expect(mockOnPageChange).toHaveBeenCalledWith(0);
  });

  it("renders external link for companies with URL", () => {
    render(
      <CompanyResultsTable
        companies={mockCompanies}
        totalResults={2}
        totalCompanies={2}
        isLoading={false}
        hasSearched={true}
        page={0}
        limit={10}
        onPageChange={mockOnPageChange}
      />
    );

    const link = screen.getByLabelText("Visitar Acme Corp");
    expect(link).toHaveAttribute("href", "https://acme.com");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
