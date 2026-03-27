/**
 * AgentStepProgress
 * Story 17.1 - AC: #2
 *
 * Displays pipeline step progress with visual status indicators.
 * Integrates with Supabase Realtime updates via AgentChat.
 */

"use client";

import { Loader2, CheckCircle2, XCircle, Circle, SkipForward, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_LABELS } from "@/types/agent";
import type { AgentStep, StepType } from "@/types/agent";

// ==============================================
// PROPS
// ==============================================

interface AgentStepProgressProps {
  steps: AgentStep[];
  currentStep: number;
}

// ==============================================
// COMPONENT
// ==============================================

export function AgentStepProgress({ steps, currentStep }: AgentStepProgressProps) {
  // Story 17.7 - AC #4: Active steps exclude skipped
  const activeSteps = steps.filter((s) => s.status !== "skipped");
  const activeTotal = activeSteps.length;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/50">
      {steps.map((step) => {
        const activeIndex = activeSteps.findIndex((s) => s.step_number === step.step_number) + 1;
        return (
          <StepRow
            key={step.id}
            step={step}
            currentStep={currentStep}
            activeIndex={activeIndex}
            activeTotal={activeTotal}
          />
        );
      })}
    </div>
  );
}

// ==============================================
// STEP ROW
// ==============================================

function StepRow({
  step,
  currentStep,
  activeIndex,
  activeTotal,
}: {
  step: AgentStep;
  currentStep: number;
  activeIndex: number;
  activeTotal: number;
}) {
  const label = STEP_LABELS[step.step_type as StepType] ?? step.step_type;
  const isActive = step.step_number === currentStep;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        step.status === "completed" && "text-green-600",
        step.status === "approved" && "text-green-600",
        step.status === "failed" && "text-red-600",
        step.status === "running" && "text-blue-600 font-medium",
        step.status === "pending" && "text-muted-foreground",
        step.status === "skipped" && "text-muted-foreground line-through opacity-60",
        step.status === "awaiting_approval" && "text-yellow-600 font-medium"
      )}
    >
      <StatusIcon status={step.status} />
      <span>
        {(step.status === "running" || step.status === "awaiting_approval") && isActive
          ? `Etapa ${activeIndex}/${activeTotal}: ${label}${step.status === "running" ? "..." : ""}`
          : label}
      </span>
      {step.status === "failed" && step.error_message && (
        <span className="text-xs text-red-500 ml-1">— {step.error_message}</span>
      )}
    </div>
  );
}

// ==============================================
// STATUS ICON
// ==============================================

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "completed":
    case "approved":
      return <CheckCircle2 className="h-4 w-4" />;
    case "failed":
      return <XCircle className="h-4 w-4" />;
    case "skipped":
      return <SkipForward className="h-4 w-4" />;
    case "awaiting_approval":
      return <Clock className="h-4 w-4" />;
    default:
      return <Circle className="h-4 w-4" />;
  }
}
