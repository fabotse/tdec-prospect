/**
 * ActivateStep - Ativa campanha no Instantly
 * Story 17.4 - AC: #3, #4
 *
 * Sub-steps:
 * A. Buscar API key do Instantly
 * B. Ativar campanha
 * C. Enviar mensagem de confirmacao
 * D. Montar output
 */

import { BaseStep } from "./base-step";
import { InstantlyService } from "@/lib/services/instantly";
import { ExternalServiceError } from "@/lib/services/base-service";
import { getServiceApiKey } from "./step-utils";
import { stampLatestApprovalGate } from "@/lib/agent/gate-metadata";
import type {
  StepInput,
  StepOutput,
  StepType,
  ActivateStepOutput,
} from "@/types/agent";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignStatusResult } from "@/types/instantly";
import { InstantlyCampaignStatus } from "@/types/instantly";

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Story 22.18 (AC4b): status do Instantly em que NAO podemos disparar o activate.
 *
 * O endpoint e "Activate (start), **or resume** a campaign" — o unico estado em que
 * chama-lo e inequivocamente correto e o rascunho.
 *
 * Story 22.18 (code review, P1): a versao original listava so `Active(1)` e
 * `RunningSubsequences(4)`, deixando `Paused(2)` e `Completed(3)` cairem no activate —
 * e sao justamente os dois estados em que "resume" e DESTRUTIVO: retomar uma campanha
 * concluida reenvia a sequencia inteira para leads que ja receberam tudo, e retomar uma
 * pausada anula uma decisao humana tomada dentro do Instantly. Ambos sao alcancaveis
 * pelo retry de um clique que a AC2 criou.
 *
 * `Draft(0)` ativa; `AccountSuspended(-99)` tambem tenta (falha alto no Instantly, que e
 * a informacao util), preservando o comportamento anterior para esse caso.
 */
const DO_NOT_ACTIVATE_STATUSES = new Set<number>([
  InstantlyCampaignStatus.Active,
  InstantlyCampaignStatus.Paused,
  InstantlyCampaignStatus.Completed,
  InstantlyCampaignStatus.RunningSubsequences,
]);

// ==============================================
// ACTIVATE STEP
// ==============================================

export class ActivateStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "activate" as StepType, supabase);
    this.tenantId = tenantId;
  }

  /**
   * Story 22.17 (AC2): a aprovacao da ativacao acontece ANTES — no gate do export,
   * quando o usuario clica "Ativar Campanha". Depois de a campanha estar ativa no
   * Instantly nao ha nada para aprovar: o step conclui e a execucao fecha.
   */
  override requiresPostApproval(): boolean {
    return false;
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { previousStepOutput } = input;

    // 3.3 - Validate input
    if (!previousStepOutput) {
      throw new Error("Output do step anterior e obrigatorio para ativacao");
    }

    const externalCampaignId = previousStepOutput.externalCampaignId as string | undefined;
    const campaignName = previousStepOutput.campaignName as string | undefined;
    const totalLeads = previousStepOutput.leadsUploaded as number | undefined;

    if (!externalCampaignId) {
      throw new Error("externalCampaignId e obrigatorio no output do step anterior");
    }
    if (!campaignName) {
      throw new Error("campaignName e obrigatorio no output do step anterior");
    }

    // Story 22.18 (AC4a): guarda BARATA, sem rede. Se o output ja gravado deste MESMO
    // step diz `activated: true`, a campanha ja foi ativada numa tentativa anterior —
    // repetir o POST /activate seria perigoso, porque o endpoint do Instantly e
    // literalmente "Activate (start), **or resume**": um resume pode reiniciar a
    // sequencia para leads que ja receberam e-mail.
    //
    // O `StepInput` NAO carrega a propria linha do step (o orchestrator monta apenas
    // { executionId, briefing, previousStepOutput, mode }), dai o select explicito.
    // E seguro: `updateStepStatus("running")` nao limpa o `output`.
    const existingRow = await this.readOwnRow(input.executionId);
    const existingOutput = existingRow?.output ?? null;
    // Story 22.18 (code review, P4): `activated: true` sozinho nao basta — precisa ser a
    // MESMA campanha. Se o step de export for reexecutado e criar uma campanha nova, o
    // output antigo ainda diz `activated: true` e o step reportaria sucesso sobre a
    // campanha ANTERIOR, deixando a nova para sempre inativa.
    if (
      existingOutput?.activated === true &&
      existingOutput.externalCampaignId === externalCampaignId
    ) {
      // Story 22.18 (code review, P3): o atalho tambem precisa CARIMBAR.
      //
      // Se o carimbo da primeira ativacao falhou (ele e fail-open de proposito), o card
      // volta re-armado; o clique seguinte cai exatamente aqui e, sem esta linha, nunca
      // mais teria chance de carimbar — o card ficaria clicavel para sempre sobre uma
      // campanha ja ativa, e cada clique dispararia um `execute` inteiro. Carimbar aqui
      // torna a durabilidade da AC3 auto-curavel.
      await stampLatestApprovalGate(
        this.supabase,
        input.executionId,
        { activationOutcome: "activated" },
        { stepType: "export" as StepType }
      );

      return {
        success: true,
        data: existingOutput,
        // Story 22.18 (code review, P3): preservar o custo JA gravado. `saveCheckpoint`
        // escreve `cost: result.cost ?? null`, entao devolver `{ instantly_activate: 0 }`
        // aqui APAGAVA o registro da ativacao real que aconteceu na tentativa anterior.
        // Nenhuma chamada nova foi feita: o custo correto e o que ja estava la.
        cost: existingRow?.cost ?? undefined,
      };
    }

    // 3.4 - Progress message
    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "system",
      content: `Etapa ${this.stepNumber}/5: Ativando campanha no Instantly...`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "progress",
      },
    });

    // 3.5 - Sub-step A: Buscar API key do Instantly
    const apiKey = await getServiceApiKey(this.tenantId, "instantly");

    const service = new InstantlyService();

    // Story 17.9 AC #2: Add selected accounts before activating (guided mode).
    // In autopilot mode accounts were already included during createCampaign.
    const selectedAccounts = previousStepOutput.selectedAccounts as string[] | undefined;
    if (selectedAccounts && selectedAccounts.length > 0) {
      // Story 22.12 (AC4): na ativacao REAL a falha de attach CONTINUA bloqueando —
      // ativar sem conta de envio dispararia uma campanha inerte. Mas trocamos a
      // mensagem generica ("Erro interno. Tente novamente.") por uma especifica,
      // preservando a retryabilidade do erro externo original (statusCode).
      try {
        await service.addAccountsToCampaign({
          apiKey,
          campaignId: externalCampaignId,
          accountEmails: selectedAccounts,
        });
      } catch (attachError) {
        const specificMessage = "Não consegui anexar as contas de envio no Instantly";
        if (attachError instanceof ExternalServiceError) {
          throw new ExternalServiceError(
            attachError.serviceName,
            attachError.statusCode,
            specificMessage,
            attachError.details
          );
        }
        throw new Error(specificMessage);
      }
    }

    // Story 22.18 (AC4b + AC6): UMA leitura, DUAS guardas.
    //
    // Roda DEPOIS do attach, para enxergar as contas que acabamos de anexar.
    //
    // (AC4b) A guarda que realmente importa e o ERRO PARCIAL: o Instantly ativa e a
    // resposta volta 502/timeout — o `saveFailure` grava `output: { error }`, ou seja,
    // o `activated: true` NUNCA chegou a ser gravado e a guarda (4a) nao protege. Ler o
    // status resolve: se a campanha ja esta Ativa, nao disparamos o activate de novo.
    //
    // (AC6) A mesma leitura traz o `email_list`. Ativar uma campanha sem remetente
    // fecha a execucao com "Pipeline concluido com sucesso!" sobre uma campanha que
    // nunca vai enviar nada — desabilitar o botao no cliente nao basta, porque o
    // `execute` direto/retry (AC1/AC2) tornou esse caminho MAIS comum, nao menos.
    //
    // Decisao registrada (a AC4b pedia escolher entre pre-flight e verificacao
    // pos-erro-de-gateway): PRE-FLIGHT. O argumento de custo do pre-flight ("1 GET a
    // mais sempre") desaparece aqui, porque a AC6 exige esse GET de qualquer forma —
    // e so o pre-flight cobre a campanha que ficou ativa numa tentativa anterior.
    const campaignState = await this.readCampaignState(
      service,
      apiKey,
      externalCampaignId
    );

    if (campaignState) {
      if (campaignState.emailList !== undefined && campaignState.emailList.length === 0) {
        throw new Error(
          "A campanha nao tem nenhuma conta de envio no Instantly. Anexe ao menos uma conta de envio antes de ativar — sem remetente a campanha nao envia nada."
        );
      }
    }

    // 3.6 - Sub-step B: Ativar campanha
    const mustNotActivate =
      campaignState !== null && DO_NOT_ACTIVATE_STATUSES.has(campaignState.status);

    if (mustNotActivate) {
      console.error(
        `[ActivateStep] Campanha ${externalCampaignId} esta ${campaignState.statusLabel} no Instantly (status=${campaignState.status}, execution=${input.executionId}); activate NAO disparado (o endpoint e activate-or-resume).`
      );
    } else {
      await service.activateCampaign({
        apiKey,
        campaignId: externalCampaignId,
      });
    }

    // 3.7 - Sub-step C: Enviar mensagem de confirmacao
    // Story 22.17 (AC4): "com 1 leads" era o texto da mensagem de MAIOR sucesso do fluxo.
    const leadsCount = totalLeads ?? 0;
    const leadsLabel = leadsCount === 1 ? "1 lead" : `${leadsCount} leads`;
    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "agent",
      content: `Campanha '${campaignName}' ativa no Instantly com ${leadsLabel}`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "summary",
      },
    });

    // Story 22.18 (AC3): carimbo DURAVEL do gate de ativacao — SO AQUI.
    //
    // Este e o unico ponto do fluxo em que "ativada" e verdade: a campanha ja esta
    // ativa no Instantly. O approve nao pode carimbar (retorna antes de o `execute`
    // disparar) e uma ativacao que falha nunca chega ate aqui — o card volta re-armado,
    // que e o que mantem a retomada da AC2 alcancavel. Fail-open: auditoria nao derruba
    // uma ativacao bem-sucedida.
    //
    // O gate vive no step do EXPORT (o anterior), entao filtramos por tipo de step e
    // nao por numero.
    await stampLatestApprovalGate(
      this.supabase,
      input.executionId,
      { activationOutcome: "activated" },
      { stepType: "export" as StepType }
    );

    // 3.8 - Sub-step D: Montar output
    const data: ActivateStepOutput = {
      externalCampaignId,
      campaignName,
      activated: true,
      activatedAt: new Date().toISOString(),
    };

    // 3.9 - Calcular custo
    // Story 22.18 (code review, P5): contar 1 quando o activate comprovadamente NAO
    // disparou registrava uma chamada que nunca existiu — incoerente com o proprio
    // atalho da guarda 4a, que zera pelo mesmo motivo.
    const cost = {
      instantly_activate: mustNotActivate ? 0 : 1,
    };

    // 3.10 - Retornar StepOutput
    return {
      success: true,
      data: data as unknown as Record<string, unknown>,
      cost,
    };
  }

  /**
   * Story 22.18 (AC4a): le o `output` ja gravado DESTE step.
   *
   * O `StepInput` so carrega o output do step ANTERIOR — a propria linha nunca chega
   * ao step. Fail-open: se a leitura falhar, seguimos o comportamento de hoje (a
   * guarda (4b) ainda protege via status da campanha).
   */
  private async readOwnRow(
    executionId: string
  ): Promise<{
    output: Record<string, unknown> | null;
    cost: Record<string, number> | null;
  } | null> {
    try {
      const { data } = await this.supabase
        .from("agent_steps")
        // `cost` entra junto (code review P3): o atalho de idempotencia precisa
        // devolver o custo JA gravado, senao o `saveCheckpoint` o apaga.
        .select("output, cost")
        .eq("execution_id", executionId)
        .eq("step_number", this.stepNumber)
        .single();

      const row = data as { output?: unknown; cost?: unknown } | null;
      if (!row) return null;

      return {
        output:
          row.output && typeof row.output === "object"
            ? (row.output as Record<string, unknown>)
            : null,
        cost:
          row.cost && typeof row.cost === "object"
            ? (row.cost as Record<string, number>)
            : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Story 22.18 (AC4b + AC6): le status + contas de envio da campanha no Instantly.
   *
   * FAIL-OPEN por decisao explicita da AC4: se nao sabemos o estado da campanha,
   * seguimos o comportamento de hoje (ativar) em vez de bloquear o usuario por causa
   * de uma leitura auxiliar. O erro e logado — silenciar seria pior que falhar.
   */
  private async readCampaignState(
    service: InstantlyService,
    apiKey: string,
    campaignId: string
  ): Promise<CampaignStatusResult | null> {
    try {
      return await service.getCampaignStatus({ apiKey, campaignId });
    } catch (statusError) {
      console.error(
        `[ActivateStep] Nao consegui ler o estado da campanha ${campaignId} no Instantly; seguindo com a ativacao (fail-open):`,
        statusError instanceof Error ? statusError.message : statusError
      );
      return null;
    }
  }
}
