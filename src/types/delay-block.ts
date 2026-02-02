import { z } from "zod";

// ==============================================
// DELAY BLOCK TYPES
// ==============================================

/**
 * Valid delay units
 */
export type DelayUnit = "days" | "hours";

/**
 * Delay block entity from database (camelCase)
 */
export interface DelayBlock {
  id: string;
  campaignId: string;
  position: number;
  delayValue: number;
  delayUnit: DelayUnit;
  createdAt: string;
  updatedAt: string;
}

/**
 * Database row type (snake_case)
 */
export interface DelayBlockRow {
  id: string;
  campaign_id: string;
  position: number;
  delay_value: number;
  delay_unit: string;
  created_at: string;
  updated_at: string;
}

/**
 * Validate and parse delay unit from database
 */
function parseDelayUnit(unit: string): DelayUnit {
  if (unit === "days" || unit === "hours") {
    return unit;
  }
  // Default to days if invalid value from database
  console.warn(`Invalid delay_unit "${unit}" from database, defaulting to "days"`);
  return "days";
}

/**
 * Transform database row to DelayBlock interface
 */
export function transformDelayBlockRow(row: DelayBlockRow): DelayBlock {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    position: row.position,
    delayValue: row.delay_value,
    delayUnit: parseDelayUnit(row.delay_unit),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Data structure for delay block in BuilderBlock.data
 * Used in useBuilderStore
 */
export interface DelayBlockData {
  delayValue: number;
  delayUnit: DelayUnit;
}

/**
 * Default data for new delay blocks
 * FR16: 2 days is recommended as starting point
 */
export const DEFAULT_DELAY_BLOCK_DATA: DelayBlockData = {
  delayValue: 2,
  delayUnit: "days",
};

/**
 * Preset delay options (FR16: based on best practices)
 */
export const DELAY_PRESETS = [
  { value: 1, unit: "days" as DelayUnit, label: "1 dia" },
  { value: 2, unit: "days" as DelayUnit, label: "2 dias", recommended: true },
  { value: 3, unit: "days" as DelayUnit, label: "3 dias", recommended: true },
  { value: 5, unit: "days" as DelayUnit, label: "5 dias" },
  { value: 7, unit: "days" as DelayUnit, label: "7 dias" },
] as const;

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Schema for delay unit validation
 */
export const delayUnitSchema = z.enum(["days", "hours"]);

/**
 * Schema for delay block data
 */
export const delayBlockDataSchema = z.object({
  delayValue: z
    .number()
    .int()
    .min(1, "Valor minimo e 1")
    .max(365, "Valor maximo e 365"),
  delayUnit: delayUnitSchema,
});

export type DelayBlockDataInput = z.infer<typeof delayBlockDataSchema>;

/**
 * Schema for creating a delay block
 */
export const createDelayBlockSchema = z.object({
  campaignId: z.string().uuid("ID de campanha invalido"),
  position: z.number().int().min(0),
  delayValue: z.number().int().min(1).max(365).default(2),
  delayUnit: delayUnitSchema.default("days"),
});

export type CreateDelayBlockInput = z.infer<typeof createDelayBlockSchema>;

/**
 * Schema for updating a delay block
 */
export const updateDelayBlockSchema = z.object({
  position: z.number().int().min(0).optional(),
  delayValue: z.number().int().min(1).max(365).optional(),
  delayUnit: delayUnitSchema.optional(),
});

export type UpdateDelayBlockInput = z.infer<typeof updateDelayBlockSchema>;

/**
 * Format delay for display
 */
export function formatDelayDisplay(value: number, unit: DelayUnit): string {
  if (unit === "days") {
    return value === 1 ? "1 dia" : `${value} dias`;
  }
  return value === 1 ? "1 hora" : `${value} horas`;
}
