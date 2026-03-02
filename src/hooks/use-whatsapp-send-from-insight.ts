/**
 * Hook: useWhatsAppSendFromInsight
 * Story 13.7 AC#2, AC#5 — Manages WhatsApp sending from insight context
 *
 * Exposes: { send, isSending, error, lastResult }
 * Invalidates: whatsapp-messages, lead-tracking, insights, insights-new-count
 */

"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendWhatsAppFromInsight } from "@/actions/whatsapp";
import type { WhatsAppMessage } from "@/types/database";

interface SendFromInsightParams {
  leadId: string;
  insightId: string;
  phone: string;
  message: string;
}

interface UseWhatsAppSendFromInsightReturn {
  send: (data: SendFromInsightParams) => Promise<boolean>;
  isSending: boolean;
  error: string | null;
  lastResult: WhatsAppMessage | null;
}

export function useWhatsAppSendFromInsight(): UseWhatsAppSendFromInsightReturn {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<WhatsAppMessage | null>(null);
  const queryClient = useQueryClient();

  const send = useCallback(async (data: SendFromInsightParams): Promise<boolean> => {
    setIsSending(true);
    setError(null);

    try {
      const result = await sendWhatsAppFromInsight(data);

      if (result.success) {
        setLastResult(result.data);
        toast.success("Mensagem WhatsApp enviada com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
        queryClient.invalidateQueries({ queryKey: ["lead-tracking"] });
        queryClient.invalidateQueries({ queryKey: ["insights"] });
        queryClient.invalidateQueries({ queryKey: ["insights-new-count"] });
        return true;
      } else {
        setError(result.error);
        toast.error(`Falha ao enviar mensagem WhatsApp: ${result.error}`);
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setError(message);
      toast.error(`Falha ao enviar mensagem WhatsApp: ${message}`);
      return false;
    } finally {
      setIsSending(false);
    }
  }, [queryClient]);

  return { send, isSending, error, lastResult };
}
