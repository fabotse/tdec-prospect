/**
 * AgentConfirmationCard
 * Story 24.5: Confirmacao por card com botoes
 *
 * Card exibido abaixo das mensagens enquanto o fluxo de briefing esta numa das tres
 * confirmacoes (briefing, produto, leads proprios). A decisao so acontece pelo clique.
 * Derivado do estado do hook — nunca persistido.
 */

"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BRIEFING_FIELD_LABELS,
  BRIEFING_FIELD_OPTIONS,
  CARD_ACTION_LABELS,
  formatBriefingFieldValue,
  icpDefaultChipLabel,
  referenceAnalysisCostLine,
  referenceChipLabel,
  type BriefingCardAction,
  type BriefingCardField,
} from "@/hooks/use-briefing-flow";
import { formatTargetAccountsInput, isAccountListMode } from "@/lib/agent/target-accounts";
import { formatReferenceAccounts, isLookalikeMode } from "@/lib/agent/reference-accounts";
import type { ExtractedProduct, ParsedBriefing } from "@/types/agent";

// Story 24.18: "references" = card "Analisar" dos clientes de referencia (com o custo).
export type ConfirmationCardVariant = "briefing" | "product" | "leads" | "references";

interface AgentConfirmationCardProps {
  variant: ConfirmationCardVariant;
  briefing?: ParsedBriefing | null;
  product?: ExtractedProduct | null;
  leadCount?: number;
  disabled?: boolean;
  onAction: (action: BriefingCardAction) => void;
  onEditField?: (
    field: BriefingCardField,
    raw: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

// Ordem dos chips do briefing. Story 24.17: "Contas" e o primeiro, so no modo lista.
const BRIEFING_CHIP_FIELDS: BriefingCardField[] = [
  "targetAccounts",
  "jobTitles",
  "location",
  "technology",
  "industry",
  "companySize",
  "leadCount",
  "objective",
  "urgency",
  "emailCount",
  "campaignDescription",
  "segmentName",
];

function rawFieldValue(briefing: ParsedBriefing, field: BriefingCardField): string {
  if (field === "targetAccounts") return formatTargetAccountsInput(briefing.targetAccounts);
  const value = briefing[field];
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

interface ChipEditorProps {
  field: BriefingCardField;
  initial: string;
  disabled?: boolean;
  onSave: (raw: string) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}

function ChipEditor({ field, initial, disabled, onSave, onCancel }: ChipEditorProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const options = BRIEFING_FIELD_OPTIONS[field];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await onSave(value);
      if (!result.ok) setError(result.error ?? "Valor invalido.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid={`chip-editor-${field}`}>
      <label className="text-caption font-medium text-foreground" htmlFor={`chip-input-${field}`}>
        {BRIEFING_FIELD_LABELS[field]}
        {field === "jobTitles" && (
          <span className="text-muted-foreground font-normal"> (separe por virgula)</span>
        )}
        {field === "targetAccounts" && (
          <span className="text-muted-foreground font-normal">
            {" "}
            (dominio ou Nome (dominio), separe por virgula)
          </span>
        )}
      </label>
      {options ? (
        <select
          id={`chip-input-${field}`}
          data-testid={`chip-input-${field}`}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || isSaving}
        >
          <option value="">Nao definido</option>
          {Object.entries(options).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={`chip-input-${field}`}
          data-testid={`chip-input-${field}`}
          value={value}
          type="text"
          inputMode={field === "emailCount" || field === "leadCount" ? "numeric" : undefined}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSave();
            }
            if (e.key === "Escape") onCancel();
          }}
          disabled={disabled || isSaving}
          aria-invalid={error ? true : undefined}
        />
      )}
      {error && (
        <p className="text-caption text-destructive" role="alert" data-testid={`chip-error-${field}`}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          data-testid={`chip-cancel-${field}`}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={disabled || isSaving}
          data-testid={`chip-save-${field}`}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

export function AgentConfirmationCard({
  variant,
  briefing,
  product,
  leadCount,
  disabled,
  onAction,
  onEditField,
}: AgentConfirmationCardProps) {
  const [editingField, setEditingField] = useState<BriefingCardField | null>(null);

  const actionButton = (
    action: BriefingCardAction,
    buttonVariant: "default" | "outline" | "ghost" = "default"
  ) => (
    <Button
      key={action}
      type="button"
      variant={buttonVariant}
      onClick={() => onAction(action)}
      disabled={disabled}
      data-testid={`card-action-${action}`}
    >
      {CARD_ACTION_LABELS[action]}
    </Button>
  );

  return (
    <div
      className="border-t border-border px-6 py-4"
      data-testid={`agent-confirmation-card-${variant}`}
    >
      {variant === "briefing" && briefing && (
        <>
          <p className="text-body-small font-medium text-foreground mb-3">
            Confira os parametros da prospeccao
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {BRIEFING_CHIP_FIELDS.filter((field) =>
              // Story 24.17: "Contas" so no modo lista; "Tecnologia" nao roda no modo lista.
              // Story 24.18: nem no modo contas parecidas.
              isAccountListMode(briefing)
                ? field !== "technology"
                : field !== "targetAccounts" &&
                  !(isLookalikeMode(briefing) && field === "technology")
            ).map((field) => {
              const value = briefing[field];
              const isEmpty =
                value == null || value === "" || (Array.isArray(value) && value.length === 0);
              // Story 24.14: chip vazio com default do ICP mostra "{valor} (do ICP)".
              // Story 24.18: no modo contas parecidas, "{valor} (dos seus clientes)".
              const icpLabel = isEmpty
                ? (referenceChipLabel(field, briefing) ?? icpDefaultChipLabel(field, briefing))
                : null;
              return (
                <button
                  key={field}
                  type="button"
                  data-testid={`briefing-chip-${field}`}
                  aria-pressed={editingField === field}
                  onClick={() => setEditingField(field)}
                  disabled={disabled}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption transition-colors hover:border-foreground disabled:opacity-50",
                    editingField === field && "border-foreground bg-muted",
                    isEmpty && "text-muted-foreground border-dashed"
                  )}
                >
                  <span className="font-medium">{BRIEFING_FIELD_LABELS[field]}:</span>
                  <span>{icpLabel ?? formatBriefingFieldValue(field, value)}</span>
                  <Pencil className="size-3 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {editingField && onEditField && (
            <div className="mb-3">
              <ChipEditor
                key={editingField}
                field={editingField}
                initial={rawFieldValue(briefing, editingField)}
                disabled={disabled}
                onCancel={() => setEditingField(null)}
                onSave={async (raw) => {
                  const result = await onEditField(editingField, raw);
                  if (result.ok) setEditingField(null);
                  return result;
                }}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            {actionButton("adjust_briefing", "outline")}
            {actionButton("confirm_briefing")}
          </div>
        </>
      )}

      {variant === "references" && briefing && (
        <>
          <p className="text-body-small font-medium text-foreground mb-2">
            Analisar clientes de referencia
          </p>
          <ul className="text-caption mb-2 list-disc pl-5" data-testid="reference-accounts-list">
            {(briefing.referenceAccounts ?? []).map((account, index) => (
              <li key={account.domain ?? `${account.name ?? "cliente"}-${index}`}>
                {formatReferenceAccounts([account])}
              </li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground mb-3" data-testid="reference-analysis-cost">
            {referenceAnalysisCostLine(
              (briefing.referenceAccounts ?? []).filter((a) => a.domain).length
            )}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {actionButton("use_icp_instead", "outline")}
            {actionButton("analyze_references")}
          </div>
        </>
      )}

      {variant === "product" && product && (
        <>
          <p className="text-body-small font-medium text-foreground mb-2">
            Produto: {product.name}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption mb-3">
            <dt className="text-muted-foreground">Descricao</dt>
            <dd>{product.description}</dd>
            <dt className="text-muted-foreground">Features</dt>
            <dd>{product.features || "nao informado"}</dd>
            <dt className="text-muted-foreground">Diferenciais</dt>
            <dd>{product.differentials || "nao informado"}</dd>
            <dt className="text-muted-foreground">Publico-alvo</dt>
            <dd>{product.targetAudience || "nao informado"}</dd>
          </dl>
          <div className="flex flex-wrap justify-end gap-2">
            {actionButton("skip_product", "ghost")}
            {actionButton("redo_product", "outline")}
            {actionButton("confirm_product")}
          </div>
        </>
      )}

      {variant === "leads" && (
        <>
          <p className="text-body-small font-medium text-foreground mb-3">
            {leadCount ?? 0} leads prontos para a campanha
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {actionButton("redo_leads", "outline")}
            {actionButton("confirm_leads")}
          </div>
        </>
      )}
    </div>
  );
}
