/**
 * Story 24.15 — industria do briefing -> organization_industries da Apollo.
 */

import { describe, it, expect } from "vitest";
import { resolveApolloIndustries } from "@/lib/agent/apollo-industries";

describe("resolveApolloIndustries", () => {
  it("fintech/financeiro -> financial services + banking", () => {
    expect(resolveApolloIndustries("Fintech")).toEqual(["financial services", "banking"]);
    expect(resolveApolloIndustries("financeiro")).toEqual(["financial services", "banking"]);
  });

  it("normaliza acentos, caixa e espacos", () => {
    expect(resolveApolloIndustries("  Saúde ")).toEqual(["hospital & health care"]);
    expect(resolveApolloIndustries("EDUCAÇÃO")).toEqual([
      "education management",
      "higher education",
      "e-learning",
    ]);
    expect(resolveApolloIndustries("Bancário")).toEqual(["banking"]);
  });

  it("aliases de tecnologia, logistica, juridico e hotelaria", () => {
    const tech = ["information technology & services", "computer software"];
    expect(resolveApolloIndustries("TI")).toEqual(tech);
    expect(resolveApolloIndustries("saas")).toEqual(tech);
    expect(resolveApolloIndustries("software")).toEqual(tech);
    expect(resolveApolloIndustries("transporte")).toEqual([
      "logistics & supply chain",
      "transportation/trucking/railroad",
    ]);
    expect(resolveApolloIndustries("advocacia")).toEqual(["law practice", "legal services"]);
    expect(resolveApolloIndustries("turismo")).toEqual([
      "hospitality",
      "leisure, travel & tourism",
    ]);
  });

  it("devolve uma copia (o mapa nao e mutavel por quem chama)", () => {
    const first = resolveApolloIndustries("varejo");
    first?.push("x");
    expect(resolveApolloIndustries("varejo")).toEqual(["retail"]);
  });

  it("aliases comuns: fintechs, e-commerce, varejista, banco digital", () => {
    expect(resolveApolloIndustries("Fintechs")).toEqual(["financial services", "banking"]);
    expect(resolveApolloIndustries("ecommerce")).toEqual(["retail"]);
    expect(resolveApolloIndustries("E-commerce")).toEqual(["retail"]);
    expect(resolveApolloIndustries("varejista")).toEqual(["retail"]);
    expect(resolveApolloIndustries("Banco Digital")).toEqual(["banking"]);
    expect(resolveApolloIndustries("bancos digitais")).toEqual(["banking"]);
  });

  it("sem correspondencia, vazio ou null -> null", () => {
    expect(resolveApolloIndustries("biotech espacial")).toBeNull();
    expect(resolveApolloIndustries("")).toBeNull();
    expect(resolveApolloIndustries("   ")).toBeNull();
    expect(resolveApolloIndustries(null)).toBeNull();
    expect(resolveApolloIndustries(undefined)).toBeNull();
  });
});
