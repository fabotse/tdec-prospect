/**
 * Delay Block Types Tests
 * Story 5.4: Delay Block Component
 *
 * AC: #7 - Tabela delay_blocks no Banco (types)
 * AC: #4 - Editar Duracao do Delay (Zod validation)
 * AC: #5 - Sugestao de Intervalos (DELAY_PRESETS)
 */

import { describe, it, expect, vi } from "vitest";
import {
  transformDelayBlockRow,
  delayBlockDataSchema,
  createDelayBlockSchema,
  updateDelayBlockSchema,
  delayUnitSchema,
  DEFAULT_DELAY_BLOCK_DATA,
  DELAY_PRESETS,
  formatDelayDisplay,
  type DelayBlockRow,
} from "@/types/delay-block";

describe("Delay Block Types", () => {
  describe("transformDelayBlockRow (AC: #7)", () => {
    it("transforms snake_case to camelCase", () => {
      const row: DelayBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 0,
        delay_value: 2,
        delay_unit: "days",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformDelayBlockRow(row);

      expect(result).toEqual({
        id: "block-123",
        campaignId: "campaign-456",
        position: 0,
        delayValue: 2,
        delayUnit: "days",
        createdAt: "2026-02-01T10:00:00Z",
        updatedAt: "2026-02-01T12:00:00Z",
      });
    });

    it("handles hours delay unit", () => {
      const row: DelayBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 1,
        delay_value: 24,
        delay_unit: "hours",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformDelayBlockRow(row);

      expect(result.delayUnit).toBe("hours");
      expect(result.delayValue).toBe(24);
    });

    it("preserves position correctly", () => {
      const row: DelayBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 5,
        delay_value: 3,
        delay_unit: "days",
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformDelayBlockRow(row);

      expect(result.position).toBe(5);
    });

    it("defaults to days for invalid delay_unit from database", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const row: DelayBlockRow = {
        id: "block-123",
        campaign_id: "campaign-456",
        position: 0,
        delay_value: 2,
        delay_unit: "weeks", // Invalid unit
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T12:00:00Z",
      };

      const result = transformDelayBlockRow(row);

      expect(result.delayUnit).toBe("days");
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid delay_unit "weeks" from database, defaulting to "days"'
      );

      consoleSpy.mockRestore();
    });
  });

  describe("DEFAULT_DELAY_BLOCK_DATA (AC: #5)", () => {
    it("has 2 days as default (FR16 recommendation)", () => {
      expect(DEFAULT_DELAY_BLOCK_DATA.delayValue).toBe(2);
      expect(DEFAULT_DELAY_BLOCK_DATA.delayUnit).toBe("days");
    });
  });

  describe("DELAY_PRESETS (AC: #5)", () => {
    it("contains recommended options for 2 and 3 days", () => {
      const recommendedPresets = DELAY_PRESETS.filter((p) => "recommended" in p && p.recommended);
      expect(recommendedPresets).toHaveLength(2);

      const recommendedValues = recommendedPresets.map((p) => p.value);
      expect(recommendedValues).toContain(2);
      expect(recommendedValues).toContain(3);
    });

    it("contains all expected preset values", () => {
      const values = DELAY_PRESETS.map((p) => p.value);
      expect(values).toEqual([1, 2, 3, 5, 7]);
    });

    it("all presets have days unit", () => {
      const allDays = DELAY_PRESETS.every((p) => p.unit === "days");
      expect(allDays).toBe(true);
    });

    it("presets have Portuguese labels", () => {
      const labels = DELAY_PRESETS.map((p) => p.label);
      expect(labels).toContain("1 dia");
      expect(labels).toContain("2 dias");
      expect(labels).toContain("3 dias");
      expect(labels).toContain("5 dias");
      expect(labels).toContain("7 dias");
    });
  });

  describe("formatDelayDisplay (AC: #2)", () => {
    it("formats singular day correctly", () => {
      expect(formatDelayDisplay(1, "days")).toBe("1 dia");
    });

    it("formats plural days correctly", () => {
      expect(formatDelayDisplay(3, "days")).toBe("3 dias");
    });

    it("formats singular hour correctly", () => {
      expect(formatDelayDisplay(1, "hours")).toBe("1 hora");
    });

    it("formats plural hours correctly", () => {
      expect(formatDelayDisplay(24, "hours")).toBe("24 horas");
    });

    it("formats 2 days correctly (default)", () => {
      expect(formatDelayDisplay(2, "days")).toBe("2 dias");
    });
  });

  describe("delayUnitSchema", () => {
    it("accepts valid units", () => {
      expect(delayUnitSchema.safeParse("days").success).toBe(true);
      expect(delayUnitSchema.safeParse("hours").success).toBe(true);
    });

    it("rejects invalid units", () => {
      expect(delayUnitSchema.safeParse("weeks").success).toBe(false);
      expect(delayUnitSchema.safeParse("minutes").success).toBe(false);
      expect(delayUnitSchema.safeParse("").success).toBe(false);
    });
  });

  describe("delayBlockDataSchema (AC: #4)", () => {
    it("validates valid delay block data", () => {
      const result = delayBlockDataSchema.safeParse({
        delayValue: 3,
        delayUnit: "days",
      });
      expect(result.success).toBe(true);
    });

    it("rejects delay value less than 1", () => {
      const result = delayBlockDataSchema.safeParse({
        delayValue: 0,
        delayUnit: "days",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Valor minimo e 1");
      }
    });

    it("rejects delay value greater than 365", () => {
      const result = delayBlockDataSchema.safeParse({
        delayValue: 366,
        delayUnit: "days",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Valor maximo e 365");
      }
    });

    it("accepts delay value at boundaries", () => {
      const min = delayBlockDataSchema.safeParse({
        delayValue: 1,
        delayUnit: "days",
      });
      expect(min.success).toBe(true);

      const max = delayBlockDataSchema.safeParse({
        delayValue: 365,
        delayUnit: "hours",
      });
      expect(max.success).toBe(true);
    });

    it("rejects non-integer delay values", () => {
      const result = delayBlockDataSchema.safeParse({
        delayValue: 1.5,
        delayUnit: "days",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createDelayBlockSchema", () => {
    it("validates valid create input", () => {
      const result = createDelayBlockSchema.safeParse({
        campaignId: "550e8400-e29b-41d4-a716-446655440000",
        position: 0,
        delayValue: 2,
        delayUnit: "days",
      });
      expect(result.success).toBe(true);
    });

    it("applies default values for optional fields", () => {
      const result = createDelayBlockSchema.safeParse({
        campaignId: "550e8400-e29b-41d4-a716-446655440000",
        position: 0,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.delayValue).toBe(2);
        expect(result.data.delayUnit).toBe("days");
      }
    });

    it("rejects invalid campaignId", () => {
      const result = createDelayBlockSchema.safeParse({
        campaignId: "not-a-uuid",
        position: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("ID de campanha invalido");
      }
    });

    it("rejects negative position", () => {
      const result = createDelayBlockSchema.safeParse({
        campaignId: "550e8400-e29b-41d4-a716-446655440000",
        position: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing required fields", () => {
      const result = createDelayBlockSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("updateDelayBlockSchema", () => {
    it("validates valid update input", () => {
      const result = updateDelayBlockSchema.safeParse({
        position: 1,
        delayValue: 5,
        delayUnit: "hours",
      });
      expect(result.success).toBe(true);
    });

    it("validates partial update with only delayValue", () => {
      const result = updateDelayBlockSchema.safeParse({
        delayValue: 7,
      });
      expect(result.success).toBe(true);
    });

    it("validates partial update with only delayUnit", () => {
      const result = updateDelayBlockSchema.safeParse({
        delayUnit: "hours",
      });
      expect(result.success).toBe(true);
    });

    it("validates empty update object", () => {
      const result = updateDelayBlockSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects delay value exceeding 365", () => {
      const result = updateDelayBlockSchema.safeParse({
        delayValue: 400,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative position", () => {
      const result = updateDelayBlockSchema.safeParse({
        position: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});
