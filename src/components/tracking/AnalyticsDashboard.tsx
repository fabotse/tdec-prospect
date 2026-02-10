/**
 * AnalyticsDashboard Component
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #1 — Dashboard principal com cards + sync indicator
 * AC: #2 — Skeleton loading state
 * AC: #3, #4 — SyncIndicator com botao e feedback
 */

"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsCards } from "@/components/tracking/AnalyticsCards";
import { SyncIndicator } from "@/components/tracking/SyncIndicator";
import type { CampaignAnalytics } from "@/types/tracking";

interface AnalyticsDashboardProps {
  analytics: CampaignAnalytics;
  isLoading: boolean;
  lastSyncAt: string | null;
  onSync: () => void;
  isSyncing: boolean;
  campaignName: string;
}

function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton" className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function AnalyticsDashboard({
  analytics,
  isLoading,
  lastSyncAt,
  onSync,
  isSyncing,
  campaignName,
}: AnalyticsDashboardProps) {
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div data-testid="analytics-dashboard" className="flex flex-col gap-6">
      {/* Header: titulo + sync */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics: {campaignName}</h1>
        <SyncIndicator
          lastSyncAt={lastSyncAt}
          onSync={onSync}
          isSyncing={isSyncing}
        />
      </div>

      {/* Metric cards */}
      <AnalyticsCards analytics={analytics} />
    </div>
  );
}
