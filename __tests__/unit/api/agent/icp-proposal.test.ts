/**
 * Unit Tests for GET /api/agent/briefing/icp-proposal
 * Story 24.14 - Briefing a partir do ICP
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/agent/briefing/icp-proposal/route";

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

const mockReadTenantICP = vi.fn();
vi.mock("@/lib/agent/contextual-suggestions", () => ({
  readTenantICP: (...args: unknown[]) => mockReadTenantICP(...args),
}));

const EMPTY_ICP = { jobTitles: [], industries: [], companySizes: [], geographicFocus: [] };

describe("GET /api/agent/briefing/icp-proposal (Story 24.14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue({ id: "user-1", tenant_id: "tenant-1" });
  });

  it("401 sem perfil (nao le o ICP)", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockReadTenantICP).not.toHaveBeenCalled();
  });

  it("devolve a proposta montada do ICP do tenant", async () => {
    mockReadTenantICP.mockResolvedValue({
      jobTitles: ["CISO", "Head de TI"],
      industries: ["Fintech"],
      companySizes: ["201-500", "501-1000"],
      geographicFocus: ["SP"],
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockReadTenantICP).toHaveBeenCalledWith("tenant-1");
    expect(json.data.proposal).toMatchObject({
      jobTitles: ["CISO", "Head de TI"],
      location: null,
      companySize: null,
      industry: null,
      mode: "guided",
      skipSteps: ["search_companies"],
      icpDefaults: { companySizes: ["201-500", "501-1000"], locations: ["SP"] },
    });
  });

  it("ICP sem cargos (ou sem linha) -> proposal null", async () => {
    mockReadTenantICP.mockResolvedValue({
      ...EMPTY_ICP,
      companySizes: ["201-500"],
      geographicFocus: ["SP"],
    });
    expect((await (await GET()).json()).data.proposal).toBeNull();

    mockReadTenantICP.mockResolvedValue(EMPTY_ICP);
    expect((await (await GET()).json()).data.proposal).toBeNull();
  });
});
