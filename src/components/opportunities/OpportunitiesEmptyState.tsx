/**
 * Opportunities Empty State
 * Story 21.4: Central de Oportunidades — AC #6
 *
 * Espelha InsightsEmptyState (variante hasFilters).
 */

import { Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface OpportunitiesEmptyStateProps {
  hasFilters: boolean;
}

export function OpportunitiesEmptyState({ hasFilters }: OpportunitiesEmptyStateProps) {
  return (
    <Card data-testid="opportunities-empty-state">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          {hasFilters ? "Nenhuma oportunidade com esses filtros" : "Nenhuma oportunidade ainda"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {hasFilters
            ? "Tente ajustar os filtros para ver mais resultados."
            : "Quando um lead responder ou engajar com suas campanhas, ele aparece aqui."}
        </p>
      </CardContent>
    </Card>
  );
}
