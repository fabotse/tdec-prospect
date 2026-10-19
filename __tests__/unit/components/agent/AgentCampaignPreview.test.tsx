/**
 * Unit Tests for AgentCampaignPreview
 * Story 17.6 - AC: #1, #2, #3
 *
 * Tests: renders campaign name, emails, icebreakers; inline editing; approve sends edited emailBlocks;
 * reject works; disable after action; error states; collapsible icebreakers
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentCampaignPreview } from "@/components/agent/AgentCampaignPreview";
import { useAgentStore } from "@/stores/use-agent-store";

// ==============================================
// MOCKS
// ==============================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// HELPERS
// ==============================================

function createDefaultData() {
  return {
    campaignName: "Campanha React - 25/03/2026",
    structure: { totalEmails: 2, totalDays: 3 },
    emailBlocks: [
      { position: 0, subject: "Assunto inicial", body: "Corpo do email inicial", emailMode: "initial" },
      { position: 1, subject: "Follow-up assunto", body: "Corpo do follow-up", emailMode: "follow-up" },
    ],
    leadsWithIcebreakers: [
      { name: "Ana Silva", companyName: "Acme", icebreaker: "Vi que voce usa React" },
      { name: "Bruno Costa", companyName: "TechCo", icebreaker: null },
    ],
    icebreakerStats: { generated: 1, failed: 1, skipped: 0 },
    totalLeads: 2,
  };
}

const defaultProps = {
  executionId: "exec-001",
  stepNumber: 3,
  totalSteps: 5,
  onAction: vi.fn(),
};

function renderComponent(overrides?: Partial<{ data: ReturnType<typeof createDefaultData> }>) {
  return render(
    <AgentCampaignPreview
      data={overrides?.data ?? createDefaultData()}
      {...defaultProps}
    />
  );
}

// ==============================================
// TESTS
// ==============================================

describe("AgentCampaignPreview (AC: #1, #2, #3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 3, status: "approved", nextStep: 4 } }),
    });
  });

  // AC #1 - Renders campaign name
  it("renders campaign name in header", () => {
    renderComponent();
    expect(screen.getByText("Campanha React - 25/03/2026")).toBeInTheDocument();
  });

  // AC #1 - Renders email count, days, leads in description
  it("renders structure info (emails, days, leads)", () => {
    renderComponent();
    expect(screen.getByText(/2 emails/)).toBeInTheDocument();
    expect(screen.getByText(/3 dias/)).toBeInTheDocument();
    expect(screen.getByText(/2 leads/)).toBeInTheDocument();
  });

  // AC #1 - Renders email blocks with subject and body
  it("renders email blocks with subject and body", () => {
    renderComponent();
    expect(screen.getByText(/Assunto inicial/)).toBeInTheDocument();
    expect(screen.getByText("Corpo do email inicial")).toBeInTheDocument();
    expect(screen.getByText(/Follow-up assunto/)).toBeInTheDocument();
    expect(screen.getByText("Corpo do follow-up")).toBeInTheDocument();
  });

  // AC #1 - Renders email mode labels
  it("renders email mode labels (Inicial / Follow-up)", () => {
    renderComponent();
    expect(screen.getByText(/Email 1 \(Inicial\)/)).toBeInTheDocument();
    expect(screen.getByText(/Email 2 \(Follow-up\)/)).toBeInTheDocument();
  });

  // AC #1 - Renders icebreakers
  it("renders icebreakers by lead", () => {
    renderComponent();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Vi que voce usa React")).toBeInTheDocument();
    expect(screen.getByText("Bruno Costa")).toBeInTheDocument();
    expect(screen.getByText("Sem icebreaker")).toBeInTheDocument();
  });

  // AC #2 - Inline editing: click subject opens input
  it("opens input when clicking on subject text", () => {
    renderComponent();
    const subject = screen.getByTestId("email-subject-0");
    fireEvent.click(subject);
    expect(screen.getByTestId("email-subject-input-0")).toBeInTheDocument();
  });

  // AC #2 - Inline editing: click body opens textarea
  it("opens textarea when clicking on body text", () => {
    renderComponent();
    const body = screen.getByTestId("email-body-0");
    fireEvent.click(body);
    expect(screen.getByTestId("email-body-input-0")).toBeInTheDocument();
  });

  // AC #2 - Inline editing: changes are reflected
  it("updates subject text on input change", () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("email-subject-0"));
    const input = screen.getByTestId("email-subject-input-0");
    fireEvent.change(input, { target: { value: "Novo assunto" } });
    expect(input).toHaveValue("Novo assunto");
  });

  // AC #2 - Inline editing: blur closes editor
  it("closes input on blur", () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("email-subject-0"));
    const input = screen.getByTestId("email-subject-input-0");
    fireEvent.blur(input);
    expect(screen.queryByTestId("email-subject-input-0")).not.toBeInTheDocument();
  });

  // AC #3 - Approve sends edited emailBlocks
  it("approve sends edited emailBlocks in approvedData", async () => {
    renderComponent();

    // Edit subject
    fireEvent.click(screen.getByTestId("email-subject-0"));
    const input = screen.getByTestId("email-subject-input-0");
    fireEvent.change(input, { target: { value: "Assunto editado" } });
    fireEvent.blur(input);

    // Approve
    fireEvent.click(screen.getByTestId("campaign-approve-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/3/approve",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.any(String),
        })
      );
    });

    // Verify body contains edited emailBlocks
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.approvedData.emailBlocks[0].subject).toBe("Assunto editado");
    expect(callBody.approvedData.emailBlocks[1].subject).toBe("Follow-up assunto");
  });

  // AC #3 - Approve shows feedback
  it("shows approved feedback after approve", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("campaign-approve-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Campanha aprovada/)).toBeInTheDocument();
    });
  });

  // Reject works
  it("calls reject endpoint on reject", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("campaign-reject-btn"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/agent/executions/exec-001/steps/3/reject",
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.getByText(/Campanha rejeitada/)).toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 22.13 — ajuste pos-rejeicao (o estado e GENERICO: cobre campanha, nao so busca)
  // ==============================================

  it("rejeitar: liga o estado de ajuste no store e PARA o spinner (22.13 AC1)", async () => {
    act(() => {
      useAgentStore.setState({ adjustingStep: null });
    });

    renderComponent();
    fireEvent.click(screen.getByTestId("campaign-reject-btn"));

    await waitFor(() => {
      expect(useAgentStore.getState().adjustingStep).toEqual({
        executionId: "exec-001",
        stepNumber: 3,
        stepType: "create_campaign",
        phase: "describe",
      });
    });

    expect(
      screen.getByTestId("campaign-reject-btn").querySelector(".animate-spin")
    ).toBeNull();
  });

  it("prop rejected: card nasce marcado e com os botoes desabilitados (22.13 AC5)", () => {
    render(
      <AgentCampaignPreview
        data={createDefaultData()}
        {...defaultProps}
        totalSteps={5}
        rejected
      />
    );

    expect(screen.getByText(/Campanha rejeitada/)).toBeInTheDocument();
    expect(screen.getByTestId("campaign-reject-btn")).toBeDisabled();
    expect(screen.getByTestId("campaign-approve-btn")).toBeDisabled();
  });

  // Disable after action
  it("disables buttons after action", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("campaign-approve-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("campaign-approve-btn")).toBeDisabled();
      expect(screen.getByTestId("campaign-reject-btn")).toBeDisabled();
    });
  });

  // Error handling
  it("shows error message on approve failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Erro do servidor" } }),
    });

    renderComponent();
    fireEvent.click(screen.getByTestId("campaign-approve-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("campaign-preview-error")).toHaveTextContent("Erro do servidor");
    });
  });

  // onAction callback
  it("calls onAction callback after approve", async () => {
    renderComponent();
    fireEvent.click(screen.getByTestId("campaign-approve-btn"));

    await waitFor(() => {
      expect(defaultProps.onAction).toHaveBeenCalled();
    });
  });

  // Collapsible icebreakers when > 10 leads
  it("collapses icebreakers when more than 10 leads", () => {
    const data = createDefaultData();
    data.leadsWithIcebreakers = Array.from({ length: 12 }, (_, i) => ({
      name: `Lead ${i}`,
      companyName: `Company ${i}`,
      icebreaker: `Icebreaker ${i}`,
    }));
    data.totalLeads = 12;

    render(
      <AgentCampaignPreview data={data} {...defaultProps} />
    );

    // Should be collapsed by default
    expect(screen.queryByTestId("icebreaker-list")).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByTestId("icebreaker-toggle"));
    expect(screen.getByTestId("icebreaker-list")).toBeInTheDocument();
  });
});

// ==============================================
// Story 24.3 (AC2) — disparo do proximo step VERIFICADO
// ==============================================

describe("AgentCampaignPreview — falha no disparo do proximo step (Story 24.3)", () => {
  function mockExecuteResponse(status: number, body: unknown) {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("/execute")) {
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { status: "approved" } }),
      });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({ stepTriggerFailure: null });
  });

  it("falha pre-orchestrator (422) no disparo nao aguardado vira aviso no store", async () => {
    mockExecuteResponse(422, {
      error: { code: "API_KEY_NOT_FOUND", message: "API key do TheirStack nao configurada" },
    });

    renderComponent();
    await act(async () => {
      fireEvent.click(screen.getByTestId("campaign-approve-btn"));
    });

    await waitFor(() => {
      expect(useAgentStore.getState().stepTriggerFailure).toEqual({
        executionId: "exec-001",
        stepNumber: 4,
        message: "API key do TheirStack nao configurada",
        retryable: true,
      });
    });
  });

  it("409 STEP_ALREADY_RUNNING (outro executor) NAO gera aviso", async () => {
    mockExecuteResponse(409, {
      error: { code: "STEP_ALREADY_RUNNING", message: "Etapa ja esta em execucao" },
    });

    renderComponent();
    await act(async () => {
      fireEvent.click(screen.getByTestId("campaign-approve-btn"));
    });

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([url]) => String(url).includes("/execute"))
      ).toBe(true);
    });
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });

  it("falha ja reportada no chat (reportedInChat) NAO duplica o aviso", async () => {
    mockExecuteResponse(503, {
      error: { code: "STEP_ERROR", message: "Rate limited", isRetryable: true, reportedInChat: true },
    });

    renderComponent();
    await act(async () => {
      fireEvent.click(screen.getByTestId("campaign-approve-btn"));
    });

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([url]) => String(url).includes("/execute"))
      ).toBe(true);
    });
    expect(useAgentStore.getState().stepTriggerFailure).toBeNull();
  });
});

// ==============================================
// Story 24.9 — status do revisor automatico de copy
// ==============================================

describe("AgentCampaignPreview — status do revisor (Story 24.9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stepNumber: 3, status: "approved", nextStep: 4 } }),
    });
  });

  function dataWithReview() {
    const data = createDefaultData();
    return {
      ...data,
      emailBlocks: [
        { ...data.emailBlocks[0], review: { status: "rewritten" as const, reasons: [] } },
        {
          ...data.emailBlocks[1],
          review: {
            status: "needs_human_review" as const,
            reasons: ["CTA pede reunião: pede 30 min na agenda"],
          },
        },
      ],
    };
  }

  it("mostra o badge de status por e-mail e os motivos quando precisa revisao humana", () => {
    render(<AgentCampaignPreview data={dataWithReview()} {...defaultProps} />);
    const badges = screen.getAllByTestId("copy-review-badge");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent("Reescrito");
    expect(badges[1]).toHaveTextContent("Precisa revisão humana");
    expect(screen.getByTestId("copy-review-reasons-1")).toHaveTextContent(
      "CTA pede reunião: pede 30 min na agenda"
    );
    expect(screen.queryByTestId("copy-review-reasons-0")).not.toBeInTheDocument();
  });

  it("execucao antiga (sem review) nao mostra badge", () => {
    renderComponent();
    expect(screen.queryByTestId("copy-review-badge")).not.toBeInTheDocument();
  });

  it("editar o texto remove o badge e o approve nao envia o review do bloco editado", async () => {
    render(<AgentCampaignPreview data={dataWithReview()} {...defaultProps} />);
    fireEvent.click(screen.getByTestId("email-subject-0"));
    fireEvent.change(screen.getByTestId("email-subject-input-0"), {
      target: { value: "Assunto editado" },
    });
    fireEvent.blur(screen.getByTestId("email-subject-input-0"));

    const badges = screen.getAllByTestId("copy-review-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("Precisa revisão humana");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /aprovar/i }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const approveCall = mockFetch.mock.calls.find((c) => String(c[0]).includes("/approve"));
    const sent = JSON.parse(approveCall![1].body);
    expect(sent.approvedData.emailBlocks[0].subject).toBe("Assunto editado");
    expect(sent.approvedData.emailBlocks[0]).not.toHaveProperty("review");
    expect(sent.approvedData.emailBlocks[1].review.status).toBe("needs_human_review");
  });

  it("approve reenvia os blocos com o review", async () => {
    render(<AgentCampaignPreview data={dataWithReview()} {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /aprovar/i }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const approveCall = mockFetch.mock.calls.find((c) => String(c[0]).includes("/approve"));
    const sent = JSON.parse(approveCall![1].body);
    expect(sent.approvedData.emailBlocks[1].review.status).toBe("needs_human_review");
  });
});
