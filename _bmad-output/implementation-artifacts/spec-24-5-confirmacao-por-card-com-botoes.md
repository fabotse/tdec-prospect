---
title: '24.5 — Confirmação por card com botões'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: '5019c67a9b6cfafaaa27ddbf1dec6c7ca33a03a1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Se o createProduct falha, o "tentar novamente" pede a descricao de novo e perde os dados ja extraidos.
    evidence: |-
      Preexistente (24.4 e antes): a falha leva a awaiting_product_decision. Um "sim" vai para enterProductDetails, que pede a descricao em vez de reenviar o pendingProduct. Nesse estado o card some. Para corrigir, manter confirming_product com o pendingProduct e reoferecer "Confirmar".
    location: >-
      src/hooks/use-briefing-flow.ts (processCardAction, case confirm_product)
    severity: low
---

<intent-contract>

## Intent

**Problem:** As três confirmações do chat do agente (briefing, produto, leads próprios) são decididas por texto. O `isConfirmation` casa substring de `CONFIRMATION_KEYWORDS`, então "não, pode trocar pra CFO" (contém "pode") confirma o briefing no fallback, e o guard híbrido do `confirming` confirma qualquer texto com "sim"/"ok" quando o LLM não muda o briefing. No produto e nos leads, a keyword é o único caminho de decisão.

**Approach:** Enquanto o hook está em `confirming`, `confirming_product` ou `confirming_leads`, um card de confirmação aparece abaixo das mensagens. O do briefing mostra os campos como chips editáveis e os botões "Confirmar"/"Ajustar". O do produto mostra os dados extraídos e "Confirmar"/"Refazer cadastro"/"Seguir sem produto". O dos leads mostra a contagem e "Confirmar leads"/"Colar outra lista". A confirmação só acontece pelo clique. Texto digitado com o card visível vai para o LLM como ajuste. A keyword fica só como fallback quando o LLM falha e nunca confirma sozinha.

## Boundaries & Constraints

**Always:**
- Texto digitado em `confirming`/`confirming_product`/`confirming_leads` nunca leva a `confirmed`, nem cadastra o produto, nem aceita os leads, qualquer que seja o `nextAction` do LLM ou a keyword.
- Cada clique gera um turno do usuário (rótulo do botão ou do ajuste de chip) persistido via `sendMessageMutation` e gravado em `conversationRef`, e a resposta do agente sai via `sendAndRecord`. A memória fica coerente para o próximo `/parse`.
- Chip editado altera só aquele campo do `state.briefing`, sem chamar `/parse`. Os valores ficam dentro do schema do PATCH `/briefing`: `jobTitles` com 1+ itens (separados por vírgula), `location` não vazia, `emailCount` inteiro de 1 a 10, `objective`/`urgency` só os enums, textos com trim e vazio virando `null` (exceto cargos e localização, que não podem ficar vazios). Valor inválido não altera nada e mostra o erro inline.
- Editar `technology` fora do fluxo de leads importados re-deriva `skipSteps` pela regra de `reconcileNonImportBriefing`. No fluxo importado, `skipSteps` fica intacto.
- O card só aparece numa execução pré-confirm, sem `adjustingStep`, sem seletor de modo e sem plano visível. Os botões ficam desabilitados com `isAgentProcessing`, o que evita duplo clique.
- Prod-safe (CLAUDE.md): só código cliente do agente. Sem migration, rota nova, prompt, cron, Edge Function ou secret. Nenhuma trava nova no caminho até o Instantly.

**Never:**
- Não alterar `CONFIRMATION_KEYWORDS`, `briefing-adjustment.ts` nem o fluxo de ajuste pós-rejeição (22.13). A confirmação de re-execução da 22.13 continua por texto.
- Não alterar as rotas `/parse`, `/parse-product` e `/briefing`, os prompts, o `awaiting_product_decision` (decisão por LLM da 22.4) nem os guards da 24.2/24.3.
- Não persistir o card no banco nem no `partialize` do store: ele é derivado do estado do hook.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Card do briefing | `confirming` com briefing | Resumo textual (mantém "Confirma esses parametros?" e acrescenta a instrução do card) + card com os chips e "Confirmar"/"Ajustar" | — |
| Clique Confirmar | `confirming`, cargo e local presentes | `confirmed`. O AgentChat salva o briefing (PATCH), envia "Briefing confirmado!..." e abre o seletor de modo | Sem cargo/local → não confirma e pede os campos |
| Clique Ajustar | `confirming` | Continua `confirming`. O agente pede que edite um chip ou diga o que mudar | — |
| Edita chip | "Localizacao" → "Campinas" | `briefing.location = "Campinas"`. O card atualiza. Turno "Ajustei Localizacao: Campinas" na memória e no histórico | Vazio/inválido → erro inline, nada muda |
| Texto "sim" | `confirming`, LLM `proceed` e briefing inalterado | Não confirma. O agente reapresenta o resumo com "clique em Confirmar no card" | — |
| Texto "não, pode trocar pra CFO" | `confirming` | `/parse` → correção aplicada e novo resumo + card (via `handleParseResult`) | — |
| LLM falha | `confirming`, `/parse` erro | Não confirma. Responde que não conseguiu processar e que pode clicar em Confirmar ou tentar descrever o ajuste. Fica em `confirming` | — |
| Card do produto | `confirming_product` | Dados do produto + "Confirmar"/"Refazer cadastro"/"Seguir sem produto" | — |
| Confirmar produto | clique | `createProduct` → "Produto cadastrado!" + resumo do briefing (`confirming`) | Falha → mensagem de erro de hoje (`awaiting_product_decision`) |
| Refazer / Seguir sem | clique | Mesma regra da 24.4: pede o nome uma vez, senão sai sem produto / sai sem produto com o resumo | — |
| Texto no produto | `confirming_product`, "o publico e CFO" | `/parse-product` com os dados atuais + a correção → novo resumo e card (`confirming_product`). Nunca cadastra | Falha → mantém os dados e oferece os botões. Skip explícito ("seguir sem produto") sai como na 24.4 |
| Card dos leads | `confirming_leads` | Prévia + "Confirmar leads"/"Colar outra lista" | — |
| Confirmar leads | clique | `confirming` + resumo do briefing (card do briefing) | — |
| Colar outra lista | clique | `awaiting_leads_input` com a instrução de colar + "buscar leads" | — |
| Texto nos leads | `confirming_leads`, sem cara de colagem | Mesmo tratamento conversacional do `awaiting_leads_input` (24.4). Se o LLM indica import → fica em `confirming_leads` e aponta os botões. Senão sai para a busca | `/parse` falha → `isSearchPreference` sai para a busca. Senão aponta os botões |

</intent-contract>

## Code Map

- `src/hooks/use-briefing-flow.ts` -- máquina de estados. `generateBriefingSummary` (:190, termina em "Confirma esses parametros?", com 7 asserções de teste que dependem disso), `generateProductSummary` (:276), `formatLeadPreview` (:546). `isConfirmation` (:286) e `isProductRejection` (:321). `confirming` (~:1360): guard híbrido `keywordConfirmed` + `nextAction === "proceed"` confirmam, e o `catch` confirma por keyword. **Este é o defeito.** `confirming_product` (~:1155) confirma/rejeita por keyword. `confirming_leads` (~:1325) confirma por keyword. `awaiting_leads_input` (~:1290) tem o caminho conversacional reaproveitável. Helpers 24.4: `exitProductFlow`, `askProductName`, `processLeadPaste`, `repeatLeadsInstructions`, `carryProductSlug`, `reconcileNonImportBriefing`, `isImportedLeadsFlow`, `briefingChanged`, `withRequiredMissing`. `sendAndRecord` grava o turno do agente. `productFlowRef` guarda os contadores da 24.4.
- `src/components/agent/AgentChat.tsx` -- `handleSendMessage` (~:760) roteia ao hook. `result.confirmed` → `saveBriefing` + "Briefing confirmado!" + `setShowModeSelector(true)`: extrair para reuso no clique. `saveBriefing` fecha sobre `briefingState.briefing`. `handleCancelPlan` (~:962), cujo texto diz 'responda "sim"' e deve passar a apontar o card. O render (~:1100) tem o padrão `AgentModeSelector`/`AgentExecutionPlan` abaixo de `AgentMessageList`. `AgentInput` fica `disabled={showModeSelector || showExecutionPlan}` e continua habilitado com o card. `isPostConfirmExecution`, `adjustingStep` e `isAgentProcessing` estão disponíveis.
- `src/components/agent/AgentModeSelector.tsx` -- referência de estilo do card (`border-t px-6 py-4`, `Button`, `data-testid`).
- `src/app/api/agent/executions/[executionId]/briefing/route.ts:19-70` -- schema do PATCH (só leitura). Define os limites dos chips: `emailCount` de 1 a 10, enums de `objective`/`urgency`, `campaignDescription` até 200, `segmentName` até 100 code points.
- `src/types/agent.ts:111` -- `ParsedBriefing`.
- `src/lib/agent/execution-status-reply.ts:73` -- `buildPreExecutionReply`, sem menção a "sim" (intocado).
- Testes: `__tests__/unit/hooks/use-briefing-flow.test.tsx` (cerca de 17 asserções confirmam por "sim" digitado e 18 usam `createProduct`), `__tests__/unit/components/agent/AgentChat.test.tsx` (o mock de `useBriefingFlow` precisa das novas funções).

## Tasks & Acceptance

**Execution:**
- `src/hooks/use-briefing-flow.ts` -- (a) Novo `processCardAction(action, executionId, sendAgentMessage, createProduct?)` com as ações `confirm_briefing | adjust_briefing | confirm_product | redo_product | skip_product | confirm_leads | redo_leads`. Ele valida o status atual (ação fora do estado → `{handled:false}`), empilha o turno do usuário com o rótulo e responde via `sendAndRecord`. Devolve `{handled, confirmed?}`. `confirm_briefing` só confirma com cargo e local. (b) Novo `editBriefingField(field, raw, executionId, sendAgentMessage)` com a validação da Boundaries. Devolve `{ok, error?}` e grava os turnos. (c) Exportar `BRIEFING_FIELD_LABELS` e o tipo `BriefingCardField`. (d) No `confirming`, remover a confirmação por texto: `proceed`/keyword sem mudança → reapresenta o resumo com a dica do botão. O `catch` não confirma. (e) `confirming_product`: o texto vira correção via `/parse-product`, com uma mensagem que junta os dados atuais e a correção. O skip explícito da 24.4 continua (com `!isConfirmation`). (f) `confirming_leads`: colagem → `processLeadPaste`. O resto segue o caminho conversacional do `awaiting_leads_input`, extraído para um helper. (g) Os textos de resumo do briefing, do produto e dos leads ganham a instrução do card. Mantém o "Confirma esses parametros?". -- AC1, AC2, AC3.
- `src/components/agent/AgentConfirmationCard.tsx` (novo) -- card com 3 variantes (`briefing`/`product`/`leads`). Os chips do briefing abrem um editor inline: input de texto, ou select para `objective`/`urgency`, com salvar e cancelar, e mostram o erro devolvido. Cada botão tem `data-testid` e fica desabilitado via a prop `disabled`. Usa rótulos sem acento, no padrão das mensagens do agente. -- AC1.
- `src/components/agent/AgentChat.tsx` -- renderiza o card quando `briefingState.status ∈ {confirming, confirming_product, confirming_leads}`, `!isPostConfirmExecution`, `!adjustingStep`, `!showModeSelector` e `!showExecutionPlan`. `handleCardAction`: `sendMessageMutation.mutate(rótulo)`, depois `setAgentProcessing`, `processCardAction`, `confirmed` → `finishBriefingConfirmation` (helper extraído do caminho de hoje), `refetchMessages`. `handleChipEdit` segue o mesmo padrão. O texto do `handleCancelPlan` passa a apontar o card. -- AC1, AC2, AC3.
- Testes -- hook: cada linha da Matrix. Inclui "sim" e "pode ir" digitados que não confirmam mais (com RED contra o código atual), o catch que não confirma, as ações fora de estado, a validação dos chips (vazio, emailCount 0/11, enum inválido), `technology` re-derivando `skipSteps` e a memória dos cliques no body do próximo `/parse`. Atualizar os testes que confirmavam por texto para usar `processCardAction`. Componente: `__tests__/unit/components/agent/AgentConfirmationCard.test.tsx` (novo) cobre as variantes, a edição de chip e o erro inline. AgentChat: card visível/oculto conforme o estado, clique Confirmar → PATCH + seletor de modo, e o texto do cancelar.

**Acceptance Criteria:**
- Given o briefing completo, when o agente apresenta o resumo, then aparece um card com os campos em chips editáveis e os botões "Confirmar" e "Ajustar".
- Given o card visível, when o usuário digita qualquer texto (inclusive "sim" ou "não, pode trocar pra CFO"), then o texto vai ao `/parse` como ajuste e a execução nunca é confirmada por ele.
- Given a confirmação de produto ou de leads próprios, when o usuário decide, then a decisão é tomada por botão, e nenhuma keyword confirma, cadastra ou aceita leads, nem quando o LLM falha.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 31 findings — high 0, medium 2, low 23, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) Um clique com `handled:false` deixa o rotulo gravado no historico sem resposta — o card e derivado do mesmo `briefingState` que o hook checa, e os botoes ficam desabilitados com `isAgentProcessing`. O `handled:false` so ocorre com status trocado entre o render e o clique sem processamento, o que nao e alcancavel no uso normal. O conserto exigiria um guard novo.
  - `[low]` `[reject]` (blind) Uma edicao de chip recusada pelo hook deixa "Ajustei X: Y" no historico — o editor so existe com o card do briefing visivel (`confirming`). A recusa por status nao e alcancavel no uso normal.
  - `[low]` `[reject]` (blind) `handleChipEdit` nao checa `isAgentProcessing` — o editor e os chips ficam desabilitados com `disabled={isAgentProcessing}`. Sem chamada programatica, nao e alcancavel.
  - `[low]` `[defer]` (blind) Uma falha do createProduct faz o "tentar novamente" pedir a descricao de novo — o caminho e preexistente (`awaiting_product_decision` desde a 24.4). Registrado em `deferred`.
  - `[false]` `[reject]` (blind) `confirm_leads` com briefing nulo trava a conversa — `confirming_leads` so e alcancado por `processLeadPaste`, que exige `state.briefing`. Com briefing nulo, ele cai em "Nenhum lead valido".
  - `[false]` `[reject]` (blind) O card de leads permite confirmar 0 leads — `processLeadPaste` so entra em `confirming_leads` com `accepted.length > 0`.
  - `[low]` `[reject]` (blind) No fluxo importado, o card mostra chips de busca e nao a contagem de leads — e cosmetico: a contagem esta no resumo textual ("N leads importados serao usados"), e editar esses chips e inofensivo. Trocar os chips por fluxo exige ramos novos.
  - `[low]` `[reject]` (blind) A assinatura de `processMessage` mantem `createProduct`, que ficou sem uso — o parametro opcional na interface publica e mantido para nao quebrar os chamadores. So causa confusao de leitura.
  - `[false]` `[reject]` (blind) O ramo `result.confirmed` em `handleSendMessage` reabre a confirmacao por texto — o hook nao devolve `confirmed` por texto em nenhum estado (testes 24.5 do hook com "sim", "pode ir", proceed e catch). O ramo e so defensivo e leva ao mesmo desfecho do clique.
  - `[low]` `[patch]` (blind) Acessibilidade do editor: o foco nao vai ao campo e o icone de lapis e anunciado — `autoFocus` no input e no select, e `aria-hidden` no Pencil.
  - `[low]` `[reject]` (blind) Descricao vazia aparece em branco, e "Confirmar" e o mesmo rotulo para briefing e produto — o `/parse-product` sempre devolve descricao, e o turno fica no contexto da conversa. E cosmetico.
  - `[low]` `[reject]` (blind) "sim" digitado reenvia o resumo inteiro, e a instrucao do card aparece duas vezes — e o comportamento da Matrix ("reapresenta o resumo com 'clique em Confirmar no card'"). A repeticao e cosmetica.
  - `[low]` `[reject]` (blind) As Completion Notes dizem que nao houve smoke real — a mudanca so toca a conversa antes da confirmacao. O PATCH `/briefing` tem o mesmo shape, e os steps, o Apollo e o Instantly ficam intocados. A analise do diff segue o padrao da 24.4. A ausencia de smoke esta registrada nos riscos residuais.
  - `[low]` `[reject]` (blind) Os desvios (confirmacao do importado, "sim" nos leads) nao foram registrados no Spec Change Log — o conserto seria editar a spec deste build. Os desvios estao registrados nas Completion Notes.
  - `[low]` `[patch]` (blind) Faltam testes no AgentChat (o throw do `processCardAction`, a flag de processamento) — agrupado com a lacuna da verification-gap: testes novos de rejeicao e asserts de `setAgentProcessing(false)`.
  - `[low]` `[reject]` (edge) Clique com `handled:false` sem resposta — mesmo motivo do achado da blind.
  - `[low]` `[reject]` (edge) Chip recusado com o turno ja gravado — mesmo motivo do achado da blind.
  - `[low]` `[patch]` (edge) Se o `refetchMessages` rejeita no `finally`, o `setAgentProcessing(false)` nao roda — o refetch agora fica em try/catch nos dois handlers novos.
  - `[medium]` `[patch]` (edge) Se o `saveBriefing` lanca depois do hook ja estar `confirmed`, a conversa trava sem card nem seletor — agora o `saveBriefing` devolve um boolean e, na falha, `finishBriefingConfirmation` chama `reopenBriefing()` e nao abre o seletor. Ha teste novo.
  - `[medium]` `[patch]` (edge) Com PATCH `/briefing` nao-ok, o seletor de modo abre mesmo sem o briefing salvo — mesma raiz e mesmo patch: volta ao card, sem "Briefing confirmado!".
  - `[low]` `[patch]` (edge) No input numerico, "e" ou "-" zeram o `emailCount` em silencio — o campo passou a ser `type="text"` com `inputMode="numeric"`, entao o erro aparece inline.
  - `[false]` `[reject]` (edge) Uma chave de prototipo ("constructor") no enum entra no briefing — o valor vem so das `<option>` do select (as chaves de OBJECTIVE_LABELS/URGENCY_LABELS). Nao ha entrada livre.
  - `[false]` `[reject]` (edge) O createProduct devolve id com o briefing nulo — o ramo de produto so e alcancado com `canProceed`, via `handleParseResult`, que grava o briefing. `state.briefing` nunca e nulo ali.
  - `[low]` `[reject]` (edge, claim) A AC2 diz que todo texto vai ao `/parse`, mas leads e produto usam keyword antes — nenhuma dessas keywords confirma, cadastra ou aceita (a regra da intent). O conserto seria editar a spec deste build.
  - `[low]` `[patch]` (verification-gap) Nenhum teste cobre "sim, pode buscar" em `confirming_leads` — teste novo: o `/parse` e chamado 1 vez, o status sai de `confirming_leads` e os leads importados sao descartados.
  - `[low]` `[patch]` (verification-gap) Os testes do card no AgentChat nao conferem a limpeza da flag de processamento — `toHaveBeenLastCalledWith(false)` nos testes de clique e de chip, e teste novo com o `processCardAction` rejeitado (toast + flag).
  - `[low]` `[reject]` (verification-gap, other) O turno do chip fica gravado mesmo se o hook recusa — mesmo motivo do achado da blind.
  - `[low]` `[reject]` (intent) A keyword ainda decide fora do fallback (skip do produto, "sim" nos leads, reapresentacao no briefing) — nenhuma dessas decisoes confirma nada. A regra "sem confirmar nada sozinho" e respeitada, e o conserto seria editar a spec.
  - `[low]` `[reject]` (intent) `confirm_briefing` aceita o fluxo importado sem cargo/localizacao — espelha o `canProceed` do `/parse` para esse fluxo. Sem isso, o fluxo de leads proprios travaria no card. O conserto seria editar a spec.
  - `[low]` `[reject]` (intent) Os testes ficam so na camada de unidade (AgentChat com o hook mockado), sem smoke real — o hook real e testado nos estados e na memoria, e o AgentChat no roteamento. A falta de smoke esta nos riscos residuais.
  - `[false]` `[reject]` (intent) A 22.13 e a 22.4 nao viraram botoes — a story 24.5 do epico lista so briefing, produto e leads. A re-execucao da 22.13 e a decisao da 22.4 ficam fora da intent.

## Design Notes

- **Card derivado do estado, não persistido:** execuções `pending` não reatacham (22.10). O card vive só enquanto o hook está num estado de confirmação, sem migration nem metadado novo de mensagem. O resumo textual continua sendo enviado e serve de registro e de memória do LLM.
- **Chip sem LLM:** como no chip da 22.14, o valor editado é exato, e mandá-lo ao `/parse` só somaria latência e risco de alucinação. O turno "Ajustei X: Y" mantém a memória coerente para correções por texto depois.
- **Correção de produto por texto:** o `/parse-product` recebe a mensagem `"Dados atuais do produto: ...\nCorrecao do usuario: <texto>"`. A rota fica intocada (o campo é string livre) e o LLM aplica o ajuste sem perder o resto.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/hooks/use-briefing-flow.test.tsx __tests__/unit/components/agent/AgentChat.test.tsx __tests__/unit/components/agent/AgentConfirmationCard.test.tsx` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: 0 erros de lint, typecheck limpo, suíte verde

## Completion Notes

- **O que pode mudar para o cliente:** só o chat do agente antes da confirmação do briefing. Arquivos: `src/hooks/use-briefing-flow.ts`, `src/components/agent/AgentChat.tsx`, `src/components/agent/AgentConfirmationCard.tsx` (novo) e os testes. As rotas (`/parse`, `/parse-product`, `/briefing`, `/products`) são as mesmas e são chamadas com o mesmo formato. O `/parse-product` agora também recebe a mensagem de correção `Dados atuais do produto: ...\nCorrecao do usuario: ...`, que é uma string livre. Sem migration, prompt, cron, Edge Function, secret ou variável.
- **Os 3 pontos (verificados por análise do diff, sem smoke real):** (1) Campanhas rodando, webhook e `reply-sweep`: nada tocado. (2) Busca de leads: os steps e o Apollo não foram tocados. O briefing salvo pelo PATCH tem o mesmo shape, e o chip de tecnologia re-deriva `skipSteps` pela mesma regra do `/parse`. (3) Criação de campanha e export/ativação no Instantly: nada tocado e nenhuma trava nova. A única mudança é que confirmar o briefing exige um clique em vez de "sim".
- **Desvios menores:** `confirm_briefing` aceita também o fluxo de leads importados sem cargo/localização, quando há leads, espelhando o `canProceed` do `/parse`, porque senão esse fluxo travaria. Em `confirming_leads`, "sim"/"ok" digitado (keyword sem pedido de busca) aponta os botões sem chamar o LLM, para não descartar a lista colada saindo para a busca.
- **Verificação:** `npm run lint` (0 erros), `npm run typecheck` e `npm run test:run` (415 arquivos, 7796 testes) passaram.

## Auto Run Result

Status: done

**Resumo:** as tres confirmacoes do chat do agente (briefing, produto e leads proprios) agora so acontecem por clique num card abaixo das mensagens. O card do briefing tem chips editaveis, sem LLM e validados contra o schema do PATCH, e os botoes "Confirmar"/"Ajustar". O do produto tem "Confirmar"/"Refazer cadastro"/"Seguir sem produto", e o dos leads tem "Confirmar leads"/"Colar outra lista". Texto digitado vira ajuste: vai ao `/parse` no briefing e ao `/parse-product` no produto. Nenhuma keyword confirma, nem quando o LLM falha.

**Arquivos alterados:**
- `src/hooks/use-briefing-flow.ts` -- `processCardAction`, `editBriefingField`, `parseBriefingFieldInput`. A confirmacao por texto saiu de `confirming`, `confirming_product` e `confirming_leads`.
- `src/components/agent/AgentConfirmationCard.tsx` (novo) -- o card com as 3 variantes e o editor de chip.
- `src/components/agent/AgentChat.tsx` -- renderiza o card, `handleCardAction`, `handleChipEdit` e `finishBriefingConfirmation` (volta ao card se o PATCH falhar). O texto do "Cancelar" passou a apontar o card.
- `__tests__/unit/hooks/use-briefing-flow.test.tsx`, `__tests__/unit/components/agent/AgentChat.test.tsx`, `__tests__/unit/components/agent/AgentConfirmationCard.test.tsx` (novo) -- cobertura da Matrix. Os testes que confirmavam por "sim" passaram a clicar.

**Review:** 31 findings (high 0, medium 2, low 23, false 6).
- **Patches:** 7 linhas (medium 2, low 5):
  - falha do save do briefing volta ao card;
  - refetch protegido no `finally`;
  - `emailCount` como texto numerico;
  - foco e aria no editor;
  - teste "sim, pode buscar";
  - asserts da flag de processamento e teste do clique rejeitado.
- **Deferido:** 1 (low, preexistente) -- o retry do cadastro de produto pede a descricao de novo.
- **Rejeitados:** 23, cada um com o motivo no Review Triage Log.

**Follow-up review recomendado:** false. Esta passada patcheou 1 entrada medium (as duas medium tem a mesma raiz) e lows, e nenhuma high.

**Verificacao:** os testes da story (3 arquivos, 292 testes) passam. `npm run lint`: 0 erros (134 warnings preexistentes). `npm run typecheck`: limpo. `npm run test:run`: 415 arquivos, 7799 testes passando, 2 skipped. Cada linha da Matrix tem teste, e todos rodaram.

**Completion Notes (CLAUDE.md, regra no 1) -- por analise do diff, sem smoke real:** ver a secao Completion Notes acima. So muda o chat do agente antes da confirmacao do briefing. (1) Campanhas rodando, webhook e `reply-sweep`: intocados. (2) Busca de leads: steps e Apollo intocados; o briefing salvo tem o mesmo shape. (3) Criacao de campanha e export/ativacao no Instantly: intocados, sem trava nova. A unica diferenca e que o briefing se confirma por clique. Nenhum dos 3 pontos e afetado.

**Riscos residuais:**
- Nao houve smoke real na tela. Vale um smoke local antes do deploy: card, edicao de chip, Confirmar, seletor de modo e plano, parando antes do confirm do plano.
- Keywords ainda decidem caminhos que nao confirmam nada: o skip do produto, "sim" nos leads apontando o card e a reapresentacao do resumo.
- No fluxo de leads importados, o card do briefing mostra chips de busca.
- `sprint-status.yaml` ficou como o orquestrador deixou.
