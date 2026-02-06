/**
 * Campaign Empty State Component
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Show empty state with CTA when no campaigns exist
 */

"use client";

import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onCreateClick: () => void;
}

/**
 * Empty state displayed when user has no campaigns
 * AC: #1 - Empty state with CTA
 */
export function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Mail className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        Nenhuma campanha encontrada
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Crie sua primeira campanha de outreach para comecar a se conectar com
        seus leads.
      </p>
      <Button onClick={onCreateClick} data-testid="empty-state-create-button">
        <Plus className="mr-2 h-4 w-4" />
        Criar sua primeira campanha
      </Button>
    </div>
  );
}
