/**
 * DeterministicOrchestrator - Pipeline step orchestrator
 * Story 17.1 - AC: #5
 *
 * Implements IPipelineOrchestrator. Dispatches steps via registry.
 * On failure: status='paused' (NEVER 'failed' directly), sendErrorMessage().
 */

import type {
  IPipelineOrchestrator,
  StepOutput,
  StepInput,
  PipelineError,
  ParsedBriefing,
  PlannedStep,
  AgentExecution,
  StepType,
} from "@/types/agent";
import { STEP_LABELS } from "@/types/agent";
import { SearchCompaniesStep } from "./steps/search-companies-step";
import { SearchLeadsStep } from "./steps/search-leads-step";
import { PlanGeneratorService } from "@/lib/services/agent-plan-generator";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// PIPELINE ERROR TYPE GUARD
// ==============================================

export function isPipelineError(error: unknown): error is PipelineError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "stepNumber" in error &&
    "stepType" in error &&
    "isRetryable" in error
  );
}

// ==============================================
// ORCHESTRATOR
// ==============================================

export class DeterministicOrchestrator implements IPipelineOrchestrator {
  private readonly supabase: SupabaseClient;
  private readonly apiKey: string;

  constructor(supabase: SupabaseClient, apiKey: string) {
    this.supabase = supabase;
    this.apiKey = apiKey;
  }

  /**
   * Generate execution plan from briefing.
   * Delegates to PlanGeneratorService.
   * (4.4)
   */
  async planExecution(briefing: ParsedBriefing): Promise<PlannedStep[]> {
    const costEstimate = { steps: {}, total: 0, currency: "BRL" as const };
    return PlanGeneratorService.generatePlan(briefing, costEstimate);
  }

  /**
   * Execute a specific step by number.
   * Fetches step from DB, dispatches to correct step class.
   * On error: paused + sendErrorMessage + throw.
   * (4.3)
   */
  async executeStep(executionId: string, stepNumber: number): Promise<StepOutput> {
    // Fetch execution
    const { data: execution } = await this.supabase
      .from("agent_executions")
      .select("*")
      .eq("id", executionId)
      .single();

    if (!execution) {
      throw this.createPipelineError(
        "ORCHESTRATOR_INVALID_STEP",
        "Execucao nao encontrada",
        stepNumber,
        "search_companies" as StepType
      );
    }

    // Fetch step
    const { data: stepRecord } = await this.supabase
      .from("agent_steps")
      .select("*")
      .eq("execution_id", executionId)
      .eq("step_number", stepNumber)
      .single();

    const stepType = (stepRecord?.step_type as StepType) ?? ("search_companies" as StepType);

    if (!stepRecord) {
      throw this.createPipelineError(
        "ORCHESTRATOR_INVALID_STEP",
        "Step nao encontrado",
        stepNumber,
        stepType
      );
    }

    const tenantId = (execution as AgentExecution).tenant_id;

    // Build step input with previousStepOutput (Story 17.2 - 3.3)
    let previousStepOutput: Record<string, unknown> | undefined;
    if (stepNumber > 1) {
      const { data: prevStep } = await this.supabase
        .from("agent_steps")
        .select("output")
        .eq("execution_id", executionId)
        .eq("step_number", stepNumber - 1)
        .eq("status", "completed")
        .single();

      if (!prevStep?.output) {
        throw this.createPipelineError(
          "ORCHESTRATOR_STEP_NOT_READY",
          "Step anterior nao concluido",
          stepNumber,
          stepType
        );
      }
      previousStepOutput = prevStep.output as Record<string, unknown>;
    }

    const input: StepInput = {
      executionId,
      briefing: execution.briefing as ParsedBriefing,
      previousStepOutput,
    };

    // Dispatch to step from registry (4.2)
    const stepInstance = this.getStepInstance(stepNumber, stepType, tenantId);

    try {
      return await stepInstance.run(input);
    } catch (error) {
      const pipelineError = isPipelineError(error)
        ? error
        : this.createPipelineError(
            "STEP_EXECUTION_ERROR",
            error instanceof Error ? error.message : "Erro desconhecido",
            stepNumber,
            stepType
          );

      // 4.7 - NEVER 'failed' directly, always 'paused'
      await this.updateExecutionStatus(executionId, "paused");
      await this.sendErrorMessage(executionId, pipelineError);

      throw pipelineError;
    }
  }

  /**
   * Get execution with steps.
   * (4.5)
   */
  async getExecution(executionId: string): Promise<AgentExecution | null> {
    const { data } = await this.supabase
      .from("agent_executions")
      .select("*")
      .eq("id", executionId)
      .single();

    return (data as AgentExecution) ?? null;
  }

  /**
   * Get step instance from registry.
   * search_companies is implemented, others throw 'not implemented'.
   * (4.2)
   */
  private getStepInstance(stepNumber: number, stepType: StepType, tenantId: string) {
    switch (stepType) {
      case "search_companies":
        return new SearchCompaniesStep(stepNumber, this.supabase, this.apiKey);
      case "search_leads":
        return new SearchLeadsStep(stepNumber, this.supabase, tenantId);
      case "create_campaign":
      case "export":
      case "activate":
        throw this.createPipelineError(
          "ORCHESTRATOR_STEP_NOT_READY",
          `Step '${stepType}' ainda nao implementado`,
          stepNumber,
          stepType
        );
      default:
        throw this.createPipelineError(
          "ORCHESTRATOR_INVALID_STEP",
          `Step '${stepType}' nao existe no registry`,
          stepNumber,
          stepType
        );
    }
  }

  /**
   * Update execution status.
   */
  private async updateExecutionStatus(
    executionId: string,
    status: string
  ): Promise<void> {
    await this.supabase
      .from("agent_executions")
      .update({ status })
      .eq("id", executionId);
  }

  /**
   * Send error message to agent_messages in PT-BR.
   * (4.6)
   */
  private async sendErrorMessage(
    executionId: string,
    error: PipelineError
  ): Promise<void> {
    const stepLabel = STEP_LABELS[error.stepType] ?? error.stepType;
    const servicePart = error.externalService
      ? ` (servico: ${error.externalService})`
      : "";
    const retryPart = error.isRetryable
      ? " Voce pode tentar novamente."
      : " Entre em contato com o suporte.";

    const content = `Erro na etapa "${stepLabel}"${servicePart}: ${error.message}.${retryPart}`;

    await this.supabase.from("agent_messages").insert({
      execution_id: executionId,
      role: "system",
      content,
      metadata: {
        stepNumber: error.stepNumber,
        messageType: "error",
        error: {
          code: error.code,
          isRetryable: error.isRetryable,
          externalService: error.externalService,
        },
      },
    });
  }

  /**
   * Create a PipelineError object.
   */
  private createPipelineError(
    code: string,
    message: string,
    stepNumber: number,
    stepType: StepType
  ): PipelineError {
    return {
      code,
      message,
      stepNumber,
      stepType,
      isRetryable: false,
    };
  }
}
