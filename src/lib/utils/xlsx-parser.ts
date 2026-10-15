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
import type { ParsedCSVData } from "@/lib/utils/csv-parser";

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

  return { headers: normalized[0], rows: normalized.slice(1) };
}
