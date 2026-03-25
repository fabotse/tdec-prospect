/**
 * Agent Types Tests
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #3 - Tipos do agente disponiveis para importacao
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_ERROR_CODES,
  type AgentExecution,
  type AgentStep,
  type AgentMessage,
  type AgentMessageMetadata,
  type ParsedBriefing,
  type CostModel,
  type CostEstimate,
  type StepInput,
  type StepOutput,
  type PipelineError,
  type ExecutionStatus,
  type ExecutionMode,
  type StepType,
  type StepStatus,
  type MessageRole,
  type MessageType,
} from "@/types/agent";

describe("Agent Types (AC: #3)", () => {
  describe("Type Unions", () => {
    it("ExecutionStatus accepts valid values", () => {
      const statuses: ExecutionStatus[] = ["pending", "running", "paused", "completed", "failed"];
      expect(statuses).toHaveLength(5);
    });

    it("ExecutionMode accepts valid values", () => {
      const modes: ExecutionMode[] = ["guided", "autopilot"];
      expect(modes).toHaveLength(2);
    });

    it("StepType accepts valid values", () => {
      const types: StepType[] = ["search_companies", "search_leads", "create_campaign", "export", "activate"];
      expect(types).toHaveLength(5);
    });

    it("StepStatus accepts valid values", () => {
      const statuses: StepStatus[] = [
        "pending", "running", "awaiting_approval", "approved", "completed", "failed", "skipped",
      ];
      expect(statuses).toHaveLength(7);
    });

    it("MessageRole accepts valid values", () => {
      const roles: MessageRole[] = ["user", "agent", "system"];
      expect(roles).toHaveLength(3);
    });

    it("MessageType accepts valid values", () => {
      const types: MessageType[] = [
        "text", "approval_gate", "progress", "error", "cost_estimate", "summary",
      ];
      expect(types).toHaveLength(6);
    });
  });

  describe("AgentExecution interface", () => {
    it("can be instantiated with all required fields", () => {
      const execution: AgentExecution = {
        id: "exec-1",
        tenant_id: "tenant-1",
        user_id: "user-1",
        status: "pending",
        mode: "guided",
        briefing: {
          technology: "React",
          jobTitles: ["CTO"],
          location: "Brasil",
          companySize: "51-200",
          industry: "technology",
          productSlug: null,
          mode: "guided",
          skipSteps: [],
        },
        current_step: 0,
        total_steps: 5,
        cost_estimate: null,
        cost_actual: null,
        result_summary: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-03-25T10:00:00Z",
        updated_at: "2026-03-25T10:00:00Z",
      };

      expect(execution.id).toBe("exec-1");
      expect(execution.status).toBe("pending");
      expect(execution.briefing.technology).toBe("React");
    });
  });

  describe("AgentStep interface", () => {
    it("can be instantiated with all required fields", () => {
      const step: AgentStep = {
        id: "step-1",
        execution_id: "exec-1",
        step_number: 1,
        step_type: "search_companies",
        status: "pending",
        input: null,
        output: null,
        cost: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-03-25T10:00:00Z",
      };

      expect(step.step_type).toBe("search_companies");
      expect(step.step_number).toBe(1);
    });
  });

  describe("AgentMessage interface", () => {
    it("can be instantiated with all required fields", () => {
      const message: AgentMessage = {
        id: "msg-1",
        execution_id: "exec-1",
        role: "user",
        content: "Quero prospectar CTOs de empresas de tecnologia",
        metadata: {},
        created_at: "2026-03-25T10:00:00Z",
      };

      expect(message.role).toBe("user");
      expect(message.content).toContain("CTOs");
    });

    it("supports metadata with stepNumber and messageType", () => {
      const metadata: AgentMessageMetadata = {
        stepNumber: 2,
        messageType: "progress",
      };

      expect(metadata.stepNumber).toBe(2);
      expect(metadata.messageType).toBe("progress");
    });

    it("supports metadata with approvalData", () => {
      const metadata: AgentMessageMetadata = {
        stepNumber: 1,
        messageType: "approval_gate",
        approvalData: {
          stepType: "search_companies",
          previewData: { count: 50 },
        },
      };

      expect(metadata.approvalData?.stepType).toBe("search_companies");
    });
  });

  describe("ParsedBriefing interface", () => {
    it("can be instantiated with nullable fields", () => {
      const briefing: ParsedBriefing = {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided",
        skipSteps: [],
      };

      expect(briefing.technology).toBeNull();
      expect(briefing.jobTitles).toEqual([]);
      expect(briefing.mode).toBe("guided");
    });
  });

  describe("CostModel interface", () => {
    it("can be instantiated with all required fields", () => {
      const model: CostModel = {
        id: "cost-1",
        tenant_id: "tenant-1",
        service_name: "apollo_search",
        unit_price: 0.05,
        unit_description: "por lead encontrado",
        currency: "BRL",
        created_at: "2026-03-25T10:00:00Z",
        updated_at: "2026-03-25T10:00:00Z",
      };

      expect(model.service_name).toBe("apollo_search");
      expect(model.unit_price).toBe(0.05);
    });
  });

  describe("CostEstimate interface", () => {
    it("can be instantiated with steps and total", () => {
      const estimate: CostEstimate = {
        steps: {
          search_companies: { estimated: 10, description: "Busca de empresas" },
          search_leads: { estimated: 25, description: "Busca de leads" },
        },
        total: 35,
        currency: "BRL",
      };

      expect(estimate.total).toBe(35);
      expect(estimate.currency).toBe("BRL");
      expect(Object.keys(estimate.steps)).toHaveLength(2);
    });
  });

  describe("Pipeline types", () => {
    it("StepInput can be instantiated", () => {
      const input: StepInput = {
        executionId: "exec-1",
        briefing: {
          technology: "React",
          jobTitles: ["CTO"],
          location: null,
          companySize: null,
          industry: null,
          productSlug: null,
          mode: "guided",
          skipSteps: [],
        },
      };

      expect(input.executionId).toBe("exec-1");
    });

    it("StepOutput can be instantiated", () => {
      const output: StepOutput = {
        success: true,
        data: { companiesFound: 50 },
        cost: { api_calls: 10 },
      };

      expect(output.success).toBe(true);
    });

    it("PipelineError can be instantiated", () => {
      const error: PipelineError = {
        code: "STEP_EXECUTION_ERROR",
        message: "Erro ao executar etapa",
        stepNumber: 2,
        stepType: "search_leads",
        isRetryable: true,
        externalService: "apollo",
      };

      expect(error.isRetryable).toBe(true);
      expect(error.externalService).toBe("apollo");
    });
  });

  describe("AGENT_ERROR_CODES", () => {
    it("has all expected error codes", () => {
      expect(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR).toBe("Nao consegui interpretar o briefing");
      expect(AGENT_ERROR_CODES.STEP_EXECUTION_ERROR).toBe("Erro ao executar etapa do pipeline");
      expect(AGENT_ERROR_CODES.STEP_TIMEOUT).toBe("Etapa demorou demais para responder");
      expect(AGENT_ERROR_CODES.APPROVAL_TIMEOUT).toBe("Aprovacao expirou");
      expect(AGENT_ERROR_CODES.COST_ESTIMATE_ERROR).toBe("Erro ao calcular estimativa de custo");
      expect(AGENT_ERROR_CODES.EXECUTION_RESUME_ERROR).toBe("Erro ao retomar execucao");
    });

    it("has 6 error codes", () => {
      expect(Object.keys(AGENT_ERROR_CODES)).toHaveLength(6);
    });
  });
});
