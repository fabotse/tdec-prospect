/**
 * Usage Statistics Card
 * Story 6.5.8: Apify Cost Tracking
 *
 * AC #3: Admin Settings Page - Usage Section
 *
 * Displays usage statistics for external API services.
 */

"use client";

import { Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { UsageStatistics } from "@/types/api-usage";

interface UsageCardProps {
  serviceName: string;
  serviceLabel: string;
  statistics: UsageStatistics | null;
  isLoading: boolean;
}

/**
 * Format timestamp for display
 */
function formatLastUsage(timestamp: string | null): string {
  if (!timestamp) return "Nunca";

  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Nunca";
  }
}

/**
 * Format currency for display
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Single statistic display
 */
function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | number;
  testId?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-caption text-foreground-muted">{label}</p>
      <p className="text-body font-medium" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/**
 * Loading skeleton for UsageCard
 */
function UsageCardSkeleton() {
  return (
    <Card className="bg-background-secondary border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-6 w-40" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <Skeleton className="h-4 w-48" />
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when no usage data
 */
function UsageCardEmpty({ serviceLabel }: { serviceLabel: string }) {
  return (
    <Card className="bg-background-secondary border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-foreground-muted" />
          <CardTitle className="text-h3">{serviceLabel}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-body-small text-foreground-muted">
          Nenhum uso registrado
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Usage statistics card component
 *
 * AC #3: Displays service usage with:
 * - Total calls this month
 * - Estimated cost
 * - Average posts per lead
 * - Last usage timestamp
 */
export function UsageCard({
  serviceName,
  serviceLabel,
  statistics,
  isLoading,
}: UsageCardProps) {
  if (isLoading) {
    return <UsageCardSkeleton />;
  }

  if (!statistics) {
    return <UsageCardEmpty serviceLabel={serviceLabel} />;
  }

  return (
    <Card
      className="bg-background-secondary border-border"
      data-testid={`usage-card-${serviceName}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" />
          <CardTitle className="text-h3">{serviceLabel}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Chamadas"
            value={statistics.totalCalls}
            testId={`usage-calls-${serviceName}`}
          />
          <Stat
            label="Custo Estimado"
            value={formatCost(statistics.totalCost)}
            testId={`usage-cost-${serviceName}`}
          />
          <Stat
            label="Posts Buscados"
            value={statistics.totalPosts}
            testId={`usage-posts-${serviceName}`}
          />
          <Stat
            label="Média/Lead"
            value={
              statistics.avgPostsPerLead > 0
                ? statistics.avgPostsPerLead.toFixed(1)
                : "-"
            }
            testId={`usage-avg-${serviceName}`}
          />
        </div>
        <p className="text-caption text-foreground-muted">
          Último uso: {formatLastUsage(statistics.lastUsage)}
        </p>
      </CardContent>
    </Card>
  );
}
