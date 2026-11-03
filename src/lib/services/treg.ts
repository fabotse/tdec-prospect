/**
 * Treg Service — pesquisa web para o dossie da conta
 * Story: 24.19 - Dossie da conta
 *
 * Decisao do spike 24.11 (Fabossi, 2026-10-28): GO so para `treg.web.search`,
 * `treg.web.extract` e `exa.web.search` (via Treg). NO-GO para `people.email.*`,
 * `people.phone.*`, `companies.news`, `companies.jobs` e TheirStack via Treg — este
 * service nao expoe nada disso.
 *
 * `call` NUNCA lanca: erro HTTP, rede ou timeout viram `{ ok: false }` (status 0 para
 * rede/timeout). O `request` da base tem timeout fixo de 10 s; o Treg precisa de 60 s
 * (p95 do spike), entao usa `fetch` proprio com `AbortSignal.timeout`.
 *
 * A chave vem SEMPRE do tenant (`api_configs`, via `readServiceApiKey`). Nunca de env.
 */

import {
  ExternalService,
  ExternalServiceError,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

export const TREG_API_BASE = "https://treg.to";

/** Endpoints autorizados pelo spike 24.11. */
export const TREG_ENDPOINTS = {
  webSearch: "treg.web.search",
  webExtract: "treg.web.extract",
  exaSearch: "exa.web.search",
} as const;

export type TregEndpointId = (typeof TREG_ENDPOINTS)[keyof typeof TREG_ENDPOINTS];

const DEFAULT_CALL_TIMEOUT_MS = 60_000;

const TREG_ERROR_MESSAGES = {
  INVALID_KEY: "Token do Treg inválido ou expirado.",
  FORBIDDEN: "Acesso negado ao Treg. Verifique as permissões do token.",
  RATE_LIMITED: "Limite de requisições do Treg atingido. Aguarde e tente novamente.",
  GENERIC: "Erro na comunicação com o Treg.",
};

// ==============================================
// TYPES
// ==============================================

export interface TregCallOptions {
  /** Teto da chamada em US$ (`X-Treg-Route-Max-Cost`). */
  maxCostUsd: number;
  /** `Idempotency-Key` deterministica (retry devolve a resposta ja paga, sem custo). */
  idempotencyKey: string;
  /** `X-Treg-Meta` (ex.: `feature=dossie-24-19,tenant=<id>,execution=<id>`). */
  meta: string;
  /** Timeout da chamada (padrao 60 s). */
  timeoutMs?: number;
}

export interface TregCallResult {
  ok: boolean;
  /** HTTP status; 0 = rede ou timeout. */
  status: number;
  json: unknown;
  /** Custo cobrado em micro-dolares (`X-Treg-Cost-Micro`). */
  costMicro: number;
  durationMs: number;
  error?: string;
}

// ==============================================
// HELPERS
// ==============================================

function readCostMicro(headers: Headers | undefined, json: unknown): number {
  const header = headers?.get?.("x-treg-cost-micro");
  const fromHeader = header !== null && header !== undefined ? Number(header) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader >= 0) return fromHeader;
  const charged = (json as { _treg?: { charged_micro?: unknown } } | null)?._treg?.charged_micro;
  const fromBody = Number(charged);
  return Number.isFinite(fromBody) && fromBody >= 0 ? fromBody : 0;
}

function describeHttpError(status: number, json: unknown): string {
  const body = json as { error?: unknown; message?: unknown } | null;
  const raw =
    typeof body?.error === "string"
      ? body.error
      : typeof (body?.error as { message?: unknown } | undefined)?.message === "string"
        ? ((body?.error as { message: string }).message)
        : typeof body?.message === "string"
          ? body.message
          : "";
  const detail = raw ? `: ${raw.slice(0, 160)}` : "";
  return `HTTP ${status}${detail}`;
}

// ==============================================
// SERVICE
// ==============================================

export class TregService extends ExternalService {
  readonly name = "treg";

  /** Teste gratuito: `GET /orgs` com o token. */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      await this.request<unknown>(`${TREG_API_BASE}/orgs`, {
        method: "GET",
        headers: { "X-Treg-Token": apiKey },
      });
      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      return this.createErrorResult(this.handleError(error));
    }
  }

  protected handleError(error: unknown): ExternalServiceError {
    const base = super.handleError(error);
    if (base.statusCode === 401) {
      return new ExternalServiceError(this.name, 401, TREG_ERROR_MESSAGES.INVALID_KEY, error);
    }
    if (base.statusCode === 403) {
      return new ExternalServiceError(this.name, 403, TREG_ERROR_MESSAGES.FORBIDDEN, error);
    }
    if (base.statusCode === 429) {
      return new ExternalServiceError(this.name, 429, TREG_ERROR_MESSAGES.RATE_LIMITED, error);
    }
    if (base.statusCode === 500) {
      return new ExternalServiceError(this.name, 500, TREG_ERROR_MESSAGES.GENERIC, error);
    }
    return base;
  }

  /**
   * `POST https://treg.to/call/<endpointId>`. Nunca lanca.
   */
  async call(
    apiKey: string,
    endpointId: TregEndpointId,
    body: Record<string, unknown>,
    options: TregCallOptions
  ): Promise<TregCallResult> {
    const start = Date.now();
    const timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;

    let response: Response;
    try {
      response = await fetch(`${TREG_API_BASE}/call/${endpointId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Treg-Token": apiKey,
          "X-Treg-Route-Max-Cost": String(options.maxCostUsd),
          "Idempotency-Key": options.idempotencyKey,
          "X-Treg-Meta": options.meta,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return {
        ok: false,
        status: 0,
        json: null,
        costMicro: 0,
        durationMs: Date.now() - start,
        error: isTimeout ? `timeout (${timeoutMs} ms)` : "erro de rede",
      };
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    const costMicro = readCostMicro(response.headers, json);
    const durationMs = Date.now() - start;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        json,
        costMicro,
        durationMs,
        error: describeHttpError(response.status, json),
      };
    }

    return { ok: true, status: response.status, json, costMicro, durationMs };
  }
}
