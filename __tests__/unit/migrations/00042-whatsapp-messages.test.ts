import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Tests for migration 00042_create_whatsapp_messages.sql
 * Story: 11.2 - Schema WhatsApp Messages + Tipos
 *
 * Validates SQL migration structure without executing against a database.
 * AC: #1 - Table with all required columns
 * AC: #2 - ENUM whatsapp_message_status with 5 values
 * AC: #3 - 4 RLS policies
 * AC: #4 - Indexes for common access patterns
 * AC: #7 - Trigger update_updated_at_column
 * AC: #8 - UNIQUE constraint for idempotency
 */
describe("Migration 00042: whatsapp_messages", () => {
  let sql: string;

  beforeAll(() => {
    const migrationPath = resolve(
      __dirname,
      "../../../supabase/migrations/00042_create_whatsapp_messages.sql"
    );
    sql = readFileSync(migrationPath, "utf-8");
  });

  describe("ENUM definition (AC #2)", () => {
    it("should create whatsapp_message_status ENUM with DO $$ block", () => {
      expect(sql).toContain("DO $$ BEGIN");
      expect(sql).toContain(
        "CREATE TYPE public.whatsapp_message_status AS ENUM"
      );
      expect(sql).toContain("EXCEPTION");
      expect(sql).toContain("WHEN duplicate_object THEN NULL");
    });

    it("should define all 5 status values", () => {
      const statuses = ["pending", "sent", "delivered", "read", "failed"];
      statuses.forEach((status) => {
        expect(sql).toContain(`'${status}'`);
      });
    });
  });

  describe("Table creation (AC #1)", () => {
    it("should create whatsapp_messages table", () => {
      expect(sql).toContain("CREATE TABLE public.whatsapp_messages");
    });

    it("should have UUID primary key with default", () => {
      expect(sql).toContain(
        "id UUID PRIMARY KEY DEFAULT gen_random_uuid()"
      );
    });

    it("should have all required columns", () => {
      const requiredColumns = [
        "tenant_id UUID NOT NULL",
        "campaign_id UUID NOT NULL",
        "lead_id UUID NOT NULL",
        "phone VARCHAR(20) NOT NULL",
        "message TEXT NOT NULL",
        "external_message_id VARCHAR(255)",
        "external_zaap_id VARCHAR(255)",
        "error_message TEXT",
        "sent_at TIMESTAMPTZ",
        "created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
      ];
      requiredColumns.forEach((col) => {
        expect(sql).toContain(col);
      });
    });

    it("should use whatsapp_message_status ENUM for status column with default pending", () => {
      expect(sql).toContain(
        "status public.whatsapp_message_status NOT NULL DEFAULT 'pending'"
      );
    });

    it("should have foreign keys with ON DELETE CASCADE", () => {
      expect(sql).toContain(
        "REFERENCES public.tenants(id) ON DELETE CASCADE"
      );
      expect(sql).toContain(
        "REFERENCES public.campaigns(id) ON DELETE CASCADE"
      );
      expect(sql).toContain(
        "REFERENCES public.leads(id) ON DELETE CASCADE"
      );
    });
  });

  describe("Trigger (AC #7)", () => {
    it("should create trigger for updated_at auto-update", () => {
      expect(sql).toContain(
        "CREATE TRIGGER update_whatsapp_messages_updated_at"
      );
      expect(sql).toContain("BEFORE UPDATE ON public.whatsapp_messages");
      expect(sql).toContain(
        "EXECUTE FUNCTION public.update_updated_at_column()"
      );
    });
  });

  describe("Indexes (AC #4)", () => {
    it("should create tenant_id index", () => {
      expect(sql).toContain("idx_whatsapp_messages_tenant_id");
      expect(sql).toContain(
        "ON public.whatsapp_messages(tenant_id)"
      );
    });

    it("should create composite index (campaign_id, status)", () => {
      expect(sql).toContain("idx_whatsapp_messages_campaign_status");
      expect(sql).toContain(
        "ON public.whatsapp_messages(campaign_id, status)"
      );
    });

    it("should create partial index for external_message_id WHERE NOT NULL", () => {
      expect(sql).toContain("idx_whatsapp_messages_external_message_id");
      expect(sql).toContain("WHERE external_message_id IS NOT NULL");
    });
  });

  describe("UNIQUE constraint (AC #8)", () => {
    it("should create idempotency constraint on (campaign_id, lead_id, external_message_id)", () => {
      expect(sql).toContain("uq_whatsapp_messages_idempotency");
      expect(sql).toContain(
        "UNIQUE (campaign_id, lead_id, external_message_id)"
      );
    });
  });

  describe("RLS policies (AC #3)", () => {
    it("should enable row level security", () => {
      expect(sql).toContain(
        "ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY"
      );
    });

    it("should create SELECT policy using get_current_tenant_id()", () => {
      expect(sql).toMatch(
        /CREATE POLICY.*FOR SELECT\s+USING \(tenant_id = public\.get_current_tenant_id\(\)\)/s
      );
    });

    it("should create INSERT policy with WITH CHECK", () => {
      expect(sql).toMatch(
        /CREATE POLICY.*FOR INSERT\s+WITH CHECK \(tenant_id = public\.get_current_tenant_id\(\)\)/s
      );
    });

    it("should create UPDATE policy with USING + WITH CHECK", () => {
      expect(sql).toMatch(
        /CREATE POLICY.*FOR UPDATE\s+USING \(tenant_id = public\.get_current_tenant_id\(\)\)\s+WITH CHECK \(tenant_id = public\.get_current_tenant_id\(\)\)/s
      );
    });

    it("should create DELETE policy with USING", () => {
      expect(sql).toMatch(
        /CREATE POLICY.*FOR DELETE\s+USING \(tenant_id = public\.get_current_tenant_id\(\)\)/s
      );
    });

    it("should have exactly 4 RLS policies", () => {
      const policyMatches = sql.match(/CREATE POLICY/g);
      expect(policyMatches).toHaveLength(4);
    });
  });

  describe("Comments", () => {
    it("should have COMMENT ON TABLE", () => {
      expect(sql).toContain("COMMENT ON TABLE public.whatsapp_messages");
    });

    it("should have COMMENT ON critical columns", () => {
      expect(sql).toContain(
        "COMMENT ON COLUMN public.whatsapp_messages.phone"
      );
      expect(sql).toContain(
        "COMMENT ON COLUMN public.whatsapp_messages.status"
      );
      expect(sql).toContain(
        "COMMENT ON COLUMN public.whatsapp_messages.external_message_id"
      );
      expect(sql).toContain(
        "COMMENT ON COLUMN public.whatsapp_messages.external_zaap_id"
      );
      expect(sql).toContain(
        "COMMENT ON COLUMN public.whatsapp_messages.error_message"
      );
      expect(sql).toContain(
        "COMMENT ON COLUMN public.whatsapp_messages.sent_at"
      );
    });
  });
});
