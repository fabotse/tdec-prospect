/**
 * BuilderHeader Component
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #4 - Header do Builder
 *
 * Header showing campaign name (editable), status badge, and save button.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useBuilderStore } from "@/stores/use-builder-store";
import {
  campaignStatusLabels,
  campaignStatusVariants,
  type CampaignStatus,
} from "@/types/campaign";

interface BuilderHeaderProps {
  campaignName: string;
  campaignStatus: CampaignStatus;
  onNameChange?: (name: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

/**
 * Badge variant mapping for campaign status
 */
function getStatusBadgeVariant(
  status: CampaignStatus
): "default" | "secondary" | "destructive" | "outline" {
  const variant = campaignStatusVariants[status];
  switch (variant) {
    case "success":
      return "default";
    case "warning":
      return "secondary";
    case "secondary":
      return "outline";
    default:
      return "secondary";
  }
}

/**
 * Header component for the campaign builder
 */
export function BuilderHeader({
  campaignName,
  campaignStatus,
  onNameChange,
  onSave,
  isSaving = false,
}: BuilderHeaderProps) {
  const hasChanges = useBuilderStore((state) => state.hasChanges);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(campaignName);

  const handleNameSubmit = () => {
    const trimmedName = editedName.trim();
    // Validate: non-empty and max 200 chars (matches createCampaignSchema)
    if (trimmedName && trimmedName.length <= 200 && trimmedName !== campaignName) {
      onNameChange?.(trimmedName);
    } else {
      setEditedName(campaignName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameSubmit();
    } else if (e.key === "Escape") {
      setEditedName(campaignName);
      setIsEditing(false);
    }
  };

  return (
    <header
      data-testid="builder-header"
      className="h-16 border-b border-border bg-background px-4 flex items-center justify-between"
    >
      {/* Left section: Back link + Campaign name */}
      <div className="flex items-center gap-4">
        <Link
          href="/campaigns"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="back-to-campaigns"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Campanhas</span>
        </Link>

        <div className="h-6 w-px bg-border" />

        {/* Editable campaign name */}
        {isEditing ? (
          <Input
            data-testid="campaign-name-input"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            className="h-8 w-64 font-semibold"
            autoFocus
          />
        ) : (
          <button
            data-testid="campaign-name"
            onClick={() => setIsEditing(true)}
            className={cn(
              "text-lg font-semibold hover:text-primary transition-colors",
              "focus-visible:outline-none focus-visible:underline"
            )}
          >
            {campaignName}
          </button>
        )}

        {/* Status badge */}
        <Badge
          data-testid="campaign-status-badge"
          variant={getStatusBadgeVariant(campaignStatus)}
        >
          {campaignStatusLabels[campaignStatus]}
        </Badge>
      </div>

      {/* Right section: Save button */}
      <div className="flex items-center gap-2">
        <Button
          data-testid="save-button"
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          size="sm"
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </header>
  );
}
