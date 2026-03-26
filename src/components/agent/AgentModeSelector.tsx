/**
 * AgentModeSelector
 * Story 16.4: Onboarding & Selecao de Modo
 *
 * AC: #3 - Seletor de modo Guiado/Autopilot com descricoes claras
 * AC: #4 - Confirmar selecao e salvar modo
 */

"use client";

import { useState } from "react";
import { ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExecutionMode } from "@/types/agent";

interface AgentModeSelectorProps {
  onModeSelect: (mode: ExecutionMode) => void;
  defaultMode?: ExecutionMode;
  isSubmitting?: boolean;
}

const modes = [
  {
    value: "guided" as ExecutionMode,
    icon: ShieldCheck,
    title: "Guiado",
    description: "Vou pedir sua aprovacao em cada etapa",
    testId: "mode-guided",
  },
  {
    value: "autopilot" as ExecutionMode,
    icon: Zap,
    title: "Autopilot",
    description: "Executo tudo sem interrupcoes",
    testId: "mode-autopilot",
  },
];

export function AgentModeSelector({ onModeSelect, defaultMode, isSubmitting }: AgentModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<ExecutionMode | null>(
    defaultMode ?? null
  );

  return (
    <div
      className="border-t border-border px-6 py-4"
      data-testid="agent-mode-selector"
    >
      <p className="text-body-small font-medium text-foreground mb-3">
        Escolha o modo de operacao
      </p>
      <div className="grid grid-cols-2 gap-3">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isSelected = selectedMode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              data-testid={mode.testId}
              aria-pressed={isSelected}
              onClick={() => setSelectedMode(mode.value)}
              disabled={isSubmitting}
              className={cn(
                "border rounded-lg p-4 cursor-pointer hover:border-foreground transition-colors text-left",
                isSelected && "border-foreground bg-muted"
              )}
            >
              <div className="flex flex-col gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-body-small font-medium text-foreground">
                  {mode.title}
                </span>
                <span className="text-caption text-muted-foreground">
                  {mode.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end mt-3">
        <Button
          data-testid="mode-confirm-btn"
          disabled={!selectedMode || isSubmitting}
          onClick={() => selectedMode && onModeSelect(selectedMode)}
        >
          {isSubmitting ? "Confirmando..." : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}
