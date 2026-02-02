/**
 * Apollo Search API Route
 * Story: 3.2 - Apollo API Integration Service
 *
 * POST /api/integrations/apollo
 * Proxies search requests to Apollo API.
 *
 * AC: #2 - Requests proxied through API Routes
 * AC: #2 - Frontend never makes direct calls to Apollo API
 * AC: #4 - Errors translated to Portuguese with standard format
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import { transformLeadRow } from "@/types/lead";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";

// ==============================================
// REQUEST VALIDATION
// ==============================================

// Story 3.8: AC #4 - Validate pagination params (page 1-500, perPage 1-100)
const searchSchema = z.object({
  industries: z.array(z.string()).optional(),
  companySizes: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  titles: z.array(z.string()).optional(),
  keywords: z.string().optional(),
  domains: z.array(z.string()).optional(),
  contactEmailStatuses: z.array(z.string()).optional(),
  page: z.number().min(1).max(500).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

// ==============================================
// POST /api/integrations/apollo
// ==============================================

export async function POST(request: Request) {
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
    const parseResult = searchSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Filtros de busca inválidos",
            details:
              process.env.NODE_ENV === "development"
                ? parseResult.error.issues
                : undefined,
          },
        },
        { status: 400 }
      );
    }

    // 3. Execute search via ApolloService
    // Story 3.8: searchPeople now returns { leads, pagination }
    const apolloService = new ApolloService(tenantId);
    const { leads: leadRows, pagination } = await apolloService.searchPeople(parseResult.data);

    // 4. Check which leads already exist in database (Story 4.2.1 fix)
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

    // 5. Mark leads with _is_imported flag based on DB check
    const leadsWithImportStatus = leadRows.map((lead) => ({
      ...lead,
      _is_imported: lead.apollo_id ? existingApolloIds.has(lead.apollo_id) : false,
    }));

    // 6. Transform to Lead interface for frontend
    const leads = leadsWithImportStatus.map(transformLeadRow);

    // 7. Return success response with pagination metadata
    // Story 3.8: AC #4 - Include total from Apollo (total_entries), totalPages capped at 500
    return NextResponse.json<APISuccessResponse<typeof leads>>({
      data: leads,
      meta: {
        total: pagination.totalEntries,
        page: pagination.page,
        limit: pagination.perPage,
        totalPages: pagination.totalPages,
      },
    });
  } catch (error) {
    console.error("[Apollo API Route] Error:", error);

    // Handle ExternalServiceError with Portuguese message
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
          message: "Erro interno ao buscar leads",
        },
      },
      { status: 500 }
    );
  }
}
