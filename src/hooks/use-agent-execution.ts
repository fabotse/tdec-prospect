/**
 * Agent Execution Hook — Canal Realtime Consolidado
 * Refator: useAgentMessages → useAgentExecution
 * Origem: Retro Epic 16 — Action Item Debito Tecnico #5
 *
 * Canal unico por execucao: agent_messages (INSERT) + agent_steps (INSERT/UPDATE)
 * Substitui use-agent-messages.ts como ponto de entrada para dados realtime do agente.
 */

"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAgentStore } from "@/stores/use-agent-store";
import type { AgentMessage, AgentStep } from "@/types/agent";

// === Query Keys ===

function messagesQueryKey(executionId: string) {
  return ["agent-messages", executionId];
}

function stepsQueryKey(executionId: string) {
  return ["agent-steps", executionId];
}

// === API Functions ===

async function fetchMessages(executionId: string): Promise<AgentMessage[]> {
  const response = await fetch(`/api/agent/executions/${executionId}/messages`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar mensagens");
  }
  return result.data;
}

async function postMessage(executionId: string, content: string): Promise<AgentMessage> {
  const response = await fetch(`/api/agent/executions/${executionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, role: "user" }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao enviar mensagem");
  }
  return result.data;
}

// === Main Hook ===

/**
 * Hook consolidado para dados realtime de uma execucao do agente.
 * Canal unico Supabase: mensagens + steps.
 *
 * Uso: const { messages, steps, isLoading, isConnected } = useAgentExecution(executionId)
 */
export function useAgentExecution(executionId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const setAgentProcessing = useAgentStore((s) => s.setAgentProcessing);

  // Refetch manual — cobre race condition quando Realtime ainda nao esta conectado
  // overrideId: usado quando executionId do closure esta stale (ex: primeira mensagem cria execucao)
  const refetchMessages = useCallback(
    async (overrideId?: string) => {
      const id = overrideId || executionId;
      if (!id) return;
      // fetchQuery popula o cache mesmo se a query nao esta observada ainda
      // staleTime: 0 forca fetch fresco do API
      await queryClient.fetchQuery({
        queryKey: messagesQueryKey(id),
        queryFn: () => fetchMessages(id),
        staleTime: 0,
      });
    },
    [executionId, queryClient]
  );

  const msgKey = useMemo(() => messagesQueryKey(executionId || ""), [executionId]);
  const stepKey = useMemo(() => stepsQueryKey(executionId || ""), [executionId]);

  // Fetch messages
  const { data: messages, isLoading: isLoadingMessages } = useQuery({
    queryKey: msgKey,
    queryFn: () => fetchMessages(executionId || ""),
    enabled: !!executionId,
    staleTime: 60_000,
  });

  // Steps: populated via Realtime only (EP17 will add fetch)
  // Initialized as empty array in query cache
  const { data: steps } = useQuery<AgentStep[]>({
    queryKey: stepKey,
    queryFn: () => Promise.resolve([]),
    enabled: !!executionId,
    staleTime: Infinity,
  });

  // Realtime handler: new message
  const handleRealtimeMessage = useCallback(
    (payload: { new: unknown }) => {
      if (!executionId) return;
      const currentMsgKey = messagesQueryKey(executionId);
      const newMessage = payload.new as AgentMessage;

      queryClient.setQueryData<AgentMessage[]>(currentMsgKey, (old) => {
        if (!old) return [newMessage];
        const exists = old.some((m) => m.id === newMessage.id);
        if (exists) return old.map((m) => (m.id === newMessage.id ? newMessage : m));
        return [...old, newMessage];
      });

      if (newMessage.role === "agent" || newMessage.role === "system") {
        setAgentProcessing(false);
      }
    },
    [executionId, queryClient, setAgentProcessing]
  );

  // Realtime handler: step insert or update
  const handleRealtimeStep = useCallback(
    (payload: { new: unknown; eventType: string }) => {
      if (!executionId) return;
      const currentStepKey = stepsQueryKey(executionId);
      const updatedStep = payload.new as AgentStep;

      queryClient.setQueryData<AgentStep[]>(currentStepKey, (old) => {
        if (!old) return [updatedStep];
        const idx = old.findIndex((s) => s.id === updatedStep.id);
        if (idx >= 0) {
          const copy = [...old];
          copy[idx] = updatedStep;
          return copy;
        }
        return [...old, updatedStep];
      });
    },
    [executionId, queryClient]
  );

  // Ref para controlar retry do Realtime
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single consolidated Realtime channel
  useEffect(() => {
    if (!executionId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`agent-execution-${executionId}`)
      // Messages: INSERT only (messages are immutable)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_messages",
          filter: `execution_id=eq.${executionId}`,
        },
        handleRealtimeMessage
      )
      // Steps: INSERT (new step created) + UPDATE (status change)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_steps",
          filter: `execution_id=eq.${executionId}`,
        },
        (payload: { new: unknown }) =>
          handleRealtimeStep({ new: payload.new, eventType: "INSERT" })
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_steps",
          filter: `execution_id=eq.${executionId}`,
        },
        (payload: { new: unknown }) =>
          handleRealtimeStep({ new: payload.new, eventType: "UPDATE" })
      )
      .subscribe((status: string) => {
        setIsConnected(status === "SUBSCRIBED");

        // Ao conectar, refetch para recuperar mensagens perdidas durante subscribe
        if (status === "SUBSCRIBED") {
          queryClient.invalidateQueries({ queryKey: messagesQueryKey(executionId) });
        }

        // Retry em caso de falha na conexao
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          retryTimeoutRef.current = setTimeout(() => {
            supabase.removeChannel(channel);
            // O useEffect sera re-executado pelo React ao re-render
            setIsConnected(false);
          }, 3000);
        }
      });

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [executionId, handleRealtimeMessage, handleRealtimeStep, queryClient]);

  return {
    messages: messages || [],
    steps: steps || [],
    isLoading: isLoadingMessages,
    isConnected,
    refetchMessages,
  };
}

// === Send Message Hook (unchanged API) ===

export interface SendMessageParams {
  executionId: string;
  content: string;
}

/**
 * Hook para enviar mensagens com optimistic update.
 * API identica ao antigo useSendMessage de use-agent-messages.ts.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  const setAgentProcessing = useAgentStore((s) => s.setAgentProcessing);

  return useMutation({
    mutationFn: ({ executionId, content }: SendMessageParams) =>
      postMessage(executionId, content),
    onMutate: async ({ executionId, content }: SendMessageParams) => {
      const queryKey = messagesQueryKey(executionId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AgentMessage[]>(queryKey);

      const tempId = `temp-${Date.now()}`;
      const optimistic: AgentMessage = {
        id: tempId,
        execution_id: executionId,
        role: "user",
        content,
        metadata: { messageType: "text" },
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<AgentMessage[]>(queryKey, (old) => [...(old || []), optimistic]);
      setAgentProcessing(true);

      return { previous, tempId, queryKey };
    },
    onSuccess: (data, _params, context) => {
      if (context?.tempId && context?.queryKey) {
        queryClient.setQueryData<AgentMessage[]>(context.queryKey, (old) => {
          if (!old) return [data];
          return old.map((m) => (m.id === context.tempId ? data : m));
        });
      }
    },
    onError: (_err, params, context) => {
      const queryKey = messagesQueryKey(params.executionId);
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setAgentProcessing(false);
    },
    onSettled: (_data, _error, params) => {
      const queryKey = messagesQueryKey(params.executionId);
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
