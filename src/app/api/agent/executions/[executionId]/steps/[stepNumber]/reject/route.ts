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
import { STEP_LABELS } from "@/types/agent";
import type { StepType } from "@/types/agent";

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

  return NextResponse.json({
    data: {
      stepNumber,
      status: "awaiting_approval",
      message: "Aguardando ajustes",
    },
  });
}
