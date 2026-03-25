/**
 * Batch Lead Creation API Route
 * Story 15.5: Criacao de Leads e Integracao com Pipeline
 *
 * POST /api/leads/create-batch - Create multiple leads from technographic prospecting
 * AC: #2 - Batch create leads with tenant_id
 * AC: #3 - Source metadata via lead_interactions
 * AC: #6 - Duplicate detection by email and apollo_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { z } from "zod";

const leadDataSchema = z.object({
  apolloId: z.string().min(1),
  firstName: z.string().min(1),
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

const createBatchSchema = z.object({
  leads: z.array(leadDataSchema).min(1, "Selecione pelo menos um contato").max(100, "Máximo de 100 contatos por vez"),
  source: z.string().min(1),
  sourceTechnology: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Body JSON inválido" } },
      { status: 400 }
    );
  }

  const validation = createBatchSchema.safeParse(body);
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

  const { leads, source, sourceTechnology } = validation.data;
  const tenantId = profile.tenant_id;
  const supabase = await createClient();

  // Step 1: Duplicate detection by email
  const emails = leads
    .map((l) => l.email)
    .filter((e): e is string => e != null && e !== "");

  const duplicateEmails: string[] = [];
  const duplicateApolloIds = new Set<string>();

  if (emails.length > 0) {
    const { data: existingByEmail } = await supabase
      .from("leads")
      .select("id, email")
      .eq("tenant_id", tenantId)
      .in("email", emails);

    if (existingByEmail) {
      for (const existing of existingByEmail) {
        if (existing.email) duplicateEmails.push(existing.email);
      }
    }
  }

  // Step 2: Duplicate detection by apollo_id
  const apolloIds = leads.map((l) => l.apolloId);

  const { data: existingByApolloId } = await supabase
    .from("leads")
    .select("id, apollo_id")
    .eq("tenant_id", tenantId)
    .in("apollo_id", apolloIds);

  if (existingByApolloId) {
    for (const existing of existingByApolloId) {
      if (existing.apollo_id) duplicateApolloIds.add(existing.apollo_id);
    }
  }

  // Step 3: Filter out duplicates (by email OR apollo_id)
  const duplicateEmailSet = new Set(duplicateEmails);
  const newLeads = leads.filter((lead) => {
    if (lead.email && duplicateEmailSet.has(lead.email)) return false;
    if (duplicateApolloIds.has(lead.apolloId)) return false;
    return true;
  });

  const skipped = leads.length - newLeads.length;

  // Step 4: Insert non-duplicate leads
  if (newLeads.length === 0) {
    return NextResponse.json({
      data: { created: 0, skipped, duplicateEmails },
      message: "Todos os contatos já existem como leads",
    });
  }

  const insertRows = newLeads.map((lead) => ({
    tenant_id: tenantId,
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

  const { data: insertedLeads, error: insertError } = await supabase
    .from("leads")
    .insert(insertRows)
    .select("id, email");

  if (insertError) {
    console.error("[POST /api/leads/create-batch] Insert error:", insertError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar leads" } },
      { status: 500 }
    );
  }

  // Step 5: Create lead_interactions records with source metadata
  if (insertedLeads && insertedLeads.length > 0) {
    const interactions = insertedLeads.map((lead) => ({
      lead_id: lead.id,
      tenant_id: tenantId,
      type: "import" as const,
      content: JSON.stringify({
        source,
        technology: sourceTechnology,
        createdVia: "technographic-prospecting",
      }),
    }));

    const { error: interactionError } = await supabase
      .from("lead_interactions")
      .insert(interactions);

    if (interactionError) {
      console.error("[POST /api/leads/create-batch] Interaction insert error:", interactionError);
    }
  }

  return NextResponse.json({
    data: {
      created: insertedLeads?.length ?? newLeads.length,
      skipped,
      duplicateEmails,
    },
    message: `${insertedLeads?.length ?? newLeads.length} leads criados com sucesso`,
  });
}
