/**
 * PlanGeneratorService
 * Story: 16.5 - Plano de Execucao & Estimativa de Custo
 *
 * AC: #1 - Gera plano de execucao com etapas em ordem
 */

import type { CostEstimate, ParsedBriefing, PlannedStep, StepType } from "@/types/agent";
import {
  QUALITY_MIN_COMPANY_SIZE_LABEL,
  formatCompanySizesLabel,
  resolveDirectSearchCompanySizes,
  resolveSearchLocations,
} from "@/lib/agent/search-defaults";
import { resolveLeadCount } from "@/lib/agent/agent-pricing";
import { isAccountListMode, resolvedAccountDomains } from "@/lib/agent/target-accounts";
import { activeReferenceProfile, isLookalikeMode } from "@/lib/agent/reference-accounts";

/**
 * Story 24.18: perfil EFETIVO do modo contas parecidas (o que a Apollo recebe): setores,
 * porte e regiao do perfil, ou os valores editados pelo usuario.
 */
function lookalikeProfileLabel(b: ParsedBriefing): string {
  const profile = activeReferenceProfile(b);
  const industries = b.industry ? [b.industry] : (profile?.industries ?? []);
  const { companySizes } = resolveDirectSearchCompanySizes(b);
  const { locations } = resolveSearchLocations(b);
  return [
    industries.length > 0 ? `setor ${industries.join(", ")}` : null,
    companySizes.length > 0 ? `porte ${formatCompanySizesLabel(companySizes)}` : null,
    locations.length > 0 ? `regiao ${locations.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// Story 24.13: sufixo " — até N leads" nos ramos ativos da busca, so quando N existe.
function leadCountSuffix(b: ParsedBriefing): string {
  const n = resolveLeadCount(b);
  return n === null ? "" : ` — até ${n} leads`;
}

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
    descriptionFn: (b) => {
      if (b.skipSteps?.includes("search_companies")) {
        return "Etapa pulada — busca de empresas nao necessaria";
      }
      return b.technology
        ? `Buscar empresas que usam ${b.technology} via TheirStack`
        : "Buscar empresas via TheirStack";
    },
    costKey: "search_companies",
  },
  {
    stepType: "search_leads",
    title: "Encontrar Contatos",
    descriptionFn: (b) => {
      if (b.skipSteps?.includes("search_leads")) {
        return "Etapa pulada — leads fornecidos pelo usuario";
      }
      // Story 24.17: modo lista de contas — busca por dominio nas contas, sem porte/ICP.
      if (isAccountListMode(b)) {
        const count = resolvedAccountDomains(b.targetAccounts).length;
        const titles = b.jobTitles.length > 0 ? b.jobTitles.join(", ") : "cargos";
        const where = count === 1 ? "na 1 conta" : `nas ${count} contas`;
        return `Buscar ${titles} ${where} da sua lista (busca por dominio, sem busca de empresas)${leadCountSuffix(b)}`;
      }
      // Story 24.18: modo contas parecidas — busca direta com o perfil dos clientes.
      if (isLookalikeMode(b)) {
        const titles = b.jobTitles.length > 0 ? b.jobTitles.join(", ") : "cargos";
        const label = lookalikeProfileLabel(b);
        return `Buscar ${titles} em empresas parecidas com seus clientes${label ? ` (${label})` : ""}${leadCountSuffix(b)}`;
      }
      if (b.skipSteps?.includes("search_companies")) {
        // Story 22.6 (AC3): exibe o tamanho EFETIVO da busca direta antes da confirmacao —
        // incluindo o piso de qualidade aplicado por padrao (sem surpresa de escopo).
        // Mesma fonte (resolveDirectSearchCompanySizes) que o step usa -> zero drift.
        // Story 24.14: sem tamanho do usuario, as faixas do ICP substituem o piso.
        const { source, companySizes } = resolveDirectSearchCompanySizes(b);
        const sizeLabel =
          source === "quality"
            ? `tamanho ${QUALITY_MIN_COMPANY_SIZE_LABEL} (padrao de qualidade)`
            : source === "icp"
              ? `tamanho ${formatCompanySizesLabel(companySizes)} (do ICP)`
              : `tamanho ${b.companySize}`;
        // Story 24.14: local efetivo (usuario, senao ICP) — o mesmo que o step envia.
        const { locations } = resolveSearchLocations(b);
        const filters = [
          b.jobTitles.length > 0 ? b.jobTitles.join(", ") : null,
          b.industry,
          locations.length > 0 ? locations.join(", ") : null,
          sizeLabel,
        ].filter(Boolean).join(" + ");
        return `Buscar leads diretamente por ${filters || "cargos"} (sem filtro de empresa)${leadCountSuffix(b)}`;
      }
      return (
        (b.jobTitles.length > 0
          ? `Encontrar ${b.jobTitles.join(", ")} nas empresas via Apollo`
          : "Encontrar contatos nas empresas via Apollo") + leadCountSuffix(b)
      );
    },
    costKey: "search_leads",
  },
  {
    stepType: "create_campaign",
    title: "Criar Campanha",
    descriptionFn: (b) => {
      // Story 22.2: sinaliza icebreaker premium (LinkedIn) na descricao quando o toggle esta ligado
      const premiumSuffix = b.premiumIcebreakers === true
        ? " com icebreakers premium (LinkedIn)"
        : "";
      if (b.skipSteps?.includes("search_leads") && b.importedLeads?.length) {
        return `Criar campanha com emails personalizados para ${b.importedLeads.length} leads importados${premiumSuffix}`;
      }
      return `Gerar emails personalizados com IA usando Knowledge Base${premiumSuffix}`;
    },
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
