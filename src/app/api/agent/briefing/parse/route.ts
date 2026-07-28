/**
 * API Route: POST /api/agent/briefing/parse
 * Story: 16.3 - Briefing Parser & Linguagem Natural
 *
 * AC: #2 - Processa briefing via OpenAI structured output
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { readServiceApiKey } from "@/lib/agent/service-keys";
import { BriefingParserService } from "@/lib/agent/briefing-parser-service";
import type { ChatTurn, NextAction, ParsedBriefing } from "@/types/agent";
import { AGENT_ERROR_CODES } from "@/types/agent";
import { resolveContextualSuggestions } from "@/lib/agent/contextual-suggestions";

// ==============================================
// REQUEST VALIDATION
// ==============================================

// Story 22.3: aceita historico estruturado (messages[], preferido) OU o body
// legado { message: string } (back-compat / fail-open).
const chatTurnSchema = z.object({
  role: z.enum(["user", "agent", "system"]),
  content: z.string().min(1),
});

const parseRequestSchema = z
  .object({
    executionId: z.string().uuid(),
    messages: z.array(chatTurnSchema).min(1).optional(),
    message: z.string().min(1).optional(),
  })
  .refine((d) => (d.messages?.length ?? 0) > 0 || Boolean(d.message), {
    message: "Forneca messages[] ou message",
  });

// ==============================================
// RESPONSE TYPE (Story 17.8: expanded with suggestions + canProceed)
// ==============================================

export interface BriefingParseResponse {
  briefing: ParsedBriefing;
  missingFields: string[];
  isComplete: boolean;
  canProceed: boolean;
  suggestions: Record<string, string[]>;
  productMentioned: string | null;
  // Story 22.3: intencao de conversa via LLM. NAO altera canProceed/skipSteps/missingFields
  // (esses seguem 100% deterministicos — NFR1). O cliente reage ao nextAction, mas o
  // gating deterministico (canProceed) SEMPRE prevalece.
  nextAction: NextAction;
  questionText: string | null;
}

// ==============================================
// BRIEFING COMPLETENESS ANALYSIS (Story 17.8 — replaces detectMissingFields)
// ==============================================

interface BriefingCompletenessResult {
  missingFields: string[];
  canProceed: boolean;
}

function analyzeBriefingCompleteness(
  briefing: ParsedBriefing
): BriefingCompletenessResult {
  const missingFields: string[] = [];

  if (!briefing.technology) {
    missingFields.push("technology");
  }

  if (!briefing.jobTitles || briefing.jobTitles.length === 0) {
    missingFields.push("jobTitles");
  }

  if (!briefing.location) {
    missingFields.push("location");
  }

  if (!briefing.industry) {
    missingFields.push("industry");
  }

  if (!briefing.companySize) {
    missingFields.push("companySize");
  }

  // canProceed logic (Story 22.1 — localizacao obrigatoria, tecnologia opcional):
  // - jobTitles must be present (required for lead search)
  // - location must be present (parametro primario; technology/industry sao filtros OPCIONAIS
  //   e nao contam mais como criterio para avancar)
  // - Story 17.11: imported leads flow doesn't need jobTitles or location
  const hasJobTitles = briefing.jobTitles && briefing.jobTitles.length > 0;
  const hasLocation = Boolean(briefing.location);

  const isImportedLeadsFlow =
    briefing.skipSteps?.includes("search_companies") &&
    briefing.skipSteps?.includes("search_leads");

  const canProceed = Boolean(
    (hasJobTitles && hasLocation) || isImportedLeadsFlow
  );

  return { missingFields, canProceed };
}

// ==============================================
// PRODUCT RESOLUTION (Task 3 placeholder — full logic in Task 3)
// ==============================================

async function resolveProduct(
  productMentioned: string | null,
  tenantId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  if (!productMentioned) return null;

  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .eq("tenant_id", tenantId);

  if (!products) return null;

  const matches = products.filter((p: { id: string; name: string }) =>
    p.name.toLowerCase().includes(productMentioned.toLowerCase())
  );

  return matches.length === 1 ? matches[0].id : null;
}

// ==============================================
// ROUTE HANDLER
// ==============================================

export async function POST(request: Request) {
  // AC: #2 — Auth via getCurrentUserProfile
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "JSON invalido" } },
      { status: 400 }
    );
  }

  // Validate request
  const validation = parseRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Campos obrigatorios: executionId (UUID) e messages[] ou message (string)",
        },
      },
      { status: 400 }
    );
  }

  const { executionId } = validation.data;

  // Story 22.3: monta o historico do parser. messages[] preferido; message legado
  // vira um unico turno de usuario. O `.refine` garante que ao menos um existe —
  // usamos `?? ""` guardado para evitar no-non-null-assertion (Project Memory).
  const history: ChatTurn[] = validation.data.messages ?? [
    { role: "user", content: validation.data.message ?? "" },
  ];

  // Get OpenAI API key
  const supabase = await createClient();

  // Verify execution exists and belongs to tenant
  const { data: execution, error: execError } = await supabase
    .from("agent_executions")
    .select("id")
    .eq("id", executionId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (execError || !execution) {
    return NextResponse.json(
      {
        error: {
          code: "EXECUTION_NOT_FOUND",
          message: "Execucao nao encontrada",
        },
      },
      { status: 404 }
    );
  }
  // Story 22.9: a chave e lida via SERVICE-ROLE (helper central), nunca pelo client
  // de sessao. A RLS admin-only de api_configs (00005:14-20) devolve ZERO linhas em
  // silencio para um papel `sdr` — o usuario primario do agente — e a rota respondia
  // 422 mesmo com a chave configurada pelo gestor. O contrato de erro nao muda: so a
  // FONTE da leitura. O `supabase` de sessao segue para o resto (RLS por tenant).
  const keyLookup = await readServiceApiKey(profile.tenant_id, "openai");

  if (keyLookup.status === "missing") {
    return NextResponse.json(
      {
        error: {
          code: "API_KEY_MISSING",
          message: "Chave OpenAI nao configurada. Configure em Integracoes.",
        },
      },
      { status: 422 }
    );
  }

  if (keyLookup.status === "decrypt_error") {
    return NextResponse.json(
      {
        error: {
          code: "API_KEY_ERROR",
          message: "Erro ao decriptar chave OpenAI",
        },
      },
      { status: 500 }
    );
  }

  const apiKey = keyLookup.apiKey;

  // Parse briefing
  try {
    const { briefing, rawResponse, nextAction, questionText } =
      await BriefingParserService.parse(history, apiKey);

    // Resolve product slug via KB (no mutation of original object)
    const resolvedProductSlug = await resolveProduct(
      rawResponse.productMentioned,
      profile.tenant_id,
      supabase
    );

    // Canonicalize LLM output so pipeline decisions remain deterministic.
    // Imported leads always skip both search steps. Otherwise, search_companies
    // runs only when the user selected a technology.
    let skipSteps = [...new Set(briefing.skipSteps ?? [])];
    const isImportedLeadsFlow = skipSteps.includes("search_leads");

    if (isImportedLeadsFlow) {
      if (!skipSteps.includes("search_companies")) {
        skipSteps.push("search_companies");
      }
    } else if (briefing.technology) {
      skipSteps = skipSteps.filter((step) => step !== "search_companies");
    } else if (!skipSteps.includes("search_companies")) {
      skipSteps.push("search_companies");
    }

    const resolvedBriefing: ParsedBriefing = {
      ...briefing,
      location: briefing.location?.trim() || null,
      productSlug: resolvedProductSlug,
      skipSteps,
    };

    // Story 22.7: sugestoes KB-first — derivam do ICP do tenant quando disponivel,
    // com fallback fail-open pros mapas estaticos. NAO altera canProceed/missingFields/
    // skipSteps (NFR1) — sugestao e conteudo de conversa, nao gate.
    const suggestions = await resolveContextualSuggestions(
      resolvedBriefing,
      profile.tenant_id
    );
    const { missingFields, canProceed } = analyzeBriefingCompleteness(resolvedBriefing);
    const isComplete = missingFields.length === 0;

    // NFR1: canProceed/skipSteps/missingFields acima sao 100% deterministicos.
    // nextAction/questionText sao de CONVERSA — o cliente reage a eles, mas canProceed
    // (cargo + localizacao, Story 22.1) sempre prevalece sobre o nextAction do LLM.
    const response: BriefingParseResponse = {
      briefing: resolvedBriefing,
      missingFields,
      isComplete,
      canProceed,
      suggestions,
      productMentioned: rawResponse.productMentioned,
      nextAction: nextAction ?? "ask",
      questionText: questionText ?? null,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BRIEFING_PARSE_ERROR",
          message: AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR,
        },
      },
      { status: 500 }
    );
  }
}
