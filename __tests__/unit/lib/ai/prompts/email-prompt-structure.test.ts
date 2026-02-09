/**
 * Tests: Email prompt structure validation
 * Story 9.5: Estrutura Clara nos Prompts de Geração de Email de Campanha
 *
 * AC #1: First email follows explicit block structure
 * AC #2: Follow-up emails follow simplified structure
 * AC #3: Sequential context passing validated
 * AC #4: Tests validate prompt structure and behavior
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

// ============================================
// AC #1: email_body_generation block structure
// ============================================

describe("email_body_generation prompt - Block Structure (AC #1)", () => {
  const template = CODE_DEFAULT_PROMPTS.email_body_generation.template;

  it("should contain [SAUDAÇÃO] section marker", () => {
    expect(template).toContain("[SAUDAÇÃO]");
  });

  it("should contain [QUEBRA-GELO] section marker", () => {
    expect(template).toContain("[QUEBRA-GELO]");
  });

  it("should contain [TRANSIÇÃO] section marker", () => {
    expect(template).toContain("[TRANSIÇÃO]");
  });

  it("should contain [CONTEÚDO PRODUTO] section marker", () => {
    expect(template).toContain("[CONTEÚDO PRODUTO]");
  });

  it("should contain [CTA] section marker", () => {
    expect(template).toContain("[CTA]");
  });

  it("should contain [FECHAMENTO] section marker", () => {
    expect(template).toContain("[FECHAMENTO]");
  });

  it("should have blocks in correct order: SAUDAÇÃO → QUEBRA-GELO → TRANSIÇÃO → CONTEÚDO → CTA → FECHAMENTO", () => {
    const saudacaoIdx = template.indexOf("[SAUDAÇÃO]");
    const quebraGeloIdx = template.indexOf("[QUEBRA-GELO]");
    const transicaoIdx = template.indexOf("[TRANSIÇÃO]");
    const conteudoIdx = template.indexOf("[CONTEÚDO PRODUTO]");
    const ctaIdx = template.indexOf("[CTA]");
    const fechamentoIdx = template.indexOf("[FECHAMENTO]");

    expect(saudacaoIdx).toBeLessThan(quebraGeloIdx);
    expect(quebraGeloIdx).toBeLessThan(transicaoIdx);
    expect(transicaoIdx).toBeLessThan(conteudoIdx);
    expect(conteudoIdx).toBeLessThan(ctaIdx);
    expect(ctaIdx).toBeLessThan(fechamentoIdx);
  });

  it("should have per-block rules with actual instructions (not just filler)", () => {
    const estruturaStart = template.indexOf("ESTRUTURA OBRIGATÓRIA");
    const structureSection = template.slice(estruturaStart);

    const saudacaoSection = structureSection.slice(
      structureSection.indexOf("[SAUDAÇÃO]"),
      structureSection.indexOf("[QUEBRA-GELO]")
    );
    const quebraGeloSection = structureSection.slice(
      structureSection.indexOf("[QUEBRA-GELO]"),
      structureSection.indexOf("[TRANSIÇÃO]")
    );
    const transicaoSection = structureSection.slice(
      structureSection.indexOf("[TRANSIÇÃO]"),
      structureSection.indexOf("[CONTEÚDO PRODUTO]")
    );
    const conteudoSection = structureSection.slice(
      structureSection.indexOf("[CONTEÚDO PRODUTO]"),
      structureSection.indexOf("[CTA]")
    );
    const ctaSection = structureSection.slice(
      structureSection.indexOf("[CTA]"),
      structureSection.indexOf("[FECHAMENTO]")
    );
    const fechamentoSection = structureSection.slice(
      structureSection.indexOf("[FECHAMENTO]")
    );

    // Each section must contain bullet-point rules (lines starting with "- ")
    expect(saudacaoSection).toMatch(/^- .+/m);
    expect(quebraGeloSection).toMatch(/^- .+/m);
    expect(transicaoSection).toMatch(/^- .+/m);
    expect(conteudoSection).toMatch(/^- .+/m);
    expect(ctaSection).toMatch(/^- .+/m);
    expect(fechamentoSection).toMatch(/^- .+/m);
  });
});

// ============================================
// AC #2: follow_up_email_generation block structure
// ============================================

describe("follow_up_email_generation prompt - Block Structure (AC #2)", () => {
  const template = CODE_DEFAULT_PROMPTS.follow_up_email_generation.template;

  it("should contain numbered structure with Saudação, Conteúdo, CTA, Fechamento", () => {
    expect(template).toMatch(/saudação/i);
    expect(template).toMatch(/conteúdo/i);
    expect(template).toMatch(/CTA/);
    expect(template).toMatch(/fechamento/i);
  });

  it("should have structure items in correct order", () => {
    const estruturaStart = template.indexOf("ESTRUTURA");
    const structureSection = template.slice(estruturaStart);

    const saudacaoIdx = structureSection.search(/saudação/i);
    const conteudoIdx = structureSection.search(/conteúdo/i);
    const ctaIdx = structureSection.indexOf("CTA");
    const fechamentoIdx = structureSection.search(/fechamento/i);

    expect(saudacaoIdx).toBeLessThan(conteudoIdx);
    expect(conteudoIdx).toBeLessThan(ctaIdx);
    expect(ctaIdx).toBeLessThan(fechamentoIdx);
  });

  it("should NOT include Ice Breaker section (AC #2 explicit rule)", () => {
    expect(template).toContain("NÃO inclua Ice Breaker");
  });

  it("should use {{follow_up_strategy}} variable for strategy selection", () => {
    expect(template).toContain("{{follow_up_strategy}}");
    expect(template).toMatch(/ESTRATÉGIA OBRIGATÓRIA/i);
  });

  it("should contain banned phrases list to prevent repetitive outputs", () => {
    expect(template).toContain("Dando continuidade");
    expect(template).toContain("FRASES PROIBIDAS");
  });
});

// ============================================
// AC #3: Sequential context passing
// ============================================

describe("follow_up_email_generation prompt - Sequential Context (AC #3)", () => {
  const template = CODE_DEFAULT_PROMPTS.follow_up_email_generation.template;

  it("should reference previous_email_subject variable", () => {
    expect(template).toContain("{{previous_email_subject}}");
  });

  it("should reference previous_email_body variable", () => {
    expect(template).toContain("{{previous_email_body}}");
  });

  it("should instruct not to repeat information from previous email", () => {
    expect(template).toMatch(/[Nn]ÃO repita|anti.?repetição|não repetir/i);
  });

  it("should instruct not to copy structure from previous email", () => {
    expect(template).toMatch(/NÃO copie a estrutura|ângulo.*(novo|diferente)/i);
  });
});

// ============================================
// AC #4: Regression tests - conditionals still work
// ============================================

describe("email_body_generation prompt - Conditional Regression (AC #4)", () => {
  const template = CODE_DEFAULT_PROMPTS.email_body_generation.template;

  it("should contain icebreaker conditional block", () => {
    expect(template).toContain("{{#if icebreaker}}");
    expect(template).toContain("{{/if}}");
  });

  it("should contain product_name conditional block", () => {
    expect(template).toContain("{{#if product_name}}");
  });

  it("should contain successful_examples conditional block", () => {
    expect(template).toContain("{{#if successful_examples}}");
  });

  it("should preserve {{ice_breaker}} literal in rendered output (Story 9.4 regression)", () => {
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
      icebreaker: "",
    });

    // {{ice_breaker}} should survive interpolation (not in variables map)
    const matches = rendered.match(/\{\{ice_breaker\}\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });

  it("should render icebreaker if-branch when icebreaker has value", () => {
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
      icebreaker: "Parabéns pela expansão da Corp!",
    });

    expect(rendered).toContain("Parabéns pela expansão da Corp!");
    expect(rendered).not.toContain("VARIÁVEL DE PERSONALIZAÇÃO");
  });

  it("should render product block when product_name is provided", () => {
    const rendered = interpolateTemplate(template, {
      company_context: "Empresa",
      competitive_advantages: "",
      product_name: "ProspectAI",
      product_description: "Ferramenta de prospecção",
      product_features: "IA, automação",
      product_differentials: "Único no mercado",
      product_target_audience: "B2B SaaS",
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
      icebreaker: "",
    });

    expect(rendered).toContain("ProspectAI");
    expect(rendered).toContain("PRODUTO EM FOCO");
  });
});

describe("follow_up_email_generation prompt - Conditional Regression (AC #4)", () => {
  const template = CODE_DEFAULT_PROMPTS.follow_up_email_generation.template;

  it("should contain product_name conditional block", () => {
    expect(template).toContain("{{#if product_name}}");
  });

  it("should contain successful_examples conditional block", () => {
    expect(template).toContain("{{#if successful_examples}}");
  });

  it("should use {{follow_up_strategy}} for strategy injection", () => {
    expect(template).toContain("{{follow_up_strategy}}");
  });
});
