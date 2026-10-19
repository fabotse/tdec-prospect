---
title: '24.2 — Execução protegida contra cobrança dupla'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
baseline_revision: '65b7764a16ab6c8eaaf8d80f87dd85db756fce52'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Apos F5 numa execucao em andamento, mensagem livre fora do ajuste e so persistida e ninguem responde.
    evidence: |-
      O guard da 24.2 tira essa mensagem do fluxo de briefing (correto pela AC), mas cai no mesmo caminho "briefing confirmado -> so persiste" que ja existia sem resposta (AgentChat.tsx, fim do handleSendMessage). A conversa sem beco sem saida e escopo da 24.4.
    location: >-
      src/components/agent/AgentChat.tsx handleSendMessage
    severity: low
  - summary: >-
      O carimbo `rejected: true` do POST /reject ignora o `{ error }` retornado pelo supabase-js, entao uma falha nessa escrita passa em silencio.
    evidence: |-
      Codigo da 22.13 (reject/route.ts, update do metadata do gate sem checar `error`; so excecao lancada e capturada). Com a 24.2 o carimbo passou a liberar o PATCH de briefing e o execute do ajuste: se a escrita falhar, o chat entra em ajuste mas toda tentativa toma 409 ("responda sim para eu tentar de novo") sem nenhum log. Degradacao segura (sem cobranca), mas invisivel.
    location: >-
      src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts:177
    severity: low
---

<intent-contract>

## Intent

**Problem:** Um retry do export cria uma segunda campanha órfã no Instantly (o `saveFailure` apaga o output parcial e o step sempre chama `createCampaign`). A rota `POST .../steps/[n]/execute` não olha o status do step, então um step `completed`/`approved` roda e cobra de novo. O `PATCH .../briefing` não olha o status da execução, então após F5 uma mensagem livre + "sim" sobrescreve o briefing de uma execução já paga.

**Approach:** Guardas no servidor (409) nas duas rotas, com uma definição única de step "rejeitado". Export idempotente: o `externalCampaignId` fica gravado no output parcial do step logo após a criação e sobrevive à falha, e o retry reaproveita a campanha e sobe só os leads que faltam. No chat, uma execução já confirmada nunca cai no fluxo de briefing.

## Boundaries & Constraints

**Always:**
- Step "rejeitado" = `agent_steps.status = 'awaiting_approval'` **e** a mensagem `approval_gate` mais recente daquele step tem `metadata.rejected === true` (carimbo durável da 22.13, escrito pelo `POST /reject`). O execute aceita `pending`, `failed` e rejeitado. Esta é a mesma regra que o `AgentChat` já usa para reentrar no ajuste.
- O PATCH de briefing aceita a execução `pending`. Fora disso, aceita **só** a exceção do ajuste pós-rejeição (22.13/22.14): execução `running`/`paused` com pelo menos um step rejeitado. Sem isso, a feature de ajuste (já em produção) quebraria, e o próprio FR14 mantém a re-execução de step `rejected`.
- O 409 sai antes de qualquer chamada externa ou escrita. Body no padrão `{ error: { code, message } }` das rotas vizinhas.
- O output parcial é aditivo: o `saveFailure` grava `{ ...parcial, error }`. Quem lê `output.error` continua funcionando.
- Prod-safe (CLAUDE.md): sem migration, sem cron, sem Edge Function, sem secret.

**Never:**
- Não mexer em `src/lib/services/instantly.ts` (caminho compartilhado com o export manual). Em especial, não ligar `skip_if_in_campaign`, que filtra leads presentes em *outras* campanhas.
- Não criar status `rejected` no enum nem tocar a resolução de `previousStepOutput` do orchestrator.
- Não mexer em TTL/sweeper (24.1), no botão "Tentar novamente" (24.3) nem nas respostas do chat pós-briefing (24.4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export: retry após falha no upload | step `failed`, output `{ externalCampaignId:"c1", error }` | `createCampaign` NÃO é chamado. Lista os leads da `c1` e sobe só os e-mails ausentes. Output final com `externalCampaignId:"c1"` | Falha ao listar leads → step falha (nada criado), parcial preservado |
| Export: todos os leads já estão na campanha | parcial `c1`, todos os e-mails já na `c1` | Não chama `addLeadsToCampaign`. Sucesso com `leadsUploaded` = total presente | — |
| Export: primeira execução | output null | Cria a campanha e grava `{ externalCampaignId, campaignName }` no step **antes** de subir os leads | Erro ao gravar o parcial → log, segue (campanha já existe) |
| Execute: step não executável | step `completed`/`approved`/`running`/`skipped`, ou `awaiting_approval` sem carimbo `rejected` | 409 `STEP_NOT_EXECUTABLE`, orchestrator não é instanciado | — |
| Execute: step rejeitado | `awaiting_approval` + gate mais recente `rejected:true` | Executa (ajuste 22.13 intacto) | — |
| Clique duplo | dois POSTs no step `pending`, o 1º já concluiu | O CAS do `base-step` só reivindica a partir de `pending`/`failed`/`awaiting_approval`. O 2º recebe 409 sem chamada externa | — |
| PATCH em execução em andamento | execução `running`/`paused` sem step rejeitado, ou terminal | 409 `EXECUTION_NOT_PENDING`, briefing intacto | — |
| PATCH de ajuste pós-rejeição | `running` + step rejeitado | 200 com merge (como hoje) | — |
| Chat após F5 | execução reatachada `running`/`paused`, sem ajuste ativo, mensagem livre | Mensagem só persistida, sem `processBriefing`/`saveBriefing` | — |

</intent-contract>

## Code Map

- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` -- o guard terminal fica em :87. O guard de status do step entra logo depois e antes do `readServiceApiKey` (:103).
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` -- leitura em :127 (`select("briefing")` → incluir `status`) e update em :157 (incluir CAS de status e devolver 409 com 0 linhas, via `.maybeSingle()`).
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts:150-185` -- onde o carimbo `metadata.rejected` é escrito (gate mais recente por `metadata->>stepNumber` + `metadata->>messageType = approval_gate`, `order created_at desc limit 1`). Reusar a mesma query. Somente leitura.
- `src/lib/agent/steps/base-step.ts` -- CAS em :297-318 (`.neq("status","running")`). `saveFailure` em :240 sobrescreve `output` com `{error}`.
- `src/lib/agent/steps/export-step.ts:154-189` -- `createCampaign` incondicional seguido de `addLeadsToCampaign`.
- `src/lib/services/tracking.ts:288` `TrackingService.getLeadTracking({ apiKey, externalCampaignId })` -- lista os leads da campanha (`leadEmail`) com paginação. Reusar para o diff.
- `src/components/agent/AgentChat.tsx` -- `handleSendMessage` em :713, roteamento de briefing em :756. `isPostConfirmExecution` em :914 é definido depois do callback e precisa subir.
- `src/lib/agent/client-utils.ts:51` -- documenta os 409 pré-orchestrator (`alreadyReported:false`). Atualizar o comentário.
- Testes: `__tests__/unit/api/agent/executions-steps-execute.test.ts`, `__tests__/unit/api/agent/briefing-update.test.ts`, `__tests__/unit/lib/agent/steps/export-step.test.ts`, `__tests__/unit/lib/agent/steps/base-step.test.ts`, `__tests__/unit/components/agent/AgentChat.test.tsx`.

## Tasks & Acceptance

**Execution:**
- `src/lib/agent/step-guards.ts` (novo) -- `isStepRejected(supabase, executionId, stepNumber)` e `hasRejectedStep(supabase, executionId)` (steps `awaiting_approval` × `isStepRejected`). Erro de query = `false` (fail-closed). -- fonte única da regra de "rejeitado".
- `.../execute/route.ts` -- ler `agent_steps.status` do alvo. Se não for `pending`/`failed`/rejeitado → 409 `STEP_NOT_EXECUTABLE` com o status atual na mensagem. Step inexistente segue para o orchestrator (404 lógico já existente). -- AC2.
- `.../briefing/route.ts` -- `pending` → update com `.eq("status","pending")`. `running`/`paused` + `hasRejectedStep` → update com `.in("status",["running","paused"])`. Qualquer outro caso, ou 0 linhas atualizadas → 409 `EXECUTION_NOT_PENDING`. -- AC3.
- `src/lib/agent/steps/base-step.ts` -- (a) CAS com `.in("status",["pending","failed","awaiting_approval"])` no lugar de `.neq("status","running")`, mantendo o código `STEP_ALREADY_RUNNING` e ajustando a mensagem ("em execução ou já concluída"). (b) `protected recordPartialOutput(executionId, data)`: guarda em memória e grava `output` no step, checando `{error}` (erro → log, sem lançar). (c) `saveFailure` grava `{ ...partialOutput, error }`. -- base reutilizável pela 24.3.
- `src/lib/agent/steps/export-step.ts` -- antes de criar, ler o próprio `agent_steps.output` (erro de leitura → lança). Se houver `externalCampaignId` string, pular `createCampaign`, listar os leads via `TrackingService.getLeadTracking`, subir só os e-mails ausentes (comparação case-insensitive) e pular o upload se não faltar nenhum. Senão, criar e chamar `recordPartialOutput({ externalCampaignId, campaignName })` antes do upload. Custo no reuso: `instantly_create: 0`, `instantly_leads` = só os novos. `leadsUploaded` = já presentes + novos. -- AC1.
- `src/components/agent/AgentChat.tsx` -- mover `isPostConfirmExecution` para antes de `handleSendMessage`. Rotear para `processBriefing` só se `briefingState.status !== "confirmed" && !isPostConfirmExecution`, e incluir nas deps. -- AC3 (chat).
- `src/lib/agent/client-utils.ts` -- comentário: incluir `STEP_NOT_EXECUTABLE` entre os 409 pré-orchestrator.
- Testes (arquivos do Code Map) -- cobrir cada linha da I/O Matrix. RED provado contra o código atual nos casos de export-retry, execute-409 e PATCH-409.

**Acceptance Criteria:**
- Given o step de export já criou a campanha no Instantly (id no output parcial do step), when o export é reexecutado após falha, then reaproveita a campanha existente e só completa o que faltou (subir leads), sem criar outra.
- Given a rota `POST .../steps/[n]/execute`, when o step alvo está `completed`, `approved`, `running` ou `awaiting_approval` (não rejeitado), then responde 409 e não executa nada.
- Given a rota `PATCH .../briefing`, when a execução não está `pending` (fora do ajuste pós-rejeição), then responde 409 e o briefing não é sobrescrito.
- Given uma execução em andamento reatachada após F5, when o usuário envia mensagem livre fora do ajuste, then ela não é tratada como briefing novo.
- Given o fluxo de ajuste pós-rejeição (texto ou chip), when o usuário confirma o ajuste, then o PATCH e a re-execução continuam funcionando como na 22.13/22.14.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 25 findings — high 0, medium 4, low 11, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) Rejeitar o export reaproveita a campanha antiga — o gate do export (`AgentActivationGate`) nao tem rejeitar, e as entradas do export (nome e e-mails do create_campaign aprovado) nao mudam numa re-execucao, entao reaproveitar e o correto.
  - `[low]` `[reject]` (blind) Campanha apagada no Instantly deixa o retry preso — exige que alguem apague a campanha no meio de uma falha (raro), e a correcao exige ramo de fallback novo. Saida existente: "Nova conversa".
  - `[low]` `[reject]` (blind) O custo do create da 1a tentativa falha nao e registrado — o Instantly e cobrado por plano (o `instantly_create` e contador), e custo real e escopo da 24.10.
  - `[low]` `[patch]` (blind) O comentario de step-guards diz "mesma regra do AgentChat", mas o AgentChat olha o gate mais novo da execucao — comentario corrigido para "equivalente server-side, por step".
  - `[low]` `[defer]` (blind) Mensagem livre apos F5 fica sem resposta — beco sem saida ja existente no caminho pos-confirmacao, escopo da 24.4. Foi para deferred.
  - `[low]` `[reject]` (blind) A excecao do PATCH vale para step rejeitado de qualquer tipo, e ha TOCTOU entre o check e o update — todo step rejeitado e um estado de ajuste legitimo (o ajuste do create_campaign tambem PATCHa). A janela exige o mesmo usuario re-executar em outra aba no mesmo instante, e a correcao exige RPC/transacao.
  - `[false]` `[reject]` (blind) O CAS do base-step aceita `awaiting_approval` nao rejeitado para quem chama fora da rota — `orchestrator.executeStep` so e chamado pela rota execute (grep em src), que aplica a regra antes.
  - `[low]` `[patch]` (blind) As mensagens de 409 mostram o enum cru e o STEP_ALREADY_RUNNING manda "aguardar" step concluido — reescritas em portugues simples, codigos mantidos, testes atualizados.
  - `[medium]` `[patch]` (blind) step-guards sem testes proprios — criado `__tests__/unit/lib/agent/step-guards.test.ts` (7 casos). Agrupado com o 2o gap da verification-gap.
  - `[false]` `[reject]` (blind) Falta teste de regressao do ajuste (AC5) com a mudanca do chat — o ramo de ajuste retorna ANTES do novo guard (AgentChat.tsx handleSendMessage), e os testes da 22.13 (`adjusting("describe"/"confirm")`) seguem verdes.
  - `[low]` `[reject]` (blind) A spec nao tem Completion Notes nem smoke real — a correcao seria editar a spec. As notas dos 3 pontos do CLAUDE.md foram registradas no Auto Run Result, e o smoke real fica atrelado ao fim do Marco 1.
  - `[low]` `[patch]` (blind) `readExistingCampaignId` roda depois de chamadas externas — movido para antes da busca da API key e do `listAccounts`. O teste confirma que nada externo roda em erro de leitura.
  - `[false]` `[reject]` (edge) Export rejeitado reaproveita uma campanha velha com sequencias ajustadas — mesma refutacao do 1o item: nao ha rejeicao de export na UI, e as sequencias vem do step anterior aprovado (imutavel).
  - `[low]` `[reject]` (edge) Campanha inexistente no Instantly trava o retry — mesmo motivo do 2o item.
  - `[false]` `[reject]` (edge) Campanha com mais de 5000 leads trunca o diff — a campanha reaproveitada foi criada pelo proprio export e so recebe os leads dele (dezenas, nunca 5000).
  - `[false]` `[reject]` (edge) O campaignName pode divergir no reuso — vem do output do create_campaign aprovado, e o execute agora da 409 para re-executar step aprovado, entao nao muda.
  - `[low]` `[reject]` (edge) TOCTOU entre `hasRejectedStep` e o update do PATCH — mesmo motivo do 6o item.
  - `[false]` `[reject]` (edge) O CAS aceita `awaiting_approval` para quem chama fora da rota — mesmo motivo do 7o item.
  - `[false]` `[reject]` (edge/claim) A afirmacao "ajuste pos-rejeicao segue funcionando" e falsa por causa do export — o export nao e rejeitavel na UI, e os ajustes de busca/campanha nao passam pelo reuso.
  - `[false]` `[reject]` (edge/claim) O reuso dispara fora da falha — so e alcancavel apos falha (o export guiado nao tem rejeicao, e `approved`/`completed` tomam 409 antes).
  - `[medium]` `[patch]` (verification-gap) Excecao do PATCH sem teste para `paused` — o teste agora roda com `it.each(["running","paused"])` e checa 200 + merge.
  - `[medium]` `[patch]` (verification-gap) step-guards sem teste proprio, loop multi-step nunca exercitado — novo arquivo de testes cobre 2 steps (so o 2o rejeitado), erros de query e step_number nao numerico.
  - `[medium]` `[reject]` (verification-gap, other) Apos uma re-execucao de ajuste FALHAR, descrever OUTRO ajuste toma 409 no PATCH — real, mas a propria AC exige 409 para PATCH com a execucao nao `pending`. A excecao preserva so o ajuste de step rejeitado. O usuario ainda pode responder "sim" (o execute aceita `failed`), que re-tenta com o ajuste ja salvo, sem cobranca. Fica nos riscos residuais para a 24.3/24.4.
  - `[false]` `[reject]` (intent) A divergencia das ACs literais (AC2/AC3) — intencional e documentada. A leitura literal quebraria o ajuste 22.13/22.14 em producao, e o FR14 mantem `rejected` como executavel.
  - `[low]` `[reject]` (intent) Os testes so usam mocks, sem smoke real nem notas dos 3 pontos — as notas estao no Auto Run Result. O smoke real e do checkpoint do Marco 1 (e o export real nao pode ser smokado sem criar campanha no Instantly do cliente).

### 2026-10-16 — Review pass (follow-up)
- verdicts: 28 findings — high 0, medium 3, low 13, false 12, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) No retry, se `getServiceApiKey` ou `listAccounts` falhar, o `partialOutput` ainda e null e o `saveFailure` grava so `{ error }`: o `externalCampaignId` some e o retry seguinte cria uma 2a campanha — confirmado (o `recordPartialOutput` do reuso so rodava depois desses passos). Fix: o parcial e re-registrado logo apos a leitura. Teste novo `retry que falha em API key/listAccounts` (RED no codigo antigo, verde no novo). O subcaso "a propria leitura falha e o saveFailure apaga o id" fica de fora: exige erro transitorio na leitura e escrita ok logo depois, e a correcao exigiria mudar o merge do saveFailure.
  - `[false]` `[reject]` (blind) Rejeitar o export reaproveita a campanha antiga — carried: o `AgentActivationGate` segue sem rejeitar (grep sem `reject`), entao nao ha re-execucao de export rejeitado.
  - `[low]` `[reject]` (blind) Campanha apagada no Instantly trava o retry — carried: raro, correcao exige ramo de fallback novo. Saida existente: "Nova conversa".
  - `[false]` `[reject]` (blind) Diff de leads truncado em 5000 — carried: a campanha reaproveitada so tem os leads do proprio export.
  - `[low]` `[reject]` (blind) Custo do create da 1a tentativa nao registrado; `duplicatedLeads`/`invalidEmails` so da ultima tentativa — carried (Instantly cobrado por plano, custo real e da 24.10). Os contadores sao cosmeticos.
  - `[false]` `[reject]` (blind) CAS aceita `awaiting_approval` nao rejeitado para outro chamador — carried: `executeStep` so e chamado pela rota execute.
  - `[low]` `[reject]` (blind) Mensagem/codigo diferentes entre rota e CAS, texto "em andamento ou concluida" para step aguardando aprovacao, bolha num auto-trigger duplicado — a bolha e o desenho do `client-utils` (409 pre-orchestrator e mostrado), e antes o duplicado re-executava e cobrava. Texto impreciso num caso raro; ajustar exige ramo novo.
  - `[false]` `[reject]` (blind) O 409 do PATCH mostra o enum cru e o cliente nao trata — o texto do servidor nunca chega ao usuario: `saveBriefing` mostra toast fixo e o ajuste usa frase fixa (AgentChat.tsx).
  - `[low]` `[reject]` (blind) Janela antes do reattach resolver apos F5 — exige digitar antes da validacao de montagem terminar, e o 409 do servidor mantem o briefing intacto.
  - `[low]` `[reject]` (blind) N+1 no `hasRejectedStep` — no maximo 5 steps, consultas pequenas; sem dano pratico.
  - `[low]` `[reject]` (blind) Falta checklist prod-safe no diff — carried: as notas dos 3 pontos estao no Auto Run Result (reescritas nesta passada).
  - `[false]` `[reject]` (blind) O output parcial fica visivel com o step `running`/`failed` — o orchestrator so le `output` de steps `completed`/`approved` (orchestrator.ts:149) e o gate le o `previewData` da mensagem, nao o output do step.
  - `[false]` `[reject]` (edge) Export rejeitado reaproveita campanha velha — carried, mesma refutacao do 2o item.
  - `[low]` `[reject]` (edge) Campanha inexistente trava o retry — carried.
  - `[false]` `[reject]` (edge) Truncagem em 5000 — carried.
  - `[low]` `[reject]` (edge) TOCTOU entre `hasRejectedStep` e o update do PATCH — carried.
  - `[medium]` `[reject]` (edge) Apos re-execucao de ajuste falhar, novo ajuste toma 409 — carried: a AC exige 409 fora de `pending`; o "sim" segue re-tentando sem cobranca. Risco residual para 24.3/24.4.
  - `[low]` `[reject]` (edge/claim) A task fala em "status atual na mensagem" do 409 e a mensagem nao traz — mudanca deliberada da 1a passada (mensagem em portugues simples); a correcao seria editar a spec.
  - `[false]` `[reject]` (edge/claim) Reuso dispara apos rejeicao — carried, export nao e rejeitavel.
  - `[low]` `[patch]` (verification-gap) Filtros `execution_id`/`step_number` da leitura do step alvo no execute nunca assertados — asserts adicionados no teste `24.2: step '%s' executa normalmente`.
  - `[medium]` `[patch]` (verification-gap) Leitura do output anterior no export sem assert de escopo — asserts de `select("output")`, `execution_id` e `step_number` adicionados no teste de retry.
  - `[low]` `[patch]` (verification-gap) Ramo "leitura ok, update com erro" do PATCH nunca exercitado — teste novo `leitura ok e update com erro de banco -> 500 (nao 409)`.
  - `[low]` `[defer]` (verification-gap, other) Carimbo `rejected` do /reject ignora o `{ error }` — confirmado no reject/route.ts:177, codigo da 22.13 (pre-existente), agora com peso maior. Foi para `deferred`.
  - `[false]` `[reject]` (intent) Reuso do export na re-execucao pos-rejeicao — o export nao tem rejeitar na UI.
  - `[false]` `[reject]` (intent) Clique duplo simultaneo recebe `STEP_ALREADY_RUNNING` apos o orchestrator — a linha da matriz atribui o caso ao CAS e pede so 409 sem chamada externa, o que o base-step garante (teste em base-step.test.ts).
  - `[false]` `[reject]` (intent) Regra de rejeitado do servidor nao e o mesmo codigo do AgentChat — o gate mais recente da execucao rejeitado e tambem o mais recente do proprio step, entao o servidor nunca recusa um ajuste que o chat abriu.
  - `[low]` `[reject]` (intent) Testes so com mocks — carried: smoke real do export criaria campanha no Instantly do cliente.
  - `[false]` `[reject]` (intent) Decisoes que a intencao deixa abertas (step inexistente, 500 de leitura, fail-closed) — descritivo, nenhum dano apontado.

## Design Notes

- **Por que a exceção no PATCH:** a leitura literal ("execução não `pending` → 409") mataria o ajuste pós-rejeição, que PATCHa uma execução `running`. O FR14 mantém `rejected` como executável, então a intenção é preservar esse fluxo. O defeito nº 7 da análise (F5 + "sim") não tem step rejeitado e cai no 409.
- **Por que diff de leads e não `skip_if_in_campaign`:** essa flag vale para qualquer campanha e foi desligada de propósito depois da 7.2. Ligá-la seria um filtro novo no caminho até o Instantly (proibido pelo CLAUDE.md).
- **Residual conhecido:** o carimbo `rejected` é best-effort no `/reject`. Se ele falhar, a re-execução do ajuste toma 409 e o usuário precisa rejeitar de novo. É uma degradação segura, porque não cobra.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/api/agent __tests__/unit/lib/agent/steps __tests__/unit/components/agent/AgentChat.test.tsx` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: 0 erros de lint, typecheck limpo, suíte verde

## Auto Run Result

Status: done

**Resumo:** Export do agente idempotente: o `externalCampaignId` e gravado como output parcial e sobrevive ao `saveFailure`, e o retry reaproveita a campanha e sobe so os e-mails que faltam. `POST .../execute` responde 409 `STEP_NOT_EXECUTABLE` fora de `pending`/`failed`/rejeitado, e o CAS do base-step so reivindica estados executaveis. `PATCH .../briefing` responde 409 `EXECUTION_NOT_PENDING` fora de `pending`, exceto no ajuste pos-rejeicao, com CAS de status. No chat, uma execucao ja confirmada nunca volta ao fluxo de briefing.

**Passada de follow-up (2026-10-16):** um furo real fechado. No retry, se a API key ou o `listAccounts` falhassem, o id salvo se perdia e o retry seguinte criaria uma 2a campanha. Agora o parcial e re-registrado logo apos a leitura. Tambem entraram 3 testes que faltavam (escopo das leituras e o ramo de erro do update do PATCH).

**Arquivos alterados (story inteira):**
- `src/lib/agent/step-guards.ts` (novo) -- regra unica de step rejeitado, fail-closed.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` -- guard de status do step alvo (409).
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` -- guard de status da execucao + excecao de ajuste + CAS (409).
- `src/lib/agent/steps/base-step.ts` -- CAS por estados executaveis, `recordPartialOutput`, `saveFailure` aditivo.
- `src/lib/agent/steps/export-step.ts` -- export idempotente. Nesta passada: parcial re-registrado logo apos a leitura.
- `src/components/agent/AgentChat.tsx` -- `isPostConfirmExecution` bloqueia o briefing.
- `src/lib/agent/client-utils.ts` -- comentario dos 409 pre-orchestrator.
- Testes: execute, briefing-update, export-step, export-preview, base-step, AgentChat, step-guards. Nesta passada: export-step (+2 casos, asserts de escopo), execute (asserts de escopo), briefing-update (+1 caso).

**Review (follow-up):** 28 findings. 4 patches (medium 2, low 2): perda do id no retry e 3 lacunas de teste. 1 defer (low: carimbo `rejected` do /reject ignora `{ error }`, codigo da 22.13). 23 rejeitados, cada um com o motivo no Review Triage Log (12 false, 10 low, 1 medium vetado pela propria AC).

**Follow-up review recomendado:** false. Passada de follow-up sem patch `high` (patched: high 0, medium 2, low 2).

**Verificacao:** `npm run lint` com 0 erros (134 warnings pre-existentes). `npm run typecheck` limpo. `npm run test:run`: 410 arquivos, 7627 testes passando, 2 skipped. O teste novo do retry falha no export-step antigo (2 falhas) e passa no novo.

**Completion Notes (CLAUDE.md, regra no 1) -- por analise do diff, sem smoke real:**
- O que pode mudar para o cliente: so o agente TDec. Rotas `POST .../steps/[n]/execute` e `PATCH .../briefing`, steps do pipeline (base/export) e o chat do agente. Sem prompt, tabela, migration, job `pg_cron`, Edge Function ou secret.
- (1) Campanhas rodando + webhook + `reply-sweep`: intocados, nenhum arquivo desses caminhos foi alterado.
- (2) Busca de leads (Apollo e demais): intocada. Os steps de busca so passam pelo CAS mais estrito, que bloqueia apenas re-executar step ja concluido.
- (3) Criacao de campanha e envio ao Instantly: o export manual e o `instantly.ts` estao intocados. No agente, o 1o export segue identico. So o retry apos falha mudou: reaproveita a campanha em vez de criar outra orfa, com um `leads/list` de leitura. Nenhum filtro novo (`skip_if_in_campaign` segue false). O fix desta passada so muda QUANDO o id ja conhecido e gravado no step (uma escrita local mais cedo). Nenhum dos 3 pontos e afetado.

**Riscos residuais:**
- Apos uma re-execucao de ajuste que falha, um NOVO ajuste toma 409; o "sim" segue funcionando. Avaliar na 24.3/24.4.
- Carimbo `rejected` best-effort no `/reject` e silencioso (deferred): se falhar, o ajuste toma 409 sem log.
- Se a propria leitura do output anterior falhar (erro transitorio de banco) e a escrita da falha passar, o id salvo e sobrescrito e o retry seguinte cria outra campanha. Exige duas falhas de banco seguidas, em sentidos opostos.
- Campanha apagada manualmente no Instantly entre a falha e o retry deixa o retry falhando; a saida e "Nova conversa".
- `deferred-work.md` e `sprint-status.yaml` ficaram como o orquestrador deixou (nao commitados por esta passada, que nao escreve neles).

