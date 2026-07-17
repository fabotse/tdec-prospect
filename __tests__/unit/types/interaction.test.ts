/**
 * Unit tests for Interaction types
 * Story 21.9: Controle Manual de Sequência por Lead
 *
 * O union TS espelha o enum interaction_type do Postgres (00013 + 00062).
 * Estes testes cimentam os valores novos da 21.9 — se alguém remover do union,
 * o insert da rota sequence-actions quebraria em silêncio no tipo.
 */

import { describe, it, expect } from "vitest";
import {
  interactionTypeValues,
  createInteractionSchema,
} from "@/types/interaction";

describe("interactionTypeValues (Story 21.9)", () => {
  it("includes sequence_stopped (parar sequência — 00062)", () => {
    expect(interactionTypeValues).toContain("sequence_stopped");
  });

  it("includes lead_removed (remover do Instantly — 00062)", () => {
    expect(interactionTypeValues).toContain("lead_removed");
  });

  it("keeps the pre-existing enum values (regressão 00013)", () => {
    for (const value of [
      "note",
      "status_change",
      "import",
      "campaign_sent",
      "campaign_reply",
      "whatsapp_sent",
    ]) {
      expect(interactionTypeValues).toContain(value);
    }
  });
});

describe("createInteractionSchema (Story 21.9)", () => {
  it("accepts the new interaction types", () => {
    for (const type of ["sequence_stopped", "lead_removed"]) {
      const result = createInteractionSchema.safeParse({
        content: "Sequência interrompida (motivo: respondeu por outro canal)",
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("still rejects unknown types", () => {
    const result = createInteractionSchema.safeParse({
      content: "x",
      type: "unknown_type",
    });
    expect(result.success).toBe(false);
  });
});
