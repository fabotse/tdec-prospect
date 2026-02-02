/**
 * Product Types
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #3, #4, #5 - Product form fields and CRUD operations
 */

import { z } from "zod";

/**
 * Database row interface (snake_case)
 */
export interface ProductRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  features: string | null;
  differentials: string | null;
  target_audience: string | null;
  created_at: string;
  updated_at: string;
  campaign_count?: number; // From JOIN query
}

/**
 * Frontend model interface (camelCase)
 */
export interface Product {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  features: string | null;
  differentials: string | null;
  targetAudience: string | null;
  createdAt: string;
  updatedAt: string;
  campaignCount?: number;
}

/**
 * Transform database row to frontend model
 */
export function transformProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    features: row.features,
    differentials: row.differentials,
    targetAudience: row.target_audience,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    campaignCount: row.campaign_count,
  };
}

/**
 * Zod schema for creating a product
 * AC: #3 - Form validation rules
 */
export const createProductSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(200, "Nome deve ter no máximo 200 caracteres"),
  description: z
    .string()
    .min(1, "Descrição é obrigatória")
    .max(2000, "Descrição deve ter no máximo 2000 caracteres"),
  features: z
    .string()
    .max(2000, "Características devem ter no máximo 2000 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  differentials: z
    .string()
    .max(2000, "Diferenciais devem ter no máximo 2000 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  targetAudience: z
    .string()
    .max(2000, "Público-alvo deve ter no máximo 2000 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Zod schema for updating a product
 * All fields optional for partial updates
 */
export const updateProductSchema = createProductSchema.partial();

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
