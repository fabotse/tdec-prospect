/**
 * My Leads Empty State Component
 * Story 4.2.2: My Leads Page
 * Quick Dev: Manual Lead Creation
 *
 * AC: #6 - Friendly empty state when no imported leads
 */

"use client";

import Link from "next/link";
import { Database, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MyLeadsEmptyStateProps {
  onCreateLead?: () => void;
}

/**
 * Empty state shown when user has no imported leads
 * AC: #6 - Center-aligned with icon, title, subtitle, and CTA
 */
export function MyLeadsEmptyState({ onCreateLead }: MyLeadsEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
      data-testid="my-leads-empty-state"
    >
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <Database className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-h3 text-foreground mb-2">
        Nenhum lead importado ainda
      </h2>
      <p className="text-body text-muted-foreground max-w-md mb-6">
        Importe leads da busca Apollo para gerenciá-los aqui.
        Leads importados podem ter status, segmentos e mais.
      </p>
      <div className="flex items-center gap-3">
        <Button asChild>
          <Link href="/leads" className="gap-2">
            <Search className="h-4 w-4" />
            Buscar Leads
          </Link>
        </Button>
        {onCreateLead && (
          <Button
            variant="outline"
            onClick={onCreateLead}
            className="gap-2"
            data-testid="empty-state-create-lead-button"
          >
            <Plus className="h-4 w-4" />
            Criar Manualmente
          </Button>
        )}
      </div>
    </div>
  );
}
