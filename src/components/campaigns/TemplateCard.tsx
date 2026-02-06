/**
 * TemplateCard Component
 * Story 6.13: Smart Campaign Templates
 *
 * AC #1 - Each card shows: Template name, Brief description, Number of emails and total duration, Recommended use case
 * AC #2 - Display template information in card format
 */

"use client";

import { Mail, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CampaignTemplate } from "@/types/campaign-template";

// ==============================================
// TYPES
// ==============================================

export interface TemplateCardProps {
  /** Template data to display */
  template: CampaignTemplate;
  /** Whether this card is currently selected */
  isSelected: boolean;
  /** Callback when card is clicked */
  onSelect: (template: CampaignTemplate) => void;
}

// ==============================================
// COMPONENT
// ==============================================

/**
 * TemplateCard component
 * Displays a campaign template in card format with key information
 *
 * AC #1 - Shows name, description, email count, duration, use case
 * AC #2 - Available templates displayed in grid
 */
export function TemplateCard({
  template,
  isSelected,
  onSelect,
}: TemplateCardProps) {
  const handleClick = () => {
    onSelect(template);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(template);
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
        isSelected && "border-primary ring-2 ring-primary/20 bg-primary/5"
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Template: ${template.name}. ${template.emailCount} emails em ${template.totalDays} dias. ${template.useCase}`}
      data-testid={`template-card-${template.nameKey}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            {template.name}
            {isSelected && (
              <CheckCircle2
                className="h-4 w-4 text-primary"
                data-testid="template-selected-icon"
              />
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Description */}
        <p
          className="text-sm text-muted-foreground line-clamp-2"
          title={template.description}
        >
          {template.description}
        </p>

        {/* Stats: Email count and duration */}
        <div className="flex items-center gap-4 text-sm">
          <div
            className="flex items-center gap-1.5 text-muted-foreground"
            data-testid="template-email-count"
          >
            <Mail className="h-3.5 w-3.5" />
            <span>
              {template.emailCount} email{template.emailCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div
            className="flex items-center gap-1.5 text-muted-foreground"
            data-testid="template-duration"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>
              {template.totalDays} dia{template.totalDays !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Use case badge */}
        <Badge
          variant="secondary"
          className="text-xs font-normal"
          data-testid="template-use-case"
        >
          {template.useCase}
        </Badge>
      </CardContent>
    </Card>
  );
}
