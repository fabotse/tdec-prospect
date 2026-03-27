/**
 * ExportStep - Exporta campanha para o Instantly
 * Story 17.4 - AC: #1, #2
 *
 * Sub-steps:
 * A. Buscar API key do Instantly
 * B. Converter emailBlocks + delayBlocks para sequences Instantly
 * C. Criar campanha no Instantly
 * D. Buscar e associar sending accounts
 * E. Adicionar leads com icebreakers
 * F. Montar output
 */

import { BaseStep } from "./base-step";
import { InstantlyService } from "@/lib/services/instantly";
import { getServiceApiKey } from "./step-utils";
import type {
  StepInput,
  StepOutput,
  StepType,
  ExportStepOutput,
  LeadWithIcebreaker,
} from "@/types/agent";
import type { CreateCampaignParams } from "@/types/instantly";
import type { SupabaseClient } from "@supabase/supabase-js";

type SequenceEmail = CreateCampaignParams["sequences"][number];

// ==============================================
// HELPERS
// ==============================================

interface EmailBlock {
  position: number;
  subject: string;
  body: string;
  emailMode: string;
}

interface DelayBlock {
  position: number;
  delayDays: number;
}

/**
 * Convert emailBlocks + delayBlocks from CreateCampaignStep output
 * to Instantly sequences format.
 *
 * - First email: delayDays = 0
 * - Follow-ups: delayDays from delay block at position before the email
 * - Body: passed as plain text (HTML conversion happens in createCampaign)
 */
export function convertToInstantlySequences(
  emailBlocks: EmailBlock[],
  delayBlocks: DelayBlock[]
): SequenceEmail[] {
  const sortedEmails = [...emailBlocks].sort((a, b) => a.position - b.position);
  const delayMap = new Map(delayBlocks.map((d) => [d.position, d.delayDays]));

  return sortedEmails.map((email, index) => ({
    subject: email.subject,
    body: email.body,
    delayDays: index === 0 ? 0 : (delayMap.get(email.position - 1) ?? 1),
  }));
}

// ==============================================
// EXPORT STEP
// ==============================================

export class ExportStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "export" as StepType, supabase);
    this.tenantId = tenantId;
  }

  /**
   * Story 17.6 Task 7: Send summary data for activation gate.
   * Only confirmation-level data, no editing needed.
   */
  protected buildPreviewData(result: StepOutput): unknown {
    const data = result.data as unknown as ExportStepOutput;
    return {
      externalCampaignId: data.externalCampaignId,
      campaignName: data.campaignName,
      totalEmails: data.totalEmails,
      leadsUploaded: data.leadsUploaded,
      accountsAdded: data.accountsAdded,
      platform: data.platform,
    };
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { previousStepOutput } = input;

    // 2.3 - Validate input
    if (!previousStepOutput) {
      throw new Error("Output do step anterior e obrigatorio para exportacao");
    }

    const campaignName = previousStepOutput.campaignName as string | undefined;
    const emailBlocks = previousStepOutput.emailBlocks as EmailBlock[] | undefined;
    const delayBlocks = previousStepOutput.delayBlocks as DelayBlock[] | undefined;
    const leadsWithIcebreakers = previousStepOutput.leadsWithIcebreakers as LeadWithIcebreaker[] | undefined;

    if (!campaignName) {
      throw new Error("campaignName e obrigatorio no output do step anterior");
    }
    if (!emailBlocks || !Array.isArray(emailBlocks) || emailBlocks.length === 0) {
      throw new Error("emailBlocks e obrigatorio no output do step anterior");
    }
    if (!leadsWithIcebreakers || !Array.isArray(leadsWithIcebreakers) || leadsWithIcebreakers.length === 0) {
      throw new Error("leadsWithIcebreakers e obrigatorio no output do step anterior");
    }

    // 2.4 - Progress message
    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "system",
      content: `Etapa ${this.stepNumber}/5: Exportando campanha para o Instantly...`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "progress",
      },
    });

    // 2.5 - Sub-step A: Buscar API key do Instantly
    const apiKey = await getServiceApiKey(this.supabase, this.tenantId, "instantly");

    // 2.6 - Sub-step B: Converter emailBlocks + delayBlocks para sequences
    const sequences = convertToInstantlySequences(emailBlocks, delayBlocks ?? []);

    // 2.7 - Sub-step C: Buscar sending accounts + Criar campanha no Instantly
    const service = new InstantlyService();

    const accountsResult = await service.listAccounts({ apiKey });
    if (accountsResult.accounts.length === 0) {
      throw new Error("Nenhuma sending account configurada no Instantly");
    }
    const accountEmails = accountsResult.accounts.map((a) => a.email);

    // Create campaign with sending accounts included (email_list)
    // Replaces separate addAccountsToCampaign call (deprecated endpoint)
    const createResult = await service.createCampaign({
      apiKey,
      name: campaignName,
      sequences,
      sendingAccounts: accountEmails,
    });
    const externalCampaignId = createResult.campaignId;
    const accountsAdded = accountEmails.length;

    // 2.9 - Sub-step E: Adicionar leads com icebreakers
    const mappedLeads = leadsWithIcebreakers
      .filter((lead) => lead.email)
      .map((lead) => {
        const nameParts = (lead.name || "").split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || undefined;

        return {
          email: lead.email as string,
          firstName: firstName || undefined,
          lastName,
          companyName: lead.companyName ?? undefined,
          title: lead.title ?? undefined,
          icebreaker: lead.icebreaker ?? undefined,
        };
      });

    if (mappedLeads.length === 0) {
      throw new Error("Nenhum lead com email valido para exportar");
    }

    const addLeadsResult = await service.addLeadsToCampaign({
      apiKey,
      campaignId: externalCampaignId,
      leads: mappedLeads,
    });

    // 2.10 - Sub-step F: Montar output
    const data: ExportStepOutput = {
      externalCampaignId,
      campaignName,
      totalEmails: emailBlocks.length,
      leadsUploaded: addLeadsResult.leadsUploaded,
      duplicatedLeads: addLeadsResult.duplicatedLeads,
      invalidEmails: addLeadsResult.invalidEmails,
      accountsAdded,
      platform: "instantly",
    };

    // 2.11 - Calcular custo
    const cost = {
      instantly_create: 1,
      instantly_leads: addLeadsResult.leadsUploaded,
    };

    // 2.12 - Retornar StepOutput
    return {
      success: true,
      data: data as unknown as Record<string, unknown>,
      cost,
    };
  }

}
