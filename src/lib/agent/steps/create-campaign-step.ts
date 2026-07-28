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
import { ApifyService } from "@/lib/services/apify";
import { logApifySuccess, logApifyFailure } from "@/lib/services/usage-logger";
import { createAIProvider, promptManager } from "@/lib/ai";
import { ExternalServiceError } from "@/lib/services/base-service";
import {
  getInjectableServiceApiKey,
  getServiceApiKeyOrNull,
  requireServiceApiKey,
} from "@/lib/agent/service-keys";
import { normalizeSegmentName, persistApprovedLeads } from "@/lib/agent/lead-persistence";
import { persistAgentCampaign } from "@/lib/agent/campaign-persistence";
import { transformProductRow, type ProductRow } from "@/types/product";
import { ICEBREAKER_CATEGORY_INSTRUCTIONS } from "@/types/ai-prompt";
import type { IcebreakerCategory } from "@/types/ai-prompt";
import type { IcebreakerExample } from "@/types/knowledge-base";
import type { LinkedInPost } from "@/types/apify";
import type {
  StepInput,
  StepOutput,
  StepType,
  SearchLeadResult,
  CreateCampaignOutput,
  CampaignStructureItem,
  LeadWithIcebreaker,
  ParsedBriefing,
} from "@/types/agent";
import type { AIModel } from "@/types/ai-provider";
import type { AIContextVariables } from "@/lib/services/knowledge-base-context";
import type { SupabaseClient } from "@supabase/supabase-js";

// ==============================================
// CONSTANTS
// ==============================================

const ICEBREAKER_BATCH_SIZE = 5;
const MAX_IB_EXAMPLES_IN_PROMPT = 3;

/**
 * Story 22.16: bolha de falha TOTAL da persistencia da campanha.
 *
 * Sem caminho de URL na frase de proposito: a rota real e `/campaigns`, e mandar o
 * usuario para `/campanhas` (que nao existe) o faz bater num 404 e concluir que o recurso
 * inteiro quebrou — justamente no estado em que ele ja perdeu algo.
 */
const CAMPAIGN_NOT_SAVED_NOTICE =
  "Nao consegui registrar a campanha na sua lista de Campanhas — ela continua nesta conversa e sera exportada normalmente, mas pode nao aparecer na lista.";

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

    // Story 17.11: Imported leads flow (both search steps skipped)
    const isImportedLeadsFlow =
      briefing.skipSteps?.includes("search_companies") &&
      briefing.skipSteps?.includes("search_leads");

    let leads: SearchLeadResult[];

    if (isImportedLeadsFlow && briefing.importedLeads && briefing.importedLeads.length > 0) {
      leads = briefing.importedLeads;
    } else if (previousStepOutput) {
      const prevLeads = previousStepOutput.leads as SearchLeadResult[] | undefined;
      if (!prevLeads || !Array.isArray(prevLeads) || prevLeads.length === 0) {
        throw new Error("Lista de leads do step anterior e obrigatoria para criacao de campanha");
      }
      leads = prevLeads;
    } else if (isImportedLeadsFlow) {
      throw new Error("Lista de leads importados esta vazia — forneca ao menos um lead no briefing");
    } else {
      throw new Error("Output do step anterior e obrigatorio para criacao de campanha");
    }

    // 2.3b - Enrich approved leads (email + full name) before campaign creation
    // Story 22.9: chave do Apollo injetada via service-role (ver search-leads-step).
    // Ausente -> `undefined` (service cai no caminho de hoje); nao decriptavel -> lanca.
    const apolloApiKey = await getInjectableServiceApiKey(this.tenantId, "apollo", "Apollo");
    const apolloService = new ApolloService(this.tenantId, apolloApiKey);
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

    // 2.4 - Progress message (Story 17.11: dynamic step count instead of hardcoded /5)
    const { data: allSteps } = await this.supabase
      .from("agent_steps")
      .select("status")
      .eq("execution_id", input.executionId);
    const stepsArray = Array.isArray(allSteps) ? allSteps : [];
    const activeSteps = stepsArray.length > 0
      ? stepsArray.filter((s: { status: string }) => s.status !== "skipped").length
      : 5;
    const activeStepIndex = stepsArray.length > 0
      ? stepsArray.filter((s: { status: string }) =>
          s.status !== "skipped" && s.status !== "pending"
        ).length
      : this.stepNumber;

    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "system",
      content: `Etapa ${activeStepIndex}/${activeSteps}: Criando campanha com emails personalizados para ${totalLeads} leads...`,
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
    // Story 22.5: campos tipados em ParsedBriefing. Defaults (COLD_OUTREACH/MEDIUM) aplicados
    // AQUI na leitura (null = usuario nao especificou) — comportamento identico ao cast anterior.
    const objective = briefing.objective ?? "COLD_OUTREACH";
    const urgency = briefing.urgency ?? "MEDIUM";
    // {{additional_description}} era variavel ORFA no template (nunca recebia valor); email_count
    // (vazio = heuristica por objetivo) sobrepoe a quantidade quando o usuario pediu (Task 6).
    const additionalDescription = briefing.campaignDescription ?? "";
    const emailCount = briefing.emailCount ? String(briefing.emailCount) : "";

    const structurePrompt = await promptManager.renderPrompt(
      "campaign_structure_generation",
      { ...aiVars, objective, urgency, additional_description: additionalDescription, email_count: emailCount },
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

    // 2.9 - Sub-step C: Generate icebreakers
    // Story 22.2: caminho premium (LinkedIn via Apify) quando o toggle esta ligado no briefing.
    const usePremium = Boolean(briefing.premiumIcebreakers);
    const apifyKey = usePremium ? await this.getApifyApiKey() : null;
    const icebreakerExamples = await this.loadIcebreakerExamples();
    const formattedExamples = CreateCampaignStep.formatIcebreakerExamples(icebreakerExamples, "lead");
    const { leadsWithIcebreakers, icebreakerStats, apifyCalls } = await this.generateIcebreakers(
      leads, aiVars, provider, formattedExamples, usePremium, apifyKey
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

    // Story 22.5: nome da campanha usa a descricao tipada (antes lida via cast briefingRecord).
    const campaignDescription = briefing.campaignDescription;
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
    // Story 22.2: contabiliza as chamadas Apify efetivamente feitas (0 quando o premium esta desligado).
    const cost: Record<string, number> = {
      apollo_enrich: enrichCredits,
      openai_structure: 1,
      openai_emails: totalEmails,
      openai_icebreakers: icebreakerStats.generated,
    };
    if (apifyCalls > 0) {
      cost.apify = apifyCalls;
    }

    // Story 22.15: persiste em "Meus Leads" os leads APROVADOS — aqui e o unico ponto do
    // pipeline onde eles ja estao aprovados (o orchestrator substituiu `leads` por
    // `approvedLeads`), REVELADOS (bloco de enrichment acima) e com icebreaker.
    //
    // Fail-open TOTAL: a campanha ja esta pronta e nunca pode cair por causa disto. A
    // derivacao do nome do segmento fica DENTRO do try de proposito — `briefing` vem de um
    // JSONB com mais de um escritor, e um `segmentName` nao-string nao pode escapar do
    // fail-open.
    const persistedLeadIds = await this.persistLeadsToMyLeads(
      input.executionId,
      leadsWithIcebreakers,
      briefing,
      campaignName
    );

    // Story 22.16: grava a campanha em `campaigns` para ela existir em /campaigns como
    // qualquer outra. Bloco fail-open SEPARADO do de cima e nessa ordem de proposito: a
    // campanha precisa dos `leadIds` que so a persistencia de leads produz, mas a
    // reciproca nao vale — leads falhando ainda deixa a campanha gravada com 0 leads.
    // Uma unica falha nunca pode custar as duas escritas.
    data.campaignId = await this.persistCampaignRow(
      input.executionId,
      campaignName,
      persistedLeadIds
    );

    return {
      success: true,
      data: data as unknown as Record<string, unknown>,
      cost,
    };
  }

  // ==============================================
  // PRIVATE HELPERS
  // ==============================================

  /**
   * Story 22.15: grava os leads aprovados em `leads` + segmento do tenant.
   *
   * Contrato desta funcao: NUNCA lanca. A campanha ja esta pronta quando chegamos aqui —
   * uma falha de RLS/rede na persistencia nao pode derrubar o step (o usuario perderia
   * uma execucao paga por causa de um efeito colateral). Toda falha vira log + bolha.
   *
   * As bolhas sao SEPARADAS de proposito:
   * - falha total (nada salvo)  -> "nao consegui salvar ... importe manualmente";
   * - sucesso parcial/`skipped` -> bolha INFORMATIVA. Mandar reimportar leads que ESTAO
   *   salvos e o que duplica a base que esta story existe para organizar.
   *
   * Story 22.16: devolve os `leads.id` efetivamente persistidos — a persistencia da
   * campanha precisa deles para associar `campaign_leads` sem reconsultar o banco.
   * Devolve `[]` quando a persistencia de leads nao chegou a rodar (nome inutilizavel) ou
   * lancou; depois que `persistApprovedLeads` RETORNOU, os ids sobrevivem ao catch de
   * proposito — os leads estao na base e a campanha tem que sair associada a eles.
   */
  private async persistLeadsToMyLeads(
    executionId: string,
    leadsWithIcebreakers: LeadWithIcebreaker[],
    briefing: ParsedBriefing,
    campaignName: string
  ): Promise<string[]> {
    let persisted = false;
    let leadIds: string[] = [];

    try {
      const segmentName =
        normalizeSegmentName(briefing.segmentName) ?? normalizeSegmentName(campaignName);

      if (!segmentName) return leadIds; // nome inutilizavel dos dois lados: nao ha o que fazer

      const result = await persistApprovedLeads({
        supabase: this.supabase,
        tenantId: this.tenantId,
        segmentName,
        leads: leadsWithIcebreakers,
      });

      // A partir daqui a persistencia JA rodou: nada mais pode levar a bolha de falha
      // total ("importe-os manualmente") — ela mandaria reimportar leads que estao salvos.
      persisted = true;
      // Story 22.16: defensivo contra um `leadIds` nao-array (o helper e mockado em
      // varios testes e o valor atravessa direto para o upsert de `campaign_leads`).
      leadIds = Array.isArray(result.leadIds) ? result.leadIds : [];

      const saved = result.inserted + result.reused;
      const savedLabel = `${saved} ${saved === 1 ? "lead" : "leads"}`;
      // "Salvei" so quando algo foi REALMENTE gravado nesta execucao. Com `inserted: 0`
      // (todos os leads ja estavam na base) a frase anunciava uma escrita que nao houve —
      // numa story cuja premissa e a mensagem honesta.
      const savedClause =
        result.inserted > 0
          ? `Salvei ${savedLabel} em Meus Leads`
          : `Seus ${savedLabel} ja estavam em Meus Leads`;
      const lines: string[] = [];

      if (saved === 0) {
        // Nao ha lead resolvido para citar: `savedClause` diria "Seus 0 leads ja estavam
        // em Meus Leads", frase absurda — e, no caminho degradado, o OPOSTO do que
        // aconteceu (o insert pode ter gravado e so nao devolvido os ids).
        if (result.degraded) {
          lines.push(
            "Nao consegui confirmar o salvamento dos leads em Meus Leads — parte deles pode ter sido gravada. Confira por la antes de importar de novo."
          );
        } else if (result.skipped > 0) {
          // Sem esta linha, a bolha diria apenas "N ficaram de fora" e o usuario suporia
          // que o RESTO foi salvo — nao havia resto.
          lines.push("Nenhum lead foi salvo em Meus Leads.");
        }
      } else if (result.degraded && result.segmentId === null) {
        // O segmento NAO existe: citar o nome como se existisse manda o usuario procurar
        // em Meus Leads uma lista que nunca foi criada.
        lines.push(
          `${savedClause}, mas nao consegui criar o segmento "${result.segmentName}" — eles estao na base, so nao agrupados nessa lista.`
        );
      } else if (result.degraded) {
        // `savedClause` tambem aqui: com `inserted: 0` (todos ja existiam) e a associacao
        // falhando, o "Salvei ... no segmento X" fixo anunciava uma escrita que nao houve
        // E mandava o usuario abrir uma lista onde os leads nao estao.
        lines.push(
          `${savedClause}, mas parte da gravacao falhou — pode faltar algum lead, icebreaker ou o agrupamento no segmento "${result.segmentName}".`
        );
      } else if (result.skipped > 0) {
        lines.push(`${savedClause} no segmento "${result.segmentName}".`);
      }

      if (result.skipped > 0) {
        lines.push(
          `${result.skipped} ${result.skipped === 1 ? "lead ficou" : "leads ficaram"} de fora por nao ter e-mail nem ID de origem.`
        );
      }

      if (lines.length === 0) return leadIds;

      await this.sendMyLeadsNotice(executionId, lines.join("\n"));
    } catch (error) {
      console.error("[CreateCampaignStep] Falha ao salvar leads em Meus Leads:", error);
      // `persisted` guarda o contrato de falha parcial: depois que `persistApprovedLeads`
      // retornou, os leads estao na base e mandar reimportar duplicaria a base que esta
      // story existe para organizar. Nesse caso so resta o log.
      if (!persisted) {
        await this.sendMyLeadsNotice(
          executionId,
          "Nao consegui salvar os leads em Meus Leads — a campanha foi criada normalmente. Se quiser te-los na base, importe-os manualmente."
        );
      }
    }

    return leadIds;
  }

  /**
   * Story 22.16: grava a campanha em `campaigns` (a linha que faz ela aparecer em
   * /campaigns) e associa os leads que a 22.15 acabou de persistir.
   *
   * Contrato desta funcao: NUNCA lanca. Devolve o `campaigns.id` para o output do step —
   * e por ele que o `export` sabe qual linha carimbar com o `external_campaign_id`, a
   * chave de que analytics (Epic 10/14), `reply-sweep` e webhook (Epic 21) dependem.
   *
   * IDEMPOTENCIA: le o `campaignId` do `output` JA gravado DESTE mesmo step. Uma
   * re-execucao (ajuste pos-rejeicao, 22.13) atualiza a linha existente em vez de criar
   * uma segunda campanha. Se a leitura falhar, seguimos como 1a vez — uma campanha extra
   * em rascunho e preferivel a nenhuma.
   */
  private async persistCampaignRow(
    executionId: string,
    campaignName: string,
    leadIds: string[]
  ): Promise<string | null> {
    try {
      const existingCampaignId = await this.readOwnCampaignId(executionId);

      const result = await persistAgentCampaign({
        supabase: this.supabase,
        tenantId: this.tenantId,
        existingCampaignId,
        name: campaignName,
        leadIds,
      });

      if (!result.campaignId) {
        await this.sendCampaignNotice(executionId, CAMPAIGN_NOT_SAVED_NOTICE);
        return null;
      }

      // Os dois sinais sao INDEPENDENTES e a bolha tem que dizer qual aconteceu: com um
      // booleano so, uma falha do rename avisava sobre contagem de leads (problema que
      // nao existia) e nunca contava que a campanha carrega o nome da versao rejeitada.
      const lines: string[] = [];
      if (result.nameStale) {
        lines.push(
          "A campanha ja estava na sua lista de Campanhas, mas nao consegui atualizar o registro dela — pode aparecer por la com o nome da versao anterior."
        );
      }
      if (result.associationDegraded) {
        // A campanha ESTA gravada: a bolha nao pode sugerir o contrario.
        lines.push(
          "Registrei a campanha na sua lista de Campanhas, mas nao consegui associar todos os leads — a contagem dela pode aparecer menor do que a real."
        );
      }

      if (lines.length > 0) {
        await this.sendCampaignNotice(executionId, lines.join("\n"));
      }

      return result.campaignId;
    } catch (error) {
      // `persistAgentCampaign` ja e fail-open; este catch existe para o imprevisto.
      console.error("[CreateCampaignStep] Falha ao registrar a campanha em Campanhas:", error);
      await this.sendCampaignNotice(executionId, CAMPAIGN_NOT_SAVED_NOTICE);
      return null;
    }
  }

  /**
   * Story 22.16: le o `campaignId` do `output` ja gravado DESTE step.
   *
   * O `StepInput` so carrega o output do step ANTERIOR — a propria linha nunca chega ao
   * step, dai o select explicito. `updateStepStatus("running")` so troca `status`, entao o
   * output da execucao anterior sobrevive ate o `saveCheckpoint`/`saveAwaitingApproval`
   * seguinte.
   *
   * Mecanismo espelhado do `readOwnRow` do ActivateStep (22.18) — reescrito aqui de
   * proposito: aquele e a guarda de idempotencia da ativacao e nao pode ganhar um segundo
   * dono.
   */
  private async readOwnCampaignId(executionId: string): Promise<string | null> {
    try {
      const { data } = await this.supabase
        .from("agent_steps")
        .select("output")
        .eq("execution_id", executionId)
        .eq("step_number", this.stepNumber)
        .single();

      const row = data as { output?: unknown } | null;
      const output =
        row?.output && typeof row.output === "object"
          ? (row.output as Record<string, unknown>)
          : null;

      const campaignId = output?.campaignId;
      return typeof campaignId === "string" && campaignId !== "" ? campaignId : null;
    } catch (error) {
      console.error(
        "[CreateCampaignStep] Nao consegui ler o campaignId da execucao anterior; seguindo como primeira vez:",
        error
      );
      return null;
    }
  }

  /**
   * Bolha de aviso sobre a campanha em /campanhas. Mesma regra da bolha de Meus Leads:
   * NUNCA lanca e checa o `{ error }` que o supabase-js RETORNA em vez de lancar.
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
        console.error("[CreateCampaignStep] Falha ao avisar sobre a campanha:", error);
      }
    } catch (messageError) {
      console.error("[CreateCampaignStep] Falha ao avisar sobre a campanha:", messageError);
    }
  }

  /**
   * Escreve uma bolha de aviso sobre "Meus Leads". NUNCA lanca e NUNCA propaga erro:
   * antes, esta escrita ficava dentro do try da persistencia, entao uma falha dela
   * derrubava o fluxo no catch e o usuario lia "importe-os manualmente" sobre leads que
   * ESTAVAM salvos. `supabase-js` tambem RETORNA `{ error }` em vez de lancar — sem
   * checar, a bolha informativa sumia da conversa em silencio.
   */
  private async sendMyLeadsNotice(executionId: string, content: string): Promise<void> {
    try {
      const { error } = await this.supabase.from("agent_messages").insert({
        execution_id: executionId,
        role: "system",
        content,
        metadata: { stepNumber: this.stepNumber, messageType: "text" },
      });
      if (error) {
        console.error("[CreateCampaignStep] Falha ao avisar sobre Meus Leads:", error);
      }
    } catch (messageError) {
      console.error("[CreateCampaignStep] Falha ao avisar sobre Meus Leads:", messageError);
    }
  }

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

  /**
   * Story 22.9: chave lida via SERVICE-ROLE (helper `service-keys`), nunca com
   * `this.supabase` (client de sessao) — a RLS admin-only de `api_configs` devolvia
   * zero linhas para um `sdr` e derrubava a geracao de conteudo com
   * "API key do OpenAI nao configurada". Mensagem de erro preservada.
   */
  private async getOpenAIApiKey(): Promise<string> {
    return requireServiceApiKey(this.tenantId, "openai", "OpenAI");
  }

  /**
   * Story 22.2: Fetch Apify API key DEFENSIVELY (fail-open).
   * Espelha getOpenAIApiKey, mas retorna null em vez de lancar quando a key nao existe
   * ou nao decodifica — assim, com o toggle premium ligado mas sem key, todos os leads
   * caem no fallback standard (AC3) em vez de derrubar o step.
   *
   * Story 22.9: idem — leitura via service-role, fail-open preservado.
   */
  private async getApifyApiKey(): Promise<string | null> {
    return getServiceApiKeyOrNull(this.tenantId, "apify");
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
    formattedExamples: string,
    usePremium: boolean,
    apifyKey: string | null
  ): Promise<{
    leadsWithIcebreakers: LeadWithIcebreaker[];
    icebreakerStats: { generated: number; premium: number; standard: number; failed: number; skipped: number };
    apifyCalls: number;
  }> {
    const leadsWithIcebreakers: LeadWithIcebreaker[] = [];
    const icebreakerStats = { generated: 0, premium: 0, standard: 0, failed: 0, skipped: 0 };

    // Story 22.2: premium so entra em cena com toggle ligado E key presente (fail-open — AC3).
    const premiumEnabled = usePremium && !!apifyKey;
    const apifyService = premiumEnabled ? new ApifyService() : null;
    let apifyCalls = 0;

    for (let i = 0; i < leads.length; i += ICEBREAKER_BATCH_SIZE) {
      const batch = leads.slice(i, i + ICEBREAKER_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (lead): Promise<{ text: string | null; kind: "premium" | "standard" }> => {
          // Caminho premium: toggle ligado + key + lead com LinkedIn. Fail-open para standard.
          if (premiumEnabled && apifyService && apifyKey && lead.linkedinUrl) {
            const premiumText = await this.generateSinglePremiumIcebreaker(
              lead, aiVars, provider, apifyService, apifyKey, () => { apifyCalls++; }
            );
            if (premiumText) {
              return { text: premiumText, kind: "premium" };
            }
            // sem posts / falha Apify / falha AI → cai no standard abaixo (AC3)
          }

          const standardText = await this.generateSingleIcebreaker(lead, aiVars, provider, formattedExamples);
          return { text: standardText, kind: "standard" };
        })
      );

      for (let j = 0; j < results.length; j++) {
        const lead = batch[j];
        const result = results[j];
        if (result.status === "fulfilled" && result.value.text) {
          leadsWithIcebreakers.push({ ...lead, icebreaker: result.value.text });
          icebreakerStats.generated++;
          if (result.value.kind === "premium") {
            icebreakerStats.premium++;
          } else {
            icebreakerStats.standard++;
          }
        } else {
          leadsWithIcebreakers.push({ ...lead, icebreaker: null });
          icebreakerStats.failed++;
        }
      }
    }

    return { leadsWithIcebreakers, icebreakerStats, apifyCalls };
  }

  /**
   * Story 22.2: Icebreaker PREMIUM — reusa ApifyService.fetchLinkedInPosts + prompt
   * icebreaker_premium_generation (nao duplica scraping). Fail-open: retorna null em
   * qualquer degradacao (sem posts, Apify falha, prompt/AI falha) para o chamador cair
   * no caminho standard. Espelha a politica de processPostCategory da rota enrich-icebreaker.
   */
  private async generateSinglePremiumIcebreaker(
    lead: SearchLeadResult,
    aiVars: AIContextVariables,
    provider: ReturnType<typeof createAIProvider>,
    apifyService: ApifyService,
    apifyKey: string,
    onApifyCall: () => void
  ): Promise<string | null> {
    if (!lead.linkedinUrl) return null;

    const apifyStart = Date.now();
    let postsResult: Awaited<ReturnType<ApifyService["fetchLinkedInPosts"]>>;
    try {
      onApifyCall();
      postsResult = await apifyService.fetchLinkedInPosts(apifyKey, lead.linkedinUrl, 3);
    } catch (error) {
      // fetchLinkedInPosts nao deveria lancar (retorna success:false), mas protegemos assim mesmo.
      logApifyFailure({
        tenantId: this.tenantId,
        errorMessage: error instanceof Error ? error.message : "Erro Apify",
        durationMs: Date.now() - apifyStart,
        metadata: { linkedinProfileUrl: lead.linkedinUrl, postLimit: 3, source: "agent" },
      }).catch(() => {});
      return null; // fallback standard
    }

    const durationMs = Date.now() - apifyStart;

    if (!postsResult.success || postsResult.posts.length === 0) {
      if (!postsResult.success) {
        logApifyFailure({
          tenantId: this.tenantId,
          errorMessage: postsResult.error || "Erro Apify",
          durationMs,
          metadata: { linkedinProfileUrl: lead.linkedinUrl, postLimit: 3, source: "agent" },
        }).catch(() => {});
      } else {
        logApifySuccess({
          tenantId: this.tenantId,
          postsFetched: 0,
          durationMs,
          metadata: { linkedinProfileUrl: lead.linkedinUrl, postLimit: 3, noPosts: true, source: "agent" },
        }).catch(() => {});
      }
      return null; // fallback standard
    }

    logApifySuccess({
      tenantId: this.tenantId,
      postsFetched: postsResult.posts.length,
      durationMs,
      metadata: { linkedinProfileUrl: lead.linkedinUrl, postLimit: 3, source: "agent" },
    }).catch(() => {});

    const variables: Record<string, string> = {
      ...aiVars,
      lead_name: lead.name,
      lead_title: lead.title ?? "",
      lead_company: lead.companyName ?? "",
      lead_industry: aiVars.target_industries || "Tecnologia",
      linkedin_posts: CreateCampaignStep.formatLinkedInPostsForPrompt(postsResult.posts),
    };

    try {
      const rendered = await promptManager.renderPrompt(
        "icebreaker_premium_generation",
        variables,
        { tenantId: this.tenantId }
      );

      if (!rendered) return null; // fallback standard

      const result = await provider.generateText(rendered.content, {
        temperature: rendered.metadata.temperature ?? 0.7,
        maxTokens: rendered.metadata.maxTokens ?? 300,
        model: (rendered.modelPreference ?? "gpt-4o") as AIModel,
        timeoutMs: 15000,
      });

      return result.text.trim() || null; // vazio → fallback standard
    } catch {
      // Prompt/AI falha no premium → fallback standard (AC3), nunca deixa o lead sem icebreaker
      return null;
    }
  }

  /**
   * Story 22.2: formata posts do LinkedIn para o prompt premium.
   * Espelha formatLinkedInPostsForPrompt da rota enrich-icebreaker.
   */
  static formatLinkedInPostsForPrompt(posts: LinkedInPost[]): string {
    if (posts.length === 0) {
      return "Nenhum post disponivel";
    }

    return posts
      .map((post, idx) => {
        const date = post.publishedAt
          ? new Date(post.publishedAt).toLocaleDateString("pt-BR")
          : "Data desconhecida";
        return `Post ${idx + 1} (${date}):\n${post.text}\nEngajamento: ${post.likesCount} curtidas, ${post.commentsCount} comentarios`;
      })
      .join("\n\n");
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
