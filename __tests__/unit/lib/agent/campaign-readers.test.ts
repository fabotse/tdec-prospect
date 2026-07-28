/**
 * Unit Tests — a linha do agente passada pelos LEITORES reais (Story 22.16)
 *
 * Licao do Epic 21: os leitores sao o teste que importa. Gravar em `campaigns` so serve
 * se a linha resultante atravessar `transformCampaignRowWithCount` + o embed de contagem
 * da rota + `getCampaignStatusConfig` sem produzir `undefined`, nome vazio ou data
 * inparseavel. `getCampaignStatusConfig` faz lookup SEM fallback: um status fora do enum
 * vira um badge com o texto literal `undefined` na tela.
 *
 * Nada aqui e mock: a linha vem do que `persistAgentCampaign` REALMENTE gravou no
 * `FakeDb`, e o embed `lead_count:campaign_leads(count)` e reproduzido a partir das
 * associacoes que o proprio helper criou.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  persistAgentCampaign,
  markCampaignExported,
  markCampaignActive,
} from "@/lib/agent/campaign-persistence";
import {
  transformCampaignRowWithCount,
  getCampaignStatusConfig,
  campaignStatusValues,
  type CampaignRowWithCount,
} from "@/types/campaign";
import { FakeDb, createFakeSupabase, FAKE_TENANT } from "../../../helpers/fake-leads-db";

/**
 * A linha como o PostgREST a devolve para o select da rota
 * (`*, lead_count:campaign_leads(count), products(name)`): a contagem chega como
 * AGREGADO ANINHADO (`[{ count: n }]`), nao como numero, e o produto como embed
 * (`{ name } | null`).
 */
function selectAsPostgrest(db: FakeDb, campaignId: string): Record<string, unknown> {
  const row = db.campaigns.find((c) => c.id === campaignId);
  if (!row) throw new Error("campanha nao encontrada no fake");
  const count = db.campaignLeads.filter((cl) => cl.campaign_id === campaignId).length;
  return {
    ...row,
    lead_count: [{ count }],
    // A campanha do agente nunca tem produto: `product_id` null => embed null.
    products: null,
  };
}

/**
 * O ACHATAMENTO exato de `GET /api/campaigns` (route.ts, L58-68). Copiado byte a byte de
 * proposito: os dois passos que podem de fato produzir contagem errada sao justamente
 * `row.lead_count[0]?.count || 0` e `row.products?.name ?? null` — pular esses passos
 * seria o arquivo "os leitores sao o teste que importa" testando tudo menos os leitores.
 */
function flattenLikeRoute(row: Record<string, unknown>): CampaignRowWithCount {
  const leadCount = Array.isArray(row.lead_count)
    ? (row.lead_count[0] as { count?: number } | undefined)?.count || 0
    : 0;
  const productName = (row.products as { name?: string } | null)?.name ?? null;
  return {
    ...row,
    lead_count: leadCount,
    product_name: productName,
  } as unknown as CampaignRowWithCount;
}

function readAsCampaignsList(db: FakeDb, campaignId: string): CampaignRowWithCount {
  return flattenLikeRoute(selectAsPostgrest(db, campaignId));
}

describe("leitores de campanha sobre a linha do agente (Story 22.16)", () => {
  let db: FakeDb;
  let supabase: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    db = new FakeDb();
    supabase = createFakeSupabase(db);
    // `campaign_leads.lead_id` e FOREIGN KEY (o fake a aplica, 23503): os leads que estes
    // casos associam precisam existir para que a contagem do embed seja sobre associacoes
    // reais.
    db.seedLead({ id: "lead-a" });
    db.seedLead({ id: "lead-b" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a campanha recem-gravada atravessa a lista com label, nome e datas validos", async () => {
    const { campaignId } = await persistAgentCampaign({
      supabase,
      tenantId: FAKE_TENANT,
      name: "Campanha - Teste Atibaia",
      leadIds: ["lead-a", "lead-b"],
    });

    const campaign = transformCampaignRowWithCount(
      readAsCampaignsList(db, campaignId as string)
    );

    expect(campaign.id).toBe(campaignId);
    expect(campaign.tenantId).toBe(FAKE_TENANT);
    expect(campaign.name).toBe("Campanha - Teste Atibaia");
    expect(campaign.name.trim()).not.toBe("");
    expect(campaign.leadCount).toBe(2);
    // `products(name)` volta null e todo caller usa `?.` — nao pode explodir.
    expect(campaign.productName).toBeNull();
    expect(campaign.productId).toBeNull();

    // Ordenacao da lista e `toLocaleDateString` dependem disto.
    expect(Number.isNaN(Date.parse(campaign.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(campaign.updatedAt))).toBe(false);

    // Lookup SEM fallback: status fora do enum viraria label `undefined` na tela.
    expect(campaignStatusValues).toContain(campaign.status);
    const config = getCampaignStatusConfig(campaign.status);
    expect(config.label).toBeDefined();
    expect(config.label).toBe("Rascunho");
    expect(config.variant).toBeDefined();
  });

  it("campanha com ZERO leads: contagem 0, sem quebrar nenhum leitor", async () => {
    const { campaignId } = await persistAgentCampaign({
      supabase,
      tenantId: FAKE_TENANT,
      name: "Campanha sem leads",
      leadIds: [],
    });

    const campaign = transformCampaignRowWithCount(
      readAsCampaignsList(db, campaignId as string)
    );

    expect(campaign.leadCount).toBe(0);
    expect(getCampaignStatusConfig(campaign.status).label).toBe("Rascunho");
    // Ainda nao exportada: os quatro campos normalizados para null (a pagina de analytics
    // mostra o EmptyState "ainda nao foi exportada").
    expect(campaign.externalCampaignId).toBeNull();
    expect(campaign.exportPlatform).toBeNull();
    expect(campaign.exportedAt).toBeNull();
    expect(campaign.exportStatus).toBeNull();
  });

  it("apos markCampaignExported o external_campaign_id chega preenchido aos leitores", async () => {
    const { campaignId } = await persistAgentCampaign({
      supabase,
      tenantId: FAKE_TENANT,
      name: "Campanha",
      leadIds: ["lead-a"],
    });

    await markCampaignExported({
      supabase,
      campaignId: campaignId as string,
      externalCampaignId: "instantly-camp-123",
    });

    const campaign = transformCampaignRowWithCount(
      readAsCampaignsList(db, campaignId as string)
    );

    // Esta e a chave de que analytics (Epic 10/14), reply-sweep e webhook (Epic 21)
    // dependem. Enquanto ela for null, a campanha esta na lista e fora do produto.
    expect(campaign.externalCampaignId).toBe("instantly-camp-123");
    expect(campaign.exportPlatform).toBe("instantly");
    expect(campaign.exportStatus).toBe("success");
    expect(Number.isNaN(Date.parse(campaign.exportedAt as string))).toBe(false);
  });

  it("apos markCampaignActive o badge vira 'Ativa' (e nao um label indefinido)", async () => {
    const { campaignId } = await persistAgentCampaign({
      supabase,
      tenantId: FAKE_TENANT,
      name: "Campanha",
      leadIds: [],
    });

    await markCampaignActive({
      supabase,
      tenantId: FAKE_TENANT,
      campaignId: campaignId as string,
    });

    const campaign = transformCampaignRowWithCount(
      readAsCampaignsList(db, campaignId as string)
    );

    expect(campaign.status).toBe("active");
    const config = getCampaignStatusConfig(campaign.status);
    expect(config.label).toBe("Ativa");
    expect(config.variant).toBe("success");
  });

  it("nome truncado em 200 code points continua renderizavel (nao vazio, sem surrogate solto)", async () => {
    const { campaignId } = await persistAgentCampaign({
      supabase,
      tenantId: FAKE_TENANT,
      name: `Campanha - ${"🚀".repeat(300)}`,
      leadIds: [],
    });

    const campaign = transformCampaignRowWithCount(
      readAsCampaignsList(db, campaignId as string)
    );

    expect([...campaign.name]).toHaveLength(200);
    expect(campaign.name.startsWith("Campanha - ")).toBe(true);
    // Sem surrogate solto: remover os pares completos nao pode deixar meia unidade.
    const withoutPairs = campaign.name.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
    expect(/[\uD800-\uDFFF]/.test(withoutPairs)).toBe(false);
  });
});
