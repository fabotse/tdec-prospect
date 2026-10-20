/**
 * Tests for src/instrumentation.ts (onRequestError)
 * Story 23.3: exceção não capturada em rota/página/action vai para error_logs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockLogServerError = vi.fn();
vi.mock("@/lib/services/error-logger", () => ({
  logServerError: (...args: unknown[]) => mockLogServerError(...args),
}));

import { onRequestError } from "@/instrumentation";

type Context = Parameters<typeof onRequestError>[2];
type RequestInfo = Parameters<typeof onRequestError>[1];

const request = { path: "/api/x?token=1", method: "GET", headers: {} } as RequestInfo;

function ctx(overrides: Partial<Context> = {}): Context {
  return {
    routerKind: "App Router",
    routePath: "/api/leads/[id]",
    routeType: "route",
    renderSource: undefined,
    revalidateReason: undefined,
    ...overrides,
  } as Context;
}

describe("onRequestError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    mockLogServerError.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rota (routeType route) grava source api com o routePath", async () => {
    const err = new Error("boom");
    await onRequestError(err, request, ctx());
    expect(mockLogServerError).toHaveBeenCalledWith({
      source: "api",
      route: "/api/leads/[id]",
      error: err,
    });
  });

  it.each(["render", "action", "proxy"] as const)(
    "routeType %s grava source server",
    async (routeType) => {
      await onRequestError(new Error("x"), request, ctx({ routeType, routePath: "/leads" }));
      expect(mockLogServerError).toHaveBeenCalledWith(
        expect.objectContaining({ source: "server", route: "/leads" })
      );
    }
  );

  it("fora do runtime nodejs não grava", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("x"), request, ctx());
    expect(mockLogServerError).not.toHaveBeenCalled();
  });

  it("nunca lança se o logger falhar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLogServerError.mockRejectedValue(new Error("logger down"));
    await expect(onRequestError(new Error("x"), request, ctx())).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
