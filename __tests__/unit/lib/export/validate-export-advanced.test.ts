/**
 * Tests for validate-export-advanced.ts
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1, #2 - Unified advanced validation
 */

import { describe, expect, it, vi } from "vitest";

import {
  validateExportAdvanced,
  type ValidationIssueType,
} from "@/lib/export/validate-export-advanced";
import type { BuilderBlock } from "@/stores/use-builder-store";
import type { ExportLeadInfo } from "@/lib/export/validate-pre-deploy";

// Mock variable-registry
vi.mock("@/lib/export/variable-registry", () => ({
  getVariables: () => [
    { name: "first_name", label: "Nome", leadField: "firstName", template: "{{first_name}}", placeholderLabel: "" },
    { name: "company_name", label: "Empresa", leadField: "companyName", template: "{{company_name}}", placeholderLabel: "" },
    { name: "title", label: "Cargo", leadField: "title", template: "{{title}}", placeholderLabel: "" },
    { name: "ice_breaker", label: "Quebra-gelo", leadField: "icebreaker", template: "{{ice_breaker}}", placeholderLabel: "" },
  ],
}));

// ==============================================
// HELPERS
// ==============================================

const makeEmailBlock = (subject: string, body: string, id = "1"): BuilderBlock => ({
  id,
  type: "email",
  position: 0,
  data: { subject, body },
});

const makeLead = (email: string | null, icebreaker?: string | null): ExportLeadInfo => ({
  email,
  icebreaker,
});

const validLeads = [
  makeLead("a@b.com", "Nice post"),
  makeLead("c@d.com", "Great work"),
];

const validBlocks = [makeEmailBlock("Oi {{first_name}}", "Texto do email")];

// ==============================================
// TESTS
// ==============================================

describe("validateExportAdvanced", () => {
  // --- ALL OK ---
  it("returns valid=true when everything is correct (instantly)", () => {
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads: validLeads,
      platform: "instantly",
      sendingAccounts: ["account1@test.com"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.totalLeads).toBe(2);
    expect(result.summary.validLeads).toBe(2);
  });

  it("returns valid=true when everything is correct (csv)", () => {
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads: validLeads,
      platform: "csv",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --- BLOCKING ERRORS ---
  it("returns error when no leads have email", () => {
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads: [],
      platform: "csv",
    });
    expect(result.valid).toBe(false);
    const errorTypes = result.errors.map((e) => e.type);
    expect(errorTypes).toContain("no_leads_with_email");
  });

  it("returns error when all emails are invalid", () => {
    const leads = [makeLead("bad"), makeLead("worse")];
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads,
      platform: "csv",
    });
    expect(result.valid).toBe(false);
    const errorTypes = result.errors.map((e) => e.type);
    expect(errorTypes).toContain("invalid_email");
  });

  it("returns error when no complete email blocks", () => {
    const blocks = [makeEmailBlock("Subject only", "")];
    const result = validateExportAdvanced({
      blocks,
      leads: validLeads,
      platform: "csv",
    });
    expect(result.valid).toBe(false);
    const errorTypes = result.errors.map((e) => e.type);
    expect(errorTypes).toContain("no_email_blocks");
  });

  it("returns error when no sending accounts for instantly", () => {
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads: validLeads,
      platform: "instantly",
      sendingAccounts: [],
    });
    expect(result.valid).toBe(false);
    const errorTypes = result.errors.map((e) => e.type);
    expect(errorTypes).toContain("no_sending_accounts");
  });

  it("does NOT require sending accounts for csv", () => {
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads: validLeads,
      platform: "csv",
      sendingAccounts: [],
    });
    expect(result.valid).toBe(true);
    const errorTypes = result.errors.map((e) => e.type);
    expect(errorTypes).not.toContain("no_sending_accounts");
  });

  // --- NON-BLOCKING WARNINGS ---
  it("warns about leads without icebreaker", () => {
    const leads = [makeLead("a@b.com"), makeLead("c@d.com", "")];
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads,
      platform: "csv",
    });
    expect(result.valid).toBe(true);
    const warningTypes = result.warnings.map((w) => w.type);
    expect(warningTypes).toContain("no_icebreaker");
  });

  it("warns about duplicate emails", () => {
    const leads = [makeLead("a@b.com", "ib"), makeLead("a@b.com", "ib")];
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads,
      platform: "csv",
    });
    expect(result.valid).toBe(true);
    const warningTypes = result.warnings.map((w) => w.type);
    expect(warningTypes).toContain("duplicate_email");
  });

  it("warns about unknown template variables", () => {
    const blocks = [makeEmailBlock("{{unknown}}", "body text")];
    const result = validateExportAdvanced({
      blocks,
      leads: validLeads,
      platform: "csv",
    });
    expect(result.valid).toBe(true);
    const warningTypes = result.warnings.map((w) => w.type);
    expect(warningTypes).toContain("unknown_variable");
  });

  it("warns about incomplete email blocks", () => {
    const blocks = [
      makeEmailBlock("Complete subject", "Complete body", "1"),
      makeEmailBlock("Only subject", "", "2"),
    ];
    const result = validateExportAdvanced({
      blocks,
      leads: validLeads,
      platform: "csv",
    });
    expect(result.valid).toBe(true);
    const warningTypes = result.warnings.map((w) => w.type);
    expect(warningTypes).toContain("incomplete_block");
  });

  // --- CLIPBOARD SKIPS LEAD VALIDATION ---
  it("skips lead validation for clipboard platform", () => {
    const result = validateExportAdvanced({
      blocks: validBlocks,
      leads: [],
      platform: "clipboard",
    });
    const errorTypes = result.errors.map((e) => e.type);
    expect(errorTypes).not.toContain("no_leads_with_email");
  });

  // --- MIXED SCENARIO ---
  it("handles mixed errors and warnings", () => {
    const leads = [makeLead("valid@test.com"), makeLead("bad")];
    const blocks = [
      makeEmailBlock("{{first_name}}", "{{xyz}}", "1"),
      makeEmailBlock("Only subject", "", "2"),
    ];
    const result = validateExportAdvanced({
      blocks,
      leads,
      platform: "instantly",
      sendingAccounts: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // --- SUGGESTED ACTIONS ---
  it("includes suggested actions on every issue", () => {
    const leads = [makeLead("bad")];
    const blocks = [makeEmailBlock("", "")];
    const result = validateExportAdvanced({
      blocks,
      leads,
      platform: "instantly",
      sendingAccounts: [],
    });
    for (const error of result.errors) {
      expect(error.suggestedAction).toBeTruthy();
    }
  });

  // --- SUMMARY ---
  it("summary reflects correct counts", () => {
    const leads = [
      makeLead("a@b.com", "ib"),
      makeLead("a@b.com", "ib"),
      makeLead("bad"),
      makeLead("c@d.com"),
    ];
    const blocks = [
      makeEmailBlock("S", "B", "1"),
      makeEmailBlock("S", "", "2"),
    ];
    const result = validateExportAdvanced({
      blocks,
      leads,
      platform: "csv",
    });
    expect(result.summary.totalLeads).toBe(4);
    expect(result.summary.validLeads).toBe(2);
    expect(result.summary.invalidLeads).toBe(1);
    expect(result.summary.duplicateLeads).toBe(1);
    expect(result.summary.leadsWithoutIcebreaker).toBe(1);
    expect(result.summary.emailBlocks).toBe(2);
    expect(result.summary.completeEmailBlocks).toBe(1);
  });
});
