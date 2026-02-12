/**
 * Import Leads Dialog Component
 * Story 12.2: Import Leads via CSV
 * Story 12.3: Apollo enrichment for imported leads
 * Story 12.4: Support for .xlsx (Excel) files
 *
 * AC: #1 - Button opens dialog
 * AC: #2 - CSV/XLSX upload via click or drag-and-drop
 * AC: #3 - Paste tabular data
 * AC: #4 - Column mapping with auto-detection
 * AC: #5 - Optional segment selection
 * AC: #7 - Import summary
 * AC: #8 - Download CSV template
 * Story 12.3 AC: #1 - Enrich button after import
 * Story 12.3 AC: #5 - Enrichment progress
 * Story 12.3 AC: #6 - Enrichment summary
 * Story 12.4 AC: #1 - Accept .xlsx files
 * Story 12.4 AC: #2 - Parse .xlsx to ParsedCSVData
 * Story 12.4 AC: #5 - Validate .xlsx MIME type
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
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TableProperties,
  FolderOpen,
  Sparkles,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  parseCSVData,
  detectLeadColumnMappings,
  type ParsedCSVData,
  type LeadColumnMappingResult,
} from "@/lib/utils/csv-parser";
import { parseXlsxData } from "@/lib/utils/xlsx-parser";
import {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
} from "@/types/campaign-import";
import type { ImportLeadRow, ImportLeadsResponse } from "@/types/lead-import";
import { useImportLeadsCsv } from "@/hooks/use-import-leads-csv";
import { useSegments, useCreateSegment } from "@/hooks/use-segments";
import { useBulkEnrichPersistedLeads } from "@/hooks/use-enrich-persisted-lead";

type ImportStep = "input" | "mapping" | "segment" | "processing" | "summary";

const LEAD_FIELDS = [
  { key: "nameColumn" as const, label: "Nome", required: true },
  { key: "lastNameColumn" as const, label: "Sobrenome", required: false },
  { key: "emailColumn" as const, label: "Email", required: false },
  { key: "companyColumn" as const, label: "Empresa", required: false },
  { key: "titleColumn" as const, label: "Cargo", required: false },
  { key: "linkedinColumn" as const, label: "LinkedIn URL", required: false },
  { key: "phoneColumn" as const, label: "Telefone", required: false },
];

const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportLeadsDialog({
  open,
  onOpenChange,
}: ImportLeadsDialogProps) {
  const [step, setStep] = useState<ImportStep>("input");
  const [parsedData, setParsedData] = useState<ParsedCSVData | null>(null);
  const [mappings, setMappings] = useState<LeadColumnMappingResult>({
    nameColumn: null,
    lastNameColumn: null,
    emailColumn: null,
    companyColumn: null,
    titleColumn: null,
    linkedinColumn: null,
    phoneColumn: null,
  });
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportLeadsResponse | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [newSegmentName, setNewSegmentName] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  // Story 12.3: Enrichment state
  const [enrichmentState, setEnrichmentState] = useState<"idle" | "running" | "done">("idle");
  const [enrichmentResult, setEnrichmentResult] = useState<{
    enriched: number;
    notFound: number;
    failed: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportLeadsCsv();
  const { data: segments } = useSegments();
  const createSegmentMutation = useCreateSegment();
  const enrichMutation = useBulkEnrichPersistedLeads();

  const isValidImportFile = useCallback((file: File): boolean => {
    const lowerName = file.name.toLowerCase();
    // Explicitly reject .xls (legacy Excel format) — AC #5
    if (lowerName.endsWith(".xls") && !lowerName.endsWith(".xlsx")) {
      return false;
    }
    const hasValidExtension = lowerName.endsWith(".csv") || lowerName.endsWith(".xlsx");
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
        setMappings({
          nameColumn: null,
          lastNameColumn: null,
          emailColumn: null,
          companyColumn: null,
          titleColumn: null,
          linkedinColumn: null,
          phoneColumn: null,
        });
        setPasteText("");
        setFileName(null);
        setError(null);
        setImportResult(null);
        setSelectedSegmentId(null);
        setNewSegmentName("");
        setIsDragOver(false);
        setEnrichmentState("idle");
        setEnrichmentResult(null);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Download CSV template (AC #8)
  const downloadTemplate = useCallback(() => {
    const template = `nome,sobrenome,email,empresa,cargo,linkedin,telefone
João,Silva,joao@empresa.com,Empresa ABC,Diretor de TI,https://linkedin.com/in/joaosilva,11999887766
Maria,Santos,maria@empresa.com,Tech Corp,CTO,,
Pedro,Oliveira,,,Gerente Comercial,,11988776655`;
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-importacao-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Drag-and-drop handlers (AC #2)
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

  // Process already-parsed data and auto-detect columns
  const processDataFromParsed = useCallback((data: ParsedCSVData) => {
    if (data.headers.length === 0) {
      setError("Nenhum dado encontrado");
      return;
    }
    if (data.rows.length === 0) {
      setError("Nenhuma linha de dados encontrada (apenas cabeçalho?)");
      return;
    }
    setParsedData(data);
    const detected = detectLeadColumnMappings(data.headers);
    setMappings(detected);
    setStep("mapping");
  }, []);

  // Process CSV/TSV text data
  const processData = useCallback((text: string) => {
    processDataFromParsed(parseCSVData(text));
  }, [processDataFromParsed]);

  const processFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`Arquivo muito grande. Limite: ${MAX_FILE_SIZE_MB}MB`);
        return;
      }
      if (!isValidImportFile(file)) {
        setError("Apenas arquivos .csv ou .xlsx são aceitos");
        return;
      }
      setFileName(file.name);
      setError(null);

      const isExcel = file.name.toLowerCase().endsWith(".xlsx");

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const buffer = event.target?.result as ArrayBuffer;
            processDataFromParsed(parseXlsxData(buffer));
          } catch {
            setError("Erro ao processar arquivo Excel. Verifique se o arquivo não está corrompido.");
          }
        };
        reader.onerror = () => setError("Erro ao ler arquivo");
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          processData(event.target?.result as string);
        };
        reader.onerror = () => setError("Erro ao ler arquivo");
        reader.readAsText(file);
      }
    },
    [isValidImportFile, processData, processDataFromParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handlePasteData = useCallback(() => {
    if (!pasteText.trim()) {
      setError("Cole os dados no campo de texto");
      return;
    }
    setError(null);
    processData(pasteText);
  }, [pasteText, processData]);

  // Update a single column mapping
  const updateMapping = useCallback(
    (key: keyof LeadColumnMappingResult, value: string) => {
      setMappings((prev) => ({
        ...prev,
        [key]: value === "-1" ? null : parseInt(value),
      }));
    },
    []
  );

  // Navigate from mapping to segment step
  const handleMappingNext = useCallback(() => {
    if (mappings.nameColumn === null) {
      setError("A coluna Nome é obrigatória");
      return;
    }
    setError(null);
    setStep("segment");
  }, [mappings.nameColumn]);

  // Handle import (AC #6)
  const handleImport = useCallback(async () => {
    if (!parsedData || mappings.nameColumn === null) return;

    setStep("processing");
    setError(null);

    // Resolve segment: create new if needed
    let segmentId: string | null = selectedSegmentId;
    if (newSegmentName.trim()) {
      try {
        const newSegment = await createSegmentMutation.mutateAsync({
          name: newSegmentName.trim(),
        });
        segmentId = newSegment.id;
      } catch {
        setError("Erro ao criar segmento");
        setStep("segment");
        return;
      }
    }

    // Build leads array from mapped columns
    const leads: ImportLeadRow[] = parsedData.rows.map((row) => ({
      firstName: row[mappings.nameColumn!] ?? "",
      lastName: mappings.lastNameColumn !== null ? (row[mappings.lastNameColumn] ?? "") : "",
      email: mappings.emailColumn !== null ? (row[mappings.emailColumn] || null) : null,
      companyName: mappings.companyColumn !== null ? (row[mappings.companyColumn] || null) : null,
      title: mappings.titleColumn !== null ? (row[mappings.titleColumn] || null) : null,
      linkedinUrl: mappings.linkedinColumn !== null ? (row[mappings.linkedinColumn] || null) : null,
      phone: mappings.phoneColumn !== null ? (row[mappings.phoneColumn] || null) : null,
    }));

    // Filter out rows with empty firstName
    const validLeads = leads.filter((l) => l.firstName.trim());

    if (validLeads.length === 0) {
      setError("Nenhum lead válido para importar (coluna Nome vazia)");
      setStep("mapping");
      return;
    }

    try {
      const result = await importMutation.mutateAsync({
        leads: validLeads,
        segmentId,
      });
      setImportResult(result);
      setStep("summary");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao importar leads"
      );
      setStep("mapping");
    }
  }, [
    parsedData,
    mappings,
    selectedSegmentId,
    newSegmentName,
    createSegmentMutation,
    importMutation,
  ]);

  // Story 12.3 AC #1: Handle enrichment of imported leads
  const handleEnrichment = useCallback(async () => {
    if (!importResult || importResult.leads.length === 0) return;

    setEnrichmentState("running");

    try {
      const result = await enrichMutation.mutateAsync(importResult.leads);
      setEnrichmentResult({
        enriched: result.enriched,
        notFound: result.notFound,
        failed: result.failed,
      });
      setEnrichmentState("done");
    } catch {
      setEnrichmentState("done");
      setEnrichmentResult({ enriched: 0, notFound: 0, failed: importResult.leads.length });
    }
  }, [importResult, enrichMutation]);

  // Get mapped fields that have a column selected (for preview)
  const activeMappings = LEAD_FIELDS.filter((f) => mappings[f.key] !== null);

  const totalRows = parsedData?.rows.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Leads</DialogTitle>
          <DialogDescription>
            Importe uma lista de leads a partir de um arquivo CSV, Excel
            (.xlsx), TSV ou ponto-e-vírgula.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-6 pr-3">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step: Input (AC #2, #3) */}
          {step === "input" && (
            <>
              {/* Download template link */}
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-primary hover:underline w-fit"
                onClick={downloadTemplate}
                data-testid="download-template-button"
              >
                <Download className="h-4 w-4" />
                Baixar modelo CSV
              </button>

              <Tabs defaultValue="upload" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload" data-testid="tab-upload">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Arquivo
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
                      accept=".csv,.xlsx"
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
                          Clique ou arraste um arquivo CSV ou Excel
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Limite: {MAX_FILE_SIZE_MB}MB
                        </p>
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="paste" className="space-y-4 pt-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="paste-data">Cole os dados abaixo</Label>
                    <Textarea
                      id="paste-data"
                      placeholder={`nome,sobrenome,email,empresa,cargo
João,Silva,joao@empresa.com,Empresa ABC,Diretor`}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={8}
                      className="font-mono text-sm"
                      data-testid="paste-textarea"
                    />
                    <p className="text-xs text-muted-foreground">
                      Formatos suportados: CSV (vírgula), TSV (tab), ou
                      ponto-e-vírgula
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
            </>
          )}

          {/* Step: Mapping (AC #4) */}
          {step === "mapping" && parsedData && (
            <>
              {/* Mapping table */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <TableProperties className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Mapeamento de colunas</span>
                </div>
                <div className="border rounded-md divide-y">
                  {LEAD_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-sm">
                        {field.label}
                        {field.required && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </span>
                      <Select
                        value={(mappings[field.key] ?? -1).toString()}
                        onValueChange={(v) => updateMapping(field.key, v)}
                      >
                        <SelectTrigger
                          id={`col-${field.key}`}
                          className="w-[200px]"
                          data-testid={`mapping-${field.key}`}
                        >
                          <SelectValue placeholder="Nenhuma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">— Nenhuma —</SelectItem>
                          {parsedData.headers.map((header, i) => (
                            <SelectItem key={i} value={i.toString()}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview — only mapped fields */}
              {activeMappings.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Preview ({Math.min(5, parsedData.rows.length)} de {parsedData.rows.length} linhas)
                    </span>
                  </div>
                  <div className="border rounded-md divide-y">
                    {parsedData.rows.slice(0, 5).map((row, rowIndex) => (
                      <div key={rowIndex} className="px-4 py-3 space-y-1">
                        {/* Name line */}
                        <p className="text-sm font-medium">
                          {row[mappings.nameColumn!] || "—"}
                          {mappings.lastNameColumn !== null && (
                            <> {row[mappings.lastNameColumn] || ""}</>
                          )}
                        </p>
                        {/* Details line */}
                        <p className="text-sm text-muted-foreground">
                          {[
                            mappings.emailColumn !== null ? row[mappings.emailColumn] : null,
                            mappings.companyColumn !== null ? row[mappings.companyColumn] : null,
                            mappings.titleColumn !== null ? row[mappings.titleColumn] : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        {/* Extra line (linkedin, phone) */}
                        {(
                          (mappings.linkedinColumn !== null && row[mappings.linkedinColumn]) ||
                          (mappings.phoneColumn !== null && row[mappings.phoneColumn])
                        ) && (
                          <p className="text-sm text-muted-foreground">
                            {[
                              mappings.linkedinColumn !== null ? row[mappings.linkedinColumn] : null,
                              mappings.phoneColumn !== null ? row[mappings.phoneColumn] : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step: Segment (AC #5) */}
          {step === "segment" && (
            <>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Segmento (opcional)</span>
              </div>

              <p className="text-sm text-muted-foreground -mt-4">
                Associe os leads importados a um segmento existente ou crie um novo.
              </p>

              <div className="flex flex-col gap-2">
                <Label htmlFor="segment-select">Segmento existente</Label>
                <Select
                  value={selectedSegmentId ?? "none"}
                  onValueChange={(v) => {
                    setSelectedSegmentId(v === "none" ? null : v);
                    if (v !== "none") setNewSegmentName("");
                  }}
                >
                  <SelectTrigger
                    id="segment-select"
                    data-testid="segment-select"
                  >
                    <SelectValue placeholder="Sem segmento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem segmento</SelectItem>
                    {segments?.map((seg) => (
                      <SelectItem key={seg.id} value={seg.id}>
                        {seg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 border-t" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="new-segment">Criar novo segmento</Label>
                <Input
                  id="new-segment"
                  placeholder="Nome do novo segmento"
                  value={newSegmentName}
                  onChange={(e) => {
                    setNewSegmentName(e.target.value);
                    if (e.target.value.trim()) setSelectedSegmentId(null);
                  }}
                  data-testid="new-segment-input"
                />
              </div>

              {/* Summary of what will be imported */}
              <div className="flex flex-col gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>
                    {totalRows} lead{totalRows !== 1 ? "s" : ""} {totalRows !== 1 ? "serão importados" : "será importado"}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Step: Processing (AC #6) */}
          {step === "processing" && (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">Processando importação...</p>
              <p className="text-sm text-muted-foreground">
                {totalRows > 0
                  ? `${totalRows} ${totalRows === 1 ? "lead sendo processado" : "leads sendo processados"}`
                  : "Isso pode levar alguns segundos"}
              </p>
            </div>
          )}

          {/* Step: Summary (AC #7) + Story 12.3 Enrichment */}
          {step === "summary" && importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  {importResult.imported} lead
                  {importResult.imported !== 1 ? "s" : ""} importado
                  {importResult.imported !== 1 ? "s" : ""}
                </span>
              </div>

              {importResult.existing > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-5 w-5" />
                  <span>
                    {importResult.existing} duplicata
                    {importResult.existing !== 1 ? "s" : ""} ignorada
                    {importResult.existing !== 1 ? "s" : ""} (email já
                    existente)
                  </span>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span>
                      {importResult.errors.length} erro
                      {importResult.errors.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="text-sm text-muted-foreground ml-7 list-disc">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Story 12.3 AC #5: Enrichment progress */}
              {enrichmentState === "running" && (
                <div
                  className="flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 p-3"
                  data-testid="enrichment-progress"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm">
                    Enriquecendo {importResult.leads.length} lead
                    {importResult.leads.length !== 1 ? "s" : ""} com Apollo...
                  </span>
                </div>
              )}

              {/* Story 12.3 AC #6: Enrichment summary */}
              {enrichmentState === "done" && enrichmentResult && (
                <div className="space-y-2 rounded-md border p-3" data-testid="enrichment-summary">
                  <span className="text-sm font-medium">Enriquecimento Apollo</span>
                  {enrichmentResult.enriched > 0 && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">
                        {enrichmentResult.enriched} enriquecido{enrichmentResult.enriched !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  {enrichmentResult.notFound > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">
                        {enrichmentResult.notFound} não encontrado{enrichmentResult.notFound !== 1 ? "s" : ""} no Apollo
                      </span>
                    </div>
                  )}
                  {enrichmentResult.failed > 0 && (
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">
                        {enrichmentResult.failed} erro{enrichmentResult.failed !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — always visible at bottom */}
        {step === "mapping" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("input")}>
              Voltar
            </Button>
            <Button
              onClick={handleMappingNext}
              disabled={mappings.nameColumn === null}
              data-testid="mapping-next-button"
            >
              Próximo
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </DialogFooter>
        )}

        {step === "segment" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("mapping")}>
              Voltar
            </Button>
            <Button
              onClick={handleImport}
              data-testid="import-button"
            >
              <Upload className="h-4 w-4 mr-2" />
              Importar {totalRows} lead{totalRows !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        )}

        {step === "summary" && (
          <DialogFooter>
            {/* Story 12.3 AC #1: Enrich button after import */}
            {enrichmentState === "idle" && importResult && importResult.leads.length > 0 && (
              <Button
                variant="outline"
                onClick={handleEnrichment}
                data-testid="enrich-button"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Enriquecer com Apollo
              </Button>
            )}
            <Button
              onClick={() => handleOpenChange(false)}
              disabled={enrichmentState === "running"}
              data-testid="close-button"
            >
              Fechar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
