"use client";

/**
 * Delete Product Dialog Component
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #6 - Confirmation dialog "Remover produto?"
 * AC: #8 - Warning if product is in use
 */

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
import type { Product } from "@/types/product";

interface DeleteProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function DeleteProductDialog({
  open,
  onOpenChange,
  product,
  onConfirm,
  isDeleting,
}: DeleteProductDialogProps) {
  const hasCampaigns =
    product?.campaignCount !== undefined && product.campaignCount > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover produto?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. O produto será removido
            permanentemente do catálogo.
          </AlertDialogDescription>
          {hasCampaigns && (
            <p className="text-amber-500 text-sm mt-2">
              ⚠️ Este produto está vinculado a {product?.campaignCount}{" "}
              {product?.campaignCount === 1 ? "campanha" : "campanhas"}.
              Removê-lo não afetará campanhas existentes.
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
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
  );
}
