---
title: 'Story 23.1 — Webhook e crons autenticados'
type: 'feature'
created: '2026-10-20'
status: done
baseline_revision: 'fca35e2f97d22c379878d27ef1e00bce633bcc92'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
operator_actions:
  - "Gerar o segredo e criar o secret da Edge Function no projeto kdgogyqyaxncqoyklyxx: npx supabase secrets set INSTANTLY_WEBHOOK_SECRET=$(openssl rand -hex 32) (guardar o valor)."
  - "Se algum webhook estiver cadastrado no Instantly (hoje GET /api/v2/webhooks retorna vazio porque o plano bloqueia webhooks), atualizar a URL para https://kdgogyqyaxncqoyklyxx.supabase.co/functions/v1/instantly-webhook?token=<INSTANTLY_WEBHOOK_SECRET> ANTES do deploy."
  - "Publicar a função: npx supabase functions deploy instantly-webhook --no-verify-jwt."
  - "Smoke pós-deploy sem gravar nada: curl -i -X POST https://kdgogyqyaxncqoyklyxx.supabase.co/functions/v1/instantly-webhook -H 'Content-Type: application/json' -d '{}' deve responder 401; com ?token=<segredo> e corpo '{}' deve responder 400 (autenticado, payload inválido, nada gravado)."
  - "Fazer o merge do epic/23-plataforma-higiene na main (deploy Vercel) para a correção fail-closed de /api/monitoring/process-batch entrar em produção, conferindo que MONITORING_CRON_SECRET existe nas env de produção da Vercel."
warnings: ['oversized']
deferred:
  - summary: >-
      O handler Deno da Edge Function instantly-webhook (guard de segredo, extractWebhookSecret e safeEqual inline) não é executado por nenhum teste; só a cópia em src/lib é testada.
    evidence: |-
      vitest.config.ts só inclui __tests__/**, não há deno test no package.json nem no CI, e processWebhookRequest não é chamado por código de produção. A sincronia depende só do SYNC-NOTICE. Fechar exige um harness Deno para supabase/functions/* ou refatorar o handler para delegar a um módulo compartilhado. Até lá, o smoke do operador pós-deploy (401 sem token, 400 com token e corpo vazio) é a verificação.
    location: >-
      supabase/functions/instantly-webhook/index.ts:184
    severity: medium
  - summary: >-
      As Edge Functions reply-sweep e monitor-leads (publicadas com verificação de JWT) aceitam qualquer JWT válido, inclusive a anon key pública, e repassam o Bearer do cron para as rotas Next com service role.
    evidence: |-
      Pré-existente e fora do diff. Elas não conferem nenhum segredo próprio; quem tiver a anon key pode disparar o lote fora do horário (amplificação de custo de OpenAI/Apify; o processamento é idempotente e o monitoring é limitado por next_run_at). Para confirmar: checar no painel se as funções estão com verify_jwt ligado e se a anon key passa. Corrigir exige publicar Edge Functions (ação com OK do Fabossi).
    location: >-
      supabase/functions/reply-sweep/index.ts:24
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A Edge Function `instantly-webhook` é publicada com `--no-verify-jwt` e não confere segredo nenhum: qualquer um que saiba a URL consegue gravar aberturas/respostas falsas em `campaign_events` com service role. E a rota de cron `monitoring/process-batch` é fail-open: com `MONITORING_CRON_SECRET` ausente, o header `Bearer undefined` passa e executa o lote com service role.

**Approach:** O webhook passa a exigir um segredo compartilhado (`INSTANTLY_WEBHOOK_SECRET`, secret da Edge Function) recebido por query string `?token=` ou header `x-webhook-secret`, comparado em tempo constante, antes de ler o corpo; sem segredo na env, responde 503 e não grava. A `monitoring/process-batch` adota o mesmo guard fail-closed da `replies/process-batch`. A URL com segredo fica documentada no cabeçalho da função e no `.env.example`. Publicar a função e criar o secret ficam como ação do operador.

## Boundaries & Constraints

**Always:** a lógica testável vive em `src/lib/webhook/instantly-webhook-utils.ts` e a Edge Function mantém a cópia inline sincronizada (SYNC-NOTICE); a checagem de segredo acontece antes do parse do corpo e de qualquer acesso ao banco; OPTIONS (preflight) continua 204 sem segredo; o segredo nunca aparece em log nem no corpo da resposta; testes cobrem "env ausente" e "segredo errado" para o webhook e para cada rota de cron com `Bearer`.

**Never:** publicar a Edge Function, criar/alterar secrets do Supabase ou variáveis da Vercel, registrar webhook no Instantly, mexer em jobs `pg_cron` ou migrations; alterar `replies/process-batch` além do necessário (já é a referência fail-closed); mudar o contrato de sucesso do webhook (200/400/405/500 existentes) para requisições autenticadas; mexer em `reply-sweep`/`monitor-leads` (são chamadas pelo pg_cron com JWT verificado pelo gateway e só repassam o Bearer).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Webhook autenticado por query | POST `?token=<segredo>` com payload válido | 200 e evento gravado (comportamento atual) | — |
| Webhook autenticado por header | POST com `x-webhook-secret: <segredo>` | 200 e evento gravado | — |
| Webhook sem segredo | POST sem token/header | 401 `{"error":"Unauthorized"}` | `lookupCampaign`/`insertEvent` não são chamados |
| Webhook segredo errado | `?token=errado` (ou de tamanho diferente) | 401 | nada gravado |
| Webhook env ausente | `INSTANTLY_WEBHOOK_SECRET` vazio/indefinido | 503 `{"error":"Webhook not configured"}` | nada gravado; `console.error` sem segredo |
| Webhook preflight | OPTIONS sem segredo | 204 | — |
| Webhook método errado | GET sem segredo | 405 (método é checado antes do segredo) | — |
| Cron monitoring env ausente | `MONITORING_CRON_SECRET` vazio, header `Bearer undefined` ou `Bearer ` | 401 | Supabase não é instanciado |
| Cron monitoring segredo errado | `Bearer errado` | 401 | não executa |

</intent-contract>

## Code Map

- `supabase/functions/instantly-webhook/index.ts` -- handler Deno; inserir guard de segredo após o check de método (linha ~143) e antes do `req.json()` (linha ~154); atualizar cabeçalho com deploy, secret e URL. Cópia inline da lógica de `instantly-webhook-utils.ts`.
- `src/lib/webhook/instantly-webhook-utils.ts` -- funções puras testadas; `processWebhookRequest` (linha ~190) e `WebhookDeps` (linha ~170) recebem a auth; adicionar `extractWebhookSecret(url, headers)` e `safeEqual(a, b)`.
- `src/app/api/monitoring/process-batch/route.ts:36-40` -- guard fail-open (`!authHeader || authHeader !== \`Bearer ${monitoringSecret}\``); trocar pelo padrão de `src/app/api/replies/process-batch/route.ts:31-35`.
- `src/app/api/replies/process-batch/route.ts` -- referência fail-closed; só leitura.
- `__tests__/unit/functions/instantly-webhook.test.ts:481-490` -- `createMockDeps` usado por ~11 testes do fluxo; dar default de auth válido aqui.
- `__tests__/unit/app/api/monitoring/process-batch/route.test.ts:147-175` -- bloco "Auth validation"; falta "env ausente".
- `__tests__/unit/app/api/replies/process-batch/route.test.ts:89-107` -- já cobre sem header, segredo errado e env ausente.
- `.env.example:68-81` -- seção de secrets de cron; adicionar `INSTANTLY_WEBHOOK_SECRET` (secret da Edge Function, não da Vercel).
- Únicas rotas com `Bearer` de cron em `src/app/api`: `monitoring/process-batch` e `replies/process-batch` (grep por `CRON_SECRET`/`Bearer`). `replies/backfill` e `monitoring/initial-scan` usam sessão de usuário.
- Contexto de risco: o webhook **nunca foi registrado** no Instantly do cliente (plano bloqueia webhooks; `GET /api/v2/webhooks` → `[]`, spike Epic 21). A ingestão real é o polling `reply-sweep`. Logo, o fail-closed do webhook não muda nada para o cliente.

## Tasks & Acceptance

**Execution:**
- `src/lib/webhook/instantly-webhook-utils.ts` -- adicionar `WEBHOOK_SECRET_HEADER = "x-webhook-secret"`, `extractWebhookSecret(url: string, headers: Headers): string | null` (query `token` primeiro, depois header), `safeEqual(a, b)` em tempo constante (XOR por char, sem early-return; tamanhos diferentes → false) e `auth: { expectedSecret: string | undefined; providedSecret: string | null }` em `WebhookDeps`; em `processWebhookRequest`, depois do 405 e antes do parse: env vazia → 503 `Webhook not configured`; segredo ausente ou diferente → 401 `Unauthorized` -- ponto testável da regra.
- `supabase/functions/instantly-webhook/index.ts` -- replicar inline `extractWebhookSecret`/`safeEqual` e o guard (lendo `Deno.env.get("INSTANTLY_WEBHOOK_SECRET")`), na mesma posição; adicionar `x-webhook-secret` ao `Access-Control-Allow-Headers` (e no `CORS_HEADERS` do utils); cabeçalho documenta `supabase secrets set INSTANTLY_WEBHOOK_SECRET=...`, deploy com `--no-verify-jwt` e a URL `https://kdgogyqyaxncqoyklyxx.supabase.co/functions/v1/instantly-webhook?token=<INSTANTLY_WEBHOOK_SECRET>` para cadastrar no Instantly.
- `src/app/api/monitoring/process-batch/route.ts` -- guard `if (!monitoringSecret || !authHeader || authHeader !== \`Bearer ${monitoringSecret}\`)` com comentário igual ao da `replies` -- fecha o fail-open.
- `__tests__/unit/functions/instantly-webhook.test.ts` -- default de auth válido no `createMockDeps`; novo `describe` cobrindo as linhas do I/O Matrix do webhook (incluindo que `lookupCampaign`/`insertEvent` não são chamados), `extractWebhookSecret` (query, header, nenhum, query vence) e `safeEqual`; sincronia de `CORS_HEADERS` com o header novo.
- `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` -- testes "fail-closed: 401 quando MONITORING_CRON_SECRET não está configurado" com header `Bearer undefined` e com `Bearer ` -- e confirmar que `createClient` não foi chamado.
- `.env.example` -- seção "Instantly Webhook (Story 23.1)" com `INSTANTLY_WEBHOOK_SECRET`, explicando que vai em Supabase → Edge Functions → Secrets e o formato da URL.

**Acceptance Criteria:**
- Given a `instantly-webhook` com `INSTANTLY_WEBHOOK_SECRET` configurado, when chega POST sem `token`/`x-webhook-secret` ou com valor errado, then responde 401 e nenhum insert em `campaign_events` é tentado.
- Given o cabeçalho de `supabase/functions/instantly-webhook/index.ts` e o `.env.example`, when o operador for configurar o Instantly, then encontra a URL com `?token=` e o comando para criar o secret.
- Given `monitoring/process-batch` ou `replies/process-batch`, when o segredo da env está ausente ou não confere, then responde 401 sem executar, com teste para os dois casos em cada rota.
- Given a story concluída, when `npm run lint`, `npm run typecheck` e `npm run test:run` rodam, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 16 findings — high 0, medium 3, low 9, false 3, maybe-false 1
- findings:
  - `[low]` `[patch]` (blind) Ordem do rollout no cabeçalho (secret → deploy → cadastro) daria 401 em eventos se já houvesse webhook sem token — hoje não há webhook cadastrado (spike Epic 21), mas a doc foi reordenada: secret → URL com ?token= no Instantly → deploy, no cabeçalho e no `.env.example`.
  - `[medium]` `[patch]` (blind) Rejeição 401 não deixava log; token errado no Instantly pararia eventos em silêncio — adicionado `console.warn("Webhook rejected: secret missing|invalid")` sem nenhum valor de segredo.
  - `[false]` `[reject]` (blind) Dois testes novos de env ausente na monitoring passariam no código antigo — os testes afirmam corretamente o AC "env ausente → 401"; a regressão real (env undefined + `Bearer undefined`) é coberta pelo terceiro teste, que falha no código antigo.
  - `[medium]` `[defer]` (blind) Código Deno de produção não testado — agrupado com o achado da verification-gap; ver `deferred`.
  - `[low]` `[reject]` (blind) Recomendar header em vez de `?token=` — a AC aceita token na URL e o spec escolheu query como formato documentado; correção editaria o spec.
  - `[low]` `[reject]` (blind) Query errada vence header correto — só acontece se o chamador mandar os dois; improvável e a correção adiciona ramo.
  - `[low]` `[reject]` (blind) Registro de impacto no cliente (Regra nº 1) ausente no diff — é registrado no Finalize (Auto Run Result), não em código.
  - `[low]` `[reject]` (blind) `safeEqual` caseiro vaza comprimento — o segredo é hex de 64 chars de tamanho fixo; vazar tamanho é irrelevante e trocar por SHA-256 + timingSafeEqual adiciona complexidade.
  - `[false]` `[reject]` (blind) `.env.example` lugar errado e ref do projeto exposta — a ref `kdgogyqyaxncqoyklyxx` não é segredo (já está no CLAUDE.md versionado) e o bloco deixa explícito que vai no Supabase, não na Vercel.
  - `[false]` `[reject]` (blind) `delete process.env` vaza env entre testes — o `beforeEach` re-stuba `MONITORING_CRON_SECRET` antes de cada teste e o Vitest isola por arquivo.
  - `[low]` `[patch]` (edge) Mesmo achado da ordem de rollout — mesma correção da linha 1.
  - `[low]` `[patch]` (edge) Secret com espaço/quebra de linha nunca casaria — env lida com `?.trim()`; só espaços cai no 503.
  - `[low]` `[reject]` (edge) Segredo com `+ & #` quebraria na query — a geração documentada é `openssl rand -hex 32` (só hex); validar adicionaria guard.
  - `[low]` `[reject]` (edge) Query errada vence header correto — mesmo motivo da linha 6.
  - `[medium]` `[defer]` (verification-gap) O guard de segredo do handler Deno publicado nunca é executado por teste; só o espelho em `src/lib` — pré-verificado pela camada; o repo não tem harness Deno para Edge Functions; adiado com o achado da linha 4 (ver `deferred`), smoke pós-deploy nas `operator_actions`.
  - `[maybe-false]` `[defer]` (intent) `reply-sweep`/`monitor-leads` não cobertas pela AC "demais com Bearer" — elas não conferem Bearer, só repassam; o risco real (disparo com anon key) é pré-existente e corrigir exige publicar Edge Function; ver `deferred`. O outro ponto do auditor (frontmatter `awaiting-operator` + `operator_actions`) é atendido no Finalize.

## Design Notes

Por que query string além de header: o Instantly v2 permite header customizado no webhook, mas a URL com `?token=` funciona em qualquer cadastro (UI ou API) e é o formato que a AC pede documentar. O segredo na URL fica nos logs de acesso do Supabase; aceitável para um segredo de baixo privilégio e rotacionável.

503 para env ausente (e não 401) separa "configuração quebrada" de "chamador inválido" no log da função; os dois são fail-closed. Nas rotas de cron mantém-se 401 para env ausente, igual à referência `replies/process-batch` e seus testes.

Impacto no cliente (Regra nº 1): webhook nunca registrado → nenhuma ingestão real passa por ele; `monitoring/process-batch` com env presente e chamador legítimo segue idêntico (com env ausente já recebia 401, pois o Bearer real ≠ `Bearer undefined`).

## Verification

**Commands:**
- `npx vitest run __tests__/unit/functions/instantly-webhook.test.ts __tests__/unit/app/api/monitoring/process-batch/route.test.ts __tests__/unit/app/api/replies/process-batch/route.test.ts` -- expected: todos passam
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erros

**Manual checks (if no CLI):**
- Diff de `supabase/functions/instantly-webhook/index.ts` vs `instantly-webhook-utils.ts`: guard na mesma ordem (OPTIONS → método → segredo → JSON → validação).

## Auto Run Result

Status: awaiting-operator

**Resumo:** a Edge Function `instantly-webhook` agora exige o segredo `INSTANTLY_WEBHOOK_SECRET` (query `?token=` ou header `x-webhook-secret`, comparação em tempo constante) antes de ler o corpo ou tocar o banco: sem segredo/errado → 401, env ausente → 503, rejeição logada sem o valor. A rota `/api/monitoring/process-batch` ficou fail-closed como a `replies/process-batch`. URL com segredo e ordem de rollout documentadas no cabeçalho da função e no `.env.example`. O código está pronto; publicar a função e criar o secret ficam com o operador (ver `operator_actions`).

**Arquivos:**
- `supabase/functions/instantly-webhook/index.ts` — guard de segredo inline, CORS com `x-webhook-secret`, log de rejeição, cabeçalho de setup.
- `src/lib/webhook/instantly-webhook-utils.ts` — `extractWebhookSecret`, `safeEqual`, `WEBHOOK_SECRET_HEADER`, `auth` em `WebhookDeps` e guard em `processWebhookRequest`.
- `src/app/api/monitoring/process-batch/route.ts` — guard fail-closed com env ausente.
- `__tests__/unit/functions/instantly-webhook.test.ts` — matriz de auth do webhook, extração e comparação do segredo.
- `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` — env ausente e segredo errado sem instanciar Supabase.
- `.env.example` — seção do `INSTANTLY_WEBHOOK_SECRET`.

**Revisão:** 16 achados — 4 patches aplicados (1 medium, 3 low, contando os 2 duplicados de ordem de rollout), 3 adiados em 2 itens de `deferred` (handler Deno sem teste; Edge Functions de cron disparáveis com anon key), 9 rejeitados (motivos no Review Triage Log). Follow-up review: `false` — só um medium corrigido (log de rejeição) e nenhum high.

**Verificação:** `npx vitest run` dos 3 arquivos do spec → 124/124; `npm run lint` → 0 erros (134 warnings pré-existentes); `npm run typecheck` → limpo; `npm run test:run` → 437 arquivos, 8231 passaram, 2 skipped. Todas as linhas da matriz I/O têm teste que rodou e passou. Ordem do guard conferida no diff das duas cópias (OPTIONS → método → segredo → JSON → validação).

**Impacto no cliente (Regra nº 1), por análise do diff, sem smoke real:**
- Tocados: Edge Function `instantly-webhook` (só no repo, não publicada), rota `/api/monitoring/process-batch`, `.env.example` e testes. Nenhuma migration, tabela, job pg_cron, secret, prompt ou integração alterada.
- (1) Campanhas rodando e recebimento de respostas/aberturas: inalterados. O webhook nunca foi cadastrado no Instantly do cliente (plano bloqueia webhooks); a ingestão real é o `reply-sweep` → `/api/replies/process-batch`, não tocado.
- (2) Busca de leads: não tocada.
- (3) Criação de campanha e export/ativação no Instantly: não tocados.
- `monitoring/process-batch`: chamador legítimo com env presente tem o mesmo resultado; com env ausente já recebia 401 antes.

**Riscos residuais:** até o deploy do operador, a função publicada continua sem checar segredo. Depois do deploy sem o secret criado, o webhook responde 503 (fail-closed, sem impacto hoje porque não há webhook cadastrado). O código Deno só é validado pela cópia testada e pelo smoke pós-deploy.

## Operator Actions — execução (2026-10-21)

- **Conferências prévias (só leitura):**
  - `GET /api/v2/webhooks` no Instantly → `{"items":[]}`. Nenhum webhook cadastrado, então a ação 2 não teve o que atualizar.
  - `campaign_events`: os 11 eventos existentes são todos `source='polling'`. O webhook nunca gravou nada.
  - A versão publicada (v8, fev/2026) foi baixada e comparada com o repo antes da 23.1: idêntica (só CRLF). O deploy trouxe apenas o guard de segredo.
  - `MONITORING_CRON_SECRET` existe na Vercel (Development, Preview, Production) e nos secrets do Supabase. A rodada de 2026-10-20 14:30 respondeu 200, o que prova que os dois têm o mesmo valor. O fail-closed não afeta o monitor.
- **Ação 1:** Fabossi criou o secret `INSTANTLY_WEBHOOK_SECRET` via CLI. O valor está guardado em `docs/credentials.md`, fora do git.
- **Ação 3:** `npx supabase functions deploy instantly-webhook --no-verify-jwt` → versão 10, `verify_jwt=false`.
- **Ação 4 (smoke em produção, sem gravar nada):**
  - sem segredo → 401 `Unauthorized`; segredo errado → 401.
  - com segredo por `?token=` e corpo `{}` → 400 "Missing required fields"; o mesmo via header `x-webhook-secret` → 400.
  - `OPTIONS` → 204.
  - `campaign_events` continua com os mesmos 11 eventos `polling`.
- **Os 3 pontos:**
  1. Campanhas e respostas: inalterados. A ingestão é o `reply-sweep`, não tocado. Conferido por smoke real depois do merge (ver abaixo).
  2. Busca de leads: não tocada (diff).
  3. Export e ativação no Instantly: não tocados (diff).
- **Ação 5:** PR #13 mergeado na `main` (`d533461`). Deploy de produção na Vercel `success`.
  - `POST /api/monitoring/process-batch` sem `Authorization` → 401; com `Bearer undefined` → 401. Antes, o fail-open deixava esse segundo caso passar.
  - Crons depois do deploy (12:20 e 12:25 UTC): `reply-sweep` 200, com contagens normais, e `monitor-leads` 200 `no_config`. O chamador legítimo autentica, e nada está vencido até 27/10.
- **Os 3 pontos, confirmados:**
  1. `reply-sweep` segue com 200 a cada 5 min (smoke real).
  2. A busca de leads não foi tocada (diff).
  3. Export e ativação não foram tocados (diff).

## Operator Confirmation

Confirmed 2026-10-21: the external actions this story owed were carried out.

- Gerar o segredo e criar o secret da Edge Function no projeto kdgogyqyaxncqoyklyxx: npx supabase secrets set INSTANTLY_WEBHOOK_SECRET=$(openssl rand -hex 32) (guardar o valor).
- Se algum webhook estiver cadastrado no Instantly (hoje GET /api/v2/webhooks retorna vazio porque o plano bloqueia webhooks), atualizar a URL para https://kdgogyqyaxncqoyklyxx.supabase.co/functions/v1/instantly-webhook?token=<INSTANTLY_WEBHOOK_SECRET> ANTES do deploy.
- Publicar a função: npx supabase functions deploy instantly-webhook --no-verify-jwt.
- Smoke pós-deploy sem gravar nada: curl -i -X POST https://kdgogyqyaxncqoyklyxx.supabase.co/functions/v1/instantly-webhook -H 'Content-Type: application/json' -d '{}' deve responder 401; com ?token=<segredo> e corpo '{}' deve responder 400 (autenticado, payload inválido, nada gravado).
- Fazer o merge do epic/23-plataforma-higiene na main (deploy Vercel) para a correção fail-closed de /api/monitoring/process-batch entrar em produção, conferindo que MONITORING_CRON_SECRET existe nas env de produção da Vercel.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._

## Follow-up — Edge Functions de cron só aceitam o pg_cron (2026-10-21)

Fecha o item adiado "reply-sweep e monitor-leads aceitam qualquer JWT válido, inclusive a anon key". Autorizado pelo Fabossi.

- **Achado a mais:** a `monitor-leads` estava publicada com `verify_jwt=false` e aceitava chamada até sem token.
- **Correção:** `src/lib/cron/cron-trigger-auth.ts` (`isServiceRoleCaller`), com cópia inline nas duas funções.
  - Aceita o token igual à `SUPABASE_SERVICE_ROLE_KEY` ou um JWT com `role: service_role`. Esse segundo caso só é seguro porque o gateway, com `verify_jwt`, já validou a assinatura.
  - A anon key e qualquer outro token recebem 401 antes de chamar a Vercel.
  - Os jobs `pg_cron` não mudaram: eles já mandam a service role do vault.
- **Testes:**
  - 11 em `__tests__/unit/lib/cron/cron-trigger-auth.test.ts`, incluindo um que trava a cópia inline das duas funções contra a `src/lib`.
  - As duas funções rodaram localmente em Deno contra uma Vercel stub: sem token, anon e token qualquer → 401; service key e JWT service_role → 200 repassando o segredo certo; OPTIONS → 204.
  - Gates: lint ok, typecheck ok, `deno check` ok, 438 arquivos / 8242 testes ok.
- **Deploy, uma função por vez, logo depois de uma rodada do cron, com backup das versões no ar (iguais ao repo) para rollback:**
  - `monitor-leads` v10, `verify_jwt=true`.
    - O primeiro deploy manteve `verify_jwt=false`, porque o CLI preserva o valor anterior. Republicado com `--no-verify-jwt=false` em 20 s.
    - De fora: sem token → 401 do gateway; anon key → 401; JWT `service_role` forjado → 401 "Invalid JWT".
    - pg_cron 13:45 UTC → 200 `no_config`.
  - `reply-sweep` v4, `verify_jwt=true`.
    - De fora: sem token → 401; anon key → 401.
    - pg_cron 13:50 UTC → 200 com as contagens de sempre (`skipped:10`, `engagementSkipped:1`). Rollback não foi necessário.
- **Os 3 pontos:**
  1. Smoke real: `reply-sweep` 200 depois do deploy. No Instantly (só GET), 25 campanhas: 2 ativas (Indústria Farmacêutica, Indústria Alimentícia), 18 concluídas, 5 rascunhos. Nenhuma tocada.
  2. Busca de leads: não tocada (diff).
  3. Export e ativação: não tocados (diff).
