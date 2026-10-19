---
title: '24.4 — Conversa sem becos sem saída'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
baseline_revision: '1952e1f0b355bd765af8d6f3ece2acd29621820e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      O comando anunciado "buscar leads" em awaiting_leads_input depende do LLM; se o /parse devolver import_leads, a instrucao de colar se repete.
    evidence: |-
      maybe-false. O ramo so sai para a busca quando o LLM nao devolve nextAction import_leads (use-briefing-flow.ts, handler awaiting_leads_input); o fallback por palavra-chave so roda quando o /parse falha. Para resolver: rodar o /parse real com a conversa do ramo de leads + "buscar leads" e ver o nextAction devolvido. Se o LLM devolver import_leads, decidir se "buscar leads" exato vira saida deterministica.
    location: >-
      src/hooks/use-briefing-flow.ts (handler awaiting_leads_input)
    severity: medium (unverified)
  - summary: >-
      O resumo do produto diz "Cadastrei o X" antes de o produto ser salvo, e agora termina oferecendo "seguir sem produto".
    evidence: |-
      generateProductSummary (use-briefing-flow.ts:275) usa "Cadastrei" desde antes da 24.4; o cadastro so acontece apos o "sim" em confirming_product. Com a dica de saida no fim, fica ambiguo se algo ficou salvo. Correcao: trocar por "Extrai os dados do X" e ajustar as assercoes de texto.
    location: >-
      src/hooks/use-briefing-flow.ts:275
    severity: low
---

<intent-contract>

## Intent

**Problem:** O chat do agente tem ramos que param de ouvir. Depois de "Cancelar" no plano, o briefing continua `confirmed` e a mensagem seguinte só é persistida, sem resposta. Numa execução confirmada, qualquer texto fora do ajuste fica sem resposta. No cadastro de produto sem nome, o `/parse-product` recebe `productName: ""` (400) e o agente repete "Nao consegui extrair os dados" para sempre. Um "não" na confirmação do produto volta à descrição em loop. No ramo de colar leads, "prefiro buscar" vira "Nenhum lead valido" para sempre. Os turnos de produto, de leads e do AgentChat (confirmação, modo, cancelamento) não entram na memória do LLM, e um produto recém-cadastrado se perde na correção seguinte.

**Approach:** Todo ramo ganha uma saída explícita e toda mensagem recebe resposta. Cancelar o plano reabre o briefing (`confirming`). Texto livre pós-confirmação recebe uma resposta determinística com o estado atual e as opções. O produto ganha o estado `awaiting_product_name` (pergunta o nome uma vez e oferece "seguir sem produto"), com no máximo um ciclo de repetição. O ramo de leads trata a mensagem sem lista como conversa (LLM, com fallback por palavra-chave) e sai para a busca. Todo turno passa por `sendAndRecord`/`recordUserTurn`.

## Boundaries & Constraints

**Always:**
- Toda mensagem do usuário em qualquer estado recebe uma resposta do agente, e toda resposta de ramo de produto ou de leads cita a saída ("seguir sem produto" / "buscar leads").
- Todo turno do usuário e do agente nos ramos de produto, leads, pós-confirmação e nas mensagens do AgentChat (briefing confirmado, modo, execução iniciada, cancelamento, "Desculpe...") entra em `conversationRef`. Um turno de colagem de leads com mais de 2000 caracteres entra truncado em 2000, com o sufixo `\n[...lista truncada]`.
- O `productSlug` atual é preservado quando o parse seguinte devolve `productSlug: null` **e** `productMentioned: null` (o usuário não citou outro produto).
- A resposta pós-confirmação é determinística (sem LLM) e lê os `steps` já carregados. Ela usa `isStepErrorRetryable` da 24.3 para decidir se cita "Tentar novamente".
- Prod-safe (CLAUDE.md): só código do cliente do agente. Sem migration, rota nova, cron, Edge Function, secret ou prompt. Nenhuma trava nova no caminho até o Instantly.

**Never:**
- Não trocar as confirmações por botões nem mexer em `isConfirmation`/`CONFIRMATION_KEYWORDS` (24.5). O `confirming_leads` continua confirmando por palavra-chave.
- Não alterar a rota `/parse`, o `/parse-product`, os prompts, o fluxo de ajuste pós-rejeição (22.13), os chips (22.14) nem os guards da 24.2/24.3.
- Não persistir estado novo no banco nem no `partialize` do store.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cancelar plano | plano visível, clique "Cancelar" | Plano some. O hook volta para `confirming` (briefing mantido). O agente diz que nada foi iniciado e pede o ajuste ou um "sim" para manter | Falha no envio → toast (como hoje) e o hook reabre mesmo assim |
| Mensagem após cancelar | `confirming` após cancelar, "troca pra CFO" | Processada como ajuste pelo fluxo de `confirming` (reparse e novo resumo). Um "sim" reconfirma e reabre o seletor de modo | — |
| Texto pós-confirmação | execução pós-confirm, sem `adjustingStep`, "e agora?" | Mensagem persistida. O agente responde com o estado (step `failed` → cita "Tentar novamente" só se retryable; `awaiting_approval` → botões do card; `running` → etapa N de T; tudo concluído → "Nova conversa"; próximo `pending` → aguardando início; sem steps → em andamento). Os dois turnos entram na memória | — |
| Produto sem nome | `register_product`, `productMentioned` nulo | Estado `awaiting_product_name`. Pergunta o nome e oferece "seguir sem produto" | — |
| Nome informado | `awaiting_product_name`, "O nome é Radar Pro" | `productMentioned = "Radar Pro"` (prefixo "o nome é" removido, máx. 100 caracteres) → `awaiting_product_details` | — |
| Seguir sem produto | `awaiting_product_name`/`awaiting_product_details`/`confirming_product`, "seguir sem produto", "pular" ou "não" exato no pedido de nome | Sai do ramo: `confirming`, `productMentioned`/`pendingProduct` nulos, resumo do briefing | — |
| "Não" na confirmação | `confirming_product`, "nao", nome ainda não pedido | Descarta `pendingProduct` → `awaiting_product_name`, pede o nome uma vez e oferece "seguir sem produto" | Se o nome já foi pedido → sai sem produto com o resumo |
| Extração falha | `awaiting_product_details`, `/parse-product` erro | 1ª falha: pede de novo e oferece "seguir sem produto". 2ª falha: sai sem produto com o resumo | — |
| Correção após cadastro | `confirming` com `productSlug` X, "troca pra CFO" → parse com `productSlug: null`, `productMentioned: null` | O novo briefing mantém `productSlug` X | — |
| Prefere buscar | `awaiting_leads_input`, "prefiro que voce busque", uma linha e sem e-mail | Turno vai ao `/parse`. Se o LLM não indica import, o briefing é reconciliado para busca (`reconcileNonImportBriefing`) e segue `handleParseResult` (pergunta campos ou resumo) | Se o LLM indica import → continua no ramo, repete como colar e oferece "buscar". Se o `/parse` falha → palavra-chave de busca sai do ramo, senão repete a instrução com as duas opções |
| Colagem inválida | `awaiting_leads_input`, 2+ linhas sem e-mail | Comportamento atual ("Nenhum lead valido...") mais a oferta de buscar | — |
| Rejeita leads | `confirming_leads`, texto que não confirma | Se parece colagem (e-mail ou 2+ linhas) → processa como nova colagem. Senão → `awaiting_leads_input` com "cole a lista de leads novamente" e a oferta de buscar | — |

</intent-contract>

## Code Map

- `src/hooks/use-briefing-flow.ts` -- máquina de estados do briefing. `sendAndRecord` (:486) grava o turno do agente. `handleParseResult` (:552) é o roteador (import → `!canProceed` → `register_product` (:705) → oferta de produto (:728) → resumo). Handlers: `awaiting_product_decision` (:783), `awaiting_product_details` (:864, chama `callParseProductAPI` com `state.productMentioned ?? ""`, que o zod da rota rejeita com `min(1)`), `confirming_product` (:894, "não" → descreve de novo em loop), `awaiting_leads_input` (:973, só `parseLeadInput`), `confirming_leads` (:1000), `confirming` (:1028). Os handlers de produto e de leads usam `sendAgentMessage` cru e não empilham o turno do usuário. Helpers reutilizáveis: `normalizeForSignal` (:338), `EMAIL_SIGNAL_REGEX` (:378), `messageSignalsOwnLeads`, `reconcileNonImportBriefing` (:395), `isImportedLeadsFlow`, `generateSmartQuestions`, `generateBriefingSummary`.
- `src/app/api/agent/briefing/parse-product/route.ts:19-23` -- `productName: z.string().min(1)`. Fica intocado, é a causa do loop sem nome.
- `src/app/api/agent/briefing/parse/route.ts:114-134,244-270` -- `resolveProduct` só resolve o slug quando o LLM devolve `productMentioned` nesse turno. É o motivo de o slug se perder numa correção. Fica intocado.
- `src/components/agent/AgentChat.tsx` -- `handleSendMessage` (:747). O fallthrough final (:829-830) só faz `mutate`: é o beco pós-confirmação. `handleCancelPlan` (:929) não reabre o briefing. `sendAndRecordAgent` (:313) já existe. "Briefing confirmado!" (:804), "Desculpe..." (:813), "Modo X selecionado" (:870) e "Execucao iniciada!" (:909) usam `sendAgentMessage` sem gravar na memória. `isPostConfirmExecution` (:741) e `steps` (:150) estão disponíveis.
- `src/lib/agent/step-error-display.ts:57` -- `isStepErrorRetryable(step)` da 24.3, para reuso.
- `src/types/agent.ts:18,369` -- `StepStatus`, `STEP_LABELS`.
- Testes: `__tests__/unit/hooks/use-briefing-flow.test.tsx` (3815 linhas). Asserções que mudam: :928 ("me descreva o produto novamente" → nome) e :2006 ("apenas texto sem email" passa a ser conversa; trocar por colagem de 2 linhas sem e-mail). Continuam válidas: :744 (1ª falha) e :2087. `__tests__/unit/components/agent/AgentChat.test.tsx` -- o mock de `useBriefingFlow` (:104-118) precisa de `reopenBriefing`. :369 e :1148-1200 continuam válidos (só conferem `mutate`/sem `processMessage`). :870-920 (cancelar) continua válido.

## Tasks & Acceptance

**Execution:**
- `src/lib/agent/execution-status-reply.ts` (novo) -- `buildExecutionStatusReply(steps: AgentStep[]): string` puro, sem acentos (padrão das mensagens do agente). Prioridade: `failed` > `awaiting_approval` > `running` > todos concluídos (`completed`/`approved`/`skipped`) > próximo `pending` > lista vazia. Abre dizendo que o briefing já está confirmado e não muda por mensagem, e sempre fecha com uma ação concreta. -- AC2 com fonte única testável.
- `src/hooks/use-briefing-flow.ts` -- (a) novo status `awaiting_product_name`, com um ref de produto (`nameAsked`, `detailFailures`) zerado em `reset`, ao entrar no ramo e ao sair dele. (b) Helpers: `isProductSkip` (normalizado: "sem produto", "seguir sem", "segue sem", "continuar sem", "pular", "pula", "skip", "depois", "nao precisa", "nao quero" e "nao" exato), `extractProductName`, `isSearchPreference` (fallback: "buscar", "busca", "procurar", "pesquisar", "nao tenho"), `toMemoryContent` (truncamento) e `looksLikeLeadPaste` (e-mail ou 2+ linhas não vazias). (c) Um `exitProductFlow(prefix)` único que volta a `confirming` com o resumo. (d) `register_product` sem nome → pergunta o nome. Details sem nome → pergunta o nome. (e) Regras de falha, "não" e skip conforme a Matrix. (f) O ramo de leads conforme a Matrix. (g) Os handlers de produto e de leads empilham o turno do usuário e respondem via `sendAndRecord`. (h) `carryProductSlug` aplicado ao `result.briefing` em `handleParseResult`, `confirming` e `awaiting_product_decision`. (i) Expor `reopenBriefing()`: com briefing → `confirming`, sem briefing → `idle`. -- AC1, AC3, AC4, AC5.
- `src/components/agent/AgentChat.tsx` -- `handleCancelPlan` chama `reopenBriefing()` e envia, via `sendAndRecordAgent`, um texto que diz que nada foi iniciado e oferece ajuste ou "sim". O fallthrough pós-confirmação: `mutate` + `recordUserTurn` + `setAgentProcessing(true)` + `sendAndRecordAgent(buildExecutionStatusReply(steps))` + `refetchMessages` + `setAgentProcessing(false)`. As mensagens de :804, :813, :870 e :909 passam por `sendAndRecordAgent`. -- AC1, AC2, AC5.
- Testes -- cada linha da Matrix: `__tests__/unit/lib/agent/execution-status-reply.test.ts` (novo, todos os ramos de prioridade, retryable sim/não), hook (produto sem nome, nome, skip nos 3 estados, "não" uma vez e depois saída, 2ª falha sai, slug preservado e trocado quando outro produto é citado, leads com prefere-buscar via LLM / LLM-import / parse falha com e sem palavra-chave, colagem 2+ linhas, rejeição em `confirming_leads`, memória dos turnos conferida no body do próximo `/parse`, `reopenBriefing`), AgentChat (cancelar chama `reopenBriefing`, texto pós-confirmação gera a resposta, turnos gravados). Ajustar :928 e :2006. Provar RED nos casos de cancelar, pós-confirmação e produto sem nome.

**Acceptance Criteria:**
- Given o usuário clicou "Cancelar" no plano, when envia uma mensagem, then ela passa pelo fluxo de `confirming` (ajuste) e o agente responde.
- Given uma execução confirmada fora do ajuste, when o usuário escreve qualquer coisa, then o agente responde com o estado atual e as opções disponíveis.
- Given o ramo de produto sem nome ou com "não" na confirmação, when o usuário segue respondendo, then o agente pede o nome no máximo uma vez, oferece "seguir sem produto" e nunca repete o mesmo pedido indefinidamente.
- Given qualquer turno (produto, leads, pós-confirmação, cancelamento), when o próximo `/parse` é chamado, then o body `messages` contém esses turnos, e um produto cadastrado continua no briefing após uma correção.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 33 findings — high 0, medium 2, low 13, false 9, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) A resposta pos-confirmacao podia ser gravada antes da mensagem do usuario (`mutate` nao aguardado) — agora `await mutateAsync` antes da resposta, e a falha da persistencia nao impede a resposta. O mock ganhou `mutateAsync`.
  - `[false]` `[reject]` (blind) O seletor de modo vira beco (a resposta diz que o briefing nao muda) — o input fica desabilitado com o seletor ou o plano visivel (`AgentChat.tsx` `disabled={showModeSelector || showExecutionPlan}`), entao esse texto nao e alcancavel nesses estados.
  - `[medium]` `[patch]` (blind) Palavras de skip ("nao precisa", "depois", "pula") numa descricao real descartam o produto — fora do pedido de nome, o skip agora so vale com expressao explicita ("sem produto", "seguir sem"...) ou com mensagem inteira de ate 3 palavras (alinha o codigo a Design Note). Testes novos.
  - `[low]` `[reject]` (blind) O fallback `isSearchPreference` casa "vou buscar a planilha" — so roda quando o `/parse` falha (raro), e corrigir exigiria mais regras de palavra-chave.
  - `[low]` `[patch]` (blind) O pedido de nome aceita "nao sei" como nome — resposta iniciada por "nao" agora sai sem produto. Teste novo. "sim"/"ok" como nome seguem possiveis (o agente ecoa o nome e o usuario corrige ou sai).
  - `[false]` `[reject]` (blind) "Nao" na confirmacao apos o nome ja pedido sai sem retry — e o comportamento exigido pela story (pede o nome uma vez, nao entra em loop) e pela Matrix.
  - `[low]` `[reject]` (blind) `carryProductSlug` impede remover o produto por correcao ("tira o produto") — pedido raro, e o conserto exige um sinal novo de remocao no parse (ramo e parametro novos).
  - `[false]` `[reject]` (blind) `processLeadPaste` com briefing nulo diz "Nenhum lead valido" — o ramo de leads so e alcancado via `handleParseResult`, que sempre grava `leadsBriefing`. O briefing nao e nulo ali.
  - `[low]` `[reject]` (blind) Conversa em 2+ linhas e tratada como colagem — regra definida na spec. A resposta oferece "buscar leads" e a mensagem seguinte de uma linha sai do ramo.
  - `[low]` `[reject]` (blind) A memoria grava o turno do agente antes do envio dar certo — padrao preexistente do `sendAndRecord` (22.3). So diverge numa falha de rede, que ja gera toast.
  - `[false]` `[reject]` (blind) A resposta de status ignora o status da execucao (paused/cancelled) — uma execucao cancelada nao fica anexada (o cancel limpa o id). `paused` sempre acompanha um step `failed` (ramo proprio) ou um gate rejeitado (ramo de ajuste da 22.13).
  - `[low]` `[reject]` (blind) Falta um teste integrado de Cancelar -> proxima mensagem — o roteamento depende so de `briefingState.status !== "confirmed"`, coberto pelo teste existente "24.2: execucao PRE-confirm ... continua no fluxo de briefing" e pelo teste do hook (`reopenBriefing` -> ajuste).
  - `[false]` `[reject]` (blind) Faltam as Completion Notes — elas ficam no Auto Run Result abaixo, como nas stories anteriores.
  - `[low]` `[patch]` (blind) A regex de "sem acentos" do teste usava caracteres combinantes invisiveis — trocada por `/[\u0300-\u036f]/`.
  - `[medium]` `[patch]` (edge) "sim, nao precisa mudar nada" em `confirming_product` caia no skip — mesma raiz e mesmo patch do skip acima. Alem disso, "nao precisa"/"nao tem problema" saem da checagem de rejeicao em `confirming_product`, para a confirmacao valer. Teste novo.
  - `[medium]` `[patch]` (edge) Descricao com palavra de skip sai do ramo — mesma raiz e mesmo patch.
  - `[low]` `[patch]` (edge) "nao sei" / "ainda nao tem nome" no pedido de nome viram nome — mesmo patch do `^nao`.
  - `[low]` `[reject]` (edge) `extractProductName` nao remove "Ele se chama ..." — o nome e ecoado ("Anotado: ...") e o resumo do produto deixa corrigir ou sair. O conserto e mais regex.
  - `[low]` `[reject]` (edge) `carryProductSlug` nao deixa remover o produto — mesmo motivo da linha da blind.
  - `[medium]` `[patch]` (edge) Mensagem do usuario sem await antes da resposta — mesmo patch do `mutateAsync`.
  - `[low]` `[reject]` (edge) Turno gravado antes do envio — mesmo motivo da linha da blind.
  - `[false]` `[reject]` (edge) Status "aguardando inicio" para execucao cancelada ou falha — mesma refutacao da linha da blind.
  - `[false]` `[reject]` (edge) Leads validos com briefing nulo — mesma refutacao da linha da blind.
  - `[low]` `[reject]` (edge) A pergunta ambigua do `confirming_product` se repete a cada resposta ambigua — e uma repeticao puxada pelo usuario, cada uma oferece "seguir sem produto", e a 24.5 troca essa confirmacao por botoes.
  - `[low]` `[reject]` (edge) Falha persistente do `/api/products` permite ciclos de cadastro — exige falha repetida do servidor. Cada volta oferece a saida, e o caminho de falha de criacao ja existia.
  - `[low]` `[patch]` (verification-gap) Nenhum teste enviava "nao" em `awaiting_product_details` — teste novo: "nao" vai ao `/parse-product` com `productName` "Radar Pro" e termina em `confirming_product`.
  - `[low]` `[patch]` (verification-gap) O fallback por palavra-chave so era testado com briefing incompleto — teste novo com cargo e local: termina em `confirming`, sem `search_leads` e sem `importedLeads`.
  - `[low]` `[reject]` (intent) Cancelar -> ajuste testado em duas metades (mock no AgentChat, hook isolado) — mesmo motivo do teste integrado acima.
  - `[low]` `[reject]` (intent) Os turnos do AgentChat so sao conferidos via mocks de `recordUserTurn`/`recordAgentTurn` — esses seams empilham em `conversationRef`, cujo envio no body do `/parse` e testado no hook.
  - `[medium]` `[patch]` (intent) A lista de skip contradiz a Design Note — mesmo patch do skip.
  - `[low]` `[patch]` (intent) Captura de nome sem validacao ("nao sei") — mesmo patch do `^nao`.
  - `[false]` `[reject]` (intent) A resposta pre-execucao diz "nao muda" com o plano visivel — com o plano visivel o input fica desabilitado, entao o texto nao e alcancavel.
  - `[false]` `[reject]` (intent) Nao da para ver no diff se o RED foi provado — o implementador rodou os 11 testes novos de cancelar, pos-confirmacao e produto sem nome contra o codigo antigo: falharam e passam no novo.

### 2026-10-16 — Review pass
- verdicts: 31 findings — high 0, medium 2, low 20, false 7, maybe-false 2
- findings:
  - `[false]` `[reject]` (blind) O seletor de modo e um beco e a resposta pre-execucao se contradiz — carried: o input fica desabilitado com o seletor ou o plano visivel (`disabled={showModeSelector || showExecutionPlan}`), o texto nao e alcancavel.
  - `[false]` `[reject]` (blind) "nao" em confirming_product pede o nome de novo mesmo com o nome conhecido — e o comportamento exigido pela Matrix ("Descarta pendingProduct -> awaiting_product_name, pede o nome uma vez").
  - `[low]` `[reject]` (blind) "Nao, o nome e Radar Pro" no pedido de nome vira skip (`/^nao\b/`) — resposta improvavel a "qual e o nome?"; separar negacao de nome exige ramo novo.
  - `[low]` `[reject]` (blind) Nome e descricao juntos viram o nome inteiro — o nome e ecoado ("Anotado: ...") e o resumo permite recusar; separar exige heuristica nova (mesmo motivo do "Ele se chama" da 1a passada).
  - `[low]` `[reject]` (blind) Falha repetida do createProduct gera ciclo sem limite e "tentar novamente" pede a descricao — carried: exige falha persistente do servidor, cada volta oferece a saida, caminho preexistente.
  - `[low]` `[defer]` (blind) "Cadastrei o X" antes de salvar, agora com a oferta de "seguir sem produto" — texto preexistente; registrado em `deferred`.
  - `[low]` `[reject]` (blind) `isProductRejection` por substring ("os outros campos ok" = rejeicao) — matcher preexistente; o caso ambiguo repete a pergunta com a saida; reescrever o matcher encosta no escopo da 24.5.
  - `[low]` `[reject]` (blind) Em confirming_leads "pode buscar voce" confirma o import, e o preview nao cita "buscar leads" — a confirmacao por substring e preexistente (Never: nao mexer em `isConfirmation`); qualquer resposta que nao confirma leva a oferta de busca em 1 turno, e acrescentar a dica no preview faria "buscar leads" cair em "cole novamente" sem um ramo novo.
  - `[maybe-false]` `[reject]` (blind) Turnos pos-confirmacao na memoria podem atrapalhar o parseAdjustment da 22.13 — a intent exige esses turnos em `conversationRef` ("Os dois turnos entram na memoria"); fora do escopo por definicao da intent.
  - `[low]` `[reject]` (blind) A resposta de status pode usar `steps` desatualizados — `steps` esta nas deps do callback e vem do realtime; a janela e de milissegundos, e refetch antes da resposta somaria latencia.
  - `[low]` `[reject]` (blind) Falha ao gravar a mensagem do usuario e engolida e o agente responde mesmo assim — escolha deliberada da 1a passada (a resposta nao pode virar beco); so ocorre em falha de rede, que o `onError` do `useSendMessage` ja trata.
  - `[low]` `[reject]` (blind) Faltam testes (cancelar -> "sim", ramo final do pre-execucao, "seguir sem produto" no awaiting_product_decision, falsos positivos de colagem) — o ramo pre-execucao nao e alcancavel pela UI; "seguir sem produto" no decision sai pelo LLM ou pelo fallback (`isProductRejection` casa "sem produto"); cancelar -> ajuste ja e coberto no hook.
  - `[low]` `[reject]` (blind) `isSearchPreference` amplo demais — carried: so roda quando o `/parse` falha.
  - `[false]` `[reject]` (blind) Diff sem registro de impacto em producao — carried: as Completion Notes ficam no Auto Run Result.
  - `[medium]` `[patch]` (edge) Em confirming_leads, nova colagem com "sim"/"ok" no e-mail (simone@..., @okta.com) confirmava a lista ANTIGA (`isConfirmation` por substring rodava antes) — `looksLikeLeadPaste` agora vem antes de `isConfirmation`. Teste novo com RED provado.
  - `[medium]` `[patch]` (edge) "ok, nao precisa" / "sim, nao precisa" (ate 3 palavras) em confirming_product caia no skip curto e descartava o produto confirmado — o skip agora exige `!isConfirmation(content)` nesse estado. Teste novo com RED provado.
  - `[low]` `[reject]` (edge) "sim"/"ok"/"troca pra CFO" no pedido de nome viram nome — carried: residual da 1a passada; o nome e ecoado e o usuario corrige ou sai.
  - `[maybe-false]` `[defer]` (edge) "buscar leads" depende do LLM e pode repetir as instrucoes — so o /parse real resolve; registrado em `deferred` (medium, nao verificado).
  - `[low]` `[reject]` (edge) `carryProductSlug` impede remover o produto por correcao — carried.
  - `[false]` `[reject]` (edge) `processLeadPaste` com briefing nulo — carried: o ramo de leads so e alcancado com `leadsBriefing` gravado.
  - `[low]` `[reject]` (edge) Ciclo sem limite quando o createProduct falha — carried (mesmo motivo da linha da blind).
  - `[low]` `[patch]` (verification-gap) Sem teste do caminho "proceed" preservando o `productSlug` — teste novo: "sim" com parse `proceed`, `productSlug: null` e `productMentioned: null` termina `confirmed` com `prod-123`.
  - `[low]` `[patch]` (verification-gap) Sem asserção da ordem gravacao -> resposta nem da falha de gravacao — o mock ganhou `mockMutateAsync`; testes novos: a resposta so sai depois de resolvida a gravacao, e uma gravacao rejeitada ainda gera a resposta sem toast.
  - `[low]` `[reject]` (verification-gap) Os ramos de seletor/plano do `buildPreExecutionReply` nao sao alcancaveis pela UI — defensivo e inofensivo; remover so tira a resposta caso o input deixe de ser desabilitado.
  - `[low]` `[reject]` (intent) Cancelar -> "sim" -> seletor de modo sem teste ponta a ponta — carried (mesmo motivo do teste integrado da 1a passada).
  - `[false]` `[reject]` (intent) Responder antes da execucao vai alem da Matrix — a intent pede resposta "em qualquer estado"; nao e defeito.
  - `[false]` `[reject]` (intent) Remover "nao precisa" da rejeicao muda a semantica da confirmacao (24.5) — `isConfirmation`/`CONFIRMATION_KEYWORDS` seguem intocados, que e o que o Never proibe.
  - `[low]` `[reject]` (intent) Nome de produto comecando com "Nao..." vira skip — raro, mesmo motivo do "Nao, o nome e" acima.
  - `[false]` `[reject]` (intent) Colagem sem briefing responde "Nenhum lead valido" — carried.
  - `[low]` `[reject]` (intent) O ramo nao-retryable so e testado no helper — o helper e a fonte unica; o AgentChat so repassa `steps`.
  - `[low]` `[reject]` (intent) AgentChat testado com hook mockado e sem LLM real — carried (os seams gravam em `conversationRef`, cujo envio e testado no hook).

## Design Notes

- **Resposta pós-confirmação determinística:** o estado já está em `steps`, e uma chamada de LLM aqui somaria latência (NFR < 5s) sem decidir nada. O texto só aponta para controles que já existem: o card do gate, o "Tentar novamente" da 24.3 e "Nova conversa".
- **Por que "seguir sem produto" sai também com "não" exato só no pedido de nome:** ali "não" responde "qual o nome?". No `awaiting_product_details`, uma descrição pode conter "não" ("não é SaaS"), então só valem as expressões explícitas de skip.
- **Leads: colagem × conversa.** Uma linha sem e-mail é conversa e vai ao LLM. Duas ou mais linhas são tentativa de colagem e mantêm o retorno de rejeição. O LLM ainda indicar import dentro do ramo **mantém** o usuário nele ("espera, vou pegar a lista"). A âncora da 22.11 só vale para **entrar** no ramo.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/hooks/use-briefing-flow.test.tsx __tests__/unit/components/agent/AgentChat.test.tsx __tests__/unit/lib/agent/execution-status-reply.test.ts` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: 0 erros de lint, typecheck limpo, suíte verde

## Auto Run Result

Status: done

**Resumo (passada de acompanhamento):** a story 24.4 ja estava implementada (nenhum ramo do chat do agente fica sem resposta ou sem saida). Esta passada revisou o diff desde `1952e1f0b355bd765af8d6f3ece2acd29621820e` e corrigiu 2 defeitos medios:
- **Colagem nova em `confirming_leads`:** um e-mail com "sim"/"ok"/"vai"/"pode" no texto (simone@..., @okta.com) confirmava a lista antiga. A checagem de colagem agora vem antes da confirmacao.
- **"ok, nao precisa" em `confirming_product`:** caia no skip curto e descartava o produto confirmado. Nesse estado, uma mensagem que tambem confirma nao e mais skip.

**Arquivos alterados nesta passada:**
- `src/hooks/use-briefing-flow.ts` -- ordem colagem/confirmacao em `confirming_leads` e skip sem confirmacao em `confirming_product`.
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` -- 3 testes novos (colagem com "simone@okta.com", "ok, nao precisa" cadastra, "sim" com `proceed` mantem o `productSlug`).
- `__tests__/unit/components/agent/AgentChat.test.tsx` -- `mockMutateAsync` controlavel e 2 testes novos (ordem gravacao -> resposta e gravacao rejeitada ainda responde).

**Review:** 31 findings (high 0, medium 2, low 20, false 7, maybe-false 2).
- **Patches:** 4 entradas (medium 2, low 2): os 2 defeitos acima e os 2 testes de lacuna da verification-gap.
- **Deferidos:** 2 (`deferred` no frontmatter): "buscar leads" dependente do LLM (medium, nao verificado) e o texto "Cadastrei" antes de salvar (low, preexistente).
- **Rejeitados:** 25, cada um com o motivo no Review Triage Log (7 false, 1 maybe-false fora do escopo pela intent, 17 low).

**Follow-up review recomendado:** false. Passada de acompanhamento sem nenhum patch `high` (patcheados: medium 2, low 2); o trabalho convergiu.

**Verificacao:** os testes da story (3 arquivos, 246 testes) verdes. RED provado: os 2 testes novos do hook falham contra o codigo pre-patch (HEAD) e passam no patch. `npm run lint`: 0 erros (134 warnings preexistentes). `npm run typecheck`: limpo. `npm run test:run`: 414 arquivos, 7739 testes passando, 2 skipped.

**Completion Notes (CLAUDE.md, regra no 1) -- por analise do diff, sem smoke real:**
- **O que pode mudar para o cliente:** so o chat do agente TDec (cliente): a ordem de checagem em `confirming_leads` e o skip em `confirming_product`. Sem rota, prompt de IA, tabela, migration, job `pg_cron`, Edge Function ou secret.
- **(1) Campanhas rodando, webhook e `reply-sweep`:** intocados, nenhum arquivo desses caminhos foi alterado.
- **(2) Busca de leads:** o fluxo manual e os steps de busca estao intocados; a mudanca so afeta a conversa antes do confirm.
- **(3) Criacao de campanha e envio ao Instantly:** export, ativacao, `instantly.ts` e os guards da 24.2/24.3 intocados. Nenhuma trava nova no caminho ate o Instantly.
- **Conclusao:** nenhum dos 3 pontos e afetado.

**Riscos residuais:**
- "buscar leads" em `awaiting_leads_input` depende do LLM nao devolver `import_leads` (deferido, nao verificado).
- Confirmacao por substring (`isConfirmation`) segue preexistente: em `confirming_leads`, "pode buscar voce" confirma o import (24.5 troca por botoes).
- Os riscos residuais da 1a passada continuam: remover o produto por correcao, "sim"/"ok" como nome e memoria do chat so no cliente.
- `sprint-status.yaml` ficou como o orquestrador deixou.

## Smoke em produção (2026-10-19)

Deploy via PR #8 (merge `9d61b30` na `main`, Vercel prod OK). Fabossi rodou o agente em produção no modo Guiado até a revisão da campanha, sem exportar para o Instantly, e confirmou que está funcionando. Nenhuma campanha foi criada no Instantly nem ativada pelo smoke.
