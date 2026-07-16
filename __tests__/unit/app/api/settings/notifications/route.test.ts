/**
 * Tests for /api/settings/notifications (Story 21.7 — writer de notification_settings, AC3)
 * Cobre: 401 sem sessão, 403 não-admin, GET default (PGRST116), PUT valida E.164 (400),
 * PUT válido persiste snake_case.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createMockSupabaseClient,
  mockTableResponse,
  type MockSupabaseClient,
} from "../../../../../helpers/mock-supabase";

const mockGetProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetProfile(),
}));

let mockClient: MockSupabaseClient;
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockClient),
}));

import { GET, PUT } from "@/app/api/settings/notifications/route";

function profile(role: string) {
  return { id: "user-1", role, tenant_id: "tenant-1" };
}

function putRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings/notifications", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  whatsappNumbers: ["5511999999999"],
  channels: { whatsapp: true, inApp: true, whatsappEngagement: false },
  notifyIntents: ["interessado", "pediu_info"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
});

describe("GET /api/settings/notifications", () => {
  it("401 sem sessão", async () => {
    mockGetProfile.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 para não-admin (sdr)", async () => {
    mockGetProfile.mockResolvedValue(profile("sdr"));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET default (PGRST116 = sem linha) → defaults + exists false", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    mockTableResponse(mockClient, "notification_settings", {
      data: null,
      error: { code: "PGRST116" },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.exists).toBe(false);
    expect(json.data.settings.channels).toEqual({
      whatsapp: true,
      inApp: true,
      whatsappEngagement: false,
    });
    expect(json.data.settings.notifyIntents).toEqual(["interessado", "pediu_info"]);
  });
});

describe("PUT /api/settings/notifications", () => {
  it("401 sem sessão", async () => {
    mockGetProfile.mockResolvedValue(null);
    const res = await PUT(putRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("403 para não-admin (sdr)", async () => {
    mockGetProfile.mockResolvedValue(profile("sdr"));
    const res = await PUT(putRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("400 para número WhatsApp inválido (E.164)", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    const res = await PUT(putRequest({ ...VALID_BODY, whatsappNumbers: ["123"] }));
    expect(res.status).toBe(400);
  });

  it("400 para intent inválido", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    const res = await PUT(putRequest({ ...VALID_BODY, notifyIntents: ["interessado", "lixo"] }));
    expect(res.status).toBe(400);
  });

  it("PUT válido persiste snake_case e retorna settings", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    const chain = mockTableResponse(mockClient, "notification_settings", {
      data: {
        id: "ns-1",
        tenant_id: "tenant-1",
        whatsapp_numbers: ["5511999999999"],
        channels: { whatsapp: true, in_app: true, whatsapp_engagement: false },
        notify_intents: ["interessado", "pediu_info"],
        created_at: "2026-07-16T00:00:00Z",
        updated_at: "2026-07-16T00:00:00Z",
      },
    });

    const res = await PUT(putRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.exists).toBe(true);
    expect(json.data.settings.channels.whatsappEngagement).toBe(false);

    // Persistiu no shape snake_case (channels.in_app / whatsapp_engagement).
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        whatsapp_numbers: ["5511999999999"],
        channels: { whatsapp: true, in_app: true, whatsapp_engagement: false },
      }),
      { onConflict: "tenant_id" }
    );
  });

  it("sanitiza número com máscara antes de persistir", async () => {
    mockGetProfile.mockResolvedValue(profile("gestor"));
    const chain = mockTableResponse(mockClient, "notification_settings", {
      data: {
        id: "ns-1",
        tenant_id: "tenant-1",
        whatsapp_numbers: ["5511999999999"],
        channels: { whatsapp: true, in_app: true, whatsapp_engagement: false },
        notify_intents: [],
        created_at: "2026-07-16T00:00:00Z",
        updated_at: "2026-07-16T00:00:00Z",
      },
    });

    await PUT(putRequest({ ...VALID_BODY, whatsappNumbers: ["+55 (11) 99999-9999"] }));

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_numbers: ["5511999999999"] }),
      { onConflict: "tenant_id" }
    );
  });
});
