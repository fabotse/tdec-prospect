/**
 * Error Logger
 * Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
 *
 * Grava exceções de servidor em `error_logs` (consultável em Configurações → Erros),
 * sem serviço externo. Mensagem sanitizada (sem token, chave, e-mail, telefone, query
 * string) e truncada em 500 caracteres. NUNCA lança: se o insert falhar (ex.: migration
 * 00068 ainda não aplicada), fica só o `console.error` — que sempre acontece.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ErrorSource } from "@/types/error-log";

export const ERROR_MESSAGE_MAX_LENGTH = 500;

const REDACTED = "[redacted]";

/**
 * Remove segredos e dados pessoais de uma mensagem de erro.
 * Ordem importa: URLs (query string) e tokens antes de e-mail/telefone.
 */
export function sanitizeErrorMessage(raw: unknown): string {
  let message: string;
  if (typeof raw === "string") {
    message = raw;
  } else if (raw instanceof Error) {
    message = raw.message;
  } else if (raw === null || raw === undefined) {
    message = "";
  } else {
    try {
      message = JSON.stringify(raw) ?? String(raw);
    } catch {
      message = String(raw);
    }
  }

  let out = message
    // Query string de URLs: https://x/y?token=1 -> https://x/y?[redacted]
    .replace(/(https?:\/\/[^\s?#"'<>]*)\?[^\s"'<>]*/gi, `$1?${REDACTED}`)
    // Authorization: Bearer/Basic <token>
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/=]+/gi, `$1 ${REDACTED}`)
    // JWT soltos (eyJ...)
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,2}/g, REDACTED)
    // chave=valor / chave: valor para nomes sensíveis
    .replace(
      /\b([A-Za-z0-9_-]*(?:api[_-]?key|apikey|token|secret|password|passwd|pwd|authorization|access[_-]?key|private[_-]?key|service[_-]?role)[A-Za-z0-9_-]*)(["']?\s*[:=]\s*["']?)(?!(?:Bearer|Basic)\s|\[redacted\])[^\s"',;&}]+/gi,
      `$1$2${REDACTED}`
    )
    // Chaves com prefixo conhecido (sk-..., sk_live_..., pk_...)
    .replace(/\b(?:sk|pk|rk)[-_](?:live[-_]|test[-_])?[A-Za-z0-9_-]{8,}/g, REDACTED)
    // E-mails
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    // CNPJ (12.345.678/0001-90) e CPF (123.456.789-00) — antes da regra de telefone
    .replace(/(?<![\w.-])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\w.])/g, "[cnpj]")
    .replace(/(?<![\w.-])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\w.])/g, "[cpf]")
    // Telefones (com DDI/DDD, separadores comuns; ao menos 8 dígitos)
    // (bordas sem letra/dígito/ponto/hífen para não pegar pedaços de UUID ou decimais)
    .replace(/(?<![\w.-])(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}(?![\w.])/g, (match) =>
      match.replace(/\D/g, "").length >= 8 ? "[telefone]" : match
    );

  out = out.trim();
  if (out.length > ERROR_MESSAGE_MAX_LENGTH) {
    out = out.slice(0, ERROR_MESSAGE_MAX_LENGTH);
  }
  return out || "Erro sem mensagem";
}

export interface LogServerErrorParams {
  source: ErrorSource;
  route: string;
  error: unknown;
  tenantId?: string | null;
}

/**
 * Registra um erro de servidor. Nunca lança; custo máximo = um insert.
 */
export async function logServerError({
  source,
  route,
  error,
  tenantId,
}: LogServerErrorParams): Promise<void> {
  console.error(`[${source}] ${route}:`, error);

  try {
    const supabase = createAdminClient();
    const { error: insertError } = await supabase.from("error_logs").insert({
      tenant_id: tenantId ?? null,
      source,
      route: route.slice(0, 200),
      message: sanitizeErrorMessage(error),
    });
    if (insertError) {
      console.error("[error-logger] Falha ao gravar error_logs:", insertError.message);
    }
  } catch (logError) {
    console.error(
      "[error-logger] Falha ao gravar error_logs:",
      logError instanceof Error ? logError.message : logError
    );
  }
}
