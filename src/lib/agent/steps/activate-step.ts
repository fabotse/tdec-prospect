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
import { getServiceApiKey } from "./step-utils";
import type {
  StepInput,
  StepOutput,
  StepType,
  ActivateStepOutput,
} from "@/types/agent";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// ACTIVATE STEP
// ==============================================

export class ActivateStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "activate" as StepType, supabase);
    this.tenantId = tenantId;
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
    const apiKey = await getServiceApiKey(this.supabase, this.tenantId, "instantly");

    const service = new InstantlyService();

    // Story 17.9 AC #2: Add selected accounts before activating (guided mode).
    // In autopilot mode accounts were already included during createCampaign.
    const selectedAccounts = previousStepOutput.selectedAccounts as string[] | undefined;
    if (selectedAccounts && selectedAccounts.length > 0) {
      await service.addAccountsToCampaign({
        apiKey,
        campaignId: externalCampaignId,
        accountEmails: selectedAccounts,
      });
    }

    // 3.6 - Sub-step B: Ativar campanha
    await service.activateCampaign({
      apiKey,
      campaignId: externalCampaignId,
    });

    // 3.7 - Sub-step C: Enviar mensagem de confirmacao
    const leadsCount = totalLeads ?? 0;
    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "agent",
      content: `Campanha '${campaignName}' ativa no Instantly com ${leadsCount} leads`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "summary",
      },
    });

    // 3.8 - Sub-step D: Montar output
    const data: ActivateStepOutput = {
      externalCampaignId,
      campaignName,
      activated: true,
      activatedAt: new Date().toISOString(),
    };

    // 3.9 - Calcular custo
    const cost = {
      instantly_activate: 1,
    };

    // 3.10 - Retornar StepOutput
    return {
      success: true,
      data: data as unknown as Record<string, unknown>,
      cost,
    };
  }

}
