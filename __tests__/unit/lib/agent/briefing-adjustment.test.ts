/**
 * Unit Tests for briefing-adjustment helpers
 * Story 22.13 - AC: #2, #4
 *
 * A regra que estes testes protegem: o ajuste muda FILTROS, nunca a FORMA do pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  mergeAdjustedBriefing,
  buildAdjustmentSummary,
  isAdjustmentConfirmation,
  listRemovedFilters,
} from "@/lib/agent/briefing-adjustment";
import type { ParsedBriefing } from "@/types/agent";
import {
  REFERENCE_ACCOUNTS,
  confidentReferenceProfile,
} from "../../../helpers/reference-fixtures";

const PERSISTED: ParsedBriefing = {
  technology: "Netskope",
  jobTitles: ["CTO"],
  location: "Sao Paulo",
  companySize: "51-200",
  industry: "fintech",
  productSlug: "prod-1",
  mode: "guided",
  skipSteps: ["search_companies"],
  premiumIcebreakers: true,
  importedLeads: [
    {
      name: "Joao",
      title: "CTO",
      companyName: "X",
      email: "joao@x.com",
      linkedinUrl: null,
      apolloId: null,
    },
  ],
  objective: "COLD_OUTREACH",
  urgency: "MEDIUM",
  campaignDescription: null,
  emailCount: 3,
};

// O /parse re-deriva o briefing INTEIRO da conversa — inclusive a forma, que aqui vem
// diferente (sem productSlug, skipSteps re-derivado, sem premiumIcebreakers/importedLeads).
const PARSED: ParsedBriefing = {
  technology: "Netskope",
  jobTitles: ["CTO", "CIO"],
  location: "Sao Paulo",
  companySize: null,
  industry: null,
  productSlug: null,
  mode: "autopilot",
  skipSteps: [],
  objective: "REENGAGEMENT",
  urgency: "HIGH",
  campaignDescription: "Black Friday",
  emailCount: 5,
};

describe("mergeAdjustedBriefing (Story 22.13 AC4)", () => {
  it("aplica os filtros do parse (inclusive quando viram null)", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);

    expect(merged.jobTitles).toEqual(["CTO", "CIO"]);
    expect(merged.companySize).toBeNull();
    expect(merged.industry).toBeNull();
    expect(merged.technology).toBe("Netskope");
    expect(merged.location).toBe("Sao Paulo");
  });

  it("aplica os metadados de campanha do parse", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);

    expect(merged.objective).toBe("REENGAGEMENT");
    expect(merged.urgency).toBe("HIGH");
    expect(merged.campaignDescription).toBe("Black Friday");
    expect(merged.emailCount).toBe(5);
  });

  // Code review 2026-07-24 (decisao Fabossi): ausencia PRESERVA os metadados de campanha.
  it("PRESERVA os metadados de campanha quando o parse nao os re-deriva (review P4)", () => {
    const parseSemCampanha: ParsedBriefing = {
      ...PARSED,
      objective: null,
      urgency: null,
      campaignDescription: null,
      emailCount: null,
    };

    const merged = mergeAdjustedBriefing(PERSISTED, parseSemCampanha);

    // Um "tira o filtro de tamanho" nao pode rebaixar a sequencia de reengajamento
    // configurada no briefing para os defaults do CreateCampaignStep.
    expect(merged.objective).toBe("COLD_OUTREACH");
    expect(merged.urgency).toBe("MEDIUM");
    expect(merged.emailCount).toBe(3);
    // ...e os filtros de busca continuam podendo ser REMOVIDOS pelo parse
    expect(merged.companySize).toBeNull();
    expect(merged.industry).toBeNull();
  });

  // Story 22.15: o segmento segue a MESMA politica dos metadados de campanha.
  it("aplica o segmentName do parse e PRESERVA o persistido quando o parse nao o re-deriva (22.15)", () => {
    const persistedComSegmento: ParsedBriefing = { ...PERSISTED, segmentName: "Teste Atibaia" };

    // parse traz um novo nome -> vence
    const trocado = mergeAdjustedBriefing(persistedComSegmento, {
      ...PARSED,
      segmentName: "Clientes SP",
    });
    expect(trocado.segmentName).toBe("Clientes SP");

    // parse nao re-deriva (ajuste de busca) -> preserva, nunca zera em silencio
    const preservado = mergeAdjustedBriefing(persistedComSegmento, PARSED);
    expect(preservado.segmentName).toBe("Teste Atibaia");

    // nenhum dos dois tem -> null
    expect(mergeAdjustedBriefing(PERSISTED, PARSED).segmentName).toBeNull();
  });

  it("NUNCA deixa o parse rebaixar icebreaker premium pago para standard", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);
    expect(merged.premiumIcebreakers).toBe(true);
  });

  it("preserva a FORMA da execucao: skipSteps, mode, productSlug e importedLeads", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);

    expect(merged.skipSteps).toEqual(["search_companies"]);
    expect(merged.mode).toBe("guided");
    expect(merged.productSlug).toBe("prod-1");
    expect(merged.importedLeads).toHaveLength(1);
  });

  it("e puro: nao muta nenhum dos dois briefings", () => {
    const persistedCopy = JSON.parse(JSON.stringify(PERSISTED));
    const parsedCopy = JSON.parse(JSON.stringify(PARSED));

    mergeAdjustedBriefing(PERSISTED, PARSED);

    expect(PERSISTED).toEqual(persistedCopy);
    expect(PARSED).toEqual(parsedCopy);
  });
});

describe("buildAdjustmentSummary (Story 22.13 AC2)", () => {
  it("resume os filtros, mostra o custo e pede confirmacao", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);
    const summary = buildAdjustmentSummary(PERSISTED, merged, "search_leads", 12.5);

    expect(summary).toContain("Busca de Leads");
    expect(summary).toContain("CTO, CIO");
    // custo em pt-BR
    expect(summary).toContain("12,50");
    expect(summary).toMatch(/confirma/i);
  });

  it("mostra 'sem filtro' nos campos removidos (o usuario ve o efeito do ajuste)", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);
    const summary = buildAdjustmentSummary(PERSISTED, merged, "search_leads", null);

    expect(summary).toContain("Tamanho: sem filtro");
    expect(summary).toContain("Industria: sem filtro");
  });

  // Code review 2026-07-24 (decisao Fabossi): apagamento explicito, nunca silencioso.
  it("AVISA quais filtros serao REMOVIDOS do que estava valendo (review P4)", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);
    const summary = buildAdjustmentSummary(PERSISTED, merged, "search_leads", null);

    expect(summary).toMatch(/vou REMOVER/);
    expect(summary).toContain("Tamanho");
    expect(summary).toContain("Industria");
  });

  it("nao inventa remocao quando nada foi removido (review P4)", () => {
    const semRemocao: ParsedBriefing = { ...PARSED, companySize: "51-200", industry: "fintech" };
    const merged = mergeAdjustedBriefing(PERSISTED, semRemocao);
    const summary = buildAdjustmentSummary(PERSISTED, merged, "search_leads", null);

    expect(summary).not.toMatch(/vou REMOVER/);
  });

  it("sem custo disponivel: omite o numero mas mantem a pergunta de confirmacao", () => {
    const summary = buildAdjustmentSummary(PERSISTED, PERSISTED, "search_leads", null);

    expect(summary).not.toMatch(/custa aproximadamente/);
    expect(summary).toMatch(/confirma/i);
  });

  it("nao promete o que a re-execucao nao faz (Trap #4: nao amplia o universo de empresas)", () => {
    const summary = buildAdjustmentSummary(PERSISTED, PERSISTED, "search_leads", 10);

    expect(summary).toMatch(/executar (a )?esta etapa de novo|esta etapa de novo/i);
    expect(summary).not.toMatch(/todo o mercado|em todas as empresas/i);
  });

  // Code review 2026-07-24: ajustar a campanha NAO re-filtra leads — o resumo nao pode
  // listar filtros de busca como se fossem re-aplicados.
  it("na campanha, exibe metadados de campanha e NAO filtros de busca (review P8)", () => {
    const campanha: ParsedBriefing = {
      ...PERSISTED,
      objective: "REENGAGEMENT",
      emailCount: 4,
    };
    const summary = buildAdjustmentSummary(campanha, campanha, "create_campaign", 3);

    expect(summary).toContain("Criacao de Campanha");
    expect(summary).toContain("Reengajamento");
    expect(summary).toContain("4");
    // nada de filtro de busca aqui
    expect(summary).not.toContain("Tamanho:");
    expect(summary).not.toContain("Industria:");
    expect(summary).not.toContain("Localizacao:");
    // e diz a verdade sobre os leads
    expect(summary).toMatch(/leads ja aprovados continuam os mesmos/i);
  });

  // Story 22.15: esta e a ultima tela antes de uma re-execucao PAGA — sem a linha do
  // segmento o usuario confirma um gasto sem saber para onde os leads vao.
  it("na campanha, exibe o SEGMENTO de destino dos leads (22.15)", () => {
    const comSegmento: ParsedBriefing = { ...PERSISTED, segmentName: "Teste Atibaia" };
    const summary = buildAdjustmentSummary(comSegmento, comSegmento, "create_campaign", 3);

    expect(summary).toContain("- Segmento: Teste Atibaia");
  });

  it("na campanha sem segmento pedido, diz que o segmento sera o nome da campanha (22.15)", () => {
    const summary = buildAdjustmentSummary(PERSISTED, PERSISTED, "create_campaign", 3);

    expect(summary).toContain("- Segmento: nome da campanha");
  });
});

describe("Story 24.13 - leadCount no ajuste", () => {
  it("mergeAdjustedBriefing: o leadCount do parse vence", () => {
    const merged = mergeAdjustedBriefing(
      { ...PERSISTED, leadCount: 10 },
      { ...PARSED, leadCount: 5 }
    );
    expect(merged.leadCount).toBe(5);
  });

  it("mergeAdjustedBriefing: ausencia no parse PRESERVA o leadCount anterior", () => {
    const merged = mergeAdjustedBriefing({ ...PERSISTED, leadCount: 10 }, PARSED);
    expect(merged.leadCount).toBe(10);
    const mergedNull = mergeAdjustedBriefing(
      { ...PERSISTED, leadCount: 10 },
      { ...PARSED, leadCount: null }
    );
    expect(mergedNull.leadCount).toBe(10);
  });

  it("resumo da busca mostra '- Leads: até N' so quando N existe", () => {
    const comN: ParsedBriefing = { ...PERSISTED, leadCount: 5 };
    expect(buildAdjustmentSummary(comN, comN, "search_leads", null)).toContain("- Leads: até 5");
    expect(buildAdjustmentSummary(PERSISTED, PERSISTED, "search_leads", null)).not.toContain(
      "- Leads:"
    );
  });
});

describe("listRemovedFilters (Story 22.13, review P4)", () => {
  it("lista so o que existia e sumiu", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, PARSED);
    expect(listRemovedFilters(PERSISTED, merged)).toEqual(["Tamanho", "Industria"]);
  });

  it("detecta a remocao de cargos", () => {
    const semCargos = mergeAdjustedBriefing(PERSISTED, { ...PARSED, jobTitles: [] });
    expect(listRemovedFilters(PERSISTED, semCargos)).toContain("Cargos");
  });

  it("vazio quando nada foi removido", () => {
    expect(listRemovedFilters(PERSISTED, PERSISTED)).toEqual([]);
  });
});

// ==============================================
// Code review 2026-07-24 (P1) — a decisao que gasta credito
// ==============================================

describe("isAdjustmentConfirmation (Story 22.13 AC3, review P1)", () => {
  it.each([
    "sim",
    "Sim!",
    "ok",
    "pode ir",
    "isso mesmo",
    "beleza, confirmo",
    "perfeito",
    "bora",
  ])("aceita confirmacao limpa: %s", (message) => {
    expect(isAdjustmentConfirmation(message)).toBe(true);
  });

  it.each([
    // o caso que motivou o patch: "as-SIM" casava por substring
    ["assim nao da", "substring 'sim' dentro de 'assim' + negacao"],
    ["pode tirar o filtro de industria?", "pergunta com keyword 'pode'"],
    ["isso nao esta certo", "keyword + negacao"],
    ["sim, mas troca o cargo pra CFO", "confirmacao com correcao embutida"],
    ["nao pode ainda", "negacao antes da keyword"],
    ["vamos mudar o tamanho", "keyword + verbo de ajuste"],
    ["pode remover o filtro de tamanho", "keyword + verbo de ajuste"],
    ["na verdade pode trocar o cargo?", "ressalva + pergunta"],
    ["", "mensagem vazia"],
    ["troca o cargo pra CFO", "ajuste puro, sem keyword"],
  ])("recusa %s (%s)", (message) => {
    expect(isAdjustmentConfirmation(message)).toBe(false);
  });

  it("e assimetrico de proposito: na duvida NAO confirma (fail-safe 22.11)", () => {
    // frase ambigua com keyword: o custo de errar para o lado "nao confirma" e uma
    // chamada de parse; para o outro lado, creditos gastos e a correcao perdida.
    expect(isAdjustmentConfirmation("pode ser, mas antes muda a localizacao")).toBe(false);
  });
});

// ==============================================
// Story 24.14 — defaults do ICP
// ==============================================

describe("Story 24.14 — icpDefaults no ajuste", () => {
  const ICP = { companySizes: ["201-500", "501-1000"], locations: ["SP"] };

  it("mergeAdjustedBriefing: o valor do parse vence", () => {
    const next = { companySizes: ["11-50"], locations: ["RJ"] };
    const merged = mergeAdjustedBriefing(
      { ...PERSISTED, icpDefaults: ICP },
      { ...PARSED, icpDefaults: next }
    );
    expect(merged.icpDefaults).toEqual(next);
  });

  it("mergeAdjustedBriefing: ausencia no parse preserva o snapshot", () => {
    const merged = mergeAdjustedBriefing({ ...PERSISTED, icpDefaults: ICP }, PARSED);
    expect(merged.icpDefaults).toEqual(ICP);
  });

  it("buildAdjustmentSummary: local e tamanho do ICP marcados na busca direta", () => {
    const merged: ParsedBriefing = {
      ...PERSISTED,
      technology: null,
      location: null,
      companySize: null,
      skipSteps: ["search_companies"],
      icpDefaults: ICP,
    };
    const summary = buildAdjustmentSummary(PERSISTED, merged, "search_leads", null);
    expect(summary).toContain("- Localizacao: SP (do seu ICP)");
    expect(summary).toContain("- Tamanho: 201–1000 (do seu ICP)");
  });

  it("buildAdjustmentSummary: o usuario vence o ICP", () => {
    const merged: ParsedBriefing = {
      ...PERSISTED,
      location: "RJ",
      companySize: "51-200",
      skipSteps: ["search_companies"],
      icpDefaults: ICP,
    };
    const summary = buildAdjustmentSummary(PERSISTED, merged, "search_leads", null);
    expect(summary).toContain("- Localizacao: RJ");
    expect(summary).toContain("- Tamanho: 51-200");
    expect(summary).not.toContain("do seu ICP");
  });

  it("buildAdjustmentSummary sem ICP fica identico ('sem filtro')", () => {
    const merged: ParsedBriefing = {
      ...PERSISTED,
      location: null,
      companySize: null,
      skipSteps: ["search_companies"],
    };
    const summary = buildAdjustmentSummary(PERSISTED, merged, "search_leads", null);
    expect(summary).toContain("- Localizacao: sem filtro");
    expect(summary).toContain("- Tamanho: sem filtro");
  });
});

// ==============================================
// Story 24.17 — modo lista de contas no ajuste
// ==============================================

describe("Story 24.17 — contas no ajuste", () => {
  const ACCOUNTS = [
    { name: "Banco X", domain: "bancox.com.br", confidence: "high" as const },
    { name: "Banco Z", domain: "bancoz.com.br", confidence: "low" as const },
  ];
  const LIST_PERSISTED: ParsedBriefing = {
    technology: null,
    jobTitles: ["CISO"],
    location: null,
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: ["search_companies"],
    icpDefaults: { companySizes: ["201-500"], locations: ["SP"] },
    targetAccounts: ACCOUNTS,
    jobTitlesFromIcp: true,
  };

  it("execucao no modo lista: contas do parse substituem as persistidas", () => {
    const parsed: ParsedBriefing = {
      ...LIST_PERSISTED,
      targetAccounts: [{ name: null, domain: "outra.com", confidence: "high" }],
      suppressedAccounts: null,
    };
    const merged = mergeAdjustedBriefing(LIST_PERSISTED, parsed);
    expect(merged.targetAccounts).toEqual([{ name: null, domain: "outra.com", confidence: "high" }]);
  });

  it("lista vazia no parse preserva a persistida", () => {
    const parsed: ParsedBriefing = { ...LIST_PERSISTED, targetAccounts: undefined };
    delete parsed.targetAccounts;
    const merged = mergeAdjustedBriefing(LIST_PERSISTED, parsed);
    expect(merged.targetAccounts).toEqual(ACCOUNTS);
  });

  it("execucao fora do modo lista ignora contas do parse (e a tecnologia zerada por elas)", () => {
    const persisted: ParsedBriefing = { ...PERSISTED, technology: "Netskope", skipSteps: [] };
    const parsed: ParsedBriefing = { ...PARSED, technology: null, targetAccounts: ACCOUNTS };
    const merged = mergeAdjustedBriefing(persisted, parsed);
    expect(merged.targetAccounts).toBeUndefined();
    expect(merged.technology).toBe("Netskope");
  });

  it("jobTitlesFromIcp: ausencia preserva com os mesmos cargos; cargos novos zeram", () => {
    const same = mergeAdjustedBriefing(LIST_PERSISTED, {
      ...LIST_PERSISTED,
      jobTitlesFromIcp: undefined,
    });
    expect(same.jobTitlesFromIcp).toBe(true);

    const changed = mergeAdjustedBriefing(LIST_PERSISTED, {
      ...LIST_PERSISTED,
      jobTitles: ["CFO"],
      jobTitlesFromIcp: undefined,
    });
    expect(changed.jobTitlesFromIcp).toBe(false);
  });

  it("execucao no modo lista: parse sem contas nao traz tecnologia", () => {
    const parsed: ParsedBriefing = { ...LIST_PERSISTED, technology: "Netskope" };
    delete parsed.targetAccounts;
    const merged = mergeAdjustedBriefing(LIST_PERSISTED, parsed);
    expect(merged.targetAccounts).toEqual(ACCOUNTS);
    expect(merged.technology).toBeNull();
  });

  it("resumo do ajuste: linha de contas e sem porte do ICP", () => {
    const summary = buildAdjustmentSummary(LIST_PERSISTED, LIST_PERSISTED, "search_leads", null);
    expect(summary).toContain("- Contas: Banco X (bancox.com.br), Banco Z (bancoz.com.br — confirme)");
    expect(summary).toContain("- Tamanho: sem filtro");
    expect(summary).toContain("- Localizacao: sem filtro");
  });

  it("sem contas, o resumo nao tem a linha de contas", () => {
    const summary = buildAdjustmentSummary(PERSISTED, PERSISTED, "search_leads", null);
    expect(summary).not.toContain("- Contas:");
  });
});

describe("Story 24.15 - locationScope no ajuste", () => {
  it("mergeAdjustedBriefing: o locationScope do parse vence", () => {
    const merged = mergeAdjustedBriefing(
      { ...PERSISTED, locationScope: "company" },
      { ...PARSED, locationScope: "person" }
    );
    expect(merged.locationScope).toBe("person");
  });

  it("mergeAdjustedBriefing: ausencia no parse PRESERVA o locationScope anterior", () => {
    expect(mergeAdjustedBriefing({ ...PERSISTED, locationScope: "person" }, PARSED).locationScope).toBe(
      "person"
    );
    expect(
      mergeAdjustedBriefing({ ...PERSISTED, locationScope: "person" }, { ...PARSED, locationScope: null })
        .locationScope
    ).toBe("person");
    expect(mergeAdjustedBriefing(PERSISTED, PARSED)).not.toHaveProperty("locationScope");
  });
});

describe("Story 24.15 - locationScope no resumo do ajuste", () => {
  it("escopo pessoa: '- Localizacao: ... (onde a pessoa esta)'; padrao sem sufixo", () => {
    const person: ParsedBriefing = { ...PERSISTED, locationScope: "person" };
    expect(buildAdjustmentSummary(person, person, "search_leads", null)).toContain(
      "- Localizacao: Sao Paulo (onde a pessoa esta)"
    );
    const summary = buildAdjustmentSummary(PERSISTED, PERSISTED, "search_leads", null);
    expect(summary).toContain("- Localizacao: Sao Paulo");
    expect(summary).not.toContain("onde a pessoa esta");
  });
});

// ==============================================
// Story 24.18 — contas parecidas no ajuste
// ==============================================

describe("Story 24.18 — referencias no ajuste", () => {
  const lookalikePersisted: ParsedBriefing = {
    technology: null,
    jobTitles: ["CISO"],
    location: null,
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: ["search_companies"],
    referenceAccounts: REFERENCE_ACCOUNTS,
    referenceAccountsSource: "user",
    referenceProfile: confidentReferenceProfile(),
  };
  const plainParse: ParsedBriefing = {
    technology: null,
    jobTitles: ["CFO"],
    location: null,
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: ["search_companies"],
  };

  it("ausencia no parse preserva referencias e perfil", () => {
    const merged = mergeAdjustedBriefing(lookalikePersisted, plainParse);
    expect(merged.jobTitles).toEqual(["CFO"]);
    expect(merged.referenceAccounts).toEqual(REFERENCE_ACCOUNTS);
    expect(merged.referenceProfile).toEqual(lookalikePersisted.referenceProfile);
    expect(merged.referenceAccountsSource).toBe("user");
  });

  it("parse sem referencias nao traz tecnologia para o modo", () => {
    const merged = mergeAdjustedBriefing(lookalikePersisted, {
      ...plainParse,
      technology: "Netskope",
    });
    expect(merged.technology).toBeNull();
  });

  it("execucao sem referencias: parse com referencias nao muda a forma", () => {
    const merged = mergeAdjustedBriefing(PERSISTED, {
      ...PARSED,
      technology: null,
      referenceAccounts: REFERENCE_ACCOUNTS,
      referenceProfile: confidentReferenceProfile(),
    });
    expect(merged.technology).toBe("Netskope");
    expect(merged).not.toHaveProperty("referenceAccounts");
  });

  it("buildAdjustmentSummary: referencias e filtros do perfil marcados (dos seus clientes)", () => {
    const summary = buildAdjustmentSummary(
      lookalikePersisted,
      lookalikePersisted,
      "search_leads",
      null
    );
    expect(summary).toContain("- Clientes de referencia: Banco X");
    expect(summary).toContain("- Localizacao: Sao Paulo, Brazil (dos seus clientes)");
    expect(summary).toMatch(/- Tamanho: .+ \(dos seus clientes\)/);
    expect(summary).toContain("- Industria: banking (dos seus clientes)");
  });
});
