/**
 * Filter Store Tests
 * Story: 3.3 - Traditional Filter Search
 *
 * AC: #1 - Filter state management
 * AC: #4 - Clear filters action
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import {
  useFilterStore,
  getActiveFilterCount,
  INDUSTRIES,
  COMPANY_SIZES,
} from "@/stores/use-filter-store";

describe("filterStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    const store = useFilterStore.getState();
    store.clearFilters();
    store.setExpanded(false);
  });

  it("initializes with empty filters", () => {
    const state = useFilterStore.getState();

    expect(state.filters.industries).toEqual([]);
    expect(state.filters.companySizes).toEqual([]);
    expect(state.filters.locations).toEqual([]);
    expect(state.filters.titles).toEqual([]);
    expect(state.filters.keywords).toBe("");
  });

  it("initializes with panel collapsed", () => {
    const state = useFilterStore.getState();

    expect(state.isExpanded).toBe(false);
  });

  it("initializes with isDirty false", () => {
    const state = useFilterStore.getState();

    expect(state.isDirty).toBe(false);
  });

  it("updates industries correctly", () => {
    act(() => {
      useFilterStore.getState().setIndustries(["technology", "finance"]);
    });

    const state = useFilterStore.getState();
    expect(state.filters.industries).toEqual(["technology", "finance"]);
  });

  it("updates company sizes correctly", () => {
    act(() => {
      useFilterStore.getState().setCompanySizes(["11-50", "51-200"]);
    });

    const state = useFilterStore.getState();
    expect(state.filters.companySizes).toEqual(["11-50", "51-200"]);
  });

  it("updates locations correctly", () => {
    act(() => {
      useFilterStore.getState().setLocations(["São Paulo", "Rio de Janeiro"]);
    });

    const state = useFilterStore.getState();
    expect(state.filters.locations).toEqual(["São Paulo", "Rio de Janeiro"]);
  });

  it("updates titles correctly", () => {
    act(() => {
      useFilterStore.getState().setTitles(["CEO", "CTO", "CFO"]);
    });

    const state = useFilterStore.getState();
    expect(state.filters.titles).toEqual(["CEO", "CTO", "CFO"]);
  });

  it("updates keywords correctly", () => {
    act(() => {
      useFilterStore.getState().setKeywords("software engineering");
    });

    const state = useFilterStore.getState();
    expect(state.filters.keywords).toBe("software engineering");
  });

  it("marks isDirty as true when filters change", () => {
    act(() => {
      useFilterStore.getState().setIndustries(["technology"]);
    });

    expect(useFilterStore.getState().isDirty).toBe(true);
  });

  it("clears all filters on clearFilters", () => {
    // Set some filters first
    act(() => {
      const store = useFilterStore.getState();
      store.setIndustries(["technology"]);
      store.setCompanySizes(["11-50"]);
      store.setLocations(["São Paulo"]);
      store.setTitles(["CEO"]);
      store.setKeywords("software");
    });

    // Clear all filters
    act(() => {
      useFilterStore.getState().clearFilters();
    });

    const state = useFilterStore.getState();
    expect(state.filters.industries).toEqual([]);
    expect(state.filters.companySizes).toEqual([]);
    expect(state.filters.locations).toEqual([]);
    expect(state.filters.titles).toEqual([]);
    expect(state.filters.keywords).toBe("");
    expect(state.isDirty).toBe(false);
  });

  it("toggles panel expansion", () => {
    expect(useFilterStore.getState().isExpanded).toBe(false);

    act(() => {
      useFilterStore.getState().togglePanel();
    });

    expect(useFilterStore.getState().isExpanded).toBe(true);

    act(() => {
      useFilterStore.getState().togglePanel();
    });

    expect(useFilterStore.getState().isExpanded).toBe(false);
  });

  it("sets panel expansion directly", () => {
    act(() => {
      useFilterStore.getState().setExpanded(true);
    });

    expect(useFilterStore.getState().isExpanded).toBe(true);

    act(() => {
      useFilterStore.getState().setExpanded(false);
    });

    expect(useFilterStore.getState().isExpanded).toBe(false);
  });
});

describe("getActiveFilterCount", () => {
  it("returns 0 for empty filters", () => {
    const count = getActiveFilterCount({
      industries: [],
      companySizes: [],
      locations: [],
      titles: [],
      keywords: "",
    });

    expect(count).toBe(0);
  });

  it("counts each non-empty filter category as 1", () => {
    const count = getActiveFilterCount({
      industries: ["technology"],
      companySizes: [],
      locations: [],
      titles: [],
      keywords: "",
    });

    expect(count).toBe(1);
  });

  it("counts multiple filters correctly", () => {
    const count = getActiveFilterCount({
      industries: ["technology", "finance"],
      companySizes: ["11-50"],
      locations: ["São Paulo"],
      titles: ["CEO", "CTO"],
      keywords: "software",
    });

    expect(count).toBe(5);
  });

  it("does not count whitespace-only keywords", () => {
    const count = getActiveFilterCount({
      industries: [],
      companySizes: [],
      locations: [],
      titles: [],
      keywords: "   ",
    });

    expect(count).toBe(0);
  });
});

describe("filter constants", () => {
  it("has INDUSTRIES defined", () => {
    expect(INDUSTRIES).toBeDefined();
    expect(INDUSTRIES.length).toBeGreaterThan(0);
    expect(INDUSTRIES[0]).toHaveProperty("value");
    expect(INDUSTRIES[0]).toHaveProperty("label");
  });

  it("has COMPANY_SIZES defined", () => {
    expect(COMPANY_SIZES).toBeDefined();
    expect(COMPANY_SIZES.length).toBeGreaterThan(0);
    expect(COMPANY_SIZES[0]).toHaveProperty("value");
    expect(COMPANY_SIZES[0]).toHaveProperty("label");
  });

  it("INDUSTRIES have Portuguese labels", () => {
    const techIndustry = INDUSTRIES.find((i) => i.value === "technology");
    expect(techIndustry?.label).toBe("Tecnologia");
  });

  it("COMPANY_SIZES have Portuguese labels", () => {
    const smallSize = COMPANY_SIZES.find((s) => s.value === "1-10");
    expect(smallSize?.label).toBe("1-10 funcionários");
  });
});
