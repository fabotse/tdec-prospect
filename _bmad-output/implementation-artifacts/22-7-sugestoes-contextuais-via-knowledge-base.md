---
baseline_commit: 205c784949fd4fa641cd3dc9b63d42f9b0ee45e4
---

# Story 22.7: Sugestões Contextuais via Knowledge Base (Opcional)

Status: done

> **STORY OPCIONAL (decisão D4 do Epic 22 / FR13).** Não bloqueia o épico — só entra "se sobrar espaço". Todas as outras stories do Epic 22 (22.1–22.6, 22.8) já estão `done`. Escopo deliberadamente pequeno e de baixo risco: melhora a QUALIDADE das sugestões de cargo/setor que o agente já dá hoje, sem tocar em `canProceed`, pipeline ou schema.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want que as sugestões de cargos e setores reflitam o meu negócio,
so that o agente me guie com opções relevantes ao meu ICP em vez de listas genéricas.

## Acceptance Criteria

1. **Given** o tenant tem ICP/perfil na Knowledge Base (seção `icp` de `knowledge_base` com `job_titles`/`industries`) **When** o agente sugere cargos/setores (fluxo que hoje chama `BriefingSuggestionService.generateSuggestions`) **Then** as sugestões derivam do ICP (via heurística sobre a KB — LLM leve é opcional/deferido), **não** dos mapas estáticos genéricos
2. **Given** a KB vazia, ICP sem `job_titles`/`industries`, ou qualquer falha na derivação **Then** fallback **silencioso** pros mapas estáticos atuais (`TECH_TO_TITLES`/`INDUSTRY_TO_TITLES`/`INDUSTRY_TO_TECH`/`DEFAULT_JOB_TITLES`) — fail-open, nunca 500, nunca lista vazia
3. **Given** a latência da sugestão **Then** não degrada o `< 5s` do turno (NFR2). Na abordagem heurística recomendada não há chamada de rede adicional; **se** a implementação optar por LLM, cachear a derivação por execução (in-memory por `executionId`, zero migration)
4. Testes unitários: derivação do ICP (mock da leitura de KB), fallback silencioso quando KB vazia/erro, e — se LLM for usado — cache por execução

## Tasks / Subtasks

- [x] **Task 1 — Leitura do ICP server-side, fail-open** (AC: #1, #2)
  - [x] Criar helper server-only que lê a seção `icp` de `knowledge_base` para o tenant e devolve `{ jobTitles: string[]; industries: string[] }` (ou vazio). **NÃO** usar `loadKBContext` (ela retorna `null` quando `company.business_description` está ausente — ver **Trap #2**); ler `knowledge_base` `section='icp'` diretamente. → `readTenantICP` em [src/lib/agent/contextual-suggestions.ts](src/lib/agent/contextual-suggestions.ts) lê `section='icp'` direto.
  - [x] Usar `createAdminClient()` (service-role) para a leitura do ICP, com o mesmo padrão fail-open da rota de opportunity-suggestion (`createAdminClient` em `try/catch` → se indisponível, cai no estático). **Motivo:** RLS `is_admin()` em `knowledge_base` mata a leitura para SDR (lição da Story 21.5 — ver **Trap #1**). → `createAdminClient()` em try/catch; sem service-role → `EMPTY_ICP`.
  - [x] Qualquer erro/ausência → retornar vazio (o caller decide o fallback estático). → try/catch na query + guard de shape não-array; sempre `{ jobTitles: [], industries: [] }` no pior caso.
- [x] **Task 2 — Derivação heurística ICP → sugestões** (AC: #1, #2)
  - [x] Nova função (recomendado: em `briefing-suggestion-service.ts` como export puro testável, ex.: `deriveSuggestionsFromICP(icp, briefing)`) que, quando o briefing precisa de `jobTitles` (mesma condição de hoje: `!briefing.jobTitles?.length`), preenche `suggestions.jobTitles` a partir de `icp.job_titles` (cap 6, dedup), e `suggestions.technology`/setor a partir de `icp.industries` (reusando `INDUSTRY_TO_TECH` quando o setor do ICP casar, senão o setor cru). → `deriveSuggestionsFromICP` (export puro/síncrono) em [src/lib/agent/briefing-suggestion-service.ts](src/lib/agent/briefing-suggestion-service.ts).
  - [x] Se o ICP não fornecer material suficiente para um campo → esse campo cai no estático (`BriefingSuggestionService.generateSuggestions`). Merge deve preservar o formato atual: `Record<string, string[]>`. → só preenche campo com material; `resolveContextualSuggestions` faz `{ ...static, ...derived }`.
- [x] **Task 3 — Ligar no ponto de consumo server-side** (AC: #1, #2, #3)
  - [x] Em `src/app/api/agent/briefing/parse/route.ts:275`, trocar a chamada estática por uma derivação KB-first com fallback estático (ex.: `const suggestions = await resolveContextualSuggestions(resolvedBriefing, profile.tenant_id)`, onde a função internamente tenta ICP e cai no estático). **Preservar** o tipo de retorno `suggestions: Record<string, string[]>` de `BriefingParseResponse` (linha 48). → feito; import trocado de `BriefingSuggestionService` para `resolveContextualSuggestions`.
  - [x] **NÃO** alterar `canProceed`, `missingFields`, `skipSteps`, `nextAction` nem qualquer decisão determinística (NFR1). Sugestão é conteúdo de conversa, não gate. → intocado; só a linha de `suggestions` mudou.
  - [x] Manter o `< 5s`: na heurística não há custo; se optar por LLM, aplicar cache por `executionId` + `AbortSignal.timeout` curto e fail-open no catch. → **heurística escolhida (D2)**: nenhuma chamada de LLM, sem cache. Só a leitura fail-open do ICP.
- [x] **Task 4 — Client fast-path permanece estático (decisão D5)** (AC: #2)
  - [x] O fast-path de ajuda em `use-briefing-flow.ts:892` (`BriefingSuggestionService.generateSuggestions(state.briefing)`) é **client-side síncrono** e **não** tem acesso a Supabase/tenant. Mantê-lo estático (ou, opcionalmente, reusar `state.suggestions` já devolvido pela última `/parse`). **Não** transformar o service em async — quebraria o import client. Documentar a decisão no código. → mantido estático; comentário D5/Trap #3 adicionado em [src/hooks/use-briefing-flow.ts](src/hooks/use-briefing-flow.ts).
- [x] **Task 5 — Testes** (AC: #4)
  - [x] `briefing-suggestion-service.test.ts`: derivação do ICP (mock do ICP com `job_titles`/`industries` → sugestões refletem o ICP), fallback quando ICP vazio/parcial (cai no estático, campos não vazios), dedup/cap 6. → +7 testes de `deriveSuggestionsFromICP`.
  - [x] Teste do ponto de consumo (rota ou helper `resolveContextualSuggestions`): KB presente → ICP; KB ausente/`createAdminClient` lança → estático (fail-open), sem 500. → novo [__tests__/unit/lib/agent/contextual-suggestions.test.ts](__tests__/unit/lib/agent/contextual-suggestions.test.ts) (9 testes: KB presente, KB ausente, createAdminClient lança, shape inesperado, ICP parcial).
  - [x] ~~Se LLM implementado: teste de cache por execução~~ → N/A: heurística pura (D2), sem LLM/cache.
  - [x] Rodar suíte inteira: `npx vitest run` — zero regressão (baseline atual 396 files / 6896 pass / 2 skip / 0 fail). → **397 files / 6912 pass / 2 skip / 0 fail** (+1 file, +16 testes; zero regressão).

## Dev Notes

### Contexto e diagnóstico (o que a story realmente muda)

Hoje `BriefingSuggestionService.generateSuggestions` ([src/lib/agent/briefing-suggestion-service.ts](src/lib/agent/briefing-suggestion-service.ts)) é 100% **estático**: mapas fixos `TECH_TO_TITLES` / `INDUSTRY_TO_TITLES` / `INDUSTRY_TO_TECH` + `DEFAULT_JOB_TITLES`. Um tenant de fintech e um de agro recebem exatamente a mesma sugestão de cargo quando não há tech/setor casando. Esta story faz as sugestões **derivarem do ICP do tenant** (que já existe na Knowledge Base, seção `icp`, com `job_titles[]` e `industries[]`), mantendo os mapas estáticos como **fallback fail-open**.

**Escopo cirúrgico:** melhora a fonte das sugestões. **NÃO** toca em `canProceed`, `missingFields`, `skipSteps`, pipeline de execução, schema, migrations ou componentes visuais.

### Decisões de design (guardrails para o dev)

- **D1 — Derivação KB vive SERVER-SIDE.** O único ponto com acesso a Supabase + `tenant_id` é a rota `parse/route.ts` (linha 275, onde `generateSuggestions` já é chamado). É lá que a derivação do ICP acontece. O client (`use-briefing-flow.ts`) continua consumindo `result.suggestions` da resposta (já faz isso em [use-briefing-flow.ts:511](src/hooks/use-briefing-flow.ts#L511)).
- **D2 — HEURÍSTICA primeiro, LLM opcional.** A AC1 aceita "via LLM leve **ou** heurística sobre a KB". A heurística (mapear `icp.job_titles` → sugestões diretamente) é **instantânea, sem custo, sem cache, fail-open trivial** e satisfaz AC1/AC2/AC3/AC4. **Recomendação forte: implementar só a heurística.** O caminho LLM é ganho marginal (o ICP já é uma lista curada de cargos) com custo real de latência/dinheiro/cache — deixar como evolução futura. Se o dev implementar LLM mesmo assim, AC3 exige cache por execução.
- **D3 — Ler ICP com client admin (service-role).** RLS `is_admin()` em `knowledge_base` faz a leitura **nascer morta para o SDR** — exatamente o bug nº1 da Story 21.5 (mock de KB não simula RLS → suíte verde, tela quebrada). Espelhar o padrão de [suggestion/route.ts:120-127](src/app/api/opportunities/[opportunityId]/suggestion/route.ts#L120): `createAdminClient()` em `try/catch`, e se o service-role estiver ausente → fail-open pro estático (não 500).
- **D4 — Derivar só quando falta o campo.** Manter a condição atual: só sugerir `jobTitles` quando `!briefing.jobTitles?.length` (mesma porta de `generateSuggestions:133`). Não sobrescrever o que o usuário já informou.
- **D5 — Client fast-path fica estático.** [use-briefing-flow.ts:892](src/hooks/use-briefing-flow.ts#L892) chama o service síncrono no client (ajuda offline). **Não** tornar o service async — quebra o import client-side e o `generateSmartQuestion(s)` que depende dele. A melhoria KB-first vale para o caminho principal (server); o fast-path de ajuda mantém o estático como rede.

### Contrato de reuso (não reinventar)

- **`createAdminClient()`** — `@/lib/supabase/admin` (usado em [suggestion/route.ts:4,122](src/app/api/opportunities/[opportunityId]/suggestion/route.ts#L4)). Lança se `SUPABASE_SERVICE_ROLE_KEY` ausente → envolver em `try/catch` e fail-open.
- **Leitura do ICP** — `knowledge_base` `section='icp'`, campo `content` (JSONB) → `ICPDefinition` (`{ industries: string[]; job_titles: string[]; pain_points?... }`, ver [src/types/knowledge-base.ts:241-244](src/types/knowledge-base.ts#L241)). `loadKBContext` ([monitoring-processor.ts:192](src/lib/utils/monitoring-processor.ts#L192)) já lê essa seção, **mas** retorna `null` quando `company.business_description` está ausente (linha 204) — inadequado para derivar SÓ do ICP. Ler a seção `icp` diretamente.
- **Padrão LLM leve fail-open (SE usado)** — espelhar [approach-suggestion.ts](src/lib/utils/approach-suggestion.ts): `fetch` direto pra OpenAI, `gpt-4o-mini`, `AbortSignal.timeout(...)`, `getApiKey(supabase, tenantId, "openai")` ([monitoring-processor.ts:136](src/lib/utils/monitoring-processor.ts#L136)). Custo → `logMonitoringUsage(supabase, { serviceName: "openai", ... })` ([monitoring-processor.ts:99](src/lib/utils/monitoring-processor.ts#L99)); `service_name='openai'` já é aceito no CHECK de `api_usage_logs` desde a migração 00058 (Story 21.3).
- **Prompt (SE LLM)** — constante em `CODE_DEFAULT_PROMPTS` ([src/lib/ai/prompts/defaults.ts](src/lib/ai/prompts/defaults.ts)) com fallback tenant→global→código, padrão `loadSuggestionPromptTemplate` de [approach-suggestion.ts:65](src/lib/utils/approach-suggestion.ts#L65).

### Traps (armadilhas que já morderam o projeto)

- **Trap #1 — RLS de KB mata SDR (Story 21.5).** Ler `knowledge_base`/`api_configs`/`ai_prompts` com o client de cookie (`createClient`) faz a leitura falhar silenciosamente para papéis não-admin. O agente é usado por SDR. → usar `createAdminClient` para o contexto (D3). O mock de teste **não** simula RLS: a suíte pode passar e a tela quebrar para o SDR. Documentar isso na Task 5.
- **Trap #2 — `loadKBContext` retorna null sem company.** Ela gateia em `company.business_description` (linha 204). Um tenant com ICP preenchido mas sem descrição de empresa retornaria `null` e você perderia o ICP. → ler a seção `icp` diretamente, não via `loadKBContext`.
- **Trap #3 — Não transformar o service em async (D5).** `briefing-suggestion-service.ts` é importado no client ([use-briefing-flow.ts:17](src/hooks/use-briefing-flow.ts#L17)) e usado síncrono em `generateSmartQuestion`. A derivação KB (async, server) precisa ser uma função **separada**/server-only; a `generateSuggestions` estática permanece pura e síncrona.
- **Trap #4 — Formato de retorno.** `suggestions` é `Record<string, string[]>` e é lido em [use-briefing-flow.ts:511/155](src/hooks/use-briefing-flow.ts#L511) via `result.suggestions[field] ?? []`. Manter as chaves `jobTitles`/`technology`. Não devolver strings soltas nem `null`.

### O que preservar (invariantes / zero regressão — NFR4)

- `canProceed = (hasJobTitles && hasLocation) || isImportedLeadsFlow` ([parse/route.ts:103](src/app/api/agent/briefing/parse/route.ts#L103)) — **intocado**.
- Canonicalização de `skipSteps` / skip determinístico de `search_companies` quando tech null ([parse/route.ts:254-265](src/app/api/agent/briefing/parse/route.ts#L254)) — **intocado**.
- Todos os testes atuais de `BriefingSuggestionService` (17 casos em [briefing-suggestion-service.test.ts](__tests__/unit/lib/agent/briefing-suggestion-service.test.ts)) continuam verdes — a `generateSuggestions` estática não muda de comportamento; a derivação KB é caminho novo por cima.
- **NFR5 — zero migration.** ICP já vive em `knowledge_base` (seção `icp`); cache (se houver) é in-memory. Nenhuma coluna/tabela nova.

### Project Structure Notes

- Arquivo novo/alterado principal: [src/lib/agent/briefing-suggestion-service.ts](src/lib/agent/briefing-suggestion-service.ts) (add derivação pura testável) + [src/app/api/agent/briefing/parse/route.ts](src/app/api/agent/briefing/parse/route.ts) (ligar a derivação KB-first). Opcionalmente um helper server-only `contextual-suggestions.ts` em `src/lib/agent/` para a leitura do ICP + orquestração fail-open (mantém a rota magra).
- Testes: estender [__tests__/unit/lib/agent/briefing-suggestion-service.test.ts](__tests__/unit/lib/agent/briefing-suggestion-service.test.ts) e/ou novo teste do helper server-only.
- Sem novos componentes, sem rota nova, sem migration.

### Testing standards

- Framework: **Vitest** (`npx vitest run`). ESLint com `no-console` e `--max-warnings=0`; `tsc` limpo nos arquivos tocados (há 181 erros pré-existentes em `__tests__/types|migrations` fora do escopo — não regredir os de `src/`).
- Mockar a leitura de Supabase/`createAdminClient` no teste do helper. Lembrar (Trap #1): o mock **não** prova RLS — a validação real de que o SDR recebe sugestões KB é smoke manual (opcional aqui, já que a story é opcional).
- Padrão de mock factory centralizado em test utils (ver testes existentes de rota do agente).

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.7] — FR13, ACs 1-4, "opcional (D4)".
- [Source: src/lib/agent/briefing-suggestion-service.ts] — mapas estáticos atuais + `generateSuggestions`.
- [Source: src/app/api/agent/briefing/parse/route.ts#L275] — ponto de consumo server-side.
- [Source: src/hooks/use-briefing-flow.ts#L892] — fast-path de ajuda client-side (D5).
- [Source: src/app/api/opportunities/[opportunityId]/suggestion/route.ts#L120-176] — padrão `createAdminClient` fail-open + `getApiKey` + `loadKBContext`/`logMonitoringUsage` (reuso).
- [Source: src/lib/utils/monitoring-processor.ts#L136-228] — `getApiKey`, `loadKBContext`, `logMonitoringUsage`.
- [Source: src/lib/utils/approach-suggestion.ts] — padrão de chamada LLM leve fail-open (SE optar por LLM).
- [Source: src/types/knowledge-base.ts#L241] — `ICPDefinition`.
- Lição sistêmica: sprint-status chave `22-5`/`21-5` — mock não simula RLS/strip/constraint; suíte verde não prova a tela.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story, Amelia)

### Debug Log References

- Regressão detectada na 1ª execução dos testes da rota `parse` (27/27 falhas, 500): o teste `briefing-parse.test.ts` mockava `@/lib/agent/briefing-suggestion-service` de forma parcial (só `BriefingSuggestionService`, sem `deriveSuggestionsFromICP`). Como a rota passou a importar `resolveContextualSuggestions` do novo helper — que importa a função pura do service —, o mock incompleto deixava `deriveSuggestionsFromICP === undefined` e a chamada estourava dentro do try/catch da rota (→ 500). **Fix:** repontar o mock do teste para `@/lib/agent/contextual-suggestions` (`resolveContextualSuggestions`), mantendo `mockGenerateSuggestions` como fonte do retorno — assertions de `suggestions` inalteradas. Verde após o fix.
- `briefing-parse-product.test.ts` **não** mocka nenhuma dessas dependências e passou sem edição — prova ponta-a-ponta do fail-open: `createAdminClient()` sem service-role/env no ambiente de teste lança → catch do helper → ICP vazio → estático → 200.

### Completion Notes List

- **FR13 entregue por heurística pura (D2), sem LLM/custo/cache.** As sugestões de cargo/setor da rota `/api/agent/briefing/parse` passam a derivar do ICP do tenant (`knowledge_base` `section='icp'`) quando há material, com fallback **fail-open** silencioso pros mapas estáticos (`TECH_TO_TITLES`/`INDUSTRY_TO_TITLES`/`INDUSTRY_TO_TECH`/`DEFAULT_JOB_TITLES`).
- **Arquitetura em 2 camadas (respeita Trap #3):** a parte pura/síncrona (`deriveSuggestionsFromICP`) vive na `BriefingSuggestionService` (continua client-safe, importada síncrona no hook); a orquestração server-only (leitura Supabase + merge) vive no novo `contextual-suggestions.ts`. O service **não** virou async.
- **D3/Trap #1 (lição 21.5):** leitura do ICP com `createAdminClient()` (service-role) em try/catch — RLS `is_admin()` em `knowledge_base` mata a leitura para SDR. Sem service-role key → fail-open pro estático, nunca 500.
- **D4:** só deriva `jobTitles` quando o briefing ainda não tem cargos; `technology` só quando não há technology. Merge por campo (`{ ...static, ...derived }`) → campo sem material do ICP cai no estático (AC2).
- **NFR1 preservado:** `canProceed`/`missingFields`/`skipSteps`/`nextAction` intocados — só a origem de `suggestions` mudou. **NFR5:** zero migration (ICP já vive na KB).
- **⚠️ Pendências (padrão Epic 21):** (1) **code-review** (recomendado outro LLM); (2) o mock **não** simula RLS — a prova real de que o SDR recebe sugestões derivadas do ICP é **smoke manual** pela tela (opcional, já que a story é opcional). A suíte verde garante a orquestração/fail-open, não a leitura real sob RLS de sessão.

### File List

- `src/lib/agent/contextual-suggestions.ts` (novo) — helper server-only: `readTenantICP` (fail-open) + `resolveContextualSuggestions` (KB-first + merge).
- `src/lib/agent/briefing-suggestion-service.ts` (modificado) — add export puro `deriveSuggestionsFromICP` + tipo `ICPSuggestionInput` + helper interno `dedupeNonEmpty`.
- `src/app/api/agent/briefing/parse/route.ts` (modificado) — troca `BriefingSuggestionService.generateSuggestions` (síncrono) por `await resolveContextualSuggestions(...)` (KB-first); import ajustado.
- `src/hooks/use-briefing-flow.ts` (modificado) — comentário documentando D5/Trap #3 no fast-path de ajuda (permanece estático).
- `__tests__/unit/lib/agent/contextual-suggestions.test.ts` (novo) — 9 testes (readTenantICP fail-open x4; resolveContextualSuggestions KB-first/fallback x4... AC1/AC2).
- `__tests__/unit/lib/agent/briefing-suggestion-service.test.ts` (modificado) — +7 testes de `deriveSuggestionsFromICP` (derivação, D4, dedup/cap 6, setor cru, parcial, vazio).
- `__tests__/unit/api/agent/briefing-parse.test.ts` (modificado) — mock repontado de `briefing-suggestion-service` para `contextual-suggestions` (a rota agora chama o helper).

### Change Log

- 2026-07-22 — Story 22.7 (dev-story): FR13 sugestões contextuais via ICP (Knowledge Base) implementadas por heurística pura (D2), com fallback fail-open pros mapas estáticos. 2 arquivos de código novos/tocados de lógica + 3 de teste. ZERO migration/rota/componente. Suíte 397 files / 6912 pass / 2 skip / 0 fail; tsc/eslint limpos nos tocados. Status → review. baseline 205c784.

## Review Findings

> Code review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo full, 2026-07-22. **Acceptance Auditor: AC1-AC4 + D3/Traps #1-#4 + NFR1/5 VERIFICADOS EM CÓDIGO** — nenhuma violação de spec. Verificação independente: 68 testes verdes (3 arquivos), `tsc` limpo nos tocados, `contextual-suggestions.ts` só importado server-side (sem vazamento client), `console.error` permitido pelo ESLint. Blind+Edge convergiram no P1 (furo do fail-open) — que o próprio Auditor considerou "estruturalmente sólido" por não ter olhado elementos não-string. 1 decision-needed + 1 patch + 2 defers + 4 dismiss.

- [x] [Review][Decision → RESOLVIDA: opção 1, manter como está] Sugestão do ICP (tenant-global) sobrescreve o sinal específico que o usuário acabou de digitar — **Decisão Fabossi (2026-07-22): manter o ICP prevalecendo por campo.** Razão: ICP vazio (caso comum) é no-op idêntico ao de hoje; ICP preenchido é a verdade curada do tenant e deve prevalecer mesmo sobre match específico do turno (o estático é palpite de mercado hardcoded). Sub-caso "setor cru como technology" (ex.: Mineração) fica como verdinho conhecido, não vale o custo de lógica de merge extra numa story opcional. — Merge `{ ...static, ...derived }` ([contextual-suggestions.ts:90](../../src/lib/agent/contextual-suggestions.ts#L90)) faz o ICP prevalecer POR CAMPO. Quando o usuário digita algo ESPECÍFICO no turno (ex.: technology="netskope" → estático deriva `[CISO, Head de Segurança, ...]` via `TECH_TO_TITLES`; ou industry="fintech" → estático deriva tech `[Stripe, Plaid, ...]`), a lista curada do ICP (ex.: `job_titles=[Comprador, Analista]`; `industries=[saude]`) SUBSTITUI a sugestão contextual mais afiada. A story (AC1/"KB prevalece por campo") pede que o ICP prevaleça sobre os mapas GENÉRICOS — mas não decidiu conscientemente o caso de sobrescrever um match específico do que o usuário acabou de dizer. Sub-caso: setor cru do ICP não-mapeado (ex.: "Mineração") vira sugestão de *technology* e pode substituir a tech do setor que o usuário digitou. Precisa da decisão do Fabossi. Fonte: Blind Hunter + Edge Case Hunter.
- [x] [Review][Patch → APLICADO] Furo no fail-open: elemento não-string no JSONB do ICP → TypeError → 500 (viola AC2 "nunca 500") [src/lib/agent/contextual-suggestions.ts:60-63] — **Fix (2026-07-22):** novo helper `toStringArray` filtra não-arrays E elementos não-string na fronteira de leitura de `readTenantICP`, garantindo que `dedupeNonEmpty`/`deriveSuggestionsFromICP` (que fazem `raw.trim()`) nunca lancem → fail-open real. +2 testes RED→GREEN (ICP com `[123, null, {}, "CFO"]` → só strings; e `resolveContextualSuggestions` não lança ponta-a-ponta). Suíte 397/6914 pass/2 skip/0 fail; tsc/eslint limpos.
- [x] [Review][Defer] Leitura do ICP roda em TODO turno do `/parse`, mesmo quando o briefing já tem cargo+tech (round-trip service-role inútil) [src/lib/agent/contextual-suggestions.ts:84-86] — deferred, hardening de eficiência (não pré-existente, mas não-bloqueante: 1 query indexada, NFR2 intacto)
- [x] [Review][Defer] `readTenantICP` é primitiva exportada que bypassa RLS (service-role) sem amarração do `tenantId` à sessão do caller [src/lib/agent/contextual-suggestions.ts:39] — deferred, sem vazamento vivo (único caller passa `profile.tenant_id` autenticado); falta só nota de contrato "caller DEVE passar o tenant autenticado"
