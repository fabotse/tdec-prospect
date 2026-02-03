/**
 * Campaign Card Component
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Display campaign info (name, status, lead count, date)
 * AC: #5 - Show lead count
 * AC: #6 - Status badge with colors
 *
 * Delete Campaign:
 * AC: #1 - Menu with "Remover" option opens delete dialog
 */

"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Calendar, MoreVertical, Trash2 } from "lucide-react";
import {
  type CampaignWithCount,
  getCampaignStatusConfig,
  type CampaignStatusVariant,
} from "@/types/campaign";
import { cn } from "@/lib/utils";

interface CampaignCardProps {
  campaign: CampaignWithCount;
  onClick?: () => void;
  onDelete?: (campaign: CampaignWithCount) => void;
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

export function CampaignCard({ campaign, onClick, onDelete }: CampaignCardProps) {
  const statusConfig = getCampaignStatusConfig(campaign.status);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(campaign);
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
          <div className="flex items-center gap-1 shrink-0">
            <Badge
              variant="outline"
              className={getStatusClasses(statusConfig.variant)}
            >
              {statusConfig.label}
            </Badge>
            {onDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                    data-testid="campaign-menu-trigger"
                  >
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Opções da campanha</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleDeleteClick}
                    className="text-destructive focus:text-destructive"
                    data-testid="campaign-delete-option"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
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
