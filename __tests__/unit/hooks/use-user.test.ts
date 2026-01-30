import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUser } from "@/hooks/use-user";

// Mock Supabase client
const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUnsubscribe = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: mockFrom,
  }),
}));

describe("useUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });

    // Setup profile query chain mock
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  describe("Initial State", () => {
    it("should start with loading state", () => {
      mockGetUser.mockImplementation(
        () => new Promise(() => {}) // Never resolves to keep loading
      );

      const { result } = renderHook(() => useUser());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.user).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("Successful User Fetch", () => {
    it("should return user data after fetch", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
        user_metadata: { name: "Test User" },
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" }, // No profile found
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.error).toBeNull();
    });

    it("should return null user when not authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("Profile Fetching", () => {
    it("should fetch profile when user exists", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
      };

      const mockProfile = {
        id: "123",
        tenant_id: "tenant-1",
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

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.profile).toEqual(mockProfile);
      });

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.role).toBe("user");
    });

    it("should identify admin role correctly", async () => {
      const mockUser = {
        id: "123",
        email: "admin@example.com",
      };

      const mockProfile = {
        id: "123",
        tenant_id: "tenant-1",
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

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.profile).toEqual(mockProfile);
      });

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.role).toBe("admin");
    });

    it("should handle missing profile gracefully", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // PGRST116 is the code for "no rows returned"
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "No rows found" },
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.profile).toBeNull();
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.role).toBeNull();
    });

    it("should have isProfileLoading during profile fetch", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Delay profile response
      mockSingle.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: null, error: { code: "PGRST116" } }), 100)
          )
      );

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Profile might still be loading
      expect(result.current.user).toEqual(mockUser);
    });
  });

  describe("Error Handling", () => {
    it("should set error when getUser fails", async () => {
      const mockError = new Error("Auth error");
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: mockError,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.user).toBeNull();
    });

    it("should handle non-Error exceptions", async () => {
      mockGetUser.mockRejectedValue("String error");

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Failed to get user");
    });
  });

  describe("Auth State Changes", () => {
    it("should subscribe to auth state changes", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    it("should update user when auth state changes", async () => {
      const initialUser = {
        id: "123",
        email: "test@example.com",
      };

      const updatedUser = {
        id: "456",
        email: "updated@example.com",
      };

      mockGetUser.mockResolvedValue({
        data: { user: initialUser },
        error: null,
      });

      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });

      // Capture the callback passed to onAuthStateChange
      let authStateCallback: (
        event: string,
        session: { user: typeof updatedUser } | null
      ) => void;
      mockOnAuthStateChange.mockImplementation((callback) => {
        authStateCallback = callback;
        return {
          data: { subscription: { unsubscribe: mockUnsubscribe } },
        };
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.user).toEqual(initialUser);
      });

      // Simulate auth state change wrapped in act()
      await act(async () => {
        authStateCallback!("SIGNED_IN", { user: updatedUser });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(updatedUser);
      });
    });

    it("should clear profile on sign out", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
      };

      const mockProfile = {
        id: "123",
        tenant_id: "tenant-1",
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

      let authStateCallback: (event: string, session: null) => void;
      mockOnAuthStateChange.mockImplementation((callback) => {
        authStateCallback = callback;
        return {
          data: { subscription: { unsubscribe: mockUnsubscribe } },
        };
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.profile).toEqual(mockProfile);
      });

      // Simulate sign out wrapped in act()
      await act(async () => {
        authStateCallback!("SIGNED_OUT", null);
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.profile).toBeNull();
      });
    });
  });

  describe("Cleanup", () => {
    it("should unsubscribe from auth state changes on unmount", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { unmount } = renderHook(() => useUser());

      await waitFor(() => {
        expect(mockOnAuthStateChange).toHaveBeenCalled();
      });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe("Return Value Structure", () => {
    it("should return object with all expected properties", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty("user");
      expect(result.current).toHaveProperty("profile");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("isProfileLoading");
      expect(result.current).toHaveProperty("error");
      expect(result.current).toHaveProperty("isAdmin");
      expect(result.current).toHaveProperty("role");
      expect(result.current).toHaveProperty("refetchProfile");
    });

    it("should have refetchProfile as a function", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetchProfile).toBe("function");
    });
  });
});
