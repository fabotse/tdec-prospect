/**
 * AgentInput
 * Story 16.1: Input basico
 * Story 16.2: Integrar com useSendMessage
 * Story 16.4: Prop disabled para bloquear durante selecao de modo
 *
 * AC: #1 - Enviar mensagem ao pressionar Enter ou clicar no botao
 * AC 16.4: #3 - Input desabilitado durante selecao de modo
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentStore } from "@/stores/use-agent-store";

interface AgentInputProps {
  onSendMessage: (content: string) => void;
  isSending: boolean;
  disabled?: boolean;
}

export function AgentInput({ onSendMessage, isSending, disabled: externalDisabled }: AgentInputProps) {
  // Inicializador lazy (code review 22.14): `subscribe` so reage a TRANSICOES, entao um
  // draft gravado antes deste efeito montar (ou enquanto o input estava desmontado) ficaria
  // preso na store para sempre — e um segundo clique no mesmo chip seria descartado pelo
  // guard `draft === previous.chatInputDraft`. Ler o valor corrente no mount fecha a janela.
  const [message, setMessage] = useState(() => useAgentStore.getState().chatInputDraft ?? "");
  const isInputDisabled = useAgentStore((s) => s.isInputDisabled);
  const isAgentProcessing = useAgentStore((s) => s.isAgentProcessing);
  // Story 22.13 (AC1): em ajuste pos-rejeicao o input ORIENTA o que escrever. O input
  // ja ficava habilitado pos-briefing — o que faltava era dizer ao usuario que a resposta
  // agora tem um consumidor.
  const adjustingStep = useAgentStore((s) => s.adjustingStep);
  const inputRef = useRef<HTMLInputElement>(null);

  // Story 22.14 (AC3): chip de localizacao SEM delta deterministico pre-preenche o input
  // em vez de inventar geografia. O usuario revisa e envia — um clique NUNCA dispara uma
  // busca paga sozinho.
  //
  // Por que `subscribe` e nao `useAgentStore((s) => s.chatInputDraft)` + efeito: ler o
  // valor e chamar `setMessage` no CORPO do efeito e exatamente o que a regra
  // `react-hooks/set-state-in-effect` proibe (cascata de renders). Assinar a store e
  // reagir no CALLBACK e o padrao que a propria regra indica para sincronizar com um
  // sistema externo.
  useEffect(() => {
    // Consome o draft que o inicializador lazy acabou de ler: sem isto ele reapareceria no
    // proximo mount. E uma acao de store (nao um setState), entao nao viola
    // `react-hooks/set-state-in-effect`.
    if (useAgentStore.getState().chatInputDraft) {
      useAgentStore.getState().setChatInputDraft(null);
    }

    return useAgentStore.subscribe((state, previous) => {
      // "Nova conversa" zera o `currentExecutionId`. O draft ja foi COPIADO para o estado
      // local aqui dentro, entao o `setChatInputDraft(null)` do cancelamento nao alcanca a
      // caixa de texto — a sugestao do chip da execucao encerrada sobrevivia visivel na
      // conversa nova (code review 22.14). Limpar na troca de execucao e o que o comentario
      // do `cancelCurrentExecution` sempre prometeu.
      if (state.currentExecutionId !== previous.currentExecutionId) {
        setMessage("");
        return;
      }

      const draft = state.chatInputDraft;
      if (!draft || draft === previous.chatInputDraft) return;
      setMessage(draft);
      // Consome o sinal na hora: sem isto, apagar o texto e um re-render o traria de volta.
      useAgentStore.getState().setChatInputDraft(null);
      inputRef.current?.focus();
    });
  }, []);

  const disabled = isInputDisabled || isSending || isAgentProcessing || externalDisabled;

  const placeholder = externalDisabled
    ? "Selecione o modo acima..."
    : adjustingStep
      ? adjustingStep.phase === "confirm"
        ? 'Confirme para eu executar de novo (ex.: "sim") — ou descreva outro ajuste...'
        : "Descreva o ajuste — ex.: 'remove o filtro de tamanho'"
      : "Descreva sua campanha de prospeccao...";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    onSendMessage(message.trim());
    setMessage("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border px-6 py-3.5 flex items-center gap-3"
      data-testid="agent-input"
    >
      <Input
        ref={inputRef}
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-foreground text-body"
        aria-label="Mensagem para o agente"
      />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        disabled={!message.trim() || disabled}
        aria-label="Enviar mensagem"
      >
        <SendHorizontal className="h-5 w-5" />
      </Button>
    </form>
  );
}
