/**
 * Tests for POST /api/opportunities/:opportunityId/meeting-prep
 * Story 24.23: Preparação de reunião — cada linha da matriz I/O da spec.
 *
 * Sem rede: Supabase (sessão e admin), dossiê, provas, chave e gerador mockados.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUserProfile = vi.fn();
const mockGetApiKey = vi.fn();
const mockLogUsage = vi.fn();
const mockFetchProofs = vi.fn();
const mockLookup = vi.fn();
const mockGenerate = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

interface Chain {
  table: string;
  calls: Array<[string, unknown[]]>;
  result: { data: unknown; error: unknown };
}

/** Chain genérico: registra cada método e resolve no await ou em single/maybeSingle. */
function makeChain(table: string, result: { data: unknown; error: unknown }, log: Chain[]) {
  const record: Chain = { table, calls: [], result };
  log.push(record);
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update", "in", "ilike"]) {
    chain[m] = (...args: unknown[]) => {
      record.calls.push([m, args]);
      return chain;
    };
  }
  chain.single = () => {
    record.calls.push(["single", []]);
    return Promise.resolve(result);
  };
  chain.maybeSingle = () => {
    record.calls.push(["maybeSingle", []]);
    return Promise.resolve(result);
  };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

let sessionChains: Chain[] = [];
let adminChains: Chain[] = [];
let tableResults: Record<string, Array<{ data: unknown; error: unknown }>> = {};
let adminResults: Record<string, { data: unknown; error: unknown }> = {};

const sessionClient = {
  from: (table: string) => {
    const queue = tableResults[table] ?? [];
    const result = queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: null, error: null });
    return makeChain(table, result, sessionChains);
  },
};
const adminClient = {
  __isAdmin: true,
  from: (table: string) => makeChain(table, adminResults[table] ?? { data: null, error: null }, adminChains),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => sessionClient),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));
vi.mock("@/lib/utils/monitoring-processor", () => ({
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
  logMonitoringUsage: (...args: unknown[]) => mockLogUsage(...args),
}));
vi.mock("@/lib/services/knowledge-base-proofs", () => ({
  fetchKnowledgeBaseProofs: (...args: unknown[]) => mockFetchProofs(...args),
}));
vi.mock("@/lib/agent/dossier/dossier-lookup", () => ({
  lookupAccountDossier: (...args: unknown[]) => mockLookup(...args),
}));
vi.mock("@/lib/meeting-prep/generator", () => ({
  generateMeetingPrep: (...args: unknown[]) => mockGenerate(...args),
}));

import { POST } from "@/app/api/opportunities/[opportunityId]/meeting-prep/route";
import type { MeetingPrep } from "@/types/meeting-prep";

const TENANT = "tenant-1";
const OPP_ID = "opp-1";

const baseRow = {
  id: OPP_ID,
  tenant_id: TENANT,
  lead_id: "lead-1",
  campaign_id: "camp-1",
  source: "reply",
  reply_text: "Tenho interesse",
  reply_subject: "Re: Proposta",
  intent: "interessado",
  status: "viewed",
  open_count: null,
  click_count: null,
  last_engagement_at: null,
  meeting_booked_at: null,
  created_at: "2026-11-02T10:00:00Z",
  lead: { id: "lead-1", email: "John@Acme.com", company_name: "Acme", title: "CTO" },
};

const FOUND_VIEW = {
  status: "found",
  dossier: {
    id: "d1",
    companyName: "Acme",
    companyDomain: "acme.com",
    dossierStatus: "complete",
    failedSources: [],
    researchedAt: "2026-11-01T00:00:00Z",
    expired: false,
  },
  facts: [
    { kind: "news", fato: "Acme abriu filial", fonteUrl: "https://n.com/1", data: "2026-10-01", confianca: "alta", isTriggerSource: false },
  ],
  totalFacts: 1,
  whyNow: null,
};

const GOOD_RESULT = {
  talkingPoints: [
    { text: "A", origin: "dossie", refs: ["F1"] },
    { text: "B", origin: "resposta", refs: ["R"] },
    { text: "C", origin: "kb", refs: ["P1"] },
  ],
  objections: [{ objection: "Caro", answer: "ROI", origin: "kb", refs: ["KB-OBJ"] }],
  usage: { model: "gpt-5.4-mini", promptTokens: 1000, completionTokens: 300, durationMs: 10 },
};

const SAVED_PREP: MeetingPrep = {
  version: 1,
  generatedAt: "2026-11-05T10:00:00.000Z",
  account: {
    status: "none",
    companyName: null,
    companyDomain: null,
    researchedAt: null,
    expired: false,
    facts: [],
    whyNow: null,
  },
  engagement: {
    source: "reply",
    campaignName: null,
    replySubject: null,
    replyText: null,
    repliedAt: null,
    openCount: null,
    clickCount: null,
    lastEngagementAt: null,
    meetingBookedAt: null,
    events: [],
  },
  talkingPoints: [
    { text: "x", origin: "sugestao", refs: [] },
    { text: "y", origin: "sugestao", refs: [] },
    { text: "z", origin: "sugestao", refs: [] },
  ],
  objections: [{ objection: "Caro", answer: "ROI", origin: "sugestao", refs: [] }],
  kbRefs: [],
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/opportunities/opp-1/meeting-prep", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const params = { params: Promise.resolve({ opportunityId: OPP_ID }) };

function setup({
  row = baseRow as unknown,
  loadError = null as unknown,
  updateError = null as unknown,
  eventsResult = { data: [{ event_type: "email_replied", event_timestamp: "2026-11-02T09:00:00Z" }], error: null } as {
    data: unknown;
    error: unknown;
  },
} = {}) {
  tableResults = {
    opportunities: [
      { data: row, error: loadError },
      { data: null, error: updateError },
    ],
    campaigns: [{ data: { name: "Q4" }, error: null }],
    campaign_events: [eventsResult],
  };
}

function updateChain() {
  return sessionChains.find((c) => c.table === "opportunities" && c.calls.some(([m]) => m === "update"));
}

describe("POST /api/opportunities/:opportunityId/meeting-prep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionChains = [];
    adminChains = [];
    adminResults = {
      knowledge_base: { data: { content: { pain_points: "Falta de time", common_objections: "Preço" } }, error: null },
    };
    mockGetCurrentUserProfile.mockResolvedValue({ tenant_id: TENANT, id: "user-1" });
    mockCreateAdminClient.mockReturnValue(adminClient);
    mockGetApiKey.mockResolvedValue("sk-test");
    mockFetchProofs.mockResolvedValue([
      {
        id: "p1",
        tenant_id: TENANT,
        proof_type: "case",
        text: "Case real",
        sector: null,
        is_authorized: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    mockLookup.mockResolvedValue({ view: FOUND_VIEW });
    mockGenerate.mockResolvedValue(GOOD_RESULT);
    setup();
  });

  it("sem sessão -> 401", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);
    const res = await POST(makeRequest({}), params);
    expect(res.status).toBe(401);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("body inválido -> 400", async () => {
    const req = new NextRequest("http://localhost/x", { method: "POST", body: "nope" });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it("outro tenant ou inexistente -> 404 NOT_FOUND", async () => {
    setup({ row: null, loadError: { code: "PGRST116" } });
    const res = await POST(makeRequest({}), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("não elegível -> 422 NOT_ELIGIBLE, sem LLM", async () => {
    setup({ row: { ...baseRow, intent: "pediu_info", status: "viewed" } });
    const res = await POST(makeRequest({}), params);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("NOT_ELIGIBLE");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockGetApiKey).not.toHaveBeenCalled();
  });

  it("status meeting_booked é elegível mesmo sem intent interessado", async () => {
    setup({ row: { ...baseRow, intent: "objecao", status: "meeting_booked" } });
    const res = await POST(makeRequest({}), params);
    expect(res.status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("gera pela 1ª vez: 200 {meetingPrep, saved:true}, 1 log de custo, update só de meeting_prep", async () => {
    const res = await POST(makeRequest({}), params);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.saved).toBe(true);
    const prep = json.data.meetingPrep as MeetingPrep;
    expect(prep.version).toBe(1);
    expect(prep.account.status).toBe("found");
    expect(prep.account.facts[0]).toMatchObject({ id: "F1", fato: "Acme abriu filial" });
    expect(prep.engagement.campaignName).toBe("Q4");
    expect(prep.engagement.replyText).toBe("Tenho interesse");
    expect(prep.engagement.events).toEqual([{ type: "email_replied", at: "2026-11-02T09:00:00Z" }]);
    expect(prep.talkingPoints).toHaveLength(3);
    expect(prep.objections).toHaveLength(1);
    expect(prep.kbRefs).toEqual(["P1", "KB-DORES", "KB-OBJ"]);

    // catálogo enviado ao gerador
    const { catalog, apiKey } = mockGenerate.mock.calls[0][0];
    expect(apiKey).toBe("sk-test");
    expect(catalog.facts[0].id).toBe("F1");
    expect(catalog.proofs[0].id).toBe("P1");
    expect(catalog.kbObjections.id).toBe("KB-OBJ");

    expect(mockLogUsage).toHaveBeenCalledTimes(1);
    const [logClient, log] = mockLogUsage.mock.calls[0];
    expect(logClient).toBe(sessionClient);
    expect(log).toMatchObject({
      tenantId: TENANT,
      serviceName: "openai",
      requestType: "opportunity_meeting_prep",
      leadId: "lead-1",
      status: "success",
    });
    expect(log.estimatedCost).toBeGreaterThan(0);

    const upd = updateChain()!;
    const updateArgs = upd.calls.find(([m]) => m === "update")![1][0] as Record<string, unknown>;
    expect(Object.keys(updateArgs)).toEqual(["meeting_prep"]);
    expect(upd.calls).toContainEqual(["eq", ["id", OPP_ID]]);
    expect(upd.calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
  });

  it("toda query leva tenant_id (sessão e admin); eventos filtrados por campanha e e-mail sem diferenciar caixa", async () => {
    await POST(makeRequest({}), params);
    for (const chain of [...sessionChains, ...adminChains]) {
      expect(chain.calls, `tabela ${chain.table}`).toContainEqual(["eq", ["tenant_id", TENANT]]);
    }
    const events = sessionChains.find((c) => c.table === "campaign_events")!;
    expect(events.calls).toContainEqual(["eq", ["campaign_id", "camp-1"]]);
    expect(events.calls).toContainEqual(["ilike", ["lead_email", "John@Acme.com"]]);
    expect(events.calls).toContainEqual(["order", ["event_timestamp", { ascending: false }]]);
    expect(events.calls).toContainEqual(["limit", [20]]);
    // chave, KB e provas pelo client admin; dossiê pelo client de sessão
    expect(mockGetApiKey.mock.calls[0][0]).toBe(adminClient);
    expect(mockGetApiKey.mock.calls[0][1]).toBe(TENANT);
    expect(mockFetchProofs.mock.calls[0][0]).toBe(adminClient);
    expect(mockFetchProofs.mock.calls[0][1]).toBe(TENANT);
    expect(mockLookup.mock.calls[0][0]).toBe(sessionClient);
    expect(mockLookup.mock.calls[0][1]).toBe(TENANT);
    expect(mockLookup.mock.calls[0][2]).toEqual({ leadId: "lead-1", email: "John@Acme.com" });
  });

  it("e-mail com metacaracteres de LIKE é tratado como literal no filtro de eventos", async () => {
    setup({ row: { ...baseRow, lead: { ...baseRow.lead, email: " ana_paula%x@acme.com " } } });
    await POST(makeRequest({}), params);
    const events = sessionChains.find((c) => c.table === "campaign_events")!;
    expect(events.calls).toContainEqual(["ilike", ["lead_email", "ana\\_paula\\%x@acme.com"]]);
  });

  it("cache: briefing salvo e sem regenerate -> cached, sem LLM e sem log", async () => {
    setup({ row: { ...baseRow, meeting_prep: SAVED_PREP } });
    const res = await POST(makeRequest({}), params);
    const json = await res.json();
    expect(json.data).toEqual({ meetingPrep: SAVED_PREP, cached: true });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockLogUsage).not.toHaveBeenCalled();
    expect(updateChain()).toBeUndefined();
  });

  it("briefing salvo fora do formato é ignorado (gera de novo)", async () => {
    setup({ row: { ...baseRow, meeting_prep: { lixo: true } } });
    await POST(makeRequest({}), params);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("regenerar: regenerate:true gera de novo e sobrescreve", async () => {
    setup({ row: { ...baseRow, meeting_prep: SAVED_PREP } });
    const res = await POST(makeRequest({ regenerate: true }), params);
    const json = await res.json();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(json.data.saved).toBe(true);
    expect(json.data.meetingPrep.talkingPoints[0].text).toBe("A");
    expect(updateChain()).toBeDefined();
    expect(mockLogUsage.mock.calls[0][1].metadata.regenerate).toBe(true);
  });

  it("sem dossiê (lookup none): account none", async () => {
    mockLookup.mockResolvedValue({ view: { status: "none" } });
    const json = await (await POST(makeRequest({}), params)).json();
    expect(json.data.meetingPrep.account.status).toBe("none");
    expect(mockGenerate.mock.calls[0][0].catalog.facts).toEqual([]);
  });

  it("sem lead: account none, sem lookup e sem eventos", async () => {
    setup({ row: { ...baseRow, lead_id: null, lead: null } });
    const json = await (await POST(makeRequest({}), params)).json();
    expect(json.data.meetingPrep.account.status).toBe("none");
    expect(mockLookup).not.toHaveBeenCalled();
    expect(sessionChains.find((c) => c.table === "campaign_events")).toBeUndefined();
  });

  it("dossiê com erro: account error, briefing gerado sem fatos, console.error", async () => {
    mockLookup.mockResolvedValue({ error: "rls" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = await (await POST(makeRequest({}), params)).json();
    expect(json.data.meetingPrep.account.status).toBe("error");
    expect(json.data.meetingPrep.account.facts).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("eventos falham: segue com []", async () => {
    setup({ eventsResult: { data: null, error: { message: "boom" } } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = await (await POST(makeRequest({}), params)).json();
    expect(json.data.meetingPrep.engagement.events).toEqual([]);
    spy.mockRestore();
  });

  it("poucos pontos: meetingPrep null, invalid_response, nada gravado, custo logado", async () => {
    mockGenerate.mockResolvedValue({
      talkingPoints: [],
      objections: [],
      usage: { model: "m", promptTokens: 500, completionTokens: 50, durationMs: 1 },
      reason: "invalid_response",
    });
    const json = await (await POST(makeRequest({}), params)).json();
    expect(json.data).toEqual({ meetingPrep: null, reason: "invalid_response" });
    expect(updateChain()).toBeUndefined();
    expect(mockLogUsage).toHaveBeenCalledTimes(1);
    expect(mockLogUsage.mock.calls[0][1].status).toBe("failed");
  });

  it("sem chave: no_openai_key, sem custo nem LLM", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const json = await (await POST(makeRequest({}), params)).json();
    expect(json.data).toEqual({ meetingPrep: null, reason: "no_openai_key" });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockLogUsage).not.toHaveBeenCalled();
  });

  it("LLM falha (throw/timeout): llm_error, sem gravação e sem log sem tokens", async () => {
    mockGenerate.mockResolvedValue({
      talkingPoints: [],
      objections: [],
      usage: { model: "m", promptTokens: 0, completionTokens: 0, durationMs: 30000 },
      reason: "llm_error",
    });
    const res = await POST(makeRequest({}), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ meetingPrep: null, reason: "llm_error" });
    expect(updateChain()).toBeUndefined();
    expect(mockLogUsage).not.toHaveBeenCalled();
  });

  it("gravação falha (coluna ausente): devolve o briefing com saved:false", async () => {
    setup({ updateError: { code: "42703", message: "column meeting_prep does not exist" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(makeRequest({}), params);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.saved).toBe(false);
    expect(json.data.meetingPrep.talkingPoints).toHaveLength(3);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("client admin indisponível: fail-open sem LLM", async () => {
    mockCreateAdminClient.mockImplementation(() => {
      throw new Error("no service role");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = await (await POST(makeRequest({}), params)).json();
    expect(json.data.meetingPrep).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
