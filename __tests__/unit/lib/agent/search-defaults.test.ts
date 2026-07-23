/**
 * Story 22.6 (FR12) — defaults de qualidade da busca aberta.
 * Testa a single source of truth `resolveDirectSearchCompanySizes`.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_MIN_COMPANY_SIZES,
  QUALITY_MIN_COMPANY_SIZE_LABEL,
  resolveDirectSearchCompanySizes,
} from "@/lib/agent/search-defaults";

describe("search-defaults — resolveDirectSearchCompanySizes", () => {
  it("aplica o piso de qualidade quando companySize é null (AC1)", () => {
    const result = resolveDirectSearchCompanySizes({ companySize: null });

    expect(result.defaultsApplied).toBe(true);
    expect(result.companySizes).toEqual([...QUALITY_MIN_COMPANY_SIZES]);
    // AC1: "1-10" NUNCA está no piso de qualidade (é o raso que queima crédito).
    expect(result.companySizes).not.toContain("1-10");
  });

  it("retorna uma cópia (não a referência da constante) para não vazar mutação", () => {
    const result = resolveDirectSearchCompanySizes({ companySize: null });
    expect(result.companySizes).not.toBe(QUALITY_MIN_COMPANY_SIZES);
  });

  it("faz override TOTAL quando o usuário informa companySize (AC2 é sagrado)", () => {
    const result = resolveDirectSearchCompanySizes({ companySize: "11-50" });

    expect(result.defaultsApplied).toBe(false);
    // Só o valor do usuário; nenhum default é mesclado.
    expect(result.companySizes).toEqual(["11-50"]);
  });

  it("mesmo quando o usuário escolhe justamente '1-10', respeita a escolha dele", () => {
    const result = resolveDirectSearchCompanySizes({ companySize: "1-10" });

    expect(result.defaultsApplied).toBe(false);
    expect(result.companySizes).toEqual(["1-10"]);
  });

  it("expõe o rótulo amigável '11+' para plano/resumo", () => {
    expect(QUALITY_MIN_COMPANY_SIZE_LABEL).toBe("11+");
  });
});
