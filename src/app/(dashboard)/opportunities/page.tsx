import { Suspense } from "react";
import { OpportunitiesPageContent } from "@/components/opportunities/OpportunitiesPageContent";

export const metadata = {
  title: "Oportunidades - tdec-prospect",
  description: "Central de oportunidades: respostas classificadas e leads de alto engajamento",
};

export default function OpportunitiesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Oportunidades</h1>
          <p className="text-body-small text-muted-foreground mt-1">
            Respostas classificadas e leads de alto engajamento de todas as campanhas, em um só lugar.
          </p>
        </div>
      </div>

      {/* Opportunities Content */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        }
      >
        <OpportunitiesPageContent />
      </Suspense>
    </div>
  );
}
