---
baseline_commit: 5cd167096f8ab2819b63845dd63dbace9e4920f1
---

# Story 22.14: Busca com 0 Resultados — diagnóstico honesto e recuperação em 1 clique

Status: done

> **Code review + re-smoke concluídos (2026-07-26).** 3 camadas cegas auditaram AC1–AC8 (todos MET) → 14 patches aplicados → **re-smoke real APROVADO** pela interface, com LLM e Apollo reais. O re-smoke encontrou e fechou 1 defeito num patch do próprio review (o texto do prefill era ecoado literalmente pelo parser). Validação final: 402 files / 7270 pass / 0 fail; tsc 182 = baseline exato, 0 em `src/`; eslint limpo. 9 defers em `deferred-work.md`. Ver "Review Findings" abaixo.

> **P1 — busca vazia hoje é apresentada como sucesso e trava o usuário.** "0 de 0 leads selecionados" + "Step concluído com sucesso" + botão Aprovar desabilitado = fim da linha. Com a 22.13 pronta, a saída existe (Rejeitar → ajuste NL) mas o usuário não tem NENHUMA pista de causa nem atalho — e no autopilot o 0 avança e estoura na campanha com erro genérico.

## Story

As a usuário do Agente TDEC,
I want que, quando a busca não encontrar nenhum lead, o agente me diga o porquê provável e me ofereça ajustes prontos em 1 clique,
so that eu recupere a campanha em segundos em vez de ficar olhando uma tabela vazia sem saber o que fazer.

## Contexto (reproduzido em teste E2E, 2026-07-24)

Briefing legítimo mas nichado (Dono/Diretor + "clínicas de estética" + Atibaia + <11 funcionários) → busca retorna 0:

- Card "Revisão: Leads Encontrados — **0 de 0 leads selecionados**", tabela vazia, "Aprovar (0 leads)" desabilitado, input de filtro habilitado sobre nada.
- Logo abaixo, mensagem **contraditória**: *"Step 2 (search_leads) concluído com sucesso"* (renderizada ainda por cima com spinner "Processando..." — família da 22.17).
- Nenhuma sugestão de causa ou próximo passo. Única ação viva: "Rejeitar" (que agora, pós-22.13, leva ao ajuste por texto — mas o usuário não sabe O QUE ajustar).
- Contraste provado ao vivo: a mesma busca SEM indústria e SEM `<11` encontrou **248 leads** — o problema era combinação de filtros, algo que o agente tinha plena condição de diagnosticar sozinho.

## Diagnóstico confirmado em código (create-story 2026-07-25)

1. **Zero não tem guard em lugar nenhum.** [search-leads-step.ts:163-176](../../src/lib/agent/steps/search-leads-step.ts#L163) — `buildSearchOutput` retorna `success: true` **sempre**, com `leads: []`, `totalFound: 0` e `cost.apollo_search: 0`. Nenhum ramo `leads.length === 0` em nenhum dos dois caminhos (direct entry `:107-124` / por domínios `:126-156`). Idem [search-companies-step.ts:167-180](../../src/lib/agent/steps/search-companies-step.ts#L167) (`companies: []` = sucesso).
2. **O "concluído com sucesso" nasce no `logStep`.** [base-step.ts:240](../../src/lib/agent/steps/base-step.ts#L240) — `"Step N (tipo) concluido com sucesso"`, inserido DEPOIS do gate (`run()` `:53-60`), com 0 ou N leads, guided ou autopilot. O gate em si diz *"Etapa X concluida. Revise os resultados e aprove para continuar."* ([base-step.ts:143](../../src/lib/agent/steps/base-step.ts#L143)) — também mentira com 0.
3. **O "0 de 0" e o Aprovar morto.** [AgentLeadReview.tsx:207](../../src/components/agent/AgentLeadReview.tsx#L207) (`{selectedCount} de {data.totalFound}`), [:316](../../src/components/agent/AgentLeadReview.tsx#L316) (`disabled={isDisabled || selectedCount === 0}`). A tabela vazia renderiza header + filtro habilitado (`:257-301`).
4. **`previewData` do gate JÁ carrega tudo que o diagnóstico precisa.** `SearchLeadsStep` NÃO sobrescreve `buildPreviewData` ([base-step.ts:160-162](../../src/lib/agent/steps/base-step.ts#L160)) → o card recebe `{ leads, totalFound, jobTitles, domainsSearched, searchFilters }` — os filtros EFETIVOS enviados à Apollo estão em `searchFilters` ([search-leads-step.ts:123](../../src/lib/agent/steps/search-leads-step.ts#L123)). Não há plumbing novo para listar filtros ativos.
5. **Causa raiz provável do caso Atibaia está mapeada.** (a) `industry` NÃO é filtro estruturado na Apollo — vira texto em `q_keywords` ([apollo.ts:344-354](../../src/lib/services/apollo.ts#L344)): matching textual frágil ("clínicas de estética" zerou; sem ele, 248). (b) `companySize` do briefing é **texto livre do LLM** e vai cru: `s.replace("-", ",")` só troca o primeiro hífen ([apollo.ts:332-338](../../src/lib/services/apollo.ts#L332)); um valor não-canônico (`"<11"`, `"menos de 11"`, `"enterprise"`) chega inválido em `organization_num_employees_ranges[]` (defer registrado na review da 22.6/22.9 — agora ele tem consequência visível: 0 resultados).
6. **Autopilot com 0 avança e estoura adiante.** [use-auto-trigger.ts:68-92](../../src/hooks/use-auto-trigger.ts#L68) dispara `create_campaign` após `completed` → [create-campaign-step.ts:95-96](../../src/lib/agent/steps/create-campaign-step.ts#L95) `throw "Lista de leads do step anterior e obrigatoria..."` → execução `paused` + erro genérico ([orchestrator.ts:361-376](../../src/lib/agent/orchestrator.ts#L361)). E se busca fosse o último step: `sendSummaryMessage` imprime "Pipeline concluido com sucesso!" com "• Leads: 0 contatos" ([orchestrator.ts:502,519](../../src/lib/agent/orchestrator.ts#L502)).
7. **`search_companies` com 0 é pior: Aprovar NÃO tem guard de contagem.** [AgentApprovalGate.tsx:154-161](../../src/components/agent/AgentApprovalGate.tsx#L154) — `disabled={isDisabled}` apenas; aprovar 0 empresas é possível e detona `search_leads` em [:131-135](../../src/lib/agent/steps/search-leads-step.ts#L131).
8. **A recuperação já existe — falta o atalho.** A 22.13 (DONE, no working tree) entregou: `adjustingStep` no store, `handleAdjustmentMessage` no AgentChat (parse→merge→PATCH→resumo+custo→confirmação determinística→re-execute), merge server-side no PATCH e carimbo durável `metadata.rejected`. Os chips desta story são atalhos determinísticos para ESSA mecânica.

## Acceptance Criteria

1. **[Zero não é sucesso — mensagens honestas]** **Given** `search_leads` ou `search_companies` retornando 0 itens (`leads.length === 0` / `companies.length === 0`, independente de `totalFound`) **Then** a mensagem do `logStep` NÃO diz "concluído com sucesso" — diz que a busca não encontrou resultados **And** o texto do gate (`sendApprovalGateMessage`) não pede "revise e aprove" — orienta ao ajuste **And** o output do step carrega `emptyResult: true` + os dados do diagnóstico (JSONB, zero migration) **And** buscas com ≥1 resultado ficam byte-a-byte idênticas.

2. **[Empty-state de diagnóstico no card de leads]** **Given** o gate de `search_leads` com `emptyResult` **Then** `AgentLeadReview` NÃO renderiza tabela vazia, input de filtro nem "Aprovar (0 leads)" — renderiza um empty-state que: (a) lista os filtros **efetivos** enviados à Apollo (cargos, localização, tamanho — o EFETIVO do SSOT `resolveDirectSearchCompanySizes`, indicando quando é o piso 11+ da 22.6 — e indústria); (b) aponta os candidatos a causa em ordem de probabilidade via **heurística pura, sem LLM** (helper testável — ver spec em Dev Notes): tamanho em formato não-canônico > indústria textual > tamanho restritivo > localização de cidade única > cargos raros; (c) explica que indústria é o filtro mais impreciso da busca aberta (matching textual).

3. **[Recuperação em 1 clique — chips determinísticos]** **Given** o empty-state **Then** o usuário vê chips de ajuste imediato — no mínimo: "Remover filtro de indústria", "Remover/corrigir filtro de tamanho" (variante decidida pela heurística) e "Ampliar localização" — **When** clica um **Then** o fluxo REUSA a mecânica da 22.13 **sem passar pelo `/parse`** (delta determinístico): briefing persistido + delta → `PATCH /briefing` (objeto completo, merge server-side preserva a forma) → resumo do ajuste + custo da re-execução → fase `confirm` **And** a re-execução SÓ acontece após confirmação determinística (`isAdjustmentConfirmation`) — **nenhum chip executa busca paga direto** **And** os turnos do chip entram na memória conversacional (`recordUserTurn`/`recordAgentTurn`) para que um ajuste por texto na sequência não perca contexto.

4. **[Texto livre continua funcionando]** **Given** o empty-state **Then** rejeitar/descrever ajuste por texto (rota da 22.13) segue disponível e os dois caminhos (chip e texto) convergem no MESMO `adjustingStep` — sem estado paralelo novo **And** um chip clicado com ajuste por texto já em andamento não cria corrida (um estado por vez).

5. **[`search_companies` com 0 não engana nem estoura]** **Given** o gate de `search_companies` com 0 empresas **Then** "Aprovar" fica desabilitado (hoje aprovaria e o `search_leads` lançaria erro) **And** o card mostra diagnóstico mínimo (filtros ativos + orientação de ajuste via Rejeitar/texto — chips completos são só no card de leads) **And** a mensagem honesta do AC1 se aplica.

6. **[Autopilot: 0 leads para com a verdade]** **Given** execução autopilot com busca retornando 0 **Then** o pipeline NÃO dispara `create_campaign` para estourar com "Lista de leads..." — o step de busca falha controladamente com mensagem clara em PT-BR (ex.: "A busca não encontrou nenhum lead com esses filtros. Ajuste o briefing e tente novamente.") e a execução pausa **And** no guided nada disso acontece (o caminho é o empty-state do AC2).

7. **[Viabilidade pré-busca — spike best-effort]** **Given** que a busca é paga em créditos internos **Then** avaliar no dev a contagem barata: `searchPeople({...filters, perPage: 1})` devolve `pagination.totalEntries` e o endpoint de search **não consome créditos Apollo** (verificado na doc oficial 2026-07-25 — ver Dev Notes) — se implementar, o plano de execução mostra aviso de baixa viabilidade (ex.: "estimativa: 0 resultados com esses filtros") antes do "Iniciar Execução", **sem** disparar a contagem a cada re-render/turno de ajuste (Trap #7); se o ponto de injeção limpo não existir, documentar o porquê no Dev Agent Record e descartar — não inventar chamada cara nem estourar o NFR de <5s do chat.

8. **[Testes RED→GREEN + smoke real]** **Then** (a) RED provado: hoje `buildSearchOutput` com `leads: []` devolve `success: true` sem flag, `AgentLeadReview` com `totalFound: 0` renderiza tabela vazia + Aprovar(0), e autopilot com 0 avança para `create_campaign`; (b) GREEN: helper de diagnóstico puro (todas as causas + ordenação), empty-state (render + chips), fluxo chip→PATCH→confirm→execute e chip sem confirmação NÃO executa, guard do `search_companies`, mensagens honestas; (c) suíte cheia sem novas falhas, `tsc --noEmit` 0 em `src/`, eslint `--max-warnings=0` nos tocados; (d) **smoke real** pela interface (a suíte mocka Apollo — não prova o formato real dos filtros nem o 0 real): reproduzir o briefing nichado do E2E (estética + Atibaia + <11) → ver empty-state com diagnóstico → clicar chip → ver resumo+custo → confirmar → re-busca executa e reabre gate com resultados. **Parar aí** (guardrail de custo).

## Tasks / Subtasks

- [x] **Task 1 — Helper puro de diagnóstico** (AC: #2): novo `src/lib/agent/empty-search-diagnosis.ts` — entrada: `briefing` + `searchFilters` do output; saída: `{ activeFilters: [...rotulados], probableCauses: [...ordenadas], suggestedChips: [...com delta] }`. Inclui validação de `companySize` contra os buckets canônicos (`QUALITY_MIN_COMPANY_SIZES` + `"1-10"` — a lista literal de [filter-extraction.ts:14](../../src/lib/ai/prompts/filter-extraction.ts#L14)) e o `defaultsApplied` do SSOT [search-defaults.ts:51-58](../../src/lib/agent/search-defaults.ts#L51). Teste unitário puro (padrão `briefing-adjustment.test.ts` — sem mock, sem fetch).
- [x] **Task 2 — Zero deixa de ser sucesso nos steps** (AC: #1, #6): em [search-leads-step.ts](../../src/lib/agent/steps/search-leads-step.ts), ramo `leads.length === 0`: guided → output com `emptyResult: true` + diagnóstico (chamando o helper da Task 1, que roda server-side onde briefing e filtros coexistem); autopilot → throw controlado com mensagem PT-BR clara. Idem mínimo em [search-companies-step.ts](../../src/lib/agent/steps/search-companies-step.ts). Ajustar `logStep`/`sendApprovalGateMessage` ([base-step.ts:143,240](../../src/lib/agent/steps/base-step.ts#L143)) para textos honestos quando `emptyResult` (ver Trap #1 — coordenação com a 22.17, que mexe no MESMO `logStep`).
- [x] **Task 3 — Empty-state no `AgentLeadReview`** (AC: #2): quando `data.emptyResult` — sem tabela, sem filtro, sem Aprovar; diagnóstico + chips (padrão visual: o grid de `<Button size="sm" variant="outline">` do seletor de quantidade, [AgentLeadReview.tsx:219-233](../../src/components/agent/AgentLeadReview.tsx#L219) — único chip-like existente). Manter "Rejeitar"/ajuste por texto vivos (AC4).
- [x] **Task 4 — Wiring dos chips → mecânica 22.13** (AC: #3, #4): chip clicado → `POST /reject` (carimba o gate durável e ativa `adjustingStep`, como os `handleReject` de hoje) → sinal efêmero no store (ex.: `pendingChipAdjustment: { executionId, stepNumber, delta, label } | null`, FORA do `partialize` como o `adjustingStep`) → `AgentChat` consome num efeito: `fetchPersistedBriefing` → aplica delta → `PATCH` (objeto completo — Trap #3) → `fetchStepEstimatedCost` + `buildAdjustmentSummary` → `recordUserTurn(label)`/`recordAgentTurn(resumo)` → `setAdjustingStep({...phase: "confirm"})`. A confirmação e o execute são os já existentes de [AgentChat.tsx:370-406](../../src/components/agent/AgentChat.tsx#L370) — NÃO duplicar.
- [x] **Task 5 — Guard do `search_companies`** (AC: #5): `AgentApprovalGate` — Aprovar `disabled` quando `totalFound === 0`/lista vazia + diagnóstico mínimo no card.
- [x] **Task 6 — Spike viabilidade pré-busca** (AC: #7): investigar ponto de injeção (candidato: geração do plano p/ briefing direct-entry, com cache/flag para não repetir a chamada — o `/plan` é chamado a CADA turno de ajuste pela 22.13, Trap #7); implementar se limpo, senão documentar descarte no Dev Agent Record.
- [x] **Task 7 — Testes RED→GREEN** (AC: #8 a-c): estender [search-leads-step.test.ts](../../__tests__/unit/lib/agent/steps/search-leads-step.test.ts) (hoje NENHUM caso com `totalEntries: 0`/`leads: []` — o mock sempre devolve 2 leads), `search-companies-step.test.ts`, [AgentLeadReview.test.tsx](../../__tests__/unit/components/agent/AgentLeadReview.test.tsx) (nenhum render com `totalFound: 0` hoje), `AgentApprovalGate.test.tsx`, e o bloco 22.13 do [AgentChat.test.tsx:1311-1886](../../__tests__/unit/components/agent/AgentChat.test.tsx#L1311) (reusar `mockAdjustmentFetch`/`adjusting()`/`patchCalls()`/`executeCalls()`).
- [x] **Task 8 — Smoke real** (AC: #8 d): skill `verify` (Playwright, app local, LLM+Apollo reais, logado). Roteiro no AC8. Parar no gate reaberto.

### Review Findings

> Code review 3 camadas cegas e paralelas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), 2026-07-26, baseline `5cd1670`. 34 achados brutos → 25 após dedup. **Veredito do Acceptance Auditor: AC1–AC8 todos MET** (ele revalidou suíte, `tsc` e eslint por conta própria, sem confiar no autorrelato). Nenhum achado invalida a story; os High são defeitos de heurística que gastam re-execução paga.

**Decisões necessárias** — *ambas resolvidas por Fabossi em 2026-07-26; viraram patches.*

- [x] [Review][Decision] **RESOLVIDA → patch: rebaixar o chip para `kind: "prefill"`.** Chip "Ampliar localização" entrega UF nua como delta — `"Atibaia, SP"` → `{location: "SP"}` ([empty-search-diagnosis.ts:529-540](../../src/lib/agent/empty-search-diagnosis.ts#L529)) vai direto para `person_locations[]` sem validação. O smoke real nunca exercitou este chip (usou o de tamanho). Se a Apollo não resolve UF abreviada, o chip de recuperação de 0 paga uma re-execução para devolver outro 0 — e [empty-search-diagnosis.test.ts:327](../../__tests__/unit/lib/agent/empty-search-diagnosis.test.ts#L327) já congela `{location: "SP"}` como correto. Opções: (a) probe real na Apollo e manter/ajustar; (b) rebaixar o chip para `prefill` (cai no caminho de texto da 22.13, que passa pelo parser); (c) expandir UF → nome do estado via mapa determinístico.
- [x] [Review][Decision] **RESOLVIDA → patch: contar UMA vez na transição para a fase `confirm`** (nunca por turno digitado — o Trap #7 segue respeitado). Viabilidade (AC7) ausente exatamente no momento em que se paga — `fetchStepEstimatedCost` ([AgentChat.tsx:305](../../src/components/agent/AgentChat.tsx#L305)) chama `/plan` sem `?viability=1`, então o resumo "custa R$ 3,00. Confirma?" do loop de recuperação não traz estimativa de resultado, mesmo com os filtros recém-alterados e a contagem sendo gratuita em créditos. O Trap #7 proíbe contar a CADA turno — mas o `confirm` é um gesto único e explícito. Opções: (a) manter como está (Trap #7 literal); (b) contar só no turno que entra em `confirm`; (c) contar só quando o step em ajuste é `search_leads` e o briefing é busca direta.

**Patches**

- [x] [Review][Patch] `detectsSmallCompanyIntent` inverte a intenção do usuário em frases de piso e em faixas amplas [src/lib/agent/empty-search-diagnosis.ts:200-208] — `Math.min` sem lista de marcadores de limite INFERIOR: `"mais de 10"`, `"acima de 10"`, `"10+"`, `"a partir de 10"`, `"de 5 a 500"`, `"entre 10 e 1000"`, `"10-100"`, `"5 a 50"` → todos `true` (verificado em runtime), oferecendo "Corrigir tamanho para 1-10" — o inverso do pedido. Fix: exigir também o MAIOR número ≤ 10 e/ou lista de marcadores de piso que retorna `false`. Achado por 2 camadas independentes.
- [x] [Review][Patch] Test set negativo de `detectsSmallCompanyIntent` evita justamente a fronteira que quebra [__tests__/unit/lib/agent/empty-search-diagnosis.test.ts:115-126] — `"mais de 500"` só passa porque 500 > 10; nenhum caso com `"mais de 10"` / `"10+"`. 78 testes no helper e nenhum toca o caso que gasta dinheiro. Mesmo padrão em `isSingleCityLocation` (`:130-140`): nenhum estado brasileiro testado.
- [x] [Review][Patch] `CITY_STATE_REGEX` deforma (e às vezes ESTREITA) localizações com mais de uma vírgula [src/lib/agent/empty-search-diagnosis.ts:237,529-540] — verificado: `"Campinas, Atibaia e Jundiaí"` → `{location: "Atibaia e Jundiaí"}` (estreita!), `"São Paulo, SP, Brasil"` → `"SP, Brasil"`. Além disso `buildLocationChips` nunca consulta `BROAD_LOCATIONS`, então `"Brasil"` gera o prefill sem sentido *"buscar no estado inteiro em vez de só Brasil"*. Achado por 3 camadas independentes.
- [x] [Review][Patch] `isSingleCityLocation` acusa estados, regiões e países como "uma única cidade" [src/lib/agent/empty-search-diagnosis.ts:212-218] — qualquer string sem vírgula fora dos 12 itens de `BROAD_LOCATIONS`: `"Minas Gerais"`, `"Rio Grande do Sul"`, `"Sudeste"`, `"Argentina"` → causa fabricada *"limitada a uma única cidade"*, ranqueada ACIMA da causa real na lista ordenada. Num card chamado "diagnóstico honesto". Achado por 2 camadas.
- [x] [Review][Patch] `/plan?viability=1` sem orçamento de tempo próprio [src/app/api/agent/executions/[executionId]/plan/route.ts:72,139-141] — `searchPeople` awaitado inline com `DEFAULT_TIMEOUT_MS = 10000` + `MAX_RETRIES = 1` ([base-service.ts:115-116](../../src/lib/services/base-service.ts#L115)) = até ~20s bloqueando o GET. O `catch` fail-open captura o AbortError (não vira 504), então é latência e não bloqueio — mas o próprio AC7 cita o NFR de <5s, e o Trap #7 sugeria cache no JSONB. Fix: `Promise.race` com deadline de ~4s → `null`. Achado por 3 camadas.
- [x] [Review][Patch] Os dois cards usam gatilhos diferentes para o mesmo invariante; o de leads não é retroativo [src/components/agent/AgentLeadReview.tsx:217] — `data.emptyResult === true` só existe em execuções novas: um gate legado já em `awaiting_approval` com `leads: []` segue renderizando tabela vazia + filtro + "Aprovar (0 leads)" — o P1 exato que a story existe para matar. [AgentApprovalGate.tsx:126](../../src/components/agent/AgentApprovalGate.tsx#L126) resolveu o caso simétrico de forma retroativa (`companies.length === 0`). Fix: `data.emptyResult === true || data.leads.length === 0` (satisfaz o Trap #5 igualmente — o gatilho continua sendo a LISTA). Achado por 2 camadas, em direções opostas.
- [x] [Review][Patch] Chip em voo sobrevive ao "Nova conversa" e contamina a memória da conversa nova [src/components/agent/AgentChat.tsx:598-641] — o sinal é consumido em `:640` e `applyChipAdjustment` roda sem token de cancelamento nem re-check de `executionId` DEPOIS dos awaits; `recordUserTurn`/`sendAndRecordAgent`/`setAdjustingStep` disparam contra a execução já descartada, empurrando "Remover filtro de indústria" para dentro do `conversationRef` que o `reset()` acabou de esvaziar. O guard de órfão existe só na ENTRADA do efeito.
- [x] [Review][Patch] Rótulo do chip "Incluir empresas de 1 a 10 pessoas" contradiz o delta [src/lib/agent/empty-search-diagnosis.ts:399-406] — com `companySize` null o efetivo é o piso 11+; o delta `{companySize: "1-10"}` SUBSTITUI (não inclui), estreitando a busca num card cujo propósito é ampliá-la. O `warning` diz a verdade ("Passa a buscar SÓ…"), o rótulo lido primeiro não. Fix: alinhar o rótulo ao efeito.
- [x] [Review][Patch] Turno do chip não vira mensagem durável [src/components/agent/AgentChat.tsx:584] — o caminho de texto persiste via `sendMessageMutation.mutate` ([:369](../../src/components/agent/AgentChat.tsx#L369)); o chip só faz `recordUserTurn` (RAM). O transcript fica com o resumo de custo do agente sem o turno do usuário que o provocou — buraco de auditoria e memória irreconstituível após F5.
- [x] [Review][Patch] Texto sugerido pelo chip sobrevive na caixa após "Nova conversa" [src/components/agent/AgentInput.tsx:44-53] — o `AgentInput` copia o draft para o estado local e zera a store; o `setChatInputDraft(null)` do cancelamento é ignorado pelo listener (`if (!draft …) return`) e o componente não desmonta. O comentário promete que nada atravessa para a conversa nova; a frase fica na caixa. `subscribe` também é cego ao valor já presente antes do efeito montar.
- [x] [Review][Patch] `isCanonicalCompanySize` faz `.trim()`, mas a Apollo recebe o valor verbatim [src/lib/agent/empty-search-diagnosis.ts:181-184] — `resolveDirectSearchCompanySizes` envia `[briefing.companySize]` sem normalizar ([search-defaults.ts:55](../../src/lib/agent/search-defaults.ts#L55)). Com `" 11-50 "` a busca está quebrada e o card jura que o formato é válido — o card mente exatamente sobre a causa que ele existe para nomear.
- [x] [Review][Patch] `normalize()` escreve o range de diacríticos com marcas combinantes literais [src/lib/agent/empty-search-diagnosis.ts:176] — confirmei os bytes: `U+0300`–`U+036F`, funcionalmente correto hoje, mas invisível em editores/diffs e silenciosamente corrompível em qualquer round-trip de encoding. Fix grátis: `/[̀-ͯ]/g`.
- [x] [Review][Patch] Dois testes novos passam contra código arbitrariamente quebrado [__tests__/unit/components/agent/AgentInput.test.tsx:716-727] — limpar um input e afirmar que ele está vazio é verdade incondicional (não prova que o draft não volta); e `expect(result.cost?.theirstack_search).toBe(0)` em `search-companies-step.test.ts` é aritmética (`0 * CREDITS_PER_COMPANY`), passaria com o ramo `emptyResult` inteiro deletado. Ambos em describes intitulados como se guardassem o invariante novo.

**Deferidos**

- [x] [Review][Defer] Diagnóstico recalcula Tamanho/Indústria do briefing em vez de ler `searchFilters` [src/lib/agent/empty-search-diagnosis.ts:295-325] — deferido: `filters.companySizes`/`filters.industries` nunca são lidos (só `titles`/`locations` têm precedência). Hoje não há drift porque o mesmo SSOT monta os dois; a fixture do teste (`:275-278`) prova a cegueira ao parear uma combinação que `buildDirectSearchFilters` nunca produziria. Sem consequência visível agora.
- [x] [Review][Defer] `estimateSearchViability` engole toda falha num `catch` nu, sem sinal [src/app/api/agent/executions/[executionId]/plan/route.ts:77-79] — deferido: chave ausente, 401, 403, 429 e rede são indistinguíveis; a estimativa pode morrer em produção com UI byte-idêntica. Não há utilitário de log em `src/lib/utils/` e o eslint proíbe `console` — o fix exige decidir infraestrutura de observabilidade, fora do escopo.
- [x] [Review][Defer] Autopilot não persiste o diagnóstico que já estava de graça na mão [src/lib/agent/steps/search-leads-step.ts:192-193] — deferido: `diagnoseEmptySearch` não é chamado no ramo de throw e `saveFailure` sobrescreve o `output` com `{error}`, destruindo também `searchFilters`. AC6 só pediu a mensagem honesta, que foi entregue.
- [x] [Review][Defer] `POST /reject` endereça o step, não o gate clicado [src/components/agent/AgentLeadReview.tsx:234] — deferido, pré-existente: a rota pega o gate mais recente (`order created_at desc limit 1`) e o `handleReject` da 22.13 tem a mesma fraqueza de endereçamento. Cenário de dois gates com o antigo NÃO carimbado é difícil de alcançar.
- [x] [Review][Defer] `await response.json()` em corpo não-JSON vaza `SyntaxError` cru na UI PT-BR [src/components/agent/AgentLeadReview.tsx:242-244] — deferido, pré-existente: `handleApprove` (`:194`) e `handleReject` (`:194`) já tinham o padrão idêntico antes desta story. Um 502 com HTML mostra `Unexpected token '<'` no lugar da mensagem em português.
- [x] [Review][Defer] `isDirectSearch` da rota decide por input diferente do ramo do step [src/app/api/agent/executions/[executionId]/plan/route.ts:59-65] — deferido: com `technology === null` e `search_companies` fora de `skipSteps`, a rota conta busca direta mas o pipeline rodaria `search_companies`. Alcançável só se a tecnologia for removida sem recomputar `skipSteps`.
- [x] [Review][Defer] PATCH bem-sucedido pode ser reportado como falha [src/components/agent/AgentChat.tsx:598-608] — deferido: se `sendAndRecordAgent` rejeitar depois do PATCH, o briefing já mudou mas o usuário lê "Tive um problema ao aplicar o ajuste". Estado é recuperável e convergente (o caminho de texto mescla sobre o briefing já alterado); mesma forma de fail-open da 22.13.
- [x] [Review][Defer] `quality_floor_applied` fora da ordem da spec e torna o fallback de cargos inalcançável [src/lib/agent/empty-search-diagnosis.ts:356-362] — deferido: desvio documentado pelo dev nas Completion Notes, mas a justificativa ("manter o fallback de cargos alcançável") é contrariada pelo próprio teste — com `companySize` null e localização ampla o fallback nunca dispara.
- [x] [Review][Defer] F5 na fase "confirm" deixa o briefing já PATCHeado sem caminho de volta [src/components/agent/AgentChat.tsx:335-363] — deferido, pré-existente da 22.13: a reentrada durável restaura sempre a fase `describe`, então "sim" cai no `parseAdjustment` com memória vazia → "Nao consegui entender o ajuste", enquanto a mudança de filtro já está no banco. Vale junto com a persistência do turno do chip.

**Patches aplicados — 2026-07-26**

Todos os 14 aplicados (13 bullets acima + as 2 decisões, sendo que a de localização se fundiu ao patch do `CITY_STATE_REGEX`). Validação: **vitest 402 files / 7270 pass / 2 skip / 0 fail** (era 7243 → **+27 testes**, zero regressão); `tsc --noEmit` **182 = baseline EXATO, 0 em `src/`**; `eslint --max-warnings=0` limpo nos 11 arquivos tocados.

Mudanças de comportamento (não são só correções pontuais):

1. **Chip de localização nunca mais produz delta** — virou `prefill` sempre, caindo no parser do caminho de texto da 22.13. O id `broaden-location-prefill` deixou de existir (só `broaden-location`). O teste que congelava `{location: "SP"}` como correto foi invertido e passou a proibir delta de localização.
2. **`detectsSmallCompanyIntent` ganhou lista de marcadores de PISO e passou a decidir pelo MAIOR número** — `"mais de 10"`, `"10+"`, `"acima de 10"`, `"10-100"`, `"de 5 a 500"` deixaram de ser lidos como "empresa pequena". 12 casos de fronteira novos.
3. **`isSingleCityLocation` → `isNarrowLocation`**, e a causa `single_city_location` → `narrow_location`, com texto que não afirma mais "uma única cidade" (era falso para estados, regiões e países fora da lista).
4. **Gatilho do empty-state passou a ser retroativo** — `emptyResult === true || leads.length === 0`, cobrindo gates criados antes desta story. Continua sendo a LISTA (Trap #5 intacto).
5. **Viabilidade passou a ser contada na transição para `confirm`**, nos DOIS caminhos (chip e texto), via o mesmo opt-in `?viability=1`. O resumo ganha uma linha de estimativa; quando a contagem falha, o resumo sai idêntico ao de antes.
6. **`GET /plan?viability=1` ganhou deadline de 4s** (`Promise.race`) — antes podia segurar o plano por ~20s.
7. **`isCanonicalCompanySize` deixou de fazer `.trim()`** — passa a refletir o que a Apollo realmente recebe.
8. **Rótulo do chip sem tamanho**: "Incluir empresas de 1 a 10 pessoas" → **"Buscar só empresas de 1 a 10 pessoas"**.

**RE-SMOKE REAL DOS PATCHES — FEITO E APROVADO (2026-07-26, Playwright, app local, LLM + Apollo reais, logado Fabossi).** Fabossi autorizou o caminho pago. 2 buscas pagas, dentro do guardrail. Parado no gate reaberto: nenhum lead aprovado, nenhuma campanha criada, nada exportado.

| # | O que foi provado | Evidência |
|---|---|---|
| 1 | Parser real reproduziu o defeito da story: `companySize: "menos de 11 funcionários"` (não-canônico) | — |
| 2 | **Deadline de 4s**: o plano abriu rápido COM a contagem real — *"Estimativa: 0 resultados com esses filtros"* | `resmoke-22-14-1-viabilidade-zero.png` |
| 3 | Empty-state honesto; log *"Step 2 (search_leads) nao encontrou resultados"*; e o **patch da localização visível**: a causa agora diz *"limitada a uma **localidade só**"* (ontem: "uma única cidade") | `resmoke-22-14-2-empty-state-localidade.png` |
| 4 | **Chip → `prefill` (patch principal)**: clique rejeitou a etapa, desabilitou os 3 chips e pré-preencheu a caixa. Rede pós-clique: **só `POST /steps/2/reject → 200`** — nenhum `PATCH /briefing`, nenhum `execute`. Um clique não toca no briefing nem gasta | `resmoke-22-14-3-chip-prefill.png` |
| 5 | Texto do chip enviado sem redigitar → caiu no `/parse` da 22.13 | — |
| 6 | **Estimativa no `confirm`, os DOIS ramos**: com filtros ruins *"Atencao: com esses filtros a estimativa continua em 0 resultados. Vale outro ajuste antes de gastar a re-execucao"*; com filtros bons *"Estimativa com os filtros novos: ~89429 resultados"* | `resmoke-22-14-4-estimativa-zero-no-confirm.png` |
| 7 | Gate reaberto no card **NORMAL** ("25 de 89429 leads selecionados", tabela + filtro + Aprovar habilitado, log de volta a "concluido com sucesso") — o gatilho retroativo do patch 6 não quebrou o caminho não-vazio | `resmoke-22-14-5-gate-reaberto.png` |

**Console:** apenas o hydration mismatch PRÉ-EXISTENTE do submenu Leads da sidebar. Nenhum erro novo.

**🐛 DEFEITO ENCONTRADO PELO SMOKE — em um patch do próprio review, corrigido na hora.** No passo 6 a estimativa não veio 0 por acaso: o parser ecoou o texto do prefill LITERALMENTE, produzindo `Localizacao: "região maior que Atibaia"` — string que a Apollo não resolve. A redação que escrevi no patch 4 era uma DESCRIÇÃO, e descrição vira valor de filtro; a spec da story já prescrevia a frase certa (`"buscar no estado inteiro em vez de só {cidade}"`), que é uma INSTRUÇÃO e dá ao LLM um alvo concreto. Revertido para a redação da spec e reconferido no app real: passou a produzir `Localizacao: São Paulo`. Teste de regressão adicionado travando a forma da frase (`/^buscar no estado inteiro em vez de só /` e proibindo `região maior que`).

Vale registrar o que isso demonstra: **a linha de estimativa no `confirm` (patch 14) pegou um defeito que a suíte inteira não pegaria** — os 96 testes do helper validam o CONTRATO do prefill, não como um LLM real o interpreta. Foi o guard novo avisando "isso vai voltar vazio" que expôs o problema antes de gastar os R$ 3,00. É exatamente o cenário que a story existe para cobrir, acontecendo com o próprio código da story.

**Validação final pós-correção:** vitest **402 files / 7270 pass / 2 skip / 0 fail**; `tsc` **182 = baseline exato, 0 em `src/`**; eslint `--max-warnings=0` limpo.

**Descartados como ruído (3)**

`LOW_VIABILITY_THRESHOLD = 10` desconectado de `LEADS_PER_PAGE` (constante razoável; `leadCount` está explicitamente fora de escopo) · chip malformado consumir o gate silenciosamente (inalcançável — todos os chips nascem do helper com forma válida) · `search_companies` passar a lançar no autopilot sem AC próprio (coerente com D5 e estritamente melhor que o erro genérico de hoje; registrado como informativo).

## Dev Notes

### ⚠️ Baseline: a 22.13 está DONE mas NÃO COMMITADA

O working tree contém toda a implementação da 22.13 (14 arquivos M + `briefing-adjustment.ts`/teste novos, baseline `079aca0`). Esta story DEPENDE de tudo isso. **Antes de começar: commitar a 22.13** (ou confirmar com Fabossi que ele commita) — não misturar os diffs das duas stories num commit só.

### O que JÁ existe e você deve REUSAR (não recriar)

| Peça | Onde | Uso nesta story |
|---|---|---|
| `adjustingStep` + `setAdjustingStep`/`clearAdjustingStep` | [use-agent-store.ts:31-42,63-64,86-87](../../src/stores/use-agent-store.ts#L31) (efêmero, fora do `partialize` `:103`) | chips entram no MESMO estado |
| `handleAdjustmentMessage` — fase confirm + execute | [AgentChat.tsx:358-510](../../src/components/agent/AgentChat.tsx#L358) (confirm `:370-408`, execute fire-and-forget com restore em falha `:386-406`) | confirmação/execução do chip é ESTA, intocada |
| `fetchPersistedBriefing` / `fetchStepEstimatedCost` | [AgentChat.tsx:276-290, 295-309](../../src/components/agent/AgentChat.tsx#L276) | base do delta + custo do resumo |
| `mergeAdjustedBriefing` / `buildAdjustmentSummary` / `listRemovedFilters` / `isAdjustmentConfirmation` | [briefing-adjustment.ts:94,140,198,225](../../src/lib/agent/briefing-adjustment.ts#L94) (puros) | resumo e confirmação dos chips; o delta do chip pode ser aplicado direto sobre o persistido (não precisa do merge parse-shaped, mas o summary/removed são reusáveis) |
| `recordUserTurn` / `recordAgentTurn` | [use-briefing-flow.ts:454,460,1170-1182](../../src/hooks/use-briefing-flow.ts#L1170) | memória coerente para ajustes por texto após um chip |
| `PATCH /briefing` com merge server-side | [briefing/route.ts:98-143](../../src/app/api/agent/executions/[executionId]/briefing/route.ts#L98) | preserva `premiumIcebreakers`/`importedLeads`/forma; **mas o schema exige o objeto completo** (Trap #3) |
| `POST /reject` — carimbo durável + pergunta de ajuste | [reject/route.ts:99-192](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts#L99) (exige `awaiting_approval`; aceita `{reason}`) | chip pode passar `reason: label` |
| Reentrada durável no ajuste | [AgentChat.tsx:327-356](../../src/components/agent/AgentChat.tsx#L327) | F5 pós-chip-reject cai no fluxo de texto — de graça |
| SSOT tamanho efetivo | [search-defaults.ts:51-58](../../src/lib/agent/search-defaults.ts#L51) | diagnóstico mostra o tamanho EFETIVO (piso 11+ quando `companySize` null) |
| `searchFilters` já no `previewData` | [search-leads-step.ts:123,173](../../src/lib/agent/steps/search-leads-step.ts#L123) + [base-step.ts:160-162](../../src/lib/agent/steps/base-step.ts#L160) | filtros ativos do empty-state sem plumbing novo |

### Spec da heurística de causa provável (Task 1 — determinística, testável)

Ordem de avaliação (cada regra que dispara vira uma causa listada, na ordem):

1. **`companySize` não-canônico** — valor presente e fora dos buckets canônicos (`"1-10","11-50","51-200","201-500","501-1000","1001-5000","5001-10000","10001+"` — [filter-extraction.ts:14](../../src/lib/ai/prompts/filter-extraction.ts#L14); é `QUALITY_MIN_COMPANY_SIZES` + `"1-10"`): "o filtro de tamanho está num formato que a base não reconhece". É o candidato nº 1 do caso Atibaia (`<11` cru em `organization_num_employees_ranges[]`).
2. **`industry` presente** — "indústria é o filtro mais impreciso (busca por texto, não por categoria)". Evidência 0→248.
3. **`companySize` canônico mas restritivo** — bucket único pequeno (ex.: só "1-10").
4. **Localização de cidade única** — `location` sem vírgula/UF e não vazio (heurística simples; não tentar geocoding).
5. **Cargos raros** — `jobTitles.length ≥ 3` todos muito específicos é difícil de detectar puro; regra mínima: listar os cargos como "confira se os cargos existem nessa região" quando nenhuma das causas acima disparou.

Chips derivados (cada um com `delta` determinístico sobre o briefing):

- **"Remover filtro de indústria"** → `{ industry: null }` (só aparece se `industry` presente).
- **Tamanho, variante pela heurística**: valor não-canônico com intenção "pequena" detectável (número ≤ 10 no texto) → **"Corrigir tamanho para 1-10"** `{ companySize: "1-10" }`; senão → **"Remover filtro de tamanho"** `{ companySize: null }` com aviso no rótulo/resumo de que o efetivo vira o piso 11+ (22.6) — **cuidado**: se a intenção do usuário era empresas pequenas, remover o filtro EXCLUI o alvo dele; por isso a variante corrigir vem primeiro.
- **"Ampliar localização"**: se `location` casa padrão "Cidade, UF/Estado" → delta determinístico para a parte do estado; senão o chip **pré-preenche o input do chat** com uma frase sugerida (ex.: "buscar no estado inteiro em vez de só {cidade}") e o usuário envia — caindo no caminho de TEXTO da 22.13 (parse). Fail-safe: não inventar geografia deterministicamente.

### Decisões de design

- **D1 — Chip = Rejeitar + ajuste determinístico em um clique.** O chip primeiro faz o `POST /reject` (mesmo caminho dos `handleReject` atuais — carimbo durável, `adjustingStep` ligado, card morto) e então aplica o delta. Ganhos: auditoria durável, reentrada pós-F5 de graça, nenhum estado paralelo. A pergunta "O que você gostaria de ajustar?" inserida pelo reject fica redundante com o resumo que vem em seguida — aceitável; se incomodar, o `reason` do reject já é aceito pela rota e o dev pode suprimir a pergunta quando `reason` presente (mudança de 3 linhas na rota, opcional).
- **D2 — Delta sem `/parse`.** O chip conhece o delta exato; passar pelo LLM seria custo + risco de alucinação (lição 22.11). O caminho é: persistido → `{...persistido, ...delta}` → PATCH completo. `mergeAdjustedBriefing` não é necessário para o delta (ele existe para conciliar um parse completo), mas `buildAdjustmentSummary`/`listRemovedFilters` são reusados para o resumo idêntico ao do fluxo de texto.
- **D3 — Confirmação obrigatória mesmo no chip.** Falso positivo custa crédito (P1 da review da 22.13). O chip leva à fase `confirm`; o "sim" do usuário (via `isAdjustmentConfirmation`) é quem paga. Um clique = preparar; segundo gesto = pagar.
- **D4 — Sinal chip→AgentChat via store efêmero** (`pendingChipAdjustment`), consumido e limpo por efeito no `AgentChat` — os gates já falam com o store diretamente (padrão dos `handleReject`); `handleAdjustmentMessage` é interno ao `AgentChat` e NÃO deve ser exportado. Alternativa de threading de callback por `AgentMessageList`→`AgentMessageBubble`→`ApprovalGateRenderer` foi descartada (3 níveis de prop drilling que o padrão atual evita).
- **D5 — Autopilot falha controlado, não "empty-gate".** Autopilot não tem gate; a alternativa de completar com 0 e deixar o resumo dizer "sucesso, 0 contatos" é a mentira que a story mata. Throw com mensagem clara → `paused` + mensagem de erro (mecânica existente do orchestrator) é o menor movimento honesto.

### Traps

- **Trap #1 — Colisão com a 22.17 no `base-step.ts`/gates.** A 22.17 (ready-for-dev) mexe no MESMO `logStep` (messageType `progress` → badge "Processando...") e nos gates de ativação. Esta story muda o CONTEÚDO do `logStep`/gate para 0 resultados; a 22.17 muda o TIPO/render. Ordem sugerida: a que rodar primeiro commita, a outra rebaseia — não editar as duas em paralelo.
- **Trap #2 — Não pular o gate de custo.** Cada re-execução de busca é paga (créditos internos, R$ 3,00 no plano do E2E). Chip NUNCA chama `/execute` direto (AC3, D3).
- **Trap #3 — o `PATCH /briefing` exige objeto completo.** O schema tem `technology/jobTitles/location/companySize/industry/mode/skipSteps` **obrigatórios** ([briefing/route.ts:17-53](../../src/app/api/agent/executions/[executionId]/briefing/route.ts#L17)); um PATCH só com o delta (`{industry: null}`) toma 400 VALIDATION_ERROR. Sempre `{...persistido, ...delta}`. O merge server-side protege o que o cliente não conhece (`premiumIcebreakers` etc.), não substitui o objeto completo.
- **Trap #4 — re-executar `search_leads` NÃO amplia o universo de empresas** (herdado da 22.13): com step 1 aprovado, `isDirectEntry = !previousStepOutput` é falso e a re-busca continua **pelos domínios das empresas do step 1** ([search-leads-step.ts:71,126-137](../../src/lib/agent/steps/search-leads-step.ts#L71)). No fluxo com tech, remover indústria/tamanho no chip pode não mudar nada (esses filtros nem são enviados no ramo por domínios — `:147-153` não tem `companySizes`). **Os chips de indústria/tamanho só fazem sentido na busca direta** — o helper da Task 1 deve receber a informação de qual ramo rodou (o `searchFilters` do output revela: presença de `domains` = ramo por domínios) e suprimir chips inócuos. No ramo por domínios, o diagnóstico honesto é "nenhum lead com esses cargos nas N empresas encontradas — ajuste os cargos ou rejeite a etapa de empresas".
- **Trap #5 — `emptyResult` com `totalFound > 0`.** `totalFound` vem de `pagination.totalEntries`; é teoricamente possível `leads: []` com total > 0 (página vazia). O gatilho do empty-state é `leads.length === 0`, nunca `totalFound === 0`.
- **Trap #6 — `AgentApprovalGate` ≠ `AgentLeadReview`.** São componentes distintos (empresas vs leads). O guard do AC5 é no primeiro; o empty-state completo é no segundo. Não unificar.
- **Trap #7 — o `/plan` é chamado a cada turno de ajuste.** `fetchStepEstimatedCost` (22.13) chama `GET /plan` em TODO turno de describe. Se o spike do AC7 puser a contagem Apollo dentro da geração do plano sem guarda, cada turno de ajuste dispara uma chamada externa (latência + rate limit). Se implementar: contagem só em momento único e explícito (ex.: query param opt-in, ou só no primeiro GET pós-confirm com resultado cacheado no JSONB da execução).
- **Trap #8 — testes de step usam mock com 2 leads sempre.** `search-leads-step.test.ts` (`mockSearchPeople` → `mockLeadsResponse`, 2 leads) — os casos "0" existentes (`:318-333`) são de OUTRO cenário (companies ausentes). O RED do AC8a exige caso novo com `{ leads: [], pagination: { totalEntries: 0 } }`.
- **Trap #9 — PT-BR sem acento nas strings do agente.** Convenção existente ("padrao de qualidade", "concluida" — ver 22.6). Manter nos textos novos dos steps; os componentes UI usam acentuação normal.

### Testes — infra a reusar

- Helper puro: padrão [briefing-adjustment.test.ts](../../__tests__/unit/lib/agent/briefing-adjustment.test.ts) (sem mock, fixtures no topo, `it.each` para a tabela de causas).
- `AgentChat` (chips): bloco 22.13 em [AgentChat.test.tsx:1311-1886](../../__tests__/unit/components/agent/AgentChat.test.tsx#L1311) — `setupDefaults({ adjustingStep })`, `mockAdjustmentFetch()`, `patchCalls()`, `executeCalls()`, `agentMessages()`, `capturedOnSendMessage`. O RED do chip: hoje não existe `pendingChipAdjustment` — o teste nasce com a feature.
- Steps: `createInput()`/`mockSearchPeople` existentes; adicionar fixture vazia.
- Componentes: `AgentLeadReview.test.tsx` nunca renderizou `totalFound: 0` — caso novo direto.
- Comandos: `npx vitest run <arquivos>`, `npx vitest run`, `npx tsc --noEmit`, `npx eslint <tocados> --max-warnings=0`. Ambiente: rodar do **Windows nativo** (o `node_modules` foi restaurado com `npm ci` no PowerShell em 2026-07-25 — NUNCA rodar npm do WSL nesta pasta).

### Pesquisa externa (Apollo — verificada 2026-07-25)

- Endpoint em uso: `POST /v1/mixed_people/api_search` ([apollo.ts:45](../../src/lib/services/apollo.ts#L45)). A doc oficial confirma: **o search não consome créditos Apollo** (créditos são de enrichment) e devolve `pagination.total_entries`; limite de exibição 50k (100/página × 500 páginas — o código já capa em `APOLLO_MAX_PAGES = 500`). Fontes: docs.apollo.io/reference/people-api-search e docs.apollo.io/docs/api-pricing. Implicação: a contagem do AC7 custa só latência/rate-limit, não créditos — mas a COBRANÇA INTERNA do produto (créditos TDEC) é outra camada; a contagem não deve gerar cobrança interna (não passa pelo step).
- Não existe endpoint de contagem dedicado; `perPage: 1` + `totalEntries` é o caminho ([apollo.ts:286-299](../../src/lib/services/apollo.ts#L286) já expõe `pagination.totalEntries`).

### Previous story intelligence

- **22.13** — a fundação inteira desta story; ver tabela de reuso. Lições diretas: (a) confirmação estrita `isAdjustmentConfirmation` nasceu de um P1 High (substring `isConfirmation` gastava crédito em falso positivo) — o chip herda essa disciplina via D3; (b) `execute` fire-and-forget PRECISA tratar falha e restaurar a fase (P2) — já resolvido no caminho reusado; (c) estado de ajuste amarrado ao `executionId` (P6) — o `pendingChipAdjustment` deve nascer com `executionId` pelo mesmo motivo.
- **22.11** — padrão âncora: o LLM sugere, o determinístico decide. Os chips levam isso ao limite: nem sugerir o LLM precisa.
- **22.6** — SSOT `resolveDirectSearchCompanySizes` para o tamanho efetivo; a review dela já tinha sinalizado o `companySize` freeform cru pro Apollo (defer) — esta story dá consequência visível ao achado (causa nº1 do diagnóstico) sem "consertar" a normalização (fora de escopo; ver abaixo).
- **21/22 (sistêmico)** — mock não prova Apollo real nem RLS: smoke real é definição de pronto (AC8d).
- **Pre-commit**: `lint-staged` roda eslint no arquivo inteiro com `--max-warnings=0`; nunca `--no-verify`.

### Fora de escopo (registrado para não vazar)

- **`leadCount` no briefing** ("traga só 2 leads" — P2 do E2E + defer da 22.11 que apontava "22.14/22.15"): NÃO entra aqui — o draft aprovado desta story é recuperação de 0 resultados; `leadCount` faz mais sentido junto da persistência de leads (22.15) ou story própria. Registrar a decisão final com Fabossi.
- **Normalizar `companySize` freeform → bucket canônico ANTES da Apollo** (o fix estrutural da causa nº1): mexe no parser/override AC2 da 22.6; aqui só diagnosticamos e oferecemos o chip corretivo. Se o smoke provar que é a causa dominante, promover a fix na próxima story.
- **Matching localização empresa-vs-pessoa / excluir setor público** (gap §2 do E2E): backlog.
- **Reentrada durável em ajuste além da existente**: a da 22.13 já cobre.

### Project Structure Notes

- Novo helper em `src/lib/agent/` (padrão dos irmãos `briefing-adjustment.ts`, `search-defaults.ts`): puro, sem React/fetch, importável por step (server) e componente (client) — como `briefing-adjustment.ts` já é.
- Zero migration (NFR5): `emptyResult`/diagnóstico vivem no `output` JSONB do step e trafegam pelo `previewData` existente. Nenhum `MessageType` novo, nenhum `StepStatus` novo.
- NFR1 intocado: nenhuma decisão de execução/custo delegada a LLM — chips e diagnóstico 100% determinísticos; texto livre usa o parser JÁ existente da conversa.
- PT-BR em toda UI.

### References

- [Source: src/lib/agent/steps/search-leads-step.ts#L61-L176] — fluxo completo, ramos direct/domínios, `buildSearchOutput` sem guard
- [Source: src/lib/agent/steps/search-companies-step.ts#L117-L180] — 0 empresas = sucesso
- [Source: src/lib/agent/steps/base-step.ts#L45-L68, #L112-L162, #L231-L248] — `run()` guided, gate, `logStep` ("concluido com sucesso")
- [Source: src/lib/agent/orchestrator.ts#L156-L160, #L335-L376, #L489-L550] — override approvedLeads, conclusão/erro, summary autopilot
- [Source: src/components/agent/AgentLeadReview.tsx#L58-L92, #L207, #L219-L233, #L264-L331] — "0 de 0", chip-like existente, Aprovar/Rejeitar
- [Source: src/components/agent/AgentApprovalGate.tsx#L123-L161] — 0 empresas sem guard de Aprovar
- [Source: src/components/agent/AgentChat.tsx#L263-L510] — helpers e `handleAdjustmentMessage` (22.13)
- [Source: src/lib/agent/briefing-adjustment.ts] — helpers puros 22.13 (confirmação estrita, merge, resumo)
- [Source: src/stores/use-agent-store.ts#L31-L64, #L97-L103] — `adjustingStep` efêmero
- [Source: src/hooks/use-briefing-flow.ts#L432-L461, #L1160-L1182] — seams `parseAdjustment`/`recordUserTurn`/`recordAgentTurn`
- [Source: src/app/api/agent/executions/[executionId]/briefing/route.ts#L17-L53, #L98-L143] — schema obrigatório + merge server-side
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts#L99-L192] — reject + carimbo durável
- [Source: src/lib/services/apollo.ts#L286-L362] — `totalEntries`, `buildQueryString` (industry→q_keywords, companySize cru)
- [Source: src/lib/agent/search-defaults.ts#L25-L58] — SSOT piso 11+ / tamanho efetivo (22.6)
- [Source: src/hooks/use-auto-trigger.ts#L68-L92] — autopilot dispara o próximo step
- [Source: _bmad-output/implementation-artifacts/22-13-ajuste-pos-rejeicao-de-etapa.md] — mecânica de ajuste (dependência direta)
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — evidência (0 vs 248 com filtros relaxados)
- [Source: _bmad-output/implementation-artifacts/epic-22-context.md] — invariantes do épico (NFR1/NFR5, determinismo)

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context) — dev-story 2026-07-25.

### Debug Log References

**Baseline.** A 22.13 estava DONE porém não-commitada (24 M + 4 novos no working tree). Fabossi
autorizou o commit antes de começar: `5cd1670` (`feat(story-22.13): ajuste pos-rejeicao de etapa +
code review 3 camadas`). Diffs separados, rollback granular preservado. `baseline_commit` no
frontmatter aponta para ele.

**RED provado (AC8a) — 3 eixos, todos observados antes de escrever a correção:**

| Eixo | Comando | RED | GREEN |
|---|---|---|---|
| `search-leads-step` | `npx vitest run __tests__/unit/lib/agent/steps/search-leads-step.test.ts` | **9 falhas** / 31 pass | 40 pass |
| `search-companies-step` | idem `search-companies-step.test.ts` | **4 falhas** / 22 pass | 26 pass |
| `AgentLeadReview` | `git stash push -- src/components/agent/AgentLeadReview.tsx` + run | **13 falhas** / 20 pass | 33 pass |

O RED do card foi provado revertendo APENAS o componente (stash cirúrgico) e restaurando em seguida —
os testes novos falham contra o código de ontem, não contra um fixture inventado.

**Correção de expectativa durante o RED→GREEN:** o primeiro teste do autopilot esperava
`code: "STEP_SEARCH_LEADS_ERROR"`. Um `throw new Error` genérico vira `STEP_EXECUTION_ERROR` em
`BaseStep.toPipelineError` (só `ExternalServiceError` recebe o código tipado). O código do step está
correto e consistente com as outras validações de domínio dele ("Cargos sao obrigatorios", "Lista de
empresas..."); a expectativa é que estava errada.

**Regressão encontrada e fechada na hora:** o mock de store do `AgentChat.test.tsx` é um objeto
literal fixo — sem `setChatInputDraft` nele, a chamada dentro de `cancelCurrentExecution` lançava
`TypeError`, o `catch` disparava `toast.error` e o teste do 409 da 22.10 quebrava. Os 3 setters novos
entraram em `setupDefaults`.

**Lint (pré-commit `--max-warnings=0` linta o arquivo INTEIRO — memória do projeto):**
- `AgentInput.tsx`: `react-hooks/set-state-in-effect` barrou `setMessage` no corpo do efeito.
  Reescrito com `useAgentStore.subscribe` — que é o padrão indicado pela própria regra ("subscribe
  for updates from some external system, calling setState in a callback").
- `AgentExecutionPlan.tsx:87`: `Unused eslint-disable directive` **PRÉ-EXISTENTE** (confirmado
  rodando eslint na versão do HEAD via stash). Não foi introduzido aqui, mas bloquearia o commit de
  quem tocasse o arquivo. Diretiva removida, motivo documentado no lugar dela.

**Validações finais:** `npx vitest run` → **402 files / 7243 pass / 2 skip / 0 fail** (baseline
7108 → **+135 testes**, zero regressão). `npx tsc --noEmit` → **182 erros = baseline EXATO, 0 em
`src/`**. `npx eslint --max-warnings=0` limpo nos 12 arquivos de `src/` e nos 9 de teste.

### Completion Notes List

**AC1 — zero deixou de ser sucesso.** `buildSearchOutput` (leads) e o retorno do `search_companies`
ganharam o ramo de lista vazia. `BaseStep` passou a ler `output.emptyResult` e trocar as DUAS
mensagens mentirosas: o gate ("...concluida. Revise os resultados e aprove") e o `logStep`
("...concluido com sucesso"). O gatilho é sempre `leads.length === 0` / `companies.length === 0`,
**nunca `totalFound`** (Trap #5 — coberto por teste com `totalEntries: 137` e página vazia). Busca
com ≥1 resultado continua byte-a-byte igual, com teste explícito nos dois steps.

**AC2 — empty-state de diagnóstico.** Novo helper puro `src/lib/agent/empty-search-diagnosis.ts`
(78 testes). Roda no SERVIDOR, dentro do step, onde briefing e filtros efetivos coexistem; o
resultado viaja no `output` JSONB (zero migration) até o card. Ordem de causas implementada conforme
a spec, com uma adição: `quality_floor_applied` (piso 11+ auto-aplicado da 22.6) entra DEPOIS de
cidade-única, para não empurrar as causas explícitas para baixo e manter o fallback de cargos
alcançável.

**AC3 — chips determinísticos.** Chip = `POST /reject` (carimbo durável + `adjustingStep`, ganhando
a reentrada pós-F5 da 22.13 de graça) → sinal efêmero `pendingChipAdjustment` no store → efeito no
`AgentChat` consome UMA vez → `{...persistido, ...delta}` → `PATCH` (objeto completo, Trap #3) →
custo + `buildAdjustmentSummary` → fase `confirm`. **Nenhum chip chama `/execute`** (teste
dedicado). `recordUserTurn(label)` + `recordAgentTurn(resumo)` mantêm a memória coerente.

**AC4 — um estado por vez.** Chip e texto convergem no MESMO `adjustingStep`. Clicar um chip desabilita
os demais (`isDisabled` cobre `loading`, `actionTaken` e `chipLoading`), e o `rejected` durável mantém
tudo desabilitado após F5. Sinal órfão (execução trocada/descartada) é DESCARTADO, nunca aplicado —
mesma disciplina do P6 da review da 22.13.

**AC5 — `search_companies`.** "Aprovar" agora tem `disabled={isDisabled || hasNoCompanies}`. Antes
era possível aprovar 0 empresas e o `search_leads` seguinte lançava "Lista de empresas do step
anterior e obrigatoria". Diagnóstico mínimo próprio (`diagnoseEmptyCompanySearch`) — sem chips
(Trap #6), porque o valor ali é outro: mostrar a **divergência silenciosa** entre o que o usuário
pediu e o que foi resolvido (tecnologia fora do catálogo, localização não mapeada para país, tamanho
que não casou o regex — hoje tudo isso some sem aviso).

**AC6 — autopilot para com a verdade.** Sem gate não há empty-state para renderizar, então o step
falha de forma controlada com mensagem PT-BR e o orchestrator faz o de sempre (`paused` + mensagem de
erro). A condição é `mode !== "guided"` — espelha exatamente a decisão de `BaseStep.run`, cobrindo
também `mode` ausente.

**AC7 — spike IMPLEMENTADO (não descartado).** O ponto de injeção limpo existe: `GET /plan` com
**opt-in `?viability=1`**, pedido só pelo `AgentExecutionPlan` (monta uma vez, antes do "Iniciar
Execução"). O `fetchStepEstimatedCost` da 22.13 bate no MESMO endpoint a cada turno de ajuste e não
passa o param — Trap #7 fechado por construção, com teste que prova que a Apollo não é chamada sem o
opt-in. Fail-open em tudo (chave ausente, decrypt, rede, rate limit → `viability: null`, plano
idêntico ao de hoje). **Achado de escopo tratado:** a contagem e a busca real montavam os filtros
separadamente, o que faria a estimativa mentir; extraí `buildDirectSearchFilters` em `search-defaults.ts`
como SSOT dos dois (a busca usa `perPage: 25`, a contagem `perPage: 1`).

**AC8d — SMOKE REAL FEITO E APROVADO (Playwright, app local, LLM + Apollo reais, logado Fabossi,
2026-07-25).** Fabossi autorizou explicitamente o caminho pago. Roteiro do E2E reproduzido e o
resultado foi **0 → 138 leads**:

1. **Reprodução exata do caso Atibaia.** "Donos e Diretores de clínicas de estética em Atibaia,
   empresas com menos de 11 funcionários" → o parser real produziu `companySize: "menos de 11
   funcionários"` (**não-canônico**, exatamente o defeito que a story previu), `industry: "clínicas
   de estética"`, `location: "Atibaia"`.
2. **AC7 provado ANTES de gastar** — o Plano de Execução exibiu *"Estimativa: 0 resultados com esses
   filtros. Vale ajustar o briefing antes de iniciar — do jeito que esta, a busca deve voltar
   vazia."* A contagem foi feita na Apollo REAL com os filtros REAIS. A suíte mocka a Apollo e não
   provaria isso. Screenshot `22-14-smoke-1-viabilidade-zero.png`.
3. **AC1 provado na tela** — a mensagem do log virou *"Step 2 (search_leads) nao encontrou
   resultados"*. Antes desta story era *"concluido com sucesso"* com zero leads na mão.
4. **AC2 provado com dado real** — nenhuma tabela vazia, nenhum input de filtro, nenhum "Aprovar (0
   leads)". O card listou os filtros efetivos, marcou `menos de 11 funcionários` como *"Formato não
   reconhecido pela base"* com a lista dos 8 buckets aceitos, explicou a indústria como busca por
   TEXTO, e ordenou as 3 causas exatamente como a heurística prevê (tamanho não-canônico → indústria
   textual → cidade única). Screenshot `22-14-smoke-2-empty-state-diagnostico.png`.
5. **AC3 provado** — clique em "Corrigir tamanho para 1-10" → `POST /reject` carimbou o gate
   (*"Motivo informado: Corrigir tamanho para 1-10"*), o card virou ❌ Rejeitado, e o agente
   respondeu com o resumo já ajustado (`Tamanho: 1-10`) + *"custa aproximadamente R$ 3,00.
   Confirma?"*. **Nada executou com o clique.** Screenshot `22-14-smoke-3-resumo-chip-custo.png`.
6. **AC4 provado ao vivo (o que só o app real prova)** — em vez de confirmar direto, mandei
   "remove também o filtro de indústria" por TEXTO. O novo resumo veio com `Tamanho: 1-10`
   **preservado** (o delta do chip sobreviveu, via `recordUserTurn` na memória conversacional) e
   `Industria: sem filtro` + *"Atencao: vou REMOVER Industria do que estava valendo"*. Chip e texto
   convergiram no mesmo estado, sem estado paralelo.
7. **Re-execução e gate reaberto COM resultados** — "sim" → a busca rodou e o gate voltou com
   **"25 de 138 leads selecionados"**, no card NORMAL (tabela + "Aprovar (25 leads)" habilitado),
   e o log de volta a "concluido com sucesso" (correto: agora há resultados). Confirma também que o
   caminho não-vazio ficou byte-a-byte igual. Screenshot `22-14-smoke-4-gate-reaberto-138-leads.png`.

**Parei no gate reaberto** (guardrail de custo): não aprovei leads, não criei campanha, não exportei.

**Console durante o smoke:** apenas o hydration mismatch PRÉ-EXISTENTE do submenu Leads da sidebar
(gotcha já documentado nas stories 22.3/22.4/22.5/22.6). Nenhum erro novo.

**Achado colateral (não é defeito desta story):** o `AgentMessageBubble` renderiza o badge
"Processando..." com spinner na mensagem de conclusão do step, porque o `logStep` grava
`messageType: "progress"`. É exatamente a causa nº2 mapeada pela **Story 22.17** (ready-for-dev), que
mexe no TIPO da mensagem enquanto esta mexeu no CONTEÚDO — a divisão prevista no Trap #1 se
confirmou na prática, sem colisão de arquivo.

**Fora de escopo confirmado:** `leadCount` no briefing e a normalização de `companySize` freeform →
bucket canônico ANTES da Apollo continuam fora (registrados na story). Esta story dá **consequência
visível** ao defer da 22.6 — o formato inválido agora é diagnosticado e corrigível em um clique — sem
mexer no parser.

### File List

**Novos**
- `src/lib/agent/empty-search-diagnosis.ts`
- `__tests__/unit/lib/agent/empty-search-diagnosis.test.ts`

**Modificados — código**
- `src/lib/agent/search-defaults.ts` (SSOT `buildDirectSearchFilters`)
- `src/lib/agent/steps/base-step.ts` (mensagens honestas de gate e log)
- `src/lib/agent/steps/search-leads-step.ts` (ramo vazio: diagnóstico no guiado, throw no autopilot)
- `src/lib/agent/steps/search-companies-step.ts` (idem, com diagnóstico mínimo)
- `src/stores/use-agent-store.ts` (`pendingChipAdjustment`, `chatInputDraft`)
- `src/components/agent/AgentLeadReview.tsx` (empty-state + chips)
- `src/components/agent/AgentApprovalGate.tsx` (guard de 0 + diagnóstico mínimo)
- `src/components/agent/AgentChat.tsx` (`applyChipAdjustment` + efeito consumidor)
- `src/components/agent/AgentInput.tsx` (pré-preenchimento via `subscribe`)
- `src/components/agent/AgentExecutionPlan.tsx` (aviso de viabilidade + opt-in)
- `src/app/api/agent/executions/[executionId]/plan/route.ts` (contagem de viabilidade)

**Modificados — testes**
- `__tests__/unit/lib/agent/steps/search-leads-step.test.ts`
- `__tests__/unit/lib/agent/steps/search-companies-step.test.ts`
- `__tests__/unit/components/agent/AgentLeadReview.test.tsx`
- `__tests__/unit/components/agent/AgentApprovalGate.test.tsx`
- `__tests__/unit/components/agent/AgentChat.test.tsx`
- `__tests__/unit/components/agent/AgentInput.test.tsx`
- `__tests__/unit/components/agent/AgentExecutionPlan.test.tsx`
- `__tests__/unit/api/agent/execution-plan.test.ts`

**Modificados — artefatos BMAD**
- `_bmad-output/implementation-artifacts/22-14-recuperacao-busca-sem-resultados.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-25 | **Implementada (dev-story, Opus 5). Status: review.** 8 tasks, AC1-AC8 (incl. AC7, que foi IMPLEMENTADO e não descartado). Baseline `5cd1670` (22.13 commitada antes, por decisão do Fabossi). Novo helper puro `empty-search-diagnosis.ts` (diagnóstico + chips determinísticos, 78 testes); zero deixou de ser sucesso nos 2 steps de busca e nas 2 mensagens da `BaseStep`; empty-state com chips no card de leads; guard de "Aprovar 0" no card de empresas; autopilot falha controlado; contagem de viabilidade pré-busca via opt-in `?viability=1` no `/plan` (Trap #7 fechado por construção) com `buildDirectSearchFilters` extraído como SSOT para a estimativa não mentir. RED provado em 3 eixos (9 + 4 falhas nos steps; 13 no card via stash cirúrgico). Suíte 402 files/7243 pass/2 skip/0 fail (+135, zero regressão); tsc 182 = baseline exato, 0 em `src/`; eslint `--max-warnings=0` limpo (2 achados de lint fechados, um deles pré-existente que bloquearia o commit). **SMOKE REAL APROVADO: 0 → 138 leads**, com o aviso de viabilidade prevendo o 0 antes de gastar e a convergência chip→texto provada ao vivo. Falta: code-review. |
| 2026-07-25 | **Contexto completo (create-story, Fable 5).** Caminho do 0-leads mapeado ponta-a-ponta em código (`buildSearchOutput` sem guard → gate/logStep mentirosos → "0 de 0" no card); causa raiz provável do caso Atibaia identificada (`companySize` freeform cru + `industry` via `q_keywords` textual); AC ampliados: autopilot para com a verdade (AC6) e guard do `search_companies` (AC5); chips especificados como delta determinístico SEM `/parse` reusando a 22.13 (D1-D5); spike de contagem validado na doc oficial Apollo (search não consome créditos, `total_entries` disponível); 9 traps com file:line, incl. colisão com a 22.17 no `logStep` e baseline não-commitado da 22.13. Status: ready-for-dev. |
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E — busca vazia tratada como sucesso, sem recuperação; contraste 0 → 248 leads ao relaxar filtros provado ao vivo. Status: draft. |
