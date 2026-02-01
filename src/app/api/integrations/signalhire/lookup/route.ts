/**
 * SignalHire Phone Lookup API Route
 * Story: 4.4 - SignalHire Integration Service
 *
 * POST /api/integrations/signalhire/lookup
 * Proxies phone lookup requests to SignalHire API.
 *
 * AC: #2 - Requests proxied through API Routes
 * AC: #3 - Portuguese error messages
 * AC: #7 - Returns phone, creditsUsed, creditsRemaining
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { SignalHireService } from "@/lib/services/signalhire";
import { ExternalServiceError } from "@/lib/services/base-service";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import type { SignalHireLookupResult } from "@/types/signalhire";

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

    const { identifier } = parseResult.data;

    // 3. Execute phone lookup via SignalHireService
    const signalHireService = new SignalHireService(tenantId);
    const result = await signalHireService.lookupPhone(identifier);

    // 4. Return success response
    return NextResponse.json<APISuccessResponse<SignalHireLookupResult>>({
      data: result,
    });
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
          message: "Erro interno ao buscar telefone",
        },
      },
      { status: 500 }
    );
  }
}
