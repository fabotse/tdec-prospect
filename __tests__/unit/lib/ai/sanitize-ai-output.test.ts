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
