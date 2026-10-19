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
import { TrackingService } from "@/lib/services/tracking";
import { getServiceApiKey } from "./step-utils";
import { markCampaignExported } from "@/lib/agent/campaign-persistence";
import { logAgentUsage } from "@/lib/agent/agent-usage";
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
   * Story 17.9 Task 1.1: Include accounts in previewData for approval gate.
   * Confirmation-level data only, no editing needed.
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
      accounts: data.accounts,
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
    // Story 22.16: a linha local que o create_campaign gravou. Ausente = a persistencia
    // local falhou la atras (fail-open) — nao e falha aqui, so nao ha o que carimbar.
    const campaignId = previousStepOutput.campaignId as string | undefined;

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

    // Story 24.2 (AC1): export IDEMPOTENTE. Um retry depois de falha nao pode criar uma
    // segunda campanha (orfa) no Instantly: o `externalCampaignId` fica no output parcial
    // do proprio step logo apos a criacao, sobrevive ao `saveFailure`, e e lido aqui,
    // ANTES de qualquer chamada ao Instantly. Erro de leitura LANCA — seguir as cegas
    // seria criar outra campanha.
    const existingCampaignId = await this.readExistingCampaignId(input.executionId);
    if (existingCampaignId) {
      // Re-registra o parcial JA AQUI, antes da API key e do `listAccounts`: se qualquer
      // passo desta tentativa falhar, o `saveFailure` continua preservando o id.
      await this.recordPartialOutput(input.executionId, {
        externalCampaignId: existingCampaignId,
        campaignName,
      });
    }

    // 2.5 - Sub-step A: Buscar API key do Instantly
    const apiKey = await getServiceApiKey(this.tenantId, "instantly");

    // 2.6 - Sub-step B: Converter emailBlocks + delayBlocks para sequences
    const sequences = convertToInstantlySequences(emailBlocks, delayBlocks ?? []);

    // 2.7 - Sub-step C: Buscar sending accounts + Criar campanha no Instantly
    const service = new InstantlyService();

    // Story 24.10: chamadas ao Instantly desta tentativa, para o log `campaign_export`
    // (1 linha por step). O log nunca lanca e nao muda as chamadas.
    let instantlyCalls = 0;
    const exportStart = Date.now();
    try {
      instantlyCalls++;
      const accountsResult = await service.listAccounts({ apiKey });
      if (accountsResult.accounts.length === 0) {
        throw new Error("Nenhuma conta de envio encontrada no Instantly. Configure ao menos uma conta antes de exportar.");
      }
      const accounts = accountsResult.accounts;
      const accountEmails = accounts.map((a) => a.email);

      // Story 17.9 AC #1/#3: In guided mode, create campaign WITHOUT accounts
      // (user selects accounts in approval gate, ActivateStep adds them).
      // In autopilot, include all accounts (AC #3).
      const isGuided = input.mode === "guided";
      let externalCampaignId: string;
      if (existingCampaignId) {
        externalCampaignId = existingCampaignId;
      } else {
        instantlyCalls++;
        const createResult = await service.createCampaign({
          apiKey,
          name: campaignName,
          sequences,
          sendingAccounts: isGuided ? [] : accountEmails,
        });
        externalCampaignId = createResult.campaignId;
        // Grava ANTES do upload de leads — e o upload que costuma falhar.
        await this.recordPartialOutput(input.executionId, { externalCampaignId, campaignName });
      }
      const accountsAdded = isGuided ? 0 : accountEmails.length;

      // 2.9 - Sub-step E: Adicionar leads com icebreakers
      const allMappedLeads = leadsWithIcebreakers
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

      if (allMappedLeads.length === 0) {
        throw new Error("Nenhum lead com email valido para exportar");
      }

      // Story 24.2: no reuso, sobe so os e-mails que AINDA nao estao na campanha. Diff
      // local em vez de `skip_if_in_campaign` (que filtra leads de QUALQUER campanha e foi
      // desligado de proposito — ligar seria um filtro novo no caminho ate o Instantly).
      let mappedLeads = allMappedLeads;
      let alreadyPresent = 0;
      if (existingCampaignId) {
        instantlyCalls++;
        const existingLeads = await new TrackingService().getLeadTracking({
          apiKey,
          externalCampaignId,
        });
        const presentEmails = new Set(
          existingLeads
            .map((lead) => (typeof lead.leadEmail === "string" ? lead.leadEmail.trim().toLowerCase() : ""))
            .filter((email) => email.length > 0)
        );
        mappedLeads = allMappedLeads.filter(
          (lead) => !presentEmails.has(lead.email.trim().toLowerCase())
        );
        alreadyPresent = allMappedLeads.length - mappedLeads.length;
      }

      if (mappedLeads.length > 0) instantlyCalls++;
      const addLeadsResult =
        mappedLeads.length > 0
          ? await service.addLeadsToCampaign({
              apiKey,
              campaignId: externalCampaignId,
              leads: mappedLeads,
            })
          : { leadsUploaded: 0, duplicatedLeads: 0, invalidEmails: 0 };

      // Story 22.16: carimba os quatro campos de export na linha local, pelo caminho
      // canonico do builder (`updateExportStatus`). SO AQUI o `external_campaign_id` existe.
      //
      // Fail-open TOTAL: o export ja gastou credito no Instantly e a campanha ja esta la
      // com os leads dentro — uma falha de RLS/rede nesta escrita local nao pode transformar
      // isso numa execucao falha. Falha => bolha + log, e o export segue como sucesso.
      if (campaignId) {
        try {
          await markCampaignExported({
            supabase: this.supabase,
            campaignId,
            externalCampaignId,
          });
        } catch (persistError) {
          console.error(
            "[ExportStep] Falha ao registrar o export na campanha local:",
            persistError
          );
          await this.sendCampaignNotice(
            input.executionId,
            "A campanha foi exportada para o Instantly, mas nao consegui registrar isso na sua lista de Campanhas — as metricas dela podem nao aparecer por aqui."
          );
        }
      }

      // 2.10 - Sub-step F: Montar output
      const data: ExportStepOutput = {
        externalCampaignId,
        campaignName,
        totalEmails: emailBlocks.length,
        leadsUploaded: alreadyPresent + addLeadsResult.leadsUploaded,
        duplicatedLeads: addLeadsResult.duplicatedLeads,
        invalidEmails: addLeadsResult.invalidEmails,
        accountsAdded,
        platform: "instantly",
        accounts: accounts.map((a) => ({
          email: a.email,
          first_name: a.first_name,
          last_name: a.last_name,
        })),
        // Sem propagar, o activate perde a referencia da linha local e nunca marcaria
        // `status: "active"`.
        campaignId: campaignId ?? null,
      };

      // 2.11 - Calcular custo
      // Story 24.2: no reuso nada foi criado e so os leads novos foram enviados.
      const cost = {
        instantly_create: existingCampaignId ? 0 : 1,
        instantly_leads: addLeadsResult.leadsUploaded,
      };

      await this.logExport(input.executionId, "success", instantlyCalls, Date.now() - exportStart, {
        externalCampaignId,
        reused: Boolean(existingCampaignId),
        leadsUploaded: addLeadsResult.leadsUploaded,
      });

      // 2.12 - Retornar StepOutput
      return {
        success: true,
        data: data as unknown as Record<string, unknown>,
        cost,
      };
    } catch (exportError) {
      await this.logExport(input.executionId, "failed", instantlyCalls, Date.now() - exportStart, {}, exportError);
      throw exportError;
    }
  }

  /** Story 24.10: 1 linha `campaign_export` por tentativa com chamada ao Instantly. Nunca lanca. */
  private async logExport(
    executionId: string,
    status: "success" | "failed",
    calls: number,
    durationMs: number,
    metadata: Record<string, unknown>,
    error?: unknown
  ): Promise<void> {
    if (calls === 0) return;
    await logAgentUsage({
      tenantId: this.tenantId,
      executionId,
      stepType: "export",
      serviceName: "instantly",
      requestType: "campaign_export",
      status,
      calls,
      durationMs,
      errorMessage: status === "failed" ? (error instanceof Error ? error.message : "Erro Instantly") : undefined,
      metadata,
    });
  }

  /**
   * Story 24.2: le o `externalCampaignId` gravado no output (parcial ou de falha) do
   * proprio step por uma tentativa anterior. Lanca em erro de leitura.
   */
  private async readExistingCampaignId(executionId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("agent_steps")
      .select("output")
      .eq("execution_id", executionId)
      .eq("step_number", this.stepNumber)
      .maybeSingle();

    if (error) {
      throw new Error(
        "Nao consegui verificar se a campanha ja foi criada no Instantly. Tente novamente."
      );
    }

    const output = (data as { output?: unknown } | null)?.output;
    if (!output || typeof output !== "object") return null;
    const id = (output as Record<string, unknown>).externalCampaignId;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  /**
   * Story 22.16: bolha de aviso sobre a campanha local. NUNCA lanca e checa o `{ error }`
   * que o supabase-js RETORNA em vez de lancar — sem isso o aviso sumiria em silencio, ou
   * pior, derrubaria um export que ja aconteceu.
   */
  private async sendCampaignNotice(executionId: string, content: string): Promise<void> {
    try {
      const { error } = await this.supabase.from("agent_messages").insert({
        execution_id: executionId,
        role: "system",
        content,
        metadata: { stepNumber: this.stepNumber, messageType: "text" },
      });
      if (error) {
        console.error("[ExportStep] Falha ao avisar sobre a campanha local:", error);
      }
    } catch (messageError) {
      console.error("[ExportStep] Falha ao avisar sobre a campanha local:", messageError);
    }
  }
}
