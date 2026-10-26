/**
 * Suppression list types
 * Story: 23.5 - Lista de supressão: cadastro e import
 */

import { z } from "zod";

export const SUPPRESSION_ENTRY_TYPES = ["domain", "email"] as const;
export type SuppressionEntryType = (typeof SUPPRESSION_ENTRY_TYPES)[number];

export const SUPPRESSION_REASONS = [
  "cliente",
  "negociacao",
  "concorrente",
  "parceiro",
  "opt_out",
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** `opt_out_automatico` já existe para a 23.6 gravar sem ALTER. */
export const SUPPRESSION_SOURCES = ["manual", "import_csv", "opt_out_automatico"] as const;
export type SuppressionSource = (typeof SUPPRESSION_SOURCES)[number];

export const SUPPRESSION_ENTRY_TYPE_LABELS: Record<SuppressionEntryType, string> = {
  domain: "Domínio",
  email: "E-mail",
};

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
  cliente: "Cliente",
  negociacao: "Negociação",
  concorrente: "Concorrente",
  parceiro: "Parceiro",
  opt_out: "Opt-out",
};

export const SUPPRESSION_SOURCE_LABELS: Record<SuppressionSource, string> = {
  manual: "Manual",
  import_csv: "Import CSV",
  opt_out_automatico: "Opt-out automático",
};

/** Linha da tabela `suppression_entries` (migration 00071). */
export interface SuppressionEntry {
  id: string;
  tenant_id: string;
  entry_type: SuppressionEntryType;
  value: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  created_by: string | null;
  created_at: string;
}

/** Entrada manual: um campo "Domínio ou e-mail" + motivo. O tipo é detectado pelo valor. */
export const suppressionEntryInputSchema = z.object({
  value: z
    .string()
    .trim()
    .min(1, "Informe um domínio ou e-mail")
    .max(320, "Valor muito longo"),
  reason: z.enum(SUPPRESSION_REASONS, { message: "Motivo inválido" }),
});

export type SuppressionEntryInput = z.input<typeof suppressionEntryInputSchema>;

/** Linha de CSV já lida no cliente (normalizada de novo no servidor). */
export interface SuppressionImportRow {
  /** Nº da linha no arquivo (cabeçalho = 1). */
  line: number;
  value: string;
  reason: string;
}

export interface SuppressionImportSkipped {
  line: number;
  value: string;
  reason: string;
}

export interface SuppressionImportReport {
  accepted: number;
  skipped: SuppressionImportSkipped[];
}

/** Máximo de linhas por import. */
export const SUPPRESSION_IMPORT_MAX_ROWS = 5000;

/** Motivos de linha ignorada (relatório do import e erro do cadastro manual). */
export const SUPPRESSION_SKIP_REASONS = {
  invalidValue: "valor inválido",
  missingReason: "motivo ausente",
  unknownReason: "motivo desconhecido",
  duplicateInFile: "repetida no arquivo",
  alreadyListed: "já está na lista",
} as const;
