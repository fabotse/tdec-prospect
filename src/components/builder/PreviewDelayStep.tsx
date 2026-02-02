/**
 * PreviewDelayStep Component
 * Story 5.8: Campaign Preview
 *
 * AC #3: Visualizar delays como timeline
 *
 * Exibe um delay como indicador de timeline entre emails.
 */

"use client";

import { Clock } from "lucide-react";
import { formatDelayDisplay, DelayUnit } from "@/types/delay-block";

interface PreviewDelayStepProps {
  delayValue: number;
  delayUnit: DelayUnit;
}

/**
 * Preview Delay Step - Timeline connector com badge de delay
 */
export function PreviewDelayStep({
  delayValue,
  delayUnit,
}: PreviewDelayStepProps) {
  const displayText = formatDelayDisplay(delayValue, delayUnit);

  return (
    <div
      className="flex items-center gap-3 py-2 px-4"
      role="separator"
      aria-label={`Aguardar ${displayText}`}
    >
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/10 border border-amber-500/20">
          <Clock className="h-3 w-3 text-amber-500" />
        </div>
        <div className="w-px h-4 bg-border" />
      </div>

      {/* Delay label */}
      <span className="text-sm text-muted-foreground">
        Aguardar {displayText}
      </span>
    </div>
  );
}
