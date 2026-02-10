/**
 * Mock Data Helpers for Tests
 * Provides complete type-safe mock objects for common types
 */

import type { Lead, LeadStatus } from "@/types/lead";
import type { CampaignRow, CampaignRowWithCount, CampaignWithCount } from "@/types/campaign";
import type { CampaignTemplate } from "@/types/campaign-template";
import type { SegmentWithCount } from "@/types/segment";
import type { FilterValues } from "@/stores/use-filter-store";
import type { Product } from "@/types/product";
import type { CampaignEventRow } from "@/types/tracking";
import type { InstantlyWebhookPayload } from "@/lib/webhook/instantly-webhook-utils";

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
    product_name: null,
    ...overrides,
  };
}

/**
 * Creates a complete CampaignWithCount mock (camelCase frontend model)
 */
export function createMockCampaignWithCount(
  overrides: Partial<CampaignWithCount> = {}
): CampaignWithCount {
  return {
    id: "campaign-1",
    tenantId: "tenant-1",
    name: "Test Campaign",
    status: "draft",
    productId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    leadCount: 0,
    productName: null,
    ...overrides,
  };
}

// ==============================================
// CAMPAIGN TEMPLATE MOCKS
// ==============================================

/**
 * Creates a complete CampaignTemplate mock
 */
export function createMockCampaignTemplate(
  overrides: Partial<CampaignTemplate> = {}
): CampaignTemplate {
  return {
    id: "template-1",
    name: "Test Template",
    nameKey: "test-template",
    description: "Test template description",
    structureJson: {
      emails: [{ position: 1, context: "Initial outreach", emailMode: "initial" }],
      delays: [],
    },
    useCase: "outreach",
    emailCount: 1,
    totalDays: 1,
    isActive: true,
    displayOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ==============================================
// SEGMENT MOCKS
// ==============================================

/**
 * Creates a complete SegmentWithCount mock
 */
export function createMockSegmentWithCount(
  overrides: Partial<SegmentWithCount> = {}
): SegmentWithCount {
  return {
    id: "segment-1",
    tenantId: "tenant-1",
    name: "Test Segment",
    description: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    leadCount: 0,
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
    campaignCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ==============================================
// INSTANTLY WEBHOOK MOCKS (Story 10.2)
// ==============================================

/**
 * Creates a complete Instantly webhook payload mock
 * Task 4.1 — payload completo do Instantly
 */
export function createMockInstantlyWebhookPayload(
  overrides: Partial<InstantlyWebhookPayload> = {}
): InstantlyWebhookPayload {
  return {
    event_type: "email_opened",
    lead_email: "joao@empresa.com.br",
    campaign_id: "instantly-campaign-abc-123",
    timestamp: "2026-02-09T15:30:00.000Z",
    campaign_name: "Q1 Prospecção B2B",
    workspace: "workspace-uuid",
    email_account: "vendas@minha-empresa.com",
    step: 1,
    variant: 0,
    is_first: true,
    ...overrides,
  };
}

/**
 * Creates a complete CampaignEventRow mock (persisted event)
 * Task 4.2 — evento persistido no banco
 */
export function createMockCampaignEvent(
  overrides: Partial<CampaignEventRow> = {}
): CampaignEventRow {
  return {
    id: "event-1",
    tenant_id: "tenant-1",
    campaign_id: "campaign-1",
    event_type: "email_opened",
    lead_email: "joao@empresa.com.br",
    event_timestamp: "2026-02-09T15:30:00.000Z",
    payload: {},
    source: "webhook",
    processed_at: "2026-02-09T15:30:01.000Z",
    created_at: "2026-02-09T15:30:01.000Z",
    ...overrides,
  };
}
