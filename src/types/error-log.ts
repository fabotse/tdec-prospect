/**
 * Error Log Types
 * Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
 *
 * Tabela `error_logs` (migration 00068): erros de servidor e de jobs agendados.
 * `tenant_id` nulo = erro de plataforma (cron), visível aos gestores.
 */

export type ErrorSource = "api" | "server" | "agent_step" | "cron";

export const ERROR_SOURCE_LABELS: Record<ErrorSource, string> = {
  api: "API",
  server: "Servidor",
  agent_step: "Agente",
  cron: "Job agendado",
};

export interface ErrorLogRow {
  id: string;
  tenant_id: string | null;
  source: ErrorSource;
  route: string;
  message: string;
  created_at: string;
}

export interface ErrorLog {
  id: string;
  tenantId: string | null;
  source: ErrorSource;
  route: string;
  message: string;
  createdAt: string;
}

export function toErrorLog(row: ErrorLogRow): ErrorLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    source: row.source,
    route: row.route,
    message: row.message,
    createdAt: row.created_at,
  };
}
