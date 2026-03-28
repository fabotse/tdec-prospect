/**
 * Lead Import Parser
 * Story: 17.11 - Pipeline Flexivel — Entrada Direta em Campanha
 *
 * AC: #1 - Orienta formato minimo esperado: email (obrigatorio), nome, empresa, cargo
 * AC: #2 - Valida que cada lead tem ao menos email valido, informa aceitos vs rejeitados
 */

import type { SearchLeadResult } from "@/types/agent";

// ==============================================
// TYPES
// ==============================================

export interface LeadImportResult {
  accepted: SearchLeadResult[];
  rejected: { line: string; reason: string }[];
}

// ==============================================
// CONSTANTS
// ==============================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_KEYWORDS = ["email", "e-mail", "nome", "name", "cargo", "title", "empresa", "company"];

// ==============================================
// HELPERS
// ==============================================

function detectSeparator(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function isHeaderLine(line: string): boolean {
  // Don't treat lines containing emails as headers
  if (EMAIL_REGEX.test(line.trim()) || line.includes("@")) return false;
  const separator = detectSeparator(line);
  const fields = line.split(separator).map((f) => f.trim().toLowerCase());
  return fields.some((field) => HEADER_KEYWORDS.includes(field));
}

function findEmailIndex(fields: string[]): number {
  return fields.findIndex((f) => EMAIL_REGEX.test(f.trim()));
}

function extractNameFromEmail(email: string): string {
  const localPart = email.split("@")[0];
  return localPart
    .replace(/[._-]/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function extractCompanyFromEmail(email: string): string | null {
  const domain = email.split("@")[1];
  if (!domain) return null;
  const parts = domain.split(".");
  if (parts.length < 2) return null;
  const company = parts[0];
  return company.charAt(0).toUpperCase() + company.slice(1);
}

// ==============================================
// PARSER
// ==============================================

export function parseLeadInput(text: string): LeadImportResult {
  const lines = text.split("\n").map((l) => l.trim());
  const accepted: SearchLeadResult[] = [];
  const rejected: { line: string; reason: string }[] = [];
  const seenEmails = new Set<string>();

  let skipFirst = false;
  if (lines.length > 0 && isHeaderLine(lines[0])) {
    skipFirst = true;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipFirst && i === 0) continue;
    if (!line) continue;

    const separator = detectSeparator(line);
    const fields = line.split(separator).map((f) => f.trim());
    const emailIdx = findEmailIndex(fields);

    if (emailIdx === -1) {
      rejected.push({ line, reason: "Email invalido ou ausente" });
      continue;
    }

    const email = fields[emailIdx].toLowerCase();

    if (seenEmails.has(email)) {
      rejected.push({ line, reason: "Email duplicado" });
      continue;
    }
    seenEmails.add(email);

    const lead = buildLead(fields, emailIdx, email);
    accepted.push(lead);
  }

  return { accepted, rejected };
}

function buildLead(
  fields: string[],
  emailIdx: number,
  email: string
): SearchLeadResult {
  const nonEmailFields = fields.filter((_, i) => i !== emailIdx);
  const fieldCount = nonEmailFields.length;

  let name: string | null = null;
  let title: string | null = null;
  let companyName: string | null = null;

  if (fieldCount === 0) {
    // Only email
    name = extractNameFromEmail(email);
    companyName = extractCompanyFromEmail(email);
  } else if (fieldCount === 1) {
    // Name, Email
    name = nonEmailFields[0] || null;
  } else if (fieldCount === 2) {
    // Name, Title, Email
    name = nonEmailFields[0] || null;
    title = nonEmailFields[1] || null;
  } else if (fieldCount >= 3) {
    // Name, Title, Company, Email (+ possible extras ignored)
    name = nonEmailFields[0] || null;
    title = nonEmailFields[1] || null;
    companyName = nonEmailFields[2] || null;
  }

  return {
    name: name || extractNameFromEmail(email),
    title: title || null,
    companyName: companyName || extractCompanyFromEmail(email),
    email,
    linkedinUrl: null,
    apolloId: null,
  };
}
