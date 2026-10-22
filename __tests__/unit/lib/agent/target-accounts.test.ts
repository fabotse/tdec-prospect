/**
 * Story 24.17 — modo lista de contas: helpers puros (target-accounts.ts).
 */

import { describe, it, expect } from "vitest";
import {
  formatSuppressedAccounts,
  formatSuppressedAccountsShort,
  formatTargetAccounts,
  formatTargetAccountsInput,
  hasUnresolvedAccounts,
  isAccountListMode,
  normalizeDomain,
  parseTargetAccountsInput,
  resolvedAccountDomains,
  sanitizeTargetAccounts,
  unresolvedAccountNames,
} from "@/lib/agent/target-accounts";
import type { TargetAccount } from "@/types/agent";

describe("normalizeDomain", () => {
  it.each([
    ["https://www.bancox.com.br/", "bancox.com.br"],
    ["  EmpresaY.com  ", "empresay.com"],
    ["http://bancox.com.br:8080/contato?x=1#top", "bancox.com.br"],
    ["joao@empresay.com", "empresay.com"],
    ["www.sub.empresa-z.com.br", "sub.empresa-z.com.br"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeDomain(raw)).toBe(expected);
  });

  it.each([["Banco X"], [""], ["localhost"], ["dominio?"], ["a b.com"]])("%s -> null", (raw) => {
    expect(normalizeDomain(raw)).toBeNull();
  });

  it("nao-string -> null", () => {
    expect(normalizeDomain(42)).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
  });
});

describe("sanitizeTargetAccounts", () => {
  it("dominios colados viram high (aparecem no texto do usuario)", () => {
    const text = "CISO em https://www.bancox.com.br/, empresay.com";
    const result = sanitizeTargetAccounts(
      [
        { name: null, domain: "https://www.bancox.com.br/", confidence: "low" },
        { name: null, domain: "empresay.com" },
      ],
      text
    );
    expect(result).toEqual([
      { name: null, domain: "bancox.com.br", confidence: "high" },
      { name: null, domain: "empresay.com", confidence: "high" },
    ]);
  });

  it("dominio deduzido vale a confianca do LLM (default low)", () => {
    const result = sanitizeTargetAccounts(
      [
        { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
        { name: "Banco Z", domain: "bancoz.com.br" },
      ],
      "CISO do Banco X e do Banco Z"
    );
    expect(result.map((a) => a.confidence)).toEqual(["high", "low"]);
  });

  it("match por dominio inteiro: x.com nao vira high por 'bancox.com' nem 'x.com.br'", () => {
    const guess = [{ name: "X", domain: "x.com", confidence: "low" }];
    expect(sanitizeTargetAccounts(guess, "CISO em bancox.com")[0].confidence).toBe("low");
    expect(sanitizeTargetAccounts(guess, "CISO em x.com.br")[0].confidence).toBe("low");
    expect(sanitizeTargetAccounts(guess, "CISO em a.x.com")[0].confidence).toBe("low");
    expect(sanitizeTargetAccounts(guess, "CISO em my-x.com")[0].confidence).toBe("low");
    expect(sanitizeTargetAccounts(guess, "CISO em x.com.")[0].confidence).toBe("high");
    expect(sanitizeTargetAccounts(guess, "contato@x.com e mais")[0].confidence).toBe("high");
    expect(sanitizeTargetAccounts(guess, "veja https://x.com/sobre")[0].confidence).toBe("high");
    expect(sanitizeTargetAccounts(guess, "(x.com)")[0].confidence).toBe("high");
  });

  it("dominio invalido vira null; item sem nome e sem dominio e descartado", () => {
    const result = sanitizeTargetAccounts(
      [
        { name: "Empresa W", domain: "nao sei" },
        { name: "  ", domain: "???" },
        "lixo",
        null,
      ],
      "Empresa W"
    );
    expect(result).toEqual([{ name: "Empresa W", domain: null, confidence: "low" }]);
  });

  it("dedupe por dominio e por nome normalizado; nome com trim e teto de 120", () => {
    const longName = "A".repeat(200);
    const result = sanitizeTargetAccounts(
      [
        { name: "Banco X", domain: "bancox.com.br" },
        { name: "Banco X SA", domain: "www.bancox.com.br" },
        { name: " Ítaú ", domain: null },
        { name: "itau", domain: null },
        { name: longName, domain: null },
      ],
      ""
    );
    expect(result).toHaveLength(3);
    expect(result[1].name).toBe("Ítaú");
    expect(result[2].name).toHaveLength(120);
  });

  it("teto de 50", () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({ name: null, domain: `e${i}.com` }));
    expect(sanitizeTargetAccounts(raw, "")).toHaveLength(50);
  });

  it("nao-array -> []", () => {
    expect(sanitizeTargetAccounts(undefined, "x")).toEqual([]);
    expect(sanitizeTargetAccounts({ name: "x" }, "x")).toEqual([]);
  });
});

describe("isAccountListMode / helpers de resolucao", () => {
  const accounts: TargetAccount[] = [
    { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
    { name: "Empresa W", domain: null, confidence: "low" },
  ];

  it("com contas e fora do fluxo importado", () => {
    expect(isAccountListMode({ targetAccounts: accounts, skipSteps: ["search_companies"] })).toBe(true);
    expect(
      isAccountListMode({ targetAccounts: accounts, skipSteps: ["search_companies", "search_leads"] })
    ).toBe(false);
  });

  it("so suprimidas ainda e modo lista; sem nada nao e", () => {
    expect(
      isAccountListMode({
        targetAccounts: [],
        suppressedAccounts: [{ name: null, domain: "a.com", reason: "x" }],
        skipSteps: [],
      })
    ).toBe(true);
    expect(isAccountListMode({ targetAccounts: null, skipSteps: [] })).toBe(false);
    expect(isAccountListMode(null)).toBe(false);
  });

  it("hasUnresolvedAccounts / resolvedAccountDomains / unresolvedAccountNames", () => {
    expect(hasUnresolvedAccounts(accounts)).toBe(true);
    expect(hasUnresolvedAccounts([accounts[0]])).toBe(false);
    expect(resolvedAccountDomains(accounts)).toEqual(["bancox.com.br"]);
    expect(unresolvedAccountNames(accounts)).toEqual(["Empresa W"]);
  });
});

describe("formatacao", () => {
  const accounts: TargetAccount[] = [
    { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
    { name: null, domain: "empresay.com", confidence: "high" },
    { name: "Banco Z", domain: "bancoz.com.br", confidence: "low" },
    { name: "Empresa W", domain: null, confidence: "low" },
  ];

  it("formatTargetAccounts com marcas", () => {
    expect(formatTargetAccounts(accounts)).toBe(
      "Banco X (bancox.com.br), empresay.com, Banco Z (bancoz.com.br — confirme), Empresa W (dominio?)"
    );
  });

  it("formatTargetAccountsInput: mantem '— confirme' e tira o 'dominio?'", () => {
    expect(formatTargetAccountsInput(accounts)).toBe(
      "Banco X (bancox.com.br), empresay.com, Banco Z (bancoz.com.br — confirme), Empresa W"
    );
    expect(
      formatTargetAccountsInput([{ name: null, domain: "a.com", confidence: "low" }])
    ).toBe("a.com — confirme");
  });

  it("ida e volta do editor preserva a confianca", () => {
    const roundTrip = parseTargetAccountsInput(formatTargetAccountsInput(accounts.slice(0, 3)));
    expect(roundTrip).toEqual({ ok: true, accounts: accounts.slice(0, 3) });
  });

  it("suprimidas", () => {
    const suppressed = [{ name: "Banco X", domain: "bancox.com.br", reason: "motivo" }];
    expect(formatSuppressedAccounts(suppressed)).toBe("Banco X (bancox.com.br) — motivo");
    expect(formatSuppressedAccountsShort(suppressed)).toBe("Banco X (motivo)");
  });
});

describe("parseTargetAccountsInput", () => {
  it("dominio e Nome (dominio) -> contas high", () => {
    expect(parseTargetAccountsInput("Banco X (bancox.com.br), empresay.com")).toEqual({
      ok: true,
      accounts: [
        { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
        { name: null, domain: "empresay.com", confidence: "high" },
      ],
    });
  });

  it("marca de confirme ainda presente -> low; sem a marca -> high", () => {
    expect(parseTargetAccountsInput("Banco Z (bancoz.com.br — confirme), a.com - confirme")).toEqual({
      ok: true,
      accounts: [
        { name: "Banco Z", domain: "bancoz.com.br", confidence: "low" },
        { name: null, domain: "a.com", confidence: "low" },
      ],
    });
    expect(parseTargetAccountsInput("Banco Z (bancoz.com.br)")).toEqual({
      ok: true,
      accounts: [{ name: "Banco Z", domain: "bancoz.com.br", confidence: "high" }],
    });
  });

  it("nome sozinho -> erro inline", () => {
    expect(parseTargetAccountsInput("Banco X")).toEqual({
      ok: false,
      error: "Informe o dominio de: Banco X (ex.: Banco X (empresa.com.br))",
    });
  });

  it("vazio -> erro", () => {
    const result = parseTargetAccountsInput("  ,  ");
    expect(result.ok).toBe(false);
  });
});
