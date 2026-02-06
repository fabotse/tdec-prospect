/**
 * Campaign List Component
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Display grid of campaign cards
 *
 * Delete Campaign:
 * - Pass onDelete to each card for delete functionality
 */

"use client";

import { CampaignCard } from "./CampaignCard";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";
import type { CampaignWithCount } from "@/types/campaign";

interface CampaignListProps {
  campaigns: CampaignWithCount[];
  onCampaignClick?: (campaign: CampaignWithCount) => void;
  onDelete?: (campaign: CampaignWithCount) => void;
}

export function CampaignList({ campaigns, onCampaignClick, onDelete }: CampaignListProps) {
  return (
    <AnimatedList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((campaign) => (
        <AnimatedListItem key={campaign.id}>
          <CampaignCard
            campaign={campaign}
            onClick={() => onCampaignClick?.(campaign)}
            onDelete={onDelete}
          />
        </AnimatedListItem>
      ))}
    </AnimatedList>
  );
}
