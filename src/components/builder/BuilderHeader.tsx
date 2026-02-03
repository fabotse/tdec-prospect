/**
 * BuilderHeader Component
 * Story 5.2: Campaign Builder Canvas
 * Story 5.7: Campaign Lead Association
 * Story 5.8: Campaign Preview
 * Story 6.5: Campaign Product Context
 * Story 6.6: Personalized Icebreakers
 * Story 6.12: AI Campaign Structure Generation
 * Story 6.12.1: AI Full Campaign Generation
 * Story 6.13: Smart Campaign Templates
 *
 * AC: #4 - Header do Builder
 * AC 5.7 #5: Lead count display and add leads button
 * AC 5.8 #1: Preview button
 * AC 6.5 #1: Product dropdown in builder header
 * AC 6.6 #1: Lead preview selector in builder header
 * AC 6.12 #4: Campaign summary (email count, total duration)
 * AC 6.12.1 #5: AI-generated campaign indicator
 * AC 6.13 #4: Template name indicator
 *
 * Header showing campaign name (editable), status badge, lead count, product selector, lead preview selector, campaign summary, preview, and save button.
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Users, Eye, Loader2, Sparkles, Trash2, LayoutTemplate } from "lucide-react";
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
import { ProductSelector } from "@/components/builder/ProductSelector";
import { LeadPreviewSelector } from "@/components/builder/LeadPreviewSelector";
import { CampaignSummary } from "@/components/builder/CampaignSummary";

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
  /** Campaign ID for lead preview selector (Story 6.6 AC #1) */
  campaignId?: string;
  /** Callback when delete campaign button is clicked */
  onDelete?: () => void;
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
  campaignId,
  onDelete,
}: BuilderHeaderProps) {
  const hasChanges = useBuilderStore((state) => state.hasChanges);
  // Story 6.12.1 AC #5: AI-generated campaign indicator
  const isAIGenerated = useBuilderStore((state) => state.isAIGenerated);
  // Story 6.13 AC #4: Template name indicator
  const templateName = useBuilderStore((state) => state.templateName);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(campaignName);

  // CR-3 FIX: Sync editedName when campaignName prop changes (e.g., after save)
  useEffect(() => {
    if (!isEditing) {
      setEditedName(campaignName);
    }
  }, [campaignName, isEditing]);

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
      className="border-b border-border bg-background"
    >
      {/* Row 1: Navigation + Campaign Identity + Actions */}
      <div className="h-14 px-4 flex items-center justify-between">
        {/* Left: Back link + Campaign name + Status */}
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

          {/* AI-generated indicator - Story 6.12.1 AC #5 */}
          {isAIGenerated && (
            <Badge
              data-testid="ai-generated-badge"
              variant="secondary"
              className="gap-1"
            >
              <Sparkles className="h-3 w-3" />
              Criada com IA
            </Badge>
          )}

          {/* Template indicator - Story 6.13 AC #4 */}
          {templateName && (
            <Badge
              data-testid="template-badge"
              variant="outline"
              className="gap-1"
            >
              <LayoutTemplate className="h-3 w-3" />
              Template: {templateName}
            </Badge>
          )}
        </div>

        {/* Right: Delete + Preview + Save buttons */}
        <div className="flex items-center gap-2">
          {/* Delete button */}
          {onDelete && (
            <Button
              data-testid="delete-campaign-button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              aria-label="Remover campanha"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

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
            className="gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Row 2: Context Configuration (Leads, Product, Preview Lead) */}
      <div className="h-10 px-4 flex items-center gap-6 border-t border-border/50 bg-muted/30">
        {/* Lead count button - Story 5.7 AC #5 */}
        <Button
          data-testid="lead-count-button"
          variant="ghost"
          size="sm"
          onClick={onAddLeads}
          className="gap-1.5 h-7 px-2"
          aria-label={`${leadCount} lead${leadCount !== 1 ? "s" : ""} na campanha. Clique para adicionar ou ver leads.`}
        >
          <Users className="h-4 w-4" />
          {leadCount} lead{leadCount !== 1 ? "s" : ""}
        </Button>

        <div className="h-5 w-px bg-border" />

        {/* Product selector - Story 6.5 AC #1 */}
        <ProductSelector />

        {/* Lead preview selector - Story 6.6 AC #1 */}
        {campaignId && (
          <>
            <div className="h-5 w-px bg-border" />
            <LeadPreviewSelector campaignId={campaignId} />
          </>
        )}

        {/* Spacer to push summary to the right */}
        <div className="flex-1" />

        {/* Campaign Summary - Story 6.12 AC #4 */}
        <CampaignSummary />
      </div>
    </header>
  );
}
