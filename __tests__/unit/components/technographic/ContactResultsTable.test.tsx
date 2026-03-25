/**
 * ContactResultsTable Tests
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * AC: #3 - Display contacts with name, title, email availability, company, phone
 * AC: #4 - Empty state for no results
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContactResultsTable } from "@/components/technographic/ContactResultsTable";
import type { Lead } from "@/types/lead";

// ==============================================
// TEST DATA
// ==============================================

const mockContacts: Lead[] = [
  {
    id: "lead-1",
    tenantId: "tenant-1",
    apolloId: "apollo-1",
    firstName: "João",
    lastName: "Sil***a",
    email: null,
    phone: null,
    companyName: "Acme Corp",
    companySize: null,
    industry: null,
    location: null,
    title: "CTO",
    linkedinUrl: null,
    photoUrl: null,
    status: "novo",
    hasEmail: true,
    hasDirectPhone: "Yes",
    createdAt: "2026-03-25T00:00:00Z",
    updatedAt: "2026-03-25T00:00:00Z",
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
    isMonitored: false,
  },
  {
    id: "lead-2",
    tenantId: "tenant-1",
    apolloId: "apollo-2",
    firstName: "Maria",
    lastName: "Fer***s",
    email: null,
    phone: null,
    companyName: "Beta Inc",
    companySize: null,
    industry: null,
    location: null,
    title: "VP Engineering",
    linkedinUrl: null,
    photoUrl: null,
    status: "novo",
    hasEmail: false,
    hasDirectPhone: "Maybe: please request...",
    createdAt: "2026-03-25T00:00:00Z",
    updatedAt: "2026-03-25T00:00:00Z",
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
    isMonitored: false,
  },
];

const contactNoTitle: Lead = {
  ...mockContacts[0],
  id: "lead-3",
  title: null,
  lastName: null,
  companyName: null,
  hasEmail: false,
  hasDirectPhone: null,
};

// ==============================================
// TESTS
// ==============================================

describe("ContactResultsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- RENDERING ---

  it("renders contact rows with correct data", () => {
    render(
      <ContactResultsTable contacts={mockContacts} isLoading={false} total={2} />
    );

    expect(screen.getByTestId("contact-results")).toBeInTheDocument();
    expect(screen.getByTestId("contact-row-lead-1")).toBeInTheDocument();
    expect(screen.getByTestId("contact-row-lead-2")).toBeInTheDocument();

    // Names
    expect(screen.getByText("João Sil***a")).toBeInTheDocument();
    expect(screen.getByText("Maria Fer***s")).toBeInTheDocument();

    // Titles
    expect(screen.getByText("CTO")).toBeInTheDocument();
    expect(screen.getByText("VP Engineering")).toBeInTheDocument();

    // Companies
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();
  });

  it("shows total contacts count", () => {
    render(
      <ContactResultsTable contacts={mockContacts} isLoading={false} total={25} />
    );

    expect(screen.getByText("25 contatos encontrados")).toBeInTheDocument();
  });

  it("shows singular count for single contact", () => {
    render(
      <ContactResultsTable
        contacts={[mockContacts[0]]}
        isLoading={false}
        total={1}
      />
    );

    expect(screen.getByText("1 contato encontrado")).toBeInTheDocument();
  });

  // --- EMAIL AVAILABILITY BADGES ---

  it("shows green email badge when hasEmail is true", () => {
    render(
      <ContactResultsTable contacts={mockContacts} isLoading={false} />
    );

    const emailBadge = screen.getByTestId("email-badge-lead-1");
    expect(emailBadge).toHaveTextContent("Disponível");
  });

  it("shows gray email badge when hasEmail is false", () => {
    render(
      <ContactResultsTable contacts={mockContacts} isLoading={false} />
    );

    const emailBadge = screen.getByTestId("email-badge-lead-2");
    expect(emailBadge).toHaveTextContent("Indisponível");
  });

  // --- PHONE AVAILABILITY BADGES ---

  it("shows green phone badge when hasDirectPhone is 'Yes'", () => {
    render(
      <ContactResultsTable contacts={mockContacts} isLoading={false} />
    );

    const phoneBadge = screen.getByTestId("phone-badge-lead-1");
    expect(phoneBadge).toHaveTextContent("Disponível");
  });

  it("shows gray phone badge when hasDirectPhone is not 'Yes'", () => {
    render(
      <ContactResultsTable contacts={mockContacts} isLoading={false} />
    );

    const phoneBadge = screen.getByTestId("phone-badge-lead-2");
    expect(phoneBadge).toHaveTextContent("N/A");
  });

  it("shows gray phone badge when hasDirectPhone is null", () => {
    render(
      <ContactResultsTable contacts={[contactNoTitle]} isLoading={false} />
    );

    const phoneBadge = screen.getByTestId("phone-badge-lead-3");
    expect(phoneBadge).toHaveTextContent("N/A");
  });

  // --- NULL HANDLING ---

  it("shows dash for null title", () => {
    render(
      <ContactResultsTable contacts={[contactNoTitle]} isLoading={false} />
    );

    // Should show firstName only (no lastName)
    expect(screen.getByText("João")).toBeInTheDocument();

    // Title should be "-"
    const row = screen.getByTestId("contact-row-lead-3");
    expect(row).toHaveTextContent("-");
  });

  it("shows dash for null companyName", () => {
    render(
      <ContactResultsTable contacts={[contactNoTitle]} isLoading={false} />
    );

    const row = screen.getByTestId("contact-row-lead-3");
    // Company column should have a "-"
    expect(row).toHaveTextContent("-");
  });

  // --- LOADING STATE ---

  it("shows skeleton when loading", () => {
    render(
      <ContactResultsTable contacts={[]} isLoading={true} />
    );

    expect(screen.getByTestId("contact-table-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("contact-results")).not.toBeInTheDocument();
  });

  // --- EMPTY STATE ---

  it("shows empty state when no contacts and not loading", () => {
    render(
      <ContactResultsTable contacts={[]} isLoading={false} />
    );

    expect(screen.getByTestId("contact-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum contato encontrado com os cargos selecionados")
    ).toBeInTheDocument();
  });

  // --- TABLE HEADERS ---

  it("renders correct table headers", () => {
    render(
      <ContactResultsTable contacts={mockContacts} isLoading={false} />
    );

    expect(screen.getByText("Nome")).toBeInTheDocument();
    expect(screen.getByText("Cargo")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Empresa")).toBeInTheDocument();
    expect(screen.getByText("Telefone")).toBeInTheDocument();
  });

  // --- SELECTION (Story 15.5, AC #1) ---

  describe("selection behavior", () => {
    const mockOnSelectionChange = vi.fn();

    it("renders checkboxes when selection props are provided", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      expect(screen.getByTestId("select-all-contacts")).toBeInTheDocument();
      expect(screen.getByTestId("select-contact-lead-1")).toBeInTheDocument();
      expect(screen.getByTestId("select-contact-lead-2")).toBeInTheDocument();
    });

    it("does not render checkboxes when selection props are not provided", () => {
      render(
        <ContactResultsTable contacts={mockContacts} isLoading={false} />
      );

      expect(screen.queryByTestId("select-all-contacts")).not.toBeInTheDocument();
      expect(screen.queryByTestId("select-contact-lead-1")).not.toBeInTheDocument();
    });

    it("calls onSelectionChange with contact id when individual checkbox is clicked", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      fireEvent.click(screen.getByTestId("select-contact-lead-1"));
      expect(mockOnSelectionChange).toHaveBeenCalledWith(["lead-1"]);
    });

    it("calls onSelectionChange removing id when checked contact is unchecked", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={["lead-1", "lead-2"]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      fireEvent.click(screen.getByTestId("select-contact-lead-1"));
      expect(mockOnSelectionChange).toHaveBeenCalledWith(["lead-2"]);
    });

    it("selects all contacts when header checkbox is clicked", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      fireEvent.click(screen.getByTestId("select-all-contacts"));
      expect(mockOnSelectionChange).toHaveBeenCalledWith(["lead-1", "lead-2"]);
    });

    it("deselects all contacts when header checkbox is clicked while all selected", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={["lead-1", "lead-2"]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      fireEvent.click(screen.getByTestId("select-all-contacts"));
      expect(mockOnSelectionChange).toHaveBeenCalledWith([]);
    });

    it("shows selection counter when contacts are selected", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={["lead-1"]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      expect(screen.getByTestId("contact-selection-counter")).toHaveTextContent("1 contato selecionado");
    });

    it("shows plural selection counter for multiple contacts", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={["lead-1", "lead-2"]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      expect(screen.getByTestId("contact-selection-counter")).toHaveTextContent("2 contatos selecionados");
    });

    it("does not show selection counter when no contacts selected", () => {
      render(
        <ContactResultsTable
          contacts={mockContacts}
          isLoading={false}
          selectedIds={[]}
          onSelectionChange={mockOnSelectionChange}
        />
      );

      expect(screen.queryByTestId("contact-selection-counter")).not.toBeInTheDocument();
    });
  });
});
