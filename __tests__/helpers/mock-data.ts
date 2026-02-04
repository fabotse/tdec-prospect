/**
 * Mock Data Helpers for Tests
 * Provides complete type-safe mock objects for common types
 */

import type { Lead, LeadStatus } from "@/types/lead";
import type { CampaignRow, CampaignRowWithCount } from "@/types/campaign";
import type { FilterValues } from "@/stores/use-filter-store";
import type { Product } from "@/types/product";

// ==============================================
// LEAD MOCKS
// ==============================================

/**
 * Creates a complete Lead mock with all required fields
 * Defaults can be overridden via partial
 */
export function createMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    tenantId: "tenant-1",
    apolloId: "apollo-1",
    firstName: "João",
    lastName: "Silva",
    email: "joao@empresa.com",
    phone: "+55 11 99999-1111",
    companyName: "Empresa ABC",
    companySize: "51-200",
    industry: "Tecnologia",
    location: "São Paulo, SP",
    title: "Diretor de Tecnologia",
    linkedinUrl: "https://linkedin.com/in/joaosilva",
    photoUrl: null,
    status: "novo" as LeadStatus,
    hasEmail: true,
    hasDirectPhone: "Yes",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    _isImported: true,
    // Story 6.5.4: Icebreaker fields (default to null)
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
    ...overrides,
  };
}

/**
 * Creates multiple mock leads with unique IDs
 */
export function createMockLeads(count: number, baseOverrides: Partial<Lead> = {}): Lead[] {
  return Array.from({ length: count }, (_, i) =>
    createMockLead({
      id: `lead-${i + 1}`,
      apolloId: `apollo-${i + 1}`,
      firstName: `User${i + 1}`,
      email: `user${i + 1}@example.com`,
      ...baseOverrides,
    })
  );
}

// ==============================================
// CAMPAIGN MOCKS
// ==============================================

/**
 * Creates a complete CampaignRow mock
 */
export function createMockCampaignRow(overrides: Partial<CampaignRow> = {}): CampaignRow {
  return {
    id: "campaign-1",
    tenant_id: "tenant-1",
    name: "Test Campaign",
    status: "draft",
    product_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * Creates a complete CampaignRowWithCount mock
 */
export function createMockCampaignRowWithCount(
  overrides: Partial<CampaignRowWithCount> = {}
): CampaignRowWithCount {
  return {
    ...createMockCampaignRow(),
    lead_count: 0,
    ...overrides,
  };
}

// ==============================================
// FILTER MOCKS
// ==============================================

/**
 * Creates a complete FilterValues mock with all required fields
 */
export function createMockFilterValues(overrides: Partial<FilterValues> = {}): FilterValues {
  return {
    industries: [],
    companySizes: [],
    locations: [],
    titles: [],
    keywords: "",
    contactEmailStatuses: [],
    leadStatuses: [],
    ...overrides,
  };
}

// ==============================================
// PRODUCT MOCKS
// ==============================================

/**
 * Creates a complete Product mock
 */
export function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    tenantId: "tenant-1",
    name: "Test Product",
    description: "Test product description",
    features: "Feature 1, Feature 2",
    differentials: "Differential 1",
    targetAudience: "Target audience description",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
