/**
 * API Route: POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute
 * Story 17.1 - AC: #1
 *
 * Executes a pipeline step via the DeterministicOrchestrator.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { readServiceApiKey } from "@/lib/agent/service-keys";
import { isTerminalExecutionStatus } from "@/types/agent";
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

  // Story 22.10: guarda anti-race. Esta rota e chamada por caminhos fire-and-forget
  // (o POST /confirm dispara o step 1; o useAutoTrigger dispara os seguintes, possivelmente
  // de outra aba) — sem esta checagem, um step novo rodaria E GASTARIA em execucao ja
  // cancelada/encerrada. O select acima ja traz o status: zero query extra.
  // `paused` (parada por ERRO — o unico caminho que escreve paused) NAO entra aqui: o
  // retry legitimo continua funcionando.
  if (isTerminalExecutionStatus(execution.status)) {
    return NextResponse.json(
      {
        error: {
          code: "EXECUTION_NOT_ACTIVE",
          message: `Execucao encerrada (status: ${execution.status}). Nenhum step novo pode rodar.`,
        },
      },
      { status: 409 }
    );
  }

  // 5.4 - Fetch API key
  // Story 22.9: leitura via SERVICE-ROLE (helper central). A RLS admin-only de
  // api_configs devolvia ZERO linhas para um `sdr` e derrubava o pipeline inteiro
  // aqui, antes do primeiro step rodar.
  const keyLookup = await readServiceApiKey(profile.tenant_id, "theirstack");

  if (keyLookup.status === "missing") {
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

  if (keyLookup.status === "decrypt_error") {
    return NextResponse.json(
      {
        error: {
          code: "API_KEY_ERROR",
          message: "Erro ao decriptar a API key do TheirStack",
        },
      },
      { status: 500 }
    );
  }

  const apiKey = keyLookup.apiKey;

  // 5.5 - Execute step
  // Trap #1: o orchestrator segue com o client de SESSAO — so a leitura da chave
  // migrou para service-role. As demais queries do pipeline (agent_executions,
  // agent_steps, leads...) devem continuar sob RLS por tenant.
  try {
    const orchestrator = new DeterministicOrchestrator(supabase, apiKey);
    const result = await orchestrator.executeStep(executionId, stepNumber);

    // 5.6 - Success response
    return NextResponse.json({ data: result });
  } catch (error) {
    // 5.7 - PipelineError
    if (isPipelineError(error)) {
      console.error(`[Execute Step] PipelineError step=${stepNumber}:`, JSON.stringify(error));
      // Story 22.18 (code review, D2): perder o CAS de posse do step nao e erro de
      // servidor — e conflito de concorrencia. 409 diz isso, e nada foi escrito no
      // banco por esta chamada.
      const status =
        error.code === "STEP_ALREADY_RUNNING" ? 409 : error.isRetryable ? 503 : 500;
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            stepNumber: error.stepNumber,
            stepType: error.stepType,
            isRetryable: error.isRetryable,
            externalService: error.externalService,
            // Story 22.18 (code review, P2): fato, nao inferencia — so vem `true` quando
            // `sendErrorMessage` ja escreveu a bolha no chat.
            reportedInChat: error.reportedInChat === true,
          },
        },
        { status }
      );
    }

    // 5.8 - Generic error
    console.error("[Execute Step] Unexpected error:", error);
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
