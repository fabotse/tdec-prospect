# Story 22.17: Conclusão da Execução Guiada — o agente precisa "terminar" depois da ativação real

Status: ready-for-dev

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

- [ ] **Task 1 — Fix do gate (AC1):** `setLoading(null)` no sucesso de `handleActivate` e `handleDefer` (ou `finally`). Teste: spinner some, botões seguem desabilitados via `actionTaken`.
- [ ] **Task 2 — Step activate sem post-approval (AC2):** mecanismo overridável no `BaseStep` (ex.: `protected requiresPostApproval(): boolean { return true }`; `ActivateStep` → `false`). Em `run()`: guided + sem post-approval → `saveCheckpoint` (completed) e SEM `sendApprovalGateMessage`.
- [ ] **Task 3 — Orchestrator completa guided no último step (AC2):** ajustar a condição de [orchestrator.ts:344](../../src/lib/agent/orchestrator.ts#L344) para completar também quando o último step guiado não requer post-approval (consultar `stepInstance`). NÃO tocar no ramo defer.
- [ ] **Task 4 — messageType de conclusão (AC3):** novo membro na union `MessageType` ([types/agent.ts](../../src/types/agent.ts)); `logStep` grava `step_complete`; `AgentMessageBubble` renderiza label "Concluído" + ícone estático; fallback para mensagens antigas `progress` intacto.
- [ ] **Task 5 — Pluralização (AC4):** [activate-step.ts:110](../../src/lib/agent/steps/activate-step.ts#L110).
- [ ] **Task 6 — Testes RED→GREEN + smoke (AC5, AC6):** suíte cheia sem regressão (atenção aos testes da 22.12 no orchestrator — são o guardrail do defer); smoke conforme AC6d.

## Dev Notes

### Estado atual dos arquivos (lidos na create-story — preservar o que não é o bug)

- **[AgentActivationGate.tsx](../../src/components/agent/AgentActivationGate.tsx):** `loading` ("activate"|"defer"|null) + `actionTaken` ("activated"|"deferred"|null); `isDisabled = loading !== null || actionTaken !== null` (:50) — por isso limpar `loading` no sucesso NÃO reabilita os botões (o `actionTaken` segura). O fix é literalmente `setLoading(null)` após `setActionTaken(...)` (:95, :128) ou `finally`. `triggerNextStep` fire-and-forget (:99, :131) fica como está.
- **[base-step.ts](../../src/lib/agent/steps/base-step.ts):** `run()` é template method (:45-68): `running` → `executeInternal` → guided? `saveAwaitingApproval`+`sendApprovalGateMessage` : `saveCheckpoint` → `logStep`. O ponto de corte da Task 2 é exatamente o `if (input.mode === "guided")` (:53). `saveCheckpoint` (:168) já grava `completed`+`completed_at`+`cost` — reusar, não duplicar.
- **[orchestrator.ts](../../src/lib/agent/orchestrator.ts):** a condição de completion (:344) usa `executionData.total_steps` e `executionData.mode`, e o CAS `.neq("status","cancelled")` (:347-354). `sendSummaryMessage` (:490+) monta o resumo iterando os steps — já lida com `skipped`; conferir como renderiza o step 5 `completed` (activate) no resumo. **Ramo defer (:222-310) é INTOCÁVEL** — é o coração da 22.12, com testes próprios.
- **[AgentMessageBubble.tsx](../../src/components/agent/AgentMessageBubble.tsx):** labels por tipo (:84-91), ícones em `MessageTypeIcon` (:167-184). `getMessageType` default `"text"` (:26-28) → tipo desconhecido não quebra (bom para rollout: mensagens novas `step_complete` em cliente velho cairiam em "text" — sem crash). O `ApprovalGateRenderer` `default: return null` (:162) deixa de ser alcançado para activate quando a Task 2 parar de gravar o gate; NÃO adicionar case "activate".
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

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (create-story, Opus 4.8) a partir do bug reportado pelo Fabossi no smoke da 22.12: ativação real funcionou no Instantly mas o agente não "termina" (spinner eterno, badges "Processando..." em steps concluídos, bolha vazia, execução `running` para sempre). 4 causas confirmadas em código com file:line; decisão de design: activate = step sem post-approval (aprovação ex-ante no gate); defer path da 22.12 declarado intocável. Status: ready-for-dev. |
