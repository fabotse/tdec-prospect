/**
 * CampaignSummary Component
 * Story 6.12: AI Campaign Structure Generation
 *
 * AC #4 - Summary panel showing email count and total duration
 *
 * Displays a concise summary of the campaign structure:
 * - Number of emails in the sequence
 * - Total duration in days (sum of all delay blocks)
 */

"use client";

import { useMemo } from "react";
import { Mail, Clock } from "lucide-react";
import { useBuilderStore } from "@/stores/use-builder-store";

/**
 * Campaign summary statistics
 */
interface CampaignStats {
  emailCount: number;
  totalDays: number;
}

/**
 * Calculate campaign statistics from builder blocks
 */
function calculateStats(
  blocks: ReturnType<typeof useBuilderStore.getState>["blocks"]
): CampaignStats {
  let emailCount = 0;
  let totalDays = 0;

  for (const block of blocks) {
    if (block.type === "email") {
      emailCount++;
    } else if (block.type === "delay") {
      const data = block.data as { delayValue?: number; delayUnit?: string };
      const delayValue = data.delayValue || 0;
      const delayUnit = data.delayUnit || "days";
      // Convert hours to days if needed
      if (delayUnit === "days") {
        totalDays += delayValue;
      } else if (delayUnit === "hours") {
        totalDays += Math.ceil(delayValue / 24);
      }
    }
  }

  return { emailCount, totalDays };
}

/**
 * CampaignSummary component
 * Shows email count and total duration when blocks exist
 */
export function CampaignSummary() {
  const blocks = useBuilderStore((state) => state.blocks);

  const stats = useMemo(() => calculateStats(blocks), [blocks]);

  // Don't show summary when there are no blocks
  if (blocks.length === 0) {
    return null;
  }

  // Don't show summary when there are no emails
  if (stats.emailCount === 0) {
    return null;
  }

  return (
    <div
      data-testid="campaign-summary"
      className="flex items-center gap-4 text-sm text-muted-foreground"
    >
      {/* Email count */}
      <div className="flex items-center gap-1.5" data-testid="email-count-summary">
        <Mail className="h-4 w-4" />
        <span>
          {stats.emailCount} email{stats.emailCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Total duration */}
      {stats.totalDays > 0 && (
        <>
          <span className="text-border">•</span>
          <div className="flex items-center gap-1.5" data-testid="duration-summary">
            <Clock className="h-4 w-4" />
            <span>
              {stats.totalDays} dia{stats.totalDays !== 1 ? "s" : ""} de duracao
            </span>
          </div>
        </>
      )}
    </div>
  );
}
