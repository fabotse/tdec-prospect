/**
 * StrategySummary Component
 * Story 6.12.1: AI Full Campaign Generation
 *
 * AC #1 - Structure Rationale Display
 * Shows the AI's strategy explanation and offers full or structure-only generation
 */

"use client";

import { Mail, Clock, Sparkles, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { CampaignObjective } from "./AICampaignWizard";

// ==============================================
// TYPES
// ==============================================

export interface StrategySummaryProps {
  /** AI-generated explanation of why this structure was chosen */
  rationale: string;
  /** Number of emails in the campaign */
  totalEmails: number;
  /** Total campaign duration in days */
  totalDays: number;
  /** Campaign objective selected by user */
  objective: CampaignObjective;
  /** Callback when user wants full AI generation */
  onGenerateFull: () => void;
  /** Callback when user wants structure only (no content) */
  onStructureOnly: () => void;
  /** Callback when user wants to go back to form */
  onBack: () => void;
  /** Whether full generation is disabled (e.g., single email campaign) */
  fullGenerationDisabled?: boolean;
  /** Loading state for full generation button */
  isGeneratingFull?: boolean;
  /** Loading state for structure-only button */
  isCreatingStructure?: boolean;
}

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Objective labels in Portuguese
 */
const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  cold_outreach: "Cold Outreach",
  reengagement: "Reengajamento",
  follow_up: "Follow-up",
  nurture: "Nutricao",
};

// ==============================================
// COMPONENT
// ==============================================

/**
 * StrategySummary component
 * Displays the AI's strategy rationale and offers generation options
 * AC #1 - Shows: rationale, email count, duration, strategic approach
 */
export function StrategySummary({
  rationale,
  totalEmails,
  totalDays,
  objective,
  onGenerateFull,
  onStructureOnly,
  onBack,
  fullGenerationDisabled = false,
  isGeneratingFull = false,
  isCreatingStructure = false,
}: StrategySummaryProps) {
  const isLoading = isGeneratingFull || isCreatingStructure;

  return (
    <div className="flex flex-col gap-4 py-4" data-testid="strategy-summary">
      {/* Back button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        disabled={isLoading}
        className="w-fit -ml-2"
        data-testid="strategy-back-button"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar ao formulario
      </Button>

      {/* Strategy Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Resumo da Estrategia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats row */}
          <div className="flex items-center gap-4 text-sm">
            <div
              className="flex items-center gap-1.5 text-muted-foreground"
              data-testid="strategy-email-count"
            >
              <Mail className="h-4 w-4" />
              <span>
                {totalEmails} email{totalEmails !== 1 ? "s" : ""}
              </span>
            </div>
            <span className="text-border">•</span>
            <div
              className="flex items-center gap-1.5 text-muted-foreground"
              data-testid="strategy-duration"
            >
              <Clock className="h-4 w-4" />
              <span>
                {totalDays} dia{totalDays !== 1 ? "s" : ""} de duracao
              </span>
            </div>
            <span className="text-border">•</span>
            <span
              className="text-muted-foreground"
              data-testid="strategy-objective"
            >
              {OBJECTIVE_LABELS[objective]}
            </span>
          </div>

          {/* AI Rationale */}
          <div
            className="rounded-md bg-background p-4 text-sm leading-relaxed"
            data-testid="strategy-rationale"
          >
            {rationale}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 pt-2">
          {/* Full generation button - Primary action */}
          <Button
            className="w-full gap-2"
            onClick={onGenerateFull}
            disabled={fullGenerationDisabled || isLoading}
            data-testid="generate-full-button"
          >
            {isGeneratingFull ? (
              <>
                <Sparkles className="h-4 w-4 animate-spin" />
                Gerando campanha completa...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar Campanha Completa
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>

          {/* Structure only button - Secondary action */}
          <Button
            variant="outline"
            className="w-full"
            onClick={onStructureOnly}
            disabled={isLoading}
            data-testid="structure-only-button"
          >
            {isCreatingStructure ? (
              "Criando estrutura..."
            ) : (
              "Criar Apenas Estrutura"
            )}
          </Button>

          {/* Hint text */}
          <p className="text-xs text-muted-foreground text-center mt-1">
            {fullGenerationDisabled
              ? "Campanha com apenas 1 email - estrutura criada diretamente"
              : "Geracao completa cria todo o conteudo automaticamente (~30s)"}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
