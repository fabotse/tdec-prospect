/**
 * Tests for Clipboard Formatting
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #3 - Clipboard com texto estruturado legível
 */

import { describe, it, expect } from "vitest";
import { formatCampaignForClipboard } from "@/lib/export/format-clipboard";
import type { BuilderBlock } from "@/stores/use-builder-store";

// ==============================================
// FIXTURES
// ==============================================

function createEmailBlock(
  position: number,
  subject: string,
  body: string
): BuilderBlock {
  return {
    id: `email-${position}`,
    type: "email",
    position,
    data: { subject, body },
  };
}

function createDelayBlock(position: number, delayValue: number): BuilderBlock {
  return {
    id: `delay-${position}`,
    type: "delay",
    position,
    data: { delayValue, delayUnit: "days" },
  };
}

// ==============================================
// TESTS
// ==============================================

describe("formatCampaignForClipboard", () => {
  it("formata campanha com emails e delays em texto estruturado", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock(0, "Olá {{first_name}}", "{{ice_breaker}} Sobre a {{company_name}}..."),
      createDelayBlock(1, 3),
      createEmailBlock(2, "Follow-up", "{{first_name}}, voltando..."),
    ];

    const result = formatCampaignForClipboard({
      blocks,
      campaignName: "Minha Campanha",
    });

    expect(result).toContain("=== Campanha: Minha Campanha ===");
    expect(result).toContain("--- Email 1 (inicial) ---");
    expect(result).toContain("Assunto: Olá {{first_name}}");
    expect(result).toContain("{{ice_breaker}} Sobre a {{company_name}}...");
    expect(result).toContain("--- Aguardar 3 dia(s) ---");
    expect(result).toContain("--- Email 2 (follow-up) ---");
    expect(result).toContain("Assunto: Follow-up");
  });

  it("mantém variáveis {{...}} sem resolver", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock(0, "Olá {{first_name}}", "{{ice_breaker}} corpo"),
    ];

    const result = formatCampaignForClipboard({
      blocks,
      campaignName: "Test",
    });

    expect(result).toContain("{{first_name}}");
    expect(result).toContain("{{ice_breaker}}");
  });

  it("formata campanha com um único email sem delay", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock(0, "Assunto único", "Corpo do email"),
    ];

    const result = formatCampaignForClipboard({
      blocks,
      campaignName: "Single Email",
    });

    expect(result).toContain("--- Email 1 (inicial) ---");
    expect(result).toContain("Assunto: Assunto único");
    expect(result).toContain("Corpo do email");
    expect(result).not.toContain("Aguardar");
  });

  it("formata campanha com múltiplos emails e delays", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock(0, "Email 1", "Corpo 1"),
      createDelayBlock(1, 2),
      createEmailBlock(2, "Email 2", "Corpo 2"),
      createDelayBlock(3, 5),
      createEmailBlock(4, "Email 3", "Corpo 3"),
    ];

    const result = formatCampaignForClipboard({
      blocks,
      campaignName: "Multi",
    });

    expect(result).toContain("--- Email 1 (inicial) ---");
    expect(result).toContain("--- Aguardar 2 dia(s) ---");
    expect(result).toContain("--- Email 2 (follow-up) ---");
    expect(result).toContain("--- Aguardar 5 dia(s) ---");
    expect(result).toContain("--- Email 3 (follow-up) ---");
  });

  it("marca primeiro email como 'inicial' e demais como 'follow-up'", () => {
    const blocks: BuilderBlock[] = [
      createEmailBlock(0, "Primeiro", "Corpo 1"),
      createDelayBlock(1, 1),
      createEmailBlock(2, "Segundo", "Corpo 2"),
      createDelayBlock(3, 1),
      createEmailBlock(4, "Terceiro", "Corpo 3"),
    ];

    const result = formatCampaignForClipboard({
      blocks,
      campaignName: "Test",
    });

    expect(result).toContain("Email 1 (inicial)");
    expect(result).toContain("Email 2 (follow-up)");
    expect(result).toContain("Email 3 (follow-up)");
  });

  it("retorna texto vazio quando não há email blocks válidos", () => {
    const blocks: BuilderBlock[] = [createDelayBlock(0, 3)];

    const result = formatCampaignForClipboard({
      blocks,
      campaignName: "Empty",
    });

    expect(result).toContain("=== Campanha: Empty ===");
    // No emails to show
    expect(result).not.toContain("--- Email");
  });
});
