---
baseline_commit: c7f4beb
---
# Story 21.3: Classificação de Intenção por IA

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Sequência do épico (revisada 2026-07-13):** 21.1 → 21.2 → 21.6 → **21.3** → 21.4 → 21.5 → 21.7. As três anteriores estão `done`. Esta story adiciona a **camada de inteligência** sobre as oportunidades `source='reply'` já ingeridas pela 21.2: classifica a intenção por IA, faz ensemble com o sinal nativo do Instantly, atualiza o status do lead e registra o custo. Roda **antes** da Central (21.4), que renderiza a `intent` como badge.

## Story

As a usuário,
I want que cada resposta seja classificada automaticamente por intenção,
so that eu saiba imediatamente quais respostas são leads quentes e quais são descarte.

## Acceptance Criteria

1. **Given** uma oportunidade `source='reply'` com `reply_text` e `intent` nulo **When** a classificação roda **Then** a IA (gpt-4o-mini, novo prompt `reply_intent_classification` no padrão `ai_prompts`) preenche `intent` com um de: `interessado`/`pediu_info`/`objecao`/`nao_agora`/`opt_out`

2. **Given** o Instantly forneceu `lt_interest_status` para o lead **When** a classificação roda **Then** o valor é gravado na oportunidade **And** normalizado para int na ingestão (o código existente tipa como string — `src/types/tracking.ts:175,322`; parse explícito com teste) **And** em divergência com a IA (ex.: IA=`interessado`, Instantly=Not Interested), prevalece a IA e a divergência é logada (ensemble — FR4)

3. **Given** a classificação resulta `interessado` ou `pediu_info` **Then** o status do lead é atualizado para `interessado` automaticamente (FR5) **And** `opt_out` marca o lead como `nao_interessado` **And** `objecao`/`nao_agora` não alteram status

4. **Given** a chamada de IA falha **Then** a oportunidade permanece com `intent` nulo e visível (fail-open — NFR1) **And** retry na próxima execução do processador

5. **Given** cada chamada de classificação **Then** custo estimado é registrado em `api_usage_logs` (NFR6)

6. **Given** respostas sem texto (payload antigo sem `reply_text`) **Then** a classificação usa apenas `lt_interest_status` se disponível, senão mantém `intent` nulo

7. Testes unitários para o classificador (mock OpenAI), regras de ensemble e transições de status

## Tasks / Subtasks

- [x] **Task 1: Registrar o prompt key `reply_intent_classification` (AC: #1)**
  - [x] 1.1 Em `src/types/ai-prompt.ts`, adicionar o literal `"reply_intent_classification"` em **TRÊS lugares** (senão o tipo/validação rejeitam a key — ver Dev Notes "Registrar uma nova prompt key"): (a) union `PromptKey` [ai-prompt.ts:68-80]; (b) array `PROMPT_KEYS` [ai-prompt.ts:85-98]; (c) `promptKeySchema = z.enum([...])` [ai-prompt.ts:177-190]. Espelhar exatamente como `monitoring_relevance_filter` foi adicionado.
  - [x] 1.2 Em `src/lib/ai/prompts/defaults.ts`, adicionar a entrada `reply_intent_classification` a `CODE_DEFAULT_PROMPTS` **espelhando `monitoring_relevance_filter` [defaults.ts:828-867]**: `{ template, modelPreference: "gpt-4o-mini", metadata: { temperature: 0.2, maxTokens: 150 } }`. O template deve: receber `{{reply_subject}}` + `{{reply_text}}`; instruir saída **JSON estrito** `{ "intent": "<um dos 5 valores>", "reasoning": "<pt-BR curto>" }`; enumerar os 5 intents com definição de cada (ver Dev Notes "Contrato do prompt"); temperatura baixa (classificação, não geração). **NÃO** criar migration de seed — o código default é a fonte de verdade (migration `00038` desativou os prompts globais do DB; ver Dev Notes "ai_prompts: código é a fonte de verdade").

- [x] **Task 2: Módulo classificador `src/lib/utils/reply-classifier.ts` (AC: #1, #4)**
  - [x] 2.1 **Espelhar estruturalmente `src/lib/utils/relevance-classifier.ts`** (é o precedente EXATO — classificador em contexto de cron, service-role, sem cookies). Reusar/re-exportar de lá o que der: `interpolateTemplate` [relevance-classifier.ts:43-50], o padrão de `loadPromptTemplate` [92-141] (trocando a `prompt_key` para `reply_intent_classification`), o `callOpenAI` via `fetch` direto [147-185] (`response_format: { type: "json_object" }`, `AbortSignal.timeout(15000)`, retorna `{ text, promptTokens, completionTokens }`), e `calculateClassificationCost(promptTokens, completionTokens)` [77-82] (gpt-4o-mini: `(promptTokens*0.15 + completionTokens*0.6)/1_000_000`). Prefira **importar** `calculateClassificationCost` e `interpolateTemplate` de `relevance-classifier.ts` a recolar.
  - [x] 2.2 `export function parseIntentResponse(text: string): { intent: OpportunityIntent | null; reasoning: string }` — espelhar `parseClassificationResponse` [relevance-classifier.ts:56-71]: strip de cercas markdown, `JSON.parse`, validar `parsed.intent` com `isValidOpportunityIntent` [opportunity.ts:55-57]. **Fail-open = `intent: null`** (NÃO inventar um intent) se JSON inválido / campo ausente / valor fora do enum. Retorna `reasoning` quando presente.
  - [x] 2.3 `export async function classifyReplyIntent(replyText, replySubject, openaiKey, supabase, tenantId): Promise<{ intent: OpportunityIntent | null; reasoning: string; promptTokens: number; completionTokens: number }>` — espelhar `classifyPostRelevance` [relevance-classifier.ts:205-283]. Guards de curto-circuito (sem chamada de IA): `openaiKey` null → `{ intent: null, ... }` (fail-open, sem custo); `replyText` vazio/curto (<10 chars) → `{ intent: null }` (AC6 trata o caso "só lt_interest_status" no processador, não aqui). Truncar `replyText` em ~4000 chars. Interpolar `{ reply_subject, reply_text }`. `try/catch` externo **fail-open para `intent: null`** em erro de OpenAI/parse (AC4).
  - [x] 2.4 `export function normalizeLtInterestStatus(raw: unknown): number | null` (AC2) — parse defensivo: `number` finito → o próprio; `string` numérica (`/^-?\d+$/`) → `parseInt`; senão `null`. Testar `"1"`→1, `"-1"`→-1, `1`→1, `""`/`"abc"`/`null`/`undefined`→null. Ver Dev Notes "Normalização lt_interest_status — a dívida da 21.6".
  - [x] 2.5 `export const INTENT_TO_LEAD_STATUS: Record<OpportunityIntent, LeadStatus | null>` (AC3) — `interessado: "interessado"`, `pediu_info: "interessado"`, `opt_out: "nao_interessado"`, `objecao: null`, `nao_agora: null`. Espelha o precedente `responseToStatus` [campaign-import.ts:58-63].
  - [x] 2.6 `export const LT_INTEREST_TO_INTENT: Record<number, OpportunityIntent | null>` (AC6, fallback sem texto) — mapeamento CONSERVADOR: `1` (Interested)/`2` (Meeting Booked)/`3` (Meeting Completed)/`4` (Won) → `interessado`; `-1`..`-4` e `0` → `null` (sinal negativo não casa nenhum dos 5 intents com confiança). Ver Dev Notes "AC6 + Open Question #1".

- [x] **Task 3: Ensemble IA × lt_interest_status + normalização na ingestão (AC: #2)**
  - [x] 3.1 No processador (Task 5), após obter `intent` da IA: ler `opportunity.lt_interest_status` (já `int|null` na row). Se **não-nulo e divergente** do intent da IA (ex.: IA=`interessado` mas `lt_interest_status <= -1` "Not Interested") → **prevalece a IA**, logar a divergência com `logWarn` estruturado (`{ opportunityId, aiIntent, ltInterestStatus }`). NÃO sobrescrever `intent` com o sinal do Instantly. (FR4)
  - [x] 3.2 **Fechar a dívida herdada da 21.6** [deferred-work.md — "lt_interest_status gravado sempre null para engagement"]: em `src/lib/utils/engagement-processor.ts:186-188`, o ramo `typeof rawStatus === "number"` está morto (`LeadTracking.ltInterestStatus` é `string`) → a coluna fica sempre null. Trocar por `normalizeLtInterestStatus(rawStatus)`. **Modifica arquivo DONE da 21.6 — regressão-crítico**: aditivo, só melhora o valor gravado; rodar a suíte da 21.6 (`engagement-processor.test.ts`) e confirmar verde. Ver Dev Notes "Modificar arquivos DONE com segurança".
  - [x] 3.3 **NÃO** tocar `reply-processor.ts:203-205` para normalização: ali `lt_interest_status` vem de `payload.i_status`, já tipado `number` [tracking.ts:366] (e `undefined` nos dados reais → null; achado da 21.2). O parse `typeof === "number"` está correto para a fonte de e-mail. A normalização string→int só é necessária no caminho de engajamento (3.2).

- [x] **Task 4: Auto-atualização de status do lead (AC: #3, FR5)**
  - [x] 4.1 No processador (Task 5), após definir o `intent`: se `opportunity.lead_id` não-nulo, calcular `newStatus = INTENT_TO_LEAD_STATUS[intent]`. Se `newStatus` não-nulo, atualizar o lead **reusando o padrão de `import-results` [import-results/route.ts:146-183]**: buscar `leads.status` atual, guardar `needsUpdate = leadStatus !== newStatus`, e só então `.update({ status: newStatus, updated_at })`.
  - [x] 4.2 **Guarda promote-only (evita rebaixar o funil):** só aplicar `interessado` se o status atual for `novo` ou `em_campanha` (NÃO sobrescrever `oportunidade` nem `nao_interessado`). `opt_out → nao_interessado` é terminal e pode sobrescrever qualquer status **exceto `oportunidade`** (lead já convertido não vira "não interessado" por um opt-out tardio). Ver Dev Notes "Transição de status — promote-only + Open Question #2". `lead_status` é ENUM nativo `('novo','em_campanha','interessado','oportunidade','nao_interessado')` [00010:8] — `interessado`/`nao_interessado` já existem, **sem `ALTER TYPE`**.
  - [x] 4.3 A atualização de status é **secundária** (não falha a classificação): erro no update → `logWarn`, segue. Precedente: `import-results` trata o update em lote e o `lead_interaction` como secundários.

- [x] **Task 5: Passe de classificação `classifyPendingReplies` + acoplamento ao pipeline (AC: #1, #4, #5)**
  - [x] 5.1 `export async function classifyPendingReplies(supabase, { tenantId? }): Promise<ClassifyResult>` em `reply-classifier.ts` — **passe separado** (não inline no INSERT da 21.2), consistente com a arquitetura `processReplies`/`processEngagement` (passes encadeados). Seleciona `opportunities` **não classificadas**: `.eq("source","reply").is("intent", null)` (+ `.eq("tenant_id", tenantId)` no backfill), ordenado por `created_at asc`, `.limit(MAX_CLASSIFY_PER_RUN=200)`. Ver Dev Notes "Por que passe separado (e não inline)".
  - [x] 5.2 **Multi-tenant + chave por tenant:** agrupar as oportunidades pendentes por `tenant_id`; por tenant, `getApiKey(supabase, tenantId, "openai")` **uma vez** (reuso de `monitoring-processor.ts:136-155`; null → pular o tenant, deixar `intent` null = fail-open + retry no próximo ciclo). Isolar por-tenant e por-item com `Promise.allSettled` em lotes de `CLASSIFY_CONCURRENCY=10` (espelha `reply-processor.ts:382-399` e `monitoring/process-batch` allSettled [220-243]).
  - [x] 5.3 Por oportunidade pendente: (a) se `reply_text` presente → `classifyReplyIntent(...)`; se ausente (AC6) → `intent = LT_INTEREST_TO_INTENT[lt] ?? null` sem chamar IA; (b) ensemble (Task 3.1); (c) `UPDATE opportunities SET intent=<...>, lt_interest_status=<normalizado se veio novo> WHERE id=<id>` (só `intent` muda de fato para reply; a coluna já tem o valor da ingestão) — **fail-open: se a IA falhou, NÃO faça o UPDATE de `intent`** (fica null → reentra no próximo ciclo, AC4); (d) atualização de status do lead (Task 4); (e) log de custo (Task 6). O UPDATE dispara o trigger `update_updated_at_column` (00055:63-67).
  - [x] 5.4 Encadear o passe nas DUAS rotas da 21.2, **depois** de `processReplies` (a oportunidade precisa existir antes de classificar): `src/app/api/replies/process-batch/route.ts` (cron, service-role — sem `tenantId`, todos os tenants) [process-batch/route.ts:44-46] e `src/app/api/replies/backfill/route.ts` (admin — com `tenantId: profile.tenant_id`) [backfill/route.ts:49-52]. Incluir contadores no resumo (`classified`, `classifySkipped`, erros com `scope:"classify"`). **NÃO** criar cron/edge-fn/secret novos (herda o disparo ≤5 min da 21.2 — mesma decisão de piggyback da 21.6).

- [x] **Task 6: Custo em `api_usage_logs` + migration do CHECK (AC: #5, NFR6)**
  - [x] 6.1 Por chamada de IA (só quando houve tokens > 0), registrar em `api_usage_logs` **espelhando o log de custo do monitoring** [monitoring-processor.ts:444-463]: `service_name: "openai"`, `request_type: "reply_intent_classification"`, `lead_id` (se houver), `estimated_cost: calculateClassificationCost(promptTokens, completionTokens)`, `status: "success"` (ou `"failed"` + `estimated_cost: 0` no fail-open), tokens em `metadata`. Usar um insert com **cliente parametrizado** (service-role) — reusar `logMonitoringUsage(supabase, params)` [monitoring-processor.ts:99-130] (é genérico apesar do nome) **ou** um helper local com a mesma shape de `LogApiUsageParams` [types/api-usage.ts:47-60]. NÃO usar `logApiUsage()` de `usage-logger.ts` sem checar se ele cria o próprio cliente (contexto de request, não cron).
  - [x] 6.2 **🔴 Migration `00058_add_openai_to_api_usage_logs_check.sql` — SEM ela, NFR6 falha em silêncio.** O CHECK atual de `api_usage_logs.service_name` [00035:21] é `IN ('apify','apollo','signalhire','snovio','instantly')` — **`'openai'` NÃO está incluído**. Todo INSERT com `service_name='openai'` viola o CHECK (Postgres `23514`) e é **engolido** por ambos os loggers (`catch {}`) → o custo de IA (inclusive o do Epic 13!) nunca persiste. Espelhar o padrão de `00022_add_openai_service_name.sql` (que corrigiu o MESMO problema na tabela `api_configs`), aplicado agora a `api_usage_logs`: `DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT ... CHECK (service_name IN ('apify','apollo','signalhire','snovio','instantly','openai'))`. Idempotente/defensiva (banco gerido à mão — 00053/00055). Ver Dev Notes "🔴 NFR6 está quebrado hoje" + nota operacional p/ Fabossi.

- [x] **Task 7: Testes unitários (AC: #7)**
  - [x] 7.1 `__tests__/unit/lib/utils/reply-classifier.test.ts` — **espelhar `relevance-classifier.test.ts`**: `vi.stubGlobal("fetch", mockFetch)`; happy path assere o wire (`Authorization: Bearer <key>`, `body.model === "gpt-4o-mini"`, `body.response_format === { type: "json_object" }`) e o parse de cada um dos 5 intents; fail-open (HTTP 429 / `mockRejectedValue` / JSON inválido / intent fora do enum → `intent: null`); guards (sem key / texto curto → `mockFetch` NÃO chamado); prompt fallback código via `setupSupabaseForCodeDefault` (mock-supabase.ts) e override por tenant.
  - [x] 7.2 `normalizeLtInterestStatus`: `"1"`→1, `"-1"`→-1, `1`→1, `0`→0, `""`/`"abc"`/`null`/`undefined`→null.
  - [x] 7.3 Ensemble: IA=`interessado` + `lt_interest_status=-1` → `intent` fica `interessado` (IA prevalece) + `logWarn` de divergência chamado; sem divergência → sem warn.
  - [x] 7.4 Transições de status (`INTENT_TO_LEAD_STATUS` + guarda promote-only): `interessado`/`pediu_info` com lead `novo` → `interessado`; com lead `oportunidade` → **sem alteração** (guard); `opt_out` → `nao_interessado`; `objecao`/`nao_agora` → sem update; lead ausente (`lead_id` null) → sem update, sem erro.
  - [x] 7.5 AC6: oportunidade sem `reply_text` + `lt_interest_status=1` → `intent=interessado` sem chamar OpenAI (`mockFetch` não chamado); `lt_interest_status=-1`/null → `intent` null.
  - [x] 7.6 `classifyPendingReplies`: seleciona só `source='reply'` + `intent IS NULL`; idempotência (2ª execução não reclassifica os já classificados); fail-open por-tenant (sem openai key → pula, intent segue null); custo registrado (assert insert em `api_usage_logs` com `service_name:"openai"`, `request_type:"reply_intent_classification"`).
  - [x] 7.7 Rotas: `process-batch` e `backfill` incluem `classified`/`classifySkipped` no resumo (estender os testes existentes da 21.2/21.6).
  - [x] 7.8 Regressão da 21.6: `engagement-processor.test.ts` segue verde após 3.2; adicionar caso `lt_interest_status` string→int gravado (antes ficava null).

- [x] **Task 8: Validação** — `npx tsc --noEmit` (0 novos erros em `src/`); `npx eslint --max-warnings=0 <arquivos novos/modificados>` limpo (inclusive `no-non-null-assertion` — leitura guardada de env se tocar rota); `npx vitest run` verde; `npm run build` verde.

## Dev Notes

Esta story adiciona **só a camada de classificação IA** sobre oportunidades `source='reply'` já persistidas pela 21.2. **Fora de escopo:** ingestão/sweep (21.2), engajamento/`source='engagement'` (21.6 — exceto o fix pontual de `lt_interest_status` da Task 3.2, que é dívida explicitamente atribuída à 21.3), rascunho de próximo passo `opportunity_next_step` (21.5), página Central e badge de intent (21.4), notificações (21.7).

### 🟢 Zero migration de schema de `opportunities` — as colunas JÁ existem

A migration `00055` já criou `intent TEXT CHECK (... IN ('interessado','pediu_info','objecao','nao_agora','opt_out'))` [00055:35-36] e `lt_interest_status INTEGER` [00055:37]. O COMMENT do schema **já anuncia esta story**: *"Instantly lead interest status normalizado string->int na ingestão (21.3)"* [00055:55] e *"Intenção classificada por IA (21.3); nullable até a classificação"* [00055:54]. **A única migration desta story é a do CHECK de `api_usage_logs` (Task 6.2)** — e ela existe por causa de um bug pré-existente de NFR6, não do schema de oportunidades.

### 🔴 NFR6 está quebrado hoje (o achado mais importante desta story)

O CHECK de `api_usage_logs.service_name` [00035:21] nunca incluiu `'openai'`:
```sql
service_name TEXT NOT NULL CHECK (service_name IN ('apify','apollo','signalhire','snovio','instantly'))
```
Todas as migrations que adicionaram `'openai'` (00022/00032/00041/00046) alteraram o CHECK da tabela **`api_configs`**, NÃO de `api_usage_logs` (confirmado por grep em `supabase/migrations`). Como `logMonitoringUsage` [monitoring-processor.ts:127-129] e `logApiUsage` [usage-logger.ts] **engolem qualquer erro** (`catch {}` — "logging never breaks the main flow"), todo INSERT de custo de IA com `service_name='openai'` é rejeitado (`23514`) **em silêncio** — o custo do Epic 13 (`monitoring_relevance_filter`/`monitoring_approach_suggestion`) provavelmente nunca persistiu. A Task 6.2 corrige isso; sem ela, o AC5/NFR6 desta story "passa" no código mas grava zero linha no banco. **Nota:** o banco do cliente é gerido à mão e tem drift [memória do projeto] — é possível que o CHECK de prod já difira dos arquivos; a migration idempotente (`DROP CONSTRAINT IF EXISTS`) é segura em ambos os casos. Confirmar no banco real (nota operacional Fabossi).

### O precedente EXATO a espelhar: `relevance-classifier.ts` (Epic 13, Story 13.4)

`src/lib/utils/relevance-classifier.ts` é um classificador de IA para **contexto de cron** (service-role, sem cookies) — a mesma condição desta story. Copie a **forma** dele, não a camada SDK do Epic 6 (`AIProvider`/`ai-service.ts`, que são request-time). Estrutura a reusar:

| Peça | Fonte | Reuso na 21.3 |
|---|---|---|
| `interpolateTemplate(template, vars)` | relevance-classifier.ts:43-50 | **importar** (não recolar) |
| `loadPromptTemplate(supabase, tenantId)` (tenant→global→código) | relevance-classifier.ts:92-141 | copiar, trocar `prompt_key` p/ `reply_intent_classification` |
| `callOpenAI(key, prompt, model, temp, maxTokens)` via `fetch` | relevance-classifier.ts:147-185 | copiar (é genérico; `response_format: json_object`, timeout 15s) |
| `parseClassificationResponse(text)` (fail-open) | relevance-classifier.ts:56-71 | adaptar → `parseIntentResponse` (valida enum de intent) |
| `calculateClassificationCost(pt, ct)` | relevance-classifier.ts:77-82 | **importar** (mesma tarifa gpt-4o-mini) |
| `classifyPostRelevance(...)` (guards + try/catch fail-open) | relevance-classifier.ts:205-283 | adaptar → `classifyReplyIntent` |

O loop batch (allSettled + log de custo por item) espelha `monitoring-processor.ts:324-464` e a rota `monitoring/process-batch/route.ts:220-243`. **Contraste útil:** `approach-suggestion.ts` faz o oposto do fail-open (retorna `null` em erro, sem `response_format`) — para classificação queremos o padrão do relevance (JSON estrito), com a diferença de que nosso fail-open é `intent: null` (não um valor positivo forjado).

### Registrar uma nova prompt key (3 lugares + 1 default)

`reply_intent_classification` é uma nova key. Para o tipo/validação aceitarem:
1. `src/types/ai-prompt.ts` — adicionar o literal na union `PromptKey` [68-80], no array `PROMPT_KEYS` [85-98] e no `promptKeySchema = z.enum([...])` [177-190]. (O `promptKeySchema` gateia o body de `/api/ai/generate`; não adicionar lá quebra tsc do enum exaustivo.)
2. `src/lib/ai/prompts/defaults.ts` — a entrada em `CODE_DEFAULT_PROMPTS` [26]. Precedente literal: `monitoring_relevance_filter` [828-867].

Precedente de como as keys do Epic 13 foram somadas: idêntico (visível nas mesmas linhas). `AIPromptMetadata` (`temperature`/`maxTokens`) em ai-prompt.ts:36-40.

### ai_prompts: código é a fonte de verdade (não precisa seed no DB)

`monitoring_relevance_filter`/`monitoring_approach_suggestion` **não têm seed em migration alguma** — o Epic 13 depende só do default em `defaults.ts`. A migration `00038_deactivate_db_prompts_use_code_defaults.sql` desativou todos os prompts globais do DB (`UPDATE ai_prompts SET is_active=false WHERE tenant_id IS NULL`) com o comentário *"code defaults ... are the source of truth"*. Logo a resolução efetiva é: override por tenant (raro) → global vazio (pulado) → **default no código**. **NÃO** crie migration de seed do prompt; o `loadPromptTemplate` cai no código default e funciona mesmo se a tabela `ai_prompts` estiver vazia/ausente no banco do cliente.

### Contrato do prompt `reply_intent_classification`

Saída JSON estrito `{ "intent": "...", "reasoning": "..." }`. Enumerar no template os 5 intents com definição (o modelo classifica melhor com fronteiras explícitas):
- `interessado` — demonstra interesse claro, quer avançar/conversar/agendar.
- `pediu_info` — pede mais detalhes, preço, material, sem compromisso ainda.
- `objecao` — tem interesse mas levanta barreira (preço, timing, concorrente, autoridade).
- `nao_agora` — não é o momento ("me procure em X", "renovamos recentemente").
- `opt_out` — pede para parar de receber / descadastrar / sem interesse definitivo.

Amostra real do spike (para calibrar): *"não está na lista de prioridades no momento... renovaram recentemente o [concorrente]"* → esperado `nao_agora`/`objecao` [spike:97]. Temperatura baixa (0.2), `maxTokens` ~150 (resposta curta). Instruir "responda APENAS o JSON".

### Normalização `lt_interest_status` — a dívida da 21.6 (AC2)

Existem DUAS fontes de `lt_interest_status`, com tipagens diferentes:
- **Caminho de resposta (reply):** `payload.i_status` da `GET /emails` → tipado `number` em `InstantlyReceivedEmail.i_status` [tracking.ts:366]. `reply-processor.ts:203-205` já faz `typeof === "number" ? : null` — **correto, não mexer** (Task 3.3). Nos dados reais vem `undefined` → null (achado 21.2), então o ensemble do reply roda **quase sempre só com a IA** — isso é esperado, não bug.
- **Caminho de engajamento:** `getLeadTracking` → `LeadTracking.ltInterestStatus?: string` [tracking.ts:175] (raw `InstantlyLeadEntry.lt_interest_status?: string` [tracking.ts:322]). O `engagement-processor.ts:186-188` tenta `typeof rawStatus === "number"` sobre uma **string** → ramo morto → grava sempre null. **Este é o alvo real da normalização (Task 3.2):** trocar por `normalizeLtInterestStatus(rawStatus)`. Fecha o defer da review 21.6 e faz a coluna existir para a 21.4.

Escala documentada (spike:62 / COMMENT 00055:55): `Interested=1, Meeting Booked=2, Meeting Completed=3, Won=4, Out of Office=0, Not Interested=-1, Wrong Person=-2, Lost=-3, No Show=-4`. Não existe helper que interprete a escala — só docs; o mapeamento `LT_INTEREST_TO_INTENT` (Task 2.6) é novo.

### Por que passe separado (e não inline no INSERT da 21.2)

O AC1 fala em "oportunidade `source='reply'` com `reply_text` e `intent` nulo" e o AC4 em "retry na próxima execução do processador" — ambos descrevem um **passe que varre oportunidades persistidas**, não um hook no INSERT. Vantagens: (a) fail-open natural — IA falha → `intent` fica null → o próximo ciclo re-seleciona e tenta de novo (AC4) sem lógica extra; (b) desacopla o custo/latência de IA do caminho crítico de ingestão; (c) espelha a arquitetura de passes encadeados da 21.2/21.6 (`processReplies` → `processEngagement` → **`classifyPendingReplies`**). **NÃO** classifique dentro de `processReplyEvent` (acoplaria IA à ingestão e quebraria o "retry no próximo ciclo").

### Transição de status — promote-only + Open Question #2

`import-results` [import-results/route.ts:146-183] é o precedente do update de status: computa `newStatus`, guarda `needsUpdate = status !== newStatus`, e faz `.update({ status, updated_at })`. Mas ele **não** protege ordem de funil. Para a 21.3, aplicar guarda **promote-only** (Task 4.2): `interessado` só sobrescreve `novo`/`em_campanha` (não rebaixa `oportunidade`); `opt_out → nao_interessado` sobrescreve tudo exceto `oportunidade`. Racional: um lead que já virou `oportunidade` (reunião marcada, etc.) não deve regredir para `interessado` nem cair para `nao_interessado` por causa de uma resposta tardia classificada. Ver Open Question #2 (default proposto; confirmar com Fabossi).

### Modificar arquivos DONE com segurança (engagement-processor.ts)

A Task 3.2 toca `engagement-processor.ts` (DONE 21.6, revisado). Regra igual à que a 21.6 usou ao tocar o `reply-processor.ts` da 21.2: a mudança é **aditiva e cirúrgica** (troca de um ramo morto por uma chamada que passa a gravar valor real); nenhum caminho existente muda de comportamento além de "null → valor correto". Rodar `engagement-processor.test.ts` + `reply-processor.test.ts` e confirmar verde antes de considerar a task pronta.

### Reuso obrigatório (não reinventar)

- `getApiKey(supabase, tenantId, "openai")` — decripta a chave do tenant. [monitoring-processor.ts:136-155]. `"openai"` é `service_name` válido em `api_configs` desde 00022.
- `logMonitoringUsage(supabase, params)` — insert genérico em `api_usage_logs` com cliente explícito (apesar do nome). [monitoring-processor.ts:99-130]
- `isValidOpportunityIntent` / `OPPORTUNITY_INTENTS` — validação do enum de intent. [opportunity.ts:17-24,55-57]
- `LeadStatus` / `leadStatusValues` — enum de status do lead. [lead.ts:19-27]
- `ACTIVE_OPPORTUNITY_STATUSES` — se precisar filtrar oportunidades ativas. [opportunity.ts:44-49]
- `Promise.allSettled` + worker que nunca lança — isolamento por item. [reply-processor.ts:382-399; monitoring/process-batch/route.ts:220-243]
- Leitura guardada de env (`no-non-null-assertion` linta o arquivo inteiro no pre-commit) se tocar rota. [memória "Pre-commit eslint"; process-batch/route.ts:32-37]
- Mock HTTP centralizado (`vi.stubGlobal("fetch", ...)`) + mock Supabase resiliente (`createChainBuilder`/`setupSupabaseForCodeDefault`). [__tests__/helpers/mock-supabase.ts]

### Anti-Patterns a evitar

1. **NÃO** classificar inline no `processReplyEvent` — é passe separado sobre oportunidades persistidas (AC1/AC4).
2. **NÃO** usar a camada SDK do Epic 6 (`AIProvider`/`ai-service.ts`) — é request-time; use o padrão `fetch` direto do `relevance-classifier.ts` (cron/service-role).
3. **NÃO** esquecer a migration do CHECK de `api_usage_logs` (Task 6.2) — sem ela o custo `openai` é rejeitado em silêncio e NFR6 falha.
4. **NÃO** forjar um `intent` no fail-open — fail-open = `intent: null` (fica visível, reentra no próximo ciclo). Diferente do relevance (que fail-opa para `true`).
5. **NÃO** deixar a IA sobrescrever a divergência: em IA × `lt_interest_status`, **prevalece a IA** + log (AC2/FR4).
6. **NÃO** rebaixar o funil do lead: guarda promote-only (não mover `oportunidade`→`interessado`).
7. **NÃO** criar migration de seed do prompt no `ai_prompts` — código default é a fonte de verdade (00038).
8. **NÃO** normalizar `reply-processor.ts:205` (i_status já é `number`); normalizar só o caminho de engajamento (string) — Task 3.2/3.3.
9. **NÃO** criar cron/edge-fn/secret novos — piggyback no `/api/replies/process-batch` da 21.2 (como a 21.6).
10. **NÃO** registrar a nova prompt key em só 1 ou 2 dos 3 lugares de `ai-prompt.ts` — o `z.enum` exaustivo quebra o tsc/validação.
11. **NÃO** usar `process.env.X!` (eslint pre-commit) — leitura guardada.

### Previous Story Intelligence (21.1 / 21.2 / 21.6)

- **21.2 (ingestão):** o `reply-processor.ts` cria a oportunidade com `intent: null` e comentário explícito *"NÃO classifica intent por IA (21.3)"* [reply-processor.ts:11,56]. O `lt_interest_status` do reply vem de `payload.i_status` (number, geralmente null nos dados reais — `i_status`/`email_type` voltam `undefined`; o filtro OOO efetivo é o regex, não `i_status`). O pipeline roda por cron piggyback (`/api/replies/process-batch`) já deployado e validado local.
- **21.6 (engajamento):** deixou 3 defers que a 21.3 toca/considera [deferred-work.md, seção 21.6]: (a) **`lt_interest_status` sempre null p/ engagement** → Task 3.2 fecha; (b) **upgrade engagement→reply não reseta status p/ `new`** → não é desta story (revisitar na 21.7); (c) **métricas write-once** → é da 21.4. O `reply-processor.ts` já foi modificado pela 21.6 (upgrade in-place) — ao adicionar o passe de classificação, NÃO reabrir esse arquivo (o passe vive em `reply-classifier.ts`).
- **21.1 (schema):** `intent`/`lt_interest_status` já no schema + tipos; migrations aplicadas à mão no banco do cliente (idempotentes). `toOpportunity`/`toOpportunityRow` já mapeiam ambos [opportunity.ts:119-169].
- Achado real 21.2 relevante à IA: as respostas reais são ricas em texto (`body.text` completo, ex.: 5196 chars) — material bom para classificação; a IA é o sinal dominante (lt_interest_status quase sempre null no reply).

### Git Intelligence (commits recentes)

- `c7f4beb` feat(story-21.6) — engajamento cross-campanha (baseline desta story; contém o `engagement-processor.ts` da Task 3.2).
- `c7940c4` feat(story-21.2) — sweep + processador + cron (o pipeline que esta story estende).
- `ed135f3` feat(story-21.1) — schema `opportunities` + tipos (colunas `intent`/`lt_interest_status`).
- Branch: `epic/21-loop-de-resposta` (commitar na branch do épico — padrão do épico, não abrir feature branch).

### Project Structure Notes

**Novos:**
- `src/lib/utils/reply-classifier.ts`
- `supabase/migrations/00058_add_openai_to_api_usage_logs_check.sql`
- `__tests__/unit/lib/utils/reply-classifier.test.ts`

**Modificados:**
- `src/types/ai-prompt.ts` (+key em 3 lugares)
- `src/lib/ai/prompts/defaults.ts` (+`reply_intent_classification`)
- `src/lib/utils/engagement-processor.ts` (Task 3.2 — `normalizeLtInterestStatus`; arquivo DONE 21.6, regressão-crítico aditivo)
- `src/app/api/replies/process-batch/route.ts` (+`classifyPendingReplies`)
- `src/app/api/replies/backfill/route.ts` (+`classifyPendingReplies`)
- Testes: `engagement-processor.test.ts`, `process-batch/route.test.ts`, `backfill/route.test.ts` (estender com contadores/normalização)

**Intocados (garantir):** `supabase/functions/instantly-webhook/index.ts`, `src/lib/webhook/instantly-webhook-utils.ts`, `supabase/functions/reply-sweep/index.ts`, `src/lib/utils/reply-sweep.ts`, `src/lib/utils/reply-processor.ts` (o passe de classificação NÃO vive aqui — vive em `reply-classifier.ts`).

Alinhamento total com a estrutura existente (`src/lib/utils/*-processor.ts` / `*-classifier.ts`); zero conflito.

### References

- [Source: _bmad-output/planning-artifacts/epic-21-loop-de-resposta.md#Story 21.3] — ACs, FR3/FR4/FR5, sequência
- [Source: _bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md:60-65,97] — escala `lt_interest_status`, amostra real de intent
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — 21.6: `lt_interest_status` null p/ engagement (dono 21.3), refresh de métricas (21.4)
- [Source: supabase/migrations/00055_create_opportunities_schema.sql:35-37,54-55,63-67] — colunas `intent`/`lt_interest_status` (existem) + COMMENTs que apontam p/ 21.3 + trigger updated_at
- [Source: supabase/migrations/00035_create_api_usage_logs.sql:20-21] — CHECK sem `'openai'` (o bug de NFR6)
- [Source: supabase/migrations/00022_add_openai_service_name.sql:13-14] — padrão da migration de CHECK-extend (aplicado a api_configs; espelhar p/ api_usage_logs)
- [Source: supabase/migrations/00038_deactivate_db_prompts_use_code_defaults.sql] — código default é fonte de verdade dos prompts
- [Source: supabase/migrations/00010_create_leads.sql:6-8,28] — ENUM `lead_status` (`interessado`/`nao_interessado` existem)
- [Source: src/lib/utils/relevance-classifier.ts:43-50,56-71,77-82,92-141,147-185,205-283] — precedente EXATO do classificador cron (interpolate, parse fail-open, custo, load prompt 3-níveis, callOpenAI fetch, main)
- [Source: src/lib/utils/approach-suggestion.ts:125-162,175-233] — contraste (null-on-error, sem response_format)
- [Source: src/lib/utils/monitoring-processor.ts:40,99-130,136-155,324-464,444-463] — logMonitoringUsage, getApiKey, loop batch + log de custo de IA
- [Source: src/app/api/monitoring/process-batch/route.ts:35-45,215-243] — auth por secret, service-role, contexto 1x, allSettled (template do passe)
- [Source: src/lib/ai/prompt-manager.ts:53-128,156-198,203-223] — PromptManager (alternativa request-time; usar o loader inline do relevance p/ cron)
- [Source: src/types/ai-prompt.ts:36-40,68-80,85-98,177-190] — PromptKey/PROMPT_KEYS/promptKeySchema/AIPromptMetadata (registrar a key nos 3)
- [Source: src/lib/ai/prompts/defaults.ts:26,828-867,870-924] — CODE_DEFAULT_PROMPTS + precedentes monitoring
- [Source: src/lib/services/usage-logger.ts:22-59] + [src/types/api-usage.ts:11-17,47-60,98-105] — logApiUsage/LogApiUsageParams/UsageServiceName (openai) / SERVICE_COST_RATES (openai=0, não usado)
- [Source: src/lib/utils/reply-processor.ts:11,56,181-306,203-205,382-399] — INSERT com intent null, i_status number, allSettled em lotes (NÃO reabrir p/ classificar)
- [Source: src/lib/utils/engagement-processor.ts:186-188] — ramo morto `typeof number` de `lt_interest_status` (Task 3.2)
- [Source: src/app/api/replies/process-batch/route.ts:44-46] + [backfill/route.ts:49-52] — pontos de encadeamento do passe
- [Source: src/types/opportunity.ts:17-24,44-49,55-57,78-79] — OPPORTUNITY_INTENTS, ACTIVE_OPPORTUNITY_STATUSES, guard, colunas
- [Source: src/types/lead.ts:19-27] + [src/types/campaign-import.ts:58-74] — LeadStatus + `responseToStatus` (precedente intent→status)
- [Source: src/app/api/leads/import-results/route.ts:146-183] — padrão de update de status (needsUpdate guard + batch)
- [Source: src/types/tracking.ts:175,322,366] — `lt_interest_status` string (LeadTracking/InstantlyLeadEntry) vs `i_status` number (InstantlyReceivedEmail)
- [Source: __tests__/unit/lib/utils/relevance-classifier.test.ts; approach-suggestion.test.ts; __tests__/helpers/mock-supabase.ts] — padrões de teste (fetch stub, code-default, fail-open)

## Open Questions (p/ Fabossi — não bloqueiam o dev; defaults propostos)

1. **AC6 — mapa `lt_interest_status → intent` (resposta sem texto).** Default proposto (conservador): só sinais positivos (`1..4`) → `interessado`; negativos (`-1..-4`) e `0` → `intent` null (nenhum dos 5 intents casa "Not Interested" com confiança; `opt_out` seria forte demais para um sinal de dashboard). Na prática o caminho é raro (respostas de polling sempre têm `body.text`). Confirmar ou pedir mapa mais agressivo (ex.: `-1..-4 → opt_out`).
2. **AC3 — guarda promote-only da transição de status.** Default proposto: `interessado` só promove `novo`/`em_campanha` (não rebaixa `oportunidade`); `opt_out → nao_interessado` sobrescreve tudo exceto `oportunidade`. Alternativa: seguir o `import-results` literal (sempre setar se diferente, sem guarda de funil). Confirmar.
3. **Task 6.2 — CHECK de `api_usage_logs` no banco real.** A migration idempotente é segura, mas vale confirmar no banco de prod (gerido à mão) se o CHECK atual já inclui `'openai'` ou não — determina se o custo de IA do Epic 13 já vinha sendo perdido (impacto retroativo em relatórios de custo).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story)

### Debug Log References

- `npx tsc --noEmit` → 0 erros em `src/` (erros pré-existentes só em `__tests__/`, fora do escopo).
- `npx eslint --max-warnings=0 <novos/modificados>` → limpo (inclui `no-non-null-assertion`; rotas usam leitura guardada de env pré-existente).
- `npx vitest run` → 373 files / 6379 pass / 2 skip / 0 fail.
- `npm run build` → verde (rotas `/api/replies/*` registradas).

### Completion Notes List

- **Task 1**: `reply_intent_classification` registrado nos 3 lugares de `ai-prompt.ts` (union `PromptKey`, array `PROMPT_KEYS`, `promptKeySchema` z.enum) + entrada em `CODE_DEFAULT_PROMPTS` (`defaults.ts`, gpt-4o-mini, temp 0.2, maxTokens 150, JSON estrito com os 5 intents definidos). SEM seed no DB (00038 = código é fonte de verdade). Testes de contagem `ai-prompt.test.ts` atualizados 12 → 13.
- **Task 2**: novo `src/lib/utils/reply-classifier.ts` espelhando `relevance-classifier.ts` (contexto de cron/service-role, `fetch` direto, `response_format: json_object`, timeout 15s). `interpolateTemplate`/`calculateClassificationCost` **importados** de `relevance-classifier`. `parseIntentResponse` fail-open → `intent: null` (não forja intent). `classifyReplyIntent` com guards (sem key / texto <10 chars → null, sem custo) e try/catch fail-open. `normalizeLtInterestStatus`, `INTENT_TO_LEAD_STATUS`, `LT_INTEREST_TO_INTENT` (conservador: só 1..4), `isEnsembleDivergent` e `resolveLeadStatusTransition` (promote-only) exportados e testados como puros.
- **Task 3**: ensemble (IA prevalece + `logWarn` de divergência via `isEnsembleDivergent`) dentro do passe; **defer da 21.6 fechado** — `engagement-processor.ts:196-198` trocou o ramo morto `typeof rawStatus === "number"` por `normalizeLtInterestStatus(lead.ltInterestStatus)` (aditivo: "null → valor real"). `reply-processor.ts` NÃO tocado (i_status já é `number` — Task 3.3).
- **Task 4**: auto-update de status do lead (FR5) via `updateLeadStatus` (secundário — erro só loga), com guarda **promote-only** (`resolveLeadStatusTransition`): `interessado`/`pediu_info` só promovem `novo`/`em_campanha`; `opt_out → nao_interessado` sobrescreve tudo exceto `oportunidade`; `objecao`/`nao_agora` não alteram.
- **Task 5**: passe SEPARADO `classifyPendingReplies` (`.eq("source","reply").is("intent",null)`, order `created_at asc`, limit `MAX_CLASSIFY_PER_RUN=200`, `+ .eq("tenant_id")` no backfill), agrupado por tenant, `getApiKey(...,"openai")` 1x/tenant (null → pula = fail-open), `Promise.allSettled` em lotes de `CLASSIFY_CONCURRENCY=10`. Fail-open: intent null → **não** faz UPDATE (reentra). Encadeado DEPOIS de `processReplies` nas duas rotas (`process-batch` cron + `backfill` admin) com contadores `classified`/`classifySkipped` + erros `scope:"classify"`.
- **Task 6**: custo em `api_usage_logs` via `logMonitoringUsage` (`service_name:"openai"`, `request_type:"reply_intent_classification"`, `status success|failed`, tokens em metadata) só quando tokens > 0. **Migration `00058`** corrige o CHECK de `api_usage_logs.service_name` (não incluía `'openai'` → INSERTs de custo IA rejeitados `23514` em silêncio; afetava até o Epic 13). Idempotente (`DROP CONSTRAINT IF EXISTS`), espelha 00022.
- **Task 7**: `reply-classifier.test.ts` (59 testes: parse dos 5 intents + fail-open, normalização, ensemble, transições promote-only, wire OpenAI, guards, passe com idempotência/fail-open per-tenant/custo/AC6). Rotas estendidas com contadores + `scope:"classify"`. `engagement-processor.test.ts` +1 (regressão string→int).
- **Open Questions**: implementados os defaults propostos (AC6 conservador; guarda promote-only). Q3 (CHECK no banco real) permanece OPERACIONAL para Fabossi — a migration 00058 é segura em ambos os casos.

### File List

**Novos:**
- `src/lib/utils/reply-classifier.ts`
- `supabase/migrations/00058_add_openai_to_api_usage_logs_check.sql`
- `__tests__/unit/lib/utils/reply-classifier.test.ts`

**Modificados:**
- `src/types/ai-prompt.ts`
- `src/lib/ai/prompts/defaults.ts`
- `src/lib/utils/engagement-processor.ts`
- `src/app/api/replies/process-batch/route.ts`
- `src/app/api/replies/backfill/route.ts`
- `__tests__/unit/types/ai-prompt.test.ts`
- `__tests__/unit/lib/utils/engagement-processor.test.ts`
- `__tests__/unit/app/api/replies/process-batch/route.test.ts`
- `__tests__/unit/app/api/replies/backfill/route.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-07-14: **code-review (bmad, 3 camadas) — Status → done.** 1 decision-needed (liveness/starvation) **deferido** por decisão do Fabossi (migration nova em banco gerido à mão > risco do bug em single-tenant; revisitar na 21.4). **5 patches aplicados:** (P1) `.is("intent", null)` no UPDATE = compare-and-swap contra passes concorrentes; (P2) `normalizeLtInterestStatus` extraído p/ leaf util `lt-interest.ts` (quebra acoplamento engagement→IA); (P3) `maxTokens` 150→200 + reasoning "máx. 1 frase" (evita truncagem do JSON → skip silencioso); (P4) log de custo sempre `status:"success"` no ramo com tokens (parse-fail é qualidade de dado, não falha de API — `hasIntent` no metadata distingue); (P5) prompt carregado 1×/tenant no passe (não por-oportunidade). 2 defers (maxDuration das rotas; RMW de `updateLeadStatus` — ambos low) + 9 dismiss (falsos-positivos verificados). VALIDAÇÕES: tsc 0 erros em `src/`; eslint `--max-warnings=0` limpo nos 6 arquivos; vitest **373 files / 6379 pass / 2 skip / 0 fail**; suite afetada 96/96. Novo arquivo `src/lib/utils/lt-interest.ts`.
- 2026-07-14: **dev-story — implementação completa, Status → review.** 8 tasks done. Novo `reply-classifier.ts` (espelha `relevance-classifier.ts`: cron/service-role, `fetch` direto gpt-4o-mini, `json_object`, fail-open → `intent: null`). Passe separado `classifyPendingReplies` sobre `opportunities` source='reply'/`intent IS NULL`, encadeado após `processReplies` nas rotas cron+backfill (contadores `classified`/`classifySkipped`). Prompt `reply_intent_classification` como código default (key nos 3 lugares de `ai-prompt.ts`). Ensemble IA×`lt_interest_status` (IA prevalece + log). Normalização string→int fecha o defer da 21.6 (`engagement-processor.ts`). Auto-update de status do lead (FR5) com guarda promote-only. Migration `00058` corrige o CHECK de `api_usage_logs` (faltava `'openai'` → custo IA rejeitado em silêncio, inclusive Epic 13). +60 testes novos (59 no classifier + 1 regressão engagement); contadores nas rotas. VALIDAÇÕES: tsc 0 erros em `src/`; eslint `--max-warnings=0` limpo; vitest 373 files/6379 pass/2 skip/0 fail; build verde. OPERACIONAL Fabossi: aplicar `00058` no banco (idempotente) + confirmar Q3 (se o CHECK de prod já perdia custo do Epic 13). Deploy Vercel segue adiado até a 21.4 (decisão prévia do Epic 21).
- 2026-07-14: Story 21.3 criada (create-story) — Classificação de Intenção por IA. Novo `reply-classifier.ts` espelhando `relevance-classifier.ts` (Epic 13): passe `classifyPendingReplies` sobre oportunidades `source='reply'`/`intent IS NULL`, gpt-4o-mini via `fetch` direto, prompt `reply_intent_classification` como código default (00038 = código é fonte de verdade), fail-open→`intent:null` + retry no próximo ciclo. Ensemble IA×`lt_interest_status` (IA prevalece + log). Normalização `lt_interest_status` string→int fecha o defer da 21.6 (fix cirúrgico em `engagement-processor.ts`). Auto-update de status do lead (FR5) com guarda promote-only, reusando o padrão `import-results`/`responseToStatus`. **Achado: NFR6 quebrado hoje** — CHECK de `api_usage_logs` [00035:21] não inclui `'openai'` → migration `00058` corrige (espelha 00022). Piggyback no cron da 21.2 (sem cron/secret novos). Zero migration de schema de `opportunities` (colunas já em 00055). 3 Open Questions p/ Fabossi. Status: ready-for-dev.

## Review Findings

_Code review adversarial (bmad-code-review) — 2026-07-14, baseline `c7f4beb`. 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor). Auditor confirmou os 7 ACs satisfeitos. Severidade reavaliada pelo triador contra o código real (os subagentes citaram linhas inexistentes — `reply-classifier.ts` tem 578 linhas)._

**Decision-needed → deferido (Fabossi, 2026-07-14):**

- [x] [Review][Defer] Liveness — oportunidades "irresolvíveis" reentram para sempre + cap 200 não é por-tenant (medium) — `classifyReplyIntent` fail-open → `intent: null` NÃO persiste. Rows que nunca resolvem (falha persistente de OpenAI, truncagem do JSON, ou sem-texto + `lt_interest_status` ≤ 0/null → `LT_INTEREST_TO_INTENT[x] ?? null`) são re-selecionadas em TODA execução (`.is("intent", null)`, `order created_at asc`, `limit 200` [reply-classifier.ts:517-523]). Se ≥200 dessas acumularem, ocupam a janela mais antiga e bloqueiam permanentemente as classificáveis seguintes. Em modo cron (sem `tenantId`) o cap 200 é GLOBAL → um tenant com backlog >200 monopoliza o passe. **Deferido:** migration nova num banco gerido à mão é risco operacional maior que o bug na escala single-tenant atual (respostas de polling quase sempre têm texto → caminho irresolvível é raro). Revisitar na 21.4 (Central expõe o backlog) ou ao escalar multi-tenant, fazendo contador `classification_attempts`+backoff **e** fairness por-tenant juntos.

**Patch:**

- [x] [Review][Patch] (aplicado) Sem CAS no UPDATE de intent → passes concorrentes gastam OpenAI 2× e duplicam update de status [reply-classifier.ts:484-487] — o SELECT filtra `intent IS NULL` mas o UPDATE só tem `.eq("id", ...)`. Cron (≤5 min, passe pode durar até ~5 min) sobreposto a si mesmo ou ao backfill admin → ambos selecionam as mesmas rows e ambos classificam/gravam. Fix: adicionar `.is("intent", null)` ao UPDATE (compare-and-swap; elimina o double-write e a re-atualização de lead — o custo duplicado de OpenAI só some com um passo de claim, registrar como resíduo).
- [x] [Review][Patch] (aplicado) `normalizeLtInterestStatus` (helper puro) mora no módulo de IA → `engagement-processor.ts` importa transitivamente todo o wiring de fetch/OpenAI [reply-classifier.ts:88-94] — mover o helper puro para um util-folha (ex.: `src/lib/utils/lt-interest.ts`) e re-exportar; quebra o acoplamento e o risco de import cycle.
- [x] [Review][Patch] (aplicado) `max_tokens: 150` pode truncar o JSON (`intent` + `reasoning` pt-BR) → `JSON.parse` falha → skip silencioso + custo gasto [defaults.ts (metadata) / reply-classifier.ts:254,331] — o precedente `relevance-classifier` usa 200. Bump p/ ~200 e/ou instruir `reasoning` bem curto / opcional. Reduz skips crônicos que ainda realimentam o problema de reentrada acima.
- [x] [Review][Patch] (aplicado) Log de custo marca `intent:null` legítimo como `status:"failed"` com o custo real [reply-classifier.ts:459-474] — Task 6.1 dizia "failed → estimated_cost 0", e uma classificação que legitimamente não casa nenhum dos 5 intents não é "falha". Recomendado: `"failed"` só em erro duro; null legítimo → `"success"` (o custo foi real, manter). Limpa o sinal de failure-rate em `api_usage_logs`.
- [x] [Review][Patch] (aplicado) Prompt carregado por-oportunidade (2 reads cada) em vez de 1×/tenant [reply-classifier.ts:317,548] — `getApiKey` já é resolvido 1×/tenant; `loadPromptTemplate` deveria seguir o mesmo padrão (hoist p/ `classifyPendingReplies`, passar o template ao `classifyOne`). Espelha o precedente `relevance`, mas gera até ~400 queries ancilares/execução. Só performance.

**Defer:**

- [x] [Review][Defer] Rotas sem `maxDuration`; passe de classify anexado após sweep+process+engagement pode aproximar o limite da function [process-batch/route.ts, backfill/route.ts] — deferido, risco de infra pré-existente amplificado (200 × até 15s / concorrência 10 ≈ 300s no pior caso). Setar `export const maxDuration` explícito e/ou reduzir `MAX_CLASSIFY_PER_RUN`.
- [x] [Review][Defer] `updateLeadStatus` faz read-modify-write em `leads.status` sem filtro `tenant_id` (service-role) [reply-classifier.ts:361-400] — deferido, inerente ao padrão `import-results` reusado. Race entre 2 oportunidades do MESMO lead no mesmo lote → lost update; `tenant_id` ausente é defesa-em-profundidade (leadId é PK, funcionalmente correto).

**Dismissed (9 — ruído / falso-positivo / por design):** `reply-processor.ts:205` string i_status (decisão documentada Task 3.3; `i_status` é `number` [tracking.ts:366]); erro-duro de OpenAI (0 tokens) não logado (espelha o precedente `monitoring-processor:444`, gated tokens>0); migration nome-do-constraint "chutado"/ADD não-idempotente (nome auto-gerado é determinístico p/ CHECK inline de 1 coluna; DROP IF EXISTS + ADD é idempotente; coberto pela Open Question #3); `logMonitoringUsage` descartaria a classificação (falso-positivo — tem `catch {}` interno [monitoring-processor:127]); fence ` ``` ` sem `json` não removido (`response_format: json_object` impede fences); `leads.status` null (é `NOT NULL DEFAULT 'novo'` [00010:28]); `tenantId` falsy `""` no backfill (rota guarda `!profile.tenant_id` → 400 [backfill/route.ts:35]); tipo `LT_INTEREST_TO_INTENT` sem `| null` (cosmético); `parseIntentResponse` missing-intent vs erro-duro (retorna `reasoning` distinto; fail-open por design).
