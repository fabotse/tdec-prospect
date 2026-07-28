---
title: 'Story 22.16: Campanha do Agente visivel em /campaigns — persistir na tabela `campaigns`'
type: 'feature'
created: '2026-07-27'
status: 'done'
baseline_revision: 'c6244f43deeee7919535620726b58f9a0765b549'
final_revision: 'a0b393e'
review_loop_iteration: 0
followup_review_recommended: true # patch: high 0, medium 2, low 4 -> score 3*2 + 1*4 = 10 (>= 5)
context: []
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** A campanha que o Agente TDEC cria existe apenas no estado da execucao (`agent_steps.output`) e no Instantly — nenhum step grava em `campaigns` (grep confirmado: o unico insert de `create-campaign-step` e `export-step` e em `agent_messages`). Consequencia comprovada em teste E2E: a campanha "Teste Atibaia" nao aparece em /campaigns, e como TODO o analytics (Epic 10/14), o `reply-sweep`/webhook e o loop de resposta (Epic 21) partem de `campaigns` (por `id` ou por `external_campaign_id`), a campanha do agente e invisivel para o produto inteiro.

**Approach:** Gravar a campanha na tabela `campaigns` do tenant nos tres momentos em que o pipeline ja sabe o que aconteceu: `create_campaign` insere a linha (rascunho) e associa os leads que a 22.15 persistiu; `export` grava os campos de export pelo mesmo caminho do builder; `activate` marca `status: "active"`. Zero migration — todas as colunas ja existem.

## Boundaries & Constraints

**Always:**
- Client de SESSAO (`this.supabase`, RLS por tenant) com `tenant_id` explicito no INSERT. Service-role e so para chaves de servico (22.9).
- Fail-open TOTAL nos tres pontos: nenhuma falha de escrita local pode derrubar um step, cancelar o export ou impedir a ativacao no Instantly. Falha => `console.error` + bolha de aviso em `agent_messages`.
- Idempotencia: re-executar `create_campaign` (ajuste pos-rejeicao, 22.13) NAO pode criar uma segunda campanha. A linha existente e reencontrada lendo o `output` ja gravado do PROPRIO step em `agent_steps` (mesmo padrao do `readOwnRow` da 22.18).
- Associacao de leads pelo mesmo mecanismo do builder: `campaign_leads.upsert(..., { onConflict: "campaign_id,lead_id", ignoreDuplicates: true })` — casa com `unique_lead_per_campaign` e e idempotente por construcao.
- `status` so assume valores do ENUM `campaign_status` (`draft | active | paused | completed`). Nada de status novo para "criada por agente".
- `name` truncado em 200 CODE POINTS antes do insert (`campaigns.name` e `VARCHAR(200)`; `campaignName` = `Campanha - ${campaignDescription}` com `campaignDescription` ja aceitando 200 => estoura).
- Campos de export gravados pelo caminho canonico do builder: `updateExportStatus` de `src/lib/services/campaign-export-repository.ts`.
- A campanha e gravada mesmo com zero leads persistidos (`leadCount: 0` e estado valido).

**Block If:**
- Nenhuma condicao bloqueante conhecida. Migration nao e necessaria: `campaigns` (00016), `product_id` (00025) e os quatro campos de export (00037) ja existem, e `campaign_leads` (00016) ja tem `unique_lead_per_campaign`. Confirmar contra as migrations reais antes de escrever codigo.

**Never:**
- Nao criar migration nem coluna nova (nada de `source`, `created_by_agent` ou similar).
- Nao gravar `email_blocks` / `delay_blocks`. A sequencia vive no Instantly; grava-la localmente faria o builder parecer editavel e a edicao local nunca chegaria ao Instantly. Edicao da sequencia da campanha do agente esta FORA de escopo.
- Nao alterar o builder manual, `POST /api/campaigns`, `PUT /api/campaigns/[id]/export-status`, `useInstantlyExport` nem qualquer fluxo de export do builder.
- Nao alterar `patchCampaignSchema` para aceitar `status`.
- Nao mexer no `readOwnRow` privado do `ActivateStep` (guarda de idempotencia da 22.18) — se precisar do mesmo mecanismo, escreva o seu.
- Nao tocar `sendSummaryMessage` do orchestrator nem o texto do resumo de defer.
- Nao escrever no Postgres real durante a verificacao automatizada (o banco tem 875 leads reais do cliente).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `create_campaign` conclui (1a vez) | `campaignName`, leadIds da 22.15 | INSERT em `campaigns` (`tenant_id`, `name`, `status: "draft"`); upsert em `campaign_leads`; `campaignId` no output do step | Falha => bolha de aviso + log; step conclui com sucesso |
| `create_campaign` re-executado (22.13) | `agent_steps.output` do proprio step ja tem `campaignId` | UPDATE do `name` na linha existente; ZERO linha nova; upsert nao duplica associacao | Leitura do proprio row falha => segue como 1a vez (uma campanha extra em rascunho e preferivel a nenhuma); logado |
| 22.15 nao persistiu lead nenhum | `leadIds` vazio | Campanha gravada assim mesmo, sem associacao; card mostra "0 leads" | Nenhum erro esperado |
| Nome > 200 code points | `campaignDescription` longa | `name` truncado por code point; INSERT aceito | Sem truncagem o Postgres rejeitaria a linha inteira |
| Nome duplicado | Duas campanhas com o mesmo nome no tenant | Ambas gravadas (nao ha unique de `name`) | Nenhum erro esperado |
| `export` conclui | `campaignId` no `previousStepOutput` + `externalCampaignId` | UPDATE de `external_campaign_id`, `export_platform: "instantly"`, `exported_at`, `export_status: "success"` | Falha => bolha + log; export segue como sucesso |
| `export` sem `campaignId` | Persistencia do create falhou | Nenhum UPDATE, nenhuma bolha, nenhum erro | Caminho normal, nao e falha |
| `activate` conclui | `campaignId` propagado pelo export | UPDATE `status: "active"` | Falha => bolha + log; ativacao segue como sucesso |
| Ativacao adiada (defer) | `activationDeferred: true` | `status` permanece `draft`; campos de export ja gravados no export step | Nenhuma escrita nova no defer |
| Detalhe aberto no builder | Campanha com `external_campaign_id` e ZERO blocos locais | Aviso "criada pelo Agente TDEC — a sequencia vive no Instantly"; canvas vazio, pagina nao quebra | Nenhum erro esperado |
| Rascunho manual vazio | Campanha sem blocos e SEM `external_campaign_id` | Aviso NAO aparece (comportamento de hoje intocado) | Nenhum erro esperado |

</intent-contract>

## Code Map

- `src/lib/agent/steps/create-campaign-step.ts` -- ponto de insercao; `campaignName` montado em L223-227, `persistLeadsToMyLeads` (22.15) chamado em L266 logo antes do return; `this.supabase` = client de sessao, `this.tenantId` vem de `execution.tenant_id`
- `src/lib/agent/steps/export-step.ts` -- `externalCampaignId = createResult.campaignId` (L156); monta `ExportStepOutput` em L188-202; le tudo do `previousStepOutput` por cast direto
- `src/lib/agent/steps/activate-step.ts` -- monta `ActivateStepOutput` em L261-266; `readOwnRow` privado (L290-320) e o padrao de idempotencia a espelhar (NAO reutilizar/alterar)
- `src/lib/agent/lead-persistence.ts` -- `persistedIds` (L757) ja e o conjunto exato de `leads.id` gravados/reusados, mas e DESCARTADO no return (L880); `PersistApprovedLeadsResult` em L74-91
- `src/lib/services/campaign-export-repository.ts` -- `updateExportStatus` (L42-70): unica definicao de "campanha exportada" no produto; recebe um `SupabaseClient` ESTRUTURAL, por isso os callers passam `as any` (precedente em `src/app/api/campaigns/[campaignId]/export-status/route.ts:90`); atualiza so por `id`, sem filtro de tenant (depende da RLS, igual ao builder)
- `src/app/api/campaigns/[campaignId]/leads/route.ts` -- L178-189: shape exato do upsert em `campaign_leads` a espelhar
- `src/app/api/campaigns/route.ts` -- L119-127: shape canonico do insert (`tenant_id`, `name`, `status: "draft"`); L37-44: o leitor da lista (`*, lead_count:campaign_leads(count), products(name)`)
- `src/types/agent.ts` -- `CreateCampaignOutput` (L281), `ExportStepOutput` (L311), `ActivateStepOutput` (L325)
- `src/types/campaign.ts` -- `CampaignStatus` (L11-18), `campaignStatusLabels` (L23-28), `getCampaignStatusConfig` (L61-69) SEM fallback: status fora do enum vira badge com texto `undefined`
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` -- destino do clique no card (`/campaigns/{id}/edit`); `hasBlocks` (L158), render a partir de L539, ja espera `initialBlocks.length === 0` (L218-221)
- `supabase/migrations/00016_create_campaigns.sql` -- DDL de `campaigns` + `campaign_leads` + RLS; `00037_add_campaign_export_tracking.sql` -- campos de export + CHECKs
- `__tests__/helpers/fake-leads-db.ts` -- `FakeDb` (L116) roteia so `leads`/`segments`/`lead_segments` (L201-203) e NAO implementa `.upsert`; injecao de falha por (tabela, operacao) em L178
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` -- costura step -> helper REAL contra o `FakeDb` (L207, L1498); convencao de mock em `__tests__/helpers/mock-supabase.ts`

## Tasks & Acceptance

**Execution:**
- `src/lib/agent/lead-persistence.ts` -- adicionar `leadIds: string[]` a `PersistApprovedLeadsResult` e devolver `persistedIds` no return -- sem isso a 22.16 nao tem como associar os leads sem re-consultar o banco; o dado ja existe e e descartado.
- `src/lib/agent/campaign-persistence.ts` -- criar o modulo server-side com todas as escritas em `campaigns`/`campaign_leads`: `persistAgentCampaign({ supabase, tenantId, existingCampaignId, name, leadIds })` (resolve-ou-insere a linha, trunca o nome por code point, faz o upsert das associacoes, devolve `{ campaignId, associated, degraded }`), `markCampaignExported({ supabase, campaignId, externalCampaignId })` (delega a `updateExportStatus` com `exportPlatform: "instantly"`, `exportedAt: now`, `exportStatus: "success"` — o cast estrutural mora AQUI e em nenhum outro lugar) e `markCampaignActive({ supabase, tenantId, campaignId })` -- centraliza o contrato da linha e mantem os steps finos.
- `src/types/agent.ts` -- adicionar `campaignId?: string | null` a `CreateCampaignOutput`, `ExportStepOutput` e `ActivateStepOutput` -- o `campaignId` local so chega ao step seguinte via `agent_steps.output`, e o export precisa dele.
- `src/lib/agent/steps/create-campaign-step.ts` -- `persistLeadsToMyLeads` passa a devolver os `leadIds` (`[]` em qualquer falha); novo helper privado fail-open que le o proprio `agent_steps.output` para reusar um `campaignId` anterior, chama `persistAgentCampaign` e injeta `campaignId` no `CreateCampaignOutput`; falha => bolha de aviso -- e o unico ponto onde nome, tenant e leads aprovados coexistem.
- `src/lib/agent/steps/export-step.ts` -- ler `previousStepOutput.campaignId`, chamar `markCampaignExported` em try/catch apos o sucesso no Instantly, e propagar `campaignId` no `ExportStepOutput` -- sem propagar, o activate perde a referencia; sem o try/catch, uma falha de RLS derrubaria um export que ja gastou credito.
- `src/lib/agent/steps/activate-step.ts` -- ler `previousStepOutput.campaignId`, chamar `markCampaignActive` em try/catch apos a ativacao confirmada, e propagar `campaignId` no `ActivateStepOutput` -- so aqui "ativa" e verdade (mesmo raciocinio do carimbo de gate da 22.18).
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` -- aviso (`ui/alert`) entre o `BuilderHeader` e o canvas quando `campaign.externalCampaignId && !hasBlocks`: campanha criada pelo Agente TDEC, sequencia no Instantly, edicao local nao e enviada -- sem ele o usuario abre um builder vazio e conclui que a campanha esta quebrada; a condicao nao pega rascunho manual (que nunca tem `external_campaign_id`).
- `__tests__/helpers/fake-leads-db.ts` -- rotear `campaigns` e `campaign_leads` e implementar `.upsert(rows, { onConflict, ignoreDuplicates })` respeitando `unique_lead_per_campaign` (23505 quando `ignoreDuplicates` for falso) -- sem isso a costura step -> persistencia volta a ser mock puro, que foi exatamente o que a 22.15 provou nao valer.
- `__tests__/unit/lib/agent/campaign-persistence.test.ts` -- cobrir a I/O & Edge-Case Matrix do modulo contra o `FakeDb`: insert com `tenant_id`, truncagem por code point (com emoji), reuso via `existingCampaignId`, `leadIds` vazio, upsert idempotente em duas execucoes, nome duplicado, e falha injetada em `campaign_leads` DEPOIS do insert da campanha (deve degradar, nao lancar).
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` -- casos novos contra o `persistAgentCampaign` REAL: `campaignId` no output; segunda execucao do step reusa a linha e nao cria a segunda; falha da persistencia da campanha nao derruba o step e gera bolha; leads da 22.15 chegam associados; persistencia de leads falhando ainda grava a campanha com 0 leads.
- `__tests__/unit/lib/agent/steps/export-step.test.ts` + `activate-step.test.ts` -- campos de export gravados com o shape do builder; `status: "active"` so apos ativacao confirmada; ausencia de `campaignId` nao gera escrita nem bolha; falha da escrita local nao derruba o step; `campaignId` propagado no output.
- `__tests__/unit/lib/agent/campaign-readers.test.ts` -- pegar a linha que `persistAgentCampaign` gravou no `FakeDb` e passa-la pelos LEITORES reais: `transformCampaignRowWithCount` + `getCampaignStatusConfig` devolvem label definida (nunca `undefined`), `name` nao vazio, `created_at`/`updated_at` parseaveis, e apos `markCampaignExported` o `external_campaign_id` esta preenchido (a chave de que analytics, `reply-sweep` e webhook dependem) -- licao do Epic 21: os leitores sao o teste que importa.

**Acceptance Criteria:**
- Given uma execucao guiada concluida pelo agente, when o usuario abre /campaigns, then encontra a campanha do agente listada como as demais, com o nome gerado, o badge de status correto e a contagem dos leads aprovados.
- Given a campanha do agente listada, when o usuario clica no card, then o builder abre sem erro, com o aviso de que a campanha foi criada pelo Agente e a sequencia vive no Instantly.
- Given a campanha do agente exportada e ativada, when o usuario abre a pagina de analytics dela, then o analytics existente do Epic 10 carrega (metricas ou zeros) em vez do EmptyState "ainda nao foi exportada", sem nenhum codigo novo de analytics.
- Given o usuario rejeita a etapa de campanha e o agente re-executa `create_campaign` com o briefing ajustado, when a execucao termina, then /campaigns mostra UMA campanha, com o nome atualizado e sem leads duplicados.
- Given o builder manual, when o usuario cria, edita, associa leads e exporta uma campanha pelo fluxo de sempre, then o comportamento e identico ao de antes desta story.
- Given a suite completa (`npm run test:run`), when executada apos a mudanca, then zero regressao nos fluxos de campanha, builder, export e agente.

## Spec Change Log

## Review Triage Log

### 2026-07-28 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 4, low 6)
- defer: 2: (high 0, medium 0, low 2)
- reject: 11: (high 0, medium 4, low 7)
- addressed_findings:
  - `[medium]` `[patch]` O atalho de idempotencia da 22.18 no `ActivateStep` retornava sem chamar `markCampaignActive`. Como a escrita local e fail-open, o caminho "ativou no Instantly, escrita local falhou" mandava TODA retentativa para o atalho e a campanha ficava "Rascunho" para sempre enquanto rodava no Instantly — o mesmo argumento de auto-cura que ja fazia o carimbo do gate ser repetido duas linhas acima. Agora as duas saidas marcam.
  - `[medium]` `[patch]` Nem `markCampaignActive` nem `markCampaignExported` conferiam linhas afetadas, e o PostgREST devolve `{ error: null }` para um UPDATE que casou ZERO linhas (campanha apagada no meio da execucao, id fora do tenant). As duas resolviam com sucesso sem ter escrito nada e nenhuma bolha disparava — a campanha ficava sem `external_campaign_id`, invisivel para analytics/reply-sweep/webhook, em silencio. `.select("id")` numa, reconferencia via `getExportRecord` na outra (sem tocar o `updateExportStatus` do builder).
  - `[medium]` `[patch]` `leadIds` nunca era assertado para leads REUSADOS: a mutacao que descarta os reusados deixava 140 testes verdes. O caso comum em producao (leads que ja estao em Meus Leads) gravaria a campanha com "0 leads" — a invisibilidade que a story existe para remover. Tres casos de reuso passaram a assertar o campo, e a costura completa semeia um lead pre-existente; a mutacao agora quebra 4 testes.
  - `[medium]` `[patch]` O UPDATE da re-execucao tocava so `name`, deixando `external_campaign_id`, `export_*` e `status: active` da rodada anterior. A linha apontava para a campanha SUPERSEDIDA do Instantly e o analytics lia os dados errados. A Fase 1 passa a devolver os cinco campos ao estado de rascunho (no-op no caminho normal).
  - `[low]` `[patch]` Duas bolhas mandavam o usuario para `/campanhas`; a rota e `/campaigns`. Caminho removido da frase.
  - `[low]` `[patch]` Um unico `degraded` cobria "falhou o rename" e "falhou a associacao", mas a bolha so falava da contagem de leads: no caso do rename o usuario ouvia um problema inexistente e nunca sabia que a campanha carregava o nome que ele acabou de rejeitar. Sinais separados (`nameStale`/`associationDegraded`) e texto ramificado.
  - `[low]` `[patch]` `hasBlocks` vinha do store zustand (vazio no primeiro render passado o gate de loading) e uma falha do `useCampaignBlocks` tambem o deixava vazio: campanha manual exportada piscava — ou exibia em definitivo — "Campanha criada pelo Agente TDEC". A condicao so afirma "sem sequencia" quando o banco respondeu e respondeu vazio.
  - `[low]` `[patch]` A copy renderizada da componente nova estava sem acentos enquanto toda a tela em volta usa portugues acentuado (a convencao sem acento vale para comentario e bolha de chat, nao para texto de tela).
  - `[low]` `[patch]` `select()` era no-op no `FakeDb`: remover o `.select("id")` do UPDATE de idempotencia faria a producao criar uma SEGUNDA campanha com o teste "NAO cria uma segunda campanha" verde. O fake passa a devolver `data: null` em escrita sem `RETURNING`; a mutacao agora quebra 4 testes.
  - `[low]` `[patch]` `campaign-readers.test.ts` afirmava reproduzir `GET /api/campaigns` mas achatava `lead_count` na mao e fixava `product_name` — pulando os dois desembrulhos de embed que podem de fato produzir contagem errada. Fixture na forma do embed + o achatamento real da rota.

### 2026-07-28 — Review pass (follow-up)
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 3, low 4)
- defer: 3: (high 0, medium 2, low 1)
- reject: 20: (high 0, medium 5, low 15)
- addressed_findings:
  - `[medium]` `[patch]` O teste do aviso REPLICAVA a derivacao `builderHasSequence` em vez de importa-la: a pagina podia voltar a `hasBlocks` puro — ressuscitando o aviso falso permanente numa campanha manual cuja query de blocos falhou — com os 9 testes verdes. A regra virou funcao exportada de `AgentCampaignNotice.tsx`, a pagina passou a importa-la e o teste testa a MESMA funcao que roda em producao.
  - `[medium]` `[patch]` O `FakeDb` tratava `.single()` e `.maybeSingle()` como a mesma coisa (`primeira linha ou null`). No PostgREST `.single()` com ZERO linhas devolve o ERRO `PGRST116` — e era exatamente esta premissa errada que fazia o teste "campanha inexistente" pinar o ramo `!record`, que producao nunca alcanca (ela sai pelo ramo `readError`). O fake passou a distinguir os dois, e o teste, ao quebrar, foi corrigido para o caminho real. Mesma classe do bug que a 22.15 pagou caro.
  - `[medium]` `[patch]` O fake de `agent_steps` ignorava TODO `.eq()`: apagar `.eq("execution_id", ...)` do `readOwnCampaignId` deixava o step adotar o `campaignId` de OUTRA execucao — e a Fase 1 entao zerava `status`/`external_campaign_id`/`export_*` de uma campanha VIVA, tirando-a do analytics, do reply-sweep e do webhook. O fake passou a aplicar os filtros de verdade (0 ou N linhas => `PGRST116`) e dois testes novos cobrem execucao alheia e step alheio. Mutacao confirmada: sem o filtro, o teste novo quebra.
  - `[low]` `[patch]` O laco de chunks (`CHUNK_SIZE = 100`) nunca rodava mais de uma volta — nenhum teste passava de 3 leadIds — entao trocar `continue` por `break`, ou colapsar o laco num upsert unico, passava verde. Teste novo com 250 leads e falha injetada em UM lote: `associated === 150` e `associationDegraded === true`.
  - `[low]` `[patch]` O fake aceitava qualquer `onConflict`: um alvo errado (`"id"`, ou com espaco) derrubaria TODA associacao em producao com `42P10` e passaria no teste. O fake agora recusa alvo diferente de `campaign_id,lead_id`, com teste proprio.
  - `[low]` `[patch]` `db.fail("campaigns", "update", ..., 0)` era injecao morta (`takeFailure` so casa `remaining > 0`): o teste anunciava tres mecanismos e exercitava um. Removida, com o comentario dizendo o que o teste de fato prova.
  - `[low]` `[patch]` Dois testes do aviso tinham entradas byte-identicas (`builderHasSequence(false, undefined)`) sob nomes diferentes — eram um teste com dois nomes. O caso "blocos no banco, store ainda vazio" passou a usar `initialBlocks` NAO vazio, que e o frame real entre o render e o `useEffect`.

### 2026-07-28 — Review pass (terceiro)
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 2, low 4)
- defer: 1: (high 0, medium 1, low 0)
- reject: 24: (high 0, medium 6, low 18)
- addressed_findings:
  - `[medium]` `[patch]` O call site do aviso continuava sem teste: a pagina derivava `builderHasSequence(hasBlocks, initialBlocks)` e passava o booleano pronto, entao voltar a `hasBlocks={hasBlocks}` — exatamente o defeito que a rodada anterior corrigiu — deixava a suite INTEIRA verde, porque nenhum teste monta a pagina. O componente passou a receber as entradas BRUTAS (`storeHasBlocks` + `initialBlocks`) e a derivar internamente: a chamada errada deixou de ser representavel, e os testes do componente agora exercitam a mesma entrada que a pagina passa.
  - `[medium]` `[patch]` O `FakeDb` reproduzia unique, NOT NULL, enum e VARCHAR de `campaign_leads`/`campaigns`, mas nao as duas FOREIGN KEYs — entao aceitava associacao contra campanha ou lead INEXISTENTE. Era o que certificava como verde o ramo `nameStale` (update falhou, adotamos o `existingCampaignId` sem saber se a linha existe, e seguimos associando): no Postgres esse lote inteiro volta `23503`. O fake passou a aplicar as duas FKs, o que quebrou 8 testes que usavam ids de mentira; eles foram semeados, e um teste novo pina o cenario real (update falhou + campanha nao existe => `associationDegraded`, associacao zero).
  - `[low]` `[patch]` `markCampaignExported` nao tinha teste com vizinhas na mesa: com uma unica campanha semeada, um UPDATE que perdesse o filtro (o `updateExportStatus` filtra so por `id`, o escopo de tenant vem da RLS) carimbaria "a linha certa" por acidente. Teste novo com tres campanhas, uma delas de outro tenant.
  - `[low]` `[patch]` A asserçao do caso "campanha inexistente" aceitava tres caminhos alternados (`/PGRST116|multiple \(or no\) rows|nao foi gravado/`) que o proprio comentario do teste distingue — trocar o branch de `readError` pelo de valor divergente nunca ficaria vermelho. Agora pina so o branch de producao.
  - `[low]` `[patch]` `persistAgentCampaign` documenta "NUNCA lanca", mas o `leadIds.filter` roda FORA de qualquer try/catch e DEPOIS de a Fase 2 ja ter gravado a linha: um `leadIds` nao-array fazia a funcao lancar, o catch do step entendia "nada gravado", mandava a bolha errada e a re-execucao criaria uma SEGUNDA campanha. Guarda de `Array.isArray` no proprio modulo.
  - `[low]` `[patch]` O JSDoc de `persistLeadsToMyLeads` prometia `[]` "em QUALQUER falha", mas os ids sao atribuidos assim que `persistApprovedLeads` retorna e sobrevivem ao catch de proposito — o comportamento certo, descrito ao contrario. Comentario corrigido para nao induzir o proximo leitor a "consertar" o codigo.

## Design Notes

**Por que os tres pontos, e nao um so.** A linha em `campaigns` nasce incompleta de proposito: no `create_campaign` a campanha ainda nao existe no Instantly, entao `external_campaign_id` so pode ser gravado no `export`, e `status: "active"` so e verdade depois do `activate`. Escrever tudo no fim (no activate) perderia a campanha em toda execucao adiada ou interrompida — justamente os casos em que o usuario mais precisa reencontra-la. Cada step grava o que ele, e so ele, sabe.

**O contrato minimo da linha (varredura dos leitores).** Os leitores de `campaigns` exigem: `id` UUID valido (todas as rotas `[campaignId]` fazem 400 por regex antes de consultar), `tenant_id` do usuario (RLS: sem ele a linha simplesmente nao existe para a UI), `name` nao vazio (renderizado cru no card, no filtro da Central de Oportunidades e no titulo da notificacao), `status` dentro do ENUM (`getCampaignStatusConfig` faz lookup sem fallback) e `created_at`/`updated_at` parseaveis (ordenacao da lista e `toLocaleDateString`). Tudo o mais e comprovadamente null-safe: `product_id` null (embed `products(name)` volta null e todo caller usa `?.`), zero `campaign_leads` (o embed `count` vira 0), zero blocos (`/blocks` devolve `[]`, `/steps` devolve `{data:[]}`) e os quatro campos de export null (`transformCampaignRow` normaliza com `?? null` e a pagina de analytics mostra EmptyState).

**`external_campaign_id` e a chave que liga o agente ao resto do produto.** Nao e cosmetico: `engagement-processor` filtra `.not("external_campaign_id","is",null)`, e `reply-sweep` e o webhook do Instantly encontram a campanha SO por esse campo (sem match, a resposta do lead vira `skipped` silencioso). Enquanto ele for null, a campanha do agente continua fora do Epic 10, do 14 e do 21 mesmo estando na lista. Por isso o UPDATE do export e a parte da story que mais importa, e por isso ele tem teste proprio.

**Idempotencia sem coluna nova.** O `agent_steps.output` do proprio step e a unica memoria durravel disponivel sem migration, e o `ActivateStep` ja usa exatamente esse mecanismo (22.18). Le-se `output.campaignId` antes de escrever: se existe, e UPDATE do nome; se nao, INSERT. `updateStepStatus` so troca `status`, entao o output da execucao anterior sobrevive ate o `saveCheckpoint`/`saveAwaitingApproval` seguinte.

**Duas persistencias independentes no mesmo step.** A da 22.15 (leads) e a desta story (campanha) sao blocos fail-open SEPARADOS, nessa ordem: a campanha precisa dos `leadIds` que so a primeira produz, mas a reciproca nao vale — leads falhando ainda deixa a campanha gravada com 0 leads, que a AC aceita explicitamente como estado intermediario valido. Uma unica falha nunca pode custar as duas escritas.

**Bolhas.** Toda bolha de aviso segue a regra que a 22.15 pagou caro para aprender: a escrita da bolha NUNCA lanca e checa o `{ error }` que o supabase-js RETORNA em vez de lancar, e nenhuma bolha afirma uma escrita que nao aconteceu. Sucesso e silencioso — a campanha aparecer em /campaigns e a propria confirmacao.

**Nome duplicado nao e problema.** Nenhuma migration cria unique em `campaigns.name` (as unicas uniques do dominio sao `campaign_leads(campaign_id, lead_id)`, `opportunity_configs(campaign_id)` e afins). Duas campanhas homonimas coexistem, como ja acontece com os "Nova Campanha <data>" do builder.

**Status: hoje nada escreve `campaigns.status`.** O `patchCampaignSchema` da rota nao aceita `status` e nenhum caminho do app o atualiza — toda campanha do produto e "Rascunho" para sempre, e `active`/`paused`/`completed` sao inalcancaveis. Escrever `active` na ativacao e o primeiro uso real do enum; e coerente com os labels existentes e nao inventa vocabulario. Risco residual aceito: nao ha caminho de volta pela UI, entao a campanha do agente fica "Ativa" mesmo depois de terminar no Instantly.

## Verification

**Commands:**
- `npm run test:run` -- expected: suite verde, incluindo os testes novos de `campaign-persistence`, da costura nos tres steps e dos leitores
- `npx tsc --noEmit` -- expected: nenhum erro NOVO nos arquivos tocados (o repositorio ja tem ~183 erros pre-existentes em arquivos de teste nao relacionados; comparar o total antes e depois)
- `npm run lint` -- expected: nenhum erro/warning novo em arquivo tocado (o repositorio ja tem 19 erros / 130 warnings pre-existentes)

**Regra dos testes (nao negociavel):** o `FakeDb` do repositorio e fixture E oraculo ao mesmo tempo — ele codifica as premissas do autor sobre o PostgREST, e na 22.15 codificou uma errada que 7457 testes verdes certificaram. Portanto: a costura step -> persistencia roda contra a implementacao REAL (nunca com `persistAgentCampaign` mockado), o upsert do fake tem que reproduzir `unique_lead_per_campaign` de verdade (segunda execucao com os mesmos pares nao pode inserir nada), e pelo menos uma falha injetada tem que ocorrer DEPOIS do insert da campanha, para provar que ela sobrevive a uma associacao que falha.

**Manual checks (if no CLI):**
- Rodar uma campanha pequena pelo agente (modo guiado, 2 leads) e conferir: /campaigns lista a campanha com 2 leads; o clique abre o builder com o aviso do Agente e sem erro; a pagina de analytics carrega em vez do EmptyState "ainda nao foi exportada"; o badge mostra "Ativa" apos a ativacao (ou "Rascunho" se a ativacao foi adiada).
- Rodar o mesmo fluxo com rejeicao + ajuste da etapa de campanha e confirmar que continua UMA campanha na lista, com o nome novo.
- Verificacao contra o Postgres real (NAO executada em nenhuma das duas runs): existe um harness local gitignored (`.verify-2215/`, `vitest.verify.config.mts`, `playwright.verify.config.ts`) que roda os helpers de producao com client de sessao sob RLS, sem tocar Apollo/Instantly. Clonar o padrao para `campaign-persistence` e o unico jeito de nao repetir o bug que o fake escondeu na 22.15. ATENCAO: o tenant de teste tem 875 leads reais do cliente — esta verificacao exige OK explicito do Fabossi antes de qualquer escrita e nao pode rodar sozinha nesta execucao nao assistida.
</content>
</invoke>




## Auto Run Result

Status: done

**Mudanca implementada (recap).** A campanha do Agente TDEC passa a existir na tabela `campaigns` do tenant: `create_campaign` insere a linha em rascunho e associa os leads que a 22.15 persistiu, `export` carimba os quatro campos de export pelo caminho canonico do builder, `activate` marca `status: "active"`. Zero migration. Esta terceira passada de review nao mudou o comportamento do produto — os 6 patches sao de fidelidade do oraculo de teste e de robustez do call site do aviso.

**Arquivos alterados nesta passada:**
- `src/components/builder/AgentCampaignNotice.tsx` -- passa a receber `storeHasBlocks` + `initialBlocks` e derivar `builderHasSequence` internamente; o call site nao tem mais nenhuma decisao para errar.
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` -- passa as duas entradas brutas; derivacao e import de `builderHasSequence` removidos.
- `src/lib/agent/campaign-persistence.ts` -- guarda `Array.isArray` antes do `.filter` dos `leadIds` (o contrato "NUNCA lanca" agora se sustenta sozinho).
- `src/lib/agent/steps/create-campaign-step.ts` -- JSDoc de `persistLeadsToMyLeads` corrigido para descrever o comportamento real.
- `__tests__/helpers/fake-leads-db.ts` -- `campaign_leads` passa a aplicar as duas FOREIGN KEYs (`23503`).
- `__tests__/unit/components/builder/AgentCampaignNotice.test.tsx` -- reescrito para a API nova; `builderHasSequence` tambem coberta isolada.
- `__tests__/unit/lib/agent/campaign-persistence.test.ts` -- leads semeados; teste novo de `nameStale` + campanha inexistente; teste novo de carimbo com vizinhas na mesa; asserçao do `PGRST116` desalternada.
- `__tests__/unit/lib/agent/campaign-readers.test.ts`, `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` -- leads semeados para satisfazer a FK nos casos com o helper mockado.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 1 entrada nova (erro da query de blocos nunca exibido no builder).

**Review findings (3a passada):** 6 patches aplicados (0 high, 2 medium, 4 low), 1 defer, 24 rejects. Rejeitados com autoridade do intent, entre outros: marcar a origem da campanha por coluna nova (`Never: nao criar migration nem coluna nova`), gravar `product_id` (o insert canonico do builder tambem nao grava), escopar `markCampaignExported` por tenant (o intent manda usar o `updateExportStatus` do builder, que depende da RLS), e o reset dos campos de export na re-execucao (decisao deliberada da passada anterior, com as duas alternativas lossy — a campanha orfa do Instantly esta no ledger de deferred work).

**Follow-up review recommendation:** `true` — patched: high 0, medium 2, low 4; score = 3x2 + 1x4 = 10 (>= 5).

**Verificacao executada:**
- `npm run test:run` -- 406 arquivos, 7532 testes passando, 2 skipped, zero falha.
- `npx tsc --noEmit` -- 183 erros, exatamente o total pre-existente; nenhum em arquivo tocado.
- `npm run lint` -- 19 erros / 131 warnings, identico ao baseline medido com as mudancas em stash; nenhum problema em arquivo tocado.

**Riscos residuais:**
- A verificacao contra o Postgres real continua NAO executada (o tenant de teste tem 875 leads reais do cliente e a execucao e nao assistida). O `FakeDb` ganhou mais uma premissa real nesta passada (as duas FKs de `campaign_leads`), mas segue sendo fixture e oraculo ao mesmo tempo.
- A pagina do builder continua sem teste que a monte: a API nova do `AgentCampaignNotice` torna a derivacao errada irrepresentavel, mas apagar o elemento do JSX ainda deixa a suite verde.
- Sem caminho de volta pela UI: uma campanha marcada `active` permanece "Ativa" mesmo depois de terminar no Instantly (risco ja aceito na spec).

**Artefatos residuais (nao commitados de proposito):** `_bmad-output/implementation-artifacts/sprint-status.yaml` segue modificado no working tree (marcacao `22-16 ... done`, alterada antes desta execucao). E bookkeeping do orquestrador, nao faz parte do diff revisado — deixado em paz.
