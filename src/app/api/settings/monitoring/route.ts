/**
 * API Route: Monitoring Configuration
 * Story: 13.8 - Configuracoes de Monitoramento
 *
 * AC: #2 - Dropdown para frequencia (Semanal/Quinzenal)
 * AC: #7 - GET config + PATCH frequencia
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { z } from "zod";
import {
  monitoringFrequencyValues,
  transformMonitoringConfigRow,
  type MonitoringConfigRow,
} from "@/types/monitoring";
import { calculateNextRunAt } from "@/lib/utils/monitoring-utils";

// ==============================================
// VALIDATION SCHEMAS
// ==============================================

const updateFrequencySchema = z.object({
  frequency: z.enum(monitoringFrequencyValues, {
    message: "Frequencia invalida. Valores permitidos: weekly, biweekly",
  }),
});

// ==============================================
// ERROR RESPONSES
// ==============================================

function errorResponse(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

// ==============================================
// DEFAULT CONFIG
// ==============================================

const DEFAULT_CONFIG = {
  frequency: "weekly" as const,
  maxMonitoredLeads: 100,
  runStatus: "idle" as const,
  lastRunAt: null,
  nextRunAt: null,
  runCursor: null,
};

// ==============================================
// GET /api/settings/monitoring
// Returns monitoring config for current tenant
// ==============================================

export async function GET() {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return errorResponse("UNAUTHORIZED", "Nao autenticado", 401);
    }

    if (profile.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Apenas administradores podem visualizar configuracoes de monitoramento",
        403
      );
    }

    const supabase = await createClient();
    const { data: config, error } = await supabase
      .from("monitoring_configs")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (error && error.code !== "PGRST116") {
      return errorResponse(
        "INTERNAL_ERROR",
        "Erro ao buscar configuracoes de monitoramento",
        500
      );
    }

    if (!config) {
      return NextResponse.json({
        data: {
          config: {
            id: null,
            tenantId: profile.tenant_id,
            ...DEFAULT_CONFIG,
            createdAt: null,
            updatedAt: null,
          },
          exists: false,
        },
      });
    }

    return NextResponse.json({
      data: {
        config: transformMonitoringConfigRow(config as MonitoringConfigRow),
        exists: true,
      },
    });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
}

// ==============================================
// PATCH /api/settings/monitoring
// Update monitoring frequency
// ==============================================

export async function PATCH(request: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return errorResponse("UNAUTHORIZED", "Nao autenticado", 401);
    }

    if (profile.role !== "admin") {
      return errorResponse(
        "FORBIDDEN",
        "Apenas administradores podem alterar configuracoes de monitoramento",
        403
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "VALIDATION_ERROR",
        "Corpo da requisicao invalido",
        400
      );
    }

    const validation = updateFrequencySchema.safeParse(body);
    if (!validation.success) {
      const message =
        validation.error.issues[0]?.message ?? "Dados invalidos";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const { frequency } = validation.data;

    const supabase = await createClient();

    // Fetch existing config to get lastRunAt for next_run_at calculation
    const { data: existing } = await supabase
      .from("monitoring_configs")
      .select("last_run_at")
      .eq("tenant_id", profile.tenant_id)
      .single();

    const lastRunAt = existing?.last_run_at
      ? new Date(existing.last_run_at)
      : new Date();

    const nextRunAt = calculateNextRunAt(frequency, lastRunAt);

    const { data: config, error } = await supabase
      .from("monitoring_configs")
      .upsert(
        {
          tenant_id: profile.tenant_id,
          frequency,
          next_run_at: nextRunAt.toISOString(),
        },
        { onConflict: "tenant_id" }
      )
      .select("*")
      .single();

    if (error) {
      return errorResponse(
        "INTERNAL_ERROR",
        "Erro ao salvar configuracao de monitoramento",
        500
      );
    }

    return NextResponse.json({
      data: {
        config: transformMonitoringConfigRow(config as MonitoringConfigRow),
        exists: true,
      },
    });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
}
