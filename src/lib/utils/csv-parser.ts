/**
 * CSV Parser Utilities
 * Story 4.7: Import Campaign Results
 *
 * AC: #2, #3 - Parse CSV/TSV data with automatic delimiter detection
 * AC: #4 - Auto-detect column mappings
 */

import { type ResponseType, responseTypeValues } from "@/types/campaign-import";

export interface ParsedCSVData {
  headers: string[];
  rows: string[][];
}

export interface ColumnMappingResult {
  emailColumn: number | null;
  responseColumn: number | null;
}

/**
 * Lead column mapping result for CSV import
 * Story 12.2: AC #4 - Auto-detect lead fields
 */
export interface LeadColumnMappingResult {
  nameColumn: number | null;
  lastNameColumn: number | null;
  emailColumn: number | null;
  companyColumn: number | null;
  titleColumn: number | null;
  linkedinColumn: number | null;
  phoneColumn: number | null;
}

/**
 * Detect the delimiter used in CSV data
 * Checks for comma, tab, and semicolon
 */
export function detectDelimiter(line: string): string {
  const delimiters = [",", "\t", ";"];
  let maxCount = 0;
  let detected = ",";

  for (const d of delimiters) {
    // Count occurrences not inside quotes
    let count = 0;
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === d && !inQuotes) {
        count++;
      }
    }

    if (count > maxCount) {
      maxCount = count;
      detected = d;
    }
  }

  return detected;
}

/**
 * Parse a single CSV line respecting quoted values
 */
export function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Check for escaped quote (two consecutive quotes)
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Parse CSV/TSV text into headers and rows
 * AC: #2, #3 - Parse uploaded or pasted data
 */
export function parseCSVData(text: string): ParsedCSVData {
  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split into lines and filter empty lines
  const lines = normalizedText.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Detect delimiter from first line
  const delimiter = detectDelimiter(lines[0]);

  // Parse headers
  const headers = parseCSVLine(lines[0], delimiter);

  // Parse data rows
  const rows = lines.slice(1).map((line) => parseCSVLine(line, delimiter));

  return { headers, rows };
}

/**
 * Auto-detect column mappings based on header names
 * AC: #4 - Pre-select columns based on detection
 */
export function detectColumnMappings(headers: string[]): ColumnMappingResult {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  // Email column patterns
  const emailPatterns = [
    "email",
    "e-mail",
    "email_address",
    "emailaddress",
    "recipient",
    "to",
  ];

  // Response/status column patterns
  const responsePatterns = [
    "status",
    "response",
    "replied",
    "reply",
    "action",
    "event",
    "type",
    "result",
    "outcome",
  ];

  // Find email column
  let emailColumn: number | null = null;
  for (let i = 0; i < lowerHeaders.length; i++) {
    if (emailPatterns.some((p) => lowerHeaders[i].includes(p))) {
      emailColumn = i;
      break;
    }
  }

  // Find response column
  let responseColumn: number | null = null;
  for (let i = 0; i < lowerHeaders.length; i++) {
    if (responsePatterns.some((p) => lowerHeaders[i].includes(p))) {
      responseColumn = i;
      break;
    }
  }

  return { emailColumn, responseColumn };
}

/**
 * Auto-detect lead column mappings based on header names
 * Story 12.2: AC #4 - Pre-select columns for lead import
 */
export function detectLeadColumnMappings(headers: string[]): LeadColumnMappingResult {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  const patternGroups: { key: keyof LeadColumnMappingResult; patterns: string[] }[] = [
    { key: "nameColumn", patterns: ["nome", "name", "first_name", "first name", "primeiro_nome", "primeiro nome"] },
    { key: "lastNameColumn", patterns: ["sobrenome", "last_name", "last name", "último nome", "ultimo nome", "surname"] },
    { key: "emailColumn", patterns: ["email", "e-mail", "email_address", "emailaddress"] },
    { key: "companyColumn", patterns: ["empresa", "company", "company_name", "organização", "organizacao", "organization"] },
    { key: "titleColumn", patterns: ["cargo", "title", "job_title", "job title", "posição", "posicao", "position", "role"] },
    { key: "linkedinColumn", patterns: ["linkedin", "linkedin_url", "linkedin url", "perfil linkedin"] },
    { key: "phoneColumn", patterns: ["telefone", "phone", "phone_number", "celular", "mobile", "whatsapp"] },
  ];

  const result: LeadColumnMappingResult = {
    nameColumn: null,
    lastNameColumn: null,
    emailColumn: null,
    companyColumn: null,
    titleColumn: null,
    linkedinColumn: null,
    phoneColumn: null,
  };
  const usedColumns = new Set<number>();

  // Pass 1: exact matches only (prevents "sobrenome" matching "nome" pattern)
  for (const group of patternGroups) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (usedColumns.has(i)) continue;
      if (group.patterns.some((p) => lowerHeaders[i] === p)) {
        result[group.key] = i;
        usedColumns.add(i);
        break;
      }
    }
  }

  // Pass 2: substring matches for remaining unresolved groups
  for (const group of patternGroups) {
    if (result[group.key] !== null) continue;
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (usedColumns.has(i)) continue;
      if (group.patterns.some((p) => lowerHeaders[i].includes(p))) {
        result[group.key] = i;
        usedColumns.add(i);
        break;
      }
    }
  }

  return result;
}

/**
 * Parse response type from various string formats
 * AC: #8 - Handle different formats from campaign tools
 */
export function parseResponseType(value: string): ResponseType {
  const lower = value.toLowerCase().trim();

  // Replied variations
  if (
    [
      "replied",
      "reply",
      "respondeu",
      "responded",
      "response",
      "interested",
    ].includes(lower)
  ) {
    return "replied";
  }

  // Clicked variations
  if (["clicked", "click", "clicou", "link_clicked"].includes(lower)) {
    return "clicked";
  }

  // Opened variations
  if (["opened", "open", "abriu", "email_opened"].includes(lower)) {
    return "opened";
  }

  // Bounced variations
  if (
    [
      "bounced",
      "bounce",
      "retornou",
      "failed",
      "hard_bounce",
      "soft_bounce",
    ].includes(lower)
  ) {
    return "bounced";
  }

  // Unsubscribed variations
  if (
    [
      "unsubscribed",
      "unsubscribe",
      "descadastrou",
      "optout",
      "opt-out",
      "opt_out",
    ].includes(lower)
  ) {
    return "unsubscribed";
  }

  return "unknown";
}

/**
 * Check if value is a valid response type
 */
export function isValidResponseType(value: string): value is ResponseType {
  return responseTypeValues.includes(value as ResponseType);
}

/**
 * Validate email format
 * Uses stricter regex that prevents common invalid patterns
 */
export function isValidEmail(email: string): boolean {
  // More robust regex:
  // - Prevents consecutive dots
  // - Prevents @ at start/end
  // - Ensures proper domain structure
  // - Allows common valid characters
  const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;
  const trimmed = email.trim();

  // Additional checks for edge cases
  if (trimmed.includes("..") || trimmed.includes("@@")) {
    return false;
  }

  return emailRegex.test(trimmed);
}
