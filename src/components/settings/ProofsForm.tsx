"use client";

/**
 * Knowledge Base Proofs Form Component
 * Story: 24.7 - Seção de Provas na Knowledge Base
 *
 * AC: #1 - CRUD de provas com tipo, texto, setor opcional e "autorizado para uso"
 */

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useKnowledgeBaseProofs } from "@/hooks/use-knowledge-base-proofs";
import {
  PROOF_TYPES,
  proofSchema,
  type ProofInput,
  type ProofValidated,
  type KnowledgeBaseProof,
} from "@/types/knowledge-base";

const EMPTY_VALUES: ProofInput = {
  proof_type: "case",
  text: "",
  sector: undefined,
  is_authorized: false,
};

function ProofsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" data-testid="proofs-skeleton">
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-foreground/5 p-4 mb-4">
        <ShieldCheck className="h-8 w-8 text-foreground-muted" />
      </div>
      <h3 className="text-lg font-medium mb-2">Nenhuma prova cadastrada</h3>
      <p className="text-sm text-foreground-muted mb-4 max-w-sm">
        Cadastre cases, números, clientes de referência, certificações e tempo
        de mercado. Sem provas autorizadas, a IA não cita nenhuma.
      </p>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Prova
      </Button>
    </div>
  );
}

function ProofCard({
  proof,
  onEdit,
  onDelete,
  isDeleting,
}: {
  proof: KnowledgeBaseProof;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const typeLabel =
    PROOF_TYPES.find((t) => t.value === proof.proof_type)?.label ??
    proof.proof_type;

  return (
    <Card className="bg-background border-border">
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs">
                {typeLabel}
              </Badge>
              {proof.is_authorized ? (
                <Badge className="text-xs">Autorizado</Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Não autorizado
                </Badge>
              )}
              {proof.sector && (
                <span className="text-xs text-foreground-muted">
                  Setor: {proof.sector}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground line-clamp-2">{proof.text}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              disabled={isDeleting}
              aria-label="Editar prova"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              aria-label="Excluir prova"
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

export function ProofsForm() {
  const {
    proofs,
    isLoading,
    error,
    createProof,
    updateProof,
    deleteProof,
    isCreating,
    isUpdating,
    isDeleting,
  } = useKnowledgeBaseProofs();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProof, setEditingProof] = useState<KnowledgeBaseProof | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [proofToDelete, setProofToDelete] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ProofInput, unknown, ProofValidated>({
    resolver: zodResolver(proofSchema),
    defaultValues: EMPTY_VALUES,
  });

  const openAddDialog = () => {
    setEditingProof(null);
    reset(EMPTY_VALUES);
    setDialogOpen(true);
  };

  const openEditDialog = (proof: KnowledgeBaseProof) => {
    setEditingProof(proof);
    reset({
      proof_type: proof.proof_type,
      text: proof.text,
      sector: proof.sector ?? undefined,
      is_authorized: proof.is_authorized,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setProofToDelete(id);
    setDeleteDialogOpen(true);
  };

  const onSubmit = async (values: ProofValidated) => {
    if (editingProof) {
      const result = await updateProof(editingProof.id, values);
      if (result.success) {
        toast.success("Prova atualizada com sucesso");
        setDialogOpen(false);
        reset(EMPTY_VALUES);
      } else {
        toast.error(result.error || "Erro ao atualizar. Tente novamente.");
      }
    } else {
      const result = await createProof(values);
      if (result.success) {
        toast.success("Prova adicionada com sucesso");
        setDialogOpen(false);
        reset(EMPTY_VALUES);
      } else {
        toast.error(result.error || "Erro ao adicionar. Tente novamente.");
      }
    }
  };

  const onConfirmDelete = async () => {
    if (!proofToDelete) return;

    const result = await deleteProof(proofToDelete);
    if (result.success) {
      toast.success("Prova removida com sucesso");
    } else {
      toast.error(result.error || "Erro ao remover. Tente novamente.");
    }

    setDeleteDialogOpen(false);
    setProofToDelete(null);
  };

  if (isLoading) {
    return <ProofsSkeleton />;
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
      {proofs.length === 0 ? (
        <EmptyState onAdd={openAddDialog} />
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={openAddDialog} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Prova
            </Button>
          </div>

          <div className="space-y-3">
            {proofs.map((proof) => (
              <ProofCard
                key={proof.id}
                proof={proof}
                onEdit={() => openEditDialog(proof)}
                onDelete={() => openDeleteDialog(proof.id)}
                isDeleting={isDeleting && proofToDelete === proof.id}
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
              {editingProof ? "Editar Prova" : "Adicionar Prova"}
            </DialogTitle>
            <DialogDescription>
              Só provas marcadas como autorizadas podem ser citadas pela IA nos
              e-mails.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="proof_type">Tipo</Label>
              <Controller
                name="proof_type"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isMutating}
                  >
                    <SelectTrigger id="proof_type">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROOF_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.proof_type && (
                <p className="text-xs text-destructive">
                  {errors.proof_type.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proof_text">Texto da prova</Label>
              <Textarea
                id="proof_text"
                {...register("text")}
                rows={4}
                placeholder="Ex: A Acme reduziu 30% do retrabalho em 6 meses."
                disabled={isMutating}
                aria-invalid={!!errors.text}
              />
              {errors.text && (
                <p className="text-xs text-destructive">{errors.text.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proof_sector">Setor (opcional)</Label>
              <Input
                id="proof_sector"
                {...register("sector")}
                placeholder="Ex: Indústria"
                disabled={isMutating}
                aria-invalid={!!errors.sector}
              />
              {errors.sector && (
                <p className="text-xs text-destructive">
                  {errors.sector.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="proof_is_authorized">Autorizado para uso</Label>
                <p className="text-xs text-foreground-muted">
                  Quando ligado, a IA pode citar esta prova.
                </p>
              </div>
              <Controller
                name="is_authorized"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="proof_is_authorized"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isMutating}
                  />
                )}
              />
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
                ) : editingProof ? (
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
            <AlertDialogTitle>Remover prova?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A prova será removida
              permanentemente da base de conhecimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
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
