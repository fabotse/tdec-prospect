# Story 13.9: Verificacao Inicial ao Ativar Monitoramento

Status: done

## Story

As a Marco (SDR),
I want que uma verificacao inicial dos posts do LinkedIn seja feita automaticamente quando eu ativo o monitoramento de leads,
so that eu receba insights imediatos sem precisar esperar ate 7 dias pela proxima execucao programada.

## Acceptance Criteria

1. Nova API route `POST /api/monitoring/initial-scan` criada com autenticacao de sessao do usuario (nao cron secret)
2. Endpoint aceita `{ leadIds: string[] }` — processa apenas leads com `is_monitored = true` e `linkedin_url` preenchido
3. Processamento em batches de 5 leads (mesmo `BATCH_SIZE` do cron) com `Promise.allSettled` para evitar timeout
4. Para cada lead: busca posts via `ApifyService.fetchLinkedInPosts()`, atualiza `linkedin_posts_cache`, detecta posts novos, classifica relevancia (13.4), gera sugestao se relevante (13.5) — mesma logica do `processLead` existente
5. Resposta retorna resultado agregado: `{ totalProcessed, totalLeads, newPostsFound, insightsGenerated, errors[] }`
6. Frontend: apos ativacao de monitoramento (individual ou bulk), chama automaticamente `initial-scan` para os leads recem-ativados
7. UI exibe feedback de progresso durante o scan (toast com progresso ou indicador visual — ex: "Verificando posts... 5/41 leads") — **Nota: progresso numérico não implementado; toast loading + resultado final. Arquitetura de request única impossibilita progresso intermediário sem SSE/streaming. Aceito como limitação técnica.**
8. Se lead ja possui `linkedin_posts_cache` preenchido (ja foi escaneado antes), ainda assim processa para detectar posts novos desde o ultimo cache
9. Logging de uso na `api_usage_logs` (mesmo padrao do cron — Apify + OpenAI costs)
10. Se Apify key nao configurada, retorna erro claro antes de iniciar processamento
11. Testes unitarios para API route, hook e componente de progresso

## Tasks / Subtasks

- [x] Task 1: Extrair `processLead` para modulo reutilizavel (AC: #4)
  - [x] 1.1 Criar `src/lib/utils/monitoring-processor.ts` com funcao `processLead` extraida de `process-batch/route.ts`
  - [x] 1.2 Mover helpers associados: `loadKBContext`, `loadToneContext`, `logMonitoringUsage`, `getApiKey`
  - [x] 1.3 Parametrizar client Supabase como argumento (aceita service role e user session)
  - [x] 1.4 Atualizar `src/app/api/monitoring/process-batch/route.ts` para importar do novo modulo
  - [x] 1.5 Garantir que testes existentes de process-batch continuam passando sem alteracoes de logica
  - [x] 1.6 Testes unitarios para `monitoring-processor.ts`

- [x] Task 2: Criar API route `POST /api/monitoring/initial-scan` (AC: #1, #2, #3, #5, #9, #10)
  - [x] 2.1 Criar `src/app/api/monitoring/initial-scan/route.ts` com auth de sessao (`createClient` de `@/lib/supabase/server`)
  - [x] 2.2 Validacao Zod: `{ leadIds: z.array(z.string().uuid()).min(1).max(100) }`
  - [x] 2.3 Filtrar apenas leads com `is_monitored = true` e `linkedin_url` preenchido (query com RLS)
  - [x] 2.4 Verificar se Apify key existe antes de iniciar — retornar `{ error: "APIFY_KEY_MISSING" }` status 400
  - [x] 2.5 Processar em batches de 5 usando `processLead` do modulo extraido, sequencialmente
  - [x] 2.6 Retornar resultado agregado: `{ totalProcessed, totalLeads, newPostsFound, insightsGenerated, errors[] }`
  - [x] 2.7 Testes unitarios para a route (auth, validacao, batching, erros, Apify key missing)

- [x] Task 3: Criar hook `useInitialScan` (AC: #6, #7)
  - [x] 3.1 Adicionar hook em `src/hooks/use-lead-monitoring.ts` (mesmo arquivo dos hooks existentes)
  - [x] 3.2 `useMutation` que chama `POST /api/monitoring/initial-scan`
  - [x] 3.3 Toast de progresso durante scan: "Verificando posts dos leads..."
  - [x] 3.4 Toast final com resumo: "Scan concluido: X insights gerados" ou "Nenhum post novo encontrado"
  - [x] 3.5 Invalidar queries `["leads"]`, `["my-leads"]`, `["insights"]`, `["insights-new-count"]` ao concluir
  - [x] 3.6 Testes unitarios para o hook

- [x] Task 4: Integrar initial-scan nos fluxos de ativacao (AC: #6, #8)
  - [x] 4.1 Editar `useToggleMonitoring`: apos success com `isMonitored=true`, chamar `initialScan({ leadIds: [leadId] })`
  - [x] 4.2 Editar `useBulkToggleMonitoring`: apos success com `isMonitored=true`, chamar `initialScan({ leadIds })` com os IDs ativados
  - [x] 4.3 Scan nao bloqueia a UI — executa apos toggle retornar sucesso (fire-and-forget com feedback via toast)
  - [x] 4.4 Testes de integracao: toggle -> initial-scan chain

## Dev Notes

### Arquitetura & Decisoes Tecnicas

- **Extracao de `processLead` (Task 1) e o passo mais critico**: Todos os ~25 testes existentes de `process-batch` DEVEM continuar passando. Nenhuma mudanca de logica — apenas mover codigo para modulo compartilhado.
- **Auth diferente do cron**: `process-batch` usa `MONITORING_CRON_SECRET` + service role key. `initial-scan` usa sessao do usuario + `createClient()` de `@/lib/supabase/server`. A funcao `processLead` ja recebe client como argumento — funciona com ambos.
- **RLS**: O cron bypassa RLS (service role). O initial-scan usa sessao do usuario, RLS filtra por tenant automaticamente. Nao precisa de logica extra de tenant isolation.
- **Timeout**: Para 41 leads em batches de 5 = ~9 invocacoes sequenciais. Cada invocacao Apify leva ~2-5s. Possivel atingir timeout em Vercel (60s). Mitigacao: processar todos os batches dentro da request mas retornar resultado parcial se necessario (cursor pattern opcional, mesma arquitetura do cron).
- **Custo**: 41 leads = 41 chamadas Apify de uma vez. O toast deve informar que o scan consome creditos.
- **Sem duplicatas**: `detectNewPosts` compara por `postUrl`. Se o cron rodar logo depois do initial-scan, nao gera insights duplicados.

### Arquivos a tocar

| Arquivo | Acao |
|---|---|
| `src/lib/utils/monitoring-processor.ts` | **NOVO** — processLead + helpers extraidos |
| `src/app/api/monitoring/process-batch/route.ts` | **EDIT** — importar de monitoring-processor (remove funcoes locais) |
| `src/app/api/monitoring/initial-scan/route.ts` | **NOVO** — endpoint de scan inicial |
| `src/hooks/use-lead-monitoring.ts` | **EDIT** — adicionar useInitialScan, integrar nos hooks de toggle |
| `__tests__/unit/app/api/monitoring/initial-scan/route.test.ts` | **NOVO** — testes da API |
| `__tests__/unit/lib/utils/monitoring-processor.test.ts` | **NOVO** — testes do modulo extraido |
| `__tests__/unit/hooks/use-lead-monitoring.test.ts` | **EDIT** — testes do useInitialScan |

### Padroes existentes a seguir

- Zod validation no body: mesmo padrao de `bulk-monitor/route.ts` (array de UUIDs)
- `Promise.allSettled` para batch: mesmo padrao de `process-batch/route.ts`
- Toast com `sonner`: padrao do projeto inteiro
- React Query invalidation apos mutations: mesmo padrao de `useToggleMonitoring`
- Logging em `api_usage_logs` via `logMonitoringUsage`: reutilizar funcao extraida
- Tipos existentes: `MonitoringBatchResult` de `monitoring-utils.ts`

### Learnings da Story 13.7 (anterior)

- Server actions para WhatsApp usaram `src/actions/whatsapp.ts` — pattern diferente da API routes. Para scan inicial, preferir API route (mais consistente com process-batch).
- Invalidacao de cache inclui `["insights"]` e `["insights-new-count"]` — necessario no initial-scan tambem.
- `WhatsAppComposerDialog` recebeu prop `initialMessage` — mesmo padrao de extensibilidade sem modificar componente base.

### Learnings da Story 13.8 (configuracoes)

- `useMonitoringConfig` em `src/hooks/use-monitoring-config.ts` — hook separado para config.
- `useMonitoredCount()` reutilizado de `use-lead-monitoring.ts` — confirma que hooks de monitoramento ficam nesse arquivo.
- Settings page usa cards com skeleton loading — mesmo padrao para feedback de scan.

### Project Structure Notes

- Alinhado com estrutura existente: API routes em `src/app/api/monitoring/`, hooks em `src/hooks/`, utils em `src/lib/utils/`
- Sem variancias ou conflitos detectados

### References

- [Source: src/app/api/monitoring/process-batch/route.ts — logica completa de processamento, 670 linhas]
- [Source: src/hooks/use-lead-monitoring.ts — hooks de monitoramento: useToggleMonitoring, useBulkToggleMonitoring, useMonitoredCount]
- [Source: src/lib/utils/monitoring-utils.ts — detectNewPosts, calculateNextRunAt, MonitoringBatchResult]
- [Source: src/app/api/leads/[leadId]/monitor/route.ts — toggle individual, 154 linhas]
- [Source: src/app/api/leads/bulk-monitor/route.ts — toggle bulk, 144 linhas]
- [Source: src/lib/utils/relevance-classifier.ts — classifyPostRelevance (Story 13.4)]
- [Source: src/lib/utils/approach-suggestion.ts — generateApproachSuggestion (Story 13.5)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- 29/29 process-batch tests passing after refactor (zero logic changes)
- 20/20 monitoring-processor tests
- 13/13 initial-scan route tests
- 20/20 use-lead-monitoring hook tests (9 existing + 11 new)
- Full suite: 277 files, 5034 tests, 0 failures

### Completion Notes List

- **Task 1**: Extracted `processLead`, `logMonitoringUsage`, `getApiKey`, `loadKBContext`, `loadToneContext`, `BATCH_SIZE` to `monitoring-processor.ts`. Used `SupabaseClient` type from `@supabase/supabase-js` to accept both service role and user session clients. Updated `process-batch/route.ts` to import from shared module. All 29 existing tests pass unchanged.
- **Task 2**: Created `POST /api/monitoring/initial-scan` with user session auth, Zod validation (UUID array, min 1, max 100), tenant_id from user metadata, Apify key check, sequential batch processing via `processLead`, and aggregated response. Logged usage with `monitoring_initial_scan` request type.
- **Task 3**: Added `useInitialScan` hook and `runInitialScan` fetch function to `use-lead-monitoring.ts`. Toast loading/success/error with stable `id: "initial-scan"`. Invalidates leads, my-leads, insights, insights-new-count queries. Also created `fireInitialScan` helper for fire-and-forget pattern.
- **Task 4**: Integrated fire-and-forget `fireInitialScan` into `useToggleMonitoring` (individual) and `useBulkToggleMonitoring` (bulk). Only triggers when `isMonitored=true`. Bulk toggle filters out `skippedNoLinkedin` IDs before scanning.

### Code Review Fixes Applied

- **[CR-1] AC #7 limitação documentada**: Progresso numérico impossível sem SSE/streaming; toast loading + resultado final aceito como limitação técnica.
- **[CR-2] Duplicação eliminada**: Extraídos `handleScanSuccess` e `handleScanError` helpers; `fireInitialScan` usa-os. `useInitialScan` hook removido (dead code).
- **[CR-3] Error handling writes**: `processLead` agora verifica erros em cache update e insights insert via `devLog`.
- **[CR-4+7] Formato de erro padronizado**: Todos os erros da API usam `{ error: { code, message } }`. Erro 500 sanitizado (não expõe detalhes internos).
- **[CR-5] Dead code removido**: `useInitialScan` hook e 6 testes associados removidos.
- **[CR-6] Type cast eliminado**: `lead as ProcessLeadInput` substituído por mapeamento explícito em initial-scan e process-batch.
- **[CR-8] leadId em rejected promises**: Usa index do batch para mapear leadId real em vez de "unknown".

### Change Log

- 2026-03-02: Story 13.9 implementation complete — 4 tasks, 44 new tests, 277 files, 5034 total tests
- 2026-03-02: Code review fixes — 8 issues (2M+6L) corrigidos, 6 testes removidos (dead code), 277 files, 5028 tests

### File List

**New files:**
- `src/lib/utils/monitoring-processor.ts` — Shared processLead + helpers module
- `src/app/api/monitoring/initial-scan/route.ts` — Initial scan API endpoint
- `__tests__/unit/lib/utils/monitoring-processor.test.ts` — 20 tests
- `__tests__/unit/app/api/monitoring/initial-scan/route.test.ts` — 13 tests

**Modified files:**
- `src/app/api/monitoring/process-batch/route.ts` — Imports from monitoring-processor (removed local functions)
- `src/hooks/use-lead-monitoring.ts` — Added useInitialScan, fireInitialScan, runInitialScan; integrated into toggle hooks
- `__tests__/unit/hooks/use-lead-monitoring.test.tsx` — Added 11 tests (useInitialScan + toggle→scan integration)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status: in-progress → review
- `_bmad-output/implementation-artifacts/13-9-verificacao-inicial-ao-ativar-monitoramento.md` — Story file updates
