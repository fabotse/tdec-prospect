---
title: 'Story 22.15: Leads do Agente em "Meus Leads" — persistencia + segmento automatico/nomeavel'
type: 'feature'
created: '2026-07-27'
status: 'done'
baseline_revision: '31afa665fd4f1c1b6c4c8262debc73e28165bf5b'
final_revision: 'fec2b94d3fe829b787ffd153a5cb3a1635523ea5'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Os leads aprovados numa campanha do Agente TDec nao existem em lugar nenhum do produto — vivem apenas em `agent_steps.output` e no Instantly (grep confirmado: zero escrita em `leads` sob `src/lib/agent/**`). O usuario nao consegue gerenciar, monitorar nem reaproveitar o que aprovou, e o pedido "coloca num segmento chamado X" na conversa e engolido como `campaignDescription`.

**Approach:** Persistir os leads aprovados na tabela `leads` do tenant e associa-los a um segmento (nome da campanha por padrao, ou o nome pedido na conversa), reusando as duas regras de dedupe que ja existem no produto. A escrita acontece no `CreateCampaignStep`, unico ponto onde os leads ja estao aprovados, revelados (pos-enrichment) e com icebreaker.

## Boundaries & Constraints

**Always:**
- Persistir SOMENTE os leads que chegam ao `CreateCampaignStep` (o orchestrator ja substitui `leads` por `approvedLeads` do gate — leads nao selecionados nunca chegam la).
- Escrever apenas dados REVELADOS: a persistencia roda depois do bloco de enrichment do `CreateCampaignStep`, nunca antes. Nome com `*` ou email nulo entram como estao apos o enrichment, jamais um valor mascarado fabricado.
- `tenant_id` explicito em toda escrita, vindo de `this.tenantId` (client de SESSAO, sob RLS — ver Design Notes).
- Dedupe por regras JA existentes: `apollo_id` por tenant (rota `segments/[segmentId]/leads`) e email case-insensitive (rota `leads/import-csv`).
- Fail-open total: qualquer falha da persistencia loga, escreve uma bolha de aviso em `agent_messages` e deixa o step retornar sucesso. A campanha nunca cai por causa disto.
- Idempotencia: re-executar o step (ajuste pos-rejeicao, 22.13) nao pode duplicar lead nem associacao.
- Nome de segmento truncado em 100 chars (`segments.name` e `VARCHAR(100)`; `campaignDescription` aceita 200).

**Block If:**
- Nenhuma condicao bloqueante conhecida. Migration nao e necessaria: `leads.icebreaker` e `leads.icebreaker_generated_at` ja existem (00034) e a origem do lead e legivel via segmento + coluna "Importado em", ambas ja renderizadas em Meus Leads.

**Never:**
- Nao criar migration nem coluna nova (`source` nao existe e nao sera adicionada).
- Nao usar service-role para escrever `leads`/`segments` — o pipeline roda com o client de sessao sob RLS (service-role e so para `api_configs`, 22.9).
- Nao mexer no `ExportStep`, no `ActivateStep` nem em `campaign_leads` (persistir a campanha e a 22.16).
- Nao alterar a rota `POST /api/segments/[segmentId]/leads` nem qualquer fluxo de segmentos existente.
- `segmentName` nao e filtro de busca: nao pode alterar `skipSteps`, `nextAction` nem parametros de Apollo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lead novo com apolloId | lead com `apolloId` inedito no tenant | INSERT em `leads` + associacao no segmento | Nenhum erro esperado |
| Lead ja existente por apolloId | `apollo_id` ja na base | Nenhum INSERT; icebreaker atualizado; associacao criada se faltar | Nenhum erro esperado |
| Lead importado (apolloId null) | lead com email, sem apolloId | Dedupe por email case-insensitive; INSERT so se inedito | Nenhum erro esperado |
| Lead sem apolloId e sem email | lead degenerado | Nao persistido; contabilizado como `skipped` | Contado na bolha de aviso |
| Re-execucao do step | mesmos leads, mesmo segmento | Zero duplicata de lead e de `lead_segments` | Nenhum erro esperado |
| Segmento com nome ja existente | segmento homonimo no tenant | Reusa o segmento existente (nao cria outro) | Colisao unique concorrente -> re-select e segue |
| Nome de segmento > 100 chars | `campaignDescription` longa | Nome truncado em 100 chars antes do insert | Nenhum erro esperado |
| Falha de escrita (RLS/rede) | insert de lead ou segmento falha | Step conclui com sucesso; bolha "nao consegui salvar em Meus Leads" | fail-open, log `console.error` |
| `segmentName` pedido na conversa | "coloca no segmento Teste Atibaia" | Segmento "Teste Atibaia"; `campaignDescription` intocada | Valor invalido/vazio -> null (`.catch(null)`) |

</intent-contract>

## Code Map

- `src/lib/agent/steps/create-campaign-step.ts` -- ponto de chamada; ja faz o enrichment (reveal de nome/email, L105-129), gera `leadsWithIcebreakers` e monta `campaignName` (L222-225)
- `src/app/api/segments/[segmentId]/leads/route.ts` -- regra de dedupe por `apollo_id` + associacao `lead_segments` a reusar (L181-300); grava `email` com a caixa CRUA (L216)
- `src/app/api/leads/import-csv/route.ts` -- dedupe por email (L60-98). ATENCAO: ele so minusculiza o lado da ENTRADA e compara com `.in()`; a coluna `leads.email` NAO e normalizada (L108 grava cru)
- `src/app/api/leads/create-batch/route.ts` -- precedente do produto para a identidade COMBINADA do lead: "Filter out duplicates (by email OR apollo_id)" (L111-119) — este e o modelo a seguir, nao a prioridade exclusiva
- `src/lib/agent/briefing-adjustment.ts` -- alem de `mergeAdjustedBriefing`, o ramo `create_campaign` de `buildAdjustmentSummary` (L238-254) e o SEGUNDO consumidor de resumo, exibido antes de uma re-execucao PAGA
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` -- testes do resumo (L3363+) e do guard hibrido `briefingChanged` (L3446+)
- `src/types/agent.ts` -- `ParsedBriefing`, `SearchLeadResult`, `LeadWithIcebreaker`
- `src/lib/agent/briefing-parser-service.ts` -- `briefingResponseSchema` + `SYSTEM_PROMPT` + montagem campo-a-campo do `ParsedBriefing` (armadilha de strip #1 da 22.5)
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` -- `briefingUpdateSchema`; `z.object` faz strip silencioso de chave nao declarada (armadilha de strip #2)
- `src/lib/agent/briefing-adjustment.ts` -- `mergeAdjustedBriefing` (metadados de campanha sao preservados quando o parse volta null)
- `src/hooks/use-briefing-flow.ts` -- `generateBriefingSummary` (L191+) e `briefingChanged` (L296+)
- `supabase/migrations/00010_create_leads.sql`, `00012_create_segments.sql`, `00034_add_icebreaker_columns.sql` -- schema real (zero migration nova)
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` -- convencao de mock (`createChainBuilder` de `__tests__/helpers/mock-supabase`)

## Tasks & Acceptance

**Execution:**
- `src/types/agent.ts` -- adicionar `segmentName?: string | null` a `ParsedBriefing` -- campo novo do briefing, pre-requisito de tipagem para o step e o parser.
- `src/lib/agent/lead-persistence.ts` -- criar helper server-side `persistApprovedLeads({ supabase, tenantId, segmentName, leads })` implementando o **Modelo de identidade do lead** e o **Contrato de falha parcial** das Design Notes: resolve-ou-cria o segmento SO quando ha lead persistivel, insere os ineditos, grava `icebreaker` + `icebreaker_generated_at`, cria as associacoes faltantes e devolve `{ segmentId, segmentName, inserted, reused, associated, skipped, degraded }`. Lanca APENAS antes da primeira escrita bem-sucedida -- centraliza a mecanica sem duplicar as rotas existentes.
- `src/lib/agent/steps/create-campaign-step.ts` -- ao final de `executeInternal`, depois de `leadsWithIcebreakers` e `campaignName`, chamar o helper dentro de try/catch, com a DERIVACAO do nome do segmento tambem DENTRO do try (`briefing` vem de JSONB com mais de um escritor: um `segmentName` nao-string nao pode escapar do fail-open); no catch, `console.error` + bolha `agent_messages` de aviso; bolha informativa quando `skipped > 0` ou `degraded` -- persistencia com dados revelados sem risco para o pipeline e sem mensagem falsa.
- `src/lib/agent/briefing-adjustment.ts` -- alem do merge, incluir `- Segmento: <nome ou "nome da campanha">` no ramo `create_campaign` de `buildAdjustmentSummary` -- e a ultima tela antes de uma re-execucao paga; sem ela o usuario confirma um gasto sem saber para onde os leads vao (o defeito exato que esta story existe para matar).
- `src/lib/agent/briefing-parser-service.ts` -- `segmentName` no `briefingResponseSchema` (trim, vazio->null, `max(100)`, `.default(null).catch(null)`), no `SYSTEM_PROMPT` (extrair so quando pedido; distinguir de `campaignDescription`; ao ser perguntado se da para usar segmento, responder afirmativamente citando o nome) e na montagem campo-a-campo do `ParsedBriefing` -- sem a ultima linha o campo some em silencio.
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` -- declarar `segmentName` no `briefingUpdateSchema` -- sem isso o PATCH strippa o campo antes do update.
- `src/lib/agent/briefing-adjustment.ts` -- preservar `segmentName` no `mergeAdjustedBriefing` com a mesma politica dos metadados de campanha (`parsed ?? persisted ?? null`) -- evita zeragem silenciosa em ajuste pos-rejeicao.
- `src/hooks/use-briefing-flow.ts` -- linha `- Segmento: X` em `generateBriefingSummary` quando presente e `segmentName` no diff de `briefingChanged` -- resumo honesto e correcao que so muda o segmento reapresenta o resumo.
- `__tests__/unit/lib/agent/lead-persistence.test.ts` -- cobrir toda a I/O & Edge-Case Matrix do helper com o banco fake SUJO (ver Verification): dedupe apollo, dedupe email com linha semeada em CAIXA MISTA, cruzamento apollo-x-email, sem chave, reuso de segmento, truncamento, idempotencia, corridas 23505 (leads e lead_segments) e falha injetada DEPOIS da primeira escrita.
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` -- adicionar casos: persistencia chamada com os leads revelados e o nome de segmento correto; falha da persistencia nao derruba o step e gera a bolha de aviso; `skipped`/`degraded` geram bolha informativa, nunca a de falha total.
- `__tests__/unit/lib/agent/briefing-parser-service.test.ts` + `briefing-adjustment.test.ts` + `__tests__/unit/api/agent/` (briefing PATCH) -- `segmentName` extraido, preservado no merge, exibido no resumo de ajuste de `create_campaign` e nao stripado pelo PATCH.
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` -- dois casos irmaos dos ja existentes: o resumo exibe `Segmento: X`, e um turno cujo UNICO delta e `segmentName` NAO e engolido como confirmacao pelo guard hibrido (`"sim, mas coloca no segmento X"` -> reapresenta o resumo).

**Acceptance Criteria:**
- Given uma execucao guiada onde o usuario aprovou parte dos leads no gate de "Busca de Leads", when o `create_campaign` conclui e o usuario abre Meus Leads, then encontra ali exatamente os leads que aprovou, filtraveis pelo segmento da campanha, e nao encontra os que desmarcou no gate.
- Given o usuario pediu "coloca no segmento Teste Atibaia" na conversa, when o briefing e resumido e a campanha e criada, then o resumo exibe `- Segmento: Teste Atibaia`, o segmento criado tem esse nome e `campaignDescription` nao foi contaminada pelo pedido.
- Given o usuario nao pediu segmento nenhum, when a campanha e criada, then o segmento usado e o proprio `campaignName` (ex.: "Campanha - Teste Atibaia"), criado ou reusado se ja existir com o mesmo nome.
- Given leads persistidos pelo agente, when o usuario abre Meus Leads, then ve nome completo, email e o icebreaker gerado pela campanha, mais a data em "Importado em" e o segmento da campanha como marca de origem.
- Given o usuario pergunta na conversa "da pra colocar esses leads num segmento?", when o agente responde, then a resposta e afirmativa e cita o nome do segmento que sera usado, em vez de ignorar a pergunta.
- Given a suite completa (`npm run test:run`), when executada apos a mudanca, then zero regressao nos fluxos de segmentos, import CSV e agente.

## Spec Change Log

### 2026-07-27 — Loopback 1 (dedupe e falha parcial)

**Achados que dispararam:** a revisao provou, executando o proprio helper, que 3 dos 4 caminhos de dedupe duplicavam leads: (a) `.in("email", <minusculas>)` nao acha linha gravada em caixa mista — e NENHUMA rota do produto normaliza `leads.email`; (b) lead com `apolloId` nunca tinha o email conferido, entao a pessoa ja existente vinda de CSV (sem `apollo_id`) virava linha nova; (c) o dedupe dentro do lote usava dois conjuntos disjuntos e nao pegava o mesmo contato entrando pelas duas chaves. Em paralelo: as fases 5/6 do helper lancavam DEPOIS de leads e associacoes ja gravados, fazendo o step anunciar "nao consegui salvar ... importe-os manualmente" sobre leads salvos; `buildAdjustmentSummary` ficou sem a linha de segmento; e o segmento era criado mesmo sem nenhum lead persistivel.

**O que foi emendado:** Code Map (a `import-csv` so minusculiza a ENTRADA; `create-batch` e o precedente da identidade em OR; `buildAdjustmentSummary` e o 2o consumidor de resumo), Tasks (helper com `degraded`; derivacao do nome DENTRO do try; task de `buildAdjustmentSummary`; testes do hook), Design Notes (secoes novas "Modelo de identidade do lead", "Contrato de falha parcial" e "Segmento") e Verification (regra do banco fake SUJO).

**Estado ruim evitado:** uma suite 100% verde certificando idempotencia que nao existe contra os dados reais do cliente (875 leads importados por CSV) — cada campanha do agente duplicando silenciosamente a base que a story existe para organizar; e o usuario sendo instruido a reimportar leads que ja estao salvos.

**KEEP (tem que sobreviver a re-derivacao):**
- O ponto de chamada: fim de `executeInternal` do `CreateCampaignStep`, depois do enrichment e do `campaignName`. Confirmado correto pela auditoria de intencao.
- Client de SESSAO (`this.supabase`) + `tenant_id` explicito. Nada de service-role.
- `normalizeSegmentName` e `splitLeadName` como funcoes puras exportadas e testadas isoladamente.
- Fail-open no step com try/catch aninhado para a propria bolha, e bolha informativa separada quando ha leads de fora (`skipped > 0`) — nunca a bolha de falha total num sucesso parcial.
- A cadeia anti-strip completa do `segmentName`: schema do parser (`.default(null).catch(null)`), montagem campo-a-campo do `ParsedBriefing`, `briefingUpdateSchema` do PATCH, `mergeAdjustedBriefing`, `generateBriefingSummary`, `briefingChanged`. Nenhum elo pode sumir.
- Regras do SYSTEM_PROMPT: extrair `segmentName` so quando pedido, `NAO confunda com campaignDescription`, e responder afirmativamente citando o nome.
- O banco fake in-memory dos testes do helper (que simula os unique indexes lancando) — a base e boa; o que muda e o ESTADO semeado nele.
- Ordem interna do helper: icebreaker dos reusados por ultimo, para nao bloquear leads e associacoes.

## Review Triage Log

### 2026-07-27 — Review pass
- intent_gap: 0
- bad_spec: 15: (high 3, medium 8, low 4)
- patch: 0
- defer: 1: (high 0, medium 1, low 0)
- reject: 7: (high 0, medium 4, low 3)
- addressed_findings:
  - `[high]` `[bad_spec]` Dedupe por email nao era case-insensitive contra o valor ARMAZENADO — spec emendada com o modelo de identidade e a exigencia de comparacao insensivel nos dois lados; loopback de implementacao.
  - `[high]` `[bad_spec]` `apolloId` curto-circuitava a busca por email, duplicando quem ja veio de CSV — spec emendada para identidade em OR (precedente `create-batch`).
  - `[high]` `[bad_spec]` Falha depois da primeira escrita virava "nao consegui salvar" sobre leads salvos — spec emendada com o Contrato de falha parcial (`degraded`).
  - `[medium]` `[bad_spec]` Dedupe dentro do lote nao pegava o mesmo contato entrando por chaves diferentes.
  - `[medium]` `[bad_spec]` `23505` no insert de `leads` derrubava o lote inteiro; `23505` em `lead_segments` virava falha total.
  - `[medium]` `[bad_spec]` Sem chunking nas queries `.in()`/insert para lotes grandes de `importedLeads`.
  - `[medium]` `[bad_spec]` `buildAdjustmentSummary` (tela antes de re-execucao paga) nao exibia o segmento.
  - `[medium]` `[bad_spec]` Segmento era criado mesmo sem nenhum lead persistivel (segmentos vazios sequestrando o nome).
  - `[medium]` `[bad_spec]` Busca do segmento case-sensitive gerava segmentos quase-duplicados a partir da variacao de caixa do LLM.
  - `[medium]` `[bad_spec]` Faltavam testes do delta so-`segmentName` no `briefingChanged` e da linha `- Segmento:` no resumo.
  - `[low]` `[bad_spec]` Derivacao do nome do segmento fora do try (JSONB nao-string escapava do fail-open).
  - `[low]` `[bad_spec]` `slice(0, 100)` cortava par substituto (UTF-16) em vez de code point.
  - `[low]` `[bad_spec]` `splitLeadName` fabricava o placeholder "Lead" e gravava email em caixa crua no `first_name`.
  - `[low]` `[bad_spec]` N UPDATEs seriais de icebreaker para leads reusados no caminho quente do step.

### 2026-07-27 — Review pass (pos-loopback)
- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 1, medium 6, low 4)
- defer: 0
- reject: 9: (high 0, medium 5, low 4)
- addressed_findings:
  - `[high]` `[patch]` Bolha `degraded` citava um segmento que nunca foi criado (`segmentId: null`) — mandava o usuario procurar em Meus Leads uma lista inexistente. Agora ramifica em `segmentId` e diz a verdade: leads na base, sem agrupamento.
  - `[medium]` `[patch]` Com `saved === 0 && skipped > 0` a bolha listava so os excluidos, dando a entender que "o resto" foi salvo — nao havia resto. Linha explicita adicionada.
  - `[medium]` `[patch]` O resumo inicial (a confirmacao PAGA) omitia o destino no caso default, enquanto o resumo de ajuste sempre o exibia. Linha `- Segmento:` virou incondicional (`?? "nome da campanha"`).
  - `[medium]` `[patch]` A union-find do dedupe de lote unia por email de forma transitiva e fundia duas pessoas distintas do Apollo, descartando o segundo `apollo_id` em silencio. Uniao recusada quando ha conflito de `apolloId`.
  - `[medium]` `[patch]` Dois registros do lote podiam resolver para a MESMA linha existente por chaves diferentes, duplicando a associacao e derrubando o chunk em `23505`. Ids deduplicados; `reused` deixa de inflar.
  - `[medium]` `[patch]` Padroes `ilike` sem escapar metacaractere de LIKE: um email de CSV com `%` varria a tabela `leads` inteira do tenant. `escapeLikePattern` aplicado a email e nome de segmento.
  - `[medium]` `[patch]` A costura step<->helper nao tinha teste (o helper era mockado por inteiro) e o assert de "nao poluir a conversa" filtrava bolha por frase. FakeDb extraido para helper compartilhado, 4 testes do step contra o `persistApprovedLeads` REAL e filtro estrutural de bolhas.
  - `[low]` `[patch]` `splitLeadName` podia gravar `first_name` vazio (lead so com `apolloId`) — linha sem identidade em Meus Leads. Fallback encadeado ate o `apolloId`.
  - `[low]` `[patch]` `z.string().max(100)` media unidades UTF-16 enquanto a truncagem media code points: nome com emoji cabivel no `VARCHAR(100)` era descartado em silencio. Medicao por code point no parser E no `briefingUpdateSchema` (sem alinhar os dois, um nome aceito pelo parser derrubaria o PATCH inteiro com 400).
  - `[low]` `[patch]` Flag `created` de `resolveOrCreateSegment` documentada como parte da decisao de degradar, mas lida por ninguem. Removida.
  - `[low]` `[patch]` `vi.spyOn(console, "error")` sem restore vazava para os testes seguintes do arquivo. `afterEach(() => vi.restoreAllMocks())` adicionado.

### 2026-07-27 — Review pass (follow-up sobre a story `done`)
- intent_gap: 0
- bad_spec: 0
- patch: 12: (high 1, medium 3, low 8)
- defer: 2: (high 0, medium 2, low 0)
- reject: 7: (high 0, medium 3, low 4)
- addressed_findings:
  - `[high]` `[patch]` Colapso de identidade contra o BANCO: dois leads aprovados com `apolloId` distinto e email igual casavam com a MESMA linha legada (CSV, sem `apollo_id`), e o segundo nao era inserido, nao entrava em `skipped` e nao gerava bolha — o lead aprovado sumia em silencio, contra a AC "encontra ali exatamente os leads que aprovou". A regra de conflito que ja existia DENTRO do lote (`dedupeBatch`) agora vale tambem contra o banco, via mapa de posse da linha (`apolloByRowId`) em `matchExisting`.
  - `[medium]` `[patch]` Segmento nascia ANTES do insert de leads: uma falha do insert sem nada pre-existente lancava deixando um segmento VAZIO para tras, sequestrando o nome pela unique — enquanto a bolha mandava reimportar manualmente. Fase do segmento movida para depois dos leads; de quebra, falha de segmento com leads novos agora DEGRADA em vez de abortar tudo com a tabela `leads` saudavel.
  - `[medium]` `[patch]` Padrao de email ancorado nao achava linha gravada com espaco em volta (`create-batch` grava `lead.email ?? null` cru, sem trim nem `.email()`): o lead virava INSERT duplicado. Padrao passou a nao-ancorado, com a reconferencia em memoria ja existente garantindo a exatidao.
  - `[medium]` `[patch]` `MOCK_LEADS` sem `apolloId` (3 erros TS2741 pre-existentes) fazia a costura step->helper nunca gravar `apollo_id`: o unique parcial e o dedupe por apollo nao eram cruzados ponta-a-ponta. Fixtures corrigidas (zera os 3 erros de tipo) + asserts de `apollo_id` na costura e no contrato.
  - `[low]` `[patch]` Insert que gravava sem devolver `RETURNING` utilizavel produzia `{inserted:0, degraded:false}` com leads orfaos na base e sucesso limpo na tela. Reconciliacao adicionada: registro sem id ao fim do insert degrada o resultado.
  - `[low]` `[patch]` `saved = inserted + reused` fazia a bolha dizer "Salvei N leads" quando NADA foi gravado nesta execucao. Frase passa a "Seus N leads ja estavam em Meus Leads" quando `inserted === 0`.
  - `[low]` `[patch]` Valor do `ilike` do nome do segmento nao era citado como o de email: um nome devolvido pelo LLM com aspas nao achava o segmento existente, batia na unique e caia na bolha de falha total. `quoteFilterValue` aplicado, e o fake passou a desfazer valor citado em qualquer filtro (paridade com o PostgREST).
  - `[low]` `[patch]` `segmentName` nao-string reprovava o `briefingUpdateSchema` e derrubava o PATCH INTEIRO com 400, perdendo todos os ajustes do turno — contrario ao fail-open que a propria spec exige para valor vindo do JSONB. Preprocess coage para null preservando `undefined` (sem isso, campo omitido ZERARIA o valor salvo).
  - `[low]` `[patch]` Guard que impede `icebreaker: null` de apagar icebreaker gravado (entrada rotineira: `generateIcebreakers` empurra null a cada falha) nao tinha teste. Coberto, mais o caso do insert com `icebreaker_generated_at` null.
  - `[low]` `[patch]` `EMAIL_CHUNK_SIZE` nao era observado por teste nenhum (so os inserts eram assertados): remover o fatiamento da LEITURA passaria verde e quebraria justamente os lotes grandes de CSV. Asserts de leitura e de associacao adicionados.
  - `[low]` `[patch]` "deve NAO tentar enrichment para leads sem apolloId" nao assertava nada — o mecanismo declarado ("sem mock, enrichPerson lancaria") nunca funcionou, porque a chamada e envolvida num `catch {}`. Assert direto no colaborador + custo zero.
  - `[low]` `[patch]` Fake lancava excecao para violacao de NOT NULL enquanto o supabase-js RETORNA `{data:null,error}`: a excecao escapava por cima do contrato de falha parcial que estes testes existem para vigiar. Passa a devolver `23502`.

### 2026-07-27 — Review pass (2o follow-up sobre a story `done`)
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 1, medium 3, low 4)
- defer: 2: (high 0, medium 0, low 2)
- reject: 13: (high 0, medium 5, low 8)
- addressed_findings:
  - `[high]` `[patch]` A bolha `degraded` COM segmento existente ignorava `savedClause` e dizia, fixo, "Salvei os leads em Meus Leads no segmento X". Com `inserted: 0` (todos ja existiam) e a associacao falhando, ela anunciava uma escrita que nao houve E mandava o usuario abrir uma lista onde os leads nao estao — o ramo irmao existia justamente para nao fazer isso. Passa a usar `savedClause` e a tratar o agrupamento como possivel faltante, nao como fato.
  - `[medium]` `[patch]` Com `saved === 0` a frase virava "Seus 0 leads ja estavam em Meus Leads" e, no caminho degradado, se contradizia na mesma linha ("... eles estao na base"). Estado alcancavel pelo insert que grava sem devolver ids (`RETURNING` vazio). Ramo proprio: nao conta leads e pede conferencia antes de reimportar.
  - `[medium]` `[patch]` O indice de dedupe guardava UMA linha por email, entao a linha ser de outra pessoa do Apollo fazia o match desistir mesmo havendo linha legada livre com o mesmo email — o lead virava INSERT duplicado (`leads` nao tem unique de email). O indice passa a guardar todas as candidatas e `matchExisting` varre ate achar uma sem dono conflitante.
  - `[medium]` `[patch]` A escrita da bolha INFORMATIVA ficava dentro do try da persistencia: uma falha dela caia no catch e o usuario lia "importe-os manualmente" sobre leads ja salvos — exatamente a reimportacao que o Contrato de falha parcial existe para impedir. Extraida para `sendMyLeadsNotice` (nunca lanca, e loga o `{ error }` que o supabase-js RETORNA em vez de lancar), com guard `persisted`.
  - `[low]` `[patch]` A busca do segmento era ancorada enquanto a de email nao: `POST /api/segments` grava o nome cru (sem `trim`) e a unique e byte-exata, entao "Teste Atibaia " existente nao era achado e nascia um segundo segmento identico aos olhos, com os leads no que o usuario nao estava olhando. Padrao nao-ancorado + reconferencia com `trim`.
  - `[low]` `[patch]` O fatiamento da LEITURA por `apollo_id` nao era observado por teste nenhum (so o de email era): remove-lo passava verde e lancava na Fase 1 em producao — antes de qualquer escrita, gerando "importe-os manualmente" nos lotes grandes de CSV. `FakeDb` passou a logar os filtros `.in()` e o teste de volume assere o corte.
  - `[low]` `[patch]` Idem para a leitura de `lead_segments`: un-chunkada ela falha DEPOIS dos leads gravados, vira `degraded` silencioso e os leads ficam em Meus Leads mas FORA do segmento pedido. Assert de fatiamento adicionado.
  - `[low]` `[patch]` `lead as LeadWithIcebreaker & { apolloId?: string | null }` em `dedupeBatch` afrouxava para opcional um campo OBRIGATORIO de `SearchLeadResult`, desligando em compilacao a deteccao da regressao que o passe anterior corrigiu nas fixtures. Cast removido.

## Design Notes

**Por que o `CreateCampaignStep` e o unico ponto correto.** A AC de origem pedia a persistencia "na aprovacao da Busca de Leads", mas a tabela de revisao exibe dados MASCARADOS ("Amanda Re***l", email "—"). O reveal acontece no bloco de enrichment do `CreateCampaignStep` (L105-129), que muta `typedLead.email`/`typedLead.name` in place. O `create_campaign` so recebe os leads aprovados — o orchestrator substitui `leads` por `approvedLeads` antes de montar o `StepInput` (`orchestrator.ts` L175-179). Logo, persistir ao final desse step satisfaz simultaneamente "so os aprovados", "dados revelados" e "com icebreaker".

**Client de sessao, nao service-role.** `POST .../steps/[n]/execute` constroi o orchestrator com o client de SESSAO (comentario explicito "Trap #1" na rota); a RLS de `leads`/`segments`/`lead_segments` e `tenant_id = get_current_tenant_id()`, que o usuario autenticado satisfaz. Service-role aqui so aumentaria a superficie de bypass sem resolver nada.

**Modelo de identidade do lead (a parte que erra facil — leia inteiro).** A identidade de uma pessoa em `leads` e `apollo_id` **OU** email, em OR, nunca em prioridade exclusiva. O precedente do produto e a `create-batch` ("by email OR apollo_id"); tratar as duas regras como particao (quem tem `apolloId` nao olha email) duplica a pessoa que ja esta na base vinda de CSV, porque `leads` tem unique so em `(tenant_id, apollo_id)` — nao ha unique em email para segurar o erro. Consequencias praticas, todas obrigatorias:

- Resolver as DUAS chaves para TODO lead e casar por `apollo_id` OU email antes de decidir inserir.
- A busca por email tem que ser case-insensitive **nos dois lados**. `leads.email` NAO e normalizado no banco (`import-csv`, `create-batch` e a rota de segmentos gravam a caixa crua), entao `.in("email", <minusculas>)` — o mecanismo da `import-csv` — nao acha `Maria@Empresa.com`. Use comparacao insensivel (`.or()` de `ilike`), em blocos.
- O dedupe DENTRO do lote usa a mesma identidade: o mesmo contato entrando uma vez com `apolloId` e outra so com email e UM lead, nao dois.
- `apollo_id` nao aceita `upsert` (indice unico PARCIAL `WHERE apollo_id IS NOT NULL`) — select-then-insert, como a rota de segmentos.
- Nada de volume ilimitado: `importedLeads` vem de CSV do usuario e nao tem teto. Fatie as queries `.in()`/`.or()` e o insert em blocos (~100) e evite N round-trips seriais para atualizar icebreaker de leads reusados.

**Contrato de falha parcial.** Nao ha transacao: sao chamadas REST independentes. Depois da primeira escrita bem-sucedida, NENHUMA falha pode virar excecao para fora do helper — senao o step anuncia "nao consegui salvar ... importe-os manualmente" sobre leads que ESTAO salvos, e o usuario importa de novo, duplicando exatamente a base que a story quer limpar. Regras:

- Falha antes de qualquer escrita: lanca (o step decide o fail-open).
- Falha depois: retorna `degraded` com o que faltou, e a bolha do step diz a verdade parcial.
- `23505` no insert de `leads` (execucao concorrente gravando o mesmo `apollo_id`): re-selecionar e inserir so o que falta — um lote inteiro nao pode morrer por uma colisao.
- `23505` no insert de `lead_segments` (`unique_lead_per_segment`): ja associado, segue.

**Segmento.** Criar o segmento apenas quando existe ao menos um lead persistivel — senao a lista do tenant enche de segmentos vazios que ainda sequestram o nome pela unique. A busca do segmento tambem e case-insensitive (`ilike`): o nome vem de extracao do LLM, que varia a caixa entre turnos, e `unique_segment_name_per_tenant` e case-sensitive — sem isso nascem "Teste Atibaia" e "teste atibaia" separados. Truncar por CODE POINT, nao por unidade UTF-16 (`[...nome].slice(0, 100)`): um emoji partido ao meio vira surrogate solto e o Postgres rejeita.

**Nome/sobrenome.** `first_name` e NOT NULL. Mesma quebra do `ExportStep`: primeiro token = `first_name`, resto = `last_name`. Nao fabricar valor: lead sem nome usavel cai para o email normalizado (o mesmo valor gravado na coluna `email`), nunca um placeholder literal.

## Verification

**Commands:**
- `npm run test:run` -- expected: suite verde, incluindo os novos testes de `lead-persistence`
- `npx tsc --noEmit` -- expected: zero erro de tipo
- `npm run lint` -- expected: zero erro

**Regra dos testes do helper (nao negociavel):** um banco fake que so recebe estado LIMPO certifica a implementacao contra as premissas do autor, nao contra o Postgres. O estado semeado tem que ser SUJO — email em caixa mista, linha legada sem `apollo_id` para uma pessoa que agora chega com `apolloId` — e as falhas injetadas tem que incluir pelo menos uma DEPOIS da primeira escrita (associacao e update de icebreaker). Um teste chamado "case-insensitive" que semeia a linha ja em minusculas passaria com a comparacao 100% case-sensitive: nao vale.

**Manual checks (if no CLI):**
- Rodar uma campanha pequena pelo agente (modo guiado, 2 leads) e conferir em Meus Leads: os 2 leads aprovados presentes, com nome completo, email, icebreaker, data em "Importado em" e o segmento da campanha selecionavel no filtro. Rodar o mesmo fluxo uma segunda vez com o mesmo segmento e confirmar que nada duplicou.


## Auto Run Result

Status: done
Passe: 2o review de follow-up sobre a story ja `done` (sem loopback — 0 intent_gap, 0 bad_spec).

**Resumo da mudanca deste passe.** 8 patches, concentrados em duas frentes que os tres reviewers de codigo convergiram independentemente: (1) a **honestidade da bolha** — o ramo `degraded` com segmento existente continuava com a frase fixa "Salvei os leads em Meus Leads no segmento X", exatamente o defeito que o passe anterior tinha corrigido no ramo irmao, entao com todos os leads ja na base e a associacao falhando o usuario era informado de uma escrita que nao houve e mandado abrir uma lista vazia; e (2) o **contrato de falha parcial**, que tinha um furo estrutural: a escrita da bolha informativa morava dentro do try da persistencia, entao uma falha DELA caia no catch e produzia "importe-os manualmente" sobre leads salvos — a reimportacao duplicadora que o contrato inteiro existe para impedir.

No dedupe, um achado real: o indice guardava uma unica linha por email, e como `leads` nao tem unique de email (o mesmo endereco aparece numa linha do Apollo e numa do CSV), bastava a primeira candidata pertencer a outra pessoa para o match desistir e inserir uma duplicata — com a linha legada livre logo atras.

**Arquivos alterados:**
- `src/lib/agent/steps/create-campaign-step.ts` — ramo proprio para `saved === 0`; ramo `degraded` usa `savedClause` e trata o agrupamento como possivel faltante; `sendMyLeadsNotice` extraido (nunca lanca, checa o `{ error }` do supabase-js) + guard `persisted`.
- `src/lib/agent/lead-persistence.ts` — `byEmail` passa a mapear email -> TODAS as linhas e `matchExisting` varre as candidatas; busca de segmento nao-ancorada com reconferencia por `trim`; cast que afrouxava `apolloId` removido.
- `__tests__/helpers/fake-leads-db.ts` — filtros `.in()` entram no log (sem isso o fatiamento das LEITURAS nao e assertavel).
- `__tests__/unit/lib/agent/lead-persistence.test.ts` — 2 casos novos (linha ocupada por outro apollo nao impede reusar a livre; segmento gravado com espaco em volta) + asserts de fatiamento das leituras de `apollo_id` e `lead_segments`.
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` — 3 casos novos (degraded com segmento e `inserted: 0`; degradado sem nenhum lead resolvido; falha da bolha informativa nao vira bolha de falha total).
- `_bmad-output/implementation-artifacts/deferred-work.md` — 2 entradas novas.

**Triagem:** 8 patch (high 1, medium 3, low 4) · 2 defer (low 2) · 13 reject (medium 5, low 8) · 0 intent_gap · 0 bad_spec.
Rejeitados por autoridade da intencao: persistir antes do gate de aprovacao e o segmento orfao numa rejeicao (o ponto de escrita e fixado pela Approach e confirmado pela auditoria de intencao), nome default = `campaignName` reusando segmento homonimo (AC explicita), o segundo segmento no dia seguinte (consequencia do mesmo default), backfill de `apollo_id` em linha legada (mutaria dado pre-existente que a story nao possui; ja rejeitado no passe anterior), truncagem em 100 sem avisar (mandada pela intencao). Rejeitados por serem parecer sem consequencia: divergencia do limite de 100 entre parser/`PATCH`/helper (inalcancavel pelos escritores do proprio produto — o parser nunca emite >100), `segmentName` que so pode ser setado e nao removido (paridade com `campaignDescription`, politica de merge escrita na spec), o hook nao mesclar o briefing (o parser recebe o HISTORICO completo e re-deriva o campo a cada turno, como todo campo do briefing), `unresolved` sem contador proprio (`degraded` ja e setado e a bolha ja avisa), `LIFECYCLE_MESSAGE_TYPES` sem `approval_gate` (so quebra se os proprios testes mudarem de modo), `escapeLikePattern` nao escapar `*` (PostgREST aceita `*` como curinga, mas a reconferencia em memoria preserva a correcao — sobra custo de query, ja coberto pela entrada de ledger sobre verificacao de escape), `%email%` sem indice (ja deferido no passe anterior) e a reconferencia do insert de segmento fora do `23505`.

**Follow-up review recommended:** true — 1 patch de severidade `high` (a bolha `degraded` anunciando escrita e agrupamento inexistentes). Contagem: high 1, medium 3, low 4; a regra `3 x medium + 1 x low` daria 13, mas o `high` sozinho ja fecha a decisao.

**Verificacao executada:**
- `npm run test:run` — 403 arquivos, **7457 testes verdes**, 2 skipped (eram 7452; +5 casos novos). Uma unica execucao, sem flake desta vez.
- `npx tsc --noEmit` — 183 erros, o MESMO numero do fim do passe anterior. Nenhum nos arquivos tocados; todos pre-existentes em arquivos de teste nao relacionados. A Verification da spec pede "zero erro", o que nunca foi verdade neste repositorio.
- `npm run lint` — 19 erros / 130 warnings, **nenhum em arquivo tocado** (identico ao passe anterior). Mesma ressalva quanto ao "zero erro" da spec.

**Riscos residuais:**
- O padrao de busca do segmento ficou mais largo (`%nome%`): a reconferencia em memoria garante a correcao, mas a query de `segments` deixa de ser elegivel a indice. Tabela pequena por tenant — custo aceito em troca de nao criar segmentos duplicados.
- `matchExisting` continua resolvendo a posse da linha por EXECUCAO: o `apollo_id` nao e gravado na linha legada reusada (rejeitado duas vezes, por mutar dado pre-existente). Duas pessoas do Apollo com o mesmo email podem, em execucoes diferentes, reivindicar a linha em ordens diferentes.
- As duas limitacoes estruturais seguem valendo e continuam deferidas: o `ilike` de email nao usa indice, e o fake do repositorio e fixture e oraculo ao mesmo tempo para as premissas do PostgREST — nenhuma superficie que o usuario ve (Meus Leads) e asserida por teste.
