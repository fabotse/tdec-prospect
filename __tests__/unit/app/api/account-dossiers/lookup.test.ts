/**
 * Unit Tests for GET /api/account-dossiers/lookup
 * Story 24.22 - AC 1-4, 6
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createQueueSupabase } from "../../../../helpers/queue-supabase";

const mockGetCurrentUserProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetCurrentUserProfile(),
}));

let fake = createQueueSupabase();
const mockCreateClient = vi.fn(async () => fake.client);
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

import { GET } from "@/app/api/account-dossiers/lookup/route";
import * as routeModule from "@/app/api/account-dossiers/lookup/route";

const EXEC = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LEAD = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const profile = { id: "user-1", tenant_id: "tenant-1" };

function req(query: string) {
  return new NextRequest(`http://localhost/api/account-dossiers/lookup?${query}`);
}

describe("GET /api/account-dossiers/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake = createQueueSupabase();
    mockGetCurrentUserProfile.mockResolvedValue(profile);
  });

  it("só exporta GET (nenhum handler de escrita)", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET"]);
  });

  it("401 sem perfil", async () => {
    mockGetCurrentUserProfile.mockResolvedValue(null);
    const res = await GET(req("apolloId=ap-1"));
    expect(res.status).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("400 sem identificador", async () => {
    const res = await GET(req(`executionId=${EXEC}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("400 com executionId ou leadId inválido", async () => {
    expect((await GET(req("executionId=nao-uuid&apolloId=ap-1"))).status).toBe(400);
    expect((await GET(req("leadId=1%27%20or%201%3D1"))).status).toBe(400);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("400 com e-mail ou apolloId longos demais", async () => {
    expect((await GET(req(`email=${"a".repeat(321)}`))).status).toBe(400);
    expect((await GET(req(`apolloId=${"a".repeat(101)}`))).status).toBe(400);
  });

  it("404 com execução de outro tenant", async () => {
    fake.push("agent_executions", { data: null });
    const res = await GET(req(`executionId=${EXEC}&apolloId=ap-1`));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    const exec = fake.callsTo("agent_executions")[0].chain;
    expect(exec.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("200 none", async () => {
    const res = await GET(req("email=ANA%40acme.com"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "none" } });
    const link = fake.callsTo("account_dossier_leads")[0].chain;
    expect(link.eq).toHaveBeenCalledWith("lead_email", "ana@acme.com");
    expect(link.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("200 found pelo leadId", async () => {
    fake.push("leads", { data: { apollo_id: null } });
    fake.push("account_dossier_leads", {
      data: [{ dossier_id: "d-1", execution_id: null, created_at: "2026-10-01T00:00:00Z" }],
    });
    fake.push("account_dossiers", {
      data: {
        id: "d-1",
        company_domain: "acme.com",
        company_name: "Acme",
        status: "complete",
        failed_sources: [],
        researched_at: "2026-10-01T00:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
      },
    });
    fake.push("account_dossier_facts", {
      data: [
        {
          kind: "site",
          fato: "Acme faz ERP",
          fonte_url: "https://acme.com",
          data: "2026-10-01",
          confianca: "media",
          lead_apollo_id: null,
          lead_email: null,
        },
      ],
    });
    const res = await GET(req(`leadId=${LEAD}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("found");
    expect(json.data.dossier).toMatchObject({ id: "d-1", companyName: "Acme", expired: false });
    expect(json.data.facts).toHaveLength(1);
    expect(json.data.whyNow).toBeNull();
  });

  it("500 genérico sem vazar mensagem do banco", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.push("account_dossier_leads", { error: { message: "permission denied for table account_dossier_leads" } });
    const res = await GET(req("apolloId=ap-1"));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toContain("permission denied");
    spy.mockRestore();
  });

  it("500 quando algo lança (try/catch no handler)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateClient.mockRejectedValueOnce(new Error("cookies indisponíveis"));
    const res = await GET(req("apolloId=ap-1"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("cookies");
    spy.mockRestore();
  });
});
