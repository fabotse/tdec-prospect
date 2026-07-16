/**
 * Hook: useWhatsAppSendFromOpportunity
 * Story 21.5 AC#3 — envio de WhatsApp a partir do card da Central de Oportunidades
 *
 * Espelha use-whatsapp-send-from-insight.ts. Diferença: invalida as chaves de
 * oportunidade — o auto-mark `contacted` do server action muda o status da
 * oportunidade e decrementa o badge `new` da sidebar.
 *
 * Expõe: { send, isSending, error, lastResult }. `send` resolve boolean
 * (true = enviado) para o PageContent fechar o composer.
 */

"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendWhatsAppFromOpportunity } from "@/actions/whatsapp";
import type { WhatsAppMessage } from "@/types/database";

interface SendFromOpportunityParams {
  opportunityId: string;
  leadId: string;
  phone: string;
  message: string;
}

interface UseWhatsAppSendFromOpportunityReturn {
  send: (data: SendFromOpportunityParams) => Promise<boolean>;
  isSending: boolean;
  error: string | null;
  lastResult: WhatsAppMessage | null;
}

export function useWhatsAppSendFromOpportunity(): UseWhatsAppSendFromOpportunityReturn {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<WhatsAppMessage | null>(null);
  const queryClient = useQueryClient();

  const send = useCallback(
    async (data: SendFromOpportunityParams): Promise<boolean> => {
      setIsSending(true);
      setError(null);

      try {
        const result = await sendWhatsAppFromOpportunity(data);

        if (result.success) {
          setLastResult(result.data);
          toast.success("Mensagem WhatsApp enviada com sucesso!");
          queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
          // O server action auto-marca a oportunidade como `contacted` → a lista
          // e a contagem do badge saem do ar sem isto.
          queryClient.invalidateQueries({ queryKey: ["opportunities"] });
          queryClient.invalidateQueries({ queryKey: ["opportunities-new-count"] });
          return true;
        }

        setError(result.error);
        toast.error(`Falha ao enviar mensagem WhatsApp: ${result.error}`);
        return false;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        setError(message);
        toast.error(`Falha ao enviar mensagem WhatsApp: ${message}`);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [queryClient]
  );

  return { send, isSending, error, lastResult };
}
