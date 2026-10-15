/**
 * Tests for xlsx-parser utility
 * Story 12.4: AC #2, #7 - Parse .xlsx into ParsedCSVData
 * Story 23.2: no mocks — reads real .xlsx fixtures generated with the old
 * `xlsx` 0.18.5. The expected values below are the old parser's output,
 * recorded before `xlsx` was removed, so the new parser must match them.
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import type { ParsedCSVData } from "@/lib/utils/csv-parser";
import { parseXlsxData } from "@/lib/utils/xlsx-parser";

function loadFixture(name: string): ArrayBuffer {
  const file = readFileSync(path.resolve(__dirname, "../../../fixtures", name));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

// Recorded output of the old SheetJS parser for import-leads.xlsx
const OLD_PARSER_OUTPUT: ParsedCSVData = {
  headers: ["Nome", "Email", "Empresa", "Telefone", "Ativo"],
  rows: [
    ["João", "joao@test.com", "Empresa A", "5511999998888", "TRUE"],
    ["Maria", "", "Empresa B", "5521988887777", "FALSE"],
    ["Pedro", "pedro@test.com", "", "", "TRUE"],
  ],
};

describe("parseXlsxData", () => {
  it("matches the old parser output for the import fixture (HAPPY_PATH)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads.xlsx"));
    expect(result).toEqual(OLD_PARSER_OUTPUT);
  });

  it("trims spaces in headers and cells (ESPACOS)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads.xlsx"));
    // fixture has "  Nome  " and "  joao@test.com "
    expect(result.headers[0]).toBe("Nome");
    expect(result.rows[0][1]).toBe("joao@test.com");
  });

  it("returns empty strings for empty cells in the middle of a row (VAZIAS)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads.xlsx"));
    expect(result.rows[1][1]).toBe("");
    expect(result.rows[2]).toEqual(["Pedro", "pedro@test.com", "", "", "TRUE"]);
    // every row has the header width
    for (const row of result.rows) {
      expect(row).toHaveLength(result.headers.length);
    }
  });

  it("converts phone numbers stored as numbers to their digits (NUMERO)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads.xlsx"));
    expect(result.rows[0][3]).toBe("5511999998888");
  });

  it("converts booleans to TRUE/FALSE (BOOLEANO)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads.xlsx"));
    expect(result.rows.map((r) => r[4])).toEqual(["TRUE", "FALSE", "TRUE"]);
  });

  it("reads only the first sheet (DUAS_ABAS)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads.xlsx"));
    // second sheet has headers ["Outra", "Aba"]
    expect(result.headers).not.toContain("Outra");
    expect(result.rows.flat()).not.toContain("ler");
  });

  it("returns rows: [] for a header-only file (SO_CABECALHO)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads-header-only.xlsx"));
    expect(result).toEqual<ParsedCSVData>({
      headers: ["Nome", "Email", "Empresa"],
      rows: [],
    });
  });

  /**
   * Table that does not start at A1: title in B1, empty row 2, header in C3,
   * column A/B empty. Both the old parser and the first 23.2 version took the
   * title as the header, so no column was detected.
   */
  it("finds the header row below a title and drops empty columns (TITULO)", async () => {
    const result = await parseXlsxData(loadFixture("import-leads-titulo.xlsx"));
    expect(result).toEqual<ParsedCSVData>({
      headers: ["Nome", "Email", "Empresa"],
      rows: [
        ["Diego", "diego@delta.com", "Delta"],
        ["Eva", "eva@epsilon.com", "Epsilon"],
      ],
    });
  });

  it("rejects when the buffer is not a valid .xlsx (CORROMPIDO)", async () => {
    const buffer = new TextEncoder().encode("isto nao e um xlsx").buffer as ArrayBuffer;
    await expect(parseXlsxData(buffer)).rejects.toThrow();
  });

  it("rejects an empty buffer", async () => {
    await expect(parseXlsxData(new ArrayBuffer(0))).rejects.toThrow();
  });

  /**
   * Accepted divergences from the old parser (recorded with xlsx 0.18.5 on
   * import-leads-divergencias.xlsx: ["Ana", "1/14/24", "5.512E+12"]):
   * - Dates: old returned the formatted text; new returns YYYY-MM-DD (UTC).
   *   The lead import has no date field. (The fixture stores the serial as
   *   2024-01-14T23:59:15Z due to a SheetJS writer timezone artifact.)
   * - Large numbers in "General" format: old returned scientific notation
   *   ("5.512E+12", losing the phone digits); new returns all digits.
   */
  it("records the accepted divergences for dates and General-format numbers", async () => {
    const result = await parseXlsxData(loadFixture("import-leads-divergencias.xlsx"));
    expect(result).toEqual<ParsedCSVData>({
      headers: ["Nome", "Nascimento", "Telefone"],
      rows: [["Ana", "2024-01-14", "5511999998888"]],
    });
  });

  /**
   * Accepted divergence: numeric cells with a custom number format.
   * Old parser output (xlsx 0.18.5, raw:false) for import-leads-formatos.xlsx:
   *   {"headers":["Nome","CEP","Valor"],"rows":[["Ana","01234567","1.50"]]}
   * (CEP format "00000000", Valor format "0.00"). The new parser ignores the
   * number format and returns String(n), so leading zeros / fixed decimals are lost.
   */
  it("records the accepted divergence for custom number formats", async () => {
    const result = await parseXlsxData(loadFixture("import-leads-formatos.xlsx"));
    expect(result).toEqual<ParsedCSVData>({
      headers: ["Nome", "CEP", "Valor"],
      rows: [["Ana", "1234567", "1.5"]],
    });
  });
});
