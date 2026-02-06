/**
 * Import Campaign Results Dialog Component
 * Story 4.7: Import Campaign Results
 *
 * AC: #1 - Dialog with CSV upload and paste options
 * AC: #2 - CSV upload with preview
 * AC: #3 - Paste data option
 * AC: #4 - Column mapping UI
 */

"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  ClipboardPaste,
  FileText,
  Loader2,
  AlertCircle,
  X,
  Download,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useImportCampaignResults } from "@/hooks/use-import-campaign-results";
import {
  parseCSVData,
  detectColumnMappings,
  parseResponseType,
  isValidEmail,
  type ParsedCSVData,
} from "@/lib/utils/csv-parser";
import {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  type CampaignResultRow,
  type ImportCampaignResultsResponse,
} from "@/types/campaign-import";
import { ImportResultsSummary } from "./ImportResultsSummary";

type ImportStep = "input" | "mapping" | "processing" | "summary";

interface ImportCampaignResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog for importing campaign results
 * Multi-step flow: input -> mapping -> processing -> summary
 */
export function ImportCampaignResultsDialog({
  open,
  onOpenChange,
}: ImportCampaignResultsDialogProps) {
  const [step, setStep] = useState<ImportStep>("input");
  const [parsedData, setParsedData] = useState<ParsedCSVData | null>(null);
  const [emailColumn, setEmailColumn] = useState<number>(-1);
  const [responseColumn, setResponseColumn] = useState<number>(-1);
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] =
    useState<ImportCampaignResultsResponse | null>(null);
  const [processingCount, setProcessingCount] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportCampaignResults();
  const [isDragOver, setIsDragOver] = useState(false);

  // Allowed MIME types for CSV files
  const ALLOWED_MIME_TYPES = [
    "text/csv",
    "text/plain",
    "application/csv",
    "application/vnd.ms-excel",
  ];

  // Check if file is valid CSV
  const isValidCSVFile = useCallback((file: File): boolean => {
    const hasValidExtension = file.name.toLowerCase().endsWith(".csv");
    const hasValidMimeType = ALLOWED_MIME_TYPES.some(
      (type) => file.type === type || file.type === ""
    );
    return hasValidExtension || hasValidMimeType;
  }, []);

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setStep("input");
        setParsedData(null);
        setEmailColumn(-1);
        setResponseColumn(-1);
        setPasteText("");
        setFileName(null);
        setError(null);
        setImportResult(null);
        setIsDragOver(false);
        setProcessingCount(0);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Download CSV template
  const downloadTemplate = useCallback(() => {
    const template = `email,status
joao@empresa.com,replied
maria@empresa.com,bounced
pedro@empresa.com,clicked
ana@empresa.com,opened
carlos@empresa.com,unsubscribed`;
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-importacao-campanha.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Handle drag events for drag-and-drop upload (AC #2)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Arquivo muito grande. Limite: ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    // Check file type using improved validation
    if (!isValidCSVFile(file)) {
      setError("Apenas arquivos CSV sao aceitos");
      return;
    }

    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processData(text);
    };
    reader.onerror = () => {
      setError("Erro ao ler arquivo");
    };
    reader.readAsText(file);
  }, [isValidCSVFile]);

  // Handle file selection
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Check file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`Arquivo muito grande. Limite: ${MAX_FILE_SIZE_MB}MB`);
        return;
      }

      // Check file type using improved validation
      if (!isValidCSVFile(file)) {
        setError("Apenas arquivos CSV sao aceitos");
        return;
      }

      setFileName(file.name);
      setError(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        processData(text);
      };
      reader.onerror = () => {
        setError("Erro ao ler arquivo");
      };
      reader.readAsText(file);
    },
    [isValidCSVFile]
  );

  // Handle paste data
  const handlePasteData = useCallback(() => {
    if (!pasteText.trim()) {
      setError("Cole os dados no campo de texto");
      return;
    }
    setError(null);
    processData(pasteText);
  }, [pasteText]);

  // Process CSV/TSV data
  const processData = useCallback((text: string) => {
    try {
      const data = parseCSVData(text);

      if (data.headers.length === 0) {
        setError("Nenhum dado encontrado");
        return;
      }

      if (data.rows.length === 0) {
        setError("Nenhuma linha de dados encontrada (apenas cabecalho?)");
        return;
      }

      setParsedData(data);

      // Auto-detect columns
      const mappings = detectColumnMappings(data.headers);
      setEmailColumn(mappings.emailColumn ?? -1);
      setResponseColumn(mappings.responseColumn ?? -1);

      setStep("mapping");
    } catch (err) {
      console.error("[ImportCampaignResultsDialog] Error parsing data:", err);
      setError("Erro ao processar dados. Verifique o formato.");
    }
  }, []);

  // Handle import
  const handleImport = useCallback(async () => {
    if (!parsedData || emailColumn < 0 || responseColumn < 0) return;

    setStep("processing");
    setError(null);

    // Build results array
    const results: CampaignResultRow[] = [];
    const skipped: string[] = [];

    for (const row of parsedData.rows) {
      const email = row[emailColumn]?.trim();
      const responseValue = row[responseColumn]?.trim();

      // Skip invalid rows
      if (!email || !isValidEmail(email)) {
        if (email) skipped.push(`Email invalido: ${email}`);
        continue;
      }

      if (!responseValue) {
        skipped.push(`Sem resposta: ${email}`);
        continue;
      }

      const responseType = parseResponseType(responseValue);

      results.push({
        email,
        responseType,
        originalData: parsedData.headers.reduce(
          (acc, header, i) => {
            acc[header] = row[i] || "";
            return acc;
          },
          {} as Record<string, string>
        ),
      });
    }

    if (results.length === 0) {
      setError("Nenhum resultado valido para importar");
      setStep("mapping");
      return;
    }

    // Set processing count for progress indicator (AC #5)
    setProcessingCount(results.length);

    try {
      const result = await importMutation.mutateAsync({
        results,
        createMissingLeads: false,
      });
      setImportResult(result);
      setStep("summary");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao importar resultados"
      );
      setStep("mapping");
    }
  }, [parsedData, emailColumn, responseColumn, importMutation]);

  // Handle create missing leads
  const handleCreateMissingLeads = useCallback(async () => {
    if (!parsedData || emailColumn < 0 || responseColumn < 0 || !importResult)
      return;

    setStep("processing");

    // Build results for unmatched emails only
    const results: CampaignResultRow[] = [];

    for (const row of parsedData.rows) {
      const email = row[emailColumn]?.trim();
      if (!email || !importResult.unmatched.includes(email)) continue;

      const responseValue = row[responseColumn]?.trim();
      if (!responseValue) continue;

      results.push({
        email,
        responseType: parseResponseType(responseValue),
      });
    }

    try {
      const result = await importMutation.mutateAsync({
        results,
        createMissingLeads: true,
      });

      // Merge results
      setImportResult((prev) =>
        prev
          ? {
              ...prev,
              created: (prev.created || 0) + (result.created || 0),
              unmatched: result.unmatched,
            }
          : result
      );
      setStep("summary");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar leads"
      );
      setStep("summary");
    }
  }, [parsedData, emailColumn, responseColumn, importResult, importMutation]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Resultados de Campanha</DialogTitle>
          <DialogDescription>
            Importe resultados de campanhas externas (Instantly, Snov.io, etc.)
            para atualizar o status dos leads.
          </DialogDescription>
          <Button
            variant="link"
            size="sm"
            className="w-fit p-0 h-auto"
            onClick={downloadTemplate}
            data-testid="download-template-button"
          >
            <Download className="h-3 w-3 mr-1" />
            Baixar modelo CSV
          </Button>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Step: Input */}
        {step === "input" && (
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" data-testid="tab-upload">
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </TabsTrigger>
              <TabsTrigger value="paste" data-testid="tab-paste">
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Colar Dados
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4 pt-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                data-testid="upload-dropzone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="file-input"
                />
                {fileName ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-8 w-8 text-primary" />
                    <span className="font-medium">{fileName}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFileName(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Clique ou arraste um arquivo CSV
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Limite: {MAX_FILE_SIZE_MB}MB
                    </p>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="paste" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="paste-data">Cole os dados abaixo</Label>
                <Textarea
                  id="paste-data"
                  placeholder="email,status
joao@example.com,replied
maria@example.com,bounced"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                  data-testid="paste-textarea"
                />
                <p className="text-xs text-muted-foreground">
                  Formatos suportados: CSV (virgula), TSV (tab), ou ponto-e-virgula
                </p>
              </div>
              <Button
                onClick={handlePasteData}
                disabled={!pasteText.trim()}
                data-testid="process-paste-button"
              >
                Processar Dados
              </Button>
            </TabsContent>
          </Tabs>
        )}

        {/* Step: Mapping */}
        {step === "mapping" && parsedData && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email-column">
                  Coluna de Email <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={emailColumn.toString()}
                  onValueChange={(v) => setEmailColumn(parseInt(v))}
                >
                  <SelectTrigger id="email-column" data-testid="email-column-select">
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    {parsedData.headers.map((header, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="response-column">
                  Coluna de Resposta <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={responseColumn.toString()}
                  onValueChange={(v) => setResponseColumn(parseInt(v))}
                >
                  <SelectTrigger
                    id="response-column"
                    data-testid="response-column-select"
                  >
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    {parsedData.headers.map((header, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview (primeiras 5 linhas)</Label>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {parsedData.headers.map((header, i) => (
                        <th
                          key={i}
                          className={`px-3 py-2 text-left font-medium ${
                            i === emailColumn || i === responseColumn
                              ? "bg-primary/10"
                              : ""
                          }`}
                        >
                          {header}
                          {i === emailColumn && (
                            <span className="ml-1 text-xs text-primary">
                              (Email)
                            </span>
                          )}
                          {i === responseColumn && (
                            <span className="ml-1 text-xs text-primary">
                              (Resposta)
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.rows.slice(0, 5).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={`px-3 py-2 ${
                              cellIndex === emailColumn ||
                              cellIndex === responseColumn
                                ? "bg-primary/5"
                                : ""
                            }`}
                          >
                            {cell || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Total de linhas: {parsedData.rows.length}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("input")}>
                Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={emailColumn < 0 || responseColumn < 0}
                data-testid="import-button"
              >
                Importar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Processando importacao...</p>
            <p className="text-sm text-muted-foreground">
              {processingCount > 0
                ? `${processingCount} ${processingCount === 1 ? "lead" : "leads"} sendo ${processingCount === 1 ? "processado" : "processados"}`
                : "Isso pode levar alguns segundos"}
            </p>
          </div>
        )}

        {/* Step: Summary */}
        {step === "summary" && importResult && (
          <div className="space-y-4">
            <ImportResultsSummary
              result={importResult}
              onCreateMissingLeads={
                importResult.unmatched.length > 0
                  ? handleCreateMissingLeads
                  : undefined
              }
            />
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
