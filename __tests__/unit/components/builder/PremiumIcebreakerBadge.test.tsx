/**
 * PremiumIcebreakerBadge Component Tests
 * Story 6.5.7: Icebreaker Integration with Email Generation
 *
 * AC #3: Premium icebreaker indicator in preview
 * AC #6: Icebreaker source display with LinkedIn posts
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { PremiumIcebreakerBadge } from "@/components/builder/PremiumIcebreakerBadge";

// ==============================================
// MOCK DATA
// ==============================================

const mockLinkedInPosts = [
  {
    text: "Estou muito empolgado com as possibilidades de IA em vendas B2B. Testamos varias ferramentas e os resultados sao impressionantes.",
    publishedAt: "2026-02-01T08:00:00Z",
    postUrl: "https://linkedin.com/feed/update/urn:li:activity:123",
  },
  {
    text: "Compartilhando minha experiencia com automacao de prospecao. Os numeros falam por si.",
    publishedAt: "2026-01-28T14:30:00Z",
    postUrl: "https://linkedin.com/feed/update/urn:li:activity:124",
  },
];

// ==============================================
// TESTS
// ==============================================

describe("PremiumIcebreakerBadge", () => {
  describe("Badge Rendering", () => {
    it("should render badge with Sparkles icon (AC #3)", () => {
      render(<PremiumIcebreakerBadge posts={mockLinkedInPosts} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("Icebreaker Premium");
    });

    it("should render with correct variant and style", () => {
      render(<PremiumIcebreakerBadge posts={mockLinkedInPosts} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      expect(badge).toHaveClass("text-xs");
      expect(badge).toHaveClass("gap-1");
    });

    it("should apply custom className", () => {
      render(
        <PremiumIcebreakerBadge
          posts={mockLinkedInPosts}
          className="custom-class"
        />
      );

      const badge = screen.getByTestId("premium-icebreaker-badge");
      expect(badge).toHaveClass("custom-class");
    });
  });

  describe("Tooltip Content", () => {
    it("should show tooltip with LinkedIn posts on hover (AC #6)", async () => {
      const user = userEvent.setup();
      render(<PremiumIcebreakerBadge posts={mockLinkedInPosts} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      await user.hover(badge);

      // Wait for tooltip to appear
      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");
      expect(tooltip).toBeInTheDocument();

      // Check tooltip header
      expect(tooltip).toHaveTextContent("Baseado nos posts do LinkedIn:");

      // Check first post text (truncated to 100 chars)
      expect(tooltip).toHaveTextContent("Estou muito empolgado");
    });

    it("should truncate long post text to 100 characters (AC #6)", async () => {
      const user = userEvent.setup();
      const longPost = {
        text: "A".repeat(150), // 150 character post
        publishedAt: "2026-02-01T08:00:00Z",
      };
      render(<PremiumIcebreakerBadge posts={[longPost]} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      await user.hover(badge);

      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");

      // Should show truncated text with ellipsis
      expect(tooltip).toHaveTextContent("A".repeat(100) + "...");
    });

    it("should show original LinkedIn post links when available (AC #6)", async () => {
      const user = userEvent.setup();
      render(<PremiumIcebreakerBadge posts={mockLinkedInPosts} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      await user.hover(badge);

      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");

      // Check for link text
      const links = tooltip.querySelectorAll('a[href*="linkedin.com"]');
      expect(links.length).toBeGreaterThan(0);

      // Verify link attributes
      const firstLink = links[0];
      expect(firstLink).toHaveAttribute("target", "_blank");
      expect(firstLink).toHaveAttribute("rel", "noopener noreferrer");
      expect(firstLink).toHaveTextContent("Ver post original");
    });

    it("should only show first 2 posts in tooltip", async () => {
      const user = userEvent.setup();
      const threePosts = [
        ...mockLinkedInPosts,
        {
          text: "Third post that should not appear",
          publishedAt: "2026-01-25T10:00:00Z",
        },
      ];
      render(<PremiumIcebreakerBadge posts={threePosts} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      await user.hover(badge);

      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");

      // Should contain first two posts
      expect(tooltip).toHaveTextContent("Estou muito empolgado");
      expect(tooltip).toHaveTextContent("Compartilhando minha experiencia");

      // Should NOT contain third post
      expect(tooltip).not.toHaveTextContent("Third post that should not appear");
    });
  });

  describe("Edge Cases", () => {
    it("should handle null posts gracefully", async () => {
      const user = userEvent.setup();
      render(<PremiumIcebreakerBadge posts={null} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      expect(badge).toBeInTheDocument();

      await user.hover(badge);

      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");
      expect(tooltip).toHaveTextContent(
        "Posts do LinkedIn usados para gerar o icebreaker"
      );
    });

    it("should handle empty posts array gracefully", async () => {
      const user = userEvent.setup();
      render(<PremiumIcebreakerBadge posts={[]} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      expect(badge).toBeInTheDocument();

      await user.hover(badge);

      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");
      expect(tooltip).toHaveTextContent(
        "Posts do LinkedIn usados para gerar o icebreaker"
      );
    });

    it("should handle posts without postUrl", async () => {
      const user = userEvent.setup();
      const postWithoutUrl = [
        {
          text: "Post without URL",
          publishedAt: "2026-02-01T08:00:00Z",
          // No postUrl
        },
      ];
      render(<PremiumIcebreakerBadge posts={postWithoutUrl} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      await user.hover(badge);

      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");

      // Should show post text but no link
      expect(tooltip).toHaveTextContent("Post without URL");
      const links = tooltip.querySelectorAll('a[href*="linkedin.com"]');
      expect(links.length).toBe(0);
    });

    it("should show exact text when under 100 chars (no ellipsis)", async () => {
      const user = userEvent.setup();
      const shortPost = {
        text: "Short post",
        publishedAt: "2026-02-01T08:00:00Z",
      };
      render(<PremiumIcebreakerBadge posts={[shortPost]} />);

      const badge = screen.getByTestId("premium-icebreaker-badge");
      await user.hover(badge);

      const tooltip = await screen.findByTestId("premium-icebreaker-tooltip");

      // Should show full text without ellipsis
      expect(tooltip).toHaveTextContent('"Short post"');
      expect(tooltip).not.toHaveTextContent("...");
    });
  });
});
