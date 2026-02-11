/**
 * Hook: useWhatsAppSend
 * Story 11.4 AC#3 — Manages WhatsApp message sending state
 *
 * Exposes: { send, isSending, error, lastResult }
 * Shows toast on success/error via sonner
 */

"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendWhatsAppMessage } from "@/actions/whatsapp";
import type { WhatsAppMessage } from "@/types/database";

interface SendParams {
  campaignId: string;
  leadEmail: string;
  phone: string;
  message: string;
}

interface UseWhatsAppSendReturn {
  send: (data: SendParams) => Promise<boolean>;
  isSending: boolean;
  error: string | null;
  lastResult: WhatsAppMessage | null;
}

export function useWhatsAppSend(): UseWhatsAppSendReturn {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<WhatsAppMessage | null>(null);
  const queryClient = useQueryClient();

  const send = useCallback(async (data: SendParams): Promise<boolean> => {
    setIsSending(true);
    setError(null);

    try {
      const result = await sendWhatsAppMessage(data);

      if (result.success) {
        setLastResult(result.data);
        toast.success("Mensagem WhatsApp enviada com sucesso!");
        // Story 11.7 AC#9: Invalidate WhatsApp messages + tracking caches
        queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
        queryClient.invalidateQueries({ queryKey: ["lead-tracking"] });
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
