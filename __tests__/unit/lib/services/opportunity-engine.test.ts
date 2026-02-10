import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateOpportunityWindow,
  DEFAULT_MIN_OPENS,
  DEFAULT_PERIOD_DAYS,
  getDefaultConfig,
} from "@/lib/services/opportunity-engine";
import { createMockLeadTracking } from "../../../helpers/mock-data";
import type { OpportunityConfig } from "@/types/tracking";

describe("evaluateOpportunityWindow", () => {
  const baseConfig: OpportunityConfig = {
    id: "config-1",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    minOpens: 3,
    periodDays: 7,
    isActive: true,
    createdAt: "2026-02-10T10:00:00.000Z",
    updatedAt: "2026-02-10T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna leads com openCount >= minOpens e lastOpenAt dentro do periodo", () => {
    const leads = [
      createMockLeadTracking({
        leadEmail: "qualificado@test.com",
        openCount: 5,
        lastOpenAt: "2026-02-08T14:00:00.000Z",
      }),
    ];

    const result = evaluateOpportunityWindow(leads, baseConfig);

    expect(result).toHaveLength(1);
    expect(result[0].leadEmail).toBe("qualificado@test.com");
    expect(result[0].isInOpportunityWindow).toBe(true);
  });

  it("exclui leads com openCount abaixo do threshold", () => {
    const leads = [
      createMockLeadTracking({
        leadEmail: "poucos-opens@test.com",
        openCount: 2,
        lastOpenAt: "2026-02-08T14:00:00.000Z",
      }),
    ];

    const result = evaluateOpportunityWindow(leads, baseConfig);

    expect(result).toHaveLength(0);
  });

  it("exclui leads com lastOpenAt fora do periodo", () => {
    const leads = [
      createMockLeadTracking({
        leadEmail: "antigo@test.com",
        openCount: 5,
        lastOpenAt: "2026-01-01T14:00:00.000Z",
      }),
    ];

    const result = evaluateOpportunityWindow(leads, baseConfig);

    expect(result).toHaveLength(0);
  });

  it("exclui leads sem lastOpenAt (null)", () => {
    const leads = [
      createMockLeadTracking({
        leadEmail: "sem-open@test.com",
        openCount: 5,
        lastOpenAt: null,
      }),
    ];

    const result = evaluateOpportunityWindow(leads, baseConfig);

    expect(result).toHaveLength(0);
  });

  it("retorna array vazio quando nenhum lead qualifica", () => {
    const leads = [
      createMockLeadTracking({ openCount: 1, lastOpenAt: "2026-01-01T00:00:00.000Z" }),
      createMockLeadTracking({ openCount: 0, lastOpenAt: null }),
    ];

    const result = evaluateOpportunityWindow(leads, baseConfig);

    expect(result).toHaveLength(0);
  });

  it("retorna array vazio quando leads e vazio", () => {
    const result = evaluateOpportunityWindow([], baseConfig);

    expect(result).toHaveLength(0);
  });

  it("define qualifiedAt e isInOpportunityWindow corretamente", () => {
    const leads = [
      createMockLeadTracking({
        openCount: 3,
        lastOpenAt: "2026-02-09T10:00:00.000Z",
      }),
    ];

    const result = evaluateOpportunityWindow(leads, baseConfig);

    expect(result).toHaveLength(1);
    expect(result[0].qualifiedAt).toBe("2026-02-10T12:00:00.000Z");
    expect(result[0].isInOpportunityWindow).toBe(true);
  });

  it("preserva todos os campos do LeadTracking original", () => {
    const lead = createMockLeadTracking({
      leadEmail: "preserved@test.com",
      campaignId: "camp-1",
      openCount: 5,
      clickCount: 3,
      hasReplied: true,
      lastOpenAt: "2026-02-09T10:00:00.000Z",
      firstName: "Maria",
      lastName: "Santos",
    });

    const result = evaluateOpportunityWindow([lead], baseConfig);

    expect(result).toHaveLength(1);
    expect(result[0].leadEmail).toBe("preserved@test.com");
    expect(result[0].campaignId).toBe("camp-1");
    expect(result[0].clickCount).toBe(3);
    expect(result[0].hasReplied).toBe(true);
    expect(result[0].firstName).toBe("Maria");
    expect(result[0].lastName).toBe("Santos");
  });

  it("filtra corretamente com configuracao customizada", () => {
    const customConfig: OpportunityConfig = {
      ...baseConfig,
      minOpens: 1,
      periodDays: 3,
    };

    const leads = [
      createMockLeadTracking({
        leadEmail: "dentro@test.com",
        openCount: 1,
        lastOpenAt: "2026-02-08T14:00:00.000Z",
      }),
      createMockLeadTracking({
        leadEmail: "fora@test.com",
        openCount: 1,
        lastOpenAt: "2026-02-05T14:00:00.000Z",
      }),
    ];

    const result = evaluateOpportunityWindow(leads, customConfig);

    expect(result).toHaveLength(1);
    expect(result[0].leadEmail).toBe("dentro@test.com");
  });

  it("inclui lead no limite exato do threshold", () => {
    const leads = [
      createMockLeadTracking({
        openCount: 3,
        lastOpenAt: "2026-02-03T12:00:00.000Z",
      }),
    ];

    const result = evaluateOpportunityWindow(leads, baseConfig);

    expect(result).toHaveLength(1);
  });
});

describe("getDefaultConfig", () => {
  it("retorna config com defaults corretos", () => {
    const config = getDefaultConfig("campaign-123");

    expect(config.campaignId).toBe("campaign-123");
    expect(config.minOpens).toBe(DEFAULT_MIN_OPENS);
    expect(config.periodDays).toBe(DEFAULT_PERIOD_DAYS);
    expect(config.isActive).toBe(true);
  });

  it("usa constantes DEFAULT_MIN_OPENS=3 e DEFAULT_PERIOD_DAYS=7", () => {
    expect(DEFAULT_MIN_OPENS).toBe(3);
    expect(DEFAULT_PERIOD_DAYS).toBe(7);
  });
});
