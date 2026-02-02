/**
 * Campaign List Component
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Display grid of campaign cards
 */

"use client";

import { CampaignCard } from "./CampaignCard";
import type { CampaignWithCount } from "@/types/campaign";

interface CampaignListProps {
  campaigns: CampaignWithCount[];
  onCampaignClick?: (campaign: CampaignWithCount) => void;
}

export function CampaignList({ campaigns, onCampaignClick }: CampaignListProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          onClick={() => onCampaignClick?.(campaign)}
        />
      ))}
    </div>
  );
}
