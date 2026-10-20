---
title: 'Story 23.3 — Saúde dos jobs e registro de erros com a infraestrutura atual'
type: 'feature'
created: '2026-10-20'
status: done
baseline_revision: '32e3890169290e2d31f2eb39394adbe972f3a02d'
review_loop_iteration: 0
followup_review_recommended: false
operator_actions:
  - "Aplicar a migration supabase/migrations/00068_job_health_and_error_logs.sql no SQL Editor do projeto kdgogyqyaxncqoyklyxx (rodar antes o PRE-CHECK do cabeçalho e terminar com NOTIFY pgrst, 'reload schema';) — ela cria o job pg_cron novo job-health-check."
  - "Depois de aplicar, rodar SELECT public.check_scheduled_jobs_health(); uma vez e conferir, logado como gestor, a notificação 'Job com problema' no sino e a linha em Configurações → Erros; logado como SDR, conferir que o alerta não aparece e que /settings/errors redireciona."
  - "Decidir o destino do monitor-leads entre as opções a/b do cabeçalho da 00068 (deixar parado ou fazê-lo rodar, o que passa a gastar Apify + OpenAI)."
  - "Decidir se o monitor-leads-cron deve ser reagendado com timeout_milliseconds maior (opção c), para parar os timeouts de 5000 ms que vão aparecer em Configurações → Erros."
context:
  - '{project-root}/CLAUDE.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Falha de job agendado fica invisível (o `monitor-leads` responde `no_config` há meses e ninguém percebeu), e exceções de servidor só existem no log da Vercel, sem lugar consultável na plataforma.

**Approach:** Migration aditiva `00068` com a tabela `error_logs`, uma coluna `audience` em `app_notifications` (notificação só para gestores via policy RESTRICTIVE) e uma função SQL `check_scheduled_jobs_health()` agendada no pg_cron a cada 15 min, que lê `cron.job_run_details` e `net._http_response` e gera notificação in-app + linha em `error_logs`. No app: um `logServerError` sanitizado chamado pelo `onRequestError` do Next, pelo orchestrator do agente e pelos `catch` das rotas de cron; aba "Erros" em Configurações; sino que entende o tipo de notificação novo. O `monitor-leads` fica diagnosticado e documentado, sem correção que o faça voltar a gastar Apify.

## Boundaries & Constraints

**Always:** migration só aditiva e idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, unschedule-if-exists antes do schedule), aplicada só pelo Fabossi; `logServerError` nunca lança nem atrasa a resposta além de um insert, e grava mensagem sanitizada (sem token, chave, e-mail, telefone, query string) e truncada em 500 caracteres, além de manter o `console.error`; `error_logs` legível só por gestor/diretor (o próprio tenant + linhas de plataforma com `tenant_id` nulo); notificações de job só para gestor/diretor e com cooldown de 24h por chave; código funciona (sem quebrar) se a migration ainda não estiver aplicada.

**Never:** Sentry/Datadog/serviço externo; alterar, reagendar ou remover os jobs existentes (`monitor-leads-cron`, `reply-sweep-cron`, `agent-stuck-steps-sweep`); `UPDATE`/`DELETE` em dados existentes; mudar o comportamento de `monitoring/process-batch` (não corrigir o `next_run_at` nulo, que faria o monitoramento voltar a chamar Apify/OpenAI); mexer em `instantly.ts`, webhook, busca de leads, export/ativação; mudar a resposta HTTP de qualquer rota; Edge Functions, secrets, env.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| JOB_FALHOU | run `failed` de `reply-sweep-cron` nos últimos 15 min | 1 linha `error_logs` (source `cron`, route `pg_cron/reply-sweep-cron`) + notificação `job_com_falha` (audience `admin`) para cada tenant com gestor | 2ª detecção em < 24h: só `error_logs` |
| JOB_PARADO | job `*/5` sem `succeeded` há > 15 min (3× intervalo, mín. 15 min) | notificação "sem execução bem-sucedida" + `error_logs`, ambos com cooldown 24h | — |
| HTTP_FALHOU | `net._http_response` com status nulo ou ≥ 400 nos últimos 15 min | `error_logs` com a contagem e o 1º erro + notificação chave `http` (cooldown 24h) | — |
| TUDO_OK | nenhum dos casos acima | nada é gravado; função retorna 0 | — |
| ROTA_ESTOUROU | exceção não capturada numa rota/página/action | `onRequestError` grava source `api` (ou `server`), route = `routePath` | insert falhou → só `console.error` |
| STEP_ESTOUROU | step do agente lança erro genérico (`STEP_EXECUTION_ERROR`) | `error_logs` source `agent_step`, tenant da execução, route `agent/<stepType>` | PipelineError de serviço externo não grava |
| CRON_ESTOUROU | `replies/process-batch` ou `monitoring/process-batch` cai no `catch` | `error_logs` source `cron`; resposta 500 igual à de hoje | — |
| SEGREDO_NA_MSG | mensagem com `Bearer eyJ...`, `api_key=abc`, `joao@x.com`, `+55 11 99999-8888`, `https://x?token=1` | tudo vira `[redacted]`/`[email]`/`[telefone]` | — |
| SDR | SDR lista notificações / chama `GET /api/settings/errors` | não vê `job_com_falha` (RLS); rota responde 403 | — |
| TABELA_AUSENTE | migration não aplicada | `logServerError` engole o erro do insert; rota de erros responde 500 com mensagem | — |

</intent-contract>

## Code Map

- `supabase/migrations/00067_sweep_stuck_agent_steps.sql:1-30,150-175` -- modelo de cabeçalho (pre-check, rollback, aviso de cron) e de agendamento idempotente.
- `supabase/migrations/00055_create_opportunities_schema.sql:148-187` -- `app_notifications` (tenant_id, type TEXT livre, payload JSONB, read_at, created_at; 4 policies por tenant). `00060:46-64` trigger de imutabilidade (não checa colunas novas).
- `supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql:64-79` -- `public.is_admin()` (gestor/diretor). `00002:67` `public.get_current_tenant_id()`.
- Produção (lido com `scripts/db-ro.sh`, só leitura): jobs ativos `monitor-leads-cron` (*/5), `reply-sweep-cron` (*/5), `agent-stuck-steps-sweep` (*/2), todos `succeeded`. `net._http_response` tem ~25 timeouts de 5000 ms em 6h (monitor-leads, sem `timeout_milliseconds`) e 2 de 60000 ms (reply-sweep); `status_code` e `timed_out` vêm nulos, só `error_msg` preenchido. 2 tenants; só `...0001` tem gestores (5).
- `src/app/api/monitoring/process-batch/route.ts:49-110` -- causa do `no_config`: o filtro `.or(...next_run_at.lte...)` não casa com `next_run_at` nulo; o fallback tenta inserir config nova, esbarra em `unique_monitoring_config_per_tenant` (erro ignorado) e devolve `no_config`. Catch final em `:287-291` (ponto de log). Só leitura além do log.
- `src/app/api/replies/process-batch/route.ts` catch final -- ponto de log (source `cron`).
- `src/lib/agent/orchestrator.ts:501-527` -- catch de `executeStep`; `tenantId` em `:141`; `STEP_EXECUTION_ERROR` = erro genérico (também gerado por `base-step.ts:145-172`). Ponto de log antes do `pauseWithError`, exceto `STEP_ALREADY_RUNNING`.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts:221-233` -- ramo "Unexpected error" (não PipelineError): ponto de log source `api`.
- `src/lib/supabase/admin.ts:16` -- `createAdminClient()` (lança sem service key).
- `src/lib/supabase/tenant.ts` `getCurrentUserProfile()`; `src/lib/auth/capabilities.ts` `hasAdminAccess()`.
- Padrão a copiar (aba Uso): `src/app/api/usage/statistics/route.ts` (401/403/500 com `{error:{code,message}}`), `src/hooks/use-usage-statistics.ts`, `src/app/(dashboard)/settings/usage/page.tsx`; testes em `__tests__/unit/app/api/usage/statistics/route.test.ts`, `__tests__/unit/hooks/use-usage-statistics.test.tsx`.
- `src/components/settings/SettingsTabs.tsx:13-21` -- array `tabs` (entrar "Erros" antes de "Equipe"); `/settings/*` já é admin-only no middleware e no `AdminGuard` do layout. Teste: `__tests__/unit/components/settings/SettingsTabs.test.tsx`.
- `src/components/common/NotificationBell.tsx` -- hoje ignora `type` e sempre vai para `/opportunities`. `src/types/opportunity.ts:337-375` `AppNotification`.
- Data na UI: `format(d, "dd/MM/yyyy HH:mm", { locale: ptBR })` (date-fns, como `LeadDetailPanel.tsx`).
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` -- `onRequestError(err, request, context)` em `src/instrumentation.ts`; `context.routeType`: `render|route|action|proxy`; usar `NEXT_RUNTIME === "nodejs"`.

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/00068_job_health_and_error_logs.sql` -- (1) `error_logs` (id, `tenant_id` nullable FK tenants ON DELETE CASCADE, `source` TEXT CHECK in `api|server|agent_step|cron`, `route` TEXT NOT NULL, `message` TEXT NOT NULL, `created_at`), índices `(created_at DESC)` e `(tenant_id, created_at DESC)`, RLS com só SELECT `is_admin() AND (tenant_id IS NULL OR tenant_id = get_current_tenant_id())`; (2) `app_notifications.audience TEXT NULL CHECK (audience IN ('admin'))` + policy `AS RESTRICTIVE FOR SELECT USING (audience IS NULL OR is_admin())`; (3) `job_health_max_silence(schedule text) RETURNS interval` IMMUTABLE; (4) `check_scheduled_jobs_health() RETURNS integer` SECURITY DEFINER, `search_path` fixo, EXECUTE revogado de public/anon/authenticated, implementando JOB_FALHOU/JOB_PARADO/HTTP_FALHOU; (5) cron `job-health-check` `*/15 * * * *`. Cabeçalho com pre-check só leitura, impacto esperado (a 1ª execução deve acusar os timeouts do monitor-leads) e rollback.
- `src/lib/services/error-logger.ts` -- `sanitizeErrorMessage(raw)` e `logServerError({ source, route, error, tenantId? })` (admin client, try/catch total, `console.error` sempre).
- `src/instrumentation.ts` -- `onRequestError` que, só em `nodejs`, importa o logger e grava (`routeType` `route` → `api`, demais → `server`).
- `src/lib/agent/orchestrator.ts` -- no catch, `STEP_EXECUTION_ERROR` → `await logServerError({source:"agent_step", route:\`agent/${stepType}\`, tenantId, error})`.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` -- ramo genérico grava source `api`.
- `src/app/api/replies/process-batch/route.ts`, `src/app/api/monitoring/process-batch/route.ts` -- catch final grava source `cron`; resposta inalterada.
- `src/app/api/settings/errors/route.ts` -- GET admin-only, últimos 50 de `error_logs` (tenant ou nulo), envelope `{data}`.
- `src/types/error-log.ts` -- `ErrorLogRow`/`ErrorLog`/`toErrorLog`, `ERROR_SOURCE_LABELS`.
- `src/hooks/use-error-logs.ts`, `src/components/settings/ErrorLogList.tsx`, `src/app/(dashboard)/settings/errors/page.tsx` -- tabela Data/Origem/Rota/Mensagem, loading, erro com "Tentar novamente", vazio "Nenhum erro registrado".
- `src/components/settings/SettingsTabs.tsx` -- aba `{ id: "errors", label: "Erros", href: "/settings/errors" }`.
- `src/types/opportunity.ts`, `src/components/common/NotificationBell.tsx` -- `audience` opcional no tipo; `job_com_falha` mostra "⚠️ Job com problema: <job>", subtítulo = `detail`, clique leva a `/settings/errors`; demais tipos inalterados.
- `package.json` + `__tests__/unit/migrations/00068-job-health.test.ts` -- devDependency `@electric-sql/pglite` fixada em `0.5.8` (Postgres em WASM; não há Postgres local nem banco de teste). O teste cria stubs mínimos (roles `anon`/`authenticated`, `tenants`, `profiles`, `app_notifications` como na 00055, `is_admin()`/`get_current_tenant_id()`, schemas `cron` com `job`/`job_run_details`/`schedule()`/`unschedule()` e `net._http_response`), executa o texto da `00068` (pulando só `CREATE EXTENSION`), e cobre JOB_FALHOU, JOB_PARADO, HTTP_FALHOU, TUDO_OK, cooldown de 24h, tenant sem gestor sem notificação, `job_health_max_silence` e a policy RESTRICTIVE/`error_logs` para SDR × gestor (via `SET ROLE` + stub de `auth.uid()` se necessário).
- Testes -- `__tests__/unit/lib/services/error-logger.test.ts` (matriz SEGREDO_NA_MSG, truncagem, insert, nunca lança), `__tests__/unit/instrumentation.test.ts`, rota/hook/componente/página de erros, `SettingsTabs`, `NotificationBell` (tipo novo + oportunidade inalterada), orchestrator, execute route e as duas rotas de cron (catch grava, status igual).

**Acceptance Criteria:**
- Given a migration aplicada e um job com falha/parado/HTTP com erro, when o `job-health-check` roda, then gestores veem a notificação no sino, SDR não, e a linha aparece em Configurações → Erros.
- Given uma exceção não tratada em rota, step do agente ou cron, when ela acontece, then aparece em Configurações → Erros (data, origem, rota, mensagem sanitizada) e continua no log da Vercel.
- Given o `monitor-leads`, when a story termina, then a causa do `last_run_at` nulo e as opções de correção estão documentadas nas Completion Notes e no cabeçalho da migration.
- Given as queries de detecção da função, when rodadas só leitura em produção via `scripts/db-ro.sh`, then executam sem erro e acusam os timeouts reais do monitor-leads.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 30 findings — high 0, medium 2, low 22, false 4, maybe-false 2
- findings:
  - `[low]` `[reject]` (blind) Erro sem tenant (instrumentation, catch dos crons) vira linha de plataforma visível a gestores de qualquer tenant — decisão registrada nas Design Notes; hoje só 1 dos 2 tenants tem usuários e a mensagem é sanitizada; descobrir o tenant no `onRequestError` exige ler sessão no hook global.
  - `[low]` `[patch]` (blind) Caminho SQL grava `return_message`/`error_msg` sem sanitizar — criada `job_health_redact()` (Bearer/Basic, JWT, query string) antes do corte de 500; teste PGlite.
  - `[low]` `[reject]` (blind) Sem retenção e ~96 linhas/dia de `pg_net/http` enquanto o timeout do monitor-leads persistir — volume desprezível em tamanho; o ruído some quando o operador corrigir o timeout (operator action); filtro/cooldown mudaria a linha HTTP_FALHOU da matriz.
  - `[false]` `[reject]` (blind) Migration junta schema e job novo, contra o CLAUDE.md — o próprio AC da story pede o check agendado no pg_cron, e a aplicação já depende do OK do Fabossi.
  - `[medium]` `[patch]` (blind) Janela fixa de 15 min perde ou conta em dobro falhas na virada (todos os jobs disparam no mesmo segundo) — watermark pela execução anterior do `job-health-check` (fallback 15 min, teto 1h); `end_time` para runs, `created` para HTTP; teste novo.
  - `[low]` `[reject]` (blind) Ninguém vigia o próprio `job-health-check` — função só SQL, sem HTTP; mostrar "última verificação" exige nova superfície (RPC em `cron`).
  - `[low]` `[patch]` (blind) Sanitizador não cobre CPF/CNPJ; regex de telefone pega IDs/epochs de 10–12 dígitos — CPF→`[cpf]` e CNPJ→`[cnpj]` adicionados com teste; falso positivo em IDs numéricos rejeitado (erra para o lado de esconder).
  - `[low]` `[reject]` (blind) Orchestrator registra só `pipelineError.message`, sem stack — no catch o erro já chega convertido pelo `base-step` (a stack original já foi descartada lá).
  - `[false]` `[reject]` (blind) Falta Completion Notes / 3 pontos do CLAUDE.md e prova de que SDR ainda vê `nova_oportunidade` — Completion Notes escritas no Finalize; o teste PGlite "SDR nao ve job_com_falha, mas ve as demais notificacoes" cobre o segundo ponto.
  - `[low]` `[reject]` (blind) INSERT de notificação repetido 3× na função — refactor para helper cria superfície nova; o cooldown é o mesmo texto nos 3 ramos e está testado.
  - `[low]` `[reject]` (blind) Página Erros sem atualizar/filtro/paginação — pedido de funcionalidade; a página refaz a busca ao ser aberta.
  - `[low]` `[reject]` (blind) Alertas de job podem empurrar oportunidades para fora do limite de 30 do sino — no máximo poucos alertas/dia por chave (cooldown 24h); `read_at` compartilhado é desenho anterior (21.7).
  - `[low]` `[patch]` (blind) Lacunas de teste e constante `DIRETOR_T2_LESS` que é SDR — renomeada para `SDR_T2`; visibilidade cross-tenant já testada ("nunca de outro tenant").
  - `[low]` `[patch]` (edge) Job ativo com `jobname` nulo aborta o check (`route` NOT NULL) — `COALESCE(j.jobname, 'jobid:'||j.jobid)`; teste.
  - `[low]` `[reject]` (edge) Qualquer erro dentro do check derruba a execução inteira — blocos EXCEPTION por seção adicionam complexidade; a falha fica em `cron.job_run_details`.
  - `[low]` `[reject]` (edge) Overflow de inteiro em `*/N` gigante — agenda irreal (passo de minuto acima de 59 não faz sentido); a guarda seria complexidade sem caso de uso.
  - `[low]` `[reject]` (edge) Agendas semanais/horário restrito geram JOB_PARADO falso — limitação documentada nas Design Notes; nenhum job assim existe hoje; resolver exige parser de cron.
  - `[medium]` `[patch]` (edge) Janela de 15 min com jitter conta em dobro/perde — mesmo defeito do watermark acima; corrigido junto.
  - `[low]` `[reject]` (edge) `error_logs` cresce sem limite (~96/dia) — mesmo motivo da retenção acima.
  - `[low]` `[patch]` (edge) Trigger de imutabilidade (00060) ignora `audience` — `CREATE OR REPLACE` da mesma função + `audience` (conferido: versão em produção igual à da 00060); teste com o trigger no stub.
  - `[low]` `[reject]` (edge) `onRequestError` sem tenant — mesmo motivo do primeiro achado.
  - `[low]` `[reject]` (edge) Catch do monitoring/process-batch sem tenant — mesmo motivo; o `config` nem está no escopo do catch.
  - `[low]` `[reject]` (edge) Telefone pega IDs/timestamps — mesmo motivo do falso positivo acima.
  - `[low]` `[patch]` (edge) `use-error-logs` quebra com corpo não-JSON (504 HTML) — `response.json().catch(() => ({}))`; teste.
  - `[low]` `[patch]` (edge) Cabeçalho diz que o pre-check usa "as mesmas consultas" da função — reescrito como "consultas aproximadas", com as diferenças.
  - `[low]` `[patch]` (verification-gap, other) `audience` pode ser trocado via PostgREST — mesmo defeito do trigger acima; corrigido junto.
  - `[false]` `[reject]` (intent) Hand-off (status, `operator_actions`, Completion Notes) ausente — feito no Finalize desta execução.
  - `[maybe-false]` `[reject]` (intent) SQL só testado contra stubs, não contra o schema real — as colunas usadas foram consultadas só leitura em produção (`db-ro.sh`, pre-check executado); o resto se resolve ao aplicar a migration (operator action com smoke). Se real, seria low.
  - `[false]` `[reject]` (intent) Nada prova que o Next carrega `src/instrumentation.ts` — `npm run build` gerou `.next/server/instrumentation.js` com o `onRequestError`.
  - `[maybe-false]` `[reject]` (intent) Diagnóstico do monitor-leads só no cabeçalho da migration — Completion Notes escritas no Finalize; nada além disso a verificar.

## Design Notes

- **Por que não atribuir HTTP a job:** `net._http_response` não guarda URL nem o id do job, e os dois jobs HTTP disparam no mesmo segundo. O check reporta as falhas HTTP agregadas (chave `http`), com o 1º `error_msg`; o timeout (5000 vs 60000 ms) já indica qual foi.
- **Janela esperada:** `*/N * * * *` → 3×N min (mín. 15); `* * * * *` ou `N seconds` → 15 min; `M * * * *` → 3h; resto → 25h (job semanal novo precisa de regra própria). Todos os jobs ativos de `cron.job` entram, inclusive os que vierem.
- **Destinatários:** `app_notifications` é por tenant; a função insere uma linha por tenant que tenha gestor/diretor, com `audience='admin'`. `error_logs` de plataforma (cron) fica com `tenant_id` nulo e é visível aos gestores de qualquer tenant (hoje só um tenant tem usuários).
- **monitor-leads:** corrigir o filtro faria o monitoramento rodar pela 1ª vez (Apify + OpenAI para 2 leads monitorados), o que o cliente sentiria. Fica para decisão do Fabossi (operator action), junto com o `timeout_milliseconds` do job.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm run test:run` -- expected: verdes.
- `scripts/db-ro.sh < <arquivo com os SELECTs de detecção>` -- expected: executa e lista os timeouts do monitor-leads.

**Manual checks (if no CLI):**
- Migration lida linha a linha: nenhum DROP de tabela/coluna, nenhum UPDATE/DELETE, nenhum `cron.alter_job`/unschedule dos jobs existentes.

## Completion Notes

**O que pode ter mudado para o cliente:**
- Rotas: `/api/replies/process-batch` e `/api/monitoring/process-batch` ganharam só um `await logServerError(...)` no `catch` final (resposta 500 igual). A rota de execução de step do agente idem, no ramo de erro genérico. O orchestrator registra `STEP_EXECUTION_ERROR` antes do `pauseWithError` (mesmo fluxo de pausa/bolha).
- Novo: `src/instrumentation.ts` (`onRequestError`), rota `GET /api/settings/errors`, aba Configurações → Erros, sino entende `job_com_falha` (oportunidades continuam iguais, com 🔥 e indo para `/opportunities`).
- Banco (só depois de aplicada a `00068`): tabela `error_logs`, coluna nullable `app_notifications.audience` + policy RESTRICTIVE (linhas existentes ficam NULL, nada muda para elas), trigger de imutabilidade passa a cobrir `audience`, funções `job_health_max_silence`/`job_health_redact`/`check_scheduled_jobs_health`, job pg_cron NOVO `job-health-check` (*/15). Nenhum job existente alterado.
- Sem mudança em prompts, `instantly.ts`, webhook, Edge Functions, secrets ou env. Dev dependency nova: `@electric-sql/pglite` 0.5.8 (só testes).

**Os 3 pontos (por análise do diff; sem smoke real, porque a parte de banco depende da migration aplicada):**
1. Campanhas rodando, webhook e `reply-sweep`: webhook intocado; `reply-sweep` só ganhou log no catch, com a mesma resposta. Os jobs existentes não são alterados.
2. Busca de leads: nenhum arquivo do caminho tocado.
3. Criação de campanha e export/ativação no Instantly: nenhuma trava ou filtro novo; o agente só grava log em caminho de erro já existente.

**Diagnóstico do `monitor-leads` (`last_run_at` nulo), feito com consultas só leitura em produção:**
- O pg_cron diz `succeeded` em todas as execuções, mas isso só significa que a chamada HTTP foi enfileirada.
- `net._http_response`: as respostas 200 do monitor-leads são `{"status":"no_config"}`; ~1/3 das chamadas estoura o timeout padrão de 5000 ms do pg_net (o job não passa `timeout_milliseconds`).
- Causa do `no_config`: a única linha de `monitoring_configs` (tenant `...0001`, 2 leads monitorados) tem `next_run_at` NULL. O filtro `.or(run_status.eq.running, and(run_status.eq.idle, next_run_at.lte.<agora>))` em `src/app/api/monitoring/process-batch/route.ts:49-56` não casa com NULL; o fallback tenta inserir outra config, esbarra em `unique_monitoring_config_per_tenant` (erro ignorado) e devolve `no_config`. O monitoramento nunca rodou nem gastou Apify/OpenAI.
- Não corrigido de propósito: corrigir faz o monitoramento começar a rodar e gastar Apify + OpenAI (o cliente sente). Opções no cabeçalho da `00068`: (a) deixar parado; (b) preencher `next_run_at` ou tratar NULL como vencido; (c) reagendar o job com `timeout_milliseconds` maior.

**Impacto esperado ao aplicar a 00068:** enquanto o timeout do monitor-leads existir, o check grava 1 linha `pg_net/http` em `error_logs` a cada 15 min e manda 1 notificação "Job com problema: Chamadas HTTP (pg_net)" aos gestores do tenant `...0001` no máximo a cada 24h. Nenhum job falhou ou parou hoje.

## Auto Run Result

Status: awaiting-operator

**Resumo:** saúde dos jobs agendados via função SQL agendada no pg_cron (falha, parado, HTTP com erro → `error_logs` + notificação in-app só para gestores, com cooldown de 24h e watermark entre execuções) e registro de erros de servidor sanitizado (rotas/páginas/actions via `onRequestError`, step do agente, crons) consultável em Configurações → Erros. Sem serviço externo. `monitor-leads` diagnosticado e documentado.

**Arquivos alterados:**
- `supabase/migrations/00068_job_health_and_error_logs.sql` — tabela `error_logs`, `audience` + policy RESTRICTIVE, imutabilidade de `audience`, funções de check/redação, job `job-health-check`; cabeçalho com pre-check, impacto, diagnóstico e rollback.
- `src/lib/services/error-logger.ts` — `sanitizeErrorMessage` + `logServerError` (nunca lança).
- `src/instrumentation.ts` — `onRequestError` só no runtime Node.
- `src/lib/agent/orchestrator.ts`, `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts`, `src/app/api/replies/process-batch/route.ts`, `src/app/api/monitoring/process-batch/route.ts` — log nos catch, respostas inalteradas.
- `src/app/api/settings/errors/route.ts`, `src/types/error-log.ts`, `src/hooks/use-error-logs.ts`, `src/components/settings/ErrorLogList.tsx`, `src/app/(dashboard)/settings/errors/page.tsx`, `src/components/settings/SettingsTabs.tsx` — aba Erros.
- `src/components/common/NotificationBell.tsx`, `src/types/opportunity.ts` — tipo `job_com_falha` e `audience`.
- `package.json`/`package-lock.json` — `@electric-sql/pglite` 0.5.8 (dev).
- Testes: migration em PGlite, logger, instrumentation, rota/hook/lista/página de erros, abas, sino, orchestrator, rota de execute e as duas rotas de cron.

**Revisão:** 30 achados (medium 2 — mesma causa, 1 entrada —, low 22, false 4, maybe-false 2). 8 correções aplicadas: 1 medium (watermark da janela) e 7 low (redação no SQL, CPF/CNPJ, `jobname` nulo, imutabilidade de `audience`, JSON inválido no hook, texto do pre-check, nome de constante). 0 deferidos. Rejeitados com motivo no Review Triage Log.

**Follow-up review recomendado: false** (1 medium corrigido, nenhum high).

**Verificação:** `npm run lint` 0 erros (134 warnings, como antes); `npm run typecheck` ok; `npm run test:run` 436 arquivos, 8188 testes ok; `npm run build` ok (gera `.next/server/instrumentation.js`); pre-check só leitura em produção executado (3 timeouts de 5000 ms nos últimos 15 min, nenhum job falho/parado); função de imutabilidade em produção conferida igual à da 00060.

**Riscos residuais:** SQL testado em PGlite com stubs de `cron`/`net`, não no Supabase real (colunas conferidas só leitura); erros sem tenant ficam visíveis aos gestores de qualquer tenant; agendas semanais futuras gerariam JOB_PARADO falso; enquanto o timeout do monitor-leads existir, a aba Erros fica dominada por linhas `pg_net/http`.

**Devido pelo operador:** ver `operator_actions` no frontmatter.

## Decisões do operador e ajustes pós-loop (2026-10-20)

Antes de aplicar, Fabossi decidiu:
1. **Só ele vê os alertas e os Erros.** Os 5 gestores do cliente, não.
2. **Monitor-leads: opção (b) + (c).** O monitoramento semanal passa a rodar, com timeout maior.

Ajustes (commit `de1de0c`):
- `00068`: ganhou `public.platform_admins` (seed: só o profile `61d07b17-…`, Fabossi, via `INSERT … SELECT … ON CONFLICT DO NOTHING`) e `public.is_platform_admin()` (`SECURITY DEFINER`, `search_path = ''`).
  - `error_logs`: leitura só para quem passa em `is_platform_admin()`.
  - `audience`: aceita `'admin'`/`'platform'`; o `job_com_falha` sai com `'platform'` e só para o tenant do platform admin.
- App: aba Erros, `/settings/errors` e `GET /api/settings/errors` usam `isPlatformAdmin` (`src/lib/auth/platform-admin.ts` e `src/hooks/use-platform-admin.ts`). Fail-closed: se a RPC falha, ninguém vê.
- `src/app/api/monitoring/process-batch/route.ts`: o filtro inclui `and(run_status.eq.idle,next_run_at.is.null)`. Config nunca agendada conta como vencida, sem `UPDATE` no banco.
- `00069_monitor_leads_cron_timeout.sql`: reagenda só o `monitor-leads-cron` (mesmo nome, `*/5`, mesmo comando da 00045) com `timeout_milliseconds := 150000`.
- Correção do registro acima: o `@electric-sql/pglite` já estava em `devDependencies`. Nada a mudar ali.
- Testes: a migration em PGlite cobre 40 casos (platform admin vê; gestor sem platform admin e SDR não veem alerta nem `error_logs`; seed; `audience`); mais rota, página, abas, `isPlatformAdmin` e o filtro do monitor. Gate: lint 0 erros, typecheck ok, 437 arquivos / 8203 testes ok.

## Migration aplicada e smoke (2026-10-20)

- Fabossi aplicou a `00068` + `00069` + `NOTIFY pgrst` no SQL Editor de produção.
- Conferido por `scripts/db-ro.sh`:
  - As tabelas e as 4 funções existem; `platform_admins` tem só o Fabossi.
  - `job-health-check` é o job 6 (`*/15`, ativo); `monitor-leads-cron` virou o job 7 (`*/5`, com timeout de 150 s); `reply-sweep-cron` e `agent-stuck-steps-sweep` ficaram intactos.
  - As policies em produção são idênticas às testadas.
  - As 65 notificações existentes continuam com `audience` NULL.
- 1ª execução do `job-health-check` (14:00 UTC): `succeeded`. Gravou 1 linha `pg_net/http` (timeout de 5 s das 13:50, anterior à 00069) e 1 `job_com_falha` com `audience = platform` no tenant `…0001`. Desde 13:55, todas as chamadas do pg_net deram 200.
- Smoke local (Playwright, `next dev -p 3100`, logado como Fabossi): aba Erros visível, a linha aparece na lista, e o sino mostra "⚠️ Job com problema: Chamadas HTTP (pg_net)".
- Não havia login de gestor do cliente nem de SDR. A visão deles está coberta pelos testes PGlite com o SQL real e pela policy conferida em produção.

## Deploy e smoke em produção (2026-10-20)

- **CI:** o teste `EmailBlock` "remove assinatura placeholder…" (24.8) falhava nos runs de push desde a 24.8, junto com "passes productId…".
  - Causa: no runner lento, chamadas de testes anteriores (debounce do subject, geração parada no `setTimeout` de 300 ms) caem no teste seguinte depois do `clearAllMocks`, e os testes liam a *primeira* chamada.
  - Correção: os dois testes leem a última chamada do próprio teste (`d0d39c6`, `06d0db0`). CI verde em push e PR.
- **Deploy:** PR #11 mergeado na `main` (`2a79f04`). Vercel de produção `success`.
- **Smoke em produção (Playwright, como Fabossi):** a aba Erros aparece e lista a linha `pg_net/http` das 15:00; o sino mostra "Job com problema".
- **Monitor semanal (1ª rodada real):**
  - 14:30 UTC: `batch_processed`, 2 leads, 3 posts novos, 1 filtrado, 2 sugestões → 2 insights novos.
  - 14:35: rodada concluída (`idle`, `last_run_at` 14:35, `next_run_at` 2026-10-27 14:35).
  - Custo registrado em `api_usage_logs`: 2 chamadas Apify e 5 OpenAI.
  - Nenhuma linha nova em `error_logs`; respostas HTTP 200 desde a 00069.
- **Os 3 pontos, por smoke real:**
  1. `reply-sweep-cron` com 200 a cada 5 min (`swept/created/skipped` normais).
  2. A busca de leads não foi tocada (diff).
  3. Export/ativação não foram tocados; o step de execute só ganhou log no `catch` (diff).
- **O que o cliente sente:** 2 insights novos na página Insights, e daqui em diante uma rodada por semana para os leads monitorados.
- **Visão de SDR e de gestor do cliente, verificada na tela em produção (2026-10-20, Playwright, contexto limpo, só leitura).** Credenciais de `docs/credentials.md`. Mesmo tenant do alerta `platform`.
  - SDR (`ccase`): `GET /api/settings/errors` → 403 "Somente o operador da plataforma pode ver os erros"; `/settings` e `/settings/errors` redirecionam para `/leads`; `/api/notifications` traz 30 notificações e nenhuma `job_com_falha`; o sino mostra só oportunidades (🔥), sem "Job com problema".
  - Gestor do cliente (`mfabossi`): `GET /api/settings/errors` → 403; `/settings` abre (Integrações, Base de Conhecimento, Produtos, Uso da API, Monitoramento, Notificações, Equipe) **sem** a aba Erros; `/settings/errors` redireciona para `/settings/integrations`; nenhuma `job_com_falha` no sino nem na API.

## Operator Confirmation

Confirmed 2026-10-20: the external actions this story owed were carried out.

- Aplicar a migration supabase/migrations/00068_job_health_and_error_logs.sql no SQL Editor do projeto kdgogyqyaxncqoyklyxx (rodar antes o PRE-CHECK do cabeçalho e terminar com NOTIFY pgrst, 'reload schema';) — ela cria o job pg_cron novo job-health-check.
- Depois de aplicar, rodar SELECT public.check_scheduled_jobs_health(); uma vez e conferir, logado como gestor, a notificação 'Job com problema' no sino e a linha em Configurações → Erros; logado como SDR, conferir que o alerta não aparece e que /settings/errors redireciona.
- Decidir o destino do monitor-leads entre as opções a/b do cabeçalho da 00068 (deixar parado ou fazê-lo rodar, o que passa a gastar Apify + OpenAI).
- Decidir se o monitor-leads-cron deve ser reagendado com timeout_milliseconds maior (opção c), para parar os timeouts de 5000 ms que vão aparecer em Configurações → Erros.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
