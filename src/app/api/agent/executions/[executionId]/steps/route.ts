/**
 * Agent Steps API Route
 * GET /api/agent/executions/[executionId]/steps
 *
 * Returns all steps for an execution, ordered by step_number.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";

interface RouteParams {
  params: Promise<{ executionId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId } = await params;
  const supabase = await createClient();

  // Validate execution exists and belongs to tenant
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, tenant_id")
    .eq("id", executionId)
    .single();

  if (!execution || execution.tenant_id !== profile.tenant_id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
      { status: 404 }
    );
  }

  const { data: steps, error } = await supabase
    .from("agent_steps")
    .select("*")
    .eq("execution_id", executionId)
    .order("step_number", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar steps" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: steps });
}
