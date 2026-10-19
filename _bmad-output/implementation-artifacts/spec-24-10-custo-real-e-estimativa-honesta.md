---
title: '24.10 — Custo real e estimativa honesta'
type: 'feature'
created: '2026-10-19'
status: 'awaiting-operator'
baseline_revision: '0d55a30f735f6876479e9e8051fc8fd82a8c4d0c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A estimativa assume 3 e-mails quando o usuario nao informa a quantidade, mas o prompt de estrutura gera 4-5 no COLD_OUTREACH e 5-7 no NURTURE; o teto de chamadas de IA fica abaixo do real.
    evidence: |-
      src/lib/ai/prompts/defaults.ts:794-818 (heuristica por objetivo). A suposicao de 3 e anterior a esta story (22.5, "Sem emailCount, mantem a heuristica de 3") e foi mantida no intent-contract. Diferenca no default: 47 vs 61 chamadas (~R$ 0,28 a R$ 0,02/chamada).
    location: >-
      src/lib/services/agent-cost-estimator.ts (emails = briefing.emailCount ?? defaultEmails)
    severity: low
  - summary: >-
      O fetch-leads pode buscar mais de 25 leads depois do plano, entao o "ate 25 leads" da estimativa deixa de ser teto nesses casos.
    evidence: |-
      fetch-leads/route.ts pagina a Apollo ate a quantidade pedida na revisao. O volume pedido pelo usuario so passa a existir com o leadCount (N) da 24.13, que deve alimentar a estimativa.
    location: >-
      src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts
    severity: low
  - summary: >-
      Com o briefing ja salvo com premiumIcebreakers=true, a UI do plano soma o premium de novo quando o toggle e ligado (dupla contagem).
    evidence: |-
      Comportamento anterior a esta story (a UI ja somava ESTIMATED_LEADS x APIFY_COST_PER_LEAD sobre um total que podia incluir o premium). Hoje o GET /plan roda antes de o toggle ser persistido, entao o caso e raro.
    location: >-
      src/components/agent/AgentExecutionPlan.tsx (displayedTotal)
    severity: low
operator_actions:
  - "Revise e aplique supabase/migrations/00065_add_theirstack_to_api_usage_logs_check.sql no SQL Editor do Supabase de producao (kdgogyqyaxncqoyklyxx). Ela faz DROP/ADD do CHECK de api_usage_logs.service_name so para incluir 'theirstack' (mesmo padrao da 00058, nenhuma linha alterada); confirme que aceita esse DROP CONSTRAINT antes de aplicar."
  - "Depois de aplicar a 00065, confirme no banco que uma execucao do agente com busca de empresas gera uma linha em api_usage_logs com service_name='theirstack' e metadata.executionId preenchido."
---

<intent-contract>

## Intent

**Problem:** A estimativa do plano não bate com o pipeline. Ela supõe 60 leads, mas a busca traz no máximo 25 (2 empresas no fluxo com tecnologia). Cobra a busca Apollo, que não consome crédito, e ignora o enrichment do `create_campaign`, que é onde a Apollo cobra. Também ignora a chamada de estrutura e o revisor, e conta IA de e-mail por lead, quando os e-mails são gerados uma vez por campanha. Só Apify e revisor logam em `api_usage_logs`, e só o revisor leva a execução. `cost_actual`, `current_step` e `agent_executions.error_message` nunca são gravados. O gestor não tem como justificar o custo por lead.

**Approach:** Uma fonte única de preço e volume (`agent-pricing.ts`, em BRL, com os preços unitários de `cost_models` por tenant) alimenta a estimativa e o custo real. A estimativa usa os volumes reais do pipeline como teto ("até"). O custo real usa as contagens que cada step já grava em `agent_steps.cost`. Toda chamada paga do agente vira uma linha em `api_usage_logs` com `tenantId` + `metadata.executionId`. Na conclusão e na pausa, a execução grava `cost_actual`, e o chat recebe uma mensagem "Custo — estimado R$ X · real R$ Y". `current_step` e `error_message` passam a acompanhar o orquestrador.

## Boundaries & Constraints

**Always:**
- Uma moeda só: BRL. Toda a estimativa, o `cost_actual` e o texto do chat saem em R$ pelo mesmo `formatBRL`. Os preços vêm de `cost_models` (por tenant, já em BRL), com fallback para `DEFAULT_COSTS`. As unidades passam a ser: `theirstack` por crédito (3 por empresa), `apollo` por crédito de enrichment (`/v1/people/match`), `apify` por perfil LinkedIn, `openai` por chamada e `instantly` por export. A busca Apollo (`api_search`) custa 0.
- Volumes da estimativa (teto) da fonte única: empresas = `AGENT_PIPELINE_VOLUMES.companies` (2, hoje `MVP_LIMIT`). Leads = `importedLeads.length` quando há leads importados; senão `leadsPerSearch` (25, hoje `LEADS_PER_PAGE`). Os steps passam a importar esses valores (sem duplicar). E-mails = `emailCount ?? 3`. Chamadas de IA de `create_campaign` = 1 (estrutura) + 2 × e-mails (assunto + corpo) + leads (icebreaker) + e-mails × (1 + 2 × `MAX_REWRITES`), que é o teto do revisor.
- Estimativa por step: `search_companies` = empresas × 3 × theirstack. `search_leads` = 0 ("Busca Apollo não consome créditos"). `create_campaign` = leads × apollo (enrichment) + chamadas × openai + (premium ? leads × apify : 0). `export` = 1 × instantly. `activate` = 0. Step pulado = 0. O `CostEstimate` ganha `premiumIcebreakers: { perLead, total }` (total = leads × apify, ou 0 com `create_campaign` pulado), e a UI do plano usa esse valor em vez das constantes locais (`APIFY_COST_PER_LEAD`, `ESTIMATED_LEADS`, texto "R$ 0,15").
- Custo real por step (BRL), a partir de `agent_steps.cost` dos steps `completed`/`awaiting_approval`/`approved`. Steps `failed`/`skipped`/`pending`/`running` não entram. Regras:
  - `search_companies` = `theirstack_search` × theirstack.
  - `search_leads` = 0.
  - `create_campaign` = `apollo_enrich` × apollo + (`openai_calls`, ou, sem ele, `openai_structure` + 2 × `openai_emails` + `openai_icebreakers`) × openai + `openai_review` × openai + `apify` × apify.
  - `export` = `instantly_create` × instantly.
  - `activate` = 0.
  - Chave ausente = 0.
- `cost_actual` = `{ steps: Record<stepType, number>, total, currency: 'BRL' }` (tipo `CostActual`), recalculado do zero a cada gravação. Assim o retry nunca duplica.
- Logging (`logApiUsage`, nunca lança, sempre com `await`). Toda linha leva `tenantId` e `metadata: { executionId, stepType?, calls, source: "agent", ... }`. Uma linha por operação (padrão do revisor da 24.9):
  - TheirStack `company_search`: 1 por `searchCompanies`, `serviceName: "theirstack"`.
  - Apollo `people_search`: 1 por `searchPeople` no step, no `fetch-leads` e na viabilidade do plano.
  - Apollo `people_enrichment`: 1 por step, com `calls` = tentativas e `succeeded` = créditos. Status `success`, `partial` (houve falha) ou `failed` (todas falharam).
  - OpenAI `campaign_generation`: 1 por step, com `calls`, `promptTokens`, `completionTokens` e `models`, contados por um wrapper do provider.
  - OpenAI `briefing_parse` e `product_parse`: 1 por parse, nas rotas de parse, com tokens.
  - Apify: os logs atuais passam a levar `executionId`.
  - Instantly `campaign_export` (export), `campaign_activation` (activate) e `add_accounts` (ramo defer do orquestrador).
  - Só loga quando a chamada externa aconteceu.
- `current_step`: o orquestrador grava `stepNumber` ao começar cada step (inclusive skip). `error_message`: grava a mensagem exibida no chat quando a execução vai para `paused`, e volta a `null` no paused→running e na conclusão. Toda escrita checa `{ error }`, só loga, nunca lança e nunca sobrescreve `cancelled`.
- `recordExecutionCost(supabase, executionId, { phase: "completed" | "paused" })` lê steps, `cost_models` e `cost_estimate`, grava `cost_actual` e insere a mensagem `messageType: "cost_estimate"`. O rótulo do bubble muda para "Custo". Texto: "Custo da execução — estimado R$ X · real R$ Y" na conclusão e "Custo até aqui — estimado R$ X · real R$ Y" na pausa. Sem `cost_estimate`, mostra só o real. É fail-open total: nunca lança e nunca muda o status.
- Migration `00065` aditiva: amplia o CHECK de `api_usage_logs.service_name` com `'theirstack'`, no padrão da `00058`. Sem ela aplicada, o insert TheirStack falha em silêncio (o logger engole) e nada muda para o cliente.

**Never:**
- Nada de `UPDATE`/`DELETE` em `cost_models` ou em dados existentes. Os preços já semeados ficam como estão (só a interpretação da unidade muda; ver Design Notes). Nada de `pg_cron`, Edge Function ou secrets.
- Nenhuma trava, teto ou bloqueio novo no caminho até o Instantly. O custo nunca impede step, export ou ativação. Nada muda nas chamadas externas em si (parâmetros, ordem, quantidade).
- Não reescrever o rótulo/conteúdo das mensagens de resumo existentes. O custo vai numa mensagem própria.
- Não criar coluna `execution_id` em `api_usage_logs` (usa `metadata.executionId`, precedente da 24.9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plano fluxo tecnologia | sem skips, 3 e-mails, preços default | `search_companies` 2×3×0,10; `search_leads` 0; `create_campaign` 25×0,05 + (1+6+25+15)×0,02; `export` 0; total coerente | — |
| Plano leads importados | 4 importados, buscas puladas | leads = 4 nas contas de `create_campaign` | — |
| Premium | toggle ligado | `premiumIcebreakers.total` = leads × apify, somado na UI | — |
| Concluída | steps completed com `cost` | `cost_actual` gravado + mensagem "Custo da execução — estimado … · real …" | — |
| Pausada | step falha | `status paused`, `error_message` preenchido, `cost_actual` só dos steps concluídos, mensagem "Custo até aqui" | falha em `recordExecutionCost` só loga |
| Retry | paused → running → completed | `error_message` null, custo sem duplicar o step refeito | — |
| Cancelada concorrente | `status cancelled` | nada sobrescreve `cancelled` | CAS `.neq("status","cancelled")` |
| Log sem migration | TheirStack antes da 00065 | step segue igual | insert rejeitado é engolido pelo logger |

</intent-contract>

## Code Map

- `src/lib/services/agent-cost-estimator.ts` -- `DEFAULT_COSTS` (:16, `unitDescription` passa a descrever a unidade nova), `DEFAULT_VOLUMES` (:24, sai e vai para a fonte única), `ensureCostModels` (:63, mantém o lazy seed), `estimateCosts` (:92, reescrever com a fórmula honesta), `formatBRL` (:173, privado → usar o compartilhado).
- `src/types/agent.ts` -- `AgentExecution.cost_actual` (:57, → `CostActual | null`), `CostEstimate` (:146, + `premiumIcebreakers`), `MessageType` (:26, `cost_estimate` já existe).
- `src/lib/agent/orchestrator.ts` -- `executeStep` (:103): o resume paused→running em `:190-202` (limpar `error_message` no mesmo update). O ramo skip-por-briefing pausa em `:247`. O ramo defer (`:260-400`) faz o attach Instantly em `:274-281`, conclui em `:324-332` e pausa em `:390`. A conclusão do último step fica em `:426-433` e o catch de pausa em `:461-489`. `updateExecutionStatus` (:535, sem checar erro hoje).
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts:206-234` -- conclusão pelo approve do último step: chamar `recordExecutionCost` depois do `completed` (fail-open).
- `src/lib/agent/steps/search-companies-step.ts` -- `MVP_LIMIT` (:102), `searchCompanies` (:174), `CREDITS_PER_COMPANY` (:177).
- `src/lib/agent/steps/search-leads-step.ts` -- `LEADS_PER_PAGE` (:30), `searchPeople` (:133, :166).
- `src/lib/agent/steps/create-campaign-step.ts` -- enrichment em `:129-149` (contar tentativas e falhas) e `provider` em `:192` (embrulhar com o wrapper de uso). Os logs Apify em `:821-855` ganham `executionId` (o `input.executionId` precisa chegar a `generateIcebreakers`). `cost` em `:280-291` (+ `openai_calls`).
- `src/lib/agent/steps/export-step.ts` -- chamadas Instantly e `cost` em `:285`. `src/lib/agent/steps/activate-step.ts` -- `activateCampaign` em `:240` e `cost` em `:298`.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts:152-165` -- loop de `searchPeople`. `src/app/api/agent/executions/[executionId]/plan/route.ts:59-100` -- viabilidade (`searchPeople`) e o cálculo do plano em `:148-163`. `.../confirm/route.ts:80-122` recalcula com premium e grava `cost_estimate`.
- `src/app/api/agent/briefing/parse/route.ts:240` e `src/app/api/agent/briefing/parse-product/route.ts:118` -- chamam os parsers. `src/lib/agent/briefing-parser-service.ts:198-278` e `product-parser-service.ts:53` passam a devolver `usage` (`completion.usage`).
- `src/lib/services/usage-logger.ts:22` -- `logApiUsage` (sessão via `createClient`). `src/types/api-usage.ts` -- `UsageServiceName` (+ `"theirstack"`), `SERVICE_COST_RATES` (`Record<UsageServiceName>`, + `theirstack: 0`).
- `src/lib/ai/providers/openai.ts:62-110` -- `generateText` devolve `usage` e `model`. `src/lib/ai/copy-review-config.ts` -- `MAX_REWRITES`.
- `src/components/agent/AgentExecutionPlan.tsx` -- constantes `:19-24`, `formatCurrency` `:53`, `displayedTotal` `:144-145` e texto "R$ 0,15" `:260`. `src/components/agent/AgentMessageBubble.tsx:45` -- rótulo `cost_estimate`.
- `supabase/migrations/00058_add_openai_to_api_usage_logs_check.sql` -- padrão da 00065. A última migration é a `00064`.
- Testes existentes que precisam continuar verdes e ganhar casos: `__tests__/unit/lib/services/agent-cost-estimator.test.ts`, `agent-plan-generator.test.ts`, `__tests__/unit/lib/agent/orchestrator.test.ts`, `lib/agent/steps/*.test.ts` (search-companies, search-leads, export e activate NÃO mockam `usage-logger` hoje; adicionar o mock como em `create-campaign-step.test.ts:107-115`), `__tests__/unit/app/api/agent/executions/steps/approve.test.ts`, `__tests__/unit/api/agent/fetch-leads.test.ts`, `__tests__/unit/components/agent/AgentExecutionPlan.test.tsx`, `AgentMessageBubble.test.tsx` e os testes das rotas de parse e dos parsers.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/agent/agent-pricing.ts` -- NOVO, puro (seguro no cliente): `AGENT_PIPELINE_VOLUMES`, `THEIRSTACK_CREDITS_PER_COMPANY`, `formatBRL`, `resolveUnitPrices(costModels)`, `estimateAICallsForCampaign`, `computeActualCost(steps, prices): CostActual` e `formatCostLine(phase, estimateTotal|null, actualTotal)`. -- fonte única.
- [x] `src/lib/services/agent-cost-estimator.ts` + `src/types/agent.ts` -- estimativa honesta, `premiumIcebreakers`, `CostActual`. Os steps `search-companies`/`search-leads` importam os volumes da fonte única. -- AC1.
- [x] `src/components/agent/AgentExecutionPlan.tsx` -- usar `costEstimate.premiumIcebreakers` e `formatBRL`, sem constantes locais. `AgentMessageBubble.tsx` -- rótulo "Custo". -- AC1.
- [x] `src/lib/agent/agent-usage.ts` -- NOVO, só servidor: `logAgentUsage(...)` (embrulha `logApiUsage` com `executionId`/`stepType`/`source`) e `trackProviderUsage(provider)` (proxy que conta chamadas, tokens e modelos). -- AC2.
- [x] Steps, rotas `fetch-leads`/`plan`/parse, parsers e o ramo defer do orquestrador -- logs conforme o Always. `create-campaign` grava `openai_calls`. -- AC2.
- [x] `src/types/api-usage.ts` + `supabase/migrations/00065_add_theirstack_to_api_usage_logs_check.sql` -- `"theirstack"`. -- AC2.
- [x] `src/lib/agent/execution-cost.ts` -- NOVO: `recordExecutionCost`. Chamado nos 3 pontos de conclusão (orquestrador último step, ramo defer, approve) e nos pontos de pausa do orquestrador, depois da bolha de erro. -- AC3.
- [x] `src/lib/agent/orchestrator.ts` -- `current_step` ao iniciar o step, `error_message` na pausa (texto da bolha) e `null` no resume/conclusão; `updateExecutionStatus` checa erro. -- AC3.
- [x] Testes: NOVOS `__tests__/unit/lib/agent/agent-pricing.test.ts` (matriz do plano, custo real com/sem `openai_calls`, steps falhos ignorados, `formatCostLine`), `agent-usage.test.ts` (wrapper conta chamadas/tokens; log leva `executionId`), `execution-cost.test.ts` (grava `cost_actual`, mensagem, fail-open). Casos novos nos testes existentes listados no Code Map.

**Acceptance Criteria:**
- Given o plano de uma execução, when exibido, then cada etapa mostra o valor da fórmula honesta em R$ (busca Apollo "Gratuito", enrichment e IA em `create_campaign`), e o premium soma `leads × apify` vindo do servidor.
- Given um step do agente que chama TheirStack, Apollo, Instantly, OpenAI ou Apify, when a chamada ocorre, then existe uma linha em `api_usage_logs` com `tenant_id` e `metadata.executionId`.
- Given uma execução que conclui ou pausa, when o chat é lido, then aparece a mensagem de custo com estimado e real em R$, e `agent_executions.cost_actual` está preenchido.
- Given uma execução em andamento, when um step começa ou falha, then `current_step` é o número do step, e `error_message` tem o erro exibido (null depois do retry ou da conclusão).
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 33 findings — high 0, medium 1, low 27, false 5, maybe-false 0
- findings:
  - `low` `reject` [blind] Mensagem de custo e `cost_actual` gravados numa execucao cancelada se o cancel vencer a corrida — corrida rara (cancel durante o ultimo step/pausa), o resumo e a bolha de erro ja existentes tem o mesmo comportamento; o fix exigiria checar linhas afetadas (guarda nova).
  - `low` `reject` [blind] Cada pausa de um retry gera nova bolha "Custo ate aqui" — comportamento pedido no Always (mensagem em cada pausa, com o acumulado); nao ha duplicacao de valor.
  - `low` `reject` [blind] Parse que falha na validacao Zod nao loga os tokens — caminho raro (completion valida em JSON quase sempre passa); o fix exige o erro carregar `usage` (superficie nova).
  - `low` `patch` [blind] O activate nao loga `addAccountsToCampaign`/`getCampaignStatus` nem o caminho `mustNotActivate` — corrigido: contador `instantlyCalls` e 1 linha `campaign_activation` por tentativa (success/failed), com testes de contagem (2, 3, falha, mustNotActivate).
  - `low` `reject` [blind] Busca de viabilidade que termina depois do prazo provavelmente nao loga (fora do escopo da request) — chamada gratuita e caso raro; o fix exigiria `after()`.
  - `low` `defer` [blind] Dupla contagem do premium quando o briefing ja tem premium=true — anterior a esta story; registrado em `deferred`.
  - `low` `reject` [blind] A linha do chat nao diz que a estimativa e teto ("ate") — texto definido no Always; o plano ja descreve cada etapa com "ate".
  - `low` `reject` [blind] `openai_calls` conta chamadas que falharam, o calculo legado nao — intencional (chamada que falha pode ser cobrada); o legado so vale para execucoes antigas.
  - `false` `reject` [blind] `unit_description` das linhas de `cost_models` em producao contradiz a formula numa tela — nenhum codigo le `unit_description` (so o seed escreve); nao ha tela afetada.
  - `low` `patch` [blind] Log TheirStack depende da 00065 nao aplicada, que faz DROP CONSTRAINT — tratado na finalizacao: status `awaiting-operator` com `operator_actions` pedindo revisao explicita do DROP/ADD e aplicacao.
  - `low` `patch` [blind] `tenantId` opcional em `SearchCompaniesStep` silencia o log — mesmo grupo do achado de verificacao abaixo; teste novo no orquestrador garante que o tenant e passado.
  - `false` `reject` [blind] A mensagem de custo no approve pode deslocar o carimbo do gate — `stampLatestApprovalGate` filtra `metadata->>messageType = approval_gate` (gate-metadata.ts:46); a mensagem `cost_estimate` nao entra.
  - `low` `defer` [blind] fetch-leads pode passar de 25 leads e estourar o teto — volume pedido pelo usuario so existe com o N da 24.13; registrado em `deferred`.
  - `false` `reject` [blind] Falta teste garantindo que o revisor nao usa o provider rastreado — o revisor usa o SDK `openai` direto (copy-reviewer.ts); a dupla contagem nao ocorre.
  - `low` `defer` [edge] Default de 3 e-mails abaixo dos 4-5 do COLD_OUTREACH — suposicao anterior (22.5) mantida pelo intent-contract; registrado em `deferred`.
  - `low` `reject` [edge] Fallback do icebreaker premium pode gerar 2 chamadas por lead — so com premium ligado e falhando; o fix adiciona ramo a formula.
  - `low` `defer` [edge] fetch-leads acima de 25 leads — mesmo grupo do achado blind acima.
  - `low` `reject` [edge] Gasto de tentativas que falharam fica fora do `cost_actual` — decisao da Design Note (regra da 18.4); o gasto continua visivel em `api_usage_logs`.
  - `low` `reject` [edge] Pausa apos cancel concorrente grava custo — mesmo grupo do primeiro achado blind.
  - `low` `reject` [edge] Approve apos cancel concorrente grava mensagem de custo — mesmo grupo do primeiro achado blind.
  - `low` `reject` [edge] Log tardio da viabilidade — mesmo grupo do achado blind.
  - `low` `reject` [edge] `getLeadTracking` paginado conta como 1 chamada — so no reuso (retry) e em servico sem custo; metadado aproximado.
  - `low` `patch` [edge] Activate nao loga todas as chamadas Instantly — mesmo grupo do patch blind (corrigido).
  - `low` `reject` [edge] Parse que falha nao loga — mesmo grupo do achado blind.
  - `low` `reject` [edge] Product parse que falha nao loga — mesmo grupo do achado blind.
  - `low` `defer` [edge] Teto da estimativa abaixo do real (e-mails, premium, fetch-leads) — membros roteados acima (defer/reject).
  - `false` `reject` [edge] Remover `.catch` dos logs Apify pode rejeitar o icebreaker — `logApifySuccess`/`logApifyFailure` delegam a `logApiUsage`, que captura tudo e nunca lanca.
  - `low` `patch` [verification-gap] Nenhum teste garante que o orquestrador passa `tenantId` ao `SearchCompaniesStep` — teste novo grava os args do mock e confere `tenant-1`.
  - `low` `patch` [verification-gap] Log `add_accounts` do ramo defer nunca afirmado — asserts adicionados nos testes de attach com sucesso e falha.
  - `low` `patch` [verification-gap] Pausa do skip-por-briefing sem assert de `error_message`/custo — teste do skip estendido (status paused + error_message + `recordExecutionCost` phase paused).
  - `low` `reject` [verification-gap/other] Custo gravado em execucao cancelada — mesmo grupo do primeiro achado blind.
  - `medium` `patch` [intent] A story depende da aplicacao humana da 00065, mas a spec terminaria sem `awaiting-operator`/`operator_actions` — tratado na finalizacao: status `awaiting-operator` com `operator_actions`.
  - `false` `reject` [intent] `cost_actual` sem guarda de `cancelled` — consistente com o Always, que limita a regra de nao sobrescrever `cancelled` as escritas de status.

## Design Notes

- **Reinterpretação das unidades de `cost_models`:** não há UI para editar a tabela, e as linhas são os defaults semeados. Mudar valores exigiria `UPDATE` em produção (proibido). O código passa a ler `theirstack` como R$/crédito, `apollo` como R$/crédito de enrichment e `openai` como R$/chamada. Os números semeados (0,10 / 0,05 / 0,02) continuam aproximações. Ajustar preço real é uma decisão do Fabossi via SQL. Estimativa e real usam os mesmos preços, então a comparação é coerente.
- **Teto em vez de média:** a estimativa assume enrichment para todos os leads e o pior caso do revisor. O comentário da 22.5 diz "custo não pode errar; cliente precifica em cima". O real costuma ficar abaixo.
- **Uma linha por operação, não por chamada HTTP:** o padrão segue a 24.9 (revisor = 1 linha por e-mail com `calls`). Isso evita dezenas de inserts por campanha e mantém a contagem exata em `metadata.calls`.
- **Parsers fora do `cost_actual`:** os parsers rodam na conversa, antes do plano. São logados (AC2), mas não entram na comparação estimado×real, que cobre só os steps do plano.
- O custo de uma tentativa que falhou não entra no `cost_actual` (o `saveFailure` não grava `cost`). Isso segue a regra da 18.4: "só a tentativa bem-sucedida". O gasto fica visível em `api_usage_logs`.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/lib/services __tests__/unit/api/agent __tests__/unit/app/api/agent __tests__/unit/components/agent` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Smoke somente leitura: `cost_models` e uma execução concluída recente pelo script `claude_ro`. Conferir que `computeActualCost` aplicado aos `agent_steps.cost` reais dá um valor plausível. Nenhum step, Instantly ou Apollo é executado.

## Completion Notes

**O que pode mudar para o cliente**
- Tela do plano: valores por etapa passam a vir da fórmula honesta (busca Apollo "Gratuito"; enrichment + IA em `create_campaign`; premium `leads × apify` vindo do servidor). Rótulo da bolha `cost_estimate` vira "Custo".
- Chat: nova mensagem "Custo da execução — estimado R$ X · real R$ Y" na conclusão e "Custo até aqui — …" na pausa (depois da bolha de erro). Mensagens de resumo existentes não mudam.
- `agent_executions`: passam a ser gravados `cost_actual`, `current_step` (a cada step, inclusive skip) e `error_message` (texto da bolha na pausa; `null` no resume e na conclusão). Todas as escritas com CAS `.neq("status","cancelled")` (exceto `cost_actual`, que não toca status) e fail-open.
- `api_usage_logs`: novas linhas `source: "agent"` com `metadata.executionId` — `theirstack/company_search`, `apollo/people_search` (step, `fetch-leads`, viabilidade do plano), `apollo/people_enrichment`, `openai/campaign_generation`, `openai/briefing_parse`, `openai/product_parse`, `instantly/campaign_export`, `instantly/campaign_activation`, `instantly/add_accounts` (defer). Logs Apify ganham `executionId` e passam a ser `await`.
- Rotas tocadas: `plan`, `confirm` (só via estimador), `approve`, `fetch-leads`, `briefing/parse`, `briefing/parse-product`. Nenhum prompt, job `pg_cron`, Edge Function ou secret tocado.
- Migration nova `00065_add_theirstack_to_api_usage_logs_check.sql` (aditiva, amplia o CHECK; **não aplicada** — aguarda OK do Fabossi). Sem ela, o insert `theirstack` é rejeitado e engolido pelo logger; nada muda para o cliente. CHECK atual em produção conferido (read-only): sem `theirstack`.

**Os 3 pontos (por análise do diff, sem smoke real)**
1. Campanhas rodando / webhook / `reply-sweep`: não tocados.
2. Busca de leads: as chamadas `searchPeople`/`searchCompanies` são as mesmas (parâmetros, ordem, quantidade); só ganharam um log `await` que nunca lança.
3. Criação/export/ativação no Instantly: chamadas idênticas; nenhum teto ou bloqueio novo. O custo nunca impede step, export ou ativação (`recordExecutionCost` é fail-open e não muda status).

**Smoke somente leitura** (`scripts/db-ro.sh`): `cost_models` do tenant = defaults semeados (0,10 / 0,05 / 0,15 / 0,02 / 0). Execução concluída mais recente (`f4704dd7…`, sem `openai_calls`): `computeActualCost` dá `create_campaign` (1 + 2×2 + 1) × 0,02 = R$ 0,12, export R$ 0 → real R$ 0,12 contra estimativa antiga gravada de R$ 3 — plausível.

**Verificação:** `npm run typecheck` ok, `npm run lint` 0 erros (1 warning pré-existente em `AgentExecutionPlan.tsx`), `npm run test:run` 424 arquivos / 8028 testes verdes.

## Auto Run Result

Status: awaiting-operator

**Resumo:** a estimativa do plano passou a refletir o pipeline real, em R$ e por uma fonte unica (`agent-pricing.ts`). Toda chamada paga do agente agora gera linha em `api_usage_logs` com tenant e `metadata.executionId`. Na conclusao e na pausa, a execucao grava `cost_actual` e o chat recebe "Custo — estimado R$ X · real R$ Y". `current_step` e `error_message` passam a acompanhar o orquestrador.

**Arquivos alterados:**
- `src/lib/agent/agent-pricing.ts` (novo) — volumes, precos BRL, `computeActualCost`, `formatBRL`, `formatCostLine`.
- `src/lib/agent/agent-usage.ts` (novo) — `logAgentUsage` e o proxy `trackProviderUsage`.
- `src/lib/agent/execution-cost.ts` (novo) — `recordExecutionCost` (fail-open).
- `src/lib/services/agent-cost-estimator.ts` — estimativa honesta + `premiumIcebreakers`.
- `src/lib/agent/orchestrator.ts` — `current_step`, `error_message`, custo na pausa/conclusao, log do attach no defer.
- `src/lib/agent/steps/{search-companies,search-leads,create-campaign,export,activate}-step.ts` — logs de uso; volumes da fonte unica; `openai_calls`.
- Rotas `plan`, `fetch-leads`, `approve`, `briefing/parse`, `briefing/parse-product` — logs de uso e custo na conclusao pelo approve.
- `src/lib/agent/{briefing,product}-parser-service.ts`, `parser-config.ts` — devolvem `usage`.
- `src/components/agent/AgentExecutionPlan.tsx`, `AgentMessageBubble.tsx` — premium vindo do servidor, `formatBRL`, rotulo "Custo".
- `src/types/agent.ts`, `src/types/api-usage.ts` — `CostActual`, `premiumIcebreakers`, `"theirstack"`.
- `supabase/migrations/00065_add_theirstack_to_api_usage_logs_check.sql` (nova, NAO aplicada).
- Testes novos e estendidos em `__tests__/unit/...`.

**Revisao:** 33 achados. Patches: 1 medium (finalizacao em `awaiting-operator`) e 7 linhas low (log completo do activate; tenantId do SearchCompaniesStep, `add_accounts` e pausa do skip cobertos por teste; 00065 como operator action). Deferidos: 3 itens (5 linhas: default de 3 e-mails, fetch-leads > 25, dupla contagem do premium). Rejeitados: 15 low (motivos no Triage Log) e 5 false.

**Follow-up review recomendado:** false — nenhum `high` e so 1 `medium` corrigido (procedimental, sem codigo).

**Verificacao:** `npm run lint` (0 erros, 134 warnings ja existentes), `npm run typecheck` ok, `npm run test:run` 424 arquivos / 8030 testes verdes. A auditoria da matriz I/O encontrou teste para todas as linhas. Smoke somente leitura em producao (`claude_ro`): `cost_models` com os defaults e custo real plausivel numa execucao concluida. Os 3 pontos do cliente foram verificados por analise do diff: as chamadas externas, os parametros e a ordem nao mudaram, e nao ha trava nova no caminho ate o Instantly.

**Operador (owed):** aplicar a 00065 com OK explicito (ela usa DROP/ADD CONSTRAINT para ampliar o CHECK) e conferir a primeira linha `theirstack` em `api_usage_logs`. Ate la, o log TheirStack e rejeitado em silencio, sem efeito no fluxo.

**Riscos residuais:** os logs usam a sessao via `createClient` (mesmo caminho da 24.9). Se um step rodar fora de uma request com cookies, a linha se perde em silencio. Os precos semeados continuam aproximacoes, e so o significado da unidade mudou.
