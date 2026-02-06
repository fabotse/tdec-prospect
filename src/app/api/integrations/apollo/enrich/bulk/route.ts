/**
 * Apollo Bulk People Enrichment API Route
 * Story: 3.2.1 - People Enrichment Integration
 *
 * POST /api/integrations/apollo/enrich/bulk
 * Enriches up to 10 people with complete data (email, phone, full name).
 *
 * AC: #4 - Up to 10 leads per API call
 * AC: #4 - Rate limits respected (50% of per-minute limit)
 * AC: #6 - Follows ExternalService patterns
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import type { ApolloEnrichedPerson } from "@/types/apollo";

// ==============================================
// CONSTANTS
// ==============================================

const BULK_LIMIT = 10;

// ==============================================
// REQUEST VALIDATION
// ==============================================

const bulkEnrichSchema = z.object({
  apolloIds: z
    .array(z.string().min(1))
    .min(1, "Pelo menos um Apollo ID é obrigatório")
    .max(BULK_LIMIT, `Máximo de ${BULK_LIMIT} leads por requisição`),
  revealPersonalEmails: z.boolean().optional().default(false),
  revealPhoneNumber: z.boolean().optional().default(false),
  webhookUrl: z.string().url("URL de webhook inválida").optional(),
});

// ==============================================
// POST /api/integrations/apollo/enrich/bulk
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
    const parseResult = bulkEnrichSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Parâmetros de enriquecimento em lote inválidos",
            details:
              process.env.NODE_ENV === "development"
                ? parseResult.error.issues
                : undefined,
          },
        },
        { status: 400 }
      );
    }

    const { apolloIds, revealPersonalEmails, revealPhoneNumber, webhookUrl } =
      parseResult.data;

    // 3. Execute bulk enrichment via ApolloService
    const apolloService = new ApolloService(tenantId);
    const enrichedPeople = await apolloService.enrichPeople(apolloIds, {
      revealPersonalEmails,
      revealPhoneNumber,
      webhookUrl,
    });

    // 4. Return success response
    return NextResponse.json<APISuccessResponse<ApolloEnrichedPerson[]>>({
      data: enrichedPeople,
      meta: {
        total: enrichedPeople.length,
      },
    });
  } catch (error) {
    console.error("[Apollo Bulk Enrich Route] Error:", error);

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
          message: "Erro interno ao enriquecer leads em lote",
        },
      },
      { status: 500 }
    );
  }
}
