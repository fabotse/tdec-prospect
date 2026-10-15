/**
 * XLSX Parser Utility
 * Story 12.4: AC #2, #7 - Parse .xlsx files into ParsedCSVData
 * Story 23.2: migrated from `xlsx` (SheetJS, vulnerable and unmaintained on npm)
 * to `read-excel-file`, keeping the same ParsedCSVData output.
 *
 * Converts Excel .xlsx files to the same ParsedCSVData structure
 * used by csv-parser, enabling the full import pipeline to work
 * transparently with both CSV and Excel files.
 */

import { readSheet } from "read-excel-file/universal";
import { detectLeadColumnMappings, type ParsedCSVData } from "@/lib/utils/csv-parser";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Normalize a cell value to the string the old SheetJS-based parser produced.
 * - null/undefined → ""
 * - boolean → "TRUE" / "FALSE"
 * - number → String(n)
 * - Date → "YYYY-MM-DD" (UTC). Divergence accepted: the old parser returned
 *   the formatted text (e.g. "1/15/24"); the lead import has no date field.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  return String(value).trim();
}

/**
 * Parse an Excel .xlsx file buffer into ParsedCSVData
 * Always reads the first sheet of the workbook.
 * Rejects when the buffer is not a valid .xlsx file.
 *
 * @param buffer - ArrayBuffer from FileReader.readAsArrayBuffer()
 * @returns ParsedCSVData with headers and rows (same as csv-parser output)
 */
export async function parseXlsxData(buffer: ArrayBuffer): Promise<ParsedCSVData> {
  const data = (await readSheet(buffer)) as unknown[][];

  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  // Same width for every row (the widest one), like sheet_to_json with defval.
  // reduce (not Math.max(...spread)) so very large sheets don't hit RangeError.
  const width = data.reduce((max, row) => Math.max(max, row.length), 0);
  const normalized = data.map((row) =>
    Array.from({ length: width }, (_, i) => cellToString(row[i]))
  );

  return locateTable(normalized);
}

// How many rows from the top are scanned when looking for the header row.
const HEADER_SCAN_ROWS = 20;

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell === "");
}

function countLeadColumns(row: string[]): number {
  return Object.values(detectLeadColumnMappings(row)).filter((col) => col !== null).length;
}

/**
 * Find the table inside the sheet when it does not start at A1
 * (e.g. a title row above it, or empty columns to its left).
 * - Header row: among the first HEADER_SCAN_ROWS non-empty rows, the one that
 *   matches the most lead columns (ties keep the topmost). When none matches,
 *   the first non-empty row, as before.
 * - Empty rows are dropped, and so are columns that are empty in every row.
 */
function locateTable(normalized: string[][]): ParsedCSVData {
  const nonEmpty = normalized.filter((row) => !isEmptyRow(row));
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [] };
  }

  let headerIndex = 0;
  let bestScore = 0;
  nonEmpty.slice(0, HEADER_SCAN_ROWS).forEach((row, i) => {
    const score = countLeadColumns(row);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  });

  const table = nonEmpty.slice(headerIndex);
  const keep = table[0]
    .map((_, col) => col)
    .filter((col) => table.some((row) => row[col] !== ""));
  const [headers, ...rows] = table.map((row) => keep.map((col) => row[col]));

  return { headers, rows };
}
