/**
 * CreateCampaignStep - Cria campanha com emails e icebreakers
 * Story 17.3 - AC: #1, #2, #3, #4
 *
 * Sub-steps:
 * A. Carregar contexto KB + produto
 * B. Gerar estrutura de campanha via AI
 * C. Gerar icebreakers standard por lead (batches de 5)
 * D. Gerar conteudo de emails (subject + body)
 * E. Montar output
 */

import { BaseStep } from "./base-step";
import {
  buildAIVariables,
  type KnowledgeBaseContext,
} from "@/lib/services/knowledge-base-context";
import { ApolloService } from "@/lib/services/apollo";
import { createAIProvider, promptManager } from "@/lib/ai";
import { ExternalServiceError } from "@/lib/services/base-service";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { transformProductRow, type ProductRow } from "@/types/product";
import { ICEBREAKER_CATEGORY_INSTRUCTIONS } from "@/types/ai-prompt";
import type { IcebreakerCategory } from "@/types/ai-prompt";
import type { IcebreakerExample } from "@/types/knowledge-base";
import type {
  StepInput,
  StepOutput,
  StepType,
  SearchLeadResult,
  CreateCampaignOutput,
  CampaignStructureItem,
  LeadWithIcebreaker,
} from "@/types/agent";
import type { AIModel } from "@/types/ai-provider";
import type { AIContextVariables } from "@/lib/services/knowledge-base-context";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// CONSTANTS
// ==============================================

const ICEBREAKER_BATCH_SIZE = 5;
const MAX_IB_EXAMPLES_IN_PROMPT = 3;

// ==============================================
// CREATE CAMPAIGN STEP
// ==============================================

export class CreateCampaignStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "create_campaign" as StepType, supabase);
    this.tenantId = tenantId;
  }

  /**
   * Story 17.6 Task 6: Send complete data for campaign preview.
   * User needs full emailBlocks to edit inline, plus icebreakers and structure.
   */
  protected buildPreviewData(result: StepOutput): unknown {
    const data = result.data as unknown as CreateCampaignOutput;
    return {
      campaignName: data.campaignName,
      structure: { totalEmails: data.structure.totalEmails, totalDays: data.structure.totalDays },
      emailBlocks: data.emailBlocks,
      leadsWithIcebreakers: data.leadsWithIcebreakers,
      icebreakerStats: data.icebreakerStats,
      totalLeads: data.totalLeads,
    };
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { briefing, previousStepOutput } = input;

    // 2.3 - Validate input: leads from previous step
    if (!previousStepOutput) {
      throw new Error("Output do step anterior e obrigatorio para criacao de campanha");
    }

    const leads = previousStepOutput.leads as SearchLeadResult[] | undefined;
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      throw new Error("Lista de leads do step anterior e obrigatoria para criacao de campanha");
    }

    // 2.3b - Enrich approved leads (email + full name) before campaign creation
    const apolloService = new ApolloService(this.tenantId);
    let enrichCredits = 0;
    for (const lead of leads) {
      const typedLead = lead as SearchLeadResult & { apolloId?: string | null };
      if (typedLead.apolloId && (!typedLead.email || typedLead.name.includes("*"))) {
        try {
          const enriched = await apolloService.enrichPerson(typedLead.apolloId, {
            revealPersonalEmails: true,
          });
          const person = enriched.person;
          if (person) {
            if (person.email) typedLead.email = person.email;
            const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ");
            if (fullName && !fullName.includes("*")) typedLead.name = fullName;
            enrichCredits++;
          }
        } catch {
          // Enrichment failed — continue with existing data
        }
      }
    }

    const totalLeads = leads.length;

    // 2.4 - Progress message
    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "system",
      content: `Etapa ${this.stepNumber}/5: Criando campanha com emails personalizados para ${totalLeads} leads...`,
      metadata: {
        stepNumber: this.stepNumber,
        messageType: "progress",
      },
    });

    // 2.5 - Sub-step A: Load KB context
    const kbContext = await this.loadKBContext();
    const product = briefing.productSlug
      ? await this.loadProduct(briefing.productSlug)
      : null;
    const aiVars = buildAIVariables(kbContext, product);

    // 2.7 - Get OpenAI API key
    const apiKey = await this.getOpenAIApiKey();
    const provider = createAIProvider("openai", apiKey);

    // 2.7 - Sub-step B: Generate campaign structure
    // objective/urgency/campaignDescription may not be in ParsedBriefing yet — safe access with defaults
    const briefingRecord = briefing as unknown as Record<string, unknown>;
    const objective = (briefingRecord.objective as string) ?? "COLD_OUTREACH";
    const urgency = (briefingRecord.urgency as string) ?? "MEDIUM";

    const structurePrompt = await promptManager.renderPrompt(
      "campaign_structure_generation",
      { ...aiVars, objective, urgency },
      { tenantId: this.tenantId }
    );
    if (!structurePrompt) {
      throw new Error("Prompt campaign_structure_generation nao encontrado");
    }

    const structureResult = await provider.generateText(structurePrompt.content, {
      temperature: structurePrompt.metadata.temperature ?? 0.6,
      maxTokens: structurePrompt.metadata.maxTokens ?? 1500,
      model: (structurePrompt.modelPreference ?? "gpt-4o") as AIModel,
      timeoutMs: 30000,
    });

    // 2.8 - Parse and validate structure JSON
    const structure = this.parseStructureJSON(structureResult.text);

    // 2.9 - Sub-step C: Generate icebreakers standard
    const icebreakerExamples = await this.loadIcebreakerExamples();
    const formattedExamples = CreateCampaignStep.formatIcebreakerExamples(icebreakerExamples, "lead");
    const { leadsWithIcebreakers, icebreakerStats } = await this.generateIcebreakers(
      leads, aiVars, provider, formattedExamples
    );

    // 2.11 - Sub-step D: Generate email content
    const emailBlocks = await this.generateEmailBlocks(
      structure.items, aiVars, provider
    );

    // 2.12 - Sub-step E: Build output
    const delayBlocks = structure.items
      .filter((item): item is CampaignStructureItem & { type: 'delay' } => item.type === "delay")
      .map((item) => ({
        position: item.position,
        delayDays: item.days ?? 1,
      }));

    const campaignDescription = briefingRecord.campaignDescription as string | undefined;
    const campaignName = campaignDescription
      ? `Campanha - ${campaignDescription}`
      : `Campanha ${briefing.technology ?? "Outbound"} - ${new Date().toLocaleDateString("pt-BR")}`;

    const totalEmails = emailBlocks.length;
    const totalDays = delayBlocks.reduce((sum, d) => sum + d.delayDays, 0);

    const data: CreateCampaignOutput = {
      campaignName,
      structure: {
        totalEmails,
        totalDays,
        items: structure.items,
      },
      emailBlocks,
      delayBlocks,
      leadsWithIcebreakers,
      icebreakerStats,
      totalLeads,
    };

    // 2.13 - Calculate cost
    const cost = {
      apollo_enrich: enrichCredits,
      openai_structure: 1,
      openai_emails: totalEmails,
      openai_icebreakers: icebreakerStats.generated,
    };

    return {
      success: true,
      data: data as unknown as Record<string, unknown>,
      cost,
    };
  }

  // ==============================================
  // PRIVATE HELPERS
  // ==============================================

  private async loadKBContext(): Promise<KnowledgeBaseContext | null> {
    const { data: companyData } = await this.supabase
      .from("knowledge_base")
      .select("content")
      .eq("tenant_id", this.tenantId)
      .eq("section", "company")
      .single();

    const { data: toneData } = await this.supabase
      .from("knowledge_base")
      .select("content")
      .eq("tenant_id", this.tenantId)
      .eq("section", "tone")
      .single();

    const { data: icpData } = await this.supabase
      .from("knowledge_base")
      .select("content")
      .eq("tenant_id", this.tenantId)
      .eq("section", "icp")
      .single();

    if (!companyData && !toneData && !icpData) {
      return null;
    }

    return {
      company: (companyData?.content as KnowledgeBaseContext["company"]) ?? null,
      tone: (toneData?.content as KnowledgeBaseContext["tone"]) ?? null,
      icp: (icpData?.content as KnowledgeBaseContext["icp"]) ?? null,
      examples: [],
    };
  }

  private async loadProduct(productId: string) {
    const { data } = await this.supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("tenant_id", this.tenantId)
      .single();

    if (!data) return null;
    return transformProductRow(data as ProductRow);
  }

  private async getOpenAIApiKey(): Promise<string> {
    const { data: apiConfig } = await this.supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", this.tenantId)
      .eq("service_name", "openai")
      .single();

    if (!apiConfig) {
      throw new Error("API key do OpenAI nao configurada");
    }

    return decryptApiKey(apiConfig.encrypted_key);
  }

  private parseStructureJSON(text: string): { items: CampaignStructureItem[] } {
    let parsed: { items?: unknown[] };
    try {
      // Strip markdown code fences and surrounding text — LLMs often wrap JSON in ```json ... ```
      let cleaned = text.trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        cleaned = fenceMatch[1].trim();
      } else {
        // Fallback: extract first { ... last }
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }
      }
      parsed = JSON.parse(cleaned);
    } catch {
      throw new ExternalServiceError("openai", 502, "Formato invalido na resposta do AI: JSON parse falhou");
    }

    // Handle both formats: { items: [...] } and { structure: { items: [...] } }
    const rawParsed = parsed as Record<string, unknown>;
    const nestedStructure = rawParsed.structure as { items?: unknown[] } | undefined;
    const items: unknown[] | undefined = parsed.items ?? nestedStructure?.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ExternalServiceError("openai", 502, "Formato invalido na resposta do AI: estrutura sem emails");
    }

    const hasEmail = items.some(
      (item) => (item as Record<string, unknown>).type === "email"
    );
    if (!hasEmail) {
      throw new ExternalServiceError("openai", 502, "Formato invalido na resposta do AI: estrutura sem emails");
    }

    return { items: items as CampaignStructureItem[] };
  }

  private async loadIcebreakerExamples(): Promise<IcebreakerExample[]> {
    const { data, error } = await this.supabase
      .from("icebreaker_examples")
      .select("*")
      .eq("tenant_id", this.tenantId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as IcebreakerExample[];
  }

  static formatIcebreakerExamples(
    examples: IcebreakerExample[],
    category: IcebreakerCategory
  ): string {
    if (examples.length === 0) return "";

    const sameCategory = examples.filter((e) => e.category === category);
    const noCategory = examples.filter((e) => e.category === null);

    const selected: IcebreakerExample[] = [];
    for (const ex of sameCategory) {
      if (selected.length >= MAX_IB_EXAMPLES_IN_PROMPT) break;
      selected.push(ex);
    }
    for (const ex of noCategory) {
      if (selected.length >= MAX_IB_EXAMPLES_IN_PROMPT) break;
      selected.push(ex);
    }

    if (selected.length === 0) return "";

    return selected
      .map((ex, idx) => {
        const catLabel = ex.category
          ? ex.category.charAt(0).toUpperCase() + ex.category.slice(1)
          : "Geral";
        return `Exemplo ${idx + 1}:\nTexto: ${ex.text}\nCategoria: ${catLabel}`;
      })
      .join("\n\n");
  }

  private async generateIcebreakers(
    leads: SearchLeadResult[],
    aiVars: AIContextVariables,
    provider: ReturnType<typeof createAIProvider>,
    formattedExamples: string
  ): Promise<{
    leadsWithIcebreakers: LeadWithIcebreaker[];
    icebreakerStats: { generated: number; failed: number; skipped: number };
  }> {
    const leadsWithIcebreakers: LeadWithIcebreaker[] = [];
    const icebreakerStats = { generated: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < leads.length; i += ICEBREAKER_BATCH_SIZE) {
      const batch = leads.slice(i, i + ICEBREAKER_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((lead) => this.generateSingleIcebreaker(lead, aiVars, provider, formattedExamples))
      );

      for (let j = 0; j < results.length; j++) {
        const lead = batch[j];
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          leadsWithIcebreakers.push({ ...lead, icebreaker: result.value });
          icebreakerStats.generated++;
        } else {
          leadsWithIcebreakers.push({ ...lead, icebreaker: null });
          icebreakerStats.failed++;
        }
      }
    }

    return { leadsWithIcebreakers, icebreakerStats };
  }

  private async generateSingleIcebreaker(
    lead: SearchLeadResult,
    aiVars: AIContextVariables,
    provider: ReturnType<typeof createAIProvider>,
    formattedExamples: string
  ): Promise<string | null> {
    const variables: Record<string, string> = {
      ...aiVars,
      lead_name: lead.name,
      lead_title: lead.title ?? "",
      lead_company: lead.companyName ?? "",
      lead_industry: aiVars.target_industries || "Tecnologia",
      lead_location: aiVars.lead_location || "Brasil",
      category_instructions: ICEBREAKER_CATEGORY_INSTRUCTIONS.lead,
      icebreaker_examples: formattedExamples,
    };

    const rendered = await promptManager.renderPrompt(
      "icebreaker_generation",
      variables,
      { tenantId: this.tenantId }
    );

    if (!rendered) return null;

    const result = await provider.generateText(rendered.content, {
      temperature: rendered.metadata.temperature ?? 0.7,
      maxTokens: rendered.metadata.maxTokens ?? 300,
      model: (rendered.modelPreference ?? "gpt-4o") as AIModel,
      timeoutMs: 15000,
    });

    return result.text.trim() || null;
  }

  private async generateEmailBlocks(
    items: CampaignStructureItem[],
    aiVars: AIContextVariables,
    provider: ReturnType<typeof createAIProvider>
  ): Promise<CreateCampaignOutput["emailBlocks"]> {
    const emailItems = items.filter((item) => item.type === "email");
    const emailBlocks: CreateCampaignOutput["emailBlocks"] = [];
    let previousSubject = "";
    let previousBody = "";

    for (const item of emailItems) {
      const isFollowUp = item.emailMode === "follow-up" || item.position > 0;
      let subject: string;
      let body: string;

      if (!isFollowUp) {
        // First email
        const subjectPrompt = await promptManager.renderPrompt(
          "email_subject_generation",
          { ...aiVars, email_objective: item.context ?? aiVars.email_objective },
          { tenantId: this.tenantId }
        );
        const bodyPrompt = await promptManager.renderPrompt(
          "email_body_generation",
          { ...aiVars, email_objective: item.context ?? aiVars.email_objective },
          { tenantId: this.tenantId }
        );

        subject = subjectPrompt
          ? (await provider.generateText(subjectPrompt.content, {
              temperature: subjectPrompt.metadata.temperature ?? 0.7,
              maxTokens: subjectPrompt.metadata.maxTokens ?? 200,
              model: (subjectPrompt.modelPreference ?? "gpt-4o") as AIModel,
              timeoutMs: 15000,
            })).text.trim()
          : "Assunto da campanha";

        body = bodyPrompt
          ? (await provider.generateText(bodyPrompt.content, {
              temperature: bodyPrompt.metadata.temperature ?? 0.7,
              maxTokens: bodyPrompt.metadata.maxTokens ?? 800,
              model: (bodyPrompt.modelPreference ?? "gpt-4o") as AIModel,
              timeoutMs: 20000,
            })).text.trim()
          : "Corpo do email";
      } else {
        // Follow-up email — separate prompts for subject and body
        const followUpVars = {
          ...aiVars,
          previous_email_subject: previousSubject,
          previous_email_body: previousBody,
          email_objective: item.context ?? aiVars.email_objective,
          sequence_position: `Email ${item.position + 1} de ${emailItems.length}`,
        };

        const subjectPrompt = await promptManager.renderPrompt(
          "follow_up_subject_generation",
          followUpVars,
          { tenantId: this.tenantId }
        );
        const bodyPrompt = await promptManager.renderPrompt(
          "follow_up_email_generation",
          followUpVars,
          { tenantId: this.tenantId }
        );

        subject = subjectPrompt
          ? (await provider.generateText(subjectPrompt.content, {
              temperature: subjectPrompt.metadata.temperature ?? 0.7,
              maxTokens: subjectPrompt.metadata.maxTokens ?? 200,
              model: (subjectPrompt.modelPreference ?? "gpt-4o") as AIModel,
              timeoutMs: 15000,
            })).text.trim()
          : "Follow-up";

        body = bodyPrompt
          ? (await provider.generateText(bodyPrompt.content, {
              temperature: bodyPrompt.metadata.temperature ?? 0.7,
              maxTokens: bodyPrompt.metadata.maxTokens ?? 800,
              model: (bodyPrompt.modelPreference ?? "gpt-4o") as AIModel,
              timeoutMs: 20000,
            })).text.trim()
          : "Corpo do follow-up";
      }

      emailBlocks.push({
        position: item.position,
        subject,
        body,
        emailMode: isFollowUp ? "follow-up" : "initial",
      });

      previousSubject = subject;
      previousBody = body;
    }

    return emailBlocks;
  }
}
