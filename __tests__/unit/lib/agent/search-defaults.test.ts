/**
 * Story 22.6 (FR12) — defaults de qualidade da busca aberta.
 * Testa a single source of truth `resolveDirectSearchCompanySizes`.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_MIN_COMPANY_SIZES,
  QUALITY_MIN_COMPANY_SIZE_LABEL,
  buildDirectSearchFilters,
  formatCompanySizesLabel,
  hasSearchLocation,
  resolveDirectSearchCompanySizes,
  resolveSearchLocations,
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

// ==============================================
// Story 24.14 — defaults do ICP
// ==============================================

describe("search-defaults — Story 24.14 (ICP)", () => {
  const icpDefaults = { companySizes: ["201-500", "501-1000"], locations: ["SP"] };

  it("source 'user' quando o usuario informa o porte (vence o ICP)", () => {
    const result = resolveDirectSearchCompanySizes({ companySize: "51-200", icpDefaults });
    expect(result).toEqual({ companySizes: ["51-200"], defaultsApplied: false, source: "user" });
  });

  it("source 'icp' sem porte do usuario e com faixas do ICP — substitui o piso", () => {
    const result = resolveDirectSearchCompanySizes({ companySize: null, icpDefaults });
    expect(result).toEqual({
      companySizes: ["201-500", "501-1000"],
      defaultsApplied: false,
      source: "icp",
    });
  });

  it("source 'quality' sem ICP ou com faixas do ICP vazias (identico ao de hoje)", () => {
    expect(resolveDirectSearchCompanySizes({ companySize: null }).source).toBe("quality");
    const empty = resolveDirectSearchCompanySizes({
      companySize: null,
      icpDefaults: { companySizes: [], locations: ["SP"] },
    });
    expect(empty.source).toBe("quality");
    expect(empty.defaultsApplied).toBe(true);
  });

  it("resolveSearchLocations: usuario vence; senao ICP; senao vazio", () => {
    expect(resolveSearchLocations({ location: "RJ", icpDefaults })).toEqual({
      locations: ["RJ"],
      fromIcp: false,
    });
    expect(resolveSearchLocations({ location: null, icpDefaults })).toEqual({
      locations: ["SP"],
      fromIcp: true,
    });
    expect(resolveSearchLocations({ location: null })).toEqual({ locations: [], fromIcp: false });
  });

  it("hasSearchLocation considera o local do ICP", () => {
    expect(hasSearchLocation({ location: null, icpDefaults })).toBe(true);
    expect(hasSearchLocation({ location: null, icpDefaults: null })).toBe(false);
    expect(hasSearchLocation({ location: "SP" })).toBe(true);
  });

  it("buildDirectSearchFilters usa faixas e locais do ICP quando o usuario nao informa", () => {
    const filters = buildDirectSearchFilters(
      { jobTitles: ["CISO"], location: null, industry: null, companySize: null, icpDefaults },
      25
    );
    expect(filters.companySizes).toEqual(["201-500", "501-1000"]);
    expect(filters.locations).toEqual(["SP"]);
  });

  it("buildDirectSearchFilters sem ICP fica identico (piso 11+ e sem locations)", () => {
    const filters = buildDirectSearchFilters(
      { jobTitles: ["CISO"], location: null, industry: null, companySize: null },
      25
    );
    expect(filters.companySizes).toEqual([...QUALITY_MIN_COMPANY_SIZES]);
    expect(filters).not.toHaveProperty("locations");
  });

  it("formatCompanySizesLabel: contiguas viram intervalo com travessao", () => {
    expect(formatCompanySizesLabel(["201-500", "501-1000"])).toBe("201–1000");
  });

  it("formatCompanySizesLabel: faixa aberta no fim vira 'N+'", () => {
    expect(
      formatCompanySizesLabel(["501-1000", "1001-5000", "5001-10000", "10001+"])
    ).toBe("501+");
  });

  it("formatCompanySizesLabel: nao contiguas juntadas com ', '", () => {
    expect(formatCompanySizesLabel(["11-50", "501-1000"])).toBe("11–50, 501–1000");
  });

  it("formatCompanySizesLabel: ordena e ignora duplicatas", () => {
    expect(formatCompanySizesLabel(["501-1000", "201-500", "201-500"])).toBe("201–1000");
  });
});
