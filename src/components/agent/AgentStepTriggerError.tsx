/**
 * AgentStepTriggerError
 * Story 24.3 (AC2)
 *
 * Aviso no chat para uma falha no DISPARO de um step que nao virou bolha (falha
 * pre-orchestrator: 422 de chave, 500, rede...). Mesmo visual da bolha de erro.
 * Efemero (store, fora do banco). Se a falha for retryable, oferece "Tentar novamente",
 * que redispara o mesmo step pela rota execute (guards da 24.2).
 */

"use client";

import { useState } from "react";
import { AlertCircle, Bot, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { executeStepChecked } from "@/lib/agent/client-utils";
import { reportTriggerFailure } from "@/lib/agent/report-trigger-failure";
import { formatStepErrorSentence } from "@/lib/agent/step-error-display";
import { useAgentStore, type StepTriggerFailureState } from "@/stores/use-agent-store";

interface AgentStepTriggerErrorProps {
  failure: StepTriggerFailureState;
}

export function AgentStepTriggerError({ failure }: AgentStepTriggerErrorProps) {
  const clearStepTriggerFailure = useAgentStore((s) => s.clearStepTriggerFailure);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    const { executionId, stepNumber } = failure;
    // Aguarda o resultado ANTES de limpar: o aviso continua montado (spinner/disabled)
    // durante a chamada. Depois: nova falha substitui o aviso; ok/409 o deixa limpo.
    const outcome = await executeStepChecked(executionId, stepNumber);
    setIsRetrying(false);
    clearStepTriggerFailure();
    reportTriggerFailure(outcome, executionId, stepNumber);
  };

  return (
    <div
      className="flex gap-3 max-w-[80%] mr-auto px-4"
      data-testid="step-trigger-error"
    >
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="rounded-2xl px-4 py-2.5 text-body-small bg-muted border border-destructive/50 rounded-bl-md">
        <div className="flex items-center gap-2 mb-1.5 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs font-medium">Erro</span>
        </div>
        <p className="whitespace-pre-wrap break-words">
          {formatStepErrorSentence(failure.message, failure.retryable)}
        </p>
        {failure.retryable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-7 gap-1 text-xs"
            onClick={handleRetry}
            disabled={isRetrying}
            data-testid="step-trigger-retry"
          >
            {isRetrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
