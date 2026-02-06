/**
 * Extracted Filters Display Component
 * Story: 3.4 - AI Conversational Search
 *
 * AC: #3 - Show filter badges: "Tecnologia", "São Paulo", "51-200 func"
 * AC: #5 - "Editar filtros" button to open FilterPanel
 */

"use client";

import { Edit2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApolloSearchFilters } from "@/types/apollo";

// ==============================================
// TYPES
// ==============================================

interface ExtractedFiltersDisplayProps {
  filters: ApolloSearchFilters;
  confidence?: number;
  onEdit?: () => void;
}

// ==============================================
// INDUSTRY LABELS (Portuguese)
// ==============================================

const INDUSTRY_LABELS: Record<string, string> = {
  technology: "Tecnologia",
  finance: "Finanças",
  healthcare: "Saúde",
  education: "Educação",
  retail: "Varejo",
  manufacturing: "Indústria",
  services: "Serviços",
  consulting: "Consultoria",
};

// ==============================================
// COMPONENT
// ==============================================

export function ExtractedFiltersDisplay({
  filters,
  confidence,
  onEdit,
}: ExtractedFiltersDisplayProps) {
  const hasFilters = Boolean(
    filters.industries?.length ||
      filters.companySizes?.length ||
      filters.locations?.length ||
      filters.titles?.length ||
      filters.keywords
  );

  if (!hasFilters) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-md"
      data-testid="extracted-filters-display"
    >
      <span className="text-sm text-muted-foreground mr-1">
        Filtros extraídos:
      </span>

      {/* Industries */}
      {filters.industries?.map((ind) => (
        <Badge key={ind} variant="secondary">
          {INDUSTRY_LABELS[ind] || ind}
        </Badge>
      ))}

      {/* Locations */}
      {filters.locations?.map((loc) => (
        <Badge key={loc} variant="secondary">
          {loc}
        </Badge>
      ))}

      {/* Company Sizes */}
      {filters.companySizes?.map((size) => (
        <Badge key={size} variant="secondary">
          {size} func
        </Badge>
      ))}

      {/* Titles */}
      {filters.titles?.map((title) => (
        <Badge key={title} variant="secondary">
          {title}
        </Badge>
      ))}

      {/* Keywords */}
      {filters.keywords && (
        <Badge variant="secondary">&quot;{filters.keywords}&quot;</Badge>
      )}

      {/* Confidence indicator (if low) */}
      {confidence !== undefined && confidence < 0.7 && (
        <Badge variant="outline" className="text-yellow-600">
          Baixa confiança
        </Badge>
      )}

      {/* Edit button */}
      {onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="ml-auto h-7 px-2"
          data-testid="edit-filters-button"
        >
          <Edit2 className="mr-1 h-3 w-3" />
          Editar filtros
        </Button>
      )}
    </div>
  );
}
