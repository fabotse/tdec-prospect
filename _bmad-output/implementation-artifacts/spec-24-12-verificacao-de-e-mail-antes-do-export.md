---
title: '24.12 — Status do e-mail visível na revisão (sem custo e sem trava)'
type: 'feature'
created: '2026-10-28'
status: done
baseline_revision: 'ffcf6a49c3db9d84ff01f055dc83210c5692c179'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred: []
operator_actions:
  - "Revise e aplique supabase/migrations/00072_add_lead_email_status.sql no SQL Editor do Supabase de producao (kdgogyqyaxncqoyklyxx). Ela so adiciona a coluna nullable leads.email_status com CHECK (verified/invalid/unknown) e nao altera nenhuma linha. Sem ela, nenhum status e gravado e nenhum aviso aparece."
  - "Depois de aplicar a 00072, enriqueca um lead pela tela de Meus Leads e confirme no banco que leads.email_status ficou verified, invalid ou unknown, e que a coluna Contato mostra o aviso 'E-mail nao verificado' so para invalid/unknown."
---

<intent-contract>

## Intent

**Problem:** O enrichment do Apollo (`/v1/people/match`, já pago) devolve `email_status`, mas o código descarta esse dado. O gestor aprova leads e campanhas sem saber se o e-mail foi verificado. Além disso, o `create_campaign` do agente pede `revealPersonalEmails: true`, o que viola a NFR8 (nunca revelar e-mail pessoal).

**Approach:** Normalizar o `email_status` do Apollo em `verified` / `invalid` / `unknown` e gravá-lo numa coluna nova nullable `leads.email_status` (migration 00072, aditiva), sempre num UPDATE à parte e best-effort, no padrão do Fit Score da 24.16. Mostrar o aviso discreto "E-mail não verificado" quando o status gravado é `invalid` ou `unknown`: na revisão de leads do agente (ao lado do badge Fit), na prévia da campanha do agente e na lista de leads. O export e a ativação não mudam.

## Boundaries & Constraints

**Always:**
- Normalização (helper puro, seguro no cliente): `email_status === "verified"` → `verified`; `"invalid"` → `invalid`; qualquer outro valor (`unverified`, `guessed`, `likely to engage`, `null`, …) → `unknown`. Só existe status quando o enrichment devolveu um e-mail (`person.email` não vazio). Sem e-mail, a função devolve `null` e nada é gravado.
- `NULL` na coluna = status nunca consultado (leads antigos, CSV, busca sem enrichment). `NULL` **não** mostra aviso. Aviso só para `invalid` ou `unknown`. Texto do aviso: "E-mail não verificado", com tooltip "O Apollo não confirmou este e-mail. O envio não é bloqueado.".
- Gravação sempre separada do UPDATE/INSERT principal, best-effort: erro (ex.: coluna ainda inexistente antes da 00072) só loga com `console.warn`, nunca lança, nunca muda a resposta, a contagem ou o `degraded`. O código sobe seguro antes da migration.
- Fluxo manual: `POST /api/leads/[leadId]/enrich` e `POST /api/leads/enrich/bulk` (os dois grupos, por `apollo_id` e por detalhes) gravam o status depois do UPDATE principal bem-sucedido. Nenhuma chamada nova ao Apollo.
- Agente: o enrichment do `create_campaign` anota `emailStatus` no lead em memória (só quando `person.email` veio). `persistApprovedLeads` ganha uma fase best-effort (depois da Fase 6) que grava `email_status` nos persistidos com status: inseridos sempre; reusados só se o e-mail da linha existente, normalizado, for igual ao e-mail do registro.
- `create_campaign`: `revealPersonalEmails` continua `true` (decisão do Fabossi em 2026-11-02, ver Design Notes).
- Revisão de leads do agente: o `search_leads` anota `emailStatus` dos leads que o tenant já tem com status gravado, por `apollo_id`, numa leitura **separada** e fail-open (erro → nenhum status, nada mais muda). Não estender o `select` de `findContactedLeads` (um erro de coluna desligaria a triagem da 24.15).
- Prévia da campanha (`AgentCampaignPreview`) mostra o mesmo aviso por lead a partir de `leadsWithIcebreakers[].emailStatus`.
- Lista de leads (`LeadTable`, coluna Contato): aviso quando `lead.emailStatus` é `invalid`/`unknown`. `Lead.emailStatus` vem de `email_status` (`select("*")` já traz a coluna depois da migration; antes dela, `undefined` → `null`).

**Never:**
- Nenhuma chamada paga nova (Treg, verificação externa, enrichment extra).
- Nada muda no export (`export-step.ts`, `instantly.ts`, export manual) nem na ativação: sem filtro, bloqueio, confirmação extra ou ordenação por status. `emailStatus` não vai para o Instantly.
- Não mudar a pré-seleção, a ordenação nem a elegibilidade da revisão por causa do status.
- Nada de `UPDATE`/`DELETE` em linhas existentes na migration; sem CHECK que possa falhar em dados antigos (a coluna nasce vazia). Sem `pg_cron`, Edge Function ou secret.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Verificado | Apollo `email`=x, `email_status`="verified" | `email_status`=`verified`, sem aviso | — |
| Inválido | `email_status`="invalid" | `invalid`, aviso | — |
| Desconhecido | `email`=x, `email_status`="unverified" ou null | `unknown`, aviso | — |
| Sem e-mail | `person.email` null | nada gravado (coluna fica como está) | — |
| Antes da 00072 | UPDATE de `email_status` falha | enrichment/persistência respondem igual a hoje | só `console.warn` |
| Reusado com e-mail diferente | lead existente com outro e-mail | status não gravado nessa linha | — |
| Lookup da revisão falha | erro na leitura de `email_status` | revisão sem avisos, triagem e Fit Score iguais | fail-open |
| Export com não verificados | leads `invalid`/`unknown` | export idêntico ao de hoje | — |

</intent-contract>

## Code Map

- `src/types/apollo.ts:313` -- `ApolloEnrichedPerson.email_status` tipado como `"verified" | "invalid" | null`. Ampliar para `string | null` (o Apollo devolve outros valores). `transformEnrichmentToLead` (:399-446) **não** recebe o status (ele alimenta o UPDATE principal).
- `src/app/api/leads/[leadId]/enrich/route.ts:93-122` -- UPDATE principal; gravar o status depois do sucesso (`supabase` da rota, filtro `tenant_id` + `id`).
- `src/app/api/leads/enrich/bulk/route.ts:121-200` -- grupo 1 (`enrichPeople`, `:136`) e grupo 2 (`enrichPeopleByDetails`, `:174`). Gravar após cada UPDATE OK.
- `src/lib/agent/steps/create-campaign-step.ts:137-159` -- enrichment do agente (`revealPersonalEmails: true` em `:144`).
- `src/lib/agent/lead-persistence.ts` -- `LeadRecord` (:101), `dedupeBatch` (:279-395, merge `?? `), Fase 1 `fetchExistingLeads` (traz `email` das linhas existentes), Fase 6 (:905-935) é o molde exato da fase nova (`runWithConcurrency`, `UPDATE_CONCURRENCY`, warn sem `degraded`).
- `src/lib/agent/steps/search-leads-step.ts:449-560` -- `buildSearchOutput` (todos os modos passam por ele); anotar depois do `screenLeads`. `src/lib/agent/lead-screening.ts:79` -- `findContactedLeads`, molde para a leitura nova (não alterar).
- `src/types/agent.ts:343` -- `SearchLeadResult` (+ `emailStatus?: LeadEmailStatus | null`; `LeadWithIcebreaker` herda).
- `src/components/agent/AgentLeadReview.tsx:38-45` (`LeadPreview`), badge Fit em `:663-675`, aviso "já contatado" em `:679` (molde visual). `mergeFitScores` (:90) não precisa mudar.
- `src/components/agent/AgentCampaignPreview.tsx:32` (`LeadIcebreaker`), lista em `:311-326`.
- `src/types/lead.ts` -- `Lead`/`LeadRow` (+ `emailStatus`/`email_status`), `transformLeadRow` (:217). `src/components/leads/LeadTable.tsx:797-810` e `ContactAvailabilityCell` (:1035-1095).
- `supabase/migrations/00070_add_lead_fit_score.sql` -- molde da 00072. Última migration: `00071`.
- Testes: `__tests__/unit/api/leads-enrich.test.ts`, `__tests__/unit/lib/agent/lead-persistence.test.ts`, `lead-screening.test.ts`, `steps/create-campaign-step.test.ts`, `steps/search-leads-step.test.ts`, `__tests__/unit/components/agent/AgentLeadReview.test.tsx`, `AgentCampaignPreview.test.tsx`, `__tests__/unit/components/leads/LeadTable.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/leads/email-status.ts` -- NOVO, puro: `LeadEmailStatus`, `normalizeApolloEmailStatus(email, rawStatus)`, `isUnverifiedEmailStatus(status)`, `toLeadEmailStatus(value: unknown)` (aceita só os 3 valores), `UNVERIFIED_EMAIL_LABEL`/`UNVERIFIED_EMAIL_HINT`; e `persistLeadEmailStatus(supabase, tenantId, leadId, status)` best-effort num arquivo só-servidor `src/lib/leads/persist-email-status.ts`. -- fonte única.
- [x] `supabase/migrations/00072_add_lead_email_status.sql` -- `ADD COLUMN IF NOT EXISTS email_status TEXT NULL` + CHECK nos 3 valores + COMMENT; cabeçalho "NÃO APLICAR sem o OK do Fabossi". -- AC1.
- [x] Rotas `[leadId]/enrich` e `enrich/bulk` + `src/types/apollo.ts` -- gravar o status após o UPDATE OK. -- AC1.
- [x] `create-campaign-step.ts` -- anotar `emailStatus` (`revealPersonalEmails: false` revertido para `true` pelo operador em 2026-11-02). `lead-persistence.ts` -- `emailStatus` no `LeadRecord`/merge e Fase 7 best-effort. -- AC1, AC4.
- [x] `search-leads-step.ts` (+ função nova fail-open `findStoredEmailStatuses` em `lead-screening.ts`) e `src/types/agent.ts` -- anotar `emailStatus`. -- AC2.
- [x] `AgentLeadReview.tsx`, `AgentCampaignPreview.tsx`, `src/types/lead.ts`, `LeadTable.tsx` -- aviso discreto (ícone âmbar + texto curto/tooltip, `data-testid="email-unverified"`). -- AC2.
- [x] Testes -- NOVO `__tests__/unit/lib/leads/email-status.test.ts` (matriz de normalização, best-effort); casos nos testes existentes do Code Map: rotas gravam/ignoram/sobrevivem ao erro, `reveal` falso, Fase 7 (inserido, reusado igual/diferente, erro não degrada), lookup fail-open, avisos renderizados só para `invalid`/`unknown`, export inalterado.

**Acceptance Criteria:**
- Given um enrichment Apollo (manual ou do agente) que devolve e-mail, when o lead é gravado, then `leads.email_status` fica `verified`/`invalid`/`unknown`, sem chamada paga adicional, e a resposta da rota/persistência é a mesma de antes.
- Given a revisão de leads do agente, a prévia da campanha ou a lista de leads, when o status é `invalid` ou `unknown`, then aparece o aviso "E-mail não verificado" (ao lado do Fit na revisão); com `verified` ou `NULL`, nenhum aviso.
- Given leads não verificados, when o export (manual ou agente) e a ativação rodam, then nada muda: nenhum filtro, bloqueio ou confirmação extra.
- Given o enrichment do `create_campaign`, when busca o e-mail, then chama `enrichPerson` com `revealPersonalEmails: true` (inalterado, decisão do operador em 2026-11-02).
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 22 findings — high 0, medium 2, low 14, false 6, maybe-false 0
- findings:
  - `low` `reject` [blind] O CHECK inline da 00072 valida a tabela sob lock — mesmo padrao da 00070 (ja aplicada); coluna nova so com NULL e tabela `leads` pequena, o scan dura milissegundos; a aplicacao e manual pelo Fabossi.
  - `medium` `patch` [blind] `revealPersonalEmails: false` pode reduzir os leads exportados (ponto 3 da regra nº 1) sem aviso explicito — pedido pela AC4; tratado na finalizacao com `operator_actions` pedindo a confirmacao do Fabossi antes do deploy.
  - `low` `reject` [blind] `invalid` e `unknown` mostram o mesmo aviso e o tooltip nao fala de invalido — texto unico definido no Always; mudar exige variante nova de UI.
  - `low` `reject` [blind] Sem `email_status_checked_at`; status pode ficar velho se o UPDATE do status falhar depois de trocar o e-mail — caso raro (falha so antes da 00072, quando nao ha status nenhum); coluna nova seria superficie nova.
  - `false` `reject` [blind] `findStoredEmailStatuses` escolhe linha arbitraria entre duplicatas de `apollo_id` — ha unique `(tenant_id, apollo_id)` (00010_create_leads.sql:39); nao existem duplicatas.
  - `low` `reject` [blind] `console.warn` por lead antes da 00072 polui o log — temporario ate a migration, mesmo padrao da Fase 6 (24.16).
  - `low` `reject` [blind] UPDATEs sequenciais no bulk e leitura nao paralela no search — bulk limitado a 100 leads e dominado pelas chamadas ao Apollo; paralelizar adiciona complexidade.
  - `low` `reject` [blind] Aviso so com `title` nativo, sem Tooltip Radix, dificil por teclado/toque — texto `sr-only` presente; trocar para Tooltip e mais que correcao direta.
  - `low` `reject` [blind] Faltam testes do merge do `dedupeBatch`, do retry e da Fase 7 com entradas repetidas — caminhos raros (lote com o mesmo contato duas vezes, colisao concorrente).
  - `low` `patch` [blind] Bloco `describe` da 24.12 aninhado dentro do da 24.9 em `AgentCampaignPreview.test.tsx` — movido para `describe` de topo com `beforeEach` proprio.
  - `low` `patch` [blind] Status anotado na busca sobrevive no `create_campaign` quando o enrichment nao traz e-mail ou falha, e a previa avisa para lead sem e-mail — cada tentativa de enrichment agora define `emailStatus` so a partir dela (`null` sem e-mail ou no catch); teste novo.
  - `low` `patch` [edge] Mesmo defeito do achado anterior (status antigo no `create_campaign`) — mesmo patch.
  - `low` `reject` [edge] 100 UPDATEs sequenciais no bulk — mesmo grupo do achado blind de latencia.
  - `false` `reject` [edge] Duplicatas de `apollo_id` com status diferentes — unique `(tenant_id, apollo_id)` impede.
  - `medium` `patch` [verification-gap] `fetch-leads` repete a triagem sem `findStoredEmailStatuses`, entao o aviso some depois de "Buscar N leads" — rota agora chama `findStoredEmailStatuses` + `annotateEmailStatus` apos `screenLeads`; 2 testes novos (anotacao na resposta e no output gravado; lookup com erro nao muda nada).
  - `low` `reject` [verification-gap/other] A rota individual devolve o lead antes do UPDATE do status, o painel mostra status antigo ate o refetch — o painel nao exibe o aviso e a invalidacao de `["leads"]` corrige a lista; "mesma resposta" e pedido do Always.
  - `low` `patch` [intent] AC1 em producao depende da 00072 aplicada pelo Fabossi, registrada so em prosa — finalizado como `awaiting-operator` com `operator_actions`.
  - `false` `reject` [intent] A revisao avisa quase so para leads ja conhecidos, porque o enrichment roda depois da aprovacao — nao ha status antes do enrichment sem chamada paga extra, que a intencao proibe; Design Notes registram a escolha e a previa da campanha cobre o status recem-obtido.
  - `false` `reject` [intent] `NULL` (nunca consultado) nao avisa, separado de `unknown` — avisar em todo `NULL` marcaria 100% dos leads novos; a AC fala do status guardado.
  - `low` `patch` [intent] AC4 x ponto 3 da regra nº 1 — mesmo grupo do achado blind sobre `revealPersonalEmails` (operator action de confirmacao).
  - `false` `reject` [intent] AC3 provado so no payload — o diff nao toca `export-step.ts`, `instantly.ts`, export manual nem ativacao; o teste de payload cobre o unico ponto onde o lead com status passa.
  - `false` `reject` [intent] Rotas `/api/integrations/apollo/enrich*` nao gravam status — sao pass-through que nao escrevem em `leads`; o import usa `/api/leads/enrich/bulk`, coberta.

## Design Notes

- **Por que `NULL` não avisa:** na revisão de leads do agente, os leads novos ainda não passaram pelo enrichment (ele roda no `create_campaign`, depois da aprovação). Tratar "nunca consultado" como "não verificado" poria o aviso em 100% dos leads e não ajudaria a decidir. O aviso fica onde há status real: leads que o tenant já tem enriquecidos (revisão), a prévia da campanha (logo depois do enrichment, antes do export) e a lista de leads.
- **Por que UPDATE separado:** o código pode subir antes da 00072. Com o status dentro do UPDATE principal, o enrichment manual e a persistência do agente quebrariam até a migration ser aplicada (regra nº 1). Mesmo motivo da Fase 6 da 24.16.
- **`revealPersonalEmails`:** a implementação desligou (AC4/NFR8), mas o Fabossi decidiu em 2026-11-02 manter `true`. Desligar tiraria do export os leads cujo único e-mail no Apollo é pessoal, o que mexe no ponto 3 da regra nº 1. A AC4 do épico foi reescrita.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/leads __tests__/unit/lib/agent __tests__/unit/api/leads-enrich.test.ts __tests__/unit/components/agent __tests__/unit/components/leads` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Smoke somente leitura no banco de produção: confirmar que `leads.email_status` ainda não existe (migration pendente) e que nenhum código novo lê a coluna fora de leituras fail-open/`select("*")`. Nenhum enrichment, export ou ativação real é executado.

## Completion Notes

**O que pode mudar para o cliente:**
- Rotas: `POST /api/leads/[leadId]/enrich` e `POST /api/leads/enrich/bulk` fazem um UPDATE extra, best-effort (`leads.email_status`), depois do UPDATE principal OK. Mesma resposta e mesma contagem. Nenhuma chamada nova ao Apollo.
- Agente: o `create_campaign` só passou a anotar `emailStatus` vindo do enrichment. O `revealPersonalEmails` continua `true` (revertido na revisão do operador, 2026-11-02), então os leads que entram no export não mudam.
- `persistApprovedLeads`: Fase 7 nova (UPDATE best-effort de `email_status`). Erro só gera `console.warn`; `degraded` e as contagens não mudam.
- `search_leads`: uma leitura nova e fail-open (`findStoredEmailStatuses`) que só anota `emailStatus`. Triagem, Fit Score, ordem e pré-seleção não mudam.
- UI: aviso "E-mail não verificado" (ícone `text-warning`, tooltip) na revisão de leads (ao lado do Fit), na prévia da campanha e na coluna Contato da lista de leads. Só aparece para `invalid`/`unknown`.
- Tabela: migration `00072_add_lead_email_status.sql` (coluna nullable + CHECK, aditiva). **Não aplicada.** Precisa do OK do Fabossi.
- Prompts, jobs `pg_cron`, Edge Functions, secrets, `export-step.ts`, `instantly.ts` e a ativação não foram tocados.

**Os 3 pontos (verificados por análise do diff + testes unitários, sem smoke real de enrichment, export ou ativação):**
1. Campanhas rodando, webhook e `reply-sweep`: nenhum arquivo desses caminhos foi tocado.
2. Busca de leads: o único acréscimo é uma leitura fail-open. Smoke somente leitura em produção confirmou que hoje ela devolve `42703 column leads.email_status does not exist`, e o código trata esse erro como mapa vazio (testado).
3. Criação de campanha e export/ativação: o export continua idêntico. Há um teste novo em `export-step.test.ts` que compara o payload com e sem `emailStatus`. O `revealPersonalEmails: false` foi revertido para `true` na revisão do operador, então nada muda no caminho até o Instantly.

**Verificação:** `npm run lint` (0 erros), `npm run typecheck` e `npm run test:run` (457 arquivos, 8909 testes) passaram.

## Auto Run Result

Status: awaiting-operator

**Resumo:** o `email_status` do enrichment do Apollo (já pago) é normalizado em `verified`/`invalid`/`unknown` e gravado best-effort em `leads.email_status` (migration 00072, aditiva, não aplicada) nos enrichments manual (individual e bulk) e do agente (Fase 7 da persistência). O aviso "E-mail não verificado" aparece só para `invalid`/`unknown` na revisão de leads do agente (ao lado do Fit, inclusive depois de "Buscar N leads"), na prévia da campanha e na coluna Contato da lista de leads. O `create_campaign` mantém `revealPersonalEmails: true` (decisão do Fabossi). Export e ativação não mudaram.

**Arquivos:**
- `src/lib/leads/email-status.ts` — normalização e textos do aviso (puro).
- `src/lib/leads/persist-email-status.ts` — UPDATE best-effort do status.
- `supabase/migrations/00072_add_lead_email_status.sql` — coluna nullable + CHECK.
- `src/app/api/leads/[leadId]/enrich/route.ts`, `src/app/api/leads/enrich/bulk/route.ts` — gravam o status após o UPDATE OK.
- `src/lib/agent/steps/create-campaign-step.ts` — status vindo só do enrichment (`revealPersonalEmails` mantido `true`).
- `src/lib/agent/lead-persistence.ts` — `emailStatus` no registro e Fase 7.
- `src/lib/agent/lead-screening.ts` — `findStoredEmailStatuses` (fail-open) e `annotateEmailStatus`.
- `src/lib/agent/steps/search-leads-step.ts`, `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts` — anotam o status gravado.
- `src/components/leads/EmailUnverifiedWarning.tsx` — componente do aviso; usado em `AgentLeadReview.tsx`, `AgentCampaignPreview.tsx` e `LeadTable.tsx`.
- `src/types/agent.ts`, `src/types/apollo.ts`, `src/types/lead.ts` — tipos.
- Testes: novo `__tests__/unit/lib/leads/email-status.test.ts`; casos novos em enrich, persistência, triagem, search/create/export steps, fetch-leads e componentes.

**Revisão:** 22 achados. Patches: 2 medium (fetch-leads sem anotação; confirmação do `revealPersonalEmails` via operator action) e 5 low (status antigo no `create_campaign` ×2, describe aninhado, operator action da 00072 e o duplicado de AC4). Nada adiado. Rejeitados: 9 low (lock do CHECK, texto único invalid/unknown, sem timestamp, log ruidoso, latência sequencial ×2, acessibilidade do title, testes de caminhos raros, lag do painel) e 6 false (unique de `apollo_id` ×2, revisão antes do enrichment, `NULL` sem aviso, AC3 no payload, rotas pass-through) — motivos no Review Triage Log.

**Follow-up review:** `false` — primeira passada com 2 patches medium, mas um deles é só a operator action (sem código); o patch de código medium (fetch-leads) é pequeno, espelha o step e está testado. Patches por verdict: high 0, medium 2, low 5.

**Verificação:** `npm run lint` (0 erros, 134 warnings já existentes), `npm run typecheck` e `npm run test:run` (457 arquivos, 8912 testes, 2 skipped) passaram depois dos patches. Smoke somente leitura em produção (feito na implementação): `leads.email_status` ainda não existe (42703) e o código trata isso como "sem status". `/verify` (Playwright, dev local na porta 3001): Meus Leads carrega (`/api/leads` 200, 1.159 leads) sem nenhum aviso, como esperado antes da 00072; a revisão do agente não foi aberta porque exige rodar a execução (APIs pagas).

**Riscos residuais:** sem a 00072 nada aparece e cada enrichment gera um `console.warn`; leads só com e-mail pessoal saem do export do agente (aguarda confirmação do Fabossi); a UI não foi conferida no navegador, só por testes de componente.

## Smoke em produção (2026-11-02)

Deploy: PR #17, merge `cb01d76`. Migration 00072 aplicada pelo Fabossi e conferida via `db-ro` (coluna nullable + CHECK, 0 de 1159 leads com status antes do smoke). `revealPersonalEmails` mantido `true` por decisão do Fabossi (commit `16bdc78`).

Execução `0fa44623-af2f-4307-a319-0ec7ff58f52b`, "CISO de São Paulo, traga 2 leads", modo Guiado (plano R$ 0,60):
- Revisão de leads: 10 exibidos, 2 pré-selecionados, Fit B. Nenhum aviso "E-mail não verificado", como esperado (nenhum status gravado ainda).
- Aprovados os 2 leads → `create_campaign` fez o enrichment e gerou sequência + 2 icebreakers. Os 2 leads eram linhas já existentes (reusadas, mesmo e-mail): `email_status` = `verified` gravado nas duas (Fase 7). Prévia sem aviso, coerente com `verified`.
- Parado em "Criação de Campanha" (`awaiting_approval`), **sem aprovar**: nada exportado ao Instantly. A execução antiga `8ff30be2` foi encerrada (`cancelled`) ao abrir a nova conversa.
- Não testado em produção: o aviso para `invalid`/`unknown` (nenhum lead nesse estado ainda) e o enrichment manual de Meus Leads. Cobertos por testes unitários.

**Os 3 pontos:** busca de leads e criação de campanha funcionando (smoke real); export/ativação e campanhas rodando não tocados (diff + smoke parado antes do export).

## Operator Confirmation

Confirmed 2026-11-02: the external actions this story owed were carried out.

- Revise e aplique supabase/migrations/00072_add_lead_email_status.sql no SQL Editor do Supabase de producao (kdgogyqyaxncqoyklyxx). Ela so adiciona a coluna nullable leads.email_status com CHECK (verified/invalid/unknown) e nao altera nenhuma linha. Sem ela, nenhum status e gravado e nenhum aviso aparece.
- Depois de aplicar a 00072, enriqueca um lead pela tela de Meus Leads e confirme no banco que leads.email_status ficou verified, invalid ou unknown, e que a coluna Contato mostra o aviso 'E-mail nao verificado' so para invalid/unknown.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
