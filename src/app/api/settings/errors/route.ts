/**
 * API Route: GET /api/settings/errors
 * Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
 *
 * Admin-only. Últimos 50 registros de `error_logs` do tenant do usuário + erros de
 * plataforma (tenant_id nulo). A RLS (migration 00068) aplica a mesma regra.
 */

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { toErrorLog, type ErrorLogRow } from "@/types/error-log";

const ERROR_LIMIT = 50;

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Nao autenticado",
  FORBIDDEN: "Acesso negado. Somente administradores podem ver os erros.",
  TENANT_NOT_FOUND: "Tenant nao encontrado",
  INTERNAL_ERROR: "Erro ao buscar o registro de erros",
} as const;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return errorResponse("UNAUTHORIZED", ERROR_MESSAGES.UNAUTHORIZED, 401);
  }

  if (!hasAdminAccess(profile.role)) {
    return errorResponse("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN, 403);
  }

  const tenantId = profile.tenant_id;
  if (!tenantId) {
    return errorResponse("FORBIDDEN", ERROR_MESSAGES.TENANT_NOT_FOUND, 403);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("error_logs")
      .select("id, tenant_id, source, route, message, created_at")
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order("created_at", { ascending: false })
      .limit(ERROR_LIMIT);

    if (error) {
      console.error("[GET /api/settings/errors] Error:", error.message);
      return errorResponse("INTERNAL_ERROR", ERROR_MESSAGES.INTERNAL_ERROR, 500);
    }

    return NextResponse.json({
      data: ((data ?? []) as ErrorLogRow[]).map(toErrorLog),
    });
  } catch (error) {
    console.error("[GET /api/settings/errors] Error:", error);
    return errorResponse("INTERNAL_ERROR", ERROR_MESSAGES.INTERNAL_ERROR, 500);
  }
}
