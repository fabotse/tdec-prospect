/**
 * PreviewEmailStep Component
 * Story 5.8: Campaign Preview
 *
 * AC #2: Visualizar sequencia de emails
 *
 * Exibe um email no preview com numero do step, subject e body.
 */

"use client";

import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewEmailStepProps {
  stepNumber: number;
  subject: string;
  body: string;
  isHighlighted?: boolean;
}

/**
 * Preview Email Step - Card com visualizacao do email
 */
export function PreviewEmailStep({
  stepNumber,
  subject,
  body,
  isHighlighted = false,
}: PreviewEmailStepProps) {
  const hasContent = subject || body;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all duration-200",
        isHighlighted
          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
          : "border-border bg-card"
      )}
      role="article"
      aria-label={`Email ${stepNumber}: ${subject || "sem assunto"}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500/10">
          <Mail className="h-4 w-4 text-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Email {stepNumber}
          </span>
        </div>
      </div>

      {hasContent ? (
        <>
          {/* Subject */}
          <div className="mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Assunto
            </span>
            <p className="text-sm font-medium mt-1">
              {subject || (
                <span className="text-muted-foreground italic">Sem assunto</span>
              )}
            </p>
          </div>

          {/* Body */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Corpo
            </span>
            <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
              {body || <span className="italic">Sem conteudo</span>}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Email sem conteudo
        </p>
      )}
    </div>
  );
}
