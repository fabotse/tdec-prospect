/**
 * Tests for error-messages.ts
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #3 - API error mapping to user-friendly PT-BR messages
 */

import { describe, expect, it } from "vitest";

import { mapExportError } from "@/lib/export/error-messages";

describe("mapExportError", () => {
  // --- HTTP Status Codes ---
  it("maps 401 to authentication error", () => {
    const error = { status: 401, message: "Unauthorized" };
    const result = mapExportError(error, "instantly");
    expect(result.title).toBe("Erro de autenticação");
    expect(result.message).toContain("API key inválida");
    expect(result.message).toContain("Instantly");
    expect(result.canRetry).toBe(false);
    expect(result.canFallback).toBe(true);
  });

  it("maps 402 to no credits error", () => {
    const error = { status: 402, message: "Payment Required" };
    const result = mapExportError(error, "instantly");
    expect(result.title).toBe("Sem créditos");
    expect(result.message).toContain("sem créditos");
    expect(result.canRetry).toBe(false);
    expect(result.canFallback).toBe(true);
  });

  it("maps 429 to rate limit error", () => {
    const error = { status: 429, message: "Too Many Requests" };
    const result = mapExportError(error, "instantly");
    expect(result.title).toBe("Limite de requisições");
    expect(result.message).toContain("Muitas requisições");
    expect(result.canRetry).toBe(true);
    expect(result.canFallback).toBe(true);
  });

  it("maps 500 to service unavailable", () => {
    const error = { status: 500, message: "Internal Server Error" };
    const result = mapExportError(error, "instantly");
    expect(result.title).toBe("Serviço indisponível");
    expect(result.message).toContain("temporariamente indisponível");
    expect(result.canRetry).toBe(true);
    expect(result.canFallback).toBe(true);
  });

  // --- Network Errors ---
  it("maps network error to connection error", () => {
    const error = new Error("Failed to fetch");
    const result = mapExportError(error, "instantly");
    expect(result.title).toBe("Erro de conexão");
    expect(result.message).toContain("Verifique sua internet");
    expect(result.canRetry).toBe(true);
    expect(result.canFallback).toBe(true);
  });

  it("maps fetch failed to connection error", () => {
    const error = new Error("network error");
    const result = mapExportError(error, "csv");
    expect(result.title).toBe("Erro de conexão");
  });

  // --- Timeout ---
  it("maps timeout error", () => {
    const error = new Error("Request timeout");
    const result = mapExportError(error, "instantly");
    expect(result.title).toBe("Tempo esgotado");
    expect(result.message).toContain("demorou demais");
    expect(result.canRetry).toBe(true);
    expect(result.canFallback).toBe(true);
  });

  // --- Generic Fallback ---
  it("returns generic error for unknown errors", () => {
    const error = new Error("Something weird happened");
    const result = mapExportError(error, "csv");
    expect(result.title).toBe("Erro no export");
    expect(result.message).toContain("Erro inesperado");
    expect(result.canRetry).toBe(true);
    expect(result.canFallback).toBe(true);
  });

  it("returns generic error for string errors", () => {
    const result = mapExportError("some error", "instantly");
    expect(result.title).toBe("Erro no export");
    expect(result.canFallback).toBe(true);
  });

  // --- canFallback always true ---
  it("all errors have canFallback: true", () => {
    const errors = [
      { status: 401 },
      { status: 402 },
      { status: 429 },
      { status: 500 },
      new Error("network error"),
      new Error("timeout"),
      new Error("unknown"),
      "string error",
    ];
    for (const error of errors) {
      const result = mapExportError(error, "instantly");
      expect(result.canFallback).toBe(true);
    }
  });
});
