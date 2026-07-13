/**
 * Tests for reply-processor.ts
 * Story 21.2 Task 7.3 / 7.4 — Processador de respostas
 *
 * Cobre: criação de opportunity source='reply' com reply_event_id sempre setado,
 * idempotência (anti-join + 23505), filtro de auto-reply (OOO por i_status=0 e
 * por regex), extração de payload, unibox_url null, match de lead + lead_interaction,
 * lead não encontrado (lead_id null, sem interaction), divergência de caixa.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChainBuilder, type ChainBuilder } from "../../../helpers/mock-supabase";
import { createMockCampaignEvent } from "../../../helpers/mock-data";
import {
  processReplies,
  processReplyEvent,
  detectAutoReply,
} from "@/lib/utils/reply-processor";
import type { CampaignEventRow } from "@/types/tracking";

// ==============================================
// HELPERS
// ==============================================

interface TableResponses {
  [table: string]: { data?: unknown; error?: unknown } | undefined;
  /**
   * Story 21.6 — resposta do PRÉ-CHECK de engajamento (SELECT ... .maybeSingle()
   * na tabela opportunities). Distinto do INSERT/anti-join. Default {data:null} =
   * "sem engajamento ativo", então os testes da 21.2 seguem no caminho de INSERT.
   */
  opportunitiesEngagement?: { data?: unknown; error?: unknown };
}

function makeSupabase(responses: TableResponses): {
  supabase: SupabaseClient;
  chains: Record<string, ChainBuilder>;
} {
  const chains: Record<string, ChainBuilder> = {};
  const ensure = (table: string): ChainBuilder => {
    if (table in chains) return chains[table];

    if (table === "opportunities") {
      // A tabela opportunities recebe 3 formas de query no reply-processor:
      //   1. anti-join (processReplies): SELECT ... await direto      → resposta `opportunities`
      //   2. INSERT: .insert().select().maybeSingle()                 → resposta `opportunities`
      //   3. pré-check de engajamento (21.6): SELECT ... .maybeSingle → resposta `opportunitiesEngagement`
      //   4. upgrade: .update().eq() await direto                     → resposta `opportunities`
      const r = responses.opportunities ?? {};
      const eng = responses.opportunitiesEngagement ?? {};
      const base = createChainBuilder({ data: r.data ?? null, error: r.error ?? null });
      const insertChain = createChainBuilder({ data: r.data ?? null, error: r.error ?? null });
      base.insert = vi.fn().mockReturnValue(insertChain);
      base.maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: eng.data ?? null, error: eng.error ?? null });
      chains[table] = base;
      return base;
    }

    const r = responses[table] ?? {};
    chains[table] = createChainBuilder({ data: r.data ?? null, error: r.error ?? null });
    return chains[table];
  };
  // Pre-instancia chains das tabelas declaradas, para permitir asserções
  // "not.toHaveBeenCalled()" mesmo quando o código faz short-circuit (ex: auto-reply).
  for (const table of Object.keys(responses)) {
    if (table === "opportunitiesEngagement") continue;
    ensure(table);
  }
  const from = vi.fn((table: string) => ensure(table));
  return { supabase: { from } as unknown as SupabaseClient, chains };
}

function makeReplyEvent(overrides: Partial<CampaignEventRow> = {}): CampaignEventRow {
  return createMockCampaignEvent({
    id: "event-1",
    tenant_id: "tenant-1",
    campaign_id: "campaign-1",
    event_type: "email_replied",
    lead_email: "joao@empresa.com.br",
    source: "polling",
    payload: {
      message_id: "<abc@mail.com>",
      subject: "RE: proposta",
      body: { text: "Tenho interesse em avançar." },
      i_status: 1,
    },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ==============================================
// detectAutoReply (pure — AC4)
// ==============================================

describe("detectAutoReply", () => {
  it("detecta OOO por i_status === 0", () => {
    const r = detectAutoReply({ i_status: 0, subject: "RE: x" });
    expect(r.isAuto).toBe(true);
    expect(r.reason).toContain("Out of Office");
  });

  it("detecta OOO por regex no assunto (PT)", () => {
    const r = detectAutoReply({ i_status: 1, subject: "Ausência do escritório" });
    expect(r.isAuto).toBe(true);
  });

  it("detecta OOO por regex no corpo (EN)", () => {
    const r = detectAutoReply({ body: { text: "I am currently Out Of Office until Monday" } });
    expect(r.isAuto).toBe(true);
  });

  it("resposta normal não é auto-reply", () => {
    const r = detectAutoReply({ i_status: 1, subject: "RE: proposta", body: { text: "Tenho interesse" } });
    expect(r.isAuto).toBe(false);
  });

  it("conservador: 'de férias' em resposta humana NÃO é auto-reply (decisão 2026-07-13)", () => {
    const r = detectAutoReply({
      subject: "RE: proposta",
      body: { text: "Acabei de voltar de férias, podemos marcar essa semana?" },
    });
    expect(r.isAuto).toBe(false);
  });

  it("casa OOO acento-insensível ('Ausencia do escritorio' sem acento)", () => {
    const r = detectAutoReply({ subject: "Ausencia do escritorio ate segunda" });
    expect(r.isAuto).toBe(true);
  });
});

// ==============================================
// processReplyEvent
// ==============================================

describe("processReplyEvent", () => {
  it("cria opportunity source='reply' com reply_event_id SEMPRE setado", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunities: { data: { id: "opp-1" }, error: null },
      lead_interactions: { error: null },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(chains.opportunities.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        campaign_id: "campaign-1",
        source: "reply",
        reply_event_id: "event-1",
        reply_text: "Tenho interesse em avançar.",
        reply_subject: "RE: proposta",
        unibox_url: null, // polling não entrega
        lead_id: "lead-99",
        lt_interest_status: 1,
      })
    );
  });

  it("filtra auto-reply (OOO): NÃO cria oportunidade, retorna skipped", async () => {
    const { supabase, chains } = makeSupabase({ opportunities: { data: null } });
    const event = makeReplyEvent({ payload: { i_status: 0, subject: "Out of Office" } });

    const result = await processReplyEvent(event, supabase);

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("Out of Office");
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
  });

  it("idempotência: 23505 (UNIQUE reply_event_id) tratado como sucesso benigno", async () => {
    const { supabase } = makeSupabase({
      leads: { data: null },
      opportunities: { data: null, error: { code: "23505", message: "dup" } },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already-processed");
  });

  it("erro real de insert (≠23505) retorna success=false", async () => {
    const { supabase } = makeSupabase({
      leads: { data: null },
      opportunities: { data: null, error: { code: "23502", message: "not null" } },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not null");
  });

  it("lead encontrado → lead_id + lead_interaction campaign_reply", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunities: { data: { id: "opp-1" }, error: null },
      lead_interactions: { error: null },
    });

    await processReplyEvent(makeReplyEvent(), supabase);

    expect(chains.lead_interactions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: "lead-99",
        tenant_id: "tenant-1",
        type: "campaign_reply",
        created_by: null,
      })
    );
  });

  it("lead NÃO encontrado (AC7) → opportunity com lead_id null e SEM interaction", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: null },
      opportunities: { data: { id: "opp-1" }, error: null },
      lead_interactions: { error: null },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(true);
    expect(chains.opportunities.insert).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: null })
    );
    expect(chains.lead_interactions.insert).not.toHaveBeenCalled();
  });

  it("match de lead usa ilike com e-mail normalizado (trim + lowercase)", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunities: { data: { id: "opp-1" }, error: null },
      lead_interactions: { error: null },
    });
    const event = makeReplyEvent({ lead_email: "  Joao@Empresa.COM.br  " });

    await processReplyEvent(event, supabase);

    expect(chains.leads.ilike).toHaveBeenCalledWith("email", "joao@empresa.com.br");
    expect(chains.leads.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("escapa metacaracteres de LIKE (_ vira \\_) no match de lead — evita lead errado", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunities: { data: { id: "opp-1" }, error: null },
      lead_interactions: { error: null },
    });
    const event = makeReplyEvent({ lead_email: "ana_paula@corp.com" });

    await processReplyEvent(event, supabase);

    // `_` cru casaria `anaXpaula@corp.com`; escapado casa apenas o literal.
    expect(chains.leads.ilike).toHaveBeenCalledWith("email", "ana\\_paula@corp.com");
  });

  it("unibox_url do payload é preservado quando presente (webhook futuro)", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: null },
      opportunities: { data: { id: "opp-1" }, error: null },
    });
    const event = makeReplyEvent({
      payload: { subject: "RE", body: { text: "ok" }, unibox_url: "https://unibox/x" },
    });

    await processReplyEvent(event, supabase);

    expect(chains.opportunities.insert).toHaveBeenCalledWith(
      expect.objectContaining({ unibox_url: "https://unibox/x" })
    );
  });

  it("lt_interest_status não-numérico vira null (normalização é da 21.3)", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: null },
      opportunities: { data: { id: "opp-1" }, error: null },
    });
    const event = makeReplyEvent({
      payload: { subject: "RE", body: { text: "ok" }, i_status: "Interested" },
    });

    await processReplyEvent(event, supabase);

    expect(chains.opportunities.insert).toHaveBeenCalledWith(
      expect.objectContaining({ lt_interest_status: null })
    );
  });
});

// ==============================================
// processReplyEvent — upgrade engagement→reply (Story 21.6 AC4)
// ==============================================

describe("processReplyEvent — upgrade engagement→reply (Story 21.6)", () => {
  it("engajamento ativo do lead + reply → UPDATE in-place (não INSERT novo)", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunitiesEngagement: { data: { id: "eng-1" } }, // engajamento ativo do lead
      opportunities: { data: null, error: null }, // UPDATE ok
      lead_interactions: { error: null },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.opportunityId).toBe("eng-1");
    // Promove a linha existente em vez de criar um card duplicado.
    expect(chains.opportunities.update).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "reply",
        // campaign_id realinhado para a campanha do reply (convenção do INSERT).
        campaign_id: "campaign-1",
        reply_event_id: "event-1",
        reply_text: "Tenho interesse em avançar.",
        reply_subject: "RE: proposta",
      })
    );
    expect(chains.opportunities.eq).toHaveBeenCalledWith("id", "eng-1");
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
    // Pré-check considera meeting_booked como ativo (evita 2º card p/ lead com reunião marcada).
    expect(chains.opportunities.in).toHaveBeenCalledWith(
      "status",
      expect.arrayContaining(["meeting_booked"])
    );
    // Reply casado ainda registra a interação.
    expect(chains.lead_interactions.insert).toHaveBeenCalled();
  });

  it("sem engajamento prévio → INSERT normal (caminho 21.2 intocado)", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunitiesEngagement: { data: null }, // nenhum engajamento ativo
      opportunities: { data: { id: "opp-1" }, error: null },
      lead_interactions: { error: null },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(true);
    expect(result.opportunityId).toBe("opp-1");
    expect(chains.opportunities.insert).toHaveBeenCalled();
    expect(chains.opportunities.update).not.toHaveBeenCalled();
  });

  it("23505 no UPDATE (reply_event_id já usado) é benigno → skipped", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunitiesEngagement: { data: { id: "eng-1" } },
      opportunities: { data: null, error: { code: "23505", message: "dup reply_event_id" } },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already-processed");
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
  });

  it("upgrade só dispara com lead local casado (sem lead → INSERT normal, sem pré-check)", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: null }, // sem lead local
      opportunitiesEngagement: { data: { id: "eng-1" } }, // não deve ser consultado
      opportunities: { data: { id: "opp-1" }, error: null },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    expect(result.success).toBe(true);
    expect(chains.opportunities.insert).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: null, source: "reply" })
    );
    expect(chains.opportunities.update).not.toHaveBeenCalled();
  });

  it("erro transitório no pré-check de engajamento → falha (NÃO cai no INSERT duplicado)", async () => {
    const { supabase, chains } = makeSupabase({
      leads: { data: { id: "lead-99" } },
      opportunitiesEngagement: { error: { message: "select failed" } }, // pré-check falha
      opportunities: { data: { id: "opp-1" }, error: null },
    });

    const result = await processReplyEvent(makeReplyEvent(), supabase);

    // Falha em vez de INSERT: um INSERT aqui criaria um 2º card além do engajamento ativo
    // (viola AC4). O evento reentra no próximo ciclo (não marcado como processado).
    expect(result.success).toBe(false);
    expect(result.error).toContain("select failed");
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
    expect(chains.opportunities.update).not.toHaveBeenCalled();
  });
});

// ==============================================
// processReplies (orquestração + anti-join)
// ==============================================

describe("processReplies", () => {
  it("retorna zerado quando não há eventos email_replied", async () => {
    const { supabase } = makeSupabase({ campaign_events: { data: [] } });
    const result = await processReplies(supabase, { tenantId: "tenant-1" });
    expect(result).toEqual({ created: 0, skipped: 0, errors: [] });
  });

  it("cria oportunidades para eventos ainda não processados", async () => {
    const events = [
      makeReplyEvent({ id: "event-1" }),
      makeReplyEvent({ id: "event-2" }),
    ];
    const { supabase } = makeSupabase({
      campaign_events: { data: events },
      opportunities: { data: [], error: null }, // anti-join vazio + insert ok
      leads: { data: null },
    });

    const result = await processReplies(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("anti-join: pula eventos que já geraram oportunidade (idempotência de reprocesso)", async () => {
    const events = [
      makeReplyEvent({ id: "event-1" }),
      makeReplyEvent({ id: "event-2" }),
    ];
    const { supabase, chains } = makeSupabase({
      campaign_events: { data: events },
      // event-1 já processado; event-2 pendente
      opportunities: { data: [{ reply_event_id: "event-1" }], error: null },
      leads: { data: null },
    });

    const result = await processReplies(supabase, { tenantId: "tenant-1" });

    // event-1 filtrado pelo anti-join; só event-2 vira insert
    expect(result.created).toBe(1);
    expect(chains.opportunities.insert).toHaveBeenCalledTimes(1);
  });

  it("filtra auto-reply na orquestração (skipped, não created)", async () => {
    const events = [
      makeReplyEvent({ id: "event-1", payload: { i_status: 0, subject: "Out of Office" } }),
    ];
    const { supabase } = makeSupabase({
      campaign_events: { data: events },
      opportunities: { data: [], error: null },
    });

    const result = await processReplies(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("aborta (erro) se a query de anti-join opportunities falha — não reprocessa tudo", async () => {
    const { supabase, chains } = makeSupabase({
      campaign_events: { data: [makeReplyEvent({ id: "event-1" })] },
      opportunities: { error: { message: "db down" } },
    });

    const result = await processReplies(supabase, { tenantId: "tenant-1" });

    expect(result.created).toBe(0);
    expect(result.errors[0].error).toContain("db down");
    expect(chains.opportunities.insert).not.toHaveBeenCalled();
  });
});
