/**
 * Technographic Prospecting Page
 * Story: 15.2 - Busca Technografica: Autocomplete e Filtros
 *
 * AC: #1 - Technology search with autocomplete
 * AC: #2 - Complementary filters
 * AC: #3 - Company results in table
 */

import { Suspense } from "react";
import { TechnographicPageContent } from "@/components/technographic/TechnographicPageContent";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Technographic - tdec-prospect",
  description: "Busque empresas por tecnologias utilizadas",
};

function TechnographicSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function TechnographicPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Technographic</h1>
          <p className="text-body-small text-muted-foreground mt-1">
            Busque empresas por tecnologias utilizadas usando o theirStack.
          </p>
        </div>
      </div>

      <Suspense fallback={<TechnographicSkeleton />}>
        <TechnographicPageContent />
      </Suspense>
    </div>
  );
}
