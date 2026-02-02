/**
 * Campaign Builder Page
 * Story 5.2: Campaign Builder Canvas
 * Story 5.7: Campaign Lead Association
 * Story 5.8: Campaign Preview
 * Story 5.9: Campaign Save & Multiple Campaigns
 *
 * AC: #1 - Rota do Builder
 * AC 5.7 #5 - Lead count display
 * AC 5.7 #6 - Pre-selected leads from /leads page
 * AC 5.8 - Preview panel integration
 * AC 5.9 #1-#7 - Salvar campanha e blocos, carregar blocos existentes
 *
 * Main page for building campaign sequences with drag-and-drop blocks.
 */

"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCampaign, useSaveCampaign } from "@/hooks/use-campaigns";
import { useCampaignBlocks } from "@/hooks/use-campaign-blocks";
import { useCampaignLeads } from "@/hooks/use-campaign-leads";
import { useBuilderStore } from "@/stores/use-builder-store";
import {
  BuilderHeader,
  BuilderSidebar,
  BuilderCanvas,
  AddLeadsDialog,
  CampaignPreviewPanel,
} from "@/components/builder";

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

  const { data: campaign, isLoading, isError, error } = useCampaign(campaignId);
  const {
    setDragging,
    addBlock,
    reorderBlocks,
    reset,
    setLeadCount,
    setHasChanges,
    loadBlocks,
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
  const { leadCount, addLeads } = useCampaignLeads(campaignId);
  const [isAddLeadsOpen, setIsAddLeadsOpen] = useState(false);
  const hasAddedLeadsRef = useRef(false);

  // Story 5.8: Campaign preview
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const blocks = useBuilderStore((state) => state.blocks);
  const hasBlocks = blocks.length > 0;

  // Story 5.7 AC #5: Update store lead count when it changes
  useEffect(() => {
    setLeadCount(leadCount);
  }, [leadCount, setLeadCount]);

  // Story 5.9 AC #2: Load blocks when data is available
  useEffect(() => {
    // Prevent multiple loads (React Strict Mode / re-renders)
    if (hasLoadedBlocksRef.current) return;

    if (initialBlocks && initialBlocks.length > 0) {
      hasLoadedBlocksRef.current = true;
      loadBlocks(initialBlocks);
    } else if (initialBlocks && initialBlocks.length === 0) {
      // Mark as loaded even for empty array (new campaign)
      hasLoadedBlocksRef.current = true;
    }
  }, [initialBlocks, loadBlocks]);

  // Story 5.9 AC #3: Sync campaign name when campaign data loads/changes
  useEffect(() => {
    if (campaign?.name) {
      setCampaignNameState(campaign.name);
    }
  }, [campaign?.name]);

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

  // Reset store and refs when component unmounts or campaign changes
  useEffect(() => {
    return () => {
      reset();
      // Reset refs to allow fresh load on next mount
      hasLoadedBlocksRef.current = false;
      hasAddedLeadsRef.current = false;
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

  function handleDragStart(_event: DragStartEvent) {
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
  const handleSave = async () => {
    try {
      // Prepare payload - only include name if changed
      const nameChanged = campaignNameState !== campaign?.name;
      await saveCampaign.mutateAsync({
        name: nameChanged ? campaignNameState : undefined,
        blocks: blocks,
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
    </DndContext>
  );
}
