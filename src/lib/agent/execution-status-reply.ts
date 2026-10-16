/**
 * Story 24.4 — resposta deterministica a texto livre numa execucao ja confirmada.
 *
 * Antes, fora do ajuste pos-rejeicao (22.13), a mensagem do usuario so era persistida e
 * ficava sem resposta (beco sem saida). Aqui o agente responde com o estado atual e a
 * acao concreta disponivel, lendo apenas os `steps` ja carregados — sem LLM (NFR < 5s) e
 * apontando so para controles que ja existem: o card do gate, o "Tentar novamente" da
 * 24.3 e o "Nova conversa". Sem acentos, como as demais mensagens do agente.
 */

import { STEP_LABELS } from "@/types/agent";
import type { AgentStep, StepStatus } from "@/types/agent";
import { isStepErrorRetryable } from "@/lib/agent/step-error-display";

type StatusStep = Pick<AgentStep, "step_number" | "step_type" | "status" | "output">;

const OPENING =
  "O briefing desta execucao ja esta confirmado e nao muda por mensagem.";

const DONE_STATUSES: readonly StepStatus[] = ["completed", "approved", "skipped"];

function labelOf(step: StatusStep): string {
  return STEP_LABELS[step.step_type] ?? step.step_type;
}

/**
 * Prioridade: `failed` > `awaiting_approval` > `running` > todos concluidos >
 * proximo `pending` > lista vazia. Funcao PURA.
 */
export function buildExecutionStatusReply(steps: readonly StatusStep[]): string {
  const ordered = [...steps].sort((a, b) => a.step_number - b.step_number);
  const total = ordered.length;

  if (total === 0) {
    return `${OPENING} A execucao esta em andamento e as etapas ainda estao sendo preparadas. Acompanhe o progresso por aqui; se quiser recomecar do zero, use "Nova conversa".`;
  }

  const failed = ordered.find((s) => s.status === "failed");
  if (failed) {
    const label = labelOf(failed);
    if (isStepErrorRetryable(failed)) {
      return `${OPENING} A etapa "${label}" (etapa ${failed.step_number} de ${total}) falhou. Use o botao "Tentar novamente" na etapa para refaze-la, ou "Nova conversa" para recomecar.`;
    }
    return `${OPENING} A etapa "${label}" (etapa ${failed.step_number} de ${total}) falhou e essa falha nao pode ser refeita por aqui. Entre em contato com o suporte, ou use "Nova conversa" para recomecar.`;
  }

  const awaiting = ordered.find((s) => s.status === "awaiting_approval");
  if (awaiting) {
    return `${OPENING} A etapa "${labelOf(awaiting)}" (etapa ${awaiting.step_number} de ${total}) esta aguardando sua aprovacao. Use os botoes do card da etapa para aprovar ou rejeitar; se rejeitar, me diga o ajuste que voce quer.`;
  }

  const running = ordered.find((s) => s.status === "running");
  if (running) {
    return `${OPENING} Estou executando a etapa ${running.step_number} de ${total} ("${labelOf(running)}"). Acompanhe o progresso por aqui; aviso assim que ela terminar.`;
  }

  if (ordered.every((s) => DONE_STATUSES.includes(s.status))) {
    return `${OPENING} Todas as etapas foram concluidas. Para comecar uma nova prospeccao, use "Nova conversa".`;
  }

  const next = ordered.find((s) => s.status === "pending");
  if (next) {
    return `${OPENING} A proxima etapa e "${labelOf(next)}" (etapa ${next.step_number} de ${total}), aguardando inicio. Acompanhe o progresso por aqui; se quiser recomecar do zero, use "Nova conversa".`;
  }

  return `${OPENING} A execucao esta em andamento. Acompanhe o progresso por aqui; se quiser recomecar do zero, use "Nova conversa".`;
}

/**
 * Story 24.4 — briefing ja confirmado, mas a execucao ainda nao comecou (seletor de modo
 * ou plano visivel). A mensagem tambem recebe resposta, apontando o controle na tela.
 */
export function buildPreExecutionReply(opts: {
  showModeSelector: boolean;
  showExecutionPlan: boolean;
}): string {
  if (opts.showExecutionPlan) {
    return `${OPENING} Revise o plano acima e clique em "Confirmar" para iniciar, ou em "Cancelar" para voltar e ajustar o briefing.`;
  }
  if (opts.showModeSelector) {
    return `${OPENING} Escolha o modo de operacao acima (Guiado ou Autopilot) para seguir para o plano.`;
  }
  return `${OPENING} Aguarde o plano de execucao aparecer para confirmar; se quiser recomecar do zero, use "Nova conversa".`;
}
