/**
 * Lead Manual Creation API Route
 * Quick Dev: Manual Lead Creation
 *
 * POST /api/leads/create - Create a single lead manually
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createLeadSchema } from "@/types/lead";
import type { LeadRow } from "@/types/lead";
import { transformLeadRow } from "@/types/lead";

/** Schema for manual lead creation — excludes apolloId (manual leads have no Apollo source) */
const manualCreateLeadSchema = createLeadSchema.omit({ apolloId: true });

/**
 * POST /api/leads/create
 * Create a single lead manually (no Apollo ID)
 *
 * Flow:
 * 1. Authenticate user and get tenant_id
 * 2. Parse and validate input
 * 3. Check for duplicate email within tenant
 * 4. Insert lead into database with status "novo"
 * 5. Return created lead
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
      { error: { code: "INVALID_JSON", message: "Body JSON inválido" } },
      { status: 400 }
    );
  }

  const validation = manualCreateLeadSchema.safeParse(body);

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

  const data = validation.data;
  const supabase = await createClient();

  // F2: Check for duplicate email within tenant
  if (data.email) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .eq("email", data.email)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: "DUPLICATE_LEAD",
            message: "Já existe um lead com este email",
          },
        },
        { status: 409 }
      );
    }
  }

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      tenant_id: profile.tenant_id,
      apollo_id: null,
      first_name: data.firstName,
      last_name: data.lastName || null,
      email: data.email || null,
      phone: data.phone || null,
      company_name: data.companyName || null,
      company_size: data.companySize || null,
      industry: data.industry || null,
      location: data.location || null,
      title: data.title || null,
      linkedin_url: data.linkedinUrl || null,
      status: "novo" as const,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("[POST /api/leads/create] Insert error:", insertError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar lead" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: transformLeadRow(lead as LeadRow),
    message: "Lead criado com sucesso",
  });
}
