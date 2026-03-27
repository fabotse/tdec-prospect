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
  accountsAdded: 0,
  platform: "instantly" as const,
  accounts: [
    { email: "sender1@company.com", first_name: "Alice", last_name: "Santos" },
    { email: "sender2@company.com", first_name: "Bob" },
  ],
};

const defaultProps = {
  executionId: "exec-001",
  stepNumber: 4,
  totalSteps: 5,
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

  // AC #4 - Renders summary: leads, emails, platform
  it("renders campaign name, leads, emails, platform", () => {
    renderComponent();
    expect(screen.getByText("Campanha React - 25/03/2026")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/leads exportados/)).toBeInTheDocument();
    expect(screen.getByText(/emails na sequencia/)).toBeInTheDocument();
    expect(screen.getByText(/instantly/)).toBeInTheDocument();
  });

  // AC #4 - Renders activation question
  it("renders activation question", () => {
    renderComponent();
    expect(screen.getByText("Quer ativar a campanha agora?")).toBeInTheDocument();
  });

  // AC #5 - Activate sends activate:true with selectedAccounts
  it("sends approve with activate:true and selectedAccounts on activate click", async () => {
    renderComponent();
    // Must select at least one account before activate is enabled
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/4/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            approvedData: {
              activate: true,
              selectedAccounts: ["sender1@company.com"],
            },
          }),
        })
      );
    });
  });

  // AC #5 - Activate shows feedback
  it("shows activated feedback after activate", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Campanha ativada/)).toBeInTheDocument();
    });
  });

  // AC #6 - Defer sends activate:false, deferred:true with selectedAccounts
  it("sends approve with activate:false, deferred:true and selectedAccounts on defer click", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/4/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            approvedData: {
              activate: false,
              deferred: true,
              selectedAccounts: ["sender1@company.com"],
            },
          }),
        })
      );
    });
  });

  // AC #6 - Defer shows feedback
  it("shows deferred feedback after defer", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Ativacao adiada/)).toBeInTheDocument();
    });
  });

  // Disable after action
  it("disables buttons after activation", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
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
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-activate-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("activation-gate-error")).toHaveTextContent("Falha na ativacao");
    });
  });

  // onAction callback
  it("calls onAction callback after defer", async () => {
    renderComponent();
    fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
    fireEvent.click(screen.getByTestId("activation-defer-btn"));

    await waitFor(() => {
      expect(defaultProps.onAction).toHaveBeenCalled();
    });
  });

  // ==============================================
  // Story 17.9: Account Selection Tests
  // ==============================================

  describe("Story 17.9 - Account Selection", () => {
    it("renders account list with checkboxes (AC #1)", () => {
      renderComponent();
      expect(screen.getByTestId("account-selection")).toBeInTheDocument();
      expect(screen.getByText("Alice Santos")).toBeInTheDocument();
      expect(screen.getByText("sender1@company.com")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("sender2@company.com")).toBeInTheDocument();
    });

    it("buttons are disabled when no account is selected (AC #1)", () => {
      renderComponent();
      expect(screen.getByTestId("activation-activate-btn")).toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).toBeDisabled();
    });

    it("selecting an account enables buttons", () => {
      renderComponent();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });

    it("toggle all selects all accounts, then clears", () => {
      renderComponent();
      const toggleBtn = screen.getByTestId("account-toggle-all-btn");
      expect(toggleBtn).toHaveTextContent("Selecionar Todas");

      fireEvent.click(toggleBtn);
      expect(screen.getByText(/2\/2/)).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent("Limpar Selecao");

      fireEvent.click(toggleBtn);
      expect(screen.getByText(/0\/2/)).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent("Selecionar Todas");
    });

    it("approve sends all selected accounts in body (AC #2)", async () => {
      renderComponent();
      // Select both accounts
      fireEvent.click(screen.getByTestId("account-toggle-all-btn"));
      fireEvent.click(screen.getByTestId("activation-activate-btn"));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.approvedData.selectedAccounts).toEqual(
          expect.arrayContaining(["sender1@company.com", "sender2@company.com"])
        );
        expect(body.approvedData.selectedAccounts).toHaveLength(2);
      });
    });

    it("shows account count in header", () => {
      renderComponent();
      expect(screen.getByText(/0\/2/)).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Selecionar conta sender1@company.com"));
      expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    });

    it("hides account selection and enables buttons when accounts is empty", () => {
      render(
        <AgentActivationGate
          data={{ ...defaultData, accounts: [] }}
          {...defaultProps}
        />
      );
      expect(screen.queryByTestId("account-selection")).not.toBeInTheDocument();
      expect(screen.getByTestId("activation-activate-btn")).not.toBeDisabled();
      expect(screen.getByTestId("activation-defer-btn")).not.toBeDisabled();
    });
  });
});
