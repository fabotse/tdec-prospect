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
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead } from "@/types/lead";

// ==============================================
// TYPES
// ==============================================

interface ContactResultsTableProps {
  contacts: Lead[];
  isLoading: boolean;
  total?: number;
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
}: ContactResultsTableProps) {
  if (isLoading) {
    return <ContactTableSkeleton />;
  }

  if (contacts.length === 0) {
    return <ContactEmptyState />;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="contact-results">
      {/* Results info */}
      <div className="text-sm text-muted-foreground">
        {(total ?? contacts.length).toLocaleString("pt-BR")} contato{(total ?? contacts.length) === 1 ? "" : "s"} encontrado{(total ?? contacts.length) === 1 ? "" : "s"}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
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
