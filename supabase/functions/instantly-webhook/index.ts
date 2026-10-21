/**
 * Instantly Webhook Edge Function
 * Story: 10.2 - Webhook Receiver (Supabase Edge Function)
 *
 * Recebe eventos de tracking do Instantly via webhook em tempo real.
 * Persiste opens, clicks, replies, bounces na tabela campaign_events.
 *
 * AC: #1 - POST válido → 200 OK + persiste evento (source: 'webhook')
 * AC: #2 - Mapeia external_campaign_id → campaign_id local + tenant_id
 * AC: #3 - Evento duplicado → ON CONFLICT DO NOTHING + 200 OK
 * AC: #4 - Payload inválido → 400 Bad Request
 * AC: #5 - Campanha desconhecida → 200 OK + console.warn
 * AC: #6 - Event types suportados: email_opened, email_link_clicked,
 *          reply_received, email_bounced, lead_unsubscribed
 *
 * Story 23.1 — Autenticação por segredo compartilhado (fail-closed):
 *   - O chamador envia o segredo por query `?token=<segredo>` ou pelo header
 *     `x-webhook-secret: <segredo>`. Comparação em tempo constante, antes de
 *     ler o corpo ou tocar o banco.
 *   - Sem segredo / segredo errado → 401 {"error":"Unauthorized"}.
 *   - INSTANTLY_WEBHOOK_SECRET ausente na env → 503 {"error":"Webhook not configured"}.
 *   - OPTIONS (preflight) segue 204 sem segredo; método ≠ POST segue 405.
 *
 * Setup (ação do operador — não automatizado):
 *   1. Criar o secret da Edge Function (Supabase → Edge Functions → Secrets):
 *        npx supabase secrets set INSTANTLY_WEBHOOK_SECRET=$(openssl rand -hex 32)
 *   2. Cadastrar/atualizar no Instantly a URL com o token:
 *        https://kdgogyqyaxncqoyklyxx.supabase.co/functions/v1/instantly-webhook?token=<INSTANTLY_WEBHOOK_SECRET>
 *   3. Publicar:
 *        npx supabase functions deploy instantly-webhook --no-verify-jwt
 *   Por que nesta ordem: a versão publicada hoje ignora a query, então a URL com
 *   token já funciona antes do deploy e nenhum evento leva 401 na transição.
 *
 * IMPORTANTE: --no-verify-jwt porque Instantly não envia JWT; a autenticação
 * é o segredo acima.
 *
 * SYNC-NOTICE: A lógica de negócio abaixo (mapEventType, validateWebhookPayload,
 * EVENT_TYPE_MAP, corsHeaders, extractWebhookSecret, safeEqual e o guard de
 * segredo) é duplicada em src/lib/webhook/instantly-webhook-utils.ts
 * onde é testada via Vitest. O runtime Deno não resolve imports de src/, portanto
 * esta cópia inline é necessária. Ao alterar lógica aqui, atualizar o utils também.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ==============================================
// CORS HEADERS
// ==============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ==============================================
// SHARED-SECRET AUTH (Story 23.1)
// ==============================================

const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

function extractWebhookSecret(url: string, headers: Headers): string | null {
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

function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ==============================================
// EVENT TYPE MAPPING (Instantly → Projeto)
// ==============================================

type EventType =
  | "email_opened"
  | "email_clicked"
  | "email_replied"
  | "email_bounced"
  | "email_unsubscribed";

const EVENT_TYPE_MAP: Record<string, EventType | null> = {
  email_opened: "email_opened",
  email_link_clicked: "email_clicked",
  reply_received: "email_replied",
  email_bounced: "email_bounced",
  lead_unsubscribed: "email_unsubscribed",
};

function mapEventType(instantlyEventType: string): EventType | null {
  return EVENT_TYPE_MAP[instantlyEventType] ?? null;
}

// ==============================================
// PAYLOAD VALIDATION
// ==============================================

interface InstantlyWebhookPayload {
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

interface ValidationResult {
  valid: true;
  payload: InstantlyWebhookPayload;
}

interface ValidationError {
  valid: false;
  error: string;
  missingFields: string[];
}

function validateWebhookPayload(
  body: unknown
): ValidationResult | ValidationError {
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

  return { valid: true, payload: payload as unknown as InstantlyWebhookPayload };
}

// ==============================================
// MAIN HANDLER
// ==============================================

Deno.serve(async (req: Request): Promise<Response> => {
  // 1.2 — CORS preflight (OPTIONS → 204)
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // 1.2 — Apenas POST permitido
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      }
    );
  }

  // Story 23.1 — Segredo compartilhado (fail-closed), antes do parse e do banco.
  // Nunca logar o segredo esperado nem o recebido.
  const expectedSecret = Deno.env.get("INSTANTLY_WEBHOOK_SECRET")?.trim();
  if (!expectedSecret) {
    console.error("INSTANTLY_WEBHOOK_SECRET not configured; rejecting webhook");
    return new Response(
      JSON.stringify({ error: "Webhook not configured" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 503,
      }
    );
  }
  const providedSecret = extractWebhookSecret(req.url, req.headers);
  if (!providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    console.warn(
      `Webhook rejected: secret ${providedSecret ? "invalid" : "missing"}`
    );
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      }
    );
  }

  // 1.3 — Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON payload" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }

  // 1.4 — Validação dos campos obrigatórios
  const validation = validateWebhookPayload(body);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ error: validation.error }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }

  const webhook = validation.payload;

  // 1.5 — Mapeamento de event type
  const mappedEventType = mapEventType(webhook.event_type);
  if (mappedEventType === null) {
    // Event type não suportado — ignorar silenciosamente (AC: #6)
    return new Response(
      JSON.stringify({ success: true, skipped: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  }

  // 1.6 — Inicializar Supabase client
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1.7 — Lookup da campanha por external_campaign_id (AC: #2)
  const { data: campaign, error: lookupError } = await supabase
    .from("campaigns")
    .select("id, tenant_id")
    .eq("external_campaign_id", webhook.campaign_id)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("Campaign lookup error:", lookupError.message);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }

  // 1.8 — Campanha não encontrada → 200 OK + log warning (AC: #5)
  if (!campaign) {
    console.warn(
      `Campaign not found for external_campaign_id: ${webhook.campaign_id}`
    );
    return new Response(
      JSON.stringify({ success: true, skipped: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  }

  // 1.9 — INSERT na campaign_events com ON CONFLICT DO NOTHING (AC: #3)
  const { error: insertError } = await supabase
    .from("campaign_events")
    .insert({
      tenant_id: campaign.tenant_id,
      campaign_id: campaign.id,
      event_type: mappedEventType,
      lead_email: webhook.lead_email,
      event_timestamp: webhook.timestamp || new Date().toISOString(),
      payload: body as Record<string, unknown>,
      source: "webhook",
    });

  // ON CONFLICT DO NOTHING — Supabase retorna erro 23505 para conflito de unique constraint
  // Tratamos como sucesso (AC: #3 — evento duplicado é ignorado silenciosamente)
  if (insertError && insertError.code !== "23505") {
    console.error("Insert error:", insertError.message);
    return new Response(
      JSON.stringify({ error: "Failed to persist event" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }

  // 1.10 — Retornar 200 OK (AC: #1)
  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
});
