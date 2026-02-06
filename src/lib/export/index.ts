/**
 * Export Module
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 *
 * Centralized exports for personalization variables, platform mappings, and resolution engine.
 */

export {
  EXPORT_PLATFORMS,
  getVariables,
  getVariable,
  getPlatformMapping,
  mapVariableForPlatform,
} from "./variable-registry";

export { resolveEmailVariables } from "./resolve-variables";
