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
import { decryptApiKey } from "@/lib/crypto/encryption";
import { BriefingParserService } from "@/lib/agent/briefing-parser-service";
import type { ParsedBriefing } from "@/types/agent";
import { AGENT_ERROR_CODES } from "@/types/agent";
import { BriefingSuggestionService } from "@/lib/agent/briefing-suggestion-service";

// ==============================================
// REQUEST VALIDATION
// ==============================================

const parseRequestSchema = z.object({
  executionId: z.string().uuid(),
  message: z.string().min(1),
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

  // canProceed logic:
  // - jobTitles must be present (required for lead search)
  // - At least one search parameter (technology OR industry OR location) must be present
  // - Story 17.11: imported leads flow doesn't need jobTitles or search params
  const hasJobTitles = briefing.jobTitles && briefing.jobTitles.length > 0;
  const hasSearchParam = Boolean(briefing.technology || briefing.industry || briefing.location);

  const isImportedLeadsFlow =
    briefing.skipSteps?.includes("search_companies") &&
    briefing.skipSteps?.includes("search_leads");

  const canProceed = Boolean(
    (hasJobTitles && hasSearchParam) || isImportedLeadsFlow
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
          message: "Campos obrigatorios: executionId (UUID) e message (string)",
        },
      },
      { status: 400 }
    );
  }

  const { executionId, message } = validation.data;

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
  const { data: apiConfig } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", profile.tenant_id)
    .eq("service_name", "openai")
    .single();

  if (!apiConfig?.encrypted_key) {
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

  let apiKey: string;
  try {
    apiKey = decryptApiKey(apiConfig.encrypted_key);
  } catch {
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

  // Parse briefing
  try {
    const { briefing, rawResponse } = await BriefingParserService.parse(message, apiKey);

    // Resolve product slug via KB (no mutation of original object)
    const resolvedProductSlug = await resolveProduct(
      rawResponse.productMentioned,
      profile.tenant_id,
      supabase
    );

    const resolvedBriefing: ParsedBriefing = {
      ...briefing,
      productSlug: resolvedProductSlug,
    };

    // Analyze briefing completeness with contextual suggestions
    const suggestions = BriefingSuggestionService.generateSuggestions(resolvedBriefing);
    const { missingFields, canProceed } = analyzeBriefingCompleteness(resolvedBriefing);
    const isComplete = missingFields.length === 0;

    const response: BriefingParseResponse = {
      briefing: resolvedBriefing,
      missingFields,
      isComplete,
      canProceed,
      suggestions,
      productMentioned: rawResponse.productMentioned,
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
