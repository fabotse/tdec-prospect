/**
 * Saved Filter Types
 * Story 3.7: Saved Filters / Favorites
 *
 * AC: #1, #2 - Types for saved filter entities
 */

import type { FilterValues } from "@/stores/use-filter-store";

/**
 * Saved filter entity from database
 */
export interface SavedFilter {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  filtersJson: FilterValues;
  createdAt: string;
}

/**
 * Insert type for creating saved filter
 */
export interface SavedFilterInsert {
  name: string;
  filtersJson: FilterValues;
}

/**
 * API response for saved filters list
 */
export interface SavedFiltersResponse {
  data: SavedFilter[];
}
