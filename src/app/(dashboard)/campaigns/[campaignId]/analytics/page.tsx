/**
 * Campaign Analytics Page
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #1 — Dashboard de metricas da campanha exportada
 * AC: #2 — Skeleton loading state
 * AC: #4 — Sync manual com toast feedback
 * AC: #5 — Estado vazio quando campanha nao exportada
 */

"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useCampaign } from "@/hooks/use-campaigns";
import { useCampaignAnalytics, useSyncAnalytics } from "@/hooks/use-campaign-analytics";
import { AnalyticsDashboard } from "@/components/tracking/AnalyticsDashboard";
import type { CampaignAnalytics } from "@/types/tracking";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

const EMPTY_ANALYTICS: CampaignAnalytics = {
  campaignId: "",
  totalSent: 0,
  totalOpens: 0,
  totalClicks: 0,
  totalReplies: 0,
  totalBounces: 0,
  openRate: 0,
  clickRate: 0,
  replyRate: 0,
  bounceRate: 0,
  lastSyncAt: "",
};

function EmptyState() {
  return (
    <div data-testid="analytics-empty-state" className="flex flex-col items-center justify-center py-24 gap-4">
      <BarChart3 className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Esta campanha ainda nao foi exportada</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Para visualizar analytics, exporte a campanha para uma plataforma como Instantly primeiro.
      </p>
    </div>
  );
}

export default function CampaignAnalyticsPage({ params }: PageProps) {
  const { campaignId } = use(params);
  const { data: campaign, isLoading: isLoadingCampaign } = useCampaign(campaignId);
  const hasExternalId = !!campaign?.externalCampaignId;
  const { data: analytics, isLoading: isLoadingAnalytics } = useCampaignAnalytics(campaignId, { enabled: hasExternalId });
  const { mutate: syncAnalytics, isPending: isSyncing } = useSyncAnalytics(campaignId);

  const handleSync = () => {
    syncAnalytics(undefined, {
      onSuccess: () => {
        toast.success("Analytics sincronizado com sucesso");
      },
      onError: (error) => {
        toast.error(error.message || "Erro ao sincronizar analytics");
      },
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back navigation */}
      <Link
        href={`/campaigns/${campaignId}/edit`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        data-testid="back-to-campaign"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Voltar para campanha</span>
      </Link>

      {/* Campaign loading */}
      {isLoadingCampaign && (
        <AnalyticsDashboard
          analytics={EMPTY_ANALYTICS}
          isLoading={true}
          lastSyncAt={null}
          onSync={handleSync}
          isSyncing={false}
          campaignName=""
        />
      )}

      {/* Empty state: campanha nao exportada */}
      {!isLoadingCampaign && !hasExternalId && <EmptyState />}

      {/* Dashboard: campanha exportada */}
      {!isLoadingCampaign && hasExternalId && (
        <AnalyticsDashboard
          analytics={analytics ?? EMPTY_ANALYTICS}
          isLoading={isLoadingAnalytics}
          lastSyncAt={analytics?.lastSyncAt ?? null}
          onSync={handleSync}
          isSyncing={isSyncing}
          campaignName={campaign?.name ?? ""}
        />
      )}
    </div>
  );
}
