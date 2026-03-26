/**
 * Agent Messages Hooks
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #1 - Enviar mensagens do usuario
 * AC: #2 - Receber mensagens via Supabase Realtime
 * AC: #4 - Carregar historico de mensagens
 */

"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAgentStore } from "@/stores/use-agent-store";
import type { AgentMessage } from "@/types/agent";

function messagesQueryKey(executionId: string) {
  return ["agent-messages", executionId];
}

/**
 * Fetch messages for an execution
 */
async function fetchMessages(executionId: string): Promise<AgentMessage[]> {
  const response = await fetch(`/api/agent/executions/${executionId}/messages`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar mensagens");
  }
  return result.data;
}

/**
 * Send a user message to an execution
 */
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

/**
 * Hook para buscar mensagens com TanStack Query + Supabase Realtime
 * AC: #2 - Mensagens aparecem automaticamente via realtime
 * AC: #4 - Historico carregado na ordem cronologica
 */
export function useAgentMessages(executionId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const setAgentProcessing = useAgentStore((s) => s.setAgentProcessing);

  // Fix #2: Memoize queryKey to avoid new array reference every render
  const queryKey = useMemo(() => messagesQueryKey(executionId || ""), [executionId]);

  const { data: messages, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchMessages(executionId!),
    enabled: !!executionId,
    staleTime: 60_000,
  });

  // Supabase Realtime subscription
  useEffect(() => {
    if (!executionId) return;

    // Reconstruct key inside effect to avoid dependency on queryKey ref
    const currentQueryKey = messagesQueryKey(executionId);
    const supabase = createClient();
    const channel = supabase
      .channel(`agent-messages-${executionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_messages",
          filter: `execution_id=eq.${executionId}`,
        },
        (payload) => {
          const newMessage = payload.new as AgentMessage;
          // Fix #3: De-dup by ID only — don't remove unrelated temp messages
          queryClient.setQueryData<AgentMessage[]>(currentQueryKey, (old) => {
            if (!old) return [newMessage];
            const exists = old.some((m) => m.id === newMessage.id);
            if (exists) return old.map((m) => (m.id === newMessage.id ? newMessage : m));
            return [...old, newMessage];
          });

          // Desligar indicador de processamento quando mensagem do agente chega
          if (newMessage.role === "agent" || newMessage.role === "system") {
            setAgentProcessing(false);
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [executionId, queryClient, setAgentProcessing]);

  return { messages: messages || [], isLoading, isConnected };
}

/**
 * Params para envio de mensagem — executionId passado no mutate,
 * nao capturado no hook, evitando race condition (Fix #1)
 */
export interface SendMessageParams {
  executionId: string;
  content: string;
}

/**
 * Hook para enviar mensagens com optimistic update
 * AC: #1 - Mensagem aparece imediatamente na lista
 *
 * Fix #1: executionId vem via mutate params, nao como parametro do hook,
 * eliminando race condition quando execucao e criada e mensagem enviada no mesmo handler.
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

      // Ligar indicador de processamento
      setAgentProcessing(true);

      return { previous, tempId, queryKey };
    },
    // Fix #3: Replace specific temp message with server response
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
