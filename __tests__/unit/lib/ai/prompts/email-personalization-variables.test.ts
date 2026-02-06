/**
 * Tests: Personalization Variables in AI Prompts
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 *
 * AC #2: When no lead selected, prompts instruct AI to use {{first_name}}, {{company_name}}, {{title}}
 * AC #2: When lead selected, prompts use real data (current behavior)
 *
 * Tests all 4 prompts: email_body, email_subject, follow_up_body, follow_up_subject
 */

import { describe, it, expect } from "vitest";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";

/**
 * Simplified template interpolation matching prompt-manager.ts logic
 */
function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, varName, ifContent, elseContent) => {
      const value = variables[varName];
      return value && value.trim() !== "" ? ifContent : (elseContent ?? "");
    }
  );

  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] ?? match;
  });

  return result;
}

const baseVarsWithLead = {
  company_context: "TDEC Tecnologia",
  competitive_advantages: "AI-powered prospecting",
  products_services: "Plataforma de prospecção",
  lead_name: "João Silva",
  lead_title: "CTO",
  lead_company: "Acme Corp",
  lead_industry: "Tecnologia",
  lead_location: "São Paulo",
  icp_summary: "Empresas de tech",
  pain_points: "Escalabilidade",
  tone_description: "Profissional e direto",
  tone_style: "formal",
  writing_guidelines: "",
  email_objective: "Apresentar produto",
  icebreaker: "",
  successful_examples: "",
};

const baseVarsWithoutLead = {
  ...baseVarsWithLead,
  lead_name: "",
  lead_title: "",
  lead_company: "",
  lead_industry: "",
  lead_location: "",
};

// ==============================================
// email_body_generation
// ==============================================

describe("email_body_generation - personalization variables", () => {
  const template = CODE_DEFAULT_PROMPTS.email_body_generation.template;

  it("should contain MODO TEMPLATE section in raw template", () => {
    expect(template).toContain("MODO TEMPLATE");
    expect(template).toContain("{{first_name}}");
    expect(template).toContain("{{company_name}}");
    expect(template).toContain("{{title}}");
  });

  it("should show MODO TEMPLATE instructions when no lead selected", () => {
    const rendered = interpolateTemplate(template, baseVarsWithoutLead);

    expect(rendered).toContain("MODO TEMPLATE");
    expect(rendered).toContain("{{first_name}}");
    expect(rendered).toContain("{{company_name}}");
    expect(rendered).toContain("{{title}}");
    expect(rendered).not.toContain(
      "PERSONALIZAÇÃO: Use os dados reais do lead"
    );
  });

  it("should show PERSONALIZAÇÃO when lead is selected", () => {
    const rendered = interpolateTemplate(template, baseVarsWithLead);

    expect(rendered).toContain(
      "PERSONALIZAÇÃO: Use os dados reais do lead"
    );
    expect(rendered).not.toContain("MODO TEMPLATE");
  });

  it("should preserve {{first_name}} in output when no lead (not interpolated)", () => {
    const rendered = interpolateTemplate(template, baseVarsWithoutLead);
    const matches = rendered.match(/\{\{first_name\}\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });

  it("should preserve {{company_name}} in output when no lead", () => {
    const rendered = interpolateTemplate(template, baseVarsWithoutLead);
    const matches = rendered.match(/\{\{company_name\}\}/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(1);
  });
});

// ==============================================
// email_subject_generation
// ==============================================

describe("email_subject_generation - personalization variables", () => {
  const template = CODE_DEFAULT_PROMPTS.email_subject_generation.template;

  it("should contain MODO TEMPLATE section in raw template", () => {
    expect(template).toContain("MODO TEMPLATE");
    expect(template).toContain("{{first_name}}");
    expect(template).toContain("{{company_name}}");
  });

  it("should show MODO TEMPLATE instructions when no lead selected", () => {
    const rendered = interpolateTemplate(template, baseVarsWithoutLead);

    expect(rendered).toContain("MODO TEMPLATE");
    expect(rendered).toContain("{{first_name}}");
    expect(rendered).toContain("{{company_name}}");
  });

  it("should show PERSONALIZAÇÃO when lead is selected", () => {
    const rendered = interpolateTemplate(template, baseVarsWithLead);

    expect(rendered).toContain("PERSONALIZAÇÃO: Use os dados reais do lead");
    expect(rendered).not.toContain("MODO TEMPLATE");
  });
});

// ==============================================
// follow_up_email_generation
// ==============================================

describe("follow_up_email_generation - personalization variables", () => {
  const template = CODE_DEFAULT_PROMPTS.follow_up_email_generation.template;

  const followUpVarsWithLead = {
    ...baseVarsWithLead,
    previous_email_subject: "Proposta para Acme",
    previous_email_body: "Olá João...",
  };

  const followUpVarsWithoutLead = {
    ...baseVarsWithoutLead,
    previous_email_subject: "Proposta",
    previous_email_body: "Olá {{first_name}}...",
  };

  it("should contain MODO TEMPLATE section in raw template", () => {
    expect(template).toContain("MODO TEMPLATE");
    expect(template).toContain("{{first_name}}");
    expect(template).toContain("{{company_name}}");
    expect(template).toContain("{{title}}");
  });

  it("should show MODO TEMPLATE instructions when no lead selected", () => {
    const rendered = interpolateTemplate(template, followUpVarsWithoutLead);

    expect(rendered).toContain("MODO TEMPLATE");
    expect(rendered).toContain("{{first_name}}");
  });

  it("should show PERSONALIZAÇÃO when lead is selected", () => {
    const rendered = interpolateTemplate(template, followUpVarsWithLead);

    expect(rendered).toContain("PERSONALIZAÇÃO: Use os dados reais do lead");
    expect(rendered).not.toContain("MODO TEMPLATE");
  });
});

// ==============================================
// follow_up_subject_generation
// ==============================================

describe("follow_up_subject_generation - personalization variables", () => {
  const template = CODE_DEFAULT_PROMPTS.follow_up_subject_generation.template;

  const followUpSubjectVarsWithLead = {
    ...baseVarsWithLead,
    previous_email_subject: "Proposta para Acme",
  };

  const followUpSubjectVarsWithoutLead = {
    ...baseVarsWithoutLead,
    previous_email_subject: "Proposta",
  };

  it("should contain MODO TEMPLATE section in raw template", () => {
    expect(template).toContain("MODO TEMPLATE");
    expect(template).toContain("{{first_name}}");
    expect(template).toContain("{{company_name}}");
  });

  it("should show MODO TEMPLATE instructions when no lead selected", () => {
    const rendered = interpolateTemplate(
      template,
      followUpSubjectVarsWithoutLead
    );

    expect(rendered).toContain("MODO TEMPLATE");
    expect(rendered).toContain("{{first_name}}");
  });

  it("should show PERSONALIZAÇÃO when lead is selected", () => {
    const rendered = interpolateTemplate(
      template,
      followUpSubjectVarsWithLead
    );

    expect(rendered).toContain("PERSONALIZAÇÃO: Use os dados reais do lead");
    expect(rendered).not.toContain("MODO TEMPLATE");
  });
});
