---
baseline_commit: c798f084753ccae4f8b48ad571365a51edeebda3  # Story 22.14 committed -> baseline da 22.17
---

# Story 22.17: Conclusão da Execução Guiada — o agente precisa "terminar" depois da ativação real

Status: done

> **P1 — o produto parece travado no momento de maior sucesso.** A campanha ativa de verdade no Instantly, mas a UI segue "Processando..." para sempre: spinner eterno no botão, badges girando em steps concluídos, uma bolha vazia, e nenhuma mensagem final. No banco, a execução fica `running` eternamente.

## Story

As a usuário do Agente TDEC,
I want que, ao ativar a campanha de verdade, o agente conclua a execução — visual e de fato (banco) — com uma mensagem final clara do que foi criado,
so that eu saiba que deu certo e não fique olhando spinners infinitos justamente no desfecho do fluxo.

## Contexto (bug reproduzido ao vivo no smoke da 22.12, 2026-07-24)

Fluxo guiado novo executado pelo Fabossi: briefing → 1 lead → campanha → export → gate → conta `felipe@startveeflow.com` selecionada → **"Ativar Campanha"**. A campanha **"Campanha Outbound - 24/07/2026" ativou de verdade no Instantly** (sucesso da 22.12). Mas a UI:

- Botão "Ativar Campanha" com spinner girando **para sempre** (mesmo com "✅ Campanha ativada" exibido).
- Mensagens "Step 4 (export) concluido com sucesso" e "Step 5 (activate) concluido com sucesso" com badge **"Processando..."** + spinner.
- Uma **bolha vazia** (só timestamp) entre o resumo e a última mensagem.
- Nenhuma mensagem final de conclusão do pipeline.

**No banco (execução `28310579`, fixture viva deste bug):** status **`running`** (nunca completa), step 5 `activate` = **`awaiting_approval`**, `completed_at: null`, `result_summary: null`.

## Diagnóstico confirmado em código (4 causas independentes)

1. **Spinner eterno no botão (activate E defer):** [AgentActivationGate.tsx:74-104](../../src/components/agent/AgentActivationGate.tsx#L74) — `handleActivate` e `handleDefer` setam `setLoading("activate"/"defer")` e, **no caminho de sucesso, nunca chamam `setLoading(null)`** (só no `catch`, :102/:134). Como `loading === "activate"` fica true, o `<Loader2 animate-spin>` (:235/:245) gira eternamente. O `actionTaken` até renderiza o "✅" (:219-225), mas o spinner contradiz.

2. **Badge "Processando..." em step CONCLUÍDO:** [base-step.ts:231-248](../../src/lib/agent/steps/base-step.ts#L231) — `logStep` grava *"Step N (tipo) concluido com sucesso"* com `messageType: "progress"`; [AgentMessageBubble.tsx:85](../../src/components/agent/AgentMessageBubble.tsx#L85) renderiza label "Processando..." + [Loader2 animate-spin (:169-170)](../../src/components/agent/AgentMessageBubble.tsx#L169) para TODO `progress`. Conteúdo diz "concluído", visual diz "processando".

3. **ESTRUTURAL — execução guiada nunca completa na ativação real:** cadeia de 3 elos:
   - [base-step.ts:53-58](../../src/lib/agent/steps/base-step.ts#L53) — em `mode === "guided"`, TODO step (inclusive o 5/activate) vai para `awaiting_approval` + mensagem `approval_gate` *"Revise os resultados e aprove para continuar"*. Para o activate isso é conceitualmente errado: **a aprovação do usuário já aconteceu ANTES**, no gate de ativação (que é o approve do step 4/export com `activate: true`).
   - [AgentMessageBubble.tsx:125-164](../../src/components/agent/AgentMessageBubble.tsx#L125) — o `ApprovalGateRenderer` só tem cases `search_companies`/`search_leads`/`create_campaign`/`export`; `activate` cai no `default: return null` → **a bolha vazia** (o timestamp renderiza fora do condicional).
   - [orchestrator.ts:344](../../src/lib/agent/orchestrator.ts#L344) — o `completed` + `sendSummaryMessage` ("Pipeline concluido com sucesso!", [:502](../../src/lib/agent/orchestrator.ts#L502)) só rodam quando `stepNumber === totalSteps && mode !== "guided"`. O comentário diz "guided completa após o usuário aprovar o último step" — mas essa aprovação **não tem UI** (elo anterior) e não faz sentido. E [client-utils.ts:15](../../src/lib/agent/client-utils.ts#L15) (`currentStepNumber >= totalSteps → null`) garante que ninguém dispara nada depois. Resultado: `running` para sempre.
   - **Por que o defer NÃO sofre disso:** o ramo `activationDeferred` do orchestrator ([:222+](../../src/lib/agent/orchestrator.ts#L222)) faz skip + `completed` + resumo por conta própria, ANTES de chegar ao `run()` do step — por isso o smoke da 22.12 completou. Só a ativação REAL fica pendurada.

4. **Cosmético:** [activate-step.ts:110](../../src/lib/agent/steps/activate-step.ts#L110) — `"...ativa no Instantly com ${leadsCount} leads"` → "com 1 leads" (sem pluralização).

## Acceptance Criteria

1. **[Botões do gate concluem]** **Given** o gate de ativação **When** "Ativar Campanha" OU "Ativar Depois" conclui com sucesso **Then** o spinner do botão para (`setLoading(null)` também no sucesso) **And** o feedback "✅ Campanha ativada"/"⏸️ Ativacao adiada" e os botões desabilitados permanecem como hoje.

2. **[Execução guiada com ativação real COMPLETA]** **Given** modo guiado com ativação real **When** o step 5 (activate) conclui com sucesso **Then** o step vai para `completed` (NÃO `awaiting_approval` — a aprovação foi ex-ante no gate) **And** NENHUMA mensagem `approval_gate` é gravada para o activate (some a bolha vazia) **And** a execução vai para `completed` (com CAS `.neq("status","cancelled")` — padrão 22.10) **And** o resumo final do pipeline (`sendSummaryMessage`, o mesmo do autopilot) é enviado ao chat.

3. **[Mensagens de conclusão não "processam"]** **Given** a mensagem *"Step N (tipo) concluido com sucesso"* **Then** ela é gravada com um `messageType` novo de conclusão (ex.: `step_complete`) **And** a bolha renderiza label "Concluído" com ícone estático (ex.: check), sem spinner **And** mensagens `progress` legítimas ("Etapa X/Y: fazendo...") continuam com o visual atual **And** mensagens antigas no banco (gravadas como `progress`) continuam renderizando sem quebrar.

4. **[Pluralização]** **Given** o summary do activate **Then** "com 1 lead" / "com N leads" (e conferir o mesmo padrão nas demais strings tocadas).

5. **[Preservação — inegociável]** **Given** os fluxos existentes **Then** o caminho defer da 22.12 permanece byte-a-byte (skip + completed + resumo, flag `accountsAttachFailed` quando falha) **And** autopilot inalterado (já completa via [orchestrator.ts:344](../../src/lib/agent/orchestrator.ts#L344)) **And** steps intermediários guiados (1-4) continuam com `awaiting_approval` + gates normais **And** o CAS da 22.10 não é removido de nenhuma escrita.

6. **[Testes + smoke]** **Then** (a) RED provado: teste do fluxo guiado real hoje deixa execução `running`/step `awaiting_approval`; (b) GREEN: step 5 `completed` + execução `completed` + resumo final; (c) testes do gate (spinner limpa no sucesso) e da bolha (novo tipo renderiza "Concluído"); (d) **smoke real barato**: re-executar o step 5 da fixture `28310579` (campanha JÁ ativa no Instantly — verificar idempotência do `POST /activate` na doc/ao vivo antes; se não for idempotente, smoke via "Ativar Depois" num fluxo novo + validação do AC2 apenas por teste) → execução conserta para `completed` + resumo final aparece no chat.

## Tasks / Subtasks

- [x] **Task 1 — Fix do gate (AC1):** `setLoading(null)` no sucesso de `handleActivate` e `handleDefer` (ou `finally`). Teste: spinner some, botões seguem desabilitados via `actionTaken`.
- [x] **Task 2 — Step activate sem post-approval (AC2):** mecanismo overridável no `BaseStep` (ex.: `protected requiresPostApproval(): boolean { return true }`; `ActivateStep` → `false`). Em `run()`: guided + sem post-approval → `saveCheckpoint` (completed) e SEM `sendApprovalGateMessage`.
- [x] **Task 3 — Orchestrator completa guided no último step (AC2):** ajustar a condição de [orchestrator.ts:344](../../src/lib/agent/orchestrator.ts#L344) para completar também quando o último step guiado não requer post-approval (consultar `stepInstance`). NÃO tocar no ramo defer.
- [x] **Task 4 — messageType de conclusão (AC3):** novo membro na union `MessageType` ([types/agent.ts](../../src/types/agent.ts)); `logStep` grava `step_complete`; `AgentMessageBubble` renderiza label "Concluído" + ícone estático; fallback para mensagens antigas `progress` intacto.
- [x] **Task 5 — Pluralização (AC4):** [activate-step.ts:110](../../src/lib/agent/steps/activate-step.ts#L110).
- [x] **Task 6 — Testes RED→GREEN + smoke (AC5, AC6):** suíte cheia sem regressão (atenção aos testes da 22.12 no orchestrator — são o guardrail do defer); smoke conforme AC6d.

### Review Findings

> Code review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo full, baseline `c798f08`, 2026-07-26. **Acceptance Auditor: AC1–AC6 SATISFEITOS**, AC5 (preservação) confirmada por hunk-diff — o ramo defer da 22.12 (`orchestrator.ts:222-332`) não aparece em nenhum dos 2 hunks, os dois CAS `.neq("status","cancelled")` da 22.10 sobrevivem verbatim, e o autopilot reduz-se por álgebra à condição original (`requiresPostApproval()` nem é chamado). AC4 **parcialmente** cumprida (ver P1). Nenhum achado HIGH.

> **Resolução das decisões (Fabossi, 2026-07-26):** D1 → **deferida para a 22.18** (é o elo 1 do loop que aquela story fecha; consertar só aqui deixaria o caminho de recuperação órfão). D2 → **patch, opção 1** (guarda no `logStep` para os 5 steps, não só no ramo sem post-approval — dois comportamentos dentro do mesmo template method chaveados por um predicado de aprovação seria a máquina de estados torta que esta story rejeitou). D3 → **patch, só checar o `error`** (o no-op do CAS por cancel concorrente fica de fora). Os 4 patches foram aplicados. **Todo patch comportamental ganhou teste** — foi exatamente a crítica do auditor ao `try/catch` original ("a única mudança fora da lista de tasks embarca sem teste").

- [x] [Review][Decision→Defer] **`triggerNextStep` engole 4xx/5xx → "✅ Campanha ativada" pode ser mentira** — [client-utils.ts:18-21](../../src/lib/agent/client-utils.ts#L18) devolve a `Response` sem checar `ok`; o `.catch(() => {})` de [AgentActivationGate.tsx:103](../../src/components/agent/AgentActivationGate.tsx#L103) (e `:137`) só apanha rejeição de rede. Um `POST /steps/5/execute` que devolva 409/422/500 **antes** do orchestrator não escreve mensagem de erro em `agent_messages` — o card fica com "✅ Campanha ativada", botões travados, step 5 `pending` e a campanha parada no Instantly. Pré-existente (17.7) e fora do diff, **mas** a AC1 removeu o spinner que era a única pista (ainda que ruidosa) de que algo não fechou: o card agora lê como sucesso terminal. **RESOLVIDO → 22.18** (registrado no `deferred-work.md` com o fix proposto: checar `response.ok` e restaurar estado + erro, padrão já existente em [AgentChat.tsx:437](../../src/components/agent/AgentChat.tsx#L437)). Convergente Blind+Edge. Severidade: MEDIUM.
- [x] [Review][Decision→Patch] **`logStep` está FORA da guarda — falha nele reescreve o step `completed` para `failed` e a execução para `paused`, com a campanha já ativa** — [base-step.ts:53-67](../../src/lib/agent/steps/base-step.ts#L53): no template `run()`, `saveCheckpoint` (grava `completed`) é seguido de `logStep`; um insert que estoure ali cai no `catch`, que chama `saveFailure` (status `failed` + `output: {error}`, destruindo `activated: true`/`externalCampaignId`) e propaga para o `catch` do `executeStep`, que escreve `paused`. **É exatamente a justificativa que a story usou para embrulhar `sendSummaryMessage`** — só que o `logStep` fica uma camada ANTES e ficou desprotegido. **APLICADO** ([base-step.ts:60-75](../../src/lib/agent/steps/base-step.ts#L60)): `logStep` embrulhado em `try/catch` com `console.error`, para os 5 steps. Testes novos em `base-step-approval.test.ts`: (1) insert do log falha → `run()` resolve, step permanece `completed`, nenhum `failed` gravado; (2) **guardrail** — falha no `executeInternal` CONTINUA marcando `failed` (a guarda não pode engolir a falha que importa). Fonte: Edge Case Hunter. Severidade: MEDIUM.
- [x] [Review][Decision→Patch] **A escrita de `completed` não checa erro nem no-op do CAS — o resumo "Pipeline concluido com sucesso!" pode ir para uma execução cancelada** — [orchestrator.ts:358-365](../../src/lib/agent/orchestrator.ts#L358): o `update(...).neq("status","cancelled")` não é destruturado; supabase-js devolve `{error}` em vez de lançar, e o CAS casando **0 linhas** (cancel concorrente da 22.10) é indistinguível de sucesso. Nos dois casos o `sendSummaryMessage` roda logo abaixo. O irmão do ramo defer ([:285-302](../../src/lib/agent/orchestrator.ts#L285)) checa `completionError` e levanta `ORCHESTRATOR_COMPLETION_FAILED`; o caminho que a 22.17 tornou dominante, não. Pré-existente no autopilot, **recém-alcançável no guiado**. **APLICADO PARCIALMENTE, por decisão** ([orchestrator.ts:358-380](../../src/lib/agent/orchestrator.ts#L358)): `{ error: completionError }` destruturado → levanta `ORCHESTRATOR_COMPLETION_FAILED`, igual ao irmão do ramo defer; o resumo não é enviado quando a conclusão falha. Teste novo prova que `executeStep` rejeita, que nenhum "Pipeline concluido" vai ao chat e que o caminho de erro continua sendo `paused` (nunca `failed` direto). **Fora de escopo por decisão:** o no-op do CAS (cancel concorrente casando 0 linhas) segue indetectado — exigiria `.select()` no update. Convergente Blind+Edge. Severidade: MEDIUM.
- [x] [Review][Patch] **"com 1 leads" no resumo final que a AC2 acabou de tornar visível no guiado** — [orchestrator.ts:551](../../src/lib/agent/orchestrator.ts#L551) (`com ${leadsUploaded} leads`), `:542` (`${totalFound} contatos encontrados`), `:539`. Viola a cláusula "e conferir o mesmo padrão nas demais strings tocadas" da **AC4** combinada com a AC2: no próprio cenário do smoke (1 lead) o chat mostra "…ativa no Instantly com 1 lead" e, uma bolha abaixo, "• Export: Campanha exportada para Instantly com **1 leads**". O smoke registrou só a string do activate. **APLICADO**: helper `pluralize` + `toCount` ([orchestrator.ts:34-50](../../src/lib/agent/orchestrator.ts#L34)) nas 4 linhas do resumo (empresas / contatos / emails / leads); `toCount` também blinda contra `NaN` vindo do JSONB. 2 testes novos (singular em todas as 4 linhas + `not.toContain("1 leads")`; e plural preservado com N>1). Convergente Blind+Auditor. Severidade: MEDIUM.
- [x] [Review][Patch] **`sendSummaryMessage` não checa erro do Supabase — o `try/catch` novo não enxerga o modo de falha real** — [orchestrator.ts:517-523](../../src/lib/agent/orchestrator.ts#L517) destrutura só `data` (`if (!allSteps) return;`) e [:564](../../src/lib/agent/orchestrator.ts#L564) ignora o resultado do insert. O caminho provável de "o resumo sumiu" (erro/RLS no select, insert que falha) **não lança** → sai silencioso, sem `console.error`, sem bolha, e o `catch` adicionado em `:373-380` nunca dispara. Nota correlata: `if (!allSteps)` deixa passar `[]`, que gera um resumo degenerado ("Pipeline concluido com sucesso! / Resumo:" sem nenhuma linha) — e os testes alimentam exatamente esse shape. **APLICADO** ([orchestrator.ts:530-545](../../src/lib/agent/orchestrator.ts#L530) e o insert final): `error` checado nas duas queries com `console.error`, e o array vazio passou a ser tratado junto do `!allSteps` (não gera mais resumo degenerado). Convergente Edge+Auditor. Severidade: MEDIUM.
- [x] [Review][Patch] **Cliente antigo renderiza faixa de label vazia para `step_complete` — e a Dev Note que afirma o contrário está factualmente errada** — [AgentMessageBubble.tsx:26-27](../../src/components/agent/AgentMessageBubble.tsx#L26): `getMessageType` só faz fallback para `"text"` quando o campo está **ausente**; com `"step_complete"` presente, uma aba aberta antes do deploy entra em `messageType !== "text"` (`:84`), não casa nenhum label (`:88-94`) e o `MessageTypeIcon` cai em `default: null` → cabeçalho vazio acima do texto. A Dev Note (linha 72) afirma "mensagens novas `step_complete` em cliente velho cairiam em 'text' — sem crash": não caem. Sem crash, sim; em `"text"`, não. **APLICADO**: `MESSAGE_TYPE_LABELS` com fallback "Atualizacao" + `Bot` como ícone default; a Dev Note errada foi corrigida in loco (abaixo, com tachado). **Ressalva honesta:** editar este arquivo NÃO conserta abas já abertas com o bundle antigo — lá quem roda é o código velho. O patch protege o **próximo** membro novo da union. Teste novo cobre um `messageType` fora da union. Fonte: Edge Case Hunter. Severidade: LOW (auto-cura no refresh).
- [x] [Review][Patch] **Título de teste obsoleto afirma uma regra que esta story deletou** — [orchestrator.test.ts:1674-1686](../../__tests__/unit/lib/agent/orchestrator.test.ts#L1674): `"does NOT send summary message in guided mode"` — o guiado **passa** a enviar o resumo quando o último step não exige post-approval. O corpo só roda o step 1 de 5 (o próprio comentário admite "not last step → no summary regardless"), então passa, mas o nome codifica regra falsa — mesma classe do teste que a story corretamente reescreveu. **APLICADO**: renomeado para `"does NOT send summary message for a non-last step in guided mode"`, com comentário registrando a regra deletada. Fonte: Acceptance Auditor. Severidade: LOW.
- [x] [Review][Defer] **Gate de ativação não é durável: F5 rearma os botões e o clique devolve 409 cru na tela** [AgentActivationGate.tsx:45-50] — deferred, pré-existente (22.13 tornou durável só a *rejeição* dos outros 3 gates). Família da 22.18 (a).
- [x] [Review][Defer] **Sem guarda de status do step no `executeStep` → retry re-ativa a campanha** [orchestrator.ts:100-118] — deferred, pré-existente; **já registrado** no `deferred-work.md` pela própria story (Trap #4). Corroborado de forma independente pelo Edge Case Hunter. É a 22.18 (b).
- [x] [Review][Defer] **Campanha ativável com ZERO contas de envio, e agora o pipeline declara sucesso** [AgentActivationGate.tsx:51-52 + activate-step.ts:82] — deferred, pré-existente. `hasAccounts` falso ⇒ `noAccountSelected` falso ⇒ botão habilitado ⇒ `selectedAccounts: []` ⇒ attach pulado ⇒ ativa sem remetente. Antes o guiado pendurava; agora fecha `completed` com "Pipeline concluido com sucesso!" sobre uma campanha inerte. Família da 22.18.
- [x] [Review][Defer] **`result_summary` fica NULL na conclusão guiada bem-sucedida** [orchestrator.ts:359-363] — deferred, pré-existente (o autopilot nunca gravou; defer grava `{activationDeferred}` e a rota approve grava `{campaignName}`). Único terminal do sistema sem `result_summary`.
- [x] [Review][Defer] **Toda etapa continua deixando uma bolha `progress` girando para sempre** [activate-step.ts:65-73, export-step.ts:126, create-campaign-step.ts:154, search-leads-step.ts:103] — deferred, **declarado fora de escopo pela própria story** (Dev Notes linha 80, que mandava registrar aqui). Uma execução de 5 steps concluída deixa 5 spinners vivos acima de "Pipeline concluido com sucesso!".
- [x] [Review][Defer] **"Concluido" + check estático em cima de "nao encontrou resultados" (22.14)** [base-step.ts:275-288] — deferred, LOW. O `CheckCircle2` não tem cor de sucesso (herda `text-muted-foreground`) e o label descreve o estado do step, não o resultado; ainda assim é um afford de sucesso sobre o texto honesto que a 22.14 introduziu.
- [x] [Review][Defer] **Mock drift: os mocks do orchestrator declaram `requiresPostApproval` à mão** [orchestrator.test.ts:31-95] — deferred, LOW. Se o override em `activate-step.ts:41-43` sumisse, todos os testes do orchestrator continuariam verdes; o único guard é a asserção isolada em `activate-step.test.ts:303`. Convergente Blind+Auditor.

**Descartados (4):** `skipSteps` com último step pulado nunca completa (irreachable — só `search_companies`/`search_leads` entram em `skipSteps`, via `briefing/parse/route.ts:253-263`); dois resumos concorrentes no guiado (padrão já existente no autopilot, aprovado visualmente no smoke); `TS18048` em `base-step-approval.test.ts:295` (idêntico a 3 ocorrências pré-existentes no mesmo arquivo; `src/` typecheca com 0 erros); remoção dos `_input` não usados nos test doubles (justificada pelo gate `eslint --max-warnings=0` do pre-commit).

## Dev Notes

### Estado atual dos arquivos (lidos na create-story — preservar o que não é o bug)

- **[AgentActivationGate.tsx](../../src/components/agent/AgentActivationGate.tsx):** `loading` ("activate"|"defer"|null) + `actionTaken` ("activated"|"deferred"|null); `isDisabled = loading !== null || actionTaken !== null` (:50) — por isso limpar `loading` no sucesso NÃO reabilita os botões (o `actionTaken` segura). O fix é literalmente `setLoading(null)` após `setActionTaken(...)` (:95, :128) ou `finally`. `triggerNextStep` fire-and-forget (:99, :131) fica como está.
- **[base-step.ts](../../src/lib/agent/steps/base-step.ts):** `run()` é template method (:45-68): `running` → `executeInternal` → guided? `saveAwaitingApproval`+`sendApprovalGateMessage` : `saveCheckpoint` → `logStep`. O ponto de corte da Task 2 é exatamente o `if (input.mode === "guided")` (:53). `saveCheckpoint` (:168) já grava `completed`+`completed_at`+`cost` — reusar, não duplicar.
- **[orchestrator.ts](../../src/lib/agent/orchestrator.ts):** a condição de completion (:344) usa `executionData.total_steps` e `executionData.mode`, e o CAS `.neq("status","cancelled")` (:347-354). `sendSummaryMessage` (:490+) monta o resumo iterando os steps — já lida com `skipped`; conferir como renderiza o step 5 `completed` (activate) no resumo. **Ramo defer (:222-310) é INTOCÁVEL** — é o coração da 22.12, com testes próprios.
- **[AgentMessageBubble.tsx](../../src/components/agent/AgentMessageBubble.tsx):** labels por tipo (:84-91), ícones em `MessageTypeIcon` (:167-184). ~~`getMessageType` default `"text"` (:26-28) → tipo desconhecido não quebra (bom para rollout: mensagens novas `step_complete` em cliente velho cairiam em "text" — sem crash).~~ **CORRIGIDO na code review:** essa afirmação estava errada. `getMessageType` só cai em `"text"` quando o campo está **ausente**; um valor presente e desconhecido (`step_complete` numa aba com o bundle antigo) passa no guard `!== "text"`, não casa nenhum label e cai no `default: null` do ícone → **faixa de cabeçalho vazia**. Sem crash, sim; em `"text"`, não. O patch P3 adicionou `MESSAGE_TYPE_LABELS` com fallback "Atualizacao" + ícone neutro — o que protege os **próximos** tipos novos, não as abas já abertas (lá quem roda é o código velho). O `ApprovalGateRenderer` `default: return null` (:162) deixa de ser alcançado para activate quando a Task 2 parar de gravar o gate; NÃO adicionar case "activate".
- **[types/agent.ts](../../src/types/agent.ts):** union `MessageType` — adicionar `"step_complete"`. Grep por usos exaustivos da union (switches) para não esquecer render/testes.
- **[activate-step.ts](../../src/lib/agent/steps/activate-step.ts):** summary (:106-115) com `leadsCount`. O try/catch de attach da 22.12 (:76-96) fica intacto.

### Decisão de design tomada (racional)

- **Aprovação do activate é EX-ANTE:** o gate de ativação é o approve do step 4 (export) com `approvedData.activate: true` — o usuário já decidiu. Um segundo approval pós-execução seria teatro (e é exatamente o buraco atual). Por isso: activate = step guiado SEM post-approval, e a execução completa quando ele conclui.
- **Alternativa rejeitada:** criar UI de aprovação para o step 5 (case "activate" no renderer) — adiciona um clique sem valor e mantém a máquina de estados esquisita.
- **Spinner das mensagens `progress` históricas** (ex.: "Etapa 5/5: Ativando...") continuam girando no histórico — fica FORA desta story (exigiria acoplar a bolha ao status da execução). O ganho principal (conclusões não giram) vem da Task 4. Se sobrar apetite, registrar em deferred-work, não inflar aqui.

### Traps

- **Trap #1 — testes do orchestrator (22.12):** `orchestrator.test.ts` tem asserts do defer (flag, skip, completed, "nunca paused"). Qualquer mudança na condição de completion que vaze para o ramo defer quebra o guardrail — se quebrar, o design está errado, não o teste.
- **Trap #2 — `awaiting_approval` como contrato:** o approve route e a UI de gates assumem steps 1-4. Verificar que nada além do fluxo guiado do último step depende de o activate ficar `awaiting_approval` (grep por `awaiting_approval` em rotas/hooks).
- **Trap #3 — execução fixture `28310579`:** está `running` com step 5 `awaiting_approval`. O smoke da AC6d re-executa o step 5 — mas o execute route pode recusar step `awaiting_approval`? Mapear a máquina de estados do step no execute path (o orchestrator lê o step atual — conferir guardas) ANTES de prometer o smoke por essa via.
- **Trap #4 — idempotência do `POST /activate`:** a campanha da fixture já está ativa. Confirmar na doc oficial (developer.instantly.ai) se ativar campanha ativa é no-op; caso contrário, smoke alternativo (AC6d).

### Previous story intelligence (22.12, mesma sessão)

- Padrão de mock do orchestrator: `createChainBuilder` + `mockSupabase.from.mockImplementation` por tabela (ver testes AC3/AC5 da 22.12 como referência de estrutura).
- Lição de fronteira: mock não prova rota externa — daí o cuidado com idempotência do activate no smoke (Trap #4).
- Pre-commit: eslint `--max-warnings=0` no arquivo inteiro — arquivos tocados precisam sair limpos.
- Fixture-based smoke funcionou muito bem na 22.12 (custo zero de APIs) — repetir a estratégia.

### References

- [Source: src/components/agent/AgentActivationGate.tsx#L74-L136] — handlers sem `setLoading(null)` no sucesso
- [Source: src/lib/agent/steps/base-step.ts#L45-L68] — template method; corte guided
- [Source: src/lib/agent/steps/base-step.ts#L231-L248] — `logStep` com `messageType: "progress"`
- [Source: src/lib/agent/orchestrator.ts#L340-L358] — completion só `mode !== "guided"` + CAS
- [Source: src/lib/agent/orchestrator.ts#L490-L530] — `sendSummaryMessage` ("Pipeline concluido com sucesso!")
- [Source: src/components/agent/AgentMessageBubble.tsx#L60-L97] — render por tipo; bolha
- [Source: src/components/agent/AgentMessageBubble.tsx#L125-L165] — `ApprovalGateRenderer` sem case activate → null
- [Source: src/lib/agent/client-utils.ts#L10-L22] — guard do último step
- [Source: src/lib/agent/steps/activate-step.ts#L106-L115] — summary "1 leads"
- [Source: _bmad-output/implementation-artifacts/22-12-fix-ativacao-instantly-email-list.md] — story anterior (defer path a preservar; smoke que revelou este bug)
- Fixture: execução `28310579-...` (guided, `running`, step 5 `awaiting_approval`, campanha "Campanha Outbound - 24/07/2026" ativa no Instantly)

## Dev Agent Record

### Implementation Plan (o que mudou e por quê)

1. **AC1 — spinner do gate** ([AgentActivationGate.tsx](../../src/components/agent/AgentActivationGate.tsx)): `setLoading(null)` acrescentado ao caminho de SUCESSO de `handleActivate` e `handleDefer` (antes só existia no `catch`). Optei por `setLoading(null)` explícito em vez de `finally` para deixar o motivo comentado no ponto exato; os botões continuam travados por `actionTaken` (`isDisabled` olha os dois).

2. **AC2 — contrato `requiresPostApproval()`** ([base-step.ts](../../src/lib/agent/steps/base-step.ts)): método **público** no `BaseStep` com default `true`; `ActivateStep` sobrescreve para `false`. O corte no template `run()` virou `input.mode === "guided" && this.requiresPostApproval()`. Público (não `protected`) porque o orchestrator precisa consultar o contrato — foi a decisão de design que substituiu um `switch (stepType)` no orchestrator (que espalharia a regra em dois lugares).

3. **AC2 — completion do orchestrator** ([orchestrator.ts](../../src/lib/agent/orchestrator.ts)): a condição `mode !== "guided"` virou `!guidedStepStillNeedsApproval`, derivada de `stepInstance.requiresPostApproval()`. O CAS `.neq("status","cancelled")` da 22.10 e o ramo defer da 22.12 ficaram **intocados**.

4. **AC3 — `step_complete`** ([types/agent.ts](../../src/types/agent.ts), base-step `logStep`, [AgentMessageBubble.tsx](../../src/components/agent/AgentMessageBubble.tsx)): novo membro da union, label "Concluido" e `CheckCircle2` estático. Mensagens antigas gravadas como `progress` continuam renderizando com o visual de progresso (nada migrou no banco) e `getMessageType` segue caindo em `"text"` para tipo desconhecido.

5. **AC4 — pluralização** ([activate-step.ts](../../src/lib/agent/steps/activate-step.ts)): `leadsLabel` = `1 lead` / `N leads`.

6. **Hardening fora da lista de tasks (justificado por AC2):** `sendSummaryMessage` passou a ser chamado dentro de `try/catch` no orchestrator. Sem isso, uma falha no resumo (a parte MENOS crítica, executada DEPOIS do `completed`) subia para o `catch` de `executeStep`, que escreve `paused` por cima do `completed` — recriando a execução pendurada com a campanha já ativa no Instantly, exatamente o defeito desta story. Falha vira `console.error`; a execução permanece `completed`.

### Debug Log / decisões durante o dev

- **Teste que afirmava o bug:** `orchestrator.test.ts` tinha `"does NOT mark execution as completed for last step in guided mode"` usando `activate` como step 5 — ele codificava o defeito. Foi **reescrito** para afirmar o comportamento correto, e um teste novo cobre a outra metade da regra (último step guiado que AINDA exige post-approval → não completa), usando `export` como step 5.
- **Mocks do orchestrator:** as classes de step mockadas ganharam `requiresPostApproval` (espelhando o contrato público). A 3ª leitura de `agent_steps` nesses testes passou a devolver **array** — com o activate guiado fechando a execução, essa chamada agora é o `sendSummaryMessage` (`allSteps is not iterable` foi o sintoma).
- **22.14 preservada:** o teste `"o logStep NAO diz 'concluido com sucesso'"` filtrava a conclusão por `messageType === "progress"`; o filtro passou a ser `step_complete`. A asserção de conteúdo (o texto não pode mentir) ficou igual.
- **Lint:** os arquivos tocados saem com **0 warnings** em `eslint --max-warnings=0`. Removi 4 parâmetros `_input` não usados (3 pré-existentes) nos test doubles do `BaseStep` — sem eles o pre-commit bloquearia o commit desses arquivos.
- **Trap #2 verificado:** grep por `awaiting_approval` — nada além dos gates 1-4 depende de o activate ficar nesse estado (approve/reject/fetch-leads routes tratam steps de gate; `AgentChat` só reabre ajuste para gates rejeitados).
- **Trap #3 verificado:** a rota `execute` NÃO guarda status de step (só status terminal de execução), então re-executar o step 5 seria permitido — mas o smoke seguiu outro caminho (abaixo).

### Completion Notes

**Testes:** suíte cheia **402 arquivos / 7283 testes / 0 falhas / 2 skip**. RED provado antes de cada fix (2 falhas no gate; 4 em base-step+orchestrator; 2 em bubble+base-step; 1 na pluralização).

**Smoke real (AC6d) — feito 2026-07-26, aprovado.** O caminho previsto na story morreu: a campanha da fixture `28310579` (`5d059a98-…`, "Campanha Outbound - 24/07/2026") **não existe mais no Instantly** — `GET` e `POST /activate` devolvem 404 e ela não aparece entre as 15 campanhas da workspace. Reexecutar o step 5 só deixaria a fixture pior (step `failed` + execução `paused`). Com autorização do Fabossi, o smoke rodou por um **fluxo novo barato**: import de leads próprios (steps 1 e 2 pulados → **zero busca paga**; custo do plano R$ 4,20, só a geração da campanha).

- Execução **`4b7c4f17-9cd4-42bd-af8b-04178a918494`** (guided, 5 steps), campanha Instantly `f67e06fc-47be-43ec-abd8-b0cc7ef843c2` ("Campanha - campanha de teste"), conta de envio `felipe@startveeflow.com`, 1 lead (`fabotse@gmail.com` — o próprio usuário, para não enviar cold email a terceiro).
- **AC1:** após "Ativar Campanha" → `spinner: false` nos dois botões, "✅ Campanha ativada" exibido, ambos os botões `disabled`.
- **AC2 (banco):** execução `status: completed`, `completed_at: 2026-07-26T20:23:54.509Z`; step 5 `activate` = **`completed`** com `activated: true`; **nenhuma** mensagem `approval_gate` do activate (a bolha vazia sumiu — 0 bolhas vazias no chat); resumo final `"Pipeline concluido com sucesso!"` gravado e renderizado.
- **AC3:** "Step 3/4/5 (…) concluido com sucesso" → `data-message-type="step_complete"`, label **"Concluido"**, sem `animate-spin`; "Etapa 5/5: Ativando campanha no Instantly..." (progress legítimo) segue com "Processando..." + spinner. A conversa ANTIGA na mesma tela ainda mostra "Processando..." nas conclusões velhas — a compatibilidade retroativa do AC3 confirmada visualmente.
- **AC4:** `"Campanha 'Campanha - campanha de teste' ativa no Instantly com 1 lead"` (singular).

**Pendência operacional (não é código):** a campanha de teste `f67e06fc-…` ficou **ATIVA** no Instantly e vai disparar a sequência de 5 e-mails para `fabotse@gmail.com` ao longo de ~19 dias. Pausar/apagar é decisão do Fabossi — não mexi para não alterar o resultado do smoke.

**Idempotência do `POST /activate` (Trap #4): NÃO resolvida.** A doc oficial não documenta o comportamento em campanha já ativa e a campanha da fixture sumiu antes de dar para medir. Rastreado em [deferred-work.md](deferred-work.md) com os caminhos de exposição mapeados (o único real é o retry depois de erro parcial, já que `paused` não é terminal) e o fix proposto — tornar a NOSSA camada idempotente via `activated: true` no output ou `getCampaignStatus`, sem depender do comportamento do fornecedor.

### File List

- `src/components/agent/AgentActivationGate.tsx` (modificado)
- `src/components/agent/AgentMessageBubble.tsx` (modificado)
- `src/lib/agent/orchestrator.ts` (modificado)
- `src/lib/agent/steps/base-step.ts` (modificado)
- `src/lib/agent/steps/activate-step.ts` (modificado)
- `src/types/agent.ts` (modificado)
- `__tests__/unit/components/agent/AgentActivationGate.test.tsx` (modificado)
- `__tests__/unit/components/agent/AgentMessageBubble.test.tsx` (modificado)
- `__tests__/unit/lib/agent/orchestrator.test.ts` (modificado)
- `__tests__/unit/lib/agent/steps/base-step.test.ts` (modificado)
- `__tests__/unit/lib/agent/steps/base-step-approval.test.ts` (modificado)
- `__tests__/unit/lib/agent/steps/activate-step.test.ts` (modificado)
- `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` (modificado)
- `_bmad-output/implementation-artifacts/22-17-conclusao-da-execucao-guiada.md` (modificado)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modificado)
- `_bmad-output/implementation-artifacts/deferred-work.md` (modificado — defers da dev-story + da code review)

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-26 | **Code review adversarial 3 camadas** (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo full, baseline `c798f08`. AC1–AC6 verificados satisfeitos; **AC5 (preservação) confirmada por hunk-diff** — o `git diff` do orchestrator devolve exatamente 2 hunks e o ramo defer da 22.12 não está em nenhum deles; os 2 CAS da 22.10 verbatim; autopilot reduz-se por álgebra à condição original. Nenhum achado HIGH. 3 decision-needed + 4 patches + 6 defers + 4 descartados. **Aplicado:** (D2) `logStep` embrulhado em try/catch nos 5 steps — uma falha de log reescrevia o step `completed` para `failed` e pausava a execução com a campanha já ativa, o mesmo defeito da story pela escrita menos crítica; (D3) `error` checado na escrita de `completed` → `ORCHESTRATOR_COMPLETION_FAILED`, sem resumo de sucesso sobre execução não-completada; (P1) pluralização das 4 linhas do `sendSummaryMessage` — a AC2 tornou esse resumo visível no guiado carregando o mesmo "1 leads" que a AC4 matou no activate, uma bolha abaixo; (P2) `error` checado nas 2 queries do `sendSummaryMessage` (o caminho provável de "o resumo sumiu" saía silencioso e o try/catch nunca o via); (P3) `MESSAGE_TYPE_LABELS` com fallback + correção da Dev Note factualmente errada sobre cliente antigo; (P4) título de teste obsoleto renomeado. **Deferido:** D1 (`triggerNextStep` engole 4xx/5xx → "✅ Campanha ativada" pode ser mentira) → **Story 22.18**, por ser o elo 1 do mesmo loop. **6 testes novos** (todo patch comportamental coberto, incluindo guardrail de que a guarda do `logStep` não engole falha de `executeInternal`). Suíte cheia **402 arquivos / 7289 testes / 0 falhas / 2 skip**; `eslint --max-warnings=0` limpo em todos os arquivos tocados. |
| 2026-07-26 | Implementação completa (dev-story, Opus 5). 4 causas fechadas: (1) `setLoading(null)` no sucesso do gate; (2) contrato público `requiresPostApproval()` no `BaseStep` (`ActivateStep` → false) + condição de completion do orchestrator derivada dele; (3) `messageType: "step_complete"` com label "Concluido" e ícone estático; (4) pluralização "1 lead"/"N leads". Hardening extra: `sendSummaryMessage` em try/catch para o resumo não reverter o `completed` para `paused`. Defer da 22.12, CAS da 22.10 e autopilot intocados. Suíte 402/7283/0 falhas; lint 0 warnings nos arquivos tocados. SMOKE REAL APROVADO por fluxo novo com import de leads (fixture externa havia sido apagada do Instantly): execução `4b7c4f17` fechou `completed` com resumo final, step 5 `completed`, sem bolha vazia, "com 1 lead". Status: review. |
| 2026-07-24 | Story criada (create-story, Opus 4.8) a partir do bug reportado pelo Fabossi no smoke da 22.12: ativação real funcionou no Instantly mas o agente não "termina" (spinner eterno, badges "Processando..." em steps concluídos, bolha vazia, execução `running` para sempre). 4 causas confirmadas em código com file:line; decisão de design: activate = step sem post-approval (aprovação ex-ante no gate); defer path da 22.12 declarado intocável. Status: ready-for-dev. |
