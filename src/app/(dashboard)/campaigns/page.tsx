/**
 * Campaigns Page
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - View campaigns list with name, status, lead count, date
 * AC: #4 - Create new campaign via dialog
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CampaignList,
  CreateCampaignDialog,
  EmptyState,
} from "@/components/campaigns";
import { useCampaigns } from "@/hooks/use-campaigns";
import type { CampaignWithCount } from "@/types/campaign";

export default function CampaignsPage() {
  const router = useRouter();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { data: campaigns, isLoading, error } = useCampaigns();

  const handleCampaignClick = (campaign: CampaignWithCount) => {
    // Navigate to builder (Story 5.2)
    router.push(`/campaigns/${campaign.id}/edit`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Campanhas</h1>
          <p className="text-body text-muted-foreground mt-1">
            Crie e gerencie suas campanhas de outreach.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          data-testid="new-campaign-button"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-destructive">
            Erro ao carregar campanhas. Tente novamente.
          </p>
        </div>
      ) : campaigns && campaigns.length > 0 ? (
        <CampaignList
          campaigns={campaigns}
          onCampaignClick={handleCampaignClick}
        />
      ) : (
        <EmptyState onCreateClick={() => setIsCreateDialogOpen(true)} />
      )}

      {/* Create Dialog */}
      <CreateCampaignDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}
