/**
 * Campaign Analytics Page
 * Story 10.4: Campaign Analytics Dashboard UI
 * Story 10.6: Janela de Oportunidade — Engine + Config
 * Story 10.7: Janela de Oportunidade — UI + Notificacoes
 *
 * AC: #1 — Dashboard de metricas da campanha exportada
 * AC: #2 — Skeleton loading state
 * AC: #4 — Sync manual com toast feedback
 * AC: #5 — Estado vazio quando campanha nao exportada
 * AC 10.6 #4, #5 — ThresholdConfig integrado
 * AC 10.7 #1-#6 — OpportunityPanel, badge header, toast, layout reordenado
 */

"use client";

import { use, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Flame } from "lucide-react";
import { toast } from "sonner";
import { useCampaign } from "@/hooks/use-campaigns";
import { useCampaignAnalytics, useSyncAnalytics } from "@/hooks/use-campaign-analytics";
import { useLeadTracking } from "@/hooks/use-lead-tracking";
import { useOpportunityConfig, useSaveOpportunityConfig, useOpportunityLeads } from "@/hooks/use-opportunity-window";
import { DEFAULT_MIN_OPENS } from "@/lib/services/opportunity-engine";
import { AnalyticsDashboard } from "@/components/tracking/AnalyticsDashboard";
import { LeadTrackingTable } from "@/components/tracking/LeadTrackingTable";
import { ThresholdConfig } from "@/components/tracking/ThresholdConfig";
import { OpportunityPanel } from "@/components/tracking/OpportunityPanel";
import { Badge } from "@/components/ui/badge";
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
  const { data: leads, isLoading: isLoadingLeads, isError: isLeadTrackingError } = useLeadTracking(campaignId, { enabled: hasExternalId });
  const { mutate: syncAnalytics, isPending: isSyncing } = useSyncAnalytics(campaignId);
  const { data: opportunityConfig } = useOpportunityConfig(campaignId, { enabled: hasExternalId });
  const { mutate: saveConfig, isPending: isSavingConfig } = useSaveOpportunityConfig(campaignId);

  const opportunityLeads = useOpportunityLeads(leads, opportunityConfig);
  const opportunityPanelRef = useRef<HTMLDivElement>(null);

  const scrollToOpportunity = () => {
    opportunityPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Toast de notificacao para novos leads qualificados (AC 10.7 #3)
  useEffect(() => {
    if (!opportunityLeads || opportunityLeads.length === 0) return;

    const storageKey = `opportunity-seen-${campaignId}`;
    const lastSeen = localStorage.getItem(storageKey);

    if (lastSeen === null) {
      // Primeiro acesso — apenas salvar contagem, sem toast
      localStorage.setItem(storageKey, String(opportunityLeads.length));
      return;
    }

    const previousCount = parseInt(lastSeen, 10);
    const currentCount = opportunityLeads.length;

    if (currentCount > previousCount) {
      const newLeads = currentCount - previousCount;
      toast.info(
        `${newLeads} novo(s) lead(s) na Janela de Oportunidade`,
        { duration: 5000 }
      );
    }

    localStorage.setItem(storageKey, String(currentCount));
  }, [opportunityLeads, campaignId]);

  const handleSaveConfig = (config: { minOpens: number; periodDays: number }) => {
    saveConfig(config, {
      onSuccess: () => {
        toast.success("Configuracao salva");
      },
      onError: (error) => {
        toast.error(error.message || "Erro ao salvar configuracao");
      },
    });
  };

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

      {/* Badge de leads quentes (AC 10.7 #3) */}
      {!isLoadingCampaign && hasExternalId && opportunityLeads.length > 0 && (
        <div className="flex items-center gap-2" data-testid="hot-leads-badge">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <Flame className="h-3 w-3 mr-1" />
            {opportunityLeads.length} lead{opportunityLeads.length > 1 ? "s" : ""} quente{opportunityLeads.length > 1 ? "s" : ""}
          </Badge>
        </div>
      )}

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

      {/* Dashboard + Opportunity + Lead Tracking: campanha exportada */}
      {/* Layout order (AC 10.7 #6): AnalyticsDashboard → ThresholdConfig → OpportunityPanel → LeadTrackingTable */}
      {!isLoadingCampaign && hasExternalId && (
        <>
          <AnalyticsDashboard
            analytics={analytics ?? EMPTY_ANALYTICS}
            isLoading={isLoadingAnalytics}
            lastSyncAt={analytics?.lastSyncAt ?? null}
            onSync={handleSync}
            isSyncing={isSyncing}
            campaignName={campaign?.name ?? ""}
          />
          <ThresholdConfig
            config={opportunityConfig ?? null}
            leads={leads ?? []}
            onSave={handleSaveConfig}
            isSaving={isSavingConfig}
          />
          <OpportunityPanel
            ref={opportunityPanelRef}
            leads={opportunityLeads}
            isLoading={isLoadingLeads}
          />
          <LeadTrackingTable
            leads={leads ?? []}
            isLoading={isLoadingLeads}
            isError={isLeadTrackingError}
            highInterestThreshold={opportunityConfig?.minOpens ?? DEFAULT_MIN_OPENS}
            onHighInterestClick={scrollToOpportunity}
          />
        </>
      )}
    </div>
  );
}
