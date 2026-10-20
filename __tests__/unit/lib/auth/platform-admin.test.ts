/**
 * Tests: isPlatformAdmin
 * Story 23.3: só o operador da plataforma vê Configurações → Erros (fail-closed)
 */

import { describe, it, expect, vi } from "vitest";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";

function client(result: { data: unknown; error: unknown } | Error) {
  return {
    rpc: vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    ),
  };
}

describe("isPlatformAdmin", () => {
  it("true só quando a RPC devolve true", async () => {
    const c = client({ data: true, error: null });
    expect(await isPlatformAdmin(c)).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("is_platform_admin");
  });

  it("false quando a RPC devolve false", async () => {
    expect(await isPlatformAdmin(client({ data: false, error: null }))).toBe(false);
  });

  it("false quando a RPC devolve erro (migration não aplicada)", async () => {
    expect(await isPlatformAdmin(client({ data: null, error: { message: "x" } }))).toBe(false);
  });

  it("false quando a RPC lança", async () => {
    expect(await isPlatformAdmin(client(new Error("rede")))).toBe(false);
  });
});
