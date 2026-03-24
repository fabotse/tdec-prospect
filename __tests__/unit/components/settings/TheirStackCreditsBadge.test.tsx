/**
 * Unit tests for TheirStackCreditsBadge
 * Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
 *
 * Tests:
 * - Returns null when not configured
 * - Returns null when credits not loaded
 * - Renders credits badge on success
 * - Shows destructive style when < 20% remaining
 * - Handles over-usage (used > total)
 * - Handles zero apiCredits without error
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TheirStackCreditsBadge } from "@/app/(dashboard)/settings/integrations/page";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("TheirStackCreditsBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when not configured", () => {
    const { container } = render(
      <TheirStackCreditsBadge isConfigured={false} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("returns null when credits fetch fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { container } = render(
      <TheirStackCreditsBadge isConfigured={true} />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/integrations/theirstack/credits"
      );
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders credits badge on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            apiCredits: 200,
            usedApiCredits: 6,
            uiCredits: 50,
            usedUiCredits: 0,
          },
        }),
    });

    render(<TheirStackCreditsBadge isConfigured={true} />);

    await waitFor(() => {
      expect(screen.getByText("6/200 API credits")).toBeInTheDocument();
    });
  });

  it("shows destructive style when < 20% remaining", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            apiCredits: 200,
            usedApiCredits: 170,
            uiCredits: 50,
            usedUiCredits: 0,
          },
        }),
    });

    render(<TheirStackCreditsBadge isConfigured={true} />);

    await waitFor(() => {
      const badge = screen.getByText("170/200 API credits");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("text-destructive");
    });
  });

  it("handles over-usage (used > total) as low credits", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            apiCredits: 200,
            usedApiCredits: 210,
            uiCredits: 50,
            usedUiCredits: 0,
          },
        }),
    });

    render(<TheirStackCreditsBadge isConfigured={true} />);

    await waitFor(() => {
      const badge = screen.getByText("210/200 API credits");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("text-destructive");
    });
  });

  it("handles zero apiCredits without division error", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            apiCredits: 0,
            usedApiCredits: 0,
            uiCredits: 50,
            usedUiCredits: 0,
          },
        }),
    });

    render(<TheirStackCreditsBadge isConfigured={true} />);

    await waitFor(() => {
      const badge = screen.getByText("0/0 API credits");
      expect(badge).toBeInTheDocument();
      // Should NOT have destructive class (apiCredits > 0 guard prevents it)
      expect(badge.className).not.toContain("text-destructive");
    });
  });
});
