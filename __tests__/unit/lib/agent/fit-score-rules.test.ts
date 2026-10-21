/**
 * Fit Score — regras deterministicas (Story 24.16)
 */

import { describe, it, expect } from "vitest";
import {
  FIT_REASON_MAX_LENGTH,
  countFitGrades,
  mergeRequestedTitles,
  normalizeText,
  scoreLeadByRules,
  sortByFitGrade,
} from "@/lib/agent/fit-score-rules";

describe("normalizeText", () => {
  it("tira acento e caixa", () => {
    expect(normalizeText("  Sócio-Diretor de TI ")).toBe("socio-diretor de ti");
  });
});

describe("scoreLeadByRules", () => {
  it("Regra A: cargo pedido (CISO) em 'CISO LATAM' com e-mail -> A citando o cargo", () => {
    const result = scoreLeadByRules({ title: "CISO LATAM", hasEmail: true }, ["CISO"]);
    expect(result).toEqual({
      fitScore: "A",
      fitReason: "Cargo bate com o pedido (CISO) e tem e-mail disponivel",
    });
  });

  it("compara sem acento e sem caixa", () => {
    expect(
      scoreLeadByRules({ title: "diretor de seguranca da informacao", hasEmail: true }, [
        "Diretor de Segurança",
      ]).fitScore
    ).toBe("A");
  });

  it("forte sem e-mail -> B", () => {
    const result = scoreLeadByRules({ title: "CISO", hasEmail: false }, ["CISO"]);
    expect(result.fitScore).toBe("B");
    expect(result.fitReason).toContain("CISO");
  });

  it("Regra B: 'Diretor Financeiro' com pedido 'CISO' -> B por senioridade", () => {
    expect(scoreLeadByRules({ title: "Diretor Financeiro", hasEmail: true }, ["CISO"])).toEqual({
      fitScore: "B",
      fitReason: "Cargo senior (Diretor), fora da lista pedida",
    });
  });

  it("formas em portugues: 'Diretora de TI' com pedido 'CISO' -> B", () => {
    expect(scoreLeadByRules({ title: "Diretora de TI", hasEmail: true }, ["CISO"]).fitScore).toBe("B");
    for (const title of ["Sócia", "Presidenta", "Superintendente Comercial", "Partner", "Líder de Vendas"]) {
      expect(scoreLeadByRules({ title, hasEmail: true }, ["CISO"]).fitScore).toBe("B");
    }
  });

  it("Regra C: 'Analista' com pedido 'CISO' -> C", () => {
    expect(scoreLeadByRules({ title: "Analista", hasEmail: true }, ["CISO"])).toEqual({
      fitScore: "C",
      fitReason: "Cargo fora do perfil pedido",
    });
  });

  it("senioridade casa por palavra inteira: 'Coordenador' nao e 'coo'", () => {
    expect(scoreLeadByRules({ title: "Coordenador de TI", hasEmail: true }, ["CISO"]).fitScore).toBe("C");
  });

  it("cargo pedido casa em fronteira de palavra: 'CTO' nao casa com 'Director'", () => {
    const result = scoreLeadByRules({ title: "Director of Sales", hasEmail: true }, ["CTO"]);
    expect(result.fitScore).toBe("B"); // senioridade (director), nao cargo pedido
    expect(result.fitReason).toContain("fora da lista pedida");
  });

  it("nunca casa termo vazio", () => {
    expect(scoreLeadByRules({ title: "Analista", hasEmail: true }, ["", "   ", "-"]).fitScore).toBe("C");
  });

  it("titulo ausente -> C", () => {
    expect(scoreLeadByRules({ title: null, hasEmail: true }, ["CISO"]).fitScore).toBe("C");
  });

  it("justificativa nunca passa de 120 caracteres", () => {
    const longTitle = "Diretor de Seguranca da Informacao e Governanca Corporativa Global LATAM e Europa";
    const result = scoreLeadByRules({ title: longTitle, hasEmail: true }, [longTitle]);
    expect(result.fitScore).toBe("A");
    expect(result.fitReason.length).toBeLessThanOrEqual(FIT_REASON_MAX_LENGTH);
  });
});

describe("mergeRequestedTitles", () => {
  it("une briefing e ICP sem duplicar (sem acento/caixa)", () => {
    expect(mergeRequestedTitles(["CISO", "Diretor de TI"], ["ciso", "Gerente de Segurança"])).toEqual([
      "CISO",
      "Diretor de TI",
      "Gerente de Segurança",
    ]);
  });
});

describe("sortByFitGrade / countFitGrades", () => {
  it("ordena A -> B -> C -> sem nota, estavel, sem mutar a entrada", () => {
    const items = [
      { id: 1, fitScore: "C" as const },
      { id: 2 },
      { id: 3, fitScore: "A" as const },
      { id: 4, fitScore: "B" as const },
      { id: 5, fitScore: "A" as const },
      { id: 6, fitScore: null },
    ];
    expect(sortByFitGrade(items).map((i) => i.id)).toEqual([3, 5, 4, 1, 2, 6]);
    expect(items[0].id).toBe(1);
  });

  it("sem nenhuma nota: ordem original", () => {
    const items: Array<{ id: number; fitScore?: "A" | "B" | "C" | null }> = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ];
    expect(sortByFitGrade(items).map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("conta por nota", () => {
    expect(countFitGrades([{ fitScore: "A" }, { fitScore: "A" }, { fitScore: "C" }, {}])).toEqual({
      A: 2,
      B: 0,
      C: 1,
    });
  });
});
