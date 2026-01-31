/**
 * Apollo People Enrichment API Route
 * Story: 3.2.1 - People Enrichment Integration
 *
 * POST /api/integrations/apollo/enrich
 * Enriches a single person with complete data (email, phone, full name).
 *
 * AC: #1 - Calls People Enrichment API with apollo_id
 * AC: #2 - Handles reveal_personal_emails flag for GDPR
 * AC: #3 - Handles reveal_phone_number flag and webhook_url
 * AC: #6 - Follows ExternalService patterns
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import type { ApolloEnrichmentResponse } from "@/types/apollo";

// ==============================================
// REQUEST VALIDATION
// ==============================================

const enrichSchema = z.object({
  apolloId: z.string().min(1, "Apollo ID é obrigatório"),
  revealPersonalEmails: z.boolean().optional().default(false),
  revealPhoneNumber: z.boolean().optional().default(false),
  webhookUrl: z.string().url("URL de webhook inválida").optional(),
});

// ==============================================
// POST /api/integrations/apollo/enrich
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
    const parseResult = enrichSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Parâmetros de enriquecimento inválidos",
            details:
              process.env.NODE_ENV === "development"
                ? parseResult.error.issues
                : undefined,
          },
        },
        { status: 400 }
      );
    }

    const { apolloId, revealPersonalEmails, revealPhoneNumber, webhookUrl } =
      parseResult.data;

    // 3. Execute enrichment via ApolloService
    const apolloService = new ApolloService(tenantId);
    const enrichmentResult = await apolloService.enrichPerson(apolloId, {
      revealPersonalEmails,
      revealPhoneNumber,
      webhookUrl,
    });

    // 4. Return success response
    return NextResponse.json<APISuccessResponse<ApolloEnrichmentResponse>>({
      data: enrichmentResult,
    });
  } catch (error) {
    console.error("[Apollo Enrich Route] Error:", error);

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
          message: "Erro interno ao enriquecer lead",
        },
      },
      { status: 500 }
    );
  }
}
