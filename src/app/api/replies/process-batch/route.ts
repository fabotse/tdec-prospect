/**
 * API Route: POST /api/replies/process-batch
 * Story: 21.2 - Ingestão de Respostas por Polling + Processador + Backfill
 *         21.6 - Janela de Oportunidade Cross-Campanha (piggyback de engajamento)
 *
 * Cron do loop de resposta: além de varrer respostas por polling (sweepReplies →
 * processReplies), processa ENGAJAMENTO cross-campanha (processEngagement → opportunities
 * source='engagement'), classifica intenção por IA (classifyPendingReplies) e, POR ÚLTIMO,
 * NOTIFICA (notifyNewOpportunities → WhatsApp + app_notifications in-app; 21.7). Chamada pelo
 * pg_cron via Edge Function (reply-sweep) a cada ≤5 min (NFR3). O nome `replies` da rota
 * permanece por compat do endpoint já deployado (renomear quebraria o NEXT_APP_URL da edge fn
 * em prod) — ver Dev Notes 21.6 "piggyback, não cron novo".
 *
 * Auth: Bearer token (REPLIES_CRON_SECRET), NÃO sessão de usuário.
 * Usa service-role key para acesso multi-tenant sem RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sweepReplies } from "@/lib/utils/reply-sweep";
import { processReplies } from "@/lib/utils/reply-processor";
import { processEngagement } from "@/lib/utils/engagement-processor";
import { classifyPendingReplies } from "@/lib/utils/reply-classifier";
import { notifyNewOpportunities } from "@/lib/utils/notification-processor";

export async function POST(req: NextRequest) {
  // Auth: cron secret (lido em tempo de request para testabilidade).
  // Fail-closed se o secret não estiver configurado — senão o header
  // "Bearer undefined" passaria (execução service-role não autenticada).
  const repliesSecret = process.env.REPLIES_CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!repliesSecret || !authHeader || authHeader !== `Bearer ${repliesSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Leitura guardada de env (no-non-null-assertion).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Sweep primeiro (Instantly → campaign_events), depois processa (→ opportunities),
    // e por fim o engajamento cross-campanha (getLeadTracking → opportunities engagement).
    const sweep = await sweepReplies(supabase);
    const processed = await processReplies(supabase);
    const engagement = await processEngagement(supabase);
    // Story 21.3: classifica intenção das respostas persistidas (DEPOIS de processReplies).
    const classify = await classifyPendingReplies(supabase);
    // Story 21.7: notifica POR ÚLTIMO — o WhatsApp por intent (AC1) depende de `intent` já
    // setado pelo classify no mesmo ciclo. Fail-open (in-app criada apesar do WhatsApp falhar).
    const notify = await notifyNewOpportunities(supabase);

    return NextResponse.json({
      swept: sweep.swept,
      created: processed.created,
      skipped: sweep.skipped + processed.skipped,
      engagementCreated: engagement.created,
      engagementSkipped: engagement.skipped,
      classified: classify.classified,
      classifySkipped: classify.skipped,
      notified: notify.inAppCreated,
      whatsappSent: notify.whatsappSent,
      whatsappGrouped: notify.whatsappGrouped,
      errors: [
        ...sweep.errors.map((e) => ({ scope: "sweep", ...e })),
        ...processed.errors.map((e) => ({ scope: "process", ...e })),
        ...engagement.errors.map((e) => ({ scope: "engagement", ...e })),
        ...classify.errors.map((e) => ({ scope: "classify", ...e })),
        // notify.errors já carregam `scope` próprio (notify/whatsapp/select/suppress).
        ...notify.errors,
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
