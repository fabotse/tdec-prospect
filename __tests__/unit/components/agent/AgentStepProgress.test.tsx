/**
 * Unit Tests for AgentStepProgress
 * Story 17.1 - AC: #2
 *
 * Tests: rendering by status, correct labels
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
