/**
 * Campaign Builder Page
 * Story 5.2: Campaign Builder Canvas
 * Story 5.7: Campaign Lead Association
 * Story 5.8: Campaign Preview
 * Story 5.9: Campaign Save & Multiple Campaigns
 * Story 6.5: Campaign Product Context
 * Story 6.6: Personalized Icebreakers
 *
 * AC: #1 - Rota do Builder
 * AC 5.7 #5 - Lead count display
 * AC 5.7 #6 - Pre-selected leads from /leads page
 * AC 5.8 - Preview panel integration
 * AC 5.9 #1-#7 - Salvar campanha e blocos, carregar blocos existentes
 * AC 6.5 #2 - Save product selection
 * AC 6.6 #1 - Lead preview selector in builder header
 *
 * Main page for building campaign sequences with drag-and-drop blocks.
 */

"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCampaign, useSaveCampaign, useDeleteCampaign } from "@/hooks/use-campaigns";
import { useCampaignBlocks } from "@/hooks/use-campaign-blocks";
import { useCampaignLeads } from "@/hooks/use-campaign-leads";
import { useBuilderStore } from "@/stores/use-builder-store";
import {
  BuilderHeader,
  BuilderSidebar,
  BuilderCanvas,
  AddLeadsDialog,
  CampaignPreviewPanel,
  ExportDialog,
} from "@/components/builder";
import { DeleteCampaignDialog } from "@/components/campaigns";
import { useCampaignExport } from "@/hooks/use-campaign-export";
import { useInstantlyExport } from "@/hooks/use-instantly-export";
import { useCsvClipboardExport } from "@/hooks/use-csv-clipboard-export";
import { useIntegrationConfig } from "@/hooks/use-integration-config";
import { mapExportError } from "@/lib/export/error-messages";
import type { ExportConfig } from "@/types/export";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

/**
 * Loading state component
 */
function LoadingState() {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Carregando campanha...</p>
      </div>
    </div>
  );
}

/**
 * Error state component for campaign not found
 */
function NotFoundState() {
  const router = useRouter();

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Campanha nao encontrada</h1>
        <p className="text-muted-foreground mb-4">
          A campanha que voce esta procurando nao existe ou foi removida.
        </p>
        <button
          onClick={() => router.push("/campaigns")}
          className="text-primary hover:underline"
        >
          Voltar para campanhas
        </button>
      </div>
    </div>
  );
}

/**
 * Error state component for general errors
 */
function ErrorState({ message }: { message: string }) {
  const router = useRouter();

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Erro ao carregar</h1>
        <p className="text-muted-foreground mb-4">{message}</p>
        <button
          onClick={() => router.push("/campaigns")}
          className="text-primary hover:underline"
        >
          Voltar para campanhas
        </button>
      </div>
    </div>
  );
}

/**
 * Campaign Builder Page
 */
export default function CampaignBuilderPage({ params }: PageProps) {
  const { campaignId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const { data: campaign, isLoading, isError, error } = useCampaign(campaignId);
  const deleteMutation = useDeleteCampaign();
  const {
    setDragging,
    addBlock,
    reorderBlocks,
    reset,
    setLeadCount,
    setHasChanges,
    loadBlocks,
    setProductId,
    productId,
  } = useBuilderStore();

  // Story 5.9: Load and save blocks
  const {
    data: initialBlocks,
    isLoading: isLoadingBlocks,
  } = useCampaignBlocks(campaignId);
  const saveCampaign = useSaveCampaign(campaignId);
  const [campaignNameState, setCampaignNameState] = useState<string>("");
  const hasLoadedBlocksRef = useRef(false);

  // Story 5.7: Campaign leads management
  const { leadCount, addLeads, leads: campaignLeadsForExport } = useCampaignLeads(campaignId);
  const [isAddLeadsOpen, setIsAddLeadsOpen] = useState(false);
  const hasAddedLeadsRef = useRef(false);

  // Story 5.8: Campaign preview
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const blocks = useBuilderStore((state) => state.blocks);
  const hasBlocks = blocks.length > 0;

  // Delete campaign
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Story 7.4: Export dialog
  // Story 7.5: Instantly export orchestration
  // Story 7.7: CSV/Clipboard export
  const [isExportOpen, setIsExportOpen] = useState(false);
  const { exportToInstantly, isExporting, steps: exportSteps } = useInstantlyExport();
  const { exportToCsv, exportToCsvWithVariables, exportToClipboard } = useCsvClipboardExport();
  const exportToastIdRef = useRef<string | number | undefined>(undefined);
  const { configs: integrationConfigs } = useIntegrationConfig();
  const exportLeadInfos = useMemo(
    () => (campaignLeadsForExport ?? []).map((cl) => cl.lead),
    [campaignLeadsForExport]
  );
  // M2 fix: Shared lead mapping for export (Instantly + CSV) — avoid duplication
  const exportLeadsMapped = useMemo(
    () =>
      (campaignLeadsForExport ?? []).map((cl) => ({
        email: cl.lead.email,
        firstName: cl.lead.firstName ?? undefined,
        lastName: cl.lead.lastName ?? undefined,
        companyName: cl.lead.companyName ?? undefined,
        title: cl.lead.title ?? undefined,
        icebreaker: cl.lead.icebreaker ?? undefined,
      })),
    [campaignLeadsForExport]
  );
  const { platformOptions, leadSummary, previousExport } = useCampaignExport({
    leads: exportLeadInfos,
    campaign: campaign ?? null,
    integrationConfigs,
  });

  // Story 7.5 AC #1: Update progress toast with current export step
  useEffect(() => {
    if (!isExporting || !exportToastIdRef.current) return;
    const runningStep = exportSteps.find((s) => s.status === "running");
    if (runningStep) {
      toast.loading(`${runningStep.label}...`, { id: exportToastIdRef.current });
    }
  }, [exportSteps, isExporting]);

  // Story 5.7 AC #5: Update store lead count when it changes
  useEffect(() => {
    setLeadCount(leadCount);
  }, [leadCount, setLeadCount]);

  // Story 5.9 AC #2: Load blocks when data is available
  // Story 6.12: Preserve AI-generated blocks if present in store
  useEffect(() => {
    // Prevent multiple loads (React Strict Mode / re-renders)
    if (hasLoadedBlocksRef.current) return;

    if (initialBlocks && initialBlocks.length > 0) {
      // DB has blocks, load them (existing campaign)
      hasLoadedBlocksRef.current = true;
      loadBlocks(initialBlocks);
    } else if (initialBlocks && initialBlocks.length === 0) {
      // DB is empty - preserve AI wizard blocks if present in store
      hasLoadedBlocksRef.current = true;
    }
  }, [initialBlocks, loadBlocks]);

  // Story 5.9 AC #3: Sync campaign name when campaign data loads/changes
  useEffect(() => {
    if (campaign?.name) {
      setCampaignNameState(campaign.name);
    }
  }, [campaign?.name]);

  // Story 6.5 AC #2: Initialize productId from campaign data
  const hasLoadedProductRef = useRef(false);
  useEffect(() => {
    if (hasLoadedProductRef.current) return;
    if (campaign) {
      hasLoadedProductRef.current = true;
      setProductId(campaign.productId, campaign.productName ?? null);
    }
  }, [campaign, setProductId]);

  // Story 5.7 AC #6: Auto-add pre-selected leads from query params
  useEffect(() => {
    // Prevent multiple executions (React Strict Mode / re-renders)
    if (hasAddedLeadsRef.current) return;

    const leadsParam = searchParams.get("leads");
    if (leadsParam && campaignId) {
      const leadIds = leadsParam.split(",").filter(Boolean);
      if (leadIds.length > 0) {
        hasAddedLeadsRef.current = true;
        // Add leads and clear query params
        addLeads.mutate(leadIds);
        // Remove the leads param from URL without reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    }
    // Note: addLeads excluded from deps as mutation object changes reference on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, campaignId]);

  // Track previous campaign ID to detect actual campaign changes
  const prevCampaignIdRef = useRef<string | null>(null);

  // Reset store only when switching between campaigns (not on initial mount/unmount)
  // Story 6.12: This prevents resetting AI wizard blocks during React Strict Mode re-mounts
  useEffect(() => {
    // On first mount, just store the campaignId
    if (prevCampaignIdRef.current === null) {
      prevCampaignIdRef.current = campaignId;
      return;
    }

    // If campaignId changed (switching campaigns), reset store
    if (prevCampaignIdRef.current !== campaignId) {
      reset();
      hasLoadedBlocksRef.current = false;
      hasAddedLeadsRef.current = false;
      hasLoadedProductRef.current = false;
      prevCampaignIdRef.current = campaignId;
    }

    // Cleanup: only reset refs, not the store (store reset handled above)
    return () => {
      hasLoadedBlocksRef.current = false;
      hasAddedLeadsRef.current = false;
      hasLoadedProductRef.current = false;
    };
  }, [campaignId, reset]);

  // Configure DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    })
  );

  function handleDragStart() {
    setDragging(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(false);
    const { active, over } = event;

    if (!over) return;

    // If dragging from sidebar (new block)
    if (active.data.current?.fromSidebar) {
      addBlock(active.data.current.blockType);
      return;
    }

    // If reordering existing blocks
    if (active.id !== over.id) {
      reorderBlocks(String(active.id), String(over.id));
    }
  }

  // Story 5.9 AC #3: Handle name change inline
  const handleNameChange = (name: string) => {
    setCampaignNameState(name);
    // Mark hasChanges if name differs from original
    if (name !== campaign?.name) {
      setHasChanges(true);
    }
  };

  // Story 5.9 AC #1, #5: Handle save campaign and blocks
  // Story 6.5 AC #2: Include productId in save payload
  const handleSave = async () => {
    try {
      // Prepare payload - only include fields if changed
      const nameChanged = campaignNameState !== campaign?.name;
      const productChanged = productId !== campaign?.productId;
      await saveCampaign.mutateAsync({
        name: nameChanged ? campaignNameState : undefined,
        blocks: blocks,
        productId: productChanged ? productId : undefined,
      });
      setHasChanges(false);
      toast.success("Campanha salva com sucesso");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar campanha";
      toast.error(message);
    }
  };

  // Story 5.7 AC #5: Handle opening add leads dialog
  const handleAddLeads = () => {
    setIsAddLeadsOpen(true);
  };

  // Story 5.7 AC #4: Mark hasChanges when leads are added
  const handleLeadsAdded = () => {
    setHasChanges(true);
  };

  // Story 5.8 AC #1: Handle opening preview panel
  const handlePreview = () => {
    setIsPreviewOpen(true);
  };

  // Story 7.4 AC #1: Handle opening export dialog
  const handleExport = () => {
    setIsExportOpen(true);
  };

  // Story 7.8: CSV fallback for failed API exports
  const handleCsvFallback = async () => {
    try {
      const result = await exportToCsv({
        blocks,
        leads: exportLeadsMapped,
        campaignName: campaignNameState || campaign?.name || "",
      });
      if (result.success) {
        toast.success(`Fallback CSV — ${result.rowCount} leads exportados`);
      } else {
        toast.error(result.error ?? "Erro ao exportar CSV");
      }
    } catch {
      toast.error("Erro ao exportar CSV como alternativa");
    }
  };

  // Story 7.5: Export callback — dispatches to platform-specific export
  const handleExportConfirm = async (config: ExportConfig) => {
    if (config.platform === "instantly") {
      setIsExportOpen(false);
      const toastId = toast.loading("Iniciando export para Instantly...");
      exportToastIdRef.current = toastId;

      try {
        const result = await exportToInstantly({
          config,
          campaignName: campaignNameState || campaign?.name || "",
          blocks,
          leads: exportLeadsMapped,
        });

        if (result.success) {
          const leadsMsg = result.leadsUploaded
            ? ` — ${result.leadsUploaded} leads enviados`
            : "";
          const warnings = result.steps
            .filter((s) => s.status === "failed")
            .map((s) => s.error)
            .filter(Boolean);
          const instantlyAction = result.externalCampaignId
            ? {
                label: "Abrir no Instantly",
                onClick: () =>
                  window.open(
                    `https://app.instantly.ai/app/campaign/status/${result.externalCampaignId}`,
                    "_blank"
                  ),
              }
            : undefined;
          const message = warnings.length > 0
            ? `Campanha exportada para Instantly${leadsMsg}. Avisos: ${warnings.join("; ")}`
            : `Campanha exportada para Instantly${leadsMsg}`;
          toast.success(message, { id: toastId, action: instantlyAction });
        } else {
          const failedStep = result.steps.find((s) => s.status === "failed");
          const errorInfo = failedStep?.errorInfo ?? mapExportError(result.error, "instantly");
          toast.error(errorInfo.title, {
            id: toastId,
            description: errorInfo.message,
            action: errorInfo.canRetry
              ? { label: "Tentar Novamente", onClick: () => setIsExportOpen(true) }
              : errorInfo.canFallback
                ? { label: "Exportar CSV", onClick: () => handleCsvFallback() }
                : undefined,
          });
        }
      } catch (err) {
        const errorInfo = mapExportError(err, "instantly");
        toast.error(errorInfo.title, {
          id: toastId,
          description: errorInfo.message,
          action: errorInfo.canRetry
            ? { label: "Tentar Novamente", onClick: () => setIsExportOpen(true) }
            : errorInfo.canFallback
              ? { label: "Exportar CSV", onClick: () => handleCsvFallback() }
              : undefined,
        });
      } finally {
        exportToastIdRef.current = undefined;
      }
    } else if (config.platform === "csv") {
      // Story 7.7 AC #1, #2: CSV export
      setIsExportOpen(false);
      try {
        const csvParams = {
          blocks,
          leads: exportLeadsMapped,
          campaignName: campaignNameState || campaign?.name || "",
        };

        const result = config.csvMode === "with_variables"
          ? await exportToCsvWithVariables(csvParams)
          : await exportToCsv(csvParams);

        if (result.success) {
          toast.success(`Campanha exportada — ${result.rowCount} leads em CSV`);
        } else {
          toast.error(result.error ?? "Erro ao exportar CSV");
        }
      } catch (err) {
        const csvErrorInfo = mapExportError(err, "csv");
        toast.error(csvErrorInfo.title, { description: csvErrorInfo.message });
      }
    } else if (config.platform === "clipboard") {
      // Story 7.7 AC #3: Clipboard export
      setIsExportOpen(false);
      try {
        const result = await exportToClipboard({
          blocks,
          campaignName: campaignNameState || campaign?.name || "",
        });

        if (result.success) {
          const emailCount = blocks.filter((b) => b.type === "email").length;
          toast.success(`Campanha copiada — ${emailCount} emails na sequência`);
        } else {
          toast.error(result.error ?? "Erro ao copiar para clipboard");
        }
      } catch (err) {
        const clipErrorInfo = mapExportError(err, "clipboard");
        toast.error(clipErrorInfo.title, { description: clipErrorInfo.message });
      }
    } else {
      // snovio — Story 7.6
      setIsExportOpen(false);
      toast.success("Configuração de export salva. Implementação do deploy nas próximas stories.");
    }
  };

  // Delete campaign handlers
  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteMutation.mutateAsync(campaignId);
      toast.success("Campanha removida com sucesso");
      router.push("/campaigns");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao remover campanha"
      );
    }
  };

  // Loading state (campaign or blocks)
  if (isLoading || isLoadingBlocks) {
    return <LoadingState />;
  }

  // Error states
  if (isError) {
    const errorMessage = error?.message || "Erro desconhecido";
    if (errorMessage.includes("nao encontrada")) {
      return <NotFoundState />;
    }
    return <ErrorState message={errorMessage} />;
  }

  // Campaign not found
  if (!campaign) {
    return <NotFoundState />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col bg-background">
        <BuilderHeader
          campaignName={campaignNameState || campaign.name}
          campaignStatus={campaign.status}
          onNameChange={handleNameChange}
          onSave={handleSave}
          isSaving={saveCampaign.isPending}
          leadCount={leadCount}
          onAddLeads={handleAddLeads}
          onPreview={handlePreview}
          hasBlocks={hasBlocks}
          campaignId={campaignId}
          onDelete={handleDeleteClick}
          onExport={handleExport}
          externalCampaignId={campaign.externalCampaignId}
        />
        <div className="flex-1 flex overflow-hidden">
          <BuilderSidebar />
          <BuilderCanvas />
        </div>
      </div>

      {/* Story 5.7: Add Leads Dialog */}
      <AddLeadsDialog
        open={isAddLeadsOpen}
        onOpenChange={setIsAddLeadsOpen}
        campaignId={campaignId}
        onLeadsAdded={handleLeadsAdded}
      />

      {/* Story 5.8: Campaign Preview Panel */}
      <CampaignPreviewPanel
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        campaignName={campaign.name}
        leadCount={leadCount}
      />

      {/* Story 7.4: Export Dialog */}
      <ExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        campaignId={campaignId}
        campaignName={campaignNameState || campaign.name}
        blocks={blocks}
        platformOptions={platformOptions}
        leadSummary={leadSummary}
        leads={exportLeadInfos}
        previousExport={previousExport}
        onExport={handleExportConfirm}
      />

      {/* Delete Campaign Dialog */}
      <DeleteCampaignDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        campaign={campaign}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteMutation.isPending}
      />
    </DndContext>
  );
}
