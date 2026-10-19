/**
 * Copy Review Types — Story 24.9
 *
 * Tipos compartilhados (cliente e servidor) do revisor automatico de copy.
 */

/**
 * Status de revisao de um e-mail.
 * - approved: aprovado na 1a revisao (texto original)
 * - rewritten: aprovado depois de reescrever (texto reescrito)
 * - needs_human_review: reprovado depois de MAX_REWRITES reescritas
 * - not_reviewed: revisor indisponivel (sem chave, timeout, erro, JSON invalido)
 */
export type CopyReviewStatus =
  | "approved"
  | "rewritten"
  | "needs_human_review"
  | "not_reviewed";

export const COPY_REVIEW_STATUSES: readonly CopyReviewStatus[] = [
  "approved",
  "rewritten",
  "needs_human_review",
  "not_reviewed",
] as const;

/** Ids dos 6 criterios checados pelo revisor. */
export const COPY_REVIEW_CHECKS = [
  "unsupported_claim",
  "cliche",
  "placeholder",
  "sector_relevance",
  "length",
  "cta",
] as const;

export type CopyReviewCheck = (typeof COPY_REVIEW_CHECKS)[number];

export interface CopyReviewResult {
  subject: string;
  body: string;
  status: CopyReviewStatus;
  /** Motivos legiveis da ultima revisao (vazio quando aprovado ou nao revisado). */
  reasons: string[];
  /** Chamadas feitas ao LLM (revisoes + reescritas). */
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** Custo estimado em USD (soma das chamadas). */
  estimatedCost: number;
}

export const COPY_REVIEW_STATUS_LABELS: Record<CopyReviewStatus, string> = {
  approved: "Aprovado",
  rewritten: "Reescrito",
  needs_human_review: "Precisa revisão humana",
  not_reviewed: "Não revisado",
};

export function isCopyReviewStatus(value: unknown): value is CopyReviewStatus {
  return (
    typeof value === "string" &&
    (COPY_REVIEW_STATUSES as readonly string[]).includes(value)
  );
}
