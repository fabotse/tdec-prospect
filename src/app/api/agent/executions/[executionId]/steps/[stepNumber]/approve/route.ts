/**
 * API Route: POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve
 * Story 17.5 - AC: #2, #4
 *
 * Approves an awaiting_approval step. Optionally receives approvedData (filtered leads).
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
    .select("id, tenant_id, total_steps, status")
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
    .select("step_number, step_type, status, output")
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

  // Parse optional body (approvedData for filtered leads)
  let approvedData: Record<string, unknown> | undefined;
  try {
    const body = await request.json();
    if (body?.approvedData) {
      approvedData = body.approvedData as Record<string, unknown>;
    }
  } catch {
    // No body or invalid JSON — that's fine, approvedData is optional
  }

  // Build updated output (merge approvedData if present)
  const existingOutput = (stepRecord.output as Record<string, unknown>) ?? {};
  let updatedOutput = existingOutput;

  if (approvedData) {
    // Story 17.5: leads filtrados
    if (approvedData.leads) {
      updatedOutput = { ...updatedOutput, approvedLeads: approvedData.leads };
    }
    // Story 17.6 Task 3.1: merge emailBlocks editados
    if (approvedData.emailBlocks) {
      updatedOutput = { ...updatedOutput, emailBlocks: approvedData.emailBlocks };
    }
    // Story 17.6 Task 3.2: activation deferred
    if (approvedData.activate === false && approvedData.deferred) {
      updatedOutput = { ...updatedOutput, activationDeferred: true };
    }
  }

  // Update step: status='approved', completed_at, merged output
  const { error: updateError } = await supabase
    .from("agent_steps")
    .update({
      output: updatedOutput,
      status: "approved",
      completed_at: new Date().toISOString(),
    })
    .eq("execution_id", executionId)
    .eq("step_number", stepNumber);

  if (updateError) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_FAILED",
          message: "Erro ao atualizar step",
        },
      },
      { status: 500 }
    );
  }

  // Story 17.6 Task 4: Complete execution when approving last step
  const totalSteps = (execution as Record<string, unknown>).total_steps as number;
  const isLastStep = stepNumber === totalSteps;
  const isActivationDeferred = updatedOutput.activationDeferred === true;

  if (isLastStep) {
    const campaignName = (updatedOutput.campaignName as string) ?? "campanha";
    const resultSummary: Record<string, unknown> = { campaignName };
    if (isActivationDeferred) {
      resultSummary.activationDeferred = true;
    }

    const { error: completionError } = await supabase
      .from("agent_executions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result_summary: resultSummary,
      })
      .eq("id", executionId);

    if (completionError) {
      return NextResponse.json(
        {
          error: {
            code: "COMPLETION_FAILED",
            message: "Step aprovado mas erro ao completar execucao",
          },
        },
        { status: 500 }
      );
    }
  }

  // Insert approval confirmation message
  const stepLabel = STEP_LABELS[stepRecord.step_type as StepType] ?? stepRecord.step_type;
  await supabase.from("agent_messages").insert({
    execution_id: executionId,
    role: "agent",
    content: `Etapa "${stepLabel}" aprovada pelo usuario.`,
    metadata: {
      stepNumber,
      messageType: "text",
    },
  });

  // Story 17.6 Task 4.3: Insert summary message when execution completes
  // Skip summary for activate step — ActivateStep already sends its own summary in executeInternal
  const stepType = stepRecord.step_type as StepType;
  if (isLastStep && stepType !== "activate") {
    const campaignName = (updatedOutput.campaignName as string) ?? "campanha";
    const summaryContent = isActivationDeferred
      ? `Campanha "${campaignName}" exportada no Instantly. Ativacao adiada — ative manualmente quando desejar.`
      : `Campanha "${campaignName}" ativada com sucesso no Instantly.`;

    await supabase.from("agent_messages").insert({
      execution_id: executionId,
      role: "agent",
      content: summaryContent,
      metadata: {
        stepNumber,
        messageType: "summary",
      },
    });
  }

  return NextResponse.json({
    data: {
      stepNumber,
      status: "approved",
      nextStep: stepNumber + 1,
    },
  });
}
