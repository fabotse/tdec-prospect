/**
 * Segment Dropdown Component
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #2 - Add leads to segment via dropdown
 * AC: #4 - Show segment list with lead counts
 * AC: #5 - Delete segment with confirmation
 */

"use client";

import { useState, useCallback } from "react";
import { FolderPlus, Folder, Trash2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  useSegments,
  useDeleteSegment,
  useAddLeadsToSegment,
} from "@/hooks/use-segments";
import { CreateSegmentDialog } from "./CreateSegmentDialog";
import type { SegmentWithCount, LeadDataForSegment } from "@/types/segment";
import type { Lead } from "@/types/lead";

interface SegmentDropdownProps {
  /** Selected lead objects - needed to persist leads before adding to segment */
  selectedLeads: Lead[];
  onSuccess?: () => void;
}

/**
 * Convert Lead to LeadDataForSegment
 * Extracts only the fields needed for segment association API
 *
 * @note apolloId fallback: When a lead doesn't have an apolloId (e.g., manually created leads
 * or leads from sources other than Apollo), we use the lead's database id as a fallback.
 * This ensures all leads can be added to segments regardless of their origin.
 * The API will use this value to upsert the lead before creating the segment association.
 */
function toLeadDataForSegment(lead: Lead): LeadDataForSegment {
  return {
    apolloId: lead.apolloId ?? lead.id, // Fallback to id if apolloId is null (see @note above)
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.companyName,
    companySize: lead.companySize,
    industry: lead.industry,
    location: lead.location,
    title: lead.title,
    linkedinUrl: lead.linkedinUrl,
    hasEmail: lead.hasEmail,
    hasDirectPhone: lead.hasDirectPhone,
  };
}

/**
 * Dropdown component for adding leads to segments
 * AC: #2 - Shows segment list and adds selected leads
 * AC: #4 - Shows segments with lead count badges
 * AC: #5 - Delete button per segment with confirmation dialog
 */
export function SegmentDropdown({
  selectedLeads,
  onSuccess,
}: SegmentDropdownProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [segmentToDelete, setSegmentToDelete] = useState<SegmentWithCount | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { data: segments, isLoading } = useSegments();
  const deleteSegment = useDeleteSegment();
  const addLeads = useAddLeadsToSegment();

  /**
   * Add selected leads to a segment
   * AC: #2 - Associates leads with segment
   * Now sends full lead data for upsert before association
   */
  const handleAddToSegment = useCallback(
    async (segment: SegmentWithCount) => {
      if (selectedLeads.length === 0) {
        toast.error("Nenhum lead selecionado");
        return;
      }

      try {
        const leadsData = selectedLeads.map(toLeadDataForSegment);
        await addLeads.mutateAsync({
          segmentId: segment.id,
          leads: leadsData,
        });
        toast.success(`${selectedLeads.length} leads adicionados ao segmento`);
        setDropdownOpen(false);
        onSuccess?.();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao adicionar leads ao segmento"
        );
      }
    },
    [selectedLeads, addLeads, onSuccess]
  );

  /**
   * Open delete confirmation dialog
   * AC: #5 - Confirmation before delete
   */
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, segment: SegmentWithCount) => {
      e.stopPropagation();
      setSegmentToDelete(segment);
      setDeleteDialogOpen(true);
    },
    []
  );

  /**
   * Confirm segment deletion
   * AC: #5 - Delete segment (leads are NOT deleted)
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!segmentToDelete) return;

    try {
      await deleteSegment.mutateAsync(segmentToDelete.id);
      toast.success("Segmento removido");
      setDeleteDialogOpen(false);
      setSegmentToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao remover segmento"
      );
    }
  }, [segmentToDelete, deleteSegment]);

  /**
   * Handle new segment created
   * Automatically adds selected leads to the new segment
   */
  const handleSegmentCreated = useCallback(
    async (segment: SegmentWithCount) => {
      if (selectedLeads.length > 0) {
        await handleAddToSegment(segment);
      }
    },
    [selectedLeads, handleAddToSegment]
  );

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            disabled={selectedLeads.length === 0}
            data-testid="segment-dropdown-trigger"
          >
            <FolderPlus className="h-4 w-4" />
            Adicionar ao Segmento
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {isLoading ? (
            <div
              className="flex items-center justify-center py-4"
              data-testid="segments-loading"
            >
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Segment list */}
              {segments && segments.length > 0 ? (
                segments.map((segment) => (
                  <DropdownMenuItem
                    key={segment.id}
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => handleAddToSegment(segment)}
                    disabled={addLeads.isPending}
                    data-testid={`segment-item-${segment.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{segment.name}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {segment.leadCount}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteClick(e, segment)}
                      disabled={deleteSegment.isPending}
                      data-testid={`delete-segment-${segment.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                      <span className="sr-only">Remover segmento</span>
                    </Button>
                  </DropdownMenuItem>
                ))
              ) : (
                <div
                  className="px-2 py-4 text-center text-sm text-muted-foreground"
                  data-testid="segments-empty"
                >
                  Nenhum segmento ainda.
                </div>
              )}

              <DropdownMenuSeparator />

              {/* Create new segment option */}
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => {
                  setDropdownOpen(false);
                  setCreateDialogOpen(true);
                }}
                data-testid="create-segment-option"
              >
                <Plus className="h-4 w-4" />
                Criar Segmento
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create segment dialog */}
      <CreateSegmentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleSegmentCreated}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover segmento?</AlertDialogTitle>
            <AlertDialogDescription>
              O segmento &quot;{segmentToDelete?.name}&quot; será removido.
              Os leads não serão excluídos, apenas a associação com o segmento.
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
