/**
 * SignalHire Callback Edge Function
 * Story: 4.4.2 - SignalHire Callback Architecture
 *
 * Esta Edge Function recebe callbacks do SignalHire após o processamento
 * de requisições de phone lookup. O SignalHire envia um POST com os
 * resultados, e esta função atualiza a tabela signalhire_lookups.
 *
 * AC: #2 - Edge Function Callback Receiver
 * AC: #5 - Extração Correta de Telefone
 *
 * Deployment:
 *   npx supabase functions deploy signalhire-callback --no-verify-jwt
 *
 * IMPORTANTE: --no-verify-jwt é necessário porque o SignalHire não envia JWT.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==============================================
// CORS HEADERS
// ==============================================

/**
 * CORS headers for SignalHire callback endpoint.
 *
 * SECURITY NOTE: Allow-Origin is intentionally set to "*" because:
 * 1. SignalHire's servers must be able to POST callbacks to this endpoint
 * 2. SignalHire does not publish a list of IPs we could whitelist
 * 3. The endpoint only accepts POST with specific JSON payload structure
 * 4. Validation is done via request_id matching in database
 * 5. No sensitive data is exposed in responses (only success/failure)
 *
 * If SignalHire publishes callback IPs in the future, consider restricting
 * Access-Control-Allow-Origin to those specific origins.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ==============================================
// TYPES (Estrutura real da API SignalHire)
// ==============================================

/**
 * Status possíveis retornados no callback do SignalHire
 */
type SignalHireCallbackStatus =
  | "success"
  | "failed"
  | "credits_are_over"
  | "timeout_exceeded"
  | "duplicate_query";

/**
 * Contato retornado no callback
 * IMPORTANTE: A API usa "contacts[]" com "type" e "value"
 */
interface SignalHireContact {
  type: string; // "phone" | "email"
  value: string;
  rating?: string;
  subType?: string; // "mobile" | "work_phone" | "personal" | "work"
  info?: string;
}

/**
 * Dados do candidato no callback
 * IMPORTANTE: A API usa "candidate", NÃO "person"
 */
interface SignalHireCandidate {
  uid?: string;
  fullName?: string;
  gender?: string | null;
  photo?: { url: string };
  locations?: Array<{ name: string }>;
  skills?: string[];
  education?: Array<{
    faculty?: string;
    university?: string;
    url?: string;
    startedYear?: number;
    endedYear?: number;
    degree?: string[];
  }>;
  experience?: Array<{
    position?: string;
    company?: string;
    current?: boolean;
    started?: string;
    ended?: string | null;
  }>;
  headLine?: string;
  summary?: string;
  contacts?: SignalHireContact[];
  social?: Array<{
    type: string;
    link: string;
    rating?: string;
  }>;
}

/**
 * Item individual no callback
 */
interface SignalHireCallbackItem {
  item: string; // O identifier original (LinkedIn URL ou email)
  status: SignalHireCallbackStatus;
  candidate?: SignalHireCandidate;
  error?: string;
}

/**
 * Database status values
 */
type LookupDbStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "not_found"
  | "credits_exhausted";

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Extrair telefone da lista de contatos
 * AC: #5 - Priorização: mobile > work_phone > personal > first
 *
 * @param contacts - Array de contatos do SignalHire
 * @returns Telefone primário ou null
 */
function extractPhone(contacts?: SignalHireContact[]): string | null {
  if (!contacts || contacts.length === 0) return null;

  // Filtrar apenas contatos do tipo "phone"
  const phones = contacts.filter((c) => c.type === "phone");
  if (phones.length === 0) return null;

  // Prioridade: mobile > work_phone > personal > primeiro disponível
  const mobile = phones.find((p) => p.subType === "mobile");
  if (mobile) return mobile.value;

  const work = phones.find((p) => p.subType === "work_phone");
  if (work) return work.value;

  const personal = phones.find((p) => p.subType === "personal");
  if (personal) return personal.value;

  // Fallback para o primeiro telefone
  return phones[0].value;
}

/**
 * Mapear status do SignalHire para status do banco
 */
function mapStatus(
  signalhireStatus: SignalHireCallbackStatus,
  hasPhone: boolean
): LookupDbStatus {
  switch (signalhireStatus) {
    case "success":
      return hasPhone ? "success" : "not_found";
    case "failed":
      return "failed";
    case "credits_are_over":
      return "credits_exhausted";
    case "timeout_exceeded":
      return "failed";
    case "duplicate_query":
      return "failed";
    default:
      return "failed";
  }
}

/**
 * Obter mensagem de erro baseada no status
 */
function getErrorMessage(
  signalhireStatus: SignalHireCallbackStatus,
  error?: string,
  hasPhone?: boolean
): string | null {
  switch (signalhireStatus) {
    case "success":
      return hasPhone ? null : "Telefone não encontrado nos contatos";
    case "failed":
      return error || "Falha no processamento";
    case "credits_are_over":
      return "Créditos do SignalHire esgotados";
    case "timeout_exceeded":
      return "Timeout na busca";
    case "duplicate_query":
      return "Consulta duplicada";
    default:
      return "Status desconhecido";
  }
}

// ==============================================
// MAIN HANDLER
// ==============================================

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      }
    );
  }

  try {
    // AC: #2.3 - Extrair request_id do header Request-Id
    const requestId = req.headers.get("request-id") || req.headers.get("Request-Id");

    if (!requestId) {
      console.error("Missing Request-Id header");
      return new Response(
        JSON.stringify({ error: "Missing Request-Id header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Parse callback payload (array of results)
    let items: SignalHireCallbackItem[];
    try {
      items = await req.json();
    } catch {
      console.error("Invalid JSON payload");
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate payload is an array
    if (!Array.isArray(items)) {
      console.error("Payload must be an array");
      return new Response(
        JSON.stringify({ error: "Payload must be an array" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Initialize Supabase client with service role key
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

    // AC: #2.4 - Processar cada item do callback
    const results: Array<{ item: string; updated: boolean; error?: string }> = [];

    for (const item of items) {
      try {
        // Extrair telefone dos contatos (AC: #5)
        const phone = extractPhone(item.candidate?.contacts);
        const hasPhone = phone !== null;

        // Mapear status e mensagem de erro
        const dbStatus = mapStatus(item.status, hasPhone);
        const errorMessage = getErrorMessage(item.status, item.error, hasPhone);

        // AC: #2.6 - Atualizar registro na tabela signalhire_lookups
        // NOTA: Matching apenas por request_id (sem identifier) porque o
        // SignalHire normaliza URLs (ex: linkedin.com/in/marco-fabossi-jr-8b2...
        // vira linkedin.com/in/marcofabossi). Como enviamos 1 item por request,
        // o request_id é suficiente para identificar o lookup.
        const { data: updateData, error: updateError } = await supabase
          .from("signalhire_lookups")
          .update({
            status: dbStatus,
            phone: phone,
            raw_response: item,
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq("request_id", requestId)
          .select("id");

        if (updateError) {
          console.error(`Failed to update lookup for ${item.item}:`, updateError);
          results.push({
            item: item.item,
            updated: false,
            error: updateError.message,
          });
        } else if (!updateData || updateData.length === 0) {
          console.error(`No lookup found for request_id=${requestId}, item=${item.item}`);
          results.push({
            item: item.item,
            updated: false,
            error: `No matching lookup row for request_id=${requestId}`,
          });
        } else {
          console.log(`Updated lookup ${updateData[0].id} for ${item.item}: status=${dbStatus}, phone=${phone ? "found" : "not found"}`);
          results.push({ item: item.item, updated: true });
        }
      } catch (itemError) {
        const errorMsg = itemError instanceof Error ? itemError.message : "Unknown error";
        console.error(`Error processing item ${item.item}:`, errorMsg);
        results.push({ item: item.item, updated: false, error: errorMsg });
      }
    }

    // AC: #2.7 - Retornar 200 OK para o SignalHire
    return new Response(
      JSON.stringify({
        success: true,
        processed: items.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    // AC: #2 - Se falhar, retorna HTTP 500 para SignalHire retry
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error processing callback:", errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
