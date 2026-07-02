/**
 * Delete Segment Button
 * Story 4.1: Lead Segments/Lists
 *
 * Reusable trash button + confirmation dialog for deleting a segment.
 * Deletes the segment only — leads are preserved (backend CASCADE removes
 * just the lead_segments associations).
 */

"use client";

import { useCallback, useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useDeleteSegment } from "@/hooks/use-segments";
import type { SegmentWithCount } from "@/types/segment";

interface DeleteSegmentButtonProps {
  segment: SegmentWithCount;
  /**
   * Notifies the parent when the confirmation dialog opens/closes.
   * Lets a containing dropdown stay open while the dialog is shown,
   * avoiding the nested-Radix unmount race.
   */
  onOpenChange?: (open: boolean) => void;
  /** Called after the segment is successfully deleted. */
  onDeleted?: (segment: SegmentWithCount) => void;
}

/**
 * Ghost trash button that opens a confirmation dialog before deleting a segment.
 * Reuses the existing useDeleteSegment mutation. No leads are deleted.
 */
export function DeleteSegmentButton({
  segment,
  onOpenChange,
  onDeleted,
}: DeleteSegmentButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const deleteSegment = useDeleteSegment();

  const setOpen = useCallback(
    (open: boolean) => {
      setDialogOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange]
  );

  /**
   * Open the confirmation dialog.
   * stopPropagation/preventDefault so the click does NOT trigger the
   * surrounding row (e.g. a segment filter/select item).
   */
  const handleTriggerClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setOpen(true);
    },
    [setOpen]
  );

  const handleConfirmDelete = useCallback(
    async (e: React.MouseEvent) => {
      // Keep the dialog open until the mutation resolves so the pending state
      // is visible and a second click can't fire a duplicate DELETE.
      e.preventDefault();
      if (deleteSegment.isPending) return;
      try {
        await deleteSegment.mutateAsync(segment.id);
        toast.success("Segmento removido");
        setOpen(false);
        onDeleted?.(segment);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao remover segmento"
        );
      }
    },
    [segment, deleteSegment, setOpen, onDeleted]
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={handleTriggerClick}
        disabled={deleteSegment.isPending}
        data-testid={`delete-segment-${segment.id}`}
      >
        <Trash2 className="h-3 w-3" />
        <span className="sr-only">Remover segmento</span>
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover segmento?</AlertDialogTitle>
            <AlertDialogDescription>
              O segmento &quot;{segment.name}&quot; será removido. Os leads não
              serão excluídos, apenas a associação com o segmento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSegment.isPending}
            >
              {deleteSegment.isPending ? (
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
    </>
  );
}
