/**
 * Unit Tests for BriefingSuggestionService
 * Story 17.8 - AC: #2
 *
 * Tests: technology→jobTitles, industry→jobTitles, industry→technology,
 *        fallback generico, combinacao tech+industry
 */

import { describe, it, expect } from "vitest";
import {
  BriefingSuggestionService,
  TECH_TO_TITLES,
  INDUSTRY_TO_TITLES,
  INDUSTRY_TO_TECH,
  DEFAULT_JOB_TITLES,
  normalizeKey,
} from "@/lib/agent/briefing-suggestion-service";
import type { ParsedBriefing } from "@/types/agent";

// ==============================================
// HELPERS
// ==============================================

function createBriefing(overrides: Partial<ParsedBriefing> = {}): ParsedBriefing {
  return {
    technology: null,
    jobTitles: [],
    location: null,
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: [],
    ...overrides,
  };
}

// ==============================================
// TESTS
// ==============================================

describe("BriefingSuggestionService", () => {
  // 6.1: technology → jobTitles mapping retorna sugestoes corretas
  it("deve sugerir jobTitles baseado em technology (6.1)", () => {
    const briefing = createBriefing({ technology: "Netskope" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(TECH_TO_TITLES["netskope"]);
    expect(suggestions.jobTitles).toContain("CISO");
  });

  // 6.2: industry → jobTitles mapping retorna sugestoes corretas
  it("deve sugerir jobTitles baseado em industry quando technology ausente (6.2)", () => {
    const briefing = createBriefing({ industry: "fintech" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(INDUSTRY_TO_TITLES["fintech"]);
    expect(suggestions.jobTitles).toContain("CTO");
  });

  // 6.3: industry → technology mapping retorna sugestoes corretas
  it("deve sugerir technology baseado em industry (6.3)", () => {
    const briefing = createBriefing({ industry: "fintech" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.technology).toEqual(INDUSTRY_TO_TECH["fintech"]);
    expect(suggestions.technology).toContain("Stripe");
  });

  // 6.4: fallback generico quando nenhum contexto disponivel
  it("deve retornar DEFAULT_JOB_TITLES quando nenhum contexto disponivel (6.4)", () => {
    const briefing = createBriefing();
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(DEFAULT_JOB_TITLES);
    expect(suggestions.technology).toBeUndefined();
  });

  // 6.5: combinacao de technology + industry gera sugestoes refinadas
  it("deve gerar sugestoes refinadas combinando technology + industry (6.5)", () => {
    const briefing = createBriefing({ technology: "Salesforce", industry: "fintech" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    // Deve ter titulos de ambos os mapeamentos (merged, sem duplicatas)
    expect(suggestions.jobTitles).toBeDefined();
    // Salesforce titles
    expect(suggestions.jobTitles).toContain("Head de Vendas");
    // Fintech titles (merged)
    expect(suggestions.jobTitles).toContain("CTO");
    // Max 6 sugestoes
    expect(suggestions.jobTitles.length).toBeLessThanOrEqual(6);
  });

  it("nao deve sugerir jobTitles quando jobTitles ja preenchido", () => {
    const briefing = createBriefing({ technology: "Netskope", jobTitles: ["CTO"] });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toBeUndefined();
  });

  it("nao deve sugerir technology quando technology ja preenchida", () => {
    const briefing = createBriefing({ technology: "AWS", industry: "fintech" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.technology).toBeUndefined();
  });

  it("deve lidar com technology case-insensitive", () => {
    const briefing = createBriefing({ technology: "SALESFORCE" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(TECH_TO_TITLES["salesforce"]);
  });

  it("deve lidar com industry case-insensitive", () => {
    const briefing = createBriefing({ industry: "Saude" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(INDUSTRY_TO_TITLES["saude"]);
    expect(suggestions.technology).toEqual(INDUSTRY_TO_TECH["saude"]);
  });

  it("deve retornar fallback quando technology desconhecida e sem industry", () => {
    const briefing = createBriefing({ technology: "UnknownTech123" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    // Technology is present so no technology suggestion
    expect(suggestions.technology).toBeUndefined();
    // Unknown tech so falls to default
    expect(suggestions.jobTitles).toEqual(DEFAULT_JOB_TITLES);
  });

  // M2 fix: diacritics normalization
  it("deve lidar com industry com acentos (ex: 'saúde' → 'saude')", () => {
    const briefing = createBriefing({ industry: "saúde" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(INDUSTRY_TO_TITLES["saude"]);
    expect(suggestions.technology).toEqual(INDUSTRY_TO_TECH["saude"]);
  });

  it("deve lidar com technology com acentos e maiusculas", () => {
    const briefing = createBriefing({ technology: "Salesförce" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    // "salesförce" normalizes to "salesforce" after NFD strip
    expect(suggestions.jobTitles).toEqual(TECH_TO_TITLES["salesforce"]);
  });

  // L3 fix: industry aliases
  it("deve resolver alias 'healthcare' → 'saude'", () => {
    const briefing = createBriefing({ industry: "healthcare" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(INDUSTRY_TO_TITLES["saude"]);
    expect(suggestions.technology).toEqual(INDUSTRY_TO_TECH["saude"]);
  });

  it("deve resolver alias 'financial services' → 'fintech'", () => {
    const briefing = createBriefing({ industry: "financial services" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(INDUSTRY_TO_TITLES["fintech"]);
  });

  it("deve resolver alias 'telecom' → 'telecomunicacoes'", () => {
    const briefing = createBriefing({ industry: "telecom" });
    const suggestions = BriefingSuggestionService.generateSuggestions(briefing);

    expect(suggestions.jobTitles).toEqual(INDUSTRY_TO_TITLES["telecomunicacoes"]);
  });

  // normalizeKey unit tests
  it("normalizeKey deve strip diacriticos e lowercase", () => {
    expect(normalizeKey("Saúde")).toBe("saude");
    expect(normalizeKey("Educação")).toBe("educacao");
    expect(normalizeKey("FINTECH")).toBe("fintech");
    expect(normalizeKey("Logística")).toBe("logistica");
  });

  it("normalizeKey deve retornar string vazia para input vazio", () => {
    expect(normalizeKey("")).toBe("");
  });
});
