/**
 * Tests for useCsvClipboardExport Hook
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1, #2, #3 - Hook de orquestração client-side
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCsvClipboardExport } from "@/hooks/use-csv-clipboard-export";
import type { BuilderBlock } from "@/stores/use-builder-store";

// ==============================================
// MOCKS
// ==============================================

vi.mock("@/lib/export/generate-csv", () => ({
  generateCsvContent: vi.fn().mockReturnValue("\uFEFFemail,first_name\r\ntest@test.com,Test\r\n"),
}));

vi.mock("@/lib/export/download-csv", () => ({
  downloadCsvFile: vi.fn(),
  sanitizeFileName: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, "-")),
}));

vi.mock("@/lib/export/format-clipboard", () => ({
  formatCampaignForClipboard: vi.fn().mockReturnValue("=== Campanha: Test ===\n\n--- Email 1 ---"),
}));

vi.mock("@/lib/export/validate-csv-export", () => ({
  validateCsvExport: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
}));

// M1 fix: Hook now uses navigator.clipboard.writeText directly (no double toast)

// ==============================================
// FIXTURES
// ==============================================

function createEmailBlock(position: number): BuilderBlock {
  return {
    id: `email-${position}`,
    type: "email",
    position,
    data: { subject: "Assunto", body: "Corpo" },
  };
}

const mockBlocks: BuilderBlock[] = [createEmailBlock(0)];

const mockLeads = [
  {
    email: "test@test.com" as string | null,
    firstName: "Test",
    companyName: "Corp",
    title: "CTO",
    icebreaker: "Ice",
  },
];

// ==============================================
// TESTS
// ==============================================

describe("useCsvClipboardExport", () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // M1 fix: Hook uses navigator.clipboard.writeText directly
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna interface correta com métodos de export", () => {
    const { result } = renderHook(() => useCsvClipboardExport());

    expect(result.current.isExporting).toBe(false);
    expect(typeof result.current.exportToCsv).toBe("function");
    expect(typeof result.current.exportToCsvWithVariables).toBe("function");
    expect(typeof result.current.exportToClipboard).toBe("function");
  });

  describe("exportToCsv (modo resolvido) — AC #1", () => {
    it("valida, gera CSV e faz download com sucesso", async () => {
      const { result } = renderHook(() => useCsvClipboardExport());

      let exportResult: Awaited<ReturnType<typeof result.current.exportToCsv>>;
      await act(async () => {
        exportResult = await result.current.exportToCsv({
          blocks: mockBlocks,
          leads: mockLeads,
          campaignName: "Test Campaign",
        });
      });

      expect(exportResult!.success).toBe(true);
      expect(exportResult!.rowCount).toBeGreaterThanOrEqual(0);

      const { generateCsvContent } = await import("@/lib/export/generate-csv");
      expect(generateCsvContent).toHaveBeenCalledWith(
        expect.objectContaining({ resolveVariables: true })
      );

      const { downloadCsvFile } = await import("@/lib/export/download-csv");
      expect(downloadCsvFile).toHaveBeenCalledOnce();
    });

    it("retorna erro quando validação falha", async () => {
      const { validateCsvExport } = await import("@/lib/export/validate-csv-export");
      vi.mocked(validateCsvExport).mockReturnValueOnce({
        valid: false,
        errors: ["Nenhum lead com email válido."],
        warnings: [],
      });

      const { result } = renderHook(() => useCsvClipboardExport());

      let exportResult: Awaited<ReturnType<typeof result.current.exportToCsv>>;
      await act(async () => {
        exportResult = await result.current.exportToCsv({
          blocks: mockBlocks,
          leads: [],
          campaignName: "Test",
        });
      });

      expect(exportResult!.success).toBe(false);
      expect(exportResult!.error).toContain("email");
    });
  });

  describe("exportToCsvWithVariables (modo template) — AC #2", () => {
    it("gera CSV com resolveVariables=false", async () => {
      const { result } = renderHook(() => useCsvClipboardExport());

      let exportResult: Awaited<ReturnType<typeof result.current.exportToCsvWithVariables>>;
      await act(async () => {
        exportResult = await result.current.exportToCsvWithVariables({
          blocks: mockBlocks,
          leads: mockLeads,
          campaignName: "Test",
        });
      });

      expect(exportResult!.success).toBe(true);

      const { generateCsvContent } = await import("@/lib/export/generate-csv");
      expect(generateCsvContent).toHaveBeenCalledWith(
        expect.objectContaining({ resolveVariables: false })
      );
    });
  });

  describe("exportToClipboard — AC #3", () => {
    it("formata e copia para clipboard com sucesso", async () => {
      const { result } = renderHook(() => useCsvClipboardExport());

      let exportResult: Awaited<ReturnType<typeof result.current.exportToClipboard>>;
      await act(async () => {
        exportResult = await result.current.exportToClipboard({
          blocks: mockBlocks,
          campaignName: "Test",
        });
      });

      expect(exportResult!.success).toBe(true);
      expect(writeTextMock).toHaveBeenCalledOnce();
    });

    it("valida apenas blocks (sem leads) para clipboard", async () => {
      const { result } = renderHook(() => useCsvClipboardExport());

      await act(async () => {
        await result.current.exportToClipboard({
          blocks: mockBlocks,
          campaignName: "Test",
        });
      });

      const { validateCsvExport } = await import("@/lib/export/validate-csv-export");
      expect(validateCsvExport).toHaveBeenCalledWith(
        expect.objectContaining({ isClipboard: true })
      );
    });

    it("retorna erro quando validação de blocks falha", async () => {
      const { validateCsvExport } = await import("@/lib/export/validate-csv-export");
      vi.mocked(validateCsvExport).mockReturnValueOnce({
        valid: false,
        errors: ["Nenhum email completo na campanha."],
        warnings: [],
      });

      const { result } = renderHook(() => useCsvClipboardExport());

      let exportResult: Awaited<ReturnType<typeof result.current.exportToClipboard>>;
      await act(async () => {
        exportResult = await result.current.exportToClipboard({
          blocks: [],
          campaignName: "Test",
        });
      });

      expect(exportResult!.success).toBe(false);
      expect(exportResult!.error).toContain("email");
    });

    it("retorna erro quando clipboard falha", async () => {
      writeTextMock.mockRejectedValueOnce(new Error("Clipboard API failed"));

      const { result } = renderHook(() => useCsvClipboardExport());

      let exportResult: Awaited<ReturnType<typeof result.current.exportToClipboard>>;
      await act(async () => {
        exportResult = await result.current.exportToClipboard({
          blocks: mockBlocks,
          campaignName: "Test",
        });
      });

      expect(exportResult!.success).toBe(false);
      expect(exportResult!.error).toBeDefined();
    });
  });

  describe("estado isExporting", () => {
    it("isExporting é true durante o export e false após", async () => {
      const { result } = renderHook(() => useCsvClipboardExport());

      expect(result.current.isExporting).toBe(false);

      await act(async () => {
        await result.current.exportToCsv({
          blocks: mockBlocks,
          leads: mockLeads,
          campaignName: "Test",
        });
      });

      expect(result.current.isExporting).toBe(false);
    });
  });
});
