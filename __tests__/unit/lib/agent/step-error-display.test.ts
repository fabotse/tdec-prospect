/**
 * Story 24.3 — formatador unico de erro de step (coerencia com isRetryable).
 */

import { describe, it, expect } from "vitest";
import {
  formatStepErrorMessage,
  formatStepErrorSentence,
  getStepErrorMessage,
  isStepErrorRetryable,
  isStepRunningTooLong,
  STALE_RUNNING_HINT_AFTER_MS,
} from "@/lib/agent/step-error-display";

describe("formatStepErrorMessage", () => {
  it("retryable: mantem a mensagem e tira so a pontuacao final", () => {
    expect(formatStepErrorMessage("Rate limited. Tente novamente.", true)).toBe(
      "Rate limited. Tente novamente"
    );
  });

  it("nao retryable: remove 'tente novamente' e a pontuacao final", () => {
    expect(formatStepErrorMessage("Erro interno. Tente novamente.", false)).toBe("Erro interno");
  });

  it("cai no fallback quando a sanitizacao esvazia ou a mensagem falta", () => {
    expect(formatStepErrorMessage("Tente novamente.", false)).toBe("Erro ao processar a etapa");
    expect(formatStepErrorMessage(null, true)).toBe("Erro ao processar a etapa");
  });
});

describe("formatStepErrorSentence", () => {
  it("retryable termina em ponto, sem sufixo", () => {
    expect(formatStepErrorSentence("Rate limited", true)).toBe("Rate limited.");
  });

  it("nao retryable manda falar com o suporte", () => {
    const text = formatStepErrorSentence("Erro interno. Tente novamente.", false);
    expect(text).toBe("Erro interno. Entre em contato com o suporte.");
    expect(text.toLowerCase()).not.toContain("tente novamente");
  });
});

describe("isStepErrorRetryable", () => {
  it("false so quando output.error.isRetryable === false", () => {
    expect(isStepErrorRetryable({ output: { error: { isRetryable: false } } })).toBe(false);
    expect(isStepErrorRetryable({ output: { error: { isRetryable: true } } })).toBe(true);
    expect(isStepErrorRetryable({ output: { error: {} } })).toBe(true);
    expect(isStepErrorRetryable({ output: null })).toBe(true);
  });
});

describe("getStepErrorMessage", () => {
  it("prefere error_message e cai para output.error.message", () => {
    expect(getStepErrorMessage({ error_message: "A", output: { error: { message: "B" } } })).toBe("A");
    expect(getStepErrorMessage({ error_message: null, output: { error: { message: "B" } } })).toBe("B");
    expect(getStepErrorMessage({ error_message: null, output: null })).toBeNull();
  });
});

describe("isStepRunningTooLong (DW-11)", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  const base = { status: "running" as const, created_at: at(0) };

  it("abaixo ou no limite: false; acima: true", () => {
    expect(isStepRunningTooLong({ ...base, started_at: at(STALE_RUNNING_HINT_AFTER_MS) }, now)).toBe(false);
    expect(isStepRunningTooLong({ ...base, started_at: at(STALE_RUNNING_HINT_AFTER_MS + 1) }, now)).toBe(true);
  });

  it("limite fica acima dos 5 min da function", () => {
    expect(STALE_RUNNING_HINT_AFTER_MS).toBeGreaterThan(300_000);
  });

  it("so vale para running", () => {
    expect(
      isStepRunningTooLong({ status: "failed", started_at: at(60 * 60_000), created_at: at(0) }, now)
    ).toBe(false);
  });

  it("started_at nulo cai no created_at; data invalida nunca e velha", () => {
    expect(
      isStepRunningTooLong({ status: "running", started_at: null, created_at: at(20 * 60_000) }, now)
    ).toBe(true);
    expect(
      isStepRunningTooLong({ status: "running", started_at: "lixo", created_at: at(20 * 60_000) }, now)
    ).toBe(false);
  });
});
