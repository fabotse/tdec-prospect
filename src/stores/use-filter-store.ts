/**
 * Filter Store
 * Story: 3.3 - Traditional Filter Search
 *
 * AC: #1 - Filter state management
 * AC: #4 - Clear filters action
 *
 * Zustand store for managing lead search filter state.
 */

import { create } from "zustand";

// ==============================================
// FILTER CONSTANTS
// ==============================================

export const INDUSTRIES = [
  { value: "technology", label: "Tecnologia" },
  { value: "finance", label: "Finanças" },
  { value: "healthcare", label: "Saúde" },
  { value: "education", label: "Educação" },
  { value: "retail", label: "Varejo" },
  { value: "manufacturing", label: "Indústria" },
  { value: "services", label: "Serviços" },
  { value: "consulting", label: "Consultoria" },
] as const;

export const COMPANY_SIZES = [
  { value: "1-10", label: "1-10 funcionários" },
  { value: "11-50", label: "11-50 funcionários" },
  { value: "51-200", label: "51-200 funcionários" },
  { value: "201-500", label: "201-500 funcionários" },
  { value: "501-1000", label: "501-1000 funcionários" },
  { value: "1001-5000", label: "1001-5000 funcionários" },
  { value: "5001-10000", label: "5001-10000 funcionários" },
  { value: "10001+", label: "10001+ funcionários" },
] as const;

// ==============================================
// FILTER STATE TYPES
// ==============================================

export interface FilterValues {
  industries: string[];
  companySizes: string[];
  locations: string[];
  titles: string[];
  keywords: string;
}

interface FilterState {
  filters: FilterValues;
  isExpanded: boolean;
  isDirty: boolean;
}

interface FilterActions {
  setIndustries: (industries: string[]) => void;
  setCompanySizes: (sizes: string[]) => void;
  setLocations: (locations: string[]) => void;
  setTitles: (titles: string[]) => void;
  setKeywords: (keywords: string) => void;
  setFilters: (filters: Partial<FilterValues>) => void;
  clearFilters: () => void;
  togglePanel: () => void;
  setExpanded: (expanded: boolean) => void;
}

// ==============================================
// INITIAL STATE
// ==============================================

const initialFilters: FilterValues = {
  industries: [],
  companySizes: [],
  locations: [],
  titles: [],
  keywords: "",
};

// ==============================================
// STORE
// ==============================================

export const useFilterStore = create<FilterState & FilterActions>((set) => ({
  filters: initialFilters,
  isExpanded: false,
  isDirty: false,

  setIndustries: (industries) =>
    set((state) => ({
      filters: { ...state.filters, industries },
      isDirty: true,
    })),

  setCompanySizes: (companySizes) =>
    set((state) => ({
      filters: { ...state.filters, companySizes },
      isDirty: true,
    })),

  setLocations: (locations) =>
    set((state) => ({
      filters: { ...state.filters, locations },
      isDirty: true,
    })),

  setTitles: (titles) =>
    set((state) => ({
      filters: { ...state.filters, titles },
      isDirty: true,
    })),

  setKeywords: (keywords) =>
    set((state) => ({
      filters: { ...state.filters, keywords },
      isDirty: true,
    })),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: {
        industries: newFilters.industries ?? state.filters.industries,
        companySizes: newFilters.companySizes ?? state.filters.companySizes,
        locations: newFilters.locations ?? state.filters.locations,
        titles: newFilters.titles ?? state.filters.titles,
        keywords: newFilters.keywords ?? state.filters.keywords,
      },
      isDirty: true,
    })),

  clearFilters: () =>
    set({
      filters: initialFilters,
      isDirty: false,
    }),

  togglePanel: () =>
    set((state) => ({
      isExpanded: !state.isExpanded,
    })),

  setExpanded: (expanded) =>
    set({
      isExpanded: expanded,
    }),
}));

// ==============================================
// SELECTORS
// ==============================================

/**
 * Get count of active filters
 */
export function getActiveFilterCount(filters: FilterValues): number {
  let count = 0;
  if (filters.industries.length > 0) count++;
  if (filters.companySizes.length > 0) count++;
  if (filters.locations.length > 0) count++;
  if (filters.titles.length > 0) count++;
  if (filters.keywords.trim() !== "") count++;
  return count;
}
