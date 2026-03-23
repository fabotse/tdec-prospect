"use client";

import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { CampaignAnalytics } from "@/types/tracking";

const STATUS_MAP: Record<
  number,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  0: { label: "Rascunho", variant: "secondary" },
  1: { label: "Ativa", variant: "default" },
  2: { label: "Pausada", variant: "outline" },
  3: { label: "Completa", variant: "secondary" },
};

interface CampaignProgressProps {
  analytics: CampaignAnalytics;
}

export function CampaignProgress({ analytics }: CampaignProgressProps) {
  const { leadsCount, contactedCount, campaignStatus } = analytics;

  const hasLeads = leadsCount !== undefined && leadsCount > 0;
  const percentage = hasLeads
    ? Math.min(Math.round(((contactedCount ?? 0) / leadsCount) * 100), 100)
    : 0;
  const statusInfo =
    campaignStatus !== undefined ? STATUS_MAP[campaignStatus] : undefined;
  const emptyMessage =
    campaignStatus !== undefined
      ? "Nenhum lead na campanha"
      : "Aguardando dados...";

  if (!hasLeads) {
    return (
      <div
        data-testid="campaign-progress"
        className="flex flex-wrap items-center gap-4 rounded-lg border p-4"
      >
        <p
          data-testid="campaign-progress-empty"
          className="text-sm text-muted-foreground"
        >
          {emptyMessage}
        </p>
        {statusInfo && (
          <Badge
            data-testid="campaign-status-badge"
            variant={statusInfo.variant}
          >
            {statusInfo.label}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="campaign-progress"
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          data-testid="campaign-progress-label"
          className="text-sm text-muted-foreground"
        >
          {contactedCount ?? 0} de {leadsCount} leads contatados — {percentage}%
        </p>
        {statusInfo && (
          <Badge
            data-testid="campaign-status-badge"
            variant={statusInfo.variant}
          >
            {statusInfo.label}
          </Badge>
        )}
      </div>
      <Progress
        data-testid="campaign-progress-bar"
        value={percentage}
        className="h-2"
        aria-label="Progresso de leads contatados"
      />
    </div>
  );
}
