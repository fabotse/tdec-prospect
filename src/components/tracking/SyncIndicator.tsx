/**
 * SyncIndicator Component
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #3 — Mostra quando foi a ultima sincronizacao + botao Sincronizar
 * AC: #4 — Loading indicator durante sync, toast de sucesso/erro
 */

"use client";

import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SyncIndicatorProps {
  lastSyncAt: string | null;
  onSync: () => void;
  isSyncing: boolean;
}

function formatRelativeTime(isoDate: string): string {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Agora mesmo";
  if (diffMin < 60) return `Ha ${diffMin} minuto${diffMin > 1 ? "s" : ""}`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Ha ${diffHours} hora${diffHours > 1 ? "s" : ""}`;
  const diffDays = Math.floor(diffHours / 24);
  return `Ha ${diffDays} dia${diffDays > 1 ? "s" : ""}`;
}

export function SyncIndicator({ lastSyncAt, onSync, isSyncing }: SyncIndicatorProps) {
  return (
    <div data-testid="sync-indicator" className="flex items-center gap-3">
      <span data-testid="sync-status" className="text-sm text-muted-foreground">
        {lastSyncAt
          ? `Sincronizado ${formatRelativeTime(lastSyncAt)}`
          : "Nunca sincronizado"}
      </span>
      <Button
        data-testid="sync-button"
        variant="outline"
        size="sm"
        onClick={onSync}
        disabled={isSyncing}
        className="gap-1.5"
      >
        {isSyncing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sincronizando...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Sincronizar
          </>
        )}
      </Button>
    </div>
  );
}

export { formatRelativeTime };
