import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface InsightsEmptyStateProps {
  hasFilters: boolean;
}

export function InsightsEmptyState({ hasFilters }: InsightsEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Lightbulb className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          {hasFilters ? "Nenhum insight encontrado" : "Nenhum insight ainda"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {hasFilters
            ? "Tente ajustar os filtros para ver mais resultados."
            : "Quando leads monitorados publicarem posts relevantes no LinkedIn, os insights aparecerão aqui com sugestões de abordagem."}
        </p>
      </CardContent>
    </Card>
  );
}
