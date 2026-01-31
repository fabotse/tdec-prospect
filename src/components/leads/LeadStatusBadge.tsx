/**
 * Lead Status Badge Component
 * Story 4.2: Lead Status Management
 *
 * AC: #1 - View status badge
 * AC: #5 - Status colors
 *
 * Displays a colored badge for lead status.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { getStatusConfig, type LeadStatus, type LeadStatusVariant } from "@/types/lead";
import { cn } from "@/lib/utils";

interface LeadStatusBadgeProps {
  status: LeadStatus | undefined | null;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

/**
 * Color variant classes following AC #5
 * - Novo: default/neutral (gray)
 * - Em Campanha: blue/primary
 * - Interessado: green/success
 * - Oportunidade: yellow/warning
 * - Não Interessado: red/destructive
 */
const variantColorClasses: Record<LeadStatusVariant, string> = {
  default: "bg-muted text-muted-foreground hover:bg-muted/80",
  secondary: "bg-primary/20 text-primary hover:bg-primary/30",
  success: "bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30",
  warning: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/30",
  destructive: "bg-destructive/20 text-destructive hover:bg-destructive/30",
};

/**
 * LeadStatusBadge - Displays lead status as a colored badge
 * AC: #1 - Badge with correct colors for each status
 * AC: #5 - Color mappings per status type
 */
export function LeadStatusBadge({
  status,
  className,
  onClick,
  interactive = false,
}: LeadStatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        variantColorClasses[config.variant],
        interactive && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {config.label}
    </Badge>
  );
}
