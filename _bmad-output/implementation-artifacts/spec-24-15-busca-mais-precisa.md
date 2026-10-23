---
title: '24.15 — Busca mais precisa'
type: 'feature'
created: '2026-10-22'
status: done
baseline_revision: '447d65268516d18858a2736ae939c0013ae76714'
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

**Problem:** A busca de leads do agente na Apollo filtra pela localização da **pessoa** (`person_locations`), manda `include_similar_titles=true` sempre e joga a indústria como texto livre em `q_keywords`. Resultado: gente que mora em SP mas trabalha em empresa de fora, cargos "parecidos" que não são o pedido, indústria que zera a busca. Prefeituras e órgãos públicos chegam na revisão, e lead já contatado ou que pediu para sair aparece de novo.

**Approach:** Só na busca **do agente** (o `ApolloService` ganha campos opcionais e a busca manual não muda): (1) local vai em `organization_locations` (sede da empresa) por padrão, com `locationScope: "person"` como opção pedida na conversa; (2) cargo exato primeiro (`include_similar_titles=false`), ampliando uma vez para cargos parecidos quando o resultado não chega a N; (3) indústria mapeada para `organization_industries[]` da Apollo quando houver correspondência, senão o `q_keywords` de hoje; (4) uma triagem dos resultados (step e "Buscar mais") que remove suprimidos, sinaliza "Já contatado" e marca órgãos públicos, que ficam ocultos e fora da pré-seleção, com opção de incluir na revisão.

## Boundaries & Constraints

**Always:**
- `ApolloSearchFilters` (`src/types/apollo.ts`) ganha opcionais `organizationLocations?: string[]`, `includeSimilarTitles?: boolean` e `organizationIndustries?: string[]`. Em `ApolloService.buildQueryString`: `organization_locations[]` quando houver; `include_similar_titles` = `String(filters.includeSimilarTitles ?? true)` quando há cargos (o default `true` mantém a busca manual idêntica); `organization_industries[]` quando houver, e nesse caso `industries` **não** entra no `q_keywords`. `transformFiltersToApollo`/`ApolloAPIFilters` espelham os 3 campos.
- `ParsedBriefing.locationScope?: "company" | "person" | null`. Ausente/null = `"company"`. Parser: campo novo no schema (`z.enum(["company","person"]).nullable().catch(null)`, repassado no objeto de saída — armadilha do strip) e no prompt: `"person"` só quando o usuário pede explicitamente onde a **pessoa** está ("que morem em", "baseados em", "pela localizacao da pessoa"); `"company"` quando pede a sede da empresa; senão `null`. PATCH `/briefing` declara o campo (enum nullable optional); `mergeAdjustedBriefing`: valor do parse vence, ausência preserva.
- `search-defaults.ts` (SSOT): `resolveLocationScope(b)` → `"company" | "person"`. `buildDirectSearchFilters` passa a devolver `includeSimilarTitles: false`, o local em `organizationLocations` (scope company) ou `locations` (scope person), e a indústria em `organizationIndustries` quando `resolveApolloIndustries(briefing.industry)` casa, senão `industries: [industry]` como hoje. O ramo por domínios do step usa a mesma regra de local e `includeSimilarTitles: false`. `buildAccountSearchFilters` (modo lista) ganha só `includeSimilarTitles: false`; local continua em `locations` (pessoa), como na 24.17.
- `src/lib/agent/apollo-industries.ts` (novo, puro): `resolveApolloIndustries(industry)` normaliza (NFD, minúsculas, trim) e casa por chave/alias com nomes da Apollo em minúsculas (ex.: fintech/financeiro → `["financial services","banking"]`; banco/bancario → `["banking"]`; saude/hospitalar → `["hospital & health care"]`; varejo → `["retail"]`; educacao → `["education management","higher education","e-learning"]`; logistica/transporte → `["logistics & supply chain","transportation/trucking/railroad"]`; agro → `["farming"]`; energia → `["oil & energy","renewables & environment","utilities"]`; telecom → `["telecommunications"]`; seguros → `["insurance"]`; tecnologia/ti/software/saas → `["information technology & services","computer software"]`; farmaceutica → `["pharmaceuticals"]`; construcao → `["construction"]`; imobiliario → `["real estate"]`; alimentos → `["food & beverages","food production"]`; automotivo → `["automotive"]`; mineracao → `["mining & metals"]`; juridico/advocacia → `["law practice","legal services"]`; consultoria → `["management consulting"]`; marketing/publicidade → `["marketing & advertising"]`; hotelaria/turismo → `["hospitality","leisure, travel & tourism"]`; quimica → `["chemicals"]`). Sem correspondência → `null`.
- Cargo exato com ampliação (step, nos 3 ramos): busca com `includeSimilarTitles: false`; se voltar menos leads que `resolveLeadCount(b)` (ou 0 quando não há N), refaz **uma** vez com `true`, loga as duas chamadas (`searchPeopleLogged`), grava `similarTitlesFallback: true` no output, guarda em `searchFilters` os filtros efetivos (os da 2ª chamada, para o "Buscar mais" seguir igual) e insere a mensagem `system` `Poucos resultados com o cargo exato; ampliei para cargos parecidos.`. Se a ampliação também vier vazia, segue o caminho de busca vazia de hoje com os filtros efetivos.
- `src/lib/agent/lead-screening.ts` (novo):
  - Puro: `isPublicSectorOrganization(companyName)` — nome normalizado contém termo de órgão público: prefeitura, camara municipal, camara dos deputados, assembleia legislativa, governo do/de/da, secretaria municipal/estadual/de estado, ministerio, autarquia, tribunal, poder judiciario, ministerio publico, defensoria publica, senado federal, municipio de, "detran". `null`/vazio → `false`.
  - Servidor: `findContactedLeads(supabase, tenantId, apolloIds)` → `Map<apolloId, "suppressed" | "already_contacted">`. Regra existente: lê `leads` (`id, apollo_id, status`) do tenant pelos `apollo_id`; `nao_interessado` → suprimido; `em_campanha`/`interessado`/`oportunidade` → já contatado. Lead com oportunidade em `SUPPRESSING_OPPORTUNITY_STATUSES` (24.17, `contacted`/`meeting_booked`, via `opportunities.lead_id`) → suprimido. Erro de leitura → `console.warn` e mapa vazio (fail-open).
  - `screenLeads(leads, contactMap)` → `{ leads, suppressedCount }`: remove os suprimidos e anota cada restante com `publicSector?: true` e `contactStatus?: "already_contacted"`. `isReviewEligible(lead)` = sem `publicSector` e sem `contactStatus`.
- Step: triagem logo após a busca (antes do Fit Score), em todos os ramos. Output ganha `screening: { suppressed, publicSector, alreadyContacted }`. Com `suppressed > 0`, mensagem `system` `Removi N lead(s) suprimido(s) (pediram para sair ou estao em negociacao).`. Lista vazia depois da triagem → caminho de busca vazia de hoje. Ordem: Fit Score (A→B→C) entre os elegíveis, depois os já contatados, depois os públicos. No autopilot (sem gate), o output leva só elegíveis (cortados em N) e, se nenhum sobrar, lança `EMPTY_LEAD_SEARCH_MESSAGE`.
- `fetch-leads`: aplica a mesma triagem nos leads paginados, antes do dedupe/corte, e devolve/grava `screening` atualizado.
- `AgentLeadReview`: badge "Já contatado" (`data-testid="lead-already-contacted"`) e "Órgão público". Órgãos públicos ocultos por padrão, com o botão `Incluir N de orgaos publicos` / `Ocultar orgaos publicos` (`data-testid="toggle-public-sector"`) que só aparece com `publicSector > 0`. Pré-seleção (inicial, após "Buscar mais" e "Selecionar Q") pega os N primeiros **elegíveis**; sem N, todos os elegíveis. Com `screening.suppressed > 0`, linha `N lead(s) suprimido(s) removido(s) da lista.`.
- Resumo do briefing (`use-briefing-flow.ts`): com `locationScope === "person"`, a linha de local ganha ` (onde a pessoa esta)`; o padrão (empresa) não muda o texto de hoje. O diagnóstico de busca vazia lê o local de `locations` **ou** `organizationLocations`, e a causa `industry_textual` só aparece quando a indústria foi como texto (`filters.industries`), não com `organizationIndustries`.

**Never:**
- Mudar a busca manual (`/api/integrations/apollo`, `/api/ai/search`), o `ApolloService` sem os campos novos, export/ativação do Instantly, webhook ou `reply-sweep`.
- Migration, `pg_cron`, Edge Function, secret, tabela de supressão (é a 23.5), chamada paga nova (a busca de pessoas não consome crédito; a ampliação é 1 chamada de busca a mais).
- IDs de tag de indústria inventados (`organization_industry_tag_ids`): só nomes de `organization_industries`.
- Aplicar `organization_locations` no modo lista (24.17) ou mudar a busca de empresas (TheirStack).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local da empresa | "CISO em SP" | `organization_locations[]=SP`, sem `person_locations`, `include_similar_titles=false` | — |
| Local da pessoa | "CISO que more em SP" | `locationScope: "person"`, `person_locations[]=SP`, resumo "(onde a pessoa esta)" | — |
| Busca manual | filtros sem campos novos | query idêntica à de hoje (`include_similar_titles=true`, indústria em `q_keywords`) | — |
| Indústria mapeada | industry "Fintech" | `organization_industries[]=financial services&...=banking`, sem `q_keywords` | — |
| Indústria sem mapa | industry "biotech espacial" | `q_keywords=biotech espacial` como hoje | — |
| Ampliação | N=5, exato devolve 2 | 2ª busca com `true`, `similarTitlesFallback`, mensagem, `searchFilters` efetivos | 2ª vazia → busca vazia de hoje |
| Sem ampliação | N=5, exato devolve 10 | 1 chamada só | — |
| Órgão público | "Prefeitura de Campinas" | `publicSector: true`, oculto e fora da pré-seleção, toggle inclui | — |
| Suprimido | lead `nao_interessado` ou oportunidade `meeting_booked` | removido, `screening.suppressed`, mensagem | leitura falha → nada removido |
| Já contatado | lead `em_campanha` | badge "Já contatado", fora da pré-seleção, depois dos elegíveis | — |
| Autopilot | 3 elegíveis + 2 públicos, N=10 | output com os 3 elegíveis | 0 elegíveis → `EMPTY_LEAD_SEARCH_MESSAGE` |
| Buscar mais | fetch-leads | mesma triagem e `screening` atualizado | — |
| Modo lista | contas + "SP" | `person_locations` como hoje, `include_similar_titles=false` + ampliação | — |

</intent-contract>

## Code Map

- `src/types/apollo.ts:21-52,141-174` -- `ApolloSearchFilters`, `ApolloAPIFilters`, `transformFiltersToApollo` (`include_similar_titles` fixo em :155).
- `src/lib/services/apollo.ts:301-354` -- `buildQueryString`: `include_similar_titles` fixo (:320), `person_locations` (:324), indústria em `q_keywords` (:339-349).
- `src/lib/agent/search-defaults.ts:194-262` -- `DirectSearchFilters` (type alias, precisa ganhar os campos novos), `buildDirectSearchFilters`, `AccountSearchFilters`/`buildAccountSearchFilters`. `resolveSearchLocations` está acima no mesmo arquivo.
- `src/lib/agent/apollo-industries.ts` (novo) -- mapa; molde de normalização em `briefing-suggestion-service.ts:15-56` (`normalizeKey`, `INDUSTRY_ALIASES`).
- `src/lib/agent/lead-screening.ts` (novo) -- triagem. Molde de leitura fail-open em `src/lib/agent/account-suppression.ts` (reusar `SUPPRESSING_OPPORTUNITY_STATUSES`). Query por `apollo_id` como em `src/app/api/integrations/apollo/route.ts:88-108`.
- `src/lib/agent/steps/search-leads-step.ts` -- ramos: modo lista (:187-203), direto (:205-218), por domínios (:220-258). `searchPeopleLogged` (:265); `buildSearchOutput` (:303-386: empty path, Fit Score por índice em :339-346, corte do autopilot em :353-355). A triagem roda sobre os `LeadRow` (têm `apollo_id`/`company_name`) antes do score; o score continua casando por índice com a lista já triada.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts:154-214` -- paginação + dedupe; aplicar triagem sobre os `LeadRow` antes do `mapLeadRowToSearchLeadResult`; gravar `screening` no output (:222).
- `src/types/agent.ts:285-305` -- `SearchLeadResult` com `publicSector?: boolean` e `contactStatus?: "already_contacted" | null`; `SearchLeadsOutput` com `screening?` e `similarTitlesFallback?`. `ParsedBriefing` (:113-160) com `locationScope`.
- `src/lib/agent/briefing-parser-service.ts:75-115,128,259-291` -- schema, prompt (campo novo junto do `location`), objeto de saída.
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` -- schema do PATCH. `src/lib/agent/briefing-adjustment.ts` -- `mergeAdjustedBriefing`.
- `src/hooks/use-briefing-flow.ts` -- `generateBriefingSummary` (linha de local, ver 24.14 em :192).
- `src/lib/agent/empty-search-diagnosis.ts:309,389-412,450` -- local e causa `industry_textual`.
- `src/components/agent/AgentLeadReview.tsx` -- `LeadPreview` (:31), props `data` (:43), seleção inicial (:117-121), `handleFetchMore` (:181-212), `handleSelectQuantity` (:215), linhas da tabela (~:548). Selecionar por índice sobre `localLeads`; ocultos não podem entrar na seleção.
- `src/app/api/agent/executions/[executionId]/plan/route.ts:83-110` -- viabilidade usa `buildDirectSearchFilters(b, 1)`: passa a contar com cargo exato e sede da empresa (sem ampliação), aceitável.
- Testes: `__tests__/unit/lib/services/apollo*.test.ts` (query string; busca manual inalterada), `__tests__/unit/types/apollo*.test.ts` se existir, `__tests__/unit/lib/agent/search-defaults.test.ts`, `__tests__/unit/lib/agent/apollo-industries.test.ts` (novo), `__tests__/unit/lib/agent/lead-screening.test.ts` (novo), `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` (mockar `lead-screening` server ou o supabase), `__tests__/unit/api/agent/fetch-leads.test.ts`, `__tests__/unit/lib/agent/briefing-parser-service.test.ts`, `__tests__/unit/api/agent/briefing-update.test.ts`, `__tests__/unit/lib/agent/briefing-adjustment.test.ts`, `__tests__/unit/lib/agent/empty-search-diagnosis.test.ts`, `__tests__/unit/hooks/use-briefing-flow.test.tsx`, `__tests__/unit/components/agent/AgentLeadReview.test.tsx`. Expectativas existentes de `buildDirectSearchFilters`/`searchPeople` com `locations` na busca direta mudam de propósito para `organizationLocations` + `includeSimilarTitles: false`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/apollo.ts`, `src/lib/services/apollo.ts` -- campos opcionais e query string com default que preserva a busca manual -- AC1/AC3.
- [x] `src/lib/agent/apollo-industries.ts`, `src/lib/agent/search-defaults.ts` -- mapa de indústria, escopo de local, cargo exato nos filtros do agente -- AC1/AC3.
- [x] `src/types/agent.ts`, `briefing-parser-service.ts`, PATCH `/briefing`, `briefing-adjustment.ts`, `use-briefing-flow.ts` -- `locationScope` ponta a ponta e linha do resumo -- AC1.
- [x] `src/lib/agent/lead-screening.ts` -- órgão público, suprimido, já contatado -- AC2.
- [x] `search-leads-step.ts` -- ampliação de cargos, triagem, ordem, `screening`, autopilot -- AC1/AC2.
- [x] `fetch-leads/route.ts` -- mesma triagem -- AC2.
- [x] `empty-search-diagnosis.ts` -- local e indústria pelos filtros novos -- AC1/AC3.
- [x] `AgentLeadReview.tsx` -- badges, toggle de órgãos públicos, pré-seleção só de elegíveis, linha de suprimidos -- AC2.
- [x] Testes: uma linha por cenário da matriz nos arquivos do Code Map; os existentes seguem verdes, salvo as expectativas que mudam de propósito.

**Acceptance Criteria:**
- Given um briefing com localização, when a busca de leads do agente roda, then a query à Apollo usa `organization_locations[]` (ou `person_locations[]` com `locationScope: "person"`) e `include_similar_titles=false`, ampliando para `true` uma vez só quando o resultado não chega a N.
- Given os resultados, when a revisão abre, then órgãos públicos estão ocultos e fora da pré-seleção com opção de incluir, suprimidos não aparecem e já contatados aparecem com badge e fora da pré-seleção.
- Given uma indústria com correspondência, when vai à Apollo, then sai em `organization_industries[]` e não em `q_keywords`; sem correspondência, o comportamento é o de hoje.
- Given a busca manual de leads, when roda, then a query à Apollo é idêntica à de antes.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 33 findings — high 0, medium 0, low 29, false 4, maybe-false 0
- findings:
  - `low` `reject` [blind] No autopilot, suprimidos/ja contatados/publicos saem do output antes do `create_campaign`, o que poderia conflitar com "nenhum filtro novo no caminho ate o Instantly" — e a exclusao pedida pelo AC2 na montagem da lista (busca), nao uma trava no export/ativacao; o export e a ativacao nao foram tocados. Registrado com destaque nas Completion Notes para o Fabossi.
  - `low` `reject` [blind] Ramo por dominios (fluxo por tecnologia) filtra pela sede da empresa e pode tirar multinacionais com sede fora — e o pedido literal da story ("empresas sediadas na regiao pedida"); "que more em SP" continua disponivel pela conversa (`locationScope: "person"`). Registrado nos riscos residuais.
  - `false` `reject` [blind] `organization_industries[]` talvez nao exista no `api_search` — smoke real somente leitura (2026-10-22): `banking` + Brasil devolve so bancos (34, Itau/Nubank/Santander), nome inexistente devolve 0, e os 31 nomes do mapa devolvem resultados.
  - `low` `patch` [blind] Falha na leitura de oportunidades descartava os status ja lidos de `leads` — corrigido: `findContactedLeads` devolve o mapa parcial; teste `oppFail` atualizado.
  - `low` `reject` [blind] A ampliacao compara o total bruto, nao os elegiveis — o universo ja e 3–5x N; para faltar elegivel com bruto >= N seria preciso >66% de inelegiveis na pagina; o fix exige mover a triagem para dentro da ampliacao.
  - `low` `reject` [blind] A 2a busca lanca e derruba o step / substitui os exatos — falha da Apollo na 2a chamada e rara e ja derrubava o step com 1 chamada; a busca ampla e superconjunto e o Fit Score poe os cargos exatos no topo; o fix e ramo novo.
  - `low` `reject` [blind] Quantidade na revisao ignora elegibilidade (`needsFetch`, fetch-leads conta inelegiveis) — caso raro (Q dentro do lote e acima dos elegiveis); o fix muda a semantica do fetch-leads.
  - `low` `reject` [blind] Contagens de `screening` inconsistentes entre caminhos — o fetch-leads repagina desde a pagina 1, entao a contagem e da lista nova inteira; no autopilot nao ha tela que mostre `screening`.
  - `low` `patch` [blind] Deteccao de orgao publico com lacunas — corrigido: termos novos (universidade federal/estadual, instituto federal, policias, receita federal, banco central do brasil, forcas armadas) + testes. Falso positivo "Ministerio" de igrejas rejeitado: alvo raro para prospeccao B2B e a heuristica fica documentada.
  - `low` `patch` [blind] Mapa de industria so casa chave exata — corrigido: aliases fintechs, ecommerce, e-commerce, varejista, banco(s) digital(is) + teste. Sem mapa, o comportamento e o de hoje (texto).
  - `low` `reject` [blind] O padrao (sede da empresa) nao aparece no resumo e o card nao tem controle de escopo — decisao da spec para nao mudar o texto de hoje; a opcao e pela conversa.
  - `low` `reject` [blind] O diagnostico nao sugere "tente pela localizacao da pessoa" — feature nova de diagnostico.
  - `low` `reject` [blind] Textos sem acento e "X de Y selecionados" contando ocultos — o texto do toggle segue a spec e a convencao sem acento das strings do agente; cosmetico.
  - `low` `patch` [blind] Regex de acentos com caracteres combinantes invisiveis — corrigido: `̀-ͯ` nos dois arquivos. Duplicacao do `normalize` rejeitada (2 copias de 5 linhas, sem divergencia nomeada).
  - `low` `reject` [blind] Testes faltando (2a busca lanca, fail-open no step, filtros guardados com `true`) — os defeitos por tras foram triados acima; o teste do ramo por dominios com escopo pessoa entrou pelo patch da verification-gap.
  - `low` `patch` [edge] N > perPage (teto 100) fazia a ampliacao rodar sempre — corrigido: limiar `min(N, perPage)` + teste N=300 com pagina cheia (1 chamada).
  - `low` `reject` [edge] Limiar pelo total bruto antes da triagem — mesmo grupo do achado blind.
  - `low` `reject` [edge] 2a busca lanca apos a exata — mesmo grupo do achado blind.
  - `false` `reject` [edge] 2a busca devolvendo menos que a exata — com `include_similar_titles=true` o resultado e superconjunto do exato (smoke: 118 exatos x 159 amplos para CISO/SP pessoa).
  - `low` `reject` [edge] fetch-leads para a paginacao pelo total bruto — mesmo grupo de quantidade x elegibilidade.
  - `low` `reject` [edge] `needsFetch` ignora elegibilidade — mesmo grupo.
  - `low` `patch` [edge] Checkbox "selecionar todos" marcado sem linhas visiveis (todos publicos ocultos) — corrigido: `filteredLeads.length > 0 &&` + teste.
  - `low` `reject` [edge] Busca vazia por supressao mostra diagnostico de filtros — o chat ja recebe "Removi N lead(s) suprimido(s)"; caso raro.
  - `low` `patch` [edge] (claim) AC1 "amplia so quando nao chega a N" — a parte N > perPage foi corrigida (patch acima); a parte "elegiveis" e o grupo rejeitado.
  - `low` `reject` [edge] (claim) fetch-leads sem a mensagem de suprimidos — a revisao mostra a linha de suprimidos atualizada; mensagem no chat a cada "Buscar mais" seria ruido.
  - `low` `patch` [verification-gap] "Selecionar Q leads" sem teste com inelegiveis — teste novo [E1, C1, E2, E3], Q=2.
  - `low` `patch` [verification-gap] Ramo por dominios com `locationScope: "person"` sem teste — teste novo (domains + `locations`, sem `organizationLocations`).
  - `low` `patch` [verification-gap] Resumo de ajuste sem o sufixo de escopo pessoa — corrigido em `buildAdjustmentSummary` (so com local) + teste.
  - `false` `reject` [intent] Industria por nomes em vez de tag IDs pode nao filtrar — smoke real mostrou o filtro funcionando; IDs de tag exigiriam dados que nao temos e a spec os proibe.
  - `low` `reject` [intent] Publicos ocultos ocupam vagas da pagina — mesmo grupo de quantidade x elegibilidade.
  - `false` `reject` [intent] Supressao usa regra provisoria em vez da lista da 23.5 — o AC pede "conforme a regra ja existente"; a 23.5 nao existe e entra atras de `findContactedLeads`.
  - `low` `reject` [intent] Testes param na montagem da query — coberto em parte pelo smoke real da Apollo (somente leitura); o resto e risco residual.
  - `low` `reject` [intent] CLAUDE.md pede smoke real quando a mudanca toca a busca — feito o smoke real da Apollo com os filtros novos; o smoke de tela do agente criaria execucao no banco do cliente e fica recomendado (riscos residuais).

## Design Notes

- **Ampliação em vez de `false` puro:** cargo exato dá precisão, mas "CISO" exato numa cidade média pode zerar. A busca de pessoas não consome crédito, então uma 2ª chamada só quando falta volume é barata e evita trocar busca ruim por busca vazia. Os filtros efetivos ficam no output, então o "Buscar mais" e o diagnóstico enxergam o que rodou de verdade.
- **Órgão público por nome:** o `api_search` não devolve indústria (só `has_industry`), e excluir por `organization_not_industry_tag_ids` exigiria IDs que não temos. O nome da organização é o único sinal disponível sem crédito. Marcar em vez de remover permite o "incluir" na revisão sem nova busca.
- **Já contatado pela regra existente:** sem a lista de supressão da 23.5, a fonte é o próprio status do lead (`nao_interessado` = pediu para sair, `em_campanha`/`interessado`/`oportunidade` = já abordado) e a regra de negociação da 24.17 (oportunidade `contacted`/`meeting_booked`). Quando a 23.5 chegar, entra atrás de `findContactedLeads`.
- **Modo lista fica com local da pessoa:** a conta já foi escolhida pelo usuário; filtrar pela sede excluiria a própria conta quando a sede é em outra cidade.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/lib/services __tests__/unit/api/agent __tests__/unit/hooks __tests__/unit/components/agent` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Os 3 pontos do cliente por análise do diff: busca manual com query idêntica (teste), export/ativação e webhook/`reply-sweep` não tocados.

## Completion Notes

**O que pode mudar para o cliente**
- Busca de leads do agente (step `search_leads` e "Buscar mais"): o local vai pela sede da empresa (`organization_locations`) por padrao, com "onde a pessoa esta" quando o usuario pede; cargo exato primeiro, com 1 busca ampliada (cargos parecidos) quando nao chega a N; industria mapeada vai por categoria (`organization_industries`). Resultado: listas menores e mais precisas.
- Revisao de leads: orgaos publicos ocultos por padrao (botao para incluir), badge "Ja contatado" fora da pre-selecao, suprimidos removidos (status `nao_interessado` ou oportunidade em negociacao). No autopilot so seguem os elegiveis.
- Parser do briefing: campo novo `locationScope` no prompt (so a conversa do agente). PATCH `/briefing` aceita o campo.
- Leituras novas (sem escrita): `leads` e `opportunities` do tenant pelos `apollo_id` dos resultados.
- Nenhuma tabela, migration, job `pg_cron`, Edge Function, secret ou integracao nova. A busca de pessoas da Apollo nao consome credito; a ampliacao e no maximo 1 chamada a mais.

**Os 3 pontos**
1. Campanhas rodando, webhook e `reply-sweep`: nao tocados (analise do diff).
2. Busca de leads: a busca manual (`/api/integrations/apollo`, `/api/ai/search`) manda a mesma query de antes (teste de query string + default `include_similar_titles=true`). A busca do agente muda de proposito (e o pedido da story). Smoke real somente leitura na Apollo de producao (2026-10-22): CISO/SP pessoa+similar 159, pessoa exato 118, sede exato 92; `organization_industries=banking` traz so bancos; nome inexistente 0; os 31 nomes do mapa validos. **Fabossi deve saber:** as buscas do agente passam a trazer menos leads (sede + cargo exato), e no autopilot leads ja contatados/publicos/suprimidos nao seguem para a campanha.
3. Criacao, export e ativacao no Instantly: codigo nao tocado, sem trava nova no export (analise do diff). A unica diferenca e quais leads o step de busca entrega no autopilot.

## Auto Run Result

Status: done

**Resumo:** a busca de leads do agente na Apollo ficou mais precisa. Local pela sede da empresa (`organization_locations`), com a localizacao da pessoa como opcao pedida na conversa (`locationScope`). `include_similar_titles` deixou de ser fixo: cargo exato primeiro, ampliando uma vez quando nao chega a N (limiar `min(N, perPage)`). Industria com correspondencia vai em `organization_industries[]` (fora do `q_keywords`). Os resultados passam por uma triagem (step e "Buscar mais"): suprimidos removidos, "Ja contatado" sinalizado, orgaos publicos ocultos com opcao de incluir; pre-selecao so de elegiveis; autopilot so com elegiveis. A busca manual nao mudou.

**Arquivos alterados:**
- `src/types/apollo.ts`, `src/lib/services/apollo.ts` — 3 campos opcionais e query string (default preserva a busca manual).
- `src/lib/agent/apollo-industries.ts` (novo) — industria do briefing → nomes da Apollo.
- `src/lib/agent/search-defaults.ts` — escopo do local, cargo exato, industria por categoria.
- `src/lib/agent/lead-screening.ts` (novo) — orgao publico, suprimido, ja contatado, ordem e resumo.
- `src/lib/agent/steps/search-leads-step.ts` — ampliacao de cargos, triagem, ordem, `screening`, autopilot.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts` — mesma triagem.
- `src/types/agent.ts`, `src/lib/agent/briefing-parser-service.ts`, `src/app/api/agent/executions/[executionId]/briefing/route.ts`, `src/lib/agent/briefing-adjustment.ts`, `src/hooks/use-briefing-flow.ts` — `locationScope` ponta a ponta e sufixo "(onde a pessoa esta)".
- `src/lib/agent/empty-search-diagnosis.ts` — local e industria pelos filtros novos.
- `src/components/agent/AgentLeadReview.tsx` — badges, toggle de orgaos publicos, pre-selecao de elegiveis, linha de suprimidos.
- Testes em 14 arquivos (2 novos).

**Revisao:** 33 achados (0 high, 0 medium, 29 low, 4 false). Patches (todos low, 10 linhas / 9 correcoes): mapa parcial na falha de oportunidades; limiar `min(N, perPage)`; termos novos de orgao publico; aliases de industria; regex de acentos escapada; checkbox "todos" sem linhas visiveis; resumo de ajuste com escopo pessoa; testes de "Selecionar Q" e do ramo por dominios com escopo pessoa. Deferidos: 0. Rejeitados: 19 low e 4 false (motivos no Triage Log).

**Follow-up review recomendado:** false — so entradas low corrigidas (patched: high 0, medium 0, low 10).

**Verificacao:** `npm run lint` (0 erros, 134 warnings ja existentes), `npm run typecheck` ok, `npm run test:run` 447 arquivos / 8635 testes verdes (2 skipped). Auditoria da matriz I/O: todas as linhas com teste passando. Smoke real somente leitura na Apollo (sem credito, sem escrita no banco) confirmando os 3 parametros novos e os 31 nomes de industria. `/verify` no app local (porta 3100, conta de teste, sem criar execucao): o `/api/agent/briefing/parse` real devolveu `locationScope: null` para "CISOs de Sao Paulo", `"person"` para "CISOs que morem em Sao Paulo" e `industry: "fintech"` para "CISOs de fintechs no Brasil".

**Riscos residuais:**
- Sem smoke de tela do agente (criaria execucao no banco do cliente): recomendado rodar "CISO de Sao Paulo" com 2 leads e conferir badges/toggle na revisao, parando antes da Criacao de Campanha.
- Sede da empresa no fluxo por tecnologia pode tirar multinacionais com sede fora da regiao pedida; "que more em SP" resolve pela conversa.
- A ampliacao decide pelo total bruto, antes da triagem; com muitos inelegiveis a revisao pode ter menos de N elegiveis (o "Buscar mais" continua disponivel).
- Orgao publico e detectado pelo nome (heuristica): pode errar em nomes atipicos.
- Supressao/ja contatado usa a regra existente (status do lead + oportunidade em negociacao) ate a lista da 23.5.
