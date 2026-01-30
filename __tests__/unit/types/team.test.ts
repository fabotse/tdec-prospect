import { describe, it, expect } from "vitest";
import {
  TEAM_MEMBER_STATUSES,
  USER_ROLES,
  ROLE_LABELS,
  STATUS_LABELS,
  INVITATION_STATUSES,
  inviteUserSchema,
  type TeamMemberStatus,
  type UserRole,
  type InvitationStatus,
} from "@/types/team";

describe("team types", () => {
  // ==============================================
  // TEAM MEMBER STATUS TYPES
  // ==============================================

  describe("TEAM_MEMBER_STATUSES", () => {
    it("should contain all supported statuses", () => {
      expect(TEAM_MEMBER_STATUSES).toContain("active");
      expect(TEAM_MEMBER_STATUSES).toContain("pending");
    });

    it("should have exactly 2 statuses", () => {
      expect(TEAM_MEMBER_STATUSES).toHaveLength(2);
    });
  });

  describe("STATUS_LABELS", () => {
    it("should have Portuguese labels for all statuses", () => {
      expect(STATUS_LABELS.active).toBe("Ativo");
      expect(STATUS_LABELS.pending).toBe("Pendente");
    });

    it("should have a label for every status", () => {
      TEAM_MEMBER_STATUSES.forEach((status) => {
        expect(STATUS_LABELS[status]).toBeDefined();
        expect(typeof STATUS_LABELS[status]).toBe("string");
      });
    });
  });

  // ==============================================
  // USER ROLE TYPES
  // ==============================================

  describe("USER_ROLES", () => {
    it("should contain admin and user roles", () => {
      expect(USER_ROLES).toContain("admin");
      expect(USER_ROLES).toContain("user");
    });

    it("should have exactly 2 roles", () => {
      expect(USER_ROLES).toHaveLength(2);
    });
  });

  describe("ROLE_LABELS", () => {
    it("should have Portuguese labels for all roles", () => {
      expect(ROLE_LABELS.admin).toBe("Admin");
      expect(ROLE_LABELS.user).toBe("Usuário");
    });

    it("should have a label for every role", () => {
      USER_ROLES.forEach((role) => {
        expect(ROLE_LABELS[role]).toBeDefined();
        expect(typeof ROLE_LABELS[role]).toBe("string");
      });
    });
  });

  // ==============================================
  // INVITATION STATUS TYPES
  // ==============================================

  describe("INVITATION_STATUSES", () => {
    it("should contain all supported invitation statuses", () => {
      expect(INVITATION_STATUSES).toContain("pending");
      expect(INVITATION_STATUSES).toContain("accepted");
      expect(INVITATION_STATUSES).toContain("expired");
      expect(INVITATION_STATUSES).toContain("cancelled");
    });

    it("should have exactly 4 statuses", () => {
      expect(INVITATION_STATUSES).toHaveLength(4);
    });
  });

  // ==============================================
  // INVITE USER SCHEMA
  // ==============================================

  describe("inviteUserSchema", () => {
    it("should validate a valid invitation with admin role", () => {
      const validInvite = {
        email: "test@example.com",
        role: "admin",
      };

      const result = inviteUserSchema.safeParse(validInvite);
      expect(result.success).toBe(true);
    });

    it("should validate a valid invitation with user role", () => {
      const validInvite = {
        email: "user@company.com",
        role: "user",
      };

      const result = inviteUserSchema.safeParse(validInvite);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email format", () => {
      const invalidEmails = [
        "notanemail",
        "missing@domain",
        "@nodomain.com",
        "spaces in@email.com",
        "",
      ];

      invalidEmails.forEach((email) => {
        const result = inviteUserSchema.safeParse({ email, role: "user" });
        expect(result.success).toBe(false);
      });
    });

    it("should provide Portuguese error message for invalid email", () => {
      const invalidInvite = {
        email: "invalid-email",
        role: "user",
      };

      const result = inviteUserSchema.safeParse(invalidInvite);
      expect(result.success).toBe(false);

      if (!result.success) {
        const error = result.error.issues[0];
        expect(error?.message).toBe("Email inválido");
      }
    });

    it("should reject invalid role values", () => {
      const invalidRoles = ["superadmin", "guest", "moderator", "", "Admin"];

      invalidRoles.forEach((role) => {
        const result = inviteUserSchema.safeParse({
          email: "test@example.com",
          role,
        });
        expect(result.success).toBe(false);
      });
    });

    it("should accept all valid role values", () => {
      const roles: UserRole[] = ["admin", "user"];

      roles.forEach((role) => {
        const result = inviteUserSchema.safeParse({
          email: "test@example.com",
          role,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should reject missing email", () => {
      const result = inviteUserSchema.safeParse({ role: "user" });
      expect(result.success).toBe(false);
    });

    it("should reject missing role", () => {
      const result = inviteUserSchema.safeParse({ email: "test@example.com" });
      expect(result.success).toBe(false);
    });

    it("should reject empty object", () => {
      const result = inviteUserSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should accept valid email formats", () => {
      const validEmails = [
        "simple@example.com",
        "very.common@example.com",
        "disposable.style.email.with+symbol@example.com",
        "other.email-with-hyphen@example.com",
        "fully-qualified-domain@example.com",
        "user.name+tag+sorting@example.com",
        "x@example.com",
        "example-indeed@strange-example.com",
        "admin@mailserver1.example.org",
        "user@subdomain.example.com",
      ];

      validEmails.forEach((email) => {
        const result = inviteUserSchema.safeParse({ email, role: "user" });
        expect(result.success).toBe(true);
      });
    });
  });

  // ==============================================
  // TYPE ASSERTIONS
  // ==============================================

  describe("type assertions", () => {
    it("TeamMemberStatus should be a union of valid statuses", () => {
      const validStatuses: TeamMemberStatus[] = ["active", "pending"];
      expect(validStatuses).toHaveLength(2);
    });

    it("UserRole should be a union of valid roles", () => {
      const validRoles: UserRole[] = ["admin", "user"];
      expect(validRoles).toHaveLength(2);
    });

    it("InvitationStatus should be a union of valid statuses", () => {
      const validStatuses: InvitationStatus[] = [
        "pending",
        "accepted",
        "expired",
        "cancelled",
      ];
      expect(validStatuses).toHaveLength(4);
    });
  });
});
