/**
 * Lead Table Component
 * Story: 3.5 - Lead Table Display
 * Story: 4.2.1 - Lead Import Mechanism
 *
 * AC: #1 - Table with columns: checkbox, Nome, Empresa, Cargo, Localização, Status
 * AC: #2 - Airtable-inspired styling with hover states
 * AC: #3 - Column sorting (asc → desc → none)
 * AC: #4 - Column resizing with min width
 * AC: #5 - Text truncation with tooltips
 * AC: #6 - Keyboard accessibility
 * AC: #7 - Responsive design with sticky column
 * AC: #8 - Empty state
 * Story 4.2.1: AC #3 - Import indicator column
 */

"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  SearchX,
  Mail,
  Phone,
} from "lucide-react";
import { Lead } from "@/types/lead";
import { LeadStatusDropdown } from "./LeadStatusDropdown";
import { LeadImportIndicator } from "./LeadImportIndicator";
import { cn } from "@/lib/utils";

// ==============================================
// TYPES
// ==============================================

type SortDirection = "asc" | "desc" | null;

interface SortState {
  column: keyof Lead | null;
  direction: SortDirection;
}

interface Column {
  key: keyof Lead | "select" | "contact" | "import";
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortable: boolean;
  truncate: boolean;
}

interface LeadTableProps {
  leads: Lead[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading?: boolean;
}

// ==============================================
// COLUMN CONFIGURATION
// ==============================================

const COLUMNS: Column[] = [
  {
    key: "select",
    label: "",
    defaultWidth: 48,
    minWidth: 48,
    sortable: false,
    truncate: false,
  },
  // Story 4.2.1: AC #3 - Import indicator column
  {
    key: "import",
    label: "",
    defaultWidth: 32,
    minWidth: 32,
    sortable: false,
    truncate: false,
  },
  {
    key: "firstName",
    label: "Nome",
    defaultWidth: 180,
    minWidth: 120,
    sortable: true,
    truncate: true,
  },
  {
    key: "companyName",
    label: "Empresa",
    defaultWidth: 200,
    minWidth: 100,
    sortable: true,
    truncate: true,
  },
  {
    key: "title",
    label: "Cargo",
    defaultWidth: 180,
    minWidth: 100,
    sortable: true,
    truncate: true,
  },
  {
    key: "location",
    label: "Localização",
    defaultWidth: 150,
    minWidth: 80,
    sortable: true,
    truncate: true,
  },
  // Story 3.5.1: AC #5 - Contact availability column between Localização and Status
  {
    key: "contact",
    label: "Contato",
    defaultWidth: 100,
    minWidth: 80,
    sortable: false,
    truncate: false,
  },
  {
    key: "status",
    label: "Status",
    defaultWidth: 140,
    minWidth: 100,
    sortable: true,
    truncate: false,
  },
];

// ==============================================
// MAIN COMPONENT
// ==============================================

export function LeadTable({
  leads,
  selectedIds,
  onSelectionChange,
  isLoading = false,
}: LeadTableProps) {
  // Sort state
  const [sort, setSort] = useState<SortState>({
    column: null,
    direction: null,
  });

  // Column widths state (session-only persistence)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () =>
      COLUMNS.reduce(
        (acc, col) => ({ ...acc, [col.key]: col.defaultWidth }),
        {}
      )
  );

  // Keyboard navigation state
  const [focusedCell, setFocusedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll shadow state (AC #7)
  const [scrollShadows, setScrollShadows] = useState({
    left: false,
    right: false,
  });

  // Update scroll shadows on scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateScrollShadows = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setScrollShadows({
        left: scrollLeft > 0,
        right: scrollLeft < scrollWidth - clientWidth - 1,
      });
    };

    // Initial check
    updateScrollShadows();

    container.addEventListener("scroll", updateScrollShadows);
    window.addEventListener("resize", updateScrollShadows);

    return () => {
      container.removeEventListener("scroll", updateScrollShadows);
      window.removeEventListener("resize", updateScrollShadows);
    };
  }, [leads.length]);

  // ==============================================
  // SORTING LOGIC
  // ==============================================

  // AC: #3 - Three-state sort cycle
  const handleSort = useCallback((column: keyof Lead) => {
    setSort((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column, direction: "desc" };
      }
      return { column: null, direction: null };
    });
  }, []);

  // Sort leads based on current sort state
  const sortedLeads = useMemo(() => {
    if (!sort.column || !sort.direction) return leads;

    return [...leads].sort((a, b) => {
      const aVal = a[sort.column!] ?? "";
      const bVal = b[sort.column!] ?? "";

      // String comparison with Portuguese locale
      if (typeof aVal === "string" && typeof bVal === "string") {
        const comparison = aVal.localeCompare(bVal, "pt-BR", {
          sensitivity: "base",
        });
        return sort.direction === "asc" ? comparison : -comparison;
      }

      // Fallback for other types
      const comparison = String(aVal).localeCompare(String(bVal));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [leads, sort]);

  // ==============================================
  // SELECTION LOGIC
  // ==============================================

  const allSelected = leads.length > 0 && selectedIds.length === leads.length;
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < leads.length;

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      onSelectionChange(checked ? leads.map((l) => l.id) : []);
    },
    [leads, onSelectionChange]
  );

  const handleSelectRow = useCallback(
    (id: string, checked: boolean) => {
      onSelectionChange(
        checked
          ? [...selectedIds, id]
          : selectedIds.filter((sid) => sid !== id)
      );
    },
    [selectedIds, onSelectionChange]
  );

  // ==============================================
  // COLUMN RESIZE LOGIC
  // ==============================================

  // AC: #4 - Column resizing with min width
  const handleColumnResize = useCallback(
    (columnKey: string, delta: number) => {
      const column = COLUMNS.find((c) => c.key === columnKey);
      if (!column) return;

      setColumnWidths((prev) => ({
        ...prev,
        [columnKey]: Math.max(column.minWidth, prev[columnKey] + delta),
      }));
    },
    []
  );

  // ==============================================
  // KEYBOARD NAVIGATION
  // ==============================================

  // AC: #6 - Arrow key navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>) => {
      if (!focusedCell) return;

      const { row, col } = focusedCell;
      const maxRow = sortedLeads.length;
      const maxCol = COLUMNS.length - 1;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (row < maxRow) {
            setFocusedCell({ row: row + 1, col });
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (row > 0) {
            setFocusedCell({ row: row - 1, col });
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (col < maxCol) {
            setFocusedCell({ row, col: col + 1 });
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (col > 0) {
            setFocusedCell({ row, col: col - 1 });
          }
          break;
        case "Enter":
        case " ":
          // Activate focused element (checkbox)
          if (col === 0) {
            e.preventDefault();
            if (row === 0) {
              handleSelectAll(!allSelected);
            } else {
              const lead = sortedLeads[row - 1];
              if (lead) {
                handleSelectRow(lead.id, !selectedIds.includes(lead.id));
              }
            }
          }
          break;
      }
    },
    [
      focusedCell,
      sortedLeads,
      allSelected,
      selectedIds,
      handleSelectAll,
      handleSelectRow,
    ]
  );

  // ==============================================
  // EMPTY STATE
  // ==============================================

  // AC: #8 - Empty state with Portuguese message
  if (!isLoading && leads.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center"
        role="status"
        aria-label="Nenhum lead encontrado"
      >
        <SearchX className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Nenhum lead encontrado</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Tente ajustar os filtros de busca.
        </p>
      </div>
    );
  }

  // ==============================================
  // RENDER TABLE
  // ==============================================

  return (
    <TooltipProvider delayDuration={300}>
      {/* AC: #7 - Horizontal scroll container with shadow */}
      <div
        ref={scrollContainerRef}
        className="relative overflow-x-auto rounded-md border scrollbar-thin"
        role="region"
        aria-label="Tabela de leads"
      >
        {/* Scroll shadow indicators */}
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-12 w-8 bg-gradient-to-r from-background to-transparent z-20 transition-opacity duration-200",
            scrollShadows.left ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent z-20 transition-opacity duration-200",
            scrollShadows.right ? "opacity-100" : "opacity-0"
          )}
        />

        <Table
          ref={tableRef}
          onKeyDown={handleKeyDown}
          role="grid"
          aria-rowcount={sortedLeads.length + 1}
          aria-colcount={COLUMNS.length}
        >
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {COLUMNS.map((col, colIndex) => (
                <TableHead
                  key={col.key}
                  style={{
                    width: columnWidths[col.key],
                    minWidth: col.minWidth,
                  }}
                  className={cn(
                    "relative h-12",
                    // AC: #7 - Sticky first column
                    col.key === "select" && "sticky left-0 z-10 bg-muted/50",
                    col.key === "firstName" &&
                      "sticky left-12 z-10 bg-muted/50",
                    col.sortable && "cursor-pointer select-none"
                  )}
                  onClick={() =>
                    col.sortable &&
                    col.key !== "select" &&
                    handleSort(col.key as keyof Lead)
                  }
                  onFocus={() => setFocusedCell({ row: 0, col: colIndex })}
                  tabIndex={
                    focusedCell?.row === 0 && focusedCell?.col === colIndex
                      ? 0
                      : -1
                  }
                  role="columnheader"
                  aria-sort={
                    sort.column === col.key && sort.direction
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {col.key === "select" ? (
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) =>
                        handleSelectAll(checked === true)
                      }
                      aria-label="Selecionar todos os leads"
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>{col.label}</span>
                      {col.sortable && (
                        <SortIndicator
                          direction={
                            sort.column === col.key ? sort.direction : null
                          }
                        />
                      )}
                    </div>
                  )}
                  {/* AC: #4 - Resize handle */}
                  {col.key !== "select" && (
                    <ResizeHandle
                      onResize={(delta) => handleColumnResize(col.key, delta)}
                    />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLeads.map((lead, rowIndex) => (
              <TableRow
                key={lead.id}
                data-testid={`lead-row-${lead.id}`}
                className={cn(
                  // AC: #2 - Row height and alternating backgrounds
                  "h-14 hover:bg-muted/10",
                  rowIndex % 2 === 1 && "bg-muted/5",
                  selectedIds.includes(lead.id) && "bg-primary/5"
                )}
                role="row"
                aria-rowindex={rowIndex + 2}
              >
                {/* Checkbox column - sticky */}
                <TableCell
                  className={cn(
                    "sticky left-0",
                    selectedIds.includes(lead.id)
                      ? "bg-primary/5"
                      : rowIndex % 2 === 1
                        ? "bg-muted/5"
                        : "bg-background"
                  )}
                  role="gridcell"
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 0 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 0
                      ? 0
                      : -1
                  }
                >
                  <Checkbox
                    checked={selectedIds.includes(lead.id)}
                    onCheckedChange={(checked) =>
                      handleSelectRow(lead.id, checked === true)
                    }
                    aria-label={`Selecionar ${lead.firstName} ${lead.lastName ?? ""}`}
                  />
                </TableCell>

                {/* Story 4.2.1: AC #3 - Import indicator column */}
                <TableCell
                  className={cn(
                    selectedIds.includes(lead.id)
                      ? "bg-primary/5"
                      : rowIndex % 2 === 1
                        ? "bg-muted/5"
                        : "bg-background"
                  )}
                  role="gridcell"
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 1 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 1
                      ? 0
                      : -1
                  }
                >
                  <LeadImportIndicator lead={lead} />
                </TableCell>

                {/* Nome column - sticky */}
                <TruncatedCell
                  value={`${lead.firstName} ${lead.lastName ?? ""}`.trim()}
                  stickyBackground={
                    selectedIds.includes(lead.id)
                      ? "bg-primary/5"
                      : rowIndex % 2 === 1
                        ? "bg-muted/5"
                        : "bg-background"
                  }
                  className="sticky left-12 font-medium"
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 2 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 2
                      ? 0
                      : -1
                  }
                />

                {/* Empresa column */}
                <TruncatedCell
                  value={lead.companyName}
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 3 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 3
                      ? 0
                      : -1
                  }
                />

                {/* Cargo column */}
                <TruncatedCell
                  value={lead.title}
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 4 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 4
                      ? 0
                      : -1
                  }
                />

                {/* Localização column */}
                <TruncatedCell
                  value={lead.location}
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 5 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 5
                      ? 0
                      : -1
                  }
                />

                {/* Contato column (Story 3.5.1: AC #1, #2, #5) */}
                <ContactAvailabilityCell
                  hasEmail={lead.hasEmail}
                  hasDirectPhone={lead.hasDirectPhone}
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 6 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 6
                      ? 0
                      : -1
                  }
                />

                {/* Status column - Story 4.2: AC #2 - Click to change status */}
                <TableCell
                  role="gridcell"
                  onFocus={() =>
                    setFocusedCell({ row: rowIndex + 1, col: 7 })
                  }
                  tabIndex={
                    focusedCell?.row === rowIndex + 1 &&
                    focusedCell?.col === 7
                      ? 0
                      : -1
                  }
                >
                  <LeadStatusDropdown lead={lead} currentStatus={lead.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

// ==============================================
// SORT INDICATOR SUB-COMPONENT
// ==============================================

function SortIndicator({ direction }: { direction: SortDirection }) {
  if (direction === "asc") {
    return <ChevronUp className="h-4 w-4" aria-hidden="true" />;
  }
  if (direction === "desc") {
    return <ChevronDown className="h-4 w-4" aria-hidden="true" />;
  }
  return (
    <ChevronsUpDown
      className="h-4 w-4 text-muted-foreground/50"
      aria-hidden="true"
    />
  );
}

// ==============================================
// TRUNCATED CELL SUB-COMPONENT
// ==============================================

interface TruncatedCellProps {
  value?: string | null;
  className?: string;
  stickyBackground?: string;
  onFocus?: () => void;
  tabIndex?: number;
}

// AC: #5 - Text truncation with tooltips (300ms delay via TooltipProvider)
function TruncatedCell({
  value,
  className,
  stickyBackground,
  onFocus,
  tabIndex,
}: TruncatedCellProps) {
  if (!value) {
    return (
      <TableCell
        className={cn("text-muted-foreground", stickyBackground, className)}
        role="gridcell"
        onFocus={onFocus}
        tabIndex={tabIndex}
      >
        -
      </TableCell>
    );
  }

  return (
    <TableCell
      className={cn("max-w-0", stickyBackground, className)}
      role="gridcell"
      onFocus={onFocus}
      tabIndex={tabIndex}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block truncate">{value}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>{value}</p>
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

// ==============================================
// RESIZE HANDLE SUB-COMPONENT
// ==============================================

interface ResizeHandleProps {
  onResize: (delta: number) => void;
}

// AC: #4 - Resize handle with cursor feedback
function ResizeHandle({ onResize }: ResizeHandleProps) {
  const startXRef = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      onResize(delta);
      startXRef.current = moveEvent.clientX;
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar coluna"
    />
  );
}

// ==============================================
// CONTACT AVAILABILITY CELL SUB-COMPONENT
// Story 3.5.1: AC #1, #2, #5
// ==============================================

interface ContactAvailabilityCellProps {
  hasEmail: boolean;
  hasDirectPhone: string | null;
  onFocus?: () => void;
  tabIndex?: number;
}

/**
 * Displays email and phone availability icons with tooltips
 * Story 3.5.1: AC #1 - Green email icon if hasEmail, gray otherwise
 * Story 3.5.1: AC #2 - Green phone icon if hasDirectPhone === "Yes", gray otherwise
 */
function ContactAvailabilityCell({
  hasEmail,
  hasDirectPhone,
  onFocus,
  tabIndex,
}: ContactAvailabilityCellProps) {
  const phoneAvailable = hasDirectPhone === "Yes";

  return (
    <TableCell
      role="gridcell"
      onFocus={onFocus}
      tabIndex={tabIndex}
    >
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Mail
              className={cn(
                "h-4 w-4",
                hasEmail ? "text-green-500" : "text-muted-foreground/40"
              )}
              aria-hidden="true"
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            {hasEmail ? "Email disponível" : "Email não disponível"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Phone
              className={cn(
                "h-4 w-4",
                phoneAvailable ? "text-green-500" : "text-muted-foreground/40"
              )}
              aria-hidden="true"
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            {phoneAvailable ? "Telefone disponível" : "Telefone não disponível"}
          </TooltipContent>
        </Tooltip>
      </div>
    </TableCell>
  );
}
