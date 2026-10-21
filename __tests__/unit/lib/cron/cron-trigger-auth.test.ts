/**
 * Tests: Cron Trigger Auth — Story 23.1 (follow-up)
 *
 * Cobre a checagem que reply-sweep e monitor-leads fazem antes de repassar a
 * chamada: só o pg_cron (service role) passa; anon key e chamadas sem token não.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  extractBearerToken,
  isServiceRoleCaller,
  readJwtRole,
  safeEqual,
} from "@/lib/cron/cron-trigger-auth";

function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.assinatura`;
}

const SERVICE_JWT = fakeJwt({ iss: "supabase", role: "service_role", ref: "x" });
const ANON_JWT = fakeJwt({ iss: "supabase", role: "anon", ref: "x" });

describe("extractBearerToken", () => {
  it("extrai o token do header Bearer", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer   abc ")).toBe("abc");
  });

  it("retorna null sem header, sem esquema ou com token vazio", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("abc")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
  });
});

describe("safeEqual", () => {
  it("compara strings iguais e diferentes", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("readJwtRole", () => {
  it("lê o role do payload", () => {
    expect(readJwtRole(SERVICE_JWT)).toBe("service_role");
    expect(readJwtRole(ANON_JWT)).toBe("anon");
  });

  it("retorna null para token que não é JWT ou payload inválido", () => {
    expect(readJwtRole("sb_secret_abc")).toBeNull();
    expect(readJwtRole("a.b")).toBeNull();
    expect(readJwtRole("a.!!!.c")).toBeNull();
    expect(readJwtRole(fakeJwt({ sub: "123" }))).toBeNull();
  });
});

describe("isServiceRoleCaller", () => {
  it("aceita o token igual à SUPABASE_SERVICE_ROLE_KEY", () => {
    expect(isServiceRoleCaller("Bearer sb_secret_xyz", "sb_secret_xyz")).toBe(true);
    expect(isServiceRoleCaller(`Bearer ${SERVICE_JWT}`, SERVICE_JWT)).toBe(true);
  });

  it("aceita JWT de service_role mesmo se a env tiver outro valor ou estiver ausente", () => {
    expect(isServiceRoleCaller(`Bearer ${SERVICE_JWT}`, "outra-chave")).toBe(true);
    expect(isServiceRoleCaller(`Bearer ${SERVICE_JWT}`, undefined)).toBe(true);
  });

  it("recusa a anon key", () => {
    expect(isServiceRoleCaller(`Bearer ${ANON_JWT}`, SERVICE_JWT)).toBe(false);
  });

  it("recusa chamada sem token ou com token qualquer", () => {
    expect(isServiceRoleCaller(null, SERVICE_JWT)).toBe(false);
    expect(isServiceRoleCaller("Bearer ", SERVICE_JWT)).toBe(false);
    expect(isServiceRoleCaller("Bearer qualquer", SERVICE_JWT)).toBe(false);
    expect(isServiceRoleCaller("Bearer qualquer", undefined)).toBe(false);
    expect(isServiceRoleCaller("Bearer qualquer", "  ")).toBe(false);
  });
});

describe("SYNC-NOTICE: cópias inline nas Edge Functions", () => {
  const root = path.resolve(__dirname, "../../../..");
  const lib = fs.readFileSync(path.join(root, "src/lib/cron/cron-trigger-auth.ts"), "utf8");
  const fnBody = (src: string, name: string) => {
    const start = src.indexOf(`function ${name}(`);
    const end = src.indexOf("\n}\n", start);
    return start < 0 || end < 0 ? null : src.slice(start, end + 2);
  };

  for (const fn of ["reply-sweep", "monitor-leads"]) {
    it(`${fn} usa a mesma lógica e checa antes de repassar`, () => {
      const src = fs.readFileSync(
        path.join(root, `supabase/functions/${fn}/index.ts`),
        "utf8"
      );
      for (const name of ["extractBearerToken", "safeEqual", "readJwtRole", "isServiceRoleCaller"]) {
        expect(fnBody(src, name)).not.toBeNull();
        expect(fnBody(src, name)).toBe(fnBody(lib, name));
      }
      const guardAt = src.indexOf("!isServiceRoleCaller(");
      expect(guardAt).toBeGreaterThan(src.indexOf("Deno.serve("));
      expect(guardAt).toBeLessThan(src.indexOf("await fetch("));
      expect(src).toContain("status: 401");
    });
  }
});
