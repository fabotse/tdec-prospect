/**
 * Suppression list utilities
 * Story: 23.5 - Lista de supressão: cadastro e import
 *
 * Normalização de valor (domínio / e-mail), leitura de motivo e leitura de CSV.
 * Puro e sem dependência de servidor: o cliente usa para ler o arquivo e o servidor
 * normaliza de novo tudo o que recebe.
 */

import { parseCSVData } from "@/lib/utils/csv-parser";
import {
  SUPPRESSION_REASONS,
  SUPPRESSION_REASON_LABELS,
  type SuppressionEntryType,
  type SuppressionImportRow,
  type SuppressionReason,
} from "@/types/suppression";

const MAX_VALUE_LENGTH = 320;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const EMAIL_LOCAL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

/** Minúsculo, sem acento, sem espaço nas pontas. */
function fold(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Domínio limpo ou null. Tira protocolo, `www.`, `@` inicial, porta, caminho, query e ponto final. */
function normalizeDomain(raw: string): string | null {
  let v = raw.replace(/^@+/, "");
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  v = v.split(/[/?#]/, 1)[0] ?? "";
  v = v.replace(/:\d*$/, "");
  v = v.replace(/^www\./, "");
  v = v.replace(/\.+$/, "");
  if (!DOMAIN_RE.test(v)) return null;
  return v;
}

/**
 * Normaliza um valor digitado ou importado.
 * Tem parte local antes do `@` → e-mail. Senão → domínio.
 */
export function normalizeSuppressionValue(
  raw: string | null | undefined
): { type: SuppressionEntryType; value: string } | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v || v.length > MAX_VALUE_LENGTH) return null;

  const at = v.indexOf("@");
  if (at > 0 && !v.includes("://")) {
    const local = v.slice(0, at);
    const domainPart = v.slice(at + 1);
    if (!EMAIL_LOCAL_RE.test(local) || domainPart.includes("@")) return null;
    // O domínio do e-mail não pode ter caminho/porta: só `[a-z0-9-.]`.
    const domain = domainPart.replace(/\.+$/, "");
    if (!DOMAIN_RE.test(domain)) return null;
    return { type: "email", value: `${local}@${domain}` };
  }

  const domain = normalizeDomain(v);
  return domain ? { type: "domain", value: domain } : null;
}

const REASON_ALIASES: Record<string, SuppressionReason> = (() => {
  const map: Record<string, SuppressionReason> = {};
  const compact = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");
  for (const key of SUPPRESSION_REASONS) {
    map[compact(key)] = key;
    map[compact(SUPPRESSION_REASON_LABELS[key])] = key;
  }
  return map;
})();

/**
 * Lê um motivo (chave ou rótulo, sem acento/caixa; `opt-out`, `optout`, `opt_out`).
 * Devolve null se vazio ou desconhecido.
 */
export function parseSuppressionReason(raw: string | null | undefined): SuppressionReason | null {
  if (typeof raw !== "string") return null;
  const key = fold(raw).replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  return REASON_ALIASES[key] ?? null;
}

const VALUE_HEADERS = ["valor", "value", "dominio", "domain", "site", "website"];
const EMAIL_HEADERS = ["email", "e-mail"];
const REASON_HEADERS = ["motivo", "reason"];

export const SUPPRESSION_CSV_MISSING_COLUMN = "coluna de domínio/e-mail não encontrada";

export type ParseSuppressionCsvResult =
  | { success: true; rows: SuppressionImportRow[] }
  | { success: false; error: string };

/**
 * Lê o CSV da lista de supressão (cabeçalho obrigatório; `,` `;` ou tab).
 * Coluna de valor: `valor|value|dominio|domain|email|e-mail|site|website`.
 * Coluna de motivo: `motivo|reason`. Se houver coluna de e-mail e de domínio, a linha usa
 * o e-mail quando preenchido, senão o domínio. Não valida valor nem motivo (o servidor faz).
 */
export function parseSuppressionCsv(text: string): ParseSuppressionCsvResult {
  const clean = text.replace(/^﻿/, "");
  const { headers, rows } = parseCSVData(clean);
  const folded = headers.map((h) => fold(h.replace(/^"|"$/g, "")));

  const emailCol = folded.findIndex((h) => EMAIL_HEADERS.includes(h));
  const domainCol = folded.findIndex((h) => VALUE_HEADERS.includes(h));
  const reasonCol = folded.findIndex((h) => REASON_HEADERS.includes(h));

  if (emailCol === -1 && domainCol === -1) {
    return { success: false, error: SUPPRESSION_CSV_MISSING_COLUMN };
  }

  // parseCSVData descarta linhas em branco: reconstrói o nº real de cada linha.
  const lineNumbers: number[] = [];
  clean
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .forEach((line, i) => {
      if (line.trim() !== "") lineNumbers.push(i + 1);
    });

  const result: SuppressionImportRow[] = [];
  rows.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const email = emailCol >= 0 ? (cells[emailCol] ?? "").trim() : "";
    const domain = domainCol >= 0 ? (cells[domainCol] ?? "").trim() : "";
    result.push({
      line: lineNumbers[i + 1] ?? i + 2,
      value: email || domain,
      reason: reasonCol >= 0 ? (cells[reasonCol] ?? "").trim() : "",
    });
  });

  return { success: true, rows: result };
}
