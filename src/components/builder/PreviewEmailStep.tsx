/**
 * PreviewEmailStep Component
 * Story 5.8: Campaign Preview
 * Story 6.5.7: Premium Icebreaker Integration
 * Story 7.1: Generic variable placeholder rendering
 *
 * AC 5.8 #2: Visualizar sequencia de emails
 * AC 6.5.7 #3: Premium icebreaker indicator in preview
 * AC 6.5.7 #6: Icebreaker source display with LinkedIn posts
 * AC 7.1 #3: Variables resolved with lead data for preview
 * AC 7.1 #4: resolveEmailVariables used for resolution
 *
 * Exibe um email no preview com numero do step, subject e body.
 * Shows premium icebreaker badge when applicable.
 * Story 7.1: Renders ALL personalization variables as styled placeholders or resolved text.
 */

"use client";

import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { PremiumIcebreakerBadge } from "./PremiumIcebreakerBadge";
import type { LinkedInPostSummary } from "@/types/email-block";
import { getVariables } from "@/lib/export/variable-registry";
import { resolveEmailVariables } from "@/lib/export/resolve-variables";

interface PreviewEmailStepProps {
  stepNumber: number;
  subject: string;
  body: string;
  isHighlighted?: boolean;
  /** Story 6.5.7: Whether premium icebreaker was used */
  hasPremiumIcebreaker?: boolean;
  /** Story 6.5.7: LinkedIn posts that inspired the icebreaker */
  icebreakerPosts?: LinkedInPostSummary[] | null;
  /** Story 7.1: Optional lead data for variable resolution */
  previewLead?: Record<string, unknown> | null;
}

/**
 * Render text with personalization variable placeholders
 * Story 7.1: Generic rendering for ALL variables from registry
 *
 * - Variables matching registry → styled placeholder with placeholderLabel
 * - Unknown {{variables}} → rendered as-is
 */
function renderTextWithVariablePlaceholders(text: string): ReactNode[] {
  const variables = getVariables();
  const variableMap = new Map(variables.map((v) => [v.name, v]));
  const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = VARIABLE_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const varName = match[1];
    const variable = variableMap.get(varName);

    if (variable) {
      parts.push(
        <span
          key={match.index}
          className="italic text-muted-foreground/70"
          data-testid={`variable-placeholder-${varName}`}
        >
          [{variable.placeholderLabel}]
        </span>
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * Preview Email Step - Card com visualizacao do email
 * Story 6.5.7: Shows premium icebreaker badge when applicable
 * Story 7.1: Renders variables as placeholders or resolved with lead data
 */
export function PreviewEmailStep({
  stepNumber,
  subject,
  body,
  isHighlighted = false,
  hasPremiumIcebreaker = false,
  icebreakerPosts = null,
  previewLead = null,
}: PreviewEmailStepProps) {
  const hasContent = subject || body;

  // Story 7.1: Resolve variables if previewLead is provided
  let displaySubject = subject;
  let displayBody = body;

  if (previewLead && hasContent) {
    const resolved = resolveEmailVariables(
      { subject, body },
      previewLead
    );
    displaySubject = resolved.subject;
    displayBody = resolved.body;
  }

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
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Email {stepNumber}
          </span>
          {/* Story 6.5.7 AC #3: Premium icebreaker badge */}
          {hasPremiumIcebreaker && hasContent && (
            <PremiumIcebreakerBadge posts={icebreakerPosts} />
          )}
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
              {displaySubject ? (
                renderTextWithVariablePlaceholders(displaySubject)
              ) : (
                <span className="text-muted-foreground italic">Sem assunto</span>
              )}
            </p>
          </div>

          {/* Body - Story 7.1: Generic variable placeholder rendering */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Corpo
            </span>
            <div data-testid="preview-email-body" className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
              {displayBody ? (
                renderTextWithVariablePlaceholders(displayBody)
              ) : <span className="italic">Sem conteudo</span>}
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
