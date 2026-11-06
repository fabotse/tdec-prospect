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
  isStepStalledAfterApproval,
  STALE_RUNNING_HINT_AFTER_MS,
  STALLED_PENDING_AFTER_MS,
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

describe("isStepStalledAfterApproval (DW-12)", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  const old = at(STALLED_PENDING_AFTER_MS + 1);

  type S = {
    step_number: number;
    step_type:
      | "search_companies"
      | "search_leads"
      | "research_accounts"
      | "create_campaign"
      | "export"
      | "activate";
    status: "pending" | "running" | "awaiting_approval" | "approved" | "completed" | "failed" | "skipped";
    completed_at: string | null;
  };
  const s = (
    step_number: number,
    status: S["status"],
    completed_at: string | null = null,
    step_type: S["step_type"] = "search_leads"
  ): S => ({ step_number, step_type, status, completed_at });

  it("anterior aprovado ha mais do limite e nada andando: true", () => {
    const steps = [s(1, "approved", old), s(2, "pending")];
    expect(isStepStalledAfterApproval(steps[1], steps, now)).toBe(true);
  });

  it("no limite ou antes: false", () => {
    const steps = [s(1, "approved", at(STALLED_PENDING_AFTER_MS)), s(2, "pending")];
    expect(isStepStalledAfterApproval(steps[1], steps, now)).toBe(false);
  });

  it("ignora skipped entre o aprovado e o pendente", () => {
    const steps = [s(1, "approved", old), s(2, "skipped"), s(3, "pending")];
    expect(isStepStalledAfterApproval(steps[2], steps, now)).toBe(true);
  });

  it("anterior que nao foi aprovado (completed, pending) nao conta", () => {
    const completed = [s(1, "completed", old), s(2, "pending")];
    expect(isStepStalledAfterApproval(completed[1], completed, now)).toBe(false);
    const queued = [s(1, "approved", old), s(2, "pending"), s(3, "pending")];
    expect(isStepStalledAfterApproval(queued[2], queued, now)).toBe(false);
  });

  it("algo running, aguardando aprovacao ou failed bloqueia", () => {
    for (const other of ["running", "awaiting_approval", "failed"] as const) {
      const steps = [s(1, "approved", old), s(2, "pending"), s(3, other)];
      expect(isStepStalledAfterApproval(steps[1], steps, now)).toBe(false);
    }
  });

  it("research_accounts failed para tras nao bloqueia o export parado (fail-open 24.19)", () => {
    const steps = [
      s(1, "approved", old, "search_companies"),
      s(2, "approved", old, "search_leads"),
      s(3, "failed", old, "research_accounts"),
      s(4, "approved", old, "create_campaign"),
      s(5, "pending", null, "export"),
    ];
    expect(isStepStalledAfterApproval(steps[4], steps, now)).toBe(true);
  });

  it("nunca para o activate (o card de ativacao tem retomada propria)", () => {
    const steps = [s(1, "approved", old, "export"), s(2, "pending", null, "activate")];
    expect(isStepStalledAfterApproval(steps[1], steps, now)).toBe(false);
  });

  it("primeiro step, completed_at nulo ou data invalida: false", () => {
    const first = [s(1, "pending")];
    expect(isStepStalledAfterApproval(first[0], first, now)).toBe(false);
    const noDate = [s(1, "approved", null), s(2, "pending")];
    expect(isStepStalledAfterApproval(noDate[1], noDate, now)).toBe(false);
    const bad = [s(1, "approved", "not-a-date"), s(2, "pending")];
    expect(isStepStalledAfterApproval(bad[1], bad, now)).toBe(false);
  });
});
