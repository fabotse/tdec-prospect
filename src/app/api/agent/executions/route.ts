/**
 * Agent Executions API Routes
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #1 - Criar execucao para iniciar chat
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";

/**
 * POST /api/agent/executions
 * Cria uma nova execucao do agente
 * AC: #1 - Criar execucao com status pending
 */
export async function POST() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const { data: execution, error } = await supabase
    .from("agent_executions")
    .insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      status: "pending",
      mode: "guided",
      briefing: {},
      current_step: 0,
      total_steps: 5,
    })
    .select()
    .single();

  if (error) {
    console.error("[Agent Executions API] POST error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar execucao" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: execution }, { status: 201 });
}
