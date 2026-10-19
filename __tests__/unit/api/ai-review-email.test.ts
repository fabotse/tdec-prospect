/**
 * POST /api/ai/review-email — Story 24.9
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetCurrentUserProfile, mockSingle, mockReadServiceApiKey, mockReviewEmailCopy, mockLogCopyReview } =
  vi.hoisted(() => ({
    mockGetCurrentUserProfile: vi.fn(),
    mockSingle: vi.fn(),
    mockReadServiceApiKey: vi.fn(),
    mockReviewEmailCopy: vi.fn(),
    mockLogCopyReview: vi.fn(),
  }));

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => {
    const mockEq = vi.fn(() => ({ eq: mockEq, single: mockSingle }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    return Promise.resolve({ from: vi.fn(() => ({ select: mockSelect })) });
  }),
}));

vi.mock("@/lib/agent/service-keys", () => ({
  readServiceApiKey: (...args: unknown[]) => mockReadServiceApiKey(...args),
}));

vi.mock("@/lib/ai/copy-reviewer", () => ({
  reviewEmailCopy: (...args: unknown[]) => mockReviewEmailCopy(...args),
  logCopyReview: (...args: unknown[]) => mockLogCopyReview(...args),
}));

import { POST } from "@/app/api/ai/review-email/route";

const createRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/ai/review-email", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const VALID_BODY = {
  subject: "Assunto",
  body: "Corpo {{first_name}}",
  emailMode: "initial",
  productId: "prod-1",
  variables: {
    target_titles: "CTO",
    target_industries: "Fintech",
    pain_points: "Fraude",
    icp_summary: "Medias",
    authorized_proofs: "- Case Banco X",
  },
  emailPosition: 2,
};

describe("POST /api/ai/review-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue({ tenant_id: "tenant-1", id: "user-1" });
    mockReadServiceApiKey.mockResolvedValue({ status: "ok", apiKey: "sk-test" });
    mockSingle.mockResolvedValue({
      data: {
        id: "prod-1",
        tenant_id: "tenant-1",
        name: "Produto DB",
        description: "Descricao DB",
        features: null,
        differentials: null,
        target_audience: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
      error: null,
    });
    mockReviewEmailCopy.mockResolvedValue({
      subject: "Assunto revisado",
      body: "Corpo revisado {{first_name}}",
      status: "rewritten",
      reasons: [],
      calls: 3,
      promptTokens: 300,
      completionTokens: 90,
      estimatedCost: 0.001,
    });
    mockLogCopyReview.mockResolvedValue(undefined);
  });

  it("401 sem usuario", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);
    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mockReviewEmailCopy).not.toHaveBeenCalled();
  });

  it("403 sem tenant", async () => {
    mockGetCurrentUserProfile.mockResolvedValue({ tenant_id: null });
    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("400 com body invalido", async () => {
    const res = await POST(createRequest({ subject: "", body: "x", emailMode: "initial" }));
    expect(res.status).toBe(400);
    const resBad = await POST(createRequest("nao-json"));
    expect(resBad.status).toBe(400);
    expect(mockReviewEmailCopy).not.toHaveBeenCalled();
  });

  it("400 com assunto ou corpo longo demais", async () => {
    const longSubject = await POST(createRequest({ ...VALID_BODY, subject: "a".repeat(1001) }));
    expect(longSubject.status).toBe(400);
    const longBody = await POST(createRequest({ ...VALID_BODY, body: "a".repeat(20001) }));
    expect(longBody.status).toBe(400);
    expect(mockReviewEmailCopy).not.toHaveBeenCalled();
  });

  it("sem chave OpenAI: 200 com not_reviewed e o texto enviado, sem chamada e sem log", async () => {
    mockReadServiceApiKey.mockResolvedValue({ status: "missing" });
    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      subject: "Assunto",
      body: "Corpo {{first_name}}",
      status: "not_reviewed",
      reasons: [],
    });
    expect(mockReviewEmailCopy).not.toHaveBeenCalled();
    expect(mockLogCopyReview).not.toHaveBeenCalled();
  });

  it("sucesso: revisa com o contexto (variaveis + produto do banco), loga manual e devolve o resultado", async () => {
    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      subject: "Assunto revisado",
      body: "Corpo revisado {{first_name}}",
      status: "rewritten",
      reasons: [],
    });

    const [input, options] = mockReviewEmailCopy.mock.calls[0];
    expect(options).toEqual({ apiKey: "sk-test" });
    expect(input).toMatchObject({
      subject: "Assunto",
      body: "Corpo {{first_name}}",
      emailMode: "initial",
      context: {
        productName: "Produto DB",
        productDescription: "Descricao DB",
        targetIndustries: "Fintech",
        painPoints: "Fraude",
        icpSummary: "Medias",
        authorizedProofs: "- Case Banco X",
      },
    });
    expect(input.context.audience).toContain("CTO");

    expect(mockLogCopyReview).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rewritten" }),
      { tenantId: "tenant-1", source: "manual", emailPosition: 2 }
    );
  });
});
