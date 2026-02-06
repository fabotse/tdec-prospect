/**
 * Tests: email_body_generation prompt - Ice Breaker Variable Support
 * Story 9.4: Variável {{ice_breaker}} na Geração de Campanha AI
 *
 * AC #1: When icebreaker is empty, AI is instructed to include {{ice_breaker}} literal
 * AC #1: When icebreaker has content, use it as opening (current behavior)
 * AC #1: FORMATO OBRIGATÓRIO references {{ice_breaker}} as valid placeholder
 */

import { describe, it, expect } from "vitest";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";

/**
 * Simplified template interpolation matching prompt-manager.ts logic
 * Step 1: {{#if var}}...{{else}}...{{/if}} conditional blocks
 * Step 2: {{variable}} simple replacement (preserves unknown variables)
 */
function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  // Step 1: Handle conditional blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, varName, ifContent, elseContent) => {
      const value = variables[varName];
      return value && value.trim() !== "" ? ifContent : (elseContent ?? "");
    }
  );

  // Step 2: Simple variable replacement (preserves unknown vars)
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] ?? match;
  });

  return result;
}

describe("email_body_generation prompt - Ice Breaker Variable", () => {
  const template = CODE_DEFAULT_PROMPTS.email_body_generation.template;

  it("should instruct AI to include {{ice_breaker}} literal when icebreaker is empty", () => {
    const rendered = interpolateTemplate(template, {
      company_context: "Empresa Teste",
      competitive_advantages: "Vantagem 1",
      lead_name: "João",
      lead_title: "CTO",
      lead_company: "Tech Corp",
      lead_industry: "Tecnologia",
      lead_location: "São Paulo",
      icp_summary: "Empresas de tech",
      pain_points: "Escalabilidade",
      tone_description: "Profissional",
      tone_style: "formal",
      writing_guidelines: "",
      email_objective: "Apresentar produto",
      icebreaker: "", // Empty - no lead selected
    });

    // Should contain instruction to use {{ice_breaker}} variable
    expect(rendered).toContain("VARIÁVEL DE PERSONALIZAÇÃO");
    expect(rendered).toContain("{{ice_breaker}}");
    // Should NOT contain the if-branch content
    expect(rendered).not.toContain("QUEBRA-GELO PERSONALIZADO (USE COMO ABERTURA)");
  });

  it("should use real icebreaker content when icebreaker has value", () => {
    const realIcebreaker = "Vi que a Tech Corp expandiu para o mercado internacional recentemente.";
    const rendered = interpolateTemplate(template, {
      company_context: "Empresa Teste",
      competitive_advantages: "Vantagem 1",
      lead_name: "João",
      lead_title: "CTO",
      lead_company: "Tech Corp",
      lead_industry: "Tecnologia",
      lead_location: "São Paulo",
      icp_summary: "Empresas de tech",
      pain_points: "Escalabilidade",
      tone_description: "Profissional",
      tone_style: "formal",
      writing_guidelines: "",
      email_objective: "Apresentar produto",
      icebreaker: realIcebreaker,
    });

    // Should contain the real icebreaker text
    expect(rendered).toContain("QUEBRA-GELO PERSONALIZADO (USE COMO ABERTURA)");
    expect(rendered).toContain(realIcebreaker);
    // Should NOT contain the else-branch content
    expect(rendered).not.toContain("VARIÁVEL DE PERSONALIZAÇÃO");
  });

  it("should reference {{ice_breaker}} in FORMATO OBRIGATÓRIO section", () => {
    // Check the raw template (before interpolation) contains the format reference
    expect(template).toContain("variável {{ice_breaker}} literal");
  });

  it("should preserve {{ice_breaker}} in rendered output (not replaced by template engine)", () => {
    const rendered = interpolateTemplate(template, {
      company_context: "Empresa",
      competitive_advantages: "",
      lead_name: "Ana",
      lead_title: "VP",
      lead_company: "Corp",
      lead_industry: "Saúde",
      lead_location: "RJ",
      icp_summary: "",
      pain_points: "",
      tone_description: "",
      tone_style: "casual",
      writing_guidelines: "",
      email_objective: "Prospecção",
      icebreaker: "", // Empty triggers else branch
    });

    // {{ice_breaker}} should survive interpolation since it's not in variables map
    const matches = rendered.match(/\{\{ice_breaker\}\}/g);
    expect(matches).not.toBeNull();
    // Should appear multiple times (in instruction + rules + format)
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });
});
