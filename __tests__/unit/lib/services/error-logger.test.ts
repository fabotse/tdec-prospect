/**
 * Tests for error-logger
 * Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual
 *
 * Matriz SEGREDO_NA_MSG, truncagem em 500, insert em error_logs, nunca lança.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
const mockCreateAdminClient = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

import {
  sanitizeErrorMessage,
  logServerError,
  ERROR_MESSAGE_MAX_LENGTH,
} from "@/lib/services/error-logger";

describe("sanitizeErrorMessage (SEGREDO_NA_MSG)", () => {
  it("remove Bearer token (JWT)", () => {
    const out = sanitizeErrorMessage(
      "401 calling API with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123"
    );
    expect(out).not.toContain("eyJ");
    expect(out).toContain("Bearer [redacted]");
  });

  it("remove JWT solto", () => {
    const out = sanitizeErrorMessage("token inválido eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig");
    expect(out).not.toContain("eyJ");
    expect(out).toContain("[redacted]");
  });

  it("remove api_key=..., token: ..., password=...", () => {
    const out = sanitizeErrorMessage(
      'falhou api_key=abc123 e "token": "xyz789" e password=hunter2 e apiKey: k-1'
    );
    expect(out).not.toMatch(/abc123|xyz789|hunter2|k-1/);
    expect(out).toContain("api_key=[redacted]");
    expect(out).toContain("password=[redacted]");
  });

  it("remove chaves com prefixo sk-", () => {
    const out = sanitizeErrorMessage("OpenAI rejected sk-proj-abcdefghijklmnop1234");
    expect(out).not.toContain("abcdefghijklmnop1234");
  });

  it("troca e-mail por [email]", () => {
    expect(sanitizeErrorMessage("lead joao@x.com não encontrado")).toBe(
      "lead [email] não encontrado"
    );
  });

  it("troca telefone por [telefone]", () => {
    expect(sanitizeErrorMessage("WhatsApp para +55 11 99999-8888 falhou")).toBe(
      "WhatsApp para [telefone] falhou"
    );
    expect(sanitizeErrorMessage("ligar (11) 99999-8888")).toBe("ligar [telefone]");
  });

  it("troca CPF por [cpf] e CNPJ por [cnpj]", () => {
    expect(sanitizeErrorMessage("lead com CPF 123.456.789-00 duplicado")).toBe(
      "lead com CPF [cpf] duplicado"
    );
    expect(sanitizeErrorMessage("empresa 12.345.678/0001-90 sem dono")).toBe(
      "empresa [cnpj] sem dono"
    );
  });

  it("remove query string de URL", () => {
    const out = sanitizeErrorMessage("fetch https://x.com/api/v1?token=1&email=a falhou");
    expect(out).toBe("fetch https://x.com/api/v1?[redacted] falhou");
  });

  it("não estraga UUIDs, decimais e números curtos", () => {
    const msg =
      "execução 550e8400-e29b-41d4-a716-446655440000 timeout of 5000 ms (5003.042000 ms), status 500";
    expect(sanitizeErrorMessage(msg)).toBe(msg);
  });

  it("aceita Error, objeto e vazio", () => {
    expect(sanitizeErrorMessage(new Error("boom"))).toBe("boom");
    expect(sanitizeErrorMessage({ code: "X" })).toBe('{"code":"X"}');
    expect(sanitizeErrorMessage(undefined)).toBe("Erro sem mensagem");
    expect(sanitizeErrorMessage("   ")).toBe("Erro sem mensagem");
  });

  it("trunca em 500 caracteres", () => {
    const out = sanitizeErrorMessage("a".repeat(2000));
    expect(out).toHaveLength(ERROR_MESSAGE_MAX_LENGTH);
    expect(ERROR_MESSAGE_MAX_LENGTH).toBe(500);
  });
});

describe("logServerError", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("insere a linha sanitizada em error_logs e mantém o console.error", async () => {
    const err = new Error("falha para joao@x.com com api_key=abc");
    await logServerError({ source: "api", route: "/api/x", error: err, tenantId: "t-1" });

    expect(mockFrom).toHaveBeenCalledWith("error_logs");
    expect(mockInsert).toHaveBeenCalledWith({
      tenant_id: "t-1",
      source: "api",
      route: "/api/x",
      message: "falha para [email] com api_key=[redacted]",
    });
    expect(errorSpy).toHaveBeenCalledWith("[api] /api/x:", err);
  });

  it("tenant ausente vira null", async () => {
    await logServerError({ source: "cron", route: "/api/c", error: "x" });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: null }));
  });

  it("TABELA_AUSENTE: erro do insert é engolido (só console.error)", async () => {
    mockInsert.mockResolvedValue({
      error: { message: 'relation "public.error_logs" does not exist' },
    });
    await expect(
      logServerError({ source: "server", route: "/page", error: "x" })
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[error-logger] Falha ao gravar error_logs:",
      'relation "public.error_logs" does not exist'
    );
  });

  it("nunca lança: sem service key / insert que rejeita", async () => {
    mockCreateAdminClient.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    });
    await expect(
      logServerError({ source: "api", route: "/a", error: "x" })
    ).resolves.toBeUndefined();

    mockInsert.mockRejectedValueOnce(new Error("network"));
    await expect(
      logServerError({ source: "api", route: "/a", error: "x" })
    ).resolves.toBeUndefined();
  });
});
