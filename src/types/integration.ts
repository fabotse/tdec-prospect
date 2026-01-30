/**
 * Integration Configuration Types
 * Story: 2.2 - API Keys Storage & Encryption
 *
 * Types for API key management and third-party integrations.
 */

// ==============================================
// SERVICE NAME CONSTANTS & TYPES
// ==============================================

/**
 * Supported integration services
 */
export const SERVICE_NAMES = [
  "apollo",
  "signalhire",
  "snovio",
  "instantly",
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

/**
 * Human-readable service labels (Portuguese)
 */
export const SERVICE_LABELS: Record<ServiceName, string> = {
  apollo: "Apollo.io",
  signalhire: "SignalHire",
  snovio: "Snov.io",
  instantly: "Instantly",
};

// ==============================================
// DATABASE TYPES
// ==============================================

/**
 * API Config as stored in database
 * Matches api_configs table schema
 *
 * AC: #5 - Table structure
 * AC: #4 - key_suffix stores last 4 chars for verification
 */
export interface ApiConfig {
  id: string;
  tenant_id: string;
  service_name: ServiceName;
  encrypted_key: string;
  key_suffix: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * API Config for insert operations
 */
export type ApiConfigInsert = Omit<
  ApiConfig,
  "id" | "created_at" | "updated_at"
>;

/**
 * API Config for update operations
 */
export type ApiConfigUpdate = Partial<Pick<ApiConfig, "encrypted_key">>;

// ==============================================
// API RESPONSE TYPES
// ==============================================

/**
 * API Config response for frontend (masked, safe to expose)
 *
 * AC: #3 - Key never returned in plain text
 * AC: #4 - Only last 4 chars shown
 */
export interface ApiConfigResponse {
  serviceName: ServiceName;
  isConfigured: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
}

/**
 * Response from GET /api/settings/integrations
 */
export interface GetIntegrationsResponse {
  data: {
    configs: ApiConfigResponse[];
  };
}

/**
 * Response from POST /api/settings/integrations
 */
export interface SaveIntegrationResponse {
  data: {
    serviceName: string;
    maskedKey: string;
    updatedAt: string;
  };
}

/**
 * Response from DELETE /api/settings/integrations
 */
export interface DeleteIntegrationResponse {
  data: {
    deleted: boolean;
  };
}

// ==============================================
// API REQUEST TYPES
// ==============================================

/**
 * Request body for POST /api/settings/integrations
 *
 * AC: #1 - Plain key sent to API (encrypted server-side)
 */
export interface SaveApiConfigRequest {
  serviceName: ServiceName;
  apiKey: string;
}

// ==============================================
// ERROR TYPES
// ==============================================

/**
 * API error response format
 */
export interface IntegrationApiError {
  error: {
    code: IntegrationErrorCode;
    message: string;
  };
}

export type IntegrationErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

// ==============================================
// CONNECTION TEST TYPES (Story 2.3)
// ==============================================

/**
 * Result of a connection test
 * Story: 2.3 - Integration Connection Testing
 */
export interface TestConnectionResult {
  success: boolean;
  message: string;
  testedAt: string;
  latencyMs?: number;
}

/**
 * Connection status for UI display
 * Story: 2.3 - Integration Connection Testing
 */
export type ConnectionStatus =
  | "untested"   // Never tested
  | "testing"    // Test in progress
  | "connected"  // Test successful
  | "error";     // Test failed

// ==============================================
// HOOK TYPES
// ==============================================

/**
 * Integration config status for UI display
 */
export type IntegrationStatus =
  | "not_configured"
  | "configured"
  | "loading"
  | "saving"
  | "error";

/**
 * Integration config state in the hook
 * Updated in Story 2.3 to include connection test state
 */
export interface IntegrationConfigState {
  serviceName: ServiceName;
  status: IntegrationStatus;
  maskedKey: string | null;
  updatedAt: string | null;
  error: string | null;
  // Story 2.3 additions
  connectionStatus: ConnectionStatus;
  lastTestResult: TestConnectionResult | null;
}

// ==============================================
// TYPE GUARDS
// ==============================================

/**
 * Check if a string is a valid service name
 */
export function isValidServiceName(value: string): value is ServiceName {
  return SERVICE_NAMES.includes(value as ServiceName);
}
