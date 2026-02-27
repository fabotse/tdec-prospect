/**
 * Lead Monitoring Toggle API Route
 * Story 13.2: Toggle de Monitoramento na Tabela de Leads
 *
 * AC: #7 - API individual PATCH /api/leads/[leadId]/monitor
 * AC: #3 - Validação LinkedIn
 * AC: #4 - Limite 100/tenant
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

const uuidSchema = z.string().uuid("ID de lead inválido");

const updateMonitoringSchema = z.object({
  isMonitored: z.boolean(),
});

/**
 * PATCH /api/leads/[leadId]/monitor
 * Toggle monitoring for a single lead
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { leadId } = await params;

  // Validate UUID format
  const uuidValidation = uuidSchema.safeParse(leadId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de lead inválido" } },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Corpo da requisição inválido" } },
      { status: 400 }
    );
  }

  const validation = updateMonitoringSchema.safeParse(body);
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

  const { isMonitored } = validation.data;

  // AC #3 + #4: Validations only when ENABLING monitoring
  if (isMonitored) {
    // AC #3: Check if lead has linkedin_url + M1 fix: detect non-existent lead
    const { data: leadData } = await supabase
      .from("leads")
      .select("linkedin_url, is_monitored")
      .eq("id", leadId)
      .single();

    if (!leadData) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Lead não encontrado" } },
        { status: 404 }
      );
    }

    if (!leadData.linkedin_url) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Lead sem perfil LinkedIn não pode ser monitorado",
          },
        },
        { status: 400 }
      );
    }

    // H1 fix: skip limit check if lead is already monitored (no-op toggle)
    if (!leadData.is_monitored) {
      // AC #4: Check monitoring limit only for NEW monitoring activations
      const { data: config } = await supabase
        .from("monitoring_configs")
        .select("max_monitored_leads")
        .single();
      const maxLimit = config?.max_monitored_leads ?? 100;

      const { count: currentCount } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_monitored", true);

      if ((currentCount ?? 0) >= maxLimit) {
        return NextResponse.json(
          {
            error: {
              code: "LIMIT_EXCEEDED",
              message: `Limite de ${maxLimit} leads monitorados atingido`,
            },
          },
          { status: 409 }
        );
      }
    }
  }

  // Update monitoring flag
  const { data, error } = await supabase
    .from("leads")
    .update({ is_monitored: isMonitored, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Lead não encontrado" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar monitoramento" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
