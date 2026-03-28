/**
 * PlanGeneratorService
 * Story: 16.5 - Plano de Execucao & Estimativa de Custo
 *
 * AC: #1 - Gera plano de execucao com etapas em ordem
 */

import type { CostEstimate, ParsedBriefing, PlannedStep, StepType } from "@/types/agent";

// ==============================================
// STEP METADATA
// ==============================================

interface StepMetadata {
  stepType: StepType;
  title: string;
  descriptionFn: (briefing: ParsedBriefing) => string;
  costKey: string;
}

export const PIPELINE_STEPS: StepMetadata[] = [
  {
    stepType: "search_companies",
    title: "Buscar Empresas",
    descriptionFn: (b) =>
      b.technology
        ? `Buscar empresas que usam ${b.technology} via TheirStack`
        : "Buscar empresas via TheirStack",
    costKey: "search_companies",
  },
  {
    stepType: "search_leads",
    title: "Encontrar Contatos",
    descriptionFn: (b) => {
      if (b.skipSteps?.includes("search_companies")) {
        const filters = [
          b.jobTitles.length > 0 ? b.jobTitles.join(", ") : null,
          b.industry,
          b.location,
        ].filter(Boolean).join(" + ");
        return `Buscar leads diretamente por ${filters || "cargos"} (sem filtro de empresa)`;
      }
      return b.jobTitles.length > 0
        ? `Encontrar ${b.jobTitles.join(", ")} nas empresas via Apollo`
        : "Encontrar contatos nas empresas via Apollo";
    },
    costKey: "search_leads",
  },
  {
    stepType: "create_campaign",
    title: "Criar Campanha",
    descriptionFn: () => "Gerar emails personalizados com IA usando Knowledge Base",
    costKey: "create_campaign",
  },
  {
    stepType: "export",
    title: "Exportar para Instantly",
    descriptionFn: () => "Exportar campanha e leads para a plataforma Instantly",
    costKey: "export",
  },
  {
    stepType: "activate",
    title: "Ativar Campanha",
    descriptionFn: () => "Ativar envio automatico no Instantly",
    costKey: "activate",
  },
];

// ==============================================
// SERVICE
// ==============================================

export class PlanGeneratorService {
  /**
   * Generate execution plan with steps, costs, and skip flags.
   * AC: #1 - Presents steps in order with skip indicators
   */
  static generatePlan(
    briefing: ParsedBriefing,
    costEstimate: CostEstimate
  ): PlannedStep[] {
    const skipSet = new Set(briefing.skipSteps ?? []);

    return PIPELINE_STEPS.map((meta, index) => {
      const skipped = skipSet.has(meta.stepType);
      const stepCost = costEstimate.steps[meta.costKey];

      return {
        stepNumber: index + 1,
        stepType: meta.stepType,
        title: meta.title,
        description: meta.descriptionFn(briefing),
        skipped,
        estimatedCost: skipped ? 0 : (stepCost?.estimated ?? 0),
        costDescription: skipped ? "Pulado" : (stepCost?.description ?? ""),
      };
    });
  }
}
