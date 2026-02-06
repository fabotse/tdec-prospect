/**
 * SignalHire Phone Lookup API Route
 * Story: 4.4 - SignalHire Integration Service
 * Story: 4.4.2 - SignalHire Callback Architecture
 *
 * POST /api/integrations/signalhire/lookup
 * Initiates a phone lookup request via SignalHire API.
 *
 * AC 4.4.2 #3 - Iniciar Lookup com Callback URL
 *
 * NOVO FLUXO (4.4.2):
 * 1. Cria registro em signalhire_lookups
 * 2. Envia requisição para SignalHire com callbackUrl
 * 3. Retorna lookupId para o frontend fazer polling
 * 4. Frontend faz polling em GET /api/integrations/signalhire/lookup/[lookupId]
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { SignalHireService } from "@/lib/services/signalhire";
import { ExternalServiceError } from "@/lib/services/base-service";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import type { SignalHireLookupInitResponse } from "@/types/signalhire";

// ==============================================
// REQUEST VALIDATION
// ==============================================

const lookupSchema = z.object({
  identifier: z
    .string()
    .min(1, "Identificador é obrigatório")
    .refine(
      (val) => {
        // Must be a LinkedIn URL, email, or phone number
        const isLinkedIn = val.includes("linkedin.com");
        const isEmail = val.includes("@") && !val.includes("linkedin.com");
        const isPhone = /^\+?\d{10,15}$/.test(val.replace(/[\s-]/g, ""));
        return isLinkedIn || isEmail || isPhone;
      },
      {
        message:
          "Identificador deve ser uma URL do LinkedIn, email ou telefone no formato E164",
      }
    ),
  leadId: z.string().uuid().optional(),
});

// ==============================================
// POST /api/integrations/signalhire/lookup
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
    const parseResult = lookupSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              parseResult.error.issues[0]?.message || "Dados inválidos",
            details:
              process.env.NODE_ENV === "development"
                ? parseResult.error.issues
                : undefined,
          },
        },
        { status: 400 }
      );
    }

    const { identifier, leadId } = parseResult.data;

    // 3. Initiate phone lookup via SignalHireService
    // AC 4.4.2 #3 - Returns lookupId for polling
    const signalHireService = new SignalHireService(tenantId);
    const result = await signalHireService.lookupPhone(identifier, leadId);

    // 4. Return success response with lookupId
    return NextResponse.json<APISuccessResponse<SignalHireLookupInitResponse>>(
      { data: result },
      { status: 202 } // Accepted - processing started
    );
  } catch (error) {
    console.error("[SignalHire Lookup API Route] Error:", error);

    // Handle ExternalServiceError with Portuguese message
    if (error instanceof ExternalServiceError) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "SIGNALHIRE_ERROR",
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
          message: "Erro interno ao iniciar busca de telefone",
        },
      },
      { status: 500 }
    );
  }
}
