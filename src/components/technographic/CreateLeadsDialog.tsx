/**
 * Create Leads Dialog
 * Story 15.5: Criacao de Leads e Integracao com Pipeline
 *
 * AC: #1 - Dialog with selected contacts count
 * AC: #4 - Success toast with created count, option to add to segment
 * AC: #5 - Segment selection dropdown
 * AC: #6 - Duplicate display
 */

"use client";

import { useState, useCallback } from "react";
import { Loader2, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateSegmentDialog } from "@/components/leads/CreateSegmentDialog";
import { useCreateTechLeads } from "@/hooks/use-create-tech-leads";
import { useSegments, useAddLeadsToSegment } from "@/hooks/use-segments";
import type { Lead } from "@/types/lead";
import type { LeadDataForImport } from "@/types/lead";

// ==============================================
// TYPES
// ==============================================

interface CreateLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContacts: Lead[];
  sourceTechnologies: string[];
  onSuccess?: () => void;
}

type DialogStep = "confirm" | "creating" | "result";

// ==============================================
// HELPERS
// ==============================================

function contactToLeadData(contact: Lead): LeadDataForImport {
  return {
    apolloId: contact.apolloId ?? "",
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    companyName: contact.companyName,
    companySize: contact.companySize,
    industry: contact.industry,
    location: contact.location,
    title: contact.title,
    linkedinUrl: contact.linkedinUrl,
    hasEmail: contact.hasEmail,
    hasDirectPhone: contact.hasDirectPhone,
  };
}

// ==============================================
// COMPONENT
// ==============================================

export function CreateLeadsDialog({
  open,
  onOpenChange,
  selectedContacts,
  sourceTechnologies,
  onSuccess,
}: CreateLeadsDialogProps) {
  const [step, setStep] = useState<DialogStep>("confirm");
  const [createdCount, setCreatedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [duplicateEmails, setDuplicateEmails] = useState<string[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("");
  const [segmentAdded, setSegmentAdded] = useState(false);
  const [createSegmentOpen, setCreateSegmentOpen] = useState(false);

  const { createLeads, isLoading: isCreating } = useCreateTechLeads();
  const { data: segments, isLoading: segmentsLoading } = useSegments();
  const addLeadsToSegment = useAddLeadsToSegment();

  const handleCreate = useCallback(() => {
    const leads = selectedContacts
      .filter((c) => c.apolloId)
      .map(contactToLeadData);

    if (leads.length === 0) return;

    const techNames = sourceTechnologies.join(", ");

    setStep("creating");

    createLeads(
      {
        leads,
        source: "theirStack + Apollo",
        sourceTechnology: techNames,
      },
      {
        onSuccess: (data) => {
          setCreatedCount(data.created);
          setSkippedCount(data.skipped);
          setDuplicateEmails(data.duplicateEmails);
          setStep("result");
          toast.success(`${data.created} leads criados com sucesso`);
        },
        onError: (error) => {
          setStep("confirm");
          toast.error(error.message || "Erro ao criar leads");
        },
      }
    );
  }, [selectedContacts, sourceTechnologies, createLeads]);

  const handleAddToSegment = useCallback(async () => {
    if (!selectedSegmentId) return;

    const leads = selectedContacts
      .filter((c) => c.apolloId)
      .map(contactToLeadData);

    try {
      await addLeadsToSegment.mutateAsync({
        segmentId: selectedSegmentId,
        leads,
      });
      setSegmentAdded(true);
      const segmentName = segments?.find((s) => s.id === selectedSegmentId)?.name;
      toast.success(`Leads adicionados ao segmento "${segmentName}"`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao adicionar ao segmento"
      );
    }
  }, [selectedSegmentId, selectedContacts, segments, addLeadsToSegment]);

  const handleSegmentCreated = useCallback(
    async (segment: { id: string; name: string }) => {
      setSelectedSegmentId(segment.id);

      const leads = selectedContacts
        .filter((c) => c.apolloId)
        .map(contactToLeadData);

      try {
        await addLeadsToSegment.mutateAsync({
          segmentId: segment.id,
          leads,
        });
        setSegmentAdded(true);
        toast.success(`Leads adicionados ao segmento "${segment.name}"`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao adicionar ao segmento"
        );
      }
    },
    [selectedContacts, addLeadsToSegment]
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
    if (createdCount > 0) {
      onSuccess?.();
    }
    // Reset state after dialog closes
    setTimeout(() => {
      setStep("confirm");
      setCreatedCount(0);
      setSkippedCount(0);
      setDuplicateEmails([]);
      setSelectedSegmentId("");
      setSegmentAdded(false);
      setCreateSegmentOpen(false);
    }, 200);
  }, [onOpenChange, onSuccess, createdCount]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]" data-testid="create-leads-dialog">
        <DialogHeader>
          <DialogTitle>Criar Leads</DialogTitle>
          <DialogDescription>
            {step === "confirm" && (
              <>{selectedContacts.length} contatos selecionados para criação de leads.</>
            )}
            {step === "creating" && "Criando leads..."}
            {step === "result" && "Resultado da criação de leads."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Step: Confirm / Creating */}
          {step === "confirm" && (
            <div className="text-sm text-muted-foreground">
              Os contatos serão salvos como leads no sistema com status &ldquo;Novo&rdquo;.
              Contatos duplicados (mesmo email) serão ignorados automaticamente.
            </div>
          )}

          {step === "creating" && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">Criando leads...</span>
            </div>
          )}

          {/* Step: Result */}
          {step === "result" && (
            <>
              <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 dark:bg-green-900/20">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium" data-testid="created-count">
                  {createdCount} lead{createdCount === 1 ? "" : "s"} criado{createdCount === 1 ? "" : "s"}
                </span>
              </div>

              {skippedCount > 0 && (
                <div
                  className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                  data-testid="duplicate-info"
                >
                  {skippedCount} contato{skippedCount === 1 ? "" : "s"} já existe{skippedCount === 1 ? "" : "m"} como leads e {skippedCount === 1 ? "foi" : "foram"} ignorado{skippedCount === 1 ? "" : "s"}.
                  {duplicateEmails.length > 0 && (
                    <span className="block mt-1 text-xs">
                      Emails duplicados: {duplicateEmails.join(", ")}
                    </span>
                  )}
                </div>
              )}

              {/* Segment selection */}
              {createdCount > 0 && !segmentAdded && (
                <div className="flex flex-col gap-3 border-t pt-3">
                  <div className="flex flex-col gap-2">
                    <Label>Adicionar a um segmento?</Label>
                    <Select
                      value={selectedSegmentId}
                      onValueChange={setSelectedSegmentId}
                    >
                      <SelectTrigger data-testid="segment-select">
                        <SelectValue placeholder="Selecionar segmento (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {segmentsLoading ? (
                          <SelectItem value="loading" disabled>
                            Carregando...
                          </SelectItem>
                        ) : (
                          segments?.map((segment) => (
                            <SelectItem key={segment.id} value={segment.id}>
                              {segment.name} ({segment.leadCount} leads)
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateSegmentOpen(true)}
                    data-testid="create-segment-trigger"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Criar novo segmento
                  </Button>

                  {createSegmentOpen && (
                    <CreateSegmentDialog
                      open={createSegmentOpen}
                      onOpenChange={setCreateSegmentOpen}
                      onSuccess={handleSegmentCreated}
                    />
                  )}

                  {selectedSegmentId && (
                    <Button
                      onClick={handleAddToSegment}
                      disabled={addLeadsToSegment.isPending}
                      size="sm"
                      data-testid="add-to-segment-button"
                    >
                      {addLeadsToSegment.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Adicionando...
                        </>
                      ) : (
                        "Adicionar ao segmento"
                      )}
                    </Button>
                  )}
                </div>
              )}

              {segmentAdded && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Leads adicionados ao segmento com sucesso
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {step === "confirm" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating}
                data-testid="create-leads-button"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Leads"
                )}
              </Button>
            </>
          )}

          {step === "result" && (
            <Button onClick={handleClose} data-testid="close-dialog-button">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
