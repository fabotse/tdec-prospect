/**
 * Email Block Types Tests
 * Story 5.3: Email Block Component
 *
 * AC: #6 - Tabela email_blocks no Banco (types)
 * AC: #5 - Campos Editaveis (Zod validation)
 */

import { describe, it, expect } from "vitest";
import {
  transformEmailBlockRow,
  emailBlockDataSchema,
  createEmailBlockSchema,
  updateEmailBlockSchema,
  emailModeSchema,
  DEFAULT_EMAIL_BLOCK_DATA,
  type EmailBlockRow,
} from "@/types/email-block";

describe("Email Block Types", () => {
  describe("transformEmailBlockRow (AC: #6)", () => {
    it("transforms snake_case to camelCase", () => {
      const row: EmailBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 0,
        subject: "Test Subject",
        body: "Test Body",
        email_mode: "initial",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformEmailBlockRow(row);

      expect(result).toEqual({
        id: "block-123",
        campaignId: "campaign-456",
        position: 0,
        subject: "Test Subject",
        body: "Test Body",
        emailMode: "initial",
        createdAt: "2026-02-01T10:00:00Z",
        updatedAt: "2026-02-01T12:00:00Z",
      });
    });

    it("handles null subject and body", () => {
      const row: EmailBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 1,
        subject: null,
        body: null,
        email_mode: "initial",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformEmailBlockRow(row);

      expect(result.subject).toBeNull();
      expect(result.body).toBeNull();
    });

    it("preserves position correctly", () => {
      const row: EmailBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 5,
        subject: null,
        body: null,
        email_mode: "initial",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformEmailBlockRow(row);

      expect(result.position).toBe(5);
    });

    // Story 6.11: Email mode tests
    it("transforms email_mode to emailMode", () => {
      const row: EmailBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 0,
        subject: "Test",
        body: "Test",
        email_mode: "follow-up",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformEmailBlockRow(row);

      expect(result.emailMode).toBe("follow-up");
    });

    it("defaults emailMode to initial when email_mode is undefined", () => {
      // Using type assertion to simulate legacy data without email_mode
      const row = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 0,
        subject: "Test",
        body: "Test",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      } as EmailBlockRow;

      const result = transformEmailBlockRow(row);

      expect(result.emailMode).toBe("initial");
    });
  });

  describe("DEFAULT_EMAIL_BLOCK_DATA", () => {
    it("has empty strings for subject and body", () => {
      expect(DEFAULT_EMAIL_BLOCK_DATA.subject).toBe("");
      expect(DEFAULT_EMAIL_BLOCK_DATA.body).toBe("");
    });

    // Story 6.11: Default mode is 'initial'
    it("has emailMode defaulting to 'initial' (Story 6.11 AC #4.2)", () => {
      expect(DEFAULT_EMAIL_BLOCK_DATA.emailMode).toBe("initial");
    });
  });

  // Story 6.11: Email mode schema tests
  describe("emailModeSchema (Story 6.11 AC #2)", () => {
    it("accepts 'initial' mode", () => {
      const result = emailModeSchema.safeParse("initial");
      expect(result.success).toBe(true);
    });

    it("accepts 'follow-up' mode", () => {
      const result = emailModeSchema.safeParse("follow-up");
      expect(result.success).toBe(true);
    });

    it("rejects invalid mode values", () => {
      const result = emailModeSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = emailModeSchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });

  describe("emailBlockDataSchema (AC: #5)", () => {
    it("validates valid email block data", () => {
      const result = emailBlockDataSchema.safeParse({
        subject: "Test Subject",
        body: "Test Body",
      });
      expect(result.success).toBe(true);
    });

    it("validates empty strings", () => {
      const result = emailBlockDataSchema.safeParse({
        subject: "",
        body: "",
      });
      expect(result.success).toBe(true);
    });

    it("rejects subject exceeding 200 characters", () => {
      const longSubject = "a".repeat(201);
      const result = emailBlockDataSchema.safeParse({
        subject: longSubject,
        body: "Test Body",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Assunto muito longo");
      }
    });

    it("accepts subject at exactly 200 characters", () => {
      const maxSubject = "a".repeat(200);
      const result = emailBlockDataSchema.safeParse({
        subject: maxSubject,
        body: "Test Body",
      });
      expect(result.success).toBe(true);
    });

    it("accepts body text up to 50000 characters", () => {
      const longBody = "a".repeat(50000);
      const result = emailBlockDataSchema.safeParse({
        subject: "Test Subject",
        body: longBody,
      });
      expect(result.success).toBe(true);
    });

    it("rejects body exceeding 50000 characters", () => {
      const tooLongBody = "a".repeat(50001);
      const result = emailBlockDataSchema.safeParse({
        subject: "Test Subject",
        body: tooLongBody,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Conteudo muito longo");
      }
    });
  });

  describe("createEmailBlockSchema", () => {
    it("validates valid create input", () => {
      const result = createEmailBlockSchema.safeParse({
        campaignId: "550e8400-e29b-41d4-a716-446655440000",
        position: 0,
        subject: "Test Subject",
        body: "Test Body",
      });
      expect(result.success).toBe(true);
    });

    it("validates without optional subject and body", () => {
      const result = createEmailBlockSchema.safeParse({
        campaignId: "550e8400-e29b-41d4-a716-446655440000",
        position: 0,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid campaignId", () => {
      const result = createEmailBlockSchema.safeParse({
        campaignId: "not-a-uuid",
        position: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("ID de campanha invalido");
      }
    });

    it("rejects negative position", () => {
      const result = createEmailBlockSchema.safeParse({
        campaignId: "550e8400-e29b-41d4-a716-446655440000",
        position: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing required fields", () => {
      const result = createEmailBlockSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("updateEmailBlockSchema", () => {
    it("validates valid update input", () => {
      const result = updateEmailBlockSchema.safeParse({
        position: 1,
        subject: "Updated Subject",
        body: "Updated Body",
      });
      expect(result.success).toBe(true);
    });

    it("validates partial update with only subject", () => {
      const result = updateEmailBlockSchema.safeParse({
        subject: "Updated Subject",
      });
      expect(result.success).toBe(true);
    });

    it("validates partial update with only body", () => {
      const result = updateEmailBlockSchema.safeParse({
        body: "Updated Body",
      });
      expect(result.success).toBe(true);
    });

    it("validates empty update object", () => {
      const result = updateEmailBlockSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects subject exceeding 200 characters", () => {
      const longSubject = "a".repeat(201);
      const result = updateEmailBlockSchema.safeParse({
        subject: longSubject,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative position", () => {
      const result = updateEmailBlockSchema.safeParse({
        position: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});
