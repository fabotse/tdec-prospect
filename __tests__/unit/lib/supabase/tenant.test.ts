import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCurrentUserProfile,
  getCurrentTenantId,
  isAdmin,
  getCurrentUserRole,
  getCurrentTenant,
} from "@/lib/supabase/tenant";

/**
 * Tests for tenant helper functions
 * Story: 1.5 - Multi-tenant Database Structure & RLS
 *
 * AC: #1 - queries automatically filtered by tenant_id
 * AC: #5 - RLS policies automatically filter by tenant_id
 * AC: #6 - Admin role differentiated from User role (FR37)
 */

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe("Tenant Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup query chain mock
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  describe("getCurrentUserProfile", () => {
    it("should return null when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const profile = await getCurrentUserProfile();

      expect(profile).toBeNull();
    });

    it("should return profile when user is authenticated", async () => {
      const mockUser = { id: "user-123" };
      const mockProfile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Test User",
        role: "user",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      const profile = await getCurrentUserProfile();

      expect(profile).toEqual(mockProfile);
      expect(mockFrom).toHaveBeenCalledWith("profiles");
      expect(mockEq).toHaveBeenCalledWith("id", "user-123");
    });

    it("should return null when profile not found", async () => {
      const mockUser = { id: "user-123" };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });

      const profile = await getCurrentUserProfile();

      expect(profile).toBeNull();
    });
  });

  describe("getCurrentTenantId", () => {
    it("should return null when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const tenantId = await getCurrentTenantId();

      expect(tenantId).toBeNull();
    });

    it("should return tenant_id from profile", async () => {
      const mockUser = { id: "user-123" };
      const mockProfile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Test User",
        role: "user",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      const tenantId = await getCurrentTenantId();

      expect(tenantId).toBe("tenant-456");
    });
  });

  describe("isAdmin", () => {
    it("should return false when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const result = await isAdmin();

      expect(result).toBe(false);
    });

    it("should return true when user has admin role", async () => {
      const mockUser = { id: "user-123" };
      const mockProfile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Admin User",
        role: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      const result = await isAdmin();

      expect(result).toBe(true);
    });

    it("should return false when user has user role", async () => {
      const mockUser = { id: "user-123" };
      const mockProfile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Regular User",
        role: "user",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      const result = await isAdmin();

      expect(result).toBe(false);
    });
  });

  describe("getCurrentUserRole", () => {
    it("should return null when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const role = await getCurrentUserRole();

      expect(role).toBeNull();
    });

    it("should return role from profile", async () => {
      const mockUser = { id: "user-123" };
      const mockProfile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Test User",
        role: "admin",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      const role = await getCurrentUserRole();

      expect(role).toBe("admin");
    });
  });

  describe("getCurrentTenant", () => {
    it("should return null when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const tenant = await getCurrentTenant();

      expect(tenant).toBeNull();
    });

    it("should return tenant when user is authenticated", async () => {
      const mockUser = { id: "user-123" };
      const mockProfile = {
        id: "user-123",
        tenant_id: "tenant-456",
        full_name: "Test User",
        role: "user",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const mockTenant = {
        id: "tenant-456",
        name: "Test Company",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // First call for profile
      mockSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      });

      // Second call for tenant
      mockSingle.mockResolvedValueOnce({
        data: mockTenant,
        error: null,
      });

      const tenant = await getCurrentTenant();

      expect(tenant).toEqual(mockTenant);
      expect(mockFrom).toHaveBeenCalledWith("tenants");
    });
  });
});
