/**
 * Story 24.24 — leitura da KB e do produto para a reescrita/revisao
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCopyReviewContext } from "@/lib/agent/conversation/kb-review-context";
import { createChainBuilder, type ChainBuilder } from "../../../../helpers/mock-supabase";

const TENANT = "tenant-1";
const BRIEFING = { jobTitles: ["CISO"], productSlug: "prod-1" } as never;

const PROOF = {
  id: "p1",
  tenant_id: TENANT,
  proof_type: "case",
  text: "Banco Y reduziu 30% dos alertas",
  sector: null,
  is_authorized: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const PRODUCT_ROW = {
  id: "prod-1",
  tenant_id: TENANT,
  name: "SOC Gerenciado",
  description: "Monitoramento 24x7",
  features: null,
  differentials: null,
  target_audience: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function clientWith(tables: Record<string, { data: unknown; error: unknown }>) {
  const chains: Record<string, ChainBuilder[]> = {};
  const from = (table: string) => {
    const chain = createChainBuilder(tables[table] ?? { data: null, error: null });
    (chains[table] ??= []).push(chain);
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient, chains };
}

describe("loadCopyReviewContext (24.24)", () => {
  it("prova da KB chega a authorizedProofs e o produto entra no contexto", async () => {
    const { client } = clientWith({
      knowledge_base: { data: null, error: null },
      knowledge_base_proofs: { data: [PROOF], error: null },
      products: { data: PRODUCT_ROW, error: null },
    });

    const context = await loadCopyReviewContext(client, TENANT, BRIEFING);

    expect(context?.authorizedProofs).toContain("Banco Y reduziu 30% dos alertas");
    expect(context?.productName).toBe("SOC Gerenciado");
    expect(context?.audience).toBe("Cargos: CISO");
  });

  it("le o produto e a KB com tenant_id explicito", async () => {
    const { client, chains } = clientWith({ products: { data: PRODUCT_ROW, error: null } });
    await loadCopyReviewContext(client, TENANT, BRIEFING);

    const product = chains.products[0];
    expect(product.eq).toHaveBeenCalledWith("id", "prod-1");
    expect(product.eq).toHaveBeenCalledWith("tenant_id", TENANT);
    for (const kb of chains.knowledge_base) {
      expect(kb.eq).toHaveBeenCalledWith("tenant_id", TENANT);
    }
  });

  it("erro de leitura da KB ou do produto: null (a rota cai no fallback)", async () => {
    const dbError = { data: null, error: { message: "db down" } };
    const kbDown = clientWith({ knowledge_base: dbError, products: { data: PRODUCT_ROW, error: null } });
    expect(await loadCopyReviewContext(kbDown.client, TENANT, BRIEFING)).toBeNull();
    const productDown = clientWith({ knowledge_base: { data: null, error: null }, products: dbError });
    expect(await loadCopyReviewContext(productDown.client, TENANT, BRIEFING)).toBeNull();
  });

  it("so as provas falham: null (sem as provas a reescrita cortaria alegacoes legitimas)", async () => {
    const { client, chains } = clientWith({
      knowledge_base: { data: null, error: null },
      knowledge_base_proofs: { data: null, error: { message: "db down" } },
      products: { data: PRODUCT_ROW, error: null },
    });
    expect(await loadCopyReviewContext(client, TENANT, BRIEFING)).toBeNull();
    expect(chains.knowledge_base_proofs[0].eq).toHaveBeenCalledWith("tenant_id", TENANT);
  });
});
