/**
 * Builder Store
 * Story 5.2: Campaign Builder Canvas
 * Story 5.4: Delay Block Component
 * Story 5.7: Campaign Lead Association
 * Story 6.6: Personalized Icebreakers
 * Story 6.12.1: AI Full Campaign Generation
 * Story 6.13: Smart Campaign Templates
 *
 * AC: #6 - Builder Store (Zustand)
 * AC 5.4: Default delay data initialization
 * AC 5.7 #5: Lead count tracking
 * AC 6.6 #1, #2: Preview lead selection for personalized generation
 * AC 6.12.1 #5: AI-generated campaign indicator
 * AC 6.13 #4: Template name indicator
 *
 * Zustand store for managing campaign builder UI state.
 * Handles block sequence, selection, drag state, change tracking, lead count, and preview lead.
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

/**
 * Preview lead data for AI generation
 * Story 6.6: AC #1, #2 - Real lead data for personalized generation
 */
export interface PreviewLead {
  id: string;
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  title: string | null;
  email: string | null;
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
  /** Selected lead ID for preview (Story 6.6 AC #1) */
  previewLeadId: string | null;
  /** Cached lead data for preview (Story 6.6 AC #2) */
  previewLead: PreviewLead | null;
  /** Whether campaign was created with AI (Story 6.12.1 AC #5) */
  isAIGenerated: boolean;
  /** Template name if created from template (Story 6.13 AC #4) */
  templateName: string | null;
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
  loadBlocks: (blocks: BuilderBlock[], isAIGenerated?: boolean) => void;
  /** Set lead count (Story 5.7 AC #5) */
  setLeadCount: (count: number) => void;
  /** Set product ID for AI context (Story 6.5) */
  setProductId: (id: string | null, name?: string | null) => void;
  /** Set preview lead for AI generation (Story 6.6 AC #1, #2) */
  setPreviewLead: (lead: PreviewLead | null) => void;
  /** Set AI-generated flag (Story 6.12.1 AC #5) */
  setAIGenerated: (isAIGenerated: boolean) => void;
  /** Set template name (Story 6.13 AC #4) */
  setTemplateName: (name: string | null) => void;
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
  previewLeadId: null,
  previewLead: null,
  isAIGenerated: false,
  templateName: null,
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

  loadBlocks: (blocks, isAIGenerated = false) =>
    set({ blocks, hasChanges: false, isAIGenerated }),

  setLeadCount: (count) => set({ leadCount: count }),

  setAIGenerated: (isAIGenerated) => set({ isAIGenerated }),

  setProductId: (id, name = null) =>
    set((state) => ({
      productId: id,
      productName: name ?? null,
      hasChanges: state.productId !== id,
    })),

  setPreviewLead: (lead) =>
    set({
      previewLeadId: lead?.id ?? null,
      previewLead: lead,
    }),

  setTemplateName: (name) => set({ templateName: name }),
}));

// ==============================================
// SELECTORS
// ==============================================

/**
 * Previous email context for follow-up generation
 * Story 6.11: AC #3, #4 - Chain context for follow-up emails
 */
export interface PreviousEmailContext {
  subject: string;
  body: string;
}

/**
 * Get the previous email block's content for follow-up generation
 * Story 6.11: AC #3 - Follow-up emails include previous email context
 * Story 6.11: AC #4 - Chain follow-up reads from immediately previous email
 *
 * @param blocks - All blocks in the sequence
 * @param currentPosition - Position of the current email block
 * @returns Previous email content or null if first email
 */
export function getPreviousEmailBlock(
  blocks: BuilderBlock[],
  currentPosition: number
): PreviousEmailContext | null {
  // First position cannot have a previous email (AC #5)
  if (currentPosition <= 0) {
    return null;
  }

  // Filter only email blocks and sort by position
  const emailBlocks = blocks
    .filter((b) => b.type === "email")
    .sort((a, b) => a.position - b.position);

  // Find index of current email in the filtered list
  const currentIndex = emailBlocks.findIndex(
    (b) => b.position === currentPosition
  );

  // If not found or is first email in sequence
  if (currentIndex <= 0) {
    return null;
  }

  // Get the immediately previous email block (skips delay blocks - AC #3.3)
  const prevBlock = emailBlocks[currentIndex - 1];
  const data = prevBlock.data as { subject?: string; body?: string };

  return {
    subject: data.subject || "",
    body: data.body || "",
  };
}
