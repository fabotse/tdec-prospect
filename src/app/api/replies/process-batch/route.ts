/**
 * API Route: POST /api/replies/process-batch
 * Story: 21.2 - Ingestão de Respostas por Polling + Processador + Backfill
 *
 * Cron do loop de resposta: varre respostas via polling (sweepReplies) e as
 * converte em oportunidades (processReplies). Chamada pelo pg_cron via Edge
 * Function (reply-sweep) a cada ≤5 min (NFR3).
 *
 * Auth: Bearer token (REPLIES_CRON_SECRET), NÃO sessão de usuário.
 * Usa service-role key para acesso multi-tenant sem RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sweepReplies } from "@/lib/utils/reply-sweep";
import { processReplies } from "@/lib/utils/reply-processor";

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

    // Sweep primeiro (Instantly → campaign_events), depois processa (→ opportunities).
    const sweep = await sweepReplies(supabase);
    const processed = await processReplies(supabase);

    return NextResponse.json({
      swept: sweep.swept,
      created: processed.created,
      skipped: sweep.skipped + processed.skipped,
      errors: [
        ...sweep.errors.map((e) => ({ scope: "sweep", ...e })),
        ...processed.errors.map((e) => ({ scope: "process", ...e })),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
