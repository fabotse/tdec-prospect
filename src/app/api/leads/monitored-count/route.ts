/**
 * Monitored Leads Count API Route
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 *
 * AC: #6 - Contador "X/100 leads monitorados"
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/leads/monitored-count
 * Returns current monitored count and max limit
 */
export async function GET() {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Get current count
  const { count: currentCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_monitored", true);

  // Get max from config (fallback 100)
  const { data: config } = await supabase
    .from("monitoring_configs")
    .select("max_monitored_leads")
    .single();
  const max = config?.max_monitored_leads ?? 100;

  return NextResponse.json({
    data: { current: currentCount ?? 0, max },
  });
}
