/**
 * Lead Import Indicator Component
 * Story 4.2.1: Lead Import Mechanism
 * Story 4.6: Interested Leads Highlighting
 *
 * AC: #3 - Visual indicator for saved vs unsaved leads
 * - Saved leads (has UUID id): Green checkmark
 * - Unsaved leads (Apollo only): Cloud icon
 * Story 4.6: AC #4 - Optional read-only status badge for imported leads
 */

"use client";

import { Check, Cloud } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type Lead, isLeadImported, leadStatusLabels } from "@/types/lead";
import { LeadStatusBadge } from "./LeadStatusBadge";

interface LeadImportIndicatorProps {
  lead: Lead;
  className?: string;
  /** Story 4.6: AC #4 - Show status badge for imported leads (default: false) */
  showStatus?: boolean;
}

/**
 * LeadImportIndicator - Shows if a lead is saved in DB or just from Apollo
 * Story 4.6: AC #4 - Optionally shows read-only status badge
 *
 * Usage:
 * ```tsx
 * <LeadImportIndicator lead={lead} />
 * <LeadImportIndicator lead={lead} showStatus /> // With status badge
 * ```
 */
export function LeadImportIndicator({
  lead,
  className,
  showStatus = false,
}: LeadImportIndicatorProps) {
  const imported = isLeadImported(lead);

  // Story 4.6: AC #4 - Determine if we should show status badge
  // Only show for non-default status ("novo" is default)
  const shouldShowStatusBadge =
    showStatus && imported && lead.status && lead.status !== "novo";

  // Story 4.6: AC #4 - Build tooltip message
  const getTooltipMessage = (): string => {
    if (!imported) {
      return "Lead do Apollo (não salvo)";
    }
    if (shouldShowStatusBadge) {
      return `Lead importado em Meus Leads com status ${leadStatusLabels[lead.status]}`;
    }
    return "Lead salvo no banco de dados";
  };

  if (imported) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn("flex items-center gap-1.5", className)}
              aria-label={getTooltipMessage()}
            >
              <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" aria-hidden="true" />
              {/* Story 4.6: AC #4 - Read-only status badge */}
              {shouldShowStatusBadge && (
                <LeadStatusBadge
                  status={lead.status}
                  className="text-xs px-1.5 py-0 h-5 cursor-default pointer-events-none"
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{getTooltipMessage()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn("flex items-center justify-center", className)}
            aria-label="Lead do Apollo (não salvo)"
          >
            <Cloud className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Lead do Apollo (não salvo)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
