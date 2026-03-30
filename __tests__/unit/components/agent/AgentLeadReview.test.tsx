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
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
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
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    expect(screen.getByText("3 de 3 leads selecionados")).toBeInTheDocument();
    expect(screen.getByText("Aprovar (3 leads)")).toBeInTheDocument();
  });

  // 9.18 - Deselect leads updates counter
  it("updates counter when leads are deselected (9.18)", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
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
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
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
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
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
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "TechCo" } });

    expect(screen.getByText("Bob Silva")).toBeInTheDocument();
    expect(screen.queryByText("Alice Santos")).toBeNull();
  });

  it("filters leads by job title", () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    const filterInput = screen.getByPlaceholderText("Filtrar por nome, empresa ou cargo...");
    fireEvent.change(filterInput, { target: { value: "CEO" } });

    expect(screen.getByText("Carlos Lima")).toBeInTheDocument();
    expect(screen.queryByText("Alice Santos")).toBeNull();
  });

  // 9.19 - Approve with filtered leads sends approvedData
  it("sends approvedData with selected leads on approve (9.19)", async () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
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
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
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
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    // Deselect all
    fireEvent.click(screen.getByLabelText("Selecionar todos"));

    const approveBtn = screen.getByText("Aprovar (0 leads)");
    expect(approveBtn).toBeDisabled();
  });

  // Buttons disabled after action
  it("disables buttons after approval", async () => {
    render(
      <AgentLeadReview data={defaultData} executionId="exec-001" stepNumber={2} totalSteps={5} />
    );

    fireEvent.click(screen.getByText("Aprovar (3 leads)"));

    await waitFor(() => {
      expect(screen.getByText(/Aprovado/)).toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 17.12: Quantity selector
  // ==============================================

  describe("quantity selector (Story 17.12)", () => {
    const manyMoreData = {
      totalFound: 200,
      leads: Array.from({ length: 25 }, (_, i) => ({
        name: `Lead ${i + 1}`,
        title: "CTO",
        companyName: `Company ${i + 1}`,
        email: `lead${i + 1}@test.com`,
      })),
      jobTitles: ["CTO"],
    };

    it("shows selector when totalFound (200) > leads.length (25)", () => {
      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      expect(screen.getByText("Mostrando 25 de 200 leads encontrados.")).toBeInTheDocument();
      expect(screen.getByText("Quantos leads deseja usar?")).toBeInTheDocument();
      // Options 50, 100, 200 should be visible (500 > totalFound, so hidden)
      expect(screen.getByRole("button", { name: "50" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "100" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "200" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "500" })).toBeNull();
    });

    it("does NOT show selector when totalFound <= leads.length", () => {
      const allFetchedData = {
        totalFound: 15,
        leads: Array.from({ length: 15 }, (_, i) => ({
          name: `Lead ${i + 1}`,
          title: "CTO",
          companyName: `Company ${i + 1}`,
          email: `lead${i + 1}@test.com`,
        })),
        jobTitles: ["CTO"],
      };

      render(
        <AgentLeadReview data={allFetchedData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      expect(screen.queryByText("Quantos leads deseja usar?")).toBeNull();
      expect(screen.queryByText(/Mostrando/)).toBeNull();
    });

    it("clicking quantity option updates selected state", () => {
      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));

      expect(screen.getByText("Custo estimado: ~100 creditos Apollo")).toBeInTheDocument();
      expect(screen.getByText("Buscar 100 leads")).toBeInTheDocument();
    });

    it("clicking 'Buscar N leads' calls fetch-leads with desiredCount", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            leads: Array.from({ length: 100 }, (_, i) => ({
              name: `Lead ${i + 1}`,
              title: "CTO",
              companyName: `Company ${i + 1}`,
              email: `lead${i + 1}@test.com`,
            })),
            totalFetched: 100,
            totalFound: 200,
            cost: { apollo_search: 100 },
          },
        }),
      });

      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));
      fireEvent.click(screen.getByText("Buscar 100 leads"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/agent/executions/exec-001/steps/2/fetch-leads",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ desiredCount: 100 }),
          })
        );
      });
    });

    it("after fetch success, leads are updated and selector disappears", async () => {
      const fetchedLeads = Array.from({ length: 100 }, (_, i) => ({
        name: `Fetched Lead ${i + 1}`,
        title: "CTO",
        companyName: `Company ${i + 1}`,
        email: `fetched${i + 1}@test.com`,
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            leads: fetchedLeads,
            totalFetched: 100,
            totalFound: 200,
            cost: { apollo_search: 100 },
          },
        }),
      });

      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));
      fireEvent.click(screen.getByText("Buscar 100 leads"));

      await waitFor(() => {
        // Selector should disappear
        expect(screen.queryByText("Quantos leads deseja usar?")).toBeNull();
      });

      // New leads should be rendered
      expect(screen.getByText("Fetched Lead 1")).toBeInTheDocument();
      // Counter should reflect new leads
      expect(screen.getByText("100 de 200 leads selecionados")).toBeInTheDocument();
    });

    it("during fetch, button is disabled with loading text", async () => {
      // Make fetch hang
      let resolvePromise: (value: unknown) => void;
      mockFetch.mockReturnValue(
        new Promise((resolve) => { resolvePromise = resolve; })
      );

      render(
        <AgentLeadReview data={manyMoreData} executionId="exec-001" stepNumber={2} totalSteps={5} />
      );

      fireEvent.click(screen.getByRole("button", { name: "100" }));
      fireEvent.click(screen.getByText("Buscar 100 leads"));

      await waitFor(() => {
        expect(screen.getByText("Buscando mais leads...")).toBeInTheDocument();
      });

      // Resolve to prevent test leaking
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ data: { leads: [], totalFetched: 0, totalFound: 200, cost: {} } }),
      });
    });
  });
});
