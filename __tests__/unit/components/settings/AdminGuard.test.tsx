import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminGuard } from "@/components/settings/AdminGuard";

// Mock next/navigation
const mockPush = vi.fn();
const mockUsePathname = vi.fn(() => "/settings/integrations");
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockUsePathname(),
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

  // Story 23.5: o não-admin passa só nos caminhos liberados
  describe("nonAdminPaths", () => {
    const sdr = {
      isLoading: false,
      isAdmin: false,
      user: { id: "user-123", email: "sdr@test.com" },
    };

    it("renders children for non-admin on a released path", () => {
      mockUseUser.mockReturnValue(sdr);
      mockUsePathname.mockReturnValue("/settings/suppression");

      render(
        <AdminGuard nonAdminPaths={["/settings/suppression"]} fallback={<div>Access Denied</div>}>
          <div>Suppression</div>
        </AdminGuard>
      );

      expect(screen.getByText("Suppression")).toBeInTheDocument();
      expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
    });

    it("keeps the fallback for non-admin on any other settings path", () => {
      mockUseUser.mockReturnValue(sdr);
      mockUsePathname.mockReturnValue("/settings/integrations");

      render(
        <AdminGuard nonAdminPaths={["/settings/suppression"]} fallback={<div>Access Denied</div>}>
          <div>Integrations</div>
        </AdminGuard>
      );

      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByText("Integrations")).not.toBeInTheDocument();
    });

    it("keeps the fallback on a released path when nonAdminPaths is not passed", () => {
      mockUseUser.mockReturnValue(sdr);
      mockUsePathname.mockReturnValue("/settings/suppression");

      render(
        <AdminGuard fallback={<div>Access Denied</div>}>
          <div>Suppression</div>
        </AdminGuard>
      );

      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });
});
