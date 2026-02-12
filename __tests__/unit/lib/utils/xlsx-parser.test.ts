/**
 * Tests for xlsx-parser utility
 * Story 12.4: AC #2, #7 - Parse .xlsx into ParsedCSVData
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedCSVData } from "@/lib/utils/csv-parser";

// Mock xlsx module
const mockRead = vi.fn();
const mockSheetToJson = vi.fn();
vi.mock("xlsx", () => ({
  read: (...args: unknown[]) => mockRead(...args),
  utils: {
    sheet_to_json: (...args: unknown[]) => mockSheetToJson(...args),
  },
}));

// Import after mocking
import { parseXlsxData } from "@/lib/utils/xlsx-parser";

describe("parseXlsxData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse a valid workbook with headers and rows", () => {
    const mockData = [
      ["Nome", "Email", "Empresa"],
      ["João", "joao@test.com", "Empresa A"],
      ["Maria", "maria@test.com", "Empresa B"],
    ];

    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue(mockData);

    const buffer = new ArrayBuffer(8);
    const result = parseXlsxData(buffer);

    expect(result).toEqual<ParsedCSVData>({
      headers: ["Nome", "Email", "Empresa"],
      rows: [
        ["João", "joao@test.com", "Empresa A"],
        ["Maria", "maria@test.com", "Empresa B"],
      ],
    });

    expect(mockRead).toHaveBeenCalledWith(buffer, { type: "array" });
    expect(mockSheetToJson).toHaveBeenCalledWith({}, {
      header: 1,
      raw: false,
      defval: "",
    });
  });

  it("should return empty data when workbook has no sheet names", () => {
    mockRead.mockReturnValue({
      SheetNames: [],
      Sheets: {},
    });

    const result = parseXlsxData(new ArrayBuffer(8));

    expect(result).toEqual<ParsedCSVData>({
      headers: [],
      rows: [],
    });
    expect(mockSheetToJson).not.toHaveBeenCalled();
  });

  it("should return empty data when sheet_to_json returns empty array", () => {
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue([]);

    const result = parseXlsxData(new ArrayBuffer(8));

    expect(result).toEqual<ParsedCSVData>({
      headers: [],
      rows: [],
    });
  });

  it("should return headers only when sheet has only header row (AC #7 - empty sheet)", () => {
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue([["Nome", "Email"]]);

    const result = parseXlsxData(new ArrayBuffer(8));

    expect(result).toEqual<ParsedCSVData>({
      headers: ["Nome", "Email"],
      rows: [],
    });
  });

  it("should trim header and cell values", () => {
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue([
      ["  Nome  ", " Email "],
      [" João ", " joao@test.com "],
    ]);

    const result = parseXlsxData(new ArrayBuffer(8));

    expect(result.headers).toEqual(["Nome", "Email"]);
    expect(result.rows[0]).toEqual(["João", "joao@test.com"]);
  });

  it("should convert non-string values to strings", () => {
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue([
      [123, true, null],
      [456, false, undefined],
    ]);

    const result = parseXlsxData(new ArrayBuffer(8));

    expect(result.headers).toEqual(["123", "true", "null"]);
    expect(result.rows[0]).toEqual(["456", "false", "undefined"]);
  });

  it("should always use the first sheet of the workbook", () => {
    const sheet1Data = {};
    const sheet2Data = {};

    mockRead.mockReturnValue({
      SheetNames: ["Planilha1", "Planilha2"],
      Sheets: { Planilha1: sheet1Data, Planilha2: sheet2Data },
    });
    mockSheetToJson.mockReturnValue([["Nome"], ["João"]]);

    parseXlsxData(new ArrayBuffer(8));

    expect(mockSheetToJson).toHaveBeenCalledWith(sheet1Data, expect.any(Object));
  });

  it("should handle workbook with empty cells (defval ensures empty string)", () => {
    mockRead.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue([
      ["Nome", "Email", "Empresa"],
      ["João", "", ""],
      ["", "maria@test.com", ""],
    ]);

    const result = parseXlsxData(new ArrayBuffer(8));

    expect(result.rows).toEqual([
      ["João", "", ""],
      ["", "maria@test.com", ""],
    ]);
  });
});
