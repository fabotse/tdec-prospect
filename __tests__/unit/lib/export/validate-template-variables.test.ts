/**
 * Tests for validate-template-variables.ts
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1 - Template variable validation against registry
 */

import { describe, expect, it, vi } from "vitest";

import { validateTemplateVariables } from "@/lib/export/validate-template-variables";
import type { BuilderBlock } from "@/stores/use-builder-store";

// Mock variable-registry to control registered variables
vi.mock("@/lib/export/variable-registry", () => ({
  getVariables: () => [
    { name: "first_name", label: "Nome", leadField: "firstName", template: "{{first_name}}", placeholderLabel: "" },
    { name: "company_name", label: "Empresa", leadField: "companyName", template: "{{company_name}}", placeholderLabel: "" },
    { name: "title", label: "Cargo", leadField: "title", template: "{{title}}", placeholderLabel: "" },
    { name: "ice_breaker", label: "Quebra-gelo", leadField: "icebreaker", template: "{{ice_breaker}}", placeholderLabel: "" },
  ],
}));

const makeEmailBlock = (subject: string, body: string, id = "1"): BuilderBlock => ({
  id,
  type: "email",
  position: 0,
  data: { subject, body },
});

const makeDelayBlock = (): BuilderBlock => ({
  id: "d1",
  type: "delay",
  position: 1,
  data: { days: 2 },
});

describe("validateTemplateVariables", () => {
  it("identifies valid registered variables", () => {
    const blocks = [makeEmailBlock("Oi {{first_name}}", "Empresa: {{company_name}}")];
    const result = validateTemplateVariables(blocks);
    expect(result.validVariables).toContain("first_name");
    expect(result.validVariables).toContain("company_name");
    expect(result.unknownVariables).toHaveLength(0);
    expect(result.malformedSyntax).toHaveLength(0);
  });

  it("identifies unknown variables not in registry", () => {
    const blocks = [makeEmailBlock("{{unknown_var}}", "{{another}}")];
    const result = validateTemplateVariables(blocks);
    expect(result.validVariables).toHaveLength(0);
    expect(result.unknownVariables).toContain("unknown_var");
    expect(result.unknownVariables).toContain("another");
  });

  it("detects malformed syntax with unclosed braces", () => {
    const blocks = [makeEmailBlock("Oi {{first_name", "Normal text")];
    const result = validateTemplateVariables(blocks);
    expect(result.malformedSyntax.length).toBeGreaterThan(0);
    expect(result.malformedSyntax[0].text).toContain("Sintaxe malformada");
  });

  it("detects malformed syntax with extra closing braces", () => {
    const blocks = [makeEmailBlock("Normal text}}", "OK")];
    const result = validateTemplateVariables(blocks);
    expect(result.malformedSyntax.length).toBeGreaterThan(0);
  });

  it("returns empty results when no variables present", () => {
    const blocks = [makeEmailBlock("Hello", "Plain text email")];
    const result = validateTemplateVariables(blocks);
    expect(result.validVariables).toHaveLength(0);
    expect(result.unknownVariables).toHaveLength(0);
    expect(result.malformedSyntax).toHaveLength(0);
  });

  it("ignores delay blocks", () => {
    const blocks = [makeDelayBlock()];
    const result = validateTemplateVariables(blocks);
    expect(result.validVariables).toHaveLength(0);
    expect(result.unknownVariables).toHaveLength(0);
  });

  it("handles multiple email blocks", () => {
    const blocks = [
      makeEmailBlock("{{first_name}}", "{{ice_breaker}}", "1"),
      makeEmailBlock("{{title}}", "{{unknown}}", "2"),
    ];
    const result = validateTemplateVariables(blocks);
    expect(result.validVariables).toContain("first_name");
    expect(result.validVariables).toContain("ice_breaker");
    expect(result.validVariables).toContain("title");
    expect(result.unknownVariables).toContain("unknown");
  });

  it("deduplicates variables across blocks", () => {
    const blocks = [
      makeEmailBlock("{{first_name}}", "{{first_name}}", "1"),
      makeEmailBlock("{{first_name}}", "text", "2"),
    ];
    const result = validateTemplateVariables(blocks);
    expect(result.validVariables).toHaveLength(1);
    expect(result.validVariables[0]).toBe("first_name");
  });

  it("handles mixed valid and unknown in same block", () => {
    const blocks = [makeEmailBlock("{{first_name}} e {{xyz}}", "{{company_name}}")];
    const result = validateTemplateVariables(blocks);
    expect(result.validVariables).toContain("first_name");
    expect(result.validVariables).toContain("company_name");
    expect(result.unknownVariables).toContain("xyz");
  });

  it("handles empty blocks array", () => {
    const result = validateTemplateVariables([]);
    expect(result.validVariables).toHaveLength(0);
    expect(result.unknownVariables).toHaveLength(0);
    expect(result.malformedSyntax).toHaveLength(0);
  });
});
