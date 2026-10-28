/**
 * Story 24.12: aviso discreto "E-mail não verificado".
 *
 * Só aparece quando o status gravado é `invalid` ou `unknown` (`null` = nunca consultado,
 * sem aviso). É só informativo: não bloqueia, não filtra e não pede confirmação.
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  UNVERIFIED_EMAIL_HINT,
  UNVERIFIED_EMAIL_LABEL,
  isUnverifiedEmailStatus,
} from "@/lib/leads/email-status";

interface EmailUnverifiedWarningProps {
  status: unknown;
  /** `true` (padrão) mostra o texto ao lado do ícone; `false` deixa só o ícone (texto para leitor de tela). */
  showLabel?: boolean;
  className?: string;
}

export function EmailUnverifiedWarning({
  status,
  showLabel = true,
  className,
}: EmailUnverifiedWarningProps) {
  if (!isUnverifiedEmailStatus(status)) return null;

  return (
    <span
      data-testid="email-unverified"
      title={UNVERIFIED_EMAIL_HINT}
      className={cn(
        "inline-flex items-center gap-1 text-xs text-warning",
        className
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {showLabel ? (
        <span>{UNVERIFIED_EMAIL_LABEL}</span>
      ) : (
        <span className="sr-only">{UNVERIFIED_EMAIL_LABEL}</span>
      )}
    </span>
  );
}
