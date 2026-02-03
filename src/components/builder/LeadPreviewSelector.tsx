/**
 * LeadPreviewSelector Component
 * Story 6.6: Personalized Icebreakers
 *
 * AC: #1 - Lead Preview Selector in Builder
 * AC: #6 - No Leads Associated State
 *
 * Dropdown to select a lead for AI generation preview.
 */

"use client";

import { useEffect } from "react";
import { useCampaignLeads } from "@/hooks/use-campaign-leads";
import { useBuilderStore, type PreviewLead } from "@/stores/use-builder-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, Users } from "lucide-react";

interface LeadPreviewSelectorProps {
  campaignId: string;
}

export function LeadPreviewSelector({ campaignId }: LeadPreviewSelectorProps) {
  const { previewLeadId, setPreviewLead } = useBuilderStore();
  const { leads, isLoading } = useCampaignLeads(campaignId);

  // AC #1: Auto-select first lead on initial load
  useEffect(() => {
    if (leads?.length && !previewLeadId) {
      const firstLead = leads[0].lead;
      setPreviewLead({
        id: firstLead.id,
        firstName: firstLead.firstName,
        lastName: firstLead.lastName,
        companyName: firstLead.companyName,
        title: firstLead.title,
        email: firstLead.email,
      });
    }
  }, [leads, previewLeadId, setPreviewLead]);

  // CR-M2 FIX: Validate previewLead still exists when leads change
  useEffect(() => {
    if (!leads?.length || !previewLeadId) return;

    const leadStillExists = leads.some((l) => l.lead.id === previewLeadId);
    if (!leadStillExists) {
      // Selected lead was removed, select first available
      const firstLead = leads[0].lead;
      setPreviewLead({
        id: firstLead.id,
        firstName: firstLead.firstName,
        lastName: firstLead.lastName,
        companyName: firstLead.companyName,
        title: firstLead.title,
        email: firstLead.email,
      });
    }
  }, [leads, previewLeadId, setPreviewLead]);

  const handleChange = (leadId: string) => {
    const selected = leads?.find((l) => l.lead.id === leadId);
    if (selected) {
      const previewLead: PreviewLead = {
        id: selected.lead.id,
        firstName: selected.lead.firstName,
        lastName: selected.lead.lastName,
        companyName: selected.lead.companyName,
        title: selected.lead.title,
        email: selected.lead.email,
      };
      setPreviewLead(previewLead);
    }
  };

  // AC #6: Handle empty state (no leads associated)
  if (!leads?.length && !isLoading) {
    return (
      <div
        className="flex items-center gap-2 text-xs text-muted-foreground"
        data-testid="no-leads-message"
      >
        <Users className="h-4 w-4" />
        <span>Nenhum lead associado</span>
      </div>
    );
  }

  // AC #1: Format dropdown options as "[Lead Name] - [Company]"
  const formatLeadLabel = (lead: {
    firstName: string;
    lastName: string | null;
    companyName: string | null;
  }) => {
    const fullName = lead.lastName
      ? `${lead.firstName} ${lead.lastName}`
      : lead.firstName;
    return lead.companyName ? `${fullName} - ${lead.companyName}` : fullName;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Preview:</span>
      <Select
        value={previewLeadId ?? undefined}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger
          className="w-[200px] h-8 border-0 !bg-transparent hover:!bg-transparent focus:ring-0 focus:ring-offset-0 shadow-none"
          aria-label="Selecionar lead para preview"
          data-testid="lead-preview-selector"
        >
          <SelectValue placeholder="Selecione um lead" />
        </SelectTrigger>
        <SelectContent>
          {leads?.map((item) => (
            <SelectItem key={item.lead.id} value={item.lead.id}>
              {formatLeadLabel(item.lead)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle
            className="h-4 w-4 text-muted-foreground cursor-help"
            aria-label="Ajuda sobre preview do lead"
          />
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">
          <p>
            Selecione um lead para visualizar como o email sera personalizado. A
            IA usara os dados reais do lead selecionado.
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
