/**
 * Unit Tests for /api/leads/create-batch
 * Story 15.5: Criacao de Leads e Integracao com Pipeline
 *
 * AC: #2 - Batch create leads via API
 * AC: #3 - Lead data with source metadata via lead_interactions
 * AC: #6 - Duplicate detection by email and apollo_id
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChainBuilder } from "../../../helpers/mock-supabase";

// Mock getCurrentUserProfile
const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Mock Supabase
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

// Import after mocking
import { POST } from "@/app/api/leads/create-batch/route";

// ==============================================
// HELPERS
// ==============================================

const TENANT_ID = "tenant-001";

const mockProfile = {
  id: "user-001",
  tenant_id: TENANT_ID,
  role: "user" as const,
};

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/leads/create-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validLeads = [
  {
    apolloId: "apollo-1",
    firstName: "João",
    lastName: "Silva",
    email: "joao@acme.com",
    phone: null,
    companyName: "Acme Corp",
    companySize: "100-500",
    industry: "Software",
    location: "São Paulo, BR",
    title: "CTO",
    linkedinUrl: "https://linkedin.com/in/joao",
    hasEmail: true,
    hasDirectPhone: "Yes",
  },
  {
    apolloId: "apollo-2",
    firstName: "Maria",
    lastName: "Fernandes",
    email: "maria@beta.com",
    phone: null,
    companyName: "Beta Inc",
    companySize: null,
    industry: null,
    location: null,
    title: "VP Engineering",
    linkedinUrl: null,
    hasEmail: true,
    hasDirectPhone: null,
  },
];

// ==============================================
// TESTS
// ==============================================

describe("POST /api/leads/create-batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
  });

  // --- AUTH ---

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const res = await POST(createRequest({
      leads: validLeads,
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  // --- VALIDATION ---

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/leads/create-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_JSON");
  });

  it("returns 400 when leads array is empty", async () => {
    const res = await POST(createRequest({
      leads: [],
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when leads is missing", async () => {
    const res = await POST(createRequest({
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  // --- SUCCESS: NO DUPLICATES ---

  it("creates leads and returns created count with no duplicates", async () => {
    // Email dedup query: no existing leads
    const emailChain = createChainBuilder({ data: [], error: null });
    // Apollo ID dedup query: no existing leads
    const apolloIdChain = createChainBuilder({ data: [], error: null });
    // Insert leads
    const insertChain = createChainBuilder({
      data: [
        { id: "new-1", email: "joao@acme.com" },
        { id: "new-2", email: "maria@beta.com" },
      ],
      error: null,
    });
    // Insert lead_interactions
    const interactionsChain = createChainBuilder({ data: null, error: null });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      // 1st call: leads (email dedup)
      if (fromCallCount === 1) return emailChain;
      // 2nd call: leads (apollo_id dedup)
      if (fromCallCount === 2) return apolloIdChain;
      // 3rd call: leads (insert)
      if (fromCallCount === 3) return insertChain;
      // 4th call: lead_interactions (insert)
      if (fromCallCount === 4) return interactionsChain;
      return createChainBuilder();
    });

    const res = await POST(createRequest({
      leads: validLeads,
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.created).toBe(2);
    expect(json.data.skipped).toBe(0);
    expect(json.data.duplicateEmails).toEqual([]);
  });

  // --- DUPLICATE DETECTION ---

  it("skips duplicates by email and returns skipped count", async () => {
    // Email dedup: joao@acme.com already exists
    const emailChain = createChainBuilder({
      data: [{ id: "existing-1", email: "joao@acme.com" }],
      error: null,
    });
    // Apollo ID dedup: no extra dupes
    const apolloIdChain = createChainBuilder({ data: [], error: null });
    // Insert leads (only maria)
    const insertChain = createChainBuilder({
      data: [{ id: "new-2", email: "maria@beta.com" }],
      error: null,
    });
    // Insert lead_interactions
    const interactionsChain = createChainBuilder({ data: null, error: null });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emailChain;
      if (fromCallCount === 2) return apolloIdChain;
      if (fromCallCount === 3) return insertChain;
      if (fromCallCount === 4) return interactionsChain;
      return createChainBuilder();
    });

    const res = await POST(createRequest({
      leads: validLeads,
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.created).toBe(1);
    expect(json.data.skipped).toBe(1);
    expect(json.data.duplicateEmails).toEqual(["joao@acme.com"]);
  });

  it("skips duplicates by apollo_id", async () => {
    // Email dedup: no dupes
    const emailChain = createChainBuilder({ data: [], error: null });
    // Apollo ID dedup: apollo-1 already exists
    const apolloIdChain = createChainBuilder({
      data: [{ id: "existing-1", apollo_id: "apollo-1" }],
      error: null,
    });
    // Insert leads (only maria)
    const insertChain = createChainBuilder({
      data: [{ id: "new-2", email: "maria@beta.com" }],
      error: null,
    });
    // Insert lead_interactions
    const interactionsChain = createChainBuilder({ data: null, error: null });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emailChain;
      if (fromCallCount === 2) return apolloIdChain;
      if (fromCallCount === 3) return insertChain;
      if (fromCallCount === 4) return interactionsChain;
      return createChainBuilder();
    });

    const res = await POST(createRequest({
      leads: validLeads,
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.created).toBe(1);
    expect(json.data.skipped).toBe(1);
  });

  // --- INSERT ERROR ---

  it("returns 500 when lead insert fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const emailChain = createChainBuilder({ data: [], error: null });
    const apolloIdChain = createChainBuilder({ data: [], error: null });
    const insertChain = createChainBuilder({
      data: null,
      error: { message: "Database error", code: "500" },
    });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emailChain;
      if (fromCallCount === 2) return apolloIdChain;
      if (fromCallCount === 3) return insertChain;
      return createChainBuilder();
    });

    const res = await POST(createRequest({
      leads: validLeads,
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");

    consoleSpy.mockRestore();
  });

  // --- ALL DUPLICATES ---

  it("skips all when all are duplicates", async () => {
    // All emails exist
    const emailChain = createChainBuilder({
      data: [
        { id: "existing-1", email: "joao@acme.com" },
        { id: "existing-2", email: "maria@beta.com" },
      ],
      error: null,
    });
    const apolloIdChain = createChainBuilder({ data: [], error: null });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emailChain;
      if (fromCallCount === 2) return apolloIdChain;
      return createChainBuilder();
    });

    const res = await POST(createRequest({
      leads: validLeads,
      source: "theirStack + Apollo",
      sourceTechnology: "React",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.created).toBe(0);
    expect(json.data.skipped).toBe(2);
    expect(json.data.duplicateEmails).toEqual(["joao@acme.com", "maria@beta.com"]);
  });
});
