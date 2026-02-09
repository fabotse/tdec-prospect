/**
 * CSV & Clipboard Export Hook
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1, #2, #3 - Client-side orchestration for CSV download and clipboard copy
 *
 * Provides three export methods:
 * - exportToCsv: CSV with resolved variables (real lead data)
 * - exportToCsvWithVariables: CSV with {{variables}} intact
 * - exportToClipboard: Formatted text copied to clipboard
 */

"use client";

import { useState, useCallback } from "react";
import type { BuilderBlock } from "@/stores/use-builder-store";
import { generateCsvContent, type ExportLeadData } from "@/lib/export/generate-csv";
import { downloadCsvFile, sanitizeFileName } from "@/lib/export/download-csv";
import { formatCampaignForClipboard } from "@/lib/export/format-clipboard";
import { validateCsvExport } from "@/lib/export/validate-csv-export";
import { mapExportError } from "@/lib/export/error-messages";

// ==============================================
// TYPES
// ==============================================

export interface CsvExportParams {
  blocks: BuilderBlock[];
  leads: ExportLeadData[];
  campaignName: string;
}

export interface ClipboardExportParams {
  blocks: BuilderBlock[];
  campaignName: string;
}

export interface CsvExportResult {
  success: boolean;
  rowCount: number;
  error?: string;
}

export interface ClipboardExportResult {
  success: boolean;
  error?: string;
}

interface UseCsvClipboardExportReturn {
  isExporting: boolean;
  exportToCsv: (params: CsvExportParams) => Promise<CsvExportResult>;
  exportToCsvWithVariables: (params: CsvExportParams) => Promise<CsvExportResult>;
  exportToClipboard: (params: ClipboardExportParams) => Promise<ClipboardExportResult>;
}

// ==============================================
// HELPERS
// ==============================================

function buildFileName(campaignName: string): string {
  const sanitized = sanitizeFileName(campaignName);
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${sanitized}-export-${date}.csv`;
}

// ==============================================
// HOOK
// ==============================================

export function useCsvClipboardExport(): UseCsvClipboardExportReturn {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCsv = useCallback(
    async (params: CsvExportParams): Promise<CsvExportResult> => {
      setIsExporting(true);
      try {
        // Validate
        const validation = validateCsvExport({
          blocks: params.blocks,
          leads: params.leads,
        });
        if (!validation.valid) {
          return { success: false, rowCount: 0, error: validation.errors.join("; ") };
        }

        // Generate CSV with resolved variables
        const csvContent = generateCsvContent({
          blocks: params.blocks,
          leads: params.leads,
          campaignName: params.campaignName,
          resolveVariables: true,
        });

        // Count valid leads (rows in CSV)
        const validLeads = params.leads.filter((l) => l.email && l.email.trim() !== "");

        // Download
        const fileName = buildFileName(params.campaignName);
        downloadCsvFile(csvContent, fileName);

        return { success: true, rowCount: validLeads.length };
      } catch (err) {
        const errorInfo = mapExportError(err, "csv");
        return { success: false, rowCount: 0, error: errorInfo.message };
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  const exportToCsvWithVariables = useCallback(
    async (params: CsvExportParams): Promise<CsvExportResult> => {
      setIsExporting(true);
      try {
        // Validate
        const validation = validateCsvExport({
          blocks: params.blocks,
          leads: params.leads,
        });
        if (!validation.valid) {
          return { success: false, rowCount: 0, error: validation.errors.join("; ") };
        }

        // Generate CSV with variables intact
        const csvContent = generateCsvContent({
          blocks: params.blocks,
          leads: params.leads,
          campaignName: params.campaignName,
          resolveVariables: false,
        });

        // Count valid leads
        const validLeads = params.leads.filter((l) => l.email && l.email.trim() !== "");

        // Download
        const fileName = buildFileName(params.campaignName);
        downloadCsvFile(csvContent, fileName);

        return { success: true, rowCount: validLeads.length };
      } catch (err) {
        const errorInfo = mapExportError(err, "csv");
        return { success: false, rowCount: 0, error: errorInfo.message };
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  const exportToClipboard = useCallback(
    async (params: ClipboardExportParams): Promise<ClipboardExportResult> => {
      setIsExporting(true);
      try {
        // Validate blocks only (clipboard doesn't need leads)
        const validation = validateCsvExport({
          blocks: params.blocks,
          leads: [],
          isClipboard: true,
        });
        if (!validation.valid) {
          return { success: false, error: validation.errors.join("; ") };
        }

        // Format for clipboard
        const formatted = formatCampaignForClipboard({
          blocks: params.blocks,
          campaignName: params.campaignName,
        });

        // Copy directly — avoid double toast from copyToClipboard utility
        await navigator.clipboard.writeText(formatted);

        return { success: true };
      } catch (err) {
        const errorInfo = mapExportError(err, "clipboard");
        return { success: false, error: errorInfo.message };
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return { isExporting, exportToCsv, exportToCsvWithVariables, exportToClipboard };
}
