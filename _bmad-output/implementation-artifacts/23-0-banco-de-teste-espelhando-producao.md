# Story 23.0: Banco de teste espelhando produção

Status: backlog (ADIADA em 2026-10-15 por decisão do Fabossi — ver CLAUDE.md do projeto)

<!-- Requisitos: FR43 · NFR10 — fonte: planning-artifacts/epics-23-25-plataforma-agente-3.0-radar.md#Story 23.0 -->

## Story

As a responsável técnico,
I want desenvolver e testar num banco separado, cópia do de produção,
so that nada do que fazemos localmente mude o que o cliente usa hoje até o deploy.

## Contexto (por que esta story vem primeiro)

Hoje existe **um único projeto Supabase** (`kdgogyqyaxncqoyklyxx`) e o `.env.local` aponta para ele: é o banco de **produção** do cliente (dados reais, ~1.120 leads). Qualquer migration, job pg_cron, Edge Function ou smoke rodado "localmente" altera produção. A 23.0 abre o Epic 23 e vale para os Epics 23, 24 e 25: depois dela, o desenvolvimento fala com o banco de teste e produção só muda no deploy (NFR10).

O Fabossi aceita testar com **dados reais** e com as **chaves originais** de Apollo/Instantly (copiadas junto com o banco), com uma condição: **campanhas de teste nunca são ativadas** no Instantly.

## Acceptance Criteria

1. **Projeto de teste com cópia de produção.** Dado um segundo projeto Supabase (plano gratuito) criado para teste, quando a estrutura e os dados de produção são copiados para ele (Supabase CLI: roles + schema + data, incluindo `auth.users`/`auth.identities`), então o app local funciona contra o banco de teste com os mesmos dados, os mesmos logins (mesmas senhas) e as mesmas integrações. As chaves criptografadas em `api_configs` continuam válidas porque o `.env.local` usa a mesma `API_KEYS_ENCRYPTION_KEY`.
2. **Infra de jobs no teste.** As extensões `pg_cron` e `pg_net` estão habilitadas no projeto de teste. As 4 Edge Functions (`instantly-webhook`, `signalhire-callback`, `monitor-leads`, `reply-sweep`) estão publicadas nele. Os jobs `monitor-leads-cron` e `reply-sweep-cron` estão agendados apontando para o **próprio** projeto de teste (Vault `supabase_url`/`service_role_key` do teste). Nenhum job, URL ou segredo do teste aponta para produção.
3. **`.env.local` aponta para o teste.** Ao fim da story, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SIGNALHIRE_CALLBACK_URL` do `.env.local` apontam para o projeto de teste. As credenciais de produção ficam só nas variáveis da Vercel (Production), e foi conferido que elas estão lá.
4. **Passo a passo documentado.** `docs/ambiente-de-teste.md` explica: (a) como reproduzir ou atualizar a cópia (refresh), (b) como aplicar uma mudança em produção no deploy (migration, Edge Function, cron, secret), (c) como saber para qual banco o ambiente local está apontando, e (d) as regras do ambiente de teste (AC 6).
5. **Drift registrado.** As 63 migrations versionadas (`supabase/migrations/00001…00063`) são comparadas com a estrutura copiada de produção. As divergências encontradas (objetos em produção sem migration, migrations não aplicadas ou aplicadas diferente, e migrations que falham quando reaplicadas do zero) ficam registradas em `docs/drift-migrations-2026-10.md`, cada uma com objeto, tipo de divergência e recomendação. **Esta story não corrige o drift em produção**; só registra. Correções viram itens no `deferred-work.md` ou stories futuras.
6. **Regra "criar sim, ativar nunca".** Em testes que tocam o Instantly no ambiente de teste, campanhas podem ser criadas, mas nunca ativadas. A regra está documentada e **é aplicada no código**: com `INSTANTLY_ACTIVATION_DISABLED=true` (definido no `.env.local` e **nunca** na Vercel), `InstantlyService.activateCampaign` falha com uma mensagem clara, sem chamar a API. Há teste unitário cobrindo isso.

## Tasks / Subtasks

> Legenda: **[FABOSSI]** = passo que precisa do Felipe (dashboard, senha, criação de conta). O dev agent **para e pede** esses passos com instruções exatas; não tenta contornar.

- [ ] **Task 0: Pré-checagem e segurança (AC: todos)**
  - [ ] 0.1 Confirmar que o `.env.local` aponta hoje para `kdgogyqyaxncqoyklyxx` (produção). Até a Task 5 terminar, **nada de escrita** nesse projeto: só leitura e dump.
  - [ ] 0.2 Backup do `.env.local` atual em local seguro **fora do repo**, por exemplo `~/.tdec-secrets/env.production.backup` com `chmod 600`. Ele tem a `API_KEYS_ENCRYPTION_KEY`, que é obrigatória para as chaves copiadas funcionarem. Perder essa chave = perder todas as integrações.
  - [ ] 0.3 Ferramentas: o `supabase` CLI 2.120.0 já está instalado. **Docker não está instalado**, e o `supabase db dump` precisa dele (roda pg_dump num container). **[FABOSSI]** instalar Docker Desktop ou OrbStack. Sem Docker, o fallback é `brew install libpq` (pg_dump/psql nativos, versão ≥ a do servidor) com os filtros da seção "Fallback sem Docker" nas Dev Notes.
- [ ] **Task 1: Criar o projeto de teste (AC: 1, 2)**
  - [ ] 1.1 **[FABOSSI]** Criar o projeto `tdec-prospect-test` numa **organização gratuita** (Free). Se for criado na org do projeto de produção e ela for paga, há cobrança de compute. Usar a mesma região de produção e a mesma versão major de Postgres. Guardar a senha do banco.
  - [ ] 1.2 Anotar `project-ref`, URL, anon key e service role key do teste (Dashboard › Settings › API). **Não** commitar nada disso.
  - [ ] 1.3 Strings de conexão: usar o **Session pooler** (IPv4). A conexão direta é só IPv6 no Free.
- [ ] **Task 2: Medir o drift ANTES de copiar (AC: 5)**. Recomendado: projeto descartável.
  - [ ] 2.1 **[FABOSSI]** Criar um 2º projeto Free temporário (`tdec-drift`), ou usar o próprio projeto de teste antes da Task 3.
  - [ ] 2.2 Aplicar as 63 migrations **em ordem** (`psql -v ON_ERROR_STOP=0 -f` uma a uma, registrando quais falham e o erro). **Não** aplicar `supabase/seed.sql`. Migration que falha do zero já é achado de drift.
  - [ ] 2.3 `supabase db dump --db-url <drift> -f /tmp/.../schema-migrations.sql` e `supabase db dump --db-url <prod> -f /tmp/.../schema-prod.sql` (schema `public`). Fazer também o dump do que vive fora do `public` e as migrations criam: trigger `on_auth_user_created` em `auth.users` (00002/00053), publicação `supabase_realtime` (`agent_messages`, 00051), jobs `cron.job`.
  - [ ] 2.4 Diff normalizado (ordenar e remover comentários/owners). Classificar cada divergência: *só em prod* / *só nas migrations* / *diferente* / *migration falha do zero*. Pontos já suspeitos, para confirmar ou descartar: enum `interaction_type` sem `whatsapp_sent` (deferred-work.md:109); 00053 com guardas `to_regclass` ("banco gerido à mão, sem migration tracking"); ausência de `supabase_migrations.schema_migrations` em prod.
  - [ ] 2.5 Escrever `docs/drift-migrations-2026-10.md` (tabela objeto | tipo | detalhe | recomendação) e apagar o projeto `tdec-drift` **[FABOSSI]**.
- [ ] **Task 3: Copiar produção → teste (AC: 1)**. Procedimento oficial "Backup and Restore using the CLI".
  - [ ] 3.1 Dump de produção, **somente leitura**, em pasta temporária fora do repo (os dumps têm PII e hashes de senha; **nunca** commitar):
    ```bash
    supabase db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
    supabase db dump --db-url "$PROD_DB_URL" -f schema.sql
    supabase db dump --db-url "$PROD_DB_URL" -f data.sql --use-copy --data-only
    ```
  - [ ] 3.2 Restaurar no teste:
    ```bash
    psql --single-transaction --variable ON_ERROR_STOP=1 \
      --file roles.sql --file schema.sql \
      --command 'SET session_replication_role = replica' \
      --file data.sql --dbname "$TEST_DB_URL"
    ```
    O `session_replication_role = replica` desliga triggers no load. Isso é essencial: senão o `handle_new_user` recriaria profiles ao inserir `auth.users`. Erros "already exists" de schemas padrão do Supabase são esperados. Se a transação abortar por eles, rodar sem `--single-transaction` e conferir.
  - [ ] 3.3 Conferir que o `data.sql` incluiu `auth.users` e `auth.identities` (o dump padrão inclui `auth`). Se não incluiu, fazer um dump dedicado dessas tabelas.
  - [ ] 3.4 Recriar o que **não** vem no dump:
    - trigger `on_auth_user_created` em `auth.users`, se não veio (reaplicar o trecho de 00002 com o corpo atual de `handle_new_user` da 00053);
    - publicação Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;` (00051) e qualquer outra tabela que esteja na publicação de produção (consultar `pg_publication_tables` em prod);
    - **Vault não é copiado** (a root key é por projeto): criar no teste `vault.create_secret('<URL do TESTE>', 'supabase_url')` e `vault.create_secret('<service role do TESTE>', 'service_role_key')`.
    - Storage: o app não usa Supabase Storage (sem `.storage.from` em `src`), então não há nada a copiar. Confirmar que não há buckets em prod.
  - [ ] 3.5 Validação de contagem: comparar `count(*)` de produção e teste nas tabelas principais (`tenants`, `profiles`, `auth.users`, `leads`, `campaigns`, `campaign_leads`, `campaign_events`, `api_configs`, `agent_executions`, `opportunities`, `knowledge_base`, `ai_prompts`) e registrar no doc.
- [ ] **Task 4: Auth, Edge Functions e crons no teste (AC: 2)**
  - [ ] 4.1 **[FABOSSI]** Auth › URL Configuration do teste: Site URL `http://localhost:3000`, Redirect URLs `http://localhost:3000/**`. As configurações de auth não vêm no dump.
  - [ ] 4.2 Deploy das funções no teste com `--project-ref <test-ref>` explícito em **todo** comando, nunca contando com `link`:
    ```bash
    supabase functions deploy instantly-webhook   --project-ref <test-ref> --no-verify-jwt
    supabase functions deploy signalhire-callback --project-ref <test-ref> --no-verify-jwt
    supabase functions deploy monitor-leads       --project-ref <test-ref>
    supabase functions deploy reply-sweep         --project-ref <test-ref>
    ```
  - [ ] 4.3 Secrets das funções no teste (`supabase secrets set --project-ref <test-ref>`): `MONITORING_CRON_SECRET`, `REPLIES_CRON_SECRET` (podem ser **novos** valores, iguais aos do `.env.local` do teste). `NEXT_APP_URL` **não aponta para a Vercel de produção**: ou fica sem valor (a função retorna 500 "Missing environment variables" e nada roda) ou aponta para um túnel local (cloudflared/ngrok) só durante um smoke deliberado. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` já são injetados pelo Supabase.
  - [ ] 4.4 Agendar os crons no teste reaplicando **00045** (monitor-leads) e **00061** (reply-sweep, versão com `timeout_milliseconds`). Em seguida, **desativar por padrão**: `SELECT cron.alter_job(jobid, active := false) FROM cron.job;`. Motivo: o `reply-sweep` → `/api/replies/process-batch` faz polling do **mesmo workspace do Instantly** e dispara **WhatsApp real** (Z-API) para os vendedores (`notification-processor.ts`). Rodando no teste, os alertas ficam duplicados. Ligar só durante smoke deliberado e documentar como.
  - [ ] 4.5 **Não** registrar a URL do `instantly-webhook` do teste no Instantly. O webhook de produção continua sendo o único configurado lá.
- [ ] **Task 5: Trocar o `.env.local` e conferir a Vercel (AC: 3)**
  - [ ] 5.1 **[FABOSSI]** Conferir no dashboard da Vercel (o CLI `vercel` não está instalado) que o ambiente **Production** tem todas as variáveis do `.env.example`, com os valores de produção: Supabase URL/anon/service, `API_KEYS_ENCRYPTION_KEY`, `SIGNALHIRE_CALLBACK_URL`, `MONITORING_CRON_SECRET`, `REPLIES_CRON_SECRET`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SITE_URL`. Anotar para qual banco aponta o ambiente **Preview** e registrar no doc. Se apontar para produção, recomendar apontá-lo para o teste (decisão do Fabossi).
  - [ ] 5.2 Atualizar o `.env.local`: as 3 variáveis Supabase + `SIGNALHIRE_CALLBACK_URL=https://<test-ref>.supabase.co/functions/v1/signalhire-callback` (hoje aponta para prod, e os callbacks de lookup cairiam no banco de produção). Adicionar `INSTANTLY_ACTIVATION_DISABLED=true`. **Manter** a mesma `API_KEYS_ENCRYPTION_KEY`.
  - [ ] 5.3 Remover do `.env.local` qualquer credencial de produção restante. O backup da Task 0.2 fica fora do repo.
  - [ ] 5.4 Atualizar `.env.example` com `INSTANTLY_ACTIVATION_DISABLED` (comentado: "só no ambiente de teste — NUNCA na Vercel Production") e uma nota apontando para `docs/ambiente-de-teste.md`.
- [ ] **Task 6: Guarda de ativação no código (AC: 6)**
  - [ ] 6.1 Em `src/lib/services/instantly.ts`, `activateCampaign` (linha ~626): se `process.env.INSTANTLY_ACTIVATION_DISABLED === "true"`, lançar erro **antes** do `request`, com mensagem em PT-BR, por exemplo: "Ativação de campanhas desabilitada neste ambiente (INSTANTLY_ACTIVATION_DISABLED). A campanha foi criada no Instantly, mas não foi ativada." Comparar só com `"true"`: valor ausente = comportamento atual, então produção não muda (NFR2).
  - [ ] 6.2 Esse é o **único** ponto de ativação do sistema: só `src/lib/agent/steps/activate-step.ts:240` chama, e o fluxo manual não ativa. O erro sobe para o step e o step fica `failed` com a mensagem. Não mexer na lógica de idempotência/pre-flight do ActivateStep (22.18).
  - [ ] 6.3 Testes em `__tests__/unit/lib/services/instantly.test.ts`: (a) com a env `"true"`, lança o erro e `fetch` **não** é chamado; (b) sem a env ou com outro valor, mantém o comportamento atual (POST `/activate`). Usar `vi.stubEnv` e `vi.unstubAllEnvs` no `afterEach`.
- [ ] **Task 7: Documentação (AC: 4, 6)**. `docs/ambiente-de-teste.md`, em PT-BR, com:
  - [ ] 7.1 Mapa dos ambientes (tabela): projeto | ref | quem usa | crons ativos? | webhook Instantly? Sem chaves.
  - [ ] 7.2 "Como saber para onde estou apontando": comparar `NEXT_PUBLIC_SUPABASE_URL` com o ref de produção e com o ref de teste.
  - [ ] 7.3 Refresh da cópia: os comandos da Task 3 e o que refazer depois (Vault, publicação, trigger auth, crons desativados, contagens). Avisar que o refresh **sobrescreve** o que foi testado no teste.
  - [ ] 7.4 Deploy para produção (checklist, em ordem): migration aplicada em prod **antes** do código (NFR7); `supabase functions deploy … --project-ref <prod-ref>`; `supabase secrets set --project-ref <prod-ref>`; crons em prod; variáveis na Vercel; merge na `main`. Sempre `--project-ref` explícito.
  - [ ] 7.5 Regras do teste: (1) campanhas no Instantly podem ser criadas, **nunca ativadas** (guarda `INSTANTLY_ACTIVATION_DISABLED`); (2) Instantly e Apollo são as contas **reais**: criar campanha de teste gasta o workspace e o Apollo gasta créditos reais (prefira volumes mínimos e apague as campanhas de teste no Instantly depois); (3) ações de sequência (`sequence-actions`: pausar/remover lead) e `updateLeadInterestStatus` alteram campanhas **reais** no Instantly, então não usar em campanhas de produção a partir do teste; (4) WhatsApp (Z-API) manda mensagem **real**, então não enviar para leads a partir do teste; (5) crons do teste ficam desativados por padrão; (6) não registrar o webhook do teste no Instantly; (7) dumps nunca entram no repo.
- [ ] **Task 8: Smoke real (AC: 1, 3) — NFR6**
  - [ ] 8.1 `npm run dev` com o novo `.env.local`. Login com um usuário real (gestor) funciona.
  - [ ] 8.2 Telas: leads (contagem igual à de prod), campanhas, agente (abrir execução existente), oportunidades, Configurações › Integrações mostrando as chaves e "Testar conexão" do Instantly/Apollo **ok**. Isso prova que a `API_KEYS_ENCRYPTION_KEY` decripta os dados copiados.
  - [ ] 8.3 Prova de isolamento: criar algo trivial no teste (ex.: um segmento "teste-23.0") e confirmar, **só lendo** produção, que ele não aparece lá. Depois apagar no teste.
  - [ ] 8.4 Prova da guarda: chamar `activateCampaign` com a env ligada (teste unitário basta; se fizer smoke via agente, parar no step de ativação e conferir que ele falha com a mensagem e que a campanha está como Rascunho no Instantly; depois apagar a campanha).
  - [ ] 8.5 `npx vitest run` verde para os arquivos tocados. `npm run lint` sem erro novo (a base tem 6 erros pré-existentes; a 23.4 zera).
- [ ] **Task 9: Fechamento**
  - [ ] 9.1 Atualizar a memória `env-local-e-producao` (o `.env.local` agora = teste) e o README, se ele citar setup de Supabase.
  - [ ] 9.2 Registrar no `deferred-work.md` os itens de drift que precisam de correção em prod.

## Dev Notes

### Natureza da story
É uma story **de infraestrutura e operação**, com uma única mudança de código (Task 6). A maior parte do trabalho são comandos no CLI e passos no dashboard que dependem do Felipe. A Definition of Done é o **smoke real** (NFR6): login, telas e "Testar conexão" contra o banco de teste, mais o doc. Testes mockados não bastam.

### Estado atual (verificado em 2026-10-15)
- Projeto único: `kdgogyqyaxncqoyklyxx` (prod). `.env.local` e `SIGNALHIRE_CALLBACK_URL` apontam para ele.
- **Sem `supabase/config.toml`** no repo. Funções e secrets são configurados pelo Dashboard/Vault. `supabase/.temp` só tem `cli-latest`, então o repo **não está linkado**. Bom: use sempre `--project-ref`/`--db-url` explícitos e não rode `supabase link` para prod.
- Banco "gerido à mão, sem migration tracking" (comentários das 00053/00056/00061). As migrations recentes são idempotentes e defensivas (`IF NOT EXISTS`, `unschedule … WHERE EXISTS`).
- Crons: `monitor-leads-cron` (00045, `*/5`) e `reply-sweep-cron` (00056 → reagendado na 00061 com `timeout_milliseconds := 60000`). Os dois leem `supabase_url`/`service_role_key` do **Vault** e chamam a Edge Function. A função faz fetch em `${NEXT_APP_URL}/api/.../process-batch` com Bearer (`MONITORING_CRON_SECRET`/`REPLIES_CRON_SECRET`).
- Edge Functions: `instantly-webhook` e `signalhire-callback` com `--no-verify-jwt` (provedores externos sem JWT). `monitor-leads`/`reply-sweep` com JWT (o cron manda a service role).
- Integrações (Apollo, Instantly, SignalHire, Snov, Apify, Z-API, TheirStack, OpenAI) ficam **criptografadas em `api_configs`** com AES-256-GCM e a `API_KEYS_ENCRYPTION_KEY` do servidor. Por isso essa chave tem que ser idêntica no teste.
- Trigger `on_auth_user_created` (AFTER INSERT ON `auth.users` → `public.handle_new_user()`, 00002; corpo atual na 00053, default `sdr`). Ele vive no schema `auth`, que o dump de schema padrão não cobre: verificar e recriar.
- Realtime: `agent_messages` na publicação `supabase_realtime` (00051). O chat do agente depende disso. Sem a publicação, o chat não atualiza ao vivo.

### Armadilhas (o que dá errado se ignorado)
1. **Vault não migra.** O cron do teste ficaria sem URL. Pior: se alguém copiasse os secrets à mão com os valores de prod, os crons do teste chamariam a função de **produção**. Os secrets do Vault do teste usam URL e chave **do teste**.
2. **"Restore to a New Project" (backup físico, planos pagos)** copia jobs pg_cron, pg_net **e** a root key do Vault. O clone sairia disparando os crons de prod contra prod. **Não usar.** Use o caminho manual do CLI.
3. **`NEXT_APP_URL` do teste apontando para a Vercel de produção** faria o cron do teste rodar o processamento de **produção**. Deixar vazio ou usar túnel local.
4. **`reply-sweep` ativo no teste** gera WhatsApp real duplicado para os vendedores e ingere as mesmas respostas do Instantly. Os crons ficam desativados por padrão.
5. **`SIGNALHIRE_CALLBACK_URL` antigo**: lookups de telefone feitos no teste gravariam o resultado em prod.
6. **Sem `session_replication_role = replica`** no load dos dados, triggers disparam e duplicam ou recriptografam dados.
7. Dumps com PII e hashes: pasta temporária (scratchpad/`/tmp`), apagar ao fim, **nunca** no repo. O `.gitignore` já ignora `.env*` (exceto `.env.example`).
8. Sessões: o JWT secret muda por projeto. Usuários precisam logar de novo no ambiente local, e as senhas são as mesmas (hash bcrypt copiado).
9. Grants: na restauração, as tabelas herdam os default privileges do projeto novo. Se o diff de grants/RLS acusar diferença, seguir a nota da doc (revogar defaults antes do schema) e registrar.

### Fallback sem Docker
`brew install libpq` e usar `pg_dump`/`psql` do mesmo major (ou maior) do servidor, conectando pelo Session pooler. O pg_dump cru inclui internals do Supabase e dá erro de permissão no restore. Então limitar a `--schema=public` (+ dump de dados de `auth.users`/`auth.identities` com `--data-only`), `--no-owner --no-privileges`, e recriar trigger, publicação e Vault como na Task 3.4. Preferir o caminho com Docker.

### Mudança de código (Task 6): o que preservar
- `activateCampaign` hoje retorna `Promise<void>` e lança erro em falha (contrato da 22.18). A guarda só antecipa um `throw`, então o contrato fica igual.
- O ActivateStep faz pre-flight (`readCampaignState`), não reativa campanhas em `DO_NOT_ACTIVATE_STATUSES` e grava `stampLatestApprovalGate` **só depois** de ativar. Com a guarda, o erro sobe antes do carimbo: correto, a campanha não foi ativada e o card volta re-armado. Não alterar `activate-step.ts`.
- Nada muda em produção enquanto a env não existir lá (NFR2/NFR10).

### Fora do escopo
- Corrigir o drift em produção (só registrar).
- Autenticação do webhook e fail-closed dos crons: é a **23.1**.
- CI: é a **23.4**.
- Automatizar o refresh com script. Opcional: se fizer, criar em `scripts/` no padrão dos utilitários existentes (cabeçalho com uso, `node --env-file`), mas o AC só pede o passo a passo.

### Project Structure Notes
- Novos: `docs/ambiente-de-teste.md`, `docs/drift-migrations-2026-10.md`.
- Alterados: `src/lib/services/instantly.ts` (guarda), `__tests__/unit/lib/services/instantly.test.ts`, `.env.example`, `_bmad-output/implementation-artifacts/deferred-work.md`.
- Locais e não versionados: `.env.local`, backup fora do repo, dumps em pasta temporária.
- `docs/` já tem `custos-operacao.md`, `client/`, `diagrams/`. Seguir o padrão markdown em PT-BR.

### Informação técnica atual (docs Supabase, out/2026)
- Procedimento oficial: `supabase db dump` em 3 arquivos (`--role-only`, schema, `--data-only --use-copy`) e restore com `psql --single-transaction -v ON_ERROR_STOP=1 … SET session_replication_role = replica`. O CLI precisa de Docker. Os dados de `auth` vêm no dump. **Não migram:** Vault/root key, Edge Functions, configurações de auth, API keys, Realtime/publicações, buckets do Storage, senhas de roles LOGIN customizados.
- Erros "already exists" de schemas padrão são esperados ao restaurar num projeto novo.

### References
- [Source: _bmad-output/planning-artifacts/epics-23-25-plataforma-agente-3.0-radar.md#Story 23.0] (FR43, NFR10, NFR6, NFR7, NFR2)
- [Source: supabase/migrations/00045_schedule_monitor_leads_cron.sql, 00056, 00061] (crons + Vault)
- [Source: supabase/migrations/00002_create_profiles.sql:36-64, 00053:124-140] (trigger de auth)
- [Source: supabase/migrations/00051_enable_realtime_agent_messages.sql]
- [Source: supabase/functions/*/index.ts] (env vars das funções, flags de deploy)
- [Source: src/lib/services/instantly.ts:608-635, src/lib/agent/steps/activate-step.ts:200-270]
- [Source: src/lib/utils/notification-processor.ts, src/app/api/replies/process-batch/route.ts] (WhatsApp real no ciclo do cron)
- [Source: .env.example] (variáveis do ambiente)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:109] (drift conhecido do enum)
- Supabase docs: [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [Restore Dashboard backup](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
