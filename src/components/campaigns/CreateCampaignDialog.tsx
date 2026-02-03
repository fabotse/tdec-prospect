/**
 * Create Campaign Dialog Component
 * Story 5.1: Campaigns Page & Data Model
 * Story 6.12: AI Campaign Structure Generation
 *
 * AC 5.1 #4 - Dialog to create campaign with name, redirect to builder after creation
 * AC 6.12 #1 - Two creation options: "Criar Manualmente" and "Criar com IA"
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Sparkles, PenLine, ArrowLeft } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateCampaign } from "@/hooks/use-campaigns";
import { createCampaignSchema, type CreateCampaignInput } from "@/types/campaign";
import { AICampaignWizard } from "./AICampaignWizard";

/** Creation mode: 'select' = mode selection, 'manual' = manual form, 'ai' = AI wizard */
type CreationMode = "select" | "manual" | "ai";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mode Selection Card Component
 * Story 6.12: AC #1 - Prominent cards/buttons for creation options
 */
interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  testId: string;
  highlight?: boolean;
}

function ModeCard({
  icon,
  title,
  description,
  onClick,
  testId,
  highlight = false,
}: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`
        flex flex-col items-center gap-3 rounded-lg border-2 p-6 text-center
        transition-all hover:border-primary hover:bg-accent/50
        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
        ${highlight ? "border-primary bg-accent/30" : "border-border"}
      `}
    >
      <div className={`rounded-full p-3 ${highlight ? "bg-primary/10 text-primary" : "bg-muted"}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

/**
 * Dialog component for creating a new campaign
 * Story 6.12: AC #1 - Two creation options shown as prominent cards
 */
export function CreateCampaignDialog({
  open,
  onOpenChange,
}: CreateCampaignDialogProps) {
  const router = useRouter();
  const createCampaign = useCreateCampaign();
  const [mode, setMode] = useState<CreationMode>("select");

  const form = useForm<CreateCampaignInput>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = useCallback(
    async (data: CreateCampaignInput) => {
      try {
        const campaign = await createCampaign.mutateAsync(data);
        toast.success("Campanha criada com sucesso!");
        form.reset();
        setMode("select");
        onOpenChange(false);
        // Navigate to builder (Story 5.2)
        router.push(`/campaigns/${campaign.id}/edit`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao criar campanha"
        );
      }
    },
    [createCampaign, form, onOpenChange, router]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        form.reset();
        setMode("select");
      }
      onOpenChange(newOpen);
    },
    [form, onOpenChange]
  );

  const handleBack = useCallback(() => {
    form.reset();
    setMode("select");
  }, [form]);

  // Story 6.12: AC #1 - Mode Selection View
  if (mode === "select") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
            <DialogDescription>
              Escolha como deseja criar sua campanha de outreach.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2" data-testid="creation-mode-selection">
            {/* Story 6.12: AC #1 - "Criar com IA" option (highlighted) */}
            <ModeCard
              icon={<Sparkles className="h-6 w-6" />}
              title="Criar com IA"
              description="Deixe a IA gerar a estrutura completa da campanha baseada no objetivo"
              onClick={() => setMode("ai")}
              testId="create-with-ai-button"
              highlight
            />
            {/* Story 6.12: AC #1 - "Criar Manualmente" option */}
            <ModeCard
              icon={<PenLine className="h-6 w-6" />}
              title="Criar Manualmente"
              description="Comece do zero e construa a campanha passo a passo"
              onClick={() => setMode("manual")}
              testId="create-manually-button"
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Story 6.12: AC #1 - AI Wizard Mode
  if (mode === "ai") {
    return (
      <AICampaignWizard
        open={open}
        onOpenChange={handleOpenChange}
        onBack={handleBack}
      />
    );
  }

  // Original manual creation form (Story 5.1: AC #4)
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="h-8 w-8"
                data-testid="back-to-selection"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Voltar</span>
              </Button>
              <div>
                <DialogTitle>Criar Manualmente</DialogTitle>
                <DialogDescription>
                  Crie uma campanha vazia e adicione blocos manualmente.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="campaign-name" className="mb-2 block">Nome da Campanha</Label>
              <Input
                id="campaign-name"
                placeholder="Ex: Prospecao Q1 2026"
                {...form.register("name")}
                data-testid="campaign-name-input"
                autoFocus
              />
              {form.formState.errors.name && (
                <p
                  className="text-sm text-destructive"
                  data-testid="campaign-name-error"
                >
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createCampaign.isPending}
              data-testid="create-campaign-submit"
            >
              {createCampaign.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Campanha"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
