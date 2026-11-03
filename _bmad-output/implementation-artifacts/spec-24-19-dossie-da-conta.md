---
title: '24.19 — Dossiê da conta'
type: 'feature'
created: '2026-11-03'
status: done
baseline_revision: '837ddfbf5507aba5ba7a87d36f8b5fb052bda88d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spike-24-11-treg-report.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Numeração "Etapa N/M" inconsistente entre steps (search_leads/create_campaign contam só os não pulados; export/activate usam stepNumber/total_steps).
    evidence: |-
      Já existia antes da 24.19 (export/activate usavam stepNumber/5 enquanto create_campaign contava os steps ativos). Depois da revisão do Codex, export/activate voltaram a ser idênticos à main e mostram "Etapa 5/5" e "Etapa 6/5" com o research ligado. É só texto de progresso; corrigir exige tocar no caminho do Instantly e fica para uma story própria.
    location: >-
      src/lib/agent/steps/export-step.ts:130, src/lib/agent/steps/activate-step.ts:161, src/lib/agent/steps/create-campaign-step.ts:197
    severity: low
  - summary: >-
      A função do sweeper de steps travados (00067) não tem o rótulo de research_accounts e mostra o identificador cru no chat.
    evidence: |-
      O CASE em supabase/migrations/00067_sweep_stuck_agent_steps.sql:92-99 cobre só os 5 steps antigos; o ELSE devolve "research_accounts". Corrigir exige uma migration nova com CREATE OR REPLACE FUNCTION de uma função usada pelo pg_cron, o que só o Fabossi aplica.
    location: >-
      supabase/migrations/00067_sweep_stuck_agent_steps.sql:92
    severity: low
operator_actions:
  - "Revisar e aprovar o novo step research_accounts (etapa 3), que fica no caminho até o Instantly (Regra nº 1). O step é fail-open, mas é preciso confirmar o OK antes do merge e do deploy."
  - "Rodar o PRE-CHECK do cabeçalho de supabase/migrations/00073_create_account_dossiers.sql no SQL Editor de produção e depois aplicar a migration 00073. O rollback está no cabeçalho do arquivo e nas Completion Notes."
  - "Cadastrar a chave da Treg em Configurações → Integrações (card Treg) no tenant do cliente, de preferência um token de agente só da TDec com --cap, e clicar em Testar conexão."
  - "Depois da migration e da chave, fazer o smoke real de uma execução guiada com 2–3 leads, sem ativar no Instantly: o step 3 deve gravar linhas em account_dossiers, account_dossier_facts e account_dossier_leads, e o create_campaign deve seguir normalmente."
  - "No Linear, mover a issue da 24.19 (FEL-42) para Precisa Felipe com o label precisa-felipe e registrar branch, SHA e checks."
---

<intent-contract>

## Intent

**Problem:** A abordagem do agente hoje se baseia só em cargo e empresa. Ele não sabe o que está acontecendo na conta: notícias, vagas, tecnologias ou o que a pessoa publica. Sem fatos com fonte, as stories 24.20 a 24.22 não têm de onde partir.

**Approach:** Um step novo e determinístico, `research_accounts`, roda entre o gate de leads e o `create_campaign`. Para cada conta aprovada ele monta um dossiê de fatos `{fato, fonte_url, data, confiança}` pelo Treg (`treg.web.search`/`treg.web.extract` + `exa.web.search` com data e Brasil). Usa também as tecnologias já trazidas pelo TheirStack e posts do LinkedIn filtrados pelo `relevance-classifier`. Os fatos ficam em tabelas novas (migration 00073), reaproveitáveis por 30 dias. O step é **fail-open**: nada nele altera ou bloqueia campanha, export ou ativação.

## Boundaries & Constraints

**Always:**
- O step nunca lança erro para o pipeline. Qualquer falha termina `completed`, com o dossiê vazio ou parcial e sinalizado em `output.flags` e `failedSources`. Os casos: sem chave Treg, chave não decriptável, Treg fora do ar, timeout, 402, teto de custo ou de tempo atingido, erro de banco ou exceção inesperada.
- O `create_campaign` recebe **exatamente** o mesmo `previousStepOutput` de hoje, isto é, o output do `search_leads` com `approvedLeads → leads`. O orchestrator ignora linhas `research_accounts` ao resolver o step anterior, inclusive no teste "todos os anteriores pulados".
- Fato sem `fonte_url` http(s) não é gravado. Nada é inferido, nem por LLM nem por heurística. O texto do fato sai do conteúdo da fonte: título, trecho ou nome da tecnologia.
- A chave Treg é lida por tenant via `readServiceApiKey(tenantId, "treg")` (`api_configs`, criptografada). Toda chamada leva:
  - `X-Treg-Token`;
  - `X-Treg-Route-Max-Cost` (teto por chamada);
  - `Idempotency-Key` determinística: sha256 de `executionId|endpoint|JSON(body)`;
  - `X-Treg-Meta: feature=dossie-24-19,tenant=<id>,execution=<id>`;
  - timeout de 60 s.
- Cada chamada Treg gera uma linha em `api_usage_logs` via `logAgentUsage`, com `serviceName: "treg"`, `requestType` = id do endpoint e `metadata.costUsd`/`costMicro` lidos de `X-Treg-Cost-Micro`.
- O teto por execução é aplicado no nosso código, em USD (`DOSSIER_CONFIG.maxCostUsdPerExecution`, padrão 0,50). Antes de cada chamada, reserva-se o teto da chamada; depois, acerta-se pelo custo real. Sem saldo de reserva, a fonte não é chamada e vira `failedSources` com motivo `budget`.
- Migration só aditiva. É escrita e **nunca aplicada**.

**Never:**
- Nenhum dado do dossiê entra no payload do Instantly, nos prompts do `create_campaign` ou no filtro ou seleção de leads (isso é da 24.21).
- Não usar `process.env.TREG_API_KEY`. Não chamar rede real em teste (Treg, TheirStack, Apify, OpenAI, Instantly e Supabase sempre mockados). Não rodar smoke em produção.
- Não usar `people.email.*`/`people.phone.*` do Treg (NO-GO do spike), `companies.news`/`companies.jobs` nem TheirStack via Treg.
- Não gravar posts de terceiros: resultados `linkedin.com/posts` e `linkedin.com/in` vindos da busca são descartados. Posts entram só da própria pessoa do lead, via Apify.
- Não mexer no `sprint-status.yaml`, em `pg_cron`, Edge Functions, secrets ou env.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Feliz | 3 leads aprovados em 2 empresas, chave Treg ok | 2 dossiês `complete`, leads ligados, fatos com fonte, custo em `cost.treg_usd`, mensagem-resumo no chat | — |
| Reuso | dossiê `complete` do mesmo tenant+domínio com `expires_at > now()` | não chama Treg para a conta; liga os leads ao dossiê existente; `reused: true` | — |
| Sem chave | `readServiceApiKey` → `missing` ou `decrypt_error` | `completed`, sem chamadas, `flags.tregUnavailable = "missing" \| "decrypt_error"`, mensagem "pesquisa pulada"; segue para o `create_campaign` | sem throw |
| Fonte falha | notícias → 503/timeout; site ok | dossiê `partial`, `failedSources: ["news"]`, demais fatos salvos | sem throw |
| Teto | gasto + teto da chamada > `maxCostUsdPerExecution` | fontes restantes não chamadas; `flags.budgetExhausted`; contas não pesquisadas ficam `skipped` | sem throw |
| Tempo | passou de `timeBudgetMs` (180 s) | não inicia contas novas; restantes `skipped`; `flags.timeBudgetExhausted` | sem throw |
| Banco | insert do dossiê falha (ex.: migration não aplicada) | `completed`, `flags.persistFailed`, contas com `dossierId: null` | sem throw |
| Sem domínio | empresa sem domínio conhecido e busca sem resultado aproveitável | conta `skipped` com motivo `no_domain` | sem throw |
| Importados | `skipSteps` com as duas buscas | lê `briefing.importedLeads` (mesma regra do `create_campaign`) | — |

</intent-contract>

## Code Map

- `src/types/agent.ts:20` `StepType`, `:494` `STEP_LABELS` (é `Record`, então o TS força a entrada nova), `:261` `StepInput`, `:344` `SearchLeadResult` (sem domínio nem id de banco: o lead é identificado por `apolloId`/`email`).
- `src/lib/services/agent-plan-generator.ts:55` `PIPELINE_STEPS` (numeração `index+1`; inserir na posição 3). O plano é usado em `orchestrator.planExecution`, na rota `plan` e na rota `confirm` (`confirm/route.ts:81-96` cria uma linha `agent_steps` por step e grava `total_steps`).
- `src/lib/agent/orchestrator.ts:144-185` resolve o `previousStepOutput` (último anterior `completed`/`approved`, mais o fallback "todos pulados"); `:561` `getStepInstance`; `:744` `sendSummaryMessage`.
- `src/lib/agent/steps/base-step.ts`:
  - `run` (`:73`) claim → `executeInternal` → save;
  - `requiresPostApproval` (`:135`) é `true` por padrão; o step novo devolve `false`, como `activate-step.ts:73`;
  - `recordPartialOutput` (`:353`).
- Template de step: `src/lib/agent/steps/search-companies-step.ts`. Uso de log: `src/lib/agent/agent-usage.ts:31` `logAgentUsage` (nunca lança).
- `src/lib/agent/steps/create-campaign-step.ts:105-126` lê os leads (`previousStepOutput.leads` ou `briefing.importedLeads`). **Não alterar.**
- `src/hooks/use-auto-trigger.ts:70-72`: no modo guiado só avança após `skipped`. Precisa avançar também após `completed` de um step `research_accounts`.
- `src/lib/agent/service-keys.ts` `readServiceApiKey(tenantId, serviceName)` → `{status:"ok",apiKey}|{status:"missing"}|{status:"decrypt_error"}`.
- Serviço novo `treg`:
  - `src/types/integration.ts:15` `SERVICE_NAMES` e `:30` `SERVICE_LABELS`;
  - `src/lib/services/index.ts:42` (`Record<ServiceName, ExternalService>` exige uma classe com `testConnection`);
  - `src/hooks/use-integration-config.ts:87` `initialConfigs`;
  - `src/app/(dashboard)/settings/integrations/page.tsx:25` (cards);
  - `src/types/api-usage.ts:11` `UsageServiceName`;
  - `src/lib/agent/steps/step-utils.ts:26` labels.
- `src/lib/services/base-service.ts:130` `ExternalService`, `:67` `ExternalServiceError`. O `request` tem timeout fixo de 10 s, então o Treg usa `fetch` próprio com `AbortSignal.timeout(60000)`.
- Formatos do Treg (do spike, `spikes/24-11-treg/02-web.mjs`, `05-web-compare.mjs`):
  - `POST https://treg.to/call/<id>`;
  - `treg.web.search` body `{q, limit}` → `json.output.results[{url,title,snippet}]`;
  - `treg.web.extract` body `{url}` → `json.output.pages[0].{markdown|content|text,title}`;
  - `exa.web.search` body `{query, numResults, userLocation:"BR", startPublishedDate}` → `json.results[{url,title,publishedDate,text?}]`;
  - custo no header `x-treg-cost-micro`;
  - teste de conexão grátis: `GET https://treg.to/orgs`.
- `src/types/theirstack.ts:83` `TheirStackCompany.{domain, technologies_found[{technology.name, confidence}]}`. Vem no output do `search_companies` (`companies`).
- `src/lib/agent/target-accounts.ts:32` `normalizeDomain`, `:148` `resolvedAccountDomains` (ABM, `briefing.targetAccounts[].domain`).
- Posts:
  - `src/lib/services/apify.ts:104` `fetchLinkedInPosts(apiKey, url, limit)` (não lança);
  - `src/lib/utils/relevance-classifier.ts:211` `classifyPostRelevance(text, url, kbContext, openaiKey, supabase, tenantId)` (fail-open);
  - `src/lib/utils/monitoring-processor.ts:192` `loadKBContext`;
  - chaves via `getServiceApiKeyOrNull(tenantId, "apify"|"openai")`.
- Custo:
  - `src/lib/agent/agent-pricing.ts:90` `PricedService`, `:95` `AGENT_DEFAULT_COSTS`, `:178` `computeStepActualCost`;
  - `src/lib/services/agent-cost-estimator.ts:103` `estimateCosts`.
- UI: `src/components/agent/AgentExecutionPlan.tsx:40` `STEP_ICONS`.
- Texto fixo "Etapa N/5": `src/lib/agent/steps/export-step.ts:129` e `activate-step.ts:160`.
- Modelo de CHECK: `supabase/migrations/00065_add_theirstack_to_api_usage_logs_check.sql`. Modelo de tabela e RLS: `00071_create_suppression_entries.sql` (`public.get_current_tenant_id()`). Os steps rodam com o client de sessão, inclusive de SDR, então o INSERT é permitido a qualquer membro do tenant.
- Testes:
  - `__tests__/unit/lib/agent/steps/*.test.ts`;
  - `__tests__/unit/lib/agent/orchestrator.test.ts`, `direct-entry-integration.test.ts`, `imported-leads-integration.test.ts` e `__tests__/unit/lib/services/agent-plan-generator.test.ts` (assumem 5 steps; atualizar);
  - `__tests__/unit/migrations/00067-*.test.ts` (modelo de teste de migration);
  - helpers `__tests__/helpers/mock-supabase.ts` e `mock-fetch.ts`.

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/00073_create_account_dossiers.sql` -- criar (idempotente, cabeçalho com pré-check, impacto, rollback e "NÃO APLICAR sem o OK do Fabossi"):
  - `account_dossiers`: `id`; `tenant_id` FK cascade; `company_domain` NOT NULL; `company_name`; `status` CHECK `complete|partial|empty`; `failed_sources text[]` default `'{}'`; `execution_id` FK `agent_executions` SET NULL; `cost_usd numeric(12,6)` default 0; `researched_at`; `expires_at` NOT NULL; `created_at`. Índice `(tenant_id, company_domain, expires_at DESC)`.
  - `account_dossier_facts`: `id`; `dossier_id` FK cascade; `tenant_id`; `kind` CHECK `site|news|job|technology|post`; `fato` NOT NULL não vazio; `fonte_url` NOT NULL CHECK `~ '^https?://'`; `data date` NOT NULL; `confianca` CHECK `baixa|media|alta`; `lead_apollo_id`; `lead_email`; `created_at`.
  - `account_dossier_leads`: `id`; `dossier_id` FK cascade; `tenant_id`; `execution_id` SET NULL; `lead_id` FK `leads` SET NULL; `lead_apollo_id`; `lead_email`; `created_at`. CHECK: ao menos um identificador.
  - RLS: SELECT e INSERT com `tenant_id = public.get_current_tenant_id()`; sem UPDATE nem DELETE.
  - Drop + add de `api_configs_service_name_check` e `api_usage_logs_service_name_check`, ambos com `apollo, signalhire, snovio, instantly, openai, apify, zapi, theirstack, treg` (superconjunto do que está em produção; nenhuma linha tocada).
  -- tabelas do dossiê e serviço novo.
- `__tests__/unit/migrations/00073-account-dossiers.test.ts` -- garantir por leitura do SQL: só aditiva (sem `DROP TABLE`, `UPDATE`, `DELETE`, `TRUNCATE`), RLS habilitada nas 3 tabelas, `treg` nos dois CHECKs e lista anterior preservada.
- `src/types/integration.ts`, `src/types/api-usage.ts`, `src/lib/services/index.ts`, `src/hooks/use-integration-config.ts`, `src/app/(dashboard)/settings/integrations/page.tsx`, `src/lib/agent/steps/step-utils.ts` -- adicionar `treg` (label "Treg", card "🔎 Pesquisa web das contas para o dossiê do agente: site, notícias e vagas") -- aparecer em Configurações → Integrações.
- `src/lib/services/treg.ts` -- `TregService extends ExternalService`:
  - `name="treg"`;
  - `testConnection` via `GET /orgs`;
  - `call(apiKey, endpointId, body, {maxCostUsd, idempotencyKey, meta, timeoutMs})` → `{ok, status, json, costMicro, durationMs, error?}`. Nunca lança; erro de rede ou timeout vira `ok:false, status:0`.
- `src/lib/agent/dossier/config.ts` -- `DOSSIER_CONFIG`:
  - `reuseDays: 30`, `windowDays: 90`;
  - `maxCostUsdPerExecution: 0.5`, `maxCostUsdPerCall: 0.01`;
  - `apifyUsdPerProfile: 0.03`;
  - `maxNewsPerAccount: 5`, `maxJobsPerAccount: 5`, `maxTechPerAccount: 10`, `maxPostsPerLead: 10`;
  - `accountConcurrency: 3`, `timeBudgetMs: 180000`, `callTimeoutMs: 60000`, `siteSummaryMaxChars: 500`.
  -- fonte única configurável.
- `src/lib/agent/dossier/budget.ts` -- `CostBudget` (`tryReserve(usd)`, `settle(reserved, actualUsd)`, `spentUsd`, `exhausted`) -- teto por execução seguro com concorrência.
- `src/lib/agent/dossier/facts.ts` -- funções puras:
  - `normalizeCompanyKey`, `pickSiteDomain(results, emailDomain)` (ignora redes sociais e portais de vaga; prefere o host com a mesma marca do domínio do e-mail);
  - `siteFact`, `newsFacts`, `jobFacts`, `technologyFacts`, `postFacts` (regras de Design Notes);
  - `dossierStatus(facts, failedSources)`.
  -- extração determinística.
- `src/lib/agent/dossier/repository.ts` -- `findReusableDossier(supabase, tenantId, domain)` (`complete` e não expirado), `saveDossier(...)` (dossiê + fatos), `linkLeads(...)` (resolve `lead_id` por `apollo_id` ou e-mail existentes no tenant; se não achar, grava só os identificadores) -- erros devolvidos, nunca lançados.
- `src/lib/agent/steps/research-accounts-step.ts` -- `ResearchAccountsStep`:
  - `requiresPostApproval() → false`;
  - lê os leads como o `create_campaign`;
  - agrupa por empresa e resolve o domínio: `targetAccounts` → `companies` do `search_companies` (leitura própria de `agent_steps` com `step_type='search_companies'`) → `treg.web.search "<empresa> site oficial"` + `pickSiteDomain` → domínio do e-mail não-webmail;
  - por conta, em paralelo: extract do site, Exa notícias, Exa vagas, tecnologias e posts (só se `briefing.premiumIcebreakers === true` e houver chave Apify e `linkedinUrl`);
  - reuso, teto, tempo, mensagem de progresso e mensagem-resumo no chat;
  - `cost = {treg_usd, treg_calls, apify, openai_relevance}`.
  -- Tudo dentro de try/catch e sempre `success: true`.
- `src/types/agent.ts` -- `StepType` com `research_accounts`; `STEP_LABELS.research_accounts = "Pesquisa das Contas"`; `ResearchAccountsOutput` (`accounts[{companyName, domain, dossierId, status, reused, factsCount, failedSources, skippedReason?, leadCount}]`, `summary`, `flags`, `costUsd`).
- `src/lib/services/agent-plan-generator.ts` -- inserir `research_accounts` ("Pesquisar Contas") entre `search_leads` e `create_campaign`, com descrição informativa que deixa claro que não bloqueia a campanha.
- `src/lib/agent/orchestrator.ts`:
  - case `research_accounts` no registry;
  - `.neq("step_type","research_accounts")` nas duas consultas do step anterior (último concluído e o teste "todos pulados"), sempre. Assim o próprio research lê o `search_leads`, e o `create_campaign` também;
  - linha no resumo final.
- `src/hooks/use-auto-trigger.ts` -- no modo guiado, tratar `completed` de `research_accounts` como elegível para avançar.
- `src/lib/agent/agent-pricing.ts` + `src/lib/services/agent-cost-estimator.ts`:
  - `PricedService` com `treg` (BRL por US$ 1, padrão 5,5);
  - custo real `treg_usd×treg + apify×apify + openai_relevance×openai`;
  - estimativa `min(leads×0,02, teto)×treg` + (premium ? `leads×apify + leads×10×openai` : 0).
- `src/components/agent/AgentExecutionPlan.tsx` -- ícone do step.
- ~~`src/lib/agent/steps/export-step.ts`, `activate-step.ts` -- trocar só o texto `/5` pelo total real.~~ Revogado na revisão do Codex (ver Spec Change Log): esses dois arquivos ficam **idênticos à main (463405c)**; o texto continua "Etapa N/5".
- Testes:
  - `__tests__/unit/lib/agent/steps/research-accounts-step.test.ts`: todos os casos da matriz, mais o idempotency key estável e o log `treg` por chamada;
  - `__tests__/unit/lib/agent/dossier/*.test.ts`: fatos, domínio, budget e repository;
  - `__tests__/unit/lib/services/treg.test.ts`;
  - teste no orchestrator: com a linha research `completed` entre `search_leads` e `create_campaign`, o `previousStepOutput` do `create_campaign` é deep-equal ao de uma execução sem research, e no fluxo importado (buscas puladas + research `completed`) não lança `ORCHESTRATOR_STEP_NOT_READY`;
  - `use-auto-trigger`, plano, estimativa e pricing;
  - atualizar os testes que assumem 5 steps.

**Acceptance Criteria:**
- Given leads aprovados no gate (guiado ou autopilot), when o step 3 termina, then o `create_campaign` dispara sozinho e recebe os mesmos leads de hoje. O `export-step`, o `activate-step` e o `instantly.ts` ficam idênticos à main (diff vazia) e os testes existentes passam sem alteração de expectativa de payload.
- Given um dossiê gravado, when consultado por tenant e domínio, then cada fato tem `fonte_url`, `data` e `confianca`, e os leads da execução estão em `account_dossier_leads`.
- Given Configurações → Integrações, when aberta, then aparece o card Treg, com salvar e testar pelos fluxos existentes.

## Spec Change Log

### 2026-11-03 — Correções da revisão independente (Codex)

Pedido do Fabossi, sem mudar a intenção da story. Quatro problemas reais:

1. **Export e ativação idênticos à main.** O `readTotalSteps` fazia uma leitura extra de `agent_executions`, aguardada e sem timeout, ANTES das chamadas ao Instantly. Foi removido: `src/lib/agent/steps/export-step.ts` e `src/lib/agent/steps/activate-step.ts` voltaram byte a byte para a 463405c (`git diff 463405c -- <arquivos>` vazio), assim como os testes deles. `step-progress.ts` e o teste dele foram apagados. O texto continua "Etapa N/5" (deferred atualizado). A task "trocar o texto /5" ficou revogada.
2. **Fail-open no ciclo inteiro do step.** O `ResearchAccountsStep` tem `run()` próprio; os outros steps seguem com o `BaseStep.run` intacto (no `BaseStep` só mudou a visibilidade de `updateStepStatus`, `persistStepUpdate` e `logStep` de `private` para `protected`, sem mudança de comportamento). Falha ou demora ao gravar `running`, o checkpoint `completed` ou o log do step não lança, não vira `STEP_PERSISTENCE_ERROR` e não pausa o pipeline. Se o checkpoint completo falhar, tenta um checkpoint mínimo (`completed`, sem a lista de contas, `flags.persistFailed`). Só o `STEP_ALREADY_RUNNING` continua subindo (outro executor tem a posse e nada rodou). No cliente, `use-auto-trigger` também segue para o `create_campaign` se o research terminar `failed` (por exemplo, o sweeper liberando uma linha que não conseguiu gravar a conclusão), nos dois modos. Os outros steps `failed` continuam sem disparar nada.
3. **Prazo duro efetivo.** Toda espera do step corre contra o prazo (`settleWithin`, um `Promise.race` com timeout): leitura de chaves e KB, leitura do `search_companies`, `findReusableDossier`, `saveDossier`, `insertFacts`, `linkLeads`, `findPostLeadIdentifiers`, `logAgentUsage`, `treg.call` (além do timeout do próprio serviço), Apify, `classifyPostRelevance` (timeout = post fora, `posts: timeout`) e as mensagens do chat. Há ainda um backstop no `executeInternal` inteiro. O fechamento (resumo, checkpoint, fallback e log) tem orçamento próprio `finalizeBudgetMs = 15 s`. `hardDeadlineMs` foi de 270 s para 240 s: pior caso do step ≈ 256 s, abaixo dos 300 s da rota.
4. **Rollback da 00073.** O rollback do CHECK de `api_usage_logs` estava sem `zapi`. Agora o cabeçalho da migration e as Completion Notes restauram exatamente `apollo, signalhire, snovio, instantly, openai, apify, zapi, theirstack` nas duas tabelas. O SQL aplicado não mudou (a diff da migration é só a linha de comentário do rollback). O stub PGlite de `api_usage_logs` foi corrigido para a lista de produção.

**Testes novos:**
- `__tests__/unit/lib/agent/research-accounts-pipeline.test.ts`: orchestrator real com o step real e fakes, sem rede.
  - Todas as gravações de `agent_steps` falham: `executeStep` resolve, nada é pausado e o `create_campaign` roda.
  - O claim lança: o step termina `completed`.
  - `STEP_ALREADY_RUNNING` continua subindo.
  - Banco, Treg, log e mensagens que nunca resolvem (fake timers): o step termina em ≤ 256 s e o `create_campaign` roda.
  - A chave do Treg nunca resolve: o step termina e segue.
  - 4 desses 5 testes falham com o código anterior.
- `research-accounts-step.test.ts`: o classificador nunca resolve (fake timers), o step termina no prazo, sem o post, e grava `completed`.
- `use-auto-trigger.test.ts`: research `failed` dispara o `create_campaign` (guiado e autopilot), e outro step `failed` não dispara.
- `00073-account-dossiers.test.ts`: as listas do rollback (cabeçalho e spec) batem com a de produção. Também roda migration + rollback no PGlite e confere que `zapi` é aceito, `treg` é recusado e as tabelas somem. Esses testes falham com o cabeçalho anterior.

### 2026-11-03 — Segunda revisão do Codex (sobre 12355e6)

Dois problemas reais restantes, corrigidos sem mudar a intenção da story. `export-step.ts`, `activate-step.ts`, `create-campaign-step.ts` e `instantly.ts` continuam idênticos à 463405c.

1. **(Alta) Continuidade sem `pending`/`running` silencioso.** Antes, se o claim e os dois checkpoints falhassem, o `run()` devolvia sucesso sem nenhuma transição gravada. A linha podia ficar `pending`, que o sweeper não trata, ou `running`, que bloqueia o `use-auto-trigger` até o sweeper agir (10 min). Agora:
   - A conclusão é gravada em 3 níveis, cada um com o retry curto da base e **sem filtro de status** (vale para a linha `pending` de um claim que falhou e para a `running`):
     1. checkpoint `completed` completo;
     2. checkpoint mínimo, sem a lista de contas;
     3. **só `status: completed` + `completed_at`**, sem output.
   - Qualquer nível deixa a linha `completed`, que o auto-trigger trata como elegível nos dois modos e que um claim atrasado (CAS em `pending`/`failed`/`awaiting_approval`) não consegue sobrescrever.
   - Se **nenhum** nível gravar, o step lança `STEP_PERSISTENCE_ERROR` (retryable), o mesmo contrato do `BaseStep.saveCheckpoint`. O orchestrator pausa a execução e escreve a bolha de erro com o "Tentar novamente". Nunca mais devolve sucesso com a linha parada.
   - O resumo no chat vai **depois** da transição: sem conclusão gravada, o step não anuncia "concluída".
   - Orçamento do fechamento (15 s): 0,3 / 0,25 / 0,2 para os níveis, 0,15 para o resumo e 0,1 para o log. O pior caso continua ≈ 256 s.
2. **(Média) Custo de chamada do Treg sem resposta.**
   - `TregService.call` marca `costUnknown: true` quando não há resposta HTTP (timeout ou rede). O `costMicro: 0` desse caso não é custo real.
   - No `callTreg`, **toda chamada iniciada** entra em `tregCalls`/`tregUsd` e gera 1 linha `treg` em `api_usage_logs`. Isso inclui o timeout externo do `settleWithin`, a exceção do serviço e o status 0.
   - Sem resposta, o custo conta pelo **teto reservado da chamada** (`maxCostUsdPerCall`), e a reserva fica consumida (`settle(reserve, reserve)`). O metadata do log leva `costEstimated: true`, `costBasis: "reserved_cap"`, `reservedUsd` e `costMicro: null`.
   - O `cost` do step ganhou `treg_usd_estimated` e `treg_calls_estimated` (a parte estimada, já incluída em `treg_usd`). Como o custo da execução (`computeStepActualCost`) usa `treg_usd`, a estimativa entra no custo da execução, e `output.costUsd` também a inclui.

**Testes novos/alterados:**
- `research-accounts-pipeline.test.ts`: orchestrator real e **`useAutoTrigger` real** renderizado sobre as linhas do banco fake. O `POST .../execute` do hook vai para o `orchestrator.executeStep`, e o teste nunca chama o próximo step à mão.
  - Claim e os checkpoints com output falham, só o nível "só status" grava: o research fica `completed` e o hook dispara o `create_campaign` (guiado e autopilot).
  - O claim grava `running` e os checkpoints com output falham: a linha não fica `running` e o hook segue (guiado e autopilot).
  - Caminho feliz com o hook no modo guiado.
  - `agent_steps` totalmente fora: `STEP_PERSISTENCE_ERROR` com `reportedInChat`, execução pausada, linha `pending` e o hook não avança (limitação igual à dos outros steps).
  - Gravações do `agent_steps` que nunca resolvem: devolve o controle em ≤ 256 s com `STEP_PERSISTENCE_ERROR`.
  - O teste antigo "todas as gravações falham → sucesso" foi invertido, porque era exatamente o defeito apontado.
- `research-accounts-step.test.ts`: os três caminhos sem resposta (timeout do serviço com `costUnknown`, timeout externo com fake timers e exceção) contam o teto, ficam no custo da execução e logam `treg` com `costEstimated`.
- `treg.test.ts`: timeout e rede devolvem `costUnknown: true`.

## Review Triage Log

### 2026-11-03 — Review pass
- verdicts: 40 findings — high 0, medium 14, low 21, false 4, maybe-false 1
- findings:
  - `[low]` `[reject]` Blind: o step aparece para o cliente antes da Treg estar ligada (plano com 6 etapas, "pesquisa pulada" no chat, estimativa maior). — Isso é o comportamento fail-open que o Fabossi decidiu. O deploy depende da migration e da chave, que estão em operator_actions; depois delas a mensagem não aparece mais.
  - `[medium]` `[patch]` Blind: faltam as Completion Notes da Regra nº 1. — Adicionadas neste spec.
  - `[low]` `[reject]` Blind: com o premium, o Apify é cobrado duas vezes por lead (dossiê + icebreaker). — O custo é opt-in e aparece na estimativa. Compartilhar o resultado exigiria mexer no create_campaign, que é proibido. Fica registrado como risco residual.
  - `[medium]` `[patch]` Blind: as reservas do Apify consomem o teto da Treg. — O Apify ganhou um CostBudget próprio.
  - `[medium]` `[patch]` Blind: `exhausted` não volta atrás e o teste de budget roda antes do reuso. — Adicionado `canReserve`; o reuso agora é verificado antes do teto.
  - `[medium]` `[patch]` Blind: um 200 com corpo inesperado gerava dossiê `complete`. — Formato inválido agora conta como falha da fonte ("error"), com teste.
  - `[medium]` `[patch]` Blind: gravação não idempotente; posts duplicados no dossiê reaproveitado. — Os leads que já têm fatos de post são pulados (`findPostLeadIdentifiers`). Os links duplicados num retry raro ficam aceitos.
  - `[low]` `[reject]` Blind: os fatos não têm `execution_id` e o reuso acrescenta fatos de outra execução. — A rastreabilidade vem do dossiê e dos links; a correção exigiria uma coluna nova. O status errado foi corrigido em outro item.
  - `[low]` `[reject]` Blind: o INSERT das tabelas filhas não confere o tenant do dossiê pai. — A linha fica com o tenant de quem gravou e é invisível para o outro tenant via RLS, além de o UUID não ser adivinhável. A guarda extra não compensa.
  - `[medium]` `[patch]` Blind: a menção à empresa casava com um token só, e "redes" casava com "redes sociais". — Agora todos os tokens do nome são exigidos (a marca do domínio sozinha ainda vale) e "redes sociais" foi excluído, com testes.
  - `[low]` `[defer]` Blind: "Etapa N/M" inconsistente. — Já existia antes da story; registrado em deferred.
  - `[low]` `[reject]` Blind: o `fonte_url` de tecnologia é o endpoint do TheirStack. — Decisão do spec (origem real do dado); a correção seria editar o spec.
  - `[low]` `[reject]` Blind: o custo de resolver o domínio não entra em `account_dossiers.cost_usd`. — O custo já está no total da execução e em `api_usage_logs`; é desprezível (US$ 0,00015).
  - `[medium]` `[patch]` Blind: nada impedia passar dos 300 s da rota. — Prazo duro de 270 s: timeout das chamadas cortado pelo tempo restante, Apify em race com o tempo restante, classificação interrompida no prazo. Tem testes com clock injetado.
  - `[low]` `[patch]` Blind: `isoDate` em UTC. — Agora usa America/Sao_Paulo, com teste.
  - `[false]` `[reject]` Blind: `readSearchCompanies` sem filtro de status. — Cada execução tem uma única linha de `search_companies` (a confirm cria uma por step), e uma linha pulada ou com falha não tem `companies`, então não há efeito.
  - `[low]` `[patch]` Blind: faltavam testes de retry, de 200 inesperado e de premium com muitos perfis. — Testes adicionados junto com as correções.
  - `[medium]` `[patch]` Edge: posts duplicados e Apify cobrado de novo no dossiê reaproveitado. — Mesma correção dos posts duplicados (leads já com post são pulados).
  - `[maybe-false]` `[reject]` Edge: colisão de Idempotency-Key entre contas com a mesma marca. — Corpo idêntico gera a mesma resposta, e o replay é inclusive grátis. Mesmo que fosse real, seria só low.
  - `[medium]` `[patch]` Edge: `exhausted` sticky pulava as contas seguintes. — `canReserve`, com teste de concorrência.
  - `[medium]` `[patch]` Edge: o Apify usa o mesmo teto. — Budget separado.
  - `[medium]` `[patch]` Edge: reposts de terceiros salvos como fato. — Filtro `isOwnPost` (o autor tem que bater com o nome do lead).
  - `[low]` `[patch]` Edge: e-mail com maiúsculas no `linkLeads`. — A busca agora inclui o valor original e o minúsculo.
  - `[low]` `[reject]` Edge: o mesmo lead aparece duas vezes nos refs. — Os leads aprovados não chegam duplicados no uso normal; a correção seria uma guarda extra.
  - `[low]` `[patch]` Edge: `leadsLinked` superestimado. — Agora conta o que foi de fato inserido.
  - `[low]` `[patch]` Edge: status `complete` no reuso mesmo com falha nos posts. — Agora sai `partial`.
  - `[low]` `[reject]` Edge: `companyName` só com pontuação. — Caso improvável; a guarda adicionaria um ramo.
  - `[medium]` `[patch]` Edge: o fetch do Apify não tem limite de tempo. — Coberto pelo prazo duro (race).
  - `[low]` `[defer]` Edge: "Etapa N/M" inconsistente. — Já existia antes; mesma entrada em deferred.
  - `[low]` `[patch]` Edge: claim de e-mail case-sensitive no `linkLeads`. — Mesma correção do e-mail com maiúsculas.
  - `[medium]` `[patch]` VerifGap: `mergeByDomain` não era exercitado. — Teste "Banco X"/"BX Holding" no mesmo domínio.
  - `[low]` `[patch]` VerifGap: a asserção "Etapa N/M" só batia com o fallback. — Asserções 5/6 (export) e 6/6 (activate) com `total_steps: 6`.
  - `[low]` `[defer]` VerifGap: o rótulo do sweeper 00067. — Exige uma migration de função usada pelo pg_cron; registrado em deferred.
  - `[low]` `[defer]` VerifGap: totais de etapas divergentes. — Já existia antes; mesma entrada em deferred.
  - `[medium]` `[patch]` Intent: as ações do operador não estavam no frontmatter. — `status: awaiting-operator` e `operator_actions` gravados.
  - `[false]` `[reject]` Intent: o AC2 só é verificado por mocks. — É por design: a intenção proíbe rede real e smoke em produção, e o smoke real está em operator_actions.
  - `[low]` `[reject]` Intent: salvar o card da Treg falha até a migration. — Esperado e documentado; coberto por operator_actions.
  - `[low]` `[reject]` Intent: leitura de `total_steps` no export/activate. — A diff se limita ao texto, como o spec permite; nunca lança e o payload não muda.
  - `[false]` `[reject]` Intent: sem commit. — O commit faz parte da finalização, que vem depois do review.
  - `[false]` `[reject]` Intent: `epic-24-context.md` reescrito. — Foi regenerado no step-01 porque o arquivo de épicos era mais novo que o cache (fluxo exigido pelo workflow).

## Design Notes

**Regras dos fatos (determinísticas):**
- **site:** extract de `https://<domínio>`. Exige ≥ 200 caracteres úteis depois de limpar markdown. O fato é o título mais o trecho inicial, até 500 caracteres. `data` = hoje (coleta); confiança `alta`.
- **news:** resultados Exa com `url` e `publishedDate` dentro de 90 dias, fora de redes sociais. Precisam citar a empresa (token normalizado do nome ou da marca do domínio) no título (`alta`) ou só no texto (`media`); sem menção, o resultado é descartado. Fato = título (≤ 200 caracteres).
- **job:** título com termo de vaga (`vaga|vagas|job|oportunidade|contrata|hiring`) e termo de área (`segurança|security|ciber|cyber|infra|cloud|redes|soc|devsecops`). Confiança `media`.
- **technology:** do `search_companies` (`technologies_found` `high`/`medium`) da mesma empresa. `fonte_url` = `https://api.theirstack.com/v1/companies/search`, a origem real do dado. `data` = `completed_at` do step (ou hoje); confiança mapeada do TheirStack.
- **post:** Apify (limite 10) da pessoa do lead, dentro de 90 dias, mantidos se `classifyPostRelevance` der relevante. O classificador já é fail-open. Fato = até 280 caracteres do texto; `data` = `publishedAt`; confiança `alta`; preenche `lead_apollo_id`/`lead_email`.

**Por que os posts dependem do toggle de LinkedIn (22.2):** o usuário já escolhe se quer gasto de Apify com LinkedIn. Buscar posts sem esse opt-in criaria um custo novo que ele não pediu.

**Status do dossiê:** `empty` quando não há fatos; `partial` quando há fatos e `failedSources` não está vazio; senão `complete`. Só `complete` é reaproveitado. Os leads de um dossiê reaproveitado ganham posts próprios se o toggle estiver ligado.

**Retry (24.2):** a `Idempotency-Key` estável faz o Treg devolver a resposta já paga sem custo, e o reuso pela tabela evita pesquisar de novo uma conta já gravada.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erros
- `npm run typecheck` -- expected: sem erros
- `npm run test:run` -- expected: tudo verde, inclusive os testes novos e os atualizados de 5 → 6 steps
- `git diff main -- src/lib/services/instantly.ts src/lib/agent/steps/create-campaign-step.ts` -- expected: vazio

## Completion Notes

**O que pode ter mudado para o cliente:**
- **Pipeline do agente:** 6 etapas em vez de 5, com a nova etapa 3 "Pesquisa das Contas" (`research_accounts`) entre o gate de leads e o `create_campaign`.
- **Configurações → Integrações:** card novo da Treg.
- **Estimativa de custo:** linha nova da pesquisa.
- ~~**Texto "Etapa N/M"** no export e na ativação.~~ Revertido na revisão do Codex: export e ativação estão **idênticos à main (463405c)**.
- **Tabelas novas** (migration 00073, não aplicada): `account_dossiers`, `account_dossier_facts`, `account_dossier_leads`, mais `treg` nos CHECKs de `api_configs` e `api_usage_logs`.
- **Integração externa nova:** Treg (`treg.to`), chamada só pelo step novo.
- **Não foram tocados:** jobs pg_cron, Edge Functions, secrets, env e prompts.

**Os 3 pontos da Regra nº 1** (verificados **por análise da diff + testes mockados**; nenhum smoke real, porque o spec proíbe rede real e smoke em produção):
1. **Campanhas rodando, webhook e reply-sweep:** nenhum arquivo desses caminhos foi alterado e nenhuma tabela que eles leem mudou.
2. **Busca de leads:** `search_companies`/`search_leads` não foram alterados; o step novo roda depois do gate.
3. **Criação, export e ativação:**
   - `create-campaign-step.ts` e `instantly.ts` têm diff vazia.
   - O orchestrator ignora linhas `research_accounts` ao resolver o step anterior. Há teste de deep-equal do input do `create_campaign` e teste do fluxo importado.
   - O export e a ativação estão **idênticos à main (463405c)**: `git diff 463405c -- src/lib/agent/steps/export-step.ts src/lib/agent/steps/activate-step.ts` vazio, e os testes deles também. Nenhum I/O novo antes do Instantly.
   - O step novo nunca lança erro; todos os casos de falha estão testados.
   - **Atenção:** o step novo fica no caminho até o Instantly, e por isso há o pedido de OK ao Fabossi em operator_actions. Depois da revisão do Codex, a falha ao gravar o próprio step só pausa se **nenhuma** conclusão gravar (2ª revisão; ver abaixo). Fora isso: o research tem ciclo de vida fail-open, termina em ≤ ~256 s mesmo com banco ou serviços pendurados, e o `create_campaign` é disparado em seguida (inclusive se o sweeper marcar o research como `failed`).

**Segunda revisão do Codex (continuidade e custo do Treg)**

Tocados só `research-accounts-step.ts`, `treg.ts` e testes. Nenhuma rota, prompt, tabela, migration, job ou integração nova. Export, ativação, `create_campaign` e Instantly estão com diff vazia contra a 463405c.

Os 3 pontos da Regra nº 1 foram verificados **por análise da diff + testes mockados**, sem smoke real:
1. **Campanhas rodando, webhook e reply-sweep:** nada foi tocado.
2. **Busca de leads:** nada foi tocado.
3. **Criação, export e ativação:** nenhum arquivo do caminho até o Instantly mudou. A única mudança de comportamento no caminho é a do research: quando **nenhuma** conclusão grava, ele agora pausa com aviso em vez de devolver sucesso com a linha parada. Antes, nesse cenário, o pipeline também não chegava ao `create_campaign` (ficava travado em silêncio), então não há regressão para o cliente.

**Limitação documentada (igual à dos steps existentes):** com o `agent_steps` totalmente indisponível, nenhum step consegue avançar.
- O research lança `STEP_PERSISTENCE_ERROR`, como faria o `BaseStep` de qualquer outro step. A execução é pausada com a bolha de erro, se o banco aceitar essa escrita, e o "Tentar novamente" reexecuta o research.
- Se a resposta da rota se perder, o `executeStepChecked` mostra o aviso de falha de disparo.
- Se o claim tiver gravado `running` e nada depois gravar, o sweeper (10 min) marca `failed`, e o auto-trigger segue para o `create_campaign` porque o research `failed` é elegível.
- Ressalva: se a pausa também falhar e as mensagens pendurarem, o `pauseWithError` do orchestrator (código existente, não alterado) pode segurar a rota até o limite da plataforma, igual aos outros steps.

**Custo conservador do Treg:** uma chamada sem resposta conta US$ 0,01 (o teto da chamada) mesmo que o Treg não tenha cobrado. Isso superestima um pouco o custo e pode fazer o teto da execução (US$ 0,50) ser atingido antes, quando há muitos timeouts. Foi uma escolha intencional, para nunca subcontar.

**Rollback da 00073:**
```sql
DROP TABLE IF EXISTS public.account_dossier_leads;
DROP TABLE IF EXISTS public.account_dossier_facts;
DROP TABLE IF EXISTS public.account_dossiers;
-- só sem linhas 'treg' em api_configs/api_usage_logs:
ALTER TABLE public.api_configs DROP CONSTRAINT IF EXISTS api_configs_service_name_check;
ALTER TABLE public.api_configs ADD CONSTRAINT api_configs_service_name_check
  CHECK (service_name IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack'));
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_service_name_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_service_name_check
  CHECK (service_name IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack'));
```

## Auto Run Result

Status: awaiting-operator

**Resumo:** step determinístico e fail-open `research_accounts` que monta o dossiê de cada conta aprovada. As fontes são a Treg (`treg.web.search`/`treg.web.extract` + Exa com data e Brasil), as tecnologias do TheirStack e os posts da própria pessoa via Apify (só com o toggle de LinkedIn). Cada fato é gravado como `{fato, fonte_url, data, confianca}`, com reuso por 30 dias. O step tem teto de US$ 0,50 por execução, prazo de 180 s para começar trabalho novo e prazo duro de 240 s (+15 s de fechamento; revisão do Codex). Cada chamada à Treg vira uma linha em `api_usage_logs` como `treg`. A chave é lida por tenant de `api_configs`. A migration 00073 foi escrita e **não aplicada**.

**Arquivos alterados (48):**
- __tests__/helpers/queue-supabase.ts
- __tests__/unit/api/agent/execution-confirm.test.ts
- __tests__/unit/api/agent/execution-plan.test.ts
- __tests__/unit/components/settings/integrations-page-treg.test.tsx
- __tests__/unit/hooks/use-auto-trigger.test.ts
- __tests__/unit/lib/agent/agent-pricing.test.ts
- __tests__/unit/lib/agent/direct-entry-integration.test.ts
- __tests__/unit/lib/agent/dossier/budget.test.ts
- __tests__/unit/lib/agent/dossier/facts.test.ts
- __tests__/unit/lib/agent/dossier/repository.test.ts
- __tests__/unit/lib/agent/imported-leads-integration.test.ts
- __tests__/unit/lib/agent/orchestrator.test.ts
- __tests__/unit/lib/agent/service-keys-contract.test.ts
- __tests__/unit/lib/agent/steps/activate-step.test.ts
- __tests__/unit/lib/agent/steps/export-step.test.ts
- __tests__/unit/lib/agent/steps/research-accounts-step.test.ts
- ~~__tests__/unit/lib/agent/steps/step-progress.test.ts~~ (removido na revisão do Codex)
- __tests__/unit/lib/services/agent-cost-estimator.test.ts
- __tests__/unit/lib/services/agent-plan-generator.test.ts
- __tests__/unit/lib/services/treg.test.ts
- __tests__/unit/migrations/00073-account-dossiers.test.ts
- __tests__/unit/types/agent.test.ts
- __tests__/unit/types/integration.test.ts
- _bmad-output/implementation-artifacts/epic-24-context.md
- _bmad-output/implementation-artifacts/spec-24-19-dossie-da-conta.md
- src/app/(dashboard)/settings/integrations/page.tsx
- src/components/agent/AgentExecutionPlan.tsx
- src/hooks/use-auto-trigger.ts
- src/hooks/use-integration-config.ts
- src/lib/agent/agent-pricing.ts
- src/lib/agent/dossier/budget.ts
- src/lib/agent/dossier/config.ts
- src/lib/agent/dossier/facts.ts
- src/lib/agent/dossier/repository.ts
- src/lib/agent/orchestrator.ts
- src/lib/agent/steps/activate-step.ts
- src/lib/agent/steps/export-step.ts
- src/lib/agent/steps/research-accounts-step.ts
- ~~src/lib/agent/steps/step-progress.ts~~ (removido na revisão do Codex)
- src/lib/agent/steps/step-utils.ts
- src/lib/services/agent-cost-estimator.ts
- src/lib/services/agent-plan-generator.ts
- src/lib/services/index.ts
- src/lib/services/treg.ts
- src/types/agent.ts
- src/types/api-usage.ts
- src/types/integration.ts
- supabase/migrations/00073_create_account_dossiers.sql

**Review:** 40 achados (high 0, medium 14, low 21, false 4, maybe-false 1).
- **Correções aplicadas:** 25 linhas do triage, sendo 13 medium e 12 low. A 14ª medium (ações do operador fora do frontmatter) foi resolvida nesta finalização.
- **Adiados:** 2 itens em `deferred` (numeração "Etapa N/M", que já existia antes, e o rótulo do sweeper 00067).
- **Rejeitados:** 13, cada um com o motivo registrado no Review Triage Log.

**Follow-up review recomendado: true.** O motivo são 13 correções medium nesta primeira passada. Os riscos não verificados são:
- o race do Apify contra o prazo duro não tem teste (exigiria fake timers);
- a lógica de reserva e acerto do budget sob concorrência real só foi testada com fakes.

**Verificação:** `npm run lint` com 0 erros (134 warnings, todos anteriores); `npm run typecheck` limpo; `npm run test:run` com 465 arquivos e 9030 testes passando; `git diff main -- src/lib/services/instantly.ts src/lib/agent/steps/create-campaign-step.ts` vazio.

**Verificação após as correções do Codex (2026-11-03):**
- `npm run lint`: 0 erros (134 warnings, todos anteriores).
- `npm run typecheck`: limpo.
- `npm run test:run`: 465 arquivos, 9038 testes passando e 2 skipped.
- `git diff 463405c -- src/lib/agent/steps/export-step.ts src/lib/agent/steps/activate-step.ts` (e os testes deles, `instantly.ts` e `create-campaign-step.ts`): vazio, ou seja, idênticos à main.
- A migration não foi aplicada, e não houve rede real nem smoke.
- Os 3 pontos da Regra nº 1 foram verificados por análise da diff e testes mockados:
  - (1) campanhas, webhook e reply-sweep: nenhum arquivo tocado;
  - (2) busca de leads: não tocada;
  - (3) criação, export e ativação: export e ativação voltaram a ser idênticos à main, e o research não pausa nem trava mais o caminho até o `create_campaign`.

**Riscos residuais:**
- Com o premium, o Apify é cobrado duas vezes por lead (dossiê + icebreaker).
- A estimativa mostra o custo da pesquisa mesmo sem chave da Treg.
- O `fonte_url` das tecnologias é o endpoint do TheirStack.
- Nada pode ser validado contra a Treg real antes da migration, da chave e do smoke (operator_actions).

## Smoke em produção (2026-11-03, Claude no Mac)

Pré-requisitos: migration 00073 aplicada pelo Fabossi e conferida via `db-ro` (3 tabelas com RLS e 2 policies cada; CHECKs de `api_configs` e `api_usage_logs` com `treg`; nenhuma linha alterada). PR #22 mergeado (`a0507b8`), deploy na Vercel ok. Chave da Treg (conta do Fabossi) cadastrada em Integrações às 15:32 UTC.

Execução `c270c618-e5f6-47b5-9213-c213408f9d5e`, "CISO de São Paulo, traga 2 leads", modo Guiado:
- **Plano:** 6 etapas. "3 · Pesquisar Contas" estimada em R$ 0,22, total R$ 0,82 (antes era R$ 0,60).
- **Etapas:** `search_leads` aprovada (13,5 s); `research_accounts` `completed` em 13,8 s com a mensagem "2 de 2 contas com dossiê, 8 fatos com fonte. A campanha segue normalmente."; `create_campaign` gerou a sequência e os 2 icebreakers e ficou em `awaiting_approval`. **Não aprovado:** nada foi exportado ao Instantly. `total_steps = 6`.
- **Dossiês:** `nstech.com.br` (6 fatos) e `jdconsultores.com.br` (2 fatos), os dois `complete`, sem fonte falhando, com `expires_at` em 2026-12-03 e 1 lead ligado a cada um. Os tipos de fato foram `site` e `news`, com fonte http(s), data e confiança. Nenhuma vaga encontrada.
- **Custo:** 8 chamadas `treg` em `api_usage_logs`, todas `success`, com o custo em `metadata.costUsd` (`treg.web.search` US$ 0,00015 e `exa.web.search` US$ 0,007). Dossiê: US$ 0,01415 por conta, US$ 0,028 no total, dentro da faixa do spike.

Observações para follow-up (não bloqueiam):
- `api_usage_logs.estimated_cost` fica nulo nas linhas `treg`, porque o custo só vai para `metadata.costUsd`. Relatórios que somam `estimated_cost` não contam a Treg.
- O fato `site` às vezes guarda o menu da página ("Pular para o conteúdo Fale com um especialista Login PT EN ES…") em vez de um resumo.
- Uma notícia veio em espanhol (dataportuaria.com), mesmo com o filtro Brasil.
- O chat mostrou "Etapa 3/5" na criação de campanha, que é a etapa 4 de 6 (DW-32, já registrado).

**Os 3 pontos:** busca de leads e criação de campanha confirmadas por smoke real. Export e ativação não foram tocados (arquivos idênticos ao `main`; smoke parado antes do export). Campanhas rodando, webhook e `reply-sweep` não leem as tabelas novas.

## Operator Confirmation

Confirmed 2026-11-03: the external actions this story owed were carried out.

- Revisar e aprovar o novo step research_accounts (etapa 3), que fica no caminho até o Instantly (Regra nº 1). O step é fail-open, mas é preciso confirmar o OK antes do merge e do deploy.
- Rodar o PRE-CHECK do cabeçalho de supabase/migrations/00073_create_account_dossiers.sql no SQL Editor de produção e depois aplicar a migration 00073. O rollback está no cabeçalho do arquivo e nas Completion Notes.
- Cadastrar a chave da Treg em Configurações → Integrações (card Treg) no tenant do cliente, de preferência um token de agente só da TDec com --cap, e clicar em Testar conexão.
- Depois da migration e da chave, fazer o smoke real de uma execução guiada com 2–3 leads, sem ativar no Instantly: o step 3 deve gravar linhas em account_dossiers, account_dossier_facts e account_dossier_leads, e o create_campaign deve seguir normalmente.
- No Linear, mover a issue da 24.19 (FEL-42) para Precisa Felipe com o label precisa-felipe e registrar branch, SHA e checks.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
