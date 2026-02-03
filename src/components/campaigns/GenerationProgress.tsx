/**
 * GenerationProgress Component
 * Story 6.12.1: AI Full Campaign Generation
 *
 * AC #4 - Generation Progress UI
 * Shows progress during full campaign generation with stepper UI
 */

"use client";

import { Check, Loader2, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ==============================================
// TYPES
// ==============================================

export interface CompletedEmail {
  id: string;
  subject: string;
  context?: string;
}

export interface GenerationProgressProps {
  /** Current step being generated (1-indexed) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Strategic context for current email being generated */
  currentEmailContext?: string;
  /** List of completed emails with their subjects */
  completedEmails: CompletedEmail[];
  /** Email contexts from structure (for showing pending items) */
  emailContexts?: string[];
  /** Callback when user cancels generation */
  onCancel: () => void;
  /** Whether there was an error */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Callback to retry from current position */
  onRetry?: () => void;
}

// ==============================================
// COMPONENT
// ==============================================

/**
 * GenerationProgress component
 * Shows a vertical stepper with generation progress
 * AC #4 - Shows current email, progress bar, checkmarks for completed
 */
export function GenerationProgress({
  currentStep,
  totalSteps,
  currentEmailContext,
  completedEmails,
  emailContexts = [],
  onCancel,
  hasError = false,
  errorMessage,
  onRetry,
}: GenerationProgressProps) {
  const progressPercent = Math.round((completedEmails.length / totalSteps) * 100);

  return (
    <div className="flex flex-col gap-6 py-6" data-testid="generation-progress">
      {/* Header with progress bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium" data-testid="generation-status">
            {hasError
              ? `Geracao pausada. ${completedEmails.length} de ${totalSteps} emails gerados.`
              : `Gerando email ${currentStep} de ${totalSteps}...`}
          </span>
          <span className="text-muted-foreground" data-testid="generation-percent">
            {progressPercent}%
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Current context display */}
      {!hasError && currentEmailContext && (
        <div
          className="flex items-center gap-2 rounded-md bg-primary/10 px-4 py-3 text-sm"
          data-testid="current-email-context"
        >
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>{currentEmailContext}</span>
        </div>
      )}

      {/* Error display */}
      {hasError && errorMessage && (
        <div
          className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="generation-error"
        >
          <X className="h-4 w-4 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
        </div>
      )}

      {/* Step list */}
      <div className="space-y-2" data-testid="generation-steps">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNum = index + 1;
          const isCompleted = index < completedEmails.length;
          const isCurrent = stepNum === currentStep && !hasError;
          const isPending = index >= completedEmails.length && !isCurrent;
          const completed = completedEmails[index];
          const context = emailContexts[index] || `Email ${stepNum}`;

          return (
            <div
              key={index}
              className={cn(
                "flex items-center gap-3 rounded-md border px-4 py-3",
                isCompleted && "border-green-500/30 bg-green-500/5",
                isCurrent && "border-primary/30 bg-primary/5",
                isPending && "border-muted bg-muted/30 opacity-60",
                hasError && isCurrent && "border-destructive/30 bg-destructive/5"
              )}
              data-testid={`generation-step-${stepNum}`}
            >
              {/* Step indicator */}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  isCompleted && "bg-green-500 text-white",
                  isCurrent && !hasError && "bg-primary text-primary-foreground",
                  isCurrent && hasError && "bg-destructive text-destructive-foreground",
                  isPending && "bg-muted-foreground/20 text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" data-testid={`step-${stepNum}-check`} />
                ) : isCurrent && !hasError ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent && hasError ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isPending && "text-muted-foreground"
                  )}
                >
                  Email {stepNum}: {context}
                </p>
                {isCompleted && completed && (
                  <p
                    className="text-xs text-muted-foreground truncate"
                    title={completed.subject}
                  >
                    {completed.subject || "Assunto gerado"}
                  </p>
                )}
                {isCurrent && !hasError && (
                  <p className="text-xs text-muted-foreground animate-pulse">
                    Gerando assunto e conteudo...
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        {hasError && onRetry && (
          <Button
            onClick={onRetry}
            className="flex-1"
            data-testid="retry-button"
          >
            Tentar novamente
          </Button>
        )}
        <Button
          variant={hasError ? "outline" : "destructive"}
          onClick={onCancel}
          className={hasError ? "flex-1" : "w-full"}
          data-testid="cancel-button"
        >
          {hasError ? "Continuar manualmente" : "Cancelar"}
        </Button>
      </div>

      {/* Info text */}
      {!hasError && (
        <p className="text-xs text-muted-foreground text-center">
          Os emails ja gerados serao salvos se voce cancelar
        </p>
      )}
    </div>
  );
}
