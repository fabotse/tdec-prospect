/**
 * AgentMessageBubble
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #3 - Cada tipo de mensagem tem estilo visual distinto
 *        - Mensagens do usuario alinhadas a direita, do agente a esquerda
 */

"use client";

import { Bot, Loader2, AlertCircle, CheckCircle2, DollarSign, BarChart3, ShieldCheck, SkipForward } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/use-agent-store";
import type { AgentMessage, MessageType, StepType } from "@/types/agent";
import { AgentApprovalGate } from "./AgentApprovalGate";
import { AgentLeadReview } from "./AgentLeadReview";
import { AgentCampaignPreview } from "./AgentCampaignPreview";
import { AgentActivationGate } from "./AgentActivationGate";

interface AgentMessageBubbleProps {
  message: AgentMessage;
}

function getMessageType(message: AgentMessage): MessageType {
  return message.metadata?.messageType || "text";
}

/**
 * Story 22.17 (code review): tabela COM fallback.
 *
 * A cadeia de `{messageType === "x" && "..."}` nao tinha default: um tipo fora da union
 * passava no guard `!== "text"`, nao casava nenhum label e caia no `default: null` do icone
 * — renderizando uma faixa de cabecalho VAZIA acima do texto. Note que `getMessageType` so
 * cai em "text" quando o campo esta AUSENTE; um valor presente e desconhecido chegava aqui.
 *
 * Isto NAO conserta uma aba ja aberta com o bundle antigo (la quem roda e o codigo velho) —
 * serve para o proximo membro novo de `MessageType` nao repetir o buraco.
 */
const MESSAGE_TYPE_LABELS: Record<string, string> = {
  progress: "Processando...",
  step_complete: "Concluido",
  error: "Erro",
  cost_estimate: "Estimativa de Custo",
  summary: "Resumo",
  approval_gate: "Aprovacao",
  skip: "Etapa Pulada",
};

function getTimestamp(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

export function AgentMessageBubble({ message }: AgentMessageBubbleProps) {
  const isUser = message.role === "user";
  const messageType = getMessageType(message);
  const totalSteps = useAgentStore((s) => s.totalSteps);

  return (
    <div
      className={cn("flex gap-3 max-w-[80%]", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}
      data-testid="agent-message-bubble"
      data-role={message.role}
      data-message-type={messageType}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Bubble */}
      <div className="flex flex-col gap-1">
        {/* Approval gate interactive component */}
        {messageType === "approval_gate" && message.metadata?.approvalData ? (
          <ApprovalGateRenderer
            approvalData={message.metadata.approvalData}
            executionId={message.execution_id}
            stepNumber={message.metadata.stepNumber ?? 1}
            totalSteps={totalSteps}
            // Story 22.13 (AC5): rejeicao durável — o card carimbado volta marcado
            // e desabilitado apos refetch/refresh.
            rejected={message.metadata.rejected}
            // Story 22.18 (AC3): mesma ideia para o gate de ATIVACAO, que ainda nao
            // tinha nenhum estado durável.
            activationOutcome={message.metadata.activationOutcome}
          />
        ) : (
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-body-small",
            isUser
              ? "bg-foreground text-background rounded-br-md"
              : messageType === "error"
                ? "bg-muted border border-destructive/50 rounded-bl-md"
                : messageType === "cost_estimate" || messageType === "summary"
                  ? "bg-muted rounded-bl-md border border-border"
                  : "bg-muted rounded-bl-md"
          )}
        >
          {/* Message type icon for agent messages */}
          {!isUser && messageType !== "text" && (
            <div className="flex items-center gap-2 mb-1.5 text-muted-foreground">
              <MessageTypeIcon messageType={messageType} />
              <span className="text-xs font-medium">
                {MESSAGE_TYPE_LABELS[messageType] ?? "Atualizacao"}
              </span>
            </div>
          )}

          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        )}

        {/* Timestamp */}
        <span
          className={cn(
            "text-xs text-muted-foreground",
            isUser ? "text-right" : "text-left"
          )}
          data-testid="message-timestamp"
        >
          {getTimestamp(message.created_at)}
        </span>
      </div>
    </div>
  );
}

function ApprovalGateRenderer({
  approvalData,
  executionId,
  stepNumber,
  totalSteps,
  rejected,
  activationOutcome,
}: {
  approvalData: { stepType: StepType; previewData: unknown };
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  rejected?: boolean;
  activationOutcome?: "activated" | "deferred";
}) {
  switch (approvalData.stepType) {
    case "search_companies":
      return (
        <AgentApprovalGate
          data={approvalData.previewData as Parameters<typeof AgentApprovalGate>[0]["data"]}
          executionId={executionId}
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          rejected={rejected}
        />
      );
    case "search_leads":
      return (
        <AgentLeadReview
          data={approvalData.previewData as Parameters<typeof AgentLeadReview>[0]["data"]}
          executionId={executionId}
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          rejected={rejected}
        />
      );
    case "create_campaign":
      return (
        <AgentCampaignPreview
          data={approvalData.previewData as Parameters<typeof AgentCampaignPreview>[0]["data"]}
          executionId={executionId}
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          rejected={rejected}
        />
      );
    case "export":
      return (
        <AgentActivationGate
          data={approvalData.previewData as Parameters<typeof AgentActivationGate>[0]["data"]}
          executionId={executionId}
          stepNumber={stepNumber}
          totalSteps={totalSteps}
          activationOutcome={activationOutcome}
        />
      );
    default:
      return null;
  }
}

function MessageTypeIcon({ messageType }: { messageType: MessageType }) {
  switch (messageType) {
    case "progress":
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    // Story 22.17 (AC3): icone ESTATICO — a etapa acabou, nada mais gira.
    case "step_complete":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    case "cost_estimate":
      return <DollarSign className="h-3.5 w-3.5" />;
    case "summary":
      return <BarChart3 className="h-3.5 w-3.5" />;
    case "approval_gate":
      return <ShieldCheck className="h-3.5 w-3.5" />;
    case "skip":
      return <SkipForward className="h-3.5 w-3.5" />;
    // Story 22.17 (code review): tipo desconhecido ganha um icone neutro em vez de `null`.
    // Sem isso a faixa de cabecalho renderizava VAZIA (ver MESSAGE_TYPE_LABELS).
    default:
      return <Bot className="h-3.5 w-3.5" />;
  }
}
