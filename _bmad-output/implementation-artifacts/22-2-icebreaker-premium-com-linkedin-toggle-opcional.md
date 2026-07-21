---
baseline_commit: 1c35f8dbfeb3f8e646c937fc9a8cd5ecb2a83a3d
---

# Story 22.2: Icebreaker Premium com LinkedIn (Toggle Opcional)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want poder ligar icebreakers baseados em posts reais do LinkedIn na campanha do agente,
so that meus e-mails abram com personalização de verdade em vez de "vi que você é CTO na empresa X".

## Contexto do Épico (por que esta story existe)

Diagnóstico do plano de melhorias (2026-07-16): os icebreakers gerados pelo agente saem
**genéricos** — o `CreateCampaignStep` usa o prompt `icebreaker_generation` (categoria `lead`),
que NÃO consulta o LinkedIn. Isso contraria a promessa do **FR25 do Epic 17** (icebreaker
premium com posts reais). A infraestrutura para fazer isso **já existe e está em produção** desde
o Epic 6.5 / Story 9.1: a rota [`/api/leads/enrich-icebreaker`](../../src/app/api/leads/enrich-icebreaker/route.ts)
com categoria `post` usa `ApifyService.fetchLinkedInPosts` + o prompt `icebreaker_premium_generation`
com fallback para `lead`. O agente simplesmente **não pluga nesse caminho**.

Decisão de produto (Q3, 2026-07-16): o icebreaker LinkedIn é **aceitável, porém OPCIONAL** — um
**toggle default DESLIGADO**, porque cada perfil consultado gasta crédito Apify (~R$0,15/perfil).
Esta story adiciona o toggle no **plano de execução**, persiste a escolha no **briefing (JSONB —
NFR5)**, e faz o `CreateCampaignStep` usar o caminho premium **reusando** `ApifyService` +
`icebreaker_premium_generation` (sem duplicar scraping), com **fallback fail-open** para o standard
atual e **contabilização de custo** (estimativa + real).

Esta é a **segunda story do Epic 22** e é **independente da 22.1** (não toca `canProceed`, prompt
do parser nem `QUESTIONABLE_FIELDS`). É o **maior salto de qualidade percebida** do épico.

## Acceptance Criteria

1. **Given** o plano de execução ([`AgentExecutionPlan`](../../src/components/agent/AgentExecutionPlan.tsx), exibido antes de "Iniciar Execução" nos modos Guiado e Autopilot) **Then** existe o toggle **"Icebreakers premium (LinkedIn)"** com default **DESLIGADO** **And** a escolha é persistida no briefing (`agent_executions.briefing.premiumIcebreakers` — JSONB, NFR5) **And** a descrição deixa claro o custo adicional por lead (ex.: "Consulta posts reais do LinkedIn via Apify — custo extra ~R$0,15 por lead").
2. **Given** o toggle **LIGADO** **When** o [`CreateCampaignStep`](../../src/lib/agent/steps/create-campaign-step.ts) gera icebreakers **Then** para leads **com** `linkedinUrl` busca posts recentes reusando o caminho Apify existente (`ApifyService.fetchLinkedInPosts` + prompt `icebreaker_premium_generation` — **não** duplicar scraping) **And** gera o icebreaker com base no post real (fecha o FR25 do Epic 17).
3. **Given** leads **sem** `linkedinUrl`, sem posts recentes, sem Apify key configurada, ou com falha no Apify **Then** caem no fallback standard atual (`icebreaker_generation` categoria `lead` — **fail-open**: nenhum lead fica sem icebreaker por causa do premium) **And** `icebreakerStats` distingue **premium** vs **standard** vs **failed**.
4. **Given** o toggle **LIGADO** **Then** a estimativa de custo pré-execução ([`CostEstimatorService.estimateCosts`](../../src/lib/services/agent-cost-estimator.ts)) inclui o custo Apify por lead (NFR3) **And** o custo real do step (`cost` retornado por `CreateCampaignStep`) registra os créditos Apify efetivamente gastos.
5. **Given** o toggle **DESLIGADO** (default) **Then** o comportamento atual permanece **byte-a-byte** (zero regressão — NFR4): nenhuma chamada Apify, `icebreaker_generation` como hoje, cost estimate e cost real idênticos ao atual.
6. Testes unitários: toggle nos dois estados, reuso do caminho Apify (mock), fallbacks (sem url / sem posts / Apify falha / sem key), stats (premium/standard/failed) e custo (estimativa + real).

## Tasks / Subtasks

- [x] **Task 1 — Adicionar `premiumIcebreakers` ao `ParsedBriefing` (tipo, sem migration)** (AC: #1, #5)
  - [x] Em [`src/types/agent.ts`](../../src/types/agent.ts#L73-L83): adicionar campo opcional `premiumIcebreakers?: boolean` ao `ParsedBriefing`. Zero migration — `briefing` é coluna JSONB em `agent_executions` (NFR5). Ausente/`undefined`/`false` = toggle desligado (comportamento atual).
  - [x] Estender `CreateCampaignOutput.icebreakerStats` ([`src/types/agent.ts:238-242`](../../src/types/agent.ts#L238-L242)) para incluir `premium: number` e `standard: number`, **mantendo** `generated`, `failed`, `skipped` (compatibilidade — ver Task 4). Regra: `generated === premium + standard`.

- [x] **Task 2 — Toggle no plano de execução + persistência no briefing** (AC: #1)
  - [x] Em [`AgentExecutionPlan.tsx`](../../src/components/agent/AgentExecutionPlan.tsx): adicionar um toggle (use o padrão de UI existente — `Switch` de `@/components/ui/switch` se existir, senão checkbox shadcn; siga `flex flex-col gap-*`, **nunca** `space-y-*` — ver Project Memory) com label "Icebreakers premium (LinkedIn)", default `false`, e texto auxiliar sobre o custo Apify por lead. Estado local `useState(false)`.
  - [x] Ao alternar, atualizar o **custo exibido** client-side: somar uma linha/estimativa Apify ao total mostrado (ex.: `leadsEstimados × R$0,15`). Não precisa refetchar o `/plan` — o valor autoritativo é recomputado no confirm (Task 3). Deixe claro no código que o número exibido é estimativa.
  - [x] Propagar o valor do toggle para o `onConfirm`: mude a assinatura de `onConfirm` para `onConfirm(premiumIcebreakers: boolean)` e, em [`AgentChat.tsx` `handleConfirmPlan`](../../src/components/agent/AgentChat.tsx#L229-L261), repassar no corpo do POST `/confirm` (Task 3).
  - [x] **Preservar** todo o resto do componente (loading/error/retry states, ícones, `data-testid`). Não remova nada.

- [x] **Task 3 — Confirm route persiste o toggle e recomputa custo** (AC: #1, #4)
  - [x] Em [`/api/agent/executions/[executionId]/confirm/route.ts`](../../src/app/api/agent/executions/[executionId]/confirm/route.ts): ler `premiumIcebreakers` do corpo (JSON opcional, default `false`; parse defensivo — se `request.json()` falhar, trate como `false`, **não** 400, pois hoje o confirm não manda corpo).
  - [x] Mesclar no briefing: `const nextBriefing = { ...briefing, premiumIcebreakers }` e **persistir** no update de `agent_executions` (adicionar `briefing: nextBriefing` ao `.update(...)`). Assim o `CreateCampaignStep` (que lê `execution.briefing`) enxerga o toggle.
  - [x] Recomputar `costEstimate` **com** o `nextBriefing` (já é o input de `estimateCosts` — Task 5) para que o `cost_estimate` salvo reflita o Apify. Ordem: monte `nextBriefing` **antes** de `estimateCosts`/`generatePlan`.
  - [x] **Preservar** toda a validação existente (`status !== "pending"`, `hasMinimumFields`, insert de `agent_steps`).

- [x] **Task 4 — `CreateCampaignStep` usa o caminho premium quando ligado** (AC: #2, #3, #4, #5)
  - [x] Em [`create-campaign-step.ts`](../../src/lib/agent/steps/create-campaign-step.ts): ler o flag do briefing — `const usePremium = Boolean(briefing.premiumIcebreakers)`.
  - [x] Buscar a Apify key **defensivamente** (fail-open): NÃO use `getServiceApiKey` diretamente (ele **lança** se não achar — [step-utils.ts:24](../../src/lib/agent/steps/step-utils.ts#L24)). Faça um fetch guardado em try/catch (espelhe `getOpenAIApiKey` do próprio arquivo, mas retornando `null` em vez de lançar). Se `usePremium && apifyKey == null` → todos os leads vão pro fallback standard (AC3).
  - [x] Refatorar `generateIcebreakers`: para cada lead, se `usePremium && apifyKey && lead.linkedinUrl` → tentar caminho premium; senão → standard atual. **O caminho standard tem que permanecer idêntico ao de hoje** (AC5).
  - [x] Caminho premium (novo helper `generateSinglePremiumIcebreaker`): reusar `ApifyService.fetchLinkedInPosts(apifyKey, lead.linkedinUrl, 3)` (import de `@/lib/services/apify`) → se `!success || posts.length === 0` retornar sinal de fallback; senão renderizar `icebreaker_premium_generation` via `promptManager.renderPrompt` com as variáveis que o prompt espera (`company_context`, `tone_description`, `tone_style`, `lead_name`, `lead_title`, `lead_company`, `lead_industry`, `linkedin_posts`, `product_name`, `product_description`) — ver [defaults.ts:298](../../src/lib/ai/prompts/defaults.ts#L298) e o builder de referência [`buildIcebreakerVariables`/`formatLinkedInPostsForPrompt` na rota](../../src/app/api/leads/enrich-icebreaker/route.ts#L249-L317). Reaproveite `aiVars` (já traz company/tone) — não reconstrua KB.
  - [x] **Fallback fail-open**: url ausente, sem posts, Apify falha (exceção) ou prompt/AI falha → cair pro `generateSingleIcebreaker` standard atual. Nenhum lead sem icebreaker por causa do premium (AC3).
  - [x] **Stats**: contar `premium` (icebreaker gerado via posts reais), `standard` (gerado via fallback/caminho standard), `failed` (nem premium nem standard produziram texto). Manter `generated = premium + standard` e `skipped` como hoje. Preservar o batching de 5 (`ICEBREAKER_BATCH_SIZE`) e o `Promise.allSettled`.
  - [x] **Custo real (AC4)**: contar as chamadas Apify efetivamente feitas e adicionar ao objeto `cost` retornado (ex.: `apify: apifyCallsCount`). Registrar uso via `logApifySuccess`/`logApifyFailure` do [`usage-logger`](../../src/lib/services/usage-logger.ts) (o logger tolera `leadId` ausente — grava `lead_id: null`; leads do agente não são persistidos, então passe `leadId` undefined/omisso). `cost.openai_icebreakers` continua = `icebreakerStats.generated`.
  - [x] **NFR2 / performance**: o premium adiciona uma chamada Apify (até 60s) por lead — mantê-lo **dentro** do batch `Promise.allSettled` de 5 para não serializar. Não altera o < 5s do chat (isso é o step de execução, assíncrono, não o turno de conversa).

- [x] **Task 5 — Cost estimate pré-execução inclui Apify quando ligado** (AC: #4)
  - [x] Em [`CostEstimatorService.estimateCosts`](../../src/lib/services/agent-cost-estimator.ts#L92-L141): quando `briefing.premiumIcebreakers` é `true`, somar ao `create_campaign` (ou como linha própria) o custo Apify estimado = `totalLeads × apify` (use `costModels.get("apify") ?? DEFAULT_COSTS.apify.unitPrice`). Ajustar a `description` do step para refletir a inclusão. Quando `false`/ausente → **idêntico ao atual** (AC5).
  - [x] Opcional (melhora AC1): em [`PlanGeneratorService`](../../src/lib/services/agent-plan-generator.ts) a `descriptionFn` de `create_campaign` pode mencionar "com icebreakers premium (LinkedIn)" quando o flag está ligado — sem number mágico, texto apenas.

- [x] **Task 6 — Testes** (AC: #6)
  - [x] `create-campaign-step.test.ts` (localizar o arquivo existente do step): **RED→GREEN** no núcleo — toggle ligado + lead com `linkedinUrl` + Apify mock retornando posts → `icebreaker_premium_generation` é chamado e `icebreakerStats.premium === 1`. Toggle desligado → **nenhuma** chamada Apify, caminho idêntico ao atual (AC5).
  - [x] Fallbacks: lead sem `linkedinUrl` → standard; Apify retorna `success:false` → standard; Apify retorna `posts:[]` → standard; Apify key ausente com toggle ligado → todos standard. Cada caso conta em `standard`, não em `failed`.
  - [x] `cost`: com premium, `cost.apify` reflete o nº de chamadas Apify; sem premium, `cost` não tem `apify` (ou é 0).
  - [x] `agent-cost-estimator.test.ts`: `premiumIcebreakers:true` soma Apify ao total; `false`/ausente = valor atual (snapshot de regressão).
  - [x] Confirm route: corpo `{premiumIcebreakers:true}` persiste `briefing.premiumIcebreakers` e recomputa `cost_estimate`; corpo ausente/inválido → `false` sem 400.
  - [x] `AgentExecutionPlan` (se houver teste do componente): toggle renderiza, default off, `onConfirm` recebe o boolean.
  - [x] Suíte completa verde — zero regressão em 17.3 (create-campaign), 17.10/17.11 e no fluxo do plano/confirm.

- [x] **Task 7 — Validação final**
  - [x] `npx vitest run` (suíte inteira) — anotar files/pass/skip/fail. `npx tsc --noEmit` — confirmar 0 diagnostics **nos arquivos tocados** (o repo tem ~460 linhas de diagnostics pré-existentes em `__tests__/types`/migrations, fora de escopo). `npx eslint --max-warnings=0` limpo nos arquivos tocados (atenção ao no-console e no-non-null-assertion — ver Project Memory).
  - [ ] **Smoke manual** em `http://localhost:3000/agent` (lição Epic 21: a suíte verde NÃO prova a tela): (a) briefing simples → plano mostra o toggle desligado e custo sem Apify; (b) ligar o toggle → custo exibido sobe; (c) com toggle ligado, ao menos 1 lead com LinkedIn gera icebreaker premium visível no preview e `icebreakerStats` mostra premium/standard. **Não** inicie execução paga real sem necessidade — pode validar o caminho premium com key real em 1-2 leads e cancelar antes do export/activate. **⏳ OPERACIONAL (Fabossi) — pendente:** validações automatizadas 100% verdes, mas a tela real só o smoke prova.

### Review Findings

_Code review adversarial de 3 camadas (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-07-20, baseline `1c35f8d`. Auditor: todos os 6 ACs e NFRs implementados em código (não só reivindicados). Achados concentrados em precisão de custo (estimativa vs. real). Nenhum defeito de execução; fail-open, toggle e stats verificados corretos._

- [x] [Review][Decision → RESOLVIDO 2026-07-20: aceito como teto intencional (opção 1), sem alteração de código — consistente com o modelo de volume fixo do estimador; o custo real registrado nas chamadas continua correto, só a estimativa é upper bound] Estimativa de custo Apify pode superestimar muito a execução real — [agent-cost-estimator.ts:109](../../src/lib/services/agent-cost-estimator.ts#L109) usa `totalLeads (60 fixo) × apify` para todo toggle ligado, mas a execução só chama Apify para leads **com** `linkedinUrl` e **só** se houver key configurada ([create-campaign-step.ts:439,448](../../src/lib/agent/steps/create-campaign-step.ts#L439)); além disso o unit price da estimativa (R$0,15/perfil, `DEFAULT_COSTS.apify`) é ~10–50× a taxa real de tracking da Apify (`$1/1000 posts`, `api-usage.ts:99` → `calculateApifyCost`). Direção segura (estimativa ≥ real), mas o `cost_estimate` exibido/persistido pode ficar bem acima do custo Apify efetivo — relevante porque o cliente precifica em cima. Opções: (a) aceitar como teto intencional, consistente com o modelo de volume fixo do estimador — nada a fazer; (b) aplicar haircut de disponibilidade de LinkedIn e/ou checar presença de key; (c) reconciliar o unit price R$0,15 com a taxa real de billing da Apify. Fonte: Blind Hunter + Edge Case Hunter.

- [x] [Review][Defer] `cost.apify` conta a chamada mesmo quando `fetchLinkedInPosts` rejeita a URL na validação (sem bater na Apify, sem custo real) [create-campaign-step.ts:503](../../src/lib/agent/steps/create-campaign-step.ts#L503) — deferred, superconta em leads com `linkedinUrl` malformado; fix ambíguo (não dá pra distinguir reject de validação de falha real de fora do serviço).
- [x] [Review][Defer] `openai_icebreakers` subconta 1 chamada quando Apify traz posts mas a geração AI premium falha e cai no standard (2 chamadas AI, 1 output contado) [create-campaign-step.ts:238](../../src/lib/agent/steps/create-campaign-step.ts#L238) — deferred, consistente com a convenção do `cost` de contar outputs e não chamadas; magnitude mínima (só Apify-sucesso-então-AI-falha).
- [x] [Review][Defer] Custo exibido client-side usa constantes fixas (0,15/60), não espelha `skipSteps` nem override de `cost_models` do tenant [AgentExecutionPlan.tsx:134](../../src/components/agent/AgentExecutionPlan.tsx#L134) — deferred, spec permite explicitamente como estimativa; valor autoritativo é recomputado no confirm.
- [x] [Review][Defer] Icebreakers do agente (premium **e** standard) não removem aspas envolventes como a rota enrich-icebreaker faz [create-campaign-step.ts:569](../../src/lib/agent/steps/create-campaign-step.ts#L569) — deferred, pré-existente no standard (`generateSingleIcebreaker:627`); o premium é consistente com o standard do próprio agente, não é regressão da 22.2.
- [x] [Review][Defer] Teste-núcleo não prova o fetch da key específica da Apify (mocks decriptam `openai` e `apify` para a mesma string) [create-campaign-step.test.ts:279](../../__tests__/unit/lib/agent/steps/create-campaign-step.test.ts#L279) — deferred, força de teste, não defeito de código (o `getApifyApiKey` de produção filtra `.eq("service_name","apify")` corretamente).

_Dispensados como ruído (3): branch defensivo inalcançável em `formatLinkedInPostsForPrompt` (posts.length===0); duplicação de helper vs. rota enrich (o spec manda "copie a política, não o código" por operarem em tipos diferentes — `LeadRow` vs `SearchLeadResult`); "inconsistência" de moeda no mapa `cost` (mapa de contagens pré-existente + taxa de usage-log herdada do Epic 6.5, não introduzidas pela 22.2)._

## Dev Notes

### DEV AGENT GUARDRAILS — o que NÃO quebrar

- **NFR1 — pipeline 100% determinístico:** nenhuma decisão de execução vai pro LLM. O toggle é um input booleano do usuário; a decisão premium-vs-standard por lead é **código determinístico** (tem url? tem posts? tem key?), não LLM. O `DeterministicOrchestrator` e os approval gates ficam intactos.
- **NFR4 — zero regressão + AC5 (byte-a-byte):** com o toggle **desligado** (o default, e o estado de toda execução criada antes desta story, onde `premiumIcebreakers` é `undefined`), o `CreateCampaignStep`, o cost estimate e o cost real têm que ser **idênticos** ao de hoje. Escreva o código de forma que o caminho standard não mude — o premium é um ramo `if (usePremium && ...)` por cima.
- **NFR5 — zero migration:** `premiumIcebreakers` vive no JSONB `agent_executions.briefing`. Adicionar o campo ao tipo TS `ParsedBriefing` **não** é migration. Não crie coluna, não crie tabela.
- **NÃO duplicar scraping (requisito explícito do épico):** reuse `ApifyService.fetchLinkedInPosts` e o prompt `icebreaker_premium_generation`. Não escreva um novo cliente Apify, não copie o parser de posts.
- **Fail-open é obrigatório (AC3):** qualquer falha no caminho premium (sem key, sem url, sem posts, exceção Apify, erro de AI) **degrada** pro standard. Um lead nunca fica sem icebreaker por causa do premium. Espelhe exatamente a política da rota `enrich-icebreaker` (categoria `post` → fallback `lead`).
- **O skip determinístico de `search_companies` e o pipeline da 22.1 não são tocados aqui.** Esta story só mexe em icebreaker/custo/plano.

### A mudança em uma frase

Hoje `CreateCampaignStep` gera **só** icebreaker standard (`icebreaker_generation`, sem LinkedIn).
Depois desta story: se o usuário ligar o toggle no plano, cada lead **com LinkedIn** ganha um
icebreaker **premium** (posts reais via Apify + `icebreaker_premium_generation`), com fallback
transparente pro standard; o custo Apify entra na estimativa e no custo real; toggle desligado =
exatamente o comportamento de hoje.

### Fluxo end-to-end do toggle (siga esta cadeia)

1. **Plano** ([`AgentExecutionPlan`](../../src/components/agent/AgentExecutionPlan.tsx)): usuário liga o toggle (default off) → estado local + custo exibido atualiza.
2. **Confirm** ([`handleConfirmPlan` em AgentChat](../../src/components/agent/AgentChat.tsx#L229-L261) → [`/confirm` route](../../src/app/api/agent/executions/[executionId]/confirm/route.ts)): POST com `{premiumIcebreakers}` → route mescla em `briefing` (JSONB) e recomputa `cost_estimate`.
3. **Execução** ([`orchestrator.executeStep`](../../src/lib/agent/orchestrator.ts#L215-L220) monta `StepInput` com `execution.briefing`) → [`CreateCampaignStep.executeInternal`](../../src/lib/agent/steps/create-campaign-step.ts#L74) lê `briefing.premiumIcebreakers`.
4. **Preview** ([`AgentCampaignPreview`](../../src/components/agent/AgentCampaignPreview.tsx#L228)): já renderiza `icebreakerStats.generated`; adicionar a distinção premium/standard (opcional visual, mas o stat tem que existir — AC3).

### Arquivos a tocar

| Arquivo | Tipo | O que muda |
|---|---|---|
| [`src/types/agent.ts`](../../src/types/agent.ts) | UPDATE | `ParsedBriefing.premiumIcebreakers?: boolean`; `icebreakerStats` ganha `premium`/`standard` |
| [`src/components/agent/AgentExecutionPlan.tsx`](../../src/components/agent/AgentExecutionPlan.tsx) | UPDATE | Toggle + custo client-side + `onConfirm(boolean)` |
| [`src/components/agent/AgentChat.tsx`](../../src/components/agent/AgentChat.tsx) | UPDATE | `handleConfirmPlan` repassa o toggle no corpo do `/confirm` |
| [`src/app/api/agent/executions/[executionId]/confirm/route.ts`](../../src/app/api/agent/executions/[executionId]/confirm/route.ts) | UPDATE | Lê corpo, persiste `briefing.premiumIcebreakers`, recomputa custo |
| [`src/lib/agent/steps/create-campaign-step.ts`](../../src/lib/agent/steps/create-campaign-step.ts) | UPDATE | Ramo premium + fetch defensivo da Apify key + stats + custo |
| [`src/lib/services/agent-cost-estimator.ts`](../../src/lib/services/agent-cost-estimator.ts) | UPDATE | Soma Apify ao estimate quando ligado |
| [`src/lib/services/agent-plan-generator.ts`](../../src/lib/services/agent-plan-generator.ts) | UPDATE (opcional) | Menção "premium" na descrição do step |
| Testes correspondentes | UPDATE/NEW | Task 6 |

### Estado atual dos arquivos-chave (leia antes de editar)

- **`CreateCampaignStep.generateIcebreakers`** ([create-campaign-step.ts:388-455](../../src/lib/agent/steps/create-campaign-step.ts#L388-L455)): hoje itera em batches de 5, chama `generateSingleIcebreaker` (prompt `icebreaker_generation`, sem LinkedIn), monta `icebreakerStats = {generated, failed, skipped}`. Leads são `SearchLeadResult` — campo é `linkedinUrl` (camelCase), pode ser `null`. **Não** têm `id` de DB (não use como `leadId` obrigatório no logger).
- **Caminho Apify de referência** ([enrich-icebreaker route.ts:452-569](../../src/app/api/leads/enrich-icebreaker/route.ts#L452-L569)): `processPostCategory` mostra exatamente a política — sem `linkedin_url`/sem key → fallback; Apify exceção → fallback + `logApifyFailure`; sem posts → fallback + `logApifySuccess(postsFetched:0)`; sucesso → `icebreaker_premium_generation` + `logApifySuccess`. **Copie a política, não o código** (a rota opera em `LeadRow` do DB; o step opera em `SearchLeadResult`).
- **`ApifyService`** ([apify.ts:104-197](../../src/lib/services/apify.ts#L104-L197)): `fetchLinkedInPosts(apiKey, linkedinUrl, limit=3)` retorna `{success, posts, error, profileUrl, fetchedAt}`. Já valida URL e trata timeout/erro internamente (nunca lança pra fora — retorna `success:false`). Construtor `new ApifyService()` sem args.
- **`CostEstimatorService.estimateCosts`** ([agent-cost-estimator.ts:92-141](../../src/lib/services/agent-cost-estimator.ts#L92-L141)): já tem `apify` em `DEFAULT_COSTS` (R$0,15/perfil) mas **não** o usa hoje. `totalLeads = ESTIMATED_COMPANIES(30) × ESTIMATED_LEADS_PER_COMPANY(2) = 60`. Use o mesmo `totalLeads` pra estimar Apify.
- **Confirm route** ([confirm/route.ts:15-112](../../src/app/api/agent/executions/[executionId]/confirm/route.ts)): hoje `POST` sem corpo. Ao adicionar leitura de corpo, seja defensivo (o cliente atual e testes podem não mandar corpo).

### Padrões estabelecidos a seguir

- **Prompts** vivem como constantes/`promptManager` (`icebreaker_premium_generation` já existe em [defaults.ts:298](../../src/lib/ai/prompts/defaults.ts#L298)). Não crie prompt novo.
- **Tailwind v4:** `flex flex-col gap-*` para spacing de label+input/toggle — `space-y-*` NÃO funciona com Radix neste projeto (Project Memory). Toggle: procure `@/components/ui/switch`; se não existir, use o checkbox shadcn já usado no projeto.
- **ESLint:** `no-console` é enforced (use os loggers/`console.error` só onde já é padrão em rotas) e `no-non-null-assertion` (não use `!` em `process.env`/valores — leitura guardada). O pre-commit linta o arquivo inteiro (Project Memory).
- **Português (BR)** em todo texto de UI/chat. O texto do toggle e a descrição de custo em PT-BR.
- **Custo não pode errar** (o cliente precifica em cima — Project Memory): a estimativa Apify usa `cost_models`/`DEFAULT_COSTS.apify`, não número inventado. O custo real conta chamadas efetivas.

### Testing standards

- Vitest (`npx vitest run`). Mocks de Supabase via `createChainBuilder` (`__tests__/helpers/mock-supabase`). Mocke `ApifyService.fetchLinkedInPosts` e o `provider.generateText`/`promptManager.renderPrompt` no teste do step.
- **Prove RED antes de GREEN** no caso-núcleo (toggle ligado + lead com LinkedIn → premium chamado): escreva o teste, veja falhar contra o código atual (que nunca chama Apify), então implemente.
- **Lição sistêmica Epic 21 (aplica aqui):** a suíte verde **não prova a tela**. Os mocks não provam que a chamada Apify real funciona nem que o toggle persiste de verdade no JSONB. Por isso a Task 7 pede smoke manual. Não declare "pronto" só com a suíte verde.
- **Ponto cego de constraint/JOIN (Project Memory):** aqui o risco é o toggle **não persistir** no `briefing` (o mock do Supabase não valida o update real do JSONB). O smoke manual tem que confirmar que, após confirmar com toggle ligado, a execução realmente roda premium.

### Project Structure Notes

- Sem novos arquivos de rota, sem migration. Um helper novo (`generateSinglePremiumIcebreaker`) dentro do step existente. Toggle dentro do componente de plano existente.
- A separação "plano decide input → confirm persiste no briefing → step executa determinístico" é preservada.

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.2] — ACs, FR9/FR10/FR11, decisão Q3 (toggle opcional, default off)
- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#NonFunctional Requirements] — NFR1 (determinístico), NFR3 (custo Apify), NFR4 (zero regressão), NFR5 (zero migration)
- [Source: src/app/api/leads/enrich-icebreaker/route.ts#L452-L569] — `processPostCategory`: política de fallback fail-open a espelhar
- [Source: src/lib/services/apify.ts#L104-L197] — `fetchLinkedInPosts` a reusar
- [Source: src/lib/agent/steps/create-campaign-step.ts#L388-L455] — `generateIcebreakers` (alvo Task 4)
- [Source: src/lib/ai/prompts/defaults.ts#L298] — prompt `icebreaker_premium_generation` (variáveis esperadas)
- [Source: src/lib/services/agent-cost-estimator.ts#L92-L141] — `estimateCosts` (alvo Task 5); `DEFAULT_COSTS.apify` já definido
- [Source: src/app/api/agent/executions/[executionId]/confirm/route.ts] — confirm route (alvo Task 3)
- [Source: src/components/agent/AgentExecutionPlan.tsx] — plano (alvo Task 2); [AgentChat.tsx#L229-L261] — `handleConfirmPlan`
- [Source: src/types/agent.ts#L73-L83, #L238-L242] — `ParsedBriefing`, `icebreakerStats` (alvo Task 1)
- [Source: 22-1-tecnologia-opcional-localizacao-obrigatoria.md] — story anterior; lição "suíte verde não prova a tela", padrão de fetch defensivo de API key

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- `npx vitest run` (suíte inteira): **395 files / 6813 pass / 2 skip / 0 fail** (+14 testes vs. baseline 6799 da 22.1; zero regressão). As linhas `ECONNREFUSED :3000` no log são ruído pré-existente (teste que tenta bater em localhost), não falha.
- `npx tsc --noEmit`: 0 diagnostics nos arquivos tocados (repo mantém ~460 linhas pré-existentes em `__tests__/types`/migrations, fora de escopo).
- `npx eslint --max-warnings=0`: limpo em todos os arquivos tocados (exit 0). Resolvido de passagem 1 erro **pré-existente** `react-hooks/set-state-in-effect` no `useEffect(fetchPlan)` de `AgentExecutionPlan` (fetch-on-mount intencional → `eslint-disable-next-line` justificado) que só aflorou porque o lint-staged linta o arquivo inteiro; e removido import `DEFAULT_VOLUMES` não usado no teste do cost estimator.

### Completion Notes List

Story 22.2 — Icebreaker Premium com LinkedIn (Toggle Opcional). Implementação:

- **Task 1 (types):** `ParsedBriefing.premiumIcebreakers?: boolean` (JSONB, zero migration — NFR5) e `CreateCampaignOutput.icebreakerStats` ganhou `premium`/`standard` mantendo `generated`/`failed`/`skipped` (regra `generated = premium + standard`).
- **Task 2 (plano):** toggle `Switch` "Icebreakers premium (LinkedIn)" default **desligado** em `AgentExecutionPlan`, com texto de custo (~R$0,15/lead) e custo exibido recalculado client-side (`+ 60 × R$0,15`). `onConfirm` agora recebe `boolean`; `AgentChat.handleConfirmPlan` repassa `{premiumIcebreakers}` no corpo do POST `/confirm`.
- **Task 3 (confirm):** leitura **defensiva** do corpo (sem corpo → `false`, nunca 400), `nextBriefing = {...briefing, premiumIcebreakers}` montado **antes** de estimar custo/gerar plano, persistido no `.update({ briefing, cost_estimate, ... })`.
- **Task 4 (step):** `usePremium = Boolean(briefing.premiumIcebreakers)`; fetch **defensivo** da Apify key (`getApifyApiKey` retorna `null` em vez de lançar). Novo `generateSinglePremiumIcebreaker` **reusa** `ApifyService.fetchLinkedInPosts` + prompt `icebreaker_premium_generation` (não duplica scraping). **Fail-open (AC3):** sem url / sem key / `success:false` / posts vazios / erro AI → caem no `generateSingleIcebreaker` standard atual; nenhum lead fica sem icebreaker. Stats premium/standard/failed; custo real conta chamadas Apify (`cost.apify`, ausente quando 0). `logApifySuccess`/`logApifyFailure` (logger relaxado p/ `leadId?` — leads do agente não são persistidos). Batch de 5 + `Promise.allSettled` preservados.
- **Task 5 (custo):** `estimateCosts` soma Apify (`totalLeads × apify`) ao `create_campaign` só quando `premiumIcebreakers === true` e o step não está skipped; descrição menciona os perfis LinkedIn. `agent-plan-generator` sinaliza "com icebreakers premium (LinkedIn)" na descrição do step. **AC5 byte-a-byte:** com toggle off/ausente, estimate e custo real idênticos ao atual (provado em teste de regressão: 4,20 / total 7,30).
- **Task 6 (testes):** núcleo **RED→GREEN** (toggle on + lead c/ LinkedIn → `icebreaker_premium_generation` chamado, `premium===1`; toggle off → **nenhuma** chamada Apify) + 4 fallbacks (sem url / `success:false` / posts vazios / key ausente) + custo real + confirm route (persiste flag + recomputa custo; corpo ausente → false sem 400) + cost estimator (soma Apify / regressão off / skip) + componente do plano (toggle default off, custo sobe, `onConfirm(boolean)`). 14 testes novos.

**Prova RED do núcleo:** contra o código pré-22.2, `generateIcebreakers` nunca chamava Apify e `icebreakerStats` não tinha `premium` — o teste "usa Apify + icebreaker_premium_generation" falharia (`mockFetchLinkedInPosts` 0 chamadas, `stats.premium` undefined). Passou a verde após o ramo premium.

**⏳ Pendente (OPERACIONAL Fabossi — lição Epic 21):** smoke manual em `/agent` (Task 7b). A suíte mocka Apify/Supabase e **não prova** que o toggle persiste de verdade no JSONB nem que a chamada Apify real funciona. Rodar: (a) toggle off → custo sem Apify; (b) toggle on → custo sobe; (c) 1 lead c/ LinkedIn → icebreaker premium no preview + `icebreakerStats` premium/standard. Cancelar antes de export/activate pago.

### File List

**Modificados (src):**
- `src/types/agent.ts` — `ParsedBriefing.premiumIcebreakers?`; `icebreakerStats.premium`/`.standard`
- `src/components/agent/AgentExecutionPlan.tsx` — toggle Switch + custo client-side + `onConfirm(boolean)` (+ disable justificado do `set-state-in-effect` pré-existente)
- `src/components/agent/AgentChat.tsx` — `handleConfirmPlan(premiumIcebreakers)` repassa no corpo do `/confirm`
- `src/components/agent/AgentCampaignPreview.tsx` — exibe breakdown premium/standard quando premium > 0
- `src/app/api/agent/executions/[executionId]/confirm/route.ts` — lê corpo defensivo, persiste `briefing.premiumIcebreakers`, recomputa custo com `nextBriefing`
- `src/lib/agent/steps/create-campaign-step.ts` — ramo premium + `getApifyApiKey` defensivo + `generateSinglePremiumIcebreaker` + `formatLinkedInPostsForPrompt` + stats + `cost.apify`
- `src/lib/services/agent-cost-estimator.ts` — soma Apify ao `create_campaign` quando premium ligado
- `src/lib/services/agent-plan-generator.ts` — menção "premium (LinkedIn)" na descrição do step
- `src/lib/services/usage-logger.ts` — `logApifySuccess` aceita `leadId?` (agente não persiste lead)

**Modificados (testes):**
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` — mocks Apify/usage-logger + suite premium (núcleo RED→GREEN + fallbacks + custo)
- `__tests__/unit/api/agent/execution-confirm.test.ts` — persiste flag + recomputa custo; corpo ausente → false
- `__tests__/unit/lib/services/agent-cost-estimator.test.ts` — soma Apify / regressão off / skip (removido import não usado)
- `__tests__/unit/components/agent/AgentExecutionPlan.test.tsx` — toggle default off, custo sobe, `onConfirm(boolean)`

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-07-20 | 0.2 | Implementação da Story 22.2: toggle icebreaker premium (LinkedIn) opcional default off → persiste no briefing JSONB → `CreateCampaignStep` usa caminho premium reusando `ApifyService` + `icebreaker_premium_generation` com fallback fail-open; custo Apify na estimativa + custo real; stats premium/standard/failed. 14 testes novos, suíte 6813 pass/0 fail, tsc/eslint limpos. Status → review (smoke manual pendente p/ Fabossi). | Amelia (dev-story) |
