/**
 * LeadTrackingTable Component
 * Story 10.5: Lead Tracking Detail
 *
 * AC: #1 — Tabela estilo Airtable com Email, Nome, Aberturas, Cliques, Respondeu, Ultimo Open
 * AC: #2 — Ordenacao client-side por qualquer coluna
 * AC: #3 — Badge "Alto Interesse" quando openCount >= 3
 * AC: #4 — Skeleton loading state
 * AC: #5 — Paginacao client-side
 * AC: #6 — Estado vazio
 */

"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, MailOpen, AlertCircle } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeadTracking } from "@/types/tracking";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";

// ==============================================
// CONSTANTS
// ==============================================

const DEFAULT_HIGH_INTEREST_THRESHOLD = 3;
const LEADS_PER_PAGE = 20;

// ==============================================
// TYPES
// ==============================================

type SortableColumn = "leadEmail" | "firstName" | "openCount" | "clickCount" | "hasReplied" | "lastOpenAt";
type SortDirection = "asc" | "desc" | null;

interface SortState {
  column: SortableColumn | null;
  direction: SortDirection;
}

interface LeadTrackingTableProps {
  leads: LeadTracking[];
  isLoading: boolean;
  isError?: boolean;
}

// ==============================================
// HELPERS
// ==============================================

function formatName(lead: LeadTracking): string {
  const parts = [lead.firstName, lead.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "-";
}

function getNextDirection(current: SortDirection): SortDirection {
  if (current === null) return "desc";
  if (current === "desc") return "asc";
  return null;
}

function compareLead(a: LeadTracking, b: LeadTracking, column: SortableColumn, direction: "asc" | "desc"): number {
  const mult = direction === "asc" ? 1 : -1;

  switch (column) {
    case "leadEmail":
      return mult * a.leadEmail.localeCompare(b.leadEmail);
    case "firstName": {
      const nameA = formatName(a);
      const nameB = formatName(b);
      return mult * nameA.localeCompare(nameB);
    }
    case "openCount":
      return mult * (a.openCount - b.openCount);
    case "clickCount":
      return mult * (a.clickCount - b.clickCount);
    case "hasReplied": {
      const valA = a.hasReplied ? 1 : 0;
      const valB = b.hasReplied ? 1 : 0;
      return mult * (valA - valB);
    }
    case "lastOpenAt": {
      const timeA = a.lastOpenAt ? new Date(a.lastOpenAt).getTime() : 0;
      const timeB = b.lastOpenAt ? new Date(b.lastOpenAt).getTime() : 0;
      return mult * (timeA - timeB);
    }
    default:
      return 0;
  }
}

// ==============================================
// SORT INDICATOR
// ==============================================

function SortIndicator({ direction }: { direction: SortDirection }) {
  if (direction === "asc") {
    return <ChevronUp className="h-4 w-4" aria-hidden="true" />;
  }
  if (direction === "desc") {
    return <ChevronDown className="h-4 w-4" aria-hidden="true" />;
  }
  return <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />;
}

// ==============================================
// SORTABLE HEADER
// ==============================================

function SortableHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortableColumn;
  sort: SortState;
  onSort: (column: SortableColumn) => void;
}) {
  const direction = sort.column === column ? sort.direction : null;
  return (
    <TableHead>
      <button
        type="button"
        className="flex items-center gap-1 cursor-pointer hover:text-foreground"
        onClick={() => onSort(column)}
        data-testid={`sort-${column}`}
      >
        {label}
        <SortIndicator direction={direction} />
      </button>
    </TableHead>
  );
}

// ==============================================
// SKELETON ROWS
// ==============================================

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={`skeleton-${i}`} data-testid="skeleton-row">
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ==============================================
// EMPTY STATE
// ==============================================

function EmptyState() {
  return (
    <div data-testid="lead-tracking-empty" className="flex flex-col items-center justify-center py-12 gap-3">
      <MailOpen className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">Nenhum evento de tracking recebido ainda</p>
      <p className="text-xs text-muted-foreground">Os dados de tracking aparecerao aqui apos o envio da campanha</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div data-testid="lead-tracking-error" className="flex flex-col items-center justify-center py-12 gap-3">
      <AlertCircle className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">Erro ao carregar dados de tracking</p>
      <p className="text-xs text-muted-foreground">Tente novamente mais tarde</p>
    </div>
  );
}

// ==============================================
// LEAD TRACKING TABLE
// ==============================================

export function LeadTrackingTable({ leads, isLoading, isError }: LeadTrackingTableProps) {
  const [sort, setSort] = useState<SortState>({ column: null, direction: null });
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (column: SortableColumn) => {
    setSort((prev) => {
      if (prev.column === column) {
        const next = getNextDirection(prev.direction);
        return next === null ? { column: null, direction: null } : { column, direction: next };
      }
      return { column, direction: "desc" };
    });
    setCurrentPage(1);
  };

  const sortedLeads = useMemo(() => {
    if (!sort.column || !sort.direction) return leads;
    return [...leads].sort((a, b) => compareLead(a, b, sort.column!, sort.direction!));
  }, [leads, sort.column, sort.direction]);

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / LEADS_PER_PAGE));
  const effectivePage = Math.min(currentPage, totalPages);
  const paginatedLeads = sortedLeads.slice(
    (effectivePage - 1) * LEADS_PER_PAGE,
    effectivePage * LEADS_PER_PAGE
  );

  if (!isLoading && isError) {
    return <ErrorState />;
  }

  if (!isLoading && leads.length === 0) {
    return <EmptyState />;
  }

  return (
    <div data-testid="lead-tracking-table" className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader label="Email" column="leadEmail" sort={sort} onSort={handleSort} />
            <SortableHeader label="Nome" column="firstName" sort={sort} onSort={handleSort} />
            <SortableHeader label="Aberturas" column="openCount" sort={sort} onSort={handleSort} />
            <SortableHeader label="Cliques" column="clickCount" sort={sort} onSort={handleSort} />
            <SortableHeader label="Respondeu" column="hasReplied" sort={sort} onSort={handleSort} />
            <SortableHeader label="Ultimo Open" column="lastOpenAt" sort={sort} onSort={handleSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <SkeletonRows />
          ) : (
            paginatedLeads.map((lead) => (
              <TableRow key={lead.leadEmail} data-testid="lead-row">
                <TableCell className="font-medium">{lead.leadEmail}</TableCell>
                <TableCell>{formatName(lead)}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {lead.openCount}
                    {lead.openCount >= DEFAULT_HIGH_INTEREST_THRESHOLD && (
                      <Badge
                        variant="outline"
                        className="border-primary/50 text-primary text-[10px]"
                        data-testid="high-interest-badge"
                      >
                        Alto Interesse
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{lead.clickCount}</TableCell>
                <TableCell>{lead.hasReplied ? "Sim" : "Nao"}</TableCell>
                <TableCell>{lead.lastOpenAt ? formatRelativeTime(lead.lastOpenAt) : "-"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {!isLoading && leads.length > LEADS_PER_PAGE && (
        <div data-testid="pagination" className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {leads.length} leads no total
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={effectivePage <= 1}
              data-testid="prev-page"
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground" data-testid="page-indicator">
              Pagina {effectivePage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={effectivePage >= totalPages}
              data-testid="next-page"
            >
              Proximo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
