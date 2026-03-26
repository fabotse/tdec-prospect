/**
 * Agent Types Tests
 * Story: 16.1 - Data Models, Tipos e Pagina do Agente
 *
 * AC: #3 - Tipos do agente disponiveis para importacao
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_ERROR_CODES,
  STEP_LABELS,
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
  type IPipelineOrchestrator,
  type SearchCompaniesOutput,
  type SearchLeadsOutput,
  type SearchLeadResult,
  type ExportStepOutput,
  type ActivateStepOutput,
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
      expect(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR).toBe("Nao consegui extrair dados do produto");
      expect(AGENT_ERROR_CODES.STEP_EXECUTION_ERROR).toBe("Erro ao executar etapa do pipeline");
      expect(AGENT_ERROR_CODES.STEP_TIMEOUT).toBe("Etapa demorou demais para responder");
      expect(AGENT_ERROR_CODES.APPROVAL_TIMEOUT).toBe("Aprovacao expirou");
      expect(AGENT_ERROR_CODES.COST_ESTIMATE_ERROR).toBe("Erro ao calcular estimativa de custo");
      expect(AGENT_ERROR_CODES.EXECUTION_RESUME_ERROR).toBe("Erro ao retomar execucao");
    });

    it("has pipeline error codes (Story 17.1)", () => {
      expect(AGENT_ERROR_CODES.STEP_SEARCH_COMPANIES_ERROR).toBe("Erro ao buscar empresas");
      expect(AGENT_ERROR_CODES.ORCHESTRATOR_INVALID_STEP).toBe("Step invalido no pipeline");
      expect(AGENT_ERROR_CODES.ORCHESTRATOR_STEP_NOT_READY).toBe("Step nao esta pronto para execucao");
      expect(AGENT_ERROR_CODES.CHECKPOINT_SAVE_ERROR).toBe("Erro ao salvar checkpoint");
    });

    it("has export and activate error codes (Story 17.4)", () => {
      expect(AGENT_ERROR_CODES.STEP_EXPORT_ERROR).toBe("Erro na exportacao da campanha");
      expect(AGENT_ERROR_CODES.STEP_ACTIVATE_ERROR).toBe("Erro na ativacao da campanha");
    });

    it("has 15 error codes", () => {
      expect(Object.keys(AGENT_ERROR_CODES)).toHaveLength(15);
    });
  });

  describe("IPipelineOrchestrator interface (Story 17.1 AC #5)", () => {
    it("can be type-checked with required methods", () => {
      const mockOrchestrator: IPipelineOrchestrator = {
        planExecution: async () => [],
        executeStep: async () => ({ success: true, data: {} }),
        getExecution: async () => null,
      };

      expect(mockOrchestrator.planExecution).toBeDefined();
      expect(mockOrchestrator.executeStep).toBeDefined();
      expect(mockOrchestrator.getExecution).toBeDefined();
    });
  });

  describe("SearchCompaniesOutput interface (Story 17.1 AC #3)", () => {
    it("can be instantiated with required fields", () => {
      const output: SearchCompaniesOutput = {
        companies: [],
        totalFound: 0,
        technologySlug: "react",
        filtersApplied: {
          technologySlugs: ["react"],
        },
      };

      expect(output.companies).toEqual([]);
      expect(output.totalFound).toBe(0);
      expect(output.technologySlug).toBe("react");
      expect(output.filtersApplied.technologySlugs).toEqual(["react"]);
    });
  });

  describe("SearchLeadsOutput interface (Story 17.2 AC #2, #3)", () => {
    it("can be instantiated with required fields", () => {
      const output: SearchLeadsOutput = {
        leads: [
          {
            name: "John Doe",
            title: "CTO",
            companyName: "Acme Corp",
            email: null,
            linkedinUrl: "https://linkedin.com/in/johndoe",
          },
        ],
        totalFound: 1,
        jobTitles: ["CTO"],
        domainsSearched: ["acme.com"],
      };

      expect(output.leads).toHaveLength(1);
      expect(output.totalFound).toBe(1);
      expect(output.jobTitles).toEqual(["CTO"]);
      expect(output.domainsSearched).toEqual(["acme.com"]);
    });
  });

  describe("SearchLeadResult interface (Story 17.2 AC #3)", () => {
    it("can be instantiated with all nullable fields", () => {
      const lead: SearchLeadResult = {
        name: "Jane",
        title: null,
        companyName: null,
        email: null,
        linkedinUrl: null,
      };

      expect(lead.name).toBe("Jane");
      expect(lead.title).toBeNull();
      expect(lead.email).toBeNull();
      expect(lead.linkedinUrl).toBeNull();
    });

    it("can be instantiated with all fields populated", () => {
      const lead: SearchLeadResult = {
        name: "John Doe",
        title: "VP Engineering",
        companyName: "Beta Inc",
        email: "john@beta.io",
        linkedinUrl: "https://linkedin.com/in/john",
      };

      expect(lead.name).toBe("John Doe");
      expect(lead.title).toBe("VP Engineering");
      expect(lead.companyName).toBe("Beta Inc");
      expect(lead.email).toBe("john@beta.io");
      expect(lead.linkedinUrl).toBe("https://linkedin.com/in/john");
    });
  });

  describe("ExportStepOutput interface (Story 17.4 AC #1, #2)", () => {
    it("can be instantiated with all required fields", () => {
      const output: ExportStepOutput = {
        externalCampaignId: "camp-123",
        campaignName: "Campanha React",
        leadsUploaded: 50,
        duplicatedLeads: 2,
        invalidEmails: 1,
        accountsAdded: 3,
        platform: "instantly",
      };

      expect(output.externalCampaignId).toBe("camp-123");
      expect(output.platform).toBe("instantly");
      expect(output.leadsUploaded).toBe(50);
    });
  });

  describe("ActivateStepOutput interface (Story 17.4 AC #3, #4)", () => {
    it("can be instantiated with all required fields", () => {
      const output: ActivateStepOutput = {
        externalCampaignId: "camp-123",
        campaignName: "Campanha React",
        activated: true,
        activatedAt: "2026-03-26T10:00:00Z",
      };

      expect(output.activated).toBe(true);
      expect(output.activatedAt).toBe("2026-03-26T10:00:00Z");
    });
  });

  describe("STEP_LABELS (Story 17.1 AC #5)", () => {
    it("maps all 5 step types to PT-BR labels", () => {
      expect(STEP_LABELS.search_companies).toBe("Busca de Empresas");
      expect(STEP_LABELS.search_leads).toBe("Busca de Leads");
      expect(STEP_LABELS.create_campaign).toBe("Criacao de Campanha");
      expect(STEP_LABELS.export).toBe("Exportacao");
      expect(STEP_LABELS.activate).toBe("Ativacao");
    });

    it("has exactly 5 entries", () => {
      expect(Object.keys(STEP_LABELS)).toHaveLength(5);
    });
  });
});
