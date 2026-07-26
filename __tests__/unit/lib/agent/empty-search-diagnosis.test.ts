/**
 * Unit Tests for empty-search-diagnosis
 * Story 22.14 - AC: #2, #3
 *
 * A regra que estes testes protegem: uma busca vazia é diagnosticada por REGRA FIXA sobre
 * os filtros que realmente foram enviados — nunca por LLM — e nenhum chip proposto pode
 * ser inócuo (Trap #4: no ramo por domínios, tamanho e indústria nem são enviados).
 *
 * Helper puro: sem mock, sem fetch (padrão briefing-adjustment.test.ts).
 */

import { describe, it, expect } from "vitest";
import {
  diagnoseEmptySearch,
  isCanonicalCompanySize,
  detectsSmallCompanyIntent,
  isNarrowLocation,
  CANONICAL_COMPANY_SIZE_BUCKETS,
} from "@/lib/agent/empty-search-diagnosis";
import { QUALITY_MIN_COMPANY_SIZES } from "@/lib/agent/search-defaults";
import type { ParsedBriefing } from "@/types/agent";

// ==============================================
// FIXTURES
// ==============================================

const BASE_BRIEFING: ParsedBriefing = {
  technology: null,
  jobTitles: ["Owner", "Director"],
  location: "Atibaia",
  companySize: null,
  industry: null,
  productSlug: null,
  mode: "guided",
  skipSteps: ["search_companies"],
};

function briefing(overrides: Partial<ParsedBriefing> = {}): ParsedBriefing {
  return { ...BASE_BRIEFING, ...overrides };
}

/** Filtros do ramo DIRETO, como `search-leads-step.ts` os monta. */
function directFilters(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    titles: ["Owner", "Director"],
    perPage: 25,
    page: 1,
    companySizes: [...QUALITY_MIN_COMPANY_SIZES],
    locations: ["Atibaia"],
    ...overrides,
  };
}

/** Filtros do ramo POR DOMÍNIOS (step de empresas já aprovado). */
function domainFilters(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    domains: ["acme.com", "globex.com"],
    titles: ["Owner", "Director"],
    locations: ["Atibaia"],
    perPage: 25,
    page: 1,
    ...overrides,
  };
}

const causeCodes = (result: ReturnType<typeof diagnoseEmptySearch>) =>
  result.probableCauses.map((cause) => cause.code);
const chipIds = (result: ReturnType<typeof diagnoseEmptySearch>) =>
  result.suggestedChips.map((chip) => chip.id);
const filterValue = (result: ReturnType<typeof diagnoseEmptySearch>, label: string) =>
  result.activeFilters.find((line) => line.label === label);

// ==============================================
// PREDICADOS
// ==============================================

describe("isCanonicalCompanySize", () => {
  it.each(CANONICAL_COMPANY_SIZE_BUCKETS)("aceita o bucket canônico %s", (bucket) => {
    expect(isCanonicalCompanySize(bucket)).toBe(true);
  });

  it("expõe exatamente os 8 buckets do app (QUALITY_MIN_COMPANY_SIZES + '1-10')", () => {
    expect(CANONICAL_COMPANY_SIZE_BUCKETS).toEqual(["1-10", ...QUALITY_MIN_COMPANY_SIZES]);
  });

  it.each([["<11"], ["menos de 11"], ["enterprise"], ["PME"], ["50+"], ["11 a 50"]])(
    "rejeita o formato livre %s",
    (value) => {
      expect(isCanonicalCompanySize(value)).toBe(false);
    }
  );

  it.each([[null], [undefined], [""], ["   "]])("rejeita ausência (%s)", (value) => {
    expect(isCanonicalCompanySize(value as string | null | undefined)).toBe(false);
  });

  /**
   * Code review 22.14: antes havia `.trim()` aqui e este teste afirmava que `"  11-50  "`
   * era canônico. Mas `resolveDirectSearchCompanySizes` manda o valor VERBATIM para
   * `organization_num_employees_ranges[]` — com os espaços a busca quebra de verdade, e o
   * card jurava que o formato estava válido. O diagnóstico tem que refletir o que foi
   * ENVIADO, não uma versão limpa que ninguém mandou.
   */
  it("rejeita bucket com espaços em volta — é o que a Apollo realmente recebe", () => {
    expect(isCanonicalCompanySize("  11-50  ")).toBe(false);
  });
});

describe("detectsSmallCompanyIntent", () => {
  it.each([
    ["<11", "teto exclusivo digitado no E2E"],
    ["menos de 11", "mesmo teto por extenso"],
    ["até 10", "teto inclusivo com acento"],
    ["ate 10 funcionarios", "teto inclusivo sem acento"],
    ["1-10", "faixa canônica pequena"],
    ["microempresa", "palavra inequívoca"],
    ["abaixo de 10", "outro marcador de teto"],
  ])("detecta intenção de empresa pequena em %s (%s)", (value) => {
    expect(detectsSmallCompanyIntent(value)).toBe(true);
  });

  it.each([
    ["enterprise"],
    ["grande empresa"],
    ["1000-5000"],
    ["51-200"],
    ["mais de 500"],
    ["PME"],
    ["startup"],
    [""],
    [null],
  ])("NÃO detecta intenção de empresa pequena em %s", (value) => {
    expect(detectsSmallCompanyIntent(value as string | null)).toBe(false);
  });

  /**
   * Code review 22.14 — a fronteira que o test set original evitava.
   *
   * `"mais de 500"` acima só passava porque 500 > 10; nenhum caso exercitava um PISO baixo
   * nem uma faixa que COMEÇA baixo. Com `Math.min` e sem lista de marcadores de piso, todos
   * estes devolviam `true` e o card oferecia "Corrigir tamanho para 1-10" — o inverso do
   * pedido, cobrado numa re-execução paga.
   */
  it.each([
    ["mais de 10", "piso explícito: o alvo é ACIMA de 10"],
    ["acima de 10", "mesmo piso, outra redação"],
    ["10+", "piso na notação curta"],
    [">10", "piso em símbolo"],
    ["a partir de 10 funcionarios", "piso por extenso"],
    ["no minimo 10", "piso explícito"],
    ["pelo menos 5 funcionarios", "piso abaixo do teto de 10"],
    ["10-100", "faixa que começa em 10 mas vai a 100"],
    ["5 a 50", "faixa que começa baixo e termina alta"],
    ["de 5 a 500", "faixa ampla"],
    ["entre 10 e 1000", "faixa ampla por extenso"],
    ["menos de 200", "teto, mas MUITO acima de 10"],
  ])("NÃO confunde %s com empresa pequena (%s)", (value) => {
    expect(detectsSmallCompanyIntent(value)).toBe(false);
  });
});

describe("isNarrowLocation", () => {
  it.each([["Atibaia"], ["Sao Paulo"], ["Campinas"]])("considera %s localidade estreita", (value) => {
    expect(isNarrowLocation(value)).toBe(true);
  });

  it.each([["Atibaia, SP"], ["Sao Paulo, Brazil"], ["Brasil"], ["LATAM"], ["EUA"], [""], [null]])(
    "NÃO considera %s localidade estreita",
    (value) => {
      expect(isNarrowLocation(value as string | null)).toBe(false);
    }
  );

  /**
   * Code review 22.14: sem geocoding (proibido pela spec) é impossível separar cidade de
   * estado ou de país não-listado — então a função NÃO promete isso, e a causa que ela gera
   * não pode afirmar "uma única cidade". O texto condicional é o que torna isto honesto.
   */
  it("não afirma que a localidade é uma cidade — só que é um recorte único", () => {
    const result = diagnoseEmptySearch(
      briefing({ location: "Minas Gerais", companySize: "11-50", industry: null }),
      directFilters({ locations: ["Minas Gerais"], companySizes: ["11-50"] })
    );

    const cause = result.probableCauses.find((c) => c.code === "narrow_location");
    expect(cause).toBeDefined();
    expect(cause?.text).not.toMatch(/única cidade/i);
    expect(cause?.text).toContain("Minas Gerais");
  });
});

// ==============================================
// RAMO DIRETO — FILTROS ATIVOS
// ==============================================

describe("diagnoseEmptySearch — filtros ativos (AC2a)", () => {
  it("lista cargos, localização, tamanho e indústria efetivos", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "51-200", industry: "fintech" }),
      directFilters()
    );

    expect(result.branch).toBe("direct");
    expect(result.activeFilters.map((line) => line.label)).toEqual([
      "Cargos",
      "Localização",
      "Tamanho",
      "Indústria",
    ]);
    expect(filterValue(result, "Cargos")?.value).toBe("Owner, Director");
    expect(filterValue(result, "Localização")?.value).toBe("Atibaia");
    expect(filterValue(result, "Tamanho")?.value).toBe("51-200");
    expect(filterValue(result, "Indústria")?.value).toBe("fintech");
  });

  it("mostra o tamanho EFETIVO do SSOT (piso 11+ da 22.6) quando o usuário não informou", () => {
    const result = diagnoseEmptySearch(briefing(), directFilters());

    const size = filterValue(result, "Tamanho");
    expect(size?.value).toContain("11+");
    expect(size?.note).toMatch(/at[ée] 10 pessoas ficam de fora/i);
  });

  it("marca o tamanho em formato não reconhecido com a lista de valores aceitos", () => {
    const result = diagnoseEmptySearch(briefing({ companySize: "<11" }), directFilters());

    const size = filterValue(result, "Tamanho");
    expect(size?.value).toBe("<11");
    expect(size?.note).toContain("11-50");
    expect(size?.note).toMatch(/n[ãa]o reconhecido/i);
  });

  it("explica que indústria é busca por texto (AC2c) — e não explica quando não há indústria", () => {
    const withIndustry = diagnoseEmptySearch(
      briefing({ industry: "clínicas de estética" }),
      directFilters()
    );
    expect(filterValue(withIndustry, "Indústria")?.note).toMatch(/TEXTO|texto/);

    const withoutIndustry = diagnoseEmptySearch(briefing(), directFilters());
    expect(filterValue(withoutIndustry, "Indústria")?.value).toBe("sem filtro");
    expect(filterValue(withoutIndustry, "Indústria")?.note).toBeUndefined();
  });

  it("prefere os filtros EFETIVOS enviados à Apollo quando divergem do briefing", () => {
    const result = diagnoseEmptySearch(
      briefing({ jobTitles: ["Dono"], location: "Atibaia" }),
      directFilters({ titles: ["Owner"], locations: ["Atibaia, SP"] })
    );

    expect(filterValue(result, "Cargos")?.value).toBe("Owner");
    expect(filterValue(result, "Localização")?.value).toBe("Atibaia, SP");
  });
});

// ==============================================
// RAMO DIRETO — CAUSAS ORDENADAS
// ==============================================

describe("diagnoseEmptySearch — causas prováveis ordenadas (AC2b)", () => {
  it("caso Atibaia: tamanho não-canônico vem ANTES de indústria e de cidade única", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "<11", industry: "clínicas de estética" }),
      directFilters()
    );

    expect(causeCodes(result)).toEqual([
      "company_size_non_canonical",
      "industry_textual",
      "narrow_location",
    ]);
    expect(result.probableCauses[0].text).toContain("<11");
  });

  it("indústria sozinha é apontada como causa principal", () => {
    const result = diagnoseEmptySearch(
      briefing({ location: "Sao Paulo, Brazil", industry: "fintech" }),
      directFilters({ locations: ["Sao Paulo, Brazil"] })
    );

    expect(causeCodes(result)).toEqual(["industry_textual", "quality_floor_applied"]);
  });

  it("tamanho canônico porém estreito entra como causa (sem falar em formato inválido)", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "1-10", location: "Sao Paulo, Brazil" }),
      directFilters({ locations: ["Sao Paulo, Brazil"] })
    );

    expect(causeCodes(result)).toEqual(["company_size_restrictive"]);
  });

  it("piso 11+ auto-aplicado é apontado (mas depois das causas explícitas)", () => {
    const result = diagnoseEmptySearch(briefing(), directFilters());

    expect(causeCodes(result)).toEqual(["narrow_location", "quality_floor_applied"]);
  });

  it("com todos os filtros válidos e amplos, sobra a causa dos cargos (fallback alcançável)", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "51-200", location: "Sao Paulo, Brazil" }),
      directFilters({ locations: ["Sao Paulo, Brazil"] })
    );

    expect(causeCodes(result)).toEqual(["job_titles"]);
    expect(result.probableCauses[0].text).toContain("Owner, Director");
  });

  it("nunca devolve lista de causas vazia", () => {
    const result = diagnoseEmptySearch(
      briefing({ jobTitles: [], companySize: "201-500", location: "Brasil" }),
      directFilters({ titles: [], locations: ["Brasil"] })
    );

    expect(result.probableCauses.length).toBeGreaterThan(0);
  });
});

// ==============================================
// RAMO DIRETO — CHIPS
// ==============================================

describe("diagnoseEmptySearch — chips de recuperação (AC3)", () => {
  it("caso Atibaia: remover indústria + CORRIGIR tamanho + ampliar localização", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "<11", industry: "clínicas de estética" }),
      directFilters()
    );

    expect(chipIds(result)).toEqual([
      "remove-industry",
      "fix-company-size",
      "broaden-location",
    ]);
    expect(result.suggestedChips[0].delta).toEqual({ industry: null });
    // A intenção era empresa pequena: REMOVER o filtro excluiria o alvo (piso 11+).
    expect(result.suggestedChips[1].delta).toEqual({ companySize: "1-10" });
  });

  it("tamanho sem intenção de empresa pequena vira chip de REMOVER, com aviso do piso 11+", () => {
    const result = diagnoseEmptySearch(briefing({ companySize: "enterprise" }), directFilters());

    const sizeChip = result.suggestedChips.find((chip) => chip.id === "remove-company-size");
    expect(sizeChip?.delta).toEqual({ companySize: null });
    expect(sizeChip?.warning).toContain("11+");
  });

  it("tamanho canônico também vira chip de REMOVER", () => {
    const result = diagnoseEmptySearch(briefing({ companySize: "11-50" }), directFilters());

    expect(chipIds(result)).toContain("remove-company-size");
    expect(chipIds(result)).not.toContain("fix-company-size");
  });

  it("sem tamanho informado, o chip oferece incluir as empresas de 1 a 10 (piso 11+ é a causa)", () => {
    const result = diagnoseEmptySearch(briefing(), directFilters());

    const sizeChip = result.suggestedChips.find((chip) => chip.id === "include-small-companies");
    expect(sizeChip?.delta).toEqual({ companySize: "1-10" });
    expect(sizeChip?.warning).toContain("11+");
  });

  it("sem indústria não existe chip de remover indústria", () => {
    const result = diagnoseEmptySearch(briefing(), directFilters());
    expect(chipIds(result)).not.toContain("remove-industry");
  });

  /**
   * Code review 22.14 — este teste ANTES congelava `{location: "SP"}` como comportamento
   * correto, protegendo o defeito contra regressão. O chip de localização NUNCA mais produz
   * delta: derivar geografia de string quebrava de duas formas ("Campinas, Atibaia e
   * Jundiaí" -> "Atibaia e Jundiaí" ESTREITAVA; "São Paulo, SP, Brasil" -> "SP, Brasil"),
   * e uma UF nua pode simplesmente não resolver na Apollo — cada erro custando uma
   * re-execução paga no card que existe para SAIR do zero.
   */
  it("localização NUNCA vira delta — nem quando parece 'Cidade, UF' (fail-safe)", () => {
    const result = diagnoseEmptySearch(
      briefing({ location: "Atibaia, SP" }),
      directFilters({ locations: ["Atibaia, SP"] })
    );

    const chip = result.suggestedChips.find((c) => c.id === "broaden-location");
    expect(chip?.kind).toBe("prefill");
    expect(chip?.delta).toBeUndefined();
    expect(chip?.prefillText).toContain("Atibaia, SP");
  });

  it.each([
    ["Campinas, Atibaia e Jundiaí", "vírgula que NÃO separa cidade de UF"],
    ["Sao Paulo, SP, Brasil", "três níveis de recorte"],
  ])("não deriva geografia de %s (%s)", (location) => {
    const result = diagnoseEmptySearch(
      briefing({ location }),
      directFilters({ locations: [location] })
    );

    for (const chip of result.suggestedChips) {
      expect(chip.delta?.location).toBeUndefined();
    }
  });

  /**
   * Smoke real 2026-07-26: o texto do prefill precisa ser uma INSTRUÇÃO que o parser
   * resolva em geografia concreta, nunca uma DESCRIÇÃO que ele possa ecoar como valor.
   * A redação "ampliar a busca para uma região maior que Atibaia" produziu
   * `location: "região maior que Atibaia"` no app real — string que a Apollo não resolve,
   * devolvendo outro 0. Delegar a geografia ao LLM só funciona se a frase pedir uma AÇÃO.
   */
  it("localidade estreita pré-preenche o input em vez de inventar geografia (fail-safe)", () => {
    const result = diagnoseEmptySearch(briefing(), directFilters());

    const chip = result.suggestedChips.find((c) => c.id === "broaden-location");
    expect(chip?.kind).toBe("prefill");
    expect(chip?.delta).toBeUndefined();
    expect(chip?.prefillText).toContain("Atibaia");
    // Instrução ("buscar no estado inteiro"), nao um sintagma que vire valor de filtro.
    expect(chip?.prefillText).toMatch(/^buscar no estado inteiro em vez de só /);
    expect(chip?.prefillText).not.toMatch(/região maior que/);
  });

  /**
   * Code review 22.14: `buildLocationChips` não consultava `BROAD_LOCATIONS`, então
   * "Brasil" gerava "buscar no estado inteiro em vez de só Brasil" — sugestão sem sentido
   * que ainda assim consumia o gate (o chip rejeita a etapa antes de preencher o input).
   */
  it.each([["Brasil"], ["LATAM"], ["Global"]])(
    "não oferece chip de localização quando a busca já é ampla (%s)",
    (location) => {
      const result = diagnoseEmptySearch(
        briefing({ location }),
        directFilters({ locations: [location] })
      );

      expect(chipIds(result).some((id) => id.startsWith("broaden-location"))).toBe(false);
    }
  );

  it("sem localização não existe chip de localização", () => {
    const result = diagnoseEmptySearch(
      briefing({ location: null }),
      directFilters({ locations: [] })
    );

    expect(chipIds(result).some((id) => id.startsWith("broaden-location"))).toBe(false);
  });

  it("todo chip de delta muda SÓ campos de filtro — nunca a forma do pipeline (AC4 da 22.13)", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "<11", industry: "fintech", location: "Atibaia, SP" }),
      directFilters({ locations: ["Atibaia, SP"] })
    );

    const allowed = new Set(["technology", "jobTitles", "location", "companySize", "industry"]);
    for (const chip of result.suggestedChips) {
      for (const key of Object.keys(chip.delta ?? {})) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});

// ==============================================
// RAMO POR DOMÍNIOS (Trap #4)
// ==============================================

describe("diagnoseEmptySearch — ramo por domínios (Trap #4)", () => {
  it("detecta o ramo e conta as empresas varridas", () => {
    const result = diagnoseEmptySearch(briefing(), domainFilters());

    expect(result.branch).toBe("domains");
    expect(result.companiesSearched).toBe(2);
  });

  it("NÃO oferece chips de indústria/tamanho — eles não são enviados nesta busca", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "<11", industry: "fintech" }),
      domainFilters()
    );

    expect(chipIds(result)).not.toContain("remove-industry");
    expect(chipIds(result)).not.toContain("fix-company-size");
    expect(chipIds(result)).not.toContain("remove-company-size");
  });

  it("diagnostica pelos cargos nas empresas da etapa anterior", () => {
    const result = diagnoseEmptySearch(briefing(), domainFilters());

    expect(causeCodes(result)).toEqual(["job_titles_in_companies"]);
    expect(result.probableCauses[0].text).toContain("2 empresas");
    expect(result.probableCauses[0].text).toContain("Owner, Director");
  });

  it("mantém o chip de localização (esse filtro É enviado no ramo por domínios)", () => {
    const result = diagnoseEmptySearch(
      briefing({ location: "Atibaia, SP" }),
      domainFilters({ locations: ["Atibaia, SP"] })
    );

    expect(chipIds(result)).toEqual(["broaden-location"]);
  });

  it("não lista Tamanho/Indústria como filtros ativos — explica que não se aplicam", () => {
    const result = diagnoseEmptySearch(
      briefing({ companySize: "11-50", industry: "fintech" }),
      domainFilters()
    );

    expect(result.activeFilters.map((line) => line.label)).toEqual([
      "Cargos",
      "Localização",
      "Empresas",
    ]);
    expect(filterValue(result, "Empresas")?.note).toMatch(/n[ãa]o entram nesta etapa/i);
  });
});

// ==============================================
// LEITURA DEFENSIVA (JSONB round-trip)
// ==============================================

describe("diagnoseEmptySearch — entrada malformada não derruba o diagnóstico", () => {
  it.each([[null], [undefined], [{}], [{ domains: "acme.com" }], [{ titles: [1, null, {}] }]])(
    "tolera searchFilters %s caindo no briefing",
    (filters) => {
      const result = diagnoseEmptySearch(
        briefing({ industry: "fintech" }),
        filters as Record<string, unknown> | null | undefined
      );

      expect(result.branch).toBe("direct");
      expect(result.probableCauses.length).toBeGreaterThan(0);
      expect(filterValue(result, "Cargos")?.value).toBe("Owner, Director");
    }
  );

  it("domínios com entradas inválidas contam só as strings reais", () => {
    const result = diagnoseEmptySearch(
      briefing(),
      { domains: ["acme.com", null, 42, "  ", "globex.com"] } as Record<string, unknown>
    );

    expect(result.branch).toBe("domains");
    expect(result.companiesSearched).toBe(2);
  });

  it("é pura: chamadas iguais devolvem resultados iguais", () => {
    const args = [briefing({ companySize: "<11", industry: "fintech" }), directFilters()] as const;

    expect(diagnoseEmptySearch(...args)).toEqual(diagnoseEmptySearch(...args));
  });
});
