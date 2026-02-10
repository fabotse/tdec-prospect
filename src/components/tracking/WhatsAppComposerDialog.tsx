/**
 * WhatsAppComposerDialog Component
 * Story 11.3: Composer de Mensagem WhatsApp
 *
 * AC: #1 - Dialog com dados do lead, textarea, botoes Gerar com IA e Enviar
 * AC: #2 - Composicao manual com contador de caracteres
 * AC: #3 - Geracao IA com useAIGenerate + useKnowledgeBaseContext
 * AC: #4 - Estados durante streaming
 * AC: #5 - Tratamento de erro na geracao
 * AC: #7 - Lead sem telefone
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Sparkles, Send, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIGenerate } from "@/hooks/use-ai-generate";
import { useKnowledgeBaseContext } from "@/hooks/use-knowledge-base-context";
import { normalizeTemplateVariables } from "@/lib/ai/sanitize-ai-output";
import { toast } from "sonner";

// ==============================================
// TYPES
// ==============================================

export interface WhatsAppComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    leadEmail?: string;
    companyName?: string;
    title?: string;
    industry?: string;
  };
  campaignId: string;
  campaignName?: string;
  productId?: string | null;
  onSend?: (data: { phone: string; message: string }) => void;
}

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

// ==============================================
// COMPONENT
// ==============================================

export function WhatsAppComposerDialog({
  open,
  onOpenChange,
  lead,
  // campaignId and campaignName reserved for story 11.4 (send integration)
  productId,
  onSend,
}: WhatsAppComposerDialogProps) {
  const [message, setMessage] = useState("");

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

  // Computed streaming display value (AC #4) — shows streaming text during generation
  const displayMessage = (aiPhase === "streaming" && streamingText) ? streamingText : message;

  const hasPhone = Boolean(lead.phone);
  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Lead";
  const canSend = hasPhone && message.trim().length > 0 && !isGenerating;
  const canCopy = message.trim().length > 0 && !isGenerating;

  // Handle dialog open/close with cleanup — abort in-flight request on close (M1 fix)
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setMessage("");
      cancelAI();
      resetAI();
    }
    onOpenChange(nextOpen);
  };

  // AC #3: Generate AI message
  // AC #5: Preserve previous text on generation error
  const handleGenerateAI = async () => {
    const previousMessage = message;
    resetAI();
    setMessage("");
    try {
      const result = await generate({
        promptKey: "whatsapp_message_generation",
        variables: {
          ...kbVariables,
          lead_name: lead.firstName || "",
          lead_title: lead.title || "",
          lead_company: lead.companyName || "",
          lead_industry: lead.industry || "",
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

  // AC #1: Send button callback
  const handleSend = () => {
    if (!canSend || !lead.phone) return;
    onSend?.({ phone: lead.phone, message: message.trim() });
  };

  // AC #7: Copy message for leads without phone
  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada!");
    } catch {
      toast.error("Erro ao copiar mensagem");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[540px]"
        data-testid="whatsapp-composer-dialog"
      >
        <DialogHeader>
          <DialogTitle>Enviar WhatsApp</DialogTitle>
          <DialogDescription>
            Compor mensagem para {leadName}
          </DialogDescription>
        </DialogHeader>

        {/* Lead info */}
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {hasPhone ? (
              <span data-testid="whatsapp-lead-phone" className="text-muted-foreground">
                {formatPhone(lead.phone!)}
              </span>
            ) : (
              <span
                data-testid="whatsapp-no-phone-warning"
                className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400"
              >
                <AlertTriangle className="h-4 w-4" />
                Telefone nao disponivel
              </span>
            )}
            {lead.companyName && (
              <span data-testid="whatsapp-lead-company" className="text-muted-foreground">
                Empresa: {lead.companyName}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span data-testid="whatsapp-lead-name" className="text-muted-foreground">
              {leadName}
            </span>
            {lead.title && (
              <span data-testid="whatsapp-lead-title" className="text-muted-foreground">
                Cargo: {lead.title}
              </span>
            )}
          </div>
        </div>

        {/* Textarea (AC #2) */}
        <div className="flex flex-col gap-2">
          <Textarea
            data-testid="whatsapp-message-textarea"
            placeholder="Digite sua mensagem WhatsApp..."
            value={displayMessage}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            disabled={isGenerating}
          />
          <div className="flex items-center justify-between text-xs">
            <span
              data-testid="whatsapp-char-count"
              className={cn(getCharCountColor(displayMessage.length))}
            >
              {displayMessage.length} caracteres
            </span>
            <span className="text-muted-foreground">ideal: ≤500</span>
          </div>
        </div>

        {/* AI error (AC #5) */}
        {aiError && (
          <p
            data-testid="whatsapp-ai-error"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {aiError}
          </p>
        )}

        {/* Generating indicator (AC #4) */}
        {isGenerating && (
          <p
            data-testid="whatsapp-ai-generating"
            className="text-sm text-muted-foreground animate-pulse"
          >
            Gerando mensagem...
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              data-testid="whatsapp-generate-ai-button"
              onClick={handleGenerateAI}
              disabled={isGenerating}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar com IA
            </Button>
            {!hasPhone && (
              <Button
                variant="outline"
                data-testid="whatsapp-copy-button"
                onClick={handleCopy}
                disabled={!canCopy}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar mensagem
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              data-testid="whatsapp-send-button"
              onClick={handleSend}
              disabled={!canSend}
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar WhatsApp
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
