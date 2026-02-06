/**
 * Story 9.3: Refatoracao dos Prompts de Ice Breaker
 *
 * Tests for the refactored icebreaker_generation prompt template
 * and expanded ICEBREAKER_CATEGORY_INSTRUCTIONS.
 *
 * AC #1-#3: Category-specific prompt focus
 * AC #4: Examples hierarchy (IB > Email > fallback)
 * AC #5: Blacklist of generic phrases
 *
 * Code review fix: Added rendering tests (5.2/5.3) and removed
 * nested {{#if}} assertions (template engine is single-pass).
 */

import { describe, it, expect } from "vitest";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";
import { ICEBREAKER_CATEGORY_INSTRUCTIONS } from "@/types/ai-prompt";

// ==============================================
// Helper: mirrors interpolateTemplate from prompt-manager.ts
// ==============================================

function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  // Step 1: Handle conditional blocks (same regex as prompt-manager.ts)
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, varName: string, ifContent: string, elseContent?: string) => {
      const value = variables[varName];
      return value && value.trim() !== "" ? ifContent : (elseContent ?? "");
    }
  );

  // Step 2: Handle simple variable replacement
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
    return variables[varName] ?? match;
  });

  return result;
}

// ==============================================
// 5.1: Prompt template content tests
// ==============================================

describe("Story 9.3: icebreaker_generation prompt template", () => {
  const template = CODE_DEFAULT_PROMPTS.icebreaker_generation.template;

  it("contains expanded blacklist of generic phrases (AC #5)", () => {
    expect(template).toContain("Vi que você é ativo no LinkedIn");
    expect(template).toContain("Tenho acompanhado seus posts");
    expect(template).toContain("Parabéns pelos seus conteúdos");
    expect(template).toContain("Notei que você");
    expect(template).toContain("Percebi que você");
    expect(template).toContain("Vi no seu perfil que");
    expect(template).toContain("Olá {{lead_name}}, espero que esteja bem");
    expect(template).toContain("Olá {{lead_name}}, tudo bem?");
    expect(template).toContain("este prompt NÃO tem acesso a posts reais");
  });

  it("places icebreaker_examples block BEFORE rules section (AC #4)", () => {
    const ibExamplesIndex = template.indexOf("EXEMPLOS DE ICE BREAKERS DE REFERÊNCIA");
    const rulesIndex = template.indexOf("REGRAS OBRIGATÓRIAS:");

    expect(ibExamplesIndex).toBeGreaterThan(-1);
    expect(rulesIndex).toBeGreaterThan(-1);
    expect(ibExamplesIndex).toBeLessThan(rulesIndex);
  });

  it("uses sequential example blocks with IB before email (AC #4)", () => {
    const ibBlock = "{{#if icebreaker_examples}}";
    const emailBlock = "{{#if successful_examples}}";
    const ifEnd = "{{/if}}";

    const ibIndex = template.indexOf(ibBlock);
    const emailIndex = template.indexOf(emailBlock);

    // Both blocks exist
    expect(ibIndex).toBeGreaterThan(-1);
    expect(emailIndex).toBeGreaterThan(-1);

    // IB examples come before email examples
    expect(ibIndex).toBeLessThan(emailIndex);

    // IB block closes before email block starts (sequential, not nested)
    const ibEndIndex = template.indexOf(ifEnd, ibIndex);
    expect(ibEndIndex).toBeLessThan(emailIndex);

    // Priority instruction exists
    expect(template).toContain("PRIORIDADE MÁXIMA");
  });

  it("emphasizes REAL DATA usage for lead profile", () => {
    expect(template).toContain("DADOS REAIS — USE-OS OBRIGATORIAMENTE");
    expect(template).toContain("NUNCA invente informações ou use placeholders genéricos");
  });

  it("contains fallback examples with Lead-specific approach", () => {
    expect(template).toContain("ABORDAGENS EFICAZES POR CONTEXTO");
    expect(template).toContain("use APENAS se nenhum exemplo");
    expect(template).toContain("Oportunidade de negócio:");
    expect(template).toContain("Trajetória profissional:");
    expect(template).toContain("Desafio do cargo:");
    expect(template).toContain("Crescimento da empresa:");
  });

  it("reinforces category focus in rules section", () => {
    expect(template).toContain("SIGA O FOCO DA CATEGORIA indicado acima");
    expect(template).toContain("ÂNGULO OBRIGATÓRIO DO QUEBRA-GELO");
    expect(template).toContain("Siga RIGOROSAMENTE o foco da categoria acima");
  });

  it("preserves all required template variables", () => {
    const requiredVars = [
      "{{company_context}}",
      "{{competitive_advantages}}",
      "{{product_name}}",
      "{{lead_name}}",
      "{{lead_title}}",
      "{{lead_company}}",
      "{{lead_industry}}",
      "{{lead_location}}",
      "{{tone_description}}",
      "{{tone_style}}",
      "{{writing_guidelines}}",
      "{{category_instructions}}",
      "{{icebreaker_examples}}",
      "{{successful_examples}}",
    ];

    for (const v of requiredVars) {
      expect(template).toContain(v);
    }
  });
});

// ==============================================
// 5.2/5.3: Template rendering behavior tests
// ==============================================

describe("Story 9.3: Template rendering (no leaked syntax)", () => {
  const template = CODE_DEFAULT_PROMPTS.icebreaker_generation.template;

  const baseVars: Record<string, string> = {
    company_context: "TechCorp - Empresa de tecnologia",
    competitive_advantages: "IA avançada",
    product_name: "",
    product_description: "",
    product_differentials: "",
    product_target_audience: "",
    products_services: "Plataforma de vendas",
    lead_name: "João Silva",
    lead_title: "CTO",
    lead_company: "MegaCorp",
    lead_industry: "Tecnologia",
    lead_location: "",
    tone_description: "Profissional e amigável",
    tone_style: "casual",
    writing_guidelines: "",
    category_instructions: ICEBREAKER_CATEGORY_INSTRUCTIONS.empresa,
    icebreaker_examples: "",
    successful_examples: "",
  };

  it("renders IB examples section when icebreaker_examples is populated", () => {
    const vars = { ...baseVars, icebreaker_examples: "Exemplo 1:\nTexto: Quebra-gelo de teste\nCategoria: Empresa" };
    const rendered = interpolateTemplate(template, vars);

    expect(rendered).toContain("EXEMPLOS DE ICE BREAKERS DE REFERÊNCIA");
    expect(rendered).toContain("Quebra-gelo de teste");
    expect(rendered).toContain("IMITE OS EXEMPLOS ACIMA");
  });

  it("hides IB examples section when icebreaker_examples is empty", () => {
    const rendered = interpolateTemplate(template, baseVars);

    expect(rendered).not.toContain("EXEMPLOS DE ICE BREAKERS DE REFERÊNCIA");
    expect(rendered).not.toContain("IMITE OS EXEMPLOS ACIMA");
  });

  it("renders NO leaked template syntax ({{#if}}, {{/if}}, {{else}})", () => {
    // Test with IB examples populated
    const withExamples = interpolateTemplate(template, {
      ...baseVars,
      icebreaker_examples: "Exemplo 1: Texto",
    });
    expect(withExamples).not.toMatch(/\{\{#if\s+\w+\}\}/);
    expect(withExamples).not.toContain("{{/if}}");
    expect(withExamples).not.toContain("{{else}}");

    // Test with everything empty
    const withoutExamples = interpolateTemplate(template, baseVars);
    expect(withoutExamples).not.toMatch(/\{\{#if\s+\w+\}\}/);
    expect(withoutExamples).not.toContain("{{/if}}");
    expect(withoutExamples).not.toContain("{{else}}");
  });

  it("replaces all template variables with actual values", () => {
    const rendered = interpolateTemplate(template, baseVars);

    expect(rendered).toContain("João Silva");
    expect(rendered).toContain("CTO");
    expect(rendered).toContain("MegaCorp");
    expect(rendered).toContain("Tecnologia");
    expect(rendered).toContain("TechCorp - Empresa de tecnologia");
  });

  it("injects category_instructions from ICEBREAKER_CATEGORY_INSTRUCTIONS (AC #1-#3)", () => {
    // Test empresa category
    const empresaVars = { ...baseVars, category_instructions: ICEBREAKER_CATEGORY_INSTRUCTIONS.empresa };
    const empresaRendered = interpolateTemplate(template, empresaVars);
    expect(empresaRendered).toContain("FOCO: EMPRESA (Negócio)");
    expect(empresaRendered).toContain("foco é 100% na EMPRESA");

    // Test cargo category
    const cargoVars = { ...baseVars, category_instructions: ICEBREAKER_CATEGORY_INSTRUCTIONS.cargo };
    const cargoRendered = interpolateTemplate(template, cargoVars);
    expect(cargoRendered).toContain("FOCO: CARGO (Role)");
    expect(cargoRendered).toContain("COMECE PELO CARGO");

    // Test lead category
    const leadVars = { ...baseVars, category_instructions: ICEBREAKER_CATEGORY_INSTRUCTIONS.lead };
    const leadRendered = interpolateTemplate(template, leadVars);
    expect(leadRendered).toContain("FOCO: PESSOA (Lead)");
    expect(leadRendered).toContain("foque na PESSOA");
  });
});

// ==============================================
// 5.3: ICEBREAKER_CATEGORY_INSTRUCTIONS tests
// ==============================================

describe("Story 9.3: ICEBREAKER_CATEGORY_INSTRUCTIONS expanded", () => {
  it("empresa instructions include real data usage and anti-patterns (AC #1)", () => {
    const instructions = ICEBREAKER_CATEGORY_INSTRUCTIONS.empresa;

    expect(instructions).toContain("USE dados reais");
    expect(instructions).toContain("{{lead_company}}");
    expect(instructions).toContain("{{lead_industry}}");
    expect(instructions).toContain("ANTI-PATTERNS");
    expect(instructions).toContain("NÃO mencione conquistas pessoais");
    expect(instructions).toContain("foco é 100% na EMPRESA");
  });

  it("cargo instructions include role-level adaptation and anti-patterns (AC #2)", () => {
    const instructions = ICEBREAKER_CATEGORY_INSTRUCTIONS.cargo;

    expect(instructions).toContain("USE dados reais");
    expect(instructions).toContain("{{lead_title}}");
    expect(instructions).toContain("C-Level");
    expect(instructions).toContain("Diretor/Head");
    expect(instructions).toContain("Gerente");
    expect(instructions).toContain("Analista/Especialista");
    expect(instructions).toContain("ANTI-PATTERNS");
    expect(instructions).toContain("COMECE PELO CARGO");
  });

  it("lead instructions include real data usage and anti-patterns (AC #3)", () => {
    const instructions = ICEBREAKER_CATEGORY_INSTRUCTIONS.lead;

    expect(instructions).toContain("USE dados reais");
    expect(instructions).toContain("{{lead_name}}");
    expect(instructions).toContain("{{lead_title}}");
    expect(instructions).toContain("ANTI-PATTERNS");
    expect(instructions).toContain("foque na PESSOA");
  });

  it("post instructions remain unchanged (fallback to premium)", () => {
    const instructions = ICEBREAKER_CATEGORY_INSTRUCTIONS.post;

    expect(instructions).toContain("redireciona para o prompt premium");
    expect(instructions).toContain("fallback");
  });

  it("all categories have example approaches", () => {
    expect(ICEBREAKER_CATEGORY_INSTRUCTIONS.empresa).toContain("Exemplos de abordagem:");
    expect(ICEBREAKER_CATEGORY_INSTRUCTIONS.cargo).toContain("Exemplos de abordagem");
    expect(ICEBREAKER_CATEGORY_INSTRUCTIONS.lead).toContain("Exemplos de abordagem:");
  });
});

// ==============================================
// Premium prompt tests
// ==============================================

describe("Story 9.3: icebreaker_premium_generation blacklist", () => {
  const premiumTemplate = CODE_DEFAULT_PROMPTS.icebreaker_premium_generation.template;

  it("contains expanded blacklist matching standard prompt (AC #5)", () => {
    expect(premiumTemplate).toContain("Tenho acompanhado seus posts");
    expect(premiumTemplate).toContain("Parabéns pelos seus conteúdos");
    expect(premiumTemplate).toContain("Notei que você");
    expect(premiumTemplate).toContain("Percebi que você");
    expect(premiumTemplate).toContain("Vi no seu perfil que");
  });

  it("reinforces specific data references from posts", () => {
    expect(premiumTemplate).toContain("TEMA, OPINIÃO ou INSIGHT concreto");
    expect(premiumTemplate).toContain("TEMA ESPECÍFICO DO POST");
  });
});
