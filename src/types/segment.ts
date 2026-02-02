/**
 * Segment Types
 * Story: 4.1 - Lead Segments/Lists
 */

/**
 * Segment entity from database
 */
export interface Segment {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Segment with lead count for listing
 */
export interface SegmentWithCount extends Segment {
  leadCount: number;
}

/**
 * Insert type for creating segment
 */
export interface SegmentInsert {
  name: string;
  description?: string;
}

/**
 * Database row type (snake_case)
 */
export interface SegmentRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Transform database row to Segment interface
 */
export function transformSegmentRow(row: SegmentRow): Segment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lead-Segment association
 */
export interface LeadSegment {
  id: string;
  segmentId: string;
  leadId: string;
  addedAt: string;
}

/**
 * Lead data required for adding to segment
 * Used to upsert leads before creating segment associations
 */
export interface LeadDataForSegment {
  apolloId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  companySize?: string | null;
  industry?: string | null;
  location?: string | null;
  title?: string | null;
  linkedinUrl?: string | null;
  hasEmail?: boolean;
  hasDirectPhone?: string | null;
}

/**
 * Request body for adding leads to segment
 * Now uses full lead data for upsert before association
 */
export interface AddLeadsToSegmentRequest {
  leads: LeadDataForSegment[];
}

/**
 * Response for segment list API
 */
export interface SegmentsResponse {
  data: SegmentWithCount[];
}

/**
 * Response for single segment API
 */
export interface SegmentResponse {
  data: SegmentWithCount;
}

/**
 * Response for add/remove leads operations
 */
export interface LeadSegmentOperationResponse {
  data: {
    added?: number;
    removed?: number;
  };
  message: string;
}
