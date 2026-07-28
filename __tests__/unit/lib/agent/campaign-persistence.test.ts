/**
 * Unit Tests — campaign-persistence (Story 22.16)
 *
 * Cobre a I/O & Edge-Case Matrix do modulo contra o `FakeDb`, NAO contra um chain-builder
 * generico: os defeitos que esta story existe para evitar (linha rejeitada por VARCHAR,
 * status fora do enum, associacao duplicada) so aparecem se o fake recusar o que o
 * Postgres recusaria.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  persistAgentCampaign,
  markCampaignExported,
  markCampaignActive,
  normalizeCampaignName,
} from "@/lib/agent/campaign-persistence";
import { FakeDb, createFakeSupabase, FAKE_TENANT } from "../../../helpers/fake-leads-db";

describe("campaign-persistence (Story 22.16)", () => {
  let db: FakeDb;
  let supabase: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    db = new FakeDb();
    supabase = createFakeSupabase(db);
    // `campaign_leads.lead_id` e FOREIGN KEY: o fake recusa (23503) associacao contra lead
    // que nao existe, como o Postgres. Os leads de referencia dos casos abaixo ficam
    // semeados aqui para que a asserçao de cada teste seja sobre a associacao em si.
    db.seedLead({ id: "lead-a" });
    db.seedLead({ id: "lead-b" });
    db.seedLead({ id: "lead-c" });
    // Os caminhos degradados logam com console.error de proposito.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==============================================
  // normalizeCampaignName
  // ==============================================

  describe("normalizeCampaignName", () => {
    it("corta em 200 CODE POINTS sem partir par substituto", () => {
      // 210 emojis: 210 code points, 420 unidades UTF-16. `slice(0, 200)` cru deixaria
      // um surrogate solto e o Postgres rejeitaria a linha INTEIRA.
      const name = "🚀".repeat(210);
      const normalized = normalizeCampaignName(name);

      expect(normalized).not.toBeNull();
      expect([...(normalized as string)]).toHaveLength(200);
      expect(normalized).toBe("🚀".repeat(200));
      // Nenhum surrogate solto sobrou.
      expect(/[\uD800-\uDFFF]/.test((normalized as string).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))).toBe(false);
    });

    it("nome dentro do limite passa intacto, so com trim", () => {
      expect(normalizeCampaignName("  Campanha - Teste Atibaia  ")).toBe(
        "Campanha - Teste Atibaia"
      );
    });

    it("vazio, so espacos ou nao-string viram null", () => {
      expect(normalizeCampaignName("")).toBeNull();
      expect(normalizeCampaignName("   ")).toBeNull();
      expect(normalizeCampaignName(null)).toBeNull();
      expect(normalizeCampaignName(42)).toBeNull();
    });
  });

  // ==============================================
  // persistAgentCampaign
  // ==============================================

  describe("persistAgentCampaign — insert (1a execucao)", () => {
    it("grava a campanha com tenant_id explicito e status draft, e associa os leads", async () => {
      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha - Teste Atibaia",
        leadIds: ["lead-a", "lead-b"],
      });

      expect(result.campaignId).toBeTruthy();
      expect(result.degraded).toBe(false);
      expect(result.associated).toBe(2);

      expect(db.campaigns).toHaveLength(1);
      const [campaign] = db.campaigns;
      // Sem `tenant_id` a RLS simplesmente esconde a linha da UI: a campanha "existe" e
      // continua invisivel, que e o bug desta story.
      expect(campaign.tenant_id).toBe(FAKE_TENANT);
      expect(campaign.name).toBe("Campanha - Teste Atibaia");
      expect(campaign.status).toBe("draft");
      expect(campaign.external_campaign_id).toBeNull();

      expect(db.campaignLeads).toHaveLength(2);
      expect(db.campaignLeads.every((cl) => cl.campaign_id === campaign.id)).toBe(true);
      expect(db.campaignLeads.map((cl) => cl.lead_id).sort()).toEqual(["lead-a", "lead-b"]);
    });

    it("usa o mecanismo do builder no upsert (onConflict + ignoreDuplicates)", async () => {
      await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: ["lead-a"],
      });

      const upsert = db.log.find((entry) => entry.table === "campaign_leads" && entry.op === "upsert");
      expect(upsert).toBeDefined();
      // Sem `onConflict` o alvo do upsert cai na PK `id` e a segunda execucao estoura
      // `unique_lead_per_campaign` em vez de ser no-op.
      expect(upsert?.upsertOptions).toEqual({
        onConflict: "campaign_id,lead_id",
        ignoreDuplicates: true,
      });
    });

    it("nome > 200 code points e truncado ANTES do insert (sem truncar, o Postgres rejeita a linha)", async () => {
      const longName = `Campanha - ${"á".repeat(400)}`;

      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: longName,
        leadIds: [],
      });

      expect(result.campaignId).toBeTruthy();
      expect(result.degraded).toBe(false);
      expect(db.campaigns).toHaveLength(1);
      expect([...db.campaigns[0].name]).toHaveLength(200);
      expect(db.campaigns[0].name.startsWith("Campanha - ")).toBe(true);
    });

    it("emoji no fim do corte: a linha entra (nenhum 22001, nenhum surrogate solto)", async () => {
      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "🚀".repeat(250),
        leadIds: [],
      });

      expect(result.campaignId).toBeTruthy();
      expect(db.campaigns).toHaveLength(1);
      expect([...db.campaigns[0].name]).toHaveLength(200);
    });

    it("leadIds vazio: campanha gravada assim mesmo, sem associacao", async () => {
      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha sem leads",
        leadIds: [],
      });

      expect(result.campaignId).toBeTruthy();
      expect(result.associated).toBe(0);
      expect(result.degraded).toBe(false);
      expect(db.campaigns).toHaveLength(1);
      expect(db.campaignLeads).toHaveLength(0);
      // Nenhuma query em campaign_leads: `.upsert([])` seria uma ida ao banco inutil.
      expect(db.log.some((entry) => entry.table === "campaign_leads")).toBe(false);
    });

    it("nome duplicado no tenant: as duas campanhas coexistem (nao ha unique de name)", async () => {
      const first = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha - Teste Atibaia",
        leadIds: [],
      });
      const second = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha - Teste Atibaia",
        leadIds: [],
      });

      expect(first.campaignId).toBeTruthy();
      expect(second.campaignId).toBeTruthy();
      expect(second.campaignId).not.toBe(first.campaignId);
      expect(db.campaigns).toHaveLength(2);
    });

    it("nome inutilizavel: nada e gravado e o resultado e degradado", async () => {
      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "   ",
        leadIds: ["lead-a"],
      });

      expect(result.campaignId).toBeNull();
      expect(result.degraded).toBe(true);
      expect(db.campaigns).toHaveLength(0);
      expect(db.campaignLeads).toHaveLength(0);
    });
  });

  describe("persistAgentCampaign — re-execucao (idempotencia)", () => {
    it("com existingCampaignId, atualiza o nome e NAO cria uma segunda campanha", async () => {
      const first = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha - versao rejeitada",
        leadIds: ["lead-a", "lead-b"],
      });

      const second = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        existingCampaignId: first.campaignId,
        name: "Campanha - briefing ajustado",
        leadIds: ["lead-a", "lead-b"],
      });

      expect(second.campaignId).toBe(first.campaignId);
      expect(db.campaigns).toHaveLength(1);
      expect(db.campaigns[0].name).toBe("Campanha - briefing ajustado");
      // Nenhum insert novo em `campaigns`.
      expect(db.log.filter((e) => e.table === "campaigns" && e.op === "insert")).toHaveLength(1);
    });

    it("re-executar apos uma rodada JA exportada/ativada zera o estado da rodada anterior", async () => {
      // Alcancavel pelo retry direto de `/steps/[n]/execute`: a rodada 1 exportou e
      // ativou, a rodada 2 vai criar uma campanha NOVA no Instantly. Manter o
      // `external_campaign_id` antigo faria analytics, reply-sweep e webhook lerem a
      // campanha SUPERSEDIDA, e o badge afirmaria uma ativacao que nao vale para a
      // sequencia nova.
      const seeded = db.seedCampaign({
        tenant_id: FAKE_TENANT,
        name: "Campanha - rodada 1",
        status: "active",
        external_campaign_id: "instantly-camp-ANTIGA",
        export_platform: "instantly",
        exported_at: new Date().toISOString(),
        export_status: "success",
      });

      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        existingCampaignId: seeded.id,
        name: "Campanha - rodada 2",
        leadIds: [],
      });

      expect(result.campaignId).toBe(seeded.id);
      expect(result.degraded).toBe(false);
      expect(db.campaigns).toHaveLength(1);

      const row = db.campaigns[0];
      expect(row.name).toBe("Campanha - rodada 2");
      expect(row.status).toBe("draft");
      expect(row.external_campaign_id).toBeNull();
      expect(row.export_platform).toBeNull();
      expect(row.exported_at).toBeNull();
      expect(row.export_status).toBeNull();
    });

    it("no caminho normal (rejeicao antes do export) o reset e no-op", async () => {
      const first = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha - v1",
        leadIds: [],
      });

      const second = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        existingCampaignId: first.campaignId,
        name: "Campanha - v2",
        leadIds: [],
      });

      expect(second.degraded).toBe(false);
      expect(db.campaigns[0].status).toBe("draft");
      expect(db.campaigns[0].external_campaign_id).toBeNull();
    });

    it("upsert idempotente: a segunda execucao nao duplica associacao nem erra", async () => {
      const first = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: ["lead-a", "lead-b"],
      });
      expect(first.associated).toBe(2);

      const second = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        existingCampaignId: first.campaignId,
        name: "Campanha",
        leadIds: ["lead-a", "lead-b", "lead-c"],
      });

      expect(second.degraded).toBe(false);
      // Só o lead novo conta como associado AGORA (os dois antigos foram DO NOTHING).
      expect(second.associated).toBe(1);
      expect(db.campaignLeads).toHaveLength(3);
    });

    it("leadIds repetidos no mesmo lote nao viram 23505 (dedupe antes do upsert)", async () => {
      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: ["lead-a", "lead-a", "lead-b"],
      });

      expect(result.degraded).toBe(false);
      expect(result.associated).toBe(2);
      expect(db.campaignLeads).toHaveLength(2);
    });

    it("existingCampaignId de uma linha que sumiu: insere uma nova (rascunho extra > nenhuma)", async () => {
      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        existingCampaignId: "campaign-que-o-usuario-apagou",
        name: "Campanha",
        leadIds: [],
      });

      expect(result.campaignId).toBeTruthy();
      expect(result.campaignId).not.toBe("campaign-que-o-usuario-apagou");
      expect(db.campaigns).toHaveLength(1);
    });

    it("update falhando NAO cai para o insert (uma segunda campanha e pior que o nome velho)", async () => {
      const first = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha - nome antigo",
        leadIds: [],
      });

      db.fail("campaigns", "update", { code: "42501", message: "permission denied" });

      const second = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        existingCampaignId: first.campaignId,
        name: "Campanha - nome novo",
        leadIds: ["lead-a"],
      });

      expect(second.campaignId).toBe(first.campaignId);
      // Sinais SEPARADOS: quem falhou foi o rename, nao a associacao. Com um booleano so,
      // a bolha do step avisaria sobre contagem de leads (problema inexistente) e nunca
      // contaria que a campanha carrega o nome da versao rejeitada.
      expect(second.nameStale).toBe(true);
      expect(second.associationDegraded).toBe(false);
      expect(second.degraded).toBe(true);
      expect(db.campaigns).toHaveLength(1);
      expect(db.campaigns[0].name).toBe("Campanha - nome antigo");
      // A associacao segue mesmo com o nome desatualizado — a campanha existe.
      expect(db.campaignLeads).toHaveLength(1);
    });
  });

  describe("persistAgentCampaign — falhas", () => {
    it("insert da campanha falhando: campaignId null, degradado e NUNCA lanca", async () => {
      db.fail("campaigns", "insert", { code: "42501", message: "permission denied for table campaigns" });

      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: ["lead-a"],
      });

      expect(result.campaignId).toBeNull();
      expect(result.associated).toBe(0);
      expect(result.degraded).toBe(true);
      expect(db.campaigns).toHaveLength(0);
      // Sem campanha nao ha o que associar: nenhuma escrita orfa em campaign_leads.
      expect(db.campaignLeads).toHaveLength(0);
    });

    it("falha DEPOIS do insert (associacao): a campanha SOBREVIVE e o resultado degrada", async () => {
      db.fail("campaign_leads", "upsert", { code: "42501", message: "permission denied for table campaign_leads" });

      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha - Teste Atibaia",
        leadIds: ["lead-a", "lead-b"],
      });

      // A campanha aparece na lista mesmo sem lead nenhum associado.
      expect(result.campaignId).toBeTruthy();
      expect(result.associated).toBe(0);
      expect(result.associationDegraded).toBe(true);
      expect(result.nameStale).toBe(false);
      expect(result.degraded).toBe(true);
      expect(db.campaigns).toHaveLength(1);
      expect(db.campaignLeads).toHaveLength(0);
    });

    it("mais de um chunk: o lote que falha nao leva os outros junto", async () => {
      // Nenhum outro teste passa de 3 leadIds, entao o `for (... of chunk(...))` nunca
      // rodava mais de uma volta: trocar o `continue` por `break`, ou colapsar o laco num
      // upsert unico, passava verde. Com 250 leads sao 3 lotes (100/100/50) e a falha
      // injetada derruba SO o primeiro.
      const leadIds = Array.from({ length: 250 }, (_, i) => `lead-${i}`);
      leadIds.forEach((id) => db.seedLead({ id }));
      db.fail(
        "campaign_leads",
        "upsert",
        { code: "23503", message: "insert or update violates foreign key constraint" },
        1
      );

      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha grande",
        leadIds,
      });

      // Os dois lotes seguintes gravaram: parcial NAO e zero, e nao e tudo.
      expect(result.campaignId).toBeTruthy();
      expect(result.associated).toBe(150);
      expect(db.campaignLeads).toHaveLength(150);
      // ...e o usuario e avisado de que a contagem pode vir menor.
      expect(result.associationDegraded).toBe(true);
      expect(result.degraded).toBe(true);
    });

    it("onConflict com alvo errado e recusado (42P10), como no Postgres", async () => {
      // Tripwire do fake: o alvo do `on_conflict` tem que nomear a constraint que existe.
      // Um alvo errado passa despercebido em memoria e derruba TODA associacao no banco.
      const { error } = await supabase
        .from("campaign_leads")
        .upsert([{ campaign_id: "c-1", lead_id: "lead-a" }], {
          onConflict: "id",
          ignoreDuplicates: true,
        });

      expect((error as { code?: string } | null)?.code).toBe("42P10");
      expect(db.campaignLeads).toHaveLength(0);
    });

    it("update falhou E a campanha nao existe mais: a associacao degrada (23503), nao inventa vinculo", async () => {
      // O caminho `nameStale` adota o `existingCampaignId` sem saber se a linha existe, e
      // segue para a Fase 3. Enquanto o fake aceitava qualquer `campaign_id`, esse cenario
      // certificava associacoes que o Postgres recusa pela FOREIGN KEY — e o usuario
      // receberia a bolha do nome sem nunca ouvir que os leads nao foram associados.
      db.fail("campaigns", "update", { code: "42501", message: "permission denied" });

      const result = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        existingCampaignId: "campanha-que-nao-existe",
        name: "Campanha",
        leadIds: ["lead-a", "lead-b"],
      });

      expect(result.campaignId).toBe("campanha-que-nao-existe");
      expect(result.nameStale).toBe(true);
      // O sinal que a bolha precisa: a contagem NAO vai bater.
      expect(result.associationDegraded).toBe(true);
      expect(result.associated).toBe(0);
      expect(db.campaignLeads).toHaveLength(0);
    });
  });

  // ==============================================
  // markCampaignExported
  // ==============================================

  describe("markCampaignExported", () => {
    it("grava os quatro campos de export com o shape do builder", async () => {
      const { campaignId } = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: [],
      });

      const before = Date.now();
      await markCampaignExported({
        supabase,
        campaignId: campaignId as string,
        externalCampaignId: "instantly-camp-123",
      });

      const [campaign] = db.campaigns;
      // A chave que liga o agente ao Epic 10/14/21: sem ela o reply-sweep e o webhook
      // nunca acham a campanha e a resposta do lead vira `skipped` silencioso.
      expect(campaign.external_campaign_id).toBe("instantly-camp-123");
      expect(campaign.export_platform).toBe("instantly");
      expect(campaign.export_status).toBe("success");
      expect(campaign.exported_at).toBeTruthy();
      expect(Date.parse(campaign.exported_at as string)).toBeGreaterThanOrEqual(before - 1000);
    });

    it("LANCA quando o supabase RETORNA erro (o caller depende disso para avisar)", async () => {
      const { campaignId } = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: [],
      });

      db.fail("campaigns", "update", { code: "42501", message: "permission denied" });

      await expect(
        markCampaignExported({
          supabase,
          campaignId: campaignId as string,
          externalCampaignId: "instantly-camp-123",
        })
      ).rejects.toThrow(/permission denied/i);
    });

    it("carimba SO a campanha pedida (as outras linhas ficam intactas)", async () => {
      // `updateExportStatus` filtra apenas por `id` — o escopo de tenant vem da RLS. Com
      // uma unica campanha semeada, um UPDATE que perdesse o filtro carimbaria "a linha
      // certa" por acidente e o teste ficaria verde. Com vizinhas na mesa, nao fica.
      const alvo = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha do agente",
        leadIds: [],
      });
      const vizinha = db.seedCampaign({ name: "Outra campanha do mesmo tenant" });
      const outroTenant = db.seedCampaign({
        tenant_id: "tenant-999",
        name: "Campanha de outro tenant",
      });

      await markCampaignExported({
        supabase,
        campaignId: alvo.campaignId as string,
        externalCampaignId: "instantly-camp-123",
      });

      const carimbada = db.campaigns.find((row) => row.id === alvo.campaignId);
      expect(carimbada?.external_campaign_id).toBe("instantly-camp-123");
      expect(carimbada?.export_status).toBe("success");
      expect(
        db.campaigns.find((row) => row.id === vizinha.id)?.external_campaign_id
      ).toBeNull();
      expect(
        db.campaigns.find((row) => row.id === outroTenant.id)?.external_campaign_id
      ).toBeNull();
    });

    it("campanha inexistente: LANCA em vez de reportar sucesso silencioso", async () => {
      // UPDATE que casa ZERO linhas volta `{ error: null }` no PostgREST. Sem a
      // conferencia por leitura, a campanha ficaria sem `external_campaign_id` — ou seja,
      // fora do analytics, do reply-sweep e do webhook — e ninguem saberia.
      //
      // A conferencia e um `.single()`, e `.single()` com ZERO linhas volta o ERRO
      // `PGRST116` (nao `{ data: null, error: null }`, que e o `.maybeSingle()`): o
      // caminho real de producao e o branch de `readError`, e e ELE que o teste tem que
      // pinar. O contrato que interessa ao caller e o mesmo — LANCA, entao a bolha sai.
      //
      // A asserçao pina ESSE branch e so ele: uma alternativa com `|` entre os tres
      // caminhos possiveis (readError / registro ausente / valor divergente) aceitaria
      // qualquer um deles, e trocar um pelo outro nunca ficaria vermelho.
      await expect(
        markCampaignExported({
          supabase,
          campaignId: "campaign-que-nao-existe",
          externalCampaignId: "instantly-camp-123",
        })
      ).rejects.toThrow(/multiple \(or no\) rows/i);
    });

    it("nao inventa sucesso quando a leitura de conferencia devolve outra campanha", async () => {
      const { campaignId } = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: [],
      });
      // O update passa, mas a leitura mostra um `external_campaign_id` diferente do que
      // pedimos (escrita perdida / linha trocada).
      db.campaigns[0].external_campaign_id = "outra-campanha";
      // O UPDATE tem que passar SEM erro (o ponto do teste e o sucesso silencioso), por
      // isso aqui nao ha injecao de falha — so o stub que faz o update nao gravar nada.
      const original = db.execute.bind(db);
      vi.spyOn(db, "execute").mockImplementation((ctx) => {
        if (ctx.table === "campaigns" && ctx.op === "update") return { data: [], error: null };
        return original(ctx);
      });

      await expect(
        markCampaignExported({
          supabase,
          campaignId: campaignId as string,
          externalCampaignId: "instantly-camp-123",
        })
      ).rejects.toThrow(/nao foi gravado/i);
    });
  });

  // ==============================================
  // markCampaignActive
  // ==============================================

  describe("markCampaignActive", () => {
    it("marca status active na linha do tenant", async () => {
      const { campaignId } = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: [],
      });
      expect(db.campaigns[0].status).toBe("draft");

      await markCampaignActive({ supabase, tenantId: FAKE_TENANT, campaignId: campaignId as string });

      expect(db.campaigns[0].status).toBe("active");
    });

    it("campanha de outro tenant: nao toca a linha E LANCA (zero linhas nao e sucesso)", async () => {
      const foreign = db.seedCampaign({ tenant_id: "tenant-999", name: "De outro tenant" });

      // O PostgREST devolve `{ error: null }` para um UPDATE que casou ZERO linhas. Sem
      // checar o retorno, o step reportaria sucesso e a campanha ficaria "Rascunho" para
      // sempre — em silencio, e sem caminho de correcao pela UI.
      await expect(
        markCampaignActive({ supabase, tenantId: FAKE_TENANT, campaignId: foreign.id })
      ).rejects.toThrow(/nao foi marcada como ativa/i);

      expect(db.campaigns[0].status).toBe("draft");
    });

    it("campanha inexistente (apagada no meio da execucao): LANCA", async () => {
      await expect(
        markCampaignActive({
          supabase,
          tenantId: FAKE_TENANT,
          campaignId: "campaign-que-nao-existe",
        })
      ).rejects.toThrow(/nao foi marcada como ativa/i);
    });

    it("LANCA quando o supabase RETORNA erro", async () => {
      const { campaignId } = await persistAgentCampaign({
        supabase,
        tenantId: FAKE_TENANT,
        name: "Campanha",
        leadIds: [],
      });

      db.fail("campaigns", "update", { code: "42501", message: "permission denied" });

      await expect(
        markCampaignActive({ supabase, tenantId: FAKE_TENANT, campaignId: campaignId as string })
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
