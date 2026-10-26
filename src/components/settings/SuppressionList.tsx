"use client";

/**
 * SuppressionList
 * Story 23.5: Configurações → Lista de Supressão
 *
 * Tabela Valor / Tipo / Motivo / Origem / Data com busca. Gestor/diretor adiciona,
 * remove e importa CSV; o SDR só consulta (o servidor e o RLS barram a escrita).
 */

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { SuppressionAddForm } from "@/components/settings/SuppressionAddForm";
import { SuppressionImportDialog } from "@/components/settings/SuppressionImportDialog";
import { useSuppressionList } from "@/hooks/use-suppression-list";
import { useUser } from "@/hooks/use-user";
import {
  SUPPRESSION_ENTRY_TYPE_LABELS,
  SUPPRESSION_REASON_LABELS,
  SUPPRESSION_SOURCE_LABELS,
  type SuppressionEntry,
} from "@/types/suppression";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** Minúsculo e sem acento ("Negociação" casa com "negociacao"). */
function foldSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matches(entry: SuppressionEntry, term: string): boolean {
  if (!term) return true;
  return [
    entry.value,
    SUPPRESSION_ENTRY_TYPE_LABELS[entry.entry_type],
    SUPPRESSION_REASON_LABELS[entry.reason],
    SUPPRESSION_SOURCE_LABELS[entry.source],
  ].some((field) => foldSearch(field ?? "").includes(term));
}

export function SuppressionList() {
  const { isAdmin, isLoading: isUserLoading, isProfileLoading } = useUser();
  const canWrite = isAdmin && !isUserLoading && !isProfileLoading;
  const {
    entries,
    isLoading,
    error,
    refetch,
    addEntry,
    removeEntry,
    importEntries,
    isAdding,
    isRemoving,
    isImporting,
  } = useSuppressionList();

  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [toRemove, setToRemove] = useState<SuppressionEntry | null>(null);

  const term = foldSearch(search.trim());
  const filtered = useMemo(() => entries.filter((e) => matches(e, term)), [entries, term]);

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      const result = await removeEntry(toRemove.id);
      if (result.success) {
        toast.success("Removido da lista de supressão");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Erro ao remover da lista. Tente novamente.");
    } finally {
      setToRemove(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="suppression-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-md bg-destructive/10 p-4">
        <p className="text-destructive text-body-small">
          Erro ao carregar a lista de supressão: {error}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="ml-4 shrink-0"
          data-testid="suppression-retry"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <>
          <SuppressionAddForm onAdd={addEntry} isAdding={isAdding} />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importar CSV
            </Button>
          </div>
          <SuppressionImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImport={importEntries}
            isImporting={isImporting}
          />
        </>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar domínio, e-mail ou motivo"
            className="pl-9"
            aria-label="Buscar na lista de supressão"
          />
        </div>
        <p className="text-body-small text-foreground-muted" data-testid="suppression-count">
          {term
            ? `${filtered.length} de ${entries.length} entradas`
            : `${entries.length} ${entries.length === 1 ? "entrada" : "entradas"}`}
        </p>
      </div>

      {entries.length === 0 ? (
        <p
          className="rounded-md bg-background-secondary p-6 text-center text-body-small text-foreground-muted"
          data-testid="suppression-empty"
        >
          Nenhum domínio ou e-mail na lista de supressão
        </p>
      ) : filtered.length === 0 ? (
        <p
          className="rounded-md bg-background-secondary p-6 text-center text-body-small text-foreground-muted"
          data-testid="suppression-no-results"
        >
          Nenhuma entrada encontrada para a busca
        </p>
      ) : (
        <Table data-testid="suppression-table">
          <TableHeader>
            <TableRow>
              <TableHead>Valor</TableHead>
              <TableHead className="w-[100px]">Tipo</TableHead>
              <TableHead className="w-[130px]">Motivo</TableHead>
              <TableHead className="w-[150px]">Origem</TableHead>
              <TableHead className="w-[140px]">Data</TableHead>
              {canWrite && <TableHead className="w-[60px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="break-all font-mono text-xs">{entry.value}</TableCell>
                <TableCell>{SUPPRESSION_ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type}</TableCell>
                <TableCell>{SUPPRESSION_REASON_LABELS[entry.reason] ?? entry.reason}</TableCell>
                <TableCell>{SUPPRESSION_SOURCE_LABELS[entry.source] ?? entry.source}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(entry.created_at)}</TableCell>
                {canWrite && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToRemove(entry)}
                      disabled={isRemoving}
                      aria-label={`Remover ${entry.value}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!toRemove} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da lista de supressão?</AlertDialogTitle>
            <AlertDialogDescription>
              {toRemove?.value} deixa de estar bloqueado para campanhas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={isRemoving}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
