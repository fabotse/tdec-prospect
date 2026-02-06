/**
 * Lead Service
 * Story: 3.2.1 - People Enrichment Integration
 *
 * Service for lead management operations including enrichment updates.
 *
 * AC: #1 - Updates lead record with complete data after enrichment
 */

import { createClient } from "@/lib/supabase/server";
import type { LeadRow } from "@/types/lead";
import type {
  ApolloEnrichedPerson,
  ApolloEnrichedOrganization,
} from "@/types/apollo";
import { transformEnrichmentToLead } from "@/types/apollo";

// ==============================================
// TYPES
// ==============================================

export interface EnrichmentUpdateResult {
  success: boolean;
  leadId: string;
  updatedFields: string[];
  error?: string;
}

// ==============================================
// LEAD SERVICE CLASS
// ==============================================

export class LeadService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Update lead record with enriched data from Apollo
   * AC: #1 - Updates lead with complete data (email, phone, last_name, location, industry)
   *
   * Only updates fields that were enriched (non-null values).
   * Logs enrichment activity.
   *
   * @param leadId - Database lead ID
   * @param enrichedPerson - Enriched person data from Apollo
   * @param organization - Optional enriched organization data
   * @returns Result with updated field list
   */
  async updateLeadFromEnrichment(
    leadId: string,
    enrichedPerson: ApolloEnrichedPerson,
    organization: ApolloEnrichedOrganization | null
  ): Promise<EnrichmentUpdateResult> {
    const supabase = await createClient();

    // Transform enriched data to lead fields
    const enrichedFields = transformEnrichmentToLead(
      enrichedPerson,
      organization
    );

    // Filter out null values - only update fields with actual data
    const updateData: Partial<LeadRow> = {};
    const updatedFields: string[] = [];

    for (const [key, value] of Object.entries(enrichedFields)) {
      if (value !== null && value !== undefined) {
        (updateData as Record<string, unknown>)[key] = value;
        updatedFields.push(key);
      }
    }

    // Always update updated_at
    updateData.updated_at = new Date().toISOString();

    // Perform the update
    const { error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", leadId)
      .eq("tenant_id", this.tenantId);

    if (error) {
      console.error("[LeadService] Enrichment update error:", error);
      return {
        success: false,
        leadId,
        updatedFields: [],
        error: "Erro ao atualizar lead com dados enriquecidos",
      };
    }

    return {
      success: true,
      leadId,
      updatedFields,
    };
  }

  /**
   * Bulk update leads with enriched data
   * Uses Promise.all for parallel execution for better performance.
   *
   * @param updates - Array of lead updates with enriched data
   * @returns Array of results for each lead
   */
  async bulkUpdateFromEnrichment(
    updates: Array<{
      leadId: string;
      enrichedPerson: ApolloEnrichedPerson;
      organization: ApolloEnrichedOrganization | null;
    }>
  ): Promise<EnrichmentUpdateResult[]> {
    if (updates.length === 0) {
      return [];
    }

    // Use Promise.all for parallel execution
    const results = await Promise.all(
      updates.map((update) =>
        this.updateLeadFromEnrichment(
          update.leadId,
          update.enrichedPerson,
          update.organization
        )
      )
    );

    return results;
  }

  /**
   * Get lead by Apollo ID
   *
   * @param apolloId - Apollo person ID
   * @returns Lead record or null if not found
   */
  async getLeadByApolloId(apolloId: string): Promise<LeadRow | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("apollo_id", apolloId)
      .eq("tenant_id", this.tenantId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as LeadRow;
  }
}
