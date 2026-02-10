/**
 * Lead Import Results API Route
 * Story 4.7: Import Campaign Results
 *
 * POST /api/leads/import-results - Import campaign results to update lead status
 *
 * AC: #5 - Match by email and update status
 * AC: #6 - Return summary with matched/unmatched counts
 * AC: #7 - Optionally create leads for unmatched emails
 * AC: #8 - Validate data and track errors
 *
 * Performance optimizations:
 * - Batch fetching leads by email
 * - Batch updates grouped by status
 * - Batch insert for interactions
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  importCampaignResultsSchema,
  responseToStatus,
  type ImportCampaignResultsResponse,
  type ResponseType,
} from "@/types/campaign-import";
import type { LeadStatus } from "@/types/lead";

interface LeadMatch {
  id: string;
  email: string;
  status: string;
}

interface ProcessedLead {
  leadId: string;
  email: string;
  responseType: ResponseType;
  newStatus: LeadStatus | null;
  needsUpdate: boolean;
}

/**
 * POST /api/leads/import-results
 * Import campaign results to update lead status based on email responses
 *
 * Flow:
 * 1. Validate input with Zod schema
 * 2. Batch fetch all leads by email (optimized)
 * 3. Group updates by status for batch processing
 * 4. Batch insert interaction records
 * 5. Optionally create leads for unmatched emails
 * 6. Return summary with matched, updated, unmatched, errors
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "JSON invalido" } },
      { status: 400 }
    );
  }

  const validation = importCampaignResultsSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.issues[0]?.message || "Dados invalidos";
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: firstError } },
      { status: 400 }
    );
  }

  const { results, createMissingLeads } = validation.data;
  const response: ImportCampaignResultsResponse = {
    matched: 0,
    updated: 0,
    unmatched: [],
    errors: [],
  };

  // ============================================
  // STEP 1: Batch fetch all leads by email
  // ============================================
  const emails = results.map((r) => r.email.toLowerCase());

  // Fetch all leads that match any of the emails (case-insensitive via lower())
  const { data: existingLeads, error: fetchError } = await supabase
    .from("leads")
    .select("id, email, status")
    .eq("tenant_id", profile.tenant_id)
    .in("email", emails);

  if (fetchError) {
    console.error("[POST /api/leads/import-results] Batch fetch error:", fetchError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar leads" } },
      { status: 500 }
    );
  }

  // Create email -> lead map for quick lookup (case-insensitive)
  const leadMap = new Map<string, LeadMatch>();
  for (const lead of existingLeads || []) {
    leadMap.set(lead.email.toLowerCase(), lead);
  }

  // ============================================
  // STEP 2: Process and categorize results
  // ============================================
  const processedLeads: ProcessedLead[] = [];
  const interactionsToCreate: Array<{
    lead_id: string;
    tenant_id: string;
    type: string;
    content: string;
    created_by: string;
  }> = [];

  // Group updates by target status for batch processing
  const updatesByStatus = new Map<LeadStatus, string[]>();

  for (const result of results) {
    const emailLower = result.email.toLowerCase();
    const lead = leadMap.get(emailLower);

    if (!lead) {
      response.unmatched.push(result.email);
      continue;
    }

    response.matched++;

    const newStatus = responseToStatus[result.responseType];
    const needsUpdate = newStatus !== null && lead.status !== newStatus;

    processedLeads.push({
      leadId: lead.id,
      email: result.email,
      responseType: result.responseType,
      newStatus,
      needsUpdate,
    });

    // Prepare interaction record
    interactionsToCreate.push({
      lead_id: lead.id,
      tenant_id: profile.tenant_id,
      type: "campaign_reply",
      content: `Resposta de campanha: ${result.responseType}`,
      created_by: profile.id,
    });

    // Group by status for batch update
    if (needsUpdate && newStatus) {
      const ids = updatesByStatus.get(newStatus) || [];
      ids.push(lead.id);
      updatesByStatus.set(newStatus, ids);
    }
  }

  // ============================================
  // STEP 3: Batch update leads by status
  // ============================================
  const now = new Date().toISOString();

  for (const [status, leadIds] of updatesByStatus) {
    const { error: updateError, count } = await supabase
      .from("leads")
      .update({ status, updated_at: now })
      .in("id", leadIds);

    if (updateError) {
      console.error(
        `[POST /api/leads/import-results] Batch update error for status ${status}:`,
        updateError
      );
      // Find which emails failed
      const failedEmails = processedLeads
        .filter((p) => leadIds.includes(p.leadId))
        .map((p) => p.email);
      for (const email of failedEmails) {
        response.errors.push(`Erro ao atualizar ${email}`);
      }
    } else {
      response.updated += count ?? leadIds.length;
    }
  }

  // ============================================
  // STEP 4: Batch insert interactions
  // ============================================
  if (interactionsToCreate.length > 0) {
    const { error: interactionError } = await supabase
      .from("lead_interactions")
      .insert(interactionsToCreate);

    if (interactionError) {
      console.error(
        "[POST /api/leads/import-results] Batch interaction insert error:",
        interactionError
      );
      // Don't add to errors - interaction logging is secondary
    }
  }

  // ============================================
  // STEP 5: Optionally create leads for unmatched
  // ============================================
  if (createMissingLeads && response.unmatched.length > 0) {
    const unmatchedResults = results.filter((r) =>
      response.unmatched.includes(r.email)
    );

    // Prepare batch insert for new leads
    const leadsToCreate = unmatchedResults.map((result) => ({
      tenant_id: profile.tenant_id,
      first_name: result.email.split("@")[0] || "Lead",
      email: result.email,
      status: responseToStatus[result.responseType] || "novo",
    }));

    const { data: newLeads, error: createError } = await supabase
      .from("leads")
      .insert(leadsToCreate)
      .select("id, email");

    if (createError) {
      console.error(
        "[POST /api/leads/import-results] Batch create error:",
        createError
      );
      for (const result of unmatchedResults) {
        response.errors.push(`Erro ao criar lead ${result.email}`);
      }
    } else if (newLeads) {
      response.created = newLeads.length;

      // Batch insert import interactions for new leads
      const newInteractions = newLeads.map((lead) => {
        const result = unmatchedResults.find(
          (r) => r.email.toLowerCase() === lead.email.toLowerCase()
        );
        return {
          lead_id: lead.id,
          tenant_id: profile.tenant_id,
          type: "import",
          content: `Lead criado via importacao de campanha: ${result?.responseType || "unknown"}`,
          created_by: profile.id,
        };
      });

      await supabase.from("lead_interactions").insert(newInteractions);

      // Remove created emails from unmatched list
      const createdEmails = new Set(newLeads.map((l) => l.email.toLowerCase()));
      response.unmatched = response.unmatched.filter(
        (email) => !createdEmails.has(email.toLowerCase())
      );
    }
  }

  return NextResponse.json({ data: response });
}
