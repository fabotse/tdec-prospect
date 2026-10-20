/**
 * Errors Settings Page
 * Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
 *
 * Aba "Erros" em Configurações: últimos erros de servidor, do agente e dos jobs agendados.
 * Só o operador da plataforma (platform admin) vê; gestor do cliente volta para /settings.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorLogList } from "@/components/settings/ErrorLogList";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";

export default function ErrorsPage() {
  const router = useRouter();
  const { data: isPlatformAdmin, isLoading } = usePlatformAdmin();

  useEffect(() => {
    if (!isLoading && isPlatformAdmin !== true) router.replace("/settings");
  }, [isLoading, isPlatformAdmin, router]);

  if (isPlatformAdmin !== true) return null;

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
