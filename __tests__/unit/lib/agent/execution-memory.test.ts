/**
 * Story 24.25 — Memória entre execuções (execution-memory.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  briefingLabel,
  findLeadWorkHistory,
  findSimilarExecutions,
  isSimilarBriefing,
} from "@/lib/agent/execution-memory";
import type { ParsedBriefing } from "@/types/agent";
import { createQueueSupabase } from "../../../helpers/queue-supabase";

const TENANT = "tenant-1";

function briefing(overrides: Partial<ParsedBriefing> = {}): ParsedBriefing {
  return {
    technology: null,
    jobTitles: ["CISO"],
    location: "São Paulo",
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("isSimilarBriefing", () => {
  it("cargo em comum (sem acento e caixa) e mesmo local -> parecido", () => {
    expect(
      isSimilarBriefing(briefing({ jobTitles: ["Diretor de Segurança"] }), {
        jobTitles: ["diretor de seguranca", "CTO"],
        location: "sao paulo",
      })
    ).toBe(true);
  });

  it("local diferente -> não é parecido", () => {
    expect(isSimilarBriefing(briefing(), briefing({ location: "Rio de Janeiro" }))).toBe(false);
  });

  it("um dos locais vazio -> compatível", () => {
    expect(isSimilarBriefing(briefing(), briefing({ location: null }))).toBe(true);
  });

  it("mesma tecnologia sem cargo em comum -> parecido", () => {
    expect(
      isSimilarBriefing(
        briefing({ technology: "Netskope", jobTitles: ["CTO"] }),
        briefing({ technology: "netskope", jobTitles: ["CFO"] })
      )
    ).toBe(true);
  });

  it("domínio de conta em comum -> parecido", () => {
    expect(
      isSimilarBriefing(
        briefing({ jobTitles: [], targetAccounts: [{ name: "X", domain: "https://www.bancox.com.br/", confidence: "high" }] }),
        briefing({ jobTitles: [], targetAccounts: [{ name: null, domain: "bancox.com.br", confidence: "high" }] })
      )
    ).toBe(true);
  });

  it("nada em comum -> não é parecido; briefing anterior inválido -> false", () => {
    expect(isSimilarBriefing(briefing(), briefing({ jobTitles: ["CFO"] }))).toBe(false);
    expect(isSimilarBriefing(briefing(), null)).toBe(false);
  });
});

describe("briefingLabel", () => {
  it("até 2 cargos e o local", () => {
    expect(briefingLabel(briefing({ jobTitles: ["CISO", "CTO", "CIO"] }))).toBe("CISO / CTO · São Paulo");
  });
  it("sem cargo usa a tecnologia ou 'lista de contas'", () => {
    expect(briefingLabel(briefing({ jobTitles: [], technology: "Netskope", location: null }))).toBe("Netskope");
    expect(briefingLabel(briefing({ jobTitles: [], location: null }))).toBe("lista de contas");
  });
});

describe("findSimilarExecutions", () => {
  const previous = { id: "exec-old", briefing: briefing(), created_at: "2026-10-20T15:00:00Z" };

  it("cita a execução parecida com respostas, oportunidades e reuniões", async () => {
    const fake = createQueueSupabase({
      agent_executions: [
        {
          data: [
            previous,
            { id: "exec-rio", briefing: briefing({ location: "Rio de Janeiro" }), created_at: "2026-10-19T15:00:00Z" },
          ],
        },
      ],
      agent_steps: [{ data: [{ execution_id: "exec-old", step_type: "create_campaign", output: { campaignId: "camp-1" } }] }],
      campaigns: [{ data: [{ id: "camp-1", name: "CISO SP" }] }],
      campaign_events: [
        {
          data: [
            { campaign_id: "camp-1", lead_email: "a@x.com" },
            { campaign_id: "camp-1", lead_email: "A@x.com" },
            { campaign_id: "camp-1", lead_email: "b@x.com" },
          ],
        },
      ],
      opportunities: [{ data: [{ campaign_id: "camp-1", status: "meeting_booked" }] }],
    });

    const memory = await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now");

    expect(memory).toEqual([
      {
        executionId: "exec-old",
        createdAt: "2026-10-20T15:00:00Z",
        label: "CISO · São Paulo",
        campaignName: "CISO SP",
        replies: 2,
        opportunities: 1,
        meetings: 1,
      },
    ]);
    const [execCall] = fake.callsTo("agent_executions");
    expect(execCall.chain.eq).toHaveBeenCalledWith("tenant_id", TENANT);
    expect(execCall.chain.neq).toHaveBeenCalledWith("id", "exec-now");
    expect(execCall.chain.neq).toHaveBeenCalledWith("status", "pending");
    expect(execCall.chain.limit).toHaveBeenCalledWith(30);
    // A execução do Rio não é parecida e nem entra na leitura dos steps.
    expect(fake.callsTo("agent_steps")[0].chain.in).toHaveBeenCalledWith("execution_id", ["exec-old"]);
    const [eventsCall] = fake.callsTo("campaign_events");
    expect(eventsCall.chain.eq).toHaveBeenCalledWith("event_type", "email_replied");
    expect(eventsCall.chain.eq).toHaveBeenCalledWith("tenant_id", TENANT);
  });

  it("campanha sem resultado -> zeros", async () => {
    const fake = createQueueSupabase({
      agent_executions: [{ data: [previous] }],
      agent_steps: [{ data: [{ execution_id: "exec-old", step_type: "export", output: { campaignId: "camp-1" } }] }],
      campaigns: [{ data: [{ id: "camp-1", name: "CISO SP" }] }],
      campaign_events: [{ data: [] }],
      opportunities: [{ data: [] }],
    });
    const [item] = await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now");
    expect(item).toMatchObject({ replies: 0, opportunities: 0, meetings: 0 });
  });

  it("campanha nunca exportada -> [] (filtra external_campaign_id)", async () => {
    const fake = createQueueSupabase({
      agent_executions: [{ data: [previous] }],
      agent_steps: [{ data: [{ execution_id: "exec-old", step_type: "create_campaign", output: { campaignId: "camp-draft" } }] }],
      campaigns: [{ data: [] }],
      campaign_events: [{ data: [] }],
      opportunities: [{ data: [] }],
    });
    expect(await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now")).toEqual([]);
    expect(fake.callsTo("campaigns")[0].chain.not).toHaveBeenCalledWith("external_campaign_id", "is", null);
  });

  it("parecida sem campanha -> [] e não lê resultados", async () => {
    const fake = createQueueSupabase({
      agent_executions: [{ data: [previous] }],
      agent_steps: [{ data: [] }],
    });
    expect(await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now")).toEqual([]);
    expect(fake.callsTo("campaign_events")).toHaveLength(0);
  });

  it("no máximo 3 execuções, as mais recentes com campanha (ordem do banco: desc)", async () => {
    // O banco devolve em `created_at desc`: e4 é a mais recente.
    const rows = [4, 3, 2, 1].map((n) => ({ id: `e${n}`, briefing: briefing(), created_at: `2026-10-0${n}T12:00:00Z` }));
    const fake = createQueueSupabase({
      agent_executions: [{ data: rows }],
      agent_steps: [{ data: rows.map((r) => ({ execution_id: r.id, step_type: "export", output: { campaignId: `c-${r.id}` } })) }],
      campaigns: [{ data: rows.map((r) => ({ id: `c-${r.id}`, name: `Camp ${r.id}` })) }],
    });
    const memory = await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now");
    expect(memory.map((m) => m.executionId)).toEqual(["e4", "e3", "e2"]);
    expect(fake.callsTo("agent_executions")[0].chain.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    // Resultados só das 3 escolhidas, uma leitura por campanha.
    expect(fake.callsTo("campaign_events").map((c) => c.chain.eq.mock.calls)).toHaveLength(3);
  });

  it("rascunhos recentes não escondem uma execução mais antiga com campanha exportada", async () => {
    const rows = [5, 4, 3, 2].map((n) => ({ id: `e${n}`, briefing: briefing(), created_at: `2026-10-0${n}T12:00:00Z` }));
    const fake = createQueueSupabase({
      agent_executions: [{ data: rows }],
      agent_steps: [{ data: rows.map((r) => ({ execution_id: r.id, step_type: "create_campaign", output: { campaignId: `c-${r.id}` } })) }],
      // e5, e4 e e3 são rascunhos (o filtro external_campaign_id não devolve); só e2 foi exportada.
      campaigns: [{ data: [{ id: "c-e2", name: "Exportada" }] }],
      campaign_events: [{ data: [{ lead_email: "a@x.com" }] }],
      opportunities: [{ data: [] }],
    });
    const memory = await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now");
    expect(memory).toEqual([
      expect.objectContaining({ executionId: "e2", campaignName: "Exportada", replies: 1 }),
    ]);
    expect(fake.callsTo("campaigns")[0].chain.in).toHaveBeenCalledWith("id", ["c-e5", "c-e4", "c-e3", "c-e2"]);
  });

  it("leitura de resultados cortada pelo teto -> a campanha não é citada com número parcial", async () => {
    const fake = createQueueSupabase({
      agent_executions: [{ data: [previous] }],
      agent_steps: [{ data: [{ execution_id: "exec-old", step_type: "export", output: { campaignId: "camp-1" } }] }],
      campaigns: [{ data: [{ id: "camp-1", name: "CISO SP" }] }],
      campaign_events: [{ data: Array.from({ length: 1000 }, (_, i) => ({ lead_email: `l${i}@x.com` })) }],
      opportunities: [{ data: [] }],
    });
    expect(await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now")).toEqual([]);
  });

  it("leitura que não termina -> [] dentro do prazo", async () => {
    const hanging = {
      from: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "neq", "order", "limit", "in", "not"]) {
          chain[method] = () => chain;
        }
        chain.then = () => new Promise(() => {});
        return chain;
      }),
    } as unknown as Parameters<typeof findSimilarExecutions>[0];
    const started = Date.now();
    expect(await findSimilarExecutions(hanging, TENANT, briefing(), "exec-now", 20)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(console.warn).toHaveBeenCalled();
  });

  it.each(["agent_executions", "agent_steps", "campaigns", "opportunities", "campaign_events"])(
    "erro em %s -> [] com console.warn",
    async (table) => {
      const queues: Record<string, Array<{ data?: unknown; error?: unknown }>> = {
        agent_executions: [{ data: [previous] }],
        agent_steps: [{ data: [{ execution_id: "exec-old", step_type: "export", output: { campaignId: "camp-1" } }] }],
        campaigns: [{ data: [{ id: "camp-1", name: "CISO SP" }] }],
        campaign_events: [{ data: [] }],
        opportunities: [{ data: [] }],
      };
      queues[table] = [{ error: { message: "boom" } }];
      const fake = createQueueSupabase(queues);
      expect(await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now")).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    }
  );

  it("exceção lançada -> []", async () => {
    const fake = createQueueSupabase({ agent_executions: [new Error("rede")] });
    expect(await findSimilarExecutions(fake.client, TENANT, briefing(), "exec-now")).toEqual([]);
  });
});

describe("findLeadWorkHistory", () => {
  it("lead e conta: resultado mapeado, mais recentes primeiro, conta exclui o próprio lead", async () => {
    const fake = createQueueSupabase({
      leads: [
        // por apollo_id
        { data: [{ id: "l1", apollo_id: "ap-1", company_name: "Acme" }] },
        // por company_name (inclui o próprio lead, que precisa ser excluído)
        {
          data: [
            { id: "l1", apollo_id: "ap-1", company_name: "Acme" },
            { id: "l2", apollo_id: "ap-9", company_name: "Acme" },
            { id: "l3", apollo_id: "ap-8", company_name: "Acme" },
          ],
        },
      ],
      campaign_leads: [
        {
          data: [
            { campaign_id: "c1", lead_id: "l1", added_at: "2026-09-01T12:00:00Z" },
            { campaign_id: "c2", lead_id: "l1", added_at: "2026-10-01T12:00:00Z" },
            { campaign_id: "c3", lead_id: "l1", added_at: "2026-08-01T12:00:00Z" },
            { campaign_id: "c4", lead_id: "l1", added_at: "2026-07-01T12:00:00Z" },
            { campaign_id: "c2", lead_id: "l2", added_at: "2026-10-02T12:00:00Z" },
          ],
        },
      ],
      campaigns: [
        {
          data: [
            { id: "c1", name: "Camp 1", created_at: "2026-09-01T12:00:00Z" },
            { id: "c2", name: "Camp 2", created_at: "2026-10-01T12:00:00Z" },
            { id: "c3", name: "Camp 3", created_at: "2026-08-01T12:00:00Z" },
            { id: "c4", name: "Camp 4", created_at: "2026-07-01T12:00:00Z" },
          ],
        },
      ],
      opportunities: [
        {
          data: [
            { lead_id: "l1", campaign_id: "c2", source: "reply", intent: "interessado", status: "meeting_booked" },
            { lead_id: "l1", campaign_id: "c3", source: "reply", intent: "opt_out", status: "new" },
            { lead_id: "l2", campaign_id: "c2", source: "engagement", intent: null, status: "new" },
          ],
        },
      ],
    });

    const history = await findLeadWorkHistory(fake.client, TENANT, ["ap-1"], ["Acme"]);

    expect(history.leads["ap-1"]).toEqual([
      { campaignName: "Camp 2", date: "2026-10-01T12:00:00Z", result: "meeting_booked" },
      { campaignName: "Camp 1", date: "2026-09-01T12:00:00Z", result: "no_reply" },
      { campaignName: "Camp 3", date: "2026-08-01T12:00:00Z", result: "opt_out" },
    ]);
    // Só l2 (l3 nunca esteve em campanha; l1 é o próprio lead).
    expect(history.accounts["Acme"]).toEqual({
      contacts: 1,
      lastCampaignName: "Camp 2",
      lastDate: "2026-10-02T12:00:00Z",
      result: "engaged",
    });
    const [byId, byCompany] = fake.callsTo("leads");
    expect(byId.chain.eq).toHaveBeenCalledWith("tenant_id", TENANT);
    expect(byId.chain.in).toHaveBeenCalledWith("apollo_id", ["ap-1"]);
    expect(byCompany.chain.in).toHaveBeenCalledWith("company_name", ["Acme"]);
    expect(byCompany.chain.ilike).not.toHaveBeenCalled();
    expect(byCompany.chain.or).not.toHaveBeenCalled();
  });

  it.each([
    [{ source: "reply", intent: "interessado", status: "new" }, "replied"],
    [{ source: "engagement", intent: null, status: "viewed" }, "engaged"],
    [{ source: "reply", intent: null, status: "discarded" }, "discarded"],
    [{ source: "reply", intent: "opt_out", status: "discarded" }, "opt_out"],
  ])("oportunidade %o -> %s", async (opp, expected) => {
    const fake = createQueueSupabase({
      leads: [{ data: [{ id: "l1", apollo_id: "ap-1", company_name: null }] }],
      campaign_leads: [{ data: [{ campaign_id: "c1", lead_id: "l1", added_at: "2026-09-01T12:00:00Z" }] }],
      campaigns: [{ data: [{ id: "c1", name: "Camp 1", created_at: null }] }],
      opportunities: [{ data: [{ lead_id: "l1", campaign_id: "c1", ...opp }] }],
    });
    const history = await findLeadWorkHistory(fake.client, TENANT, ["ap-1"], []);
    expect(history.leads["ap-1"][0].result).toBe(expected);
  });

  it("lead novo -> mapas vazios", async () => {
    const fake = createQueueSupabase({ leads: [{ data: [] }, { data: [] }] });
    const history = await findLeadWorkHistory(fake.client, TENANT, ["ap-x"], ["Nova"]);
    expect(history).toEqual({ leads: {}, accounts: {} });
    expect(fake.callsTo("campaign_leads")).toHaveLength(0);
  });

  it("sem ids nem nomes -> não lê nada", async () => {
    const fake = createQueueSupabase();
    expect(await findLeadWorkHistory(fake.client, TENANT, [null, ""], [undefined])).toEqual({ leads: {}, accounts: {} });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it.each(["leads", "campaign_leads", "campaigns", "opportunities"])("erro em %s -> mapas vazios", async (table) => {
    const queues: Record<string, Array<{ data?: unknown; error?: unknown }>> = {
      leads: [{ data: [{ id: "l1", apollo_id: "ap-1", company_name: null }] }],
      campaign_leads: [{ data: [{ campaign_id: "c1", lead_id: "l1", added_at: "2026-09-01T12:00:00Z" }] }],
      campaigns: [{ data: [{ id: "c1", name: "Camp 1", created_at: null }] }],
      opportunities: [{ data: [] }],
    };
    queues[table] = [{ error: { message: "boom" } }];
    const fake = createQueueSupabase(queues);
    expect(await findLeadWorkHistory(fake.client, TENANT, ["ap-1"], [])).toEqual({ leads: {}, accounts: {} });
    expect(console.warn).toHaveBeenCalled();
  });

  it("aplica o teto de 500 ids", async () => {
    const fake = createQueueSupabase({ leads: [{ data: [] }, { data: [] }] });
    const ids = Array.from({ length: 600 }, (_, i) => `ap-${i}`);
    await findLeadWorkHistory(fake.client, TENANT, ids, []);
    const requested = fake
      .callsTo("leads")
      .flatMap((call) => call.chain.in.mock.calls.map(([, values]) => values as string[]))
      .flat();
    expect(requested).toHaveLength(500);
  });

  it("campanha nunca exportada fica de fora (como apagada)", async () => {
    const fake = createQueueSupabase({
      leads: [{ data: [{ id: "l1", apollo_id: "ap-1", company_name: null }] }],
      campaign_leads: [
        {
          data: [
            { campaign_id: "c-exp", lead_id: "l1", added_at: "2026-09-01T12:00:00Z" },
            { campaign_id: "c-draft", lead_id: "l1", added_at: "2026-10-01T12:00:00Z" },
          ],
        },
      ],
      // A leitura filtra `external_campaign_id IS NOT NULL`: o rascunho não volta.
      campaigns: [{ data: [{ id: "c-exp", name: "Exportada", created_at: null }] }],
      opportunities: [{ data: [] }],
    });
    const history = await findLeadWorkHistory(fake.client, TENANT, ["ap-1"], []);
    expect(history.leads["ap-1"]).toEqual([
      { campaignName: "Exportada", date: "2026-09-01T12:00:00Z", result: "no_reply" },
    ]);
    expect(fake.callsTo("campaigns")[0].chain.not).toHaveBeenCalledWith("external_campaign_id", "is", null);
  });

  it("conta com opt-out e engajamento mostra 'pediu para sair'", async () => {
    const fake = createQueueSupabase({
      leads: [
        { data: [] },
        {
          data: [
            { id: "l2", apollo_id: "ap-2", company_name: "Acme" },
            { id: "l3", apollo_id: "ap-3", company_name: "Acme" },
          ],
        },
      ],
      campaign_leads: [
        {
          data: [
            { campaign_id: "c1", lead_id: "l2", added_at: "2026-09-01T12:00:00Z" },
            { campaign_id: "c1", lead_id: "l3", added_at: "2026-09-01T12:00:00Z" },
          ],
        },
      ],
      campaigns: [{ data: [{ id: "c1", name: "Camp 1", created_at: null }] }],
      opportunities: [
        {
          data: [
            { lead_id: "l2", campaign_id: "c1", source: "reply", intent: "opt_out", status: "new" },
            { lead_id: "l3", campaign_id: "c1", source: "engagement", intent: null, status: "new" },
          ],
        },
      ],
    });
    const history = await findLeadWorkHistory(fake.client, TENANT, ["ap-1"], ["Acme"]);
    expect(history.accounts["Acme"].result).toBe("opt_out");
  });

  it("leitura de campaign_leads cortada pelo teto -> o lead não aparece com histórico parcial", async () => {
    const fake = createQueueSupabase({
      leads: [{ data: [{ id: "l1", apollo_id: "ap-1", company_name: null }] }],
      campaign_leads: [
        {
          data: Array.from({ length: 1000 }, (_, i) => ({
            campaign_id: `c${i}`,
            lead_id: "l1",
            added_at: "2026-09-01T12:00:00Z",
          })),
        },
      ],
      campaigns: [{ data: [{ id: "c0", name: "Camp 0", created_at: null }] }],
      opportunities: [{ data: [] }],
    });
    const history = await findLeadWorkHistory(fake.client, TENANT, ["ap-1"], []);
    expect(history.leads["ap-1"]).toBeUndefined();
  });

  it("nomes de empresa vão em lotes de 20 e um lote cortado só some com aquelas contas", async () => {
    const names = Array.from({ length: 25 }, (_, i) => `Empresa ${i}`);
    const fake = createQueueSupabase({
      leads: [
        // lote 1 (20 nomes) volta cheio: contas desse lote ficam de fora
        { data: Array.from({ length: 1000 }, (_, i) => ({ id: `x${i}`, apollo_id: `ax${i}`, company_name: "Empresa 0" })) },
        // lote 2 (5 nomes)
        { data: [{ id: "l2", apollo_id: "ap-2", company_name: "Empresa 24" }] },
      ],
      campaign_leads: [
        {
          data: [
            { campaign_id: "c1", lead_id: "x0", added_at: "2026-09-01T12:00:00Z" },
            { campaign_id: "c1", lead_id: "l2", added_at: "2026-09-01T12:00:00Z" },
          ],
        },
      ],
      campaigns: [{ data: [{ id: "c1", name: "Camp 1", created_at: null }] }],
      opportunities: [{ data: [] }],
    });
    const history = await findLeadWorkHistory(fake.client, TENANT, [], names);
    const batches = fake.callsTo("leads").map((call) => call.chain.in.mock.calls[0][1] as string[]);
    expect(batches.map((b) => b.length)).toEqual([20, 5]);
    expect(history.accounts["Empresa 0"]).toBeUndefined();
    expect(history.accounts["Empresa 24"]).toMatchObject({ contacts: 1, lastCampaignName: "Camp 1" });
  });
});
