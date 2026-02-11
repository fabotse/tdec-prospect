/**
 * BulkWhatsAppDialog Component
 * Story 11.6: Envio em Massa de WhatsApp com Intervalos Humanizados
 *
 * AC: #2 - Dialog de envio em massa
 * AC: #3 - Configuracao de intervalo
 * AC: #4 - Geracao de mensagem por IA
 * AC: #6 - Feedback visual de progresso
 * AC: #7 - Cancelamento
 * AC: #9 - Protecoes e edge cases
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Send,
  Clock,
  Loader2,
  Check,
  X,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIGenerate } from "@/hooks/use-ai-generate";
import { useKnowledgeBaseContext } from "@/hooks/use-knowledge-base-context";
import { normalizeTemplateVariables } from "@/lib/ai/sanitize-ai-output";
import {
  useWhatsAppBulkSend,
  type BulkSendLead,
  type BulkLeadStatus,
} from "@/hooks/use-whatsapp-bulk-send";

// ==============================================
// TYPES
// ==============================================

export interface BulkWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: BulkSendLead[];
  campaignId: string;
  campaignName?: string;
  productId?: string | null;
  onLeadSent?: (email: string) => void;
  onComplete?: () => void;
}

// ==============================================
// CONSTANTS
// ==============================================

const INTERVAL_OPTIONS = [
  { value: "30000", label: "Rápido", description: "~30s entre envios" },
  { value: "60000", label: "Normal", description: "~60s entre envios" },
  { value: "90000", label: "Seguro", description: "~90s entre envios" },
] as const;

// ==============================================
// HELPERS
// ==============================================

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}

function getCharCountColor(length: number): string {
  if (length === 0) return "text-muted-foreground";
  if (length <= 500) return "text-green-600 dark:text-green-400";
  if (length <= 1000) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getStatusIcon(status: BulkLeadStatus) {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" data-testid="status-pending" />;
    case "sending":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" data-testid="status-sending" />;
    case "sent":
      return <Check className="h-4 w-4 text-green-500" data-testid="status-sent" />;
    case "failed":
      return <X className="h-4 w-4 text-red-500" data-testid="status-failed" />;
    case "cancelled":
      return <Square className="h-4 w-4 text-muted-foreground" data-testid="status-cancelled" />;
  }
}

function getStatusText(status: BulkLeadStatus, errorMsg?: string): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "sending":
      return "Enviando...";
    case "sent":
      return "Enviado";
    case "failed":
      return errorMsg ? `Falhou: ${errorMsg.slice(0, 50)}` : "Falhou";
    case "cancelled":
      return "Cancelado";
  }
}

// ==============================================
// COMPONENT
// ==============================================

export function BulkWhatsAppDialog({
  open,
  onOpenChange,
  leads,
  campaignId,
  productId,
  onLeadSent,
  onComplete,
}: BulkWhatsAppDialogProps) {
  const [message, setMessage] = useState("");
  const [intervalMs, setIntervalMs] = useState("60000");
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const bulkSend = useWhatsAppBulkSend();

  const {
    generate,
    phase: aiPhase,
    text: streamingText,
    error: aiError,
    reset: resetAI,
    cancel: cancelAI,
    isGenerating,
  } = useAIGenerate();

  const { variables: kbVariables } = useKnowledgeBaseContext();

  const displayMessage =
    aiPhase === "streaming" && streamingText ? streamingText : message;

  const canStart = message.trim().length > 0 && !bulkSend.isRunning && !isGenerating;
  const isProgressMode = bulkSend.isRunning || bulkSend.isComplete || bulkSend.isCancelled;
  const progressPercent =
    bulkSend.progress.total > 0
      ? Math.round(
          ((bulkSend.progress.sent + bulkSend.progress.failed) /
            bulkSend.progress.total) *
            100
        )
      : 0;

  // ==============================================
  // HANDLERS
  // ==============================================

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && bulkSend.isRunning) {
      setShowCloseConfirm(true);
      return;
    }
    if (!nextOpen) {
      cancelAI();
      resetAI();
      bulkSend.reset();
      setMessage("");
      setIntervalMs("60000");
      setShowCloseConfirm(false);
      onComplete?.();
    }
    onOpenChange(nextOpen);
  };

  const handleConfirmClose = () => {
    bulkSend.cancel();
    bulkSend.reset();
    cancelAI();
    resetAI();
    setShowCloseConfirm(false);
    setMessage("");
    setIntervalMs("60000");
    onComplete?.();
    onOpenChange(false);
  };

  const handleGenerateAI = async () => {
    const previousMessage = message;
    resetAI();
    setMessage("");
    try {
      const result = await generate({
        promptKey: "whatsapp_message_generation",
        variables: {
          ...kbVariables,
          lead_name: "",
          lead_title: "",
          lead_company: "",
          lead_industry: "",
        },
        stream: true,
        productId,
      });
      if (result) {
        setMessage(normalizeTemplateVariables(result));
      }
    } catch {
      if (previousMessage) {
        setMessage(previousMessage);
      }
    }
  };

  const handleStart = async () => {
    if (!canStart) return;
    await bulkSend.start({
      campaignId,
      leads,
      message: message.trim(),
      intervalMs: Number(intervalMs),
      onLeadSent,
    });
  };

  const handleCancel = () => {
    bulkSend.cancel();
  };

  const handleClose = () => {
    handleOpenChange(false);
  };

  // ==============================================
  // RENDER
  // ==============================================

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[560px]"
        data-testid="bulk-whatsapp-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {isProgressMode ? "Enviando WhatsApp em Massa" : "Enviar WhatsApp em Massa"}
          </DialogTitle>
          <DialogDescription data-testid="bulk-lead-count">
            {isProgressMode
              ? `Enviados: ${bulkSend.progress.sent} | Falharam: ${bulkSend.progress.failed} | Restantes: ${bulkSend.progress.total - bulkSend.progress.sent - bulkSend.progress.failed - bulkSend.progress.cancelled}`
              : `${leads.length} lead${leads.length !== 1 ? "s" : ""} selecionado${leads.length !== 1 ? "s" : ""}`}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        {isProgressMode && (
          <div className="flex flex-col gap-2" data-testid="bulk-progress-section">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              {bulkSend.progress.sent + bulkSend.progress.failed} de {bulkSend.progress.total}
            </p>
          </div>
        )}

        {/* Lead list */}
        <div
          className="flex flex-col gap-2 max-h-[200px] overflow-y-auto"
          data-testid="bulk-lead-list"
        >
          {leads.map((lead) => {
            const status = bulkSend.leadStatuses.get(lead.leadEmail);
            const errorMsg = bulkSend.leadErrors.get(lead.leadEmail);
            const displayStatus = status || (isProgressMode ? "pending" : undefined);

            return (
              <div
                key={lead.leadEmail}
                data-testid="bulk-lead-item"
                className="flex items-center gap-2 text-sm py-1 px-2 rounded-md border border-border"
              >
                {displayStatus && (
                  <span className="shrink-0">{getStatusIcon(displayStatus)}</span>
                )}
                <span className="truncate font-medium">
                  {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.leadEmail}
                </span>
                <span className="truncate text-muted-foreground hidden sm:inline">
                  {lead.leadEmail}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatPhone(lead.phone)}
                </span>
                {displayStatus && (
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      displayStatus === "sent" && "text-green-600 dark:text-green-400",
                      displayStatus === "failed" && "text-red-600 dark:text-red-400",
                      displayStatus === "cancelled" && "text-muted-foreground"
                    )}
                    data-testid="bulk-lead-status-text"
                  >
                    {getStatusText(displayStatus, errorMsg)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Waiting text — AC#6 */}
        {bulkSend.isRunning && bulkSend.isWaiting && (
          <p
            data-testid="bulk-waiting-text"
            className="text-xs text-muted-foreground text-center animate-pulse"
          >
            Aguardando ~{Math.round(Number(intervalMs) / 1000)}s para próximo envio...
          </p>
        )}

        {/* Compose section (hidden during progress) */}
        {!isProgressMode && (
          <>
            {/* Textarea */}
            <div className="flex flex-col gap-2">
              <Label>Mensagem (mesma para todos)</Label>
              <Textarea
                data-testid="bulk-message-textarea"
                placeholder="Digite sua mensagem WhatsApp..."
                value={displayMessage}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                disabled={isGenerating}
              />
              <div className="flex items-center justify-between text-xs">
                <span
                  data-testid="bulk-char-count"
                  className={cn(getCharCountColor(displayMessage.length))}
                >
                  {displayMessage.length} caracteres
                </span>
                <span className="text-muted-foreground">ideal: ≤500</span>
              </div>
            </div>

            {/* AI generation button */}
            <Button
              variant="outline"
              size="sm"
              data-testid="bulk-generate-ai-button"
              onClick={handleGenerateAI}
              disabled={isGenerating}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar com IA
            </Button>

            {/* AI error */}
            {aiError && (
              <p
                data-testid="bulk-ai-error"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {aiError}
              </p>
            )}

            {/* AI generating indicator */}
            {isGenerating && (
              <p
                data-testid="bulk-ai-generating"
                className="text-sm text-muted-foreground animate-pulse"
              >
                Gerando mensagem...
              </p>
            )}

            {/* Interval selection — AC#3 */}
            <div className="flex flex-col gap-3">
              <Label>Intervalo entre envios</Label>
              <RadioGroup
                value={intervalMs}
                onValueChange={setIntervalMs}
                data-testid="bulk-interval-radio"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={opt.value}
                      id={`interval-${opt.value}`}
                      data-testid={`interval-${opt.value}`}
                    />
                    <Label htmlFor={`interval-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label} — {opt.description}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                Intervalos variados simulam comportamento humano
              </p>
            </div>
          </>
        )}

        {/* Close confirm overlay — AC#9 */}
        {showCloseConfirm && (
          <div
            data-testid="bulk-close-confirm"
            className="flex flex-col gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5"
          >
            <p className="text-sm font-medium">
              Tem certeza? Envio em andamento será cancelado.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                data-testid="bulk-close-confirm-continue"
                onClick={() => setShowCloseConfirm(false)}
              >
                Continuar Envio
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="bulk-close-confirm-cancel"
                onClick={handleConfirmClose}
              >
                Cancelar e Fechar
              </Button>
            </div>
          </div>
        )}

        {/* Summary for completed/cancelled — AC#6, AC#7 */}
        {(bulkSend.isComplete || bulkSend.isCancelled) && (
          <div
            data-testid="bulk-summary"
            className="p-3 rounded-md border border-border bg-muted/50 text-sm"
          >
            {bulkSend.isComplete && (
              <p>
                Concluído: {bulkSend.progress.sent} enviado{bulkSend.progress.sent !== 1 ? "s" : ""},{" "}
                {bulkSend.progress.failed} falh{bulkSend.progress.failed !== 1 ? "aram" : "ou"}
              </p>
            )}
            {bulkSend.isCancelled && (
              <p>
                Cancelado: {bulkSend.progress.sent} enviado{bulkSend.progress.sent !== 1 ? "s" : ""},{" "}
                {bulkSend.progress.failed} falh{bulkSend.progress.failed !== 1 ? "aram" : "ou"},{" "}
                {bulkSend.progress.cancelled} cancelado{bulkSend.progress.cancelled !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex justify-end gap-2">
          {!isProgressMode && (
            <>
              <Button variant="ghost" onClick={handleClose} data-testid="bulk-cancel-button">
                Cancelar
              </Button>
              <Button
                onClick={handleStart}
                disabled={!canStart}
                data-testid="bulk-start-button"
              >
                <Send className="mr-2 h-4 w-4" />
                Iniciar Envio ({leads.length})
              </Button>
            </>
          )}

          {bulkSend.isRunning && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              data-testid="bulk-cancel-send-button"
            >
              Cancelar Envio
            </Button>
          )}

          {(bulkSend.isComplete || bulkSend.isCancelled) && (
            <Button onClick={handleClose} data-testid="bulk-close-button">
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
