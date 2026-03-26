/**
 * Unit Tests for AgentApprovalGate
 * Story 17.5 - AC: #1
 *
 * Tests: renders companies, total, buttons, approve/reject API calls
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentApprovalGate } from "@/components/agent/AgentApprovalGate";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// HELPERS
// ==============================================

const defaultData = {
  totalFound: 15,
  companies: [
    { name: "Acme Corp", country: "Brasil", industry: "SaaS", employeeRange: "50-200" },
    { name: "TechCo", country: "EUA", industry: "FinTech", employeeRange: "200-500" },
    { name: "StartupX", country: "Brasil", industry: "EdTech", employeeRange: "1-10" },
  ],
  filtersApplied: { technology: "react" },
};

// ==============================================
// TESTS
// ==============================================

describe("AgentApprovalGate (AC: #1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 1, status: "approved", nextStep: 2 } }),
    });
  });

  // 9.13 - Renders companies, total, buttons
  it("renders title, total count, and company list (9.13)", () => {
    render(
      <AgentApprovalGate
        data={defaultData}
        executionId="exec-001"
        stepNumber={1}
      />
    );

    expect(screen.getByText("Revisao: Busca de Empresas")).toBeInTheDocument();
    expect(screen.getByText("15 empresas encontradas")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("TechCo")).toBeInTheDocument();
    expect(screen.getByText("StartupX")).toBeInTheDocument();
  });

  it("shows remaining count when totalFound > companies.length", () => {
    render(
      <AgentApprovalGate
        data={defaultData}
        executionId="exec-001"
        stepNumber={1}
      />
    );

    expect(screen.getByText("+12 mais empresas")).toBeInTheDocument();
  });

  it("does not show remaining count when totalFound equals companies.length", () => {
    const data = { ...defaultData, totalFound: 3 };
    render(
      <AgentApprovalGate data={data} executionId="exec-001" stepNumber={1} />
    );

    expect(screen.queryByText(/mais empresas/)).toBeNull();
  });

  it("renders Aprovar and Rejeitar buttons", () => {
    render(
      <AgentApprovalGate
        data={defaultData}
        executionId="exec-001"
        stepNumber={1}
      />
    );

    expect(screen.getByText("Aprovar")).toBeInTheDocument();
    expect(screen.getByText("Rejeitar")).toBeInTheDocument();
  });

  // 9.14 - Approve calls API
  it("calls approve API on Aprovar click (9.14)", async () => {
    render(
      <AgentApprovalGate
        data={defaultData}
        executionId="exec-001"
        stepNumber={1}
      />
    );

    fireEvent.click(screen.getByText("Aprovar"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/1/approve",
        { method: "POST" }
      );
    });
  });

  // 9.15 - Reject calls API
  it("calls reject API on Rejeitar click (9.15)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 1, status: "awaiting_approval" } }),
    });

    render(
      <AgentApprovalGate
        data={defaultData}
        executionId="exec-001"
        stepNumber={1}
      />
    );

    fireEvent.click(screen.getByText("Rejeitar"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/1/reject",
        { method: "POST" }
      );
    });
  });

  // Buttons disabled after action
  it("disables buttons after approval", async () => {
    render(
      <AgentApprovalGate
        data={defaultData}
        executionId="exec-001"
        stepNumber={1}
      />
    );

    fireEvent.click(screen.getByText("Aprovar"));

    await waitFor(() => {
      expect(screen.getByText("✅ Aprovado")).toBeInTheDocument();
    });
  });

  // onAction callback
  it("calls onAction callback after successful action", async () => {
    const onAction = vi.fn();

    render(
      <AgentApprovalGate
        data={defaultData}
        executionId="exec-001"
        stepNumber={1}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByText("Aprovar"));

    await waitFor(() => {
      expect(onAction).toHaveBeenCalled();
    });
  });
});
