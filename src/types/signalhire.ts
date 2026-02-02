/**
 * SignalHire API Types
 * Story: 4.4 - SignalHire Integration Service
 * Story: 4.4.2 - SignalHire Callback Architecture
 *
 * Based on confirmed API research (2026-02-01)
 * API Docs: https://www.signalhire.com/api
 *
 * AC 4.4.2 #6 - TypeScript types corrigidos para estrutura real da API
 *
 * IMPORTANTE: A API SignalHire usa:
 * - "candidate" (NÃO "person")
 * - "contacts[]" com type/value (NÃO "phones[]" com phone)
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
   * REQUIRED for async processing
   * URL to receive callback with results
   * Must be publicly accessible
   */
  callbackUrl: string;
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
// CALLBACK TYPES (Estrutura real da API)
// ==============================================

/**
 * Status values returned in callback
 * AC: #6 - Status possíveis retornados no callback
 */
export type SignalHireCallbackStatus =
  | "success"
  | "failed"
  | "credits_are_over"
  | "timeout_exceeded"
  | "duplicate_query";

/**
 * Contato retornado no callback
 * AC: #6 - SignalHireContact com type, value, subType
 *
 * IMPORTANTE: Usa "contacts[]" com "type" e "value"
 * NÃO usa "phones[]" com "phone"
 */
export interface SignalHireContact {
  /** Tipo do contato: "phone" ou "email" */
  type: "phone" | "email";
  /** Valor do contato (número de telefone ou endereço de email) */
  value: string;
  /** Rating de confiabilidade */
  rating?: string;
  /** Subtipo: mobile, work_phone, personal, work */
  subType?: "mobile" | "work_phone" | "personal" | "work" | string;
  /** Informações adicionais */
  info?: string;
}

/**
 * Dados do candidato no callback
 * AC: #6 - SignalHireCandidate com contacts[]
 *
 * IMPORTANTE: A API usa "candidate", NÃO "person"
 */
export interface SignalHireCandidate {
  /** SignalHire internal ID */
  uid?: string;
  /** Full name */
  fullName?: string;
  /** Gender */
  gender?: string | null;
  /** Profile photo */
  photo?: { url: string };
  /** Locations */
  locations?: Array<{ name: string }>;
  /** Skills list */
  skills?: string[];
  /** Education history */
  education?: Array<{
    faculty?: string;
    university?: string;
    url?: string;
    startedYear?: number;
    endedYear?: number;
    degree?: string[];
  }>;
  /** Work experience history */
  experience?: Array<{
    position?: string;
    company?: string;
    current?: boolean;
    started?: string;
    ended?: string | null;
  }>;
  /** Headline/title */
  headLine?: string;
  /** Profile summary */
  summary?: string;
  /** Contact information (phones, emails) */
  contacts?: SignalHireContact[];
  /** Social profiles */
  social?: Array<{
    type: string;
    link: string;
    rating?: string;
  }>;
}

/**
 * Item individual no callback
 * AC: #6 - SignalHireCallbackItem com campo candidate
 */
export interface SignalHireCallbackItem {
  /** O identifier original (LinkedIn URL ou email) */
  item: string;
  /** Status do processamento */
  status: SignalHireCallbackStatus;
  /** Dados do candidato (se sucesso) */
  candidate?: SignalHireCandidate;
  /** Mensagem de erro (se falha) */
  error?: string;
}

// ==============================================
// DATABASE TYPES
// ==============================================

/**
 * Status values for signalhire_lookups table
 */
export type SignalHireLookupDbStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "not_found"
  | "credits_exhausted";

/**
 * Row in signalhire_lookups table
 * AC: #6 - SignalHireLookupRow para tabela do banco
 */
export interface SignalHireLookupRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  identifier: string;
  request_id: string | null;
  status: SignalHireLookupDbStatus;
  phone: string | null;
  raw_response: SignalHireCallbackItem | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lookup status para o frontend (polling)
 */
export interface SignalHireLookupStatus {
  id: string;
  status: SignalHireLookupDbStatus;
  phone: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * Response from initiating a lookup
 * Returned by the refactored lookupPhone() method
 */
export interface SignalHireLookupInitResponse {
  /** ID do registro na tabela signalhire_lookups */
  lookupId: string;
  /** Request ID retornado pelo SignalHire (para debug) */
  requestId: string;
}

// ==============================================
// LEGACY TYPES (Mantidos para compatibilidade)
// ==============================================

/**
 * @deprecated Use SignalHireCallbackStatus instead
 */
export type SignalHireItemStatus = SignalHireCallbackStatus;

/**
 * @deprecated Use SignalHireCallbackItem with candidate instead
 */
export interface SignalHireItemResult {
  item: string;
  status: SignalHireCallbackStatus;
  error?: string;
  /** @deprecated Use candidate instead */
  person?: SignalHirePerson;
}

/**
 * @deprecated Use SignalHireCandidate instead
 * Kept for backward compatibility with existing code
 */
export interface SignalHirePerson {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  title?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  photoUrl?: string;
  /** @deprecated Use contacts[] with type="email" instead */
  emails?: SignalHireEmail[];
  /** @deprecated Use contacts[] with type="phone" instead */
  phones?: SignalHirePhone[];
  experience?: SignalHireExperience[];
  education?: SignalHireEducation[];
  skills?: string[];
}

/**
 * @deprecated Use SignalHireContact with type="email" instead
 */
export interface SignalHireEmail {
  email: string;
  type?: string;
  status?: string;
}

/**
 * @deprecated Use SignalHireContact with type="phone" instead
 */
export interface SignalHirePhone {
  phone: string;
  type?: string;
}

/**
 * Work experience entry
 */
export interface SignalHireExperience {
  title?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  location?: string;
}

/**
 * Education entry
 */
export interface SignalHireEducation {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  startYear?: number;
  endYear?: number;
}

/**
 * Response from initial POST request
 * Returns request ID for tracking
 */
export interface SignalHireInitialResponse {
  status?: number;
  requestId?: string;
  message?: string;
}

/**
 * Full lookup result (internal use)
 * @deprecated Use SignalHireLookupStatus for polling results
 */
export interface SignalHireLookupResult {
  phone: string;
  phones?: SignalHirePhone[];
  creditsUsed: number;
  creditsRemaining: number | null;
  person?: SignalHirePerson;
}

// ==============================================
// TRANSFORM FUNCTIONS
// ==============================================

/**
 * Extract phone from contacts array (estrutura real da API)
 * AC: #6 - Atualizar extractPrimaryPhone para usar contacts[]
 *
 * Priority: mobile > work_phone > personal > first
 *
 * @param contacts - Array de contatos do SignalHire
 * @returns Telefone primário ou null
 */
export function extractPhoneFromContacts(
  contacts?: SignalHireContact[]
): string | null {
  if (!contacts || contacts.length === 0) return null;

  // Filtrar apenas contatos do tipo "phone"
  const phones = contacts.filter((c) => c.type === "phone");
  if (phones.length === 0) return null;

  // Prioridade: mobile > work_phone > personal > primeiro disponível
  const mobile = phones.find((p) => p.subType === "mobile");
  if (mobile) return mobile.value;

  const work = phones.find((p) => p.subType === "work_phone");
  if (work) return work.value;

  const personal = phones.find((p) => p.subType === "personal");
  if (personal) return personal.value;

  // Fallback para o primeiro telefone
  return phones[0].value;
}

/**
 * Extract primary phone from SignalHire person (legacy)
 * @deprecated Use extractPhoneFromContacts instead
 *
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
 * @deprecated Use extractPhoneFromContacts instead
 *
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
