/**
 * Edge Function: monitor-leads
 * Story: 13.3 - Edge Function de Verificação Semanal
 *
 * Thin cron trigger that calls the Next.js API Route for batch processing.
 * Called by pg_cron every 5 minutes via pg_net.
 *
 * All business logic lives in the API Route (Node.js environment)
 * to reuse ApifyService, decryptApiKey, and the full test ecosystem.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const nextAppUrl = Deno.env.get("NEXT_APP_URL");
    const cronSecret = Deno.env.get("MONITORING_CRON_SECRET");

    if (!nextAppUrl || !cronSecret) {
      console.error(
        "Missing environment variables: NEXT_APP_URL or MONITORING_CRON_SECRET"
      );
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const response = await fetch(
      `${nextAppUrl}/api/monitoring/process-batch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`,
        },
      }
    );

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("monitor-leads error:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
