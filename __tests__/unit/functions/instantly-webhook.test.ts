/**
 * Tests: Instantly Webhook — Story 10.2
 *
 * Testa as funções puras de processamento do webhook e o fluxo
 * completo do handler usando mock Supabase.
 *
 * Task 2: Testes unitários para a lógica de processamento
 * Task 3: Mock Supabase para campaign_events e campaigns
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapEventType,
  validateWebhookPayload,
  buildCampaignEventInsert,
  processWebhookRequest,
  EVENT_TYPE_MAP,
  CORS_HEADERS,
  jsonResponse,
} from "@/lib/webhook/instantly-webhook-utils";
import type {
  CampaignLookupResult,
  InstantlyWebhookPayload,
  WebhookDeps,
} from "@/lib/webhook/instantly-webhook-utils";
import {
  createMockInstantlyWebhookPayload,
  createMockCampaignEvent,
} from "../../helpers/mock-data";
import {
  createMockSupabaseClient,
  mockTableResponse,
  createChainBuilder,
} from "../../helpers/mock-supabase";

// ==============================================
// Task 2.7: Teste de mapeamento de event types
// ==============================================

describe("mapEventType", () => {
  it("mapeia email_opened → email_opened", () => {
    expect(mapEventType("email_opened")).toBe("email_opened");
  });

  it("mapeia email_link_clicked → email_clicked", () => {
    expect(mapEventType("email_link_clicked")).toBe("email_clicked");
  });

  it("mapeia reply_received → email_replied", () => {
    expect(mapEventType("reply_received")).toBe("email_replied");
  });

  it("mapeia email_bounced → email_bounced", () => {
    expect(mapEventType("email_bounced")).toBe("email_bounced");
  });

  it("mapeia lead_unsubscribed → email_unsubscribed", () => {
    expect(mapEventType("lead_unsubscribed")).toBe("email_unsubscribed");
  });

  it("retorna null para event type desconhecido (email_sent)", () => {
    expect(mapEventType("email_sent")).toBeNull();
  });

  it("retorna null para event type desconhecido (campaign_completed)", () => {
    expect(mapEventType("campaign_completed")).toBeNull();
  });

  it("retorna null para event type desconhecido (account_error)", () => {
    expect(mapEventType("account_error")).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(mapEventType("")).toBeNull();
  });

  it("cobre todos os 5 mapeamentos definidos", () => {
    const mappedTypes = Object.entries(EVENT_TYPE_MAP).filter(
      ([, v]) => v !== null
    );
    expect(mappedTypes).toHaveLength(5);
  });
});

// ==============================================
// Task 2.2 & 2.6: Teste de payload inválido
// ==============================================

describe("validateWebhookPayload", () => {
  it("aceita payload válido completo", () => {
    const payload = createMockInstantlyWebhookPayload();
    const result = validateWebhookPayload(payload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.event_type).toBe("email_opened");
      expect(result.payload.lead_email).toBe("joao@empresa.com.br");
      expect(result.payload.campaign_id).toBe("instantly-campaign-abc-123");
    }
  });

  it("aceita payload com apenas campos obrigatórios", () => {
    const result = validateWebhookPayload({
      event_type: "email_opened",
      lead_email: "test@test.com",
      campaign_id: "abc-123",
    });
    expect(result.valid).toBe(true);
  });

  it("rejeita quando event_type está faltando", () => {
    const result = validateWebhookPayload({
      lead_email: "test@test.com",
      campaign_id: "abc-123",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingFields).toContain("event_type");
    }
  });

  it("rejeita quando lead_email está faltando", () => {
    const result = validateWebhookPayload({
      event_type: "email_opened",
      campaign_id: "abc-123",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingFields).toContain("lead_email");
    }
  });

  it("rejeita quando campaign_id está faltando", () => {
    const result = validateWebhookPayload({
      event_type: "email_opened",
      lead_email: "test@test.com",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingFields).toContain("campaign_id");
    }
  });

  it("rejeita quando todos os campos obrigatórios estão faltando", () => {
    const result = validateWebhookPayload({});
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingFields).toHaveLength(3);
      expect(result.missingFields).toContain("event_type");
      expect(result.missingFields).toContain("lead_email");
      expect(result.missingFields).toContain("campaign_id");
    }
  });

  it("rejeita null", () => {
    const result = validateWebhookPayload(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Invalid payload");
    }
  });

  it("rejeita undefined", () => {
    const result = validateWebhookPayload(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejeita string", () => {
    const result = validateWebhookPayload("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejeita number", () => {
    const result = validateWebhookPayload(42);
    expect(result.valid).toBe(false);
  });

  it("rejeita campos com tipo errado (event_type como number)", () => {
    const result = validateWebhookPayload({
      event_type: 123,
      lead_email: "test@test.com",
      campaign_id: "abc-123",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingFields).toContain("event_type");
    }
  });

  it("inclui mensagem de erro descritiva", () => {
    const result = validateWebhookPayload({
      lead_email: "test@test.com",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Missing required fields");
      expect(result.error).toContain("event_type");
      expect(result.error).toContain("campaign_id");
    }
  });
});

// ==============================================
// buildCampaignEventInsert
// ==============================================

describe("buildCampaignEventInsert", () => {
  it("constrói insert com dados corretos", () => {
    const campaign: CampaignLookupResult = {
      id: "campaign-uuid-1",
      tenant_id: "tenant-uuid-1",
    };
    const webhook = createMockInstantlyWebhookPayload();
    const rawPayload = { ...webhook };

    const result = buildCampaignEventInsert(
      campaign,
      webhook,
      "email_opened",
      rawPayload
    );

    expect(result.tenant_id).toBe("tenant-uuid-1");
    expect(result.campaign_id).toBe("campaign-uuid-1");
    expect(result.event_type).toBe("email_opened");
    expect(result.lead_email).toBe("joao@empresa.com.br");
    expect(result.event_timestamp).toBe("2026-02-09T15:30:00.000Z");
    expect(result.source).toBe("webhook");
    expect(result.payload).toEqual(rawPayload);
  });

  it("usa timestamp do webhook quando disponível", () => {
    const campaign: CampaignLookupResult = {
      id: "c-1",
      tenant_id: "t-1",
    };
    const webhook = createMockInstantlyWebhookPayload({
      timestamp: "2026-03-01T10:00:00.000Z",
    });

    const result = buildCampaignEventInsert(
      campaign,
      webhook,
      "email_clicked",
      {}
    );

    expect(result.event_timestamp).toBe("2026-03-01T10:00:00.000Z");
  });

  it("usa data atual quando timestamp está vazio", () => {
    const campaign: CampaignLookupResult = {
      id: "c-1",
      tenant_id: "t-1",
    };
    const webhook = createMockInstantlyWebhookPayload({ timestamp: "" });

    const before = new Date().toISOString();
    const result = buildCampaignEventInsert(
      campaign,
      webhook,
      "email_replied",
      {}
    );
    const after = new Date().toISOString();

    expect(result.event_timestamp >= before).toBe(true);
    expect(result.event_timestamp <= after).toBe(true);
  });

  it("sempre define source como 'webhook'", () => {
    const campaign: CampaignLookupResult = {
      id: "c-1",
      tenant_id: "t-1",
    };
    const webhook = createMockInstantlyWebhookPayload();

    const result = buildCampaignEventInsert(
      campaign,
      webhook,
      "email_bounced",
      {}
    );

    expect(result.source).toBe("webhook");
  });
});

// ==============================================
// jsonResponse helper
// ==============================================

describe("jsonResponse", () => {
  it("cria Response com status correto", async () => {
    const res = jsonResponse({ success: true }, 200);
    expect(res.status).toBe(200);
  });

  it("inclui CORS headers", async () => {
    const res = jsonResponse({ error: "test" }, 400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS"
    );
  });

  it("define Content-Type como application/json", async () => {
    const res = jsonResponse({ success: true }, 200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("serializa body como JSON", async () => {
    const res = jsonResponse({ success: true, data: "test" }, 200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: "test" });
  });
});

// ==============================================
// CORS_HEADERS
// ==============================================

describe("CORS_HEADERS", () => {
  it("permite qualquer origin", () => {
    expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("permite métodos POST e OPTIONS", () => {
    expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
  });

  it("permite headers necessários", () => {
    const headers = CORS_HEADERS["Access-Control-Allow-Headers"];
    expect(headers).toContain("content-type");
    expect(headers).toContain("authorization");
    expect(headers).toContain("apikey");
  });
});

// ==============================================
// Mock Factories (Task 4 validation)
// ==============================================

describe("mock factories", () => {
  it("createMockInstantlyWebhookPayload cria payload completo", () => {
    const payload = createMockInstantlyWebhookPayload();
    expect(payload.event_type).toBe("email_opened");
    expect(payload.lead_email).toBe("joao@empresa.com.br");
    expect(payload.campaign_id).toBe("instantly-campaign-abc-123");
    expect(payload.timestamp).toBeDefined();
  });

  it("createMockInstantlyWebhookPayload aceita overrides", () => {
    const payload = createMockInstantlyWebhookPayload({
      event_type: "email_bounced",
      lead_email: "maria@test.com",
    });
    expect(payload.event_type).toBe("email_bounced");
    expect(payload.lead_email).toBe("maria@test.com");
    expect(payload.campaign_id).toBe("instantly-campaign-abc-123");
  });

  it("createMockCampaignEvent cria evento persistido", () => {
    const event = createMockCampaignEvent();
    expect(event.id).toBe("event-1");
    expect(event.source).toBe("webhook");
    expect(event.event_type).toBe("email_opened");
    expect(event.tenant_id).toBe("tenant-1");
  });

  it("createMockCampaignEvent aceita overrides", () => {
    const event = createMockCampaignEvent({
      event_type: "email_clicked",
      source: "polling",
    });
    expect(event.event_type).toBe("email_clicked");
    expect(event.source).toBe("polling");
  });
});

// ==============================================
// Task 3: Mock Supabase integration
// (Validação de que mock-supabase funciona
//  com campaign_events e campaigns)
// ==============================================

describe("mock Supabase — campaign tables", () => {
  it("Task 3.2: mock lookup de campaigns por external_campaign_id", async () => {
    const client = createMockSupabaseClient();
    const campaignChain = mockTableResponse(client, "campaigns", {
      data: { id: "campaign-uuid-1", tenant_id: "tenant-uuid-1" },
    });

    const result = await client
      .from("campaigns")
      .select("id, tenant_id")
      .eq("external_campaign_id", "abc-123")
      .limit(1)
      .maybeSingle();

    expect(result.data).toEqual({
      id: "campaign-uuid-1",
      tenant_id: "tenant-uuid-1",
    });
    expect(result.error).toBeNull();
    expect(campaignChain.eq).toHaveBeenCalledWith(
      "external_campaign_id",
      "abc-123"
    );
  });

  it("Task 3.1: mock insert de campaign_events", async () => {
    const client = createMockSupabaseClient();
    const eventsChain = mockTableResponse(client, "campaign_events", {
      data: null,
      error: null,
    });

    const result = await client.from("campaign_events").insert({
      tenant_id: "t-1",
      campaign_id: "c-1",
      event_type: "email_opened",
      lead_email: "test@test.com",
      event_timestamp: "2026-02-09T15:30:00.000Z",
      payload: {},
      source: "webhook",
    });

    expect(result.error).toBeNull();
    expect(eventsChain.insert).toHaveBeenCalled();
  });

  it("mock de campanha não encontrada retorna null", async () => {
    const client = createMockSupabaseClient();
    mockTableResponse(client, "campaigns", { data: null });

    const result = await client
      .from("campaigns")
      .select("id, tenant_id")
      .eq("external_campaign_id", "unknown-id")
      .limit(1)
      .maybeSingle();

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it("mock de erro no insert (unique constraint 23505)", async () => {
    const client = createMockSupabaseClient();
    mockTableResponse(client, "campaign_events", {
      data: null,
      error: { message: "duplicate key value", code: "23505" },
    });

    const result = await client.from("campaign_events").insert({});
    expect(result.error).toBeDefined();
    expect((result.error as { code: string }).code).toBe("23505");
  });
});

// ==============================================
// processWebhookRequest — Handler Flow Tests
// (Fixes H2: Tasks 2.5/2.8, H3: Tasks 2.1/2.3/2.4)
// ==============================================

describe("processWebhookRequest — handler flow", () => {
  const createMockDeps = (overrides?: Partial<WebhookDeps>): WebhookDeps => ({
    lookupCampaign: vi.fn().mockResolvedValue({
      data: { id: "campaign-uuid-1", tenant_id: "tenant-uuid-1" },
      error: null,
    }),
    insertEvent: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  });

  // Task 2.8: CORS preflight (OPTIONS → 204)
  it("OPTIONS → 204", async () => {
    const deps = createMockDeps();
    const result = await processWebhookRequest("OPTIONS", null, false, deps);
    expect(result.status).toBe(204);
  });

  // Task 2.5: método HTTP incorreto → 405
  it("GET → 405 Method not allowed", async () => {
    const deps = createMockDeps();
    const result = await processWebhookRequest("GET", null, false, deps);
    expect(result.status).toBe(405);
    expect(result.body.error).toBe("Method not allowed");
  });

  it("PUT → 405 Method not allowed", async () => {
    const deps = createMockDeps();
    const result = await processWebhookRequest("PUT", null, false, deps);
    expect(result.status).toBe(405);
  });

  // Task 2.6: JSON malformado → 400
  it("JSON parse error → 400", async () => {
    const deps = createMockDeps();
    const result = await processWebhookRequest("POST", null, true, deps);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Invalid JSON payload");
  });

  // Task 2.2: payload inválido (campos faltando) → 400
  it("payload sem campos obrigatórios → 400", async () => {
    const deps = createMockDeps();
    const result = await processWebhookRequest("POST", {}, false, deps);
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("Missing required fields");
  });

  // Event type não mapeável → 200 skip
  it("event type desconhecido → 200 skip", async () => {
    const deps = createMockDeps();
    const payload = createMockInstantlyWebhookPayload({
      event_type: "email_sent",
    });
    const result = await processWebhookRequest("POST", payload, false, deps);
    expect(result.status).toBe(200);
    expect(result.body.skipped).toBe(true);
    expect(deps.lookupCampaign).not.toHaveBeenCalled();
  });

  // Task 2.1: payload válido → evento persistido → 200
  it("payload válido → lookup + insert → 200 success (AC: #1, #2)", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const lookupFn = vi.fn().mockResolvedValue({
      data: { id: "campaign-uuid-1", tenant_id: "tenant-uuid-1" },
      error: null,
    });
    const deps = createMockDeps({
      lookupCampaign: lookupFn,
      insertEvent: insertFn,
    });
    const payload = createMockInstantlyWebhookPayload();

    const result = await processWebhookRequest("POST", payload, false, deps);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.skipped).toBeUndefined();
    expect(lookupFn).toHaveBeenCalledWith("instantly-campaign-abc-123");
    expect(insertFn).toHaveBeenCalledOnce();

    const insertArg = insertFn.mock.calls[0][0];
    expect(insertArg.source).toBe("webhook");
    expect(insertArg.event_type).toBe("email_opened");
    expect(insertArg.tenant_id).toBe("tenant-uuid-1");
    expect(insertArg.campaign_id).toBe("campaign-uuid-1");
  });

  // Task 2.3: campanha desconhecida → 200 OK + warning (AC: #5)
  it("campanha desconhecida → 200 skip + warning", async () => {
    const deps = createMockDeps({
      lookupCampaign: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const payload = createMockInstantlyWebhookPayload();

    const result = await processWebhookRequest("POST", payload, false, deps);

    expect(result.status).toBe(200);
    expect(result.body.skipped).toBe(true);
    expect(result.warning).toContain("Campaign not found");
    expect(deps.insertEvent).not.toHaveBeenCalled();
  });

  // Task 2.4: evento duplicado → ON CONFLICT DO NOTHING (AC: #3)
  it("evento duplicado (23505) → 200 success", async () => {
    const deps = createMockDeps({
      insertEvent: vi.fn().mockResolvedValue({
        error: { message: "duplicate key", code: "23505" },
      }),
    });
    const payload = createMockInstantlyWebhookPayload();

    const result = await processWebhookRequest("POST", payload, false, deps);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  // Erro no lookup → 500
  it("erro no lookup da campanha → 500", async () => {
    const deps = createMockDeps({
      lookupCampaign: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "connection error" },
      }),
    });
    const payload = createMockInstantlyWebhookPayload();

    const result = await processWebhookRequest("POST", payload, false, deps);

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("Internal error");
  });

  // Erro no insert (não duplicado) → 500
  it("erro no insert (não 23505) → 500", async () => {
    const deps = createMockDeps({
      insertEvent: vi.fn().mockResolvedValue({
        error: { message: "constraint violation", code: "23502" },
      }),
    });
    const payload = createMockInstantlyWebhookPayload();

    const result = await processWebhookRequest("POST", payload, false, deps);

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("Failed to persist event");
  });
});
