/**
 * Hook: useWhatsAppBulkSend
 * Story 11.6 AC#5, AC#7 — Manages bulk WhatsApp sending queue
 *
 * Client-side orchestration: processes leads sequentially via sendWhatsAppMessage server action.
 * Applies humanized jitter intervals between sends. Supports cancel mid-send.
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sendWhatsAppMessage } from "@/actions/whatsapp";

// ==============================================
// TYPES
// ==============================================

export interface BulkSendLead {
  leadEmail: string;
  phone: string;
  firstName?: string;
  lastName?: string;
}

export type BulkLeadStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

export interface BulkSendProgress {
  total: number;
  sent: number;
  failed: number;
  cancelled: number;
  current: number;
}

export interface BulkSendParams {
  campaignId: string;
  leads: BulkSendLead[];
  message: string;
  intervalMs: number;
  onLeadSent?: (leadEmail: string) => void;
}

interface UseWhatsAppBulkSendReturn {
  start: (params: BulkSendParams) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  isRunning: boolean;
  isComplete: boolean;
  isCancelled: boolean;
  isWaiting: boolean;
  progress: BulkSendProgress;
  leadStatuses: Map<string, BulkLeadStatus>;
  leadErrors: Map<string, string>;
}

// ==============================================
// HELPERS
// ==============================================

function getHumanizedInterval(baseMs: number): number {
  const jitterFactor = 0.2;
  const jitter = baseMs * jitterFactor;
  return baseMs + (Math.random() * 2 - 1) * jitter;
}

// ==============================================
// HOOK
// ==============================================

export function useWhatsAppBulkSend(): UseWhatsAppBulkSendReturn {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [progress, setProgress] = useState<BulkSendProgress>({
    total: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    current: 0,
  });
  const [leadStatuses, setLeadStatuses] = useState<Map<string, BulkLeadStatus>>(new Map());
  const [isWaiting, setIsWaiting] = useState(false);
  const [leadErrors, setLeadErrors] = useState<Map<string, string>>(new Map());

  const cancelRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayResolveRef = useRef<(() => void) | null>(null);

  const cancellableDelay = useCallback((ms: number): Promise<void> => {
    return new Promise((resolve) => {
      delayResolveRef.current = resolve;
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        delayResolveRef.current = null;
        resolve();
      }, ms);
    });
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setIsWaiting(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // Resolve pending delay so the loop can exit
    if (delayResolveRef.current) {
      delayResolveRef.current();
      delayResolveRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = false;
    setIsRunning(false);
    setIsComplete(false);
    setIsCancelled(false);
    setIsWaiting(false);
    setProgress({ total: 0, sent: 0, failed: 0, cancelled: 0, current: 0 });
    setLeadStatuses(new Map());
    setLeadErrors(new Map());
  }, []);

  const start = useCallback(
    async (params: BulkSendParams) => {
      const { campaignId, leads, message, intervalMs, onLeadSent } = params;

      // Initialize state
      cancelRef.current = false;
      setIsRunning(true);
      setIsComplete(false);
      setIsCancelled(false);

      const initialStatuses = new Map<string, BulkLeadStatus>();
      leads.forEach((lead) => initialStatuses.set(lead.leadEmail, "pending"));
      setLeadStatuses(initialStatuses);
      setLeadErrors(new Map());
      setProgress({
        total: leads.length,
        sent: 0,
        failed: 0,
        cancelled: 0,
        current: 0,
      });

      let sentCount = 0;
      let failedCount = 0;

      for (let i = 0; i < leads.length; i++) {
        if (cancelRef.current) {
          // Mark remaining leads as cancelled
          const cancelledCount = leads.length - i;
          setLeadStatuses((prev) => {
            const next = new Map(prev);
            for (let j = i; j < leads.length; j++) {
              next.set(leads[j].leadEmail, "cancelled");
            }
            return next;
          });
          setProgress((prev) => ({
            ...prev,
            cancelled: cancelledCount,
          }));
          setIsCancelled(true);
          setIsRunning(false);
          return;
        }

        const lead = leads[i];

        // Mark current lead as sending
        setLeadStatuses((prev) => new Map(prev).set(lead.leadEmail, "sending"));
        setProgress((prev) => ({ ...prev, current: i }));

        // Send message via server action
        try {
          const result = await sendWhatsAppMessage({
            campaignId,
            leadEmail: lead.leadEmail,
            phone: lead.phone,
            message,
          });

          if (result.success) {
            sentCount++;
            setLeadStatuses((prev) => new Map(prev).set(lead.leadEmail, "sent"));
            setProgress((prev) => ({ ...prev, sent: sentCount }));
            onLeadSent?.(lead.leadEmail);
          } else {
            failedCount++;
            setLeadStatuses((prev) => new Map(prev).set(lead.leadEmail, "failed"));
            setLeadErrors((prev) => new Map(prev).set(lead.leadEmail, result.error));
            setProgress((prev) => ({ ...prev, failed: failedCount }));
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
          setLeadStatuses((prev) => new Map(prev).set(lead.leadEmail, "failed"));
          setLeadErrors((prev) => new Map(prev).set(lead.leadEmail, errorMessage));
          setProgress((prev) => ({ ...prev, failed: failedCount }));
        }

        // Wait interval between sends (not after last lead)
        if (i < leads.length - 1 && !cancelRef.current) {
          const delay = getHumanizedInterval(intervalMs);
          setIsWaiting(true);
          await cancellableDelay(delay);
          setIsWaiting(false);
        }
      }

      // Story 11.7 AC#9: Invalidate WhatsApp messages + tracking caches after bulk
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
      queryClient.invalidateQueries({ queryKey: ["lead-tracking"] });

      setIsComplete(true);
      setIsRunning(false);
    },
    [cancellableDelay, queryClient]
  );

  return {
    start,
    cancel,
    reset,
    isRunning,
    isComplete,
    isCancelled,
    isWaiting,
    progress,
    leadStatuses,
    leadErrors,
  };
}
