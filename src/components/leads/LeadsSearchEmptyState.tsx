/**
 * Leads Search Empty State
 * Story: 3.3 - Traditional Filter Search
 *
 * AC: #5 - Empty state when search returns no results
 * Suggests adjusting filters.
 */

"use client";

import { SearchX, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface LeadsSearchEmptyStateProps {
  onAdjustFilters?: () => void;
}

export function LeadsSearchEmptyState({
  onAdjustFilters,
}: LeadsSearchEmptyStateProps) {
  return (
    <Card data-testid="search-empty-state">
      <CardContent className="flex flex-col items-center justify-center py-16 px-6">
        {/* Icon with circular background */}
        <div className="rounded-full bg-muted p-4 mb-4">
          <SearchX className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold mb-2">Nenhum lead encontrado</h3>

        {/* Description - AC: #5 suggests adjusting filters */}
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          Tente ajustar os filtros para encontrar leads. Você pode expandir a
          busca usando termos mais gerais ou remover alguns filtros.
        </p>

        {/* CTA Button */}
        {onAdjustFilters && (
          <Button variant="outline" onClick={onAdjustFilters}>
            <Filter className="h-4 w-4 mr-2" />
            Ajustar Filtros
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
