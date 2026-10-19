/**
 * Unit Tests for AgentStepProgress
 * Story 17.1 - AC: #2
 *
 * Tests: rendering by status, correct labels
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AgentStepProgress } from "@/components/agent/AgentStepProgress";
import type { AgentStep } from "@/types/agent";

// ==============================================
// HELPERS
// ==============================================

function createStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    id: "step-1",
    execution_id: "exec-001",
    step_number: 1,
    step_type: "search_companies",
    status: "pending",
    input: null,
    output: null,
    cost: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-03-26T10:00:00Z",
    ...overrides,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("AgentStepProgress (AC #2)", () => {
  describe("rendering by status (6.2)", () => {
    it("renders pending step with step label", () => {
      const steps = [createStep({ status: "pending" })];
      render(<AgentStepProgress steps={steps} currentStep={0} />);

      expect(screen.getByText(/Busca de Empresas/)).toBeDefined();
    });

    it("renders running step with spinner and progress text (6.3)", () => {
      const steps = [createStep({ status: "running", step_number: 1 })];
      render(<AgentStepProgress steps={steps} currentStep={1} />);

      expect(screen.getByText(/Etapa 1\/1.*Busca de Empresas/)).toBeDefined();
    });

    it("renders completed step with check (6.4)", () => {
      const steps = [
        createStep({ status: "completed", step_number: 1 }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={2} />);

      expect(screen.getByText(/Busca de Empresas/)).toBeDefined();
    });

    it("renders failed step with error message (6.5)", () => {
      const steps = [
        createStep({
          status: "failed",
          step_number: 1,
          error_message: "Rate limited",
        }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={1} />);

      expect(screen.getByText(/Rate limited/)).toBeDefined();
    });
  });

  describe("labels (6.3)", () => {
    it("shows correct PT-BR labels for all step types", () => {
      const steps = [
        createStep({ step_number: 1, step_type: "search_companies", status: "completed" }),
        createStep({ id: "s2", step_number: 2, step_type: "search_leads", status: "pending" }),
        createStep({ id: "s3", step_number: 3, step_type: "create_campaign", status: "pending" }),
        createStep({ id: "s4", step_number: 4, step_type: "export", status: "pending" }),
        createStep({ id: "s5", step_number: 5, step_type: "activate", status: "pending" }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={2} />);

      expect(screen.getByText(/Busca de Empresas/)).toBeDefined();
      expect(screen.getByText(/Busca de Leads/)).toBeDefined();
      expect(screen.getByText(/Criacao de Campanha/)).toBeDefined();
      expect(screen.getByText(/Exportacao/)).toBeDefined();
      expect(screen.getByText(/Ativacao/)).toBeDefined();
    });
  });

  describe("multiple steps (6.2)", () => {
    it("renders multiple steps with correct statuses", () => {
      const steps = [
        createStep({ id: "s1", step_number: 1, step_type: "search_companies", status: "completed" }),
        createStep({ id: "s2", step_number: 2, step_type: "search_leads", status: "running" }),
        createStep({ id: "s3", step_number: 3, step_type: "create_campaign", status: "pending" }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={2} />);

      // All 3 steps should be rendered
      expect(screen.getByText(/Busca de Empresas/)).toBeDefined();
      expect(screen.getByText(/Etapa 2\/3.*Busca de Leads/)).toBeDefined();
      expect(screen.getByText(/Criacao de Campanha/)).toBeDefined();
    });
  });

  // ==============================================
  // Story 17.7 Tests - AC #4
  // ==============================================

  describe("skipped step visual (Story 17.7 - AC #4)", () => {
    it("renders skipped step with line-through and opacity", () => {
      const steps = [
        createStep({ id: "s1", step_number: 1, step_type: "search_companies", status: "skipped" }),
        createStep({ id: "s2", step_number: 2, step_type: "search_leads", status: "pending" }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={0} />);

      const skippedEl = screen.getByText(/Busca de Empresas/).closest("div");
      expect(skippedEl?.className).toContain("line-through");
      expect(skippedEl?.className).toContain("opacity-60");
    });
  });

  describe("awaiting_approval step visual (Story 17.7 - AC #4)", () => {
    it("renders awaiting_approval step with yellow styling", () => {
      const steps = [
        createStep({ id: "s1", step_number: 1, step_type: "search_companies", status: "awaiting_approval" }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={1} />);

      const awaitingEl = screen.getByText(/Busca de Empresas/).closest("div");
      expect(awaitingEl?.className).toContain("text-yellow-600");
      expect(awaitingEl?.className).toContain("font-medium");
    });
  });

  describe("approved step visual (Story 17.7 - AC #4)", () => {
    it("renders approved step with green styling", () => {
      const steps = [
        createStep({ id: "s1", step_number: 1, step_type: "search_companies", status: "approved" }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={2} />);

      const approvedEl = screen.getByText(/Busca de Empresas/).closest("div");
      expect(approvedEl?.className).toContain("text-green-600");
    });
  });

  describe("step count excludes skipped (Story 17.7 - AC #4)", () => {
    it("running step shows count excluding skipped steps", () => {
      const steps = [
        createStep({ id: "s1", step_number: 1, step_type: "search_companies", status: "completed" }),
        createStep({ id: "s2", step_number: 2, step_type: "search_leads", status: "skipped" }),
        createStep({ id: "s3", step_number: 3, step_type: "create_campaign", status: "running" }),
        createStep({ id: "s4", step_number: 4, step_type: "export", status: "pending" }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={3} />);

      // 4 total steps, 1 skipped = 3 active. Step 3 is activeIndex 2 of 3.
      expect(screen.getByText(/Etapa 2\/3.*Criacao de Campanha/)).toBeDefined();
    });
  });

  describe("mixed statuses (Story 17.7 - AC #4)", () => {
    it("renders all status types correctly together", () => {
      const steps = [
        createStep({ id: "s1", step_number: 1, step_type: "search_companies", status: "completed" }),
        createStep({ id: "s2", step_number: 2, step_type: "search_leads", status: "skipped" }),
        createStep({ id: "s3", step_number: 3, step_type: "create_campaign", status: "awaiting_approval" }),
        createStep({ id: "s4", step_number: 4, step_type: "export", status: "pending" }),
        createStep({ id: "s5", step_number: 5, step_type: "activate", status: "pending" }),
      ];
      render(<AgentStepProgress steps={steps} currentStep={3} />);

      // All steps rendered
      expect(screen.getByText(/Busca de Empresas/)).toBeDefined();
      expect(screen.getByText(/Busca de Leads/)).toBeDefined();
      expect(screen.getByText(/Criacao de Campanha/)).toBeDefined();
      expect(screen.getByText(/Exportacao/)).toBeDefined();
      expect(screen.getByText(/Ativacao/)).toBeDefined();
    });
  });
});

// ==============================================
// Story 24.3 (AC3/AC4) — "Tentar novamente" na linha do step failed
// ==============================================

describe("AgentStepProgress — retry de step failed (Story 24.3)", () => {
  const failedStep = (error: Record<string, unknown> | null, message = "Rate limited") =>
    createStep({
      status: "failed",
      step_number: 2,
      step_type: "search_leads",
      error_message: message,
      output: error ? { error } : null,
    });

  it("step failed retryable mostra o botao e o clique chama onRetryStep(n)", async () => {
    const onRetryStep = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentStepProgress
        steps={[failedStep({ isRetryable: true })]}
        currentStep={0}
        onRetryStep={onRetryStep}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-retry-2"));
    });

    expect(onRetryStep).toHaveBeenCalledWith(2);
  });

  it("campo isRetryable ausente (falha legada) conta como retryable", () => {
    render(
      <AgentStepProgress steps={[failedStep(null)]} currentStep={0} onRetryStep={vi.fn()} />
    );
    expect(screen.getByTestId("step-retry-2")).toBeInTheDocument();
  });

  it("botao fica desabilitado enquanto o retry roda", async () => {
    let resolve!: () => void;
    const onRetryStep = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(
      <AgentStepProgress
        steps={[failedStep({ isRetryable: true })]}
        currentStep={0}
        onRetryStep={onRetryStep}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-retry-2"));
    });
    expect(screen.getByTestId("step-retry-2")).toBeDisabled();

    await act(async () => {
      resolve();
    });
    expect(screen.getByTestId("step-retry-2")).not.toBeDisabled();
  });

  it("nao retryable: sem botao e sem 'tente novamente' na mensagem", () => {
    render(
      <AgentStepProgress
        steps={[failedStep({ isRetryable: false }, "Erro interno. Tente novamente.")]}
        currentStep={0}
        onRetryStep={vi.fn()}
      />
    );

    expect(screen.queryByTestId("step-retry-2")).not.toBeInTheDocument();
    const text = screen.getByTestId("step-error-2").textContent ?? "";
    expect(text.toLowerCase()).not.toContain("tente novamente");
    expect(text).toContain("Entre em contato com o suporte.");
  });

  it("sem onRetryStep nao ha botao (painel so leitura)", () => {
    render(<AgentStepProgress steps={[failedStep({ isRetryable: true })]} currentStep={0} />);
    expect(screen.queryByTestId("step-retry-2")).not.toBeInTheDocument();
  });

  it("step nao failed nunca mostra o botao", () => {
    render(
      <AgentStepProgress
        steps={[createStep({ status: "completed", step_number: 2 })]}
        currentStep={0}
        onRetryStep={vi.fn()}
      />
    );
    expect(screen.queryByTestId("step-retry-2")).not.toBeInTheDocument();
  });
});
