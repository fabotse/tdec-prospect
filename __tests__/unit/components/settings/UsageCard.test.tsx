/**
 * UsageCard Component Tests
 * Story: 6.5.8 - Apify Cost Tracking
 *
 * AC #3: Admin Settings Page - Usage Section
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UsageCard } from "@/components/settings/UsageCard";
import type { UsageStatistics } from "@/types/api-usage";

const mockStatistics: UsageStatistics = {
  serviceName: "apify",
  totalCalls: 150,
  totalPosts: 450,
  totalCost: 0.45,
  avgPostsPerLead: 3.0,
  lastUsage: "2026-02-04T14:30:00Z",
};

describe("UsageCard (AC #3)", () => {
  describe("Loading State", () => {
    it("shows skeleton while loading", () => {
      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={null}
          isLoading={true}
        />
      );

      // Should show skeleton animation
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("shows empty message when no statistics", () => {
      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={null}
          isLoading={false}
        />
      );

      expect(screen.getByText("Nenhum uso registrado")).toBeInTheDocument();
      expect(screen.getByText("Apify - Icebreakers Premium")).toBeInTheDocument();
    });
  });

  describe("Statistics Display (AC #3)", () => {
    it("renders all statistics correctly", () => {
      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={mockStatistics}
          isLoading={false}
        />
      );

      // Service label
      expect(screen.getByText("Apify - Icebreakers Premium")).toBeInTheDocument();

      // Statistics values
      expect(screen.getByTestId("usage-calls-apify")).toHaveTextContent("150");
      expect(screen.getByTestId("usage-cost-apify")).toHaveTextContent("$0.4500");
      expect(screen.getByTestId("usage-posts-apify")).toHaveTextContent("450");
      expect(screen.getByTestId("usage-avg-apify")).toHaveTextContent("3.0");
    });

    it("formats cost with 4 decimal places", () => {
      const statsWithSmallCost: UsageStatistics = {
        ...mockStatistics,
        totalCost: 0.003,
      };

      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={statsWithSmallCost}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("usage-cost-apify")).toHaveTextContent("$0.0030");
    });

    it("displays last usage timestamp formatted in Portuguese", () => {
      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={mockStatistics}
          isLoading={false}
        />
      );

      // Should contain "Último uso:" followed by formatted date
      expect(screen.getByText(/Último uso:/)).toBeInTheDocument();
    });

    it("shows dash for zero avgPostsPerLead", () => {
      const statsWithZeroAvg: UsageStatistics = {
        ...mockStatistics,
        avgPostsPerLead: 0,
      };

      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={statsWithZeroAvg}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("usage-avg-apify")).toHaveTextContent("-");
    });

    it("shows 'Nunca' when lastUsage is null", () => {
      const statsWithNoLastUsage: UsageStatistics = {
        ...mockStatistics,
        lastUsage: null,
      };

      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={statsWithNoLastUsage}
          isLoading={false}
        />
      );

      expect(screen.getByText(/Nunca/)).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has testid for the card", () => {
      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={mockStatistics}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("usage-card-apify")).toBeInTheDocument();
    });

    it("uses semantic heading for service label", () => {
      render(
        <UsageCard
          serviceName="apify"
          serviceLabel="Apify - Icebreakers Premium"
          statistics={mockStatistics}
          isLoading={false}
        />
      );

      // CardTitle renders as h3
      const heading = screen.getByText("Apify - Icebreakers Premium");
      expect(heading).toBeInTheDocument();
    });
  });

  describe("Different Services", () => {
    it("renders correctly for apollo service", () => {
      const apolloStats: UsageStatistics = {
        serviceName: "apollo",
        totalCalls: 50,
        totalPosts: 0,
        totalCost: 0,
        avgPostsPerLead: 0,
        lastUsage: "2026-02-01T10:00:00Z",
      };

      render(
        <UsageCard
          serviceName="apollo"
          serviceLabel="Apollo - Busca de Leads"
          statistics={apolloStats}
          isLoading={false}
        />
      );

      expect(screen.getByText("Apollo - Busca de Leads")).toBeInTheDocument();
      expect(screen.getByTestId("usage-card-apollo")).toBeInTheDocument();
      expect(screen.getByTestId("usage-calls-apollo")).toHaveTextContent("50");
    });
  });
});
