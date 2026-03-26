/**
 * Unit Tests for /api/agent/executions
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #1 - Criar execucao para iniciar chat
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/executions/route";
import { createChainBuilder } from "../../helpers/mock-supabase";

// Mock getCurrentUserProfile
const mockGetCurrentUserProfile = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Mock Supabase
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const mockProfile = {
  id: "user-123",
  tenant_id: "tenant-456",
  role: "user",
};

describe("Agent Executions API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  describe("POST /api/agent/executions (AC: #1)", () => {
    it("should return 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);
      const response = await POST();
      expect(response.status).toBe(401);
    });

    it("should create execution with pending status and return 201", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

      const mockExecution = {
        id: "exec-001",
        tenant_id: mockProfile.tenant_id,
        user_id: mockProfile.id,
        status: "pending",
        mode: "guided",
        briefing: {},
        current_step: 0,
        total_steps: 5,
        created_at: "2026-03-26T10:00:00Z",
        updated_at: "2026-03-26T10:00:00Z",
      };

      const chain = createChainBuilder({ data: mockExecution, error: null });
      mockFrom.mockImplementation(() => chain);

      const response = await POST();
      expect(response.status).toBe(201);

      const json = await response.json();
      expect(json.data.status).toBe("pending");
      expect(json.data.mode).toBe("guided");
      expect(json.data.total_steps).toBe(5);
    });

    it("should call supabase insert with correct fields", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const chain = createChainBuilder({ data: { id: "exec-001" }, error: null });
      mockFrom.mockImplementation(() => chain);

      await POST();

      expect(mockFrom).toHaveBeenCalledWith("agent_executions");
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: mockProfile.tenant_id,
          user_id: mockProfile.id,
          status: "pending",
          mode: "guided",
          total_steps: 5,
        })
      );
    });

    it("should return 500 on database error", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const chain = createChainBuilder({ data: null, error: { message: "DB error" } });
      mockFrom.mockImplementation(() => chain);

      const response = await POST();
      expect(response.status).toBe(500);
    });
  });
});
