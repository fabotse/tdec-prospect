/**
 * Saved Filters Dropdown Component
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #2 - List saved filters in dropdown
 * AC: #3 - Apply saved filter to FilterPanel
 * AC: #4 - Delete saved filter with confirmation (toast undo)
 */

"use client";

import { BookmarkIcon, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  useSavedFilters,
  useDeleteSavedFilter,
  useCreateSavedFilter,
} from "@/hooks/use-saved-filters";
import { useFilterStore } from "@/stores/use-filter-store";
import type { SavedFilter } from "@/types/saved-filter";

/**
 * Dropdown component for managing saved filters
 * AC: #2 - Shows list of saved filters ordered by created_at
 * AC: #3 - Applies filter when clicked, expands panel
 * AC: #4 - Delete button per filter with toast feedback
 */
export function SavedFiltersDropdown() {
  const { setFilters, setExpanded } = useFilterStore();
  const { data: savedFilters, isLoading } = useSavedFilters();
  const deleteFilter = useDeleteSavedFilter();
  const createFilter = useCreateSavedFilter();

  /**
   * Apply saved filter to FilterPanel
   * AC: #3 - Populates filters without auto-executing search
   */
  const handleApplyFilter = (filter: SavedFilter) => {
    setFilters(filter.filtersJson);
    setExpanded(true);
    toast.success(`Filtro "${filter.name}" aplicado`);
  };

  /**
   * Delete saved filter with undo option
   * AC: #4 - Removes filter with toast undo capability
   */
  const handleDeleteFilter = async (
    e: React.MouseEvent,
    filter: SavedFilter
  ) => {
    e.stopPropagation();
    try {
      await deleteFilter.mutateAsync(filter.id);
      toast.success("Filtro removido", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await createFilter.mutateAsync({
                name: filter.name,
                filtersJson: filter.filtersJson,
              });
              toast.success("Filtro restaurado");
            } catch {
              toast.error("Erro ao restaurar filtro");
            }
          },
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao remover filtro"
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          data-testid="saved-filters-trigger"
        >
          <BookmarkIcon className="h-4 w-4" />
          Filtros Salvos
          {savedFilters && savedFilters.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
              {savedFilters.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {isLoading ? (
          <div
            className="flex items-center justify-center py-4"
            data-testid="saved-filters-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !savedFilters || savedFilters.length === 0 ? (
          <div
            className="px-2 py-4 text-center text-sm text-muted-foreground"
            data-testid="saved-filters-empty"
          >
            Nenhum filtro salvo ainda.
            <br />
            Use &quot;Salvar Filtro&quot; para criar um.
          </div>
        ) : (
          savedFilters.map((filter, index) => (
            <div key={filter.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="flex items-center justify-between cursor-pointer"
                onClick={() => handleApplyFilter(filter)}
                data-testid={`saved-filter-item-${filter.id}`}
              >
                <span className="truncate">{filter.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDeleteFilter(e, filter)}
                  disabled={deleteFilter.isPending}
                  data-testid={`delete-filter-${filter.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="sr-only">Remover filtro</span>
                </Button>
              </DropdownMenuItem>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
