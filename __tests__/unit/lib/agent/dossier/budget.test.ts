/**
 * CostBudget — teto de custo por execucao (Story 24.19)
 */

import { describe, it, expect } from "vitest";
import { CostBudget } from "@/lib/agent/dossier/budget";

describe("CostBudget", () => {
  it("reserva o teto da chamada e acerta pelo custo real", () => {
    const budget = new CostBudget(0.05);
    expect(budget.tryReserve(0.01)).toBe(true);
    budget.settle(0.01, 0.007);
    expect(budget.spentUsd).toBeCloseTo(0.007);
    expect(budget.exhausted).toBe(false);
  });

  it("recusa quando gasto + reservas + teto passaria do maximo (e marca exhausted)", () => {
    const budget = new CostBudget(0.025);
    expect(budget.tryReserve(0.01)).toBe(true);
    expect(budget.tryReserve(0.01)).toBe(true);
    // 0,02 reservado + 0,01 > 0,025: concorrencia nao fura o teto
    expect(budget.tryReserve(0.01)).toBe(false);
    expect(budget.exhausted).toBe(true);
    budget.settle(0.01, 0);
    budget.settle(0.01, 0);
    expect(budget.tryReserve(0.01)).toBe(true);
    expect(budget.spentUsd).toBe(0);
  });

  it("aceita exatamente o teto (tolerancia de ponto flutuante)", () => {
    const budget = new CostBudget(0.5);
    for (let i = 0; i < 50; i++) {
      expect(budget.tryReserve(0.01)).toBe(true);
      budget.settle(0.01, 0.01);
    }
    expect(budget.tryReserve(0.01)).toBe(false);
    expect(budget.spentUsd).toBeCloseTo(0.5);
  });

  it("canReserve nao reserva nem marca exhausted", () => {
    const budget = new CostBudget(0.02);
    expect(budget.tryReserve(0.01)).toBe(true);
    expect(budget.canReserve(0.01)).toBe(true);
    expect(budget.canReserve(0.02)).toBe(false);
    expect(budget.exhausted).toBe(false);
    budget.settle(0.01, 0);
    expect(budget.canReserve(0.02)).toBe(true);
  });

  it("custo negativo ou invalido conta 0", () => {
    const budget = new CostBudget(1);
    budget.tryReserve(0.01);
    budget.settle(0.01, Number.NaN);
    budget.tryReserve(0.01);
    budget.settle(0.01, -5);
    expect(budget.spentUsd).toBe(0);
  });
});
