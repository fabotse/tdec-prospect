/**
 * Errors Settings Page
 * Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
 *
 * Aba "Erros" em Configurações: últimos erros de servidor, do agente e dos jobs agendados.
 */

"use client";

import { ErrorLogList } from "@/components/settings/ErrorLogList";

export default function ErrorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-h2 text-foreground">Erros</h2>
        <p className="text-body-small text-foreground-muted mt-1">
          Últimos 50 erros registrados no servidor, no agente e nos jobs agendados.
        </p>
      </div>
      <ErrorLogList />
    </div>
  );
}
