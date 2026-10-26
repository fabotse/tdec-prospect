/**
 * Story 24.18 — modo contas parecidas: helpers puros (reference-accounts.ts).
 */

import { describe, it, expect } from "vitest";
import {
  REFERENCE_MAX,
  REFERENCE_MIN,
  activeReferenceProfile,
  buildLookalikeExclusion,
  deriveReferenceProfile,
  formatReferenceAccounts,
  formatReferenceProfile,
  hasEnoughReferences,
  isLookalikeMode,
  profileMatchesReferences,
  similarityReason,
  sizeBucketFor,
} from "@/lib/agent/reference-accounts";
import type { ParsedBriefing, ReferenceCompany, TargetAccount } from "@/types/agent";

const REFS: TargetAccount[] = [
  { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
  { name: "Banco Y", domain: "bancoy.com.br", confidence: "high" },
  { name: null, domain: "segz.com.br", confidence: "high" },
];

function company(overrides: Partial<ReferenceCompany> & { domain: string }): ReferenceCompany {
  return {
    name: null,
    industry: null,
    employees: null,
    sizeBucket: null,
    city: null,
    state: null,
    country: null,
    technologies: [],
    ...overrides,
  };
}

const BANKS: ReferenceCompany[] = [
  company({
    name: "Banco X",
    domain: "bancox.com.br",
    industry: "Banking",
    employees: 300,
    sizeBucket: "201-500",
    state: "Sao Paulo",
    country: "Brazil",
    technologies: ["aws", "salesforce"],
  }),
  company({
    name: "Banco Y",
    domain: "bancoy.com.br",
    industry: "banking",
    employees: 800,
    sizeBucket: "501-1000",
    state: "Sao Paulo",
    country: "Brazil",
    technologies: ["aws"],
  }),
  company({
    domain: "segz.com.br",
    industry: "banking",
    employees: 450,
    sizeBucket: "201-500",
    state: "Sao Paulo",
    country: "Brazil",
    technologies: ["salesforce", "aws"],
  }),
];

function baseBriefing(overrides: Partial<ParsedBriefing> = {}): ParsedBriefing {
  return {
    technology: null,
    jobTitles: ["CISO"],
    location: null,
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: ["search_companies"],
    ...overrides,
  };
}

describe("isLookalikeMode / hasEnoughReferences / profileMatchesReferences", () => {
  it("array (mesmo vazio) liga o modo; ausente/null nao", () => {
    expect(isLookalikeMode(baseBriefing({ referenceAccounts: [] }))).toBe(true);
    expect(isLookalikeMode(baseBriefing({ referenceAccounts: REFS }))).toBe(true);
    expect(isLookalikeMode(baseBriefing())).toBe(false);
    expect(isLookalikeMode(baseBriefing({ referenceAccounts: null }))).toBe(false);
  });

  it("fora do fluxo importado e do modo lista", () => {
    expect(
      isLookalikeMode(
        baseBriefing({ referenceAccounts: REFS, skipSteps: ["search_companies", "search_leads"] })
      )
    ).toBe(false);
    expect(
      isLookalikeMode(
        baseBriefing({
          referenceAccounts: REFS,
          targetAccounts: [{ name: "A", domain: "a.com", confidence: "high" }],
        })
      )
    ).toBe(false);
  });

  it("3 a 5 referencias resolvidas", () => {
    expect(REFERENCE_MIN).toBe(3);
    expect(REFERENCE_MAX).toBe(5);
    expect(hasEnoughReferences(baseBriefing({ referenceAccounts: REFS }))).toBe(true);
    expect(hasEnoughReferences(baseBriefing({ referenceAccounts: REFS.slice(0, 2) }))).toBe(false);
    expect(
      hasEnoughReferences(
        baseBriefing({
          referenceAccounts: [...REFS, { name: "Sem Site", domain: null, confidence: "low" }],
        })
      )
    ).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({
      name: null,
      domain: `c${i}.com`,
      confidence: "high" as const,
    }));
    expect(hasEnoughReferences(baseBriefing({ referenceAccounts: six }))).toBe(false);
  });

  it("perfil casa por igualdade de conjunto dos dominios", () => {
    const { profile } = deriveReferenceProfile(BANKS, 3);
    expect(profileMatchesReferences(profile, REFS)).toBe(true);
    expect(profileMatchesReferences(profile, [...REFS].reverse())).toBe(true);
    expect(profileMatchesReferences(profile, REFS.slice(0, 2))).toBe(false);
    expect(profileMatchesReferences(null, REFS)).toBe(false);
  });

  it("activeReferenceProfile exige modo, referencias e perfil confiante das mesmas", () => {
    const { profile } = deriveReferenceProfile(BANKS, 3);
    expect(
      activeReferenceProfile(baseBriefing({ referenceAccounts: REFS, referenceProfile: profile }))
    ).toEqual(profile);
    expect(activeReferenceProfile(baseBriefing({ referenceAccounts: REFS }))).toBeNull();
    const other = { ...profile, sourceDomains: ["a.com", "b.com", "c.com"] };
    expect(
      activeReferenceProfile(baseBriefing({ referenceAccounts: REFS, referenceProfile: other }))
    ).toBeNull();
  });
});

describe("sizeBucketFor", () => {
  it("mapeia para as faixas da Apollo", () => {
    expect(sizeBucketFor(5)).toBe("1-10");
    expect(sizeBucketFor(11)).toBe("11-50");
    expect(sizeBucketFor(200)).toBe("51-200");
    expect(sizeBucketFor(201)).toBe("201-500");
    expect(sizeBucketFor(1000)).toBe("501-1000");
    expect(sizeBucketFor(4000)).toBe("1001-5000");
    expect(sizeBucketFor(10000)).toBe("5001-10000");
    expect(sizeBucketFor(20000)).toBe("10001+");
    expect(sizeBucketFor(null)).toBeNull();
  });
});

describe("deriveReferenceProfile", () => {
  it("perfil confiante: 3 bancos, 201-500 e 501-1000, todos SP", () => {
    const { profile, confident, reason } = deriveReferenceProfile(BANKS, 3);
    expect(confident).toBe(true);
    expect(reason).toBeNull();
    expect(profile.industries).toEqual(["banking"]);
    expect(profile.companySizes).toEqual(["201-500", "501-1000"]);
    expect(profile.locations).toEqual(["Sao Paulo, Brazil"]);
    expect(profile.technologies).toEqual(["aws", "salesforce"]);
    expect(profile.sourceDomains).toEqual(["bancox.com.br", "bancoy.com.br", "segz.com.br"]);
    expect(profile.creditsUsed).toBe(3);
  });

  it("faixas contiguas entre a menor e a maior", () => {
    const companies = [
      company({ domain: "a.com", industry: "x", employees: 30 }),
      company({ domain: "b.com", industry: "x", employees: 3000 }),
      company({ domain: "c.com", industry: "y", employees: null }),
    ];
    expect(deriveReferenceProfile(companies, 3).profile.companySizes).toEqual([
      "11-50",
      "51-200",
      "201-500",
      "501-1000",
      "1001-5000",
    ]);
  });

  it("estados diferentes: pais da maioria; sem maioria: vazio", () => {
    const mixed = [
      company({ domain: "a.com", state: "Sao Paulo", country: "Brazil" }),
      company({ domain: "b.com", state: "Rio de Janeiro", country: "Brazil" }),
      company({ domain: "c.com", state: "Texas", country: "United States" }),
    ];
    expect(deriveReferenceProfile(mixed, 3).profile.locations).toEqual(["Brazil"]);
    const split = [
      company({ domain: "a.com", state: "Sao Paulo", country: "Brazil" }),
      company({ domain: "b.com", state: "Texas", country: "United States" }),
    ];
    expect(deriveReferenceProfile(split, 2).profile.locations).toEqual([]);
  });

  it("sem dados: 2 de 3 sem organizacao na Apollo -> nao confiante e explica quais", () => {
    const companies = [
      BANKS[0],
      company({ name: "Banco Y", domain: "bancoy.com.br" }),
      company({ domain: "segz.com.br" }),
    ];
    const { confident, reason } = deriveReferenceProfile(companies, 1);
    expect(confident).toBe(false);
    expect(reason).toContain("Banco Y");
    expect(reason).toContain("segz.com.br");
  });

  it("setores distintos -> nao confiante: setores nao se repetem", () => {
    const companies = [
      company({ domain: "a.com", industry: "banking", employees: 300 }),
      company({ domain: "b.com", industry: "retail", employees: 300 }),
      company({ domain: "c.com", industry: "insurance", employees: 300 }),
    ];
    const { confident, reason, profile } = deriveReferenceProfile(companies, 3);
    expect(confident).toBe(false);
    expect(profile.industries).toEqual([]);
    expect(reason).toContain("setores dos seus clientes nao se repetem");
  });

  it("no maximo 3 setores e 5 tecnologias", () => {
    const companies = ["a", "b"].map((d) =>
      company({
        domain: `${d}.com`,
        industry: null,
        employees: 100,
        technologies: ["t1", "t2", "t3", "t4", "t5", "t6"],
      })
    );
    expect(deriveReferenceProfile(companies, 2).profile.technologies).toHaveLength(5);
  });
});

describe("similarityReason", () => {
  const { profile } = deriveReferenceProfile(BANKS, 3);
  const briefing = baseBriefing({ referenceAccounts: REFS, referenceProfile: profile });

  it("setor e porte da primeira referencia que casa", () => {
    expect(similarityReason(briefing)).toBe("mesmo setor e porte de Banco X");
  });

  it("chip de porte editado: so setor", () => {
    expect(similarityReason({ ...briefing, companySize: "51-200" })).toBe(
      "mesmo setor de Banco X"
    );
  });

  it("setor do usuario fora do perfil: so porte", () => {
    expect(similarityReason({ ...briefing, industry: "varejo" })).toBe("mesmo porte de Banco X");
  });

  it("nada casa: frase generica", () => {
    expect(similarityReason({ ...briefing, industry: "varejo", companySize: "1-10" })).toBe(
      "perfil parecido com seus clientes"
    );
  });

  it("sem nome, usa o dominio", () => {
    const noNames = {
      ...profile,
      companies: profile.companies.map((c) => ({ ...c, name: null })),
    };
    expect(similarityReason({ ...briefing, referenceProfile: noNames })).toBe(
      "mesmo setor e porte de bancox.com.br"
    );
  });
});

describe("buildLookalikeExclusion", () => {
  it("casa nome da referencia ou nome compacto = rotulo do dominio", () => {
    const isExcluded = buildLookalikeExclusion(REFS, ["empresaw.com"]);
    expect(isExcluded("Banco X")).toBe(true);
    expect(isExcluded("banco  x")).toBe(true);
    expect(isExcluded("Seg Z")).toBe(true); // segz.com.br
    expect(isExcluded("Empresa W")).toBe(true); // suprimido
    expect(isExcluded("Banco Qualquer")).toBe(false);
    expect(isExcluded(null)).toBe(false);
  });
});

describe("formatReferenceAccounts / formatReferenceProfile", () => {
  it("formata para o card e o resumo", () => {
    expect(formatReferenceAccounts(REFS)).toBe(
      "Banco X (bancox.com.br), Banco Y (bancoy.com.br), segz.com.br"
    );
    const { profile } = deriveReferenceProfile(BANKS, 3);
    expect(formatReferenceProfile(profile)).toBe(
      "setor banking, porte 201–1000 funcionarios, regiao Sao Paulo, Brazil; tecnologias em comum: aws, salesforce"
    );
  });
});

describe("Story 24.18 — revisao", () => {
  it("activeReferenceProfile devolve os campos re-derivados (setores forjados nao passam)", () => {
    const { profile } = deriveReferenceProfile(BANKS, 3);
    const forged = {
      ...profile,
      industries: ["government"],
      companySizes: ["10001+"],
      locations: ["Anywhere"],
    };
    const active = activeReferenceProfile(
      baseBriefing({ referenceAccounts: REFS, referenceProfile: forged })
    );
    expect(active?.industries).toEqual(["banking"]);
    expect(active?.companySizes).toEqual(["201-500", "501-1000"]);
    expect(active?.locations).toEqual(["Sao Paulo, Brazil"]);
  });

  it("similarityReason usa os setores re-derivados (setores forjados nao entram na frase)", () => {
    const { profile } = deriveReferenceProfile(BANKS, 3);
    const forged = { ...profile, industries: ["government"], companySizes: ["10001+"] };
    expect(
      similarityReason(baseBriefing({ referenceAccounts: REFS, referenceProfile: forged }))
    ).toBe("mesmo setor e porte de Banco X");
  });

  it("exclusao: rotulo com hifen e sufixos societarios", () => {
    const isExcluded = buildLookalikeExclusion(
      [
        { name: "Banco X", domain: "bancox.com.br", confidence: "high" },
        { name: null, domain: "grupo-x.com.br", confidence: "high" },
      ],
      []
    );
    expect(isExcluded("Grupo X")).toBe(true);
    expect(isExcluded("Banco X S.A.")).toBe(true);
    expect(isExcluded("Banco X Ltda")).toBe(true);
    expect(isExcluded("BancoX S/A")).toBe(true);
    expect(isExcluded("Banco Xyz")).toBe(false);
  });

  it("uma so empresa com local nao define a regiao", () => {
    const companies = [
      company({ domain: "a.com", industry: "x", employees: 100, state: "Sao Paulo", country: "Brazil" }),
      company({ domain: "b.com", industry: "x", employees: 100 }),
      company({ domain: "c.com", industry: "x", employees: 100 }),
    ];
    expect(deriveReferenceProfile(companies, 3).profile.locations).toEqual([]);
  });

  it("perfil sem regiao: a parte da regiao some do texto", () => {
    const { profile } = deriveReferenceProfile(BANKS, 3);
    expect(formatReferenceProfile({ ...profile, locations: [] })).toBe(
      "setor banking, porte 201–1000 funcionarios; tecnologias em comum: aws, salesforce"
    );
  });

  it("dominio low (deduzido) aparece com a marca confirme", () => {
    expect(
      formatReferenceAccounts([
        { name: "Banco X", domain: "bancox.com.br", confidence: "low" },
        { name: null, domain: "segz.com.br", confidence: "low" },
      ])
    ).toBe("Banco X (bancox.com.br — confirme), segz.com.br — confirme");
  });
});
