/**
 * Contact Results Table
 * Story: 15.4 - Apollo Bridge: Busca de Contatos nas Empresas
 *
 * AC: #3 - Display contacts: name, title, email availability, company, phone availability
 * AC: #4 - Empty state when no contacts found
 */

"use client";

import { Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead } from "@/types/lead";

// ==============================================
// TYPES
// ==============================================

interface ContactResultsTableProps {
  contacts: Lead[];
  isLoading: boolean;
  total?: number;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

// ==============================================
// AVAILABILITY BADGE
// ==============================================

function StatusBadge({
  available,
  unavailableLabel = "Indisponível",
  testId,
}: {
  available: boolean;
  unavailableLabel?: string;
  testId: string;
}) {
  return (
    <Badge
      variant={available ? "default" : "secondary"}
      className={
        available
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }
      data-testid={testId}
    >
      {available ? "Disponível" : unavailableLabel}
    </Badge>
  );
}

// ==============================================
// LOADING SKELETON
// ==============================================

function ContactTableSkeleton() {
  return (
    <div className="flex flex-col gap-2" data-testid="contact-table-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// ==============================================
// EMPTY STATE
// ==============================================

function ContactEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md border bg-card py-12 text-center"
      data-testid="contact-empty-state"
    >
      <Users className="mb-3 h-10 w-10 text-muted-foreground" />
      <h3 className="text-sm font-medium text-foreground">
        Nenhum contato encontrado com os cargos selecionados
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Tente ajustar os cargos-alvo ou selecionar outras empresas.
      </p>
    </div>
  );
}

// ==============================================
// MAIN COMPONENT
// ==============================================

export function ContactResultsTable({
  contacts,
  isLoading,
  total,
  selectedIds,
  onSelectionChange,
}: ContactResultsTableProps) {
  if (isLoading) {
    return <ContactTableSkeleton />;
  }

  if (contacts.length === 0) {
    return <ContactEmptyState />;
  }

  const hasSelection = selectedIds !== undefined && onSelectionChange !== undefined;
  const allSelected = hasSelection && contacts.length > 0 && contacts.every((c) => selectedIds.includes(c.id));
  const someSelected = hasSelection && selectedIds.length > 0 && !allSelected;

  return (
    <div className="flex flex-col gap-3" data-testid="contact-results">
      {/* Results info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {(total ?? contacts.length).toLocaleString("pt-BR")} contato{(total ?? contacts.length) === 1 ? "" : "s"} encontrado{(total ?? contacts.length) === 1 ? "" : "s"}
        </span>
        {hasSelection && selectedIds.length > 0 && (
          <span data-testid="contact-selection-counter">
            | {selectedIds.length} contato{selectedIds.length === 1 ? "" : "s"} selecionado{selectedIds.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {hasSelection && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onSelectionChange(contacts.map((c) => c.id));
                      } else {
                        onSelectionChange([]);
                      }
                    }}
                    aria-label="Selecionar todos os contatos"
                    data-testid="select-all-contacts"
                  />
                </TableHead>
              )}
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Telefone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id} data-testid={`contact-row-${contact.id}`}>
                {hasSelection && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(contact.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onSelectionChange([...selectedIds, contact.id]);
                        } else {
                          onSelectionChange(selectedIds.filter((id) => id !== contact.id));
                        }
                      }}
                      aria-label={`Selecionar ${contact.firstName}`}
                      data-testid={`select-contact-${contact.id}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  {contact.firstName}{contact.lastName ? ` ${contact.lastName}` : ""}
                </TableCell>
                <TableCell>{contact.title ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge
                    available={contact.hasEmail}
                    testId={`email-badge-${contact.id}`}
                  />
                </TableCell>
                <TableCell>{contact.companyName ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge
                    available={contact.hasDirectPhone === "Yes"}
                    unavailableLabel="N/A"
                    testId={`phone-badge-${contact.id}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
