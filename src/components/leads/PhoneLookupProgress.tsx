/**
 * Phone Lookup Progress Component
 * Story 4.5: Phone Number Lookup
 *
 * AC: #4 - Batch phone lookup progress dialog
 * Shows progress indicator "Buscando telefones... X de Y"
 * Displays results as they complete
 * Cancel button to stop batch
 * Summary toast with results count
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Phone, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  batchPhoneLookup,
  type BatchPhoneLookupResult,
} from "@/hooks/use-phone-lookup";
import type { Lead } from "@/types/lead";

interface PhoneLookupProgressProps {
  /** Leads to lookup phone numbers for */
  leads: Lead[];
  /** Called when user closes the dialog (after completion or cancel) */
  onComplete: (results: BatchPhoneLookupResult[]) => void;
  /** Called when user cancels during processing */
  onCancel: () => void;
  /** Whether the dialog is open */
  open: boolean;
}

/**
 * Progress dialog for batch phone lookup
 * AC: #4 - Batch lookup with progress
 * AC: #5.1-5.5 - Progress component features
 */
export function PhoneLookupProgress({
  leads,
  onComplete,
  onCancel,
  open,
}: PhoneLookupProgressProps) {
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<BatchPhoneLookupResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const finalResultsRef = useRef<BatchPhoneLookupResult[]>([]);
  const queryClient = useQueryClient();

  // Stats
  const found = results.filter((r) => r.status === "found").length;
  const notFound = results.filter((r) => r.status === "not_found").length;
  const errors = results.filter((r) => r.status === "error").length;
  const total = leads.length;
  const progressPercent = total > 0 ? (current / total) * 100 : 0;

  // Start processing when dialog opens
  useEffect(() => {
    if (!open || isProcessing || isComplete || hasError) return;

    // Validate leads array before processing
    if (leads.length === 0) {
      setHasError(true);
      setErrorMessage("Nenhum lead selecionado para buscar telefone. Selecione leads na tabela primeiro.");
      return;
    }

    const processLeads = async () => {
      setIsProcessing(true);
      setHasError(false);
      setErrorMessage(null);
      abortControllerRef.current = new AbortController();

      try {
        const batchResults = await batchPhoneLookup(
          leads,
          (currentIndex, _totalCount, result) => {
            setCurrent(currentIndex);
            setResults((prev) => [...prev, result]);
          },
          abortControllerRef.current.signal
        );

        // Store results for when user closes dialog
        finalResultsRef.current = batchResults;

        // Invalidate queries after batch completes
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        queryClient.invalidateQueries({ queryKey: ["myLeads"] });

        setIsComplete(true);
        setIsProcessing(false);

        // Show summary toast (AC #4.5)
        const foundCount = batchResults.filter((r) => r.status === "found").length;
        toast.success(`${foundCount} telefones encontrados de ${batchResults.length} buscados`);

        // NOTE: Do NOT call onComplete here - wait for user to click "Fechar"
        // This keeps the dialog open so user can see the results
      } catch (error) {
        // Handle abort
        if (error instanceof Error && error.name === "AbortError") {
          setIsProcessing(false);
          return;
        }

        setIsProcessing(false);
        setHasError(true);
        setErrorMessage("Erro ao processar busca em lote. Tente novamente.");
        toast.error("Erro ao processar busca em lote");
      }
    };

    processLeads();
  }, [open, leads, isProcessing, isComplete, hasError, queryClient, onComplete]);

  // Handle cancel during processing (AC #5.4)
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    onCancel();
  }, [onCancel]);

  // Handle close after completion or error
  const handleClose = useCallback(() => {
    // Call onComplete with final results when user closes
    onComplete(finalResultsRef.current);
  }, [onComplete]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrent(0);
      setResults([]);
      setIsProcessing(false);
      setIsComplete(false);
      setHasError(false);
      setErrorMessage(null);
      abortControllerRef.current = null;
      finalResultsRef.current = [];
    }
  }, [open]);

  // Get lead name by ID
  const getLeadName = (leadId: string): string => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return "Lead desconhecido";
    return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  };

  // Get status icon
  const getStatusIcon = (status: BatchPhoneLookupResult["status"]) => {
    switch (status) {
      case "found":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "not_found":
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  // Handle dialog close (clicking outside or ESC)
  const handleDialogClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      if (isComplete || hasError) {
        handleClose();
      } else {
        handleCancel();
      }
    }
  }, [isComplete, hasError, handleClose, handleCancel]);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Buscando telefones
          </DialogTitle>
          <DialogDescription>
            Processando {total} leads sequencialmente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Error state */}
          {hasError && errorMessage && (
            <div className="flex items-center gap-2 p-4 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
          )}

          {/* Progress bar (AC #5.2) */}
          {!hasError && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isComplete ? "Concluído" : `Processando ${current} de ${total}`}
                </span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
            </div>
          )}

          {/* Stats summary */}
          {!hasError && (
            <div className="flex items-center justify-between text-sm border rounded-md p-3 bg-muted/50">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>{found} encontrados</span>
              </div>
              <div className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <span>{notFound} não encontrados</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span>{errors} erros</span>
              </div>
            </div>
          )}

          {/* Results list (AC #5.5) */}
          {!hasError && results.length > 0 && (
            <ScrollArea className="h-[200px] border rounded-md">
              <div className="p-2 space-y-1">
                {results.map((result, index) => (
                  <div
                    key={`${result.leadId}-${index}`}
                    className="flex items-center justify-between py-2 px-2 text-sm rounded hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getStatusIcon(result.status)}
                      <span className="truncate">{getLeadName(result.leadId)}</span>
                    </div>
                    {result.status === "found" && result.phone && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {result.phone}
                      </span>
                    )}
                    {result.status === "error" && result.error && (
                      <span className="text-xs text-destructive truncate max-w-[150px]">
                        {result.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Current lead being processed (AC #5.3) */}
          {!hasError && isProcessing && current < total && (
            <p className="text-sm text-muted-foreground text-center">
              Buscando: {getLeadName(leads[current]?.id ?? "")}
            </p>
          )}
        </div>

        <DialogFooter>
          {hasError || isComplete ? (
            <Button onClick={handleClose}>Fechar</Button>
          ) : (
            <Button variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
