---
baseline_commit: 205c784
---

# Story 22.6: Filtros-Padrão de Qualidade na Busca Aberta

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want que a busca sem tecnologia venha com filtros de qualidade por padrão,
so that meus créditos Apollo não sejam gastos em leads rasos demais (ex.: empresas de 1-10 pessoas).

## Acceptance Criteria

1. **Given** uma busca direta no Apollo (sem tech — o ramo `isDirectEntry` de [search-leads-step.ts:99-112](src/lib/agent/steps/search-leads-step.ts#L99-L112)) **When** o usuário **não** especificou tamanho de empresa (`briefing.companySize` null) **Then** filtros-padrão de qualidade são aplicados — `companySizes` = faixas que **excluem** empresas de 1-10 (ver constante recomendada nas Dev Notes) **And** os defaults são **constantes nomeadas** num módulo compartilhado, nunca números mágicos inline.
2. **Given** o usuário especificou tamanho de empresa na conversa (`briefing.companySize` preenchido) **Then** o valor dele **SEMPRE** sobrescreve o default (nenhum default é mesclado; usa `[briefing.companySize]`) — AC2 é sagrado.
3. **Given** o plano de execução (`PlanGeneratorService`, etapa "Encontrar Contatos") **Then** exibe os filtros **efetivos** que serão usados na busca direta — incluindo o default aplicado (ex.: "…tamanho 11+ (padrão de qualidade)") — antes da confirmação, sem surpresa de escopo.
4. **Given** o resumo do briefing (`generateBriefingSummary`) numa busca direta **When** o default de tamanho foi aplicado (usuário não informou) **Then** informa isso ao usuário de forma amigável (ex.: "Tamanho de empresa: 11+ — padrão de qualidade, me diga se quiser mudar") — convite não-bloqueante, não trava `canProceed`.
5. Testes unitários: aplicação do default quando `companySize` null (step monta `companySizes` com as faixas de qualidade); sobrescrita pelo usuário quando `companySize` presente; **não-aplicação** no fluxo normal (com empresas do step anterior) e no fluxo de leads importados; exibição no plano; nota no resumo.

## Tasks / Subtasks

- [x] **Task 1 — Módulo compartilhado de defaults de busca (single source of truth)** (AC: #1, #2)
  - [x] Criar `src/lib/agent/search-defaults.ts` com:
    - `export const QUALITY_MIN_COMPANY_SIZES` = array de faixas de qualidade que excluem `"1-10"` (ver **decisão D1 / recomendação** nas Dev Notes para o valor exato — alinhar aos buckets canônicos de [filter-extraction.ts:14](src/lib/ai/prompts/filter-extraction.ts#L14)).
    - `export const QUALITY_MIN_COMPANY_SIZE_LABEL = "11+"` (rótulo amigável para plano/resumo).
    - `export interface EffectiveCompanySizes { companySizes: string[]; defaultsApplied: boolean }`.
    - `export function resolveDirectSearchCompanySizes(briefing: Pick<ParsedBriefing, "companySize">): EffectiveCompanySizes` — se `briefing.companySize` presente → `{ companySizes: [briefing.companySize], defaultsApplied: false }`; senão → `{ companySizes: [...QUALITY_MIN_COMPANY_SIZES], defaultsApplied: true }`.
  - [x] **Por que um módulo novo e não exportar do step:** os 3 consumidores são um _step_ (execução), um _service_ (plano) e um _hook_ (resumo). Importar de `search-leads-step.ts` para dentro de um hook React é acoplamento estranho e arrisca ciclos. Um leaf module puro (só tipos + constantes + função pura, zero import de runtime pesado) é o padrão do projeto (ex.: `ACTIVE_OPPORTUNITY_STATUSES` em `types/opportunity.ts`, `lt-interest.ts` da 21.3).

- [x] **Task 2 — Aplicar o default no `search-leads-step` (ramo direto)** (AC: #1, #2)
  - [x] Em [search-leads-step.ts:99-112](src/lib/agent/steps/search-leads-step.ts#L99-L112) (bloco `if (isDirectEntry)`), trocar o spread condicional `...(briefing.companySize ? { companySizes: [briefing.companySize] } : {})` por: `const { companySizes } = resolveDirectSearchCompanySizes(briefing);` e incluir `companySizes` **sempre** no objeto `filters` (agora nunca vazio na busca direta).
  - [x] **NÃO** tocar o fluxo normal (linhas 135-141, busca por `domains` do step anterior): ele já foi estreitado pela empresa via TheirStack; adicionar default ali seria mudança de escopo fora do FR12 e regressão (NFR4). O default é exclusivo do ramo `isDirectEntry`.
  - [x] Preservar `perPage`/`page`, `titles`, e os spreads de `location`/`industry` existentes.

- [x] **Task 3 — Exibir filtros efetivos no plano** (AC: #3)
  - [x] Em [agent-plan-generator.ts:42-49](src/lib/services/agent-plan-generator.ts#L42-L49) (ramo `b.skipSteps?.includes("search_companies")` da `descriptionFn` de `search_leads`), acrescentar o tamanho efetivo ao label de filtros: chamar `resolveDirectSearchCompanySizes(b)` e, quando `defaultsApplied`, exibir `tamanho ${QUALITY_MIN_COMPANY_SIZE_LABEL} (padrão de qualidade)`; senão, exibir `tamanho ${b.companySize}`. Anexar ao array `filters` já existente (jobTitles + industry + location) para virar parte do texto "Buscar leads diretamente por …".
  - [x] Não alterar os outros ramos da `descriptionFn` (imported leads / fluxo normal com empresas) — o default só é relevante quando `search_companies` é pulado.

- [x] **Task 4 — Nota no resumo do briefing** (AC: #4)
  - [x] Em [use-briefing-flow.ts:222-229](src/hooks/use-briefing-flow.ts#L222-L229) (`generateBriefingSummary`, ramo `else if (briefing.skipSteps?.includes("search_companies"))` — a busca direta), quando `!briefing.companySize`, acrescentar uma linha de nota: `` `- Tamanho de empresa: ${QUALITY_MIN_COMPANY_SIZE_LABEL} — padrão de qualidade, me diga se quiser mudar.` ``.
  - [x] **Guardas:** só nesse ramo (busca direta), só quando `!briefing.companySize` (quando o usuário informou, a linha 190 `- Tamanho: <valor>` já cobre a exibição — AC2). Não adicionar nada no ramo de leads importados (linhas 218-221) nem quando há tech (fluxo normal, `search_companies` roda).
  - [x] Não criar estado `awaiting_*`: é texto no resumo, convite opcional, não-bloqueante (mesmo padrão da pergunta leve da 22.5). `canProceed` intocado.

- [x] **Task 5 — Testes** (AC: #5)
  - [x] `__tests__/unit/lib/agent/search-defaults.test.ts` (novo): `resolveDirectSearchCompanySizes` — (a) sem `companySize` → `defaultsApplied=true` + `companySizes` iguais a `QUALITY_MIN_COMPANY_SIZES` (e `"1-10"` **não** está na lista); (b) com `companySize="11-50"` → `defaultsApplied=false` + `["11-50"]`.
  - [x] `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` (estender): no ramo direto (`previousStepOutput` undefined) **sem** `companySize` → assert que `mockSearchPeople` foi chamado com `companySizes` = as faixas de qualidade (**RED→GREEN**: hoje `companySizes` fica ausente); no ramo direto **com** `companySize` → assert `companySizes: ["<valor>"]`; no **fluxo normal** (com `previousStepOutput.companies`) → assert que `companySizes` **não** é aplicado (default não vaza pro fluxo por domínio). Reusar `createInput`/`createMockSupabase` já existentes.
  - [x] `__tests__/unit/lib/services/agent-plan-generator.test.ts` (estender se existir; senão adicionar caso): briefing com `skipSteps: ["search_companies"]` e sem `companySize` → `description` da etapa `search_leads` contém `"11+"` e `"padrão de qualidade"`; com `companySize` → contém o valor do usuário e **não** o rótulo de default.
  - [x] `__tests__/unit/hooks/use-briefing-flow.test.tsx` (estender): resumo de busca direta (skipSteps com `search_companies`, sem `companySize`) contém a nota "padrão de qualidade"; com `companySize` presente → mostra `- Tamanho: <valor>` e **não** a nota de default; briefing normal (com tech) → sem nota.
  - [x] Rodar `npx vitest run` (baseline pós-22.5 ~ 395 files / 6884 pass / 2 skip / 0 fail); `npx tsc --noEmit` limpo nos arquivos tocados; `npx eslint --max-warnings=0` nos arquivos tocados. **Resultado: 396 files / 6896 pass / 2 skip / 0 fail (+1 file, +12 testes, zero regressão); tsc limpo nos tocados; eslint --max-warnings=0 limpo nos 8 arquivos.**

- [x] **Task 6 — Smoke manual pela interface real** (lição Epic 21 / def-de-pronto) — **CONCLUÍDO 2026-07-21** via skill `verify` (Playwright, `/agent` logado, dev server reiniciado por corrupção de cache Turbopack pré-existente — ver Debug Log).
  - [x] **(a) Sem tech e sem tamanho** ("Diretores de Marketing em Sao Paulo"): resumo exibiu `"- Tamanho de empresa: 11+ — padrao de qualidade, me diga se quiser mudar."` e **suprimiu** a nota genérica "Sem filtro de tamanho de empresa."; plano ("Encontrar Contatos") exibiu `"...+ tamanho 11+ (padrao de qualidade) (sem filtro de empresa)"`. AC1/AC3/AC4 confirmados na API real.
  - [x] **(b) Tamanho explícito** ("...empresas de 11 a 50 pessoas"): resumo exibiu `"- Tamanho: 11-50"` sem nota de default; plano exibiu `"...tamanho 11-50 (sem filtro de empresa)"`, sem rótulo "11+"/"padrao de qualidade". AC2 (sagrado) confirmado.
  - [x] **(c) Com tecnologia** ("CTOs que usam Salesforce em Sao Paulo"): nenhuma nota de piso de qualidade; nota genérica "Sem filtro de tamanho de empresa." presente normalmente (fluxo via TheirStack intocado). D4/NFR4 confirmado.
  - [x] Parado antes de "Iniciar Execucao" em (a) e (b) — guardrail de custo respeitado. Screenshots capturados: `story-22-6-cenario-A-resumo.png`, `story-22-6-cenario-A-plano.png`, `story-22-6-cenario-B-resumo.png`, `story-22-6-cenario-B-plano.png`.

### Review Findings

_Code review adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 2026-07-21. 12 observações brutas → 1 decisão, 2 patches, 1 deferida, 5 descartadas. Suíte: 121/121 nos 4 arquivos._

- [x] [Review][Decision] Rótulo do plano "…tamanho 11+ (padrao de qualidade) (sem filtro de empresa)" — **RESOLVIDO (Fabossi 2026-07-21): manter como está.** O trecho `(sem filtro de empresa)` é texto herdado e tecnicamente correto (refere-se ao skip da ETAPA de busca de empresas, não ao filtro de tamanho); aceito como wart cosmético, nenhum código muda. [agent-plan-generator.ts:58-60]

- [x] [Review][Patch] **APLICADO** — AC5: cobertura explícita da não-aplicação no fluxo de leads importados. Adicionado `expect(...).not.toContain("padrao de qualidade")` no resumo (hook, via `mock.lastCall`) e na descrição do plano (leads importados). [__tests__/unit/hooks/use-briefing-flow.test.tsx, __tests__/unit/lib/services/agent-plan-generator.test.ts]
- [x] [Review][Patch] **APLICADO** — resumo agora deriva o gate do SSOT `resolveDirectSearchCompanySizes(briefing).defaultsApplied` em vez de `!briefing.companySize` inline; os 3 consumidores usam a mesma fonte para a DECISÃO. Comportamento idêntico hoje (121/121 verdes), sem drift futuro. [use-briefing-flow.ts:241]

- [x] [Review][Defer] `companySize` informado pelo usuário é string freeform do LLM e vai CRU pro Apollo (override AC2). O prompt do parser instrui valores como "enterprise"/"startup"/"PME"/"50-200" ([briefing-parser-service.ts:95]) — vocabulário diferente dos buckets canônicos; `apollo.ts:327` só faz `replace("-",",")`, então "enterprise" chega como `organization_num_employees_ranges=enterprise` (Apollo devolve vazio). Caminho de override é **byte-idêntico ao pré-22.6** (a linha removida já era `[briefing.companySize]`) → não introduzido por esta story. [search-defaults.ts:54-55] — deferido, pré-existente. Recomenda-se story de follow-up: normalizar `companySize` → buckets canônicos dentro do próprio `search-defaults` (home natural do SSOT).

## Dev Notes

### O que muda, em uma frase

Hoje a busca aberta (sem tech) manda pro Apollo **sem filtro de tamanho** quando o usuário não especifica — queimando crédito em micro-empresas. Esta story aplica um **piso de qualidade** (`companySizes` sem "1-10") **apenas nessa busca direta**, com o usuário sobrescrevendo sempre, e mostra o filtro efetivo no plano e no resumo. Zero migration, escopo cirúrgico.

### Fluxo de dados (onde o default entra)

```
briefing (JSONB, companySize null quando não informado)
  ├─→ generateBriefingSummary (hook)      → nota "11+ padrão de qualidade"     ← Task 4
  ├─→ PlanGeneratorService.generatePlan   → etapa "Encontrar Contatos" c/ tamanho ← Task 3
  └─→ SearchLeadsStep.executeInternal
        └─ if (isDirectEntry):  filters.companySizes = resolveDirectSearchCompanySizes(briefing)  ← Task 2
              → ApolloService.searchPeople → organization_num_employees_ranges ("11,50" etc.)
```

Os 3 consumidores chamam **a mesma** `resolveDirectSearchCompanySizes` (Task 1) → nunca há drift entre "o que o plano diz" e "o que o Apollo recebe". Esse é o ponto central do design: um único lugar decide o default.

### `isDirectEntry` ⟺ `search_companies` pulado (por que os 3 lugares concordam)

- No **step**, `isDirectEntry = !previousStepOutput` (linha 69). Isso ocorre exatamente quando `search_companies` foi pulado — e `search_companies` é pulado deterministicamente quando `technology` é null ([parse/route.ts:227-230](src/app/api/agent/briefing/parse/route.ts#L227-L230), o mecanismo que torna o TheirStack secundário, preservado desde a 22.1).
- No **plano** e no **resumo**, a condição é `briefing.skipSteps?.includes("search_companies")`. Mesma verdade, superfície diferente. Por isso a nota/label só aparece na busca direta.
- **Exceção (leads importados, 17.11):** quando `search_leads` **também** está em `skipSteps`, o step nem roda e o resumo/plano têm ramos próprios que vêm **antes** (plano: linha 39-41; resumo: linha 218-221). O default não deve aparecer aí — respeitar a ordem dos ramos existentes garante isso automaticamente.

### Formato de `companySize` (crítico para acertar o valor do default)

- `ParsedBriefing.companySize` é **uma única string** (`string | null`, [agent.ts:94](src/types/agent.ts#L94)) — ex.: `"11-50"`.
- `ApolloSearchFilters.companySizes` é **um array de strings** de faixa; o Apollo converte `"11-50"` → `"11,50"` em `organization_num_employees_ranges` ([apollo.ts:323-328](src/lib/services/apollo.ts#L323-L328)).
- **Buckets canônicos do app** (fonte de verdade a seguir): `1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+` — de [filter-extraction.ts:14](src/lib/ai/prompts/filter-extraction.ts#L14) (usados na busca por IA e no `use-filter-store`). **Use esses rótulos exatos** no default; o mapeamento de enrich em [agent-plan-generator.ts:394-402](src/lib/services/agent-plan-generator.ts#L394-L402) usa `"1000+"` (menos granular) — **não** é a fonte de verdade dos filtros de busca, apenas rotula empresas já retornadas. Não misturar os dois vocabulários.

### Decisões de design (tomadas aqui — o dev segue)

- **D1 — Valor do default (recomendado, confirmar com Fabossi na implementação — ver Questões):** `QUALITY_MIN_COMPANY_SIZES = ["11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"]` — todos os buckets canônicos **exceto** `"1-10"`. Rótulo de exibição: `"11+"`. Rationale: o AC1 pede explicitamente excluir 1-10; incluir todo o resto mantém o alcance máximo (só corta o "raso"), e alinhar aos buckets canônicos evita inventar faixas que a UI de filtros não reconhece.
- **D2 — Default vive no ponto de consumo, não no briefing (consistente com 22.5 D1):** `briefing.companySize` **continua null** quando o usuário não informou (null = "não especificou"). O default é materializado por `resolveDirectSearchCompanySizes` em cada consumidor. Motivo: briefing fiel ao usuário + zero mutação/persistência + zero migration (NFR5). Se algum dia o usuário disser "na verdade quero incluir as pequenas também", basta ele informar um `companySize` e o override (AC2) resolve.
- **D3 — Override total, não merge (AC2 sagrado):** quando o usuário informa `companySize`, usa-se `[briefing.companySize]` puro — os defaults **não** são adicionados. O usuário mandou; o agente obedece.
- **D4 — Só busca direta (FR12 literal):** o fluxo normal (tech → TheirStack → domains → Apollo) **não** ganha default de tamanho. Já é qualificado pela empresa. Mexer nele = regressão (NFR4) e fora de escopo.

### Estado atual dos arquivos UPDATE (o que preservar)

- **[search-leads-step.ts](src/lib/agent/steps/search-leads-step.ts)**: preservar o dual-flow (direto x normal), a validação de `jobTitles`, a contagem de `activeSteps`, as mensagens de progresso, `buildSearchOutput` e o `cost.apollo_search`. Mudança cirúrgica: **só** o objeto `filters` do ramo `isDirectEntry` (linhas 101-108). Nada no ramo normal.
- **[agent-plan-generator.ts](src/lib/services/agent-plan-generator.ts)**: preservar toda a `PIPELINE_STEPS`, os ramos de skip e o premium suffix da 22.2. Mudança cirúrgica: só o texto do ramo direto de `search_leads` (linhas 42-49). Não tocar `mapEnrichedPersonToLead`/o mapeamento de enrich (linhas ~390-420).
- **[use-briefing-flow.ts](src/hooks/use-briefing-flow.ts)**: preservar toda a máquina de estados (22.3/22.4), a pergunta leve da 22.5, `briefingChanged`, os ramos de imported leads. Mudança cirúrgica: **uma linha condicional** no ramo de busca direta de `generateBriefingSummary` (linha ~228). **Não** tocar `briefingChanged` (companySize já está lá, linha 265; o usuário informar tamanho já conta como correção — correto).

### Testing standards

- Framework: **Vitest** (`npx vitest run`). Testes em `__tests__/**/*.{test,spec}.{ts,tsx}` ([vitest.config.ts](vitest.config.ts)). Apollo é **mockado** (`mockSearchPeople`) — por isso a Task 6 (smoke real) é def-de-pronto: a suíte não prova que o `organization_num_employees_ranges` real sai correto.
- **RED→GREEN obrigatório** no step: escrever primeiro o assert de que a busca direta sem `companySize` manda `companySizes` = faixas de qualidade — ele **falha** hoje (o objeto não tem a chave) e passa após a Task 2.
- ESLint enforça `no-console`/`no-non-null-assertion`; `eslint --max-warnings=0` nos arquivos tocados. Tailwind/UI não são tocados nesta story.

### Project Structure Notes

- Escopo: **1 arquivo novo** (`search-defaults.ts`) + **3 arquivos UPDATE** (step, plan-generator, hook) + **4 arquivos de teste** (1 novo + 3 estendidos). ZERO migration, ZERO rota nova, ZERO componente novo, ZERO mudança de schema/tipo (`companySizes` já existe em `ApolloSearchFilters`; `companySize` já em `ParsedBriefing`). NFR1 (pipeline determinístico — o default é uma constante, não decisão de LLM), NFR4 (zero regressão fora da busca direta), NFR5 (zero migration) satisfeitos.
- Independente das demais stories do épico — "qualquer momento após 22.1" (a 22.1 é quem tornou a busca sem-tech o caminho normal). Não depende de 22.2/22.3/22.4/22.5.
- **Baseline commit:** `205c784` (HEAD; 22.5 mergeada em `7e964f5`).

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.6] — FR12, ACs 1-5, "defaults nomeados", "sem surpresa de escopo"
- [Source: src/lib/agent/steps/search-leads-step.ts#L99-L112] — ramo `isDirectEntry` onde o default entra (Task 2)
- [Source: src/lib/services/apollo.ts#L323-L328] — transform `companySizes` `"11-50"`→`"11,50"` para `organization_num_employees_ranges`
- [Source: src/types/apollo.ts#L21-L25] — `ApolloSearchFilters.companySizes: string[]` (já existe)
- [Source: src/types/agent.ts#L90-L98] — `ParsedBriefing.companySize: string | null`, `skipSteps`
- [Source: src/lib/ai/prompts/filter-extraction.ts#L14] — buckets canônicos de tamanho de empresa (fonte de verdade do valor default)
- [Source: src/lib/services/agent-plan-generator.ts#L36-L55] — `descriptionFn` de `search_leads` (ramo direto — Task 3)
- [Source: src/hooks/use-briefing-flow.ts#L184-L246] — `generateBriefingSummary` (ramo de busca direta — Task 4) e `briefingChanged` (não tocar)
- [Source: src/app/api/agent/briefing/parse/route.ts#L227-L230] — skip determinístico de `search_companies` quando tech null (por que direto ⟺ sem tech)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — dev-story 2026-07-21

### Debug Log References

- RED→GREEN provado no step: `search-leads-step.test.ts` falhou 2/25 antes da Task 2 (busca direta sem `companySize` → `companySizes` ausente) e passou 25/25 após aplicar `resolveDirectSearchCompanySizes`.
- `npx vitest run` (suite completa): 396 files / 6896 pass / 2 skip / 0 fail.
- `npx tsc --noEmit`: 0 erros nos 4 arquivos de código tocados.
- `npx eslint --max-warnings=0`: limpo nos 8 arquivos tocados.
- **Smoke Task 6 (2026-07-21):** o dev server local (rodando havia ~9h, com muitos rebuilds Turbopack acumulados de sessões anteriores) apresentou 500 (HTML de erro, não JSON) em `POST /api/agent/executions/[id]/messages` — sistêmico (afetava execução antiga E nova recém-criada), rota não tocada pela 22.6 (Story 16.2). **Não é bug da story** — reiniciar o `npm run dev` resolveu integralmente; confirmado ambiental/pré-existente, não causado pelo diff. Observação registrada aqui apenas para referência futura (mesma classe do "hydration mismatch pré-existente" já catalogado na skill `verify`).

### Completion Notes List

- **D1 (valor do default) — recomendação seguida:** `QUALITY_MIN_COMPANY_SIZES = ["11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"]` (buckets canônicos de `filter-extraction.ts` MENOS `"1-10"`); rótulo `"11+"`. Fabossi: contestar aqui se quiser outro piso.
- **Convenção de acentuação:** as strings do agente neste projeto evitam acentos/cedilha (ex.: `"nao necessaria"`, `"sequencia padrao"`, `"Localizacao"`). Usei **`"padrao de qualidade"` (sem acento)** em código E testes, consistente com os arquivos tocados. Os exemplos acentuados da story ("padrão de qualidade") são ilustrativos.
- **Conflito de nota resolvido (fora do escopo literal da Task 4, necessário para AC4):** `analyzeBriefingCompleteness` empurra `"companySize"` para `missingFields` sempre que é null ([parse/route.ts:87-89](src/app/api/agent/briefing/parse/route.ts#L87-L89)), e `generateBriefingSummary` já renderizava a nota genérica **"Sem filtro de tamanho de empresa."**. Numa busca direta sem tamanho isso contradiria a nova nota "11+ padrão de qualidade". Fix cirúrgico: na busca direta (`search_companies` pulado, `search_leads` presente) a nota genérica de `companySize` é **suprimida** (`isDirectSearch`), deixando só a nota dedicada. Fluxo normal e leads importados mantêm a nota genérica pré-existente intacta (NFR4).
- **AC1** ✅ — busca direta sem `companySize` monta `companySizes` = faixas de qualidade (nunca inclui `"1-10"`); defaults são constantes nomeadas em `search-defaults.ts` (single source of truth), zero número mágico inline.
- **AC2** ✅ (sagrado) — usuário informou `companySize` → `[briefing.companySize]` puro, defaults NÃO mesclados (step + plano + resumo).
- **AC3** ✅ — plano ("Encontrar Contatos") exibe o tamanho efetivo: `tamanho 11+ (padrao de qualidade)` quando default; `tamanho <valor>` quando o usuário informou.
- **AC4** ✅ — resumo da busca direta sem tamanho traz `- Tamanho de empresa: 11+ — padrao de qualidade, me diga se quiser mudar.` (não-bloqueante; `canProceed` intocado).
- **AC5** ✅ — testes cobrindo: aplicação do default (null), override (presente), não-aplicação no fluxo normal, não-aplicação em leads importados (ramos próprios antes, verificado), exibição no plano, nota no resumo.
- **D4/NFR4 preservados** — nenhuma mudança no ramo normal do step (busca por `domains`) nem no ramo de leads importados. Default exclusivo da busca direta.
- **NFR5** — zero migration; `companySize` do briefing continua `null` quando não informado (default materializado no ponto de consumo, consistente com 22.5 D1).
- **Task 6 (smoke manual) PENDENTE — operacional:** a suíte mocka o Apollo; não prova que a query real sai com `organization_num_employees_ranges` correto. Requer `/agent` logado + Apollo/OpenAI pagos (parar antes de "Iniciar Execução"). Único gate manual restante.

### File List

**Novos:**
- `src/lib/agent/search-defaults.ts` — leaf module (single source of truth): `QUALITY_MIN_COMPANY_SIZES`, `QUALITY_MIN_COMPANY_SIZE_LABEL`, `EffectiveCompanySizes`, `resolveDirectSearchCompanySizes`.
- `__tests__/unit/lib/agent/search-defaults.test.ts` — 5 testes da função pura.

**Modificados (código):**
- `src/lib/agent/steps/search-leads-step.ts` — ramo `isDirectEntry` usa `resolveDirectSearchCompanySizes`; `companySizes` sempre presente na busca direta.
- `src/lib/services/agent-plan-generator.ts` — `descriptionFn` de `search_leads` (ramo direto) exibe o tamanho efetivo (AC3).
- `src/hooks/use-briefing-flow.ts` — `generateBriefingSummary`: nota dedicada do piso de qualidade na busca direta (AC4) + supressão da nota genérica contraditória.

**Modificados (testes):**
- `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` — +3 testes (AC1 RED→GREEN, AC2 override, não-vazamento no fluxo normal) + 1 teste existente atualizado (companySizes agora presente na busca direta).
- `__tests__/unit/lib/services/agent-plan-generator.test.ts` — 2 testes atualizados + 2 novos (AC3 default aplicado / valor do usuário).
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — +3 testes (nota na busca direta sem tamanho; valor do usuário sem nota; fluxo normal sem nota).

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-07-21 | Fabossi (create-story) | Story 22.6 criada (FR12): piso de qualidade de tamanho de empresa na busca aberta (sem tech). Módulo compartilhado `search-defaults.ts` (single source of truth) consumido por step + plano + resumo; override total pelo usuário (AC2); só no ramo direto. Zero migration/rota/componente. Baseline 205c784. Status → ready-for-dev. |
| 2026-07-21 | Amelia (dev-story) | FR12 implementado. Novo `search-defaults.ts` (SSOT) consumido por step + plan-generator + hook. D1 seguido (buckets canônicos menos `"1-10"`, rótulo `"11+"`). RED→GREEN no step. Conflito com a nota genérica "Sem filtro de tamanho" resolvido (suprimida na busca direta). +12 testes líquido; suite 396/6896/2 skip/0 fail; tsc/eslint limpos nos tocados. AC1-AC5 satisfeitos em código+teste. Falta só o smoke manual pela interface real (Task 6, operacional — Apollo/OpenAI pagos). Status → review. |
