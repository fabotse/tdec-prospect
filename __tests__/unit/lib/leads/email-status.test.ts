/**
 * Story 24.12 — normalização do email_status do Apollo e gravação best-effort.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UNVERIFIED_EMAIL_HINT,
  UNVERIFIED_EMAIL_LABEL,
  isUnverifiedEmailStatus,
  normalizeApolloEmailStatus,
  toLeadEmailStatus,
} from "@/lib/leads/email-status";
import { persistLeadEmailStatus } from "@/lib/leads/persist-email-status";
import { transformLeadRow, type LeadRow } from "@/types/lead";
import { createChainBuilder } from "../../../helpers/mock-supabase";

describe("normalizeApolloEmailStatus", () => {
  it.each([
    ["verified", "verified"],
    ["invalid", "invalid"],
    ["unverified", "unknown"],
    ["guessed", "unknown"],
    ["likely to engage", "unknown"],
    ["extrapolated", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
    [42, "unknown"],
    [" Verified ", "verified"],
  ])("e-mail presente + %s -> %s", (raw, expected) => {
    expect(normalizeApolloEmailStatus("joao@acme.com", raw)).toBe(expected);
  });

  it.each([null, undefined, "", "   "])("sem e-mail (%s) -> null, mesmo com status verified", (email) => {
    expect(normalizeApolloEmailStatus(email, "verified")).toBeNull();
  });
});

describe("toLeadEmailStatus / isUnverifiedEmailStatus", () => {
  it("aceita so os 3 valores", () => {
    expect(toLeadEmailStatus("verified")).toBe("verified");
    expect(toLeadEmailStatus("invalid")).toBe("invalid");
    expect(toLeadEmailStatus("unknown")).toBe("unknown");
    expect(toLeadEmailStatus("unverified")).toBeNull();
    expect(toLeadEmailStatus(undefined)).toBeNull();
    expect(toLeadEmailStatus(null)).toBeNull();
  });

  it("aviso so para invalid/unknown; NULL nao avisa", () => {
    expect(isUnverifiedEmailStatus("invalid")).toBe(true);
    expect(isUnverifiedEmailStatus("unknown")).toBe(true);
    expect(isUnverifiedEmailStatus("verified")).toBe(false);
    expect(isUnverifiedEmailStatus(null)).toBe(false);
    expect(isUnverifiedEmailStatus(undefined)).toBe(false);
    expect(isUnverifiedEmailStatus("bogus")).toBe(false);
  });

  it("textos do aviso", () => {
    expect(UNVERIFIED_EMAIL_LABEL).toBe("E-mail não verificado");
    expect(UNVERIFIED_EMAIL_HINT).toBe("O Apollo não confirmou este e-mail. O envio não é bloqueado.");
  });
});

describe("transformLeadRow (Story 24.12)", () => {
  const baseRow = { id: "l1", tenant_id: "t1" } as unknown as LeadRow;

  it("coluna ausente (antes da 00072) -> emailStatus null", () => {
    expect(transformLeadRow(baseRow).emailStatus).toBeNull();
  });

  it("valor gravado e repassado; valor desconhecido vira null", () => {
    expect(transformLeadRow({ ...baseRow, email_status: "invalid" }).emailStatus).toBe("invalid");
    expect(transformLeadRow({ ...baseRow, email_status: "xyz" }).emailStatus).toBeNull();
  });
});

describe("persistLeadEmailStatus (best-effort)", () => {
  afterEach(() => vi.restoreAllMocks());

  function client(chain: ReturnType<typeof createChainBuilder>) {
    return { from: vi.fn(() => chain) } as unknown as SupabaseClient & { from: ReturnType<typeof vi.fn> };
  }

  it("grava num UPDATE separado filtrando tenant e id", async () => {
    const chain = createChainBuilder();
    const supabase = client(chain);

    await expect(persistLeadEmailStatus(supabase, "t1", "l1", "unknown")).resolves.toBe(true);

    expect(supabase.from).toHaveBeenCalledWith("leads");
    expect(chain.update).toHaveBeenCalledWith({ email_status: "unknown" });
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "t1");
    expect(chain.eq).toHaveBeenCalledWith("id", "l1");
  });

  it("status null nao consulta o banco", async () => {
    const chain = createChainBuilder();
    const supabase = client(chain);
    await expect(persistLeadEmailStatus(supabase, "t1", "l1", null)).resolves.toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("erro do banco (coluna inexistente) -> console.warn, nao lanca", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chain = createChainBuilder({ data: null, error: { code: "42703" } });
    await expect(persistLeadEmailStatus(client(chain), "t1", "l1", "verified")).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("excecao -> console.warn, nao lanca", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = {
      from: () => {
        throw new Error("boom");
      },
    } as unknown as SupabaseClient;
    await expect(persistLeadEmailStatus(supabase, "t1", "l1", "verified")).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
