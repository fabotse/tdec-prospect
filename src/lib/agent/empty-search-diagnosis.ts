/**
 * empty-search-diagnosis.ts — diagnóstico determinístico de busca sem resultados
 * Story 22.14 — AC: #2, #3
 *
 * Leaf module PURO (sem React, sem fetch, sem LLM), no molde de `search-defaults.ts`
 * (22.6) e `briefing-adjustment.ts` (22.13): roda no SERVIDOR (dentro do step, onde
 * briefing e filtros efetivos coexistem) e o resultado viaja no `output` JSONB até o
 * card do chat.
 *
 * Por que determinístico: NFR1 do épico — nenhuma decisão de execução/custo é delegada
 * a LLM. O diagnóstico e os chips de recuperação são regras fixas sobre os filtros que
 * REALMENTE foram enviados à Apollo, não uma opinião gerada.
 *
 * Contexto (E2E 2026-07-24): "Dono/Diretor + clínicas de estética + Atibaia + <11" devolveu
 * 0 leads; a MESMA busca sem indústria e sem o tamanho devolveu 248. As duas causas eram
 * diagnosticáveis sem nenhuma chamada externa:
 *   - `industry` não é filtro estruturado na Apollo — vira texto em `q_keywords`;
 *   - `companySize` é texto livre do LLM e vai cru para `organization_num_employees_ranges[]`,
 *     então um valor fora dos buckets canônicos ("<11") chega inválido.
 */

import {
  QUALITY_MIN_COMPANY_SIZES,
  QUALITY_MIN_COMPANY_SIZE_LABEL,
  resolveDirectSearchCompanySizes,
} from "@/lib/agent/search-defaults";
import type { ParsedBriefing } from "@/types/agent";

// ==============================================
// CONSTANTES
// ==============================================

/**
 * Buckets que a Apollo reconhece em `organization_num_employees_ranges[]`.
 * É a lista canônica do app (filter-extraction.ts:14) = `QUALITY_MIN_COMPANY_SIZES` + "1-10".
 * Derivada do SSOT da 22.6 de propósito: um bucket novo entra em UM lugar só.
 */
export const CANONICAL_COMPANY_SIZE_BUCKETS: readonly string[] = [
  "1-10",
  ...QUALITY_MIN_COMPANY_SIZES,
];

/**
 * Faixas canônicas estreitas o bastante para, sozinhas, zerarem uma busca por cidade.
 * Não é "pequeno demais" no sentido de negócio — é "pouca gente cadastrada na base".
 */
const RESTRICTIVE_COMPANY_SIZE_BUCKETS: readonly string[] = ["1-10", "11-50"];

/** Teto (inclusivo) do bucket "1-10" — usado para detectar intenção de empresa pequena. */
const SMALL_COMPANY_UPPER_BOUND = 10;

/**
 * Marcadores de "no máximo N". Com eles, `<11` / `menos de 11` significam "até 10" —
 * exatamente o valor que o usuário do E2E digitou e que a Apollo não entende.
 */
const UPPER_BOUND_MARKERS: readonly string[] = [
  "<",
  "menos de",
  "menos que",
  "abaixo de",
  "ate ",
  "no maximo",
  "no max",
];

/**
 * Marcadores de "no MÍNIMO N" (code review 22.14). Sem esta lista, `Math.min` sozinho lia
 * "mais de 10" / "10+" / "acima de 10" como intenção de empresa PEQUENA e o card oferecia
 * "Corrigir tamanho para 1-10" — o inverso exato do que o usuário pediu, gastando uma
 * re-execução paga para devolver outro 0. Piso detectado = a intenção NÃO é pequena.
 */
const LOWER_BOUND_MARKERS: readonly string[] = [
  "+",
  ">",
  "mais de",
  "mais que",
  "acima de",
  "maior que",
  "a partir de",
  "no minimo",
  "pelo menos",
];

/**
 * Única palavra de tamanho que mapeia SEM ambiguidade para "1-10". "PME" e "startup"
 * ficam de fora de propósito: as duas incluem faixas médias, e corrigi-las para "1-10"
 * estreitaria a busca em vez de recuperá-la (o chip de REMOVER cobre esses casos).
 */
const SMALL_COMPANY_KEYWORDS: readonly string[] = ["micro"];

/**
 * Localizações amplas que não têm vírgula mas também não são "uma cidade só".
 * Lista curta e literal de propósito — a spec proíbe geocoding aqui; o custo de errar
 * é apontar uma causa falsa ("busca restrita a uma cidade") para quem buscou no Brasil todo.
 */
const BROAD_LOCATIONS: readonly string[] = [
  "brasil",
  "brazil",
  "latam",
  "america latina",
  "americalatina",
  "eua",
  "usa",
  "estados unidos",
  "united states",
  "mundo",
  "global",
  "portugal",
];

// ==============================================
// TIPOS
// ==============================================

/**
 * Qual dos dois caminhos de `SearchLeadsStep` rodou:
 * - "direct": busca aberta por filtros do briefing (sem tecnologia; entrada direta 17.10);
 * - "domains": busca pelos domínios das empresas aprovadas na etapa anterior.
 *
 * A distinção não é cosmética (Trap #4): no ramo por domínios, tamanho e indústria NEM SÃO
 * ENVIADOS à Apollo — oferecer "remover filtro de indústria" ali seria um chip que não muda
 * nada, gastando uma re-execução paga para devolver o mesmo 0.
 */
export type EmptySearchBranch = "direct" | "domains";

export type EmptySearchCauseCode =
  // busca de leads (Apollo) — ramo direto
  | "company_size_non_canonical"
  | "industry_textual"
  | "company_size_restrictive"
  | "narrow_location"
  | "quality_floor_applied"
  | "job_titles"
  // busca de leads (Apollo) — ramo por domínios
  | "job_titles_in_companies"
  // busca de empresas (TheirStack)
  | "technology_not_resolved"
  | "company_size_range_narrow"
  | "filters_combined";

/** Uma linha de "o que foi realmente enviado para a busca". */
export interface ActiveFilterLine {
  label: string;
  value: string;
  /** Explicação de por que esse filtro pode atrapalhar (só quando há o que explicar). */
  note?: string;
}

export interface ProbableCause {
  code: EmptySearchCauseCode;
  text: string;
}

/** Campos de FILTRO que um chip pode alterar. A FORMA do pipeline nunca entra aqui (AC4 da 22.13). */
export type ChipDelta = Partial<
  Pick<ParsedBriefing, "technology" | "jobTitles" | "location" | "companySize" | "industry">
>;

export interface AdjustmentChip {
  /** Estável — é a chave de render e o identificador nos testes. */
  id: string;
  label: string;
  /**
   * - "delta": o chip conhece a mudança exata; aplica direto sobre o briefing persistido
   *   (sem `/parse`, sem LLM — D2 da story);
   * - "prefill": não há mudança determinística segura (ex.: inventar geografia); o chip
   *   preenche o input do chat e o usuário envia, caindo no caminho de TEXTO da 22.13.
   */
  kind: "delta" | "prefill";
  delta?: ChipDelta;
  prefillText?: string;
  /** Efeito colateral que o usuário precisa saber ANTES de clicar. */
  warning?: string;
}

export interface EmptySearchDiagnosis {
  branch: EmptySearchBranch;
  /** Quantos domínios foram varridos (só no ramo "domains"; 0 no ramo direto). */
  companiesSearched: number;
  activeFilters: ActiveFilterLine[];
  /** Ordenadas da causa mais provável para a menos provável. */
  probableCauses: ProbableCause[];
  suggestedChips: AdjustmentChip[];
}

// ==============================================
// PREDICADOS PUROS (exportados para teste direto)
// ==============================================

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    // Escapes explícitos (code review 22.14): escrito com as marcas combinantes LITERAIS,
    // o range fica invisível em editor/diff e qualquer round-trip de encoding o corrompe
    // em silêncio — os acentos parariam de ser removidos sem nenhum teste falhar.
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * O valor é um dos buckets que a Apollo entende?
 *
 * Comparação EXATA, sem `.trim()` (code review 22.14): `resolveDirectSearchCompanySizes`
 * manda `[briefing.companySize]` verbatim para `organization_num_employees_ranges[]`, então
 * `" 11-50 "` chega com os espaços e quebra a busca de verdade. Com trim aqui, o card jurava
 * que o formato era válido — mentindo exatamente sobre a causa que ele existe para nomear.
 */
export function isCanonicalCompanySize(value: string | null | undefined): boolean {
  if (!value) return false;
  return CANONICAL_COMPANY_SIZE_BUCKETS.includes(value);
}

/**
 * O texto livre de tamanho quer dizer "empresa pequena (até 10 pessoas)"?
 *
 * Decide entre as duas variantes do chip de tamanho. Errar para o lado de NÃO detectar é
 * barato (o usuário ganha o chip de remover, com aviso); errar para o lado de detectar
 * seria caro (corrigir "1000-5000" para "1-10" destruiria a busca).
 */
export function detectsSmallCompanyIntent(value: string | null | undefined): boolean {
  if (!value) return false;
  const text = normalize(value);
  if (text === "") return false;

  if (SMALL_COMPANY_KEYWORDS.some((keyword) => text.includes(keyword))) return true;

  // Piso explícito ("mais de 10", "10+", "a partir de 10") = o usuário quer empresas ACIMA
  // de N. Corrigir para "1-10" seria o oposto do pedido — e caro. Sai antes de olhar números.
  if (LOWER_BOUND_MARKERS.some((marker) => text.includes(marker))) return false;

  const numbers = (text.match(/\d+/g) ?? []).map(Number);
  if (numbers.length === 0) return false;

  // O MAIOR número é que decide (code review 22.14): `Math.min` sozinho lia "10-100",
  // "5 a 50" e "de 5 a 500" como intenção de empresa pequena e estreitava a busca para
  // 1-10, jogando fora justamente a faixa que o usuário pediu.
  const largest = Math.max(...numbers);
  // "<11" / "menos de 11" = teto EXCLUSIVO -> o alvo real é 10.
  const hasUpperBoundMarker = UPPER_BOUND_MARKERS.some((marker) => text.includes(marker));
  return hasUpperBoundMarker
    ? largest <= SMALL_COMPANY_UPPER_BOUND + 1
    : largest <= SMALL_COMPANY_UPPER_BOUND;
}

/**
 * Localização restrita a UMA localidade só (sem UF/estado anexo e fora das regiões amplas).
 *
 * Deliberadamente NÃO afirma que é uma cidade (code review 22.14): sem geocoding — que a
 * spec proíbe — é impossível distinguir "Atibaia" de "Minas Gerais", "Sudeste" ou
 * "Argentina", e a versão anterior chamava todos de "uma única cidade", fabricando uma causa
 * falsa que ainda era ranqueada ACIMA da real. O que dá para afirmar com honestidade é que o
 * recorte é único e estreitável.
 */
export function isNarrowLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  const trimmed = location.trim();
  if (trimmed === "") return false;
  if (trimmed.includes(",")) return false;
  return !BROAD_LOCATIONS.includes(normalize(trimmed));
}

// ==============================================
// LEITURA DEFENSIVA DOS FILTROS
// ==============================================

/**
 * `searchFilters` chega do JSONB do step — nada garante o formato depois do round-trip
 * (execução antiga, schema alterado). Toda leitura é defensiva; na dúvida, campo ausente.
 */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

// ==============================================
// DIAGNÓSTICO
// ==============================================

type DiagnosisBriefing = Pick<
  ParsedBriefing,
  "technology" | "jobTitles" | "location" | "companySize" | "industry"
>;

/**
 * Diagnostica uma busca que voltou vazia e propõe ajustes determinísticos.
 *
 * @param briefing filtros pedidos pelo usuário (fonte da intenção)
 * @param searchFilters filtros EFETIVOS enviados à Apollo (fonte da verdade do que rodou)
 */
export function diagnoseEmptySearch(
  briefing: DiagnosisBriefing,
  searchFilters: Record<string, unknown> | null | undefined
): EmptySearchDiagnosis {
  const filters = searchFilters ?? {};
  const domains = readStringArray(filters.domains);
  const branch: EmptySearchBranch = domains.length > 0 ? "domains" : "direct";

  const filterTitles = readStringArray(filters.titles);
  const jobTitles = filterTitles.length > 0 ? filterTitles : briefing.jobTitles;
  const titlesLabel = jobTitles.length > 0 ? jobTitles.join(", ") : "sem filtro";

  const filterLocations = readStringArray(filters.locations);
  const location = filterLocations[0] ?? briefing.location ?? null;

  const activeFilters: ActiveFilterLine[] = [
    { label: "Cargos", value: titlesLabel },
    { label: "Localização", value: location ?? "sem filtro" },
  ];

  if (branch === "domains") {
    activeFilters.push({
      label: "Empresas",
      value: `${domains.length} ${domains.length === 1 ? "domínio" : "domínios"} da etapa anterior`,
      note: "Tamanho e indústria não entram nesta etapa — os leads são buscados dentro das empresas já aprovadas.",
    });

    return {
      branch,
      companiesSearched: domains.length,
      activeFilters,
      probableCauses: [
        {
          code: "job_titles_in_companies",
          text: `Nenhuma pessoa com esses cargos (${titlesLabel}) foi encontrada nas ${domains.length} ${
            domains.length === 1 ? "empresa" : "empresas"
          } da etapa anterior. Ajustar cargos ou localização é o que muda o resultado aqui — filtros de tamanho e indústria não são aplicados nesta etapa.`,
        },
      ],
      suggestedChips: buildLocationChips(location),
    };
  }

  // --- Ramo direto: tamanho e indústria REALMENTE foram enviados ---

  const { defaultsApplied } = resolveDirectSearchCompanySizes(briefing);
  const companySize = briefing.companySize;
  const sizeIsCanonical = isCanonicalCompanySize(companySize);

  if (defaultsApplied) {
    activeFilters.push({
      label: "Tamanho",
      value: `${QUALITY_MIN_COMPANY_SIZE_LABEL} (padrão de qualidade)`,
      note: "Aplicado automaticamente porque você não informou tamanho — empresas de até 10 pessoas ficam de fora da busca.",
    });
  } else {
    activeFilters.push({
      label: "Tamanho",
      value: companySize ?? "sem filtro",
      ...(sizeIsCanonical
        ? {}
        : {
            note: `Formato não reconhecido pela base. Os valores aceitos são: ${CANONICAL_COMPANY_SIZE_BUCKETS.join(", ")}.`,
          }),
    });
  }

  activeFilters.push({
    label: "Indústria",
    value: briefing.industry ?? "sem filtro",
    ...(briefing.industry
      ? {
          note: "A busca por indústria é feita por TEXTO (palavra-chave), não por categoria — é o filtro mais impreciso da busca aberta.",
        }
      : {}),
  });

  const probableCauses: ProbableCause[] = [];

  if (companySize && !sizeIsCanonical) {
    probableCauses.push({
      code: "company_size_non_canonical",
      text: `O filtro de tamanho ("${companySize}") está num formato que a base não reconhece, então ele não filtrou o que você queria. Os valores aceitos são: ${CANONICAL_COMPANY_SIZE_BUCKETS.join(", ")}.`,
    });
  }

  if (briefing.industry) {
    probableCauses.push({
      code: "industry_textual",
      text: `A indústria ("${briefing.industry}") vira uma busca por texto livre, não por categoria. Basta o termo não bater com o cadastro das empresas para o resultado zerar — é a causa mais comum de busca vazia.`,
    });
  }

  if (companySize && sizeIsCanonical && RESTRICTIVE_COMPANY_SIZE_BUCKETS.includes(companySize.trim())) {
    probableCauses.push({
      code: "company_size_restrictive",
      text: `O tamanho "${companySize}" é uma faixa estreita. Combinado com a localização e os cargos, pode não sobrar ninguém.`,
    });
  }

  if (isNarrowLocation(location)) {
    probableCauses.push({
      code: "narrow_location",
      text: `A busca está limitada a uma localidade só ("${location}"). Se for uma cidade ou uma região pequena, há poucos contatos cadastrados ali — ampliar para uma área maior normalmente resolve.`,
    });
  }

  if (defaultsApplied) {
    probableCauses.push({
      code: "quality_floor_applied",
      text: `Como você não informou tamanho, a busca aplicou o piso de qualidade ${QUALITY_MIN_COMPANY_SIZE_LABEL} — empresas de até 10 pessoas ficaram de fora. Se o seu alvo são negócios pequenos, é isso que zera o resultado.`,
    });
  }

  if (probableCauses.length === 0) {
    probableCauses.push({
      code: "job_titles",
      text: `Os filtros estão todos em formato válido, então o candidato que sobra são os cargos (${titlesLabel}): confira se eles existem com esse nome nessa região.`,
    });
  }

  const suggestedChips: AdjustmentChip[] = [];

  if (briefing.industry) {
    suggestedChips.push({
      id: "remove-industry",
      label: "Remover filtro de indústria",
      kind: "delta",
      delta: { industry: null },
    });
  }

  if (companySize && !sizeIsCanonical && detectsSmallCompanyIntent(companySize)) {
    // A intenção do usuário É empresa pequena — REMOVER o filtro excluiria justamente o
    // alvo dele (o piso 11+ entra no lugar). Corrigir vem primeiro por isso.
    suggestedChips.push({
      id: "fix-company-size",
      label: "Corrigir tamanho para 1-10",
      kind: "delta",
      delta: { companySize: "1-10" },
    });
  } else if (companySize) {
    suggestedChips.push({
      id: "remove-company-size",
      label: "Remover filtro de tamanho",
      kind: "delta",
      delta: { companySize: null },
      warning: `Sem tamanho informado a busca volta ao piso padrão ${QUALITY_MIN_COMPANY_SIZE_LABEL} — empresas de até 10 pessoas continuam de fora.`,
    });
  } else {
    suggestedChips.push({
      id: "include-small-companies",
      // "Incluir" mentia (code review 22.14): o delta SUBSTITUI o piso 11+ por "1-10", ele
      // não soma. Num card que existe para ampliar uma busca vazia, um rótulo aditivo sobre
      // um efeito restritivo é a pior combinação possível — o rótulo é o que se lê primeiro.
      label: "Buscar só empresas de 1 a 10 pessoas",
      kind: "delta",
      delta: { companySize: "1-10" },
      warning: `Passa a buscar SÓ empresas de 1 a 10 pessoas, no lugar do piso ${QUALITY_MIN_COMPANY_SIZE_LABEL}.`,
    });
  }

  suggestedChips.push(...buildLocationChips(location));

  return { branch, companiesSearched: 0, activeFilters, probableCauses, suggestedChips };
}

// ==============================================
// DIAGNÓSTICO MÍNIMO DE `search_companies` (AC5)
// ==============================================

/**
 * O card de empresas (`AgentApprovalGate`) recebe um diagnóstico ENXUTO de propósito:
 * filtros efetivos + causa provável + orientação para o caminho de texto. Os chips
 * completos moram só no card de leads (Trap #6 — são componentes distintos e o ajuste
 * de empresas mexe em tecnologia/país, não nos filtros da Apollo).
 */
export interface EmptyCompanySearchDiagnosis {
  activeFilters: ActiveFilterLine[];
  probableCauses: ProbableCause[];
  /** Próximo passo em uma frase — o card não tem chips para oferecer. */
  guidance: string;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Diagnostica `search_companies` (TheirStack) sem resultados.
 *
 * Os filtros do TheirStack são de outra natureza (slug de tecnologia, código ISO de país,
 * min/max de funcionários, id de indústria) e passam por RESOLUÇÃO antes de ir para a API —
 * o que o usuário pediu e o que foi enviado divergem em silêncio hoje. O valor principal
 * deste diagnóstico é mostrar exatamente essa divergência.
 */
export function diagnoseEmptyCompanySearch(
  briefing: Pick<ParsedBriefing, "technology" | "location" | "companySize" | "industry">,
  filtersApplied: Record<string, unknown> | null | undefined
): EmptyCompanySearchDiagnosis {
  const filters = filtersApplied ?? {};
  const technologySlugs = readStringArray(filters.technologySlugs);
  const countryCodes = readStringArray(filters.countryCodes);
  const minEmployeeCount = readNumber(filters.minEmployeeCount);
  const maxEmployeeCount = readNumber(filters.maxEmployeeCount);
  const industryIds = Array.isArray(filters.industryIds) ? filters.industryIds : [];

  const technologyResolved = technologySlugs.length > 0;

  const activeFilters: ActiveFilterLine[] = [
    {
      label: "Tecnologia",
      value: technologyResolved ? technologySlugs[0] : (briefing.technology ?? "sem filtro"),
      ...(briefing.technology && !technologyResolved
        ? { note: "Não foi encontrada no catálogo de tecnologias — o filtro não foi aplicado como você pediu." }
        : {}),
    },
    {
      label: "País",
      value: countryCodes[0] ?? "sem filtro",
      ...(briefing.location && countryCodes.length === 0
        ? { note: `"${briefing.location}" não foi reconhecida como país e não entrou nesta busca.` }
        : {}),
    },
    {
      label: "Tamanho",
      value:
        minEmployeeCount !== null && maxEmployeeCount !== null
          ? `${minEmployeeCount} a ${maxEmployeeCount} funcionários`
          : "sem filtro",
      ...(briefing.companySize && minEmployeeCount === null
        ? { note: `"${briefing.companySize}" não foi reconhecido como faixa numérica e não entrou nesta busca.` }
        : {}),
    },
    {
      label: "Indústria",
      value: industryIds.length > 0 ? (briefing.industry ?? "sem filtro") : "sem filtro",
      ...(briefing.industry && industryIds.length === 0
        ? { note: `"${briefing.industry}" não está no catálogo de indústrias e não entrou nesta busca.` }
        : {}),
    },
  ];

  const probableCauses: ProbableCause[] = [];

  if (briefing.technology && !technologyResolved) {
    probableCauses.push({
      code: "technology_not_resolved",
      text: `A tecnologia "${briefing.technology}" não foi reconhecida no catálogo, então a busca não filtrou por ela como você esperava. Tente o nome exato do produto (ex.: "Salesforce", "HubSpot").`,
    });
  }

  if (minEmployeeCount !== null && maxEmployeeCount !== null) {
    probableCauses.push({
      code: "company_size_range_narrow",
      text: `A faixa de ${minEmployeeCount} a ${maxEmployeeCount} funcionários é estreita. Combinada com país e tecnologia, pode não sobrar nenhuma empresa.`,
    });
  }

  if (probableCauses.length === 0) {
    probableCauses.push({
      code: "filters_combined",
      text: "A combinação de tecnologia, país e tamanho não retornou nenhuma empresa nesta base.",
    });
  }

  return {
    activeFilters,
    probableCauses,
    guidance:
      'Clique em "Rejeitar" e descreva o ajuste (ex.: outra tecnologia, país mais amplo ou sem faixa de tamanho) — eu refaço a busca com os novos parâmetros.',
  };
}

/**
 * Chip de localização — SEMPRE `prefill`, nunca delta (decisão do code review 22.14).
 *
 * A versão anterior derivava um delta da própria string ("Atibaia, SP" -> `{location: "SP"}`)
 * e o mandava cru para `person_locations[]`. Dois problemas fatais num chip cujo trabalho é
 * recuperar uma busca que voltou vazia:
 *   1. o recorte derivado nem sempre AMPLIA — verificado: "Campinas, Atibaia e Jundiaí"
 *      virava `{location: "Atibaia e Jundiaí"}`, que ESTREITA, e "São Paulo, SP, Brasil"
 *      virava "SP, Brasil";
 *   2. uma UF nua ("SP") pode simplesmente não resolver na Apollo — e o smoke real da story
 *      nunca exercitou este chip, então nunca houve evidência de que resolvia.
 * Em ambos os casos o usuário pagaria uma re-execução para receber outro 0.
 *
 * O caminho de TEXTO da 22.13 passa pelo parser, que sabe interpretar geografia. Um gesto a
 * mais do usuário é barato; uma busca paga em cima de geografia inventada não é. É a mesma
 * regra de fail-safe que a spec já tinha adotado — aqui ela passa a valer sempre.
 */
function buildLocationChips(location: string | null): AdjustmentChip[] {
  if (!location) return [];
  const trimmed = location.trim();
  if (trimmed === "") return [];

  // Já é um recorte amplo (Brasil, LATAM, Global...): não há o que ampliar, e sugerir
  // "buscar no estado inteiro em vez de só Brasil" seria ruído sem sentido.
  if (BROAD_LOCATIONS.includes(normalize(trimmed))) return [];

  return [
    {
      id: "broaden-location",
      label: "Ampliar localização",
      kind: "prefill",
      // A frase precisa ser uma INSTRUÇÃO que o parser resolva em geografia real, não uma
      // descrição que ele possa ecoar como valor. O smoke de 2026-07-26 pegou isto ao vivo:
      // "ampliar a busca para uma região maior que Atibaia" virou
      // `location: "região maior que Atibaia"` — string que a Apollo não resolve, e a busca
      // voltaria vazia de novo. "o estado inteiro" dá ao LLM um alvo concreto (Atibaia -> SP),
      // que é justamente o trabalho que delegamos a ele ao NÃO derivar delta aqui.
      // É também a redação que a spec da story já prescrevia.
      prefillText: `buscar no estado inteiro em vez de só ${trimmed}`,
    },
  ];
}
