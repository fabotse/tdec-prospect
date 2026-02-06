"use client";

/**
 * Icebreaker Examples Form Component
 * Story: 9.2 - Exemplos de Referencia para Ice Breakers no Knowledge Base
 *
 * AC: #1 - Dedicated section for icebreaker examples
 * AC: #2 - CRUD operations with text + optional category
 */

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useIcebreakerExamples } from "@/hooks/use-icebreaker-examples";
import { ICEBREAKER_CATEGORIES } from "@/types/ai-prompt";
import {
  icebreakerExampleSchema,
  type IcebreakerExampleInput,
  type IcebreakerExample,
} from "@/types/knowledge-base";

const NO_CATEGORY_VALUE = "__none__";

/**
 * Loading skeleton for examples list
 */
function IcebreakerExamplesSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="p-4 rounded-lg border border-border bg-background"
        >
          <div className="h-4 w-full bg-foreground/10 rounded mb-2" />
          <div className="h-4 w-3/4 bg-foreground/10 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no examples exist
 */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-foreground/5 p-4 mb-4">
        <MessageSquare className="h-8 w-8 text-foreground-muted" />
      </div>
      <h3 className="text-lg font-medium mb-2">
        Nenhum exemplo de Ice Breaker cadastrado
      </h3>
      <p className="text-sm text-foreground-muted mb-4 max-w-sm">
        Adicione exemplos de ice breakers bem-sucedidos para a IA aprender seu
        estilo de personalização.
      </p>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Exemplo de Ice Breaker
      </Button>
    </div>
  );
}

/**
 * Category badge display
 */
function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cat = ICEBREAKER_CATEGORIES.find((c) => c.value === category);
  return (
    <Badge variant="secondary" className="text-xs">
      {cat?.label ?? category}
    </Badge>
  );
}

/**
 * Individual example card
 */
function ExampleCard({
  example,
  onEdit,
  onDelete,
  isDeleting,
}: {
  example: IcebreakerExample;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Card className="bg-background border-border">
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CategoryBadge category={example.category} />
            </div>
            <p className="text-sm text-foreground line-clamp-2">
              {example.text}
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              disabled={isDeleting}
              aria-label="Editar exemplo"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              aria-label="Excluir exemplo"
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function IcebreakerExamplesForm() {
  const {
    examples,
    isLoading,
    error,
    createExample,
    updateExample,
    deleteExample,
    isCreating,
    isUpdating,
    isDeleting,
  } = useIcebreakerExamples();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExample, setEditingExample] =
    useState<IcebreakerExample | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exampleToDelete, setExampleToDelete] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<IcebreakerExampleInput>({
    resolver: zodResolver(icebreakerExampleSchema),
    defaultValues: {
      text: "",
      category: undefined,
    },
  });

  const openAddDialog = () => {
    setEditingExample(null);
    reset({ text: "", category: undefined });
    setDialogOpen(true);
  };

  const openEditDialog = (example: IcebreakerExample) => {
    setEditingExample(example);
    reset({
      text: example.text,
      category: example.category ?? undefined,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setExampleToDelete(id);
    setDeleteDialogOpen(true);
  };

  const onSubmit = async (values: IcebreakerExampleInput) => {
    if (editingExample) {
      const result = await updateExample(editingExample.id, values);
      if (result.success) {
        toast.success("Exemplo atualizado com sucesso");
        setDialogOpen(false);
        reset();
      } else {
        toast.error(result.error || "Erro ao atualizar. Tente novamente.");
      }
    } else {
      const result = await createExample(values);
      if (result.success) {
        toast.success("Exemplo adicionado com sucesso");
        setDialogOpen(false);
        reset();
      } else {
        toast.error(result.error || "Erro ao adicionar. Tente novamente.");
      }
    }
  };

  const onConfirmDelete = async () => {
    if (!exampleToDelete) return;

    const result = await deleteExample(exampleToDelete);
    if (result.success) {
      toast.success("Exemplo removido com sucesso");
    } else {
      toast.error(result.error || "Erro ao remover. Tente novamente.");
    }

    setDeleteDialogOpen(false);
    setExampleToDelete(null);
  };

  if (isLoading) {
    return <IcebreakerExamplesSkeleton />;
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-md bg-destructive/10 border border-destructive/20"
        role="alert"
      >
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  const isMutating = isCreating || isUpdating;

  return (
    <div className="space-y-4">
      {examples.length === 0 ? (
        <EmptyState onAdd={openAddDialog} />
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={openAddDialog} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Exemplo
            </Button>
          </div>

          <div className="space-y-3">
            {examples.map((example) => (
              <ExampleCard
                key={example.id}
                example={example}
                onEdit={() => openEditDialog(example)}
                onDelete={() => openDeleteDialog(example.id)}
                isDeleting={isDeleting && exampleToDelete === example.id}
              />
            ))}
          </div>
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingExample
                ? "Editar Exemplo de Ice Breaker"
                : "Adicionar Exemplo de Ice Breaker"}
            </DialogTitle>
            <DialogDescription>
              Adicione exemplos reais de ice breakers para a IA aprender seu
              estilo de personalização.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="text">Texto do Ice Breaker</Label>
              <Textarea
                id="text"
                {...register("text")}
                rows={4}
                placeholder='Ex: "Vi que a Acme Corp está expandindo para o mercado de SaaS. Nossa plataforma tem ajudado empresas nessa transição..."'
                disabled={isMutating}
                aria-invalid={!!errors.text}
              />
              {errors.text && (
                <p className="text-xs text-destructive">
                  {errors.text.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Categoria (opcional)</Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? NO_CATEGORY_VALUE}
                    onValueChange={(v) =>
                      field.onChange(
                        v === NO_CATEGORY_VALUE ? undefined : v
                      )
                    }
                    disabled={isMutating}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Nenhuma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY_VALUE}>
                        Nenhuma categoria
                      </SelectItem>
                      {ICEBREAKER_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.category && (
                <p className="text-xs text-destructive">
                  {errors.category.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isMutating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : editingExample ? (
                  "Salvar"
                ) : (
                  "Adicionar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover exemplo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O exemplo de ice breaker será
              removido permanentemente da base de conhecimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                "Remover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
