import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppShell, useSidebar } from "@/components/common/AppShell";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/leads"),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock useUser hook
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
      signOut: vi.fn().mockResolvedValue({}),
    },
  }),
}));

// Mock ThemeToggle
vi.mock("@/components/common/ThemeToggle", () => ({
  ThemeToggle: () => <button aria-label="theme toggle">Toggle</button>,
}));

// Helper component to test useSidebar hook
function SidebarConsumer() {
  const { isCollapsed, sidebarWidth, toggleCollapse } = useSidebar();
  return (
    <div data-testid="sidebar-consumer">
      <span data-testid="is-collapsed">{String(isCollapsed)}</span>
      <span data-testid="sidebar-width">{sidebarWidth}</span>
      <button onClick={toggleCollapse} data-testid="toggle-button">
        Toggle
      </button>
    </div>
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Rendering", () => {
    it("should render children", () => {
      render(
        <AppShell>
          <div data-testid="child-content">Test Content</div>
        </AppShell>
      );

      expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });

    it("should render sidebar", () => {
      render(
        <AppShell>
          <div>Content</div>
        </AppShell>
      );

      expect(
        screen.getByRole("navigation", { name: /sidebar/i })
      ).toBeInTheDocument();
    });

    it("should render header", () => {
      render(
        <AppShell>
          <div>Content</div>
        </AppShell>
      );

      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("should render main content area", () => {
      render(
        <AppShell>
          <div>Content</div>
        </AppShell>
      );

      const main = document.querySelector("main");
      expect(main).toBeInTheDocument();
    });
  });

  describe("Layout Structure", () => {
    it("should have min-h-screen container", () => {
      render(
        <AppShell>
          <div>Content</div>
        </AppShell>
      );

      const container = screen
        .getByRole("navigation", { name: /sidebar/i })
        .closest(".min-h-screen");
      expect(container).toBeInTheDocument();
    });

    it("should apply sidebar width to main content margin", () => {
      render(
        <AppShell>
          <div>Content</div>
        </AppShell>
      );

      const main = document.querySelector("main");
      expect(main).toHaveStyle({ marginLeft: "240px" });
    });

    it("should apply padding-top to main for header clearance", () => {
      render(
        <AppShell>
          <div>Content</div>
        </AppShell>
      );

      const main = document.querySelector("main");
      expect(main).toHaveClass("pt-16");
    });
  });

  describe("useSidebar Hook", () => {
    it("should provide sidebar state via context", () => {
      render(
        <AppShell>
          <SidebarConsumer />
        </AppShell>
      );

      expect(screen.getByTestId("is-collapsed")).toHaveTextContent("false");
      expect(screen.getByTestId("sidebar-width")).toHaveTextContent("240");
    });

    it("should throw error when used outside AppShell", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        render(<SidebarConsumer />);
      }).toThrow("useSidebar must be used within an AppShell");

      consoleSpy.mockRestore();
    });
  });

  describe("Collapse Functionality", () => {
    it("should toggle collapsed state when toggle called", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <AppShell>
          <SidebarConsumer />
        </AppShell>
      );

      expect(screen.getByTestId("is-collapsed")).toHaveTextContent("false");
      expect(screen.getByTestId("sidebar-width")).toHaveTextContent("240");

      await user.click(screen.getByTestId("toggle-button"));

      expect(screen.getByTestId("is-collapsed")).toHaveTextContent("true");
      expect(screen.getByTestId("sidebar-width")).toHaveTextContent("64");
    });

    it("should persist collapse state to localStorage", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <AppShell>
          <SidebarConsumer />
        </AppShell>
      );

      await user.click(screen.getByTestId("toggle-button"));

      expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    });

    it("should restore collapse state from localStorage", () => {
      localStorage.setItem("sidebar-collapsed", "true");

      render(
        <AppShell>
          <SidebarConsumer />
        </AppShell>
      );

      expect(screen.getByTestId("is-collapsed")).toHaveTextContent("true");
      expect(screen.getByTestId("sidebar-width")).toHaveTextContent("64");
    });
  });

  describe("Sidebar Width Values", () => {
    it("should use 240px when expanded", () => {
      render(
        <AppShell>
          <SidebarConsumer />
        </AppShell>
      );

      expect(screen.getByTestId("sidebar-width")).toHaveTextContent("240");
    });

    it("should use 64px when collapsed", () => {
      localStorage.setItem("sidebar-collapsed", "true");

      render(
        <AppShell>
          <SidebarConsumer />
        </AppShell>
      );

      expect(screen.getByTestId("sidebar-width")).toHaveTextContent("64");
    });
  });
});
