/**
 * Tests for validate-email.ts
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1 - Email format validation + duplicate detection
 */

import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  validateLeadEmails,
} from "@/lib/export/validate-email";
import type { ExportLeadInfo } from "@/lib/export/validate-pre-deploy";

// ==============================================
// isValidEmail
// ==============================================

describe("isValidEmail", () => {
  it("returns true for valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("john.doe@company.co")).toBe(true);
    expect(isValidEmail("name+tag@domain.org")).toBe(true);
  });

  it("returns false for email without @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("returns false for email without domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("returns false for email without TLD", () => {
    expect(isValidEmail("user@domain")).toBe(false);
  });

  it("returns false for email with spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
    expect(isValidEmail("user@ example.com")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(isValidEmail("   ")).toBe(false);
  });

  it("trims whitespace before validation", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });
});

// ==============================================
// validateLeadEmails
// ==============================================

describe("validateLeadEmails", () => {
  const makeLead = (email: string | null, icebreaker?: string): ExportLeadInfo => ({
    email,
    icebreaker,
  });

  it("categorizes valid emails into valid array", () => {
    const leads = [makeLead("a@b.com"), makeLead("c@d.org")];
    const result = validateLeadEmails(leads);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
  });

  it("categorizes invalid emails into invalid array with reason", () => {
    const leads = [makeLead("not-an-email"), makeLead("missing@domain")];
    const result = validateLeadEmails(leads);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid[0].reason).toContain("Email inválido");
    expect(result.invalid[1].reason).toContain("Email inválido");
  });

  it("categorizes leads without email into invalid", () => {
    const leads = [makeLead(null), makeLead("")];
    const result = validateLeadEmails(leads);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid[0].reason).toBe("Email não informado");
    expect(result.invalid[1].reason).toBe("Email não informado");
  });

  it("detects duplicate emails case-insensitively", () => {
    const leads = [
      makeLead("User@Example.com"),
      makeLead("user@example.com"),
      makeLead("USER@EXAMPLE.COM"),
    ];
    const result = validateLeadEmails(leads);
    expect(result.valid).toHaveLength(1);
    expect(result.duplicates).toHaveLength(2);
  });

  it("handles mixed valid, invalid, and duplicate leads", () => {
    const leads = [
      makeLead("ok@test.com"),
      makeLead("bad"),
      makeLead("ok@test.com"),
      makeLead(null),
      makeLead("unique@test.com"),
    ];
    const result = validateLeadEmails(leads);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(2);
    expect(result.duplicates).toHaveLength(1);
  });

  it("returns empty arrays for empty input", () => {
    const result = validateLeadEmails([]);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
  });

  it("trims emails before duplicate comparison", () => {
    const leads = [makeLead("  a@b.com  "), makeLead("a@b.com")];
    const result = validateLeadEmails(leads);
    expect(result.valid).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it("includes email value in invalid reason message", () => {
    const leads = [makeLead("broken@@email")];
    const result = validateLeadEmails(leads);
    expect(result.invalid[0].reason).toBe("Email inválido: broken@@email");
  });
});
