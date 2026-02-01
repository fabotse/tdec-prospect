/**
 * My Leads Page
 * Story 4.2.2: My Leads Page
 *
 * Dedicated page for viewing and managing imported leads.
 *
 * AC: #1 - Page route and navigation at /leads/my-leads
 * AC: #2 - Table structure with imported leads
 */

import { Suspense } from "react";
import { MyLeadsPageContent } from "@/components/leads/MyLeadsPageContent";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";

export const metadata = {
  title: "Meus Leads - tdec-prospect",
  description: "Visualize e gerencie seus leads importados",
};

export default function MyLeadsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Meus Leads</h1>
          <p className="text-body-small text-muted-foreground mt-1">
            Leads importados para gerenciamento.
          </p>
        </div>
      </div>

      {/* Leads Content */}
      <Suspense fallback={<LeadsPageSkeleton />}>
        <MyLeadsPageContent />
      </Suspense>
    </div>
  );
}
