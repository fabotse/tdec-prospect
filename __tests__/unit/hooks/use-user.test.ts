import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Supabase client before importing the hook
const mockOnAuthStateChange = vi.fn();
const mockGetSession = vi.fn();
const mockUnsubscribe = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getSession: mockGetSession,
    },
    from: mockFrom,
  }),
}));

describe("useUser", () => {
  // Import hook fresh for each test to reset singleton state
  let useUser: typeof import("@/hooks/use-user").useUser;
  let resetAuthState: typeof import("@/hooks/use-user").resetAuthState;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset modules to get fresh singleton state
    vi.resetModules();

    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });

    // Default: getSession returns no session (logged out)
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    // Setup profile query chain mock
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });

    // Default: no profile found
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116" },
    });

    // Re-import module to reset singleton
    const module = await import("@/hooks/use-user");
    useUser = module.useUser;
    resetAuthState = module.resetAuthState;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with loading state", () => {
      // Auth callback is not triggered, so stays loading
      const { result } = renderHook(() => useUser());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.user).toBeNull();
      expect(result.current.profile).toBeNull();
    });
  });

  describe("Successful User Fetch", () => {
    it("should return user data after auth state change", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
        user_metadata: { name: "Test User" },
      };

      // getSession returns session with user (simulates logged in state)
      mockGetSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
    });

    it("should return null user when not authenticated", async () => {
      // getSession returns no session (logged out - default setup)
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.profile).toBeNull();
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

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      mockGetSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null,
      });

      const { result } = renderHook(() => useUser());

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

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      mockGetSession.mockResolvedValue({
        data: { session: { user: mockUser } },
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

      // PGRST116 is the code for "no rows returned"
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "No rows found" },
      });

      mockGetSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null,
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
  });

  describe("Auth State Changes", () => {
    it("should subscribe to auth state changes", async () => {
      // getSession returns no session
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockOnAuthStateChange).toHaveBeenCalled();
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

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      // Start with logged in session
      mockGetSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null,
      });

      let authStateCallback: (event: string, session: unknown) => void;
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

      // Simulate sign out wrapped in act() - after initial load is complete
      await act(async () => {
        authStateCallback!("SIGNED_OUT", null);
        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.profile).toBeNull();
      });
    });
  });

  describe("resetAuthState", () => {
    it("should reset state to logged out state", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
      };

      mockGetSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      // Reset auth state
      act(() => {
        resetAuthState();
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.profile).toBeNull();
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("Return Value Structure", () => {
    it("should return object with all expected properties", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
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
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetchProfile).toBe("function");
    });

    it("should return null error in current implementation", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Current implementation always returns null error
      expect(result.current.error).toBeNull();
    });
  });
});
