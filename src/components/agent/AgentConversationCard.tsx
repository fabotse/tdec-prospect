/**
 * AgentConversationCard — Story 24.24
 *
 * Card da conversa depois da execução. Duas formas:
 * - reescrita: original × proposta, selo do revisor (24.9) e motivos, com "Substituir na
 *   prévia" (só com o gate da campanha aberto), "Copiar" e "Descartar";
 * - mais leads: a ação, N, a referência e o custo estimado, com "Começar nova busca" (só
 *   com a execução terminada) e "Descartar".
 * Nada aqui grava ou dispara busca: os botões só chamam os handlers do chat.
 */

"use client";

import { Copy, MessageSquareText, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyReviewBadge } from "@/components/builder/CopyReviewBadge";
import { formatBRL } from "@/lib/agent/agent-pricing";
import type {
  EmailCopy,
  MoreLeadsProposal,
  RewriteProposal,
} from "@/types/post-execution-chat";

export type ConversationCardState =
  | { kind: "rewrite"; executionId: string; proposal: RewriteProposal }
  | { kind: "more_leads"; executionId: string; proposal: MoreLeadsProposal };

interface AgentConversationCardProps {
  card: ConversationCardState;
  disabled?: boolean;
  onApply: (proposal: RewriteProposal) => void;
  onStartSearch: (proposal: MoreLeadsProposal) => void;
  onDiscard: () => void;
}

function EmailText({ label, email, testId }: { label: string; email: EmailCopy; testId: string }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-muted p-2" data-testid={testId}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">
        <span className="text-xs text-muted-foreground">Assunto: </span>
        {email.subject}
      </p>
      <p className="text-sm whitespace-pre-wrap break-words">{email.body}</p>
    </div>
  );
}

function BlockedReason({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="conversation-card-blocked-reason">
      {reason}
    </p>
  );
}

async function copyEmail(email: EmailCopy) {
  try {
    await navigator.clipboard.writeText(`Assunto: ${email.subject}\n\n${email.body}`);
    toast.success("Texto copiado.");
  } catch {
    toast.error("Não foi possível copiar o texto.");
  }
}

export function AgentConversationCard({
  card,
  disabled = false,
  onApply,
  onStartSearch,
  onDiscard,
}: AgentConversationCardProps) {
  if (card.kind === "rewrite") {
    const { proposal } = card;
    return (
      <Card className="mx-4 border-primary/20" data-testid="conversation-card-rewrite">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Nova versão do e-mail {proposal.position}</CardTitle>
          </div>
          <CardDescription>
            Vale para todos os leads da campanha (o e-mail é um template).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <EmailText label="Original" email={proposal.original} testId="conversation-card-original" />
          <EmailText label="Proposta" email={proposal.proposed} testId="conversation-card-proposed" />
          <CopyReviewBadge
            status={proposal.review.status}
            reasons={proposal.review.reasons}
            showReasons
          />
          <BlockedReason reason={proposal.canApply ? null : proposal.blockedReason} />
          <div className="flex flex-wrap gap-2 pt-1">
            {proposal.canApply && (
              <Button
                size="sm"
                onClick={() => onApply(proposal)}
                disabled={disabled}
                data-testid="conversation-card-apply"
              >
                Substituir na prévia
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copyEmail(proposal.proposed)}
              data-testid="conversation-card-copy"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDiscard}
              disabled={disabled}
              data-testid="conversation-card-discard"
            >
              Descartar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { proposal } = card;
  return (
    <Card className="mx-4 border-primary/20" data-testid="conversation-card-more-leads">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Nova busca com os mesmos critérios</CardTitle>
        </div>
        <CardDescription>
          Repete os critérios desta execução. Leads já contatados ficam de fora.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p data-testid="conversation-card-count">
          <span className="text-muted-foreground">Quantidade: </span>
          {proposal.count} {proposal.count === 1 ? "lead" : "leads"}
        </p>
        {proposal.referenceName && (
          <p data-testid="conversation-card-reference">
            <span className="text-muted-foreground">Referência: </span>
            {proposal.referenceName} (a busca usa os critérios da execução que o encontrou)
          </p>
        )}
        <p data-testid="conversation-card-cost">
          <span className="text-muted-foreground">Custo estimado: </span>
          até {formatBRL(proposal.estimatedCostBRL)}
        </p>
        <p className="text-xs text-muted-foreground">
          O clique só abre uma conversa nova com o briefing preenchido. Nada é gasto antes do
          plano com o custo e do Confirmar.
        </p>
        <BlockedReason reason={proposal.canStart ? null : proposal.blockedReason} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => onStartSearch(proposal)}
            disabled={disabled || !proposal.canStart}
            data-testid="conversation-card-start"
          >
            Começar nova busca
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDiscard}
            disabled={disabled}
            data-testid="conversation-card-discard"
          >
            Descartar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
