/**
 * Save Filter Dialog Component
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #1 - Dialog to name and save filter configuration
 * AC: #5 - Validation for required filter name
 */

"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateSavedFilter } from "@/hooks/use-saved-filters";
import { useFilterStore } from "@/stores/use-filter-store";

const schema = z.object({
  name: z.string().min(1, "Nome do filtro é obrigatório").max(100),
});

type FormData = z.infer<typeof schema>;

interface SaveFilterDialogProps {
  disabled?: boolean;
}

/**
 * Dialog component for saving current filter configuration
 * AC: #1 - Save filter with name via dialog/modal
 * AC: #5 - Validation prevents save without name
 */
export function SaveFilterDialog({ disabled }: SaveFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const { filters } = useFilterStore();
  const createFilter = useCreateSavedFilter();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  const onSubmit = useCallback(
    async (data: FormData) => {
      try {
        await createFilter.mutateAsync({
          name: data.name,
          filtersJson: filters,
        });
        toast.success(`Filtro "${data.name}" salvo com sucesso`);
        form.reset();
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao salvar filtro"
        );
      }
    },
    [createFilter, filters, form]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
          data-testid="save-filter-trigger"
        >
          <Save className="h-4 w-4" />
          Salvar Filtro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Salvar Filtro</DialogTitle>
            <DialogDescription>
              Dê um nome para esta configuração de filtros para reutilizar
              depois.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="filter-name">Nome do filtro</Label>
              <Input
                id="filter-name"
                placeholder="Ex: Leads de tecnologia em SP"
                {...form.register("name")}
                data-testid="filter-name-input"
              />
              {form.formState.errors.name && (
                <p
                  className="text-sm text-destructive"
                  data-testid="filter-name-error"
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
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createFilter.isPending}
              data-testid="save-filter-submit"
            >
              {createFilter.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
