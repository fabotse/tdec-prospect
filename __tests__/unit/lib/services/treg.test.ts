/**
 * TregService — Story 24.19
 * Sem rede real: `fetch` sempre mockado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TregService, TREG_ENDPOINTS } from "@/lib/services/treg";
import { getService } from "@/lib/services";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const OPTIONS = {
  maxCostUsd: 0.01,
  idempotencyKey: "idem-1",
  meta: "feature=dossie-24-19,tenant=t1,execution=e1",
  timeoutMs: 60_000,
};

describe("TregService", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("esta registrado no factory de servicos com name 'treg'", () => {
    expect(getService("treg")).toBeInstanceOf(TregService);
    expect(new TregService().name).toBe("treg");
  });

  describe("testConnection", () => {
    it("usa GET /orgs com X-Treg-Token (gratuito)", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ orgs: [] }));
      const result = await new TregService().testConnection("tok");
      expect(result.success).toBe(true);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://treg.to/orgs");
      expect(init.method).toBe("GET");
      expect(init.headers["X-Treg-Token"]).toBe("tok");
    });

    it("401 vira mensagem de token invalido", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
      const result = await new TregService().testConnection("bad");
      expect(result.success).toBe(false);
      expect(result.message).toBe("Token do Treg inválido ou expirado.");
    });
  });

  describe("call", () => {
    it("faz POST /call/<id> com os headers obrigatorios e le o custo do header", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ output: { results: [] } }, 200, { "x-treg-cost-micro": "150" })
      );
      const result = await new TregService().call("tok", TREG_ENDPOINTS.webSearch, { q: "x", limit: 10 }, OPTIONS);

      expect(result).toMatchObject({ ok: true, status: 200, costMicro: 150 });
      expect(result.json).toEqual({ output: { results: [] } });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://treg.to/call/treg.web.search");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        "X-Treg-Token": "tok",
        "X-Treg-Route-Max-Cost": "0.01",
        "Idempotency-Key": "idem-1",
        "X-Treg-Meta": "feature=dossie-24-19,tenant=t1,execution=e1",
      });
      expect(JSON.parse(init.body)).toEqual({ q: "x", limit: 10 });
      expect(init.signal).toBeDefined();
    });

    it("sem header de custo, usa _treg.charged_micro do corpo", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [], _treg: { charged_micro: 7000 } }));
      const result = await new TregService().call("tok", TREG_ENDPOINTS.exaSearch, { query: "x" }, OPTIONS);
      expect(result.costMicro).toBe(7000);
    });

    it("HTTP de erro (402 teto) nao lanca: ok=false com status e mensagem", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "route_max_cost" }, 402));
      const result = await new TregService().call("tok", TREG_ENDPOINTS.exaSearch, { query: "x" }, OPTIONS);
      expect(result).toMatchObject({ ok: false, status: 402, costMicro: 0 });
      expect(result.error).toContain("402");
    });

    it("timeout vira ok=false, status 0 e erro 'timeout'", async () => {
      const timeoutError = new Error("aborted");
      timeoutError.name = "TimeoutError";
      fetchMock.mockRejectedValue(timeoutError);
      const result = await new TregService().call("tok", TREG_ENDPOINTS.webExtract, { url: "https://x.com" }, OPTIONS);
      expect(result).toMatchObject({ ok: false, status: 0, costMicro: 0 });
      expect(result.error).toMatch(/^timeout/);
    });

    it("erro de rede vira ok=false, status 0", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      const result = await new TregService().call("tok", TREG_ENDPOINTS.webExtract, { url: "https://x.com" }, OPTIONS);
      expect(result).toMatchObject({ ok: false, status: 0, error: "erro de rede" });
    });

    it("corpo nao-JSON nao lanca", async () => {
      fetchMock.mockResolvedValue(new Response("<html>", { status: 503 }));
      const result = await new TregService().call("tok", TREG_ENDPOINTS.webExtract, { url: "https://x.com" }, OPTIONS);
      expect(result).toMatchObject({ ok: false, status: 503, json: null });
    });
  });
});
