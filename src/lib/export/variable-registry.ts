/**
 * Variable Registry
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 * AC: #1, #5 - Centralized registry of personalization variables and platform mappings
 */

import type {
  ExportPlatform,
  PersonalizationVariable,
  PlatformMapping,
  VariableMapping,
} from "@/types/export";

// ==============================================
// PLATFORM CONSTANTS (AC: #5)
// ==============================================

/**
 * All supported export platforms as array for iteration
 */
export const EXPORT_PLATFORMS: ExportPlatform[] = [
  "instantly",
  "snovio",
  "csv",
  "clipboard",
];

// ==============================================
// VARIABLE REGISTRY (AC: #1)
// ==============================================

/**
 * All supported personalization variables
 * AC: #1 - Registry includes: {{first_name}}, {{company_name}}, {{title}}, {{ice_breaker}}
 */
const PERSONALIZATION_VARIABLES: PersonalizationVariable[] = [
  {
    name: "first_name",
    label: "Nome",
    leadField: "firstName",
    template: "{{first_name}}",
    placeholderLabel: "Nome personalizado para cada lead",
  },
  {
    name: "company_name",
    label: "Empresa",
    leadField: "companyName",
    template: "{{company_name}}",
    placeholderLabel: "Empresa personalizada para cada lead",
  },
  {
    name: "title",
    label: "Cargo",
    leadField: "title",
    template: "{{title}}",
    placeholderLabel: "Cargo personalizado para cada lead",
  },
  {
    name: "ice_breaker",
    label: "Quebra-gelo",
    leadField: "icebreaker",
    template: "{{ice_breaker}}",
    placeholderLabel: "Ice Breaker personalizado será gerado para cada lead",
  },
];

// ==============================================
// PLATFORM MAPPINGS (AC: #5)
// ==============================================

/**
 * Platform-specific variable tag formats
 * AC: #5 - Mapping per platform:
 * - Instantly: {{first_name}} → {{first_name}} (custom variable)
 * - Snov.io: {{first_name}} → {{firstName}} (Snov.io field)
 * - CSV: {{first_name}} → coluna first_name
 * - Clipboard: same as internal format
 */
const PLATFORM_MAPPINGS: Record<ExportPlatform, Record<string, string>> = {
  instantly: {
    first_name: "{{first_name}}",
    company_name: "{{company_name}}",
    title: "{{title}}",
    ice_breaker: "{{ice_breaker}}",
  },
  snovio: {
    first_name: "{{firstName}}",
    company_name: "{{companyName}}",
    title: "{{title}}",
    ice_breaker: "{{iceBreaker}}",
  },
  csv: {
    first_name: "first_name",
    company_name: "company_name",
    title: "title",
    ice_breaker: "ice_breaker",
  },
  clipboard: {
    first_name: "{{first_name}}",
    company_name: "{{company_name}}",
    title: "{{title}}",
    ice_breaker: "{{ice_breaker}}",
  },
};

// ==============================================
// PUBLIC API
// ==============================================

/**
 * Get all registered personalization variables
 * AC: #1 - Returns complete variable list
 */
export function getVariables(): PersonalizationVariable[] {
  return [...PERSONALIZATION_VARIABLES];
}

/**
 * Get a specific variable by name
 * AC: #1 - Lookup by variable name
 * @returns Variable definition or undefined if not found
 */
export function getVariable(
  name: string
): PersonalizationVariable | undefined {
  return PERSONALIZATION_VARIABLES.find((v) => v.name === name);
}

/**
 * Get all variable mappings for a specific platform
 * AC: #5 - Returns PlatformMapping with all variable mappings
 */
export function getPlatformMapping(platform: ExportPlatform): PlatformMapping {
  const platformMap = PLATFORM_MAPPINGS[platform];
  const mappings: VariableMapping[] = PERSONALIZATION_VARIABLES.map((v) => ({
    variableName: v.name,
    platformTag: platformMap[v.name],
  }));

  return {
    platform,
    mappings,
  };
}

/**
 * Map a single variable to its platform-specific format
 * AC: #5 - Per-variable platform mapping
 * @returns Platform-specific tag or undefined if variable not found
 */
export function mapVariableForPlatform(
  variableName: string,
  platform: ExportPlatform
): string | undefined {
  const platformMap = PLATFORM_MAPPINGS[platform];
  return platformMap[variableName];
}
