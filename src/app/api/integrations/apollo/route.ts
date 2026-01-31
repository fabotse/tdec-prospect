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
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import { transformLeadRow } from "@/types/lead";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";

// ==============================================
// REQUEST VALIDATION
// ==============================================

const searchSchema = z.object({
  industries: z.array(z.string()).optional(),
  companySizes: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  titles: z.array(z.string()).optional(),
  keywords: z.string().optional(),
  domains: z.array(z.string()).optional(),
  page: z.number().optional(),
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
    const apolloService = new ApolloService(tenantId);
    const leadRows = await apolloService.searchPeople(parseResult.data);

    // 4. Transform to Lead interface for frontend
    const leads = leadRows.map(transformLeadRow);

    // 5. Return success response
    return NextResponse.json<APISuccessResponse<typeof leads>>({
      data: leads,
      meta: {
        total: leads.length,
        page: parseResult.data.page ?? 1,
        limit: parseResult.data.perPage ?? 25,
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
