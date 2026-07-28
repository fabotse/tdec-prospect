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

      if (input.mode === "guided" && this.requiresPostApproval()) {
        await this.saveAwaitingApproval(db, input.executionId, result);
        await this.sendApprovalGateMessage(db, input.executionId, result);
      } else {
        await this.saveCheckpoint(db, input.executionId, result);
      }

      // Story 22.17 (code review): o `logStep` e a escrita MENOS critica do step — puro
      // registro do que JA aconteceu. Fora da guarda, uma falha nele caia no `catch` abaixo,
      // que chama `saveFailure`: o step recem-gravado como `completed` virava `failed`, o
      // `output` real (`activated: true`, `externalCampaignId`) era substituido por
      // `{ error }`, e o orchestrator escrevia `paused` — com a campanha JA ativa no
      // Instantly. E a mesma regra ja adotada para o `sendSummaryMessage`, uma camada antes.
      // Vale para os 5 steps: nenhum deve ser declarado falho por causa de uma linha de log.
      try {
        await this.logStep(db, input.executionId, input, result);
      } catch (logError) {
        console.error(
          `[BaseStep] Falha ao registrar a conclusao do step ${this.stepNumber} (${this.stepType}, execution=${input.executionId}); o status ja gravado permanece:`,
          logError instanceof Error ? logError.message : logError
        );
      }

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
   * Story 22.17 (AC2): o step guiado precisa de uma aprovacao DEPOIS de executar?
   *
   * Default `true` — o modo guiado existe justamente para o usuario revisar o
   * resultado de cada etapa antes de seguir.
   *
   * O `activate` sobrescreve para `false`: ali a aprovacao e EX-ANTE (o usuario ja
   * clicou "Ativar Campanha" no gate do export, com `approvedData.activate: true`).
   * Pedir um segundo approve depois de a campanha JA estar ativa no Instantly era
   * teatro — e sem UI para esse gate, prendia a execucao em `running` para sempre.
   *
   * Publico de proposito: o orchestrator consulta este contrato para decidir se o
   * ultimo step guiado fecha a execucao.
   */
  requiresPostApproval(): boolean {
    return true;
  }

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
   * Story 22.14 (AC1): o step voltou sem nenhum resultado?
   *
   * O flag vive no `output` do proprio step (JSONB — zero migration, NFR5) e e escrito
   * pelos steps de busca quando a lista volta vazia. As duas mensagens que a BaseStep
   * emite (gate e log) mentiam nesse caso: "concluida, revise e aprove" e "concluido com
   * sucesso" com zero itens na mao.
   */
  private static isEmptyResult(result: StepOutput): boolean {
    return result.data?.emptyResult === true;
  }

  /**
   * Send approval gate message with preview data for frontend rendering.
   * Story 17.5 - Task 1.1
   * Story 22.14 - AC #1: texto honesto quando a busca voltou vazia.
   */
  private async sendApprovalGateMessage(
    db: SupabaseClient,
    executionId: string,
    result: StepOutput
  ): Promise<void> {
    const previewData = this.buildPreviewData(result);
    const stepLabel = STEP_LABELS[this.stepType];

    // Pedir "revise os resultados e aprove" diante de uma tabela vazia (com o proprio
    // botao Aprovar desabilitado) era o beco sem saida que esta story fecha.
    const content = BaseStep.isEmptyResult(result)
      ? `A etapa "${stepLabel}" nao encontrou nenhum resultado com esses filtros. Veja o diagnostico abaixo e ajuste a busca.`
      : `Etapa "${stepLabel}" concluida. Revise os resultados e aprove para continuar.`;

    await db.from("agent_messages").insert({
      execution_id: executionId,
      role: "agent",
      content,
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

    if (status !== "running") {
      await db
        .from("agent_steps")
        .update(updateData)
        .eq("execution_id", executionId)
        .eq("step_number", this.stepNumber);
      return;
    }

    updateData.started_at = new Date().toISOString();

    // Story 22.18 (code review, D2): CAS na entrada em `running` — o unico lock que
    // este pipeline tem.
    //
    // A retomada da AC2 tornou alcancavel um segundo `POST .../execute` sobre um step
    // que AINDA esta rodando: o 409 do approve so informa o status do step do GATE (N),
    // nao o do step disparado (N+1), e nem a rota de execute nem o orchestrator olham o
    // status do alvo. As duas guardas da AC4 erram essa janela — o `output` com
    // `activated: true` so e gravado na conclusao, e o pre-flight ainda le `Draft`.
    // Resultado sem esta guarda: dois `POST /activate` concorrentes num endpoint que e
    // "activate (start), **or resume**".
    //
    // `.neq("status", "running")` faz a transicao ser a propria disputa: quem escreve
    // primeiro roda, o segundo nao encontra linha e desiste ANTES de qualquer chamada
    // externa. Mesmo padrao CAS dos `.neq("status","cancelled")` da 22.10.
    //
    // TRADE-OFF ACEITO (decisao do Fabossi na code review): um step deixado `running`
    // por uma funcao que morreu no meio nao pode ser redisparado sem intervencao manual
    // no banco. Preferimos travar um retry raro a reenviar e-mail para leads que ja
    // receberam a sequencia.
    const { data: claimed } = await db
      .from("agent_steps")
      .update(updateData)
      .eq("execution_id", executionId)
      .eq("step_number", this.stepNumber)
      .neq("status", "running")
      .select("step_number");

    // `null` = o mock/driver nao devolveu linhas (nao sabemos) -> fail-open, mantem o
    // comportamento de hoje. Array VAZIO = sabemos que ninguem foi atualizado, ou seja,
    // a linha ja estava `running`: outro executor tem a posse.
    if (Array.isArray(claimed) && claimed.length === 0) {
      const alreadyRunning: PipelineError = {
        code: "STEP_ALREADY_RUNNING",
        message:
          "Esta etapa ja esta em execucao. Aguarde ela terminar antes de tentar de novo.",
        stepNumber: this.stepNumber,
        stepType: this.stepType,
        isRetryable: false,
      };
      throw alreadyRunning;
    }
  }

  /**
   * Log step execution as agent_message with metadata.
   * (2.7)
   * Story 22.14 - AC #1: 0 resultados nao e "sucesso".
   */
  private async logStep(
    db: SupabaseClient,
    executionId: string,
    input: StepInput,
    output: StepOutput
  ): Promise<void> {
    const content = BaseStep.isEmptyResult(output)
      ? `Step ${this.stepNumber} (${this.stepType}) nao encontrou resultados`
      : `Step ${this.stepNumber} (${this.stepType}) concluido com sucesso`;

    await db.from("agent_messages").insert({
      execution_id: executionId,
      role: "system",
      content,
      metadata: {
        stepNumber: this.stepNumber,
        // Story 22.17 (AC3): esta mensagem RELATA o fim do step — nao e progresso.
        // Como "progress", a bolha exibia "Processando..." + spinner eterno em cima
        // de um texto que dizia "concluido com sucesso".
        messageType: "step_complete",
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
