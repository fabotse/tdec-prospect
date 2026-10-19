/**
 * GET /api/knowledge-base/context
 * Story 24.7: provas da KB no payload; erro da tabela de provas não derruba a rota
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabaseClient,
  mockTableResponse,
  type MockSupabaseClient,
} from "../../../../../helpers/mock-supabase";

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/knowledge-base/context/route";

const TENANT_ID = "tenant-1";

const proof = {
  id: "p1",
  tenant_id: TENANT_ID,
  proof_type: "case",
  text: "Acme reduziu 30% do retrabalho",
  sector: "Indústria",
  is_authorized: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("GET /api/knowledge-base/context (Story 24.7)", () => {
  let client: MockSupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockSupabaseClient();
    mockTableResponse(client, "knowledge_base", {
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });
    mockTableResponse(client, "knowledge_base_examples", { data: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(getCurrentUserProfile).mockResolvedValue({
      id: "user-1",
      tenant_id: TENANT_ID,
      role: "sdr",
    } as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUserProfile).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("includes the tenant proofs in the payload, oldest first", async () => {
    const chain = mockTableResponse(client, "knowledge_base_proofs", { data: [proof] });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.proofs).toEqual([proof]);
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID);
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("returns 200 with proofs: [] when the proofs table is missing (42P01)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockTableResponse(client, "knowledge_base_proofs", {
      error: { code: "42P01", message: 'relation "knowledge_base_proofs" does not exist' },
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      company: null,
      tone: null,
      icp: null,
      examples: [],
      proofs: [],
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
