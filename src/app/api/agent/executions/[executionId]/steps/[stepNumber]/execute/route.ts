/**
 * API Route: POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute
 * Story 17.1 - AC: #1
 *
 * Executes a pipeline step via the DeterministicOrchestrator.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import {
  DeterministicOrchestrator,
  isPipelineError,
} from "@/lib/agent/orchestrator";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ executionId: string; stepNumber: string }> }
) {
  // 5.1 - Auth
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId, stepNumber: stepNumberStr } = await params;

  // 5.2 - Validate params
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

  // 5.3 - Verify execution exists and belongs to tenant
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, tenant_id, status")
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

  // 5.4 - Fetch API key
  const { data: config } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", profile.tenant_id)
    .eq("service_name", "theirstack")
    .single();

  if (!config) {
    return NextResponse.json(
      {
        error: {
          code: "API_KEY_NOT_FOUND",
          message: "API key do TheirStack nao configurada",
        },
      },
      { status: 422 }
    );
  }

  const apiKey = decryptApiKey(config.encrypted_key);

  // 5.5 - Execute step
  try {
    const orchestrator = new DeterministicOrchestrator(supabase, apiKey);
    const result = await orchestrator.executeStep(executionId, stepNumber);

    // 5.6 - Success response
    return NextResponse.json({ data: result });
  } catch (error) {
    // 5.7 - PipelineError
    if (isPipelineError(error)) {
      const status = error.isRetryable ? 503 : 500;
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            stepNumber: error.stepNumber,
            stepType: error.stepType,
            isRetryable: error.isRetryable,
            externalService: error.externalService,
          },
        },
        { status }
      );
    }

    // 5.8 - Generic error
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error ? error.message : "Erro interno",
          isRetryable: false,
        },
      },
      { status: 500 }
    );
  }
}
