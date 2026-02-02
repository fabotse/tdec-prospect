/**
 * AI Generate API Route Unit Tests
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 * AC: #1 - Text generation API with streaming support
 * AC: #2 - PromptManager integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/generate/route";

// Use vi.hoisted for mocks that need to be used in vi.mock factories
const { mockGetCurrentUserProfile, mockSingle, mockRenderPrompt, mockGenerateText, mockGenerateStream } = vi.hoisted(() => ({
  mockGetCurrentUserProfile: vi.fn(),
  mockSingle: vi.fn(),
  mockRenderPrompt: vi.fn(),
  mockGenerateText: vi.fn(),
  mockGenerateStream: vi.fn(),
}));

// Mock getCurrentUserProfile
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

// Mock createClient for API key retrieval
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => {
    const mockEq = vi.fn(() => ({ eq: mockEq, single: mockSingle }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));
    return Promise.resolve({
      from: mockFrom,
    });
  }),
}));

// Mock decryptApiKey
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn((encrypted: string) => `decrypted-${encrypted}`),
}));

// Mock PromptManager
vi.mock("@/lib/ai/prompt-manager", () => ({
  PromptManager: vi.fn().mockImplementation(() => ({
    renderPrompt: mockRenderPrompt,
  })),
  promptManager: {
    renderPrompt: mockRenderPrompt,
  },
}));

// Mock createAIProvider
vi.mock("@/lib/ai/providers", () => ({
  createAIProvider: vi.fn(() => ({
    generateText: mockGenerateText,
    generateStream: mockGenerateStream,
  })),
  AIProviderError: class AIProviderError extends Error {
    code: string;
    userMessage: string;
    constructor(provider: string, code: string, message?: string) {
      super(message ?? code);
      this.code = code;
      this.userMessage = message ?? code;
    }
  },
}));

describe("POST /api/ai/generate", () => {
  const createRequest = (body: unknown) => {
    return new NextRequest("http://localhost/api/ai/generate", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockGetCurrentUserProfile.mockResolvedValue({
      tenant_id: "tenant-123",
      user_id: "user-456",
      role: "user",
    });

    mockSingle.mockResolvedValue({
      data: { encrypted_key: "encrypted-api-key" },
      error: null,
    });

    mockRenderPrompt.mockResolvedValue({
      content: "Rendered prompt content",
      modelPreference: "gpt-4o-mini",
      metadata: { temperature: 0.7, maxTokens: 500 },
      source: "global",
    });

    mockGenerateText.mockResolvedValue({
      text: "Generated text",
      model: "gpt-4o-mini",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("returns 401 if user is not authenticated", async () => {
      mockGetCurrentUserProfile.mockResolvedValue(null);

      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 if user has no tenant", async () => {
      mockGetCurrentUserProfile.mockResolvedValue({
        user_id: "user-456",
        tenant_id: null,
      });

      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe("FORBIDDEN");
    });
  });

  describe("Request Validation", () => {
    it("returns 400 for missing promptKey", async () => {
      const request = createRequest({
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for missing variables", async () => {
      const request = createRequest({
        promptKey: "email_subject_generation",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("accepts valid request", async () => {
      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("returns 400 for invalid promptKey not in enum", async () => {
      const request = createRequest({
        promptKey: "invalid_prompt_key",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });

    it("accepts all valid prompt keys", async () => {
      const validKeys = [
        "search_translation",
        "email_subject_generation",
        "email_body_generation",
        "icebreaker_generation",
        "tone_application",
      ];

      for (const promptKey of validKeys) {
        const request = createRequest({
          promptKey,
          variables: { lead_name: "João" },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });
  });

  describe("Prompt Retrieval", () => {
    it("returns 404 if PromptManager returns null", async () => {
      mockRenderPrompt.mockResolvedValue(null);

      // Use a valid prompt key, but mock returns null
      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe("PROMPT_NOT_FOUND");
    });

    it("passes tenantId to PromptManager", async () => {
      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      await POST(request);

      expect(mockRenderPrompt).toHaveBeenCalledWith(
        "email_subject_generation",
        { lead_name: "João" },
        { tenantId: "tenant-123" }
      );
    });
  });

  describe("API Key Retrieval", () => {
    it("returns 401 if API key not configured", async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: new Error("Not found"),
      });

      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("API_KEY_ERROR");
    });
  });

  describe("Text Generation", () => {
    it("returns generated text on success", async () => {
      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.text).toBe("Generated text");
      expect(data.data.model).toBe("gpt-4o-mini");
    });

    it("passes options to provider", async () => {
      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
        options: { temperature: 0.5, maxTokens: 100 },
      });

      await POST(request);

      expect(mockGenerateText).toHaveBeenCalledWith(
        "Rendered prompt content",
        expect.objectContaining({
          temperature: 0.5,
          maxTokens: 100,
        })
      );
    });

    it("uses prompt metadata when options not specified", async () => {
      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      await POST(request);

      expect(mockGenerateText).toHaveBeenCalledWith(
        "Rendered prompt content",
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 500,
        })
      );
    });
  });

  describe("Streaming", () => {
    it("returns SSE stream when stream option is true", async () => {
      // Mock async generator for streaming
      async function* mockStream() {
        yield "Hello";
        yield " ";
        yield "World";
      }
      mockGenerateStream.mockReturnValue(mockStream());

      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
        options: { stream: true },
      });

      const response = await POST(request);

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
    });
  });

  describe("Error Handling", () => {
    it("handles AIProviderError", async () => {
      const { AIProviderError } = await import("@/lib/ai/providers");
      mockGenerateText.mockRejectedValue(
        new AIProviderError("OpenAI", "TIMEOUT", "Timeout error")
      );

      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe("TIMEOUT");
    });

    it("handles generic errors", async () => {
      mockGenerateText.mockRejectedValue(new Error("Unknown error"));

      const request = createRequest({
        promptKey: "email_subject_generation",
        variables: { lead_name: "João" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
