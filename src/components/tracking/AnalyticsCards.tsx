/**
 * AnalyticsCards Component
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #1 — Grid de cards de metricas: Total Enviados, Aberturas, Cliques, Respostas, Bounces
 * Cada card mostra valor absoluto e taxa percentual, tema B&W
 */

"use client";

import {
  Send,
  MailOpen,
  MousePointerClick,
  Reply,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CampaignAnalytics } from "@/types/tracking";

interface AnalyticsCardsProps {
  analytics: CampaignAnalytics;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const METRIC_CARDS = [
  {
    label: "Total Enviados",
    valueKey: "totalSent" as const,
    icon: Send,
    testId: "metric-total-sent",
  },
  {
    label: "Aberturas",
    valueKey: "totalOpens" as const,
    rateKey: "openRate" as const,
    icon: MailOpen,
    testId: "metric-opens",
  },
  {
    label: "Cliques",
    valueKey: "totalClicks" as const,
    rateKey: "clickRate" as const,
    icon: MousePointerClick,
    testId: "metric-clicks",
  },
  {
    label: "Respostas",
    valueKey: "totalReplies" as const,
    rateKey: "replyRate" as const,
    icon: Reply,
    testId: "metric-replies",
  },
  {
    label: "Bounces",
    valueKey: "totalBounces" as const,
    rateKey: "bounceRate" as const,
    icon: AlertTriangle,
    testId: "metric-bounces",
  },
];

export function AnalyticsCards({ analytics }: AnalyticsCardsProps) {
  return (
    <div
      data-testid="analytics-cards"
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
    >
      {METRIC_CARDS.map((card) => {
        const Icon = card.icon;
        const value = analytics[card.valueKey];
        const rate = card.rateKey ? analytics[card.rateKey] : undefined;

        return (
          <Card
            key={card.testId}
            data-testid={card.testId}
            className="py-4"
          >
            <CardContent className="flex flex-col gap-2 px-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{card.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{value}</span>
                {rate !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    {formatRate(rate)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
