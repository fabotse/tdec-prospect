"use client";

/**
 * Email Examples Form Component
 * Story: 2.5 - Knowledge Base Editor - Tone & Examples
 *
 * AC: #4 - Examples section with add/edit/remove capabilities
 * AC: #5 - CRUD operations for email examples
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { useEmailExamples } from "@/hooks/use-email-examples";
import {
  emailExampleSchema,
  type EmailExampleInput,
  type EmailExample,
} from "@/types/knowledge-base";

/**
 * Loading skeleton for examples list
 */
function EmailExamplesSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="p-4 rounded-lg border border-border bg-background"
        >
          <div className="h-5 w-48 bg-foreground/10 rounded mb-2" />
          <div className="h-4 w-full bg-foreground/10 rounded mb-1" />
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
        <Mail className="h-8 w-8 text-foreground-muted" />
      </div>
      <h3 className="text-lg font-medium mb-2">Nenhum exemplo cadastrado</h3>
      <p className="text-sm text-foreground-muted mb-4 max-w-sm">
        Adicione exemplos de emails bem-sucedidos para a IA aprender seu estilo
        de comunicação.
      </p>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Exemplo
      </Button>
    </div>
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
  example: EmailExample;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Card className="bg-background border-border">
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm mb-1 truncate">
              {example.subject}
            </h4>
            <p className="text-sm text-foreground-muted line-clamp-2">
              {example.body}
            </p>
            {example.context && (
              <p className="text-xs text-foreground-muted mt-2 italic">
                Contexto: {example.context}
              </p>
            )}
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

export function EmailExamplesForm() {
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
  } = useEmailExamples();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExample, setEditingExample] = useState<EmailExample | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exampleToDelete, setExampleToDelete] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmailExampleInput>({
    resolver: zodResolver(emailExampleSchema),
    defaultValues: {
      subject: "",
      body: "",
      context: "",
    },
  });

  const openAddDialog = () => {
    setEditingExample(null);
    reset({ subject: "", body: "", context: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (example: EmailExample) => {
    setEditingExample(example);
    reset({
      subject: example.subject,
      body: example.body,
      context: example.context ?? "",
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setExampleToDelete(id);
    setDeleteDialogOpen(true);
  };

  const onSubmit = async (values: EmailExampleInput) => {
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
    return <EmailExamplesSkeleton />;
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
              {editingExample ? "Editar Exemplo" : "Adicionar Exemplo"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Assunto do email</Label>
              <Input
                id="subject"
                {...register("subject")}
                placeholder="Ex: Apresentação de parceria estratégica"
                disabled={isMutating}
                aria-invalid={!!errors.subject}
              />
              {errors.subject && (
                <p className="text-xs text-destructive">
                  {errors.subject.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Corpo do email</Label>
              <Textarea
                id="body"
                {...register("body")}
                rows={8}
                placeholder="Cole aqui o texto completo do email..."
                disabled={isMutating}
                aria-invalid={!!errors.body}
              />
              {errors.body && (
                <p className="text-xs text-destructive">
                  {errors.body.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="context">Contexto (opcional)</Label>
              <Textarea
                id="context"
                {...register("context")}
                rows={2}
                placeholder="Ex: Email enviado após primeiro contato em feira de tecnologia"
                disabled={isMutating}
                aria-invalid={!!errors.context}
              />
              {errors.context && (
                <p className="text-xs text-destructive">
                  {errors.context.message}
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
              Esta ação não pode ser desfeita. O exemplo será removido
              permanentemente da base de conhecimento.
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
