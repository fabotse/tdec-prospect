/**
 * BuilderHeader Component
 * Story 5.2: Campaign Builder Canvas
 * Story 5.7: Campaign Lead Association
 * Story 5.8: Campaign Preview
 *
 * AC: #4 - Header do Builder
 * AC 5.7 #5: Lead count display and add leads button
 * AC 5.8 #1: Preview button
 *
 * Header showing campaign name (editable), status badge, lead count, preview, and save button.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Users, Eye } from "lucide-react";
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
  /** Number of leads in campaign (Story 5.7 AC #5) */
  leadCount?: number;
  /** Callback when "Add Leads" button is clicked (Story 5.7 AC #5) */
  onAddLeads?: () => void;
  /** Callback when "Preview" button is clicked (Story 5.8 AC #1) */
  onPreview?: () => void;
  /** Whether the campaign has blocks (Story 5.8 AC #1) */
  hasBlocks?: boolean;
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
  leadCount = 0,
  onAddLeads,
  onPreview,
  hasBlocks = false,
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

        <div className="h-6 w-px bg-border" />

        {/* Lead count button - Story 5.7 AC #5 */}
        <Button
          data-testid="lead-count-button"
          variant="ghost"
          size="sm"
          onClick={onAddLeads}
          className="gap-1.5"
          aria-label={`${leadCount} lead${leadCount !== 1 ? "s" : ""} na campanha. Clique para adicionar ou ver leads.`}
        >
          <Users className="h-4 w-4" />
          {leadCount} lead{leadCount !== 1 ? "s" : ""}
        </Button>
      </div>

      {/* Right section: Preview + Save buttons */}
      <div className="flex items-center gap-2">
        {/* Preview button - Story 5.8 AC #1 */}
        <Button
          data-testid="preview-button"
          variant="outline"
          size="sm"
          onClick={onPreview}
          disabled={!hasBlocks}
          aria-label="Preview da campanha"
          className="gap-1.5"
        >
          <Eye className="h-4 w-4" />
          Preview
        </Button>

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
