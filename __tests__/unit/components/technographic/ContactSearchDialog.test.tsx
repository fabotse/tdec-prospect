/**
 * ContactSearchDialog Tests
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * AC: #1 - Filter by target job titles
 * AC: #2 - Search trigger and loading state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactSearchDialog } from "@/components/technographic/ContactSearchDialog";
import type { TheirStackCompany } from "@/types/theirstack";

// ==============================================
// TEST DATA
// ==============================================

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
    apollo_id: null,
    annual_revenue_usd: null,
    founded_year: null,
    linkedin_url: null,
    technologies_found: [],
    has_blurred_data: false,
  },
  {
    name: "Beta Ltd",
    domain: "beta.io",
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
    technologies_found: [],
    has_blurred_data: false,
  },
];

// ==============================================
// TESTS
// ==============================================

describe("ContactSearchDialog", () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders trigger button", () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    expect(screen.getByTestId("contact-search-trigger")).toBeInTheDocument();
    expect(screen.getByText("Buscar Contatos")).toBeInTheDocument();
  });

  it("disables trigger when no companies selected", () => {
    render(
      <ContactSearchDialog
        selectedCompanies={[]}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    expect(screen.getByTestId("contact-search-trigger")).toBeDisabled();
  });

  it("disables trigger when loading", () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={true}
      />
    );

    expect(screen.getByTestId("contact-search-trigger")).toBeDisabled();
  });

  it("opens dialog on trigger click", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("contact-search-dialog")).toBeInTheDocument();
    });

    expect(screen.getByText("Buscar Contatos nas Empresas Selecionadas")).toBeInTheDocument();
    expect(screen.getByTestId("company-count-info")).toHaveTextContent("2 empresas selecionadas");
  });

  it("shows singular text for single company", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={[mockCompanies[0]]}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("company-count-info")).toHaveTextContent("1 empresa selecionada");
    });
  });

  it("adds title via Enter key", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("title-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "CTO" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("selected-titles")).toBeInTheDocument();
    expect(screen.getByTestId("title-chip-CTO")).toBeInTheDocument();
  });

  it("adds title via comma key", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("title-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "CISO" } });
    fireEvent.keyDown(input, { key: "," });

    expect(screen.getByTestId("title-chip-CISO")).toBeInTheDocument();
  });

  it("prevents duplicate titles", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("title-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "CTO" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "CTO" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Should have exactly one CTO chip
    const chips = screen.getAllByTestId("title-chip-CTO");
    expect(chips).toHaveLength(1);
  });

  it("removes title on chip click", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("title-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "CTO" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("title-chip-CTO")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("title-chip-CTO"));

    expect(screen.queryByTestId("title-chip-CTO")).not.toBeInTheDocument();
  });

  it("adds title from suggestion click", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("title-suggestions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("suggestion-cto"));

    expect(screen.getByTestId("title-chip-CTO")).toBeInTheDocument();
    // Suggestion should be hidden after selection
    expect(screen.queryByTestId("suggestion-cto")).not.toBeInTheDocument();
  });

  it("disables search button when no titles entered", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-contact-search")).toBeInTheDocument();
    });

    expect(screen.getByTestId("confirm-contact-search")).toBeDisabled();
  });

  it("calls onSearch with titles and closes dialog", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("title-input")).toBeInTheDocument();
    });

    // Add titles
    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "CTO" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "CISO" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Click search
    fireEvent.click(screen.getByTestId("confirm-contact-search"));

    expect(mockOnSearch).toHaveBeenCalledWith(["CTO", "CISO"]);

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByTestId("contact-search-dialog")).not.toBeInTheDocument();
    });
  });

  it("includes input value in search when clicking search button", async () => {
    render(
      <ContactSearchDialog
        selectedCompanies={mockCompanies}
        onSearch={mockOnSearch}
        isLoading={false}
      />
    );

    fireEvent.click(screen.getByTestId("contact-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("title-input")).toBeInTheDocument();
    });

    // Type but don't press Enter
    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "VP Engineering" } });

    // Click search directly
    fireEvent.click(screen.getByTestId("confirm-contact-search"));

    expect(mockOnSearch).toHaveBeenCalledWith(["VP Engineering"]);
  });
});
