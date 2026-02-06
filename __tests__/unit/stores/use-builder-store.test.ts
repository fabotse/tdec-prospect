/**
 * Builder Store Tests
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #6 - Builder Store (Zustand)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useBuilderStore,
  getPreviousEmailBlock,
  type BuilderBlock,
  type BlockType,
} from "@/stores/use-builder-store";

describe("useBuilderStore (AC: #6)", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useBuilderStore.getState().reset();
  });

  describe("Initial State", () => {
    it("initializes with empty blocks array", () => {
      const state = useBuilderStore.getState();
      expect(state.blocks).toEqual([]);
    });

    it("initializes with selectedBlockId as null", () => {
      const state = useBuilderStore.getState();
      expect(state.selectedBlockId).toBeNull();
    });

    it("initializes with isDragging as false", () => {
      const state = useBuilderStore.getState();
      expect(state.isDragging).toBe(false);
    });

    it("initializes with hasChanges as false", () => {
      const state = useBuilderStore.getState();
      expect(state.hasChanges).toBe(false);
    });
  });

  describe("addBlock", () => {
    it("adds email block to sequence", () => {
      const { addBlock } = useBuilderStore.getState();
      addBlock("email");

      const state = useBuilderStore.getState();
      expect(state.blocks).toHaveLength(1);
      expect(state.blocks[0].type).toBe("email");
      expect(state.blocks[0].position).toBe(0);
    });

    it("adds delay block to sequence", () => {
      const { addBlock } = useBuilderStore.getState();
      addBlock("delay");

      const state = useBuilderStore.getState();
      expect(state.blocks).toHaveLength(1);
      expect(state.blocks[0].type).toBe("delay");
    });

    it("assigns unique IDs to blocks", () => {
      const { addBlock } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");

      const state = useBuilderStore.getState();
      expect(state.blocks[0].id).not.toBe(state.blocks[1].id);
    });

    it("updates positions correctly when adding blocks", () => {
      const { addBlock } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");
      addBlock("email");

      const state = useBuilderStore.getState();
      expect(state.blocks[0].position).toBe(0);
      expect(state.blocks[1].position).toBe(1);
      expect(state.blocks[2].position).toBe(2);
    });

    it("marks hasChanges as true after adding", () => {
      const { addBlock } = useBuilderStore.getState();
      addBlock("email");

      const state = useBuilderStore.getState();
      expect(state.hasChanges).toBe(true);
    });

    it("adds block at specific position", () => {
      const { addBlock } = useBuilderStore.getState();
      addBlock("email"); // position 0
      addBlock("email"); // position 1
      addBlock("delay", 1); // insert at position 1

      const state = useBuilderStore.getState();
      expect(state.blocks).toHaveLength(3);
      // Positions are recalculated
      expect(state.blocks[2].type).toBe("delay");
    });
  });

  describe("removeBlock", () => {
    it("removes block from sequence", () => {
      const { addBlock, removeBlock } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");

      const state1 = useBuilderStore.getState();
      const blockId = state1.blocks[0].id;

      removeBlock(blockId);

      const state2 = useBuilderStore.getState();
      expect(state2.blocks).toHaveLength(1);
      expect(state2.blocks[0].type).toBe("delay");
    });

    it("recalculates positions after removal", () => {
      const { addBlock, removeBlock } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");
      addBlock("email");

      const state1 = useBuilderStore.getState();
      const middleBlockId = state1.blocks[1].id;

      removeBlock(middleBlockId);

      const state2 = useBuilderStore.getState();
      expect(state2.blocks[0].position).toBe(0);
      expect(state2.blocks[1].position).toBe(1);
    });

    it("clears selectedBlockId if removed block was selected", () => {
      const { addBlock, selectBlock, removeBlock } = useBuilderStore.getState();
      addBlock("email");

      const state1 = useBuilderStore.getState();
      const blockId = state1.blocks[0].id;

      selectBlock(blockId);
      removeBlock(blockId);

      const state2 = useBuilderStore.getState();
      expect(state2.selectedBlockId).toBeNull();
    });

    it("keeps selectedBlockId if different block was removed", () => {
      const { addBlock, selectBlock, removeBlock } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");

      const state1 = useBuilderStore.getState();
      const firstBlockId = state1.blocks[0].id;
      const secondBlockId = state1.blocks[1].id;

      selectBlock(firstBlockId);
      removeBlock(secondBlockId);

      const state2 = useBuilderStore.getState();
      expect(state2.selectedBlockId).toBe(firstBlockId);
    });

    it("marks hasChanges as true after removal", () => {
      const { addBlock, removeBlock, setHasChanges } = useBuilderStore.getState();
      addBlock("email");
      setHasChanges(false);

      const state1 = useBuilderStore.getState();
      removeBlock(state1.blocks[0].id);

      const state2 = useBuilderStore.getState();
      expect(state2.hasChanges).toBe(true);
    });
  });

  describe("updateBlock", () => {
    it("updates block data", () => {
      const { addBlock, updateBlock } = useBuilderStore.getState();
      addBlock("email");

      const state1 = useBuilderStore.getState();
      const blockId = state1.blocks[0].id;

      updateBlock(blockId, { data: { subject: "Test Subject" } });

      const state2 = useBuilderStore.getState();
      expect(state2.blocks[0].data).toEqual({ subject: "Test Subject" });
    });

    it("marks hasChanges as true after update", () => {
      const { addBlock, updateBlock, setHasChanges } = useBuilderStore.getState();
      addBlock("email");
      setHasChanges(false);

      const state1 = useBuilderStore.getState();
      updateBlock(state1.blocks[0].id, { data: { test: true } });

      const state2 = useBuilderStore.getState();
      expect(state2.hasChanges).toBe(true);
    });
  });

  describe("selectBlock", () => {
    it("selects a block by ID", () => {
      const { addBlock, selectBlock } = useBuilderStore.getState();
      addBlock("email");

      const state1 = useBuilderStore.getState();
      const blockId = state1.blocks[0].id;

      selectBlock(blockId);

      const state2 = useBuilderStore.getState();
      expect(state2.selectedBlockId).toBe(blockId);
    });

    it("clears selection when passed null", () => {
      const { addBlock, selectBlock } = useBuilderStore.getState();
      addBlock("email");

      const state1 = useBuilderStore.getState();
      selectBlock(state1.blocks[0].id);
      selectBlock(null);

      const state2 = useBuilderStore.getState();
      expect(state2.selectedBlockId).toBeNull();
    });
  });

  describe("setDragging", () => {
    it("sets isDragging to true", () => {
      const { setDragging } = useBuilderStore.getState();
      setDragging(true);

      const state = useBuilderStore.getState();
      expect(state.isDragging).toBe(true);
    });

    it("sets isDragging to false", () => {
      const { setDragging } = useBuilderStore.getState();
      setDragging(true);
      setDragging(false);

      const state = useBuilderStore.getState();
      expect(state.isDragging).toBe(false);
    });
  });

  describe("setHasChanges", () => {
    it("sets hasChanges to true", () => {
      const { setHasChanges } = useBuilderStore.getState();
      setHasChanges(true);

      const state = useBuilderStore.getState();
      expect(state.hasChanges).toBe(true);
    });

    it("sets hasChanges to false", () => {
      const { setHasChanges } = useBuilderStore.getState();
      setHasChanges(true);
      setHasChanges(false);

      const state = useBuilderStore.getState();
      expect(state.hasChanges).toBe(false);
    });
  });

  describe("reorderBlocks", () => {
    it("reorders blocks when dragging within sequence", () => {
      const { addBlock, reorderBlocks } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");
      addBlock("email");

      const state1 = useBuilderStore.getState();
      const firstBlockId = state1.blocks[0].id;
      const thirdBlockId = state1.blocks[2].id;

      // Move first block to third position
      // [email0, delay, email2] -> [delay, email2, email0]
      reorderBlocks(firstBlockId, thirdBlockId);

      const state2 = useBuilderStore.getState();
      expect(state2.blocks[0].type).toBe("delay");
      expect(state2.blocks[2].id).toBe(firstBlockId);
    });

    it("updates positions after reordering", () => {
      const { addBlock, reorderBlocks } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");

      const state1 = useBuilderStore.getState();
      const firstBlockId = state1.blocks[0].id;
      const secondBlockId = state1.blocks[1].id;

      reorderBlocks(firstBlockId, secondBlockId);

      const state2 = useBuilderStore.getState();
      expect(state2.blocks[0].position).toBe(0);
      expect(state2.blocks[1].position).toBe(1);
    });

    it("marks hasChanges as true after reordering", () => {
      const { addBlock, reorderBlocks, setHasChanges } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");
      setHasChanges(false);

      const state1 = useBuilderStore.getState();
      reorderBlocks(state1.blocks[0].id, state1.blocks[1].id);

      const state2 = useBuilderStore.getState();
      expect(state2.hasChanges).toBe(true);
    });

    it("does nothing if activeId not found", () => {
      const { addBlock, reorderBlocks } = useBuilderStore.getState();
      addBlock("email");
      addBlock("delay");

      const state1 = useBuilderStore.getState();
      reorderBlocks("non-existent", state1.blocks[0].id);

      const state2 = useBuilderStore.getState();
      expect(state2.blocks[0].type).toBe("email");
      expect(state2.blocks[1].type).toBe("delay");
    });
  });

  describe("reset", () => {
    it("resets store to initial state", () => {
      const { addBlock, selectBlock, setDragging, setHasChanges, reset } =
        useBuilderStore.getState();

      addBlock("email");
      addBlock("delay");
      selectBlock("some-id");
      setDragging(true);
      setHasChanges(true);

      reset();

      const state = useBuilderStore.getState();
      expect(state.blocks).toEqual([]);
      expect(state.selectedBlockId).toBeNull();
      expect(state.isDragging).toBe(false);
      expect(state.hasChanges).toBe(false);
    });
  });

  describe("loadBlocks", () => {
    it("loads blocks from campaign data", () => {
      const { loadBlocks } = useBuilderStore.getState();

      const blocks: BuilderBlock[] = [
        { id: "block-1", type: "email", position: 0, data: {} },
        { id: "block-2", type: "delay", position: 1, data: { days: 3 } },
      ];

      loadBlocks(blocks);

      const state = useBuilderStore.getState();
      expect(state.blocks).toEqual(blocks);
      expect(state.hasChanges).toBe(false);
    });

    it("sets hasChanges to false after loading", () => {
      const { loadBlocks, setHasChanges } = useBuilderStore.getState();
      setHasChanges(true);

      loadBlocks([]);

      const state = useBuilderStore.getState();
      expect(state.hasChanges).toBe(false);
    });
  });
});

/**
 * getPreviousEmailBlock Selector Tests
 * Story 6.11: Follow-Up Email Mode
 *
 * AC #3: Follow-up emails include previous email context
 * AC #4: Chain follow-up reads from immediately previous email
 */
describe("getPreviousEmailBlock (Story 6.11 AC #3, #4)", () => {
  describe("Task 8.1: Returns correct block for valid position", () => {
    it("returns previous email content for position 1", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "First Subject", body: "First Body" } },
        { id: "email-2", type: "email", position: 1, data: { subject: "Second Subject", body: "Second Body" } },
      ];

      const result = getPreviousEmailBlock(blocks, 1);

      expect(result).toEqual({
        subject: "First Subject",
        body: "First Body",
      });
    });

    it("returns correct email in chain (Email 3 gets Email 2) - AC #4", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "Email 1", body: "Body 1" } },
        { id: "email-2", type: "email", position: 1, data: { subject: "Email 2", body: "Body 2" } },
        { id: "email-3", type: "email", position: 2, data: { subject: "Email 3", body: "Body 3" } },
      ];

      const result = getPreviousEmailBlock(blocks, 2);

      expect(result).toEqual({
        subject: "Email 2",
        body: "Body 2",
      });
    });
  });

  describe("Task 8.2: Returns null for first position", () => {
    it("returns null for position 0 (first email)", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "First", body: "Body" } },
      ];

      const result = getPreviousEmailBlock(blocks, 0);

      expect(result).toBeNull();
    });

    it("returns null for negative position", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "First", body: "Body" } },
      ];

      const result = getPreviousEmailBlock(blocks, -1);

      expect(result).toBeNull();
    });
  });

  describe("Task 8.3: Skips delay blocks", () => {
    it("returns correct email when delay blocks exist between emails", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "First Email", body: "First Body" } },
        { id: "delay-1", type: "delay", position: 1, data: { days: 3 } },
        { id: "email-2", type: "email", position: 2, data: { subject: "Second Email", body: "Second Body" } },
      ];

      const result = getPreviousEmailBlock(blocks, 2);

      expect(result).toEqual({
        subject: "First Email",
        body: "First Body",
      });
    });

    it("handles mixed block sequence (email, delay, email, delay, email)", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "Email 1", body: "Body 1" } },
        { id: "delay-1", type: "delay", position: 1, data: { days: 2 } },
        { id: "email-2", type: "email", position: 2, data: { subject: "Email 2", body: "Body 2" } },
        { id: "delay-2", type: "delay", position: 3, data: { days: 5 } },
        { id: "email-3", type: "email", position: 4, data: { subject: "Email 3", body: "Body 3" } },
      ];

      // Email at position 4 should get Email at position 2
      const result = getPreviousEmailBlock(blocks, 4);

      expect(result).toEqual({
        subject: "Email 2",
        body: "Body 2",
      });
    });

    it("returns null when only delay blocks before current email", () => {
      const blocks: BuilderBlock[] = [
        { id: "delay-1", type: "delay", position: 0, data: { days: 1 } },
        { id: "email-1", type: "email", position: 1, data: { subject: "First Email", body: "Body" } },
      ];

      // Email at position 1 is the first email in the sequence
      const result = getPreviousEmailBlock(blocks, 1);

      // Since it's the first email (index 0 in emailBlocks array), return null
      expect(result).toBeNull();
    });
  });

  describe("Task 8.4: emailMode persistence in block data", () => {
    it("preserves emailMode when reading block data", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "First", body: "Body", emailMode: "initial" } },
        { id: "email-2", type: "email", position: 1, data: { subject: "Second", body: "Body 2", emailMode: "follow-up" } },
      ];

      const result = getPreviousEmailBlock(blocks, 1);

      expect(result).toEqual({
        subject: "First",
        body: "Body",
      });
      // Note: emailMode is not returned by getPreviousEmailBlock, only subject/body
    });
  });

  describe("Edge cases", () => {
    it("returns empty strings when previous email has undefined subject/body", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: {} },
        { id: "email-2", type: "email", position: 1, data: { subject: "Test", body: "Body" } },
      ];

      const result = getPreviousEmailBlock(blocks, 1);

      expect(result).toEqual({
        subject: "",
        body: "",
      });
    });

    it("handles empty blocks array", () => {
      const result = getPreviousEmailBlock([], 1);
      expect(result).toBeNull();
    });

    it("handles position not found in blocks", () => {
      const blocks: BuilderBlock[] = [
        { id: "email-1", type: "email", position: 0, data: { subject: "First", body: "Body" } },
      ];

      const result = getPreviousEmailBlock(blocks, 5);

      expect(result).toBeNull();
    });
  });
});
