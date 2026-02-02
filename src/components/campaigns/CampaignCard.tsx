/**
 * Campaign Card Component
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Display campaign info (name, status, lead count, date)
 * AC: #5 - Show lead count
 * AC: #6 - Status badge with colors
 */

"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import {
  type CampaignWithCount,
  getCampaignStatusConfig,
  type CampaignStatusVariant,
} from "@/types/campaign";
import { cn } from "@/lib/utils";

interface CampaignCardProps {
  campaign: CampaignWithCount;
  onClick?: () => void;
}

/**
 * Map status variant to Tailwind classes
 * AC: #6 - Status colors: draft=gray, active=green, paused=yellow, completed=neutral
 */
function getStatusClasses(variant: CampaignStatusVariant): string {
  switch (variant) {
    case "success":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "warning":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "secondary":
      return "bg-secondary text-secondary-foreground";
    case "default":
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  const statusConfig = getCampaignStatusConfig(campaign.status);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/50",
        onClick && "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-foreground line-clamp-2">
            {campaign.name}
          </h3>
          <Badge
            variant="outline"
            className={cn("shrink-0", getStatusClasses(statusConfig.variant))}
          >
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>
              {campaign.leadCount} {campaign.leadCount === 1 ? "lead" : "leads"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>
              {new Date(campaign.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
