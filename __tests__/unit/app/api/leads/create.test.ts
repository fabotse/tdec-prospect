/**
 * Tests for Lead Manual Creation API Route
 * Quick Dev: Manual Lead Creation
 *
 * POST /api/leads/create
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
const mockGetCurrentUserProfile = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

/**
 * Setup mock chain for duplicate check + insert.
 * When email is provided, two from("leads") calls happen:
 *   1. Duplicate check: .select("id").eq().eq().limit().maybeSingle()
 *   2. Insert: .insert().select("*").single()
 * When no email, only the insert call happens.
 */
function setupMockChains(options: {
  duplicateResult?: { data: unknown; error?: unknown };
  insertResult: { data: unknown; error: unknown };
}) {
  // Reset mockFrom to clear any stale return values from previous tests
  mockFrom.mockReset();

  const mockSingle = vi.fn().mockResolvedValue(options.insertResult);
  const mockInsertSelect = vi.fn().mockReturnValue({ single: mockSingle });
  const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

  if (options.duplicateResult) {
    const mockMaybeSingle = vi.fn().mockResolvedValue(options.duplicateResult);
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEq2 = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    const mockDupSelect = vi.fn().mockReturnValue({ eq: mockEq1 });

    // First call = duplicate check, second call = insert
    mockFrom
      .mockReturnValueOnce({ select: mockDupSelect })
      .mockReturnValueOnce({ insert: mockInsert });
  } else {
    // No email — only insert call
    mockFrom.mockReturnValueOnce({ insert: mockInsert });
  }

  return { mockInsert };
}

import { POST } from "@/app/api/leads/create/route";

describe("POST /api/leads/create", () => {
  const validInput = {
    firstName: "João",
    lastName: "Silva",
    email: "joao@empresa.com",
    phone: "+5511999999999",
    companyName: "Tech Corp",
    title: "CTO",
    linkedinUrl: "https://linkedin.com/in/joaosilva",
    industry: "Tecnologia",
    location: "São Paulo, SP",
    companySize: "51-200",
  };

  const mockProfile = {
    tenant_id: "tenant-123",
    id: "user-123",
  };

  const mockCreatedLead = {
    id: "lead-new-1",
    tenant_id: "tenant-123",
    apollo_id: null,
    first_name: "João",
    last_name: "Silva",
    email: "joao@empresa.com",
    phone: "+5511999999999",
    company_name: "Tech Corp",
    company_size: "51-200",
    industry: "Tecnologia",
    location: "São Paulo, SP",
    title: "CTO",
    linkedin_url: "https://linkedin.com/in/joaosilva",
    photo_url: null,
    status: "novo",
    has_email: true,
    has_direct_phone: "Yes",
    created_at: "2026-02-11T10:00:00Z",
    updated_at: "2026-02-11T10:00:00Z",
    icebreaker: null,
    icebreaker_generated_at: null,
    linkedin_posts_cache: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a lead with all fields", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    setupMockChains({
      duplicateResult: { data: null },
      insertResult: { data: mockCreatedLead, error: null },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify(validInput),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.firstName).toBe("João");
    expect(json.data.lastName).toBe("Silva");
    expect(json.data.email).toBe("joao@empresa.com");
    expect(json.data.status).toBe("novo");
    expect(json.data.apolloId).toBeNull();
    expect(json.message).toBe("Lead criado com sucesso");
  });

  it("should create a lead with only firstName (minimum required)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const minimalLead = {
      ...mockCreatedLead,
      last_name: null,
      email: null,
      phone: null,
      company_name: null,
      title: null,
      linkedin_url: null,
      has_email: false,
      has_direct_phone: null,
    };
    // No email = no duplicate check
    setupMockChains({
      insertResult: { data: minimalLead, error: null },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.firstName).toBe("João");
    expect(json.data.email).toBeNull();
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify(validInput),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 when firstName is missing", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ email: "joao@empresa.com" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for invalid email format", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João", email: "invalid-email" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for invalid LinkedIn URL", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João", linkedinUrl: "not-a-url" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 500 on database insert error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    setupMockChains({
      duplicateResult: { data: null },
      insertResult: { data: null, error: { message: "DB error" } },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify(validInput),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should set email in insert when provided", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const { mockInsert } = setupMockChains({
      duplicateResult: { data: null },
      insertResult: { data: mockCreatedLead, error: null },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João", email: "joao@test.com" }),
    });

    await POST(request);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "joao@test.com",
        tenant_id: "tenant-123",
      })
    );
  });

  it("should set phone in insert when provided", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const { mockInsert } = setupMockChains({
      insertResult: { data: mockCreatedLead, error: null },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João", phone: "+5511999999999" }),
    });

    await POST(request);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+5511999999999",
      })
    );
  });

  it("should accept empty string for email without validation error", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const leadNoEmail = { ...mockCreatedLead, email: null, has_email: false };
    // Empty email = no duplicate check
    setupMockChains({
      insertResult: { data: leadNoEmail, error: null },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João", email: "" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  // F1: Invalid JSON body
  it("should return 400 for invalid JSON body", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: "not-json{{{",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("INVALID_JSON");
  });

  // F2: Duplicate email check
  it("should return 409 when email already exists for tenant", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    setupMockChains({
      duplicateResult: { data: { id: "existing-lead-1" } },
      insertResult: { data: null, error: null },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João", email: "joao@empresa.com" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error.code).toBe("DUPLICATE_LEAD");
    expect(json.error.message).toBe("Já existe um lead com este email");
  });

  // F5: apolloId should be stripped by schema
  it("should ignore apolloId field (stripped by schema)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
    const minimalLead = {
      ...mockCreatedLead,
      email: null,
      has_email: false,
    };
    // No email — no duplicate check, only insert
    setupMockChains({
      insertResult: { data: minimalLead, error: null },
    });

    const request = new NextRequest("http://localhost/api/leads/create", {
      method: "POST",
      body: JSON.stringify({ firstName: "João", apolloId: "apollo-123" }),
    });

    const response = await POST(request);

    // Should succeed — apolloId is stripped by omit, not cause error
    expect(response.status).toBe(200);
  });
});
