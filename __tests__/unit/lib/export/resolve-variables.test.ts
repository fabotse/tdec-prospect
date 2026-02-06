/**
 * Variable Resolution Engine Tests
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 * AC: #4 - Motor de substituição, edge cases, graceful degradation
 */

import { describe, it, expect } from "vitest";
import { resolveEmailVariables } from "@/lib/export/resolve-variables";

describe("resolve-variables", () => {
  // ==============================================
  // FULL RESOLUTION (all variables filled)
  // ==============================================

  describe("all variables filled", () => {
    const lead = {
      firstName: "João",
      companyName: "Acme Corp",
      title: "CTO",
      icebreaker: "Vi seu post sobre IA generativa e achei muito relevante.",
    };

    it("should resolve all variables in body", () => {
      const result = resolveEmailVariables(
        {
          subject: "Proposta para {{company_name}}",
          body: "Olá {{first_name}}, {{ice_breaker}} Como {{title}} da {{company_name}}, você deve saber...",
        },
        lead
      );

      expect(result.body).toBe(
        "Olá João, Vi seu post sobre IA generativa e achei muito relevante. Como CTO da Acme Corp, você deve saber..."
      );
    });

    it("should resolve all variables in subject", () => {
      const result = resolveEmailVariables(
        {
          subject: "{{first_name}}, proposta para {{company_name}}",
          body: "Corpo do email",
        },
        lead
      );

      expect(result.subject).toBe("João, proposta para Acme Corp");
    });

    it("should resolve both subject and body simultaneously", () => {
      const result = resolveEmailVariables(
        {
          subject: "Para {{first_name}} - {{company_name}}",
          body: "Prezado {{first_name}}, como {{title}} da {{company_name}}... {{ice_breaker}}",
        },
        lead
      );

      expect(result.subject).toBe("Para João - Acme Corp");
      expect(result.body).toContain("Prezado João");
      expect(result.body).toContain("CTO");
      expect(result.body).toContain("Acme Corp");
      expect(result.body).toContain("Vi seu post sobre IA generativa");
    });
  });

  // ==============================================
  // PARTIAL RESOLUTION (graceful degradation)
  // ==============================================

  describe("partial variables (graceful degradation)", () => {
    it("should keep variables without lead data as-is", () => {
      const lead = {
        firstName: "Maria",
        companyName: null,
        title: null,
        icebreaker: null,
      };

      const result = resolveEmailVariables(
        {
          subject: "Olá {{first_name}} da {{company_name}}",
          body: "{{ice_breaker}} Prezado {{first_name}}, como {{title}}...",
        },
        lead
      );

      expect(result.subject).toBe("Olá Maria da {{company_name}}");
      expect(result.body).toBe(
        "{{ice_breaker}} Prezado Maria, como {{title}}..."
      );
    });

    it("should handle empty string values as unfilled (keep variable)", () => {
      const lead = {
        firstName: "Carlos",
        companyName: "",
        title: "CEO",
        icebreaker: "",
      };

      const result = resolveEmailVariables(
        {
          subject: "{{first_name}} - {{company_name}}",
          body: "{{ice_breaker}} Olá {{first_name}}, como {{title}}...",
        },
        lead
      );

      expect(result.subject).toBe("Carlos - {{company_name}}");
      expect(result.body).toBe(
        "{{ice_breaker}} Olá Carlos, como CEO..."
      );
    });

    it("should handle undefined values as unfilled", () => {
      const lead = {
        firstName: "Ana",
      };

      const result = resolveEmailVariables(
        {
          subject: "{{first_name}} - {{title}}",
          body: "Olá {{first_name}}, {{ice_breaker}}",
        },
        lead
      );

      expect(result.subject).toBe("Ana - {{title}}");
      expect(result.body).toBe("Olá Ana, {{ice_breaker}}");
    });
  });

  // ==============================================
  // NO DATA (all variables kept)
  // ==============================================

  describe("lead without any data", () => {
    it("should keep all variables when lead has no matching fields", () => {
      const lead = {};

      const result = resolveEmailVariables(
        {
          subject: "Olá {{first_name}} da {{company_name}}",
          body: "{{ice_breaker}} Como {{title}}, você deve...",
        },
        lead
      );

      expect(result.subject).toBe("Olá {{first_name}} da {{company_name}}");
      expect(result.body).toBe(
        "{{ice_breaker}} Como {{title}}, você deve..."
      );
    });

    it("should keep all variables when lead fields are null", () => {
      const lead = {
        firstName: null,
        companyName: null,
        title: null,
        icebreaker: null,
      };

      const result = resolveEmailVariables(
        {
          subject: "{{first_name}}",
          body: "{{ice_breaker}} {{company_name}} {{title}}",
        },
        lead
      );

      expect(result.subject).toBe("{{first_name}}");
      expect(result.body).toBe("{{ice_breaker}} {{company_name}} {{title}}");
    });
  });

  // ==============================================
  // NO VARIABLES (template without placeholders)
  // ==============================================

  describe("template without variables", () => {
    it("should return template unchanged when no variables present", () => {
      const lead = {
        firstName: "João",
        companyName: "Acme",
      };

      const result = resolveEmailVariables(
        {
          subject: "Proposta comercial",
          body: "Prezado cliente, gostaria de apresentar nossa solução.",
        },
        lead
      );

      expect(result.subject).toBe("Proposta comercial");
      expect(result.body).toBe(
        "Prezado cliente, gostaria de apresentar nossa solução."
      );
    });
  });

  // ==============================================
  // UNKNOWN VARIABLES
  // ==============================================

  describe("unknown variables", () => {
    it("should keep unknown variables as-is", () => {
      const lead = {
        firstName: "João",
      };

      const result = resolveEmailVariables(
        {
          subject: "{{first_name}} - {{unknown_var}}",
          body: "Texto com {{another_unknown}}",
        },
        lead
      );

      expect(result.subject).toBe("João - {{unknown_var}}");
      expect(result.body).toBe("Texto com {{another_unknown}}");
    });
  });

  // ==============================================
  // MULTIPLE OCCURRENCES
  // ==============================================

  describe("multiple occurrences of same variable", () => {
    it("should resolve all occurrences of the same variable", () => {
      const lead = {
        firstName: "Maria",
      };

      const result = resolveEmailVariables(
        {
          subject: "{{first_name}}",
          body: "Olá {{first_name}}, como vai? {{first_name}}, aguardo retorno.",
        },
        lead
      );

      expect(result.body).toBe(
        "Olá Maria, como vai? Maria, aguardo retorno."
      );
    });
  });

  // ==============================================
  // EDGE CASES
  // ==============================================

  describe("edge cases", () => {
    it("should handle empty subject and body", () => {
      const result = resolveEmailVariables(
        { subject: "", body: "" },
        { firstName: "João" }
      );

      expect(result.subject).toBe("");
      expect(result.body).toBe("");
    });

    it("should not confuse single braces with variable syntax", () => {
      const result = resolveEmailVariables(
        {
          subject: "{not_a_variable}",
          body: "Use {single} braces",
        },
        { firstName: "João" }
      );

      expect(result.subject).toBe("{not_a_variable}");
      expect(result.body).toBe("Use {single} braces");
    });

    it("should handle triple braces gracefully", () => {
      const lead = { firstName: "João" };
      const result = resolveEmailVariables(
        {
          subject: "{{{first_name}}}",
          body: "Normal",
        },
        lead
      );

      expect(result.subject).toBe("{João}");
    });
  });
});
