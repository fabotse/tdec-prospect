/**
 * API Route: POST /api/agent/lead-history (somente leitura)
 * Story 24.25: Memória entre execuções
 *
 * Histórico resumido (campanha, data, resultado) por lead (`apolloId`) e por conta
 * (`companyName` exato). POST só porque a lista não cabe em query string: nada é gravado,
 * nenhum serviço externo é chamado e nada vai para `api_usage_logs`.
 * Client de SESSÃO + `.eq("tenant_id")` (ver `findLeadWorkHistory`).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  findLeadWorkHistory,
  MAX_HISTORY_IDS,
  MAX_HISTORY_NAMES,
} from "@/lib/agent/execution-memory";

const MAX_ITEM_LENGTH = 200;

const bodySchema = z.object({
  apolloIds: z.array(z.string().max(MAX_ITEM_LENGTH)).max(MAX_HISTORY_IDS).default([]),
  companyNames: z.array(z.string().max(MAX_ITEM_LENGTH)).max(MAX_HISTORY_NAMES).default([]),
});

function validationError(message: string) {
  return NextResponse.json({ error: { code: "VALIDATION_ERROR", message } }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationError("Corpo da requisicao invalido");
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Envie apolloIds e companyNames (ate 500 itens de ate 200 caracteres)");
    }

    const supabase = await createClient();
    const data = await findLeadWorkHistory(
      supabase,
      profile.tenant_id,
      parsed.data.apolloIds,
      parsed.data.companyNames
    );

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[agent/lead-history] erro inesperado:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar o historico" } },
      { status: 500 }
    );
  }
}
