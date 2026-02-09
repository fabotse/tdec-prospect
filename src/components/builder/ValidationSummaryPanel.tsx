"use client";

/**
 * ValidationSummaryPanel
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1, #2 - Visual validation summary in ExportDialog
 *
 * Shows validation status with colored border:
 * - Green: all ok
 * - Yellow: warnings only (can continue)
 * - Red: blocking errors (export disabled)
 */

import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  AdvancedValidationResult,
  ValidationIssue,
} from "@/lib/export/validate-export-advanced";

interface ValidationSummaryPanelProps {
  validation: AdvancedValidationResult;
  onDismissWarnings?: () => void;
}

function IssueItem({ issue, isError }: { issue: ValidationIssue; isError: boolean }) {
  return (
    <div className="flex items-start gap-2 text-sm" data-testid="validation-issue">
      {isError ? (
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500 mt-0.5" />
      )}
      <div className="flex flex-col gap-0.5">
        <span>
          {issue.message}
          {issue.count ? ` (${issue.count})` : ""}
        </span>
        {issue.suggestedAction && (
          <span className="text-xs text-muted-foreground">
            {issue.suggestedAction}
          </span>
        )}
      </div>
    </div>
  );
}

export function ValidationSummaryPanel({
  validation,
  onDismissWarnings,
}: ValidationSummaryPanelProps) {
  const { valid, errors, warnings } = validation;
  const hasWarnings = warnings.length > 0;

  // All ok — green
  if (valid && !hasWarnings) {
    return (
      <Alert
        className="border-green-500/50 bg-green-500/5"
        data-testid="validation-panel-success"
      >
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <AlertTitle>Tudo pronto para exportar</AlertTitle>
      </Alert>
    );
  }

  // Warnings only — yellow
  if (valid && hasWarnings) {
    return (
      <Alert
        className="border-yellow-500/50 bg-yellow-500/5"
        data-testid="validation-panel-warning"
      >
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        <AlertTitle>Avisos encontrados</AlertTitle>
        <AlertDescription>
          <ScrollArea className="max-h-[200px]">
            <div className="flex flex-col gap-2 mt-2">
              {warnings.map((w, i) => (
                <IssueItem key={i} issue={w} isError={false} />
              ))}
            </div>
          </ScrollArea>
          {onDismissWarnings && (
            <button
              onClick={onDismissWarnings}
              className="mt-2 text-xs underline text-muted-foreground hover:text-foreground"
              data-testid="dismiss-warnings"
            >
              Continuar mesmo assim
            </button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Errors (possibly with warnings) — red
  return (
    <Alert
      variant="destructive"
      data-testid="validation-panel-error"
    >
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Problemas encontrados</AlertTitle>
      <AlertDescription>
        <ScrollArea className="max-h-[200px]">
          <div className="flex flex-col gap-2 mt-2">
            {errors.map((e, i) => (
              <IssueItem key={`e-${i}`} issue={e} isError={true} />
            ))}
            {hasWarnings &&
              warnings.map((w, i) => (
                <IssueItem key={`w-${i}`} issue={w} isError={false} />
              ))}
          </div>
        </ScrollArea>
      </AlertDescription>
    </Alert>
  );
}
