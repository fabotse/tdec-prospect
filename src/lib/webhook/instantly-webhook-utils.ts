/**
 * Instantly Webhook — Pure Logic Functions
 * Story: 10.2 - Webhook Receiver (Supabase Edge Function)
 *
 * Funções puras extraídas do handler para permitir testes unitários via Vitest.
 *
 * SYNC-NOTICE: O Edge Function (supabase/functions/instantly-webhook/index.ts)
 * mantém uma cópia inline desta lógica porque o runtime Deno não resolve
 * imports de src/. Ao alterar lógica aqui, atualizar o Edge Function também.
 */

import type { EventType } from "@/types/tracking";

// ==============================================
// EVENT TYPE MAPPING (Instantly → Projeto)
// ==============================================

export const EVENT_TYPE_MAP: Record<string, EventType | null> = {
  email_opened: "email_opened",
  email_link_clicked: "email_clicked",
  reply_received: "email_replied",
  email_bounced: "email_bounced",
  lead_unsubscribed: "email_unsubscribed",
};

/**
 * Mapeia event type do Instantly para EventType do projeto.
 * Retorna null para event types não suportados (ignorar silenciosamente).
 */
export function mapEventType(instantlyEventType: string): EventType | null {
  return EVENT_TYPE_MAP[instantlyEventType] ?? null;
}

// ==============================================
// PAYLOAD VALIDATION
// ==============================================

export interface InstantlyWebhookPayload {
  event_type: string;
  lead_email: string;
  campaign_id: string;
  timestamp?: string;
  campaign_name?: string;
  workspace?: string;
  email_account?: string;
  step?: number;
  variant?: number;
  is_first?: boolean;
}

export interface ValidationSuccess {
  valid: true;
  payload: InstantlyWebhookPayload;
}

export interface ValidationFailure {
  valid: false;
  error: string;
  missingFields: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Valida payload do webhook do Instantly.
 * Campos obrigatórios: event_type, lead_email, campaign_id.
 */
export function validateWebhookPayload(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload", missingFields: [] };
  }

  const payload = body as Record<string, unknown>;
  const missingFields: string[] = [];

  if (!payload.event_type || typeof payload.event_type !== "string") {
    missingFields.push("event_type");
  }
  if (!payload.lead_email || typeof payload.lead_email !== "string") {
    missingFields.push("lead_email");
  }
  if (!payload.campaign_id || typeof payload.campaign_id !== "string") {
    missingFields.push("campaign_id");
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missingFields.join(", ")}`,
      missingFields,
    };
  }

  return {
    valid: true,
    payload: payload as unknown as InstantlyWebhookPayload,
  };
}

// ==============================================
// CAMPAIGN EVENT BUILDER
// ==============================================

export interface CampaignLookupResult {
  id: string;
  tenant_id: string;
}

export interface CampaignEventInsert {
  tenant_id: string;
  campaign_id: string;
  event_type: EventType;
  lead_email: string;
  event_timestamp: string;
  payload: Record<string, unknown>;
  source: "webhook";
}

/**
 * Constrói o objeto para INSERT na tabela campaign_events.
 */
export function buildCampaignEventInsert(
  campaign: CampaignLookupResult,
  webhook: InstantlyWebhookPayload,
  mappedEventType: EventType,
  rawPayload: Record<string, unknown>
): CampaignEventInsert {
  return {
    tenant_id: campaign.tenant_id,
    campaign_id: campaign.id,
    event_type: mappedEventType,
    lead_email: webhook.lead_email,
    event_timestamp: webhook.timestamp || new Date().toISOString(),
    payload: rawPayload,
    source: "webhook",
  };
}

// ==============================================
// CORS HEADERS
// ==============================================

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Cria response JSON com CORS headers.
 */
export function jsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    status,
  });
}

// ==============================================
// SHARED-SECRET AUTH (Story 23.1)
// ==============================================

/** Header alternativo à query `?token=` para enviar o segredo do webhook. */
export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

/**
 * Extrai o segredo enviado pelo chamador: query `token` primeiro, depois o
 * header `x-webhook-secret`. Retorna null quando nenhum dos dois veio.
 */
export function extractWebhookSecret(url: string, headers: Headers): string | null {
  let fromQuery: string | null = null;
  try {
    fromQuery = new URL(url).searchParams.get("token");
  } catch {
    fromQuery = null;
  }
  if (fromQuery) return fromQuery;
  const fromHeader = headers.get(WEBHOOK_SECRET_HEADER);
  return fromHeader ? fromHeader : null;
}

/**
 * Comparação de strings em tempo constante (XOR por char, sem early-return).
 * Tamanhos diferentes → false.
 */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ==============================================
// WEBHOOK REQUEST PROCESSOR
// (Integration-testable handler logic)
// ==============================================

export interface WebhookDeps {
  lookupCampaign: (externalCampaignId: string) => Promise<{
    data: CampaignLookupResult | null;
    error: { message: string } | null;
  }>;
  insertEvent: (event: CampaignEventInsert) => Promise<{
    error: { message: string; code: string } | null;
  }>;
  /**
   * Story 23.1: segredo compartilhado. `expectedSecret` vem da env
   * INSTANTLY_WEBHOOK_SECRET; `providedSecret` de `extractWebhookSecret`.
   */
  auth: {
    expectedSecret: string | undefined;
    providedSecret: string | null;
  };
}

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
  warning?: string;
}

/**
 * Processa um request de webhook do Instantly.
 * Encapsula toda a lógica de negócio do handler para ser testável via Vitest.
 *
 * SYNC-NOTICE: O Edge Function (supabase/functions/instantly-webhook/index.ts)
 * replica esta lógica para o runtime Deno. Ambos devem ser mantidos em sincronia.
 */
export async function processWebhookRequest(
  method: string,
  body: unknown,
  bodyParseError: boolean,
  deps: WebhookDeps
): Promise<WebhookResponse> {
  // CORS preflight (OPTIONS → 204)
  if (method === "OPTIONS") {
    return { status: 204, body: {} };
  }

  // Apenas POST permitido
  if (method !== "POST") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  // Story 23.1: segredo compartilhado, fail-closed, antes do parse e do banco.
  const { expectedSecret, providedSecret } = deps.auth;
  if (!expectedSecret) {
    return { status: 503, body: { error: "Webhook not configured" } };
  }
  if (!providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // JSON parse error
  if (bodyParseError) {
    return { status: 400, body: { error: "Invalid JSON payload" } };
  }

  // Validação dos campos obrigatórios
  const validation = validateWebhookPayload(body);
  if (!validation.valid) {
    return { status: 400, body: { error: validation.error } };
  }

  const webhook = validation.payload;

  // Mapeamento de event type
  const mappedEventType = mapEventType(webhook.event_type);
  if (mappedEventType === null) {
    return { status: 200, body: { success: true, skipped: true } };
  }

  // Lookup da campanha por external_campaign_id
  const { data: campaign, error: lookupError } = await deps.lookupCampaign(
    webhook.campaign_id
  );

  if (lookupError) {
    return { status: 500, body: { error: "Internal error" } };
  }

  // Campanha não encontrada → 200 OK + warning
  if (!campaign) {
    return {
      status: 200,
      body: { success: true, skipped: true },
      warning: `Campaign not found for external_campaign_id: ${webhook.campaign_id}`,
    };
  }

  // Build e INSERT com tratamento de conflito
  const eventInsert = buildCampaignEventInsert(
    campaign,
    webhook,
    mappedEventType,
    body as Record<string, unknown>
  );

  const { error: insertError } = await deps.insertEvent(eventInsert);

  // ON CONFLICT DO NOTHING — código 23505 é duplicata, tratamos como sucesso
  if (insertError && insertError.code !== "23505") {
    return { status: 500, body: { error: "Failed to persist event" } };
  }

  return { status: 200, body: { success: true } };
}
