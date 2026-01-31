/**
 * Lead Status Badge Component
 * Story: 3.5 - Lead Table Display
 *
 * AC: #1 - Status column with appropriate styling
 */

"use client";

import { Badge } from "@/components/ui/badge";
import {
  LeadStatus,
  leadStatusLabels,
  leadStatusVariants,
} from "@/types/lead";
import { cn } from "@/lib/utils";

interface LeadStatusBadgeProps {
  status: LeadStatus;
  className?: string;
}

/**
 * Renders a styled badge for lead status
 * Uses existing status configuration from lead.ts
 * Custom colors for "interessado" (green) and "oportunidade" (primary)
 */
export function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  const label = leadStatusLabels[status];
  const variant = leadStatusVariants[status];

  return (
    <Badge
      variant={variant}
      className={cn(
        status === "interessado" &&
          "bg-green-500/20 text-green-600 hover:bg-green-500/30 dark:text-green-400 border-green-500/30",
        status === "oportunidade" &&
          "bg-primary/20 text-primary hover:bg-primary/30 border-primary/30",
        className
      )}
    >
      {label}
    </Badge>
  );
}
