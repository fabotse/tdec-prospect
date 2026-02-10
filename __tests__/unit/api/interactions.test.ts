/**
 * Interactions API Route Tests
 * Story 4.3: Lead Detail View & Interaction History
 *
 * AC: #3, #4, #5 - API for interactions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock getCurrentUserProfile
const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Create separate mocks for different tables to avoid chain conflicts
const createFromMock = () => {
  let callCount = 0;
  const leadResult = { data: null, error: null };
  const interactionResult = { data: null, error: null };
  const interactionsListResult = { data: [], error: null };

  const chainMock = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(leadResult);
      return Promise.resolve(interactionResult);
    }),
    // For GET requests that return arrays
    then: vi.fn((resolve) => resolve(interactionsListResult)),
  };

  return {
    chainMock,
    setLeadResult: (data: unknown, error: unknown = null) => {
      leadResult.data = data as null;
      leadResult.error = error as null;
    },
    setInteractionResult: (data: unknown, error: unknown = null) => {
      interactionResult.data = data as null;
      interactionResult.error = error as null;
    },
    setInteractionsListResult: (data: unknown, error: unknown = null) => {
      interactionsListResult.data = data as [];
      interactionsListResult.error = error as null;
    },
    resetCallCount: () => {
      callCount = 0;
    },
  };
};

let fromMockHelper = createFromMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => fromMockHelper.chainMock),
    })
  ),
}));

// Import after mocking
import { GET, POST } from "@/app/api/leads/[leadId]/interactions/route";

// ==============================================
// HELPER: Create mock request
// ==============================================

function createMockRequest(
  method: string,
  body?: object
): NextRequest {
  const url = new URL("http://localhost:3000/api/leads/lead-123/interactions");
  const request = new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
  return request;
}

function createMockContext() {
  return {
    params: Promise.resolve({ leadId: "lead-123" }),
  };
}

// ==============================================
// TESTS
// ==============================================

describe("GET /api/leads/[leadId]/interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMockHelper = createFromMock();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = createMockRequest("GET");
    const response = await GET(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when profile not found", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = createMockRequest("GET");
    const response = await GET(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 when lead not found", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: "user-1",
      tenant_id: "tenant-1",
      role: "user",
    });
    fromMockHelper.setLeadResult(null, { code: "PGRST116" });

    const request = createMockRequest("GET");
    const response = await GET(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/leads/[leadId]/interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMockHelper = createFromMock();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const request = createMockRequest("POST", { content: "Test note" });
    const response = await POST(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when body is not valid JSON", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: "user-1",
      tenant_id: "tenant-1",
      role: "user",
    });
    fromMockHelper.setLeadResult({ id: "lead-123" });

    // Create request with invalid JSON
    const url = new URL("http://localhost:3000/api/leads/lead-123/interactions");
    const request = new NextRequest(url, {
      method: "POST",
      body: "invalid json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("BAD_REQUEST");
  });

  it("returns 400 when content is empty", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: "user-1",
      tenant_id: "tenant-1",
      role: "user",
    });
    fromMockHelper.setLeadResult({ id: "lead-123" });

    const request = createMockRequest("POST", { content: "" });
    const response = await POST(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when lead not found", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: "user-1",
      tenant_id: "tenant-1",
      role: "user",
    });
    fromMockHelper.setLeadResult(null, { code: "PGRST116" });

    const request = createMockRequest("POST", { content: "Test note" });
    const response = await POST(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 201 when interaction is created successfully", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: "user-1",
      tenant_id: "tenant-1",
      role: "user",
    });
    fromMockHelper.setLeadResult({ id: "lead-123" });
    fromMockHelper.setInteractionResult({
      id: "int-new",
      lead_id: "lead-123",
      tenant_id: "tenant-1",
      type: "note",
      content: "Test note",
      created_at: "2026-01-15T10:00:00Z",
      created_by: "user-1",
    });

    const request = createMockRequest("POST", { content: "Test note" });
    const response = await POST(request, createMockContext());
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data).toBeDefined();
    expect(json.data.content).toBe("Test note");
    expect(json.data.type).toBe("note");
  });
});
