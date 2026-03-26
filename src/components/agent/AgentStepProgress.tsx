/**
 * AgentStepProgress
 * Story 17.1 - AC: #2
 *
 * Displays pipeline step progress with visual status indicators.
 * Integrates with Supabase Realtime updates via AgentChat.
 */

"use client";

import { Loader2, CheckCircle2, XCircle, Circle } from "lucide-react";
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
  const totalSteps = steps.length;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/50">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} currentStep={currentStep} totalSteps={totalSteps} />
      ))}
    </div>
  );
}

// ==============================================
// STEP ROW
// ==============================================

function StepRow({ step, currentStep, totalSteps }: { step: AgentStep; currentStep: number; totalSteps: number }) {
  const label = STEP_LABELS[step.step_type as StepType] ?? step.step_type;
  const isActive = step.step_number === currentStep;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        step.status === "completed" && "text-green-600",
        step.status === "failed" && "text-red-600",
        step.status === "running" && "text-blue-600 font-medium",
        step.status === "pending" && "text-muted-foreground"
      )}
    >
      <StatusIcon status={step.status} />
      <span>
        {step.status === "running" && isActive
          ? `Etapa ${step.step_number}/${totalSteps}: ${label}...`
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
      return <CheckCircle2 className="h-4 w-4" />;
    case "failed":
      return <XCircle className="h-4 w-4" />;
    default:
      return <Circle className="h-4 w-4" />;
  }
}
