/**
 * API Route: POST /api/monitoring/initial-scan
 * Story: 13.9 - Verificação Inicial ao Ativar Monitoramento
 *
 * Processes recently activated monitored leads for LinkedIn posts immediately,
 * so the user receives insights without waiting for the next cron run.
 *
 * Auth: User session (NOT cron secret). Uses createClient from @/lib/supabase/server.
 * RLS filters by tenant automatically.
 *
 * AC: #1, #2, #3, #5, #9, #10
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { ApifyService } from "@/lib/services/apify";
import { z } from "zod";
import {
  BATCH_SIZE,
  processLead,
  getApiKey,
  loadKBContext,
  loadToneContext,
  logMonitoringUsage,
} from "@/lib/utils/monitoring-processor";
import type { ProcessLeadInput, PostClassificationDetail } from "@/lib/utils/monitoring-processor";

// ==============================================
// VALIDATION SCHEMA (AC #2)
// ==============================================

const initialScanSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead inválido"))
    .min(1, "Selecione pelo menos um lead")
    .max(100, "Máximo de 100 leads por scan"),
});

// ==============================================
// RESPONSE TYPE (AC #5)
// ==============================================

interface LeadDetail {
  leadId: string;
  leadName: string;
  success: boolean;
  totalPostsFetched: number;
  newPostsFound: number;
  postsFiltered: number;
  suggestionsGenerated: number;
  postDetails: PostClassificationDetail[];
  error?: string;
}

interface InitialScanResponse {
  totalProcessed: number;
  totalLeads: number;
  newPostsFound: number;
  insightsGenerated: number;
  errors: Array<{ leadId: string; error: string }>;
  leadDetails: LeadDetail[];
}

// ==============================================
// POST HANDLER (AC #1)
// ==============================================

export async function POST(request: NextRequest) {
  // Auth: user session via profile (AC #1) — same pattern as all other routes
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const tenantId = profile.tenant_id;
  if (!tenantId) {
    return NextResponse.json(
      { error: { code: "TENANT_ERROR", message: "Tenant não encontrado" } },
      { status: 400 }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Corpo da requisição inválido" } },
      { status: 400 }
    );
  }

  // Zod validation (AC #2)
  const validation = initialScanSchema.safeParse(body);
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

  const { leadIds } = validation.data;

  try {
    // Create client for queries (RLS filters by tenant automatically)
    const supabase = await createClient();

    // Check Apify key before processing (AC #10)
    const apifyKey = await getApiKey(supabase, tenantId, "apify");
    if (!apifyKey) {
      return NextResponse.json(
        { error: { code: "APIFY_KEY_MISSING", message: "Chave da Apify não configurada" } },
        { status: 400 }
      );
    }

    // Filter leads: is_monitored = true AND linkedin_url preenchido (AC #2)
    const { data: leads } = await supabase
      .from("leads")
      .select("id, linkedin_url, linkedin_posts_cache, first_name, last_name, title, company_name, industry")
      .in("id", leadIds)
      .eq("is_monitored", true)
      .not("linkedin_url", "is", null);

    if (!leads || leads.length === 0) {
      const response: InitialScanResponse = {
        totalProcessed: 0,
        totalLeads: 0,
        newPostsFound: 0,
        insightsGenerated: 0,
        errors: [],
        leadDetails: [],
      };
      return NextResponse.json(response);
    }

    // Load shared context once
    const openaiKey = await getApiKey(supabase, tenantId, "openai");
    const kbContext = await loadKBContext(supabase, tenantId);
    const toneContext = await loadToneContext(supabase, tenantId);
    const apifyService = new ApifyService();

    // Process in batches of BATCH_SIZE sequentially (AC #3)
    let totalNewPosts = 0;
    let totalInsights = 0;
    let totalProcessed = 0;
    const errors: Array<{ leadId: string; error: string }> = [];
    const leadDetails: LeadDetail[] = [];

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((lead) => {
          const input: ProcessLeadInput = {
            id: lead.id,
            linkedin_url: lead.linkedin_url,
            linkedin_posts_cache: lead.linkedin_posts_cache,
            first_name: lead.first_name,
            last_name: lead.last_name,
            title: lead.title,
            company_name: lead.company_name,
            industry: lead.industry,
          };
          return processLead(
            input,
            apifyKey,
            apifyService,
            supabase,
            tenantId,
            openaiKey,
            kbContext,
            toneContext
          );
        })
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const batchLeadId = batch[j].id;
        totalProcessed++;
        if (r.status === "fulfilled") {
          totalNewPosts += r.value.newPostsFound;
          totalInsights += r.value.suggestionsGenerated;
          if (!r.value.success && r.value.error) {
            errors.push({ leadId: r.value.leadId, error: r.value.error });
          }
          leadDetails.push({
            leadId: r.value.leadId,
            leadName: r.value.leadName || r.value.leadId,
            success: r.value.success,
            totalPostsFetched: r.value.totalPostsFetched || 0,
            newPostsFound: r.value.newPostsFound,
            postsFiltered: r.value.postsFiltered,
            suggestionsGenerated: r.value.suggestionsGenerated,
            postDetails: r.value.postDetails || [],
            error: r.value.error,
          });
        } else {
          errors.push({ leadId: batchLeadId, error: String(r.reason) });
        }
      }
    }

    // Log initial-scan usage (AC #9)
    await logMonitoringUsage(supabase, {
      tenantId,
      serviceName: "apify",
      requestType: "monitoring_initial_scan",
      status: "success",
      metadata: {
        source: "initial-scan",
        totalLeads: leads.length,
        totalProcessed,
        newPostsFound: totalNewPosts,
        insightsGenerated: totalInsights,
        errorsCount: errors.length,
      },
    });

    // AC #5: aggregated response
    const response: InitialScanResponse = {
      totalProcessed,
      totalLeads: leads.length,
      newPostsFound: totalNewPosts,
      insightsGenerated: totalInsights,
      errors,
      leadDetails,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno ao processar scan" } },
      { status: 500 }
    );
  }
}
