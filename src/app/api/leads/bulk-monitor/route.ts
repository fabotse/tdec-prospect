/**
 * Bulk Lead Monitoring Toggle API Route
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 *
 * AC: #8 - API bulk PATCH /api/leads/bulk-monitor
 * AC: #3 - Validação LinkedIn (filtro)
 * AC: #4 - Limite 100/tenant
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const bulkMonitorSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead inválido"))
    .min(1, "Selecione pelo menos um lead"),
  isMonitored: z.boolean(),
});

/**
 * PATCH /api/leads/bulk-monitor
 * Toggle monitoring for multiple leads at once
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Corpo da requisição inválido" } },
      { status: 400 }
    );
  }

  const validation = bulkMonitorSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.issues[0]?.message || "Dados inválidos",
        },
      },
      { status: 400 }
    );
  }

  const { leadIds, isMonitored } = validation.data;

  // When disabling, skip LinkedIn/limit validation
  if (!isMonitored) {
    const { error, count } = await supabase
      .from("leads")
      .update({ is_monitored: false, updated_at: new Date().toISOString() })
      .in("id", leadIds);

    if (error) {
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar monitoramento" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { updated: count ?? leadIds.length, skippedNoLinkedin: [], limitExceeded: false },
    });
  }

  // AC #3: Filter leads without linkedin_url + H2 fix: exclude already-monitored
  const { data: leadsData } = await supabase
    .from("leads")
    .select("id, linkedin_url, is_monitored")
    .in("id", leadIds);

  const leadsWithLinkedin = leadsData?.filter((l) => l.linkedin_url !== null) ?? [];
  const skippedNoLinkedin = leadIds.filter(
    (id) => !leadsWithLinkedin.some((l) => l.id === id)
  );
  // H2 fix: only count leads that are NOT already monitored as needing new slots
  const eligible = leadsWithLinkedin.map((l) => l.id);
  const newMonitorCount = leadsWithLinkedin.filter((l) => !l.is_monitored).length;

  if (eligible.length === 0) {
    return NextResponse.json({
      data: { updated: 0, skippedNoLinkedin, limitExceeded: false },
    });
  }

  // AC #4: Check monitoring limit
  const { data: config } = await supabase
    .from("monitoring_configs")
    .select("max_monitored_leads")
    .single();
  const maxLimit = config?.max_monitored_leads ?? 100;

  const { count: currentCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("is_monitored", true);

  if ((currentCount ?? 0) + newMonitorCount > maxLimit) {
    return NextResponse.json(
      {
        error: {
          code: "LIMIT_EXCEEDED",
          message: `Limite de ${maxLimit} leads monitorados seria excedido. Atual: ${currentCount ?? 0}, tentando adicionar: ${newMonitorCount}`,
        },
      },
      { status: 409 }
    );
  }

  // Update eligible leads
  const { error, count } = await supabase
    .from("leads")
    .update({ is_monitored: true, updated_at: new Date().toISOString() })
    .in("id", eligible);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar monitoramento" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      updated: count ?? eligible.length,
      skippedNoLinkedin,
      limitExceeded: false,
    },
  });
}
