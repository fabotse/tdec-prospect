/**
 * AI Search API Route
 * Story: 3.4 - AI Conversational Search
 *
 * POST /api/ai/search
 * Accepts natural language query, extracts filters via AI, and searches Apollo.
 *
 * AC: #1 - AI converts natural language to Apollo API parameters
 * AC: #2 - Shows phase-specific loading messages
 * AC: #4 - Portuguese error messages
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { AIService, AI_ERROR_MESSAGES } from "@/lib/ai";
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import { transformLeadRow } from "@/types/lead";
import { aiSearchRequestSchema } from "@/types/ai-search";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import type { Lead } from "@/types/lead";
import type { AISearchResult } from "@/types/ai-search";

// ==============================================
// RESPONSE TYPES
// ==============================================

interface AISearchAPIResponse {
  leads: Lead[];
  aiResult: {
    extractedFilters: AISearchResult["filters"];
    confidence: number;
    explanation?: string;
    originalQuery: string;
  };
}

// ==============================================
// POST /api/ai/search
// ==============================================

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication and get tenant
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json<APIErrorResponse>(
        { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        { status: 401 }
      );
    }

    const tenantId = profile.tenant_id;
    if (!tenantId) {
      return NextResponse.json<APIErrorResponse>(
        { error: { code: "FORBIDDEN", message: "Tenant não encontrado" } },
        { status: 403 }
      );
    }

    // 2. Validate request body
    const body = await request.json();
    const parseResult = aiSearchRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: AI_ERROR_MESSAGES.EMPTY_QUERY,
            details:
              process.env.NODE_ENV === "development"
                ? parseResult.error.issues
                : undefined,
          },
        },
        { status: 400 }
      );
    }

    const { query } = parseResult.data;

    // 3. Extract filters using AI
    const aiService = new AIService();
    let aiResult: AISearchResult;

    try {
      aiResult = await aiService.translateSearchToFilters(query);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : AI_ERROR_MESSAGES.PARSE_FAILURE;

      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "AI_EXTRACTION_ERROR",
            message,
          },
        },
        { status: 422 }
      );
    }

    // 4. Search Apollo with extracted filters
    const apolloService = new ApolloService(tenantId);
    const { leads: leadRows } = await apolloService.searchPeople(aiResult.filters);

    // 5. Check which leads already exist in database (Story 4.2.1 fix)
    // Single query with IN clause - O(1) query per page
    const apolloIds = leadRows
      .map((lead) => lead.apollo_id)
      .filter((id): id is string => id !== null);

    let existingApolloIds = new Set<string>();
    if (apolloIds.length > 0) {
      const supabase = await createClient();
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("apollo_id")
        .eq("tenant_id", tenantId)
        .in("apollo_id", apolloIds);

      if (existingLeads) {
        existingApolloIds = new Set(
          existingLeads
            .map((l) => l.apollo_id)
            .filter((id): id is string => id !== null)
        );
      }
    }

    // 6. Mark leads with _is_imported flag based on DB check
    const leadsWithImportStatus = leadRows.map((lead) => ({
      ...lead,
      _is_imported: lead.apollo_id ? existingApolloIds.has(lead.apollo_id) : false,
    }));

    // 7. Transform to Lead interface for frontend
    const leads = leadsWithImportStatus.map(transformLeadRow);

    // 8. Return combined response
    return NextResponse.json<APISuccessResponse<AISearchAPIResponse>>({
      data: {
        leads,
        aiResult: {
          extractedFilters: aiResult.filters,
          confidence: aiResult.confidence,
          explanation: aiResult.explanation,
          originalQuery: aiResult.originalQuery,
        },
      },
      meta: {
        total: leads.length,
      },
    });
  } catch (error) {
    console.error("[AI Search API Route] Error:", error);

    // Handle ExternalServiceError (Apollo errors)
    if (error instanceof ExternalServiceError) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "APOLLO_ERROR",
            message: error.userMessage,
            details:
              process.env.NODE_ENV === "development" ? error.details : undefined,
          },
        },
        { status: error.statusCode || 500 }
      );
    }

    // Generic error
    return NextResponse.json<APIErrorResponse>(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: AI_ERROR_MESSAGES.API_ERROR,
        },
      },
      { status: 500 }
    );
  }
}
