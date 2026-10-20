/**
 * POST /api/ai/campaign-structure
 * Story 24.7: só as provas autorizadas chegam em authorized_proofs do prompt
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockSupabaseClient,
  mockTableResponse,
  type MockSupabaseClient,
} from "../../../../../helpers/mock-supabase";

const mockRenderPrompt = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/agent/service-keys", () => ({
  readServiceApiKey: vi.fn(async () => ({ status: "ok", apiKey: "sk-test" })),
}));

vi.mock("@/lib/ai", () => ({
  promptManager: {
    renderPrompt: (...args: unknown[]) => mockRenderPrompt(...args),
  },
  createAIProvider: vi.fn(() => ({ generateText: mockGenerateText })),
  AIProviderError: class AIProviderError extends Error {},
}));

import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/ai/campaign-structure/route";

const TENANT_ID = "tenant-1";

function makeRequest() {
  return new NextRequest("http://localhost/api/ai/campaign-structure", {
    method: "POST",
    body: JSON.stringify({
      objective: "cold_outreach",
      tone: "casual",
      urgency: "medium",
    }),
  });
}

describe("POST /api/ai/campaign-structure (Story 24.7)", () => {
  let client: MockSupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockSupabaseClient();
    mockTableResponse(client, "knowledge_base", { data: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(getCurrentUserProfile).mockResolvedValue({
      id: "user-1",
      tenant_id: TENANT_ID,
      role: "sdr",
    } as never);
    mockRenderPrompt.mockResolvedValue({
      content: "prompt",
      metadata: {},
      modelPreference: "gpt-4o",
    });
    mockGenerateText.mockResolvedValue({ text: "{}", model: "gpt-4o" });
  });

  it("passes only authorized proofs to renderPrompt", async () => {
    mockTableResponse(client, "knowledge_base_proofs", {
      data: [
        {
          id: "p1",
          tenant_id: TENANT_ID,
          proof_type: "case",
          text: "Acme reduziu 30% do retrabalho",
          sector: "Indústria",
          is_authorized: true,
          created_at: "2026-10-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
        },
        {
          id: "p2",
          tenant_id: TENANT_ID,
          proof_type: "numero",
          text: "1.000 clientes atendidos",
          sector: null,
          is_authorized: false,
          created_at: "2026-10-02T00:00:00Z",
          updated_at: "2026-10-02T00:00:00Z",
        },
      ],
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockRenderPrompt).toHaveBeenCalledWith(
      "campaign_structure_generation",
      expect.anything(),
      { tenantId: TENANT_ID }
    );
    const variables = mockRenderPrompt.mock.calls[0][1] as Record<string, string>;
    expect(variables.authorized_proofs).toBe(
      "- Case: Acme reduziu 30% do retrabalho (setor: Indústria)"
    );
  });

  it("passes an empty authorized_proofs when the proofs table fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockTableResponse(client, "knowledge_base_proofs", {
      error: { code: "42P01", message: "relation does not exist" },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const variables = mockRenderPrompt.mock.calls[0][1] as Record<string, string>;
    expect(variables.authorized_proofs).toBe("");
    errorSpy.mockRestore();
  });
});
