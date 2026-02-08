/**
 * Tests for CSV File Download
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1, #2 - Download de arquivo CSV
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadCsvFile, sanitizeFileName } from "@/lib/export/download-csv";

describe("downloadCsvFile", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildMock: ReturnType<typeof vi.fn>;
  let removeChildMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn>;
  let createdAnchor: Record<string, unknown>;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURLMock = vi.fn();
    appendChildMock = vi.fn();
    removeChildMock = vi.fn();
    clickMock = vi.fn();

    createdAnchor = {};

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    vi.spyOn(document, "createElement").mockImplementation(() => {
      const anchor = {
        href: "",
        download: "",
        click: clickMock,
        style: {},
      };
      createdAnchor = anchor;
      return anchor as unknown as HTMLElement;
    });

    vi.spyOn(document.body, "appendChild").mockImplementation(appendChildMock);
    vi.spyOn(document.body, "removeChild").mockImplementation(removeChildMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cria Blob com tipo text/csv e charset UTF-8", () => {
    downloadCsvFile("conteudo,csv", "test.csv");

    expect(createObjectURLMock).toHaveBeenCalledOnce();
    const blob = createObjectURLMock.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/csv;charset=utf-8");
  });

  it("cria elemento anchor com download e nome do arquivo", () => {
    downloadCsvFile("conteudo", "meu-arquivo.csv");

    expect(createdAnchor.download).toBe("meu-arquivo.csv");
    expect(createdAnchor.href).toBe("blob:mock-url");
  });

  it("dispara click programático no anchor", () => {
    downloadCsvFile("conteudo", "test.csv");

    expect(clickMock).toHaveBeenCalledOnce();
  });

  it("revoga URL após o click", () => {
    downloadCsvFile("conteudo", "test.csv");

    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
  });

  it("remove o anchor do DOM após download", () => {
    downloadCsvFile("conteudo", "test.csv");

    expect(removeChildMock).toHaveBeenCalledOnce();
  });
});

describe("sanitizeFileName", () => {
  it("remove caracteres inválidos para nome de arquivo", () => {
    expect(sanitizeFileName('Campanha "Teste"')).toBe("campanha-teste");
  });

  it("substitui espaços por hífens", () => {
    expect(sanitizeFileName("Minha Campanha Legal")).toBe("minha-campanha-legal");
  });

  it("converte para lowercase", () => {
    expect(sanitizeFileName("CAMPANHA")).toBe("campanha");
  });

  it("limita tamanho a 100 caracteres", () => {
    const longName = "a".repeat(200);
    expect(sanitizeFileName(longName).length).toBeLessThanOrEqual(100);
  });

  it("remove caracteres especiais Windows/Mac", () => {
    expect(sanitizeFileName("test<>:\"/\\|?*file")).toBe("testfile");
  });
});
