/**
 * Tests for CSV/Clipboard Export Validation
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1, #2, #3 - Validação pré-export
 */

import { describe, it, expect } from "vitest";
import { validateCsvExport } from "@/lib/export/validate-csv-export";
import type { BuilderBlock } from "@/stores/use-builder-store";

// ==============================================
// FIXTURES
// ==============================================

function createEmailBlock(
  position: number,
  subject: string,
  body: string
): BuilderBlock {
  return {
    id: `email-${position}`,
    type: "email",
    position,
    data: { subject, body },
  };
}

function createDelayBlock(position: number): BuilderBlock {
  return {
    id: `delay-${position}`,
    type: "delay",
    position,
    data: { delayValue: 3, delayUnit: "days" },
  };
}

interface TestLeadInfo {
  email: string | null;
  icebreaker?: string | null;
}

// ==============================================
// TESTS
// ==============================================

describe("validateCsvExport", () => {
  const validBlocks = [createEmailBlock(0, "Assunto", "Corpo")];
  const validLeads: TestLeadInfo[] = [
    { email: "test@test.com", icebreaker: "Ice" },
  ];

  describe("erros bloqueantes", () => {
    it("retorna erro quando nenhum lead tem email válido", () => {
      const result = validateCsvExport({
        blocks: validBlocks,
        leads: [{ email: null }, { email: "" }],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("email");
    });

    it("retorna erro quando nenhum email block tem subject E body", () => {
      const emptyBlock = createEmailBlock(0, "", "");
      const result = validateCsvExport({
        blocks: [emptyBlock],
        leads: validLeads,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("email");
    });

    it("retorna múltiplos erros quando leads E blocks são inválidos", () => {
      const result = validateCsvExport({
        blocks: [createEmailBlock(0, "", "")],
        leads: [{ email: null }],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe("warnings não-bloqueantes", () => {
    it("gera warning para leads sem icebreaker", () => {
      const leads: TestLeadInfo[] = [
        { email: "a@test.com", icebreaker: "Ice" },
        { email: "b@test.com", icebreaker: null },
        { email: "c@test.com" },
      ];

      const result = validateCsvExport({
        blocks: validBlocks,
        leads,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("2");
      expect(result.warnings[0]).toContain("icebreaker");
    });

    it("gera warning para email blocks com subject mas sem body", () => {
      const blocks = [
        createEmailBlock(0, "Assunto", "Corpo"),
        createEmailBlock(1, "Assunto parcial", ""),
      ];

      const result = validateCsvExport({
        blocks,
        leads: validLeads,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("incompleto");
    });
  });

  describe("clipboard (sem leads)", () => {
    it("valida sem erro quando isClipboard=true e sem leads", () => {
      const result = validateCsvExport({
        blocks: validBlocks,
        leads: [],
        isClipboard: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("ainda valida email blocks para clipboard", () => {
      const result = validateCsvExport({
        blocks: [createEmailBlock(0, "", "")],
        leads: [],
        isClipboard: true,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("email");
    });
  });

  describe("validação bem-sucedida", () => {
    it("retorna valid=true quando tudo está correto", () => {
      const result = validateCsvExport({
        blocks: validBlocks,
        leads: validLeads,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("ignora delay blocks na validação", () => {
      const blocks = [createEmailBlock(0, "A", "B"), createDelayBlock(1)];
      const result = validateCsvExport({
        blocks,
        leads: validLeads,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("mensagens em português", () => {
    it("erros e warnings estão em PT-BR", () => {
      const result = validateCsvExport({
        blocks: [createEmailBlock(0, "", "")],
        leads: [{ email: null }],
      });

      // All messages should be in Portuguese
      for (const err of result.errors) {
        expect(err).toMatch(/[a-záéíóúãõâêôç]/i);
      }
    });
  });
});
