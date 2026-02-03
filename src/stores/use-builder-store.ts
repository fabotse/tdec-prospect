/**
 * Builder Store
 * Story 5.2: Campaign Builder Canvas
 * Story 5.4: Delay Block Component
 * Story 5.7: Campaign Lead Association
 *
 * AC: #6 - Builder Store (Zustand)
 * AC 5.4: Default delay data initialization
 * AC 5.7 #5: Lead count tracking
 *
 * Zustand store for managing campaign builder UI state.
 * Handles block sequence, selection, drag state, change tracking, and lead count.
 */

import { create } from "zustand";
import { DEFAULT_DELAY_BLOCK_DATA } from "@/types/delay-block";

// ==============================================
// TYPES
// ==============================================

export type BlockType = "email" | "delay";

export interface BuilderBlock {
  id: string;
  type: BlockType;
  position: number;
  data: Record<string, unknown>;
}

interface BuilderState {
  /** Blocks in the sequence */
  blocks: BuilderBlock[];
  /** Currently selected block ID */
  selectedBlockId: string | null;
  /** Whether a block is being dragged */
  isDragging: boolean;
  /** Whether there are unsaved changes */
  hasChanges: boolean;
  /** Number of leads associated with campaign (Story 5.7 AC #5) */
  leadCount: number;
  /** Selected product ID for AI context (Story 6.5) */
  productId: string | null;
  /** Product name for display (Story 6.5) */
  productName: string | null;
}

interface BuilderActions {
  /** Add a new block to the sequence */
  addBlock: (type: BlockType, position?: number) => void;
  /** Remove a block from the sequence */
  removeBlock: (id: string) => void;
  /** Update a block's data */
  updateBlock: (id: string, data: Partial<BuilderBlock>) => void;
  /** Select a block */
  selectBlock: (id: string | null) => void;
  /** Set dragging state */
  setDragging: (isDragging: boolean) => void;
  /** Mark as having changes */
  setHasChanges: (hasChanges: boolean) => void;
  /** Reorder blocks */
  reorderBlocks: (activeId: string, overId: string) => void;
  /** Reset store to initial state */
  reset: () => void;
  /** Load blocks from campaign data */
  loadBlocks: (blocks: BuilderBlock[]) => void;
  /** Set lead count (Story 5.7 AC #5) */
  setLeadCount: (count: number) => void;
  /** Set product ID for AI context (Story 6.5) */
  setProductId: (id: string | null, name?: string | null) => void;
}

// ==============================================
// INITIAL STATE
// ==============================================

const initialState: BuilderState = {
  blocks: [],
  selectedBlockId: null,
  isDragging: false,
  hasChanges: false,
  leadCount: 0,
  productId: null,
  productName: null,
};

// ==============================================
// STORE
// ==============================================

export const useBuilderStore = create<BuilderState & BuilderActions>((set) => ({
  ...initialState,

  addBlock: (type, position) =>
    set((state) => {
      // Initialize with type-specific default data
      const defaultData =
        type === "delay"
          ? { ...DEFAULT_DELAY_BLOCK_DATA }
          : { subject: "", body: "" };

      const newBlock: BuilderBlock = {
        id: crypto.randomUUID(),
        type,
        position: position ?? state.blocks.length,
        data: defaultData,
      };
      const blocks = [...state.blocks, newBlock].map((b, i) => ({
        ...b,
        position: i,
      }));
      return { blocks, hasChanges: true };
    }),

  removeBlock: (id) =>
    set((state) => {
      const blocks = state.blocks
        .filter((b) => b.id !== id)
        .map((b, i) => ({ ...b, position: i }));
      return {
        blocks,
        selectedBlockId:
          state.selectedBlockId === id ? null : state.selectedBlockId,
        hasChanges: true,
      };
    }),

  updateBlock: (id, data) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...data } : b)),
      hasChanges: true,
    })),

  selectBlock: (id) => set({ selectedBlockId: id }),

  setDragging: (isDragging) => set({ isDragging }),

  setHasChanges: (hasChanges) => set({ hasChanges }),

  reorderBlocks: (activeId, overId) =>
    set((state) => {
      const oldIndex = state.blocks.findIndex((b) => b.id === activeId);
      const newIndex = state.blocks.findIndex((b) => b.id === overId);
      if (oldIndex === -1 || newIndex === -1) return state;

      const blocks = [...state.blocks];
      const [removed] = blocks.splice(oldIndex, 1);
      blocks.splice(newIndex, 0, removed);

      return {
        blocks: blocks.map((b, i) => ({ ...b, position: i })),
        hasChanges: true,
      };
    }),

  reset: () => set(initialState),

  loadBlocks: (blocks) => set({ blocks, hasChanges: false }),

  setLeadCount: (count) => set({ leadCount: count }),

  setProductId: (id, name = null) =>
    set((state) => ({
      productId: id,
      productName: name ?? null,
      hasChanges: state.productId !== id,
    })),
}));
