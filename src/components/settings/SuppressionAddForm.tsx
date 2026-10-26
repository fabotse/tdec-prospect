"use client";

/**
 * SuppressionAddForm
 * Story 23.5: adicionar um domínio ou e-mail à lista de supressão (só admin).
 */

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeSuppressionValue } from "@/lib/utils/suppression";
import type { ActionResult } from "@/types/knowledge-base";
import {
  SUPPRESSION_REASONS,
  SUPPRESSION_REASON_LABELS,
  type SuppressionEntry,
  type SuppressionEntryInput,
  type SuppressionReason,
} from "@/types/suppression";

interface SuppressionAddFormProps {
  onAdd: (
    input: SuppressionEntryInput
  ) => Promise<ActionResult<{ duplicate: boolean; entry?: SuppressionEntry }>>;
  isAdding: boolean;
}

export function SuppressionAddForm({ onAdd, isAdding }: SuppressionAddFormProps) {
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<SuppressionReason | "">("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizeSuppressionValue(value)) {
      setError("Valor inválido: informe um domínio (empresa.com.br) ou um e-mail");
      return;
    }
    if (!reason) {
      setError("Selecione o motivo");
      return;
    }
    setError(null);

    try {
      const result = await onAdd({ value, reason });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.duplicate) {
        toast.warning("Esse valor já está na lista");
        return;
      }
      toast.success("Adicionado à lista de supressão");
      setValue("");
      setReason("");
    } catch {
      toast.error("Erro ao adicionar à lista. Tente novamente.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-end"
      data-testid="suppression-add-form"
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="suppression-value">Domínio ou e-mail</Label>
        <Input
          id="suppression-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="empresa.com.br ou joao@empresa.com.br"
          disabled={isAdding}
          aria-invalid={!!error}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:w-48">
        <Label htmlFor="suppression-reason">Motivo</Label>
        <Select
          value={reason}
          onValueChange={(v) => setReason(v as SuppressionReason)}
          disabled={isAdding}
        >
          <SelectTrigger id="suppression-reason" aria-label="Motivo">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {SUPPRESSION_REASONS.map((r) => (
              <SelectItem key={r} value={r}>
                {SUPPRESSION_REASON_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isAdding}>
        {isAdding ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        Adicionar
      </Button>
    </form>
  );
}
