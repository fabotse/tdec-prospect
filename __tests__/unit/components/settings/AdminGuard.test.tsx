import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminGuard } from "@/components/settings/AdminGuard";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useUser hook
const mockUseUser = vi.fn();
vi.mock("@/hooks/use-user", () => ({
  useUser: () => mockUseUser(),
}));

describe("AdminGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading State", () => {
    it("should show loading spinner initially", () => {
      mockUseUser.mockReturnValue({
        isLoading: true,
        isAdmin: false,
        user: null,
      });

      const { container } = render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      );

      // Should show spinner, not content
      expect(container.querySelector(".animate-spin")).toBeInTheDocument();
      expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
    });
  });

  describe("Admin Access", () => {
    it("should render children when user is admin", () => {
      mockUseUser.mockReturnValue({
        isLoading: false,
        isAdmin: true,
        user: { id: "user-123", email: "admin@test.com" },
      });

      render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      );

      expect(screen.getByText("Admin Content")).toBeInTheDocument();
    });

    it("should use useUser hook for auth state", () => {
      mockUseUser.mockReturnValue({
        isLoading: false,
        isAdmin: true,
        user: { id: "user-123", email: "admin@test.com" },
      });

      render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      );

      expect(mockUseUser).toHaveBeenCalled();
    });
  });

  describe("Non-Admin Access", () => {
    it("should show fallback when user is not admin", () => {
      mockUseUser.mockReturnValue({
        isLoading: false,
        isAdmin: false,
        user: { id: "user-123", email: "user@test.com" },
      });

      render(
        <AdminGuard fallback={<div>Access Denied</div>}>
          <div>Admin Content</div>
        </AdminGuard>
      );

      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
    });

    it("should redirect to login when user is not authenticated", () => {
      mockUseUser.mockReturnValue({
        isLoading: false,
        isAdmin: false,
        user: null,
      });

      render(
        <AdminGuard fallback={<div>Please login</div>}>
          <div>Admin Content</div>
        </AdminGuard>
      );

      // Should redirect to login
      expect(mockPush).toHaveBeenCalledWith("/login");
      // Should render nothing (redirect pending)
      expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
      expect(screen.queryByText("Please login")).not.toBeInTheDocument();
    });

    it("should render nothing when not authenticated and no fallback", () => {
      mockUseUser.mockReturnValue({
        isLoading: false,
        isAdmin: false,
        user: null,
      });

      const { container } = render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      );

      expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
      expect(container.textContent).toBe("");
    });
  });

  describe("Fallback Prop", () => {
    it("should render nothing when fallback not provided and user is not admin", () => {
      mockUseUser.mockReturnValue({
        isLoading: false,
        isAdmin: false,
        user: { id: "user-123", email: "user@test.com" },
      });

      const { container } = render(
        <AdminGuard>
          <div>Admin Content</div>
        </AdminGuard>
      );

      expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
      expect(container.textContent).toBe("");
    });

    it("should render custom fallback content", () => {
      mockUseUser.mockReturnValue({
        isLoading: false,
        isAdmin: false,
        user: { id: "user-123", email: "user@test.com" },
      });

      render(
        <AdminGuard
          fallback={<div data-testid="custom-fallback">Custom message</div>}
        >
          <div>Admin Content</div>
        </AdminGuard>
      );

      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    });
  });
});
