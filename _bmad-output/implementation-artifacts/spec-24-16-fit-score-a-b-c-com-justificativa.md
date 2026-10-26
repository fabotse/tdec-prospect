---
title: '24.16 — Fit Score A/B/C com justificativa'
type: 'feature'
created: '2026-10-22'
status: done
operator_actions:
  - 'Aplicar no SQL Editor do Supabase de produção (kdgogyqyaxncqoyklyxx) a migration supabase/migrations/00070_add_lead_fit_score.sql (só aditiva: 3 colunas nullable em leads).'
  - 'Depois de aplicar, fazer o smoke do agente ("CISO de São Paulo", 2 leads, parar antes de gastos/ativação) e conferir no gate os badges A/B/C com justificativa e, após aprovar, leads.fit_score/fit_reason preenchidos.'
baseline_revision: '94a84fa261e607267801e9680fc80c233080653f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A chamada unica do Fit Score (ate 100 leads, gpt-5.4-mini, sem teto de tokens nem reasoning_effort) pode estourar o timeout de 20s com frequencia.
    evidence: |-
      maybe-false: nos testes a OpenAI e mockada. Se estourar, o step segue so com regras, mas gasta ate 20s e conta 1 chamada. Para resolver, medir a latencia real num smoke com N=20 (universo de 60) e N>=34 (universo de 100) e, se preciso, reduzir o lote ou ajustar o request.
    location: >-
      src/lib/agent/fit-scorer.ts (scoreLeads) e src/lib/ai/fit-score-config.ts
    severity: medium (unverified)
  - summary: >-
      A qualidade das notas e justificativas do LLM real contra o ICP nunca foi verificada; todos os testes usam respostas mockadas.
    evidence: |-
      maybe-false: os testes provam o formato do request, o parse e o merge por lead, nao o julgamento do modelo. Para resolver, rodar um smoke real ("CISO de Sao Paulo", N=2) e conferir no gate se as notas A/B/C e os motivos fazem sentido.
    location: >-
      src/lib/agent/fit-scorer.ts (FIT_SCORE_SYSTEM_PROMPT)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** A revisão de leads do agente mostra a lista na ordem da Apollo, sem nenhuma indicação de quais leads combinam com o pedido e com o ICP. Quem pediu 5 leads recebe os 5 primeiros da Apollo pré-selecionados, e não os 5 melhores. A busca também não traz um universo maior que N para escolher.

**Approach:** O step `search_leads` passa a buscar um universo de 3–5× N e a dar a cada lead um Fit Score A/B/C com justificativa de 1 linha. O score sai de regras determinísticas e, por cima delas, de **uma** chamada de LLM barato contra o briefing, o ICP e as dores da KB. Os leads saem do step ordenados por score (A → B → C), então a pré-seleção dos "N primeiros" da 24.13 vira a dos N melhores. A revisão mostra badge e justificativa. O score viaja com o lead aprovado e é gravado em `leads` por uma migration aditiva (colunas nullable), num update à parte e best-effort.

## Boundaries & Constraints

**Always:**
- Universo (`resolveLeadsPerPage` em `agent-pricing.ts`): com N, `min(max(3N, min(5N, 25)), 100)`; sem N, 25 (como hoje). Exemplos: N=1 → 5, N=5 → 25, N=10 → 30, N=20 → 60, N≥34 → 100. A busca Apollo (`api_search`) não consome crédito. O custo novo é limitado a **1** chamada de LLM por execução do step, com no máximo 100 leads na chamada.
- Regras (função pura, client-safe, sem I/O) sobre o `LeadRow` da busca e os cargos pedidos (`briefing.jobTitles` ∪ cargos do ICP), comparando sem acento e sem caixa:
  - Cargo: contém um dos cargos pedidos → forte. Senão, contém palavra de senioridade (`ceo, cto, cio, ciso, cfo, coo, chief, head, diretor, director, vp, vice, gerente, manager, socio, founder, owner, presidente`) → médio. Senão → fraco.
  - E-mail: `has_email` da Apollo.
  - Nota: forte + e-mail → A. Forte sem e-mail ou médio → B. Fraco → C.
  - Justificativa em PT sem acento (convenção das strings do agente), ≤ 120 caracteres. Exemplos: "Cargo bate com o pedido (CISO) e tem e-mail disponivel", "Cargo senior (Diretor), fora da lista pedida", "Cargo fora do perfil pedido". Porte e local não entram nas regras por lead, porque a `api_search` não devolve esses dados e eles já são filtros da busca.
- LLM (`fit-scorer.ts`, só servidor, no molde de `copy-reviewer.ts`): modelo e request numa fonte única `fit-score-config.ts` (molde de `copy-review-config.ts`: `gpt-5.4-mini`, `json_object`, sem `temperature` em gpt-5, timeout de 20s). Entrada: índice, cargo e empresa de cada lead (sem nome nem e-mail), nota e motivo das regras, briefing (cargos, setor, local, porte) e ICP (setores, portes, foco geográfico, cargos, `pain_points` cortado em 1500 caracteres). Saída: `{"scores":[{"i":0,"grade":"A","reason":"..."}]}`. A nota e o motivo do LLM substituem os das regras **por lead**. Uma entrada ausente, com grade fora de A/B/C ou com motivo vazio fica com o resultado das regras. Motivo cortado em 120 caracteres.
- Falha do LLM (sem chave OpenAI, timeout, erro HTTP ou JSON inválido): todos os leads ficam só com as regras e o step segue normalmente (NFR9). O scorer nunca lança.
- Uso e custo: 1 linha `logAgentUsage` (`serviceName: "openai"`, `requestType: "fit_score"`, `stepType: "search_leads"`, status, tokens no metadata) sempre que a chamada foi tentada. `cost.openai_fit_score = 1` quando tentada, senão 0. `computeStepActualCost("search_leads")` passa a ser `openai_fit_score × prices.openai`. A estimativa de `search_leads` passa a ser `1 × openai` (descrição "1 chamada de IA (Fit Score); busca Apollo nao consome creditos"), e 0 quando o step é pulado.
- Output do `search_leads` (ramo não vazio, busca direta e por domínios): cada lead ganha `fitScore: "A"|"B"|"C"` e `fitReason: string`; a lista sai ordenada de forma estável por A → B → C. `data.fitScoring = { source: "llm" | "rules", counts: { A, B, C } }`. O corte do autopilot da 24.13 roda **depois** da ordenação (leva os N melhores). O ICP é lido com `readTenantICP` (service-role, fail-open), que passa a devolver também `painPoints` (string, `""` quando ausente).
- Revisão (`AgentLeadReview`): coluna "Fit" com badge A/B/C (`data-testid="fit-badge"`) e a justificativa em texto menor abaixo do nome. A ordem é a do output. Lead sem `fitScore` (execução antiga, ou trazido pelo `fetch-leads`) mostra "—" e fica depois dos pontuados. Depois do `fetch-leads`, os leads que já tinham score mantêm o score (casando por `apolloId`), e a lista é reordenada (A → B → C → sem nota, estável) antes de selecionar os Q primeiros. A pré-seleção continua sendo a da 24.13 (N primeiros, ou todos sem N), que agora são os melhores.
- Persistência: `SearchLeadResult` ganha `fitScore?` e `fitReason?` opcionais, que viajam no `approvedLeads` (o approve já repassa o objeto inteiro) e no spread do `create_campaign`. `persistApprovedLeads` ganha uma fase final que atualiza `fit_score`, `fit_reason` e `fit_scored_at` de cada lead persistido (inseridos e reusados) que tem score. Falha nessa fase (inclusive coluna inexistente antes da migration) é só `console.warn`: não lança, não marca `degraded` e não muda o resultado.
- Migration `supabase/migrations/00070_add_lead_fit_score.sql`: só aditiva e idempotente (`ADD COLUMN IF NOT EXISTS` de `fit_score TEXT NULL` com CHECK `IN ('A','B','C')`, `fit_reason TEXT NULL` e `fit_scored_at TIMESTAMPTZ NULL`). Cabeçalho no padrão de `00064`. **Não aplicar**: quem aplica é o Fabossi.

**Never:**
- Nada de `UPDATE`/`DELETE` em dados existentes, `pg_cron`, Edge Function ou secret. Nenhuma trava nova em export ou ativação do Instantly. O insert de leads não ganha as colunas novas, para não quebrar antes da migration.
- Não mexer na rota `fetch-leads` nem na busca manual de leads (fora do agente).
- O score nunca remove lead da lista nem bloqueia aprovação. C continua selecionável.
- Não criar teto de custo configurável por tenant (não existe hoje). O teto desta story é estrutural: 1 chamada por step e no máximo 100 leads.
- Não exibir o score em "Meus Leads" (fica para outra story).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Universo | N = 1 / 5 / 10 / 20 / 60 / null | perPage 5 / 25 / 30 / 60 / 100 / 25 | — |
| Regra A | cargo "CISO" pedido, título "CISO LATAM", `has_email` true | A, motivo cita o cargo | — |
| Regra B | título "Diretor Financeiro", pedido "CISO" | B (senioridade) | — |
| Regra C | título "Analista", pedido "CISO" | C | — |
| Forte sem e-mail | título bate, `has_email` false | B | — |
| LLM ok | LLM devolve grades para todos | grades do LLM, `source: "llm"`, ordem A→B→C | — |
| LLM parcial | LLM omite o índice 3 e manda "D" no 4 | 3 e 4 com o resultado das regras | — |
| LLM falha | timeout / sem chave / JSON inválido | todos por regras, `source: "rules"`, step `success` | log `failed` (exceto sem chave: sem log, custo 0) |
| Autopilot | N = 2, universo com 1 A no índice 7 | output com os 2 melhores (o A primeiro) | — |
| Revisão | 25 leads pontuados, N = 5 | badges, ordem A→B→C, 5 primeiros selecionados | — |
| Revisão legado | leads sem `fitScore` | "—", ordem original, pré-seleção de hoje | — |
| fetch-leads | 25 pontuados → busca 50 | 25 mantêm o score, 25 novos com "—" no fim, seleciona os Q primeiros | — |
| Persistência | lead aprovado com A | update `fit_score='A'`, `fit_reason`, `fit_scored_at` | erro → `console.warn`, resultado inalterado |
| Estimativa | busca direta / leads importados (search pulado) | `search_leads` = 1 × openai / 0 | — |

</intent-contract>

## Code Map

- `src/lib/agent/agent-pricing.ts:73-80` -- `resolveLeadsPerPage`: nova fórmula do universo. `computeStepActualCost` (:183): o caso `search_leads` passa a contar `openai_fit_score`. Teste: `__tests__/unit/lib/agent/agent-pricing.test.ts` (as expectativas de perPage da 24.13 mudam, ex.: N=60 → 100).
- `src/lib/agent/fit-score-rules.ts` (novo, puro) -- `FitGrade`, `scoreLeadByRules(lead: {title, hasEmail}, requestedTitles)`, `sortByFitGrade` (estável, sem nota no fim) e `normalizeText` (NFD + minúsculas). Cuidado: o match de cargo é por substring do termo normalizado ("ciso" em "ciso latam"). Nunca casar termo vazio.
- `src/lib/ai/fit-score-config.ts` (novo) -- `FIT_SCORE_MODEL`, `FIT_SCORE_TIMEOUT_MS = 20000` e `buildFitScoreRequest`, copiando `src/lib/ai/copy-review-config.ts:19-54` (usa `isGpt5Family` de `parser-config.ts`).
- `src/lib/agent/fit-scorer.ts` (novo, servidor) -- `scoreLeads({ leads: LeadRow[], briefing, icp, apiKey?, tenantId, executionId })` → `{ results: {fitScore, fitReason}[], source, attempted, usage }`. Usa o SDK `openai` direto, como `src/lib/ai/copy-reviewer.ts:18`, com prompt constante no módulo, validação zod e fail-open total. O log fica a cargo do step.
- `src/lib/agent/contextual-suggestions.ts:47-80` + `src/lib/agent/icp-briefing.ts:20-33` -- `TenantICP` ganha `painPoints: string` (`EMPTY_TENANT_ICP.painPoints = ""`). `readTenantICP` coage `icp.pain_points` (string, senão `""`). Atualizar os testes com `toEqual` em `__tests__/unit/lib/agent/contextual-suggestions.test.ts` e `icp-briefing.test.ts`, e os literais `TenantICP` em testes/rotas (rodar `typecheck`).
- `src/lib/agent/steps/search-leads-step.ts` -- `buildSearchOutput` (:220-277) passa a ser `async`, ou o score roda antes dele nos dois ramos (:136, :171). Ordem: mapear → pontuar (regras + LLM) → ordenar → cortar no autopilot → `cost.openai_fit_score`. A chave vem de `getInjectableServiceApiKey(this.tenantId, "openai", "OpenAI")` dentro de try/catch (erro de decrypt → só regras). `mapLeadRowToSearchLeadResult` (:51) não muda: o fetch-leads continua sem score. O score casa com o `LeadRow` pelo índice antes do map.
- `src/types/agent.ts:281-296` -- `SearchLeadResult` com `fitScore?: FitGrade | null` e `fitReason?: string | null`. `SearchLeadsOutput` com `fitScoring?`. Importar `FitGrade` de `fit-score-rules.ts` (type-only) ou definir o tipo aqui e reexportar.
- `src/lib/services/agent-cost-estimator.ts:127-130` -- `search_leads` com `skipSet.has("search_leads") ? 0 : 1 * prices.openai`. Testes em `__tests__/unit/lib/services/agent-cost-estimator.test.ts` e qualquer teste de total (plan/confirm) que suponha `search_leads = 0`.
- `src/components/agent/AgentLeadReview.tsx` -- `LeadPreview` (:28) com `apolloId?`, `fitScore?` e `fitReason?`. Coluna "Fit" no `TableHeader` (:548) e na linha (:555). `handleFetchMore` (:181-186): mesclar os scores antigos por `apolloId`, ordenar com `sortByFitGrade` e selecionar os Q primeiros. Badge: componente `Badge` de `@/components/ui/badge`.
- `src/lib/agent/lead-persistence.ts` -- `LeadRecord` (:100) com `fitScore`/`fitReason`. `dedupeBatch` (:286 e merge :376) propaga com `??`. Nova "Fase 6", depois da Fase 5 (:851-888): `runWithConcurrency` com `update({ fit_score, fit_reason, fit_scored_at })`, `.eq("tenant_id")` e `.eq("id")`, só para entradas persistidas com score (uma por id). `!allOk` → `console.warn("[lead-persistence] fit score nao gravado ...")`, sem `failOrDegrade`.
- `supabase/migrations/00070_add_lead_fit_score.sql` (novo) -- ver Always.
- Fluxo sem mudança (evidência): approve (`approve/route.ts:162-163`) grava `approvedLeads` com o objeto inteiro. `create-campaign-step.ts:858/866` faz `{ ...lead, icebreaker }`, que preserva `fitScore`.
- Testes novos/estendidos: `__tests__/unit/lib/agent/fit-score-rules.test.ts` (novo), `__tests__/unit/lib/agent/fit-scorer.test.ts` (novo, mock de `openai` como em `__tests__/unit/lib/ai/copy-reviewer.test.ts`), `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` (mockar `fit-scorer`/`readTenantICP`; a ordem e o corte do autopilot), `__tests__/unit/lib/agent/lead-persistence.test.ts` (Fase 6 e falha silenciosa), `__tests__/unit/components/agent/AgentLeadReview.test.tsx`, `agent-pricing.test.ts`, `agent-cost-estimator.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `agent-pricing.ts`, `fit-score-rules.ts`, `fit-score-config.ts`, `fit-scorer.ts` -- universo, regras, config e scorer com fail-open -- AC1/AC2.
- [x] `icp-briefing.ts`, `contextual-suggestions.ts` -- `painPoints` no ICP lido -- AC2.
- [x] `types/agent.ts`, `search-leads-step.ts` -- score, ordenação, corte depois da ordenação, `fitScoring`, custo e log -- AC1/AC2.
- [x] `agent-cost-estimator.ts` -- estimativa de `search_leads` -- AC1.
- [x] `AgentLeadReview.tsx` -- badge, justificativa, ordem e merge depois do fetch-leads -- AC3.
- [x] `lead-persistence.ts`, `00070_add_lead_fit_score.sql` -- propagação e Fase 6 best-effort -- AC2.
- [x] Testes: uma linha por cenário da matriz nos arquivos do Code Map. Os testes existentes continuam verdes, salvo as expectativas que esta story muda de propósito (perPage, estimativa de `search_leads`, forma do `TenantICP`).

**Acceptance Criteria:**
- Given um pedido de N leads, when a busca do agente roda, then a página pedida à Apollo é o universo de 3–5× N (limitado a 100) e o custo novo fica em no máximo 1 chamada de IA, logada em `api_usage_logs`.
- Given o universo, when o step termina, then cada lead do output tem A/B/C e uma justificativa de 1 linha, a lista sai ordenada A → B → C, e o lead aprovado leva o score até `persistApprovedLeads`, que o grava em `leads.fit_score`/`fit_reason` (depois da migration aplicada).
- Given a revisão de leads, when abre, then mostra badge e justificativa por lead, na ordem do score, com os N melhores pré-selecionados.
- Given falha do LLM, when o step roda, then os leads saem com score só por regras e o step termina com sucesso.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 21, false 3, maybe-false 2
- findings:
  - `medium` `patch` [blind] O LLM podia dar "A" a lead sem e-mail (o prompt proibia, o codigo nao checava), e ele subia para o topo e a pre-selecao — corrigido: "A" vira "B" quando `has_email !== true`, mantendo o motivo do LLM; teste novo.
  - `low` `patch` [blind] `fitReason` vindo do body do approve era gravado sem o teto de 120 caracteres — corrigido: `truncateFitReason` no `dedupeBatch` (vazio vira null); teste novo.
  - `low` `reject` [blind] Falta de Completion Notes com os 3 pontos — o fix e editar a spec; as Completion Notes estao na spec e os 3 pontos foram registrados.
  - `low` `reject` [blind] A Fase 6 sobrescreve o score de leads reusados — comportamento pedido na spec (inseridos e reusados): o score reflete a busca mais recente, que e a que levou o lead a campanha.
  - `low` `reject` [blind] O fetch-leads nao pontua os leads novos, que ficam depois dos C — caminho de expansao (raro no foco "poucos leads"); o fix exige pontuar no cliente sem `has_email` ou mexer na rota, que a spec mantem intacta.
  - `maybe-false` `defer` [blind] Chamada sem teto de tokens/reasoning pode estourar os 20s com 100 leads — se verdadeiro seria medium (latencia de 20s e so regras); resolve medindo num smoke real; registrado em deferred.
  - `low` `patch` [blind] Lista de senioridade sem formas comuns em portugues ("Diretora", "Socia") — corrigido: `diretora`, `socia`, `presidenta`, `superintendente`, `partner`, `lider`; testes novos.
  - `low` `patch` [blind] A descricao nova do `search_leads` perdeu os acentos no plano — corrigido para "1 chamada de IA (Fit Score); busca Apollo não consome créditos" (desvio consciente do texto literal da spec, que estava sem acento por engano); teste atualizado.
  - `low` `reject` [blind] `fitScoring` nao aparece na UI e o badge nao tem aria-label — a justificativa ja e texto visivel abaixo do nome; mostrar a origem nao e pedido.
  - `low` `patch` [blind] Regex de acentos escrita com caracteres combinantes invisiveis — corrigido: `/[\u0300-\u036f]/g`.
  - `false` `reject` [blind] A estimativa supoe que o LLM sempre roda — a estimativa do agente e teto ("ate") por desenho desde a 24.10; sem chave o real fica abaixo, nunca acima.
  - `low` `reject` [blind] O log da Fase 6 nao distingue causas — so afeta depuracao; o fix muda o contrato do `runWithConcurrency`.
  - `low` `reject` [blind] Texto livre da KB/briefing entra no prompt sem delimitador — so o proprio tenant escreve nesses campos e o efeito e mudar as notas dele mesmo; sem ganho de privilegio.
  - `low` `reject` [blind] Testes faltando (merge no dedupe, ICP lancando, ramo por dominios, `i` string, tooltip) — os relevantes viraram patch (merge no dedupe, `i` string); o resto cobre caminhos ja protegidos por try/catch ou cosmeticos.
  - `low` `reject` [edge] SDK da OpenAI com `maxRetries` padrao (2) pode cobrar ate 3 requests registrados como 1 — mesmo padrao do parser e do revisor; as tentativas ficam dentro do abort de 20s; a diferenca e de centavos.
  - `medium` `patch` [edge] LLM com "A" para lead sem e-mail — mesmo grupo do primeiro achado blind (corrigido).
  - `low` `patch` [edge] Entrada do LLM com `i` em string era descartada — corrigido: `z.coerce.number()`; teste novo.
  - `low` `patch` [edge] `fitReason` sem teto vindo do cliente — mesmo grupo do achado blind (corrigido).
  - `false` `reject` [edge] Badge com grade invalida do JSONB — o `previewData` so e escrito pelo step, que so grava A/B/C validados; o approve nao reescreve o output exibido.
  - `low` `reject` [edge] Claim "no maximo 1 chamada" x retries do SDK — mesmo grupo do achado de `maxRetries`.
  - `low` `patch` [verification-gap] Nada provava que `fitScore`/`fitReason` sobrevivem ao `create_campaign` ate o `persistApprovedLeads` — teste novo em `create-campaign-step.test.ts`.
  - `low` `patch` [verification-gap] O abort de 20s nao era verificado — teste novo com fake timers (signal passado, fallback para regras).
  - `low` `patch` [verification-gap] O merge do score entre duplicatas no `dedupeBatch` nao tinha teste — teste novo.
  - `low` `reject` [intent] Para N >= 34 o universo fica abaixo de 3N (teto de 100 da pagina Apollo) — limite da API; o foco da story e poucos leads, e o "Buscar Q leads" continua disponivel.
  - `low` `reject` [intent] As regras nao usam porte, setor e local — esses dados nao vem da `api_search` e ja sao filtros da busca (todos os leads teriam a mesma contribuicao); chegam ao LLM como contexto.
  - `low` `reject` [intent] Persistencia sem efeito em producao ate aplicar a migration e spec sem `operator_actions` — tratado na finalizacao: `status: awaiting-operator` com a migration e o smoke em `operator_actions`.
  - `false` `reject` [intent] So os leads aprovados recebem o score persistido — "lead persistido" sao exatamente os aprovados; os nao aprovados nao sao persistidos em `leads`.
  - `maybe-false` `defer` [intent] Sem checagem real da qualidade das notas do LLM — se verdadeiro seria medium; resolve com smoke real; registrado em deferred.

## Design Notes

- **Universo literal de 3–5× N:** para N ≤ 5, `min(5N, 25)` dá 5× N, e para N ≥ 9 dá 3× N; o 25 de hoje só vale enquanto cabe na faixa. Abaixo de 5 leads o universo encolhe em relação à 24.13 (N=2 → 10). Isso é o pedido da story: poucos leads, mas escolhidos entre poucos candidatos bons. Acima de N=33 o teto de 100 da página Apollo vence, e o usuário continua com o "Buscar Q leads".
- **Ordenar no servidor:** com a lista já ordenada, a pré-seleção "N primeiros" da 24.13, o corte do autopilot e o `previewData` passam a significar "N melhores" sem lógica nova no cliente.
- **Fase 6 separada do insert:** o código pode subir antes da migration sem quebrar a criação de campanha (ponto 3 do CLAUDE.md). Antes da migration, o update falha com coluna inexistente, só loga, e o score continua no output do step.
- **Prompt constante:** segue o precedente do revisor (24.9), fora do `promptManager`. O texto é de classificação, não de copy do cliente.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/lib/services __tests__/unit/components/agent/AgentLeadReview.test.tsx` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Os 3 pontos do cliente por análise do diff: webhook e `reply-sweep` não tocados; busca do agente com universo e ordem novos, sem filtro que remova lead; export e ativação não tocados; persistência com fase extra que não lança.

## Completion Notes

**O que pode mudar para o cliente:**
- Busca do agente (`search_leads`): página pedida à Apollo passa a ser o universo de 3–5× N (`resolveLeadsPerPage`; N<5 encolhe, ex.: N=2 → 10; N≥34 → 100). Sem N continua 25. Leads saem com `fitScore`/`fitReason`, ordenados A → B → C; nenhum lead é removido. Autopilot corta nos N melhores (depois da ordenação).
- Nova chamada de IA: 1 por execução do `search_leads` (`gpt-5.4-mini`, prompt constante em `src/lib/agent/fit-scorer.ts`, só cargo + empresa, sem nome/e-mail), logada em `api_usage_logs` (`openai`/`fit_score`). Sem chave OpenAI: sem chamada, sem log, custo 0. Falha: só regras, step segue.
- Leitura do ICP (`readTenantICP`, service-role) agora também no `search_leads` e devolve `painPoints`.
- Custo: estimativa de `search_leads` = 1 × openai (0 quando pulado); custo real conta `cost.openai_fit_score`.
- Revisão (`AgentLeadReview`): coluna "Fit" com badge e justificativa; merge de score por `apolloId` após o fetch-leads.
- Persistência (`persistApprovedLeads`): Fase 6 best-effort grava `fit_score`/`fit_reason`/`fit_scored_at`. Insert de leads inalterado. Antes da migration o update falha e só faz `console.warn`.
- Migration nova `supabase/migrations/00070_add_lead_fit_score.sql` (aditiva, idempotente) — **NÃO aplicada**; aplicar só com OK do Fabossi.
- Não tocados: rota `fetch-leads`, busca manual, webhook, `reply-sweep`, export/ativação, `pg_cron`, Edge Functions, secrets.

**Os 3 pontos (por análise do diff, sem smoke real):**
1. Campanhas rodando + webhook/`reply-sweep`: nenhum arquivo desses caminhos tocado.
2. Busca de novos leads: continua funcionando; muda o tamanho da página do agente e a ordem; o score nunca filtra; falha de LLM/ICP/chave degrada para regras. Busca manual intacta.
3. Criação de campanha e envio ao Instantly: sem trava nova; `export-step` mapeia campos explicitamente (score não vai ao Instantly); Fase 6 não lança nem marca `degraded`.

**Verificação:** `npm run lint` (0 erros), `npm run typecheck` e `npm run test:run` (443 arquivos, 8440 testes) verdes.

**Pós-revisão:** 9 patches (1 medium, 8 low). Verificação refeita: `npm run lint` (0 erros, 134 warnings ja existentes), `npm run typecheck` ok, `npm run test:run` 443 arquivos / 8447 testes verdes.

## Auto Run Result

Status: awaiting-operator

**Resumo:** o agente agora busca um universo de 3–5× N (teto de 100) e dá a cada lead um Fit Score A/B/C com justificativa de 1 linha, por regras deterministicas (cargo pedido/ICP, senioridade, e-mail disponivel) e, por cima, uma unica chamada de LLM barato (gpt-5.4-mini) contra o briefing, o ICP e as dores da KB. Os leads saem ordenados A → B → C, entao a revisao pre-seleciona os N melhores e o autopilot leva os N melhores. A revisao mostra badge e justificativa. Falha do LLM degrada para regras sem travar. O score viaja ate `persistApprovedLeads` e e gravado em `leads` numa fase best-effort, que so passa a ter efeito depois da migration 00070.

**Arquivos alterados:**
- `src/lib/agent/fit-score-rules.ts` (novo) — regras puras, ordenacao estavel, contagem.
- `src/lib/agent/fit-scorer.ts` (novo) — chamada unica de LLM, merge por lead, fail-open, "A" sem e-mail vira "B".
- `src/lib/ai/fit-score-config.ts` (novo) — modelo, timeout e request (SSOT).
- `src/lib/agent/steps/search-leads-step.ts` — score, ordenacao, corte do autopilot depois da ordem, `fitScoring`, custo e log `fit_score`.
- `src/lib/agent/agent-pricing.ts` — universo de 3–5× N; custo real do `search_leads` conta `openai_fit_score`.
- `src/lib/services/agent-cost-estimator.ts` — estimativa de 1 chamada de IA no `search_leads`.
- `src/lib/agent/icp-briefing.ts`, `src/lib/agent/contextual-suggestions.ts` — `painPoints` no ICP lido.
- `src/types/agent.ts` — `FitGrade`, `fitScore`/`fitReason` no `SearchLeadResult`, `fitScoring`.
- `src/components/agent/AgentLeadReview.tsx` — coluna Fit, justificativa, ordem e merge apos o fetch-leads.
- `src/lib/agent/lead-persistence.ts` — propagacao do score e Fase 6 best-effort.
- `supabase/migrations/00070_add_lead_fit_score.sql` (novo, NAO aplicada) — 3 colunas nullable em `leads`.
- Testes: `fit-score-rules`, `fit-scorer` (novos); `search-leads-step`, `lead-persistence`, `create-campaign-step`, `AgentLeadReview`, `agent-pricing`, `agent-cost-estimator`, `contextual-suggestions`, `icp-briefing`, `execution-plan`.

**Revisao:** 28 achados (0 high, 2 medium, 21 low, 3 false, 2 maybe-false). Patches: 9 entradas (1 medium: "A" sem e-mail; 8 low: teto do `fitReason`, senioridade em portugues, acentos da estimativa, regex com escapes, `i` em string, e 3 testes novos de verificacao). Deferidos: 2 (latencia real da chamada e qualidade real das notas, ambos medium nao verificados). Rejeitados: 12 linhas low e 3 false, com os motivos no Triage Log.

**Follow-up review recomendado:** false — so 1 entrada medium corrigida, nenhuma high.

**Verificacao:** `npm run lint` (0 erros), `npm run typecheck` ok, `npm run test:run` 443 arquivos / 8447 testes verdes. Todas as linhas da matriz I/O tem teste passando.

**Verificacao pela interface (/verify):** tentada antes do commit e nao concluida. Login ok em `localhost:3000/agent`, mas o envio da mensagem pelo Playwright nao gerou nenhuma chamada a `/api/agent/briefing/parse` em 3 tentativas: o texto ficava no input ou se perdia. Parei sem insistir. A tela do plano e a revisao com badges seguem cobertas so por testes de componente. Obs.: ja havia outro processo `node` (PID 2460) escutando na porta 3000 antes da sessao, entao o servidor testado pode nao ser o desta branch.

**Pendente do operador (operator_actions):** aplicar a migration 00070 no Supabase de producao e fazer o smoke do agente.

**Riscos residuais:** a latencia e a qualidade do LLM real nao foram medidas (deferidos). Ate a migration ser aplicada, o score aparece na revisao mas nao e gravado em `leads` (cada execucao loga um aviso). A busca do agente muda o tamanho da pagina (N < 5 encolhe; N=2 → 10) e a ordem dos leads. Cada busca do agente com chave OpenAI custa 1 chamada de IA a mais (R$ 0,02 no preco padrao).

## Smoke em produção (2026-10-26)

Deploy via PR #15 (merge `824785c` na `main`, Vercel prod OK). Migration 00070 aplicada e conferida antes. Fabossi rodou o agente em produção no modo Guiado (execução `fbe21d05-9f94-466b-a521-48dc45449f3a`, "CISO de São Paulo, traga 2 leads"). Conferido na tela e no banco com `scripts/db-ro.sh`:

- Revisão de leads: "2 de 85 leads selecionados" (24.13 ok), coluna Fit com badge e justificativa de 1 linha em cada lead.
- `api_usage_logs` da chamada do Fit Score: `stepType: search_leads`, `fitSource: "llm"`, `llmScored: 10`, `gpt-5.4-mini`, **1,9 s** (o deferido de latência fica respondido para N=2; universo maior não medido).
- `leads.fit_score`, `fit_reason` e `fit_scored_at` gravados nos 2 leads aprovados (Fase 6 funcionando).
- `cost_actual`: `search_leads` R$ 0,02, `create_campaign` R$ 0,58, `export` R$ 0, total R$ 0,60; mensagem "Custo da execução — estimado R$ 0,60 · real R$ 0,60".
- Todas as notas saíram **B** ("cargo bate, mas empresa de perfil incerto"): o ICP do tenant não tem porte/setor/região preenchidos, então o LLM não tem como dar A. Qualidade das notas com ICP completo segue não verificada (deferido continua aberto).

**Efeito no cliente:** a etapa "Criação de Campanha" foi aprovada por engano, e o export criou no Instantly a campanha "Campanha Outbound - 26/10/2026" (`21a63421-af69-4cf6-97d3-0bf8539b6b71`, 2 leads). **Não foi ativada:** a execução foi encerrada com "Ativar Depois" (1 conta de envio do Fabossi anexada, step 5 `skipped`, execução `completed`, `activationDeferred: true`), e Fabossi apagou a campanha no Instantly. Os 3 pontos seguem funcionando: a busca de leads e o export rodaram normalmente neste smoke; campanhas rodando não foram tocadas.

**Backlog anotado:** depois do export, o card de ativação só oferece "Ativar Campanha" ou "Ativar Depois" (este exige ≥1 conta marcada), sem saída de cancelar. Não mexido agora por estar no caminho do Instantly.

## Operator Confirmation

Confirmed 2026-10-26: the external actions this story owed were carried out.

- Aplicar no SQL Editor do Supabase de produção (kdgogyqyaxncqoyklyxx) a migration supabase/migrations/00070_add_lead_fit_score.sql (só aditiva: 3 colunas nullable em leads).
- Depois de aplicar, fazer o smoke do agente ("CISO de São Paulo", 2 leads, parar antes de gastos/ativação) e conferir no gate os badges A/B/C com justificativa e, após aprovar, leads.fit_score/fit_reason preenchidos.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
