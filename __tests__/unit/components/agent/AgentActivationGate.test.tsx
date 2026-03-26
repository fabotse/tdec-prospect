/**
 * Unit Tests for AgentActivationGate
 * Story 17.6 - AC: #4, #5, #6
 *
 * Tests: renders summary, activate sends activate:true, defer sends activate:false,
 * disable after action, error states
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentActivationGate } from "@/components/agent/AgentActivationGate";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// HELPERS
// ==============================================

const defaultData = {
  externalCampaignId: "camp-ext-001",
  campaignName: "Campanha React - 25/03/2026",
  totalEmails: 3,
  leadsUploaded: 42,
  accountsAdded: 3,
  platform: "instantly" as const,
};

const defaultProps = {
  executionId: "exec-001",
  stepNumber: 4,
  onAction: vi.fn(),
};

function renderComponent() {
  return render(
    <AgentActivationGate data={defaultData} {...defaultProps} />
  );
}

// ==============================================
// TESTS
// ==============================================

describe("AgentActivationGate (AC: #4, #5, #6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 4, status: "approved", nextStep: 5 } }),
    });
  });

  // AC #4 - Renders summary: [N] leads, [M] emails, [K] sending accounts
  it("renders campaign name, leads, emails, accounts, platform", () => {
    renderComponent();
    expect(screen.getByText("Campanha React - 25/03/2026")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/leads exportados/)).toBeInTheDocument();
    expect(screen.getByText(/emails na sequencia/)).toBeInTheDocument();
    expect(screen.getByText(/sending accounts/)).toBeInTheDocument();
    expect(screen.getByText(/instantly/)).toBeInTheDocument();
  });

  // AC #4 - Renders activation question
  it("renders activation question", () => {
    renderComponent();
    expect(screen.getByText("Quer ativar a campanha agora?")).toBeInTheDocument();
  });

  // AC #5 - Activate sends activate:true
  it("sends approve with activate:true on activate click", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/4/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ approvedData: { activate: true } }),
        })
      );
    });
  });

  // AC #5 - Activate shows feedback
  it("shows activated feedback after activate", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
    });
  });

  // AC #6 - Defer sends activate:false, deferred:true
  it("sends approve with activate:false and deferred:true on defer click", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/4/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ approvedData: { activate: false, deferred: true } }),
        })
      );
    });
  });

  // AC #6 - Defer shows feedback
  it("shows deferred feedback after defer", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Ativacao adiada/)).toBeInTheDocument();
    });
  });

  // Disable after action
  it("disables buttons after activation", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).toBeDisabled();
    });
  });

  // Error handling
  it("shows error message on activation failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Falha na ativacao" } }),
    });

    renderComponent();
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("activation-gate-error")).toHaveTextContent("Falha na ativacao");
    });
  });

  // onAction callback
  it("calls onAction callback after defer", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(defaultProps.onAction).toHaveBeenCalled();
    });
  });
});
