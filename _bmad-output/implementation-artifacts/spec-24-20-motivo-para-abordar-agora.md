---
title: '24.20 — Motivo para abordar agora'
type: 'feature'
created: '2026-11-04'
status: done
baseline_commit: 'b627e71'
review_loop_iteration: 2
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-24-19-dossie-da-conta.md'
warnings: ['oversized']
deferred: []
linear: 'FEL-43'
requisitos: 'FR34 (parte "gatilho"; o uso na copy é FR35/24.21; o painel é FR36/24.22)'
operator_actions:
  - "Revisar e dar o OK (Regra nº 1, ponto 3) antes do merge e do deploy: a fase nova roda dentro do research_accounts, que fica no caminho até o Instantly. Ela é fail-open, não toca create_campaign/export/activate/Instantly/orchestrator, mas acrescenta uma chamada de IA por conta com fato elegível (≈ 5–15 s no caso feliz, dentro do prazo duro de hoje; pior caso do step inalterado em ≈ 256 s)."
  - "Depois do OK e do deploy, fazer o smoke real de uma execução guiada com 2–3 leads, sem ativar no Instantly: a mensagem-resumo do research deve mostrar o bloco 'Motivo para abordar agora', agent_steps.output.whyNow deve existir na linha research_accounts, deve haver 1 linha why_now_trigger por chamada em api_usage_logs e o create_campaign deve seguir normalmente."
  - "No Linear, mover a FEL-43 para Precisa Felipe com o label precisa-felipe e registrar branch, SHA e checks (não feito pelo agente nesta sessão por instrução explícita: sem Linear e sem push)."
---

# Story 24.20: Motivo para abordar agora

Status: done

> **BLOQUEIO:** nenhum. A story **não precisa de migration**: o gatilho de cada lead fica no `output` jsonb da linha `research_accounts` em `agent_steps`, que já existe. Os fatos são lidos das tabelas da 00073, que já está aplicada em produção.

## Story

As a usuário do agente,
I want que cada lead tenha um gatilho claro de "por que agora",
so that o primeiro e-mail tenha um motivo real e oportuno.

## Acceptance Criteria (do épico, com o detalhamento desta story)

1. **Given** o dossiê de uma conta (24.19), **when** o gatilho é escolhido (LLM sobre os fatos + hipótese de dor por persona a partir da KB), **then** o lead recebe:
   - o gatilho;
   - o fato de origem com fonte, que é obrigatoriamente um dos fatos existentes do dossiê, referenciado por índice e copiado com `fonte_url`;
   - a hipótese de dor, formulada como pergunta;
   - o nível de confiança.
2. **Given** nenhum fato elegível com confiança `media`/`alta`, **when** o gatilho é avaliado, **then** o lead é marcado "sem gatilho" **sem chamar a LLM** e segue a copy padrão (Marco 1).
3. **Given** qualquer falha (sem chave OpenAI, erro, timeout, teto de chamadas/custo/tempo, resposta inválida, gatilho citando fato inexistente), **when** o gatilho é avaliado, **then** o lead fica "sem gatilho" e o resto da execução segue **exatamente como hoje** (fail-open total).
4. **Given** a execução, **when** o `research_accounts` termina, **then** a mensagem-resumo do step no chat mostra, por lead, o gatilho (com fonte e data) ou "sem gatilho". É o lugar onde o usuário já acompanha e revisa o agente, logo antes da prévia da campanha.
5. **Given** um lead com ou sem gatilho, **when** o `create_campaign`, o export e a ativação rodam, **then** eles recebem e enviam exatamente o mesmo que hoje: mesmo `previousStepOutput`, mesmos prompts, mesmo payload do Instantly, nenhum lead filtrado ou bloqueado.

<intent-contract>

## Intent

**Problem:** O dossiê da 24.19 junta fatos com fonte, mas nada escolhe, para cada lead, **o** motivo oportuno para escrever agora. Sem isso, a 24.21 (copy 1-para-1) não tem de onde partir e o usuário não vê por que aquele lead vale a abordagem.

**Approach:** Uma fase nova, fail-open, **dentro do step `research_accounts`** e depois da pesquisa das contas. Para cada conta com fatos elegíveis (notícia, vaga ou post próprio, com confiança `media`/`alta`), faz **uma** chamada de LLM barato (mesmo padrão e modelo do Fit Score, 24.16, com a chave OpenAI do tenant). A chamada recebe os fatos indexados, o cargo dos leads e as dores do ICP da KB. A resposta é validada por schema e por regras: o gatilho tem de citar um índice de fato existente e elegível para aquele lead. O resultado vai para `output.whyNow` da própria linha `research_accounts` e aparece na mensagem-resumo do step. Nada disso chega ao `create_campaign`.

## Boundaries & Constraints

**Always:**
- **Sem migration e sem tabela/coluna nova.** O gatilho fica em `agent_steps.output.whyNow` (jsonb) da linha `research_accounts`. Os fatos vêm da memória do step (conta pesquisada agora) ou de um `SELECT` em `account_dossier_facts` (conta com dossiê reaproveitado). Se a implementação concluir que precisa de migration, **parar**: escrever o motivo numa seção "BLOQUEIO" no topo deste arquivo, marcar `status: blocked` e não escrever a migration.
- **Fail-open total.** A fase nunca lança, nunca muda o `status` final do step (continua `completed`), nunca muda `accounts`, `summary`, `flags`, `costUsd`, `icebreakerPosts` nem `icebreakerPostsAttempted` do output da 24.19 e nunca pausa o pipeline. Toda falha vira `status: 'no_trigger'` com `reason` no lead e uma flag em `whyNow.flags`.
- **Só fatos com fonte.** O fato de origem é um dos fatos do dossiê **daquela conta**, referenciado por índice (`ref`) na lista enviada à LLM e copiado da memória (`kind`, `fato`, `fonte_url`, `data`, `confianca`), nunca do texto da LLM. Índice inexistente, fora da lista elegível ou que seja post de **outro** lead: a entrada é descartada e o lead fica "sem gatilho" (`invalid_response`).
- **Elegíveis:** fatos `kind ∈ {news, job, post}` com `confianca ∈ {media, alta}` e `fonte_url` http(s) (`isValidFact`). Posts só valem para o próprio lead (`lead_apollo_id`/`lead_email`). `site` e `technology` vão no prompt só como **contexto** (não citáveis), porque não são acontecimentos "de agora". Lead sem nenhum fato elegível fica "sem gatilho" (`no_eligible_facts`) **sem chamada de LLM**. Uma conta em que nenhum lead tem fato elegível não gera chamada.
- **Hipótese de dor por persona** (cargo do lead) a partir das dores do ICP da KB (`readTenantICP(tenantId).painPoints`, service-role e fail-open). Tem de terminar com `?`. Sem dores na KB, a LLM formula a pergunta só a partir do fato e do cargo (registrar `kbPainsAvailable: false` em `whyNow`).
- **Confiança final** = o menor valor entre a confiança da LLM e a `confianca` do fato de origem (ordem `baixa < media < alta`). Final `baixa` vira "sem gatilho" (`low_confidence`). Assim, todo gatilho gravado tem `media` ou `alta`.
- **Nada inventado:** todo número (sequência de dígitos) que aparecer no gatilho ou na hipótese precisa aparecer no texto do fato de origem. Senão, a entrada é descartada (`invalid_response`).
- **LLM:** SDK `openai` direto, como em `src/lib/agent/fit-scorer.ts`. Modelo e request numa fonte única nova, `src/lib/ai/why-now-config.ts`, no molde de `fit-score-config.ts`: `gpt-5.4-mini`, `response_format: json_object`, sem `temperature` na família gpt-5 (`isGpt5Family`). Chave por tenant via `getServiceApiKeyOrNull(tenantId, "openai")` (`src/lib/agent/service-keys.ts`). **Nunca** `process.env`.
- **Privacidade:** a LLM recebe cargo e empresa do lead, nunca nome nem e-mail (mesma regra do Fit Score). O texto dos posts próprios já vai à OpenAI hoje pelo `relevance-classifier`.
- **Tetos baixos e configuráveis**, em `WHY_NOW_CONFIG` (`src/lib/agent/dossier/config.ts`): chamadas por execução, custo reservado por execução, leads e fatos por chamada, timeout por chamada, orçamento de tempo da fase e o kill switch `enabled`. Todas as esperas correm também contra o prazo duro do step (`DOSSIER_CONFIG.hardDeadlineMs`, via `settleWithin`/`bounded`). A fase não pode aumentar o pior caso do step (≈ 256 s).
- **Custo:** cada chamada tentada gera 1 linha em `api_usage_logs` via `logAgentUsage`, com `serviceName: "openai"`, `requestType: "why_now_trigger"`, `stepType: "research_accounts"`, status, duração e tokens no metadata. O custo também entra em `cost.openai_why_now` (número de chamadas) e no custo real e na estimativa do step.

**Never:**
- Nada do gatilho entra no `previousStepOutput` do `create_campaign`, nos prompts dele, no payload do Instantly, no export ou na ativação. Nenhum lead é filtrado, reordenado ou bloqueado por causa do gatilho. O uso na copy é da 24.21; o painel de dossiê é da 24.22.
- Não tocar em `src/lib/agent/steps/export-step.ts`, `src/lib/agent/steps/activate-step.ts`, `src/lib/agent/steps/create-campaign-step.ts`, `src/lib/services/instantly.ts` nem em outros serviços/rotas do Instantly. Também não tocar em `src/lib/agent/orchestrator.ts`, `pg_cron`, Edge Functions, secrets, env ou `supabase/migrations/`.
- Não criar `MessageType` novo, tela, rota ou componente novo. Não mexer em `AgentCampaignPreview`, `AgentLeadReview` nem `AgentActivationGate`.
- Não usar `promptManager`/`ai_prompts`: o prompt é constante do módulo, como no Fit Score. É classificação e seleção, não copy enviada ao lead, e assim não há leitura extra de banco.
- Não chamar rede real em teste (OpenAI, Treg, Instantly e Supabase sempre mockados). Não rodar smoke em produção nesta story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Feliz | 2 contas pesquisadas agora; conta A com 1 notícia `alta` e 2 leads; conta B só com `site`+`technology` | 1 chamada (conta A); os 2 leads de A com `status:'trigger'`, `fatoOrigem` = cópia exata do fato `ref`, hipótese terminando em `?` e confiança `media`/`alta`; leads de B `no_trigger`/`no_eligible_facts`; 1 linha `why_now_trigger` em `api_usage_logs`; `cost.openai_why_now = 1`; resumo no chat com as linhas por lead | — |
| Só baixa | conta com notícias só `baixa` (ou nenhum fato) | todos `no_trigger`/`no_eligible_facts`; **zero** chamadas de LLM e zero logs | — |
| Reuso | conta com dossiê `complete` reaproveitado | lê `account_dossier_facts` do `dossierId` (bounded) e segue como o Feliz | leitura falha ou passa do prazo → `facts_unavailable`, sem chamada |
| Post de outro lead | LLM cita para o lead 0 um post do lead 1 | entrada descartada; lead 0 `no_trigger`/`invalid_response` | sem throw |
| Fato inexistente | LLM devolve `ref` 99 (ou negativo, ou não inteiro) | `no_trigger`/`invalid_response` | sem throw |
| Número inventado | gatilho cita "300 vagas" e o fato não tem "300" | `no_trigger`/`invalid_response` | sem throw |
| Não é pergunta | hipótese sem `?` no final | `no_trigger`/`invalid_response` | sem throw |
| Recusa da LLM | `ref: null` para um lead | `no_trigger`/`llm_declined` | — |
| Confiança baixa | LLM `baixa`, ou LLM `alta` com fato `media` | `baixa` → `low_confidence`; `alta`+fato `media` → gravado `media` | — |
| Sem chave OpenAI | `getServiceApiKeyOrNull` → `null` (ausente ou decrypt) | todos com fato elegível `no_trigger`/`no_openai_key`; `whyNow.flags.noOpenaiKey`; zero chamadas | sem throw |
| Erro/timeout LLM | throw, HTTP 500, abort por timeout, JSON inválido, schema inválido | leads da conta `no_trigger`/`llm_error` \| `timeout` \| `invalid_response`; 1 log `failed` | sem throw |
| Teto de chamadas/custo | mais contas elegíveis que `maxCallsPerExecution` (ou custo reservado esgotado) | contas excedentes sem chamada: `call_limit` \| `budget`; flag correspondente | sem throw |
| Teto de tempo | tempo restante até o prazo duro < `minPhaseMs` ao iniciar, ou a fase passa de `phaseBudgetMs` | contas não avaliadas `time_budget`; `whyNow.flags.timeBudgetExhausted`; step termina no prazo de hoje | sem throw |
| Leads além do limite | conta com mais leads que `maxLeadsPerCall` | os excedentes `call_limit` | — |
| Kill switch | `WHY_NOW_CONFIG.enabled = false` | `whyNow` com todos `no_trigger`/`disabled`; zero chamadas; resumo da 24.19 sem o bloco de gatilhos | — |
| Pesquisa pulada | sem chave Treg, sem leads, conta `skipped`, backstop do step | leads `no_trigger`/`not_researched`; mensagens antecipadas da 24.19 **inalteradas** | — |
| Exceção inesperada na fase | qualquer throw dentro da fase | `whyNow.flags.unexpectedError`; leads ainda não avaliados `no_trigger`/`llm_error`; step `completed` com o resto do output idêntico | sem throw |
| Checkpoint mínimo | checkpoint completo falha | o fallback mínimo da 24.19 também remove `whyNow` (como já faz com `accounts`) | — |
| Create inalterado | qualquer cenário acima | `previousStepOutput` do `create_campaign` deep-equal ao de uma execução sem a fase; `loadDossierPosts` continua lendo `icebreakerPosts` igual | — |

</intent-contract>

## Decisões tomadas sem humano (modo não interativo, conservadoras)

- **D1 — Onde calcula:** dentro do `research_accounts`, como fase final do `executeInternal`, e não num step novo. Um step novo mudaria o plano, o orchestrator, o `use-auto-trigger`, a numeração e o caminho até o Instantly. A fase herda o ciclo de vida fail-open e o prazo duro já revisados na 24.19 (2 revisões do Codex).
- **D2 — Onde guarda:** `agent_steps.output.whyNow` da linha `research_accounts` (jsonb existente). Nada de tabela nem coluna nova. Campo opcional: output antigo sem `whyNow` = "nunca avaliado".
- **D3 — Fato de origem:** referenciado pelo índice `ref` na lista de fatos daquela conta enviada à LLM e **copiado da memória** para o output (snapshot com `fonte_url`). As tabelas da 00073 não devolvem `id` no insert hoje, e mudar `saveDossier`/`insertFacts` não vale o risco.
- **D4 — Fatos elegíveis:** só `news`, `job` e `post` (acontecimentos datados na janela de 90 dias), com `media`/`alta`. `site` e `technology` entram só como contexto. É a leitura conservadora de "por que **agora**".
- **D5 — Granularidade:** 1 chamada por **conta** (todos os leads da conta numa chamada, até `maxLeadsPerCall`), e não por lead. Custo e latência menores e teto previsível.
- **D6 — Confiança `baixa` não vira gatilho** (`low_confidence`). A 24.21 vai escrever a copy em cima do gatilho; gatilho fraco gera e-mail fraco.
- **D7 — "Visível na revisão" = a mensagem-resumo do `research_accounts` no chat** (`AgentMessageBubble`, texto `whitespace-pre-wrap`, componente existente). Ela aparece logo antes da prévia da campanha. O painel por lead é da 24.22. As mensagens antecipadas da 24.19 ("pesquisa pulada...") não mudam.
- **D8 — Prompt constante no módulo** (como o Fit Score), fora do `promptManager`.
- **D9 — Kill switch em código** (`WHY_NOW_CONFIG.enabled`), não em env, porque env/secrets são proibidos sem pedido.
- **D10 — Sem `max_completion_tokens`:** a família gpt-5 conta tokens de raciocínio no limite e uma resposta truncada viraria JSON inválido. O custo é limitado por chamadas, por fatos/leads por chamada e pelo tamanho dos textos no prompt.
- **D11 — Plano/descrição do step:** o texto do plano em `agent-plan-generator.ts` não muda, para não mexer em teste de plano. Só a estimativa de custo ganha a parcela de IA.

## Code Map

- `src/lib/agent/steps/research-accounts-step.ts` (UPDATE, 1390 linhas). Estado atual:
  - `run` próprio, fail-open (`:306-354`): claim, `executeInternal` sob backstop `settleWithin(remaining+1s)` e `finalize` com 3 níveis de checkpoint;
  - `finalize` (`:382-457`): o fallback mínimo hoje tira `accounts` e `icebreakerPosts`; **também tirar `whyNow`**;
  - `executeInternal` (`:518-627`): lê os leads (`readLeads`, `:485`), agrupa (`groupLeads`), lê a chave Treg (saídas antecipadas com mensagem), monta o `RunState` (`:220-248`), resolve domínios, `mergeByDomain` e `researchAccountSafe` via `runPool`;
  - `researchAccount` (`:789-935`): o caminho de reuso (`:796-830`) só tem `factsCount`, não os fatos; o caminho novo tem `facts` em memória (`:891`) e grava com `saveDossier` (`:901-922`);
  - `bounded`/`remainingToDeadline`/`logUsage` (`:459-500`): usar nas esperas novas;
  - `buildResult` (`:1299-1337`) e `summaryText` (`:1339-1360`, `static`, chamado no `finalize`).

  **O que muda:** guardar em `RunState` os fatos por conta, rodar a fase `whyNow` depois do `runPool` de contas, incluir `whyNow` no output, `cost.openai_why_now` e o bloco de gatilhos no `summaryText`.

  **O que preservar:** todo o resto byte a byte, inclusive as mensagens antecipadas, os 3 níveis do `finalize`, o `STEP_ALREADY_RUNNING` e `icebreakerPosts`/`icebreakerPostsAttempted` (FEL-57/77, lidos pelo `create_campaign` em `create-campaign-step.ts:773-797`).
- `src/lib/agent/dossier/facts.ts:20` `DossierFact` (`kind`, `fato`, `fonte_url`, `data`, `confianca`, `lead_apollo_id?`, `lead_email?`), `:961` `isValidFact`, `DossierFactKind`/`DossierConfidence`.
- `src/lib/agent/dossier/repository.ts`:
  - `findReusableDossier` (`:34`) só conta os fatos;
  - **adicionar** `readDossierFacts(supabase, tenantId, dossierId)` → `{facts: DossierFact[], error?}`: SELECT `kind, fato, fonte_url, data, confianca, lead_apollo_id, lead_email`, filtrado por `dossier_id` e `tenant_id`, sem lançar (padrão de `findPostLeadIdentifiers`, `:166`). A RLS da 00073 já libera o SELECT por tenant.
- `src/lib/agent/dossier/config.ts`: `DOSSIER_CONFIG` (`hardDeadlineMs 240 s`, `timeBudgetMs 180 s`, `finalizeBudgetMs 15 s`). Adicionar `WHY_NOW_CONFIG` aqui.
- `src/lib/agent/dossier/budget.ts`: `CostBudget` (`tryReserve`/`settle`/`canReserve`). Reusar uma instância própria para o custo reservado da fase.
- Padrão LLM a copiar: `src/lib/agent/fit-scorer.ts` (OpenAI SDK, `AbortController` + timeout, `zod` `safeParse`, nunca lança, devolve `usage`) e `src/lib/ai/fit-score-config.ts` (modelo e request compat-safe, `isGpt5Family` de `src/lib/agent/parser-config.ts:37`). Log de uso: `src/lib/agent/steps/search-leads-step.ts:575-625` (`scoreSearchLeads` + `logAgentUsage`).
- KB/ICP: `src/lib/agent/contextual-suggestions.ts:44` `readTenantICP(tenantId)` (service-role, fail-open, devolve `painPoints` e `jobTitles`); `EMPTY_TENANT_ICP` em `src/lib/agent/icp-briefing.ts:29`.
- Chave: `src/lib/agent/service-keys.ts:119` `getServiceApiKeyOrNull`. O step já a usa para Apify/OpenAI no premium (`research-accounts-step.ts:564,587`); agora a OpenAI é lida também fora do premium, com `bounded`, e só quando houver ao menos uma conta com fato elegível.
- Tipos: `src/types/agent.ts:400-466` (`ResearchedAccount`, `ResearchAccountsFlags`, `ResearchAccountsOutput`). Adicionar `whyNow?: WhyNowOutput` e os tipos abaixo.
- Custo: `src/lib/agent/agent-pricing.ts:203` (case `research_accounts`); `src/lib/services/agent-cost-estimator.ts:168-200` (estimativa do research).
- UI (sem mudança de código): `src/components/agent/AgentMessageBubble.tsx` renderiza o texto do resumo com `whitespace-pre-wrap`.
- Testes existentes:
  - `__tests__/unit/lib/agent/steps/research-accounts-step.test.ts`;
  - `__tests__/unit/lib/agent/research-accounts-pipeline.test.ts` (orchestrator e `useAutoTrigger` reais com banco fake);
  - `__tests__/unit/lib/agent/dossier-posts-reuse-pipeline.test.ts`;
  - `__tests__/unit/lib/agent/dossier/*.test.ts`;
  - `__tests__/unit/lib/agent/fit-scorer.test.ts` (modelo de mock do `openai`);
  - `agent-pricing.test.ts`, `__tests__/unit/lib/services/agent-cost-estimator.test.ts`;
  - helpers `__tests__/helpers/mock-supabase.ts` e `queue-supabase.ts`.

## Tipos (contrato do output, para a 24.21 e a 24.22 consumirem)

```ts
// src/types/agent.ts
export type WhyNowNoTriggerReason =
  | 'disabled' | 'not_researched' | 'facts_unavailable' | 'no_eligible_facts'
  | 'no_openai_key' | 'call_limit' | 'budget' | 'time_budget'
  | 'llm_error' | 'timeout' | 'invalid_response' | 'llm_declined' | 'low_confidence';

export interface WhyNowSourceFact {
  ref: number;                       // índice na lista de fatos da conta enviada à LLM
  kind: 'news' | 'job' | 'post';
  fato: string; fonte_url: string; data: string; confianca: 'media' | 'alta';
}

export interface LeadWhyNow {
  leadIndex: number;                 // posição em readLeads(input)
  apolloId: string | null;
  email: string | null;              // minúsculo; para casar com o lead na 24.21
  companyDomain: string | null;
  dossierId: string | null;
  status: 'trigger' | 'no_trigger';
  reason?: WhyNowNoTriggerReason;    // só em no_trigger
  trigger?: {
    gatilho: string;                 // ≤ 240 caracteres. Revisão Codex 2: texto DETERMINÍSTICO do fato
                                     // de origem, "<Noticia|Vaga|Post>: <fato>"; nunca escrito pela LLM
    hipoteseDor: string;             // pergunta gerada pela LLM (persona + dores da KB), termina com "?",
                                     // sem URL/domínio, sem número ausente do fato, ≤ 240 caracteres
    confianca: 'media' | 'alta';
    fatoOrigem: WhyNowSourceFact;
  };
}

export interface WhyNowOutput {
  leads: LeadWhyNow[];               // 1 por lead de readLeads, na mesma ordem
  summary: { withTrigger: number; withoutTrigger: number; llmCalls: number; llmFailedCalls: number };
  kbPainsAvailable: boolean;
  flags: { disabled?: boolean; noOpenaiKey?: boolean; callLimitReached?: boolean;
           budgetExhausted?: boolean; timeBudgetExhausted?: boolean; unexpectedError?: boolean };
}
```

## Tasks / Subtasks

- [x] **T1 — Config** (AC 3)
  - [x] `src/lib/agent/dossier/config.ts`: adicionar `WHY_NOW_CONFIG`: `enabled: true`, `maxCallsPerExecution: 10`, `maxCostUsdPerExecution: 0.05`, `reservedUsdPerCall: 0.005`, `maxLeadsPerCall: 10`, `maxEligibleFactsPerCall: 15`, `maxContextFacts: 5`, `factMaxChars: 300`, `painPointsMaxChars: 1500`, `callTimeoutMs: 20_000`, `phaseBudgetMs: 45_000`, `minPhaseMs: 10_000`, `minCallMs: 3_000`, `concurrency: 3`, `summaryMaxLeads: 10`, `textMaxChars: 240`. Comentar que `timeBudgetMs` (180 s) + `phaseBudgetMs` (45 s) < `hardDeadlineMs` (240 s).
  - [x] `src/lib/ai/why-now-config.ts` (NOVO): `WHY_NOW_MODEL = "gpt-5.4-mini"` e `buildWhyNowRequest(messages)`, cópia do molde de `fit-score-config.ts` (json_object; `temperature` só fora da família gpt-5).
- [x] **T2 — Seletor puro + chamada** (AC 1, 2, 3): `src/lib/agent/dossier/why-now.ts` (NOVO):
  - [x] `eligibleFactsForAccount(facts, leads)`: devolve a lista indexada (`ref`) dos fatos elegíveis (D4), com o dono do post (`leadIdx`) quando `kind = 'post'`, cortada em `maxEligibleFactsPerCall` (mais recentes primeiro). Devolve também os fatos de contexto (`site`/`technology`, até `maxContextFacts`). Casar o lead do post por `apolloId` ou e-mail minúsculo.
  - [x] `buildWhyNowMessages({companyName, domain, contextFacts, eligibleFacts, leads:[{j, cargo}], icp})`: prompt de sistema constante (pt-BR, sem acentos, no estilo do `FIT_SCORE_SYSTEM_PROMPT`). Regras do prompt: escolher **um** fato da lista citando o `ref`; nunca inventar fatos, números ou nomes; gatilho de 1 frase observando o fato; hipótese de dor como **pergunta** ligada ao cargo e às dores do ICP; `ref: null` quando nenhum fato serve; JSON `{"leads":[{"j":0,"ref":3|null,"gatilho":"...","hipotese_dor":"...?","confianca":"baixa|media|alta"}]}`. Textos dos fatos cortados em `factMaxChars`. Sem nome e sem e-mail de lead.
  - [x] `parseWhyNowResponse(content, ctx)`: `zod` `safeParse` do envelope e de cada entrada. Aplicar as regras do intent-contract: `j` no intervalo e sem repetição; `ref` inteiro existente na lista elegível e, se for post, do mesmo lead; textos normalizados (espaços), não vazios e ≤ `textMaxChars`; hipótese terminando em `?`; guarda de números (todo `\d+` do gatilho e da hipótese aparece no `fato`); confiança final = mínimo com a do fato; `baixa` → `low_confidence`. Devolve, por lead, `trigger` ou `reason`. Lead sem entrada válida → `invalid_response`.
  - [x] `selectWhyNowForAccount({apiKey, ...})`: 1 chamada com `AbortController` + `setTimeout(timeoutMs)`; devolve `{results, attempted, succeeded, usage:{model, promptTokens, completionTokens, durationMs, errorMessage?}}`. Erro → `llm_error`; abort → `timeout`; JSON ou schema inválido → `invalid_response`. **Nunca lança.** O client OpenAI é injetável (factory padrão `new OpenAI({apiKey})`) para os testes.
- [x] **T3 — Repositório** (AC 1): `src/lib/agent/dossier/repository.ts`: adicionar `readDossierFacts` (somente leitura, nunca lança, devolve o erro). Não alterar as funções existentes.
- [x] **T4 — Integração no step** (AC 1–5): `src/lib/agent/steps/research-accounts-step.ts`:
  - [x] `RunState` ganha `accountFacts: Map<string, {domain, companyName, dossierId, facts: DossierFact[] | null, leads: SearchLeadResult[]}>`, preenchido em `researchAccount`:
    - caminho novo: só quando `saved.dossierId && !saved.error` (fato não gravado não vira gatilho);
    - caminho de reuso: `readDossierFacts` via `bounded`, mais os posts inseridos com sucesso; falha → `facts: null` (`facts_unavailable`).
  - [x] Guardar os leads da execução (`readLeads`) num campo da instância, para o `buildResult` montar `whyNow` também nas saídas antecipadas e no backstop (`not_researched`).
  - [x] Depois do `runPool` de contas no `executeInternal`: `await this.evaluateWhyNow(state)` dentro de try/catch próprio (exceção → `flags.unexpectedError` e leads pendentes `llm_error`). Passos da fase:
    - kill switch;
    - contas com ao menos 1 fato elegível;
    - checar `remainingToDeadline() ≥ minPhaseMs`;
    - ler a chave OpenAI (`bounded`, só se houver conta elegível) e o ICP (`bounded(readTenantICP)`, fallback `EMPTY_TENANT_ICP`);
    - `runPool(concurrency)` por conta, respeitando `maxCallsPerExecution`, `CostBudget(maxCostUsdPerExecution)` com `reservedUsdPerCall` e o prazo da fase (`min(start + phaseBudgetMs, deadlineAt - finalize margin)`);
    - timeout de cada chamada = `min(callTimeoutMs, prazo restante)`; não iniciar com menos de `minCallMs`;
    - cada chamada tentada → `this.logUsage({serviceName:"openai", requestType:"why_now_trigger", stepType:"research_accounts", status, calls:1, durationMs, errorMessage, metadata:{model, promptTokens, completionTokens, leads, eligibleFacts, triggers}})`.
  - [x] `buildResult`: incluir `output.whyNow` (sempre que houver leads) e `cost.openai_why_now` (chamadas tentadas). **Não alterar** os outros campos.
  - [x] `finalize`: no checkpoint mínimo, remover também `whyNow` (o nível 3 já não grava output).
  - [x] `summaryText`: quando `output.whyNow` existir e não estiver `disabled`, acrescentar o bloco abaixo. As saídas antecipadas que mandam a mensagem própria não mudam.
    ```
    Motivo para abordar agora: X de Y leads com gatilho.
    - <nome> (<cargo>, <empresa>): <gatilho> (fonte: <host da fonte_url>, <data>, confianca <media|alta>)
    - <nome> (<empresa>): sem gatilho, segue a copy padrao.
    ... e mais N leads.
    ```
    São até `summaryMaxLeads` linhas, com os leads com gatilho primeiro. Nome e cargo vêm do lead em memória e não vão ao output.
- [x] **T5 — Tipos** (AC 1): `src/types/agent.ts`: adicionar os tipos de "Tipos (contrato do output)" e `whyNow?: WhyNowOutput` em `ResearchAccountsOutput`.
- [x] **T6 — Custo** (NFR3/NFR4): `src/lib/agent/agent-pricing.ts` (case `research_accounts`): `+ count(cost, "openai_why_now") * prices.openai`. `src/lib/services/agent-cost-estimator.ts`: somar `min(leads, WHY_NOW_CONFIG.maxCallsPerExecution) × prices.openai` à estimativa do research (zero quando o research é pulado, sem chave Treg ou com `enabled=false`), com o trecho "+ até N chamadas de IA (motivo para abordar agora)" na descrição.
- [x] **T7 — Testes (sem rede real)** (todas as linhas da matriz):
  - [x] `__tests__/unit/lib/agent/dossier/why-now.test.ts` (NOVO): elegibilidade (D4; post de outro lead; `baixa` fora), prompt sem nome/e-mail, parser (cada linha de validação da matriz), confiança mínima, guarda de números, timeout (fake timers), erro, JSON inválido. `vi.mock("openai")` como em `fit-scorer.test.ts`.
  - [x] `__tests__/unit/lib/agent/dossier/repository.test.ts`: `readDossierFacts` ok, erro e exceção.
  - [x] `__tests__/unit/lib/agent/steps/research-accounts-step.test.ts`:
    - Feliz, Só baixa (zero chamadas e zero logs), Reuso, Sem chave OpenAI, Erro/timeout, Teto de chamadas/custo, Teto de tempo (relógio injetado), Kill switch, Pesquisa pulada (mensagens antecipadas idênticas), Exceção inesperada e Checkpoint mínimo sem `whyNow`;
    - log `why_now_trigger` por chamada;
    - `cost.openai_why_now`;
    - texto do resumo.
    - Atualizar as expectativas de texto e output existentes **somente** onde o bloco novo aparece.
  - [x] `__tests__/unit/lib/agent/research-accounts-pipeline.test.ts`: com `whyNow` no output, o `previousStepOutput` do `create_campaign` é deep-equal ao de uma execução com a fase desligada. Com a LLM pendurada (fake timers), o step termina dentro do pior caso de hoje (≤ 256 s) e o `create_campaign` dispara.
  - [x] `__tests__/unit/lib/agent/dossier-posts-reuse-pipeline.test.ts`: segue verde sem mudar expectativa (`icebreakerPosts` lido igual com `whyNow` presente).
  - [x] `agent-pricing.test.ts` e `agent-cost-estimator.test.ts`: parcela nova.
- [x] **T8 — Verificação e Regra nº 1** (obrigatório antes de dar por concluída):
  - [x] `npm run lint` (0 erros), `npm run typecheck`, `npm run test:run`, todos verdes.
  - [x] `git diff main -- src/lib/agent/steps/export-step.ts src/lib/agent/steps/activate-step.ts src/lib/agent/steps/create-campaign-step.ts src/lib/services/instantly.ts src/lib/agent/orchestrator.ts supabase/` → **vazio**, e os testes desses arquivos sem mudança de expectativa.
  - [x] Preencher as **Completion Notes da Regra nº 1** (checklist abaixo).
  - [x] Como a fase roda dentro do `research_accounts`, que está **no caminho até o Instantly** (Regra nº 1, ponto 3), registrar em `operator_actions` o pedido de OK do Fabossi antes do merge e do deploy.
  - [ ] No Linear, mover a FEL-43 para **Precisa Felipe** com o label `precisa-felipe` e comentar branch, SHA e checks. Não marcar Done. **(Não feito pelo agente: a sessão proibiu mexer no Linear e dar push. Fica para o Fabossi/orquestrador; está em `operator_actions`.)**

### Checklist das Completion Notes (Regra nº 1 do AGENTS.md/CLAUDE.md)

- [x] **O que pode ter mudado para o cliente:** listar arquivos, rotas (esperado: nenhuma), prompts (esperado: prompt novo só do gatilho, constante em código; nenhum prompt do `create_campaign` alterado), tabelas (esperado: nenhuma nova; só leitura de `account_dossier_facts`), jobs (nenhum), integrações (OpenAI do tenant, com chamada nova no `research_accounts`) e a mensagem-resumo do research com o bloco novo.
- [x] **Ponto 1 — campanhas rodando, webhook e `reply-sweep`:** confirmar por análise da diff que nada desses caminhos foi tocado.
- [x] **Ponto 2 — busca de leads:** confirmar que `search_companies`/`search_leads` não foram tocados.
- [x] **Ponto 3 — criação, export e ativação:** diff vazia nos arquivos de T8, deep-equal do `previousStepOutput` do `create_campaign`, nenhum lead filtrado e o pior caso de tempo do research inalterado.
- [x] **Dizer qual verificação foi feita:** análise da diff + testes mockados. Nesta story não há smoke real (proibido); o smoke fica para depois do OK do Fabossi.
- [x] **Risco no ponto 3:** a fase acrescenta latência (estimada em ~5–15 s no caso feliz) antes do `create_campaign`, mas dentro do prazo duro existente. Registrar isso e **parar para o OK do Fabossi** (operator_actions) antes do merge.

## Dev Notes

### Guardrails de arquitetura

- **Pipeline determinístico (NFR1):** a LLM escolhe só conteúdo (qual fato vira gatilho e a pergunta de dor). Ela não decide steps, gasto nem envio, e o resultado não altera nenhuma decisão do pipeline.
- **Fail-safe (NFR9):** o padrão é o do `fit-scorer.ts`: nunca lança, devolve `attempted/succeeded/usage`, e o step loga.
- **Custo (NFR3/NFR4):** 1 linha `api_usage_logs` por chamada tentada, com tenant e `metadata.executionId` (via `logAgentUsage`), e teto no nosso código.
- **Tempo:** pior caso atual do research ≈ 256 s (240 s de prazo duro + 1 s + 15 s de fechamento), abaixo dos 300 s da rota. A fase **não pode** passar do `deadlineAt` existente. Usar `this.bounded(...)`/`settleWithin`, nunca `await` cru de rede ou banco.
- **Tamanho do output:** o `create_campaign` lê o `output` inteiro do research (`loadDossierPosts`, com timeout próprio). Manter `whyNow` compacto: sem nome, sem cargo e sem texto da LLM além do gatilho e da hipótese.

### Armadilhas conhecidas (da 24.19 e das revisões do Codex)

- Não usar `BaseStep.run`: o `ResearchAccountsStep` tem `run` próprio. Não mudar a visibilidade nem o comportamento da `BaseStep`.
- `summaryText` é `static` e é chamado no `finalize` com o output já montado. O bloco de gatilhos precisa de nome e cargo, que **não** estão no output. Passar um mapa auxiliar (por exemplo, um campo de instância com os leads da execução) ou montar o texto antes. Não gravar nome nem cargo no output.
- Leads importados (`skipSteps` com as duas buscas) vêm de `briefing.importedLeads`, pelo mesmo `readLeads`; o `leadIndex` se refere a essa lista.
- Um mesmo domínio pode juntar grupos (`mergeByDomain`); use `account.leads` do resolvido.
- E-mail com maiúsculas: compare sempre em minúsculo (lição da 24.19).

### Testes

- Vitest, mocks em `__tests__/helpers`. `vi.mock("openai")` com `chat.completions.create` controlado. Fake timers para timeout e prazo. Relógio injetável via `ResearchAccountsDeps.clock`.
- Nenhum teste toca rede (OpenAI, Treg, Apify, Instantly, Supabase).

### Project Structure Notes

- Arquivos novos: `src/lib/agent/dossier/why-now.ts` (junto do dossiê) e `src/lib/ai/why-now-config.ts` (junto de `fit-score-config.ts`/`copy-review-config.ts`).
- Arquivos alterados: `research-accounts-step.ts`, `dossier/config.ts`, `dossier/repository.ts`, `types/agent.ts`, `agent-pricing.ts`, `agent-cost-estimator.ts` e os testes.
- Nenhum conflito com a estrutura atual.

### Pesquisa técnica

- Nenhuma lib nova: `openai` e `zod` já estão no projeto e em uso no `fit-scorer.ts`. O modelo `gpt-5.4-mini` é o mesmo do Fit Score, já validado em produção na 24.16 (sem `temperature` na família gpt-5). Não foi preciso pesquisa web.

### Git

- A base é `main` em 544d052, no branch `feat/fel-43-motivo-para-abordar-agora`. Commits recentes relevantes: FEL-77 (`linkedinUrl` do Apollo no icebreaker premium), FEL-57 (posts do research reaproveitados no `create_campaign`, a única leitura do output do research pelo create) e a 24.19 (PR #22, `a0507b8`).

### References

- [Source: _bmad-output/planning-artifacts/epics-23-25-plataforma-agente-3.0-radar.md#Story 24.20] (FR34, NFR1, NFR3, NFR4, NFR9, UX-DR6)
- [Source: _bmad-output/implementation-artifacts/epic-24-context.md] (fail-safe, custo, honestidade da copy)
- [Source: _bmad-output/implementation-artifacts/spec-24-19-dossie-da-conta.md] (ciclo fail-open, prazo duro, Code Map, Spec Change Log, smoke de 2026-11-03)
- [Source: CLAUDE.md#Regra nº 1]
- [Source: src/lib/agent/fit-scorer.ts], [Source: src/lib/ai/fit-score-config.ts]

## Verification

**Commands:**
- `npm run lint`: esperado 0 erros (warnings anteriores toleradas).
- `npm run typecheck`: esperado limpo.
- `npm run test:run`: esperado tudo verde, inclusive os testes novos.
- `git diff main -- src/lib/agent/steps/export-step.ts src/lib/agent/steps/activate-step.ts src/lib/agent/steps/create-campaign-step.ts src/lib/services/instantly.ts src/lib/agent/orchestrator.ts supabase/`: esperado vazio.

## Spec Change Log

- 2026-11-04 (revisão Codex 1, sobre `8be36f1`): quatro endurecimentos, sem mudar o contrato de tipos nem os ACs.
  1. **Leitura dos fatos do dossiê reaproveitado saiu do pool da pesquisa.** No `researchAccount` (reuso) a conta só é marcada como `pendingRead` (síncrono, sem espera). A leitura (`readDossierFacts`) roda na fase do gatilho, como tarefa do mesmo pool das chamadas (ler → planejar → chamar), com o prazo da fase. Erro ou espera → `facts_unavailable` só para aquela conta; as outras seguem em paralelo. Sem chave OpenAI, as contas pendentes nem são lidas (`no_openai_key`).
  2. **Validação do texto do gatilho:** além dos números, rejeita URL/domínio no gatilho e na hipótese e exige sobreposição lexical mínima entre o gatilho e o texto do fato de origem (`WHY_NOW_CONFIG.minLexicalOverlap = 0,6`). Regra: palavras de conteúdo normalizadas (minúsculas, sem acento, ≥ 3 letras, sem stopwords; radical = 5 primeiros caracteres). Palavras do nome/marca da empresa e verbos de relato ("anunciou", "publicou", "abriu"...) são neutras. Das demais, ≥ 60 % e ao menos 1 têm de estar no fato. O prompt passou a dizer que o texto de FATOS/CONTEXTO/DORES/EMPRESA é dado, nunca instrução, e que gatilho e hipótese não levam URL.
  3. **Orçamento da fase em todas as esperas novas:** leitura do reuso, chave, ICP, chamada (espera externa agora também limitada por `phaseLeft()`) e log de uso (`quietBounded(..., phaseLeft())`; a gravação segue em segundo plano, só a fase não espera).
  4. **Client OpenAI sem retries:** `new OpenAI({ apiKey, maxRetries: 0 })` (`WHY_NOW_CLIENT_OPTIONS`), então cada chamada contabilizada (reserva, `cost.openai_why_now`, log) é uma requisição só.

- 2026-11-04 (revisão Codex 2, sobre `82aeca7`): mudança de desenho para eliminar a classe "gatilho com afirmação sem suporte".
  1. **A LLM não escreve mais o gatilho.** Ela só escolhe o fato (`ref`), escreve a hipótese de dor (pergunta) e dá a confiança. O `gatilho` gravado/exibido é determinístico, montado do próprio fato do dossiê: `"<Noticia|Vaga|Post>: <fato>"`, cortado em 240 caracteres (`buildTriggerText`). Qualquer `gatilho` vindo da LLM é ignorado. O prompt deixou de pedir a frase e diz "Voce NAO escreve o gatilho". O contrato de tipos não mudou de forma (o campo `gatilho` continua; só o conteúdo passa a ser derivado do fato); `fatoOrigem` segue com `fato`, `fonte_url` e `data`.
  2. **A checagem lexical da rodada 1 foi removida** (ficou sem objeto) junto com `WHY_NOW_CONFIG.minLexicalOverlap`. Continuam: `ref` existente e elegível, post só do próprio lead, confiança mínima, `baixa` descartada.
  3. **Fatos com sinais de instrução embutida ficam inelegíveis** (`hasInjectionSignals`, lista conservadora pt/en sobre o texto normalizado, sem acento e case-insensitive: "ignore", "desconsidere", "instruc*", "diga que", "responda", "system", "assistant", "you are", "voce e um", "as an ai", "prompt*", "regras anteriores", "escreva no"...). Eles não viram gatilho e não vão à LLM, nem como contexto. O fato continua gravado no dossiê (24.19 inalterada). Falso positivo só tira o fato do gatilho, o lado seguro.
  4. **Hipótese de dor:** continua pergunta, sem URL/domínio, sem número ausente do fato, ≤ 240 caracteres.

## Review Triage Log

- **Revisão Codex 1 (commit `8be36f1`), veredito "PRECISA CORRIGIR":**
  - `[patch]` Leitura adicional de fatos do reuso dentro do pool da pesquisa (podia ocupar um worker até o prazo duro e mudar a 24.19). → Corrigido (item 1 do Spec Change Log). Regressão: leitura pendurada com `accountConcurrency = 1` e outra conta na fila; campos da 24.19 idênticos aos da fase desligada; a conta seguinte é pesquisada e recebe gatilho.
  - `[patch]` Gatilho com afirmação sem suporte (só números checados) e URL inventada aceitos; prompt injection podia gerar conteúdo aceito. → Corrigido (item 2). Regressões: fabricação ("sofreu vazamento de dados" para fato de vagas), URL/domínio no gatilho e na hipótese, prompt injection dentro do texto de um fato (prompt trata como dado; as saídas induzidas são descartadas).
  - `[patch]` Log de uso e leitura do reuso fora do orçamento de 45 s. → Corrigido (item 3). Regressões com fake timers: leitura pendurada e log pendurado; o step termina em ≤ 45 s.
  - `[patch]` Retries padrão do SDK (até 3 requisições por chamada contabilizada). → Corrigido (item 4). Teste: o client é criado com `{ apiKey, maxRetries: 0 }`.
  - `[ok]` Isolamento do caminho até o Instantly, isolamento de tenant na leitura e escape no chat: sem ação.
- **Revisão Codex 2 (commit `82aeca7`), veredito "PRECISA CORRIGIR" (bloqueios 1, 3 e 4 resolvidos; o 2 seguia aberto):**
  - `[patch]` Sobreposição lexical aceita afirmação inventada ("Banco X demitiu novo CISO." sobre "Banco X anuncia 300 vagas e novo CISO"). → Corrigido por desenho: o gatilho é o texto do fato; a LLM não escreve afirmação. Regressão: as frases "Banco X demitiu novo CISO.", "Empresa sofreu ataque hacker." e uma com URL nunca aparecem no resultado; o gatilho é sempre `Noticia: <fato>`.
  - `[patch]` Instrução embutida na fonte promovida a evidência ("Empresa sofreu ataque hacker." sobre o fato malicioso). → Corrigido: fato com sinal de injeção fica inelegível e não vai à LLM. Regressões: o fato malicioso do teste vira inelegível (sem chamada, sem gatilho); com um fato legítimo junto, só o legítimo vai ao prompt; no step, notícia maliciosa do Treg → zero chamadas, `no_eligible_facts`, fato ainda gravado no dossiê.
  - `[ok]` Ressalva do Codex sobre custo: US$ 0,05 é teto de reserva contábil (sem limite de tokens de saída, decisão D10), não garantia de cobrança máxima. Registrado; sem mudança.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), Claude Code, workflow bmad-dev-story em modo não interativo (2026-11-04, máquina Eden).

### Debug Log References

- `npm run lint`: 0 erros, 134 warnings (o mesmo número da base `b627e71`; nenhum warning novo nos arquivos tocados).
- `npm run typecheck`: limpo.
- `npm run test:run`: 469 arquivos, 9252 testes passando, 2 pulados (já pulados antes), 0 falhas.
- `git diff --stat 544d052..HEAD -- src/lib/agent/steps/export-step.ts src/lib/agent/steps/activate-step.ts src/lib/agent/steps/create-campaign-step.ts 'src/lib/services/instantly*.ts' src/lib/agent/orchestrator.ts supabase/`: vazio.
- Nenhuma rede real em teste: OpenAI (SDK `openai` mockado e client injetado), Treg, Apify, Supabase (fakes), chaves, ICP e log de uso mockados. Nada foi rodado contra o `.env.local`.

### Completion Notes List

- Story criada pelo workflow create-story em modo não interativo (2026-11-04): análise de contexto completa e guia de implementação para o dev. As decisões estão em "Decisões tomadas sem humano".
- **Implementação (2026-11-04):** fase "motivo para abordar agora" como etapa final, fail-open, do `executeInternal` do `research_accounts` (D1), depois do `runPool` das contas. Resultado em `output.whyNow` (D2), contrato de tipos exatamente como na seção "Tipos". Sem migration, sem tabela/coluna nova, nada em `supabase/`.
  - `src/lib/agent/dossier/why-now.ts` (novo): `eligibleFactsForAccount` (D4; post só do próprio lead por `apolloId`/e-mail minúsculo; mais recentes primeiro; corte em `maxEligibleFactsPerCall`; fatos repetidos entram uma vez), `planAccountCall` (leads com fato elegível até `maxLeadsPerCall`, `noEligible`, `overLimit`, posts reindexados no espaço do `j`), `buildWhyNowMessages` (prompt constante, D8; cargo e empresa, nunca nome/e-mail), `parseWhyNowResponse` (todas as regras do intent-contract) e `selectWhyNowForAccount` (1 chamada, `AbortController`, nunca lança, client injetável).
  - `src/lib/ai/why-now-config.ts` (novo): `gpt-5.4-mini`, `json_object`, sem `temperature` na família gpt-5, sem `max_completion_tokens` (D10).
  - `WHY_NOW_CONFIG` em `dossier/config.ts` com os valores do T1 e o kill switch (D9).
  - `readDossierFacts` em `dossier/repository.ts` (só leitura, nunca lança). Funções existentes inalteradas.
  - Step: `RunState.accountFacts` (caminho novo só com `saved.dossierId && !saved.error`; reuso via `readDossierFacts` + posts gravados agora, falha → `facts_unavailable`), leads da execução em campo de instância, `evaluateWhyNowSafe` (try/catch próprio → `flags.unexpectedError`, pendentes `llm_error`), `buildWhyNow` (também nas saídas antecipadas e no backstop: `not_researched`; interrompido no meio da fase: `time_budget`), `cost.openai_why_now`, fallback mínimo sem `whyNow` e o bloco no `summaryText`.
  - Custo: `agent-pricing.ts` (+ `openai_why_now × openai`) e `agent-cost-estimator.ts` (+ `min(leads, 10) × openai`, zero com o research pulado, sem chave Treg ou `enabled=false`; trecho "+ até N chamadas de IA (motivo para abordar agora)" na descrição). Texto do plano inalterado (D11).
- **Decisões de implementação (conservadoras, dentro do spec):**
  - As esperas da fase usam `quietBounded`, que limita pelo prazo duro (e pelo prazo da fase) como o `bounded`, mas **não** marca `timeBudgetExhausted` nas flags da 24.19. Assim a fase nunca muda `flags` do output da pesquisa (Boundaries). Os tempos da fase vão só para `whyNow.flags`.
  - A chave OpenAI só é lida quando há ao menos uma conta com fato elegível; o ICP, só depois da chave. Sem conta elegível: zero leituras extras e zero chamadas.
  - Prazo da fase = `min(início + phaseBudgetMs, deadlineAt)`. Timeout de cada chamada = `min(callTimeoutMs, prazo restante da fase)`; a chamada não começa com menos de `minCallMs`; a espera é também limitada por `settleWithin(timeout + 1 s, restante até o prazo duro)`, então uma LLM que ignora o abort não segura o step (teste de pipeline com fake timers: termina em ≈ 21 s e o `create_campaign` dispara).
  - Custo reservado: `CostBudget` próprio da fase com `reservedUsdPerCall`; o acerto usa o reservado (o custo real em US$ não é conhecido no step). O custo em BRL entra pelo `cost.openai_why_now` × preço de IA, como as outras chamadas de IA.
  - Leads além de `maxLeadsPerCall` também marcam `whyNow.flags.callLimitReached`.
  - `cost.openai_why_now` sempre presente (0 sem chamada).
  - Guarda de números: cada sequência de dígitos do gatilho e da hipótese tem de existir como sequência inteira no texto completo do fato de origem (da memória).
  - Texto/limite: gatilho ou hipótese acima de `textMaxChars` são descartados (`invalid_response`), não truncados (truncar tiraria o "?").
  - `j` repetido: vale a primeira entrada. `j` fora do intervalo: ignorado.
  - Seams de teste no `ResearchAccountsDeps`: `whyNowClient` (factory do client OpenAI) e `readIcp` (padrão `readTenantICP`). Sem efeito em produção.
  - Leitura extra no reuso: 1 `SELECT` em `account_dossier_facts` por conta reaproveitada (só com `enabled=true`), depois de ligar os leads, com prazo limitado e sem tocar nas flags.
- **Testes:** novos `__tests__/unit/lib/agent/dossier/why-now.test.ts` (31 testes) e blocos novos em `research-accounts-step.test.ts` (22 testes, todas as linhas da matriz), `repository.test.ts` (3), `research-accounts-pipeline.test.ts` (2: deep-equal do `previousStepOutput` com e sem a fase; LLM pendurada com fake timers), `agent-pricing.test.ts` (1) e `agent-cost-estimator.test.ts` (1). `dossier-posts-reuse-pipeline.test.ts` passou sem nenhuma mudança.
  - Mudanças em testes existentes, **somente** onde a parcela nova aparece: `cost` exato com `openai_why_now: 0` (3 asserções no step), valores da estimativa do research com `+ min(leads, 10) × openai` (`agent-cost-estimator.test.ts` e 1 asserção em `__tests__/unit/api/agent/execution-plan.test.ts`). Infra de teste: o mock de `@/lib/agent/dossier/config` ganhou `WHY_NOW_CONFIG`; `openai` e `contextual-suggestions` mockados; o fake do banco ganhou `storedFacts`; o teste de pipeline ganhou `dossierIds` e mocks nomeados das chaves/LLM.
  - Não coberto por teste: o kill switch no estimador (lê a constante real; o ramo é uma linha).

- **Revisão Codex 1 (2026-11-04):** os 4 bloqueios foram corrigidos (ver Spec Change Log e Review Triage Log). Testes novos: 8 em `why-now.test.ts` (fabricação, parafrase aceita/recusada, URL/domínio ×4, prompt injection, limiar lexical, `maxRetries: 0`) e 3 em `research-accounts-step.test.ts` (leitura pendurada fora do pool, leitura pendurada ≤ 45 s, log pendurado ≤ 45 s). Infra: o fake do banco ganhou `storedFactsHang`; o mock de config ganhou `minLexicalOverlap`. Checks: lint 0 erros (134 warnings, igual à base), typecheck limpo, `test:run` 469 arquivos, 9263 testes passando, 2 pulados.
- **Risco residual da validação do texto (registrado a pedido da revisão):** a sobreposição lexical **não prova veracidade**. Ela só impede que o gatilho traga assunto que o texto do fato não tem. Uma afirmação que está literalmente no texto da fonte (inclusive uma injeção escrita na própria notícia ou post) passa, porque é o que a fonte diz; o fato de origem e a `fonte_url` vão juntos para conferência. A hipótese de dor é **pergunta**, não afirmação, e não exige sobreposição (só sem URL e com números do fato). O limiar 0,6 é conservador e gera falsos negativos (parafrase que troca o vocabulário vira `invalid_response`), o que é o lado seguro.

- **Revisão Codex 2 (2026-11-04):** gatilho determinístico, LLM restrita a `ref` + hipótese + confiança, fatos com instrução embutida inelegíveis, checagem lexical removida (ver Spec Change Log). A nota de "risco residual da validação do texto" da rodada 1 fica **superada** para o gatilho: ele não pode mais conter nada além do texto do fato. Testes: `why-now.test.ts` 52 (gatilho determinístico ×3 frases fabricadas, prefixos e corte, prompt sem a frase, fato malicioso inelegível sem chamada, fato legítimo + malicioso, 10 casos de `hasInjectionSignals`, hipótese com número/URL/domínio/vazia/ausente/longa); `research-accounts-step.test.ts` 83 (feliz com o gatilho do fato; notícia maliciosa do Treg sem chamada). Checks: lint 0 erros (134 warnings, igual à base), typecheck limpo, `test:run` 469 arquivos, 9277 testes passando, 2 pulados.
- **Hipótese de dor (registro pedido pela revisão Codex 2):** é **hipótese** em forma de **pergunta**, gerada pela LLM a partir do cargo do lead (persona) e das dores do ICP da KB, ligada ao fato escolhido. **Não é afirmação sobre a conta.** As guardas são: termina com "?", sem URL/domínio, sem número ausente do fato, ≤ 240 caracteres. Nesta story ela **não vai para nenhum e-mail**: só fica em `output.whyNow` (o resumo do chat mostra o gatilho, não a hipótese). O uso na copy é da 24.21, que passa pelo revisor da 24.9, que checa afirmações contra o dossiê.
- **Risco residual do gatilho:** o texto é o da fonte, então diz exatamente o que a notícia/vaga/post diz (pode estar errado se a fonte estiver), sempre com `fonte_url` e data. Um fato malicioso que escape da lista de sinais aparece como "Noticia: <texto da fonte>", nunca como afirmação nossa; a lista é conservadora e pode tirar fatos legítimos do gatilho.

#### Regra nº 1 — checklist

- **O que pode ter mudado para o cliente:**
  - Arquivos de produção: `src/lib/agent/steps/research-accounts-step.ts`, `src/lib/agent/dossier/{why-now.ts (novo), config.ts, repository.ts}`, `src/lib/ai/why-now-config.ts` (novo), `src/types/agent.ts`, `src/lib/agent/agent-pricing.ts`, `src/lib/services/agent-cost-estimator.ts`.
  - Rotas: nenhuma alterada. A rota do plano (`/api/agent/executions/[id]/plan`) mostra a estimativa do research com até 10 chamadas de IA a mais (≈ R$ 0,20 com o preço padrão) e o trecho novo na descrição.
  - Prompts: um prompt novo, só do gatilho, constante em código (`WHY_NOW_SYSTEM_PROMPT`). Nenhum prompt do `create_campaign`, nenhum `ai_prompts`/`promptManager` alterado.
  - Tabelas: nenhuma nova, nenhuma coluna nova, nenhuma escrita nova. Só leitura de `account_dossier_facts` (reuso). Escritas: o jsonb `agent_steps.output` da linha `research_accounts` ganha `whyNow` e o `cost` ganha `openai_why_now`; `api_usage_logs` ganha 1 linha `why_now_trigger` por chamada (via `logAgentUsage`, como as outras).
  - Jobs: nenhum (`pg_cron`, Edge Functions, secrets, env intocados).
  - Integrações: OpenAI do tenant (`getServiceApiKeyOrNull(tenantId, "openai")`), com 1 chamada nova por conta com fato elegível, até 10 por execução, sem retries automáticos (`maxRetries: 0`, revisão Codex 1).
  - Chat: a mensagem-resumo do research ganha o bloco "Motivo para abordar agora" (até 10 linhas). As mensagens antecipadas ("pesquisa pulada...") não mudam.
- **Ponto 1 — campanhas rodando, webhook e `reply-sweep`:** OK por **análise da diff**. Nenhum arquivo de webhook, `reply-sweep`, Instantly, Edge Function ou `pg_cron` foi tocado; a mudança só roda dentro do `research_accounts` de execuções novas do agente.
- **Ponto 2 — busca de leads:** OK por **análise da diff**. `search_companies`/`search_leads` (e Apollo/TheirStack) não foram tocados; o único arquivo compartilhado alterado é o estimador de custo (texto/valor da etapa research).
- **Ponto 3 — criação, export e ativação:** OK por **análise da diff + testes mockados**. Diff vazia em `export-step.ts`, `activate-step.ts`, `create-campaign-step.ts`, `src/lib/services/instantly*.ts`, `orchestrator.ts` e `supabase/`; os testes desses arquivos passam sem mudança de expectativa. Teste de pipeline (orchestrator e `useAutoTrigger` reais) prova `previousStepOutput` do `create_campaign` deep-equal com e sem a fase; nenhum lead filtrado, reordenado ou bloqueado; `icebreakerPosts`/`icebreakerPostsAttempted` inalterados (`dossier-posts-reuse-pipeline` sem mudança). Pior caso de tempo do step inalterado (todas as esperas da fase correm contra o prazo duro de 240 s; os testes de "tudo pendurado" seguem ≤ 256 s).
- **Qual verificação foi feita:** análise da diff + testes mockados. **Não houve smoke real** (proibido nesta story e nesta sessão); o smoke fica para depois do OK do Fabossi (em `operator_actions`).
- **Risco no ponto 3 (parar para o OK do Fabossi):** a fase acrescenta latência antes do `create_campaign` (≈ 5–15 s no caso feliz; no máximo `phaseBudgetMs` = 45 s, sempre dentro do prazo duro existente) e uma chamada de IA por conta com fato elegível no tenant. O pedido de OK está em `operator_actions`; **não fazer merge nem deploy sem o OK do Fabossi.**

- **Smoke real em produção (2026-11-05, depois do merge `b878995`):** execução `4441313f-703a-4725-a953-087817c90c88`, busca "CISO de São Paulo" com 2 leads.
  - O resumo do research mostrou o bloco "Motivo para abordar agora", com 1 de 2 leads com gatilho.
  - nstech (dossiê reaproveitado): o gatilho é o próprio fato, uma notícia de 2026-10-27, com `fonte_url` e confiança média (a do fato era alta e ficou o menor valor). A hipótese de dor saiu como pergunta.
  - RTM: conta sem domínio, pulada pela pesquisa (`no_domain`); o lead ficou `not_researched`.
  - 1 linha `why_now_trigger` em `api_usage_logs`, com sucesso e 1,5 s.
  - O `create_campaign` seguiu normal e o output dele não contém `whyNow`.
  - O step "Criação de Campanha" foi aprovado por engano, e o export criou um rascunho no Instantly (`c79a9844-1e27-4632-a09e-21929b28f5e9`), nunca ativado; a execução foi cancelada. O Fabossi apaga esse rascunho no Instantly.

### File List

- `src/lib/agent/dossier/why-now.ts` (novo)
- `src/lib/ai/why-now-config.ts` (novo)
- `src/lib/agent/dossier/config.ts`
- `src/lib/agent/dossier/repository.ts`
- `src/lib/agent/steps/research-accounts-step.ts`
- `src/types/agent.ts`
- `src/lib/agent/agent-pricing.ts`
- `src/lib/services/agent-cost-estimator.ts`
- `__tests__/unit/lib/agent/dossier/why-now.test.ts` (novo)
- `__tests__/unit/lib/agent/dossier/repository.test.ts`
- `__tests__/unit/lib/agent/steps/research-accounts-step.test.ts`
- `__tests__/unit/lib/agent/research-accounts-pipeline.test.ts`
- `__tests__/unit/lib/agent/agent-pricing.test.ts`
- `__tests__/unit/lib/services/agent-cost-estimator.test.ts`
- `__tests__/unit/api/agent/execution-plan.test.ts`
- `_bmad-output/implementation-artifacts/spec-24-20-motivo-para-abordar-agora.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (só a linha 24-20)

### Change Log

- 2026-11-04: implementação da 24.20 (fase "motivo para abordar agora" no `research_accounts`, tipos, custo e testes). Status → review.
- 2026-11-04: correções da revisão Codex 1 (leitura do reuso na fase, validação lexical/URL e prompt anti-injeção, orçamento da fase em todas as esperas, `maxRetries: 0`). Status segue review.
- 2026-11-04: correções da revisão Codex 2 (gatilho determinístico a partir do fato, LLM só escolhe `ref`/hipótese/confiança, fatos com instrução embutida inelegíveis, checagem lexical removida). Status segue review.
- 2026-11-05: PR #28 mergeado (`b878995`), deploy em produção e smoke real OK. Status → done.
