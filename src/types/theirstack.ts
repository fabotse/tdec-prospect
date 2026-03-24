/**
 * theirStack API Types
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * Types validated with real API calls (2026-03-24 spike).
 * Endpoint: GET /v0/billing/credit-balance
 */

// ==============================================
// CREDIT BALANCE TYPES
// ==============================================

/**
 * Response from GET /v0/billing/credit-balance
 * Validated via spike — all fields are number.
 */
export interface TheirStackCreditsResponse {
  ui_credits: number;
  used_ui_credits: number;
  api_credits: number;
  used_api_credits: number;
}

/**
 * Parsed credits for internal use
 */
export interface TheirStackCredits {
  apiCredits: number;
  usedApiCredits: number;
  uiCredits: number;
  usedUiCredits: number;
}
