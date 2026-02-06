/**
 * Leads Page
 * Story: 3.1 - Leads Page & Data Model
 *
 * AC: #1 - Page with search area at top and leads list below
 * AC: #2 - Search/filter area with placeholders for future features
 */

import { Suspense } from "react";
import { LeadsPageContent } from "@/components/leads/LeadsPageContent";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";

export const metadata = {
  title: "Leads - tdec-prospect",
  description: "Gerencie seus leads de prospecção",
};

export default function LeadsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Leads</h1>
          <p className="text-body-small text-muted-foreground mt-1">
            Busque e gerencie leads para suas campanhas de prospecção.
          </p>
        </div>
      </div>

      {/* Leads List Area */}
      <Suspense fallback={<LeadsPageSkeleton />}>
        <LeadsPageContent />
      </Suspense>
    </div>
  );
}
