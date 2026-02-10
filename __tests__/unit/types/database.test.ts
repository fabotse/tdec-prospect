import { describe, it, expect } from "vitest";
import {
  isValidRole,
  isAdminRole,
  isValidWhatsAppMessageStatus,
  WHATSAPP_MESSAGE_STATUSES,
  type UserRole,
  type Tenant,
  type Profile,
  type UserWithProfile,
  type WhatsAppMessageStatus,
  type WhatsAppMessage,
  type WhatsAppMessageInsert,
  type WhatsAppMessageUpdate,
  type Database,
} from "@/types/database";

/**
 * Tests for database types and type guards
 * Story: 1.5 - Multi-tenant Database Structure & RLS
 *
 * AC: #4 - profiles table stores user metadata (name, role)
 * AC: #6 - Admin role differentiated from User role (FR37)
 */
describe("Database Types", () => {
  describe("UserRole type", () => {
    it("should accept 'admin' as valid role", () => {
      const role: UserRole = "admin";
      expect(role).toBe("admin");
    });

    it("should accept 'user' as valid role", () => {
      const role: UserRole = "user";
      expect(role).toBe("user");
    });
  });

  describe("isValidRole type guard", () => {
    it("should return true for 'admin'", () => {
      expect(isValidRole("admin")).toBe(true);
    });

    it("should return true for 'user'", () => {
      expect(isValidRole("user")).toBe(true);
    });

    it("should return false for invalid roles", () => {
      expect(isValidRole("superadmin")).toBe(false);
      expect(isValidRole("guest")).toBe(false);
      expect(isValidRole("")).toBe(false);
      expect(isValidRole("Admin")).toBe(false); // case sensitive
    });
  });

  describe("isAdminRole helper", () => {
    it("should return true for admin role", () => {
      expect(isAdminRole("admin")).toBe(true);
    });

    it("should return false for user role", () => {
      expect(isAdminRole("user")).toBe(false);
    });
  });

  describe("Tenant interface", () => {
    it("should accept valid tenant object", () => {
      const tenant: Tenant = {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Test Company",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe("Test Company");
      expect(tenant.created_at).toBeDefined();
      expect(tenant.updated_at).toBeDefined();
    });
  });

  describe("Profile interface", () => {
    it("should accept valid profile object with admin role", () => {
      const profile: Profile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Admin User",
        role: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(profile.role).toBe("admin");
      expect(profile.tenant_id).toBeDefined();
    });

    it("should accept valid profile object with user role", () => {
      const profile: Profile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Regular User",
        role: "user",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(profile.role).toBe("user");
    });

    it("should accept null full_name", () => {
      const profile: Profile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: null,
        role: "user",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      expect(profile.full_name).toBeNull();
    });
  });

  describe("UserWithProfile interface", () => {
    it("should accept user with profile", () => {
      const userWithProfile: UserWithProfile = {
        id: "user-123",
        email: "user@example.com",
        profile: {
          id: "user-123",
          tenant_id: "tenant-456",
          full_name: "Test User",
          role: "user",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      expect(userWithProfile.profile).not.toBeNull();
      expect(userWithProfile.profile?.role).toBe("user");
    });

    it("should accept user without profile", () => {
      const userWithProfile: UserWithProfile = {
        id: "user-123",
        email: "user@example.com",
        profile: null,
      };

      expect(userWithProfile.profile).toBeNull();
    });
  });

  // ==============================================
  // WHATSAPP MESSAGE TYPES (Story 11.2)
  // ==============================================

  describe("WhatsAppMessageStatus type", () => {
    it("should accept all valid statuses", () => {
      const statuses: WhatsAppMessageStatus[] = [
        "pending",
        "sent",
        "delivered",
        "read",
        "failed",
      ];
      expect(statuses).toHaveLength(5);
      statuses.forEach((s) => expect(typeof s).toBe("string"));
    });
  });

  describe("WHATSAPP_MESSAGE_STATUSES constant", () => {
    it("should contain exactly 5 statuses", () => {
      expect(WHATSAPP_MESSAGE_STATUSES).toHaveLength(5);
    });

    it("should contain all expected statuses in order", () => {
      expect(WHATSAPP_MESSAGE_STATUSES).toEqual([
        "pending",
        "sent",
        "delivered",
        "read",
        "failed",
      ]);
    });

    it("should be a fixed-length tuple (as const)", () => {
      // as const produces a readonly tuple at compile time
      // At runtime, verify it's an array with fixed expected content
      expect(Array.isArray(WHATSAPP_MESSAGE_STATUSES)).toBe(true);
      expect(WHATSAPP_MESSAGE_STATUSES).toHaveLength(5);
    });
  });

  describe("isValidWhatsAppMessageStatus type guard", () => {
    it("should return true for all valid statuses", () => {
      expect(isValidWhatsAppMessageStatus("pending")).toBe(true);
      expect(isValidWhatsAppMessageStatus("sent")).toBe(true);
      expect(isValidWhatsAppMessageStatus("delivered")).toBe(true);
      expect(isValidWhatsAppMessageStatus("read")).toBe(true);
      expect(isValidWhatsAppMessageStatus("failed")).toBe(true);
    });

    it("should return false for invalid statuses", () => {
      expect(isValidWhatsAppMessageStatus("queued")).toBe(false);
      expect(isValidWhatsAppMessageStatus("cancelled")).toBe(false);
      expect(isValidWhatsAppMessageStatus("")).toBe(false);
      expect(isValidWhatsAppMessageStatus("Pending")).toBe(false);
      expect(isValidWhatsAppMessageStatus("SENT")).toBe(false);
    });
  });

  describe("WhatsAppMessage interface", () => {
    const validMessage: WhatsAppMessage = {
      id: "msg-uuid-001",
      tenant_id: "tenant-uuid-001",
      campaign_id: "campaign-uuid-001",
      lead_id: "lead-uuid-001",
      phone: "551199999999",
      message: "Olá, tudo bem?",
      status: "pending",
      external_message_id: null,
      external_zaap_id: null,
      error_message: null,
      sent_at: null,
      created_at: "2026-02-10T00:00:00Z",
      updated_at: "2026-02-10T00:00:00Z",
    };

    it("should accept valid message with all required fields", () => {
      expect(validMessage.id).toBeDefined();
      expect(validMessage.tenant_id).toBeDefined();
      expect(validMessage.campaign_id).toBeDefined();
      expect(validMessage.lead_id).toBeDefined();
      expect(validMessage.phone).toBe("551199999999");
      expect(validMessage.message).toBe("Olá, tudo bem?");
      expect(validMessage.status).toBe("pending");
    });

    it("should accept null for nullable fields", () => {
      expect(validMessage.external_message_id).toBeNull();
      expect(validMessage.external_zaap_id).toBeNull();
      expect(validMessage.error_message).toBeNull();
      expect(validMessage.sent_at).toBeNull();
    });

    it("should accept message with external IDs populated", () => {
      const sentMessage: WhatsAppMessage = {
        ...validMessage,
        status: "sent",
        external_message_id: "D241XXXX732339502B68",
        external_zaap_id: "3999984263738042930CD6ECDE9VDWSA",
        sent_at: "2026-02-10T12:00:00Z",
      };
      expect(sentMessage.external_message_id).toBe("D241XXXX732339502B68");
      expect(sentMessage.external_zaap_id).toBe(
        "3999984263738042930CD6ECDE9VDWSA"
      );
      expect(sentMessage.sent_at).toBeDefined();
    });

    it("should accept message with error", () => {
      const failedMessage: WhatsAppMessage = {
        ...validMessage,
        status: "failed",
        error_message: "Número inválido",
      };
      expect(failedMessage.status).toBe("failed");
      expect(failedMessage.error_message).toBe("Número inválido");
    });
  });

  describe("WhatsAppMessageInsert type", () => {
    it("should require mandatory fields and allow optional auto-generated fields", () => {
      const insert: WhatsAppMessageInsert = {
        tenant_id: "tenant-uuid-001",
        campaign_id: "campaign-uuid-001",
        lead_id: "lead-uuid-001",
        phone: "551199999999",
        message: "Olá!",
        external_message_id: null,
        external_zaap_id: null,
        error_message: null,
        sent_at: null,
      };
      expect(insert.tenant_id).toBeDefined();
      expect(insert.phone).toBe("551199999999");
    });

    it("should allow omitting id, created_at, updated_at, status", () => {
      const insert: WhatsAppMessageInsert = {
        tenant_id: "tenant-uuid-001",
        campaign_id: "campaign-uuid-001",
        lead_id: "lead-uuid-001",
        phone: "551199999999",
        message: "Teste",
        external_message_id: null,
        external_zaap_id: null,
        error_message: null,
        sent_at: null,
      };
      expect(insert.id).toBeUndefined();
      expect(insert.status).toBeUndefined();
    });

    it("should accept explicit optional fields", () => {
      const insert: WhatsAppMessageInsert = {
        id: "custom-uuid",
        tenant_id: "tenant-uuid-001",
        campaign_id: "campaign-uuid-001",
        lead_id: "lead-uuid-001",
        phone: "551199999999",
        message: "Teste",
        status: "sent",
        external_message_id: "msg-id",
        external_zaap_id: "zaap-id",
        error_message: null,
        sent_at: "2026-02-10T12:00:00Z",
      };
      expect(insert.id).toBe("custom-uuid");
      expect(insert.status).toBe("sent");
    });
  });

  describe("WhatsAppMessageUpdate type", () => {
    it("should allow partial updates", () => {
      const update: WhatsAppMessageUpdate = {
        status: "sent",
      };
      expect(update.status).toBe("sent");
    });

    it("should allow updating external IDs and sent_at", () => {
      const update: WhatsAppMessageUpdate = {
        status: "sent",
        external_message_id: "D241XXXX732339502B68",
        external_zaap_id: "3999984263738042930CD6ECDE9VDWSA",
        sent_at: "2026-02-10T12:00:00Z",
      };
      expect(update.external_message_id).toBeDefined();
      expect(update.external_zaap_id).toBeDefined();
      expect(update.sent_at).toBeDefined();
    });

    it("should allow updating error_message for failures", () => {
      const update: WhatsAppMessageUpdate = {
        status: "failed",
        error_message: "Timeout na API Z-API",
      };
      expect(update.error_message).toBe("Timeout na API Z-API");
    });

    it("should allow empty update object", () => {
      const update: WhatsAppMessageUpdate = {};
      expect(Object.keys(update)).toHaveLength(0);
    });
  });

  describe("Database interface - whatsapp_messages", () => {
    it("should have Row entry matching WhatsAppMessage structure", () => {
      const row: Database["public"]["Tables"]["whatsapp_messages"]["Row"] = {
        id: "msg-uuid-001",
        tenant_id: "tenant-uuid-001",
        campaign_id: "campaign-uuid-001",
        lead_id: "lead-uuid-001",
        phone: "551199999999",
        message: "Olá!",
        status: "pending",
        external_message_id: null,
        external_zaap_id: null,
        error_message: null,
        sent_at: null,
        created_at: "2026-02-10T00:00:00Z",
        updated_at: "2026-02-10T00:00:00Z",
      };
      expect(row.id).toBe("msg-uuid-001");
      expect(row.status).toBe("pending");
      expect(Object.keys(row)).toHaveLength(13);
    });

    it("should have Insert entry allowing omission of auto-generated fields", () => {
      const insert: Database["public"]["Tables"]["whatsapp_messages"]["Insert"] =
        {
          tenant_id: "tenant-uuid-001",
          campaign_id: "campaign-uuid-001",
          lead_id: "lead-uuid-001",
          phone: "551199999999",
          message: "Teste",
          external_message_id: null,
          external_zaap_id: null,
          error_message: null,
          sent_at: null,
        };
      expect(insert.tenant_id).toBe("tenant-uuid-001");
      expect(insert.id).toBeUndefined();
      expect(insert.status).toBeUndefined();
    });

    it("should have Update entry allowing partial updates", () => {
      const update: Database["public"]["Tables"]["whatsapp_messages"]["Update"] =
        {
          status: "sent",
        };
      expect(update.status).toBe("sent");
      expect(Object.keys(update)).toHaveLength(1);
    });
  });
});
