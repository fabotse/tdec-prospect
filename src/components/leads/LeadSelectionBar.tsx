/**
 * Lead Selection Bar
 * Story: 3.6 - Lead Selection (Individual & Batch)
 * Story: 4.1 - Lead Segments/Lists
 * Story: 4.2 - Lead Status Management
 * Story: 4.2.1 - Lead Import Mechanism
 * Story: 4.4.1 - Lead Data Enrichment
 * Story: 4.5 - Phone Number Lookup
 * Story: 5.7 - Campaign Lead Association
 * Story: 12.5 - Deleção de Leads
 *
 * AC: #1 - Selection bar appears at bottom when leads selected
 * AC: #3 - Action buttons: "Criar Campanha", dropdown menu
 * AC: #5 - Clear selection functionality
 * AC: #6 - Bar not visible when no selection
 * Story 4.1: AC #2 - "Adicionar ao Segmento" button in selection bar
 * Story 4.2: AC #4 - Bulk status update from selection bar
 * Story 4.2.1: AC #1 - "Importar Leads" button in selection bar
 * Story 4.4.1: AC #4 - Bulk enrichment from selection bar
 * Story 4.5: AC #4 - Batch phone lookup from selection bar
 * Story 5.7: AC #6 - "Criar Campanha" redirects with pre-selected leads
 * Story 12.5: AC #2 - Deleção em massa from selection bar
 */

"use client";

import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { useSelectionStore } from "@/stores/use-selection-store";
import { useBulkUpdateStatus } from "@/hooks/use-lead-status";
import { useImportLeads, type LeadDataForImport } from "@/hooks/use-import-leads";
import { useDeleteLeads } from "@/hooks/use-delete-leads";
import { DeleteLeadsDialog } from "./DeleteLeadsDialog";
import { useEnrichPersistedLead } from "@/hooks/use-enrich-persisted-lead";
import { useIcebreakerEnrichment, estimateIcebreakerCost } from "@/hooks/use-icebreaker-enrichment";
import { IcebreakerCategorySelect } from "./IcebreakerCategorySelect";
import { DEFAULT_ICEBREAKER_CATEGORY } from "@/types/ai-prompt";
import type { IcebreakerCategory } from "@/types/ai-prompt";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, X, RefreshCw, Loader2, Download, Phone, Sparkles, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { NativeMagnetic } from "@/components/ui/native-magnetic";
import { useRouter } from "next/navigation";
import { SegmentDropdown } from "./SegmentDropdown";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { PhoneLookupProgress } from "./PhoneLookupProgress";
import { LEAD_STATUSES, type LeadStatus } from "@/types/lead";
import type { Lead } from "@/types/lead";

interface LeadSelectionBarProps {
  /** Optional: limit count display to visible leads only */
  visibleSelectedCount?: number;
  /** All available leads to filter selected ones from */
  leads?: Lead[];
  /** Show phone lookup button (only for My Leads page) - AC 4.5 #4.2 */
  showPhoneLookup?: boolean;
  /** Show enrichment button (only for My Leads page) - AC 4.4.1 #4 */
  showEnrichment?: boolean;
  /** Story 6.5.6: Show icebreaker generation button - AC #2 */
  showIcebreaker?: boolean;
  /** Story 6.5.6: Callback when icebreaker generation starts - for loading state */
  onIcebreakerGenerationStart?: (leadIds: string[]) => void;
  /** Story 6.5.6: Callback when icebreaker generation ends */
  onIcebreakerGenerationEnd?: () => void;
}

export function LeadSelectionBar({
  visibleSelectedCount,
  leads = [],
  showPhoneLookup = false,
  showEnrichment = false,
  showIcebreaker = false,
  onIcebreakerGenerationStart,
  onIcebreakerGenerationEnd,
}: LeadSelectionBarProps) {
  const { selectedIds, clearSelection } = useSelectionStore();
  const router = useRouter();

  // Story 4.2: AC #4 - Bulk status update
  const bulkStatusMutation = useBulkUpdateStatus();

  // Story 4.2.1: AC #1 - Import leads
  const importMutation = useImportLeads();

  // Story 4.4.1: AC #4 - Bulk enrichment with progress tracking
  const queryClient = useQueryClient();
  const enrichMutation = useEnrichPersistedLead();
  const [enrichProgress, setEnrichProgress] = useState<{
    current: number;
    total: number;
    isRunning: boolean;
  }>({ current: 0, total: 0, isRunning: false });

  // Story 12.5: AC #2 - Bulk delete
  const deleteMutation = useDeleteLeads();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Story 4.5: AC #4 - Batch phone lookup state
  const [showBatchLookup, setShowBatchLookup] = useState(false);

  // Story 6.5.6: AC #2 - Icebreaker generation state
  // Story 9.1: Category selection for bulk generation
  const [showIcebreakerConfirm, setShowIcebreakerConfirm] = useState(false);
  const [icebreakerCategory, setIcebreakerCategory] = useState<IcebreakerCategory>(DEFAULT_ICEBREAKER_CATEGORY);
  const [icebreakerProgress, setIcebreakerProgress] = useState<{
    current: number;
    total: number;
    isRunning: boolean;
  }>({ current: 0, total: 0, isRunning: false });

  const icebreakerEnrichment = useIcebreakerEnrichment({
    onProgress: (current, total) => {
      setIcebreakerProgress({ current, total, isRunning: true });
    },
    onComplete: () => {
      setIcebreakerProgress({ current: 0, total: 0, isRunning: false });
      onIcebreakerGenerationEnd?.();
    },
  });

  // Use visible count if provided, otherwise total selected
  const count = visibleSelectedCount ?? selectedIds.length;

  // Get full lead objects for selected IDs
  const selectedLeads = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    return leads.filter((lead) => selectedIdSet.has(lead.id));
  }, [leads, selectedIds]);

  // Story 4.2.1: AC #1, #4 - Prepare leads data for import
  const leadsForImport = useMemo((): LeadDataForImport[] => {
    return selectedLeads.map((lead) => ({
      apolloId: lead.apolloId || lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName,
      companySize: lead.companySize,
      industry: lead.industry,
      location: lead.location,
      title: lead.title,
      linkedinUrl: lead.linkedinUrl,
      hasEmail: lead.hasEmail,
      hasDirectPhone: lead.hasDirectPhone,
    }));
  }, [selectedLeads]);

  // Story 4.2.1: AC #1 - Handle import leads action
  const handleImportLeads = () => {
    if (leadsForImport.length > 0) {
      importMutation.mutate(leadsForImport);
    }
  };

  // Handle "Criar Campanha" action - pass selected IDs via query param
  const handleCreateCampaign = () => {
    const params = new URLSearchParams();
    params.set("leadIds", selectedIds.join(","));
    router.push(`/campaigns/new?${params.toString()}`);
  };

  // Story 4.2: AC #4 - Handle bulk status change
  const handleBulkStatusChange = (status: LeadStatus) => {
    bulkStatusMutation.mutate(
      { leadIds: selectedIds, status },
      { onSuccess: () => clearSelection() }
    );
  };

  // Story 4.4.1: AC #4 - Handle bulk enrichment with progress "X de Y"
  const handleBulkEnrich = useCallback(async () => {
    const leadIds = [...selectedIds];
    const total = leadIds.length;
    let enriched = 0;
    let notFound = 0;

    setEnrichProgress({ current: 0, total, isRunning: true });

    for (let i = 0; i < leadIds.length; i++) {
      const leadId = leadIds[i];
      setEnrichProgress({ current: i + 1, total, isRunning: true });

      try {
        await enrichMutation.mutateAsync(leadId);
        enriched++;
      } catch {
        // Count as not found (error toast already shown by hook)
        notFound++;
      }
    }

    setEnrichProgress({ current: 0, total: 0, isRunning: false });

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["my-leads"] });

    // Show final summary
    if (enriched > 0) {
      toast.success(
        `${enriched} leads enriquecidos${notFound > 0 ? `, ${notFound} não encontrados` : ""}`
      );
    }
  }, [selectedIds, enrichMutation, queryClient]);

  // Story 4.5: AC #4 - Handle batch phone lookup complete
  const handleBatchLookupComplete = () => {
    setShowBatchLookup(false);
    // Don't clear selection - user may want to do other actions
  };

  // Story 4.5: AC #4 - Handle batch phone lookup cancel
  const handleBatchLookupCancel = () => {
    setShowBatchLookup(false);
  };

  // Story 6.5.6: AC #2 - Handle icebreaker generation
  // Story 9.1: Pass selected category
  const handleGenerateIcebreakers = useCallback(async () => {
    const leadIds = [...selectedIds];
    setShowIcebreakerConfirm(false);
    setIcebreakerProgress({ current: 0, total: leadIds.length, isRunning: true });
    onIcebreakerGenerationStart?.(leadIds);

    await icebreakerEnrichment.generateForLeads(leadIds, false, icebreakerCategory);
  }, [selectedIds, icebreakerEnrichment, onIcebreakerGenerationStart, icebreakerCategory]);

  // Story 12.5: AC #2 - Handle bulk delete
  const handleBulkDelete = useCallback(async () => {
    const leadIds = [...selectedIds];
    try {
      await deleteMutation.mutateAsync(leadIds);
      setShowDeleteDialog(false);
      clearSelection();
    } catch {
      // Error toast handled by hook onError
    }
  }, [selectedIds, deleteMutation, clearSelection]);

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          >
            <div className="flex h-16 w-full items-center justify-between px-6 md:px-10">
              {/* Selection count */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {count} lead{count !== 1 ? "s" : ""} selecionado
                  {count !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </Button>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {/* Story 4.2.1: AC #1 - Import leads button */}
                <Button
                  variant="secondary"
                  onClick={handleImportLeads}
                  disabled={importMutation.isPending || leadsForImport.length === 0}
                  className="gap-2"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Importar Leads
                </Button>

                {/* Story 4.4.1: AC #4 - Bulk enrichment button with "X de Y" progress */}
                {showEnrichment && (
                  <Button
                    variant="secondary"
                    onClick={handleBulkEnrich}
                    disabled={enrichProgress.isRunning || selectedIds.length === 0}
                    className="gap-2"
                  >
                    {enrichProgress.isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {enrichProgress.isRunning
                      ? `Enriquecendo leads... ${enrichProgress.current} de ${enrichProgress.total}`
                      : `Enriquecer Dados (${selectedIds.length})`}
                  </Button>
                )}

                {/* Story 6.5.6: AC #2 - Bulk icebreaker generation button */}
                {showIcebreaker && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowIcebreakerConfirm(true)}
                    disabled={icebreakerProgress.isRunning || selectedIds.length === 0}
                    className="gap-2"
                    data-testid="generate-icebreaker-button"
                  >
                    {icebreakerProgress.isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {icebreakerProgress.isRunning
                      ? `Gerando icebreakers... ${icebreakerProgress.current} de ${icebreakerProgress.total}`
                      : `Gerar Icebreaker (${selectedIds.length})`}
                  </Button>
                )}

                {/* Story 4.5: AC #4 - Batch phone lookup button */}
                {showPhoneLookup && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowBatchLookup(true)}
                    disabled={selectedLeads.length === 0}
                    className="gap-2"
                  >
                    <Phone className="h-4 w-4" />
                    Buscar Telefone ({selectedLeads.length})
                  </Button>
                )}

                {/* Story 5.7: AC #6 - Create campaign with selected leads */}
                {/* Story 8.4: AC #2 - NativeMagnetic CTA */}
                <NativeMagnetic strength={0.4} as="div">
                  <Button
                    onClick={handleCreateCampaign}
                    data-testid="create-campaign-button"
                  >
                    Criar Campanha
                  </Button>
                </NativeMagnetic>

                {/* Story 4.1: AC #2 - Add to segment button */}
                <SegmentDropdown selectedLeads={selectedLeads} />

                {/* Story 4.2: AC #4 - Bulk status change */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={bulkStatusMutation.isPending}
                      className="gap-2"
                    >
                      {bulkStatusMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Alterar Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {LEAD_STATUSES.map((statusConfig) => (
                      <DropdownMenuItem
                        key={statusConfig.value}
                        onClick={() => handleBulkStatusChange(statusConfig.value)}
                      >
                        <LeadStatusBadge status={statusConfig.value} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Mais opções</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled>
                      Exportar CSV (em breve)
                    </DropdownMenuItem>
                    {/* Story 12.5: AC #2 - Bulk delete option */}
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                      data-testid="bulk-delete-menu-item"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir Leads
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Close button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearSelection}
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Fechar barra de seleção</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story 4.5: AC #4 - Batch phone lookup progress dialog */}
      <PhoneLookupProgress
        leads={selectedLeads}
        open={showBatchLookup}
        onComplete={handleBatchLookupComplete}
        onCancel={handleBatchLookupCancel}
      />

      {/* Story 12.5: AC #2, #3 - Bulk delete confirmation dialog */}
      <DeleteLeadsDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        leadCount={selectedIds.length}
        onConfirm={handleBulkDelete}
        isDeleting={deleteMutation.isPending}
      />

      {/* Story 6.5.6: AC #2 - Icebreaker generation confirmation dialog */}
      {/* Story 9.1: Added category select in confirmation dialog */}
      <AlertDialog open={showIcebreakerConfirm} onOpenChange={setShowIcebreakerConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar Icebreakers</AlertDialogTitle>
            <AlertDialogDescription>
              Gerar icebreaker para {selectedIds.length} lead{selectedIds.length !== 1 ? "s" : ""}?
              {" "}Custo estimado: {estimateIcebreakerCost(selectedIds.length)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Story 9.1: Category selection before generating */}
          <div className="py-2">
            <IcebreakerCategorySelect
              value={icebreakerCategory}
              onValueChange={setIcebreakerCategory}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateIcebreakers}>
              Gerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
