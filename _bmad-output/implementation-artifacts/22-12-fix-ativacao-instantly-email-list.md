---
baseline_commit: de018a43dd7d9f5b8eb655c743828ba78dec6c0b
---

# Story 22.12: Fix da Ativação no Instantly — endpoint de contas inexistente (email_list) + degradação graciosa no defer

Status: done

> **P0 — hoje NENHUMA campanha do agente consegue anexar contas de envio.** A ativação real e o "Ativar Depois" quebram no mesmo ponto.

## Story

As a usuário do Agente TDEC,
I want que a etapa de Ativação funcione — tanto "Ativar Campanha" quanto "Ativar Depois" —,
so that a campanha exportada saia do agente pronta (com contas de envio anexadas) em vez de morrer num "Erro interno. Tente novamente." no último passo do fluxo.

## Contexto (bug reproduzido em teste E2E, 2026-07-24)

Fluxo completo executado ao vivo (briefing → guiado → 2 leads aprovados → campanha → export Instantly ✅). No gate de ativação, selecionada 1 conta de envio e clicado **"Ativar Depois"**:

```
[instantly] HTTP 404 Not Found {"message":"Route POST:/api/v2/account-campaign-mappings not found","error":"Not Found","statusCode":404}
[Execute Step] PipelineError step=5: {"code":"ORCHESTRATOR_SKIP_FAILED","message":"Erro interno. Tente novamente.","stepNumber":5,"stepType":"activate","isRetryable":false}
POST /api/agent/executions/.../steps/5/execute 500
```

UI: card de erro *"Erro na etapa 'Ativação': Erro interno. Tente novamente.. Entre em contato com o suporte."* — execução vai para `paused` e o usuário fica sem saída. Nota a contradição: `isRetryable: false` mas a mensagem manda "tentar novamente".

**Diagnóstico confirmado em código:**

- `InstantlyService.addAccountsToCampaign` ([instantly.ts:312-319](../../src/lib/services/instantly.ts#L312)) faz um loop de `POST /api/v2/account-campaign-mappings` por conta ([instantly.ts:62](../../src/lib/services/instantly.ts#L62), Story 7.5). **A rota não existe na API v2 do Instantly** — o próprio Instantly responde "Route not found". Ou nunca existiu ou foi removida.
- **3 call sites** dependem dela:
  1. [activate-step.ts:74](../../src/lib/agent/steps/activate-step.ts#L74) — **"Ativar Campanha" (via principal) quebra igual**
  2. [orchestrator.ts:231](../../src/lib/agent/orchestrator.ts#L231) — "Ativar Depois" (o 500 reproduzido); o attach roda ANTES do skip, então a falha derruba a etapa inteira
  3. [route.ts:59](../../src/app/api/instantly/campaign/[id]/accounts/route.ts#L59) — rota avulsa `POST /api/instantly/campaign/[id]/accounts`
- A suíte **mocka o Instantly** → verde não prova a rota externa. Mesma classe da lição do Epic 21 ([[project-schema-constraint-blind-spot]], 4ª dimensão: fronteiras que o mock não simula).

## Verificação da doc oficial (feita na create-story, 2026-07-24)

> Fornecido para **acelerar** o dev, não para dispensar a confirmação da AC1. O dev revalida na doc/ao vivo antes de fechar (regra [[feedback-cost-model-accuracy]]).

**A hipótese de trabalho está CONFIRMADA na doc oficial + no próprio código:**

- **`PATCH /api/v2/campaigns/{id}` aceita `email_list`.** Doc oficial ([developer.instantly.ai/api-reference/campaign/patch-campaign](https://developer.instantly.ai/api-reference/campaign/patch-campaign)): `email_list` = **array de strings**, descrição literal *"List of accounts to use for sending emails"*, exemplo `"john@doe.com"`. É exatamente o mesmo campo que o **próprio `createCampaign` já usa** hoje ([instantly.ts:237-239](../../src/lib/services/instantly.ts#L237)) para anexar contas no autopilot → prova interna de que `email_list` na CAMPANHA = contas de envio (fecha o Trap #1 do briefing).
- **`account-campaign-mappings` NÃO tem POST.** Na v2 esse recurso é **somente leitura**: existe apenas `GET /api/v2/account-campaign-mappings/{email}` ("get campaigns associated with an email"). Não há verbo de escrita — daí o 404 real *"Route POST:/api/v2/account-campaign-mappings not found"*. O `POST` do Story 7.5 ou nunca existiu na v2 ou foi removido.
- **Semântica replace-vs-merge (a confirmar ao vivo — AC1/Task 1):** por semântica de PATCH e pela forma do campo (array cru), a hipótese forte é **replace total** do `email_list`. **Isto é seguro para os 3 call sites atuais**, porque no fluxo guiado/defer o `createCampaign` roda **sem** `sendingAccounts` (as contas só são escolhidas depois, no gate) → a campanha chega ao attach com `email_list` vazio, e um replace com as `selectedAccounts` é o resultado desejado. Ainda assim, **recomendo o caminho defensivo** (GET campanha → merge do `email_list` existente com o novo → PATCH) para blindar contra um call site futuro que anexe contas incrementalmente. Confirmar o comportamento real no smoke.
- **`activateCampaign` NÃO é PATCH** — é `POST /api/v2/campaigns/{id}/activate` ([instantly.ts:457-459](../../src/lib/services/instantly.ts#L457)). O novo attach é uma chamada PATCH **separada e anterior** à ativação; não dá para fundir os dois.

## Acceptance Criteria

1. **[Endpoint correto verificado na doc oficial]** **Given** a doc oficial da API v2 do Instantly (developer.instantly.ai) **When** `addAccountsToCampaign` for reescrito **Then** ele usa o mecanismo canônico da v2 para associar contas de envio a uma campanha — hipótese de trabalho: `PATCH /api/v2/campaigns/{id}` com o campo **`email_list`** (array de e-mails das contas) — **And** a forma exata (endpoint, verbo, shape do body, semântica replace-vs-append) é **verificada na doc oficial durante o dev**, não assumida (regra [[feedback-cost-model-accuracy]]: fonte oficial, não memória/blog).

2. **[Os 3 call sites funcionam]** **Given** a correção **Then** os 3 call sites (activate-step, orchestrator defer, rota avulsa) passam a anexar contas com sucesso via o método corrigido **And** nenhum call site mantém referência ao endpoint morto (`account-campaign-mappings` some do runtime; tipos de request/response obsoletos em [instantly.ts (types):206-221](../../src/types/instantly.ts#L206) são removidos ou marcados deprecated).

3. **[Defer degrada com graça]** **Given** o caminho "Ativar Depois" ([orchestrator.ts:223-236](../../src/lib/agent/orchestrator.ts#L223)) **When** o attach de contas falhar por QUALQUER motivo **Then** a etapa **não** falha inteira: o skip conclui, a execução completa com `activationDeferred: true`, e a mensagem-resumo avisa explicitamente que as contas não foram anexadas ("anexe manualmente no Instantly") **And** o comportamento atual de sucesso (contas anexadas + resumo normal) é preservado. Racional: adiar a ativação é a intenção primária do usuário; o attach é acessório.

4. **[Ativação real continua fail-fast]** **Given** o caminho "Ativar Campanha" ([activate-step.ts](../../src/lib/agent/steps/activate-step.ts)) **Then** ali a falha de attach CONTINUA bloqueando (ativar sem conta de envio dispararia campanha inerte/quebrada) **And** a mensagem de erro ao usuário passa a ser específica ("Não consegui anexar as contas de envio no Instantly") em vez de "Erro interno".

5. **[Mensagem coerente com isRetryable]** **Given** um `PipelineError` com `isRetryable: false` **Then** a mensagem exibida NÃO diz "Tente novamente" (varrer o formatter de erro da etapa; coerência mensagem ↔ flag).

6. **[Testes + smoke real]** **Given** a lição "mock não prova fronteira externa" **Then** (a) testes de contrato mockados cobrem o novo request shape (endpoint/verbo/body) nos 3 call sites; (b) RED provado: o teste do shape falha contra o código antigo; (c) **smoke real** (definição-de-pronto): repetir o fluxo E2E com 1-2 leads + "Ativar Depois" com conta selecionada → execução completa sem erro E contas visíveis na campanha no Instantly; "Ativar Campanha" real fica a critério do Fabossi (dispara envio de verdade).

## Tasks / Subtasks

- [x] **Task 1 — Verificar a doc oficial do Instantly v2** (AC: #1)
  - [x] Confirmar o mecanismo de associação de contas (campaigns PATCH `email_list` vs outro endpoint); documentar a URL da doc consultada nas Dev Notes.
  - [x] Confirmar semântica: o PATCH substitui ou mescla `email_list`? (Se substitui, ler a campanha antes e mesclar para não derrubar contas existentes.)
- [x] **Task 2 — Reescrever `addAccountsToCampaign`** (AC: #1, #2)
  - [x] Trocar o loop de POSTs pelo novo request; manter a assinatura `AddAccountsParams`/`AddAccountsResult` (call sites intactos onde possível).
  - [x] Remover/deprecar endpoint constante e tipos mortos.
- [x] **Task 3 — Degradação graciosa no defer** (AC: #3)
  - [x] Envolver o attach em try/catch próprio no ramo `activationDeferred` do orchestrator; falha → log + flag `accountsAttachFailed: true` no output + mensagem-resumo com aviso; skip/completion seguem.
- [x] **Task 4 — Mensagens de erro** (AC: #4, #5)
- [x] **Task 5 — Testes (RED→GREEN) + smoke real E2E** (AC: #6) — testes RED→GREEN feitos; smoke real E2E fica pendente para o Fabossi (rota externa; mock não prova). Ver Completion Notes.

### Review Findings

_Code review adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-07-24 — baseline de018a4. Nenhum achado High/Medium; as 6 ACs foram confirmadas satisfeitas. Todos os itens abaixo são Low._

- [x] [Review][Decision] AC6(a) shape testado só no service, não "nos 3 call sites" — **RESOLVIDO (sign-off Fabossi, 2026-07-24): aceito por design.** O request HTTP é montado num único lugar (`addAccountsToCampaign`) e os 3 call sites só delegam com assinatura preservada; o shape está coberto em `instantly.test.ts` (com RED contra o endpoint morto), e os testes de call site cobrem comportamento (defer degrada / ativação fail-fast). Assertar shape nos call sites seria acoplamento frágil; o risco de fronteira externa é fechado pelo smoke AC6c, não por mock. AC6(a) considerada satisfeita.
- [x] [Review][Patch] AC5 sanitizer deixa ponto duplo / mensagem vazia — **CORRIGIDO 2026-07-24:** o ramo não-retryable agora remove a pontuação terminal residual (`/[.!?]+$/`) além de "tente novamente", e cai num fallback (`"Erro ao processar a etapa"`) se a sanitização esvaziar; o ramo retryable também remove pontuação terminal para o template não gerar `..`. [src/lib/agent/orchestrator.ts:446-458]
- [x] [Review][Patch] Defer: `externalCampaignId` ausente com contas selecionadas não avisa — **CORRIGIDO 2026-07-24:** adicionado `else if (selectedAccounts?.length > 0)` que seta `accountsAttachFailed = true` + `console.error` quando há contas mas falta o campaignId → o resumo passa a avisar "anexe manualmente" (alinha AC3). [src/lib/agent/orchestrator.ts:251-260]
- [x] [Review][Patch] Null-guard no merge do GET — **CORRIGIDO 2026-07-24:** `current?.email_list ?? []` blinda contra corpo GET `null`. [src/lib/services/instantly.ts:336-338]
- [x] [Review][Defer] Lost update: GET→merge→PATCH não-atômico — dois attach concorrentes na mesma campanha fazem read-modify-write; o último PATCH vence e descarta as contas do outro. Regressão vs o POST additivo antigo; probabilidade baixa (attach concorrente na mesma campanha é raro no fluxo). [src/lib/services/instantly.ts:330-343] — deferred
- [x] [Review][Defer] Aposta no contrato externo (GET devolve `email_list`; PATCH replace-safe) — toda a defesa depende de o GET refletir as contas reais; se o Instantly omitir `email_list` sob PATCH-replace, apaga contas. É exatamente o que o **smoke real AC6c (pendente)** prova. [src/lib/services/instantly.ts:337] — deferred
- [x] [Review][Defer] Dedup exato-string não normaliza case/whitespace — `Set([...existing, ...new])` trata `User@x.com`/`user@x.com` como distintos. Ambas as listas vêm do próprio Instantly (casing consistente) → improvável; normalizar com lowercase é arriscado se o Instantly for case-sensitive em conta. [src/lib/services/instantly.ts:336-338] — deferred, requer confirmar case-handling do Instantly

## Dev Notes

### Estado atual dos arquivos tocados (leitura feita na create-story — preservar o que não é o bug)

- **[instantly.ts](../../src/lib/services/instantly.ts) — `addAccountsToCampaign` ([:312-342](../../src/lib/services/instantly.ts#L312)):** hoje faz um **loop de N `POST`** em `account-campaign-mappings` (1 por conta, com `delay(RATE_LIMIT_DELAY_MS=150ms)` entre elas), body `{ campaign_id, email_account }` tipado por `AccountCampaignMappingRequest`. **Preservar a assinatura** `AddAccountsParams`/`AddAccountsResult` ({apiKey, campaignId, accountEmails[]} → {success, accountsAdded}) para não mexer nos 3 call sites. O guard de `accountEmails.length === 0 → {success:true, accountsAdded:0}` deve ficar. Constantes/tipos a matar: `INSTANTLY_ACCOUNT_CAMPAIGN_MAPPINGS_ENDPOINT` ([:62](../../src/lib/services/instantly.ts#L62)), imports `AccountCampaignMappingRequest`/`AccountCampaignMappingResponse` ([:40-41](../../src/lib/services/instantly.ts#L40)) e as interfaces em [types/instantly.ts:205-221](../../src/types/instantly.ts#L205). O padrão de PATCH a espelhar já existe no arquivo (`this.request<T>(url, {method, headers: buildAuthHeaders(apiKey), body: JSON.stringify(...)})`); `INSTANTLY_CAMPAIGNS_ENDPOINT` ([:57](../../src/lib/services/instantly.ts#L57)) + `/${campaignId}` monta a URL.
- **[activate-step.ts:70-79](../../src/lib/agent/steps/activate-step.ts#L70) (call site 1 — ativação real):** só chama `addAccountsToCampaign` quando `selectedAccounts?.length > 0` (modo guiado; autopilot já anexou no `createCampaign`). Roda **antes** de `activateCampaign` ([:82](../../src/lib/agent/steps/activate-step.ts#L82)). Aqui a falha **deve continuar bloqueando** (AC4) — ativar sem conta = campanha inerte. Preservar: sub-steps de mensagem de progresso/summary e o `cost`.
- **[orchestrator.ts:222-303](../../src/lib/agent/orchestrator.ts#L222) (call site 2 — defer):** o attach ([:231](../../src/lib/agent/orchestrator.ts#L231)) roda **dentro do mesmo `try`** que faz o skip do step + `update` de `agent_executions` para `completed` (com CAS `.neq("status","cancelled")` da 22.10 — **não remover o CAS**) + a mensagem-resumo de sucesso ([:279-287](../../src/lib/agent/orchestrator.ts#L279)). Por isso o 404 do attach hoje derruba a etapa inteira via `catch`→`paused`. **Fix AC3:** isolar o attach num try/catch próprio → em falha, logar + setar flag no output (`accountsAttachFailed: true`) + trocar a mensagem-resumo para avisar que as contas **não** foram anexadas; o skip + completion + `activationDeferred` seguem normalmente. Preservar o caminho de sucesso byte-a-byte.
- **[route.ts:59](../../src/app/api/instantly/campaign/[id]/accounts/route.ts#L59) (call site 3 — rota avulsa):** POST `/api/instantly/campaign/[id]/accounts`, autenticada (`getCurrentUserProfile`), lê a chave por `api_configs` de sessão (RLS admin). Só repassa `accountEmails` ao service — corrige "de graça" ao consertar o método. Não é fluxo do agente; **não** aplicar service-role aqui.

### Origem exata do "Tente novamente" (AC5)

O texto vem do **`userMessage` embutido no `ExternalServiceError`**, não do formatter da etapa. O 404 mapeia para `INTERNAL_ERROR: "Erro interno. Tente novamente."` em [base-service.ts:20](../../src/lib/services/base-service.ts#L20). O `retryPart` do `sendErrorMessage` ([orchestrator.ts:421-423](../../src/lib/agent/orchestrator.ts#L421)) **já é coerente** com `isRetryable` (`"Você pode tentar novamente."` vs `"Entre em contato com o suporte."`) — a incoerência é a string genérica `INTERNAL_ERROR` carregar "Tente novamente" dentro dela. Fix coerente = fronteira do attach (AC4): capturar a falha e propagar uma mensagem específica (`"Não consegui anexar as contas de envio no Instantly"`) em vez de deixar o 404 cair no `INTERNAL_ERROR` genérico. **NÃO** renomear `INTERNAL_ERROR` globalmente (usado por outros serviços). Depois do fix do endpoint, esse 404 específico some — a AC5 blinda o caso residual (qualquer falha de attach não-retryable não deve dizer "tente novamente").

### Demais notas

- **NFR1**: pipeline segue determinístico — só muda o request HTTP e o tratamento de erro. Zero migration (NFR5).
- **Trap #1**: não confundir `email_list` da CAMPANHA (contas de envio) com lista de leads. Na v2, leads entram por `/api/v2/leads`; contas de envio são atributo da campanha.
- **Trap #2**: `getServiceApiKey`/service-keys (22.9) já resolve a chave por service-role — não tocar.
- **Trap #3**: rate limit — o método antigo fazia N POSTs com delay; o novo provavelmente é 1 request só (melhor). Conferir se `RATE_LIMIT_DELAY_MS` ainda é necessário ali.
- A execução quebrada do teste (`98b5ae57`, paused) e a campanha "Campanha - Teste Atibaia" no Instantly (2 leads, sem contas, não ativada) podem servir de fixture do smoke.

### References

- [Source: src/lib/services/instantly.ts#L62] — constante do endpoint morto
- [Source: src/lib/services/instantly.ts#L312] — `addAccountsToCampaign` (alvo)
- [Source: src/lib/agent/steps/activate-step.ts#L74] — call site ativação real
- [Source: src/lib/agent/orchestrator.ts#L223-L236] — call site defer (attach antes do skip)
- [Source: src/app/api/instantly/campaign/[id]/accounts/route.ts#L59] — rota avulsa
- [Source: src/lib/services/instantly.ts#L218-L271] — `createCampaign` (prova interna: `email_list` = contas de envio)
- [Source: src/lib/services/instantly.ts#L457-L459] — `activateCampaign` (POST `/activate`, NÃO PATCH — attach é chamada separada)
- [Source: src/lib/services/base-service.ts#L20] — `INTERNAL_ERROR: "Erro interno. Tente novamente."` (origem do texto incoerente, AC5)
- [Doc oficial] https://developer.instantly.ai/api-reference/campaign/patch-campaign — `PATCH /api/v2/campaigns/{id}`, `email_list` array de strings
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — relatório do teste E2E (evidência)

## Dev Agent Record

### Implementation Plan (dev-story, Opus 4.8, baseline de018a4)

- **AC1 (endpoint):** doc oficial reconfirmada ao vivo (Task 1). `addAccountsToCampaign` passa a usar `PATCH /api/v2/campaigns/{id}` com `email_list`. Caminho **defensivo GET→merge→PATCH** (recomendado nas Dev Notes): lê o `email_list` atual da campanha, mescla (união, dedup) com as contas novas e faz o PATCH. Isso é seguro sob AMBAS as semânticas de PATCH (replace OU merge) → não derruba contas pré-existentes (ex.: as do `createCampaign` do autopilot). 1 GET + 1 PATCH substitui o loop de N POSTs.
- **AC2 (3 call sites):** assinatura `AddAccountsParams`/`AddAccountsResult` preservada → os 3 call sites permanecem intactos na chamada. Endpoint morto `INSTANTLY_ACCOUNT_CAMPAIGN_MAPPINGS_ENDPOINT` + tipos `AccountCampaignMappingRequest`/`Response` + imports removidos. Novos tipos `UpdateCampaignRequest`/`UpdateCampaignResponse`; `GetCampaignResponse.email_list` adicionado.
- **AC3 (defer degrada):** no orchestrator (ramo `activationDeferred`), o attach isolado em try/catch próprio. Falha → `console.error` + flag `accountsAttachFailed: true` (só quando true — caminho de sucesso preservado byte-a-byte) no output do skip, no `result_summary` e no data de retorno + mensagem-resumo trocada para avisar "anexe manualmente". Skip + completion + `activationDeferred` seguem.
- **AC4 (ativação real fail-fast):** no `activate-step`, o attach embrulhado em try/catch que RE-LANÇA (continua bloqueando), mas com mensagem específica "Não consegui anexar as contas de envio no Instantly" preservando a retryabilidade (re-lança `ExternalServiceError` com o mesmo statusCode quando aplicável) em vez do genérico "Erro interno".
- **AC5 (coerência isRetryable):** `sendErrorMessage` do orchestrator sanitiza — quando `isRetryable === false`, remove "Tente novamente" da mensagem embutida (blindagem do resíduo, ex.: `INTERNAL_ERROR` genérico). Sem renomear `INTERNAL_ERROR` globalmente.
- **AC6 (testes + smoke):** contrato mockado do novo shape (GET+PATCH `email_list`) nos testes do service; asserts RED provados contra o código antigo; testes de degradação no orchestrator/activate-step. Smoke real E2E fica para o Fabossi executar (rota externa — mock não prova).

### Completion Notes (dev-story, Opus 4.8)

**Implementado e validado:**

- ✅ **AC1** — Doc oficial reconfirmada AO VIVO via WebFetch (`developer.instantly.ai/api-reference/campaign/patch-campaign`): `email_list` = array de strings, *"List of accounts to use for sending emails"*. A doc **NÃO especifica** replace-vs-merge → adotado o caminho defensivo **GET→merge→PATCH**, seguro sob ambas as semânticas.
- ✅ **AC2** — `addAccountsToCampaign` reescrito para `GET /api/v2/campaigns/{id}` → merge dedup do `email_list` → `PATCH /api/v2/campaigns/{id}`. Assinatura `AddAccountsParams`/`AddAccountsResult` preservada → os **3 call sites** (activate-step, orchestrator defer, rota avulsa) permanecem intactos e passam a funcionar. Endpoint morto `INSTANTLY_ACCOUNT_CAMPAIGN_MAPPINGS_ENDPOINT` + tipos `AccountCampaignMappingRequest`/`Response` + imports removidos (grep confirma: `account-campaign-mappings` só sobra em comentários/nomes de teste, zero no runtime). Novos tipos `UpdateCampaignRequest`/`UpdateCampaignResponse` + `GetCampaignResponse.email_list`.
- ✅ **AC3** — Attach isolado em try/catch próprio no ramo defer do orchestrator. Falha → `console.error` + flag `accountsAttachFailed: true` (incluída **só quando true** via spread condicional → caminho de sucesso preservado byte-a-byte) no output do skip, no `result_summary` e no data de retorno + mensagem-resumo trocada ("anexe-as manualmente no Instantly antes de ativar"). Skip + completion + `activationDeferred` seguem; **nunca vai para `paused`** neste caminho (asserção no teste).
- ✅ **AC4** — No `activate-step` (ativação real), attach embrulhado em try/catch que **RE-LANÇA** (fail-fast: ativar sem conta = campanha inerte), mas com mensagem específica *"Não consegui anexar as contas de envio no Instantly"*, preservando a retryabilidade (re-lança `ExternalServiceError` com o mesmo `statusCode` quando aplicável → 502 continua retryable). Não vaza mais o genérico "Erro interno".
- ✅ **AC5** — `sendErrorMessage` sanitiza: `isRetryable === false` remove "Tente novamente" da mensagem embutida (regex `/\s*tente novamente\.?/gi`). Blinda o resíduo (ex.: `INTERNAL_ERROR` genérico) sem renomear `INTERNAL_ERROR` globalmente. Retryable mantém a mensagem original.
- ✅ **AC6** — RED provado (10 falhas contra o código antigo: chamava `account-campaign-mappings`, vazava "Erro interno"), depois GREEN. Suíte cheia: **400 arquivos, 7026 pass / 2 skip / 0 fail**. `tsc` **0 erros em `src/`** (produção limpa; os 181 erros de tsc são pré-existentes em `__tests__`, nenhum introduzido). ESLint **limpo** (`--max-warnings=0`) nos 7 arquivos tocados.

**✅ Smoke real E2E (AC6c) — lado app EXECUTADO 2026-07-24 (skill verify, Playwright + Instantly REAL):**

- **Fixture usada:** a própria execução quebrada do teste original (`98b5ae57`, paused) — campanha "Campanha - Teste Atibaia" (`428dde41-6f76-470f-b304-105d1e833c61`), 2 leads exportados, output do step 4 já com `activationDeferred: true` + `selectedAccounts: ["mfabossi@tdecnetworks.com"]`.
- **Ação:** `POST /steps/5/execute` re-disparado (retry legítimo — `paused` não é terminal) contra o dev server com o código novo, logado como `fabotse`, **API do Instantly real** (sem mock).
- **Resultado:** HTTP **200** em 4.0s, `{ success: true, data: { skipped: true, reason: "activation_deferred" } }` — **sem** `accountsAttachFailed` (flag só aparece em falha → o GET+PATCH `email_list` retornou 2xx do Instantly real; zero logs `[instantly] HTTP ...` de erro no server). Execução → **`completed`** (`result_summary: { activationDeferred: true }`), step 5 → `skipped`, mensagem-resumo de sucesso: *"Campanha \"Campanha - Teste Atibaia\" exportada no Instantly. Ativacao adiada — ative manualmente quando desejar."* — no MESMO ponto onde o código antigo morria com 500/`ORCHESTRATOR_SKIP_FAILED` → `paused`.
- **⚠️ Falta (Fabossi, combinado):** confirmação **visual no Instantly** — abrir a campanha "Campanha - Teste Atibaia" e verificar que **`mfabossi@tdecnetworks.com`** aparece como conta de envio (atenção: é a conta do output original do step 4, não outra). "Ativar Campanha" real segue a critério do Fabossi (dispara envio de verdade).
- **Observações fora do escopo 22.12 (registradas):** (1) retomar execução `paused` pela UI não funciona — o gate re-tenta `POST /steps/4/approve` → **409** (já aprovado) e nunca chega ao execute do step 5 (o smoke contornou via API; parente do "beco sem saída" P1 do relatório E2E); (2) hydration mismatch pré-existente da Sidebar (conhecido); (3) dev server antigo estava 500ando todas as rotas do agente — resolvido com restart (infra dev, não é do app).

### File List

**Produção (src/):**
- `src/lib/services/instantly.ts` — `addAccountsToCampaign` reescrito (GET→merge→PATCH `email_list`); constante `INSTANTLY_ACCOUNT_CAMPAIGN_MAPPINGS_ENDPOINT` removida; imports ajustados.
- `src/types/instantly.ts` — `GetCampaignResponse.email_list` adicionado; novos `UpdateCampaignRequest`/`UpdateCampaignResponse`; tipos mortos `AccountCampaignMappingRequest`/`Response` removidos.
- `src/lib/agent/orchestrator.ts` — degradação graciosa do attach no ramo defer (try/catch + flag `accountsAttachFailed`); `sendErrorMessage` sanitiza "Tente novamente" em erros não-retryable (AC5).
- `src/lib/agent/steps/activate-step.ts` — attach da ativação real em try/catch com mensagem específica preservando retryabilidade (AC4); import de `ExternalServiceError`.

**Testes (__tests__/):**
- `__tests__/unit/lib/services/instantly.test.ts` — bloco `addAccountsToCampaign` reescrito p/ o contrato GET+PATCH `email_list` (+ merge/dedup, ordem GET→PATCH, endpoint morto não chamado).
- `__tests__/unit/lib/agent/orchestrator.test.ts` — teste de degradação no defer (AC3) + teste de sanitização "Tente novamente" (AC5).
- `__tests__/unit/lib/agent/steps/activate-step.test.ts` — testes de fail-fast com mensagem específica + retryabilidade preservada (AC4/AC5).

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E ponta-a-ponta do agente — 404 real do Instantly capturado no log do dev server; 3 call sites mapeados; prioridade P0 (bloqueia toda ativação). Status: draft (revisar com Fabossi antes de dev-story). |
| 2026-07-24 | create-story (SM): refino + promoção a **ready-for-dev**. Verificação na doc oficial CONFIRMOU a hipótese: `PATCH /api/v2/campaigns/{id}` com `email_list` (array de strings, "List of accounts to use for sending emails") + prova interna no próprio `createCampaign`; `account-campaign-mappings` é somente-GET na v2 (daí o 404). Leitura obrigatória dos 3 call sites + `createCampaign`/`activateCampaign`/`base-service` feita e documentada nas Dev Notes (estado atual, o que preservar, replace-vs-merge seguro p/ os call sites atuais mas caminho defensivo GET→merge recomendado). Origem exata do "Tente novamente" rastreada a base-service.ts:20 (AC5). Assinatura `AddAccountsParams`/`Result` preservada = call sites intactos. |
| 2026-07-24 | dev-story (Opus 4.8, baseline de018a4): AC1-AC6 implementados. `addAccountsToCampaign` reescrito p/ GET→merge→PATCH `email_list` (endpoint morto + tipos removidos); defer degrada com graça (flag `accountsAttachFailed`, nunca `paused`); ativação real fail-fast com msg específica preservando retryabilidade; `sendErrorMessage` sanitiza "Tente novamente" em erros não-retryable. RED provado (10 asserts) → GREEN. Suíte 400 arq / 7026 pass / 0 fail; tsc 0 em src/; eslint limpo. **Pendente: smoke real E2E (Fabossi).** Status → review. |
| 2026-07-24 | code-review (bmad 3 camadas, full, baseline de018a4): 6 ACs confirmadas satisfeitas, **nenhum achado High/Medium**. 1 decision-needed (shape testado no service, não literalmente "nos 3 call sites") → aceito por sign-off (design defensável). 3 patches Low aplicados: (P1) sanitizer AC5 remove pontuação terminal residual + fallback anti-mensagem-vazia; (P2) defer com contas mas sem `externalCampaignId` agora sinaliza `accountsAttachFailed` e avisa (alinha AC3); (P3) `current?.email_list` null-guard no merge. 3 defers registrados (lost-update não-atômico, aposta no contrato externo→smoke, dedup case-sensitive) em `deferred-work.md`. Testes dos 3 arquivos: 140/140 verdes; eslint `--max-warnings=0` limpo. Status permanece **review** até o smoke real E2E (def-de-pronto do Fabossi). |
| 2026-07-24 | **smoke real E2E (AC6c) — lado app ✅** (skill verify, Playwright, Instantly REAL): fixture `98b5ae57` (paused do teste original) retomada via `POST /steps/5/execute` → **200 em 4.0s**, execução **`completed`** (`activationDeferred: true`, **sem** `accountsAttachFailed`), step 5 `skipped`, resumo de sucesso na conversa — no mesmo ponto do 500 original. GET+PATCH `email_list` provados contra a rota externa real (a aposta de contrato do defer #2 está paga). **Falta só a confirmação visual do Fabossi no Instantly** (conta `mfabossi@tdecnetworks.com` na campanha) → aí status vai a `done`. Descoberta colateral: retomada de `paused` pela UI quebra no re-approve do step 4 (409) — registrada em deferred-work. |
| 2026-07-24 | **DONE — smoke completo confirmado pelo Fabossi, incluindo "Ativar Campanha" REAL**: fluxo novo E2E (campanha "Campanha Outbound - 24/07/2026", 1 lead, conta `felipe@startveeflow.com`) com ativação real → **campanha ativada no Instantly ao vivo** ("deu tudo certo"). Attach + activate provados nos DOIS caminhos (defer e real). AC6c fechada com prova máxima. Descoberta de UX fora do escopo (execução guiada não "conclui" visualmente: botão do gate girando eterno, badge "Processando..." em step concluído, step 5 `awaiting_approval` sem UI → execução `running` para sempre, sem resumo final) diagnosticada e encaminhada para story própria. Status → **done**. |
