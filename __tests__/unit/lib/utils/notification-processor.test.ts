/**
 * Tests for notification-processor.ts
 * Story 21.7 Task 11.1 — o passe de notificação (WhatsApp + in-app)
 *
 * Cobre: gatilho por intent, gate de canal/número, agrupamento (>3 vs ≤3), fail-open
 * (in-app criada apesar do WhatsApp falhar), supressão no backfill (suppressOnly),
 * freshness-guard, idempotência, isolamento por-tenant, sem chave zapi, opt-in engajamento.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";

// --- Mocks: getApiKey (credencial no cron) + ZApiService.sendText ---
const mockGetApiKey = vi.fn();
vi.mock("@/lib/utils/monitoring-processor", () => ({
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
}));

const mockSendText = vi.fn();
vi.mock("@/lib/services/zapi", () => ({
  ZApiService: class {
    sendText = mockSendText;
  },
}));

import {
  notifyNewOpportunities,
  buildHotLeadMessage,
  buildGroupedMessage,
  buildLeadName,
} from "@/lib/utils/notification-processor";

// ==============================================
// HELPERS
// ==============================================

interface TableResponses {
  [table: string]: { data?: unknown; error?: unknown } | undefined;
}

function makeSupabase(responses: TableResponses): {
  supabase: SupabaseClient;
  chains: Record<string, ChainBuilder>;
} {
  const chains: Record<string, ChainBuilder> = {};
  const ensure = (table: string): ChainBuilder => {
    if (table in chains) return chains[table];
    const r = responses[table] ?? {};
    chains[table] = createChainBuilder({ data: r.data ?? null, error: r.error ?? null });
    return chains[table];
  };
  for (const table of Object.keys(responses)) ensure(table);
  const from = vi.fn((table: string) => ensure(table));
  return { supabase: { from } as unknown as SupabaseClient, chains };
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ns-1",
    tenant_id: "tenant-1",
    whatsapp_numbers: ["5511999999999"],
    channels: { whatsapp: true, in_app: true, whatsapp_engagement: false },
    notify_intents: ["interessado", "pediu_info"],
    created_at: "2026-07-16T00:00:00Z",
    updated_at: "2026-07-16T00:00:00Z",
    ...overrides,
  };
}

function opp(overrides: Record<string, unknown> = {}) {
  return {
    id: "opp-1",
    tenant_id: "tenant-1",
    lead_id: "lead-1",
    campaign_id: "camp-1",
    source: "reply",
    intent: "interessado",
    created_at: new Date().toISOString(),
    leads: { first_name: "João", last_name: "Silva", company_name: "ACME" },
    ...overrides,
  };
}

const CAMPAIGNS = { data: [{ id: "camp-1", name: "Campanha X" }] };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiKey.mockResolvedValue("zapi-key-json");
  mockSendText.mockResolvedValue({ zaapId: "z", messageId: "m" });
});

// ==============================================
// PURE HELPERS
// ==============================================

describe("buildLeadName", () => {
  it("junta first + last com trim", () => {
    expect(buildLeadName(" João ", "Silva ")).toBe("João Silva");
  });
  it("fallback 'Lead' quando ambos vazios/null", () => {
    expect(buildLeadName(null, null)).toBe("Lead");
    expect(buildLeadName("", "  ")).toBe("Lead");
  });
});

describe("buildHotLeadMessage", () => {
  it("formato AC1 com link", () => {
    const msg = buildHotLeadMessage({
      leadName: "João Silva",
      company: "ACME",
      intentLabel: "Interessado",
      campaignName: "Campanha X",
      link: "https://app/opportunities",
    });
    expect(msg).toContain("🔥 Lead quente: João Silva (ACME) respondeu Interessado na campanha Campanha X");
    expect(msg).toContain("https://app/opportunities");
  });
  it("sem link quando vazio (nunca quebra)", () => {
    const msg = buildHotLeadMessage({
      leadName: "João",
      company: "ACME",
      intentLabel: "Interessado",
      campaignName: "X",
      link: "",
    });
    expect(msg).not.toContain("Abrir Central");
  });
});

describe("buildGroupedMessage", () => {
  it("formato AC6", () => {
    expect(buildGroupedMessage(5, "https://app/opportunities")).toBe(
      "🔥 5 novos leads quentes — abrir Central: https://app/opportunities"
    );
  });
  it("sem link", () => {
    expect(buildGroupedMessage(5, "")).toBe("🔥 5 novos leads quentes");
  });
});

// ==============================================
// PASSE
// ==============================================

describe("notifyNewOpportunities", () => {
  it("reply intent quente → WhatsApp + in-app", async () => {
    const { supabase, chains } = makeSupabase({
      opportunities: { data: [opp()] },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(result.whatsappSent).toBe(1);
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(chains.app_notifications.insert).toHaveBeenCalledTimes(1);
  });

  it("reply intent frio (objecao) → só in-app, sem WhatsApp", async () => {
    const { supabase } = makeSupabase({
      opportunities: { data: [opp({ intent: "objecao" })] },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(result.whatsappSent).toBe(0);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("reply intent null (fail-open 21.3) → só in-app", async () => {
    const { supabase } = makeSupabase({
      opportunities: { data: [opp({ intent: null })] },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("engagement → só in-app (opt-in WhatsApp OFF por padrão)", async () => {
    const { supabase } = makeSupabase({
      opportunities: { data: [opp({ source: "engagement", intent: null })] },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("engagement + opt-in ON → WhatsApp", async () => {
    const { supabase } = makeSupabase({
      opportunities: { data: [opp({ source: "engagement", intent: null })] },
      notification_settings: {
        data: settingsRow({
          channels: { whatsapp: true, in_app: true, whatsapp_engagement: true },
        }),
      },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.whatsappSent).toBe(1);
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it("canal WhatsApp off → só in-app", async () => {
    const { supabase } = makeSupabase({
      opportunities: { data: [opp()] },
      notification_settings: {
        data: settingsRow({
          channels: { whatsapp: false, in_app: true, whatsapp_engagement: false },
        }),
      },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("whatsappNumbers vazio → só in-app", async () => {
    const { supabase } = makeSupabase({
      opportunities: { data: [opp()] },
      notification_settings: { data: settingsRow({ whatsapp_numbers: [] }) },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("agrupamento: >3 elegíveis → 1 mensagem agrupada por número", async () => {
    const opps = [1, 2, 3, 4].map((n) => opp({ id: `opp-${n}` }));
    const { supabase } = makeSupabase({
      opportunities: { data: opps },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(4);
    expect(result.whatsappGrouped).toBe(1);
    expect(result.whatsappSent).toBe(0);
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText.mock.calls[0][2]).toContain("4 novos leads quentes");
  });

  it("agrupamento: ≤3 elegíveis → mensagens individuais", async () => {
    const opps = [1, 2, 3].map((n) => opp({ id: `opp-${n}` }));
    const { supabase } = makeSupabase({
      opportunities: { data: opps },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.whatsappSent).toBe(3);
    expect(result.whatsappGrouped).toBe(0);
    expect(mockSendText).toHaveBeenCalledTimes(3);
  });

  it("fail-open: sendText lança → in-app criada, notified_at setado, erro contado", async () => {
    mockSendText.mockRejectedValue(new Error("Z-API fora"));
    const { supabase, chains } = makeSupabase({
      opportunities: { data: [opp()] },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1); // in-app criada apesar do WhatsApp falhar
    expect(result.whatsappSent).toBe(0);
    expect(result.errors.some((e) => e.scope === "whatsapp")).toBe(true);
    // notified_at foi marcado (update chamado na tabela opportunities)
    expect(chains.opportunities.update).toHaveBeenCalled();
  });

  it("sem chave zapi → só in-app (WhatsApp pulado)", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const { supabase } = makeSupabase({
      opportunities: { data: [opp()] },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("freshness-guard: engagement velho (opt-in ON) → WhatsApp pulado, in-app criada", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h atrás
    const { supabase } = makeSupabase({
      opportunities: { data: [opp({ source: "engagement", intent: null, created_at: old })] },
      notification_settings: {
        data: settingsRow({
          channels: { whatsapp: true, in_app: true, whatsapp_engagement: true },
        }),
      },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("freshness-guard NÃO se aplica a reply: reply velho → WhatsApp ainda enviado (decisão review 21.7)", async () => {
    // Upgrade engagement→reply preserva o created_at do engajamento original (21.6). O reply quente
    // re-armado pela Task 6 NÃO pode ser pulado pelo freshness-guard — reply é isento.
    const old = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5h atrás
    const { supabase } = makeSupabase({
      opportunities: { data: [opp({ created_at: old })] }, // source 'reply' (default), intent quente
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(1);
    expect(result.whatsappSent).toBe(1);
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it("erro REAL ao ler settings → tenant pulado sem marcar notified_at (não degrada p/ defaults)", async () => {
    const { supabase, chains } = makeSupabase({
      opportunities: { data: [opp()] },
      notification_settings: { error: { message: "connection reset" } },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(0);
    expect(mockSendText).not.toHaveBeenCalled();
    expect(chains.app_notifications.insert).not.toHaveBeenCalled();
    // notified_at NÃO marcado → a opp reentra no próximo ciclo (nada de update em opportunities).
    expect(chains.opportunities.update).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.scope === "notify")).toBe(true);
  });

  it("suppressOnly (backfill): marca notified_at, ZERO envio/insert", async () => {
    const { supabase, chains } = makeSupabase({
      opportunities: { data: [{ id: "a" }, { id: "b" }, { id: "c" }] },
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase, {
      tenantId: "tenant-1",
      suppressOnly: true,
    });

    expect(result.suppressed).toBe(3);
    expect(result.inAppCreated).toBe(0);
    expect(mockSendText).not.toHaveBeenCalled();
    expect(chains.opportunities.update).toHaveBeenCalled();
    expect(chains.app_notifications.insert).not.toHaveBeenCalled();
  });

  it("suppressOnly sem tenantId → erro (não marca nada global)", async () => {
    const { supabase } = makeSupabase({ opportunities: {} });
    const result = await notifyNewOpportunities(supabase, { suppressOnly: true });
    expect(result.suppressed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("pending vazio → no-op (idempotência: já notificadas não retornam)", async () => {
    const { supabase } = makeSupabase({
      opportunities: { data: [] },
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    expect(result.inAppCreated).toBe(0);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("isolamento por-tenant: erro num tenant não impede o outro", async () => {
    // Dois tenants; só há CAMPAIGNS de camp-1, mas ambos criam in-app.
    const opps = [
      opp({ id: "opp-a", tenant_id: "tenant-1" }),
      opp({ id: "opp-b", tenant_id: "tenant-2", campaign_id: "camp-2" }),
    ];
    const { supabase } = makeSupabase({
      opportunities: { data: opps },
      notification_settings: { data: settingsRow() },
      campaigns: CAMPAIGNS,
      app_notifications: {},
    });

    const result = await notifyNewOpportunities(supabase);

    // Ambos os tenants processaram a in-app (2 no total).
    expect(result.inAppCreated).toBe(2);
  });
});
