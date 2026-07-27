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
import { InstantlyService } from "@/lib/services/instantly";
import { PlanGeneratorService } from "@/lib/services/agent-plan-generator";
import { getServiceApiKey } from "./steps/step-utils";
import { stampLatestApprovalGate } from "@/lib/agent/gate-metadata";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// PIPELINE ERROR TYPE GUARD
// ==============================================

/**
 * Story 22.17 (code review): plural PT-BR do resumo final.
 *
 * A AC4 matou o "com 1 leads" do activate, mas a AC2 fez o `sendSummaryMessage` aparecer no
 * modo guiado pela PRIMEIRA vez — e ele carregava os mesmos plurais cravados, uma bolha
 * abaixo da string corrigida. No cenario do smoke (1 lead) o usuario lia
 * "ativa no Instantly com 1 lead" seguido de "exportada para Instantly com 1 leads".
 */
function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Coerce a JSONB field to a safe non-NaN count. */
function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
        // Story 17.10: Check if all previous steps are skipped (direct entry flow)
        const { data: prevSteps } = await this.supabase
          .from("agent_steps")
          .select("status")
          .eq("execution_id", executionId)
          .lt("step_number", stepNumber);

        const allSkipped = prevSteps != null && prevSteps.length > 0 && prevSteps.every((s) => s.status === "skipped");
        if (!allSkipped) {
          throw this.createPipelineError(
            "ORCHESTRATOR_STEP_NOT_READY",
            "Step anterior nao concluido",
            stepNumber,
            stepType
          );
        }
        // All previous skipped — previousStepOutput stays undefined
      } else {
        previousStepOutput = prevStep.output as Record<string, unknown>;

        // Story 17.5 - Task 5.2: Use approvedLeads when user filtered leads
        if (previousStepOutput?.approvedLeads) {
          previousStepOutput.leads = previousStepOutput.approvedLeads;
          previousStepOutput.totalFound = (previousStepOutput.approvedLeads as unknown[]).length;
        }
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
        // Story 17.9: Add selected accounts to campaign even when deferring activation.
        // Without this, campaign stays in Instantly with zero sending accounts.
        //
        // Story 22.12 (AC3): o attach e ACESSORIO — adiar a ativacao e a intencao
        // PRIMARIA do usuario. Isolamos o attach num try/catch proprio: se ele falhar
        // por QUALQUER motivo, a etapa NAO falha (nada de 'paused' sem saida). O skip
        // conclui, a execucao completa com activationDeferred, e sinalizamos
        // accountsAttachFailed para o resumo avisar que as contas nao foram anexadas.
        let accountsAttachFailed = false;
        const selectedAccounts = previousStepOutput.selectedAccounts as string[] | undefined;
        if (selectedAccounts && selectedAccounts.length > 0 && previousStepOutput.externalCampaignId) {
          try {
            const apiKey = await getServiceApiKey(tenantId, "instantly");
            const service = new InstantlyService();
            await service.addAccountsToCampaign({
              apiKey,
              campaignId: previousStepOutput.externalCampaignId as string,
              accountEmails: selectedAccounts,
            });
          } catch (attachError) {
            accountsAttachFailed = true;
            console.error(
              `[Orchestrator] Falha ao anexar contas de envio no defer (execution=${executionId}, campaign=${previousStepOutput.externalCampaignId}):`,
              attachError instanceof Error ? attachError.message : attachError
            );
          }
        } else if (selectedAccounts && selectedAccounts.length > 0) {
          // Story 22.12 (review): contas selecionadas mas SEM externalCampaignId — nao
          // ha como anexar. Trata como falha de attach para o resumo avisar (mesma
          // intencao da AC3: "por QUALQUER motivo"), em vez de reportar sucesso silencioso.
          accountsAttachFailed = true;
          console.error(
            `[Orchestrator] Contas selecionadas no defer mas sem externalCampaignId (execution=${executionId}); attach ignorado.`
          );
        }

        // Flag so incluida quando true — preserva o caminho de sucesso byte-a-byte.
        const attachFlag = accountsAttachFailed ? { accountsAttachFailed: true } : {};

        const { error: skipError } = await this.supabase
          .from("agent_steps")
          .update({
            status: "skipped",
            output: { skipped: true, reason: "activation_deferred", ...attachFlag },
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
        // Story 22.10 (code review): CAS — nao ressuscitar um cancel concorrente.
        const { error: completionError } = await this.supabase
          .from("agent_executions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            result_summary: { activationDeferred: true, ...attachFlag },
          })
          .eq("id", executionId)
          .neq("status", "cancelled");

        if (completionError) {
          throw this.createPipelineError(
            "ORCHESTRATOR_COMPLETION_FAILED",
            "Erro ao completar execucao apos skip",
            stepNumber,
            stepType
          );
        }

        const campaignName = (previousStepOutput.campaignName as string) ?? "campanha";
        const summaryContent = accountsAttachFailed
          ? `Campanha "${campaignName}" exportada no Instantly, mas nao consegui anexar as contas de envio — anexe-as manualmente no Instantly antes de ativar. Ativacao adiada.`
          : `Campanha "${campaignName}" exportada no Instantly. Ativacao adiada — ative manualmente quando desejar.`;
        await this.supabase.from("agent_messages").insert({
          execution_id: executionId,
          role: "agent",
          content: summaryContent,
          metadata: {
            stepNumber,
            messageType: "summary",
          },
        });

        // Story 22.18 (code review, D1): carimbo DURAVEL de "adiada" — SO AQUI.
        //
        // A AC3 mandava carimbar isto no `approve`, sob o argumento de que "ali o approve
        // E a acao completa". Isso e factualmente falso: o trabalho do defer (attach de
        // contas, skip do step e conclusao da execucao) e tudo o que esta ACIMA, e roda no
        // `execute` — o approve retorna antes. Carimbado la, um `execute` que falhasse
        // deixava o card desabilitado sobre um step ainda `pending`, com a execucao nunca
        // concluida e a retomada da AC2 inalcancavel: exatamente o defeito que a AC1
        // existe para matar, so que no botao "Ativar Depois".
        //
        // Aqui o carimbo so acontece depois de a execucao ter sido escrita como
        // `completed` e o resumo enviado — ou seja, quando "adiada" e verdade.
        // Fail-open: auditoria nao derruba um defer bem-sucedido.
        await stampLatestApprovalGate(
          this.supabase,
          executionId,
          { activationOutcome: "deferred" },
          // Filtro por TIPO, nao por `stepNumber - 1`: o gate vive no step do export, que
          // nem sempre e o numero imediatamente anterior (steps podem ter sido pulados).
          // Mesmo filtro que o ActivateStep usa no carimbo "activated".
          { stepType: "export" as StepType }
        );

        return { success: true, data: { skipped: true, reason: "activation_deferred", ...attachFlag } };
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
        // Story 22.18 (code review, P2): bolha escrita — o gate nao deve duplicar.
        throw { ...pipelineError, reportedInChat: true } as PipelineError;
      }
    }

    // Dispatch to step from registry (4.2)
    const stepInstance = this.getStepInstance(stepNumber, stepType, tenantId);

    try {
      const result = await stepInstance.run(input);

      // 4.3 - Mark execution as 'completed' when last step succeeds
      //
      // Story 22.17 (AC2): a regra antiga era `mode !== "guided"` — e o comentario
      // prometia que o guided completaria "apos o usuario aprovar o ultimo step".
      // Essa aprovacao nunca existiu na UI: a execucao guiada com ativacao REAL ficava
      // `running` para sempre, exatamente no momento de maior sucesso.
      //
      // A regra correta olha o CONTRATO do step: se o ultimo step guiado nao exige
      // post-approval (o `activate`, cuja aprovacao e ex-ante no gate de ativacao),
      // ele ja concluiu — a execucao fecha e o resumo final vai para o chat, igual ao
      // autopilot. Steps guiados que exigem post-approval seguem esperando o usuario.
      const totalSteps = executionData.total_steps;
      const guidedStepStillNeedsApproval =
        executionData.mode === "guided" && stepInstance.requiresPostApproval();

      if (stepNumber === totalSteps && !guidedStepStillNeedsApproval) {
        // Story 22.10 (code review): CAS — nao sobrescrever um cancel concorrente ("Nova
        // conversa") com 'completed'. `.neq("status","cancelled")` deixa o cancel prevalecer.
        //
        // Story 22.17 (code review): o `error` PRECISA ser checado. O supabase-js NAO lanca
        // em erro de query — devolve `{ error }` — entao, sem esta guarda, uma falha de
        // escrita passava batida e o "Pipeline concluido com sucesso!" ia para o chat de uma
        // execucao que continuou `running`. O irmao do ramo defer (:295) ja fazia isso.
        const { error: completionError } = await this.supabase
          .from("agent_executions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", executionId)
          .neq("status", "cancelled");

        if (completionError) {
          throw this.createPipelineError(
            "ORCHESTRATOR_COMPLETION_FAILED",
            "Erro ao completar execucao",
            stepNumber,
            stepType
          );
        }

        // Story 17.7 - AC #2: Summary message in autopilot mode
        //
        // Story 22.17 (AC2): o resumo e a ULTIMA coisa e a menos critica. Sem a guarda,
        // uma falha aqui subia para o catch de executeStep, que escreve `paused` por
        // cima do `completed` que acabamos de gravar — recriando exatamente a execucao
        // pendurada que esta story fecha, com a campanha ja ativa no Instantly.
        try {
          await this.sendSummaryMessage(executionId, totalSteps);
        } catch (summaryError) {
          console.error(
            `[Orchestrator] Falha ao enviar o resumo final (execution=${executionId}); a execucao permanece completed:`,
            summaryError instanceof Error ? summaryError.message : summaryError
          );
        }
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

      // Story 22.18 (code review, D2): o CAS de posse do step nao e uma falha DESTA
      // execucao — e a segunda chamada descobrindo que perdeu a corrida. O executor que
      // venceu segue rodando normalmente; pausar a execucao e escrever uma bolha de erro
      // aqui sabotaria justamente quem esta trabalhando. Devolvemos o erro para a rota
      // (que responde 409) sem tocar em nada.
      if (pipelineError.code === "STEP_ALREADY_RUNNING") {
        throw pipelineError;
      }

      // 4.7 - NEVER 'failed' directly, always 'paused'
      await this.updateExecutionStatus(executionId, "paused");
      await this.sendErrorMessage(executionId, pipelineError);

      // Story 22.18 (code review, P2): so DEPOIS de a bolha existir. O cliente le este
      // flag em vez de inferir "ja reportado" da presenca de `stepType` — que tambem
      // vem nos erros lancados fora deste catch, onde bolha nenhuma foi escrita.
      throw { ...pipelineError, reportedInChat: true } as PipelineError;
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
    // Story 22.10 (code review): CAS. Este metodo escreve 'paused' nos caminhos de erro;
    // sem a guarda, um step que falha DEPOIS de um cancel concorrente escreveria 'paused'
    // por cima de 'cancelled' — e 'paused' reataca ({running,paused}), recriando a fantasma
    // que a story combate. `.neq("status","cancelled")` mantem o cancel terminal.
    await this.supabase
      .from("agent_executions")
      .update({ status })
      .eq("id", executionId)
      .neq("status", "cancelled");
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

    // Story 22.12 (AC5): coerencia mensagem <-> flag. Um erro NAO-retryable nao pode
    // exibir "Tente novamente" embutido (ex.: o INTERNAL_ERROR generico do base-service
    // carrega esse texto) — contradiz o retryPart "Entre em contato com o suporte.".
    // Sanitizamos so no caso nao-retryable; retryable mantem a mensagem original.
    // Removemos tambem a pontuacao terminal residual para o template nao gerar ".."
    // e caimos num fallback se a sanitizacao esvaziar a mensagem.
    const displayMessage = error.isRetryable
      ? error.message.replace(/[.!?]+$/, "")
      : error.message
          .replace(/\s*tente novamente\.?/gi, "")
          .replace(/[.!?]+$/, "")
          .trim() || "Erro ao processar a etapa";

    const content = `Erro na etapa "${stepLabel}"${servicePart}: ${displayMessage}.${retryPart}`;

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
    //
    // Story 22.17 (code review): checar o `error` aqui e no insert abaixo. O supabase-js NAO
    // lanca em erro de query, entao o caminho MAIS provavel de "o resumo sumiu do chat"
    // (erro/RLS no select, insert que falha) retornava em silencio — sem log, sem bolha — e o
    // try/catch do chamador nunca via nada. Um array VAZIO tambem e tratado aqui: ele passava
    // pelo `!allSteps` e gerava um resumo degenerado ("Pipeline concluido com sucesso!" sem
    // nenhuma linha embaixo).
    const { data: allSteps, error: stepsError } = await this.supabase
      .from("agent_steps")
      .select("step_number, step_type, status, output")
      .eq("execution_id", executionId)
      .order("step_number", { ascending: true });

    if (stepsError || !allSteps || allSteps.length === 0) {
      console.error(
        `[Orchestrator] Nao consegui montar o resumo final (execution=${executionId}); a execucao permanece completed:`,
        stepsError?.message ?? "nenhum step retornado"
      );
      return;
    }

    const lines: string[] = ["Pipeline concluido com sucesso!", "", "Resumo:"];

    for (const step of allSteps) {
      const output = step.output as Record<string, unknown> | null;
      const stepType = step.step_type as string;

      if (step.status === "skipped") {
        const label = STEP_LABELS[stepType as StepType] ?? stepType;
        lines.push(`• ${label}: Etapa pulada — nao aplicavel`);
        continue;
      }

      // Story 22.17 (code review): plurais via `pluralize` — ver AC4.
      switch (stepType) {
        case "search_companies":
          lines.push(
            `• Empresas: ${pluralize(toCount(output?.totalFound), "encontrada", "encontradas")} via TheirStack`
          );
          break;
        case "search_leads":
          lines.push(
            `• Leads: ${pluralize(toCount(output?.totalFound), "contato encontrado", "contatos encontrados")} via Apollo`
          );
          break;
        case "create_campaign": {
          const structure = output?.structure as Record<string, unknown> | undefined;
          lines.push(
            `• Campanha: "${output?.campaignName ?? "—"}" criada com ${pluralize(toCount(structure?.totalEmails), "email", "emails")} na sequencia`
          );
          break;
        }
        case "export":
          lines.push(
            `• Export: Campanha exportada para Instantly com ${pluralize(toCount(output?.leadsUploaded), "lead", "leads")}`
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

    const { error: insertError } = await this.supabase.from("agent_messages").insert({
      execution_id: executionId,
      role: "agent",
      content: lines.join("\n"),
      metadata: {
        stepNumber: totalSteps,
        messageType: "summary",
      },
    });

    if (insertError) {
      console.error(
        `[Orchestrator] Falha ao gravar o resumo final (execution=${executionId}); a execucao permanece completed:`,
        insertError.message
      );
    }
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
