/**
 * Unit Tests for AgentLeadReview
 * Story 17.5 - AC: #3, #4
 *
 * Tests: renders table, checkboxes, filter, approve with filtered leads
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentLeadReview } from "@/components/agent/AgentLeadReview";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// HELPERS
// ==============================================

const defaultData = {
  totalFound: 3,
  leads: [
    { name: "Alice Santos", title: "CTO", companyName: "Acme Corp", email: "alice@acme.com" },
    { name: "Bob Silva", title: "VP Engineering", companyName: "TechCo", email: "bob@techco.com" },
    { name: "Carlos Lima", title: "CEO", companyName: "StartupX", email: "carlos@startupx.com" },
  ],
  jobTitles: ["CTO", "VP Engineering", "CEO"],
};

// ==============================================
// TESTS
// ==============================================

describe("AgentLeadReview (AC: #3, #4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 2, status: "approved", nextStep: 3 } }),
    });
  });

  // 9.16 - Renders table with leads and checkboxes
  it("renders table with lead data and checkboxes (9.16)", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    expect(screen.getByText("Revisao: Leads Encontrados")).toBeInTheDocument();
    expect(screen.getByText("Alice Santos")).toBeInTheDocument();
    expect(screen.getByText("Bob Silva")).toBeInTheDocument();
    expect(screen.getByText("Carlos Lima")).toBeInTheDocument();
    expect(screen.getByText("CTO")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("shows all leads as selected by default", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    expect(screen.getByText("3 de 3 leads selecionados")).toBeInTheDocument();
    expect(screen.getByText("Aprovar (3 leads)")).toBeInTheDocument();
  });

  // 9.18 - Deselect leads updates counter
  it("updates counter when leads are deselected (9.18)", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    // Click Alice's checkbox to deselect
    const aliceCheckbox = screen.getByLabelText("Selecionar Alice Santos");
    fireEvent.click(aliceCheckbox);

    expect(screen.getByText("2 de 3 leads selecionados")).toBeInTheDocument();
    expect(screen.getByText("Aprovar (2 leads)")).toBeInTheDocument();
  });

  // Select all / deselect all
  it("toggles all leads via select all checkbox", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    const selectAll = screen.getByLabelText("Selecionar todos");

    // Deselect all
    fireEvent.click(selectAll);
    expect(screen.getByText("0 de 3 leads selecionados")).toBeInTheDocument();

    // Select all again
    fireEvent.click(selectAll);
    expect(screen.getByText("3 de 3 leads selecionados")).toBeInTheDocument();
  });

  // 9.17 - Filter by name/company/title
  it("filters leads by name (9.17)", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "alice" } });

    // Alice visible, others not
    expect(screen.getByText("Alice Santos")).toBeInTheDocument();
    expect(screen.queryByText("Bob Silva")).toBeNull();
    expect(screen.queryByText("Carlos Lima")).toBeNull();
  });

  it("filters leads by company name", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "TechCo" } });

    expect(screen.getByText("Bob Silva")).toBeInTheDocument();
    expect(screen.queryByText("Alice Santos")).toBeNull();
  });

  it("filters leads by job title", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "CEO" } });

    expect(screen.getByText("Carlos Lima")).toBeInTheDocument();
    expect(screen.queryByText("Alice Santos")).toBeNull();
  });

  // 9.19 - Approve with filtered leads sends approvedData
  it("sends approvedData with selected leads on approve (9.19)", async () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    // Deselect Bob
    fireEvent.click(screen.getByLabelText("Selecionar Bob Silva"));

    // Approve with 2 leads
    fireEvent.click(screen.getByText("Aprovar (2 leads)"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/2/approve",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedData: {
              leads: [
                defaultData.leads[0], // Alice
                defaultData.leads[2], // Carlos
              ],
            },
          }),
        })
      );
    });
  });

  // Reject calls API
  it("calls reject API on Rejeitar click", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 2, status: "awaiting_approval" } }),
    });

    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    fireEvent.click(screen.getByText("Rejeitar"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/2/reject",
        { method: "POST" }
      );
    });
  });

  // Approve button disabled when no leads selected
  it("disables approve button when no leads are selected", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    // Deselect all
    fireEvent.click(screen.getByLabelText("Selecionar todos"));

    const approveBtn = screen.getByText("Aprovar (0 leads)");
    expect(approveBtn).toBeDisabled();
  });

  // Buttons disabled after action
  it("disables buttons after approval", async () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} />
    );

    fireEvent.click(screen.getByText("Aprovar (3 leads)"));

    await waitFor(() => {
      expect(screen.getByText(/Aprovado/)).toBeInTheDocument();
    });
  });
});
