/**
 * Lead Status Dropdown Component
 * Story 4.2: Lead Status Management
 * Story 4.2.1: Lead Import Mechanism
 *
 * AC: #2 - Change individual status
 * Story 4.2.1: AC #2 - Auto-import on status change for unsaved leads
 *
 * Dropdown menu for changing lead status with loading state.
 */

"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { LEAD_STATUSES, type LeadStatus, type Lead, isLeadImported } from "@/types/lead";
import { useUpdateLeadStatus } from "@/hooks/use-lead-status";
import { useImportLeads, type LeadDataForImport } from "@/hooks/use-import-leads";
import { Loader2, Check } from "lucide-react";

interface LeadStatusDropdownProps {
  /** Full lead object for auto-import detection */
  lead: Lead;
  currentStatus: LeadStatus | undefined | null;
}

/**
 * LeadStatusDropdown - Dropdown for changing a single lead's status
 * AC: #2 - Click badge to see status options, select to update immediately
 * Story 4.2.1: AC #2 - Auto-imports unsaved leads before changing status
 */
export function LeadStatusDropdown({ lead, currentStatus }: LeadStatusDropdownProps) {
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateLeadStatus();
  const { mutate: importLeads, isPending: isImporting } = useImportLeads();

  const isPending = isUpdating || isImporting;

  const handleStatusChange = (newStatus: LeadStatus) => {
    if (newStatus === currentStatus) return;

    const imported = isLeadImported(lead);

    if (!imported) {
      // Story 4.2.1: AC #2 - Auto-import lead before updating status
      const leadData: LeadDataForImport = {
        apolloId: lead.apolloId || lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        companyName: lead.companyName,
        companySize: lead.companySize,
        industry: lead.industry,
        location: lead.location,
        title: lead.title,
        linkedinUrl: lead.linkedinUrl,
        hasEmail: lead.hasEmail,
        hasDirectPhone: lead.hasDirectPhone,
      };

      // Auto-import lead, then update status
      // Note: useImportLeads hook shows toast on success, no need for additional toasts
      importLeads([leadData], {
        onSuccess: (result) => {
          // Find the imported lead's new ID
          const importedLead = result.data.leads?.find(
            (l) => l.apollo_id === (lead.apolloId || lead.id)
          );
          if (importedLead) {
            updateStatus({ leadId: importedLead.id, status: newStatus });
          }
        },
      });
    } else {
      updateStatus({ leadId: lead.id, status: newStatus });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isPending}>
        <div className="inline-flex items-center gap-1">
          <LeadStatusBadge status={currentStatus} interactive />
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {LEAD_STATUSES.map((statusConfig) => (
          <DropdownMenuItem
            key={statusConfig.value}
            onClick={() => handleStatusChange(statusConfig.value)}
            disabled={statusConfig.value === currentStatus}
            className="flex items-center justify-between"
          >
            <LeadStatusBadge status={statusConfig.value} />
            {statusConfig.value === currentStatus && (
              <Check className="h-4 w-4 ml-2 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
