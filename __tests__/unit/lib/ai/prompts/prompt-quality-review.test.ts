/**
 * Tests: Cross-prompt quality review
 * Story 9.6: Revisão de Qualidade Geral dos Prompts AI
 *
 * AC #1: Consistent section structure across communication prompts
 * AC #2: IB → Email flow works well in sequence
 * AC #3: Tone guides identical across all 6 communication prompts
 * AC #4: Variable naming unified to snake_case
 * AC #5: Tests validate consistency across all prompts
 */

import { describe, it, expect } from "vitest";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";

// ==============================================
// Constants
// ==============================================

const COMMUNICATION_PROMPTS = [
  "email_subject_generation",
  "email_body_generation",
  "icebreaker_generation",
  "icebreaker_premium_generation",
  "follow_up_email_generation",
  "follow_up_subject_generation",
] as const;

// ==============================================
// 5.2: No camelCase variables in communication prompts (AC #4)
// ==============================================

describe("Story 9.6: No camelCase variables in communication prompts (AC #4)", () => {
  it.each(COMMUNICATION_PROMPTS)(
    "%s should NOT contain camelCase template variables",
    (key) => {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS].template;

      // Match {{camelCase}} pattern — a lowercase letter followed by uppercase
      const camelCaseVarRegex = /\{\{[a-z]+[A-Z][a-zA-Z]*\}\}/g;
      const matches = template.match(camelCaseVarRegex);

      expect(matches).toBeNull();
    }
  );
});

// ==============================================
// 5.3: All 6 prompts have tone guide with [CASUAL], [FORMAL], [TÉCNICO] (AC #3)
// ==============================================

describe("Story 9.6: Tone guide present in all communication prompts (AC #3)", () => {
  it.each(COMMUNICATION_PROMPTS)(
    "%s should contain [CASUAL] marker",
    (key) => {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS].template;
      expect(template).toContain("[CASUAL]");
    }
  );

  it.each(COMMUNICATION_PROMPTS)(
    "%s should contain [FORMAL] marker",
    (key) => {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS].template;
      expect(template).toContain("[FORMAL]");
    }
  );

  it.each(COMMUNICATION_PROMPTS)(
    "%s should contain [TÉCNICO] marker",
    (key) => {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS].template;
      expect(template).toContain("[TÉCNICO]");
    }
  );
});

// ==============================================
// 5.4: Tone vocabulary consistency (AC #3)
// ==============================================

describe("Story 9.6: Tone vocabulary consistency across prompts (AC #3)", () => {
  // Key terms that should appear in CASUAL sections
  const casualTerms = ["amigável", "casual"];
  // Key terms that should appear in FORMAL sections (prefix match for gender variations)
  const formalTerms = ["corporativ", "respeitos"];
  // Key terms that should appear in TÉCNICO sections
  const tecnicoTerms = ["técnic"];

  it.each(COMMUNICATION_PROMPTS)(
    "%s [CASUAL] section should reference friendly/casual vocabulary",
    (key) => {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS].template;
      const casualIndex = template.indexOf("[CASUAL]");
      const formalIndex = template.indexOf("[FORMAL]", casualIndex);

      // Extract CASUAL section (between [CASUAL] and [FORMAL])
      const casualSection = template.slice(casualIndex, formalIndex);

      const hasCasualTerm = casualTerms.some((term) =>
        casualSection.toLowerCase().includes(term)
      );
      expect(hasCasualTerm).toBe(true);
    }
  );

  it.each(COMMUNICATION_PROMPTS)(
    "%s [FORMAL] section should reference corporate/respectful vocabulary",
    (key) => {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS].template;
      const formalIndex = template.indexOf("[FORMAL]");
      const tecnicoIndex = template.indexOf("[TÉCNICO]", formalIndex);

      // Extract FORMAL section (between [FORMAL] and [TÉCNICO])
      const formalSection = template.slice(formalIndex, tecnicoIndex);

      const hasFormalTerm = formalTerms.some((term) =>
        formalSection.toLowerCase().includes(term)
      );
      expect(hasFormalTerm).toBe(true);
    }
  );

  it.each(COMMUNICATION_PROMPTS)(
    "%s [TÉCNICO] section should reference technical vocabulary",
    (key) => {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS].template;
      const tecnicoIndex = template.indexOf("[TÉCNICO]");

      // Extract TÉCNICO section (from [TÉCNICO] to next 500 chars or end)
      const tecnicoSection = template.slice(
        tecnicoIndex,
        tecnicoIndex + 500
      );

      const hasTecnicoTerm = tecnicoTerms.some((term) =>
        tecnicoSection.toLowerCase().includes(term)
      );
      expect(hasTecnicoTerm).toBe(true);
    }
  );
});

// ==============================================
// 5.5: IB → Email variable compatibility (AC #2)
// ==============================================

describe("Story 9.6: IB → Email flow variable compatibility (AC #2)", () => {
  it("email_body_generation accepts {{icebreaker}} variable (interpolated IB)", () => {
    const emailTemplate = CODE_DEFAULT_PROMPTS.email_body_generation.template;
    expect(emailTemplate).toContain("{{icebreaker}}");
    expect(emailTemplate).toContain("{{#if icebreaker}}");
  });

  it("email_body_generation has {{ice_breaker}} literal for personalization variable", () => {
    const emailTemplate = CODE_DEFAULT_PROMPTS.email_body_generation.template;
    expect(emailTemplate).toContain("{{ice_breaker}}");
  });

  it("follow_up_email_generation does NOT contain icebreaker variable", () => {
    const followUpTemplate =
      CODE_DEFAULT_PROMPTS.follow_up_email_generation.template;
    // Follow-ups should NOT include icebreaker (Story 9.5 rule)
    expect(followUpTemplate).not.toContain("{{icebreaker}}");
    expect(followUpTemplate).not.toContain("{{ice_breaker}}");
  });

  it("icebreaker_generation outputs text compatible with email's {{icebreaker}} input", () => {
    const ibTemplate = CODE_DEFAULT_PROMPTS.icebreaker_generation.template;
    // IB prompt generates plain text (no special format needed)
    expect(ibTemplate).toContain("Responda APENAS com o quebra-gelo");
  });

  it("icebreaker_premium_generation outputs text compatible with email's {{icebreaker}} input", () => {
    const ibPremiumTemplate =
      CODE_DEFAULT_PROMPTS.icebreaker_premium_generation.template;
    // Premium IB also generates plain text
    expect(ibPremiumTemplate).toContain(
      "Responda APENAS com o quebra-gelo"
    );
  });
});

// ==============================================
// 5.6: Regression tests — Stories 9.1-9.5 still work
// ==============================================

describe("Story 9.6: Regression — prompt keys and structure intact", () => {
  it("all 9 prompt keys exist in CODE_DEFAULT_PROMPTS", () => {
    const allKeys = [
      "search_translation",
      "email_subject_generation",
      "email_body_generation",
      "icebreaker_generation",
      "icebreaker_premium_generation",
      "follow_up_email_generation",
      "follow_up_subject_generation",
      "tone_application",
      "campaign_structure_generation",
    ];

    for (const key of allKeys) {
      expect(
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS]
      ).toBeDefined();
      expect(
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS]
          .template
      ).toBeTruthy();
    }
  });

  it("icebreaker_generation still has category_instructions variable (Story 9.3)", () => {
    const template = CODE_DEFAULT_PROMPTS.icebreaker_generation.template;
    expect(template).toContain("{{category_instructions}}");
  });

  it("email_body_generation still has block structure [SAUDAÇÃO] [QUEBRA-GELO] [TRANSIÇÃO] (Story 9.5)", () => {
    const template = CODE_DEFAULT_PROMPTS.email_body_generation.template;
    expect(template).toContain("[SAUDAÇÃO]");
    expect(template).toContain("[QUEBRA-GELO]");
    expect(template).toContain("[TRANSIÇÃO]");
    expect(template).toContain("[CONTEÚDO PRODUTO]");
    expect(template).toContain("[CTA]");
    expect(template).toContain("[FECHAMENTO]");
  });

  it("follow_up_email_generation still has block structure, strategy injection and anti-repetition (Story 9.5)", () => {
    const template =
      CODE_DEFAULT_PROMPTS.follow_up_email_generation.template;
    expect(template).toMatch(/saudação/i);
    expect(template).toMatch(/conteúdo/i);
    expect(template).toMatch(/CTA/);
    expect(template).toMatch(/fechamento/i);
    expect(template).toContain("{{follow_up_strategy}}");
    expect(template).toContain("ANTI-REPETIÇÃO");
    expect(template).toContain("NÃO inclua Ice Breaker");
    expect(template).toContain("FRASES PROIBIDAS");
  });

  it("icebreaker_premium_generation uses snake_case variables (Story 9.6)", () => {
    const template =
      CODE_DEFAULT_PROMPTS.icebreaker_premium_generation.template;
    expect(template).toContain("{{lead_name}}");
    expect(template).toContain("{{lead_title}}");
    expect(template).toContain("{{lead_company}}");
    expect(template).toContain("{{lead_industry}}");
    expect(template).toContain("{{linkedin_posts}}");
    expect(template).toContain("{{company_context}}");
    expect(template).toContain("{{tone_description}}");
    expect(template).toContain("{{tone_style}}");

    // Should NOT contain old camelCase variables
    expect(template).not.toContain("{{firstName}}");
    expect(template).not.toContain("{{lastName}}");
    expect(template).not.toContain("{{companyName}}");
    expect(template).not.toContain("{{toneStyle}}");
    expect(template).not.toContain("{{linkedinPosts}}");
  });

  it("all communication prompts have consistent section headings in MAIÚSCULAS", () => {
    for (const key of COMMUNICATION_PROMPTS) {
      const template =
        CODE_DEFAULT_PROMPTS[key as keyof typeof CODE_DEFAULT_PROMPTS]
          .template;
      // All prompts should have at least PERFIL DO LEAD or profile-related heading
      const hasLeadSection =
        template.includes("PERFIL DO LEAD") ||
        template.includes("PERFIL DO LEAD:");
      // follow_up_subject has a simpler structure but still has PERFIL
      expect(hasLeadSection).toBe(true);
    }
  });
});
