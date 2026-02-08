/**
 * Tests for CSV Content Generation
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1 - CSV com variáveis resolvidas
 * AC: #2 - CSV com variáveis mantidas
 */

import { describe, it, expect, vi } from "vitest";
import { generateCsvContent } from "@/lib/export/generate-csv";
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

function createDelayBlock(position: number, delayValue: number): BuilderBlock {
  return {
    id: `delay-${position}`,
    type: "delay",
    position,
    data: { delayValue, delayUnit: "days" },
  };
}

interface TestLead {
  email: string | null;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  title?: string;
  icebreaker?: string;
}

const leadJoao: TestLead = {
  email: "joao@empresa.com",
  firstName: "João",
  companyName: "Empresa X",
  title: "CTO",
  icebreaker: "Vi seu post sobre IA",
};

const leadMaria: TestLead = {
  email: "maria@corp.com",
  firstName: "Maria",
  companyName: "Corp Y",
  title: "CEO",
  icebreaker: "Parabéns pelo prêmio",
};

const leadSemEmail: TestLead = {
  email: null,
  firstName: "Carlos",
  companyName: "Tech Z",
  title: "Dev",
};

const leadSemIcebreaker: TestLead = {
  email: "ana@test.com",
  firstName: "Ana",
  companyName: "Test Inc",
  title: "PM",
};

// ==============================================
// TESTS
// ==============================================

describe("generateCsvContent", () => {
  const blocks: BuilderBlock[] = [
    createEmailBlock(0, "Olá {{first_name}}", "{{ice_breaker}} Sobre a {{company_name}}..."),
    createDelayBlock(1, 3),
    createEmailBlock(2, "Follow-up {{first_name}}", "{{first_name}}, voltando..."),
  ];

  describe("modo resolvido (resolveVariables: true) — AC #1", () => {
    it("gera CSV com variáveis substituídas por dados reais do lead", () => {
      const csv = generateCsvContent({
        blocks,
        leads: [leadJoao],
        campaignName: "Test Campaign",
        resolveVariables: true,
      });

      const lines = csv.split("\r\n");
      // Header (strip BOM)
      const header = lines[0].replace(/^\uFEFF/, "");
      expect(header).toBe(
        "email,first_name,company_name,title,ice_breaker,subject_1,body_1,delay_days_1,subject_2,body_2,delay_days_2"
      );
      // Data row — variáveis resolvidas
      expect(lines[1]).toContain("joao@empresa.com");
      expect(lines[1]).toContain("João");
      expect(lines[1]).toContain("Empresa X");
      expect(lines[1]).toContain("Olá João");
      expect(lines[1]).not.toContain("{{first_name}}");
    });

    it("gera uma linha por lead com dados resolvidos", () => {
      const csv = generateCsvContent({
        blocks,
        leads: [leadJoao, leadMaria],
        campaignName: "Test",
        resolveVariables: true,
      });

      const lines = csv.split("\r\n").filter((l) => l.trim() !== "");
      // Header + 2 leads
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain("joao@empresa.com");
      expect(lines[2]).toContain("maria@corp.com");
    });
  });

  describe("modo com variáveis (resolveVariables: false) — AC #2", () => {
    it("mantém variáveis {{...}} intactas nos templates de email", () => {
      const csv = generateCsvContent({
        blocks,
        leads: [leadJoao],
        campaignName: "Test",
        resolveVariables: false,
      });

      const lines = csv.split("\r\n");
      // Dados do lead preenchidos normalmente
      expect(lines[1]).toContain("joao@empresa.com");
      expect(lines[1]).toContain("João");
      // Templates de email mantêm variáveis
      expect(lines[1]).toContain("{{first_name}}");
      expect(lines[1]).toContain("{{ice_breaker}}");
    });

    it("preenche colunas de lead data com valores reais", () => {
      const csv = generateCsvContent({
        blocks,
        leads: [leadJoao],
        campaignName: "Test",
        resolveVariables: false,
      });

      const lines = csv.split("\r\n");
      // Lead data columns preenchidas
      const dataRow = lines[1];
      expect(dataRow).toContain("João");
      expect(dataRow).toContain("Empresa X");
      expect(dataRow).toContain("CTO");
      expect(dataRow).toContain("Vi seu post sobre IA");
    });
  });

  describe("escape de caracteres especiais — RFC 4180", () => {
    it("escapa campos com vírgula envolvendo em aspas duplas", () => {
      const lead: TestLead = {
        email: "test@test.com",
        firstName: "João",
        companyName: "Corp, Inc",
        title: "CTO",
      };

      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [lead],
        campaignName: "Test",
        resolveVariables: true,
      });

      expect(csv).toContain('"Corp, Inc"');
    });

    it("escapa campos com aspas duplicando-as", () => {
      const lead: TestLead = {
        email: "test@test.com",
        firstName: 'João "O Grande"',
        companyName: "Corp",
        title: "CTO",
      };

      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [lead],
        campaignName: "Test",
        resolveVariables: true,
      });

      expect(csv).toContain('"João ""O Grande"""');
    });

    it("escapa campos com quebra de linha", () => {
      const lead: TestLead = {
        email: "test@test.com",
        firstName: "João",
        companyName: "Corp",
        title: "CTO",
        icebreaker: "Linha 1\nLinha 2",
      };

      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [lead],
        campaignName: "Test",
        resolveVariables: true,
      });

      expect(csv).toContain('"Linha 1\nLinha 2"');
    });
  });

  describe("filtragem de leads", () => {
    it("filtra leads sem email (email null)", () => {
      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [leadJoao, leadSemEmail],
        campaignName: "Test",
        resolveVariables: true,
      });

      const lines = csv.split("\r\n").filter((l) => l.trim() !== "");
      expect(lines).toHaveLength(2); // header + 1 lead
      expect(csv).not.toContain("Carlos");
    });

    it("filtra leads com email vazio (string vazia)", () => {
      const leadVazio: TestLead = { email: "", firstName: "Vazio" };

      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [leadJoao, leadVazio as TestLead],
        campaignName: "Test",
        resolveVariables: true,
      });

      const lines = csv.split("\r\n").filter((l) => l.trim() !== "");
      expect(lines).toHaveLength(2);
      expect(csv).not.toContain("Vazio");
    });
  });

  describe("múltiplos emails na sequência", () => {
    it("gera colunas dinâmicas para cada email (subject_N, body_N, delay_days_N)", () => {
      const csv = generateCsvContent({
        blocks,
        leads: [leadJoao],
        campaignName: "Test",
        resolveVariables: false,
      });

      const header = csv.split("\r\n")[0];
      expect(header).toContain("subject_1");
      expect(header).toContain("body_1");
      expect(header).toContain("delay_days_1");
      expect(header).toContain("subject_2");
      expect(header).toContain("body_2");
      expect(header).toContain("delay_days_2");
    });

    it("inclui delay correto entre emails", () => {
      const csv = generateCsvContent({
        blocks,
        leads: [leadJoao],
        campaignName: "Test",
        resolveVariables: false,
      });

      const dataRow = csv.split("\r\n")[1];
      // First email delay = 0, second email delay = 3
      // Parse CSV values
      expect(dataRow).toContain(",0,"); // delay_days_1
    });
  });

  describe("BOM UTF-8", () => {
    it("inclui BOM UTF-8 no início da string", () => {
      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [leadJoao],
        campaignName: "Test",
        resolveVariables: true,
      });

      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });
  });

  describe("campanha vazia", () => {
    it("retorna apenas header quando não há leads válidos", () => {
      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [leadSemEmail],
        campaignName: "Test",
        resolveVariables: true,
      });

      const lines = csv.split("\r\n").filter((l) => l.trim() !== "");
      expect(lines).toHaveLength(1); // only header
    });

    it("gera header sem colunas de email quando não há email blocks", () => {
      const csv = generateCsvContent({
        blocks: [createDelayBlock(0, 3)],
        leads: [leadJoao],
        campaignName: "Test",
        resolveVariables: true,
      });

      const header = csv.split("\r\n")[0].replace(/^\uFEFF/, "");
      expect(header).toBe("email,first_name,company_name,title,ice_breaker");
    });
  });

  describe("terminador de linha", () => {
    it("usa CRLF (\\r\\n) como terminador de linha", () => {
      const csv = generateCsvContent({
        blocks: [createEmailBlock(0, "Olá", "Corpo")],
        leads: [leadJoao],
        campaignName: "Test",
        resolveVariables: true,
      });

      // Remove BOM
      const content = csv.slice(1);
      expect(content).toContain("\r\n");
    });
  });
});
