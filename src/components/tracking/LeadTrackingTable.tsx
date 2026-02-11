/**
 * LeadTrackingTable Component
 * Story 10.5: Lead Tracking Detail
 * Story 11.7: WhatsApp indicator column (AC #3, #7)
 *
 * AC: #1 — Tabela estilo Airtable com Email, Nome, Aberturas, Cliques, Respondeu, Ultimo Open
 * AC: #2 — Ordenacao client-side por qualquer coluna
 * AC: #3 — Badge "Alto Interesse" quando openCount >= 3
 * AC: #4 — Skeleton loading state
 * AC: #5 — Paginacao client-side
 * AC: #6 — Estado vazio
 * AC 11.7 #3 — WhatsApp icon for leads with messages
 * AC 11.7 #7 — Status icons following WhatsApp conventions
 */

"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, MailOpen, AlertCircle, MessageCircle, Check, CheckCheck, X, Clock } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeadTracking } from "@/types/tracking";
import type { WhatsAppMessageStatus } from "@/types/database";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";

// ==============================================
// CONSTANTS
// ==============================================

export const DEFAULT_HIGH_INTEREST_THRESHOLD = 3;
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
  highInterestThreshold?: number;
  onHighInterestClick?: () => void;
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
// WHATSAPP STATUS HELPER (Story 11.7 AC#7)
// ==============================================

export function getWhatsAppStatusIcon(status: WhatsAppMessageStatus) {
  switch (status) {
    case "pending":
      return { icon: Clock, color: "text-muted-foreground", label: "Pendente" };
    case "sent":
      return { icon: Check, color: "text-green-600 dark:text-green-400", label: "Enviado" };
    case "delivered":
      return { icon: CheckCheck, color: "text-blue-500", label: "Entregue" };
    case "read":
      return { icon: CheckCheck, color: "text-blue-700 dark:text-blue-300", label: "Lido" };
    case "failed":
      return { icon: X, color: "text-red-500", label: "Falhou" };
  }
}

function formatWhatsAppDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
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
          <TableCell><Skeleton className="h-4 w-4" /></TableCell>
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

export function LeadTrackingTable({ leads, isLoading, isError, highInterestThreshold, onHighInterestClick }: LeadTrackingTableProps) {
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
    <TooltipProvider>
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
            <TableHead className="w-10">WA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <SkeletonRows />
          ) : (
            paginatedLeads.map((lead) => {
              const waCount = lead.whatsappMessageCount ?? 0;
              return (
              <TableRow key={lead.leadEmail} data-testid="lead-row">
                <TableCell className="font-medium">{lead.leadEmail}</TableCell>
                <TableCell>{formatName(lead)}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {lead.openCount}
                    {lead.openCount >= (highInterestThreshold ?? DEFAULT_HIGH_INTEREST_THRESHOLD) && (
                      <Badge
                        variant="outline"
                        className="border-primary/50 text-primary text-[10px] cursor-pointer hover:bg-primary/10"
                        data-testid="high-interest-badge"
                        onClick={(e) => {
                          e.stopPropagation();
                          onHighInterestClick?.();
                        }}
                      >
                        Alto Interesse
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{lead.clickCount}</TableCell>
                <TableCell>{lead.hasReplied ? "Sim" : "Nao"}</TableCell>
                <TableCell>{lead.lastOpenAt ? formatRelativeTime(lead.lastOpenAt) : "-"}</TableCell>
                <TableCell>
                  {waCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span data-testid="whatsapp-indicator" className="cursor-pointer">
                          <MessageCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {waCount === 1
                          ? `WhatsApp enviado em ${formatWhatsAppDate(lead.lastWhatsAppSentAt)}`
                          : `${waCount} mensagens WhatsApp | Última: ${formatWhatsAppDate(lead.lastWhatsAppSentAt)}`}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
              );
            })
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
    </TooltipProvider>
  );
}
