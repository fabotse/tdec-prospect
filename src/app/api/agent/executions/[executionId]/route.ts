/**
 * API Route: PATCH /api/agent/executions/[executionId]
 * Story 16.4: Onboarding & Selecao de Modo
 *
 * AC: #4 - Atualizar modo da execucao (guided/autopilot)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";

const validModes = ["guided", "autopilot"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId } = await params;
  const supabase = await createClient();

  // Verificar execucao existe (RLS filtra por tenant)
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id")
    .eq("id", executionId)
    .single();

  if (!execution) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
      { status: 404 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "JSON invalido" } },
      { status: 400 }
    );
  }

  if (!body.mode || !validModes.includes(body.mode as string)) {
    return NextResponse.json(
      { error: { code: "INVALID_MODE", message: "Modo invalido. Use 'guided' ou 'autopilot'" } },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("agent_executions")
    .update({ mode: body.mode })
    .eq("id", executionId)
    .select()
    .single();

  if (error) {
    console.error("[Agent Executions API] PATCH mode error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar modo da execucao" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
