import { z } from "zod";

// Interaction types matching the database enum
export const interactionTypeValues = [
  "note",
  "status_change",
  "import",
  "campaign_sent",
  "campaign_reply",
  "whatsapp_sent",
] as const;

export type InteractionType = (typeof interactionTypeValues)[number];

// Database row type (snake_case)
export interface LeadInteractionRow {
  id: string;
  lead_id: string;
  tenant_id: string;
  type: InteractionType;
  content: string;
  created_at: string;
  created_by: string | null;
}

// Application type (camelCase)
export interface LeadInteraction {
  id: string;
  leadId: string;
  tenantId: string;
  type: InteractionType;
  content: string;
  createdAt: string;
  createdBy: string | null;
}

// Transform function: database row to application type
export function transformInteractionRow(
  row: LeadInteractionRow
): LeadInteraction {
  return {
    id: row.id,
    leadId: row.lead_id,
    tenantId: row.tenant_id,
    type: row.type,
    content: row.content,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

// Zod schema for creating a new interaction
export const createInteractionSchema = z.object({
  content: z.string().min(1, "Nota nao pode estar vazia"),
  type: z.enum(interactionTypeValues).optional().default("note"),
});

export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;
