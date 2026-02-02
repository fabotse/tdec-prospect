/**
 * Create Campaign Dialog Component
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #4 - Dialog to create campaign with name, redirect to builder after creation
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog component for creating a new campaign
 * AC: #4 - Create campaign with name, redirect to builder
 */
export function CreateCampaignDialog({
  open,
  onOpenChange,
}: CreateCampaignDialogProps) {
  const router = useRouter();
  const createCampaign = useCreateCampaign();

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
      }
      onOpenChange(newOpen);
    },
    [form, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
            <DialogDescription>
              Crie uma nova campanha de outreach para seus leads.
            </DialogDescription>
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
