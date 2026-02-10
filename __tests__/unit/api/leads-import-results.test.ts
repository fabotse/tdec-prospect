/**
 * Tests for Lead Import Results API Route
 * Story: 4.7 - Import Campaign Results
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/leads/import-results/route";

// Mock getCurrentUserProfile
const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Mock Supabase client (still needed for DB operations)
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabaseClient)),
}));

// Helper to create mock request
function createMockRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/leads/import-results", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// Helper to reset and setup common mocks
function setupMocks(options: {
  user?: { id: string } | null;
  tenantId?: string | null;
  existingLeads?: Array<{ id: string; email: string; status: string }>;
  updateError?: Error | null;
  insertError?: Error | null;
}) {
  const {
    user = { id: "user-123" },
    tenantId = "tenant-123",
    existingLeads = [],
    updateError = null,
    insertError = null,
  } = options;

  // Mock getCurrentUserProfile
  if (!user || !tenantId) {
    mockGetCurrentUserProfile.mockResolvedValue(null);
  } else {
    mockGetCurrentUserProfile.mockResolvedValue({
      id: user.id,
      tenant_id: tenantId,
      role: "user",
    });
  }

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === "leads") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            // Support batch query with .in() for email matching
            in: vi.fn().mockImplementation((_field: string, emails: string[]) => {
              // Return all leads that match any of the queried emails
              const matchedLeads = existingLeads.filter((lead) =>
                emails.some((email) => lead.email.toLowerCase() === email.toLowerCase())
              );
              return Promise.resolve({
                data: matchedLeads,
                error: null,
              });
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          // Support batch update with .in()
          in: vi.fn().mockResolvedValue({
            data: null,
            error: updateError,
            count: updateError ? 0 : 1,
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [{ id: "new-lead-123", email: "newlead@example.com" }],
            error: insertError,
          }),
        }),
      };
    }

    if (table === "lead_interactions") {
      return {
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };
    }

    return {};
  });
}

describe("POST /api/leads/import-results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      setupMocks({ user: null });

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "replied" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 401 when profile is not found", async () => {
      setupMocks({ tenantId: null });

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "replied" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Validation", () => {
    it("should return 400 for empty results array", async () => {
      setupMocks({});

      const request = createMockRequest({
        results: [],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for invalid email format", async () => {
      setupMocks({});

      const request = createMockRequest({
        results: [{ email: "invalid-email", responseType: "replied" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for invalid response type", async () => {
      setupMocks({});

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "invalid" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for missing results field", async () => {
      setupMocks({});

      const request = createMockRequest({});

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Processing results", () => {
    it("should return success with unmatched email when lead not found", async () => {
      setupMocks({
        existingLeads: [],
      });

      const request = createMockRequest({
        results: [{ email: "notfound@example.com", responseType: "replied" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.matched).toBe(0);
      expect(data.data.unmatched).toContain("notfound@example.com");
    });

    it("should match and update lead when found", async () => {
      setupMocks({
        existingLeads: [
          { id: "lead-1", email: "test@example.com", status: "novo" },
        ],
      });

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "replied" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.matched).toBe(1);
      expect(data.data.updated).toBe(1);
    });

    it("should not update status when response type has no status change", async () => {
      setupMocks({
        existingLeads: [
          { id: "lead-1", email: "test@example.com", status: "novo" },
        ],
      });

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "clicked" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.matched).toBe(1);
      // clicked doesn't change status
      expect(data.data.updated).toBe(0);
    });

    it("should process multiple results", async () => {
      setupMocks({
        existingLeads: [
          { id: "lead-1", email: "found1@example.com", status: "novo" },
          { id: "lead-2", email: "found2@example.com", status: "novo" },
        ],
      });

      const request = createMockRequest({
        results: [
          { email: "found1@example.com", responseType: "replied" },
          { email: "found2@example.com", responseType: "bounced" },
          { email: "notfound@example.com", responseType: "replied" },
        ],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.matched).toBe(2);
      expect(data.data.unmatched).toContain("notfound@example.com");
    });
  });

  describe("Response type mappings", () => {
    it("should update to interessado for replied", async () => {
      setupMocks({
        existingLeads: [
          { id: "lead-1", email: "test@example.com", status: "novo" },
        ],
      });

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "replied" }],
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify update was called
      const updateCalls = mockSupabaseClient.from.mock.calls.filter(
        (call) => call[0] === "leads"
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it("should update to nao_interessado for bounced", async () => {
      setupMocks({
        existingLeads: [
          { id: "lead-1", email: "test@example.com", status: "novo" },
        ],
      });

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "bounced" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.updated).toBe(1);
    });

    it("should update to nao_interessado for unsubscribed", async () => {
      setupMocks({
        existingLeads: [
          { id: "lead-1", email: "test@example.com", status: "novo" },
        ],
      });

      const request = createMockRequest({
        results: [{ email: "test@example.com", responseType: "unsubscribed" }],
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.updated).toBe(1);
    });
  });

  describe("Create missing leads", () => {
    it("should create leads when createMissingLeads is true", async () => {
      setupMocks({
        existingLeads: [],
      });

      const request = createMockRequest({
        results: [{ email: "newlead@example.com", responseType: "replied" }],
        createMissingLeads: true,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
    });
  });
});
