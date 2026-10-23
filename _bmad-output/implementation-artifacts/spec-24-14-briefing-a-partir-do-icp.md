---
title: '24.14 — Briefing a partir do ICP'
type: 'feature'
created: '2026-10-22'
status: done
baseline_revision: '2715ff5b171cbe370bd9c6c096d253b4132f1a39'
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

**Problem:** O agente ignora o ICP cadastrado na KB. Toda conversa começa do zero (pergunta cargo, localização...), e quando o usuário não diz o porte, a busca direta aplica o piso fixo `QUALITY_MIN_COMPANY_SIZES` (11+), que não tem nada a ver com o cliente ideal do tenant.

**Approach:** Ler o ICP do tenant (cargos, foco geográfico, portes) no servidor e (1) abrir a conversa nova com uma proposta de briefing no card editável da 24.5 ("Pelo seu ICP: ... Ajusto algo?"); (2) gravar no briefing os defaults do ICP (`icpDefaults`), que substituem o piso fixo e a falta de localização na busca de leads, com o resumo, o card, o plano e o diagnóstico dizendo que vieram do ICP. Sem ICP utilizável, nada muda e o agente sugere preencher o ICP.

## Boundaries & Constraints

**Always:**
- Novo tipo `IcpSearchDefaults { companySizes: string[]; locations: string[] }` e campo `ParsedBriefing.icpDefaults?: IcpSearchDefaults | null`. `companySizes` já em faixas canônicas da Apollo. Mapa do ICP: `"1-10"…"501-1000"` iguais; `"1000+"` → `["1001-5000","5001-10000","10001+"]`. Dedupe, ordem canônica, locais com trim, sem vazios, teto de 10. Os dois vazios → `null`.
- Resolução (fonte única em `search-defaults.ts`):
  - `resolveDirectSearchCompanySizes` passa a devolver `source: "user" | "icp" | "quality"`. Prioridade: `companySize` do usuário, depois `icpDefaults.companySizes` não vazio, depois o piso. `defaultsApplied` continua `true` só para `"quality"`.
  - `resolveSearchLocations(briefing)` → `{ locations, fromIcp }`. O `location` do usuário vence; senão, `icpDefaults.locations`; senão, `[]`.
  - `hasSearchLocation(briefing)`. Os dois usados por `buildDirectSearchFilters` e pelo ramo por domínios do `search_leads`.
- `formatCompanySizesLabel(buckets)`: faixas contíguas viram um intervalo com travessão ("201-500"+"501-1000" → "201–1000"). Faixa aberta no fim → "501+". Faixas não contíguas são juntadas com ", ".
- A localização do ICP satisfaz a regra "cargo + localização" em todos os pontos: `canProceed` do `/parse`, `canConfirm` do card, `canProceed` reconciliado no hook.
- `/api/agent/briefing/parse` lê o ICP uma vez (`readTenantICP`, fail-open). Anexa `icpDefaults` ao briefing, menos no fluxo de leads importados (lá vale `null`), antes da análise de completude. Repassa o ICP já lido às sugestões, sem segunda leitura. `location` só entra em `missingFields` quando `hasSearchLocation` é falso.
- PATCH `/briefing` declara `icpDefaults` (armadilha do strip). `mergeAdjustedBriefing`: o valor do parse vence e a ausência preserva.
- Proposta: `buildIcpProposal(icp)` devolve `null` sem cargos no ICP. Com cargos (dedupe, máx. 6), devolve o briefing com tecnologia/localização/tamanho/indústria/produto `null`, `mode: "guided"`, `skipSteps: ["search_companies"]` e `icpDefaults`. Mensagem: `Pelo seu ICP: {cargos com "/"}, {locais com ", "}, {rótulo} funcionarios. Ajusto algo?`, omitindo as partes vazias, seguida do `BRIEFING_CARD_HINT`.
- Rota nova `GET /api/agent/briefing/icp-proposal` → `{ data: { proposal } }`, 401 sem perfil. O ICP é lido por service-role (o SDR não lê a KB por RLS).
- Conversa nova (portão de reattach aberto, sem execução, briefing `idle`): com proposta, o hook entra em `confirming` com o briefing proposto e grava o turno do agente na memória. O chat mostra a mensagem como bolha do agente e o card fica visível **sem execução**. A execução é criada só no primeiro gesto: texto, clique no card ou chip. Antes do turno do usuário, a mensagem da proposta é persistida (uma vez). Sem a proposta (ICP sem cargos), o estado vazio ganha a dica de preencher o ICP. Se a leitura falhar, nada aparece.
- Rótulos: resumo `- Localizacao: X (do seu ICP)` e `- Tamanho de empresa: {rótulo} funcionarios — do seu ICP, me diga se quiser mudar.` Na busca direta, este substitui a linha do piso 11+. Chips do card mostram `{valor} (do ICP)` quando o campo está vazio e o default se aplica (tamanho só na busca direta). Também ficam ICP-aware o plano (`tamanho {rótulo} (do ICP)`, local efetivo), o resumo de ajuste (22.13) e o diagnóstico de busca vazia (linha "Tamanho", causa `icp_company_size_applied` e o aviso do chip de 1–10).

**Never:**
- Migration, `pg_cron`, Edge Function, secret, ou mudança em export/ativação do Instantly e em webhook/`reply-sweep`.
- Aplicar ICP no `search_companies` (TheirStack). O porte do ICP só vale na busca direta.
- Usar `industries` do ICP como filtro, ou chamar LLM/serviço pago para montar a proposta.
- Criar execução só por abrir a página.
- Mudar o comportamento de tenant sem ICP: sem `icpDefaults`, resumo, plano, busca e diagnóstico ficam idênticos aos de hoje.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Proposta | ICP: cargos [CISO, Head de TI], geo [SP], portes [201-500, 501-1000] | "Pelo seu ICP: CISO/Head de TI, SP, 201–1000 funcionarios. Ajusto algo?" + card | — |
| Proposta sem geo | ICP só com cargos | Proposta sem a parte de local; "Confirmar" pede a localização (fluxo atual) | — |
| ICP sem cargos / sem linha | portes e geo sem cargos, ou nada | sem proposta, dica de preencher o ICP | leitura falha → sem dica |
| Mapa 1000+ | portes [501-1000, 1000+] | buckets 501-1000..10001+, rótulo "501+" | — |
| Não contíguo | [11-50, 501-1000] | "11–50, 501–1000" | — |
| Parse sem porte | ICP com portes, "CISO em SP" | busca direta usa as faixas do ICP, `source: "icp"` | — |
| Parse sem local | ICP geo [SP], "CISO" | `canProceed` true, local efetivo [SP], resumo "(do seu ICP)" | — |
| Usuário informa | companySize "51-200", local "RJ" | o usuário vence nos dois | — |
| Importados | fluxo de colar leads | `icpDefaults: null` | — |
| Lazy exec | proposta visível, clique em Confirmar | POST execução → mensagem da proposta → "Confirmar" → PATCH | falha no POST → toast, sem gesto |
| Sem ICP | tenant sem ICP | tudo idêntico a hoje | — |

</intent-contract>

## Code Map

- `src/types/agent.ts:113-138` -- `ParsedBriefing`: adicionar `icpDefaults` e exportar `IcpSearchDefaults`.
- `src/types/knowledge-base.ts:214-249` -- `COMPANY_SIZES` do ICP (inclui `"1000+"`) e `ICPDefinition` (`company_sizes`, `geographic_focus`, `job_titles`).
- `src/lib/agent/search-defaults.ts` -- SSOT do piso. `resolveDirectSearchCompanySizes` (:51) ganha `source`; `buildDirectSearchFilters` (:89) usa `resolveSearchLocations`. Adicionar `resolveSearchLocations`, `hasSearchLocation` e `formatCompanySizesLabel`. Leaf puro, client-safe.
- `src/lib/agent/icp-briefing.ts` (novo, leaf puro) -- `ICP_SIZE_TO_SEARCH_SIZES`, `buildIcpSearchDefaults`, `buildIcpProposal` e `buildIcpProposalMessage`. Molde de `dedupeNonEmpty` em `briefing-suggestion-service.ts:181`.
- `src/lib/agent/contextual-suggestions.ts:44-78` -- `readTenantICP` passa a devolver `TenantICP` (`jobTitles`, `industries`, `companySizes`, `geographicFocus`; a mesma coerção `toStringArray`). `resolveContextualSuggestions(briefing, tenantId, icp?)` reaproveita o ICP recebido.
- `src/app/api/agent/briefing/icp-proposal/route.ts` (novo) -- GET. Molde de auth em `src/app/api/agent/executions/route.ts:19-26`.
- `src/app/api/agent/briefing/parse/route.ts` -- `analyzeBriefingCompleteness` (:67-110, local via `hasSearchLocation`); montagem `resolvedBriefing` (:282-287) + sugestões (:293).
- `src/app/api/agent/executions/[executionId]/briefing/route.ts:35-80` -- schema do PATCH (`icpDefaults` objeto `{companySizes: string[] ≤10, locations: string[] ≤10}` nullable optional).
- `src/lib/agent/briefing-adjustment.ts` -- `mergeAdjustedBriefing` (:139); `buildAdjustmentSummary`: linhas Localizacao/Tamanho (:266-267).
- `src/lib/agent/steps/search-leads-step.ts:160-166` -- ramo por domínios: `locations` via `resolveSearchLocations`.
- `src/lib/services/agent-plan-generator.ts:52-67` -- `sizeLabel` por `source` e local efetivo.
- `src/lib/agent/empty-search-diagnosis.ts:126` (union de códigos), `:336-350` (linha Tamanho), `:398-404` (causas), `:439-450` (aviso do chip).
- `src/hooks/use-briefing-flow.ts` -- `generateBriefingSummary` (:192, local e porte); `canProceed` reconciliado (:1049); `canConfirm` (:1736). Novo `seedIcpProposal(briefing)`: só em `idle`, entra em `confirming` e grava o turno via `conversationRef`. Exportar `buildIcpProposalTurn(briefing)` (mensagem + `BRIEFING_CARD_HINT`), `ICP_MISSING_HINT` e `icpDefaultChipLabel(field, briefing)`.
- `src/hooks/use-icp-proposal.ts` (novo) -- `useQuery(["agent-icp-proposal"])`, `enabled`, `retry: false`, staleTime de 5 min. Devolve `{ proposal, isLoaded }` (`isLoaded` só em sucesso). `src/hooks/use-icp-definition.ts:53`: invalidar também `["agent-icp-proposal"]` no save.
- `src/components/agent/AgentChat.tsx` -- extrair `ensureExecution()` da criação em `handleSendMessage` (:788-806). Ela persiste a proposta pendente antes de devolver e usa um ref "criando" que impede o seed durante o POST. A criação passa a ser usada em `handleCardAction` (:851) e `handleChipEdit` (:890, depois da validação). Efeito de seed; `confirmationCardVariant` (:1161, `!currentExecutionId` só bloqueia sem proposta); `cancelCurrentExecution` limpa a proposta; props novas do `AgentMessageList` (:1220).
- `src/components/agent/AgentMessageList.tsx:38-62` -- props `introMessage?: string | null` (bolha do agente sintética quando não há mensagens, no lugar do onboarding/placeholder) e `emptyStateHint?: string | null` (`data-testid="agent-icp-hint"`).
- `src/components/agent/AgentConfirmationCard.tsx:201-222` -- chip vazio usa `icpDefaultChipLabel` quando houver.
- Testes: `__tests__/unit/lib/agent/{search-defaults,contextual-suggestions,briefing-adjustment,empty-search-diagnosis}.test.ts`, `__tests__/unit/lib/agent/icp-briefing.test.ts` (novo), `__tests__/unit/lib/agent/steps/search-leads-step.test.ts`, `__tests__/unit/lib/services/agent-plan-generator.test.ts`, `__tests__/unit/api/agent/{briefing-parse,briefing-update}.test.ts`, `__tests__/unit/api/agent/icp-proposal.test.ts` (novo), `__tests__/unit/hooks/use-briefing-flow.test.tsx`, `__tests__/unit/components/agent/{AgentChat,AgentMessageList,AgentConfirmationCard}.test.tsx`. O `AgentChat.test.tsx` precisa mockar `@/hooks/use-icp-proposal` e incluir `seedIcpProposal` no mock do `useBriefingFlow`. O `briefing-parse.test.ts` precisa de `readTenantICP` no mock de `contextual-suggestions`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/agent.ts`, `src/lib/agent/search-defaults.ts`, `src/lib/agent/icp-briefing.ts` -- tipo, resolução e rótulos, mapa e proposta -- AC1/AC2.
- [x] `src/lib/agent/contextual-suggestions.ts`, `src/app/api/agent/briefing/parse/route.ts`, `src/app/api/agent/briefing/icp-proposal/route.ts`, `briefing/route.ts` (PATCH) -- leitura do ICP, `icpDefaults` no parse, rota da proposta e persistência -- AC1/AC2.
- [x] `search-leads-step.ts`, `agent-plan-generator.ts`, `empty-search-diagnosis.ts`, `briefing-adjustment.ts` -- consumidores ICP-aware -- AC2.
- [x] `use-briefing-flow.ts`, `use-icp-proposal.ts`, `use-icp-definition.ts` -- seed, resumo, regras de localização, hook da proposta -- AC1/AC2/AC3.
- [x] `AgentChat.tsx`, `AgentMessageList.tsx`, `AgentConfirmationCard.tsx` -- abertura com proposta, execução sob demanda, dica, chips "(do ICP)" -- AC1/AC3.
- [x] Testes: uma linha por cenário da matriz nos arquivos do Code Map. Os testes existentes continuam verdes (sem ICP, comportamento idêntico).

**Acceptance Criteria:**
- Given um tenant com ICP (cargos, geo, portes), when o usuário abre uma conversa nova, then a primeira mensagem do agente é a proposta "Pelo seu ICP: ... Ajusto algo?" e o card de resumo editável aparece com os valores (local e tamanho marcados "(do ICP)"), sem execução criada até o primeiro gesto.
- Given o ICP, when o briefing não traz porte e/ou local, then a busca de leads (step, plano e viabilidade) usa as faixas/locais do ICP no lugar do piso 11+ e o resumo diz que vieram do ICP.
- Given um tenant sem ICP utilizável, when abre a conversa, then o fluxo é o de hoje e o estado vazio mostra a dica para preencher o ICP.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 36 findings — high 0, medium 0, low 31, false 5, maybe-false 0
- findings:
  - `low` `reject` [blind] A dica "preencha o ICP" aparece quando a leitura do ICP falha no servidor (`readTenantICP` e fail-open e devolve 200 com `proposal: null`) — falha de leitura da KB por service-role e rara; distinguir "sem linha" (PGRST116) de "erro" exige ramo e sinal novos na leitura compartilhada com as sugestoes.
  - `low` `reject` [blind] No fluxo por tecnologia, o local do ICP libera o `canProceed`, mas o `search_companies` (TheirStack) so le `briefing.location` e roda sem pais — caminho menos comum (o uso dominante e cargo + cidade, e a proposta e sempre busca direta); hoje um local nao mapeado no `COUNTRY_MAP` ja tem o mesmo efeito; o guiado mostra as empresas no gate antes dos leads; corrigir exige renegociar duas regras do contrato (ICP fora do TheirStack x local do ICP vale em todos os pontos). Registrado nos riscos residuais.
  - `low` `reject` [blind] Os textos de `geographic_focus` do ICP vao crus para `person_locations` da Apollo — mesmo tratamento do local digitado (o parser so faz trim); normalizar local seria feature nova.
  - `low` `reject` [blind] O diagnostico de busca vazia mostra so o primeiro local do ICP (`filters.locations[0]`) — so aparece com busca vazia e ICP com varios locais; o ajuste mexe em `isNarrowLocation`/`buildLocationChips`.
  - `low` `reject` [blind] O usuario nao consegue tirar os defaults do ICP (limpar o chip volta ao ICP) — antes ja nao dava para tirar o piso 11+ nem buscar sem local (local obrigatorio desde a 22.1); informar outro porte/local continua vencendo.
  - `low` `reject` [blind] `ensureExecution` nao deduplica dois gestos simultaneos — exige dois gestos dentro da latencia de um POST; o card e o chip ja ficam desabilitados com `isAgentProcessing`; uma execucao `pending` orfa nao custa nada.
  - `low` `patch` [blind] Proposta perdida/execucao orfa quando o POST da mensagem da proposta falha, e flicker do estado vazio — corrigido o primeiro: `setCurrentExecutionId` logo apos o POST, e persistencia da proposta com try/catch proprio (toast), o gesto segue na mesma execucao; teste novo. Flicker rejeitado (cosmetico, uma fracao de segundo).
  - `low` `patch` [blind] Schema do PATCH aceita qualquer string em `icpDefaults.companySizes` — corrigido: `z.enum(APOLLO_COMPANY_SIZE_BUCKETS)`; teste de 400 com "1000+".
  - `low` `patch` [blind] Proposta desatualizada e chave de cache copiada a mao em `use-icp-definition` — corrigido: importa `ICP_PROPOSAL_QUERY_KEY` e teste da invalidacao; o resto (outra aba, proposta ja semeada) rejeitado: snapshot por desenho, staleTime de 5 min.
  - `low` `reject` [blind] Spec/Completion Notes fora do diff — o fix e editar a spec; registradas na finalizacao.
  - `low` `reject` [blind] Testes faltando (rota com erro de leitura, 10 locais, fluxo de empresas, seed apos abandono) — os defeitos reais por tras ja foram triados acima; 10 locais nao tem comportamento especial; o seed unico ja e testado.
  - `low` `reject` [blind] `isDirectSearch` duplicado e hifen x travessao entre porte do usuario e do ICP — so desenvolvedor/cosmetico; extrair helper e refactor fora do minimo.
  - `low` `reject` [edge] Gestos concorrentes criam duas execucoes — mesmo grupo do achado blind de deduplicacao.
  - `low` `reject` [edge] `handleChipEdit` sem guarda `isAgentProcessing` — o botao Salvar do chip ja recebe `disabled={isAgentProcessing}`; a janela restante e a do POST de um envio de texto, rara.
  - `low` `patch` [edge] Rejeicao do `sendAgentMessage` orfana a execucao — mesmo grupo do patch de `ensureExecution` (corrigido).
  - `low` `reject` [edge] Resposta nao-OK da mensagem da proposta deixa o historico sem ela — erro 500 raro; o fix exige mudar o retorno do helper `sendAgentMessage`; a memoria do LLM continua com a proposta.
  - `low` `reject` [edge] No envio de texto, `setAgentProcessing(true)` vem depois do `ensureExecution` — mesmo grupo da deduplicacao (janela de um POST).
  - `low` `reject` [edge] Diagnostico le so o primeiro local — mesmo grupo do achado blind.
  - `low` `reject` [edge] Diagnostico sem chip para remover as faixas do ICP — o usuario troca o porte pelo chip/conversa; chip novo e UI nova.
  - `low` `reject` [edge] Nao ha opt-out dos defaults — mesmo grupo do achado blind.
  - `low` `reject` [edge] Fluxo de empresas passa no `canProceed` com local do ICP e TheirStack sem pais — mesmo grupo do achado blind.
  - `low` `patch` [edge] Schema do PATCH frouxo — mesmo grupo do patch blind (corrigido).
  - `low` `reject` [edge] `mergeAdjustedBriefing` trata `null` explicito do parse como ausencia — so importa se o ICP for esvaziado no meio de uma execucao; a regra "ausencia preserva" e a mesma dos metadados.
  - `low` `reject` [edge] A bolha da proposta some antes do refetch das mensagens (flicker) — cosmetico.
  - `low` `reject` [edge] Dica no erro de leitura — mesmo grupo do primeiro achado blind.
  - `false` `reject` [edge] Ramo por dominios estreita pelo local do ICP sem avisar — o resumo e o chip do card mostram "Localizacao: X (do seu ICP)" antes da confirmacao.
  - `low` `reject` [edge] ICP sem cargos mostra a dica mas aplica porte/local — a dica pede justamente os cargos que faltam; ajustar o texto e cosmetico.
  - `low` `patch` [verification-gap] `useIcpProposal` nunca testado de verdade — corrigido: `__tests__/unit/hooks/use-icp-proposal.test.tsx` com 4 casos.
  - `low` `patch` [verification-gap] Invalidacao do cache sem teste e chave copiada — mesmo grupo do patch blind (corrigido).
  - `low` `patch` [verification-gap] Execucao orfa na falha do POST da proposta — mesmo grupo do patch de `ensureExecution` (corrigido).
  - `low` `reject` [intent] AC1 so tem evidencia de unidade com mocks, sem smoke de tela — smoke real em producao criaria execucoes do cliente; a cadeia rota → hook → componente esta coberta por partes; recomendado smoke manual (riscos residuais).
  - `false` `reject` [intent] Proposta so no cliente ate o primeiro gesto — escolha documentada nas Design Notes; a proposta e persistida antes do turno do usuario.
  - `low` `reject` [intent] ICP sem cargos: dica + defaults aplicados — mesmo grupo do achado edge.
  - `false` `reject` [intent] Viabilidade sem teste proprio — `plan/route.ts:104` chama `buildDirectSearchFilters`, testada com ICP.
  - `false` `reject` [intent] "funcionarios" sem acento x exemplo do epico — mensagens do agente seguem a convencao sem acento (Trap #9); o exemplo do epico e ilustrativo.
  - `false` `reject` [intent] Completion Notes ausentes — o fix e editar a spec; registradas na finalizacao.

## Design Notes

- **Execução sob demanda:** criar a execução ao abrir a página deixaria uma linha `pending` a cada visita/F5 (o reattach descarta `pending`) e mudaria o `isFirstTime`. A proposta vive só no cliente até o primeiro gesto. A ordem persistida fica proposta → gesto do usuário → resposta, como se a execução já existisse.
- **`icpDefaults` gravado no briefing (snapshot):** plano, viabilidade e step leem o mesmo valor, sem drift nem leitura da KB no meio da execução. Editar o ICP só vale para conversas novas.
- **Por que ajuste por texto funciona:** o turno da proposta entra na memória do `/parse`, então "troca para CFO" herda o resto. O LLM pode copiar local/porte do texto da proposta para `location`/`companySize`. Isso é aceitável: o valor vira escolha explícita e continua igual ao do ICP.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/lib/services __tests__/unit/api/agent __tests__/unit/hooks __tests__/unit/components/agent` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Os 3 pontos do cliente por análise do diff: busca sem ICP inalterada, export/ativação não tocados, nada em webhook/`reply-sweep`.

## Completion Notes

**O que pode mudar para o cliente**
- Conversa do agente: numa conversa nova, um tenant com ICP com cargos ve a proposta "Pelo seu ICP: ... Ajusto algo?" e o card editavel. A execucao so e criada no primeiro gesto. Sem cargos no ICP, o estado vazio mostra uma dica para preencher o ICP.
- Rota nova `GET /api/agent/briefing/icp-proposal` (somente leitura da secao `icp` da `knowledge_base` via service-role).
- `/api/agent/briefing/parse`: le o ICP (ja era lido para as sugestoes) e grava `icpDefaults` no briefing; o local do ICP conta como local. Nenhum prompt alterado.
- PATCH `/briefing`: aceita `icpDefaults`.
- Busca de leads do agente: para tenant com ICP, sem porte do usuario a busca direta usa as faixas do ICP (no lugar do piso 11+), e sem local usa os locais do ICP (busca direta e ramo por dominios). Plano, viabilidade, resumos e diagnostico dizem "do ICP".
- Nenhuma tabela, migration, job `pg_cron`, Edge Function, secret ou integracao nova.

**Os 3 pontos (por analise do diff + testes, sem smoke real)**
1. Campanhas rodando, webhook e `reply-sweep`: nao tocados.
2. Busca de leads: a busca manual e o `fetch-leads` nao mudam; a busca do agente para tenant sem ICP e identica (testado). Para tenant com ICP, os filtros padrao da busca do agente mudam (porte/local do ICP) — essa e a mudanca pedida pela story, nao uma trava; o Fabossi deve saber que, se o cliente tiver ICP preenchido, as buscas do agente sem porte/local passam a usar o ICP.
3. Criacao, export e ativacao no Instantly: nao tocados, sem trava nova.

## Auto Run Result

Status: done

**Resumo:** o agente agora le o ICP do tenant. Numa conversa nova ele abre com a proposta "Pelo seu ICP: CISO/Head de TI, SP, 201–1000 funcionarios. Ajusto algo?" no card editavel da 24.5 (execucao criada so no primeiro gesto, proposta persistida antes do turno do usuario). Quando o briefing nao traz porte e/ou local, a busca direta usa as faixas e os locais do ICP no lugar do piso 11+ (step, plano e viabilidade pela mesma fonte), e resumo, card, plano, resumo de ajuste e diagnostico dizem que vieram do ICP. Sem ICP com cargos, o estado vazio sugere preencher o ICP; sem ICP nenhum, tudo igual a hoje.

**Arquivos alterados:**
- `src/types/agent.ts` — `IcpSearchDefaults` e `ParsedBriefing.icpDefaults`.
- `src/lib/agent/search-defaults.ts` — `source` no porte efetivo, `resolveSearchLocations`, `hasSearchLocation`, `formatCompanySizesLabel`, filtros diretos com ICP.
- `src/lib/agent/icp-briefing.ts` (novo) — mapa de faixas, `buildIcpSearchDefaults`, proposta e mensagem.
- `src/lib/agent/contextual-suggestions.ts` — `readTenantICP` devolve portes e foco geografico; sugestoes reaproveitam o ICP lido.
- `src/app/api/agent/briefing/icp-proposal/route.ts` (novo) — GET da proposta.
- `src/app/api/agent/briefing/parse/route.ts` — `icpDefaults` no briefing, local do ICP no `canProceed`.
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` — `icpDefaults` no schema do PATCH (faixas canonicas).
- `src/lib/agent/steps/search-leads-step.ts`, `src/lib/services/agent-plan-generator.ts`, `src/lib/agent/empty-search-diagnosis.ts`, `src/lib/agent/briefing-adjustment.ts` — consumidores ICP-aware.
- `src/hooks/use-briefing-flow.ts` — `seedIcpProposal`, resumo, regra de local, rotulos de chip, dica.
- `src/hooks/use-icp-proposal.ts` (novo), `src/hooks/use-icp-definition.ts` — busca e invalidacao da proposta.
- `src/components/agent/AgentChat.tsx`, `AgentMessageList.tsx`, `AgentConfirmationCard.tsx` — abertura com proposta, execucao sob demanda, dica, chips "(do ICP)".
- Testes em 16 arquivos (3 novos de lib/rota + 1 novo de hook).

**Revisao:** 36 achados (0 high, 0 medium, 31 low, 5 false). Patches (todos low): persistencia da proposta sem orfanar a execucao; faixas canonicas no PATCH; chave de cache importada + teste da invalidacao; teste do hook `useIcpProposal`. Deferidos: 0. Rejeitados: 23 low e 5 false (motivos no Triage Log).

**Follow-up review recomendado:** false — so entradas low corrigidas (4), nenhuma high ou medium.

**Verificacao:** `npm run lint` (0 erros, 134 warnings ja existentes), `npm run typecheck` ok, `npm run test:run` 441 arquivos / 8383 testes verdes. Auditoria da matriz I/O: todas as linhas com teste passando.

**Riscos residuais:**
- Sem smoke real: recomendado abrir uma conversa nova num tenant com ICP e conferir proposta + card, e que nenhuma execucao nasce antes do primeiro gesto.
- Fluxo por tecnologia: com local so do ICP, o TheirStack roda sem filtro de pais (o local do ICP vale so na busca de leads).
- Falha de leitura do ICP no servidor mostra a dica de preencher o ICP; o diagnostico de busca vazia mostra so o primeiro local do ICP.
- O LLM pode copiar porte/local do texto da proposta para o briefing num ajuste por texto (valor vira escolha explicita, igual ao ICP).


## Ajuste pós-loop (2026-10-23)

Consulta somente leitura em produção (`scripts/db-ro.sh`): o ICP do tenant tem só `company_sizes: ["11-50"]`, sem cargos, setores nem região. Com a regra original, toda busca do agente sem porte informado ficaria restrita a empresas de 11 a 50 funcionários. Ajuste: `buildIcpSearchDefaults` devolve `null` quando o ICP não tem cargos (mesmo critério da proposta), então um ICP pela metade não estreita a busca; o piso de qualidade de antes continua valendo. Teste novo em `icp-briefing.test.ts`. Lint, typecheck e suíte completa verdes (8636 testes).
