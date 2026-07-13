# Epic 21 — Checklist de Validação PÓS-DEPLOY (loop de resposta)

> **Status: DEPLOY ADIADO DE PROPÓSITO (decisão Fabossi, 2026-07-13).**
> O backend do loop de resposta (stories **21.1** + **21.2**) está `done`, revisado e
> validado **localmente contra prod real** — mas **NÃO foi deployado na Vercel**.
> Motivo: só vale deployar quando houver uma **story visual** pra mostrar (a página
> que renderiza os cards). Este doc existe pra a gente **lembrar de fechar o loop do
> cron logo após esse deploy**.

## 🎯 Quando executar este checklist

Assim que a **primeira story visual do Epic 21** for concluída e você deployar na Vercel.
A story visual natural é a **21.4 — Central de Oportunidades (página e cards)** (é ela que
renderiza a tabela `opportunities`). Também há UI na 21.5 (ações do card) e 21.7
(notificações/configurações). Gatilho: **primeiro deploy do Epic 21 → rode este checklist.**

## 📌 Estado atual (o que já está pronto vs. o que falta)

**Prontos (verificados em 2026-07-13):**
- Código 21.1 (schema/tipos) + 21.2 (sweep, processador, cron, backfill) — commitado na branch `epic/21-loop-de-resposta` (local, **sem push**).
- Migrations `00055` + `00056` **aplicadas** no banco (gerido à mão; deploy não roda migration).
- **Vercel envs**: `REPLIES_CRON_SECRET` (Dev/Preview/Prod), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `API_KEYS_ENCRYPTION_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — todas presentes. A 21.2 **não precisa de env nova**.
- **Backfill já rodou contra o banco de PRODUÇÃO** (o `.env.local` aponta pra prod): 3 `campaign_events`, 2 `opportunities` (reply_event_id 2/2), 2 `lead_interactions`, 1 auto-reply filtrado. Idempotência confirmada. → **O histórico de mar/2026 já está no banco; NÃO precisa re-rodar o backfill pós-deploy.**

**Falta (só destrava com o deploy):**
- O **cron deployado** (pg_cron → edge fn `reply-sweep` → rota `/api/replies/process-batch`) hoje bate num **404**, porque a rota `/api/replies/*` só existe na branch, não em prod. Depois do deploy a rota passa a existir e o cron começa a ingerir respostas **novas** dentro da janela.

## ✅ Checklist pós-deploy (o que confirmar)

- [ ] **🔴 CRÍTICO — secret idêntico nos dois lados.** `REPLIES_CRON_SECRET` da **Vercel Production** tem que ser **exatamente igual** ao secret da **Edge Function `reply-sweep`** no Supabase. Se divergirem, o cron toma **401 silencioso a cada 5 min** (só aparece em `cron.job_run_details`). Ambos são encriptados — reconfirme que é a mesma string (ou regere e cole nos dois de uma vez).
- [ ] **`NEXT_APP_URL`** (secret da edge fn no Supabase) aponta pra **URL de produção** da Vercel (não uma URL de preview por-deploy).
- [ ] **Vault secrets** `supabase_url` / `service_role_key` existem (reusados do cron de monitoring/13.3, que já roda).
- [ ] Edge fn `reply-sweep` **deployada** (`npx supabase functions deploy reply-sweep`).
- [ ] Cron `reply-sweep-cron` **agendado** (`SELECT * FROM cron.job WHERE jobname = 'reply-sweep-cron';`).
- [ ] **Pós-deploy: o loop fecha.** Em `cron.job_run_details` (Supabase) as execuções recentes do `reply-sweep-cron` retornam **200**, não 401/404. Logs da edge fn mostram o `fetch` pra `/api/replies/process-batch` bem-sucedido.
- [ ] **Ingestão real de resposta nova.** Uma resposta que chegue **dentro da janela de 30 dias** vira `opportunity` sozinha via cron. Confirme com:
  `node --env-file=.env.local scripts/inspect-reply-loop.mjs`
  (é read-only; compara contra o baseline 3 `campaign_events` / 2 `opportunities`).

## 🔗 Referências

- Story: [21-2-ingestao-por-polling-processador-backfill.md](21-2-ingestao-por-polling-processador-backfill.md) — seção "Validação Local & Handoff" + "Review Findings" + Change Log
- Diagnóstico read-only: [scripts/inspect-reply-loop.mjs](../../scripts/inspect-reply-loop.mjs)
- Infra de cron espelha 13.3: `supabase/functions/monitor-leads` + `supabase/migrations/00045_schedule_monitor_leads_cron.sql`
- Defer relacionado: fail-open de secret ausente é sistêmico (também na rota de monitoring) — [deferred-work.md](deferred-work.md)
