"use client";

/**
 * ErrorLogList
 * Story 23.3: Configurações → Erros
 *
 * Tabela Data / Origem / Rota / Mensagem com os últimos erros registrados em `error_logs`.
 */

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorLogs } from "@/hooks/use-error-logs";
import { ERROR_SOURCE_LABELS, type ErrorLog } from "@/types/error-log";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

function sourceLabel(source: ErrorLog["source"]): string {
  return ERROR_SOURCE_LABELS[source] ?? source;
}

export function ErrorLogList() {
  const { data, isLoading, error, refetch } = useErrorLogs();

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="error-logs-loading">
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
          Erro ao carregar o registro de erros: {error.message}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="ml-4 shrink-0"
          data-testid="error-logs-retry"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const logs = data ?? [];

  if (logs.length === 0) {
    return (
      <p
        className="rounded-md bg-background-secondary p-6 text-center text-body-small text-foreground-muted"
        data-testid="error-logs-empty"
      >
        Nenhum erro registrado
      </p>
    );
  }

  return (
    <Table data-testid="error-logs-table">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[140px]">Data</TableHead>
          <TableHead className="w-[120px]">Origem</TableHead>
          <TableHead className="w-[240px]">Rota</TableHead>
          <TableHead>Mensagem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
            <TableCell>{sourceLabel(log.source)}</TableCell>
            <TableCell className="font-mono text-xs break-all">{log.route}</TableCell>
            <TableCell className="whitespace-pre-wrap break-words text-body-small">
              {log.message}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
