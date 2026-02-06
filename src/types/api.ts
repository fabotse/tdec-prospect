/**
 * Centralized API Response Types
 * Story: 3.2 - Apollo API Integration Service
 *
 * Standard response format for all API routes.
 * Used by API routes and frontend hooks.
 */

// ==============================================
// SUCCESS RESPONSE
// ==============================================

/**
 * Standard success response format
 * All API routes should return this format on success
 * Story 3.8: Added totalPages for pagination support
 */
export interface APISuccessResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

// ==============================================
// ERROR RESPONSE
// ==============================================

/**
 * Standard error response format
 * All API routes should return this format on error
 */
export interface APIErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ==============================================
// TYPE GUARDS
// ==============================================

/**
 * Type guard to check if response is an error
 */
export function isAPIError(
  response: APISuccessResponse<unknown> | APIErrorResponse
): response is APIErrorResponse {
  return "error" in response;
}

/**
 * Type guard to check if response is successful
 */
export function isAPISuccess<T>(
  response: APISuccessResponse<T> | APIErrorResponse
): response is APISuccessResponse<T> {
  return "data" in response;
}
