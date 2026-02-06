/**
 * Segment Filter Component
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #3 - Filter leads by segment
 * AC: #4 - Show segment list with lead counts
 */

"use client";

import { useState } from "react";
import { Folder, ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSegments } from "@/hooks/use-segments";
import { CreateSegmentDialog } from "./CreateSegmentDialog";
import type { SegmentWithCount } from "@/types/segment";

interface SegmentFilterProps {
  selectedSegmentId: string | null;
  onSegmentChange: (segmentId: string | null) => void;
}

/**
 * Dropdown filter for filtering leads by segment
 * AC: #3 - Select segment to filter leads
 * AC: #4 - Shows segments with lead count badges
 */
export function SegmentFilter({
  selectedSegmentId,
  onSegmentChange,
}: SegmentFilterProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: segments, isLoading } = useSegments();

  const selectedSegment = segments?.find((s) => s.id === selectedSegmentId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            data-testid="segment-filter-trigger"
          >
            <Folder className="h-4 w-4" />
            {selectedSegment ? (
              <>
                <span className="truncate max-w-[120px]">{selectedSegment.name}</span>
                <Badge variant="secondary" className="ml-1">
                  {selectedSegment.leadCount}
                </Badge>
              </>
            ) : (
              "Segmentos"
            )}
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {isLoading ? (
            <div
              className="flex items-center justify-center py-4"
              data-testid="segment-filter-loading"
            >
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* All Leads option */}
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => onSegmentChange(null)}
                data-testid="segment-filter-all"
              >
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span>Todos os Leads</span>
                {!selectedSegmentId && (
                  <span className="ml-auto text-primary">✓</span>
                )}
              </DropdownMenuItem>

              {segments && segments.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {segments.map((segment) => (
                    <DropdownMenuItem
                      key={segment.id}
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => onSegmentChange(segment.id)}
                      data-testid={`segment-filter-item-${segment.id}`}
                    >
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{segment.name}</span>
                      <Badge variant="secondary" className="ml-auto shrink-0">
                        {segment.leadCount}
                      </Badge>
                      {selectedSegmentId === segment.id && (
                        <span className="text-primary">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator />

              {/* Create new segment option */}
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setCreateDialogOpen(true)}
                data-testid="segment-filter-create"
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
      />
    </>
  );
}
