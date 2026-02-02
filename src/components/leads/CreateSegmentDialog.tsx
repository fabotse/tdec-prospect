/**
 * Create Segment Dialog Component
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #1 - Dialog to create segment with name and optional description
 */

"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreateSegment } from "@/hooks/use-segments";
import type { SegmentWithCount } from "@/types/segment";

const schema = z.object({
  name: z.string().min(1, "Nome do segmento é obrigatório").max(100),
  description: z.string().max(500).optional(),
});

type FormData = z.infer<typeof schema>;

interface CreateSegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (segment: SegmentWithCount) => void;
}

/**
 * Dialog component for creating a new segment
 * AC: #1 - Create segment with name and optional description
 */
export function CreateSegmentDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateSegmentDialogProps) {
  const createSegment = useCreateSegment();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  const onSubmit = useCallback(
    async (data: FormData) => {
      try {
        const segment = await createSegment.mutateAsync({
          name: data.name,
          description: data.description,
        });
        toast.success("Segmento criado");
        form.reset();
        onOpenChange(false);
        onSuccess?.(segment);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao criar segmento"
        );
      }
    },
    [createSegment, form, onOpenChange, onSuccess]
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
            <DialogTitle>Criar Segmento</DialogTitle>
            <DialogDescription>
              Crie um segmento para organizar seus leads em grupos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="segment-name">Nome do segmento</Label>
              <Input
                id="segment-name"
                placeholder="Ex: Leads Qualificados"
                {...form.register("name")}
                data-testid="segment-name-input"
              />
              {form.formState.errors.name && (
                <p
                  className="text-sm text-destructive"
                  data-testid="segment-name-error"
                >
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="segment-description">Descrição (opcional)</Label>
              <Textarea
                id="segment-description"
                placeholder="Descreva o critério deste segmento..."
                {...form.register("description")}
                rows={3}
                data-testid="segment-description-input"
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.description.message}
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
              disabled={createSegment.isPending}
              data-testid="create-segment-submit"
            >
              {createSegment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
