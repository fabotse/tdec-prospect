---
title: '24.25 — Memória entre execuções'
type: 'feature'
created: '2026-11-09'
baseline_revision: 'd7979e2c0f25b3feaefe25abf05b97398b804c3b'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
linear: 'FEL-48'
requisitos: 'FR38'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      Nenhuma verificação contra o schema, os dados e a RLS reais; tudo é testado com mocks.
    evidence: |-
      Os testes simulam o Supabase e o fetch. Para fechar: smoke real (tela + banco) abrindo o plano de um briefing parecido com uma execução anterior exportada e uma revisão com lead/conta já trabalhados.
    location: >-
      src/lib/agent/execution-memory.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** O agente não lembra das execuções anteriores. Um briefing novo não mostra que já houve um parecido nem como ele foi. Na revisão, o lead já trabalhado só ganha o badge "Já contatado", sem dizer em qual campanha, quando e com que resultado. A conta (empresa) já trabalhada não aparece.

**Approach:** Tudo só de leitura e sem migration. (1) O plano de execução (`GET .../plan`, opt-in `memory=1`) devolve até 3 execuções anteriores parecidas do tenant, com respostas, oportunidades e reuniões vindas do loop do Epic 21, e o `AgentExecutionPlan` mostra isso numa nota. (2) Uma rota nova de leitura devolve o histórico resumido (campanha, data, resultado) por lead e por conta, e a `AgentLeadReview` mostra isso embaixo do nome.

## Boundaries & Constraints

**Always:**
- Leituras com o client de **sessão** (`createClient` de `@/lib/supabase/server`) e `.eq("tenant_id", profile.tenant_id)` explícito onde a tabela tem `tenant_id`. Nunca service-role.
- Fail-open: qualquer erro de leitura vira "sem memória" ou "sem histórico" (`console.warn`). O plano, a revisão, a seleção, a ordem e o payload do Aprovar continuam idênticos.
- Só `.eq`/`.in`/`.neq` com valores. Nunca `.or()`, `.filter()` nem `ilike` montados com texto da request.
- Textos na UI em pt-BR com acentos, sem emojis. Texto como filho de JSX (sem HTML).
- A nota da memória é informativa. Nunca muda o custo, os steps nem o botão "Iniciar Execução".

**Never:**
- Migration, coluna nova, `pg_cron`, Edge Function, env ou secret.
- Mexer em `src/lib/agent/steps/**`, `orchestrator.ts`, `fetch-leads`, `approve`, export, ativação ou serviços do Instantly (Regra nº 1).
- Chamar LLM, Apollo, Treg, Apify ou Instantly, ou gravar em `api_usage_logs`. A memória não tem custo.
- Ler memória no `GET .../plan` sem `memory=1`. O `fetchStepEstimatedCost` do `AgentChat` chama o plano a cada turno de ajuste (Trap #7 da 22.14).
- Casar conta por domínio de e-mail ou por `ilike`. A conta casa só pelo `company_name` exato.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Briefing parecido | Execução anterior com cargo "CISO" e local "São Paulo", campanha com 2 respostas e 1 oportunidade | Nota: "Seu briefing anterior “CISO · São Paulo” (dd/mm/aaaa, campanha X) teve 2 respostas e 1 oportunidade." | — |
| Nada parecido | Nenhuma execução anterior compatível ou nenhuma com campanha | `memory: []` e nenhuma nota | — |
| Parecida sem resultado | Campanha sem respostas | "… ainda sem respostas." | — |
| Local diferente | Mesmo cargo, local "Rio de Janeiro" vs "São Paulo" | Não é parecida | — |
| Erro de leitura | Falha em `agent_executions`/`agent_steps`/`opportunities`/`campaign_events` | `memory: []`, plano normal | `console.warn` |
| Lead já trabalhado | `leads.apollo_id` com `campaign_leads` e oportunidade `meeting_booked` | "Campanha X · dd/mm/aaaa · reunião marcada" | — |
| Lead sem resposta | Em campanha sem oportunidade | "Campanha X · dd/mm/aaaa · sem resposta registrada" | — |
| Conta já trabalhada | Outro lead do tenant com o mesmo `company_name` em campanha | "Conta já trabalhada: N contato(s) · última campanha X (dd/mm/aaaa) · resultado" | — |
| Lead novo | Nenhum casamento | Nada aparece | — |
| Erro na rota de histórico | 500, timeout ou formato inválido | Revisão sem linha de histórico, sem erro visível | silencioso |

</intent-contract>

## Code Map

- `src/app/api/agent/executions/[executionId]/plan/route.ts:151-200` -- GET do plano. Já lê `execution.briefing` e `profile.tenant_id`. O opt-in `viability=1` (linha 191) é o molde do `memory=1`. Rodar as duas leituras em paralelo (`Promise.all`) para manter o NFR de <5 s.
- `src/components/agent/AgentExecutionPlan.tsx:68-70` -- fetch `?viability=1` (passa a ser `?viability=1&memory=1`). `PlanData` (28-38). O bloco `plan-viability` (139-185) é o molde visual da nota.
- `src/components/agent/AgentLeadReview.tsx` -- `LeadPreview` (35-50). Linha do lead (659-735): badge "Já contatado" em 706-713 (`data-testid="lead-already-contacted"`). `filteredLeads`, `executionId`. Já usa `AccountDossierSheet`, então os testes já têm `QueryClientProvider` (confirmar em `__tests__/unit/components/agent/AgentLeadReview.test.tsx`).
- `src/lib/agent/lead-screening.ts:81` `findContactedLeads` -- molde do casamento por `apollo_id` com status de lead e oportunidade. Somente leitura, não muda.
- `src/types/agent.ts:123` `ParsedBriefing` -- `jobTitles`, `location`, `technology`, `targetAccounts[{domain}]`. `src/types/opportunity.ts:29` -- status da oportunidade (`new|viewed|contacted|meeting_booked|discarded`), `source` (`reply|engagement`), `intent` (`…|opt_out`).
- Dados (somente leitura, sem migration):
  - `agent_executions` (00047): `id, tenant_id, status, briefing, created_at`. Não tem coluna de campanha.
  - `agent_steps` (00048): `execution_id, step_type, output`. O id local da campanha está em `output.campaignId` dos steps `create_campaign` e `export` (`create-campaign-step.ts:414`, `export-step.ts:274-291`).
  - `campaigns`: `id, tenant_id, name, created_at, exported_at`.
  - `campaign_leads` (00016): `campaign_id, lead_id, added_at`. Sem `tenant_id`: a RLS cobre, e os `lead_id` já vêm filtrados por tenant.
  - `opportunities` (00055): `tenant_id, lead_id, campaign_id, source, intent, status, created_at`.
  - `campaign_events` (00039): `tenant_id, campaign_id, event_type ('email_replied'), lead_email`.
  - `leads`: `id, tenant_id, apollo_id, company_name`.
- `src/app/api/account-dossiers/lookup/route.ts` e `src/hooks/use-account-dossier.ts` (24.22) -- molde da rota de leitura (perfil, validação, client de sessão) e do hook React Query com zod, timeout, `staleTime` de 5 min e `retry: 1`.
- Testes: `__tests__/unit/lib/agent/lead-screening.test.ts:34` (`buildClient(byTable)`), `__tests__/helpers/queue-supabase.ts` (`createQueueSupabase`), `__tests__/unit/api/agent/reference-profile.test.ts` (molde de rota), testes existentes de `AgentExecutionPlan` e `AgentLeadReview`.

## Tasks & Acceptance

**Execution:**
- `src/types/execution-memory.ts` -- criar os tipos `PreviousExecutionMemory` (`executionId`, `createdAt`, `label`, `campaignName`, `replies`, `opportunities`, `meetings`), `LeadWorkResult` (`meeting_booked|opportunity|replied|engaged|opt_out|discarded|no_reply`), `LeadWorkEntry` (`campaignName`, `date`, `result`), `AccountWorkSummary` (`contacts`, `lastCampaignName`, `lastDate`, `result`) e `LeadWorkHistoryResponse` (`leads: Record<apolloId, LeadWorkEntry[]>`, `accounts: Record<companyName, AccountWorkSummary>`) -- contrato único para servidor, rota e UI.
- `src/lib/agent/execution-memory.ts` -- criar:
  - `isSimilarBriefing(current, previous)`, pura. Parecido = (pelo menos 1 cargo em comum, normalizado sem acento e em minúsculas, OU mesma tecnologia, OU pelo menos 1 domínio de `targetAccounts` em comum) E local compatível (os dois locais preenchidos e iguais depois de normalizar, ou pelo menos um vazio).
  - `briefingLabel(briefing)`: até 2 cargos com " / " e, se houver, " · local". Sem cargo, usar a tecnologia ou "lista de contas".
  - `findSimilarExecutions(supabase, tenantId, briefing, currentExecutionId)`:
    1. ler até 30 execuções do tenant (`.neq("id")`, `.neq("status","pending")`, mais recentes primeiro);
    2. filtrar as parecidas e ler o `campaignId` dos steps `create_campaign`/`export`;
    3. ficar com as 3 mais recentes que têm campanha;
    4. contar respostas (`campaign_events` `email_replied`, `lead_email` distinto), oportunidades e reuniões (`status = meeting_booked`) por campanha;
    5. ler o nome da campanha.
    Nunca lança: erro → `[]`.
  - `findLeadWorkHistory(supabase, tenantId, apolloIds, companyNames)`:
    1. leads por `apollo_id` → `campaign_leads` → `campaigns` + `opportunities` por (`lead_id`, `campaign_id`);
    2. resultado: oportunidade `meeting_booked` → reunião marcada; `intent = opt_out` → pediu para sair; `discarded` → descartada; `source = reply` → respondeu; `engagement` → engajou; sem oportunidade → sem resposta registrada;
    3. até 3 entradas por lead, mais recentes primeiro;
    4. conta: leads com `company_name` exato (`.in`), excluindo os `apollo_id` pedidos, resumidos (quantos contatos em campanha, última campanha e data, melhor resultado).
    Nunca lança: erro → mapas vazios. Tetos: 200 ids, 200 nomes e `limit` nas leituras.
- `src/app/api/agent/executions/[executionId]/plan/route.ts` -- com `memory=1`, chamar `findSimilarExecutions` em paralelo com a viabilidade e devolver `memory` (`[]` sem opt-in) -- a proposta cita execuções anteriores.
- `src/app/api/agent/lead-history/route.ts` -- criar um `POST` somente leitura. Body `{ apolloIds: string[], companyNames: string[] }`, validado com zod (tetos de 200 itens e 200 caracteres por item). 401 sem perfil, 400 com body inválido. Chama `findLeadWorkHistory` e devolve `{ data: LeadWorkHistoryResponse }`. POST porque a lista não cabe em query string.
- `src/hooks/use-lead-work-history.ts` -- criar o hook React Query: `enabled` com leads não vazios, `staleTime` de 5 min, `retry: 1`, resposta validada com zod e timeout de 10 s. Erro → `undefined`.
- `src/components/agent/AgentExecutionPlan.tsx` -- pedir `?viability=1&memory=1` e renderizar `data-testid="plan-memory"` quando houver itens. Uma linha por execução, com o texto do I/O Matrix, plural correto e data em dd/mm/aaaa.
- `src/components/agent/AgentLeadReview.tsx` -- usar o hook com os `apolloId` e `companyName` dos leads. Embaixo do nome, renderizar `data-testid="lead-work-history"` (até 2 entradas e "+N") e `data-testid="account-work-history"`. Sem mudar seleção, ordem nem payload.
- Testes:
  - `__tests__/unit/lib/agent/execution-memory.test.ts`: casos do I/O Matrix (similaridade, local diferente, contagens, mapeamento de resultado, conta excluindo o próprio lead, erro → vazio);
  - `__tests__/unit/api/agent/lead-history.test.ts`: 401, 400 e 200;
  - plano: `memory` só com o opt-in;
  - `AgentExecutionPlan` e `AgentLeadReview`: renderização da nota e das linhas, e falha da rota sem quebrar.

**Acceptance Criteria:**
- Given um novo briefing com execução anterior parecida que gerou campanha, when o plano de execução abre, then a nota cita o briefing anterior, a data, a campanha e as respostas e oportunidades, e o custo e os steps continuam os mesmos.
- Given a revisão de leads com um lead ou uma conta já trabalhados antes, when a revisão carrega, then a linha mostra o histórico resumido (campanha, data, resultado) junto do "Já contatado", e a pré-seleção, a ordem e o Aprovar não mudam.
- Given `GET .../plan` sem `memory=1`, when chamado (ajuste da conversa), then nenhuma leitura de memória acontece.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when rodados, then os três passam.

## Spec Change Log

## Review Triage Log

### 2026-11-09 — Review pass
- verdicts: 33 findings — high 0, medium 1, low 21, false 10, maybe-false 1
- findings:
  - `[low]` `[reject]` (blind) A conta exclui todos os `apolloIds` da revisão, então Alice não vê "Conta já trabalhada" por causa do Bob listado na mesma revisão — o histórico do Bob aparece na linha dele, na mesma tabela; corrigir exige mudar o contrato por lead.
  - `[low]` `[patch]` (blind) Chaves aparadas no hook vs. busca com o valor cru na linha — a linha passou a buscar com `?.trim()`.
  - `[medium]` `[patch]` (blind) Campanha nunca exportada (rascunho do agente rejeitado antes do export) aparecia como "sem resposta registrada" e "ainda sem respostas" — as duas leituras de `campaigns` filtram `external_campaign_id` não nulo (marcador do `markCampaignExported`), com 1 teste por função.
  - `[low]` `[reject]` (blind) "+N" nunca passa de +1 porque o servidor corta em 3 — lead em 4+ campanhas é raro e a correção exige campo novo no DTO.
  - `[false]` `[reject]` (blind) `contacts` conta linhas duplicadas do mesmo `apollo_id` — índice único `(tenant_id, apollo_id)` (00010:39-42) impede duplicata.
  - `[false]` `[reject]` (blind) Step `create_campaign` e `export` podem ter `campaignId` diferentes — o export lê o `campaignId` do output anterior (`export-step.ts:113`) e o repassa (`:290`): é o mesmo id local.
  - `[low]` `[reject]` (blind) Corte em 3 antes de descartar campanha apagada mostra menos de 3 — exige campanha do agente apagada; o efeito é só uma linha a menos.
  - `[low]` `[reject]` (blind) `ROW_LIMIT` 2000 corta sem ordem — volume irreal para 3 campanhas / 100 ids por lote neste cliente.
  - `[low]` `[reject]` (blind) Tetos copiados como números mágicos — hoje os valores batem; não há divergência atual.
  - `[low]` `[patch]` (blind) Teto de 200 abaixo da revisão de até 500 leads — tetos de itens subiram para 500 na lib, na rota e no hook (200 caracteres por item mantidos).
  - `[low]` `[patch]` (blind) `opt_out` abaixo de `engaged` no melhor resultado da conta — `opt_out` agora fica logo depois de `replied`, com teste.
  - `[false]` `[reject]` (blind) Texto "0 respostas e 1 oportunidade" e data vazia — oportunidade por engajamento sem resposta é dado verdadeiro; `created_at`/`added_at` vêm do banco sempre válidos ("contato(s)" é cosmético).
  - `[low]` `[reject]` (blind) Lacunas de teste (erro em `campaigns`, recência, 500 da rota, `Promise.all`) — `findSimilarExecutions` nunca lança (try/catch total); o resto é cobertura marginal.
  - `[low]` `[reject]` (blind) Spec fora do patch, Completion Notes e índices — a spec é commitada junto; Regra nº 1 registrada no Auto Run Result; leituras filtradas por `tenant_id` (indexado).
  - `[low]` `[patch]` (blind) Regex com caracteres combinantes invisíveis — virou `/[\u0300-\u036f]/g`.
  - `[low]` `[patch]` (edge) Busca com chave não aparada — mesmo patch do trim.
  - `[low]` `[reject]` (edge) Lead sem `apolloId` cuja linha casa por `company_name` vira "outro contato" da conta — raro (busca do agente sempre traz `apolloId`) e a frase continua verdadeira (a conta foi trabalhada).
  - `[false]` `[reject]` (edge) Contagem inflada por `apollo_id` duplicado — índice único impede.
  - `[low]` `[reject]` (edge) `campaign_leads` acima de `ROW_LIMIT` sem ordem — volume irreal.
  - `[low]` `[reject]` (edge) Leads por `company_name` acima de `ROW_LIMIT` — volume irreal.
  - `[low]` `[reject]` (edge) Respostas/oportunidades acima de 2000 em 3 campanhas — volume irreal.
  - `[low]` `[reject]` (edge) Corte antes do filtro de nome — mesmo motivo da linha equivalente do blind.
  - `[false]` `[reject]` (edge) `campaignId` não determinístico entre steps — mesmo id local (ver acima).
  - `[low]` `[reject]` (edge) "+N" no máximo +1 — mesmo motivo da linha equivalente do blind.
  - `[low]` `[patch]` (edge) Corte alfabético acima de 200 — mesmo patch dos tetos de 500.
  - `[false]` `[reject]` (edge) Data inválida gera "(, campanha X)" — datas vêm de colunas `timestamptz` do banco.
  - `[low]` `[patch]` (verification-gap) Prazo de 10 s e abort do hook sem teste — teste com timers falsos e fetch pendurado: abort das duas tentativas, sem linhas de histórico, revisão usável.
  - `[low]` `[patch]` (verification-gap, other) Chave aparada vs. crua — mesmo patch do trim.
  - `[false]` `[reject]` (intent) A citação fica no card do plano e não no texto da conversa — o card do plano é renderizado no chat do agente como parte da proposta, antes do "Iniciar"; o AC é atendido nessa superfície.
  - `[false]` `[reject]` (intent) "Não repita leads" sem efeito de comportamento — o Then dos ACs é exibição; a exclusão da pré-seleção já é do "Já contatado" (24.15).
  - `[false]` `[reject]` (intent) Campanhas manuais fora da memória do plano — o AC fala de "execuções anteriores"; na revisão, campanhas manuais aparecem via `campaign_leads`.
  - `[false]` `[reject]` (intent) Linhas novas separadas do badge — ficam na mesma célula, logo depois do "Já contatado".
  - `[maybe-false]` `[defer]` (intent) Nenhum teste contra o schema e a RLS reais (só mocks) — settle: smoke real em produção abrindo um plano com briefing parecido e uma revisão com lead já trabalhado.

## Design Notes

- **Por que no plano e não no resumo do briefing:** o resumo (`generateBriefingSummary`) é uma função pura no cliente. O plano já roda no servidor com o briefing confirmado e o tenant, e já tem um bloco informativo (viabilidade) que não bloqueia. É a "proposta" que antecede o Iniciar.
- **Por que uma rota lazy e não uma anotação no `search_leads`:** anotar no step mudaria o output do pipeline e o `fetch-leads` (caminho da busca, Regra nº 1, ponto 2). A rota de leitura não toca o pipeline e falha em silêncio.
- **Sem migration:** a ligação execução → campanha vive em `agent_steps.output.campaignId`. Uma coluna `campaigns.execution_id` seria mais limpa, mas exigiria migration e escrita no caminho do Instantly.
- **Respostas:** `campaign_events` `email_replied` (o webhook e o `reply-sweep` do Epic 21) dá o número de respostas. `opportunities` dá oportunidades e reuniões.

## Verification

**Commands:**
- `npm run lint` -- sem erros
- `npm run typecheck` -- sem erros
- `npm run test:run` -- todos verdes, inclusive os testes novos e os existentes de `AgentLeadReview`, `AgentExecutionPlan` e do plano

## Auto Run Result

Status: done

**Resumo:** memória entre execuções, só de leitura e sem migration.
- O plano de execução (`GET .../plan?memory=1`, em paralelo com a viabilidade) cita até 3 execuções anteriores parecidas que geraram campanha exportada. Mostra respostas (`campaign_events` `email_replied`), oportunidades e reuniões do loop do Epic 21, numa nota informativa no `AgentExecutionPlan`.
- A revisão de leads busca, por uma rota nova de leitura, o histórico de cada lead (campanha, data e resultado) e da conta (`company_name` exato), e mostra isso embaixo do nome, junto do "Já contatado". Seleção, ordem e payload do Aprovar não mudam.

**Arquivos:**
- `src/types/execution-memory.ts` — tipos, rótulos dos resultados e `formatMemoryDate`.
- `src/lib/agent/execution-memory.ts` — `isSimilarBriefing`, `briefingLabel`, `findSimilarExecutions` e `findLeadWorkHistory` (fail-open, client de sessão, `tenant_id` explícito, só campanhas exportadas).
- `src/app/api/agent/executions/[executionId]/plan/route.ts` — opt-in `memory=1` e campo `memory`.
- `src/app/api/agent/lead-history/route.ts` — POST só de leitura, validado com zod (até 500 itens).
- `src/hooks/use-lead-work-history.ts` — React Query com zod, prazo de 10 s e falha silenciosa.
- `src/components/agent/AgentExecutionPlan.tsx` — nota `plan-memory`.
- `src/components/agent/AgentLeadReview.tsx` — linhas `lead-work-history` e `account-work-history`.
- Testes: `execution-memory.test.ts` e `lead-history.test.ts` (novos), mais a rota do plano, `AgentExecutionPlan` e `AgentLeadReview` (ampliados).

**Revisão:**
- 33 achados: 0 high, 1 medium, 21 low, 10 false e 1 maybe-false.
- Patches aplicados, todos no mesmo pass: 1 medium (campanhas não exportadas) e 5 low (busca com chave aparada, tetos de 500, ordem do `opt_out`, regex com escapes, teste do prazo de 10 s).
- 1 adiado: falta smoke real contra o schema e a RLS.
- Rejeitados com motivo registrado no Review Triage Log.

**Revisão de follow-up recomendada:** false (patched: 0 high, 1 medium, 5 low).

**Verificação:** depois dos patches, `npm run lint` passou com 0 erros (135 warnings já existentes), `npm run typecheck` passou limpo e `npm run test:run` passou com 490 arquivos (9636 testes, 2 pulados).

**Smoke de leitura em produção** (`/verify`, 2026-11-09). Feito no dev local na porta 3048, apontando para o banco de produção, logado como admin. Nada foi criado e nenhuma execução foi iniciada.
- `GET /api/agent/executions/<id>/plan?memory=1` em 4 execuções reais: HTTP 200. As de "CISO · São Paulo" citam a execução `4441313f…` ("Campanha Outbound - 05/11/2026", 0 respostas/oportunidades). A própria `4441313f…` devolve `memory: []`. `viability` ficou `null` (sem opt-in, sem chamada paga).
- `POST /api/agent/lead-history` com 25 leads reais: HTTP 200 em ~1,5 s (servidor de dev). Voltaram 22 leads com histórico e 4 contas (ex.: Simpar, 1 contato, `no_reply`). Body inválido devolve 400.
- Isso confirma o schema e a RLS reais do item em `deferred`. A tela com a nota e as linhas não foi aberta; a renderização está coberta pelos testes de componente.

**Regra nº 1** (checada por análise do diff e pelo smoke de leitura acima):
- Tocados: as 2 telas do agente (plano e revisão de leads), a rota `plan` (só com opt-in) e uma rota nova de leitura.
- Não tocados: steps, orchestrator, `fetch-leads`, approve, export, ativação, Instantly, migrations, `pg_cron`, Edge Functions, env e secrets. Nenhuma chamada paga e nenhuma escrita.
- (1) As campanhas em andamento, o webhook e o `reply-sweep` não foram afetados (só lemos `campaign_events` e `opportunities`).
- (2) A busca de leads não foi afetada.
- (3) Criação, export e ativação não foram afetados.

**Riscos residuais:**
- A nota e as linhas não foram vistas na tela real, só as rotas com dados reais. As leituras novas rodam ao abrir o plano e ao carregar a revisão.
- O nome da campanha aparece como está gravado, com espaços sobrando (ex.: "Ai Prospescts - Netskope (Adilton) ").
- Execuções anteriores à 22.16 (sem `campaignId` no output) não entram na memória.
- Um lead em 4 ou mais campanhas mostra "+1".
- A linha da conta ignora os outros leads da mesma revisão (o histórico deles aparece na própria linha).

