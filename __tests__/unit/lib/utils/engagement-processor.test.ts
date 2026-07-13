/**
 * Tests for engagement-processor.ts
 * Story 21.6 Task 9.2 — Processador de engajamento cross-campanha
 *
 * Cobre: enumeração de campanhas + getLeadTracking (mock) → engine → opportunities
 * source='engagement' com métricas; dedup app-level (ativo do mesmo lead → pula);
 * 23505 (uq_opportunities_engagement) benigno; lead sem match local → pula; fail-open
 * per-tenant (sem key / erro de API); isolamento por-tenant (allSettled); NÃO cria
 * lead_interaction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";
import { createMockLeadTracking } from "../../../helpers/mock-data";

// ==============================================
// MOCKS
// ==============================================

const mockGetLeadTracking = vi.fn();
vi.mock("@/lib/services/tracking", () => ({
  TrackingService: class MockTrackingService {
    getLeadTracking = mockGetLeadTracking;
  },
}));

const mockGetApiKey = vi.fn();
vi.mock("@/lib/utils/monitoring-processor", () => ({
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
}));

import { processEngagement } from "@/lib/utils/engagement-processor";

// ==============================================
// HELPERS
// ==============================================

interface TableResponses {
  [table: string]: { data?: unknown; error?: unknown } | undefined;
  /** dedup app-level: SELECT ... .maybeSingle() em opportunities (default null = sem ativo). */
  opportunitiesActive?: { data?: unknown; error?: unknown };
}

function makeSupabase(responses: TableResponses): {
  supabase: SupabaseClient;
  chains: Record<string, ChainBuilder>;
} {
  const chains: Record<string, ChainBuilder> = {};
  const ensure = (table: string): ChainBuilder => {
    if (table in chains) return chains[table];

    if (table === "opportunities") {
      // dedup (.maybeSingle) → opportunitiesActive ; INSERT (await .insert()) → opportunities.
      const r = responses.opportunities ?? {};
      const active = responses.opportunitiesActive ?? {};
      const base = createChainBuilder({ data: r.data ?? null, error: r.error ?? null });
      const insertChain = createChainBuilder({ data: r.data ?? null, error: r.error ?? null });
      base.insert = vi.fn().mockReturnValue(insertChain);
      base.maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: active.data ?? null, error: active.error ?? null });
      chains[table] = base;
      return base;
    }

    const r = responses[table] ?? {};
    chains[table] = createChainBuilder({ data: r.data ?? null, error: r.error ?? null });
    return chains[table];
  };
  for (const table of Object.keys(responses)) {
    if (table === "opportunitiesActive") continue;
    ensure(table);
  }
  const from = vi.fn((table: string) => ensure(table));
  return { supabase: { from } as unknown as SupabaseClient, chains };
}

/** Lead que qualifica por opens E clicks (dentro da janela com o systemTime abaixo). */
function qualifyingLead() {
  return createMockLeadTracking({
    leadEmail: "hot@test.com",
    openCount: 5,
    clickCount: 2,
    lastOpenAt: "2026-07-10T10:00:00.000Z",
    lastClickAt: "2026-07-12T10:00:00.000Z",
    leadId: "instantly-lead-99", // id no Instantly, NÃO o local
  });
}

const EXPORTED_CAMPAIGNS = { data: [{ id: "local-1", external_campaign_id: "ext-1" }] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
  mockGetApiKey.mockResolvedValue("instantly-key");
});

afterEach(() => {
  vi.useRealTimers();
});

// ==============================================
// processEngagement
// ==============================================

describe("processEngagement", () => {
  it("cria opportunity source='engagement' com métricas (open/click/último engajamento)", async () => {
    mockGetLeadTracking.mockResolvedValue([qualifyingLead()]);
    const { supabase, chains } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
      opportunitiesActive: { data: null },
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(chains.opportunities.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        campaign_id: "local-1", // id LOCAL da campanha, não o externo
        lead_id: "local-lead-99", // casado por e-mail, não o id do Instantly
        source: "engagement",
        reply_event_id: null,
        open_count: 5,
        click_count: 2,
        last_engagement_at: "2026-07-12T10:00:00.000Z",
      })
    );
    // Engajamento NÃO registra lead_interaction (enum não tem valor de engajamento).
    expect(chains.lead_interactions).toBeUndefined();
  });

  it("dedup app-level: oportunidade ATIVA do lead → pula (não insere)", async () => {
    mockGetLeadTracking.mockResolvedValue([qualifyingLead()]);
    const { supabase, chains } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
      opportunitiesActive: { data: { id: "existing-opp" } }, // já na Central
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
  });

  it("lead sem match local → pula (não insere)", async () => {
    mockGetLeadTracking.mockResolvedValue([qualifyingLead()]);
    const { supabase, chains } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: null }, // sem lead local
      opportunitiesActive: { data: null },
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
  });

  it("23505 (uq_opportunities_engagement) é benigno → skipped, não erro", async () => {
    mockGetLeadTracking.mockResolvedValue([qualifyingLead()]);
    const { supabase } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
      opportunitiesActive: { data: null },
      opportunities: { data: null, error: { code: "23505", message: "dup" } },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0); // 23505 não vira erro
  });

  it("fail-open: sem api key pula o tenant (não chama getLeadTracking)", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const { supabase } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(mockGetLeadTracking).not.toHaveBeenCalled();
    expect(result.errors).toEqual([{ tenantId: "tenant-1", error: "no-instantly-key" }]);
  });

  it("fail-open: erro de getLeadTracking não quebra o ciclo (surface no resumo)", async () => {
    mockGetLeadTracking.mockRejectedValue(new Error("instantly 500"));
    const { supabase, chains } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
    expect(result.errors[0].error).toContain("instantly 500");
  });

  it("leads que não qualificam (opens < min, sem clicks) não geram oportunidade", async () => {
    mockGetLeadTracking.mockResolvedValue([
      createMockLeadTracking({
        leadEmail: "frio@test.com",
        openCount: 1,
        clickCount: 0,
        lastOpenAt: "2026-07-12T10:00:00.000Z",
        lastClickAt: null,
      }),
    ]);
    const { supabase, chains } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
  });

  it("isolamento por-tenant: tenant sem key não impede o tenant válido (allSettled)", async () => {
    // Sem tenantId → enumera api_configs (2 tenants). t1 sem key, t2 com key.
    mockGetApiKey.mockResolvedValueOnce(null).mockResolvedValueOnce("instantly-key");
    mockGetLeadTracking.mockResolvedValue([qualifyingLead()]);
    const { supabase } = makeSupabase({
      api_configs: { data: [{ tenant_id: "t1" }, { tenant_id: "t2" }] },
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
      opportunitiesActive: { data: null },
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase);

    expect(result.created).toBe(1); // t2 processado apesar de t1 falhar
    expect(result.errors).toEqual([{ tenantId: "t1", error: "no-instantly-key" }]);
  });

  it("dedup inclui meeting_booked: lead com reunião marcada não gera card novo (decisão 21.6)", async () => {
    mockGetLeadTracking.mockResolvedValue([qualifyingLead()]);
    const { supabase, chains } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      leads: { data: { id: "local-lead-99" } },
      opportunitiesActive: { data: { id: "meeting-opp" } }, // já tem card ativo (ex.: meeting_booked)
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
    // O conjunto de status "ativo" do dedup inclui meeting_booked (não re-abordar lead ganho).
    expect(chains.opportunities.in).toHaveBeenCalledWith(
      "status",
      expect.arrayContaining(["meeting_booked"])
    );
  });

  it("erro ao carregar config → pula a campanha (não aplica default silencioso)", async () => {
    mockGetLeadTracking.mockResolvedValue([qualifyingLead()]);
    const { supabase, chains } = makeSupabase({
      campaigns: EXPORTED_CAMPAIGNS,
      opportunity_configs: { error: { message: "config db error" } },
      leads: { data: { id: "local-lead-99" } },
      opportunitiesActive: { data: null },
      opportunities: { data: null, error: null },
    });

    const result = await processEngagement(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    // NÃO insere com thresholds default por causa de um erro transitório de config.
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.error === "config-load-failed")).toBe(true);
  });
});
