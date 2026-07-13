/**
 * API Route: POST /api/replies/backfill
 * Story: 21.2 - Ingestão de Respostas por Polling + Processador + Backfill
 *
 * Backfill do loop de resposta (AC6/AC7): primeiro sweep com janela ampla via
 * API (o histórico está no Instantly desde mar/2026 — campaign_events está vazia).
 * Idempotente por construção (dedupe 23505 no sweep + UNIQUE reply_event_id no
 * processador) — chamar de novo é seguro.
 *
 * Auth: sessão de admin (getCurrentUserProfile + hasAdminAccess). Usa service-role
 * para o INSERT com cross-lookup (bypassa RLS), escopado ao tenant do admin.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { hasAdminAccess } from "@/lib/auth/capabilities";
import { sweepReplies } from "@/lib/utils/reply-sweep";
import { processReplies } from "@/lib/utils/reply-processor";
import { processEngagement } from "@/lib/utils/engagement-processor";

/** Janela ampla do backfill (histórico do Instantly começa em mar/2026). */
const BACKFILL_SINCE = "2026-01-01T00:00:00.000Z";

export async function POST() {
  // Auth: sessão de admin.
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!hasAdminAccess(profile.role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  if (!profile.tenant_id) {
    return NextResponse.json({ error: "Tenant não encontrado" }, { status: 400 });
  }

  // Leitura guardada de env (no-non-null-assertion).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const tenantId = profile.tenant_id;

    const sweep = await sweepReplies(supabase, { since: BACKFILL_SINCE, tenantId });
    const processed = await processReplies(supabase, { tenantId });
    // Story 21.6: engajamento também no backfill (idempotente por construção).
    const engagement = await processEngagement(supabase, { tenantId });

    return NextResponse.json({
      swept: sweep.swept,
      created: processed.created,
      skipped: sweep.skipped + processed.skipped,
      engagementCreated: engagement.created,
      engagementSkipped: engagement.skipped,
      errors: [
        ...sweep.errors.map((e) => ({ scope: "sweep", ...e })),
        ...processed.errors.map((e) => ({ scope: "process", ...e })),
        ...engagement.errors.map((e) => ({ scope: "engagement", ...e })),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
