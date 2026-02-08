/**
 * Tests for AI Output Sanitization
 *
 * Ensures LLM-generated text has common prefixes stripped
 * (e.g., "Assunto:", "Corpo:") before being stored in fields.
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeGeneratedSubject,
  sanitizeGeneratedBody,
  normalizeTemplateVariables,
  ensureIceBreakerVariable,
} from "@/lib/ai/sanitize-ai-output";

describe("sanitizeGeneratedSubject", () => {
  it("strips 'Assunto:' prefix", () => {
    expect(sanitizeGeneratedSubject("Assunto: Pedro, como está o controle da nuvem?")).toBe(
      "Pedro, como está o controle da nuvem?"
    );
  });

  it("strips 'Assunto:' prefix case-insensitively", () => {
    expect(sanitizeGeneratedSubject("ASSUNTO: Teste")).toBe("Teste");
    expect(sanitizeGeneratedSubject("assunto: teste")).toBe("teste");
  });

  it("strips 'Assunto:' with extra spaces", () => {
    expect(sanitizeGeneratedSubject("Assunto:   Teste com espaços")).toBe("Teste com espaços");
  });

  it("strips 'Subject:' prefix", () => {
    expect(sanitizeGeneratedSubject("Subject: Hello there")).toBe("Hello there");
  });

  it("strips 'Subject:' prefix case-insensitively", () => {
    expect(sanitizeGeneratedSubject("SUBJECT: Hello")).toBe("Hello");
    expect(sanitizeGeneratedSubject("subject: hello")).toBe("hello");
  });

  it("removes wrapping double quotes", () => {
    expect(sanitizeGeneratedSubject('"Pedro, como vai?"')).toBe("Pedro, como vai?");
  });

  it("removes wrapping single quotes", () => {
    expect(sanitizeGeneratedSubject("'Pedro, como vai?'")).toBe("Pedro, como vai?");
  });

  it("does not remove quotes that are not wrapping", () => {
    expect(sanitizeGeneratedSubject('Pedro disse "olá" para você')).toBe(
      'Pedro disse "olá" para você'
    );
  });

  it("strips prefix AND wrapping quotes together", () => {
    expect(sanitizeGeneratedSubject('Assunto: "Teste de assunto"')).toBe("Teste de assunto");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeGeneratedSubject("  Teste com espaços  ")).toBe("Teste com espaços");
  });

  it("returns text unchanged when no prefix is present", () => {
    expect(sanitizeGeneratedSubject("Pedro, como está o controle da nuvem?")).toBe(
      "Pedro, como está o controle da nuvem?"
    );
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeGeneratedSubject("")).toBe("");
  });

  it("preserves RE: prefix (intentional for follow-ups)", () => {
    expect(sanitizeGeneratedSubject("RE: Proposta comercial")).toBe("RE: Proposta comercial");
  });
});

describe("sanitizeGeneratedBody", () => {
  it("strips 'Corpo:' prefix", () => {
    expect(sanitizeGeneratedBody("Corpo: Olá Pedro, tudo bem?")).toBe("Olá Pedro, tudo bem?");
  });

  it("strips 'Corpo:' prefix case-insensitively", () => {
    expect(sanitizeGeneratedBody("CORPO: Teste")).toBe("Teste");
    expect(sanitizeGeneratedBody("corpo: teste")).toBe("teste");
  });

  it("strips 'Corpo do email:' prefix", () => {
    expect(sanitizeGeneratedBody("Corpo do email: Olá!")).toBe("Olá!");
  });

  it("strips 'Body:' prefix", () => {
    expect(sanitizeGeneratedBody("Body: Hello there")).toBe("Hello there");
  });

  it("strips 'Body:' prefix case-insensitively", () => {
    expect(sanitizeGeneratedBody("BODY: Hello")).toBe("Hello");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeGeneratedBody("  Olá Pedro!  ")).toBe("Olá Pedro!");
  });

  it("returns text unchanged when no prefix is present", () => {
    const body = "Olá Pedro,\n\nGostaria de apresentar nosso produto.";
    expect(sanitizeGeneratedBody(body)).toBe(body.trim());
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeGeneratedBody("")).toBe("");
  });

  it("preserves {{ice_breaker}} variable in body", () => {
    const body = "Olá! {{ice_breaker}} Gostaria de apresentar nosso produto.";
    expect(sanitizeGeneratedBody(body)).toBe(body);
  });

  it("strips prefix but preserves multiline body content", () => {
    const input = "Corpo: Olá Pedro,\n\nGostaria de apresentar nosso produto.\n\nAbraços";
    const expected = "Olá Pedro,\n\nGostaria de apresentar nosso produto.\n\nAbraços";
    expect(sanitizeGeneratedBody(input)).toBe(expected);
  });
});

// ==============================================
// normalizeTemplateVariables (Story 7.5)
// ==============================================

describe("normalizeTemplateVariables", () => {
  // first_name variants
  it("normalizes {{Nome}} to {{first_name}}", () => {
    expect(normalizeTemplateVariables("Oi {{Nome}}, tudo bem?")).toBe(
      "Oi {{first_name}}, tudo bem?"
    );
  });

  it("normalizes {{nome}} (lowercase) to {{first_name}}", () => {
    expect(normalizeTemplateVariables("Oi {{nome}}, tudo bem?")).toBe(
      "Oi {{first_name}}, tudo bem?"
    );
  });

  it("normalizes {{Name}} to {{first_name}}", () => {
    expect(normalizeTemplateVariables("Hi {{Name}}!")).toBe("Hi {{first_name}}!");
  });

  it("normalizes {{FirstName}} to {{first_name}}", () => {
    expect(normalizeTemplateVariables("Oi {{FirstName}}")).toBe("Oi {{first_name}}");
  });

  // company_name variants
  it("normalizes {{Empresa}} to {{company_name}}", () => {
    expect(normalizeTemplateVariables("Na {{Empresa}}, vimos que")).toBe(
      "Na {{company_name}}, vimos que"
    );
  });

  it("normalizes {{empresa}} to {{company_name}}", () => {
    expect(normalizeTemplateVariables("a {{empresa}} tem")).toBe("a {{company_name}} tem");
  });

  it("normalizes {{Company}} to {{company_name}}", () => {
    expect(normalizeTemplateVariables("at {{Company}}")).toBe("at {{company_name}}");
  });

  // title variants
  it("normalizes {{Cargo}} to {{title}}", () => {
    expect(normalizeTemplateVariables("Como {{Cargo}} da empresa")).toBe(
      "Como {{title}} da empresa"
    );
  });

  it("normalizes {{cargo}} to {{title}}", () => {
    expect(normalizeTemplateVariables("seu {{cargo}}")).toBe("seu {{title}}");
  });

  // ice_breaker variants
  it("normalizes {{icebreaker}} to {{ice_breaker}}", () => {
    expect(normalizeTemplateVariables("{{icebreaker}} e mais")).toBe(
      "{{ice_breaker}} e mais"
    );
  });

  it("normalizes {{quebra_gelo}} to {{ice_breaker}}", () => {
    expect(normalizeTemplateVariables("{{quebra_gelo}}")).toBe("{{ice_breaker}}");
  });

  // Preserves correct variables
  it("preserves already-correct {{first_name}}", () => {
    expect(normalizeTemplateVariables("Oi {{first_name}}")).toBe("Oi {{first_name}}");
  });

  it("preserves already-correct {{company_name}}", () => {
    expect(normalizeTemplateVariables("{{company_name}} rocks")).toBe("{{company_name}} rocks");
  });

  it("preserves already-correct {{ice_breaker}}", () => {
    expect(normalizeTemplateVariables("{{ice_breaker}}")).toBe("{{ice_breaker}}");
  });

  // Unknown variables untouched
  it("preserves unknown variables", () => {
    expect(normalizeTemplateVariables("{{custom_field}}")).toBe("{{custom_field}}");
  });

  // Multiple variables in one text
  it("normalizes multiple variables in the same text", () => {
    const input = "Oi {{Nome}}, como vai na {{Empresa}}? {{icebreaker}}";
    const expected = "Oi {{first_name}}, como vai na {{company_name}}? {{ice_breaker}}";
    expect(normalizeTemplateVariables(input)).toBe(expected);
  });

  // Handles whitespace inside braces
  it("handles whitespace inside braces", () => {
    expect(normalizeTemplateVariables("{{ Nome }}")).toBe("{{first_name}}");
  });

  // No variables
  it("returns text unchanged when no variables present", () => {
    const text = "Olá, tudo bem? Aqui é da TDEC.";
    expect(normalizeTemplateVariables(text)).toBe(text);
  });

  it("returns empty string for empty input", () => {
    expect(normalizeTemplateVariables("")).toBe("");
  });
});

// ==============================================
// ensureIceBreakerVariable (Story 7.5)
// ==============================================

describe("ensureIceBreakerVariable", () => {
  it("returns body unchanged if {{ice_breaker}} already present", () => {
    const body = "Oi {{first_name}},\n\n{{ice_breaker}}\n\nNosso produto...";
    expect(ensureIceBreakerVariable(body)).toBe(body);
  });

  it("injects {{ice_breaker}} after first paragraph (double newline)", () => {
    const body = "Oi {{first_name}}, tudo bem?\n\nNosso produto é incrível.";
    const expected = "Oi {{first_name}}, tudo bem?\n\n{{ice_breaker}}\n\nNosso produto é incrível.";
    expect(ensureIceBreakerVariable(body)).toBe(expected);
  });

  it("injects {{ice_breaker}} after first line (single newline)", () => {
    const body = "Oi {{first_name}},\nNosso produto é incrível.";
    const expected = "Oi {{first_name}},\n\n{{ice_breaker}}\nNosso produto é incrível.";
    expect(ensureIceBreakerVariable(body)).toBe(expected);
  });

  it("prepends {{ice_breaker}} when no newlines exist", () => {
    const body = "Email sem quebras de linha.";
    const expected = "{{ice_breaker}}\n\nEmail sem quebras de linha.";
    expect(ensureIceBreakerVariable(body)).toBe(expected);
  });

  it("handles multiline body with multiple paragraphs", () => {
    const body = "Saudação\n\nParágrafo 1\n\nParágrafo 2\n\nAssinatura";
    const expected = "Saudação\n\n{{ice_breaker}}\n\nParágrafo 1\n\nParágrafo 2\n\nAssinatura";
    expect(ensureIceBreakerVariable(body)).toBe(expected);
  });

  it("does not duplicate if {{ice_breaker}} is already at the right position", () => {
    const body = "Oi!\n\n{{ice_breaker}}\n\nConteúdo";
    expect(ensureIceBreakerVariable(body)).toBe(body);
  });
});
