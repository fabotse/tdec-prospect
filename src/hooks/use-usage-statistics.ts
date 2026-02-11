/**
 * Usage Statistics Hook
 * Story 6.5.8: Apify Cost Tracking
 *
 * AC #2: API Endpoint for Usage Statistics
 * AC #3: Admin Settings Page - Usage Section
 *
 * TanStack Query hook for fetching usage statistics.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  UsageServiceName,
  UsageStatistics,
  UsageStatisticsResponse,
} from "@/types/api-usage";

const USAGE_KEY = ["usage", "statistics"];

interface ApiError {
  code: string;
  message: string;
}

interface ApiErrorResponse {
  error?: ApiError;
}

interface UseUsageStatisticsParams {
  startDate?: Date;
  endDate?: Date;
  serviceName?: UsageServiceName;
}

/**
 * Fetch usage statistics from API
 */
async function fetchUsageStatistics(
  params: UseUsageStatisticsParams
): Promise<UsageStatisticsResponse> {
  const searchParams = new URLSearchParams();

  if (params.startDate) {
    searchParams.set("startDate", params.startDate.toISOString());
  }
  if (params.endDate) {
    searchParams.set("endDate", params.endDate.toISOString());
  }
  if (params.serviceName) {
    searchParams.set("serviceName", params.serviceName);
  }

  const url = `/api/usage/statistics${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;

  const response = await fetch(url);
  const result = await response.json();

  if (!response.ok) {
    const errorResponse = result as ApiErrorResponse;
    throw new Error(
      errorResponse.error?.message || "Erro ao buscar estatísticas de uso"
    );
  }

  return result as UsageStatisticsResponse;
}

/**
 * Hook to fetch usage statistics
 *
 * AC #3: Provides data for Admin Settings Page - Usage Section
 *
 * @param params - Optional filters (startDate, endDate, serviceName)
 * @returns Query result with usage statistics
 */
export function useUsageStatistics(params: UseUsageStatisticsParams = {}) {
  const queryKey = [
    ...USAGE_KEY,
    params.startDate?.toISOString(),
    params.endDate?.toISOString(),
    params.serviceName,
  ];

  return useQuery({
    queryKey,
    queryFn: () => fetchUsageStatistics(params),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false,
  });
}

/**
 * Helper to get current month date range
 */
export function getCurrentMonthRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { startDate, endDate };
}

/**
 * Helper to get last month date range
 */
export function getLastMonthRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate, endDate };
}

/**
 * Get statistics for a specific service from the response
 */
export function getServiceStatistics(
  response: UsageStatisticsResponse | undefined,
  serviceName: UsageServiceName
): UsageStatistics | null {
  if (!response) return null;
  return (
    response.statistics.find((s) => s.serviceName === serviceName) || null
  );
}
