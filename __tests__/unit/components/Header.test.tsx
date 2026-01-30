import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Header } from "@/components/common/Header";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock useUser hook
const mockSignOut = vi.fn().mockResolvedValue({});
vi.mock("@/hooks/use-user", () => ({
  useUser: () => ({
    user: {
      email: "test@example.com",
      user_metadata: { name: "Test User" },
    },
    isLoading: false,
    error: null,
  }),
}));

// Mock Supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}));

// Mock ThemeToggle component
vi.mock("@/components/common/ThemeToggle", () => ({
  ThemeToggle: () => (
    <button aria-label="theme toggle mock">Toggle Theme</button>
  ),
}));

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render header with banner role", () => {
      render(<Header />);

      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("should render with 64px height (h-16)", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("h-16");
    });

    it("should render theme toggle", () => {
      render(<Header />);

      expect(screen.getByLabelText(/theme toggle/i)).toBeInTheDocument();
    });

    it("should render user display name", () => {
      render(<Header />);

      // user_metadata.name takes precedence
      expect(screen.getByText(/Test User/i)).toBeInTheDocument();
    });

    it("should render user avatar placeholder", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      const avatarContainer = header.querySelector(".rounded-full");
      expect(avatarContainer).toBeInTheDocument();
    });

    it("should render logout button", () => {
      render(<Header />);

      expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
    });
  });

  describe("Sidebar Width Integration", () => {
    it("should apply default sidebar width offset", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      expect(header).toHaveStyle({ left: "240px" });
    });

    it("should apply custom sidebar width offset", () => {
      render(<Header sidebarWidth={64} />);

      const header = screen.getByRole("banner");
      expect(header).toHaveStyle({ left: "64px" });
    });

    it("should apply transition for sidebar width changes", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      expect(header.style.transition).toContain("200ms");
    });
  });

  describe("Layout", () => {
    it("should position header fixed at top right", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("fixed", "top-0", "right-0");
    });

    it("should have flex layout with space-between", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("flex", "items-center", "justify-between");
    });

    it("should have border at bottom", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("border-b");
    });
  });

  describe("Responsive Behavior", () => {
    it("should hide user name on small screens", () => {
      render(<Header />);

      const userName = screen.getByText(/Test User/i);
      expect(userName).toHaveClass("hidden", "sm:inline");
    });
  });

  describe("Z-Index", () => {
    it("should have appropriate z-index for layering", () => {
      render(<Header />);

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("z-10");
    });
  });

  describe("Logout Functionality", () => {
    it("should call signOut when logout button is clicked", async () => {
      render(<Header />);

      const logoutButton = screen.getByRole("button", { name: /sair/i });
      fireEvent.click(logoutButton);

      expect(mockSignOut).toHaveBeenCalled();
    });

    it("should redirect to login after logout", async () => {
      render(<Header />);

      const logoutButton = screen.getByRole("button", { name: /sair/i });
      fireEvent.click(logoutButton);

      // Wait for async operation
      await vi.waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login");
      });
    });
  });
});
