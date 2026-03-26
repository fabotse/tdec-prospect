/**
 * Unit Tests for AgentExecutionPlan
 * Story 16.5 - AC: #1, #2, #4, #5
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentExecutionPlan } from "@/components/agent/AgentExecutionPlan";

// ==============================================
// MOCK DATA
// ==============================================

const mockPlanData = {
  data: {
    steps: [
      {
        stepNumber: 1,
        stepType: "search_companies",
        title: "Buscar Empresas",
        description: "Buscar empresas que usam Netskope via TheirStack",
        skipped: false,
        estimatedCost: 0.10,
        costDescription: "1 busca",
      },
      {
        stepNumber: 2,
        stepType: "search_leads",
        title: "Encontrar Contatos",
        description: "Encontrar CTO nas empresas via Apollo",
        skipped: false,
        estimatedCost: 3.00,
        costDescription: "60 leads",
      },
      {
        stepNumber: 3,
        stepType: "create_campaign",
        title: "Criar Campanha",
        description: "Gerar emails personalizados com IA",
        skipped: false,
        estimatedCost: 4.20,
        costDescription: "210 prompts",
      },
      {
        stepNumber: 4,
        stepType: "export",
        title: "Exportar para Instantly",
        description: "Exportar campanha",
        skipped: true,
        estimatedCost: 0,
        costDescription: "Pulado",
      },
      {
        stepNumber: 5,
        stepType: "activate",
        title: "Ativar Campanha",
        description: "Ativar envio automatico",
        skipped: false,
        estimatedCost: 0,
        costDescription: "Gratuito",
      },
    ],
    costEstimate: {
      steps: {},
      total: 7.30,
      currency: "BRL",
    },
    totalActiveSteps: 4,
  },
};

// ==============================================
// TESTS
// ==============================================

describe("AgentExecutionPlan", () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();
  const EXEC_ID = "exec-plan-001";

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  function renderPlan(props?: { isSubmitting?: boolean }) {
    return render(
      <AgentExecutionPlan
        executionId={EXEC_ID}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        isSubmitting={props?.isSubmitting}
      />
    );
  }

  it("renderiza loading state inicialmente", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}) // never resolves
    );

    renderPlan();

    expect(screen.getByTestId("agent-execution-plan")).toBeInTheDocument();
    expect(screen.getByText("Gerando plano de execucao...")).toBeInTheDocument();
  });

  it("renderiza steps apos fetch com sucesso", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByText("Buscar Empresas")).toBeInTheDocument();
    });

    expect(screen.getByText("Encontrar Contatos")).toBeInTheDocument();
    expect(screen.getByText("Criar Campanha")).toBeInTheDocument();
    expect(screen.getByText("Exportar para Instantly")).toBeInTheDocument();
    expect(screen.getByText("Ativar Campanha")).toBeInTheDocument();
  });

  it("renderiza step skipped com visual diferenciado", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByTestId("plan-step-4")).toBeInTheDocument();
    });

    const skippedStep = screen.getByTestId("plan-step-4");
    expect(skippedStep.className).toContain("opacity-50");
    expect(skippedStep).toHaveTextContent("Pulado");
  });

  it("exibe custo total", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByTestId("plan-total-cost")).toBeInTheDocument();
    });

    expect(screen.getByTestId("plan-total-cost")).toHaveTextContent("R$");
  });

  it("botao confirmar chama onConfirm", async () => {
    const user = userEvent.setup();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByTestId("plan-confirm-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("plan-confirm-btn"));
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it("botao cancelar chama onCancel", async () => {
    const user = userEvent.setup();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByTestId("plan-cancel-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("plan-cancel-btn"));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it("exibe erro e botao retry quando fetch falha", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByText(/Erro ao gerar plano/)).toBeInTheDocument();
    });

    expect(screen.getByTestId("plan-retry-btn")).toBeInTheDocument();
  });

  it("retry refaz fetch quando clicado", async () => {
    const user = userEvent.setup();

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPlanData),
      });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByTestId("plan-retry-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("plan-retry-btn"));

    await waitFor(() => {
      expect(screen.getByText("Buscar Empresas")).toBeInTheDocument();
    });
  });

  it("botao confirmar desabilitado durante isSubmitting", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan({ isSubmitting: true });

    await waitFor(() => {
      expect(screen.getByTestId("plan-confirm-btn")).toBeInTheDocument();
    });

    expect(screen.getByTestId("plan-confirm-btn")).toBeDisabled();
    expect(screen.getByTestId("plan-confirm-btn")).toHaveTextContent("Iniciando...");
  });

  it("data-testids presentes", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByTestId("agent-execution-plan")).toBeInTheDocument();
    });

    expect(screen.getByTestId("plan-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("plan-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("plan-step-3")).toBeInTheDocument();
    expect(screen.getByTestId("plan-step-4")).toBeInTheDocument();
    expect(screen.getByTestId("plan-step-5")).toBeInTheDocument();
    expect(screen.getByTestId("plan-total-cost")).toBeInTheDocument();
    expect(screen.getByTestId("plan-confirm-btn")).toBeInTheDocument();
    expect(screen.getByTestId("plan-cancel-btn")).toBeInTheDocument();
  });

  it("exibe 'Gratuito' para step ativo com custo zero", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(screen.getByTestId("plan-step-5")).toBeInTheDocument();
    });

    // Step 5 (activate) has estimatedCost: 0, should show "Gratuito"
    expect(screen.getByTestId("plan-step-5")).toHaveTextContent("Gratuito");
  });

  it("faz fetch para URL correta com executionId", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPlanData),
    });

    renderPlan();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/agent/executions/${EXEC_ID}/plan`
      );
    });
  });
});
