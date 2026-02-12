/**
 * Lead CSV Import API Route
 * Story 12.2: Import Leads via CSV
 *
 * AC: #6 - Processing and lead creation with deduplication by email
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { importLeadsCsvBodySchema } from "@/types/lead-import";

/**
 * POST /api/leads/import-csv
 * Import leads from CSV data
 *
 * Flow:
 * 1. Validate request body (array of leads + optional segmentId)
 * 2. Deduplicate by email (case-insensitive) against existing leads
 * 3. Insert new leads
 * 4. Associate with segment if segmentId provided
 * 5. Return summary
 */
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
      { error: { code: "VALIDATION_ERROR", message: "Body inválido (JSON malformado)" } },
      { status: 400 }
    );
  }

  const validation = importLeadsCsvBodySchema.safeParse(body);

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

  const { leads, segmentId } = validation.data;
  const supabase = await createClient();

  // Extract non-null emails for deduplication
  const csvEmails = leads
    .map((l) => l.email?.toLowerCase().trim())
    .filter((e): e is string => Boolean(e));

  // Find existing leads by email (case-insensitive)
  let existingEmails = new Set<string>();
  if (csvEmails.length > 0) {
    const { data: existingLeads, error: fetchError } = await supabase
      .from("leads")
      .select("id, email")
      .eq("tenant_id", profile.tenant_id)
      .in("email", csvEmails);

    if (fetchError) {
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

    existingEmails = new Set(
      existingLeads
        ?.map((l) => l.email?.toLowerCase())
        .filter((e): e is string => Boolean(e)) ?? []
    );
  }

  // Filter new leads (no email or email not in existing set)
  const newLeads = leads.filter(
    (l) => !l.email || !existingEmails.has(l.email.toLowerCase().trim())
  );

  const existingCount = leads.length - newLeads.length;
  const errors: string[] = [];
  let importedCount = 0;
  let insertedLeadIds: string[] = [];

  if (newLeads.length > 0) {
    const leadsToInsert = newLeads.map((lead) => ({
      tenant_id: profile.tenant_id,
      first_name: lead.firstName,
      last_name: lead.lastName || null,
      email: lead.email || null,
      phone: lead.phone || null,
      company_name: lead.companyName || null,
      title: lead.title || null,
      linkedin_url: lead.linkedinUrl || null,
      status: "novo" as const,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("leads")
      .insert(leadsToInsert)
      .select("id");

    if (insertError) {
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Erro ao importar leads",
          },
        },
        { status: 500 }
      );
    }

    importedCount = inserted?.length ?? 0;
    insertedLeadIds = inserted?.map((l) => l.id) ?? [];
  }

  // Associate with segment if segmentId provided
  if (segmentId && insertedLeadIds.length > 0) {
    const associations = insertedLeadIds.map((leadId) => ({
      segment_id: segmentId,
      lead_id: leadId,
    }));

    const { error: assocError } = await supabase
      .from("lead_segments")
      .insert(associations);

    if (assocError) {
      errors.push("Leads importados, mas erro ao associar ao segmento");
    }
  }

  return NextResponse.json({
    data: {
      imported: importedCount,
      existing: existingCount,
      errors,
      leads: insertedLeadIds,
    },
  });
}
