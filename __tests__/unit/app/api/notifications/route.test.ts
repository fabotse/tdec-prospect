/**
 * Tests for /api/notifications (list + unread-count + [id] mark-read)
 * Story 21.7 (AC2) — Central de notificações in-app.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabaseClient,
  mockTableResponse,
  type MockSupabaseClient,
} from "../../../../helpers/mock-supabase";

const mockGetProfile = vi.fn();
vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: () => mockGetProfile(),
}));

let mockClient: MockSupabaseClient;
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockClient),
}));

import { GET as listNotifications } from "@/app/api/notifications/route";
import { GET as unreadCount } from "@/app/api/notifications/unread-count/route";
import { PATCH as markRead } from "@/app/api/notifications/[notificationId]/route";

const PROFILE = { id: "user-1", role: "sdr", tenant_id: "tenant-1" };

const ROW = {
  id: "an-1",
  tenant_id: "tenant-1",
  type: "nova_oportunidade",
  payload: { opportunityId: "opp-1", leadName: "João" },
  read_at: null,
  created_at: "2026-07-16T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
});

describe("GET /api/notifications (lista)", () => {
  it("401 sem sessão", async () => {
    mockGetProfile.mockResolvedValue(null);
    const res = await listNotifications();
    expect(res.status).toBe(401);
  });

  it("lista as notificações do tenant (envelope data/meta)", async () => {
    mockGetProfile.mockResolvedValue(PROFILE);
    mockTableResponse(mockClient, "app_notifications", { data: [ROW] });

    const res = await listNotifications();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("an-1");
    expect(json.data[0].readAt).toBeNull();
    expect(json.meta).toBeDefined();
  });
});

describe("GET /api/notifications/unread-count", () => {
  it("401 sem sessão", async () => {
    mockGetProfile.mockResolvedValue(null);
    const res = await unreadCount();
    expect(res.status).toBe(401);
  });

  it("retorna envelope { data: { count } }", async () => {
    mockGetProfile.mockResolvedValue(PROFILE);
    const res = await unreadCount();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("count");
  });
});

describe("PATCH /api/notifications/[id] (mark-read)", () => {
  const params = (id: string) => ({ params: Promise.resolve({ notificationId: id }) });

  it("401 sem sessão", async () => {
    mockGetProfile.mockResolvedValue(null);
    const res = await markRead(new Request("http://localhost"), params("an-1"));
    expect(res.status).toBe(401);
  });

  it("marca lida e retorna a notificação", async () => {
    mockGetProfile.mockResolvedValue(PROFILE);
    const chain = mockTableResponse(mockClient, "app_notifications", {
      data: { ...ROW, read_at: "2026-07-16T01:00:00Z" },
    });

    const res = await markRead(new Request("http://localhost"), params("an-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.readAt).toBe("2026-07-16T01:00:00Z");
    // Só read_at é escrito (o trigger de imutabilidade recusa outras colunas).
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ read_at: expect.any(String) })
    );
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("404 quando a notificação não existe / não é do tenant", async () => {
    mockGetProfile.mockResolvedValue(PROFILE);
    mockTableResponse(mockClient, "app_notifications", { data: null });

    const res = await markRead(new Request("http://localhost"), params("nope"));
    expect(res.status).toBe(404);
  });
});
