/**
 * Tests for PATCH /api/opportunities/:opportunityId
 * Story 21.4: Central de Oportunidades — transição new→viewed (AC #5)
 * Story 21.5: efeitos de triagem — meeting_booked_at, promoção do lead a
 * 'oportunidade' e guarda de state-machine (AC #4).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUserProfile = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { PATCH } from "@/app/api/opportunities/[opportunityId]/route";

const mockProfile = { tenant_id: "tenant-1", id: "user-1" };
const VALID_OPPORTUNITY_ID = "opp-uuid-123";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/opportunities/test", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(opportunityId: string) {
  return { params: Promise.resolve({ opportunityId }) };
}

/**
 * Chain única para `opportunities`: serve tanto o SELECT do estado atual
 * (21.5) quanto o UPDATE — ambos terminam em `.single()`.
 */
function setupMockUpdateChain(response: { data: unknown; error: unknown }) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

/**
 * Story 21.5 — chains separadas: SELECT do estado atual, UPDATE da oportunidade
 * e UPDATE do lead (tabela `leads`), para assertar cada efeito isoladamente.
 */
function setupTriage(
  current: { status: string; lead_id: string | null },
  opts: { updatedRow?: unknown; leadUpdateError?: unknown } = {}
) {
  const loadChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: current, error: null }),
  };
  const oppUpdateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: opts.updatedRow ?? { id: VALID_OPPORTUNITY_ID },
      error: null,
    }),
  };
  const leadUpdateChain = {
    update: vi.fn(() => leadUpdateChain),
    eq: vi.fn(() => leadUpdateChain),
    then: (resolve: (v: { error: unknown }) => unknown) =>
      resolve({ error: opts.leadUpdateError ?? null }),
  };

  let oppCall = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "leads") return leadUpdateChain;
    oppCall += 1;
    return oppCall === 1 ? loadChain : oppUpdateChain;
  });

  return { loadChain, oppUpdateChain, leadUpdateChain };
}

describe("PATCH /api/opportunities/:opportunityId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserProfile.mockResolvedValue(mockProfile);
  });

  it("should return 401 when not authenticated", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 for invalid JSON body", async () => {
    const request = new NextRequest("http://localhost/api/opportunities/test", {
      method: "PATCH",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, makeParams(VALID_OPPORTUNITY_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("JSON");
  });

  it("should return 400 (not 500) for a JSON null body", async () => {
    // request.json() parseia "null" sem lançar → o destructure quebraria com 500
    const request = new NextRequest("http://localhost/api/opportunities/test", {
      method: "PATCH",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, makeParams(VALID_OPPORTUNITY_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for invalid status", async () => {
    const response = await PATCH(
      makeRequest({ status: "invalid" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing status", async () => {
    const response = await PATCH(makeRequest({}), makeParams(VALID_OPPORTUNITY_ID));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for non-string status", async () => {
    const response = await PATCH(
      makeRequest({ status: 42 }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("should update status to 'viewed' successfully (AC5)", async () => {
    const updatedRow = { id: VALID_OPPORTUNITY_ID, status: "viewed" };
    const chain = setupMockUpdateChain({ data: updatedRow, error: null });

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(updatedRow);
    // Grava SÓ status (sem meeting_booked_at / efeitos da 21.5)
    expect(chain.update).toHaveBeenCalledWith({ status: "viewed" });
  });

  it("should accept the other valid statuses from 'viewed'", async () => {
    for (const status of ["contacted", "discarded"]) {
      const { oppUpdateChain } = setupTriage({ status: "viewed", lead_id: null });

      const response = await PATCH(
        makeRequest({ status }),
        makeParams(VALID_OPPORTUNITY_ID)
      );

      expect(response.status).toBe(200);
      // Só `status` — meeting_booked_at intocado (histórico preservado)
      expect(oppUpdateChain.update).toHaveBeenCalledWith({ status });
    }
  });

  it("should return 404 when opportunity not found (PGRST116)", async () => {
    setupMockUpdateChain({ data: null, error: { code: "PGRST116" } });

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("should return 500 on database error", async () => {
    setupMockUpdateChain({ data: null, error: { code: "OTHER", message: "DB error" } });

    const response = await PATCH(
      makeRequest({ status: "viewed" }),
      makeParams(VALID_OPPORTUNITY_ID)
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("should filter by id and tenant_id when updating", async () => {
    const chain = setupMockUpdateChain({
      data: { id: VALID_OPPORTUNITY_ID, status: "new" },
      error: null,
    });

    await PATCH(makeRequest({ status: "viewed" }), makeParams(VALID_OPPORTUNITY_ID));

    expect(chain.eq).toHaveBeenCalledWith("id", VALID_OPPORTUNITY_ID);
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  // ==============================================
  // Story 21.5 — efeitos de triagem (AC #4)
  // ==============================================

  describe("meeting_booked (AC4 + FR16)", () => {
    it("grava meeting_booked_at junto com o status (atômico, server-side)", async () => {
      const { oppUpdateChain } = setupTriage({ status: "viewed", lead_id: "lead-1" });

      const response = await PATCH(
        makeRequest({ status: "meeting_booked" }),
        makeParams(VALID_OPPORTUNITY_ID)
      );

      expect(response.status).toBe(200);
      const payload = oppUpdateChain.update.mock.calls[0][0];
      expect(payload.status).toBe("meeting_booked");
      expect(payload.meeting_booked_at).toEqual(expect.any(String));
      expect(Number.isNaN(Date.parse(payload.meeting_booked_at))).toBe(false);
    });

    it("promove o lead a 'oportunidade' (AC4)", async () => {
      const { leadUpdateChain } = setupTriage({ status: "viewed", lead_id: "lead-1" });

      await PATCH(
        makeRequest({ status: "meeting_booked" }),
        makeParams(VALID_OPPORTUNITY_ID)
      );

      expect(leadUpdateChain.update).toHaveBeenCalledWith({ status: "oportunidade" });
      expect(leadUpdateChain.eq).toHaveBeenCalledWith("id", "lead-1");
      expect(leadUpdateChain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    });

    it("lead_id null → grava meeting_booked_at sem tentar atualizar lead", async () => {
      const { oppUpdateChain, leadUpdateChain } = setupTriage({
        status: "viewed",
        lead_id: null,
      });

      const response = await PATCH(
        makeRequest({ status: "meeting_booked" }),
        makeParams(VALID_OPPORTUNITY_ID)
      );

      expect(response.status).toBe(200);
      expect(oppUpdateChain.update.mock.calls[0][0].meeting_booked_at).toEqual(
        expect.any(String)
      );
      expect(leadUpdateChain.update).not.toHaveBeenCalled();
    });

    it("falha ao promover o lead é SECUNDÁRIA — o PATCH continua 200", async () => {
      setupTriage(
        { status: "viewed", lead_id: "lead-1" },
        { leadUpdateError: { message: "DB down" } }
      );
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await PATCH(
        makeRequest({ status: "meeting_booked" }),
        makeParams(VALID_OPPORTUNITY_ID)
      );

      expect(response.status).toBe(200);
      consoleSpy.mockRestore();
    });

    it("contacted/discarded NÃO tocam meeting_booked_at nem o status do lead", async () => {
      for (const status of ["contacted", "discarded"]) {
        const { oppUpdateChain, leadUpdateChain } = setupTriage({
          status: "viewed",
          lead_id: "lead-1",
        });

        await PATCH(makeRequest({ status }), makeParams(VALID_OPPORTUNITY_ID));

        expect(oppUpdateChain.update).toHaveBeenCalledWith({ status });
        expect(leadUpdateChain.update).not.toHaveBeenCalled();
      }
    });
  });

  describe("guarda de state-machine (fecha defer da review 21.4)", () => {
    it.each([
      ["contacted", "new"],
      ["contacted", "viewed"],
      ["meeting_booked", "new"],
      ["meeting_booked", "viewed"],
      ["discarded", "new"],
      ["discarded", "viewed"],
    ])("bloqueia %s → %s com 409 (ressuscitaria o card no badge)", async (from, to) => {
      const { oppUpdateChain } = setupTriage({ status: from, lead_id: "lead-1" });

      const response = await PATCH(makeRequest({ status: to }), makeParams(VALID_OPPORTUNITY_ID));
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error.code).toBe("INVALID_TRANSITION");
      expect(oppUpdateChain.update).not.toHaveBeenCalled();
    });

    it.each([
      ["new", "viewed"],
      ["viewed", "contacted"],
      ["viewed", "meeting_booked"],
      ["new", "discarded"],
      ["contacted", "discarded"],
      ["contacted", "meeting_booked"],
      ["meeting_booked", "discarded"],
      ["discarded", "contacted"],
    ])("permite %s → %s", async (from, to) => {
      const { oppUpdateChain } = setupTriage({ status: from, lead_id: null });

      const response = await PATCH(makeRequest({ status: to }), makeParams(VALID_OPPORTUNITY_ID));

      expect(response.status).toBe(200);
      expect(oppUpdateChain.update).toHaveBeenCalled();
    });

    it("retorna 404 quando a oportunidade não existe ao carregar o estado atual", async () => {
      const loadChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      };
      mockFrom.mockReturnValue(loadChain);

      const response = await PATCH(
        makeRequest({ status: "contacted" }),
        makeParams(VALID_OPPORTUNITY_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });
});
