"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Loader2, ChevronDown, ChevronUp, FileSearch } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { triggerNextStepChecked } from "@/lib/agent/client-utils";
import { reportTriggerFailure } from "@/lib/agent/report-trigger-failure";
import { useAgentStore } from "@/stores/use-agent-store";
import { CopyReviewBadge } from "@/components/builder/CopyReviewBadge";
import type { CopyReviewStatus } from "@/types/copy-review";
import type { EmailBlockReplacement } from "@/types/post-execution-chat";
import { EmailUnverifiedWarning } from "@/components/leads/EmailUnverifiedWarning";
import type { LeadEmailStatus } from "@/lib/leads/email-status";
import { AccountDossierSheet } from "@/components/dossier/AccountDossierSheet";

// === Types ===

interface EmailBlock {
  position: number;
  subject: string;
  body: string;
  emailMode: string;
  // Story 24.9: status do revisor. Ausente em execucoes antigas (sem badge).
  review?: { status: CopyReviewStatus; reasons: string[] };
}

interface LeadIcebreaker {
  name: string;
  companyName: string | null;
  icebreaker: string | null;
  /** Story 24.12: status do e-mail do enrichment (aviso so para invalid/unknown). */
  emailStatus?: LeadEmailStatus | null;
  /** Story 24.22: so tipagem — o payload real (`LeadWithIcebreaker`) ja traz. */
  apolloId?: string | null;
  email?: string | null;
}

interface CampaignPreviewData {
  campaignName: string;
  structure: {
    totalEmails: number;
    totalDays: number;
  };
  emailBlocks: EmailBlock[];
  leadsWithIcebreakers: LeadIcebreaker[];
  icebreakerStats: {
    generated: number;
    premium?: number; // Story 22.2: gerados via posts reais do LinkedIn
    standard?: number; // Story 22.2: gerados via caminho standard/fallback
    failed: number;
    skipped: number;
  };
  totalLeads: number;
}

interface AgentCampaignPreviewProps {
  data: CampaignPreviewData;
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  onAction?: () => void;
  /** Story 22.13 (AC5): rejeicao DURAVEL vinda de `message.metadata.rejected`. */
  rejected?: boolean;
}

// === Constants ===

const ICEBREAKER_COLLAPSE_THRESHOLD = 10;

// === Component ===

export function AgentCampaignPreview({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
  rejected,
}: AgentCampaignPreviewProps) {
  const [editedBlocks, setEditedBlocks] = useState<EmailBlock[]>(
    () => data.emailBlocks.map((b) => ({ ...b }))
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<"subject" | "body" | null>(null);
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [localActionTaken, setLocalActionTaken] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [icebreakerExpanded, setIcebreakerExpanded] = useState(
    data.leadsWithIcebreakers.length <= ICEBREAKER_COLLAPSE_THRESHOLD
  );
  const setAdjustingStep = useAgentStore((s) => s.setAdjustingStep);
  // Story 24.24: "Substituir na previa" vindo do card da conversa.
  const emailBlockReplacement = useAgentStore((s) => s.emailBlockReplacement);
  const clearEmailBlockReplacement = useAgentStore((s) => s.clearEmailBlockReplacement);
  // Story 24.22: lead com o painel do dossie aberto (so leitura).
  const [dossierLead, setDossierLead] = useState<LeadIcebreaker | null>(null);

  // Story 22.13: o sinal durável (servidor) vence o local (some no remount).
  const actionTaken: "approved" | "rejected" | null = rejected
    ? "rejected"
    : localActionTaken;

  const isDisabled = loading !== null || actionTaken !== null;

  // Story 24.24: aplica a reescrita aceita na conversa. So nesta previa (mesma execucao e
  // step), com o gate aberto (sem acao local, sem `rejected`) e com o alvo conferido. O
  // texto entra em `editedBlocks` — o mesmo caminho da edicao a mao — e so vale no Aprovar.
  // Aplicado no render (padrao "ajustar estado quando um valor muda"); o efeito so limpa
  // o pedido no store depois de consumido.
  const [consumedReplacement, setConsumedReplacement] = useState<EmailBlockReplacement | null>(null);
  const replacementMatches =
    emailBlockReplacement !== null &&
    emailBlockReplacement.executionId === executionId &&
    emailBlockReplacement.stepNumber === stepNumber;
  // Gate fechado nesta previa: o pedido nunca mais vale e sai do store.
  const replacementStale = replacementMatches && (Boolean(rejected) || localActionTaken !== null);
  // Com um Aprovar em voo o pedido espera no store (a aprovacao sai com o texto atual).
  const replacementApplies =
    replacementMatches &&
    emailBlockReplacement !== consumedReplacement &&
    !replacementStale &&
    loading === null;
  // Alvo conferido aqui (e nao no updater): um alvo divergente nao troca nada e vira aviso.
  const [droppedReplacement, setDroppedReplacement] = useState<EmailBlockReplacement | null>(null);
  if (replacementApplies && emailBlockReplacement) {
    const replacement = emailBlockReplacement;
    const index = replacement.position - 1;
    setConsumedReplacement(replacement);
    const target = editedBlocks[index];
    if (!target || target.position !== replacement.blockPosition) {
      setDroppedReplacement(replacement);
    } else {
      setEditedBlocks((prev) =>
        prev.map((block, i) =>
          i === index
            ? {
                ...block,
                subject: replacement.subject,
                body: replacement.body,
                review: { status: replacement.review.status, reasons: [...replacement.review.reasons] },
              }
            : block
        )
      );
    }
  }
  useEffect(() => {
    if (!emailBlockReplacement) return;
    if (replacementStale) {
      // O gate fechou antes da troca (ex.: Aprovar em voo): a previa segue com o texto anterior.
      toast.warning(
        `A nova versao do e-mail ${emailBlockReplacement.position} nao entrou: a campanha ja tinha sido aprovada ou rejeitada.`
      );
      clearEmailBlockReplacement();
      return;
    }
    if (emailBlockReplacement === consumedReplacement) {
      if (emailBlockReplacement === droppedReplacement) {
        toast.warning(
          `A nova versao do e-mail ${emailBlockReplacement.position} nao entrou: a previa mudou desde a reescrita.`
        );
      }
      clearEmailBlockReplacement();
    }
  }, [
    emailBlockReplacement,
    consumedReplacement,
    droppedReplacement,
    replacementStale,
    clearEmailBlockReplacement,
  ]);

  const handleFieldClick = (index: number, field: "subject" | "body") => {
    if (isDisabled) return;
    setEditingIndex(index);
    setEditingField(field);
  };

  const handleFieldChange = (index: number, field: "subject" | "body", value: string) => {
    setEditedBlocks((prev) =>
      prev.map((block, i) => {
        if (i !== index) return block;
        // Story 24.9: texto editado por humano deixa de ter o status do revisor.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { review: _review, ...rest } = block;
        return { ...rest, [field]: value };
      })
    );
  };

  const handleFieldBlur = () => {
    setEditingIndex(null);
    setEditingField(null);
  };

  const handleApprove = async () => {
    setLoading("approve");
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedData: { emailBlocks: editedBlocks },
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao aprovar");
      }
      setLocalActionTaken("approved");
      onAction?.();
      // Story 17.7 - AC #6: Auto-advance to next step after approval
      // Nao aguardado: a aprovacao ja foi salva e o card continua "aprovado". Story 24.3
      // (AC2): a resposta e VERIFICADA — falha que nao virou bolha no chat vira aviso
      // com "Tentar novamente" (via store), em vez de sumir em silencio.
      void triggerNextStepChecked(executionId, stepNumber, totalSteps).then((outcome) =>
        reportTriggerFailure(outcome, executionId, stepNumber + 1)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar");
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading("reject");
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/reject`,
        { method: "POST" }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao rejeitar");
      }
      setLocalActionTaken("rejected");
      // Story 22.13 (AC1): o estado de ajuste e GENERICO por step — vale para a campanha
      // tanto quanto para as buscas. Spinner tambem para no sucesso.
      setAdjustingStep({
        executionId,
        stepNumber,
        stepType: "create_campaign",
        phase: "describe",
      });
      setLoading(null);
      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rejeitar");
      setLoading(null);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{data.campaignName}</CardTitle>
        </div>
        <CardDescription>
          {data.structure.totalEmails} emails · {data.structure.totalDays} dias · {data.totalLeads} leads
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Email Blocks */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Sequencia de Emails</p>
          {editedBlocks.map((block, index) => (
            <Card key={block.position} className="border-muted">
              <CardContent className="flex flex-col gap-2 p-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      Email {index + 1} ({block.emailMode === "initial" ? "Inicial" : "Follow-up"})
                    </p>
                    {block.review && <CopyReviewBadge status={block.review.status} />}
                  </div>
                  {block.review?.status === "needs_human_review" &&
                    block.review.reasons.length > 0 && (
                      <ul
                        className="text-xs text-muted-foreground list-disc pl-4"
                        data-testid={`copy-review-reasons-${index}`}
                      >
                        {block.review.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    )}
                </div>

                {/* Subject */}
                {editingIndex === index && editingField === "subject" ? (
                  <Input
                    value={block.subject}
                    onChange={(e) => handleFieldChange(index, "subject", e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFieldBlur();
                    }}
                    autoFocus
                    className="text-sm"
                    data-testid={`email-subject-input-${index}`}
                  />
                ) : (
                  <p
                    className={`text-sm font-medium border border-dashed border-muted-foreground/30 rounded px-2 py-1 ${
                      isDisabled ? "" : "cursor-pointer hover:border-primary/50"
                    }`}
                    onClick={() => handleFieldClick(index, "subject")}
                    data-testid={`email-subject-${index}`}
                  >
                    <span className="text-muted-foreground text-xs">Assunto: </span>
                    {block.subject}
                  </p>
                )}

                {/* Body */}
                {editingIndex === index && editingField === "body" ? (
                  <Textarea
                    value={block.body}
                    onChange={(e) => handleFieldChange(index, "body", e.target.value)}
                    onBlur={handleFieldBlur}
                    autoFocus
                    rows={4}
                    className="text-sm"
                    data-testid={`email-body-input-${index}`}
                  />
                ) : (
                  <p
                    className={`text-sm whitespace-pre-wrap border border-dashed border-muted-foreground/30 rounded px-2 py-1 ${
                      isDisabled ? "" : "cursor-pointer hover:border-primary/50"
                    }`}
                    onClick={() => handleFieldClick(index, "body")}
                    data-testid={`email-body-${index}`}
                  >
                    {block.body}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Icebreakers */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Icebreakers ({data.icebreakerStats.generated} gerados)
              {(data.icebreakerStats.premium ?? 0) > 0 && (
                <span className="text-muted-foreground font-normal">
                  {" "}— {data.icebreakerStats.premium} premium (LinkedIn), {data.icebreakerStats.standard ?? 0} standard
                </span>
              )}
            </p>
            {data.leadsWithIcebreakers.length > ICEBREAKER_COLLAPSE_THRESHOLD && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIcebreakerExpanded((prev) => !prev)}
                className="h-6 px-2 text-xs"
                data-testid="icebreaker-toggle"
              >
                {icebreakerExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Recolher
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Expandir ({data.leadsWithIcebreakers.length})
                  </>
                )}
              </Button>
            )}
          </div>
          {icebreakerExpanded && (
            <div className="flex flex-col gap-1 text-sm" data-testid="icebreaker-list">
              {data.leadsWithIcebreakers.map((lead, idx) => (
                <div
                  key={`${lead.name}-${idx}`}
                  className="flex items-start justify-between border-b pb-1 last:border-b-0 gap-2"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{lead.name}</span>
                    {lead.companyName && (
                      <span className="text-xs text-muted-foreground truncate">
                        {lead.companyName}
                      </span>
                    )}
                    <EmailUnverifiedWarning status={lead.emailStatus} />
                    {/* Story 24.22: leitura permitida mesmo apos aprovar/rejeitar. */}
                    {(lead.apolloId || lead.email) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="h-6 self-start px-2 text-xs"
                        onClick={() => setDossierLead(lead)}
                        aria-label={`Ver dossiê de ${lead.name}`}
                        data-testid="campaign-lead-dossier-button"
                      >
                        <FileSearch className="h-3 w-3" />
                        Dossiê
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground text-right shrink-0 max-w-[50%]">
                    {lead.icebreaker ?? "Sem icebreaker"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive" data-testid="campaign-preview-error">
            {error}
          </p>
        )}

        {/* Action taken feedback */}
        {actionTaken && (
          <p className="text-sm font-medium text-muted-foreground">
            {actionTaken === "approved" ? "✅ Campanha aprovada" : "❌ Campanha rejeitada"}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleApprove}
            disabled={isDisabled}
            size="sm"
            data-testid="campaign-approve-btn"
          >
            {loading === "approve" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aprovar
          </Button>
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isDisabled}
            size="sm"
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
            data-testid="campaign-reject-btn"
          >
            {loading === "reject" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Rejeitar
          </Button>
        </div>

        <AccountDossierSheet
          open={dossierLead !== null}
          onOpenChange={(open) => {
            if (!open) setDossierLead(null);
          }}
          target={
            dossierLead
              ? {
                  executionId,
                  apolloId: dossierLead.apolloId ?? null,
                  email: dossierLead.email ?? null,
                  leadName: dossierLead.name,
                  companyName: dossierLead.companyName,
                }
              : null
          }
          context="campaign"
        />
      </CardContent>
    </Card>
  );
}
