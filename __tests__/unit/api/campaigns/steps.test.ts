/**
 * Unit Tests for /api/campaigns/[campaignId]/steps
 * Story 14.6: Tooltip com Preview do Email por Step
 *
 * AC: #2 — Primary source: email_blocks. Fallback: Instantly API.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
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

// Mock decryptApiKey
vi.mock("@/lib/crypto/encryption", () => ({
  decryptApiKey: vi.fn((key: string) => `decrypted-${key}`),
}));

// Mock fetch for Instantly API fallback
const originalFetch = global.fetch;
global.fetch = vi.fn();

import { GET } from "@/app/api/campaigns/[campaignId]/steps/route";

afterAll(() => {
  global.fetch = originalFetch;
});

// ==============================================
// HELPERS
// ==============================================

const TENANT_ID = "tenant-001";
const CAMPAIGN_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const EXTERNAL_CAMPAIGN_ID = "instantly-campaign-123";
const INVALID_ID = "not-a-uuid";

function createRequest(): Request {
  return new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/steps`);
}

function createParams(campaignId = CAMPAIGN_ID) {
  return { params: Promise.resolve({ campaignId }) };
}

const mockProfile = {
  id: "user-001",
  tenant_id: TENANT_ID,
  role: "user" as const,
};

// ==============================================
// TESTS
// ==============================================

describe("GET /api/campaigns/[campaignId]/steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Nao autenticado");
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const response = await GET(createRequest(), createParams(INVALID_ID));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("ID de campanha invalido");
  });

  it("returns steps from local email_blocks (primary source)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const emailBlocksChain = createChainBuilder({
      data: [
        { position: 0, subject: "Olá {{firstName}}", body: "Corpo do email 1" },
        { position: 1, subject: "Follow-up", body: "Corpo do follow-up" },
        { position: 2, subject: "Última tentativa", body: "" },
      ],
      error: null,
    });

    mockFrom.mockReturnValue(emailBlocksChain);

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      { stepNumber: 0, subject: "Olá {{firstName}}", body: "Corpo do email 1" },
      { stepNumber: 1, subject: "Follow-up", body: "Corpo do follow-up" },
      { stepNumber: 2, subject: "Última tentativa", body: "" },
    ]);
  });

  it("returns empty array when no blocks and no external campaign", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // email_blocks returns empty
    const emptyBlocksChain = createChainBuilder({ data: [], error: null });

    // campaigns query returns no external_campaign_id
    const campaignChain = createChainBuilder({
      data: { id: CAMPAIGN_ID, external_campaign_id: null },
      error: null,
    });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emptyBlocksChain;
      return campaignChain;
    });

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("falls back to Instantly API when no local blocks exist", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    // email_blocks returns empty
    const emptyBlocksChain = createChainBuilder({ data: [], error: null });

    // campaigns query returns external_campaign_id
    const campaignChain = createChainBuilder({
      data: { id: CAMPAIGN_ID, external_campaign_id: EXTERNAL_CAMPAIGN_ID },
      error: null,
    });

    // api_configs returns encrypted key
    const apiConfigChain = createChainBuilder({
      data: { encrypted_key: "enc-key-123" },
      error: null,
    });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emptyBlocksChain;
      if (fromCallCount === 2) return campaignChain;
      return apiConfigChain;
    });

    // Mock Instantly API response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: EXTERNAL_CAMPAIGN_ID,
        name: "Campaign",
        status: 1,
        sequences: [
          {
            steps: [
              { type: "email", delay: 0, variants: [{ subject: "Instantly Step 1", body: "<p>Body</p>" }] },
              { type: "email", delay: 2, variants: [{ subject: "Instantly Step 2", body: "<p>Body 2</p>" }] },
            ],
          },
        ],
      }),
    } as Response);

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      { stepNumber: 0, subject: "Instantly Step 1", body: "<p>Body</p>" },
      { stepNumber: 1, subject: "Instantly Step 2", body: "<p>Body 2</p>" },
    ]);

    expect(fetch).toHaveBeenCalledWith(
      `https://api.instantly.ai/api/v2/campaigns/${EXTERNAL_CAMPAIGN_ID}`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer decrypted-enc-key-123",
        }),
      })
    );
  });

  it("returns empty array when Instantly API fails", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const emptyBlocksChain = createChainBuilder({ data: [], error: null });
    const campaignChain = createChainBuilder({
      data: { id: CAMPAIGN_ID, external_campaign_id: EXTERNAL_CAMPAIGN_ID },
      error: null,
    });
    const apiConfigChain = createChainBuilder({
      data: { encrypted_key: "enc-key-123" },
      error: null,
    });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emptyBlocksChain;
      if (fromCallCount === 2) return campaignChain;
      return apiConfigChain;
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Not found" }),
    } as Response);

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns empty array when no API key configured", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const emptyBlocksChain = createChainBuilder({ data: [], error: null });
    const campaignChain = createChainBuilder({
      data: { id: CAMPAIGN_ID, external_campaign_id: EXTERNAL_CAMPAIGN_ID },
      error: null,
    });
    const noConfigChain = createChainBuilder({ data: null, error: null });

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return emptyBlocksChain;
      if (fromCallCount === 2) return campaignChain;
      return noConfigChain;
    });

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns 500 when email_blocks query fails", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const errorChain = createChainBuilder({
      data: null,
      error: { message: "Database error", code: "PGRST301" },
    });

    mockFrom.mockReturnValue(errorChain);

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Erro ao buscar email blocks");
  });

  it("handles null subject and body in email_blocks gracefully", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);

    const blocksChain = createChainBuilder({
      data: [
        { position: 0, subject: "Valid subject", body: "Valid body" },
        { position: 1, subject: null, body: null },
      ],
      error: null,
    });

    mockFrom.mockReturnValue(blocksChain);

    const response = await GET(createRequest(), createParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      { stepNumber: 0, subject: "Valid subject", body: "Valid body" },
      { stepNumber: 1, subject: "", body: "" },
    ]);
  });
});
