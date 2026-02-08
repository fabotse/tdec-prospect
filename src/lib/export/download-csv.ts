/**
 * CSV File Download Utility
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1, #2 - Download CSV file via Blob + programmatic anchor click
 *
 * Creates a Blob from CSV content, generates a temporary download link,
 * triggers the download, then cleans up.
 */

// ==============================================
// FILENAME SANITIZATION
// ==============================================

/**
 * Sanitize campaign name for use as a filename.
 * Removes invalid characters, replaces spaces with hyphens, lowercases.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 100);
}

// ==============================================
// DOWNLOAD FUNCTION
// ==============================================

/**
 * Download CSV content as a file.
 *
 * Creates an invisible anchor element, triggers a click, then cleans up.
 * The Blob uses text/csv;charset=utf-8 MIME type.
 *
 * @param csvContent - CSV string content (with BOM if needed)
 * @param fileName - Full filename including .csv extension
 */
export function downloadCsvFile(csvContent: string, fileName: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}
