/**
 * Delete Leads Dialog Component
 * Story 12.5: Deleção de Leads (Individual e em Massa)
 *
 * AC: #3 - Dialog de confirmação antes de executar
 * AC: #4 - Dialog mostra contagem de leads a deletar
 */

"use client";

import { Loader2 } from "lucide-react";
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

interface DeleteLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadCount: number;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function DeleteLeadsDialog({
  open,
  onOpenChange,
  leadCount,
  onConfirm,
  isDeleting,
}: DeleteLeadsDialogProps) {
  const handleConfirmClick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault();
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Leads</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir {leadCount}{" "}
            {leadCount === 1 ? "lead" : "leads"}? Esta ação não pode ser
            desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmClick}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              "Excluir"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
