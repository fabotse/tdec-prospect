/**
 * SignalHire API Types
 * Story: 4.4 - SignalHire Integration Service
 *
 * Based on confirmed API research (2026-02-01)
 * API Docs: https://www.signalhire.com/api
 *
 * AC: #7 - TypeScript types for SignalHire API
 */

// ==============================================
// REQUEST TYPES
// ==============================================

/**
 * Request body for Person API lookup
 * POST /v1/candidate/search
 */
export interface SignalHirePersonRequest {
  /**
   * Array of identifiers to search for
   * Can contain: LinkedIn URLs, emails, phone numbers (E164), or profile IDs
   * Max 100 items per request
   */
  items: string[];
  /**
   * Optional webhook URL to receive results asynchronously
   * If not provided, must poll for results
   */
  callbackUrl?: string;
  /**
   * If true, returns profile without contact details (no credit consumption)
   * Useful for getting name, location, work experience, education, skills only
   */
  withoutContacts?: boolean;
}

/**
 * Single item request for phone lookup
 * Simplified version for single-person lookup use case
 */
export interface SignalHireLookupRequest {
  identifier: string;
}

// ==============================================
// RESPONSE TYPES
// ==============================================

/**
 * Status values returned in callback/poll responses
 */
export type SignalHireItemStatus =
  | "success"
  | "failed"
  | "credits_are_over"
  | "timeout_exceeded"
  | "duplicate_query";

/**
 * Individual item result in the response
 */
export interface SignalHireItemResult {
  /** The original item from the request (LinkedIn URL, email, etc.) */
  item: string;
  /** Processing status for this item */
  status: SignalHireItemStatus;
  /** Error message if status is 'failed' */
  error?: string;
  /** Person data if status is 'success' */
  person?: SignalHirePerson;
}

/**
 * Person data from SignalHire
 * Contains profile information and contact details
 */
export interface SignalHirePerson {
  /** SignalHire internal ID */
  id?: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Full name */
  fullName?: string;
  /** Current job title */
  title?: string;
  /** Current company */
  company?: string;
  /** Location (city, country) */
  location?: string;
  /** LinkedIn profile URL */
  linkedin?: string;
  /** Profile photo URL */
  photoUrl?: string;
  /** Email addresses (array of verified emails) */
  emails?: SignalHireEmail[];
  /** Phone numbers (array of verified phones) */
  phones?: SignalHirePhone[];
  /** Work experience history */
  experience?: SignalHireExperience[];
  /** Education history */
  education?: SignalHireEducation[];
  /** Skills list */
  skills?: string[];
}

/**
 * Email information from SignalHire
 */
export interface SignalHireEmail {
  /** Email address */
  email: string;
  /** Email type (work, personal, etc.) */
  type?: string;
  /** Verification status */
  status?: string;
}

/**
 * Phone information from SignalHire
 */
export interface SignalHirePhone {
  /** Phone number (E164 format preferred) */
  phone: string;
  /** Phone type (mobile, work, etc.) */
  type?: string;
}

/**
 * Work experience entry
 */
export interface SignalHireExperience {
  /** Job title */
  title?: string;
  /** Company name */
  company?: string;
  /** Start date */
  startDate?: string;
  /** End date (null if current) */
  endDate?: string;
  /** Is current position */
  current?: boolean;
  /** Location */
  location?: string;
}

/**
 * Education entry
 */
export interface SignalHireEducation {
  /** School/University name */
  school?: string;
  /** Degree */
  degree?: string;
  /** Field of study */
  fieldOfStudy?: string;
  /** Start year */
  startYear?: number;
  /** End year */
  endYear?: number;
}

/**
 * Response from initial POST request
 * Returns request ID for polling
 */
export interface SignalHireInitialResponse {
  /** HTTP status code (201 = accepted, 200 = immediate result) */
  status?: number;
  /** Request ID for polling (from Request-Id header or body) */
  requestId?: string;
  /** Message */
  message?: string;
  /** If 200, may contain immediate results */
  data?: SignalHireItemResult[];
}

/**
 * Response from polling GET request
 */
export interface SignalHirePollingResponse {
  /** HTTP status code (200 = complete, 204 = still processing) */
  status?: number;
  /** Array of results for each item */
  data?: SignalHireItemResult[];
}

/**
 * Full response from Person API (after polling complete)
 */
export interface SignalHirePersonResponse {
  /** Array of results for each item */
  data: SignalHireItemResult[];
  /** Credits remaining (from X-Credits-Left header) */
  creditsRemaining?: number;
}

// ==============================================
// RESULT TYPES (Internal)
// ==============================================

/**
 * Result of phone lookup operation
 * AC: #7 - Returns phone, creditsUsed, creditsRemaining
 */
export interface SignalHireLookupResult {
  /** Primary phone number found */
  phone: string;
  /** All phones found */
  phones?: SignalHirePhone[];
  /** Credits used for this lookup (1 if found, 0 if not found) */
  creditsUsed: number;
  /** Remaining credits after lookup */
  creditsRemaining: number | null;
  /** Full person data if needed */
  person?: SignalHirePerson;
}

// ==============================================
// TRANSFORM FUNCTIONS
// ==============================================

/**
 * Extract primary phone from SignalHire person
 * Prefers mobile over work phone
 */
export function extractPrimaryPhone(person: SignalHirePerson): string | null {
  if (!person.phones || person.phones.length === 0) {
    return null;
  }

  // Prefer mobile phone
  const mobile = person.phones.find(
    (p) => p.type?.toLowerCase() === "mobile" || p.type?.toLowerCase() === "cell"
  );
  if (mobile) return mobile.phone;

  // Then work phone
  const work = person.phones.find(
    (p) => p.type?.toLowerCase() === "work" || p.type?.toLowerCase() === "business"
  );
  if (work) return work.phone;

  // Fallback to first phone
  return person.phones[0]?.phone || null;
}

/**
 * Transform SignalHire person to lead phone update
 * Returns object for updating lead record
 */
export function transformToLeadPhone(
  person: SignalHirePerson
): { phone: string } | null {
  const phone = extractPrimaryPhone(person);
  if (!phone) return null;
  return { phone };
}

/**
 * Check if identifier is a LinkedIn URL
 */
export function isLinkedInUrl(identifier: string): boolean {
  return (
    identifier.includes("linkedin.com/in/") ||
    identifier.includes("linkedin.com/pub/")
  );
}

/**
 * Check if identifier is an email
 */
export function isEmail(identifier: string): boolean {
  return identifier.includes("@") && !identifier.includes("linkedin.com");
}

/**
 * Check if identifier is a phone number (E164 format)
 */
export function isPhoneNumber(identifier: string): boolean {
  // E164 format: +[country code][number]
  return /^\+\d{10,15}$/.test(identifier.replace(/\s/g, ""));
}

/**
 * Detect identifier type for logging/debugging
 */
export function detectIdentifierType(
  identifier: string
): "linkedin" | "email" | "phone" | "unknown" {
  if (isLinkedInUrl(identifier)) return "linkedin";
  if (isEmail(identifier)) return "email";
  if (isPhoneNumber(identifier)) return "phone";
  return "unknown";
}
