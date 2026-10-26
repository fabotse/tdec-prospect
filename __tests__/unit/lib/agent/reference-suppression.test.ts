/**
 * Story 24.18 — leituras fail-open da Lista de Supressao (23.5).
 */

import { describe, it, expect, vi } from "vitest";
import {
  readSuppressedDomains,
  readSuppressionListClients,
} from "@/lib/agent/reference-suppression";

function client(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "range"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return { supabase: { from: vi.fn(() => chain) } as never, calls };
}

describe("readSuppressionListClients", () => {
  it("le os 5 dominios mais recentes com motivo cliente", async () => {
    const { supabase, calls } = client({
      data: [{ value: "BancoX.com.br" }, { value: "bancox.com.br" }, { value: "segz.com.br" }],
      error: null,
    });

    const accounts = await readSuppressionListClients(supabase, "t1");

    expect(accounts).toEqual([
      { name: null, domain: "bancox.com.br", confidence: "high" },
      { name: null, domain: "segz.com.br", confidence: "high" },
    ]);
    expect(calls).toContainEqual(["eq", ["reason", "cliente"]]);
    expect(calls).toContainEqual(["eq", ["entry_type", "domain"]]);
    expect(calls).toContainEqual(["limit", [5]]);
  });

  it("tabela ausente: lista vazia", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = client({ data: null, error: { code: "42P01" } });
    await expect(readSuppressionListClients(supabase, "t1")).resolves.toEqual([]);
    warn.mockRestore();
  });
});

describe("readSuppressedDomains", () => {
  it("todos os dominios, qualquer motivo", async () => {
    const { supabase } = client({
      data: [{ value: "a.com" }, { value: "b.com.br" }, { value: "invalido" }],
      error: null,
    });
    await expect(readSuppressedDomains(supabase, "t1")).resolves.toEqual(["a.com", "b.com.br"]);
  });

  it("erro de leitura: nada suprimido", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase } = client({ data: null, error: { code: "PGRST205" } });
    await expect(readSuppressedDomains(supabase, "t1")).resolves.toEqual([]);
    warn.mockRestore();
  });
});
