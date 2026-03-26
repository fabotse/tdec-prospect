/**
 * BaseStep - Abstract base class for pipeline steps
 * Story 17.1 - AC: #4
 *
 * Template method pattern: run() orchestrates the step lifecycle.
 * Subclasses implement executeInternal() with step-specific logic.
 */

import type {
  StepInput,
  StepOutput,
  PipelineError,
  StepType,
  StepStatus,
} from "@/types/agent";
import { STEP_LABELS } from "@/types/agent";
import { ExternalServiceError } from "@/lib/services/base-service";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// CONSTANTS
// ==============================================

const RETRYABLE_STATUS_CODES = new Set([0, 408, 429, 502, 503, 504]);
const RETRY_DELAYS = [0, 2000, 5000];
const MAX_RETRIES = 3;

// ==============================================
// BASE STEP
// ==============================================

export abstract class BaseStep {
  constructor(
    protected readonly stepNumber: number,
    protected readonly stepType: StepType,
    protected readonly supabase: SupabaseClient
  ) {}

  /**
   * Template method: orchestrates step execution lifecycle.
   * updateStepStatus('running') -> executeInternal() -> saveCheckpoint() -> logStep()
   * On error: toPipelineError() -> saveFailure() -> throw
   * (2.1, 2.2)
   */
  async run(input: StepInput): Promise<StepOutput> {
    const db = this.supabase;

    await this.updateStepStatus(db, input.executionId, "running");

    try {
      const result = await this.executeInternal(input);

      if (input.mode === "guided") {
        await this.saveAwaitingApproval(db, input.executionId, result);
        await this.sendApprovalGateMessage(db, input.executionId, result);
      } else {
        await this.saveCheckpoint(db, input.executionId, result);
      }

      await this.logStep(db, input.executionId, input, result);

      return result;
    } catch (error) {
      const pipelineError = this.toPipelineError(error);
      await this.saveFailure(db, input.executionId, pipelineError);
      throw pipelineError;
    }
  }

  /**
   * Step-specific execution logic. Implemented by subclasses.
   * (2.1)
   */
  protected abstract executeInternal(input: StepInput): Promise<StepOutput>;

  /**
   * Convert any error to PipelineError.
   * ExternalServiceError -> preserves serviceName and retryability.
   * Generic Error -> non-retryable with STEP_EXECUTION_ERROR code.
   * (2.3)
   */
  protected toPipelineError(error: unknown): PipelineError {
    if (error instanceof ExternalServiceError) {
      const stepCode = `STEP_${this.stepType.toUpperCase()}_ERROR`;
      return {
        code: stepCode,
        message: error.userMessage,
        stepNumber: this.stepNumber,
        stepType: this.stepType,
        isRetryable: BaseStep.isRetryableStatus(error.statusCode),
        externalService: error.serviceName,
      };
    }

    const message = error instanceof Error ? error.message : "Erro desconhecido";

    return {
      code: "STEP_EXECUTION_ERROR",
      message,
      stepNumber: this.stepNumber,
      stepType: this.stepType,
      isRetryable: false,
      externalService: undefined,
    };
  }

  /**
   * Save step in awaiting_approval state (guided mode).
   * Similar to saveCheckpoint but without completed_at.
   * Story 17.5 - Task 1.2
   */
  private async saveAwaitingApproval(
    db: SupabaseClient,
    executionId: string,
    result: StepOutput
  ): Promise<void> {
    await db
      .from("agent_steps")
      .update({
        output: result.data,
        status: "awaiting_approval" as StepStatus,
        cost: result.cost ?? null,
      })
      .eq("execution_id", executionId)
      .eq("step_number", this.stepNumber);
  }

  /**
   * Send approval gate message with preview data for frontend rendering.
   * Story 17.5 - Task 1.1
   */
  private async sendApprovalGateMessage(
    db: SupabaseClient,
    executionId: string,
    result: StepOutput
  ): Promise<void> {
    const previewData = this.buildPreviewData(result);
    const stepLabel = STEP_LABELS[this.stepType];

    await db.from("agent_messages").insert({
      execution_id: executionId,
      role: "agent",
      content: `Etapa "${stepLabel}" concluida. Revise os resultados e aprove para continuar.`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "approval_gate",
        approvalData: {
          stepType: this.stepType,
          previewData,
        },
      },
    });
  }

  /**
   * Build preview data for approval gate message.
   * Subclasses can override to send minimal preview instead of full data.
   * Story 17.5 - Task 1.1
   */
  protected buildPreviewData(result: StepOutput): unknown {
    return result.data;
  }

  /**
   * Save successful checkpoint: output + status='completed' + completed_at.
   * (2.4)
   */
  private async saveCheckpoint(
    db: SupabaseClient,
    executionId: string,
    result: StepOutput
  ): Promise<void> {
    await db
      .from("agent_steps")
      .update({
        output: result.data,
        status: "completed" as StepStatus,
        completed_at: new Date().toISOString(),
        cost: result.cost ?? null,
      })
      .eq("execution_id", executionId)
      .eq("step_number", this.stepNumber);
  }

  /**
   * Save failure: status='failed' + error_message + partial output.
   * (2.5)
   */
  private async saveFailure(
    db: SupabaseClient,
    executionId: string,
    pipelineError: PipelineError
  ): Promise<void> {
    await db
      .from("agent_steps")
      .update({
        status: "failed" as StepStatus,
        error_message: pipelineError.message,
        output: { error: pipelineError },
      })
      .eq("execution_id", executionId)
      .eq("step_number", this.stepNumber);
  }

  /**
   * Update step status and timestamps.
   * (2.6)
   */
  private async updateStepStatus(
    db: SupabaseClient,
    executionId: string,
    status: StepStatus
  ): Promise<void> {
    const updateData: Record<string, unknown> = { status };

    if (status === "running") {
      updateData.started_at = new Date().toISOString();
    }

    await db
      .from("agent_steps")
      .update(updateData)
      .eq("execution_id", executionId)
      .eq("step_number", this.stepNumber);
  }

  /**
   * Log step execution as agent_message with metadata.
   * (2.7)
   */
  private async logStep(
    db: SupabaseClient,
    executionId: string,
    input: StepInput,
    output: StepOutput
  ): Promise<void> {
    await db.from("agent_messages").insert({
      execution_id: executionId,
      role: "system",
      content: `Step ${this.stepNumber} (${this.stepType}) concluido com sucesso`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "progress",
        input: { briefing: input.briefing },
        output: output.data,
      },
    });
  }

  /**
   * Retry step with exponential backoff [0, 2000, 5000]ms, max 3 attempts.
   * (2.8)
   */
  async retryStep(input: StepInput): Promise<StepOutput> {
    let lastError: PipelineError | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const delay = RETRY_DELAYS[attempt] ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        return await this.run(input);
      } catch (error) {
        lastError = error as PipelineError;
        if (!lastError.isRetryable) throw lastError;
      }
    }

    throw lastError;
  }

  /**
   * Check if HTTP status code is retryable.
   * Retryable: [0, 408, 429, 502, 503, 504]
   * (2.9)
   */
  static isRetryableStatus(statusCode: number): boolean {
    return RETRYABLE_STATUS_CODES.has(statusCode);
  }
}
