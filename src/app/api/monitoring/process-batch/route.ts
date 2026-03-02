/**
 * API Route: POST /api/monitoring/process-batch
 * Story: 13.3 - Edge Function de Verificação Semanal
 *
 * Processes a batch of monitored leads for new LinkedIn posts.
 * Called by pg_cron via Edge Function every 5 minutes.
 *
 * Auth: Bearer token (MONITORING_CRON_SECRET), NOT user session.
 * Uses service role key for multi-tenant access without RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApifyService } from "@/lib/services/apify";
import {
  calculateNextRunAt,
} from "@/lib/utils/monitoring-utils";
import type { MonitoringBatchResult } from "@/lib/utils/monitoring-utils";
import {
  BATCH_SIZE,
  processLead,
  getApiKey,
  loadKBContext,
  loadToneContext,
} from "@/lib/utils/monitoring-processor";
import type { ProcessLeadInput } from "@/lib/utils/monitoring-processor";
import type { MonitoringConfigRow } from "@/types/monitoring";

// ==============================================
// POST HANDLER
// ==============================================

export async function POST(req: NextRequest) {
  // AC: Auth validation — cron secret (read at request time for testability)
  const monitoringSecret = process.env.MONITORING_CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${monitoringSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const apifyService = new ApifyService();

    // Find config: running (resume) OR idle with next_run_at <= now
    const { data: configs } = await supabase
      .from("monitoring_configs")
      .select("*")
      .or(
        `run_status.eq.running,and(run_status.eq.idle,next_run_at.lte.${new Date().toISOString()})`
      )
      .limit(1);

    let config: MonitoringConfigRow | null =
      configs && configs.length > 0
        ? (configs[0] as MonitoringConfigRow)
        : null;

    // No config found — check if there are monitored leads needing a default config
    if (!config) {
      const { count } = await supabase
        .from("leads")
        .select("tenant_id", { count: "exact", head: true })
        .eq("is_monitored", true)
        .limit(1);

      if (count && count > 0) {
        // Get tenant_id from a monitored lead
        const { data: monitoredLead } = await supabase
          .from("leads")
          .select("tenant_id")
          .eq("is_monitored", true)
          .limit(1)
          .single();

        if (monitoredLead) {
          // Create default config for this tenant
          const { data: newConfig } = await supabase
            .from("monitoring_configs")
            .insert({
              tenant_id: monitoredLead.tenant_id,
              frequency: "weekly",
              max_monitored_leads: 100,
              next_run_at: new Date().toISOString(),
              run_status: "idle",
              run_cursor: null,
            })
            .select("*")
            .single();

          config = newConfig as MonitoringConfigRow | null;
        }
      }

      if (!config) {
        const result: MonitoringBatchResult = {
          status: "no_config",
          leadsProcessed: 0,
          newPostsFound: 0,
          postsFiltered: 0,
          suggestionsGenerated: 0,
          cursor: null,
          errors: [],
        };
        return NextResponse.json(result);
      }
    }

    // If idle and next_run_at <= now → start new run
    if (config.run_status === "idle") {
      const nextRunAt = config.next_run_at
        ? new Date(config.next_run_at)
        : new Date(0);
      if (nextRunAt > new Date()) {
        const result: MonitoringBatchResult = {
          status: "no_run_due",
          leadsProcessed: 0,
          newPostsFound: 0,
          postsFiltered: 0,
          suggestionsGenerated: 0,
          cursor: null,
          errors: [],
        };
        return NextResponse.json(result);
      }

      // Start run (note: no row-level lock — pg_cron 5min interval makes races unlikely)
      await supabase
        .from("monitoring_configs")
        .update({
          run_status: "running",
          run_cursor: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      config.run_status = "running";
      config.run_cursor = null;
    }

    // Fetch batch of leads (expanded for suggestion generation — Story 13.5)
    let query = supabase
      .from("leads")
      .select("id, linkedin_url, linkedin_posts_cache, tenant_id, first_name, last_name, title, company_name, industry")
      .eq("tenant_id", config.tenant_id)
      .eq("is_monitored", true)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (config.run_cursor) {
      query = query.gt("id", config.run_cursor);
    }

    const { data: leads } = await query;

    // No leads left → run complete (AC #9)
    if (!leads || leads.length === 0) {
      const nextRunAt = calculateNextRunAt(config.frequency, new Date());
      await supabase
        .from("monitoring_configs")
        .update({
          run_status: "idle",
          run_cursor: null,
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      const result: MonitoringBatchResult = {
        status: "run_completed",
        leadsProcessed: 0,
        newPostsFound: 0,
        postsFiltered: 0,
        suggestionsGenerated: 0,
        cursor: null,
        errors: [],
      };
      return NextResponse.json(result);
    }

    // Get Apify key for tenant
    const apifyKey = await getApiKey(supabase, config.tenant_id, "apify");
    if (!apifyKey) {
      // No Apify key — mark run complete, skip tenant
      const nextRunAt = calculateNextRunAt(config.frequency, new Date());
      await supabase
        .from("monitoring_configs")
        .update({
          run_status: "idle",
          run_cursor: null,
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      const result: MonitoringBatchResult = {
        status: "no_apify_key",
        leadsProcessed: 0,
        newPostsFound: 0,
        postsFiltered: 0,
        suggestionsGenerated: 0,
        cursor: null,
        errors: [],
      };
      return NextResponse.json(result);
    }

    // Load OpenAI key, KB context, and tone context once for the batch (Story 13.4, 13.5)
    const openaiKey = await getApiKey(supabase, config.tenant_id, "openai");
    const kbContext = await loadKBContext(supabase, config.tenant_id);
    const toneContext = await loadToneContext(supabase, config.tenant_id);

    // Process batch with Promise.allSettled (AC #7)
    const results = await Promise.allSettled(
      leads.map((lead) => {
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
          config!.tenant_id,
          openaiKey,
          kbContext,
          toneContext
        );
      })
    );

    // Aggregate results
    let totalNewPosts = 0;
    let totalPostsFiltered = 0;
    let totalSuggestionsGenerated = 0;
    const errors: Array<{ leadId: string; error: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const batchLeadId = leads[i].id;
      if (r.status === "fulfilled") {
        totalNewPosts += r.value.newPostsFound;
        totalPostsFiltered += r.value.postsFiltered;
        totalSuggestionsGenerated += r.value.suggestionsGenerated;
        if (!r.value.success && r.value.error) {
          errors.push({ leadId: r.value.leadId, error: r.value.error });
        }
      } else {
        errors.push({ leadId: batchLeadId, error: String(r.reason) });
      }
    }

    // Update cursor (AC #11)
    const lastLeadId = leads[leads.length - 1].id;
    await supabase
      .from("monitoring_configs")
      .update({
        run_cursor: lastLeadId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);

    const batchResult: MonitoringBatchResult = {
      status: "batch_processed",
      leadsProcessed: leads.length,
      newPostsFound: totalNewPosts,
      postsFiltered: totalPostsFiltered,
      suggestionsGenerated: totalSuggestionsGenerated,
      cursor: lastLeadId,
      errors,
    };

    return NextResponse.json(batchResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
