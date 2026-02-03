"use client";

/**
 * Delete Campaign Dialog Component
 * Confirmation dialog for removing campaigns
 *
 * AC: #1 - Opens dialog when user clicks "Remover" option
 * AC: #3 - Dialog closes without deleting when "Cancelar" clicked
 * AC: #4 - Shows loading state during delete
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
import type { CampaignWithCount } from "@/types/campaign";

interface DeleteCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignWithCount | null;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function DeleteCampaignDialog({
  open,
  onOpenChange,
  campaign,
  onConfirm,
  isDeleting,
}: DeleteCampaignDialogProps) {
  const hasLeads = campaign?.leadCount !== undefined && campaign.leadCount > 0;
  const campaignName = campaign?.name || "esta campanha";

  // F1 FIX: Prevent dialog from closing before async operation completes
  const handleConfirmClick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault();
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover campanha?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. A campanha{" "}
            <strong>&quot;{campaignName}&quot;</strong> será removida
            permanentemente, incluindo todos os blocos de email e delay.
          </AlertDialogDescription>
          {hasLeads && (
            <p className="text-amber-500 text-sm mt-2">
              ⚠️ Esta campanha possui {campaign?.leadCount}{" "}
              {campaign?.leadCount === 1 ? "lead associado" : "leads associados"}.
              Os dados de relacionamento serão removidos.
            </p>
          )}
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
