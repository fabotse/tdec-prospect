/**
 * Unit Tests for /api/agent/executions/[executionId]/messages
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #1 - Enviar mensagem do usuario e persistir
 * AC: #4 - Carregar historico de mensagens
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/agent/executions/[executionId]/messages/route";
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

const mockExecutionId = "exec-001";
const createParams = (executionId = mockExecutionId) =>
  ({ params: Promise.resolve({ executionId }) }) as { params: Promise<{ executionId: string }> };

function createPostRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/agent/executions/${mockExecutionId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }
  );
}

function createGetRequest() {
  return new NextRequest(
    `http://localhost/api/agent/executions/${mockExecutionId}/messages`,
    { method: "GET" }
  );
}

describe("Agent Messages API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainBuilder());
  });

  // ==============================================
  // POST /api/agent/executions/[executionId]/messages (AC: #1)
  // ==============================================
  describe("POST /api/agent/executions/[executionId]/messages (AC: #1)", () => {
    function setupPostMocks() {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

      const executionChain = createChainBuilder({
        data: { id: mockExecutionId },
        error: null,
      });

      const messagesChain = createChainBuilder({
        data: {
          id: "msg-001",
          execution_id: mockExecutionId,
          role: "user",
          content: "Buscar leads de tecnologia",
          metadata: { messageType: "text" },
          created_at: "2026-03-26T10:00:00Z",
        },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_messages") return messagesChain;
        return createChainBuilder();
      });

      return { executionChain, messagesChain };
    }

    it("should return 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);
      const request = createPostRequest({ content: "Teste" });
      const response = await POST(request, createParams());
      expect(response.status).toBe(401);
    });

    it("should return 404 when execution does not exist", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

      const executionChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        return createChainBuilder();
      });

      const request = createPostRequest({ content: "Teste" });
      const response = await POST(request, createParams());
      expect(response.status).toBe(404);
    });

    it("should return 400 when content is missing", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: { id: mockExecutionId }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        return createChainBuilder();
      });

      const request = createPostRequest({});
      const response = await POST(request, createParams());
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when content is empty string", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: { id: mockExecutionId }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        return createChainBuilder();
      });

      const request = createPostRequest({ content: "  " });
      const response = await POST(request, createParams());
      expect(response.status).toBe(400);
    });

    it("should return 400 when role is invalid", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: { id: mockExecutionId }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        return createChainBuilder();
      });

      const request = createPostRequest({ content: "Teste", role: "admin" });
      const response = await POST(request, createParams());
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should accept agent role for agent messages (Story 16.3)", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: { id: mockExecutionId }, error: null });
      const messagesChain = createChainBuilder({
        data: {
          id: "msg-002",
          execution_id: mockExecutionId,
          role: "agent",
          content: "Entendi seu briefing",
          metadata: { messageType: "text" },
          created_at: "2026-03-26T10:00:00Z",
        },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_messages") return messagesChain;
        return createChainBuilder();
      });

      const request = createPostRequest({ content: "Entendi seu briefing", role: "agent" });
      const response = await POST(request, createParams());
      expect(response.status).toBe(201);
    });

    it("should create message and return 201", async () => {
      setupPostMocks();
      const request = createPostRequest({ content: "Buscar leads de tecnologia", role: "user" });
      const response = await POST(request, createParams());

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data).toBeDefined();
      expect(json.data.role).toBe("user");
      expect(json.data.content).toBe("Buscar leads de tecnologia");
    });

    it("should call supabase insert with correct data", async () => {
      setupPostMocks();
      const request = createPostRequest({ content: "Buscar leads" });
      await POST(request, createParams());

      expect(mockFrom).toHaveBeenCalledWith("agent_messages");
    });

    it("should return 500 on insert error", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: { id: mockExecutionId }, error: null });
      const messagesChain = createChainBuilder({ data: null, error: { message: "DB error" } });

      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_messages") return messagesChain;
        return createChainBuilder();
      });

      const request = createPostRequest({ content: "Teste" });
      const response = await POST(request, createParams());
      expect(response.status).toBe(500);
    });

    it("should return 400 for invalid JSON body", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: { id: mockExecutionId }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        return createChainBuilder();
      });

      const request = new NextRequest(
        `http://localhost/api/agent/executions/${mockExecutionId}/messages`,
        {
          method: "POST",
          body: "invalid json{",
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await POST(request, createParams());
      expect(response.status).toBe(400);
    });
  });

  // ==============================================
  // GET /api/agent/executions/[executionId]/messages (AC: #4)
  // ==============================================
  describe("GET /api/agent/executions/[executionId]/messages (AC: #4)", () => {
    const mockMessages = [
      {
        id: "msg-001",
        execution_id: mockExecutionId,
        role: "user",
        content: "Buscar leads",
        metadata: { messageType: "text" },
        created_at: "2026-03-26T10:00:00Z",
      },
      {
        id: "msg-002",
        execution_id: mockExecutionId,
        role: "agent",
        content: "Buscando leads...",
        metadata: { messageType: "progress" },
        created_at: "2026-03-26T10:00:01Z",
      },
    ];

    function setupGetMocks(messages = mockMessages) {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

      const executionChain = createChainBuilder({
        data: { id: mockExecutionId },
        error: null,
      });

      const messagesChain = createChainBuilder({
        data: messages,
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_messages") return messagesChain;
        return createChainBuilder();
      });

      return { executionChain, messagesChain };
    }

    it("should return 401 when user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);
      const request = createGetRequest();
      const response = await GET(request, createParams());
      expect(response.status).toBe(401);
    });

    it("should return 404 when execution does not exist", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: null, error: { code: "PGRST116" } });
      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        return createChainBuilder();
      });

      const request = createGetRequest();
      const response = await GET(request, createParams());
      expect(response.status).toBe(404);
    });

    it("should return messages ordered by created_at ASC", async () => {
      setupGetMocks();
      const request = createGetRequest();
      const response = await GET(request, createParams());

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toHaveLength(2);
      expect(json.data[0].role).toBe("user");
      expect(json.data[1].role).toBe("agent");
    });

    it("should return empty array when no messages exist", async () => {
      setupGetMocks([]);
      const request = createGetRequest();
      const response = await GET(request, createParams());

      const json = await response.json();
      expect(json.data).toEqual([]);
    });

    it("should return 500 on database error", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
      const executionChain = createChainBuilder({ data: { id: mockExecutionId }, error: null });
      const messagesChain = createChainBuilder({ data: null, error: { message: "DB error" } });

      mockFrom.mockImplementation((table: string) => {
        if (table === "agent_executions") return executionChain;
        if (table === "agent_messages") return messagesChain;
        return createChainBuilder();
      });

      const request = createGetRequest();
      const response = await GET(request, createParams());
      expect(response.status).toBe(500);
    });
  });
});
