/**
 * API Route: POST /api/agent/executions/[executionId]/steps/[stepNumber]/reject
 * Story 17.5 - AC: #5
 *
 * Rejects an awaiting_approval step. Status remains awaiting_approval.
 * Pipeline does NOT advance until user approves.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { logServerError, sanitizeErrorMessage } from "@/lib/services/error-logger";
import { STEP_LABELS } from "@/types/agent";
import type { StepType } from "@/types/agent";

const REJECT_ROUTE = "/api/agent/executions/[executionId]/steps/[stepNumber]/reject";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string; stepNumber: string }> }
) {
  // Auth
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId, stepNumber: stepNumberStr } = await params;

  // Validate params
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(executionId)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PARAMS",
          message: "executionId deve ser um UUID valido",
        },
      },
      { status: 400 }
    );
  }

  const stepNumber = parseInt(stepNumberStr, 10);
  if (isNaN(stepNumber) || stepNumber < 1) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PARAMS",
          message: "stepNumber deve ser um numero positivo",
        },
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verify execution exists and belongs to tenant
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, tenant_id")
    .eq("id", executionId)
    .single();

  if (!execution || execution.tenant_id !== profile.tenant_id) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Execucao nao encontrada",
        },
      },
      { status: 404 }
    );
  }

  // Fetch step record
  const { data: stepRecord } = await supabase
    .from("agent_steps")
    .select("step_number, step_type, status")
    .eq("execution_id", executionId)
    .eq("step_number", stepNumber)
    .single();

  if (!stepRecord) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Step nao encontrado",
        },
      },
      { status: 404 }
    );
  }

  // Verify step is awaiting_approval
  if (stepRecord.status !== "awaiting_approval") {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: `Step nao esta aguardando aprovacao. Status atual: ${stepRecord.status}`,
        },
      },
      { status: 409 }
    );
  }

  // Parse optional reason
  let reason = "";
  try {
    const body = await request.json();
    if (body?.reason) {
      reason = String(body.reason);
    }
  } catch {
    // No body — that's fine
  }

  // Insert rejection message (step status stays awaiting_approval)
  const stepLabel = STEP_LABELS[stepRecord.step_type as StepType] ?? stepRecord.step_type;
  const content = reason
    ? `Entendido. O que voce gostaria de ajustar na etapa "${stepLabel}"? Motivo informado: ${reason}`
    : `Entendido. O que voce gostaria de ajustar na etapa "${stepLabel}"?`;

  const { error: insertError } = await supabase.from("agent_messages").insert({
    execution_id: executionId,
    role: "agent",
    content,
    metadata: {
      stepNumber,
      messageType: "text",
    },
  });

  if (insertError) {
    return NextResponse.json(
      {
        error: {
          code: "MESSAGE_INSERT_FAILED",
          message: "Erro ao inserir mensagem de rejeicao",
        },
      },
      { status: 500 }
    );
  }

  // Story 22.13 (AC5): auditoria DURAVEL da rejeicao. Ate aqui a marcacao "Rejeitado"
  // era estado LOCAL do componente de gate — sumia no remount/refresh e o card voltava
  // com os botoes ativos (meia-verdade). Carimbamos `rejected: true` no metadata (JSONB,
  // sem migration) da mensagem de gate MAIS RECENTE deste step: apos uma re-execucao
  // existem varios `approval_gate` do mesmo step, e so o ultimo rejeitado deve ficar
  // marcado.
  //
  // Fail-open de proposito: a rejeicao em si (mensagem + step em awaiting_approval) ja
  // esta persistida; um erro aqui e de AUDITORIA e nao pode transformar um reject
  // bem-sucedido em 500 para o usuario.
  //
  // DW-9 (FEL-12): fail-open, mas nao silencioso. O supabase-js nao lanca: devolve
  // `{ error }`. Desde a 24.2 o carimbo libera o PATCH de briefing e o execute do
  // ajuste, entao uma falha aqui deixa o ajuste tomando 409. Por isso o `error` da
  // leitura e da escrita vai para o log (console + Configuracoes -> Erros).
  const logStampFailure = (phase: "leitura" | "escrita" | "excecao", error: unknown) =>
    logServerError({
      source: "api",
      route: REJECT_ROUTE,
      tenantId: profile.tenant_id,
      // Sanitiza ja aqui: o console.error do logServerError sai antes da sanitizacao,
      // e um erro do Postgres pode trazer o conteudo da linha (e-mail de lead etc.).
      error: `Carimbo rejected do gate nao gravado (step ${stepNumber}, ${phase}): ${sanitizeErrorMessage(describeError(error))}`,
    });

  try {
    const { data: gateRows, error: gateReadError } = await supabase
      .from("agent_messages")
      .select("id, metadata")
      .eq("execution_id", executionId)
      .eq("metadata->>messageType", "approval_gate")
      .eq("metadata->>stepNumber", String(stepNumber))
      .order("created_at", { ascending: false })
      .limit(1);

    if (gateReadError) {
      await logStampFailure("leitura", gateReadError);
    } else {
      const gate = Array.isArray(gateRows) ? gateRows[0] : null;
      if (gate?.id) {
        // JSONB nao tem update parcial pelo client JS: le, espalha e regrava.
        const currentMetadata =
          gate.metadata && typeof gate.metadata === "object"
            ? (gate.metadata as Record<string, unknown>)
            : {};
        const { error: stampError } = await supabase
          .from("agent_messages")
          .update({ metadata: { ...currentMetadata, rejected: true } })
          .eq("id", gate.id);

        if (stampError) {
          await logStampFailure("escrita", stampError);
        }
      }
    }
  } catch (error) {
    // auditoria e best-effort — ver comentario acima (logServerError nunca lanca)
    await logStampFailure("excecao", error);
  }

  return NextResponse.json({
    data: {
      stepNumber,
      status: "awaiting_approval",
      message: "Aguardando ajustes",
    },
  });
}
