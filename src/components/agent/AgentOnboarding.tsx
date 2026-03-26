/**
 * AgentOnboarding
 * Story 16.4: Onboarding & Selecao de Modo
 *
 * AC: #1 - Mensagem de boas-vindas explicando capacidades do agente
 */

"use client";

import { Bot, ArrowRight } from "lucide-react";

export function AgentOnboarding() {
  return (
    <div
      className="flex-1 overflow-y-auto flex items-center justify-center"
      data-testid="agent-onboarding"
    >
      <div className="text-center flex flex-col items-center gap-4 max-w-md px-6">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Bot className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-h2 text-foreground">Agente TDEC</h2>
        <div className="text-body-small text-muted-foreground flex flex-col gap-2">
          <p>
            Eu monto campanhas de prospeccao completas — da busca de empresas
            ate a ativacao de emails.
          </p>
          <p>Como funciona:</p>
          <ol className="text-left list-decimal list-inside flex flex-col gap-1">
            <li>Voce descreve quem quer prospectar</li>
            <li>Eu interpreto e extraio os parametros</li>
            <li>Voce escolhe o modo (Guiado ou Autopilot)</li>
            <li>Eu executo o pipeline passo a passo</li>
          </ol>
        </div>
        <p className="text-body-small text-foreground font-medium flex items-center gap-1.5">
          Comece descrevendo quem voce quer prospectar{" "}
          <ArrowRight className="h-4 w-4" />
        </p>
      </div>
    </div>
  );
}
