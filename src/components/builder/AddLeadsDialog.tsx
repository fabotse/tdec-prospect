/**
 * Add Leads Dialog Component
 * Story 5.7: Campaign Lead Association
 * Story 12.7: Carregamento completo de leads no dialog
 *
 * AC: #1 - Open modal showing available leads (ALL leads, not just first 25)
 * AC: #2 - Search and filter leads with debounce
 * AC: #3 - Select leads individually or in batch (ALL leads, not just visible)
 * AC: #4 - Add leads to campaign via API
 * AC: #7 - View leads already associated
 * AC: #8 - Remove leads from campaign
 */

"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, Loader2, Users, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAllLeads } from "@/hooks/use-my-leads";
import { useCampaignLeads } from "@/hooks/use-campaign-leads";
import { SegmentFilter } from "@/components/leads/SegmentFilter";
import type { Lead } from "@/types/lead";

interface AddLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  onLeadsAdded?: () => void;
}

/**
 * Dialog for adding/viewing/removing leads in a campaign
 * Story 12.7: Uses useAllLeads with infinite scroll for complete lead loading
 */
export function AddLeadsDialog({
  open,
  onOpenChange,
  campaignId,
  onLeadsAdded,
}: AddLeadsDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null
  );
  const [selectAllPending, setSelectAllPending] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Story 12.7 AC #1, #5: Fetch ALL leads with infinite query (per_page=100)
  // Hook handles debouncing internally
  const {
    leads,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    fetchAllPages,
  } = useAllLeads({ search, segmentId: selectedSegmentId });

  // Fetch leads already in campaign and mutations
  const {
    leads: campaignLeads,
    addLeads,
    removeLead,
    isAdding,
    isRemoving,
  } = useCampaignLeads(campaignId);

  // Set of lead IDs already in campaign
  const existingLeadIds = useMemo(
    () => new Set(campaignLeads.map((cl) => cl.lead.id)),
    [campaignLeads]
  );

  // Available leads (not yet in campaign)
  const availableLeads = useMemo(
    () => leads.filter((l) => !existingLeadIds.has(l.id)),
    [leads, existingLeadIds]
  );

  // Story 12.7 AC #2: Total available from API (not limited by loaded page count)
  // CR fix M1: Use loaded availableLeads count + unloaded remainder for accurate display
  const availableTotal = useMemo(() => {
    const unloadedCount = Math.max(0, total - leads.length);
    return availableLeads.length + unloadedCount;
  }, [total, leads.length, availableLeads.length]);

  // Check if all available leads are selected
  const isAllSelected = useMemo(
    () =>
      availableLeads.length > 0 &&
      availableLeads.every((l) => selectedIds.has(l.id)),
    [availableLeads, selectedIds]
  );

  // Story 12.7 AC #4: Infinite scroll with IntersectionObserver
  // CR fix M2: Use ref to avoid observer teardown/setup churn on isFetchingNextPage changes
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  useEffect(() => {
    isFetchingNextPageRef.current = isFetchingNextPage;
  }, [isFetchingNextPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPageRef.current) {
          fetchNextPage();
        }
      },
      { root: viewport || null, threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Toggle single lead selection
  const toggleLead = useCallback((leadId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }, []);

  // Story 12.7 AC #3: Toggle all leads — loads all pages first if needed
  // CR fix H1: catch error to reset selectAllPending
  // fetchAllPages returns all leads via Promise, avoiding setState-in-effect
  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      // Deselect all
      setSelectedIds(new Set());
    } else if (hasNextPage) {
      // Need to load all pages first, then select
      setSelectAllPending(true);
      fetchAllPages()
        .then((allLeads) => {
          const allAvailable = allLeads.filter(
            (l) => !existingLeadIds.has(l.id)
          );
          setSelectedIds(new Set(allAvailable.map((l) => l.id)));
          setSelectAllPending(false);
        })
        .catch(() => setSelectAllPending(false));
    } else {
      // All pages loaded, select all available
      setSelectedIds(new Set(availableLeads.map((l) => l.id)));
    }
  }, [isAllSelected, hasNextPage, fetchAllPages, availableLeads, existingLeadIds]);

  // Handle add leads - AC #4: add leads and close modal
  // CR fix L2: wrap in try/catch to prevent unhandled promise rejection
  const handleAddLeads = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await addLeads.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
      onLeadsAdded?.();
      onOpenChange(false); // AC #4: close modal after success
    } catch {
      // Error is handled by React Query's mutation state (addLeads.isError)
    }
  }, [selectedIds, addLeads, onLeadsAdded, onOpenChange]);

  // Handle remove lead
  const handleRemoveLead = useCallback(
    async (leadId: string) => {
      await removeLead.mutateAsync(leadId);
    },
    [removeLead]
  );

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setSearch("");
        setSelectedIds(new Set());
        setSelectedSegmentId(null);
        setSelectAllPending(false);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[600px] max-h-[80vh] flex flex-col"
        aria-describedby="add-leads-description"
      >
        <DialogHeader>
          <DialogTitle>Adicionar Leads</DialogTitle>
          <DialogDescription id="add-leads-description">
            Selecione os leads que deseja adicionar a esta campanha.
          </DialogDescription>
        </DialogHeader>

        {/* Search Input - AC #2 */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Buscar por nome, empresa ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="lead-search-input"
            aria-label="Buscar leads"
          />
        </div>

        {/* Segment Filter - Story 12.1 AC #1 */}
        <SegmentFilter
          selectedSegmentId={selectedSegmentId}
          onSegmentChange={(segmentId) => {
            setSelectedSegmentId(segmentId);
            setSelectedIds(new Set());
            setSelectAllPending(false);
          }}
        />

        {/* Leads already in campaign - AC #7 */}
        {campaignLeads.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Leads na campanha ({campaignLeads.length})
            </p>
            <ScrollArea className="h-24 rounded-md border">
              <div className="p-2 space-y-1">
                {campaignLeads.map((cl) => (
                  <div
                    key={cl.id}
                    className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted"
                  >
                    <span className="text-sm truncate">
                      {cl.lead.firstName} {cl.lead.lastName}
                      {cl.lead.companyName && ` - ${cl.lead.companyName}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => handleRemoveLead(cl.lead.id)}
                      disabled={isRemoving}
                      aria-label={`Remover ${cl.lead.firstName} ${cl.lead.lastName}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Available leads - AC #1, #3 */}
        <div className="flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-sm font-medium text-muted-foreground"
              data-testid="available-leads-count"
            >
              Leads disponiveis ({availableTotal})
            </p>
            {selectedIds.size > 0 && (
              <span className="text-sm text-primary">
                {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2
                className="h-6 w-6 animate-spin"
                aria-label="Carregando leads"
              />
            </div>
          ) : availableLeads.length === 0 && !hasNextPage ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mb-2" aria-hidden="true" />
              <p className="text-sm">
                {search ? "Nenhum lead encontrado" : "Nenhum lead disponivel"}
              </p>
            </div>
          ) : (
            <ScrollArea
              ref={scrollAreaRef}
              className="h-64 rounded-md border"
              data-testid="leads-scroll-area"
            >
              <div className="p-2">
                {/* Header with select all */}
                <div className="flex items-center gap-3 px-2 py-1.5 border-b">
                  <Checkbox
                    checked={isAllSelected && !selectAllPending}
                    onCheckedChange={toggleAll}
                    disabled={selectAllPending}
                    aria-label="Selecionar todos os leads"
                    data-testid="select-all-checkbox"
                  />
                  <span className="text-sm font-medium">
                    {selectAllPending
                      ? "Carregando todos os leads..."
                      : "Selecionar todos"}
                  </span>
                </div>

                {/* Lead rows */}
                {availableLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    isSelected={selectedIds.has(lead.id)}
                    onToggle={() => toggleLead(lead.id)}
                  />
                ))}

                {/* Story 12.7 AC #4: Sentinel for infinite scroll */}
                {hasNextPage && (
                  <div
                    ref={sentinelRef}
                    data-testid="scroll-sentinel"
                    className="py-2"
                  >
                    {isFetchingNextPage && (
                      <div className="flex justify-center">
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-label="Carregando mais leads"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleAddLeads}
            disabled={selectedIds.size === 0 || isAdding}
            data-testid="add-leads-submit"
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              `Adicionar${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Individual lead row component
 * AC: #3 - Lead selection with checkbox
 */
function LeadRow({
  lead,
  isSelected,
  onToggle,
}: {
  lead: Lead;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const initials =
    `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();
  const fullName = `${lead.firstName} ${lead.lastName || ""}`.trim();

  return (
    <div
      className="flex items-center gap-3 px-2 py-2 hover:bg-muted rounded cursor-pointer"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      data-testid={`lead-row-${lead.id}`}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Selecionar ${fullName}`}
      />
      <Avatar className="h-8 w-8">
        <AvatarImage src={lead.photoUrl || undefined} alt={fullName} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fullName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {lead.title}
          {lead.companyName && ` @ ${lead.companyName}`}
        </p>
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[150px]">
        {lead.email}
      </span>
    </div>
  );
}
