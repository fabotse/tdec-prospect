/**
 * VariableReference Component
 * Story 12.6: Variáveis de Personalização no Editor de Campanha
 * AC: #1, #2, #3 - Referência de variáveis visível no editor com click para inserir
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { getVariables } from "@/lib/export/variable-registry";

interface VariableReferenceProps {
  onInsert: (template: string) => void;
}

export function VariableReference({ onInsert }: VariableReferenceProps) {
  const variables = getVariables();

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="variable-reference">
      <span className="text-xs text-muted-foreground">Variáveis:</span>
      {variables.map((v) => (
        <Badge
          key={v.name}
          variant="outline"
          className="cursor-pointer hover:bg-accent text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onInsert(v.template);
          }}
          data-testid={`variable-chip-${v.name}`}
        >
          {v.template} &mdash; {v.label}
        </Badge>
      ))}
    </div>
  );
}
