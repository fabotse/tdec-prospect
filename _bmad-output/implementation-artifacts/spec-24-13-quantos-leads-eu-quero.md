---
title: '24.13 — Quantos leads eu quero'
type: 'feature'
created: '2026-10-21'
status: done
baseline_revision: '4b5fc84f9d3d4c6c47a07b23ae9bedb9ed21db68'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      O parser real (LLM) ainda nao foi testado distinguindo "traga 5" (leadCount) de "5 e-mails" (emailCount); os testes mockam a resposta da OpenAI.
    evidence: |-
      maybe-false: os testes de briefing-parser-service provam schema, coercao e o texto do prompt, mas nao o comportamento do modelo. Para resolver, rodar um smoke real da conversa ("CISO em SP, traga 5", "10 leads e 3 e-mails") e conferir o briefing gravado.
    location: >-
      src/lib/agent/briefing-parser-service.ts (SYSTEM_PROMPT, leadCount)
    severity: medium (unverified)
  - summary: >-
      Depois de um F5, a revisao volta ao lote original (25 leads, N pre-selecionados) mesmo que o usuario ja tenha buscado mais pelo fetch-leads.
    evidence: |-
      Comportamento anterior a esta story (17.12): o card le o previewData imutavel da mensagem do gate, e o fetch-leads so atualiza agent_steps.output. Agora a pre-selecao tambem volta para N.
    location: >-
      src/components/agent/AgentLeadReview.tsx (estado inicial de localLeads/selectedIndices)
    severity: low
---

<intent-contract>

## Intent

**Problem:** O agente não tem noção de quantos leads o usuário quer. A busca traz 25 fixos, a revisão pré-seleciona todos, e a estimativa de custo supõe 25 enriquecimentos. Quem pede "traga 5" precisa desmarcar 20 leads à mão e vê um custo que não corresponde ao pedido.

**Approach:** Criar o campo `leadCount` (N) no briefing, seguindo o mesmo caminho do `emailCount` (parser → schema do PATCH → merge de ajuste → card/resumo). N passa a valer em quatro lugares: no texto do plano ("até N leads"), na estimativa de custo (N enriquecimentos), no volume da busca (página de `max(25, N)`, com teto de 100) e na revisão, que pré-seleciona N e ganha um input numérico livre de quantidade.

## Boundaries & Constraints

**Always:**
- `leadCount`: inteiro de 1 a 500 (mesmo teto do `fetch-leads`) ou `null`. Ausente ou inválido vira `null` sem derrubar o parse nem o PATCH (fail-open, mesmo padrão do `emailCount` com `z.coerce`).
- O parser distingue as duas quantidades. "Traga 5 leads", "quero 10 contatos" e "só 3 pessoas" preenchem `leadCount`. "3 e-mails" e "sequência de 2" preenchem `emailCount`. Uma frase com as duas preenche as duas.
- `leadCount` é metadado: não altera `nextAction`, `skipSteps` nem os filtros de busca, e nunca é exigido para prosseguir.
- Card de resumo: chip "Leads" com o valor "Até N leads" ("Até 1 lead" no singular), editável no input numérico. Resumo em texto: linha `- Leads: até N` só quando N existe. `briefingChanged` passa a comparar `leadCount`. `mergeAdjustedBriefing` usa a regra dos metadados: o valor do parse vence e a ausência preserva o anterior.
- Fonte única em `agent-pricing.ts`, consumida pelo estimador, pelo step e pelo plano:
  - `resolveLeadVolume(briefing)`: quantidade de leads importados se houver; senão N; senão 25.
  - `resolveLeadsPerPage(briefing)`: `min(max(25, N), 100)`; sem N, 25.
- Estimativa: `create_campaign` calculado com `resolveLeadVolume` (enrichment e chamadas de IA). Plano: a descrição de `search_leads` termina com " — até N leads" quando N existe.
- `search_leads`: `perPage = resolveLeadsPerPage` nos dois ramos (busca direta e por domínio). O output ganha `leadCount: N | null`. Sem gate de revisão (modo diferente de `guided`) e com N definido, o output leva só os N primeiros leads, e `cost.apollo_search` é contado sobre essa lista.
- Revisão (`AgentLeadReview`):
  - Pré-seleção: com N, seleciona os primeiros `min(N, leads)`; sem N, seleciona todos, como hoje.
  - Área "Quantos leads deseja usar?" visível sempre que há leads, com input numérico livre (1 até `min(500, totalFound)`). Os botões atuais (50/100/200/500, com os mesmos filtros de hoje) continuam ali enquanto não houve expansão.
  - Quantidade Q menor ou igual aos leads carregados: o botão "Selecionar Q leads" reseleciona os Q primeiros, sem chamada externa. Q maior: o botão "Buscar Q leads" chama `fetch-leads` (fluxo de hoje), mostra o texto de custo de hoje e depois seleciona os Q primeiros.
  - Com N maior que os leads carregados, o input já vem com N.

**Never:**
- Nada de migration (o briefing é JSONB), `pg_cron`, Edge Function ou secrets. Nenhuma trava nova no export ou na ativação do Instantly.
- Sem N, nada muda no que é observável: busca com 25, pré-seleção de todos, plano e custo iguais aos de hoje. As exceções são o input numérico novo na revisão e o chip "Leads: nao definido" no card.
- Não mudar o fluxo de leads importados (N é ignorado; vale a contagem dos importados) nem o `fetch-leads` (rota, limites e custo).
- Não implementar Fit Score, ordenação ou universo de 3–5× N (fica para a 24.16).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Parser N | "CISO em SP, traga 5" | `leadCount: 5`, `emailCount: null` | — |
| Parser ambos | "10 leads e 3 e-mails" | `leadCount: 10`, `emailCount: 3` | — |
| Parser inválido | LLM devolve `"abc"`, `0` ou `900` | `leadCount: null`, parse segue | `.catch(null)` |
| PATCH | briefing com `leadCount: 5` | persistido (sem strip) | `0`/`501` → 400, como o `emailCount` |
| Chip | digita "7" / "0" / "x" | "Até 7 leads" / erro inline / erro inline | erro: "Informe um numero inteiro de 1 a 500." |
| Estimativa | N = 5, busca direta, 3 e-mails | `create_campaign` = 5 × apollo + `estimateAICallsForCampaign(5, 3)` × openai | — |
| Estimativa importados | 4 importados e N = 10 | leads = 4 | — |
| perPage | N = 5 / 60 / 300 / null | 25 / 60 / 100 / 25 | — |
| Autopilot | N = 5, busca devolve 25 | output com 5 leads, `apollo_search` 5 | — |
| Revisão N | N = 5, 25 leads | 5 selecionados, "Aprovar (5 leads)" | — |
| Revisão N > lote | N = 200, 100 leads, total 900 | 100 selecionados, input com 200, botão "Buscar 200 leads" | — |
| Revisão Q local | 25 leads, digita 10 | "Selecionar 10 leads" → 10 selecionados, sem fetch | Q fora da faixa: botão desabilitado |
| Revisão sem N | dados antigos sem `leadCount` | todos selecionados (como hoje) | — |

</intent-contract>

## Code Map

- `src/types/agent.ts:113-133` -- `ParsedBriefing`: adicionar `leadCount?: number | null` ao lado de `emailCount` (:127).
- `src/lib/agent/briefing-parser-service.ts` -- schema `briefingResponseSchema` (:72, `emailCount` em :101 é o modelo, com `z.coerce`); `SYSTEM_PROMPT` (bloco CAMPOS OPCIONAIS DE CAMPANHA :125-136 e regra 6.1 :149); montagem campo a campo do briefing (:246-264, armadilha de strip nº 1: sem a linha, o campo some).
- `src/app/api/agent/executions/[executionId]/briefing/route.ts:35-75` -- schema do PATCH (`z.object` faz strip; `emailCount` em :48). Adicionar `leadCount: z.number().int().min(1).max(500).nullable().optional()`.
- `src/lib/agent/briefing-adjustment.ts:139-164` -- `mergeAdjustedBriefing` (metadados: o valor do parse vence e a ausência preserva). `buildAdjustmentSummary` (:226): no ramo de busca (else, :258), adicionar `- Leads: até N` só quando `merged.leadCount` existir. Os textos atuais não mudam.
- `src/hooks/use-briefing-flow.ts` -- `generateBriefingSummary` (:191, linha `- Leads: até N` perto de `emailCount` :205); `briefingChanged` (:310-334); `BriefingCardField`, `BRIEFING_FIELD_LABELS` (:629-652, rótulo "Leads"); `formatBriefingFieldValue` (:666, "Até N leads"/"Até 1 lead"); `parseBriefingFieldInput` (:684, novo `case "leadCount"` no molde do `emailCount` :718, faixa 1–500). `editBriefingField` (:1815) é genérico e não muda.
- `src/components/agent/AgentConfirmationCard.tsx` -- `BRIEFING_CHIP_FIELDS` (:42, `leadCount` logo depois de `companySize`); `inputMode` numérico (:118) também para `leadCount`.
- `src/lib/agent/agent-pricing.ts:32-39` -- `AGENT_PIPELINE_VOLUMES`: adicionar `maxLeadsPerSearch: 100` e as funções puras `resolveLeadVolume` e `resolveLeadsPerPage`.
- `src/lib/services/agent-cost-estimator.ts:107` -- `const leads = ...` passa a ser `resolveLeadVolume(briefing)`.
- `src/lib/services/agent-plan-generator.ts:38-63` -- `search_leads.descriptionFn`: adicionar o sufixo " — até N leads" nos dois ramos ativos (não no ramo pulado).
- `src/lib/agent/steps/search-leads-step.ts` -- `LEADS_PER_PAGE` (:33) é usado em :134 (direta) e :165 (domínios), e passa a ser `resolveLeadsPerPage(briefing)`. `buildSearchOutput` (:218-276) recebe `mode`; o ramo não vazio aplica o corte de autopilot e inclui `leadCount` em `data`. O `previewData` do gate é o próprio `result.data` (`base-step.ts:244`), então o N chega à revisão sem outra mudança.
- `src/components/agent/AgentLeadReview.tsx` -- `data` (:37, `+ leadCount?: number | null`); `selectedIndices` inicial (:65); estado da 17.12 (:84-86); `handleFetchMore` (:121, depois do fetch seleciona os `min(Q, novos)` primeiros); bloco do seletor (:426-471), a reestruturar conforme o Always.
- Consumidor sem mudança: `src/app/api/agent/executions/[executionId]/confirm/route.ts` recalcula a estimativa a partir do briefing persistido e recebe N de graça.
- Testes a estender: `__tests__/unit/lib/agent/briefing-parser-service.test.ts`, `__tests__/unit/api/agent/briefing-update.test.ts`, `__tests__/unit/lib/agent/briefing-adjustment.test.ts`, `__tests__/unit/hooks/use-briefing-flow.test.tsx`, `__tests__/unit/components/agent/AgentConfirmationCard.test.tsx`, `__tests__/unit/lib/agent/agent-pricing.test.ts`, `__tests__/unit/lib/services/agent-cost-estimator.test.ts`, `__tests__/unit/lib/services/agent-plan-generator.test.ts`, `__tests__/unit/lib/agent/steps/search-leads-step.test.ts`, `__tests__/unit/components/agent/AgentLeadReview.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/agent.ts`, `briefing-parser-service.ts`, `briefing/route.ts` -- campo `leadCount` (tipo, schema fail-open, prompt que separa leads de e-mails, montagem campo a campo, PATCH). -- AC1.
- [x] `briefing-adjustment.ts`, `use-briefing-flow.ts`, `AgentConfirmationCard.tsx` -- merge, diff, resumo, chip "Até N leads" e validação 1–500. -- AC1.
- [x] `agent-pricing.ts`, `agent-cost-estimator.ts`, `agent-plan-generator.ts` -- `resolveLeadVolume`/`resolveLeadsPerPage`, custo para N e "até N leads" no plano. -- AC2.
- [x] `search-leads-step.ts` -- `perPage` por N, `leadCount` no output, corte no autopilot. -- AC2/AC3.
- [x] `AgentLeadReview.tsx` -- pré-seleção de N e input numérico livre com Selecionar/Buscar. -- AC3.
- [x] Testes: uma linha por cenário da matriz I/O nos arquivos de teste do Code Map. Os testes existentes continuam verdes (sem N, o comportamento é o de hoje).

**Acceptance Criteria:**
- Given a conversa, when o usuário informa uma quantidade de leads, then o parser grava `leadCount` no briefing (sem confundir com `emailCount`), o card de resumo mostra "Até N leads" e o valor persiste no PATCH do briefing.
- Given o plano de execução com N, when exibido, then a etapa de busca mostra "até N leads" e a estimativa de `create_campaign` é calculada para N.
- Given a revisão de leads de uma execução com N, when abre, then N leads (não todos) estão pré-selecionados e há um input numérico livre de quantidade, além das opções atuais.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 30 findings — high 0, medium 0, low 16, false 13, maybe-false 1
- findings:
  - `low` `reject` [blind] Autopilot com N > 100 entrega no maximo 100 leads (pagina limitada a 100, sem paginar) — cenario raro (autopilot com mais de 100 leads; o foco da story e poucos leads); o fix exige paginacao nova no step ou ramo por modo no estimador.
  - `low` `reject` [blind] Plano e estimativa dizem "ate N" com N > 100 enquanto a primeira pagina traz 100 — mesmo grupo do anterior; no guiado o usuario alcanca N pelo "Buscar N leads", e no autopilot o valor e teto ("ate").
  - `false` `reject` [blind] A regra 6.1 do prompt contradiz o uso de leadCount no perPage — a regra fala dos parametros que o LLM extrai (filtros, nextAction, skipSteps), e leadCount nao altera nenhum deles; o perPage e decidido no codigo.
  - `false` `reject` [blind] Resumos usam truthiness e mostrariam "ate 900" de JSONB legado — leadCount e campo novo e todos os escritores (parser, PATCH, chip) validam 1-500; o valor fora da faixa nao e alcancavel.
  - `false` `reject` [blind] formatBriefingFieldValue mostra "Ate NaN leads" para valor invalido — mesmo motivo: nenhum escritor grava valor nao numerico ou fora da faixa.
  - `low` `reject` [blind] Ajuste por conversa nao consegue remover N ("traga todos") — trade-off ja aceito na 22.13 para metadados (ausencia preserva); o fix exige sentinela nova no parser.
  - `low` `reject` [blind] Input vazio quando N <= carregados, embora N esteja pre-selecionado — comportamento definido na spec (pre-preencher so quando N > lote); cosmetico.
  - `false` `reject` [blind] maxQuantity ignora o totalFound devolvido pelo fetch-leads — o total da Apollo vem dos mesmos filtros e nao muda entre a busca e o fetch.
  - `false` `reject` [blind] Inicializadores do useState leem data uma unica vez — o previewData da mensagem do gate e imutavel; nao ha "data nova" para o mesmo card.
  - `low` `reject` [blind] Input visivel depois da expansao permite novo fetch, que repagina desde a pagina 1 — a busca Apollo (api_search) nao consome credito; custa so latencia, e o botao mostra a linha de custo antes.
  - `false` `reject` [blind] apollo_search no autopilot conta os N cortados, nao os 25 buscados — definido na spec; o contador nao entra no custo real (search_leads = 0 em computeStepActualCost) e o fetch-leads so roda no guiado.
  - `low` `reject` [blind] Falta registro dos 3 pontos do CLAUDE.md — o fix e editar a spec; os 3 pontos foram registrados nas Completion Notes na finalizacao.
  - `false` `reject` [blind] Falta teste de que o create_campaign recebe so os N aprovados no guiado — o approve envia so os selecionados e o orquestrador ja troca leads por approvedLeads (orchestrator.ts:179-181), comportamento coberto desde a 17.5.
  - `low` `patch` [edge] Input pre-preenchido com N acima do maximo (ex.: N = 50, Apollo achou 30) deixava o botao desabilitado sem explicacao — corrigido: valor inicial = min(N, maximo), vazio quando nao passa do lote; 2 testes novos.
  - `low` `reject` [edge] Q digitado fora da faixa desabilita o botao sem erro inline — o placeholder ja mostra "1 a max"; o fix adiciona elemento novo de UI para um caso de digitacao.
  - `low` `reject` [edge] Autopilot com N acima de 100 — mesmo grupo do primeiro achado blind.
  - `false` `reject` [edge] Modo undefined corta a lista num gate — BaseStep.run usa a mesma regra (so "guided" abre gate), entao modo undefined nunca tem revisao.
  - `low` `patch` [edge] Resumo mostrava "- Leads: ate N" no fluxo de leads importados, contradizendo "X leads importados" — corrigido: linha so sem importedLeads; teste novo.
  - `low` `reject` [edge] N nao pode ser removido pela conversa no ajuste — mesmo grupo do achado blind.
  - `low` `defer` [edge] Remount depois do fetch-more volta para N — comportamento anterior da 17.12 (o card volta ao lote original); registrado em deferred.
  - `false` `reject` [edge] Chip com "Ate NaN/0 leads" para JSONB invalido — mesmo grupo do achado blind (inalcancavel).
  - `low` `reject` [edge] Fetch repetido apos expansao repagina desde a pagina 1 — mesmo grupo do achado blind (sem credito).
  - `low` `patch` [verification-gap] Valor pre-preenchido acima de maxQuantity — mesmo grupo do patch edge (corrigido).
  - `low` `reject` [verification-gap] Autopilot com N acima de 100 — mesmo grupo do primeiro achado blind.
  - `maybe-false` `defer` [intent] A distincao leads x e-mails so e testada com resposta mockada — se o modelo errar, seria medium; resolve com smoke real da conversa; registrado em deferred.
  - `false` `reject` [intent] O confirm nao teria teste com N — o confirm le o briefing persistido e chama estimateCosts, cujo calculo com N e testado.
  - `false` `reject` [intent] Ligacao previewData -> AgentLeadReview sem teste — base-step.ts:244 devolve result.data e AgentMessageBubble.tsx:165 repassa; o N chega intacto.
  - `false` `reject` [intent] No guiado o gasto segue a selecao, nao N — e o desenho da spec: N e pre-selecionado e o usuario decide.
  - `false` `reject` [intent] Sem N aparecem o chip e o input novos — mudanca prevista no Never da spec.
  - `low` `reject` [intent] Completion Notes ausentes — o fix e editar a spec; registradas na finalizacao.

## Design Notes

- **Página de `max(25, N)`:** a busca Apollo (`api_search`) não consome crédito. Buscar pelo menos 25 mantém margem para o usuário trocar leads na revisão (e prepara o universo de 3–5× N da 24.16). Com N > 25, a primeira página já traz N, até o limite de 100 por página da Apollo. Acima disso, a revisão oferece "Buscar N leads" pelo `fetch-leads` de hoje.
- **Corte no autopilot:** sem gate, o `create_campaign` enriquece todos os leads do output. Sem o corte, quem pediu 5 pagaria 25 enriquecimentos e a estimativa para N mentiria. No modo guiado não há corte: a lista completa vai para a revisão com N pré-selecionados.
- **Chip sempre visível:** segue o padrão dos demais campos opcionais (`emailCount`, `objective`), que mostram "nao definido" e ficam editáveis.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/lib/services __tests__/unit/api/agent __tests__/unit/hooks/use-briefing-flow.test.tsx __tests__/unit/components/agent` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Os 3 pontos do cliente por análise do diff: busca sem N inalterada (perPage 25), export e ativação não tocados, nada em webhook ou `reply-sweep`.

## Completion Notes

**O que pode mudar para o cliente**
- Conversa do agente: o parser passa a extrair `leadCount` (prompt do parser alterado: campo novo e regra leads x e-mails). O card de confirmacao ganha o chip "Leads" ("Ate N leads" / "nao definido"), e o resumo ganha "- Leads: ate N" quando ha N (exceto no fluxo de leads importados).
- Rota `PATCH /api/agent/executions/[id]/briefing`: aceita `leadCount` (1-500). Rotas `plan`/`confirm`: a estimativa de `create_campaign` usa N quando existe.
- Step `search_leads`: com N, a pagina da Apollo passa a ser min(max(25, N), 100) e o output leva `leadCount`. No autopilot com N, so os N primeiros seguem para a campanha.
- Revisao de leads: pre-seleciona N e ganha o input "Quantos leads deseja usar?" sempre visivel (inclusive sem N), com "Selecionar Q" (local) e "Buscar Q" (o `fetch-leads` de hoje).
- Nenhuma tabela, migration, job `pg_cron`, Edge Function, secret ou integracao nova.

**Os 3 pontos (por analise do diff, sem smoke real)**
1. Campanhas rodando, webhook e `reply-sweep`: nao tocados.
2. Busca de leads: sem N, a busca e identica (pagina de 25, mesmos filtros). Com N, so o tamanho da pagina muda (busca Apollo sem credito).
3. Criacao, export e ativacao no Instantly: `create-campaign`, `export` e `activate` nao foram tocados, e nao ha trava nova. No autopilot com N, a campanha recebe N leads, que e o pedido do usuario.

## Auto Run Result

Status: done

**Resumo:** o usuario agora diz quantos leads quer ("traga 5") e o agente respeita o N no briefing (parser, PATCH, card "Ate N leads"), no plano ("ate N leads" e custo de `create_campaign` para N), no volume da busca (pagina de max(25, N), com teto de 100; corte em N no autopilot) e na revisao (pre-selecao de N + input numerico livre com Selecionar/Buscar, alem dos botoes 50/100/200/500).

**Arquivos alterados:**
- `src/types/agent.ts` — `ParsedBriefing.leadCount`.
- `src/lib/agent/briefing-parser-service.ts` — schema fail-open, prompt (leads x e-mails), montagem campo a campo.
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` — `leadCount` no schema do PATCH.
- `src/lib/agent/briefing-adjustment.ts` — merge (ausencia preserva) e linha no resumo de ajuste.
- `src/hooks/use-briefing-flow.ts` — resumo, `briefingChanged`, chip (rotulo, formato, validacao 1-500).
- `src/components/agent/AgentConfirmationCard.tsx` — chip "Leads" com input numerico.
- `src/lib/agent/agent-pricing.ts` — `resolveLeadCount`, `resolveLeadVolume`, `resolveLeadsPerPage`.
- `src/lib/services/agent-cost-estimator.ts`, `src/lib/services/agent-plan-generator.ts` — custo para N e "ate N leads".
- `src/lib/agent/steps/search-leads-step.ts` — pagina por N, `leadCount` no output, corte no autopilot.
- `src/components/agent/AgentLeadReview.tsx` — pre-selecao de N e input de quantidade.
- Testes estendidos nos 10 arquivos do Code Map.

**Revisao:** 30 achados (0 high, 0 medium, 16 low, 13 false, 1 maybe-false). Patches: 2 entradas low (pre-preenchimento da quantidade limitado ao maximo; linha "Leads" fora do fluxo de importados), com testes novos. Deferidos: 2 (parser real nao testado ao vivo, medium nao verificado; remount volta ao lote original, low anterior). Rejeitados: 13 low (motivos no Triage Log) e 13 false.

**Follow-up review recomendado:** false — so 2 entradas low corrigidas, nenhuma high ou medium.

**Verificacao:** `npm run lint` (0 erros, 134 warnings ja existentes), `npm run typecheck` ok, `npm run test:run` 438 arquivos / 8299 testes verdes. A auditoria da matriz I/O encontrou teste passando para todas as linhas.

**Riscos residuais:** o comportamento do LLM real na distincao leads x e-mails so foi checado pelo prompt e por mocks (smoke recomendado: "CISO em SP, traga 5"). No autopilot, N acima de 100 entrega no maximo 100 leads. Sem N, o cliente ve duas mudancas de UI: o chip "Leads: nao definido" e o input de quantidade na revisao.
