---
title: '24.18 — Contas parecidas com os melhores clientes'
type: 'feature'
created: '2026-10-26'
status: done
baseline_revision: '104dcd122043f58c0a3f99a9780d2f4ab5c8b585'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** O gestor sabe quais são os melhores clientes, mas o agente não sabe partir deles. Hoje não existe como dizer "quero empresas parecidas com o Cliente X, Y e Z" e receber contas com o mesmo setor, porte e região, sem os próprios clientes.

**Approach:** O parser passa a extrair `referenceAccounts` (3–5 clientes de referência, nome + domínio), ou usar os domínios com motivo "cliente" da Lista de Supressão. Com referências, a execução entra no **modo contas parecidas**. Um card com o custo ("até N créditos da Apollo") pede o clique em **Analisar**. A rota nova enriquece as empresas (Apollo Organization Enrichment), deriva o perfil comum (setor, porte, região e tecnologias) e o card do briefing mostra esse perfil nos chips Setor, Porte e Local, que continuam editáveis. A busca é a busca direta da 24.15 com esse perfil. Ela exclui os clientes e os domínios suprimidos e escreve no Fit Score a semelhança ("mesmo setor e porte de Banco X").

## Boundaries & Constraints

**Always:**
- Tipos em `src/types/agent.ts`:
  - `ReferenceCompany { name: string | null; domain: string; industry: string | null; employees: number | null; sizeBucket: string | null; city: string | null; state: string | null; country: string | null; technologies: string[] }`.
  - `ReferenceProfile { sourceDomains: string[]; companies: ReferenceCompany[]; industries: string[]; companySizes: string[]; locations: string[]; technologies: string[]; creditsUsed: number }`.
  - `ParsedBriefing` ganha `referenceAccounts?: TargetAccount[] | null`, `referenceAccountsSource?: "user" | "suppression_list" | null` e `referenceProfile?: ReferenceProfile | null`.
- Módulo puro e client-safe `src/lib/agent/reference-accounts.ts`, com estas funções:
  - `REFERENCE_MIN = 3`, `REFERENCE_MAX = 5`.
  - `isLookalikeMode(b)`: `Array.isArray(b.referenceAccounts)`, fora do fluxo importado e fora do modo lista (`isAccountListMode` falso).
  - `hasEnoughReferences(b)`: entre 3 e 5 contas resolvidas e nenhuma sem domínio.
  - `profileMatchesReferences(profile, accounts)`: igualdade de conjunto entre `sourceDomains` e `resolvedAccountDomains`.
  - `sizeBucketFor(employees)`: faixa de `APOLLO_COMPANY_SIZE_BUCKETS`.
  - `deriveReferenceProfile(companies, creditsUsed)` → `{ profile, confident, reason }`. Uma empresa "com dados" tem `industry` ou `employees`. As regras:
    - `industries`: os setores Apollo (minúsculas) presentes em ≥ 2 empresas, no máximo 3.
    - `companySizes`: o intervalo contíguo de faixas entre a menor e a maior faixa das empresas com `employees`.
    - `locations`: `"{state}, {country}"` se todas as empresas com local têm o mesmo estado; senão o país da maioria (> metade); senão `[]`.
    - `technologies`: as presentes em ≥ 2 empresas, no máximo 5, só informativas.
    - `confident`: ≥ 3 empresas com dados, `industries` não vazio e `companySizes` não vazio. Senão `reason` explica o que faltou: quais empresas vieram sem dados na Apollo, ou que os setores não se repetem.
  - `similarityReason(b)`: a primeira referência cujo `industry` está nos setores efetivos e cujo `sizeBucket` está nas faixas efetivas dá `mesmo setor e porte de {nome}`. Se só um dos dois casa, `mesmo setor de {nome}` ou `mesmo porte de {nome}`. Se nada casa, `perfil parecido com seus clientes`. O nome cai no domínio quando não há nome.
  - `formatReferenceAccounts` e `formatReferenceProfile` (texto do card).
- `search-defaults.ts`, só no modo contas parecidas com perfil:
  - `resolveDirectSearchCompanySizes`: usuário > `referenceProfile.companySizes` (`source: "reference"`) > ICP > piso.
  - `resolveSearchLocations`: usuário > `referenceProfile.locations` (`fromReference: true`) > ICP.
  - `buildDirectSearchFilters`: sem `industry` do usuário, `organizationIndustries = referenceProfile.industries`. Um `industry` do usuário que está em `referenceProfile.industries` vai direto em `organizationIndustries`.
  - `canProceedWithSearch` no modo: cargos ≥ 1, `hasEnoughReferences` e perfil confiante que casa com as referências. A localização não é exigida.
- `ApolloService.enrichOrganization(domain)`: `GET /v1/organizations/enrich?domain=` com `x-api-key`. Devolve `ApolloEnrichedOrganization | null` (null quando não há `organization`). O tipo ganha `city`, `state`, `country` e `technology_names` opcionais.
- Rota nova `POST /api/agent/executions/[executionId]/reference-profile` com corpo `{ references: {name, domain}[] }` (3 a 5, domínios validados por `normalizeDomain`):
  - Auth, tenant e posse da execução no padrão do `/parse`. Chave Apollo por `getInjectableServiceApiKey`.
  - Enriquece em paralelo (`Promise.allSettled`). Uma empresa que falha ou não é encontrada entra sem dados.
  - Loga 1 linha `logAgentUsage` (`apollo`, `organization_enrich`, `calls` = N, `estimatedCost` = encontradas × preço Apollo de `resolveUnitPrices`, `executionId`).
  - Responde `{ profile, confident, reason }`. Sem chave ou com Apollo fora → 4xx/5xx com mensagem em português, e o hook trata como não confiante.
- Parser (`briefing-parser-service.ts`): os campos `referenceAccounts` (`sanitizeTargetAccounts`, corte em 5) e `useSuppressionListClients: boolean` entram no schema (fail-open) e no prompt. Regras do prompt:
  - "parecidas com", "como nossos clientes" ou "lookalike" levam a `referenceAccounts`, nunca a `targetAccounts`.
  - "meus clientes da lista" leva a `useSuppressionListClients: true`.
  - "usar o ICP" ou "desisto das referências" levam a `referenceAccounts: null`.
  - A correção mais recente prevalece.
- `/parse`, depois do bloco da 24.17:
  - Com `targetAccounts`, ou no fluxo importado, `referenceAccounts` fica `null`.
  - Com `useSuppressionListClients` e sem referências citadas, lê os 5 `suppression_entries` mais recentes com `reason='cliente'` e `entry_type='domain'` (`src/lib/agent/reference-suppression.ts`, fail-open) e grava `referenceAccountsSource: "suppression_list"`.
  - No modo, garante `search_companies` em `skipSteps`, zera `technology` e usa os cargos do ICP como na 24.17.
  - Anexa `referenceProfile` do corpo da requisição (campo novo opcional, zod) só se `profileMatchesReferences`.
  - Em `missingFields`: `referenceAccounts` quando `!hasEnoughReferences`, ou `referenceProfile` quando há referências suficientes mas não há perfil válido. `location` não entra no modo.
- Hook e card:
  - Status novo `confirming_reference_analysis` e variante de card `"references"`. O card lista as referências, mostra `Custo: ate N creditos de enrichment da Apollo (1 por empresa)` e tem os botões **Analisar** (`analyze_references`) e **Usar o ICP** (`use_icp_instead`).
  - O ramo `!canProceed` mostra esse card quando falta só `referenceProfile` (sem o caso `referenceAccounts`).
  - **Analisar** chama a rota por um callback injetado do `AgentChat`, no molde do `createProduct`. Com perfil confiante, ele é gravado no briefing e o fluxo reavalia: com cargos, o card do briefing; senão, a pergunta de cargos. Sem confiança, o agente envia `reason` + `Me diga mais clientes de referencia (nome e site) ou toque em "Usar o ICP".` e volta a `awaiting_fields`.
  - **Usar o ICP** limpa `referenceAccounts` e `referenceProfile` e reavalia como briefing normal.
  - Em qualquer parse novo, o hook manda o `referenceProfile` atual no corpo.
  - A pergunta determinística de `referenceAccounts` é: `Preciso de 3 a 5 clientes de referencia (nome e site). Voce citou N.` Quando a lista de supressão vem vazia: `Nao encontrei clientes na Lista de Supressao. Me diga 3 a 5 clientes de referencia (nome e site).`
  - O resumo, no modo, mostra `- Clientes de referencia: ...`, `- Perfil comum: setor ..., porte ..., regiao ...; tecnologias em comum: ...` e a linha de etapa `Contas parecidas: vou buscar empresas com esse perfil, sem os seus clientes e os suprimidos.`
  - Os chips Setor, Porte e Local mostram o valor do perfil (rótulo `(dos seus clientes)`) quando o usuário não definiu, e a edição vira valor do usuário.
- Step `search_leads` no modo, no ramo `isDirectEntry`:
  - Antes de `buildSearchOutput`, remove os leads cuja `company_name` casa com uma referência ou com um domínio da lista de supressão (`entry_type='domain'`, qualquer motivo, fail-open). O casamento é por nome normalizado igual, ou nome compacto (sem espaço e sem pontuação) igual ao primeiro rótulo do domínio. Se removeu algum, grava a mensagem `system` `Removi da busca N leads de clientes ou contas suprimidas.`.
  - Depois, cada `fitReason` vira `{similarityReason}; {razão original}`, truncado por `truncateFitReason`.
  - O output ganha `lookalike: { references, similarity, excludedCount }`.
  - A progressão diz `...em empresas parecidas com seus clientes...`.
- Consumidores:
  - Plano (`agent-plan-generator.ts`): `Buscar {cargos} em empresas parecidas com seus clientes ({perfil})`.
  - PATCH `/briefing`: declara os 3 campos (armadilha do strip; listas com teto).
  - `mergeAdjustedBriefing`: a ausência preserva as referências e o perfil.

**Never:**
- Migration, tabela nova, `pg_cron`, Edge Function, secret. Nenhuma mudança em export/ativação do Instantly, webhook ou `reply-sweep`.
- Enriquecer sem o clique em **Analisar**, ou enriquecer mais de 5 empresas.
- Inventar setor, porte ou região pelo LLM. O perfil só vem do enriquecimento.
- Mudar o comportamento sem referências: briefing, resumo, plano, busca e Fit Score idênticos aos de hoje.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Referências | "CISO em empresas parecidas com bancox.com.br, bancoy.com.br, segz.com.br" | 3 refs, `search_companies` pulado, card "Analisar" com "ate 3 creditos" | — |
| Poucas | 2 referências | sem card; pergunta "Preciso de 3 a 5... Voce citou 2." | — |
| Mais de 5 | 7 domínios | só os 5 primeiros | — |
| Lista de supressão | "use meus clientes da lista" | até 5 domínios `cliente`, `source: suppression_list` | tabela ausente/vazia → pergunta "Nao encontrei clientes..." |
| Perfil confiante | 3 bancos, 201–500 e 501–1000, todos SP | industries [banking], sizes [201-500, 501-1000], locations ["Sao Paulo, Brazil"], card do briefing | — |
| Sem dados | 2 de 3 sem organização na Apollo | não confiante; explica quais e pede mais ou ICP | rota com erro → mesma mensagem |
| Setores distintos | 3 setores diferentes | não confiante: "setores nao se repetem" | — |
| Usar o ICP | clique | sem referências, fluxo ICP normal | — |
| Chip editado | Porte "51-200" | busca usa 51-200; similaridade só por setor | — |
| Exclusão | resultado com "Banco X" (ref) e empresa cujo nome compacto = rótulo de domínio suprimido | removidos + mensagem | leitura da supressão falha → só refs removidas |
| Fit | lead nota A | `fitReason` "mesmo setor e porte de Banco X; ..." | — |
| Sem referências | "CISO em SP" | idêntico a hoje | — |

</intent-contract>

## Code Map

- `src/types/agent.ts:113-161` -- `ParsedBriefing` e tipos da 24.17. Os tipos novos ficam ao lado.
- `src/lib/agent/target-accounts.ts` -- reusar `normalizeDomain`, `sanitizeTargetAccounts`, `resolvedAccountDomains` e `isAccountListMode`. Molde do módulo puro novo `reference-accounts.ts`.
- `src/lib/agent/search-defaults.ts:69-83` (porte), `:101-116` (local), `:156-170` (`canProceedWithSearch`) e `:238-266` (`buildDirectSearchFilters`). `APOLLO_COMPANY_SIZE_BUCKETS` fica em `:48`. Atenção ao ciclo de imports: `reference-accounts.ts` não importa `search-defaults` (duplique a lista de faixas, ou mova a constante para um leaf).
- `src/lib/agent/apollo-industries.ts:117` -- `resolveApolloIndustries` (o setor do usuário fora do perfil continua por aqui).
- `src/lib/services/apollo.ts:23-29` (endpoints), `:388-440` (`enrichPerson`, molde do `request`) e `src/types/apollo.ts:329-335` (`ApolloEnrichedOrganization`).
- `src/lib/agent/agent-usage.ts:31` (`logAgentUsage`), `src/lib/agent/agent-pricing.ts:97-125` (preço Apollo e `resolveUnitPrices`) e `CostEstimatorService.getCostModels` (usado em `execution-cost.ts`).
- `src/lib/agent/service-keys.ts` -- `getInjectableServiceApiKey(tenantId, "apollo", "Apollo")`, como no `search-leads-step.ts:206`.
- `src/app/api/agent/briefing/parse/route.ts:55-127` (resposta e completude), `:140-200` (schema do corpo), `:316-362` (ICP + bloco da 24.17, onde o bloco novo entra depois). O padrão de auth e posse da execução fica em `:160-230`, e é o molde da rota nova.
- `src/actions/suppression.ts` e `src/types/suppression.ts` (23.5) -- nomes de coluna da `suppression_entries` (`entry_type`, `value`, `reason`). A migration 00071 pode não estar aplicada, então toda leitura é fail-open.
- `src/lib/agent/briefing-parser-service.ts:72-185` -- schema e prompt (molde: `targetAccounts`, linhas 115/149/153).
- `src/lib/agent/steps/search-leads-step.ts:225-243` (ramo `isDirectEntry`), `:367-470` (`buildSearchOutput`) e `src/lib/agent/fit-score-rules.ts` (`truncateFitReason`).
- `src/lib/services/agent-plan-generator.ts:47-76` -- descrição do `search_leads`.
- `src/app/api/agent/executions/[executionId]/briefing/route.ts:~97` -- schema do PATCH.
- `src/lib/agent/briefing-adjustment.ts:139-170` -- `mergeAdjustedBriefing`.
- `src/hooks/use-briefing-flow.ts`:
  - status `:42-53` e resumo `:211-330`;
  - `QUESTIONABLE_FIELDS` `:170` e perguntas `:120-207`;
  - card `:737-908` (`BriefingCardAction`, `CARD_ACTION_LABELS`, `CARD_ACTION_STATUS`, campos e formatação);
  - `callParseAPI` `:1025`;
  - `handleParseResult` `:1079-1318` (ramo `!canProceed` `:1204-1246`);
  - `processCardAction` `:1885-2006` (molde: `confirm_product` `:1942-1960`);
  - `editBriefingField` `:2008-2073`.
- `src/components/agent/AgentConfirmationCard.tsx:29-60,184-225` -- variante, ordem dos chips e botões.
- `src/components/agent/AgentChat.tsx:362` (callback `createProduct`, molde do `analyzeReferences`), `:971-1006` (`handleCardAction`) e `:1230-1311` (qual card renderizar).
- Testes: `__tests__/unit/lib/agent/reference-accounts.test.ts` (novo), `search-defaults.test.ts`, `steps/search-leads-step.test.ts`, `briefing-adjustment.test.ts`, `__tests__/unit/lib/services/agent-plan-generator.test.ts`, `apollo` service test, `__tests__/unit/api/agent/{briefing-parse,briefing-update}.test.ts`, um teste novo da rota `reference-profile`, `__tests__/unit/hooks/use-briefing-flow.test.tsx` e `__tests__/unit/components/agent/AgentConfirmationCard.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/agent.ts`, `src/types/apollo.ts`, `src/lib/agent/reference-accounts.ts` -- tipos e helpers puros (modo, perfil, similaridade) -- AC1/AC2/AC3.
- [x] `src/lib/agent/search-defaults.ts` -- porte, local, indústria e `canProceed` vindos do perfil -- AC2.
- [x] `src/lib/services/apollo.ts`, `src/lib/agent/reference-suppression.ts`, `src/app/api/agent/executions/[executionId]/reference-profile/route.ts` -- enriquecimento logado, leitura fail-open da supressão e a rota -- AC1/AC3.
- [x] `briefing-parser-service.ts`, `parse/route.ts`, `briefing/route.ts` (PATCH), `briefing-adjustment.ts` -- extração, canonicalização e persistência -- AC1/AC3.
- [x] `search-leads-step.ts`, `agent-plan-generator.ts` -- exclusão, similaridade no Fit Score e plano -- AC2.
- [x] `use-briefing-flow.ts`, `AgentConfirmationCard.tsx`, `AgentChat.tsx` -- card de análise com custo, resumo do perfil, chips, perguntas e "Usar o ICP" -- AC1/AC3.
- [x] Testes: uma linha por cenário da matriz. Os testes existentes continuam verdes.

**Acceptance Criteria:**
- Given a conversa, when o usuário informa 3–5 clientes de referência (ou pede os clientes da Lista de Supressão) e clica em Analisar no card de custo, then o agente enriquece as empresas na Apollo e mostra no card do briefing o perfil comum (setor, porte, região e tecnologias), com Setor, Porte e Local editáveis.
- Given o perfil aprovado, when a busca roda, then a Apollo recebe os setores, faixas e região do perfil (ou os valores editados), os clientes e os domínios suprimidos saem do resultado, os já contatados seguem a triagem da 24.15, e a justificativa do Fit Score cita a semelhança.
- Given menos de 3 referências, ou referências sem dados suficientes, when o perfil não pode ser derivado com confiança, then o agente explica o motivo e pede mais referências ou oferece "Usar o ICP", sem buscar.
- Given um briefing sem referências, when qualquer fluxo roda, then o comportamento é idêntico ao de hoje.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 41 findings — high 0, medium 7, low 33, false 1, maybe-false 0
- findings:
  - `low` `patch` [blind] `activeReferenceProfile` re-derivava só o `confident` e devolvia os filtros vindos do cliente — corrigido: devolve o perfil re-derivado das empresas; teste com setores forjados.
  - `low` `reject` [blind] Servidor aceita perfil escrito pelo cliente (sem persistir o derivado) — com o patch acima os filtros saem das empresas; o usuário já pode editar setor/porte/local nos chips, então não há fronteira a proteger; persistir exige armazenamento novo.
  - `low` `reject` [blind] Frase de semelhança igual para todos os leads ("mesmo porte de X" com lead em faixa vizinha) — por desenho (Design Notes: a `api_search` não dá porte/setor por lead); a frase e a regra estão fixadas na spec, e a correção seria editar a spec.
  - `low` `reject` [blind] Faixa de porte engole outliers (11–50 a 10001+) — o card mostra a faixa e ela é editável; tratar outlier exige regra nova.
  - `medium` `patch` [blind] Rótulo de domínio com hífen/subdomínio não casa na exclusão — corrigido junto com o achado de sufixo societário (rótulo compactado); subdomínio rejeitado no item edge correspondente.
  - `low` `reject` [blind] Leads excluídos não são repostos (menos que N) — exclusão só ocorre quando clientes aparecem no resultado; o aviso "Removi da busca N leads" informa; repor exige nova busca.
  - `low` `reject` [blind] Análise sem confiança pode ser paga de novo — cada nova análise exige outro clique no card com o custo visível; cache por domínio é complexidade nova.
  - `low` `reject` [blind] "Usar o ICP" no ajuste pós-rejeição não sai do modo — a forma do pipeline fica fixa após o confirm (regra da 22.13, igual à decisão da 24.17).
  - `low` `reject` [blind] Referências da Lista de Supressão dependem do LLM repetir o flag — todo campo do briefing é re-extraído do histórico a cada turno; o card mostra os clientes antes de qualquer gasto.
  - `low` `patch` [blind] Pergunta dizia "Voce citou N" com referências vindas da lista — corrigido: "Encontrei N na Lista de Supressao."; corte acima de 5 e "5 mais recentes" rejeitados (matriz e spec definem).
  - `low` `patch` [blind] Rota repassava 401/403 da Apollo como 401 próprio — corrigido: 401/403 → 422 `APOLLO_KEY_INVALID`, demais → 502; testes.
  - `low` `reject` [blind] Sem botão "Usar o ICP" após perfil sem confiança — o parser trata "usar o ICP" digitado; o texto da mensagem está fixado na spec (correção seria editar a spec). Registrado nos riscos.
  - `medium` `patch` [blind] "Buscar mais" não reaplica a exclusão — corrigido: `fetch-leads` filtra clientes e domínios suprimidos quando o output tem `lookalike`; testes.
  - `low` `reject` [blind] Completion Notes sem smoke real — a correção é processo/spec; registrado nos riscos residuais com o smoke recomendado.
  - `low` `reject` [blind] Faltam testes dos caminhos de risco — os itens corrigidos ganharam testes; os demais foram rejeitados acima.
  - `low` `patch` [edge] Uma única empresa com local definia a região — corrigido: exige 2+ empresas com local; teste.
  - `medium` `patch` [edge] Sufixo societário (S.A., Ltda) e hífen deixavam clientes passarem — corrigido: sufixos removidos e rótulo compactado; testes.
  - `low` `reject` [edge] Rótulo genérico de subdomínio (br.x.com) — raro em domínios de referência normalizados; resolver exige lista de sufixos públicos.
  - `low` `reject` [edge] LLM preencher contas-alvo e referências ao mesmo tempo — exige o LLM violar regra explícita do prompt; o card mostra o chip Contas antes do gasto.
  - `low` `patch` [edge] Domínio deduzido ("low") sem marca antes da análise paga — corrigido: "— confirme" no resumo e no card; testes.
  - `medium` `patch` [edge] Diagnóstico de busca vazia ignorava o perfil — corrigido: ramo `reference` no Tamanho, setores do perfil na Indústria e causa `reference_profile_applied`; teste.
  - `low` `reject` [edge] Todos os leads excluídos viram busca vazia — a mensagem "Removi da busca N leads de clientes..." é gravada antes; comportamento honesto.
  - `low` `reject` [edge] Menos que N após exclusão — mesmo grupo do achado blind.
  - `low` `patch` [edge] Resumo dizia "regiao qualquer" enquanto o ICP filtrava — corrigido: parte da região omitida sem locais no perfil.
  - `low` `reject` [edge] "Usar o ICP" não restaura tecnologia zerada — raro (tecnologia + referências no mesmo pedido); o card mostra os chips antes do confirm e o próximo parse re-extrai.
  - `low` `reject` [edge] Sem botão "Usar o ICP" — mesmo grupo do achado blind.
  - `false` `reject` [edge] Duplicatas entre os 5 clientes mais recentes — a 23.5 normaliza no servidor e tem UNIQUE `(tenant_id, entry_type, value)`; duplicata é impossível.
  - `low` `reject` [edge] Mais de 10 mil domínios suprimidos truncados — volume irreal para o tenant.
  - `low` `reject` [edge] Referências da lista somem se o LLM não repetir o flag — mesmo grupo do achado blind.
  - `low` `patch` [edge] Claim: perfil "nunca confia no que veio pronto" — mesmo grupo do patch de `activeReferenceProfile` (corrigido).
  - `low` `patch` [edge] Comentário de `QUESTIONABLE_FIELDS` citava "mais de 5" — corrigido.
  - `low` `patch` [verification-gap] Glue `analyzeReferences` e o card "references" no AgentChat sem teste — testes adicionados (fetch, 200, 422 → reason, render do card).
  - `medium` `patch` [verification-gap] Diagnóstico sem a fonte `reference` — mesmo grupo do patch edge (corrigido + teste).
  - `medium` `patch` [verification-gap] "Buscar mais" sem exclusão (disposição sugerida: defer) — corrigido nesta story por ser pequeno e atingir o AC2; testes.
  - `medium` `patch` [verification-gap] (other) Diagnóstico culpa os cargos no modo — mesmo grupo (corrigido).
  - `low` `reject` [intent] Já contatados marcados, não excluídos — o épico manda aplicar "conforme a regra já existente" (24.15: marca, tira da pré-seleção e do autopilot) enquanto a 23.6/23.7 estão em espera.
  - `low` `reject` [intent] Sem seletor de clientes da Lista de Supressão — o pedido por texto pega os 5 mais recentes e o card mostra quais; seletor é UI nova.
  - `low` `reject` [intent] Tecnologias não editáveis — são só informativas (não filtram a busca); editar não mudaria nada.
  - `low` `reject` [intent] Semelhança em nível de filtro, não por lead — mesmo grupo do achado blind.
  - `low` `reject` [intent] Apollo real, prompt real e smoke não exercitados — registrado nos riscos residuais.
  - `low` `patch` [intent] Chat não testa o card nem a chamada da rota — mesmo grupo do patch verification-gap (corrigido).

### 2026-10-26 — Review pass (follow-up)
- verdicts: 41 findings — high 0, medium 0, low 38, false 3, maybe-false 0
- findings:
  - `low` `reject` [blind] Frase de semelhança igual para todos os leads, sem comparar o lead — carried: por desenho (Design Notes), a `api_search` não dá setor/porte por lead; a frase está fixada na spec.
  - `false` `reject` [blind] Duplo clique em "Analisar" gasta créditos duas vezes — o `AgentChat.handleCardAction` sai cedo com `isAgentProcessing` e o card recebe `disabled={isAgentProcessing}`; o clique é evento discreto (flush síncrono no React 18), então o segundo clique já encontra o botão desabilitado.
  - `low` `reject` [blind] Análise sem confiança é paga de novo ao repetir os clientes — carried: cada análise exige outro clique com o custo visível; cache por domínio é complexidade nova.
  - `low` `reject` [blind] Mensagem de retry aponta para o botão "Usar o ICP" que sumiu — carried: o parser trata "usar o ICP" digitado; o texto está fixado na spec.
  - `low` `reject` [blind] "Usar o ICP" não fica escolhido: o próximo /parse relê "parecidas com..." do histórico — o clique entra no histórico como turno "Usar o ICP" e a regra 11 do prompt manda `referenceAccounts: null`; todo campo é re-extraído do histórico por desenho (mesmo motivo do item carried da Lista de Supressão); flag dedicada é estado novo.
  - `low` `reject` [blind] Clientes da Lista não combinam com os citados; lista relida a cada parse invalida o perfil pago — carried: mesmo grupo "dependem do LLM repetir o flag"; o card mostra os clientes antes do gasto.
  - `low` `reject` [blind] Trocar referências no ajuste (pós-rejeição) é ignorado sem aviso — a forma do pipeline fica fixa após o confirm (22.13, igual à decisão carried de "Usar o ICP no ajuste"); reabrir a análise paga no ajuste exige fluxo novo.
  - `low` `reject` [blind] Faixa de porte sem tratamento de outlier — carried: o card mostra a faixa e ela é editável.
  - `low` `reject` [blind] Regra de estado aceita 2 de 5 empresas com local — é a regra da spec ("todas as empresas com local têm o mesmo estado", com o piso de 2 do patch anterior); mudar exige editar a spec.
  - `low` `patch` [blind] `similarityReason` lia `briefing.referenceProfile` cru em vez do perfil re-derivado (parte "companies forjadas" é carried reject) — corrigido: `similarityReason` usa `activeReferenceProfile(briefing)`; teste novo com setores/faixas forjados (falha sem o patch, conferido).
  - `low` `reject` [blind] Exclusão fraca (nome ≠ rótulo do domínio; sufixo `me` corta "Take Me") — carried: heurística por nome (Design Notes); o `me` (microempresa) é sufixo real e o falso positivo exige outro cliente normalizado igual, raro.
  - `low` `reject` [blind] Falha parcial da Apollo (429/timeout) vira "não encontrei dados" — real, mas 3–5 chamadas paralelas raramente batem rate limit e separar rejeitados de não encontrados exige ramo e mensagem novos.
  - `low` `reject` [blind] Custo da análise não aparece depois; preço usa o unitário Apollo; rota aceita execução em qualquer status — o card mostra "ate N creditos" antes do clique; `resolveUnitPrices(...).apollo` é o preço que a spec define; status por execução é guarda nova.
  - `low` `reject` [blind] LLM mistura os modos e a lista prevalece — carried: exige o LLM violar regra explícita; o chip Contas aparece antes do gasto.
  - `low` `reject` [blind] Exclusão por domínio para em 10 mil entradas sem aviso — carried: volume irreal para o tenant.
  - `low` `reject` [blind] Faltam testes de duplo clique, troca no ajuste, mistura com a lista, perfil velho, 429 e outlier — os caminhos correspondentes foram rejeitados acima (duplo clique é falso); os testes que importavam entraram pelos patches do verification-gap.
  - `low` `reject` [edge] Retry sem o botão "Usar o ICP" — carried (mesmo grupo).
  - `low` `reject` [edge] Todos os leads excluídos viram busca vazia — carried: a mensagem "Removi da busca N leads..." é gravada antes.
  - `low` `reject` [edge] Menos que N leads após a exclusão — carried.
  - `low` `reject` [edge] "Buscar mais" devolve menos que o pedido após a exclusão — carried (mesmo grupo).
  - `low` `reject` [edge] Rótulo curto/genérico do domínio (br.x.com, grupo.com.br) — carried.
  - `low` `reject` [edge] Faixa de porte com referências distantes — carried.
  - `low` `reject` [edge] Rejeições parciais da Apollo relatadas como falta de dados — mesmo grupo do achado blind (rejeitado).
  - `low` `reject` [edge] Clientes acima de 5 cortados sem aviso — carried: a matriz define "só os 5 primeiros".
  - `false` `reject` [edge] Duplicatas/inválidos entre os 5 clientes mais recentes — carried: a 23.5 normaliza no servidor e tem UNIQUE `(tenant_id, entry_type, value)`.
  - `low` `reject` [edge] Mais de 10 mil domínios suprimidos — carried.
  - `low` `reject` [edge] Troca de referências ou "usar o ICP" no ajuste ignorada — mesmo grupo do achado blind (rejeitado).
  - `low` `reject` [edge] Perfil confiante sem região cai no local do ICP — é a ordem da spec (`usuário > referenceProfile.locations > ICP`); o resumo já omite a região do perfil nesse caso (patch anterior).
  - `low` `reject` [edge] Rota enriquece domínios postados sem conferir as referências do briefing — exige chamar a API fora da UI, com sessão do próprio tenant e créditos da própria chave (BYOK); conferir o briefing é guarda nova.
  - `low` `reject` [edge] Claim: clientes com nome diferente do domínio continuam no resultado — carried: heurística por nome (Design Notes).
  - `low` `reject` [edge] Claim: "Usar o ICP" só por texto após perfil sem confiança — carried.
  - `low` `patch` [verification-gap] `buildAdjustmentSummary` sem teste das linhas do modo — teste novo em `briefing-adjustment.test.ts` (referências, Localização/Tamanho/Indústria "(dos seus clientes)").
  - `low` `patch` [verification-gap] Texto digitado com o card "Analisar" aberto sem teste — 2 testes novos em `use-briefing-flow.test.tsx` (vai para o /parse; parse falho volta a `confirming_reference_analysis`).
  - `low` `patch` [verification-gap] Setor do usuário fora do perfil com asserção fraca — `search-defaults.test.ts` agora exige `["retail"]`.
  - `low` `patch` [verification-gap] Duplicatas após normalizar na rota sem teste — teste novo em `reference-profile.test.ts` (400, sem enrich e sem log).
  - `low` `patch` [intent] Uma empresa com local não define região (diverge da leitura literal) — carried: é o patch da passada anterior; não repatchado.
  - `low` `patch` [intent] `similarityReason` lê o perfil cru — mesmo grupo do patch blind (corrigido).
  - `low` `reject` [intent] Ajuste não troca as referências — mesmo grupo do achado blind (rejeitado).
  - `low` `reject` [intent] Apollo real, parser real e chat integrado não exercitados — carried: registrado nos riscos residuais.
  - `low` `reject` [intent] Sair do modo depois de "Usar o ICP" depende do modelo — mesmo grupo do achado blind (rejeitado).
  - `false` `reject` [intent] Diff sem o registro dos 3 pontos de produção — o registro está nas Completion Notes da spec, que ficou fora do diff entregue às camadas de propósito.

## Design Notes

- **Por que a Apollo Organization Enrichment:** a `api_search` não devolve setor, porte nem local da empresa (só flags `has_*`). O enrichment de organização é a única fonte já integrada (chave BYOK por tenant) com esses dados. Ele custa 1 crédito por empresa, então passa pelo card com custo e pelo clique (NFR). O custo fica em `api_usage_logs`, com `executionId`, e não entra no `cost_actual`, que é calculado só a partir dos steps.
- **Exclusão por nome:** a `api_search` não devolve o domínio da empresa do lead, só o nome da organização. Por isso clientes e domínios suprimidos são casados pelo nome (igual, ou nome compacto = rótulo do domínio). É uma heurística e pode deixar passar uma empresa com nome muito diferente do domínio. O gate de revisão segue como rede.
- **Similaridade honesta:** a busca filtra por setor, porte e região do perfil, então todo lead devolvido compartilha esses atributos por construção. A frase reflete os filtros efetivos (um chip editado tira o atributo da frase).
- **Lista de supressão (23.5):** a migration 00071 pode não estar aplicada em produção. Toda leitura falha aberta: nada suprimido e lista de clientes vazia.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/lib/services __tests__/unit/api/agent __tests__/unit/hooks __tests__/unit/components/agent` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Os 3 pontos do cliente, por análise do diff: busca sem referências inalterada, export e ativação não tocados, nada em webhook nem `reply-sweep`.

## Completion Notes

- **O que pode mudar para o cliente:** rota nova `POST /api/agent/executions/[executionId]/reference-profile` (Apollo Organization Enrichment, 1 crédito por empresa encontrada, só pelo clique em **Analisar**, logada em `api_usage_logs` como `organization_enrich`); prompt do parser do briefing (`briefing-parser-service.ts`: campos `referenceAccounts` e `useSuppressionListClients` + regra 11); `/parse` (bloco novo depois da 24.17, lê `suppression_entries` fail-open só com o pedido "clientes da lista"); PATCH `/briefing` (3 campos declarados); `search-leads-step.ts` (ramo direto, só no modo); plano; hook/card/chat. Nenhuma tabela, migration, `pg_cron`, Edge Function ou secret.
- **3 pontos — por análise do diff (sem smoke real):**
  1. Campanhas rodando, webhook e `reply-sweep`: não tocados (nenhum arquivo de Instantly, webhook ou sweep no diff).
  2. Busca de novos leads: sem referências o código é idêntico (as chaves novas não entram no briefing, `isLookalikeMode` é falso e todos os resolvedores caem nos ramos de antes; testes "sem referências: idêntico" em parse, search-defaults e step). Risco residual: o prompt do parser ganhou texto novo, o que pode mudar de leve a extração do LLM em briefings comuns.
  3. Criação de campanha e export/ativação: não tocados.
- **Verificação:** `npm run typecheck`, `npm run lint` (0 erros) e `npm run test:run` (456 arquivos, 8836 testes) verdes.
- **Revisão:** perfil sempre re-derivado das empresas; exclusão com rótulo compacto e sem sufixos societários; região exige 2+ empresas com local; marca "— confirme" nas referências deduzidas; 401/403 da Apollo viram 422 `APOLLO_KEY_INVALID`; diagnóstico de busca vazia cita o perfil; o "Buscar mais" (`fetch-leads`) reaplica a exclusão dos clientes/suprimidos (toca a rota de busca, só quando o output tem `lookalike`).
- **Pendências/riscos:** a exclusão é heurística por nome (Design Notes). Depois de um perfil sem confiança o card some (status `awaiting_fields`); "Usar o ICP" passa a ser por texto, tratado pelo parser.



## Auto Run Result

Status: done

**Resumo:** o agente tem o modo **contas parecidas com os melhores clientes**. O usuário cita 3 a 5 clientes de referência (ou pede os clientes da Lista de Supressão). O agente mostra um card com o custo e só enriquece na Apollo depois do clique em **Analisar**. O perfil comum (setor, porte, região e tecnologias) é derivado de forma determinística, os chips Indústria, Tamanho e Localização mostram esse perfil e são editáveis, a busca direta usa o perfil, clientes e domínios suprimidos saem do resultado (também no "Buscar mais"), e o Fit Score cita a semelhança. Sem referências, nada muda. Esta passada é a revisão de follow-up da story já entregue.

**Arquivos alterados nesta passada:**
- `src/lib/agent/reference-accounts.ts` — `similarityReason` passa a ler o perfil re-derivado (`activeReferenceProfile`), igual aos demais consumidores.
- `__tests__/unit/lib/agent/reference-accounts.test.ts` — teste da frase com setores/faixas forjados.
- `__tests__/unit/lib/agent/briefing-adjustment.test.ts` — teste do resumo do ajuste no modo ("(dos seus clientes)").
- `__tests__/unit/lib/agent/search-defaults.test.ts` — asserção exata (`["retail"]`) para setor fora do perfil.
- `__tests__/unit/api/agent/reference-profile.test.ts` — 3 referências que viram 2 domínios: 400, sem enrich e sem log.
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — texto digitado com o card "Analisar" aberto (vai ao /parse; falha volta ao card).

Arquivos da entrega original (inalterados nesta passada): ver Code Map e Completion Notes.

**Revisão (follow-up):** 41 achados — high 0, medium 0, low 38, false 3, maybe-false 0.
- Patches: 5 entradas, todas `low` (1 de código: `similarityReason`; 4 de teste do verification-gap). Duas linhas são do mesmo grupo do patch de código e uma é o patch carried da passada anterior (não repatchado).
- Deferidos: 0.
- Rejeitados: 33 `low` e 3 `false`. Cada um tem o motivo no Review Triage Log. Os principais: frase de semelhança por filtro (por desenho), "Usar o ICP" só digitado após perfil sem confiança (texto fixado na spec), exclusão heurística por nome (Design Notes), falha parcial 429 relatada como falta de dados (rara, exige ramo novo), troca de referências no ajuste (forma do pipeline fixa após o confirm), duplo clique em Analisar (falso: botão desabilitado por `isAgentProcessing`).

**Follow-up review recomendado:** false. É uma passada de follow-up e nenhum patch foi `high` (patched: high 0, medium 0, low 5). O trabalho convergiu.

**Verificação:** testes dos arquivos tocados verdes (6 arquivos, 431 testes); o teste novo de `similarityReason` falha sem o patch (conferido revertendo e reaplicando). `npm run lint` 0 erros (134 warnings já existentes), `npm run typecheck` ok, `npm run test:run` 456 arquivos e 8854 testes verdes (2 skipped).

**3 pontos do cliente (por análise do diff desta passada):** a única mudança de código é a frase do Fit Score no modo contas parecidas (só roda com referências e perfil ativo). Campanhas rodando, webhook e `reply-sweep`, busca de leads sem referências e export/ativação no Instantly: não tocados.

**Riscos residuais:**
- Sem smoke real. Recomendado: no agente, pedir "CISO em empresas parecidas com <3 clientes reais>", conferir o card com o custo, clicar Analisar (gasta até 5 créditos Apollo), conferir perfil e plano e parar antes de qualquer gasto de campanha ou ativação. Também o smoke comum ("CISO de São Paulo", 2 leads).
- Nomes dos campos da resposta de enrichment da Apollo (`technology_names`, `city`, `state`, `country`) não conferidos contra uma resposta real.
- O prompt do parser mudou para todas as conversas.
- Exclusão heurística por nome; a frase de semelhança é por filtro, não por lead.
- Falha parcial da Apollo (429) aparece como "não encontrei dados".
- Depois de um perfil sem confiança, "Usar o ICP" só funciona digitado; sair do modo depende do parser respeitar a regra 11.
- O custo do enrichment fica em `api_usage_logs`, fora do `cost_actual`.
