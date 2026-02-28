import { Suspense } from "react";
import { InsightsPageContent } from "@/components/insights/InsightsPageContent";

export const metadata = {
  title: "Insights - tdec-prospect",
  description: "Insights de monitoramento de leads no LinkedIn",
};

export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Insights</h1>
          <p className="text-body-small text-muted-foreground mt-1">
            Oportunidades de abordagem baseadas em posts recentes dos seus leads.
          </p>
        </div>
      </div>

      {/* Insights Content */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        }
      >
        <InsightsPageContent />
      </Suspense>
    </div>
  );
}
