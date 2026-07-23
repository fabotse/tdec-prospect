/**
 * Unit Tests for service-keys (server-only)
 * Story 22.9 - AC: #2, #4, #5, #6
 *
 * Cobre: leitura via SERVICE-ROLE (papel nao-admin recebe a chave), fail-safe quando
 * a service-role key falta no ambiente (nunca 500), isolamento por tenant_id sempre
 * na query, e nao-vazamento de segredo em log.
 *
 * LIMITE DO MOCK (Trap #3): o mock NAO simula RLS. O que ele prova aqui e que a
 * leitura passa pelo client ADMIN (que bypassa RLS por construcao) e nunca pelo
 * client de sessao. A prova ponta-a-ponta com um `sdr` real e o smoke da Task 5 —
 * e, no nivel de rota, o teste "SDR (RLS zera a leitura de sessao) recebe 200" em
 * briefing-parse.test.ts, onde o client de sessao devolve zero linhas de proposito.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockCreateAdminClient = vi.fn();
const mockDecryptApiKey = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}));

// Import DEPOIS dos vi.mock (hoisted).
import {
  getInjectableServiceApiKey,
  readServiceApiKey,
  getServiceApiKeyOrNull,
  requireServiceApiKey,
} from "@/lib/agent/service-keys";

// ==============================================
// HELPERS
// ==============================================

const TENANT_ID = "tenant-456";

/** Client admin encadeavel: from().select().eq().eq().single() -> mockSingle. */
function buildAdminClient() {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: mockSingle,
  };
  return { from: vi.fn(() => chain), chain };
}

// ==============================================
// TESTS
// ==============================================

describe("service-keys (Story 22.9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockImplementation(() => buildAdminClient());
    mockDecryptApiKey.mockImplementation((key: string) => `decrypted-${key}`);
    mockSingle.mockResolvedValue({ data: { encrypted_key: "enc-123" }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readServiceApiKey - caminho feliz (AC2)", () => {
    it("devolve a chave decriptada lendo pelo client ADMIN (service-role), nao pela sessao", async () => {
      const result = await readServiceApiKey(TENANT_ID, "openai");

      expect(mockCreateAdminClient).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: "ok", apiKey: "decrypted-enc-123" });
      expect(mockDecryptApiKey).toHaveBeenCalledWith("enc-123");
    });

    it("AC4: filtra SEMPRE por tenant_id e service_name (unica barreira de isolamento)", async () => {
      const admin = buildAdminClient();
      mockCreateAdminClient.mockReturnValue(admin);

      await readServiceApiKey(TENANT_ID, "apollo");

      expect(admin.from).toHaveBeenCalledWith("api_configs");
      expect(admin.chain.select).toHaveBeenCalledWith("encrypted_key");
      expect(admin.chain.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID);
      expect(admin.chain.eq).toHaveBeenCalledWith("service_name", "apollo");
    });

    it("a leitura funciona para papel NAO-ADMIN — o helper nao consulta papel algum", async () => {
      // O helper nao recebe nem consulta `role`: quem decide o acesso e a RLS, e o
      // client admin a bypassa por construcao. Este teste cimenta que nao existe
      // gate de papel escondido no caminho da chave (o bug era exatamente esse gate).
      const result = await readServiceApiKey(TENANT_ID, "theirstack");
      expect(result.status).toBe("ok");
    });
  });

  describe("fail-safe (AC4) — nunca 500 novo, nunca vazamento", () => {
    it("service-role key ausente no ambiente (createAdminClient lanca) -> missing", async () => {
      mockCreateAdminClient.mockImplementation(() => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
      });

      await expect(readServiceApiKey(TENANT_ID, "openai")).resolves.toEqual({
        status: "missing",
      });
    });

    it("linha inexistente no tenant -> missing", async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });

      await expect(readServiceApiKey(TENANT_ID, "openai")).resolves.toEqual({
        status: "missing",
      });
    });

    it("erro do supabase (PGRST116 etc.) -> missing", async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

      await expect(readServiceApiKey(TENANT_ID, "openai")).resolves.toEqual({
        status: "missing",
      });
    });

    it("excecao na query (rede/timeout) -> missing, sem propagar", async () => {
      mockSingle.mockRejectedValue(new Error("network down"));

      await expect(readServiceApiKey(TENANT_ID, "openai")).resolves.toEqual({
        status: "missing",
      });
    });

    it("linha com encrypted_key vazio -> missing (nao tenta decriptar)", async () => {
      mockSingle.mockResolvedValue({ data: { encrypted_key: "" }, error: null });

      await expect(readServiceApiKey(TENANT_ID, "openai")).resolves.toEqual({
        status: "missing",
      });
      expect(mockDecryptApiKey).not.toHaveBeenCalled();
    });

    it("chave que DECRIPTA para string vazia -> missing (nao segue como 'ok')", async () => {
      // A guarda anterior so cobria `encrypted_key` vazio. Uma chave que decripta
      // para "" seguiria como `ok` e (a) viraria um 401 opaco na API externa, (b) no
      // Apollo cairia no `if (this.apiKey)` como ausente, voltando para a leitura de
      // SESSAO — o bug que este helper existe para fechar.
      mockDecryptApiKey.mockReturnValue("");

      await expect(readServiceApiKey(TENANT_ID, "openai")).resolves.toEqual({
        status: "missing",
      });
    });

    it("falha de decriptacao -> decrypt_error (distinto de missing, preserva o 500 da rota)", async () => {
      mockDecryptApiKey.mockImplementation(() => {
        throw new Error("Formato de chave criptografada invalido");
      });

      await expect(readServiceApiKey(TENANT_ID, "openai")).resolves.toEqual({
        status: "decrypt_error",
      });
    });

    it("tenantId vazio -> missing E nem chega a consultar (guarda de isolamento)", async () => {
      const result = await readServiceApiKey("", "openai");

      expect(result).toEqual({ status: "missing" });
      expect(mockCreateAdminClient).not.toHaveBeenCalled();
    });

    it("Trap #4: nunca loga a chave crua nem o encrypted_key", async () => {
      mockSingle.mockResolvedValue({
        data: { encrypted_key: "iv:tag:SEGREDO-CIFRADO" },
        error: null,
      });
      mockDecryptApiKey.mockImplementation(() => {
        throw new Error("boom");
      });

      await readServiceApiKey(TENANT_ID, "openai");

      const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
      expect(logged).not.toContain("SEGREDO-CIFRADO");
      expect(logged).not.toContain("iv:tag");
      expect(logged).toContain("openai"); // service_name e permitido (AC4)
    });
  });

  describe("getServiceApiKeyOrNull (fail-open dos callers defensivos)", () => {
    it("devolve a chave quando existe", async () => {
      await expect(getServiceApiKeyOrNull(TENANT_ID, "apify")).resolves.toBe(
        "decrypted-enc-123"
      );
    });

    it("devolve null quando ausente", async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });
      await expect(getServiceApiKeyOrNull(TENANT_ID, "apify")).resolves.toBeNull();
    });

    it("devolve null quando a decriptacao falha (nao propaga excecao)", async () => {
      mockDecryptApiKey.mockImplementation(() => {
        throw new Error("bad key");
      });
      await expect(getServiceApiKeyOrNull(TENANT_ID, "apify")).resolves.toBeNull();
    });
  });

  describe("requireServiceApiKey (contrato de erro preservado)", () => {
    it("devolve a chave quando existe", async () => {
      await expect(requireServiceApiKey(TENANT_ID, "openai", "OpenAI")).resolves.toBe(
        "decrypted-enc-123"
      );
    });

    it("lanca 'API key do X nao configurada' quando ausente (mensagem atual)", async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });

      await expect(
        requireServiceApiKey(TENANT_ID, "instantly", "Instantly")
      ).rejects.toThrow("API key do Instantly nao configurada");
    });

    it("usa o serviceName quando nao ha label", async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });

      await expect(requireServiceApiKey(TENANT_ID, "theirstack")).rejects.toThrow(
        "API key do theirstack nao configurada"
      );
    });

    it("AC4: service-role ausente cai na MESMA mensagem de 'nao configurada' (nao um erro novo)", async () => {
      mockCreateAdminClient.mockImplementation(() => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
      });

      await expect(
        requireServiceApiKey(TENANT_ID, "instantly", "Instantly")
      ).rejects.toThrow("API key do Instantly nao configurada");
    });

    it("erro de decriptacao tem mensagem propria (nao se confunde com 'nao configurada')", async () => {
      mockDecryptApiKey.mockImplementation(() => {
        throw new Error("bad key");
      });

      await expect(requireServiceApiKey(TENANT_ID, "openai", "OpenAI")).rejects.toThrow(
        "Erro ao decriptar a API key do OpenAI"
      );
    });
  });

  describe("getInjectableServiceApiKey (services com leitura propria: Apollo)", () => {
    // POR QUE ESTA VARIANTE: `getServiceApiKeyOrNull` colapsava `missing` e
    // `decrypt_error` em `null`. Nos call sites do Apollo isso fazia uma chave
    // CORROMPIDA ser reportada como "nao configurada" — assimetrico com OpenAI e
    // TheirStack, que preservam o split 422/500. (Code review 22.9, Decision 1.)
    it("devolve a chave quando existe", async () => {
      await expect(getInjectableServiceApiKey(TENANT_ID, "apollo", "Apollo")).resolves.toBe(
        "decrypted-enc-123"
      );
    });

    it("chave ausente -> undefined (o service cai no caminho de hoje, sem lancar)", async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });

      await expect(
        getInjectableServiceApiKey(TENANT_ID, "apollo", "Apollo")
      ).resolves.toBeUndefined();
    });

    it("service-role ausente no ambiente -> undefined (AC4: nunca 500 novo)", async () => {
      mockCreateAdminClient.mockImplementation(() => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
      });

      await expect(
        getInjectableServiceApiKey(TENANT_ID, "apollo", "Apollo")
      ).resolves.toBeUndefined();
    });

    it("chave presente mas NAO decriptavel -> LANCA (nunca vira 'nao configurada')", async () => {
      mockDecryptApiKey.mockImplementation(() => {
        throw new Error("bad key");
      });

      await expect(
        getInjectableServiceApiKey(TENANT_ID, "apollo", "Apollo")
      ).rejects.toThrow("Erro ao decriptar a API key do Apollo");
    });

    it("usa o serviceName na mensagem quando nao ha label", async () => {
      mockDecryptApiKey.mockImplementation(() => {
        throw new Error("bad key");
      });

      await expect(getInjectableServiceApiKey(TENANT_ID, "apollo")).rejects.toThrow(
        "Erro ao decriptar a API key do apollo"
      );
    });
  });
});
