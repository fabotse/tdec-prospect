/**
 * Usage Statistics API Route
 * Story: 6.5.8 - Apify Cost Tracking
 *
 * GET /api/usage/statistics
 * Returns tenant-scoped usage statistics for external API calls.
 *
 * AC #2: API Endpoint for Usage Statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { getUsageStatistics } from "@/lib/services/usage-logger";
import type { UsageServiceName, UsageStatisticsResponse } from "@/types/api-usage";

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Nao autenticado",
  FORBIDDEN: "Acesso negado. Somente administradores podem acessar estatisticas de uso.",
  TENANT_NOT_FOUND: "Tenant nao encontrado",
  INVALID_DATE: "Data invalida",
  INVALID_SERVICE: "Servico invalido",
  INTERNAL_ERROR: "Erro interno ao buscar estatisticas",
} as const;

// ==============================================
// HELPER: Parse Date Parameters
// ==============================================

function getMonthRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { startDate, endDate };
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// ==============================================
// HELPER: Validate Service Name
// ==============================================

const VALID_SERVICES: UsageServiceName[] = [
  "apify",
  "apollo",
  "signalhire",
  "snovio",
  "instantly",
];

function isValidUsageServiceName(name: string): name is UsageServiceName {
  return VALID_SERVICES.includes(name as UsageServiceName);
}

// ==============================================
// GET /api/usage/statistics
// ==============================================

export async function GET(request: NextRequest) {
  // Authentication check
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: ERROR_MESSAGES.UNAUTHORIZED } },
      { status: 401 }
    );
  }

  // AC #2: Admin-only access
  if (profile.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: ERROR_MESSAGES.FORBIDDEN } },
      { status: 403 }
    );
  }

  const tenantId = profile.tenant_id;
  if (!tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: ERROR_MESSAGES.TENANT_NOT_FOUND } },
      { status: 403 }
    );
  }

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");
  const serviceNameParam = searchParams.get("serviceName");

  // Get date range (default to current month)
  let startDate: Date;
  let endDate: Date;

  if (startDateParam && endDateParam) {
    const parsedStart = parseDate(startDateParam);
    const parsedEnd = parseDate(endDateParam);

    if (!parsedStart || !parsedEnd) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGES.INVALID_DATE } },
        { status: 400 }
      );
    }

    startDate = parsedStart;
    endDate = parsedEnd;
  } else {
    const monthRange = getMonthRange();
    startDate = monthRange.startDate;
    endDate = monthRange.endDate;
  }

  // Validate service name if provided
  let serviceName: UsageServiceName | undefined;
  if (serviceNameParam) {
    if (!isValidUsageServiceName(serviceNameParam)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: ERROR_MESSAGES.INVALID_SERVICE } },
        { status: 400 }
      );
    }
    serviceName = serviceNameParam;
  }

  // Fetch statistics with error handling
  try {
    const statistics = await getUsageStatistics({
      tenantId,
      startDate,
      endDate,
      serviceName,
    });

    const response: UsageStatisticsResponse = {
      statistics,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/usage/statistics] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGES.INTERNAL_ERROR } },
      { status: 500 }
    );
  }
}
