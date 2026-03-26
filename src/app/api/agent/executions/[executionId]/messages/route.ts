/**
 * Agent Messages API Routes
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #1 - Enviar mensagem do usuario e persistir
 * AC: #4 - Carregar historico de mensagens
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";

interface RouteParams {
  params: Promise<{ executionId: string }>;
}

/**
 * POST /api/agent/executions/[executionId]/messages
 * Envia mensagem do usuario para uma execucao
 * AC: #1 - Mensagem persistida na tabela agent_messages
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId } = await params;
  const supabase = await createClient();

  // Validar que a execucao existe e pertence ao tenant (RLS)
  const { data: execution, error: execError } = await supabase
    .from("agent_executions")
    .select("id")
    .eq("id", executionId)
    .single();

  if (execError || !execution) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
      { status: 404 }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Corpo da requisicao invalido" } },
      { status: 400 }
    );
  }

  const { content, role } = body as { content?: string; role?: string };

  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Conteudo da mensagem e obrigatorio" } },
      { status: 400 }
    );
  }

  if (role && role !== "user") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Role deve ser 'user'" } },
      { status: 400 }
    );
  }

  // Inserir mensagem
  const { data: message, error: insertError } = await supabase
    .from("agent_messages")
    .insert({
      execution_id: executionId,
      role: "user",
      content: content.trim(),
      metadata: { messageType: "text" },
    })
    .select()
    .single();

  if (insertError) {
    console.error("[Agent Messages API] POST error:", insertError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao enviar mensagem" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: message }, { status: 201 });
}

/**
 * GET /api/agent/executions/[executionId]/messages
 * Lista mensagens de uma execucao ordenadas cronologicamente
 * AC: #4 - Historico completo carregado na ordem cronologica
 */
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

  // Validar que a execucao existe e pertence ao tenant (RLS)
  const { data: execution, error: execError } = await supabase
    .from("agent_executions")
    .select("id")
    .eq("id", executionId)
    .single();

  if (execError || !execution) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
      { status: 404 }
    );
  }

  // Buscar mensagens ordenadas por created_at ASC
  const { data: messages, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("execution_id", executionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Agent Messages API] GET error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar mensagens" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: messages || [] });
}
