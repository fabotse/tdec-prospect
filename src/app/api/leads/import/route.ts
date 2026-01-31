/**
 * Lead Import API Route
 * Story 4.2.1: Lead Import Mechanism
 *
 * AC: #1 - Import leads from Apollo search results
 * AC: #4 - Bulk import with upsert behavior
 * AC: #5 - Prevent duplicates using apollo_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * Schema for lead data to import
 * Matches the schema from segments route for consistency
 */
const leadDataSchema = z.object({
  apolloId: z.string().min(1, "Apollo ID é obrigatório"),
  firstName: z.string().min(1, "Nome é obrigatório"),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  hasEmail: z.boolean().optional(),
  hasDirectPhone: z.string().nullable().optional(),
});

const importLeadsSchema = z.object({
  leads: z.array(leadDataSchema).min(1, "Selecione pelo menos um lead"),
});

/**
 * POST /api/leads/import
 * Import leads from Apollo search results to database
 *
 * Flow:
 * 1. Get tenant_id from user's profile
 * 2. Check which leads already exist by apollo_id
 * 3. Insert only new leads
 * 4. Return all leads (existing + new) with their DB IDs
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Get tenant_id from user's profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    console.error("[POST /api/leads/import] Profile error:", profileError);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao obter perfil do usuário",
        },
      },
      { status: 500 }
    );
  }

  const body = await request.json();
  const validation = importLeadsSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.issues[0]?.message || "Dados inválidos",
        },
      },
      { status: 400 }
    );
  }

  const { leads } = validation.data;
  const apolloIds = leads.map((l) => l.apolloId);

  // Check which leads already exist by apollo_id
  // Using manual check + insert instead of upsert because the leads table
  // uses a partial unique index (WHERE apollo_id IS NOT NULL) which doesn't
  // work with Supabase's onConflict option
  const { data: existingLeads, error: fetchError } = await supabase
    .from("leads")
    .select("id, apollo_id")
    .eq("tenant_id", profile.tenant_id)
    .in("apollo_id", apolloIds);

  if (fetchError) {
    console.error("[POST /api/leads/import] Fetch error:", fetchError);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao verificar leads existentes",
        },
      },
      { status: 500 }
    );
  }

  const existingApolloIds = new Set(
    existingLeads?.map((l) => l.apollo_id) ?? []
  );
  const existingCount = existingApolloIds.size;

  // Prepare new leads for insertion
  const newLeads = leads
    .filter((lead) => !existingApolloIds.has(lead.apolloId))
    .map((lead) => ({
      tenant_id: profile.tenant_id,
      apollo_id: lead.apolloId,
      first_name: lead.firstName,
      last_name: lead.lastName ?? null,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      company_name: lead.companyName ?? null,
      company_size: lead.companySize ?? null,
      industry: lead.industry ?? null,
      location: lead.location ?? null,
      title: lead.title ?? null,
      linkedin_url: lead.linkedinUrl ?? null,
      status: "novo" as const,
    }));

  let importedCount = 0;

  if (newLeads.length > 0) {
    const { error: insertError } = await supabase.from("leads").insert(newLeads);

    if (insertError) {
      console.error("[POST /api/leads/import] Insert error:", insertError);
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao importar leads" } },
        { status: 500 }
      );
    }
    importedCount = newLeads.length;
  }

  // Fetch all leads with their DB IDs
  const { data: allLeads, error: fetchAllError } = await supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .in("apollo_id", apolloIds);

  if (fetchAllError) {
    console.error("[POST /api/leads/import] Fetch all error:", fetchAllError);
    // Still return success for import, just without lead data
    const importedWord = importedCount === 1 ? "lead importado" : "leads importados";
    return NextResponse.json({
      data: { imported: importedCount, existing: existingCount },
      message: `${importedCount} ${importedWord}`,
    });
  }

  // Build response message with correct singular/plural grammar
  let message: string;
  if (importedCount > 0) {
    const importedWord = importedCount === 1 ? "lead importado" : "leads importados";
    const existingWord = existingCount === 1 ? "já existia" : "já existiam";
    message =
      existingCount > 0
        ? `${importedCount} ${importedWord} (${existingCount} ${existingWord})`
        : `${importedCount} ${importedWord}`;
  } else {
    const allWord = existingCount === 1 ? "O" : "Todos os";
    const existingWord = existingCount === 1 ? "lead já estava importado" : "leads já estavam importados";
    message = `${allWord} ${existingCount} ${existingWord}`;
  }

  return NextResponse.json({
    data: {
      imported: importedCount,
      existing: existingCount,
      leads: allLeads,
    },
    message,
  });
}
