/**
 * Edge Function: reply-sweep
 * Story: 21.2 - Ingestão de Respostas por Polling + Processador + Backfill
 *
 * Thin cron trigger that calls the Next.js API Route for the reply loop.
 * Called by pg_cron every 5 minutes via pg_net (migration 00056).
 *
 * All business logic lives in the API Route (Node.js environment) to reuse
 * TrackingService, decryptApiKey, and the full Vitest ecosystem.
 *
 * Deployment (COM verificação de JWT — nunca --no-verify-jwt):
 *   npx supabase functions deploy reply-sweep
 *
 * Auth: só aceita a service role (o pg_cron). A anon key recebe 401.
 *
 * Secrets (Supabase Dashboard → Edge Function env):
 *   NEXT_APP_URL, REPLIES_CRON_SECRET (must match Vercel env).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ==============================================
// AUTH — só o pg_cron (service role) passa
// ==============================================
// SYNC-NOTICE: cópia inline de src/lib/cron/cron-trigger-auth.ts (testada via
// Vitest). O runtime Deno não resolve imports de src/; ao alterar lá, atualizar
// aqui e na outra função de cron (reply-sweep / monitor-leads).
// O caso "JWT com role service_role" só é seguro porque a função é publicada
// COM verify_jwt (o gateway já validou a assinatura). Nunca usar --no-verify-jwt.

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function readJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function isServiceRoleCaller(
  authorization: string | null,
  serviceRoleKey: string | undefined
): boolean {
  const token = extractBearerToken(authorization);
  if (!token) return false;
  const expected = serviceRoleKey?.trim();
  if (expected && safeEqual(token, expected)) return true;
  return readJwtRole(token) === "service_role";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (
    !isServiceRoleCaller(
      req.headers.get("authorization"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    )
  ) {
    console.warn("reply-sweep rejected: caller is not service_role");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  try {
    const nextAppUrl = Deno.env.get("NEXT_APP_URL");
    const cronSecret = Deno.env.get("REPLIES_CRON_SECRET");

    if (!nextAppUrl || !cronSecret) {
      console.error(
        "Missing environment variables: NEXT_APP_URL or REPLIES_CRON_SECRET"
      );
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const response = await fetch(`${nextAppUrl}/api/replies/process-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("reply-sweep error:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
