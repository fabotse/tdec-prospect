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
import { CreateCampaignStep } from "./steps/create-campaign-step";
import { ExportStep } from "./steps/export-step";
import { ActivateStep } from "./steps/activate-step";
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
   * Check if a step should be skipped based on briefing.skipSteps.
   * (Story 17.7 - AC #3)
   */
  shouldSkip(stepType: StepType, briefing: ParsedBriefing): boolean {
    if (!briefing.skipSteps || briefing.skipSteps.length === 0) return false;
    return briefing.skipSteps.includes(stepType);
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

    // Build step input with previousStepOutput (Story 17.2 - 3.3, Story 17.7 - skip-aware)
    let previousStepOutput: Record<string, unknown> | undefined;
    if (stepNumber > 1) {
      // Story 17.7: Find last non-skipped step (may not be stepNumber-1 if previous was skipped)
      const { data: prevStep } = await this.supabase
        .from("agent_steps")
        .select("output, status")
        .eq("execution_id", executionId)
        .lt("step_number", stepNumber)
        .in("status", ["completed", "approved"])
        .order("step_number", { ascending: false })
        .limit(1)
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

      // Story 17.5 - Task 5.2: Use approvedLeads when user filtered leads
      if (previousStepOutput?.approvedLeads) {
        previousStepOutput.leads = previousStepOutput.approvedLeads;
        previousStepOutput.totalFound = (previousStepOutput.approvedLeads as unknown[]).length;
      }
    }

    const executionData = execution as AgentExecution;

    // Story 17.7 Task 1.2: Generic skip based on briefing.skipSteps
    if (this.shouldSkip(stepType, executionData.briefing)) {
      try {
        const { error: skipError } = await this.supabase
          .from("agent_steps")
          .update({
            status: "skipped",
            output: { skipped: true, reason: "briefing_skip" },
            completed_at: new Date().toISOString(),
          })
          .eq("execution_id", executionId)
          .eq("step_number", stepNumber);

        if (skipError) {
          throw this.createPipelineError(
            "ORCHESTRATOR_SKIP_FAILED",
            "Erro ao marcar step como skipped",
            stepNumber,
            stepType
          );
        }

        const stepLabel = STEP_LABELS[stepType] ?? stepType;
        await this.supabase.from("agent_messages").insert({
          execution_id: executionId,
          role: "agent",
          content: `Etapa "${stepLabel}" pulada — nao aplicavel conforme briefing.`,
          metadata: {
            stepNumber,
            messageType: "skip",
          },
        });

        return { success: true, data: { skipped: true, reason: "briefing_skip" } };
      } catch (error) {
        const pipelineError = isPipelineError(error)
          ? error
          : this.createPipelineError(
              "ORCHESTRATOR_SKIP_FAILED",
              error instanceof Error ? error.message : "Erro ao skipar step",
              stepNumber,
              stepType
            );
        await this.updateExecutionStatus(executionId, "paused");
        await this.sendErrorMessage(executionId, pipelineError);
        throw pipelineError;
      }
    }

    const input: StepInput = {
      executionId,
      briefing: executionData.briefing,
      previousStepOutput,
      mode: executionData.mode,
    };

    // Story 17.6 Task 9: Skip activate step if activation deferred
    if (stepType === "activate" && previousStepOutput?.activationDeferred === true) {
      try {
        const { error: skipError } = await this.supabase
          .from("agent_steps")
          .update({
            status: "skipped",
            output: { skipped: true, reason: "activation_deferred" },
            completed_at: new Date().toISOString(),
          })
          .eq("execution_id", executionId)
          .eq("step_number", stepNumber);

        if (skipError) {
          throw this.createPipelineError(
            "ORCHESTRATOR_SKIP_FAILED",
            "Erro ao marcar step como skipped",
            stepNumber,
            stepType
          );
        }

        // Complete execution with deferred note
        const { error: completionError } = await this.supabase
          .from("agent_executions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            result_summary: { activationDeferred: true },
          })
          .eq("id", executionId);

        if (completionError) {
          throw this.createPipelineError(
            "ORCHESTRATOR_COMPLETION_FAILED",
            "Erro ao completar execucao apos skip",
            stepNumber,
            stepType
          );
        }

        const campaignName = (previousStepOutput.campaignName as string) ?? "campanha";
        await this.supabase.from("agent_messages").insert({
          execution_id: executionId,
          role: "agent",
          content: `Campanha "${campaignName}" exportada no Instantly. Ativacao adiada — ative manualmente quando desejar.`,
          metadata: {
            stepNumber,
            messageType: "summary",
          },
        });

        return { success: true, data: { skipped: true, reason: "activation_deferred" } };
      } catch (error) {
        const pipelineError = isPipelineError(error)
          ? error
          : this.createPipelineError(
              "ORCHESTRATOR_SKIP_FAILED",
              error instanceof Error ? error.message : "Erro ao skipar ativacao",
              stepNumber,
              stepType
            );
        await this.updateExecutionStatus(executionId, "paused");
        await this.sendErrorMessage(executionId, pipelineError);
        throw pipelineError;
      }
    }

    // Dispatch to step from registry (4.2)
    const stepInstance = this.getStepInstance(stepNumber, stepType, tenantId);

    try {
      const result = await stepInstance.run(input);

      // 4.3 - Mark execution as 'completed' when last step succeeds
      // In guided mode, step ends as 'awaiting_approval' — don't mark execution completed yet.
      // Execution completion in guided mode happens after the user approves the last step.
      const totalSteps = executionData.total_steps;
      if (stepNumber === totalSteps && executionData.mode !== "guided") {
        await this.supabase
          .from("agent_executions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", executionId);

        // Story 17.7 - AC #2: Summary message in autopilot mode
        await this.sendSummaryMessage(executionId, totalSteps);
      }

      return result;
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
        return new CreateCampaignStep(stepNumber, this.supabase, tenantId);
      case "export":
        return new ExportStep(stepNumber, this.supabase, tenantId);
      case "activate":
        return new ActivateStep(stepNumber, this.supabase, tenantId);
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
   * Send autopilot summary message with consolidated results from all steps.
   * (Story 17.7 - AC #2)
   */
  private async sendSummaryMessage(
    executionId: string,
    totalSteps: number
  ): Promise<void> {
    // Fetch all steps with outputs
    const { data: allSteps } = await this.supabase
      .from("agent_steps")
      .select("step_number, step_type, status, output")
      .eq("execution_id", executionId)
      .order("step_number", { ascending: true });

    if (!allSteps) return;

    const lines: string[] = ["Pipeline concluido com sucesso!", "", "Resumo:"];

    for (const step of allSteps) {
      const output = step.output as Record<string, unknown> | null;
      const stepType = step.step_type as string;

      if (step.status === "skipped") {
        const label = STEP_LABELS[stepType as StepType] ?? stepType;
        lines.push(`• ${label}: Etapa pulada — nao aplicavel`);
        continue;
      }

      switch (stepType) {
        case "search_companies":
          lines.push(`• Empresas: ${output?.totalFound ?? 0} encontradas via TheirStack`);
          break;
        case "search_leads":
          lines.push(`• Leads: ${output?.totalFound ?? 0} contatos encontrados via Apollo`);
          break;
        case "create_campaign":
          lines.push(
            `• Campanha: "${output?.campaignName ?? "—"}" criada com ${output?.structure && typeof output.structure === "object" && "totalEmails" in (output.structure as Record<string, unknown>) ? (output.structure as Record<string, unknown>).totalEmails : 0} emails na sequencia`
          );
          break;
        case "export":
          lines.push(
            `• Export: Campanha exportada para Instantly com ${output?.leadsUploaded ?? 0} leads`
          );
          break;
        case "activate":
          lines.push(
            output?.activated
              ? `• Ativacao: Campanha ativada`
              : `• Ativacao: Etapa pulada — nao aplicavel`
          );
          break;
      }
    }

    await this.supabase.from("agent_messages").insert({
      execution_id: executionId,
      role: "agent",
      content: lines.join("\n"),
      metadata: {
        stepNumber: totalSteps,
        messageType: "summary",
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
