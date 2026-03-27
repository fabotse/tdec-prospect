/**
 * BriefingSuggestionService
 * Story: 17.8 - Briefing Conversacional Inteligente
 *
 * AC: #2 - Sugestoes contextualizadas baseadas nos parametros ja extraidos
 *
 * Mapeamentos estaticos client-side para sugestoes instantaneas (< 100ms).
 * NAO usa chamada AI — sugestoes sao baseadas em mapeamentos estaveis do mercado B2B.
 */

import type { ParsedBriefing } from "@/types/agent";

// ==============================================
// NORMALIZATION: strip diacritics + lowercase
// ==============================================

export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ==============================================
// INDUSTRY ALIASES: common variations → canonical key
// ==============================================

const INDUSTRY_ALIASES: Record<string, string> = {
  "financial services": "fintech",
  financeiro: "fintech",
  financeira: "fintech",
  healthcare: "saude",
  "health care": "saude",
  hospitalar: "saude",
  retail: "varejo",
  ecommerce: "varejo",
  "e-commerce": "varejo",
  education: "educacao",
  ensino: "educacao",
  logistics: "logistica",
  transporte: "logistica",
  agronegocio: "agro",
  agribusiness: "agro",
  agriculture: "agro",
  energy: "energia",
  telecom: "telecomunicacoes",
  insurance: "seguros",
  tech: "tecnologia",
  software: "tecnologia",
  ti: "tecnologia",
};

function resolveIndustryKey(industry: string): string {
  const normalized = normalizeKey(industry);
  return INDUSTRY_ALIASES[normalized] ?? normalized;
}

// ==============================================
// MAPPINGS: Technology → Job Titles
// ==============================================

export const TECH_TO_TITLES: Record<string, string[]> = {
  netskope: ["CISO", "Head de Seguranca", "Diretor de TI", "VP Engineering"],
  salesforce: ["Head de Vendas", "CRO", "Diretor Comercial", "Head de CRM"],
  aws: ["CTO", "Head de Infraestrutura", "VP Engineering", "Cloud Architect"],
  azure: ["CTO", "Head de Infraestrutura", "VP Engineering", "Cloud Architect"],
  gcp: ["CTO", "Head de Infraestrutura", "VP Engineering", "Cloud Architect"],
  hubspot: ["Head de Marketing", "CMO", "Diretor de Growth", "Head de Vendas"],
  stripe: ["CTO", "Head de Pagamentos", "VP Engineering", "CFO"],
  datadog: ["CTO", "Head de Infraestrutura", "SRE Lead", "VP Engineering"],
  snowflake: ["Head de Dados", "CDO", "CTO", "Head de Analytics"],
  tableau: ["Head de Dados", "Head de Analytics", "CDO", "Head de BI"],
};

// ==============================================
// MAPPINGS: Industry → Job Titles
// ==============================================

export const INDUSTRY_TO_TITLES: Record<string, string[]> = {
  fintech: ["CTO", "CPO", "Head de Produto", "VP Engineering"],
  saude: ["CTO", "CIO", "Head de TI", "Diretor de Inovacao"],
  varejo: ["CTO", "Head de E-commerce", "Diretor de TI", "CDO"],
  educacao: ["CTO", "Head de Produto", "Diretor de Tecnologia", "VP Engineering"],
  logistica: ["CTO", "Head de Operacoes", "Diretor de TI", "Head de Inovacao"],
  agro: ["CTO", "Head de Inovacao", "Diretor de TI", "Head de Operacoes"],
  energia: ["CTO", "CIO", "Head de Inovacao", "Diretor de TI"],
  telecomunicacoes: ["CTO", "VP Engineering", "Head de Infraestrutura", "Diretor de TI"],
  seguros: ["CTO", "CIO", "Head de TI", "Diretor de Inovacao"],
  tecnologia: ["CTO", "VP Engineering", "Head de Produto", "CPO"],
};

// ==============================================
// MAPPINGS: Industry → Technology
// ==============================================

export const INDUSTRY_TO_TECH: Record<string, string[]> = {
  fintech: ["Stripe", "Plaid", "Brex", "Segment"],
  saude: ["Tasy", "MV", "Pixeon", "Salesforce Health Cloud"],
  varejo: ["VTEX", "Shopify", "Magento", "Salesforce Commerce"],
  educacao: ["Canvas", "Moodle", "Blackboard", "Google Workspace"],
  logistica: ["SAP", "Oracle", "TOTVS", "Salesforce"],
  agro: ["Climate FieldView", "Trimble", "John Deere Ops Center", "TOTVS Agro"],
  energia: ["Siemens", "ABB", "Schneider Electric", "GE Digital"],
  telecomunicacoes: ["Ericsson", "Nokia", "Huawei", "Cisco"],
  seguros: ["Guidewire", "Duck Creek", "Salesforce Financial Services", "SAP"],
  tecnologia: ["AWS", "Azure", "GCP", "Datadog"],
};

// ==============================================
// FALLBACK DEFAULTS
// ==============================================

export const DEFAULT_JOB_TITLES = [
  "CTO",
  "Head de TI",
  "VP Engineering",
  "Diretor de Tecnologia",
  "CISO",
];

// ==============================================
// SERVICE
// ==============================================

export class BriefingSuggestionService {
  static generateSuggestions(briefing: ParsedBriefing): Record<string, string[]> {
    const suggestions: Record<string, string[]> = {};

    const techKey = briefing.technology ? normalizeKey(briefing.technology) : null;
    const industryKey = briefing.industry ? resolveIndustryKey(briefing.industry) : null;

    // Sugerir jobTitles se ausente
    if (!briefing.jobTitles || briefing.jobTitles.length === 0) {
      const hasTech = techKey && TECH_TO_TITLES[techKey];
      const hasIndustry = industryKey && INDUSTRY_TO_TITLES[industryKey];

      if (hasTech && hasIndustry) {
        // Merge both, deduplicate, cap at 6
        const merged = [...TECH_TO_TITLES[techKey]];
        for (const title of INDUSTRY_TO_TITLES[industryKey]) {
          if (!merged.includes(title)) {
            merged.push(title);
          }
        }
        suggestions.jobTitles = merged.slice(0, 6);
      } else if (hasTech) {
        suggestions.jobTitles = TECH_TO_TITLES[techKey];
      } else if (hasIndustry) {
        suggestions.jobTitles = INDUSTRY_TO_TITLES[industryKey];
      } else {
        suggestions.jobTitles = DEFAULT_JOB_TITLES;
      }
    }

    // Sugerir technology se ausente
    if (!briefing.technology) {
      if (industryKey && INDUSTRY_TO_TECH[industryKey]) {
        suggestions.technology = INDUSTRY_TO_TECH[industryKey];
      }
    }

    return suggestions;
  }
}
