---
baseline_commit: 205c784949fd4fa641cd3dc9b63d42f9b0ee45e4
---

# Story 22.9: Chaves de Serviço via Service-Role no Runtime do Agente (Desbloquear SDR)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **STORY DE CORREÇÃO PÓS-PLANEJAMENTO (bug crítico de produção).** Levantada no smoke manual da Story 22.7 (2026-07-22, skill `verify`), registrada em [deferred-work.md](deferred-work.md) sob "🔴 CRÍTICO". **Não** introduzida por nenhuma story do Epic 22 — o código é herdado do Epic 16/17 (Agent Foundation). Bloqueia o **caso de uso central** do Agente TDec para o papel **SDR**, que é o usuário primário declarado do agente (Epic 20). Padrão de fix já validado no projeto (Story 21.5 e Story 22.7/D3).

## Story

As a **SDR** (papel restrito de prospecção, o usuário primário do Agente TDec),
I want **conseguir montar um briefing e executar o pipeline do agente sem esbarrar em "chave não configurada"**,
so that **eu consiga de fato usar o agente para prospectar — hoje toda mensagem falha com 422 mesmo com as chaves configuradas pelo gestor**.

## Acceptance Criteria

1. **Given** um usuário com papel `sdr` (não-admin) logado, com as chaves de API configuradas pelo gestor no tenant **When** ele envia uma mensagem no `/agent` (rota `POST /api/agent/briefing/parse`) **Then** o parser lê a chave OpenAI com sucesso e responde normalmente (nunca mais `422 API_KEY_MISSING` por causa de RLS) — **prova RED→GREEN**: com o código atual, um teste com sessão de papel `sdr` (RLS real, não mockada) recebe 422; com o fix, recebe 200.
2. **Given** o mesmo SDR **When** o pipeline determinístico executa (`POST /api/agent/executions/[id]/steps/[n]/execute` e os steps internos que leem `api_configs` — TheirStack, Apollo, OpenAI, Apify, SignalHire, Instantly, etc.) **Then** todas as leituras de chave de serviço no **runtime do agente** usam **service-role** (client admin), não o client de sessão sujeito a RLS — o SDR executa o pipeline igual a um admin.
3. **Given** a mudança **Then** a RLS admin-only de `api_configs` (`00005_api_configs_rls.sql`) permanece **intocada** — a tela de **Settings → Integrações** continua admin-only (SDR **não** deve ver/editar chaves). A exceção de service-role vale **só** para o runtime do agente que **usa** a chave em nome do usuário, nunca para exibi-la.
4. **Given** a leitura via service-role **Then** o fail-open/erro é claro e seguro: se a service-role key estiver ausente no ambiente, ou a chave do serviço realmente não existir no tenant, a resposta é o mesmo erro de "não configurada" de hoje (nunca 500 novo, nunca vazamento da chave em log/resposta). Mantém isolamento por `tenant_id` na query (service-role bypassa RLS, então o filtro `tenant_id` explícito passa a ser a **única** barreira de isolamento — obrigatório em toda query).
5. **Given** o padrão corrigido **Then** ele é **centralizado** num único ponto server-only (helper compartilhado) para que nenhuma rota/step futura do agente reintroduza o mesmo bug lendo `api_configs` com o client de sessão.
6. Testes unitários cobrindo: (a) leitura de chave com papel não-admin retorna a chave (mock do client admin), (b) service-role ausente → erro tratado (não 500), (c) `tenant_id` sempre presente na query. **E** um teste de contrato/integração que prove o cenário RLS real com papel `sdr` (o mock não simula RLS — lição sistêmica do projeto). Suíte inteira verde, zero regressão.

## Tasks / Subtasks

- [x] **Task 1 — Mapear exaustivamente TODAS as leituras de `api_configs` no runtime do agente** (AC: #2, #5)
  - [x] Confirmar os pontos já identificados e varrer por novos. Pontos conhecidos (client de SESSÃO hoje, vulneráveis):
    - [x] [briefing/parse/route.ts:184,205-210](src/app/api/agent/briefing/parse/route.ts#L205) — chave `openai` (o 422 PROVADO ao vivo com SDR).
    - [x] [briefing/parse-product/route.ts:87-93](src/app/api/agent/briefing/parse-product/route.ts#L87) — chave `openai` (mesmo padrão).
    - [x] [executions/[executionId]/steps/[stepNumber]/execute/route.ts:59,81-86,104](src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L81) — chave `theirstack` lida com client de sessão **E** o client de sessão é passado ao `DeterministicOrchestrator` → propaga o bug para todos os steps.
    - [x] [step-utils.ts:12-28 `getServiceApiKey`](src/lib/agent/steps/step-utils.ts#L12) — recebe o `supabase` do caller; hoje o caller passa o de sessão → toda chave de serviço do pipeline (Apollo/SignalHire/Instantly/etc.) morre sob RLS pro SDR.
    - [x] [create-campaign-step.ts:306 `getOpenAIApiKey` / :327 `getApifyApiKey`](src/lib/agent/steps/create-campaign-step.ts#L306) — leem `api_configs` via `this.supabase` (o client do orchestrator = sessão).
  - [x] Grep de fechamento: `from("api_configs")` e `getServiceApiKey(` em `src/app/api/agent/**` e `src/lib/agent/**` — garantir que a lista está completa. Documentar o mapa final nas Dev Notes (nenhum ponto silencioso pode sobrar). **→ achou 1 ponto SILENCIOSO fora do grep: `ApolloService` (mapa completo nas Dev Notes → "Mapa final").**
  - [x] Verificar também o `confirm/route.ts` e a geração de plano/estimativa de custo: confirmar se leem chave (se sim, entram no escopo; se são 100% determinísticos, registrar como fora do escopo). **→ 100% determinísticos, fora do escopo.**
- [x] **Task 2 — Helper server-only centralizado de leitura de chave (service-role)** (AC: #2, #4, #5)
  - [x] Criar um único helper server-only (ex.: `src/lib/agent/service-keys.ts` ou estender um util existente) que lê `api_configs` **sempre** via `createAdminClient()` (service-role), com `tenant_id` + `service_name` na query, e devolve a chave decriptada (ou sinaliza ausência de forma tratável). **Espelhar o padrão fail-open da Story 22.7** ([contextual-suggestions.ts `readTenantICP`](src/lib/agent/contextual-suggestions.ts) — `createAdminClient` em try/catch; sem service-role key → erro tratado, nunca 500).
  - [x] `tenant_id` é parâmetro **obrigatório** e sempre aplicado na query (service-role bypassa RLS → o filtro explícito é a única barreira de isolamento de tenant, AC4). O caller **deve** passar o `profile.tenant_id` autenticado (mesma nota de contrato do defer de `readTenantICP` da 22.7). **→ guarda extra: `tenantId` vazio devolve `missing` sem nem consultar.**
  - [x] Reusar `decryptApiKey` ([src/lib/crypto/encryption.ts](src/lib/crypto/encryption.ts)) e nunca logar a chave nem `encrypted_key` (PII/segredo — lição da 13.11 sobre PII em log).
- [x] **Task 3 — Repontar todos os pontos do mapa para o helper** (AC: #1, #2)
  - [x] Trocar as leituras diretas nos 3 route handlers (`parse`, `parse-product`, `steps/execute`) para o helper.
  - [x] Fazer `getServiceApiKey` (step-utils) e `create-campaign-step` (`getOpenAIApiKey`/`getApifyApiKey`) usarem o client admin **para a leitura da chave**, mantendo o client de sessão para o resto (leituras/escritas de dados do agente que DEVEM respeitar RLS por tenant — não trocar essas). **Cirúrgico:** só a leitura de `api_configs` migra para service-role; nada mais.
  - [x] Preservar as mensagens de erro atuais ("Chave X nao configurada") e os status codes (422) quando a chave realmente não existir — a mudança é a **fonte** da leitura, não o contrato de erro.
- [x] **Task 4 — Testes** (AC: #6)
  - [x] Unit: helper devolve a chave com papel não-admin (mock do `createAdminClient`); service-role ausente (createAdminClient lança) → erro tratado, sem 500; `tenant_id` presente na query (assert no `.eq`).
  - [x] Repontar mocks existentes das rotas do agente que hoje mockam a leitura de sessão (padrão da 22.7: quando a rota passa a chamar o helper, o mock parcial pode quebrar — repontar como no [briefing-parse.test.ts](__tests__/unit/api/agent/briefing-parse.test.ts) da 22.7).
  - [x] **Teste de contrato RLS real** (AC1/AC6, def-de-pronto pós-Epic 21): provar que com papel `sdr` a leitura via sessão retorna vazio (o bug) e via service-role retorna a linha. Se um teste de integração com RLS real não for viável no harness, deixar a prova via **smoke manual** (Task 5) e documentar explicitamente a limitação do mock (o mock NÃO simula RLS — foi exatamente o que escondeu esse bug até agora). **→ feito nos DOIS níveis: (a) nas rotas, o client de sessão devolve zero linhas de propósito (RLS do `sdr` simulada na fronteira) e o admin devolve a linha — 32 testes provaram o RED; (b) `service-keys-contract.test.ts` (estático) trava a RLS admin-only e proíbe leitura de `api_configs` fora do helper.**
  - [x] Rodar suíte inteira: `npx vitest run` — zero regressão (baseline atual **397 files / 6914 pass / 2 skip / 0 fail**, já incluído o patch da 22.7). **→ 399 files / 6950 pass / 2 skip / 0 fail.**
- [x] **Task 5 — Smoke manual pela interface real (OPERACIONAL, def-de-pronto)** (AC: #1, #2)
  - [x] Logar como **SDR real** (`ccase@tdec.com.br`) e provar na tela: (a) mandar uma mensagem no `/agent` → resposta normal, **sem 422**; (b) avançar o briefing até onde o pipeline lê chaves de serviço (sem clicar "Iniciar Execução" se for disparar APIs pagas — guardrail de custo; ou parar no ponto que já prove a leitura da chave). O smoke ANTES do fix já provou o RED (422 real capturado no Network); o smoke pós-fix prova o GREEN. **→ GREEN: `POST /parse → 200`, briefing → confirmação → Guiado → Plano de Execução (R$ 7,20); cancelado no gate, `Iniciar Execução` NÃO clicado.**

### Review Findings

_Code review adversarial (3 camadas: Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 2026-07-23. Suíte reconferida de forma independente: 399 files / 6950 pass / 2 skip / 0 fail._

**Decisões resolvidas (2026-07-23, Fabossi)**

- [x] [Review][Decision] **Apollo fail-open reentra na leitura de sessão** → **decidido: opção 1** — usar `readServiceApiKey` nos 3 call sites do agente e tratar `decrypt_error` explicitamente, preservando o fallback de sessão apenas para `missing` (degradação consciente, sem tocar superfícies não-agente). Convertido em patch abaixo.
- [x] [Review][Decision] **`missing` conflaciona ambiente quebrado com chave ausente** → **decidido: opção 1 — manter como está.** AC4 é explícito ("nunca 500 novo") e o `console.error` já diferencia as causas no log do servidor. Sem ação.
- [x] [Review][Decision] **Fronteira de commit da 22.9** → **decidido: opção 1 — três commits separados** (22.6, 22.7, 22.9), preservando rollback granular da mudança de service-role. Ação no momento do commit, fora do escopo de patch de código.

**Patches**

- [x] [Review][Patch] **[da Decision 1]** Trocar `getServiceApiKeyOrNull` por `readServiceApiKey` nos 3 call sites do Apollo e tratar `decrypt_error` explicitamente (erro de decrypt, não "não configurada"); `missing` segue passando `undefined` para o service [src/lib/agent/steps/search-leads-step.ts:102-103, src/lib/agent/steps/create-campaign-step.ts:106-107, src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts:133-134]

- [x] [Review][Patch] Guarda de centralização (AC5) não cobre `src/lib/services` — `ApolloService`, `SignalHireService` e `zapi` ainda leem `api_configs` pela sessão e são invisíveis ao scan; um step futuro com `new SignalHireService(tenantId)` reintroduz o bug com a suíte verde [__tests__/unit/lib/agent/service-keys-contract.test.ts:47-50]
- [x] [Review][Patch] Assertion do Apollo no teste de contrato é tautológica — `match(/new ApolloService\([^)]*\)/g)` + `toContain(",")` prova aridade, não a origem da chave; `new ApolloService(tenantId, undefined)` passa [__tests__/unit/lib/agent/service-keys-contract.test.ts:124-133]
- [x] [Review][Patch] Injeção da chave do Apollo sem cobertura unitária — o mock `constructor() {}` descarta os dois argumentos e o arquivo não mocka `@/lib/agent/service-keys` nem `@/lib/supabase/admin`, então o helper REAL roda durante os testes [__tests__/unit/lib/agent/steps/search-leads-step.test.ts:24-31]
- [x] [Review][Patch] Guarda anti-afrouxamento de RLS tem dois furos — `walk("supabase/migrations")` só devolve `.ts`/`.tsx` (sempre vazio, código morto) e o filtro exige o literal `POLICY`, então `ALTER TABLE api_configs DISABLE ROW LEVEL SECURITY` ou `GRANT` passam verdes [__tests__/unit/lib/agent/service-keys-contract.test.ts:62-81]
- [x] [Review][Patch] Chave decriptada vazia passa como `ok` — o guard cobre `encrypted_key` vazio, mas `decryptApiKey()` devolvendo `""` retorna `{status:"ok", apiKey:""}`; downstream o Apollo trata `""` como ausente (`if (this.apiKey)`) e cai na sessão [src/lib/agent/service-keys.ts:91-101]
- [x] [Review][Patch] Branch `decrypt_error` do execute/route sem teste — o novo `500 API_KEY_ERROR` não é exercitado; a rota irmã `parse-product` tem esse teste [src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts:98-107]
- [x] [Review][Patch] `getServiceApiKey` virou pass-through com ternário morto — `serviceName === "instantly" ? "Instantly" : serviceName`, e os 3 callers passam `"instantly"`; a indireção existe só para capitalizar uma string [src/lib/agent/steps/step-utils.ts]
- [x] [Review][Patch] Duas alegações a corrigir na documentação — (a) nomes de teste dizem "RLS do sdr" mas `role: "sdr"` é decorativo (nenhum código de produção lê `role`; o sinal real é o mock de sessão devolver `null`), e (b) a story afirma "a mudança é a fonte da leitura, não o contrato de erro", mas o decrypt passou a lançar mensagem nova (`Erro ao decriptar a API key do X`) e o execute/route passou a devolver 500 estruturado onde antes estourava sem tratamento — são melhorias, mas contradizem o invariante declarado

**Deferidos**

- [x] [Review][Defer] Sem enforcement de `server-only` no módulo — só docblock; o projeto não tem a dependência e o precedente é a 22.7 [src/lib/agent/service-keys.ts:1-33] — deferred, pré-existente
- [x] [Review][Defer] ~30 rotas/serviços fora do agente ainda leem `api_configs` pela sessão — já registrado em [deferred-work.md](deferred-work.md) — deferred, pré-existente
- [x] [Review][Defer] AC1 "RLS real, não mockada" não é provada em CI — prova é estática + smoke manual; escape hatch previsto na Task 4 — deferred, limitação do harness
- [x] [Review][Defer] `SUPABASE_SERVICE_ROLE_KEY` virou dependência dura do runtime do agente — sem o env var, gestor/diretor (que funcionam hoje) passam a ver "chave não configurada"; checar nos 3 ambientes Vercel antes do deploy — deferred, verificação operacional
- [x] [Review][Defer] Achados da Story 22.6 encontrados de carona no diff — `"10001+"` não é transformado por `size.replace("-", ",")` e chega malformado ao Apollo agora por padrão; `companySizes` passou a ser sempre setado na busca direta; `resolveDirectSearchCompanySizes` aceita qualquer string como bucket; divergência entre `isDirectEntry` (step) e `skipSteps` (hook) na promessa "Tamanho de empresa: 11+"; execuções em voo repaginam com filtros pré-deploy — deferred, fora do escopo da 22.9

**Descartados como ruído (3):** "o diff omite 6 arquivos" (recorte deliberado de escopo); "`adminApiConfigsChain` vaza entre testes" (falso — `setupDefaultMocks()` roda no `beforeEach`, [create-campaign-step.test.ts:251-255](../../__tests__/unit/lib/agent/steps/create-campaign-step.test.ts#L251)); "sem cache do admin client" (pipeline é I/O-bound em APIs externas).

## Dev Notes

### Diagnóstico (causa-raiz)

O runtime do Agente TDec lê as chaves de API de `api_configs` usando o **client de sessão** do Supabase (`createClient()` de [src/lib/supabase/server.ts](src/lib/supabase/server.ts)), que está sujeito a RLS. A RLS de `api_configs` ([00005_api_configs_rls.sql:14-20](supabase/migrations/00005_api_configs_rls.sql#L14)) é **admin-only**: `USING (tenant_id = get_current_tenant_id() AND is_admin())`. E `is_admin()` ≡ `role IN ('gestor','diretor')` (modelo Epic 20; ver [capabilities.ts:14 `ADMIN_ROLES`](src/lib/auth/capabilities.ts#L14)). Um papel `sdr` **não** é admin → a query não dá erro, apenas retorna **zero linhas** (RLS filtra em silêncio) → `apiConfig?.encrypted_key` é `undefined` → a rota devolve `422 API_KEY_MISSING` (ou o step lança "chave não configurada"), **mesmo com a chave configurada e válida**.

**Provado ao vivo (2026-07-22, Playwright, skill `verify`):** logado como `ccase@tdec.com.br` (SDR), `POST /api/agent/briefing/parse` → `422 {"error":{"code":"API_KEY_MISSING",...}}`; a MESMA chave OpenAI funciona logado como admin (Fabossi). Confirmado em `api_configs` que a linha `service_name='openai'` existe.

**Por que só apareceu agora:** todos os smokes anteriores do Epic 22 (22.1–22.6, 22.8) e do agente (Epic 16/17) foram feitos logados como **admin** (Fabossi). O SDR nunca tinha dirigido o agente por trás da RLS. Mesma classe de bug da **Story 21.5** (RLS `is_admin()` em `api_configs`/`knowledge_base` matava a leitura pro SDR; o mock de `getApiKey`/Supabase substitui exatamente a chamada que a RLS mata → suíte verde, tela quebrada) e da **Story 22.7/D3** (que corretamente usou `createAdminClient` para ler o ICP justamente por isso).

### Decisão de design (o que muda e o que NÃO muda)

- **A RLS admin-only de `api_configs` está CERTA e fica intocada.** Ela protege a **superfície de configuração** (Settings → Integrações): SDR não deve ver nem editar chaves (NFR-S2 da Story 2.2). A correção **não** afrouxa RLS.
- **O que muda:** o **runtime do agente** — que *usa* a chave em nome do usuário, não a *exibe* — passa a ler `api_configs` via **service-role** (`createAdminClient`), exatamente como já é feito legitimamente em outros pontos server-only do projeto (opportunity-suggestion, monitoring-processor, e a própria 22.7). Ler chave para executar ≠ ver chave na tela.
- **Isolamento de tenant vira responsabilidade explícita do código:** service-role bypassa RLS, então **toda** query DEVE filtrar `tenant_id` (já filtram hoje; manter e nunca remover). O `tenant_id` vem sempre do `profile` autenticado da sessão — nunca de input do request (mesma nota de contrato do defer de `readTenantICP`, 22.7).

### Contrato de reuso (não reinventar)

- **`createAdminClient()`** — [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts): lança se `SUPABASE_SERVICE_ROLE_KEY` ausente → envolver em try/catch e tratar (padrão 22.7 `readTenantICP`).
- **`decryptApiKey`** — [src/lib/crypto/encryption.ts](src/lib/crypto/encryption.ts) (já usado em todos os pontos).
- **Padrão fail-open service-role** — [contextual-suggestions.ts:41-47](src/lib/agent/contextual-suggestions.ts#L41) (Story 22.7) e [opportunities/[opportunityId]/suggestion/route.ts:120](src/app/api/opportunities/[opportunityId]/suggestion/route.ts#L120) (Story 21.5).
- **`profile.tenant_id`** via `getCurrentUserProfile` / o profile já resolvido nas rotas do agente.

### Traps (armadilhas)

- **Trap #1 — Não trocar o client de tudo.** Só a leitura de `api_configs` migra para service-role. As demais queries do agente (agent_executions, agent_steps, leads, etc.) DEVEM continuar no client de sessão para respeitar RLS por tenant. Trocar o orchestrator inteiro para admin seria um furo de isolamento.
- **Trap #2 — `getServiceApiKey` recebe o client por parâmetro.** A assinatura passa um `SupabaseClient` de fora ([step-utils.ts:12](src/lib/agent/steps/step-utils.ts#L12)). Só trocar o client passado NÃO basta se o mesmo client é reusado para outras queries dentro do orchestrator. Preferir: o helper cria o admin client internamente **só para a leitura da chave**, e o orchestrator segue com o client de sessão para o resto.
- **Trap #3 — O mock não prova RLS.** Toda a suíte mocka o Supabase; ela passou verde com o bug em produção. A prova real do AC1 é o teste de contrato com papel `sdr` real (ou o smoke da Task 5). Documentar isso, como nas Stories 21.5/22.7.
- **Trap #4 — PII/segredo em log.** Nunca logar `encrypted_key` nem a chave decriptada (lição 13.11: `details` de erro trazia telefone/corpo). Logar no máximo o `service_name` e um código de erro.

### O que preservar (invariantes / zero regressão — NFR4)

- Contrato de erro atual: código `API_KEY_MISSING` + status `422` quando a chave realmente não existe; mensagens "Chave X nao configurada" — a mudança é a **fonte** da leitura, não o contrato.
  - **Ressalva levantada no code review (2026-07-23):** o caminho de *falha de decriptação* **mudou**, e a mudança é intencional. Antes, `decryptApiKey` estourava sem tratamento (500 genérico); agora existe `decrypt_error` com mensagem própria (`Erro ao decriptar a API key do X`) e, no `execute/route.ts` e no `fetch-leads/route.ts`, um `500 API_KEY_ERROR` estruturado. O invariante preservado byte-a-byte é o do **422 / chave ausente**; o de decrypt foi deliberadamente melhorado para que uma chave corrompida nunca se disfarce de "não configurada".
- Comportamento para admin (gestor/diretor) byte-a-byte idêntico (eles já liam com sucesso; agora leem via admin client — mesmo resultado).
- Pipeline determinístico, `canProceed`, `skipSteps`, `nextAction` (Stories 22.1/22.3) intocados.
- **NFR5 — zero migration.** A RLS de `api_configs` NÃO muda; nenhuma coluna/tabela/policy nova. A correção é 100% no código de aplicação (runtime do agente).

### Project Structure Notes

- Arquivo novo provável: `src/lib/agent/service-keys.ts` (helper server-only centralizado). Arquivos alterados: os 3 route handlers do agente + `step-utils.ts` + `create-campaign-step.ts` (só a leitura de chave). Sem componente, sem rota nova, sem migration.
- Testes: novo teste do helper + repontar mocks das rotas do agente (padrão 22.7) + teste de contrato RLS (ou smoke documentado).

### Testing standards

- Framework: **Vitest** (`npx vitest run`). ESLint `no-console` (permite `warn`/`error`) e `--max-warnings=0`; `tsc` limpo nos arquivos tocados (há 181 erros pré-existentes em `__tests__/types|migrations` fora do escopo — não regredir os de `src/`).
- Baseline: 397 files / 6914 pass / 2 skip / 0 fail (pós-patch 22.7).
- Lição sistêmica (retro Epic 21, def-de-pronto): teste de contrato para o que o mock não cobre (aqui, RLS) + smoke de story visual/operacional. Ver [deferred-work.md](deferred-work.md) e sprint-status chaves `21-5`/`22-7`.

### References

- [Source: deferred-work.md#🔴 CRÍTICO — descoberto no smoke manual da Story 22.7] — descrição original do achado.
- [Source: src/app/api/agent/briefing/parse/route.ts#L184-L226] — leitura da chave OpenAI (client de sessão).
- [Source: src/app/api/agent/briefing/parse-product/route.ts#L87-L107] — segundo ponto (openai).
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L59-L104] — theirstack + orchestrator recebe client de sessão.
- [Source: src/lib/agent/steps/step-utils.ts#L12-L28] — `getServiceApiKey` recebe o client do caller.
- [Source: src/lib/agent/steps/create-campaign-step.ts#L306-L329] — `getOpenAIApiKey`/`getApifyApiKey`.
- [Source: supabase/migrations/00005_api_configs_rls.sql#L14-L20] — RLS admin-only (a preservar).
- [Source: src/lib/auth/capabilities.ts#L14-L22] — `ADMIN_ROLES` = gestor/diretor; SDR não é admin.
- [Source: src/lib/agent/contextual-suggestions.ts#L41-L67] — padrão service-role fail-open (Story 22.7/D3, mesmo padrão a espelhar).
- [Source: src/lib/supabase/admin.ts] — `createAdminClient` (lança sem service-role key).
- Lição sistêmica: sprint-status chaves `21-5`/`22-7` — mock não simula RLS; suíte verde não prova a tela.

### Mapa final das leituras de chave no runtime do agente (Task 1)

Varredura `from("api_configs")` + `getServiceApiKey(` em `src/app/api/agent/**` e `src/lib/agent/**`, **mais** a varredura em `src/` inteiro para achar leituras indiretas (foi o que expôs o ponto silencioso #6).

| # | Ponto | Chave | Antes | Depois |
|---|---|---|---|---|
| 1 | `api/agent/briefing/parse/route.ts` | openai | sessão | `readServiceApiKey` |
| 2 | `api/agent/briefing/parse-product/route.ts` | openai | sessão | `readServiceApiKey` |
| 3 | `api/agent/executions/[id]/steps/[n]/execute/route.ts` | theirstack | sessão | `readServiceApiKey` |
| 4 | `lib/agent/steps/step-utils.ts` (`getServiceApiKey`) → callers `orchestrator:229`, `activate-step:66`, `export-step:131` | instantly | client do caller (sessão) | `requireServiceApiKey` (parâmetro do client REMOVIDO) |
| 5 | `lib/agent/steps/create-campaign-step.ts` (`getOpenAIApiKey`/`getApifyApiKey`) | openai, apify | `this.supabase` (sessão) | `requireServiceApiKey` / `getServiceApiKeyOrNull` |
| 6 | **PONTO SILENCIOSO** — `ApolloService.getApiKey` (`lib/services/apollo.ts:105`) cria o **próprio** `createClient()` de sessão. Instanciado pelo agente em `search-leads-step:97`, `create-campaign-step:102` e `api/agent/.../fetch-leads/route.ts:129` | apollo | sessão (interna ao service) | chave lida por service-role e **injetada** no construtor (`new ApolloService(tenantId, apiKey)`) |

- **Fora do escopo (verificado):** `confirm/route.ts`, `agent-plan-generator` e `agent-cost-estimator` são 100% determinísticos — não leem `api_configs`. `SignalHireService` **não** é usado pelo runtime do agente (só por `api/integrations/signalhire/*`).
- **Fora do escopo (registrado em [deferred-work.md](deferred-work.md)):** ~30 rotas/serviços NÃO-agente ainda leem `api_configs` pela sessão (leads/ai/campaigns/instantly/integrations/snovio/whatsapp) — mesma classe de bug, mas mexer nelas é decisão de superfície de acesso (Epic 20), não defeito do agente.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- **RED provado (AC1)** — repontar `briefing-parse.test.ts` para simular a RLS do `sdr` (sessão devolve zero linhas em `api_configs`, admin devolve a linha) fez **32 de 39 testes falharem com `422`** contra o código antigo. Depois do fix: 39/39 verdes. É o mesmo 422 que o smoke da 22.7 capturou na tela.
- RED equivalente em `briefing-parse-product.test.ts` + `executions-steps-execute.test.ts`: 11 falhas → 27/27 verdes pós-fix.
- Evidência de que o teste de contrato estático teria pego o bug: `git show HEAD:src/lib/agent/steps/step-utils.ts | grep -c api_configs` → 2; idem `parse/route.ts` → 1 (hoje: 0 em todo o runtime do agente fora do helper).
- Baseline `tsc --noEmit` medida com `git stash` antes das mudanças: **182 erros** (todos pré-existentes em `__tests__/`). Depois: **182**, sendo **0 em `src/`**.
- Smoke real: screenshot `story-22-9-smoke-sdr-plano.png` (raiz, gitignored). Único erro de console = hydration mismatch PRÉ-EXISTENTE do submenu Leads da Sidebar (gotcha documentado na skill `verify`).

### Completion Notes List

- **Causa-raiz fechada:** o runtime do agente lia `api_configs` com o client de sessão; a RLS admin-only (`00005`) devolve zero linhas para `sdr` **em silêncio** → `422 API_KEY_MISSING` em toda mensagem. Agora a leitura é sempre service-role, centralizada em `src/lib/agent/service-keys.ts`.
- **Contrato do helper:** `readServiceApiKey` devolve união discriminada `ok | missing | decrypt_error`. Os três estados existem para **preservar o contrato de erro atual**: `missing` → 422 "não configurada" (inclusive quando falta a service-role key no ambiente, AC4), `decrypt_error` → 500 `API_KEY_ERROR`. Wrappers: `getServiceApiKeyOrNull` (fail-open, Apify/Apollo) e `requireServiceApiKey` (lança com a mensagem de hoje, "API key do X nao configurada").
- **AC3 respeitado:** nenhuma linha de SQL/migration. A RLS admin-only continua intocada e Settings → Integrações segue admin-only (confirmado na tela: a sidebar do `ccase` não tem "Configurações" nem "Technographic").
- **Trap #1 respeitado:** só a leitura de `api_configs` migrou. O `DeterministicOrchestrator` continua recebendo o client de **sessão** (teste de contrato trava isso), e todas as demais queries do pipeline seguem sob RLS por tenant.
- **Trap #2 resolvido de forma estrutural:** o parâmetro `SupabaseClient` de `getServiceApiKey` foi **removido** da assinatura — não dá mais para "passar o client errado". Os 3 callers foram atualizados.
- **Achado além do mapa da story:** `ApolloService` (e `SignalHireService`) criam o próprio client de sessão para ler a chave. O agente usa Apollo em 3 pontos → o pipeline do SDR morreria no step de busca de leads mesmo com os 5 pontos originais corrigidos. Fix cirúrgico: parâmetro opcional `apiKey` no construtor + injeção nos 3 pontos do agente; **as demais superfícies ficam byte-a-byte como hoje** (mudar todas seria decisão de acesso do Epic 20 — registrado em deferred-work).
- **Resolvido de passagem:** 2 `no-non-null-assertion` PRÉ-EXISTENTES em `apollo.ts` (linhas 277 e 577) — o hook de pre-commit linta o arquivo inteiro com `--max-warnings=0` e bloquearia o commit. Fix sem mudança de comportamento (const narrowada + `flatMap`).
- **Limite honesto do que foi provado:** o smoke cobriu o `/parse` (AC1) e o fluxo até o gate de aprovação. As leituras do **pipeline pago** (theirstack/apollo/instantly no `Iniciar Execução`) não foram disparadas ao vivo por guardrail de custo — estão cobertas por unit + teste de contrato, e usam exatamente o mesmo helper já provado ao vivo no `/parse`.
- Testes: **+36** (2 arquivos novos: 20 do helper + 7 de contrato; +9 repontados/novos nas rotas). Suíte: **399 files / 6950 pass / 2 skip / 0 fail** (baseline 397/6914 → zero regressão). `tsc` 0 erros em `src/`; `eslint --max-warnings=0` limpo em todos os arquivos tocados.

### File List

**Novos**
- `src/lib/agent/service-keys.ts`
- `__tests__/unit/lib/agent/service-keys.test.ts`
- `__tests__/unit/lib/agent/service-keys-contract.test.ts`

**Modificados (código)**
- `src/app/api/agent/briefing/parse/route.ts`
- `src/app/api/agent/briefing/parse-product/route.ts`
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts`
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts`
- `src/lib/agent/steps/step-utils.ts`
- `src/lib/agent/steps/create-campaign-step.ts`
- `src/lib/agent/steps/search-leads-step.ts`
- `src/lib/agent/steps/activate-step.ts`
- `src/lib/agent/steps/export-step.ts`
- `src/lib/agent/orchestrator.ts`
- `src/lib/services/apollo.ts`

**Modificados (testes)**
- `__tests__/unit/api/agent/briefing-parse.test.ts`
- `__tests__/unit/api/agent/briefing-parse-product.test.ts`
- `__tests__/unit/api/agent/executions-steps-execute.test.ts`
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts`
- `__tests__/unit/lib/agent/steps/export-step.test.ts`

**Modificados (artefatos)**
- `_bmad-output/implementation-artifacts/22-9-agente-chaves-de-servico-service-role-para-sdr.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-23 | Story 22.9 implementada (dev-story): helper server-only `service-keys.ts` centraliza a leitura de `api_configs` via service-role; 6 pontos do runtime do agente repontados (incl. o ponto silencioso do `ApolloService`); assinatura de `getServiceApiKey` sem client; RLS e contrato de erro intocados; +36 testes (suíte 399/6950/2 skip/0 fail); smoke real como SDR `ccase@tdec.com.br` → `/parse` 200. Status → review. |
