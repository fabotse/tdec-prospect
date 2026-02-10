/**
 * Unit Tests for ThresholdConfig component
 * Story 10.6: Janela de Oportunidade — Engine + Config
 *
 * AC: #4 — Inputs para "Minimo de aberturas" e "Periodo em dias", preview de leads qualificados
 * AC: #5 — Salvar config com toast, preview atualiza
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThresholdConfig } from "@/components/tracking/ThresholdConfig";
import { createMockLeadTracking, createMockOpportunityConfig } from "../../../helpers/mock-data";
import type { LeadTracking, OpportunityConfig } from "@/types/tracking";

// Mock evaluateOpportunityWindow to avoid Date dependency in component tests
vi.mock("@/lib/services/opportunity-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/opportunity-engine")>();
  return {
    ...actual,
    evaluateOpportunityWindow: vi.fn((leads, config) => {
      // Deterministic: filter by openCount >= minOpens and lastOpenAt not null
      return leads.filter((lead: { openCount: number; lastOpenAt: string | null }) => {
        if (lead.openCount < config.minOpens) return false;
        if (!lead.lastOpenAt) return false;
        // Treat "2026-01-01" as old (outside any reasonable period)
        if (lead.lastOpenAt.startsWith("2026-01-01")) return false;
        return true;
      });
    }),
  };
});

describe("ThresholdConfig (AC: #4, #5)", () => {
  const defaultConfig = createMockOpportunityConfig();
  const defaultLeads: LeadTracking[] = [
    createMockLeadTracking({
      leadEmail: "qualificado@test.com",
      openCount: 5,
      lastOpenAt: "2026-02-09T10:00:00.000Z",
    }),
    createMockLeadTracking({
      leadEmail: "nao-qualificado@test.com",
      openCount: 1,
      lastOpenAt: "2026-02-09T10:00:00.000Z",
    }),
    createMockLeadTracking({
      leadEmail: "antigo@test.com",
      openCount: 10,
      lastOpenAt: "2026-01-01T10:00:00.000Z",
    }),
  ];
  const onSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza inputs com valores da config", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const minOpensInput = screen.getByTestId("min-opens-input") as HTMLInputElement;
    const periodDaysInput = screen.getByTestId("period-days-input") as HTMLInputElement;

    expect(minOpensInput.value).toBe("3");
    expect(periodDaysInput.value).toBe("7");
  });

  it("renderiza inputs com defaults quando config e null", () => {
    render(
      <ThresholdConfig
        config={null}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const minOpensInput = screen.getByTestId("min-opens-input") as HTMLInputElement;
    const periodDaysInput = screen.getByTestId("period-days-input") as HTMLInputElement;

    expect(minOpensInput.value).toBe("3");
    expect(periodDaysInput.value).toBe("7");
  });

  it("exibe preview de leads qualificados", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    // With minOpens=3: only "qualificado@test.com" qualifies (openCount=5 >= 3, recent lastOpenAt)
    expect(screen.getByTestId("preview-count")).toHaveTextContent(
      "1 de 3 leads se qualificam"
    );
  });

  it("atualiza preview ao mudar input de minOpens", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const minOpensInput = screen.getByTestId("min-opens-input");
    fireEvent.change(minOpensInput, { target: { value: "1" } });

    // With minOpens=1: "qualificado@test.com" (5>=1) and "nao-qualificado@test.com" (1>=1) qualify
    expect(screen.getByTestId("preview-count")).toHaveTextContent(
      "2 de 3 leads se qualificam"
    );
  });

  it("chama onSave com valores corretos", async () => {
    const user = userEvent.setup();

    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const minOpensInput = screen.getByTestId("min-opens-input");
    fireEvent.change(minOpensInput, { target: { value: "5" } });

    const saveButton = screen.getByTestId("save-config-button");
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith({ minOpens: 5, periodDays: 7 });
  });

  it("desabilita botao durante saving", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={true}
      />
    );

    const saveButton = screen.getByTestId("save-config-button");
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveTextContent("Salvando...");
  });

  it("desabilita botao quando valores nao mudaram", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const saveButton = screen.getByTestId("save-config-button");
    expect(saveButton).toBeDisabled();
  });

  it("habilita botao quando valores mudaram", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const periodDaysInput = screen.getByTestId("period-days-input");
    fireEvent.change(periodDaysInput, { target: { value: "14" } });

    const saveButton = screen.getByTestId("save-config-button");
    expect(saveButton).not.toBeDisabled();
  });

  it("nao permite valores menores que 1 — clamps para 1", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const minOpensInput = screen.getByTestId("min-opens-input") as HTMLInputElement;
    fireEvent.change(minOpensInput, { target: { value: "0" } });

    // Should clamp to 1
    expect(minOpensInput.value).toBe("1");
  });

  it("renderiza titulo e descricao do card", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    expect(screen.getByText("Janela de Oportunidade")).toBeInTheDocument();
    expect(
      screen.getByText("Configure o threshold para identificar leads de alto interesse")
    ).toBeInTheDocument();
  });

  it("renderiza labels em portugues", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    expect(screen.getByText("Minimo de aberturas")).toBeInTheDocument();
    expect(screen.getByText("Periodo em dias")).toBeInTheDocument();
  });

  it("reinicializa valores quando config muda", () => {
    const { rerender } = render(
      <ThresholdConfig
        config={defaultConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const updatedConfig: OpportunityConfig = {
      ...defaultConfig,
      minOpens: 10,
      periodDays: 30,
    };

    rerender(
      <ThresholdConfig
        config={updatedConfig}
        leads={defaultLeads}
        onSave={onSave}
        isSaving={false}
      />
    );

    const minOpensInput = screen.getByTestId("min-opens-input") as HTMLInputElement;
    const periodDaysInput = screen.getByTestId("period-days-input") as HTMLInputElement;

    expect(minOpensInput.value).toBe("10");
    expect(periodDaysInput.value).toBe("30");
  });

  it("exibe 0 leads quando lista e vazia", () => {
    render(
      <ThresholdConfig
        config={defaultConfig}
        leads={[]}
        onSave={onSave}
        isSaving={false}
      />
    );

    expect(screen.getByTestId("preview-count")).toHaveTextContent(
      "0 de 0 leads se qualificam"
    );
  });
});
