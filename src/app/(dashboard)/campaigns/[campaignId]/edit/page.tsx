/**
 * Campaign Builder Page
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #1 - Rota do Builder
 *
 * Main page for building campaign sequences with drag-and-drop blocks.
 */

"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { useCampaign } from "@/hooks/use-campaigns";
import { useBuilderStore } from "@/stores/use-builder-store";
import { BuilderHeader, BuilderSidebar, BuilderCanvas } from "@/components/builder";

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

  const { data: campaign, isLoading, isError, error } = useCampaign(campaignId);
  const { setDragging, addBlock, reorderBlocks, reset } = useBuilderStore();

  // Reset store when component unmounts or campaign changes
  useEffect(() => {
    return () => {
      reset();
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

  // Handle name change (placeholder for future implementation)
  const handleNameChange = (_name: string) => {
    // TODO: Implement campaign name update API
    // This will be implemented in a future story
  };

  // Handle save (placeholder for future implementation)
  const handleSave = () => {
    // TODO: Implement save blocks to campaign API
    // This will be implemented in a future story
  };

  // Loading state
  if (isLoading) {
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
          campaignName={campaign.name}
          campaignStatus={campaign.status}
          onNameChange={handleNameChange}
          onSave={handleSave}
        />
        <div className="flex-1 flex overflow-hidden">
          <BuilderSidebar />
          <BuilderCanvas />
        </div>
      </div>
    </DndContext>
  );
}
