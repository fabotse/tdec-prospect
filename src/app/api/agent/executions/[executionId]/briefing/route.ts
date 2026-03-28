/**
 * API Route: PATCH /api/agent/executions/[executionId]/briefing
 * Story: 16.3 - Briefing Parser & Linguagem Natural
 *
 * AC: #1, #4 - Atualiza execucao com briefing confirmado
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";

// ==============================================
// REQUEST VALIDATION
// ==============================================

const briefingUpdateSchema = z.object({
  technology: z.string().nullable(),
  jobTitles: z.array(z.string()),
  location: z.string().nullable(),
  companySize: z.string().nullable(),
  industry: z.string().nullable(),
  productSlug: z.string().nullable(),
  mode: z.enum(["guided", "autopilot"]),
  skipSteps: z.array(z.string()),
  importedLeads: z.array(z.object({
    name: z.string(),
    title: z.string().nullable(),
    companyName: z.string().nullable(),
    email: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    apolloId: z.string().nullable(),
  })).optional(),
});

// ==============================================
// ROUTE HANDLER
// ==============================================

export async function PATCH(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "JSON invalido" } },
      { status: 400 }
    );
  }

  const validation = briefingUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Briefing invalido",
        },
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: execution, error } = await supabase
    .from("agent_executions")
    .update({
      briefing: validation.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .eq("tenant_id", profile.tenant_id)
    .select()
    .single();

  if (error || !execution) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_ERROR",
          message: "Erro ao atualizar briefing da execucao",
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: execution });
}
