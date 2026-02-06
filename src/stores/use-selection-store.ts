/**
 * Lead Selection Store
 * Story: 3.5 - Lead Table Display
 *
 * Zustand store for managing lead selection state.
 * Supports individual and batch selection operations.
 */

import { create } from "zustand";

interface SelectionState {
  /** Currently selected lead IDs */
  selectedIds: string[];
  /** Set selected IDs (replace) */
  setSelectedIds: (ids: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Toggle a single lead's selection */
  toggleSelection: (id: string) => void;
  /** Add multiple leads to selection */
  addToSelection: (ids: string[]) => void;
  /** Remove multiple leads from selection */
  removeFromSelection: (ids: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: [],

  setSelectedIds: (ids) => set({ selectedIds: ids }),

  clearSelection: () => set({ selectedIds: [] }),

  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    })),

  addToSelection: (ids) =>
    set((state) => ({
      selectedIds: [...new Set([...state.selectedIds, ...ids])],
    })),

  removeFromSelection: (ids) =>
    set((state) => ({
      selectedIds: state.selectedIds.filter((sid) => !ids.includes(sid)),
    })),
}));
