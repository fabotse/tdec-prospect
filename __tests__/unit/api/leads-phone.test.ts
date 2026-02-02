/**
 * Unit tests for Lead Phone Update API Route
 * Story 4.5: Phone Number Lookup
 *
 * Tests:
 * - AC #1.2 - PATCH handler updates lead's phone field
 * - AC #1.3 - Validates lead belongs to user's tenant (RLS)
 * - AC #1.4 - Returns updated lead data
 * - AC #1.5 - Zod validation schema
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/leads/[leadId]/phone/route";

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  single: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

describe("PATCH /api/leads/[leadId]/phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/leads/test-id/phone", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  // AC #1.3 - Authentication
  describe("authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const request = createRequest({ phone: "+5511999887766" });
      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
      expect(data.error.message).toBe("Não autenticado");
    });
  });

  // AC #1.5 - Validation
  describe("validation", () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
      });
    });

    it("returns 400 for invalid UUID", async () => {
      const request = createRequest({ phone: "+5511999887766" });
      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "invalid-uuid" }),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toBe("ID de lead inválido");
    });

    it("returns 400 for missing phone", async () => {
      const request = createRequest({});
      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for empty phone", async () => {
      const request = createRequest({ phone: "" });
      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toBe("Telefone é obrigatório");
    });

    it("returns 400 for invalid JSON body", async () => {
      const request = new NextRequest("http://localhost/api/leads/test-id/phone", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toBe("Corpo da requisição inválido");
    });
  });

  // AC #1.2, #1.4 - Update and return
  describe("phone update", () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
      });
    });

    it("updates lead phone and returns data", async () => {
      const mockLead = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        phone: "+5511999887766",
        first_name: "John",
        last_name: "Doe",
      };

      mockSupabase.single.mockResolvedValue({
        data: mockLead,
        error: null,
      });

      const request = createRequest({ phone: "+5511999887766" });
      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual(mockLead);

      // Verify update was called with correct params
      expect(mockSupabase.from).toHaveBeenCalledWith("leads");
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "+5511999887766",
        })
      );
    });

    it("returns 404 when lead not found", async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });

      const request = createRequest({ phone: "+5511999887766" });
      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("NOT_FOUND");
      expect(data.error.message).toBe("Lead não encontrado");
    });

    it("returns 500 on database error", async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: "UNKNOWN", message: "Database error" },
      });

      const request = createRequest({ phone: "+5511999887766" });
      const response = await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // AC #1.3 - Tenant isolation (via RLS)
  describe("tenant isolation", () => {
    it("filters by leadId in update query (RLS handles tenant)", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
      });
      mockSupabase.single.mockResolvedValue({
        data: { id: "550e8400-e29b-41d4-a716-446655440000" },
        error: null,
      });

      const request = createRequest({ phone: "+5511999887766" });
      await PATCH(request, {
        params: Promise.resolve({ leadId: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      // Should filter by leadId - RLS will handle tenant isolation
      expect(mockSupabase.eq).toHaveBeenCalledWith(
        "id",
        "550e8400-e29b-41d4-a716-446655440000"
      );
    });
  });
});
