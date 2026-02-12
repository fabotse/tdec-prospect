/**
 * XLSX Parser Utility
 * Story 12.4: AC #2, #7 - Parse .xlsx files into ParsedCSVData
 *
 * Converts Excel .xlsx files to the same ParsedCSVData structure
 * used by csv-parser, enabling the full import pipeline to work
 * transparently with both CSV and Excel files.
 */

import * as XLSX from "xlsx";
import type { ParsedCSVData } from "@/lib/utils/csv-parser";

/**
 * Parse an Excel .xlsx file buffer into ParsedCSVData
 * Always reads the first sheet of the workbook.
 *
 * @param buffer - ArrayBuffer from FileReader.readAsArrayBuffer()
 * @returns ParsedCSVData with headers and rows (same as csv-parser output)
 */
export function parseXlsxData(buffer: ArrayBuffer): ParsedCSVData {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];

  if (!sheetName) {
    return { headers: [], rows: [] };
  }

  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = data[0].map((h) => String(h).trim());
  const rows = data.slice(1).map((row) =>
    row.map((cell) => String(cell).trim())
  );

  return { headers, rows };
}
