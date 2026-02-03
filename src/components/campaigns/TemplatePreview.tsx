/**
 * TemplatePreview Component
 * Story 6.13: Smart Campaign Templates
 *
 * AC #3 - Template Preview: Shows structure (emails + delays), strategic rationale for each touchpoint
 */

"use client";

import { Mail, Clock, ArrowLeft, ArrowRight, ChevronDown, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CampaignTemplate } from "@/types/campaign-template";
import type { Product } from "@/types/product";

// ==============================================
// TYPES
// ==============================================

export interface TemplatePreviewProps {
  /** Template to preview */
  template: CampaignTemplate;
  /** Selected product for campaign context (if any) */
  selectedProduct: Product | null;
  /** Callback when user confirms template selection */
  onApply: () => void;
  /** Callback when user wants to go back to template selection */
  onBack: () => void;
}

// ==============================================
// COMPONENT
// ==============================================

/**
 * TemplatePreview component
 * Shows detailed preview of a template's structure with email contexts and delays
 *
 * AC #3 - Shows structure preview, strategic rationale, "Usar Este Template" button
 */
export function TemplatePreview({
  template,
  selectedProduct,
  onApply,
  onBack,
}: TemplatePreviewProps) {
  const structure = template.structureJson;

  return (
    <div className="flex flex-col gap-4" data-testid="template-preview">
      {/* Back button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="w-fit -ml-2"
        data-testid="template-preview-back"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar aos templates
      </Button>

      {/* Template header */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium" data-testid="template-preview-name">
          {template.name}
        </h3>
        <p className="text-sm text-muted-foreground">
          {template.description}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span>{template.emailCount} emails</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{template.totalDays} dias</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {template.useCase}
          </Badge>
        </div>

        {/* Product context indicator (AC #3 - product selection summary) */}
        {selectedProduct && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2"
            data-testid="template-preview-product"
          >
            <Package className="h-3.5 w-3.5" />
            <span>Produto: <strong className="text-foreground">{selectedProduct.name}</strong></span>
          </div>
        )}
      </div>

      {/* Sequence visualization */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Estrutura da Sequência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {structure.emails.map((email, index) => {
            // Find delay after this email (if any)
            const delay = structure.delays.find(
              (d) => d.afterEmail === email.position
            );
            const isLast = index === structure.emails.length - 1;

            return (
              <div key={email.position} data-testid={`template-email-${email.position}`}>
                {/* Email row */}
                <div className="flex items-start gap-3 py-3">
                  {/* Position number */}
                  <div
                    className={`
                      flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium shrink-0
                      ${email.emailMode === "initial"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"}
                    `}
                  >
                    {email.position}
                  </div>

                  {/* Email details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        Email {email.position}
                      </span>
                      <Badge
                        variant={email.emailMode === "initial" ? "default" : "outline"}
                        className="text-xs"
                      >
                        {email.emailMode === "initial" ? "Inicial" : "Follow-up"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {email.context}
                    </p>
                  </div>
                </div>

                {/* Delay indicator (if exists and not last email) */}
                {delay && !isLast && (
                  <div
                    className="flex items-center gap-3 py-2 ml-3"
                    data-testid={`template-delay-${email.position}`}
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Aguardar {delay.days} dia{delay.days !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                )}

                {/* Divider (not after last) */}
                {!isLast && <div className="border-t border-dashed ml-9" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1"
          data-testid="template-preview-back-button"
        >
          Voltar
        </Button>
        <Button
          onClick={onApply}
          className="flex-1 gap-2"
          data-testid="template-preview-apply"
        >
          Usar Este Template
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
