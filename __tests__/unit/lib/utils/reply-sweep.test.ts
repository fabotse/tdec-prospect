/**
 * Tests for reply-sweep.ts
 * Story 21.2 Task 7.2 — Sweep de respostas por polling
 *
 * Cobre: dedupe (23505 benigno), resolução de campaign_id (conhecida/desconhecida),
 * montagem de payload + event_timestamp estável, source='polling', isolamento
 * por-tenant, fail-open em erro de API, sem api key.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";
import { createMockInstantlyReceivedEmail } from "../../../helpers/mock-data";

// ==============================================
// MOCKS
// ==============================================

const mockGetReceivedEmails = vi.fn();
vi.mock("@/lib/services/tracking", () => ({
  TrackingService: class MockTrackingService {
    getReceivedEmails = mockGetReceivedEmails;
  },
}));

const mockGetApiKey = vi.fn();
vi.mock("@/lib/utils/monitoring-processor", () => ({
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
}));

import {
  sweepReplies,
  buildReplyEventPayload,
} from "@/lib/utils/reply-sweep";

// ==============================================
// HELPERS
// ==============================================

interface TableResponses {
  [table: string]: { data?: unknown; error?: unknown };
}

/** Cria um supabase mock com um chain persistente por tabela (permite inspeção). */
function makeSupabase(responses: TableResponses): {
  supabase: SupabaseClient;
  chains: Record<string, ChainBuilder>;
} {
  const chains: Record<string, ChainBuilder> = {};
  const from = vi.fn((table: string) => {
    if (!chains[table]) {
      const r = responses[table] ?? {};
      chains[table] = createChainBuilder({
        data: r.data ?? null,
        error: r.error ?? null,
      });
    }
    return chains[table];
  });
  return { supabase: { from } as unknown as SupabaseClient, chains };
}

const CAMPAIGN = { id: "local-campaign-1", tenant_id: "tenant-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiKey.mockResolvedValue("instantly-key");
});

// ==============================================
// buildReplyEventPayload (pure)
// ==============================================

describe("buildReplyEventPayload", () => {
  it("mapeia body.text/subject/message_id e marca source=polling", () => {
    const email = createMockInstantlyReceivedEmail();
    const payload = buildReplyEventPayload(email);

    expect(payload.subject).toBe("RE: proposta comercial");
    expect((payload.body as { text: string }).text).toContain("tenho interesse");
    expect(payload.message_id).toBe("<reply-abc@mail.empresa.com>");
    expect(payload.source).toBe("polling");
    expect(payload.i_status).toBe(1);
  });

  it("normaliza campos ausentes para null (não inventa unibox_url)", () => {
    const email = createMockInstantlyReceivedEmail({
      message_id: undefined,
      subject: undefined,
      body: undefined,
      i_status: undefined,
    });
    const payload = buildReplyEventPayload(email);

    expect(payload.message_id).toBeNull();
    expect(payload.subject).toBeNull();
    expect((payload.body as { text: unknown }).text).toBeNull();
    expect(payload.i_status).toBeNull();
    expect(payload.unibox_url).toBeUndefined(); // polling não entrega
  });
});

// ==============================================
// sweepReplies
// ==============================================

describe("sweepReplies", () => {
  it("insere campaign_event (source=polling) com event_timestamp estável = timestamp_created", async () => {
    const email = createMockInstantlyReceivedEmail({
      timestamp_created: "2026-03-10T12:00:00.000Z",
      lead: "Joao@Empresa.com.BR",
    });
    mockGetReceivedEmails.mockResolvedValue([email]);

    const { supabase, chains } = makeSupabase({
      campaigns: { data: CAMPAIGN },
      campaign_events: { data: null, error: null },
    });

    const result = await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(result.swept).toBe(1);
    expect(result.skipped).toBe(0);
    expect(chains.campaign_events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        campaign_id: "local-campaign-1",
        event_type: "email_replied",
        source: "polling",
        event_timestamp: "2026-03-10T12:00:00.000Z",
        lead_email: "Joao@Empresa.com.BR",
      })
    );
  });

  it("propaga o filtro min_timestamp_created via getReceivedEmails (janela)", async () => {
    mockGetReceivedEmails.mockResolvedValue([]);
    const { supabase } = makeSupabase({
      campaign_events: { data: { event_timestamp: "2026-03-01T00:00:00.000Z" } },
    });

    await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(mockGetReceivedEmails).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "instantly-key", since: expect.any(String) })
    );
  });

  it("usa `since` amplo do backfill sem calcular janela incremental", async () => {
    mockGetReceivedEmails.mockResolvedValue([]);
    const { supabase } = makeSupabase({});

    await sweepReplies(supabase, { tenantId: "tenant-1", since: "2026-01-01T00:00:00.000Z" });

    expect(mockGetReceivedEmails).toHaveBeenCalledWith(
      expect.objectContaining({ since: "2026-01-01T00:00:00.000Z" })
    );
  });

  it("trata Postgres 23505 como duplicata benigna (não conta como swept)", async () => {
    mockGetReceivedEmails.mockResolvedValue([createMockInstantlyReceivedEmail()]);
    const { supabase } = makeSupabase({
      campaigns: { data: CAMPAIGN },
      campaign_events: { data: null, error: { code: "23505", message: "duplicate" } },
    });

    const result = await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(result.swept).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("erro REAL de INSERT (≠23505) é surfaçado em errors, não vira skipped mudo", async () => {
    mockGetReceivedEmails.mockResolvedValue([createMockInstantlyReceivedEmail()]);
    const { supabase } = makeSupabase({
      campaigns: { data: CAMPAIGN },
      campaign_events: { data: null, error: { code: "23502", message: "null value in event_timestamp" } },
    });

    const result = await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(result.swept).toBe(0);
    expect(result.errors).toEqual([
      { tenantId: "tenant-1", error: "null value in event_timestamp" },
    ]);
  });

  it("pula silenciosamente campanha desconhecida (lookup null)", async () => {
    mockGetReceivedEmails.mockResolvedValue([createMockInstantlyReceivedEmail()]);
    const { supabase, chains } = makeSupabase({
      campaigns: { data: null },
      campaign_events: { data: null, error: null },
    });

    const result = await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(result.swept).toBe(0);
    expect(result.skipped).toBe(1);
    expect(chains.campaign_events.insert).not.toHaveBeenCalled();
  });

  it("pula e-mail sem lead ou sem campaign_id", async () => {
    mockGetReceivedEmails.mockResolvedValue([
      createMockInstantlyReceivedEmail({ lead: undefined }),
      createMockInstantlyReceivedEmail({ campaign_id: undefined, campaign: undefined }),
    ]);
    const { supabase } = makeSupabase({ campaigns: { data: CAMPAIGN } });

    const result = await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(result.swept).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("fail-open: erro de API loga e não quebra (erro registrado, sem throw)", async () => {
    mockGetReceivedEmails.mockRejectedValue(new Error("Instantly 429"));
    const { supabase } = makeSupabase({});

    const result = await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(result.swept).toBe(0);
    expect(result.errors).toEqual([{ tenantId: "tenant-1", error: "Instantly 429" }]);
  });

  it("fail-open: tenant sem api key é pulado", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const { supabase } = makeSupabase({});

    const result = await sweepReplies(supabase, { tenantId: "tenant-1" });

    expect(mockGetReceivedEmails).not.toHaveBeenCalled();
    expect(result.errors[0]).toEqual({ tenantId: "tenant-1", error: "no-instantly-key" });
  });

  it("isola falha por-tenant: um tenant quebra, outro processa", async () => {
    mockGetApiKey.mockImplementation((_sb: unknown, tid: string) =>
      Promise.resolve(tid === "tenant-1" ? "key-1" : "key-2")
    );
    mockGetReceivedEmails.mockImplementation((p: { apiKey: string }) =>
      p.apiKey === "key-1"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve([createMockInstantlyReceivedEmail()])
    );

    const { supabase } = makeSupabase({
      api_configs: { data: [{ tenant_id: "tenant-1" }, { tenant_id: "tenant-2" }] },
      campaigns: { data: { id: "c2", tenant_id: "tenant-2" } },
      campaign_events: { data: null, error: null },
    });

    const result = await sweepReplies(supabase, {});

    expect(result.tenants).toBe(2);
    expect(result.swept).toBe(1); // apenas tenant-2
    expect(result.errors).toEqual([{ tenantId: "tenant-1", error: "boom" }]);
  });

  it("lista tenants com api_config de instantly quando tenantId não é informado", async () => {
    mockGetReceivedEmails.mockResolvedValue([]);
    const { supabase, chains } = makeSupabase({
      api_configs: { data: [{ tenant_id: "t1" }, { tenant_id: "t1" }, { tenant_id: "t2" }] },
    });

    const result = await sweepReplies(supabase, {});

    expect(chains.api_configs.eq).toHaveBeenCalledWith("service_name", "instantly");
    expect(result.tenants).toBe(2); // dedup t1
  });
});
