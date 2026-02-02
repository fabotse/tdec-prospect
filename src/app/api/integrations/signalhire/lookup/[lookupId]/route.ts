/**
 * SignalHire Lookup Status API Route
 * Story: 4.4.2 - SignalHire Callback Architecture
 *
 * GET /api/integrations/signalhire/lookup/[lookupId]
 * Returns the current status of a phone lookup request.
 *
 * AC 4.4.2 #4 - Polling do Resultado
 *
 * Status values:
 * - pending: Aguardando envio para SignalHire
 * - processing: SignalHire está processando
 * - success: Telefone encontrado, retorna phone
 * - failed: Erro, retorna error_message
 * - not_found: Lead não encontrado no SignalHire
 * - credits_exhausted: Créditos esgotados
 *
 * RATE LIMITING NOTE:
 * This endpoint does not implement server-side rate limiting because:
 * 1. Polling is controlled client-side via POLL_INTERVAL_MS (2s) in use-phone-lookup.ts
 * 2. The endpoint is read-only (SELECT from database), low cost per request
 * 3. Authenticated-only access provides implicit rate limiting via auth overhead
 * 4. Tenant isolation via RLS prevents cross-tenant abuse
 *
 * If abuse is detected in production, consider adding rate limiting via middleware
 * or Vercel Edge Config (e.g., 30 requests/minute per user).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { SignalHireService } from "@/lib/services/signalhire";
import { ExternalServiceError } from "@/lib/services/base-service";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";
import type { SignalHireLookupStatus } from "@/types/signalhire";

// ==============================================
// GET /api/integrations/signalhire/lookup/[lookupId]
// ==============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lookupId: string }> }
) {
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

    // 2. Get lookupId from params
    const { lookupId } = await params;

    if (!lookupId) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "lookupId é obrigatório",
          },
        },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(lookupId)) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "lookupId inválido",
          },
        },
        { status: 400 }
      );
    }

    // 3. Get lookup status via SignalHireService
    // AC #4 - Validates tenant_id for security
    const signalHireService = new SignalHireService(tenantId);
    const status = await signalHireService.getLookupStatus(lookupId);

    // 4. Return status response
    return NextResponse.json<APISuccessResponse<SignalHireLookupStatus>>({
      data: status,
    });
  } catch (error) {
    console.error("[SignalHire Lookup Status API Route] Error:", error);

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
          message: "Erro interno ao verificar status do lookup",
        },
      },
      { status: 500 }
    );
  }
}
