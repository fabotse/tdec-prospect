/**
 * Story 24.17 — supressao provisoria de contas (account-suppression.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findSuppressedAccounts,
  withAccountNames,
} from "@/lib/agent/account-suppression";

function buildClient(result: { data: unknown; error: unknown } | Error) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    ),
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, from, chain };
}

describe("findSuppressedAccounts", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("suprime a conta com oportunidade meeting_booked pelo dominio do e-mail", async () => {
    const { client, from, chain } = buildClient({
      data: [
        { status: "contacted", lead: { email: "ana@bancox.com.br" } },
        { status: "meeting_booked", lead: { email: "joao@bancox.com.br" } },
        { status: "contacted", lead: { email: "x@outra.com" } },
      ],
      error: null,
    });

    const result = await findSuppressedAccounts(client, "tenant-1", [
      "bancox.com.br",
      "empresay.com",
    ]);

    expect(from).toHaveBeenCalledWith("opportunities");
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(chain.in).toHaveBeenCalledWith("status", ["contacted", "meeting_booked"]);
    expect(result).toEqual([
      {
        name: null,
        domain: "bancox.com.br",
        reason: "negociacao em andamento (oportunidade com reuniao marcada)",
      },
    ]);
  });

  it("motivo 'em contato' para contacted; casa subdominio; lead em array", async () => {
    const { client } = buildClient({
      data: [{ status: "contacted", lead: [{ email: "ana@mail.empresay.com" }] }],
      error: null,
    });

    const result = await findSuppressedAccounts(client, "t", ["empresay.com"]);

    expect(result).toEqual([
      {
        name: null,
        domain: "empresay.com",
        reason: "negociacao em andamento (oportunidade em contato)",
      },
    ]);
  });

  it("ignora e-mail de lead em dominio pessoal (lista exata)", async () => {
    const { client } = buildClient({
      data: [
        { status: "meeting_booked", lead: { email: "joao@gmail.com" } },
        { status: "meeting_booked", lead: { email: "ana@uol.com.br" } },
        { status: "meeting_booked", lead: { email: "bia@aol.com" } },
      ],
      error: null,
    });

    expect(
      await findSuppressedAccounts(client, "t", ["gmail.com", "uol.com.br", "aol.com"])
    ).toEqual([]);
  });

  it("conta-alvo com nome de provedor (uol.com.br) e suprimida por e-mail corporativo", async () => {
    const { client, from } = buildClient({
      data: [{ status: "contacted", lead: { email: "diretor@corp.uol.com.br" } }],
      error: null,
    });

    const result = await findSuppressedAccounts(client, "t", ["uol.com.br"]);

    expect(from).toHaveBeenCalledWith("opportunities");
    expect(result.map((a) => a.domain)).toEqual(["uol.com.br"]);
  });

  it("dominio parecido com provedor nao e tratado como pessoal (terra-agro.com.br)", async () => {
    const { client } = buildClient({
      data: [{ status: "contacted", lead: { email: "x@terra-agro.com.br" } }],
      error: null,
    });
    expect(
      (await findSuppressedAccounts(client, "t", ["terra-agro.com.br"])).map((a) => a.domain)
    ).toEqual(["terra-agro.com.br"]);
  });

  it("lead sem e-mail ou nulo nao suprime", async () => {
    const { client } = buildClient({
      data: [
        { status: "meeting_booked", lead: null },
        { status: "meeting_booked", lead: { email: null } },
      ],
      error: null,
    });
    expect(await findSuppressedAccounts(client, "t", ["bancox.com.br"])).toEqual([]);
  });

  it("erro de leitura -> [] (fail-open)", async () => {
    const { client } = buildClient({ data: null, error: { message: "boom" } });
    expect(await findSuppressedAccounts(client, "t", ["bancox.com.br"])).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("excecao -> [] (fail-open)", async () => {
    const { client } = buildClient(new Error("rede"));
    expect(await findSuppressedAccounts(client, "t", ["bancox.com.br"])).toEqual([]);
  });

  it("sem dominios nao consulta", async () => {
    const { client, from } = buildClient({ data: [], error: null });
    expect(await findSuppressedAccounts(client, "t", [])).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("withAccountNames", () => {
  it("completa o nome pela lista", () => {
    expect(
      withAccountNames(
        [{ name: null, domain: "bancox.com.br", reason: "r" }],
        [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }]
      )
    ).toEqual([{ name: "Banco X", domain: "bancox.com.br", reason: "r" }]);
  });
});
