/**
 * Leads Page Content
 * Story: 3.1 - Leads Page & Data Model
 *
 * AC: #5 - Empty state when no leads exist
 * AC: #6 - Placeholder ready for LeadTable implementation
 */

"use client";

import { useLeads } from "@/hooks/use-leads";
import { LeadsEmptyState } from "@/components/leads/LeadsEmptyState";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";
import { Card, CardContent } from "@/components/ui/card";

export function LeadsPageContent() {
  const { data: leads, isLoading, error } = useLeads();

  if (isLoading) {
    return <LeadsPageSkeleton />;
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Erro ao carregar leads: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!leads || leads.length === 0) {
    return <LeadsEmptyState />;
  }

  // Future: LeadTable component (Story 3.5)
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground">
          {leads.length} leads encontrados. Tabela de leads em implementação
          (Story 3.5).
        </p>
      </CardContent>
    </Card>
  );
}
