import { describe, it, expect } from "vitest";
import {
  isValidRole,
  isAdminRole,
  type UserRole,
  type Tenant,
  type Profile,
  type UserWithProfile,
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
});
