/**
 * Unit Tests for Mock Supabase Helper
 * Cleanup-3: Mock Supabase Resiliente
 *
 * AC #1: createMockSupabaseClient + createChainBuilder
 * AC #2: mockTableResponse helper
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createChainBuilder,
  createMockSupabaseClient,
  mockTableResponse,
} from "../../helpers/mock-supabase";

describe("createChainBuilder (AC #1)", () => {
  it("should return object with all Supabase chain methods", () => {
    const chain = createChainBuilder();

    const expectedMethods = [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "eq",
      "neq",
      "in",
      "is",
      "gt",
      "gte",
      "lt",
      "lte",
      "or",
      "not",
      "filter",
      "match",
      "order",
      "range",
      "limit",
      "single",
      "maybeSingle",
      "count",
      "csv",
      "ilike",
      "like",
      "contains",
      "containedBy",
      "textSearch",
    ];

    for (const method of expectedMethods) {
      expect(chain[method]).toBeDefined();
      expect(vi.isMockFunction(chain[method])).toBe(true);
    }
  });

  it("should support chaining — each method returns the chain", () => {
    const chain = createChainBuilder();

    const result = chain.select().eq().order().limit();

    expect(result).toBe(chain);
  });

  it("should resolve to { data: null, error: null } when awaited", async () => {
    const chain = createChainBuilder();

    const result = await chain.select().eq();

    expect(result).toEqual({ data: null, error: null });
  });

  it("should resolve to custom default response when provided", async () => {
    const customResponse = { data: [{ id: "1" }], error: null };
    const chain = createChainBuilder(customResponse);

    const result = await chain.select().eq().order();

    expect(result).toEqual(customResponse);
  });

  it("should allow overriding individual methods with mockResolvedValueOnce", async () => {
    const chain = createChainBuilder();
    const customData = { data: [{ id: "campaign-1" }], error: null };

    chain.order.mockResolvedValueOnce(customData);

    const result = await chain.select().order();

    expect(result).toEqual(customData);
  });

  it("should support deep chains (select → eq → single)", async () => {
    const chain = createChainBuilder();

    // Deep chain should work without errors
    const result = await chain.select().eq().single();

    expect(result).toEqual({ data: null, error: null });
  });

  it("should support insert chain (insert → select → single)", async () => {
    const chain = createChainBuilder();

    const result = await chain.insert().select().single();

    expect(result).toEqual({ data: null, error: null });
  });

  it("should track method calls via vi.fn()", () => {
    const chain = createChainBuilder();

    chain.select("*");
    chain.eq("tenant_id", "t-1");
    chain.order("created_at", { ascending: false });

    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "t-1");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});

describe("createMockSupabaseClient (AC #1)", () => {
  it("should return object with auth.getUser and from", () => {
    const client = createMockSupabaseClient();

    expect(client.auth).toBeDefined();
    expect(client.auth.getUser).toBeDefined();
    expect(vi.isMockFunction(client.auth.getUser)).toBe(true);
    expect(client.from).toBeDefined();
    expect(vi.isMockFunction(client.from)).toBe(true);
  });

  it("should return functional chain for any unknown table", async () => {
    const client = createMockSupabaseClient();

    // Accessing unknown table should NOT throw
    const result = await client.from("xyz_unknown_table").select().eq().single();

    expect(result).toEqual({ data: null, error: null });
  });

  it("should return different chain builders for each from() call", () => {
    const client = createMockSupabaseClient();

    const chain1 = client.from("table_a");
    const chain2 = client.from("table_b");

    // Each call returns a new chain
    expect(chain1).not.toBe(chain2);
  });

  it("should support auth.getUser default (user: null)", async () => {
    const client = createMockSupabaseClient();

    const result = await client.auth.getUser();

    expect(result).toEqual({ data: { user: null }, error: null });
  });

  it("should support auth.getUser override", async () => {
    const client = createMockSupabaseClient();
    client.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-123" } },
    });

    const result = await client.auth.getUser();

    expect(result).toEqual({ data: { user: { id: "user-123" } } });
  });

  it("should support tableOverrides for pre-configured tables", async () => {
    const campaignsData = [{ id: "c-1", name: "Q1" }];
    const campaignsChain = createChainBuilder({ data: campaignsData, error: null });

    const client = createMockSupabaseClient({
      tableOverrides: {
        campaigns: campaignsChain,
      },
    });

    // Configured table returns custom chain
    const result = await client.from("campaigns").select().order();
    expect(result).toEqual({ data: campaignsData, error: null });

    // Unconfigured table still works
    const other = await client.from("other_table").select();
    expect(other).toEqual({ data: null, error: null });
  });

  it("should support multiple table overrides independently", async () => {
    const campaignsChain = createChainBuilder({
      data: [{ id: "c-1" }],
      error: null,
    });
    const profilesChain = createChainBuilder({
      data: { tenant_id: "t-1" },
      error: null,
    });

    const client = createMockSupabaseClient({
      tableOverrides: {
        campaigns: campaignsChain,
        profiles: profilesChain,
      },
    });

    const campaignsResult = await client.from("campaigns").select();
    expect(campaignsResult).toEqual({ data: [{ id: "c-1" }], error: null });

    const profilesResult = await client.from("profiles").select().eq().single();
    expect(profilesResult).toEqual({ data: { tenant_id: "t-1" }, error: null });

    // Unconfigured table still works
    const unknownResult = await client.from("xyz").select();
    expect(unknownResult).toEqual({ data: null, error: null });
  });
});

describe("mockTableResponse (AC #2)", () => {
  let client: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    client = createMockSupabaseClient();
  });

  it("should configure specific table to return given data", async () => {
    const campaignsData = [{ id: "c-1", name: "Test" }];

    mockTableResponse(client, "campaigns", { data: campaignsData });

    const result = await client.from("campaigns").select().order();

    expect(result).toEqual({ data: campaignsData, error: null });
  });

  it("should not affect other tables", async () => {
    mockTableResponse(client, "campaigns", { data: [{ id: "c-1" }] });

    const result = await client.from("profiles").select().eq().single();

    expect(result).toEqual({ data: null, error: null });
  });

  it("should support error responses", async () => {
    mockTableResponse(client, "campaigns", {
      error: { message: "Database error" },
    });

    const result = await client.from("campaigns").select().order();

    expect(result).toEqual({ data: null, error: { message: "Database error" } });
  });

  it("should support multiple tables configured independently", async () => {
    mockTableResponse(client, "campaigns", {
      data: [{ id: "c-1" }],
    });
    mockTableResponse(client, "profiles", {
      data: { tenant_id: "t-1" },
    });

    const campaigns = await client.from("campaigns").select();
    const profiles = await client.from("profiles").select().eq().single();
    const unknown = await client.from("unknown_table").select();

    expect(campaigns).toEqual({ data: [{ id: "c-1" }], error: null });
    expect(profiles).toEqual({ data: { tenant_id: "t-1" }, error: null });
    expect(unknown).toEqual({ data: null, error: null });
  });

  it("should return chain builder for further configuration", () => {
    const chain = mockTableResponse(client, "campaigns", {
      data: [{ id: "c-1" }],
    });

    expect(chain).toBeDefined();
    expect(vi.isMockFunction(chain.select)).toBe(true);
    expect(vi.isMockFunction(chain.eq)).toBe(true);
  });

  it("should support insert chain", async () => {
    const newCampaign = { id: "c-new", name: "New" };

    mockTableResponse(client, "campaigns", { data: newCampaign });

    const result = await client.from("campaigns").insert({ name: "New" }).select().single();

    expect(result).toEqual({ data: newCampaign, error: null });
  });

  it("should support update chain", async () => {
    mockTableResponse(client, "campaigns", { data: null, error: null });

    const result = await client.from("campaigns").update({ name: "Updated" }).eq();

    expect(result).toEqual({ data: null, error: null });
  });

  it("should support delete chain", async () => {
    mockTableResponse(client, "campaigns", { data: null, error: null });

    const result = await client.from("campaigns").delete().eq();

    expect(result).toEqual({ data: null, error: null });
  });

  it("should support sub-chains (select → eq → single)", async () => {
    const campaignData = { id: "c-1", name: "Test" };
    const chain = mockTableResponse(client, "campaigns", {
      data: campaignData,
    });

    // The entire sub-chain resolves to the configured response
    const result = await client.from("campaigns").select("*").eq("id", "c-1").single();

    expect(result).toEqual({ data: campaignData, error: null });
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.eq).toHaveBeenCalledWith("id", "c-1");
  });
});

describe("Resilience: unknown tables (AC #1)", () => {
  it("should NOT throw for any arbitrary table name", async () => {
    const client = createMockSupabaseClient();

    // This is the core resilience test — new tables should never break existing tests
    const tables = [
      "icebreaker_examples",
      "new_table_2026",
      "xyz_test",
      "some_future_migration",
    ];

    for (const table of tables) {
      // Should not throw
      const result = await client.from(table).select().eq().single();
      expect(result).toEqual({ data: null, error: null });
    }
  });

  it("should support complex chains on unknown tables", async () => {
    const client = createMockSupabaseClient();

    // Complex chain that would fail with {} return
    const result = await client
      .from("unknown_table")
      .select("*")
      .eq("tenant_id", "t-1")
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false })
      .range(0, 9)
      .limit(10);

    expect(result).toEqual({ data: null, error: null });
  });
});
