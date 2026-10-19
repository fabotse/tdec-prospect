/**
 * CopyReviewBadge — Story 24.9
 *
 * Badge com o status do revisor automatico de copy. Mostra os motivos (texto pequeno
 * abaixo) quando `showReasons` e verdadeiro e ha motivos. Usado no card de revisao do
 * agente e no bloco de e-mail do editor manual.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { COPY_REVIEW_STATUS_LABELS, type CopyReviewStatus } from "@/types/copy-review";

interface CopyReviewBadgeProps {
  status: CopyReviewStatus;
  reasons?: string[];
  /** Mostra a lista de motivos abaixo do badge. */
  showReasons?: boolean;
  className?: string;
}

const STATUS_CLASSES: Record<CopyReviewStatus, string> = {
  approved: "bg-success/10 text-success",
  rewritten: "bg-primary/10 text-primary",
  needs_human_review: "bg-warning/10 text-warning",
  not_reviewed: "",
};

export function CopyReviewBadge({
  status,
  reasons,
  showReasons = false,
  className,
}: CopyReviewBadgeProps) {
  const visibleReasons = showReasons && reasons && reasons.length > 0 ? reasons : null;
  return (
    <span className={cn("inline-flex flex-col gap-1", className)}>
      <Badge
        variant={status === "not_reviewed" ? "outline" : "secondary"}
        className={cn("text-xs cursor-default", STATUS_CLASSES[status])}
        data-testid="copy-review-badge"
        data-status={status}
        title={reasons && reasons.length > 0 ? reasons.join("\n") : undefined}
      >
        {COPY_REVIEW_STATUS_LABELS[status]}
      </Badge>
      {visibleReasons && (
        <ul
          className="text-xs text-muted-foreground list-disc pl-4"
          data-testid="copy-review-reasons"
        >
          {visibleReasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}
    </span>
  );
}
