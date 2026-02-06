/**
 * Filter Store
 * Story: 3.3 - Traditional Filter Search
 * Story: 4.2 - Lead Status Management
 *
 * AC: #1 - Filter state management
 * AC: #4 - Clear filters action
 * AC (4.2): #3 - Filter by status
 *
 * Zustand store for managing lead search filter state.
 */

import { create } from "zustand";
import { LEAD_STATUSES } from "@/types/lead";

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

/**
 * Email status filter options for Apollo API
 * Story 3.5.1: AC #3, #4 - Filter leads by email availability status
 */
export const EMAIL_STATUSES = [
  { value: "verified", label: "Verificado" },
  { value: "unverified", label: "Não Verificado" },
  { value: "likely to engage", label: "Provável Engajamento" },
  { value: "unavailable", label: "Indisponível" },
] as const;

/**
 * Lead status filter options
 * Story 4.2: AC #3 - Filter leads by status
 */
export const LEAD_STATUS_OPTIONS = LEAD_STATUSES.map((status) => ({
  value: status.value,
  label: status.label,
}));

// ==============================================
// FILTER STATE TYPES
// ==============================================

/**
 * Filter values interface
 * Story 3.5.1: Added contactEmailStatuses for email status filter
 * Story 4.2: Added leadStatuses for lead status filter
 */
export interface FilterValues {
  industries: string[];
  companySizes: string[];
  locations: string[];
  titles: string[];
  keywords: string;
  contactEmailStatuses: string[];
  leadStatuses: string[];
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
  setContactEmailStatuses: (statuses: string[]) => void;
  setLeadStatuses: (statuses: string[]) => void;
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
  contactEmailStatuses: [],
  leadStatuses: [],
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

  setContactEmailStatuses: (contactEmailStatuses) =>
    set((state) => ({
      filters: { ...state.filters, contactEmailStatuses },
      isDirty: true,
    })),

  setLeadStatuses: (leadStatuses) =>
    set((state) => ({
      filters: { ...state.filters, leadStatuses },
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
        contactEmailStatuses:
          newFilters.contactEmailStatuses ?? state.filters.contactEmailStatuses,
        leadStatuses: newFilters.leadStatuses ?? state.filters.leadStatuses,
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
 * Story 3.5.1: Added contactEmailStatuses to count
 * Story 4.2: Added leadStatuses to count
 */
export function getActiveFilterCount(filters: FilterValues): number {
  let count = 0;
  if (filters.industries.length > 0) count++;
  if (filters.companySizes.length > 0) count++;
  if (filters.locations.length > 0) count++;
  if (filters.titles.length > 0) count++;
  if (filters.keywords.trim() !== "") count++;
  if (filters.contactEmailStatuses.length > 0) count++;
  if (filters.leadStatuses.length > 0) count++;
  return count;
}
