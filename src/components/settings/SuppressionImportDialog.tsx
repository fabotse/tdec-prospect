"use client";

/**
 * SuppressionImportDialog
 * Story 23.5: importar a lista de supressão de um CSV (só admin), com relatório.
 */

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseSuppressionCsv } from "@/lib/utils/suppression";
import type { ActionResult } from "@/types/knowledge-base";
import {
  SUPPRESSION_IMPORT_MAX_ROWS,
  type SuppressionImportReport,
  type SuppressionImportRow,
} from "@/types/suppression";

/** UTF-8 quando válido; senão Windows-1252 (CSV salvo pelo Excel em português). */
export function decodeCsv(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

interface SuppressionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: SuppressionImportRow[]) => Promise<ActionResult<SuppressionImportReport>>;
  isImporting: boolean;
}

export function SuppressionImportDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
}: SuppressionImportDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<SuppressionImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SuppressionImportReport | null>(null);

  const reset = () => {
    setFileName(null);
    setRows(null);
    setError(null);
    setReport(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (isImporting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleText = (text: string) => {
    const parsed = parseSuppressionCsv(text);
    if (!parsed.success) {
      setRows(null);
      setError(parsed.error);
      return;
    }
    if (parsed.rows.length === 0) {
      setRows(null);
      setError("O arquivo não tem linhas para importar");
      return;
    }
    if (parsed.rows.length > SUPPRESSION_IMPORT_MAX_ROWS) {
      setRows(null);
      setError(`Máximo de ${SUPPRESSION_IMPORT_MAX_ROWS} linhas por import`);
      return;
    }
    setError(null);
    setRows(parsed.rows);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois de corrigi-lo.
    e.target.value = "";
    setReport(null);
    // Nada do arquivo anterior pode ser enviado com o nome do novo.
    setRows(null);
    setError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileName(null);
      setRows(null);
      setError("Apenas arquivos .csv são aceitos");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => handleText(decodeCsv(event.target?.result as ArrayBuffer));
    reader.onerror = () => {
      setRows(null);
      setError("Erro ao ler arquivo");
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!rows) return;
    try {
      const result = await onImport(rows);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      setRows(null);
      setReport(result.data ?? { accepted: 0, skipped: [] });
    } catch {
      setError("Erro ao importar a lista. Tente novamente.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Importar lista de supressão</DialogTitle>
          <DialogDescription>
            Arquivo .csv com cabeçalho. Uma coluna com o domínio ou e-mail (valor, dominio,
            email, site) e uma coluna motivo (cliente, negociação, concorrente, parceiro ou
            opt-out). Ex.: <code>valor;motivo</code>
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-3" data-testid="suppression-import-report">
            <p className="text-body-small">
              <strong>{report.accepted}</strong> aceitas,{" "}
              <strong>{report.skipped.length}</strong> ignoradas
            </p>
            {report.skipped.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border p-3 text-body-small">
                {report.skipped.map((s) => (
                  <li key={`${s.line}-${s.reason}`}>
                    Linha {s.line}
                    {s.value ? ` (${s.value})` : ""}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="suppression-file">Arquivo</Label>
            <Input
              id="suppression-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              disabled={isImporting}
            />
            {fileName && rows && (
              <p className="text-body-small text-foreground-muted">
                {fileName}: {rows.length} linha(s) para importar
              </p>
            )}
            {error && (
              <p className="text-body-small text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {report ? (
            <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isImporting}
              >
                Cancelar
              </Button>
              <Button onClick={handleImport} disabled={!rows || isImporting}>
                {isImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Importar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
