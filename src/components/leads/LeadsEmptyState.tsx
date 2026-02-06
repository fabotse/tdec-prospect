/**
 * Leads Empty State
 * Story: 3.1 - Leads Page & Data Model
 *
 * AC: #5 - Empty state with helpful message and CTA
 * Follows UX spec: icon + message + CTA pattern
 */

"use client";

import { Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function LeadsEmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 px-6">
        {/* Icon with circular background */}
        <div className="rounded-full bg-muted p-4 mb-4">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Title */}
        <h3 className="text-lg font-medium mb-2">Nenhum lead encontrado</h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          Comece buscando leads usando a busca conversacional ou filtros
          tradicionais. Os leads encontrados aparecerão aqui.
        </p>

        {/* CTA Button - AC: #5 "Buscar Leads"
            TODO: onClick handler will be added in Story 3.4 (AI Search) */}
        <Button>
          <Search className="h-4 w-4 mr-2" />
          Buscar Leads
        </Button>
      </CardContent>
    </Card>
  );
}
