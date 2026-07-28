/**
 * API Route: PATCH /api/agent/executions/[executionId]
 * Story 16.4: Onboarding & Selecao de Modo
 * Story 22.10: Cancelamento de execucao ("Nova conversa")
 *
 * AC 16.4: #4 - Atualizar modo da execucao (guided/autopilot)
 * AC 22.10: #3 - Cancelar execucao ({ status: "cancelled" }), dono-only, nao-terminal-only
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { isTerminalExecutionStatus } from "@/types/agent";

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

  // Verificar execucao existe (RLS filtra por tenant).
  // Story 22.10: o select passa a trazer user_id/status — usados SO pelo cancel.
  // O caminho de `mode` segue byte-a-byte (nunca consulta esses campos).
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, user_id, status")
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

  // Story 22.10 (code review): `await request.json()` com corpo `null` literal (JSON valido)
  // NAO lanca — retorna null. Sem esta guarda, `body.mode` abaixo derrubaria a rota com 500.
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Corpo invalido" } },
      { status: 400 }
    );
  }

  // Story 22.10: o endpoint aceita UM dos dois corpos, nunca os dois juntos
  // (mudar modo e cancelar sao intencoes incompativeis no mesmo write).
  if (body.mode !== undefined && body.status !== undefined) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_BODY",
          message: "Envie 'mode' ou 'status', nunca os dois",
        },
      },
      { status: 400 }
    );
  }

  // ==========================================================
  // Story 22.10 — cancelamento ("Nova conversa")
  // ==========================================================
  if (body.status !== undefined) {
    if (body.status !== "cancelled") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: "Status invalido. O unico valor aceito e 'cancelled'",
          },
        },
        { status: 400 }
      );
    }

    // Titularidade: a RLS de agent_executions e por TENANT, nao por usuario — sem esta
    // checagem, um usuario cancelaria a execucao (paga, em andamento) de um colega do
    // mesmo tenant. Primeira checagem de user_id server-side do agente (era deferred da 22.8).
    if (execution.user_id !== profile.id) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Execucao pertence a outro usuario",
          },
        },
        { status: 403 }
      );
    }

    if (isTerminalExecutionStatus(execution.status)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Execucao ja encerrada (status: ${execution.status})`,
          },
        },
        { status: 409 }
      );
    }

    // Story 22.10 (code review): compare-and-swap. O guard de status acima e check-then-act;
    // entre o SELECT e este UPDATE, uma conclusao/pausa concorrente (approve/orchestrator)
    // pode ter tornado a execucao terminal. O `.in("status", [...nao-terminais])` garante
    // que so cancelamos uma linha ainda cancelavel — 0 linhas afetadas = ja encerrou (409).
    const { data: cancelledRows, error: cancelError } = await supabase
      .from("agent_executions")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      })
      .eq("id", executionId)
      .in("status", ["pending", "running", "paused"])
      .select();

    if (cancelError) {
      console.error("[Agent Executions API] PATCH cancel error:", cancelError);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao cancelar a execucao",
          },
        },
        { status: 500 }
      );
    }

    if (!cancelledRows || cancelledRows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: "Execucao ja encerrada",
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ data: cancelledRows[0] });
  }

  // ==========================================================
  // Story 16.4 — selecao de modo (comportamento inalterado)
  // ==========================================================
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
