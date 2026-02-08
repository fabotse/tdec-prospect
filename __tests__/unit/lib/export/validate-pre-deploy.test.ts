/**
 * Pre-Deploy Validation Tests
 * Story 7.5: Export to Instantly - Fluxo Completo
 * AC: #4 - Validate before starting export
 */

import { describe, it, expect } from "vitest";
import {
  validateInstantlyPreDeploy,
  type ExportLeadInfo,
} from "@/lib/export/validate-pre-deploy";
import type { BuilderBlock } from "@/stores/use-builder-store";

function makeEmailBlock(
  position: number,
  subject: string,
  body: string
): BuilderBlock {
  return {
    id: `email-${position}`,
    type: "email",
    position,
    data: { subject, body },
  };
}

function makeDelayBlock(position: number): BuilderBlock {
  return {
    id: `delay-${position}`,
    type: "delay",
    position,
    data: { delayValue: 3, delayUnit: "days" },
  };
}

const validLead: ExportLeadInfo = {
  email: "user@example.com",
  icebreaker: "Vi seu post sobre IA",
};

const leadWithoutIcebreaker: ExportLeadInfo = {
  email: "user2@example.com",
  icebreaker: null,
};

const leadWithoutEmail: ExportLeadInfo = {
  email: null,
  icebreaker: "Icebreaker text",
};

describe("validateInstantlyPreDeploy", () => {
  it("should return valid when all conditions are met", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "Subject", "Body")],
      leads: [validLead],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should return error when no leads have email", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "Subject", "Body")],
      leads: [leadWithoutEmail],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Nenhum lead com email");
  });

  it("should return error when leads array is empty", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "Subject", "Body")],
      leads: [],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Nenhum lead com email");
  });

  it("should return error when no email blocks have subject AND body", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "", ""), makeDelayBlock(1)],
      leads: [validLead],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Nenhum email completo")
    );
  });

  it("should return error when no sending accounts selected", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "Subject", "Body")],
      leads: [validLead],
      sendingAccounts: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Nenhuma sending account")
    );
  });

  it("should return all errors when multiple conditions fail", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [],
      leads: [],
      sendingAccounts: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("should return warning for leads without icebreaker", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "Subject", "Body")],
      leads: [validLead, leadWithoutIcebreaker],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("1 lead(s) sem icebreaker");
  });

  it("should return warning for partial email blocks (subject only)", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [
        makeEmailBlock(0, "Complete", "Full body"),
        makeEmailBlock(1, "Subject only", ""),
      ],
      leads: [validLead],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("1 email(s) com assunto ou corpo incompleto")
    );
  });

  it("should return warning for partial email blocks (body only)", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [
        makeEmailBlock(0, "Complete", "Full body"),
        makeEmailBlock(1, "", "Body only"),
      ],
      leads: [validLead],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it("should count multiple leads without icebreaker correctly", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "Subject", "Body")],
      leads: [
        validLead,
        leadWithoutIcebreaker,
        { email: "a@b.com", icebreaker: "" },
        { email: "c@d.com", icebreaker: null },
      ],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toContain("3 lead(s) sem icebreaker");
  });

  it("should treat leads with empty string email as no email", () => {
    const result = validateInstantlyPreDeploy({
      blocks: [makeEmailBlock(0, "Subject", "Body")],
      leads: [{ email: "", icebreaker: null }, { email: "  ", icebreaker: null }],
      sendingAccounts: ["sender@example.com"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Nenhum lead com email");
  });
});
