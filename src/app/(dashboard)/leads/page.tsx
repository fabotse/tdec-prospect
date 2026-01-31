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
import { Search } from "lucide-react";

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

      {/* Search & Filter Area - AC: #2 placeholders */}
      <div className="flex flex-col gap-4">
        {/* AISearchInput placeholder - Story 3.4 */}
        <div className="w-full max-w-2xl">
          <div className="h-12 bg-muted/50 border border-border rounded-lg flex items-center px-4 text-muted-foreground">
            <Search className="h-4 w-4 mr-2" />
            <span>Busca conversacional em breve...</span>
          </div>
        </div>
      </div>

      {/* Leads List Area */}
      <Suspense fallback={<LeadsPageSkeleton />}>
        <LeadsPageContent />
      </Suspense>
    </div>
  );
}
