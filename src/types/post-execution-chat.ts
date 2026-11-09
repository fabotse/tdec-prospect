/**
 * Tipos da conversa depois da execucao — Story 24.24
 *
 * Compartilhados entre a rota `POST /api/agent/executions/[id]/conversation`, o card da
 * conversa e o store do agente. O LLM so decide o texto e a intencao; o resto (o que o
 * card mostra, se o botao fica habilitado) e decidido no codigo.
 */

import type { CopyReviewStatus } from "./copy-review";
import type { ParsedBriefing } from "./agent";

/** Status do revisor (24.9) da versao proposta. */
export interface RewriteReview {
  status: CopyReviewStatus;
  reasons: string[];
}

/** Texto de um e-mail (assunto + corpo). */
export interface EmailCopy {
  subject: string;
  body: string;
}

/** Reescrita proposta de um e-mail da campanha. Nada muda sem o clique em "Substituir". */
export interface RewriteProposal {
  /** `step_number` do `create_campaign`. */
  stepNumber: number;
  /** Numero do e-mail na sequencia (1 = primeiro e-mail), como a previa mostra. */
  position: number;
  /** `position` do bloco no output (estrutura da campanha). Confere o alvo na previa. */
  blockPosition: number;
  emailMode: "initial" | "follow-up";
  original: EmailCopy;
  proposed: EmailCopy;
  review: RewriteReview;
  /** true so com o gate da campanha aberto (`awaiting_approval`). */
  canApply: boolean;
  /** Motivo do botao desabilitado (null quando `canApply`). */
  blockedReason: string | null;
}

/** Nova busca proposta. O clique so abre uma conversa nova ja preenchida. */
export interface MoreLeadsProposal {
  count: number;
  referenceName: string | null;
  /** Briefing da conversa nova (mesmos criterios, `leadCount = count`). */
  briefing: ParsedBriefing;
  /** Custo estimado da nova execucao (BRL), mesmo calculo do plano. */
  estimatedCostBRL: number;
  /** true so com a execucao atual terminal (completed/failed/cancelled). */
  canStart: boolean;
  blockedReason: string | null;
}

export type PostExecutionChatResult =
  | { kind: "fallback" }
  | { kind: "answer"; reply: string }
  | { kind: "rewrite"; reply: string; proposal: RewriteProposal }
  | { kind: "more_leads"; reply: string; proposal: MoreLeadsProposal };

/**
 * Substituicao pedida pelo clique em "Substituir na previa". Estado TRANSITORIO do
 * store: a previa da campanha aplica em `editedBlocks` e limpa.
 */
export interface EmailBlockReplacement {
  executionId: string;
  stepNumber: number;
  position: number;
  blockPosition: number;
  subject: string;
  body: string;
  review: RewriteReview;
}
