/**
 * Story 24.25 — POST /api/agent/lead-history (somente leitura)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/lead-history/route";

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const sessionClient = { from: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => sessionClient),
}));

const mockFindLeadWorkHistory = vi.fn();
vi.mock("@/lib/agent/execution-memory", () => ({
  findLeadWorkHistory: (...args: unknown[]) => mockFindLeadWorkHistory(...args),
  MAX_HISTORY_IDS: 500,
  MAX_HISTORY_NAMES: 500,
}));

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/agent/lead-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const HISTORY = {
  leads: { "ap-1": [{ campaignName: "Camp 1", date: "2026-10-01T12:00:00Z", result: "no_reply" }] },
  accounts: {},
};

describe("POST /api/agent/lead-history (24.25)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue({ id: "u", tenant_id: "tenant-1" });
    mockFindLeadWorkHistory.mockResolvedValue(HISTORY);
  });

  it("401 sem perfil", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);
    const response = await call({ apolloIds: [], companyNames: [] });
    expect(response.status).toBe(401);
    expect(mockFindLeadWorkHistory).not.toHaveBeenCalled();
  });

  it.each([
    ["JSON inválido", "{nao-e-json"],
    ["apolloIds não é array", { apolloIds: "ap-1", companyNames: [] }],
    ["mais de 500 itens", { apolloIds: Array.from({ length: 501 }, (_, i) => `ap-${i}`), companyNames: [] }],
    ["item com mais de 200 caracteres", { apolloIds: [], companyNames: ["x".repeat(201)] }],
  ])("400 com %s", async (_label, body) => {
    const response = await call(body);
    expect(response.status).toBe(400);
    expect(mockFindLeadWorkHistory).not.toHaveBeenCalled();
  });

  it("200 com o histórico, client de sessão e tenant do perfil", async () => {
    const response = await call({ apolloIds: ["ap-1"], companyNames: ["Acme"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: HISTORY });
    expect(mockFindLeadWorkHistory).toHaveBeenCalledWith(sessionClient, "tenant-1", ["ap-1"], ["Acme"]);
  });
});
