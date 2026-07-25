---
title: 'Story 22.13: Ajuste Pós-Rejeição de Etapa — a resposta do usuário precisa ter um consumidor'
type: 'feature'
created: '2026-07-24'
status: 'in-progress'
baseline_revision: '079aca09dc5be1ecfce3622939af6d0a70215eec'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/22-11-guard-import-leads-e-modelo-do-parser.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Hoje rejeitar uma etapa da execução guiada (busca de leads ou campanha) é um beco sem saída: o agente pergunta "o que você gostaria de ajustar?" e a resposta do usuário só é persistida — não há consumidor. O reject route mantém o step `awaiting_approval` e não existe roteamento pós-confirmação; a única saída é "Nova conversa" (perde o briefing inteiro).

**Approach:** Introduzir um estado client-side de **ajuste pós-rejeição** (genérico por step). Nesse estado, a próxima mensagem é roteada ao `/parse` (com a memória conversacional da 22.3), o delta é aplicado via `PATCH /briefing`, o agente re-apresenta um resumo + custo e, **só após confirmação explícita e determinística do usuário**, re-executa o step rejeitado — reabrindo um novo gate de aprovação. Reutiliza toda a infra existente (parse/briefing/execute/reabertura de gate); backend muda só para marcar o card antigo como rejeitado de forma durável (auditoria).

## Boundaries & Constraints

**Always:**
- NFR1 (sagrado): o LLM interpreta a CONVERSA (que ajuste fazer); a re-execução é determinística. A decisão cara (re-busca paga) exige **confirmação explícita** — nunca dispara direto da interpretação do LLM.
- Confirmação da re-execução é **determinística**: reusar `isConfirmation`/`CONFIRMATION_KEYWORDS` (helper puro SSOT em `use-briefing-flow.ts`). Fail-safe (padrão 22.11): na dúvida, tratar como novo ajuste — nunca gastar créditos.
- Reusar a memória da 22.3 (`conversationRef` + `callParseAPI`) para o parse do ajuste — NÃO duplicar o parser nem o mecanismo de memória (Trap #1: o parser devolve briefing completo; a memória impede esquecer campos preenchidos).
- Estado de ajuste é **genérico por step** (`adjustingStep`/`stepNumber`) cobrindo busca (`search_leads`) E campanha (`create_campaign`) — Trap #3.
- Preservar o CAS/máquina de estados da 22.10 (guard de execução terminal em execute/approve) intocado. Zero migration (NFR5): novos sinais vivem em JSONB (`agent_messages.metadata`, `agent_executions.briefing`).
- Custo da re-execução re-exibido antes da confirmação (reusar o estimador do `/plan`).

**Block If:**
- Se re-executar um step `awaiting_approval` via `POST /steps/{n}/execute` NÃO reusar o briefing recém-PATCHado (o step lê filtros/campos desatualizados) e isso exigir alterar a resolução de input do orchestrator de forma que quebre outros steps — HALT com a evidência.

**Never:**
- NÃO alterar o fluxo de briefing pré-confirmação, o approve normal, nem o autopilot (o roteamento novo só ativa quando o estado de ajuste está ligado) — AC5.
- NÃO adicionar um status `rejected` ao enum `StepStatus` nem tocar a resolução de `previousStepOutput` do orchestrator (fail-safe: menos superfície de regressão).
- NÃO delegar ao LLM a decisão de re-executar.
- NÃO construir um novo componente de gate com botões para a confirmação — reusar o caminho de confirmação textual determinístico já existente.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rejeitar → descrever ajuste | `adjustingStep = N` (fase "describe"), user: "remove o filtro de tamanho e o de indústria" | `/parse` (com memória) → briefing com `companySize:null, industry:null` → `PATCH /briefing` → agente resume o ajuste + custo estimado da re-busca + "Confirma a nova busca?"; fase vira "confirm" | Parse/LLM falha ou timeout → fail-open: agente avisa que não entendeu, estado de ajuste permanece, NENHUM PATCH e NENHUM execute |
| Confirmar re-execução | fase "confirm", user: "sim, pode buscar" (isConfirmation true) | `POST /steps/{N}/execute` com briefing atualizado → step re-roda → novo `approval_gate` (novo card) → limpar `adjustingStep` | Execute falha → caminho de erro existente (PipelineError); estado de ajuste limpo, usuário vê o erro da etapa |
| Novo ajuste em vez de confirmar | fase "confirm", user: "na verdade troca o cargo pra CFO" (isConfirmation false) | Tratado como novo ajuste → volta ao parse (fase "describe"→"confirm") — NÃO executa | — |
| Mensagem fora do estado de ajuste | briefing `confirmed`, `adjustingStep = null` | Comportamento atual inalterado (persistir e nada mais) — AC5 | — |
| Card antigo após re-exec / refresh | reject aplicado | Card rejeitado persiste marcado "❌ Rejeitado" e desabilitado (via `metadata.rejected`), sobrevive a refetch/remount; novo gate aparece abaixo | — |

</intent-contract>

## Code Map

- `src/stores/use-agent-store.ts` -- `AgentUIState`: adicionar estado `adjustingStep: { stepNumber: number; stepType: StepType; phase: "describe" | "confirm" } | null` + actions (efêmero, não persistir).
- `src/components/agent/AgentChat.tsx` -- `handleSendMessage` (:240-318): novo ramo ANTES do "fluxo normal" (:302-303) quando `adjustingStep != null`.
- `src/components/agent/AgentApprovalGate.tsx`, `AgentCampaignPreview.tsx`, `AgentLeadReview.tsx` -- `handleReject`: no sucesso do reject, setar `adjustingStep` (genérico) no store.
- `src/components/agent/AgentInput.tsx` -- placeholder orientado + input habilitado quando `adjustingStep != null` (:30,49).
- `src/hooks/use-briefing-flow.ts` -- REUSAR `callParseAPI`/`conversationRef` (memória 22.3) e `isConfirmation`/`CONFIRMATION_KEYWORDS` (SSOT determinística). Exportar seam mínimo se necessário; não duplicar.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts` -- carimbar `metadata.rejected: true` na mensagem `approval_gate` do step rejeitado (JSONB, sem migration) para auditoria durável (AC3).
- `src/components/agent/AgentMessageBubble.tsx` -- `ApprovalGateRenderer` (:114-165): renderizar estado rejeitado/desabilitado quando `metadata.rejected === true`.
- `src/app/api/agent/.../steps/[stepNumber]/execute/route.ts` -- REUSAR como está (já permite re-exec de `awaiting_approval`; guard terminal da 22.10 preservado). Sem alteração.
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` (PATCH) + `.../briefing/parse/route.ts` -- reusar como estão.
- `src/types/agent.ts` -- adicionar `rejected?: boolean` a `AgentMessageMetadata` (sem migration).

## Tasks & Acceptance

**Execution:**
- [ ] `src/stores/use-agent-store.ts` -- adicionar `adjustingStep` + setter/clear ao `AgentUIState` (efêmero) -- estado compartilhado entre gate (seta) e chat (consome). (AC1)
- [ ] `src/components/agent/AgentApprovalGate.tsx`, `AgentCampaignPreview.tsx`, `AgentLeadReview.tsx` -- no sucesso do `handleReject`, setar `adjustingStep={stepNumber, stepType, phase:"describe"}` -- ativa o estado de ajuste genérico. (AC1)
- [ ] `src/components/agent/AgentInput.tsx` -- placeholder "Descreva o ajuste — ex.: 'remove o filtro de tamanho'" quando em ajuste; garantir input habilitado. (AC1)
- [ ] `src/components/agent/AgentChat.tsx` -- em `handleSendMessage`, ramo novo antes de :302: se `adjustingStep` fase "describe" → registrar msg na memória + `callParseAPI` → aplicar briefing retornado + `PATCH /briefing` → mensagem-resumo do ajuste + custo estimado do step (via `/plan`) + pergunta de confirmação → fase "confirm". Se fase "confirm" e `isConfirmation(msg)` → `POST /steps/{N}/execute` e limpar `adjustingStep`; senão → tratar como novo ajuste (volta a "describe"). (AC2, AC3, AC4)
- [ ] `src/app/api/agent/.../reject/route.ts` -- carimbar `metadata.rejected:true` na mensagem `approval_gate` do step (auditoria durável). (AC3)
- [ ] `src/components/agent/AgentMessageBubble.tsx` -- gate renderizado como rejeitado/desabilitado quando `metadata.rejected`. (AC3)
- [ ] `src/types/agent.ts` -- `rejected?: boolean` em `AgentMessageMetadata`. (AC3)
- [ ] Testes RED→GREEN -- ver Verification. (AC5, AC6)

**Acceptance Criteria:**
- Given execução guiada com step em `awaiting_approval`, when o usuário clica "Rejeitar", then entra no estado de ajuste (client-side) e o input fica habilitado com placeholder orientando.
- Given o estado de ajuste, when o usuário descreve o ajuste, then a mensagem vai ao `/parse` (com o briefing atual como contexto), os campos ajustados são aplicados via `PATCH /briefing`, e o agente re-apresenta um resumo curto do ajuste.
- Given o ajuste aplicado, when o usuário **confirma explicitamente**, then o step rejeitado é re-executado com o briefing atualizado e um novo gate de aprovação abre; o card antigo permanece no histórico marcado como rejeitado.
- Given a lição da 22.11, then a re-execução (que gasta créditos) só dispara após ver o resumo + custo e confirmar — nunca direto da interpretação do LLM; confirmação é determinística (fail-safe na dúvida).
- Given approve normal, autopilot e o fluxo de briefing pré-confirmação, then nada muda neles.
- Given a suíte mocka OpenAI/pipeline, then smoke pela interface real: rejeitar uma busca → pedir ajuste em linguagem natural → confirmar → nova busca executa e reabre aprovação.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Por que quase tudo é client-side:** o backend já oferece as três peças (`/parse` stateless com memória, `PATCH /briefing`, `/execute` sem guard de status de step) e o step em modo guiado **reabre o gate sozinho** ao re-rodar (`base-step.ts` reescreve `awaiting_approval` + nova mensagem `approval_gate`). O orquestrador determinístico não muda → NFR1/NFR5 respeitados. A única mudança de backend é marcar o card antigo como rejeitado (JSONB) para a auditoria da AC3 sobreviver a refetch (hoje a marcação é só local e some no remount — meia-verdade da AC3).
- **Confirmação determinística (AC4):** reusar `isConfirmation`/`CONFIRMATION_KEYWORDS` (pura, já é SSOT no fluxo de briefing) espelha o padrão da 22.11 sem construir UI nova. Fail-safe: qualquer mensagem que não seja confirmação clara vira novo ajuste (não gasta crédito). Resumo + custo + pergunta cabem em UMA mensagem do agente: *"Ok, removi o filtro de tamanho e indústria. A nova busca custa ~R$X. Confirma?"*.
- **Trap #1 (parser esquece campos):** o `/parse` re-deriva o briefing do transcript; a memória da 22.3 (`conversationRef`, que carrega os resumos confirmados) impede o esquecimento — por isso reusar `callParseAPI`, não montar chamada nova. O resumo do ajuste exibe o delta para o usuário pegar um campo perdido; a confirmação é o backstop determinístico.
- **Durabilidade opcional do estado de ajuste:** como `metadata.rejected` fica durável, o client PODE, no load das mensagens, reentrar em ajuste se o último `approval_gate` do step ativo estiver rejeitado e não houver gate mais novo (integra com reattach 22.8). Recomendado, não bloqueante.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/components/agent/AgentChat.test.tsx` -- expected: novos testes do ramo de ajuste (parse→PATCH→resumo; confirm→execute; não-confirmação→re-ajuste; fora do estado→persist-only) verdes; RED provado contra o código atual (msg pós-confirmação não dispara parse/execute).
- `npx vitest run __tests__/unit/app/api/agent/executions/steps/reject.test.ts` -- expected: reject carimba `metadata.rejected` na mensagem approval_gate; step segue `awaiting_approval`.
- `npx vitest run` -- expected: suíte cheia sem novas falhas.
- `npx tsc --noEmit` -- expected: 0 erros novos em `src/`.
- `npx eslint <arquivos tocados> --max-warnings=0` -- expected: limpo.

**Manual checks (smoke real — definição de pronto, AC6):**
- Pela interface real (skill `verify`, Playwright): iniciar execução guiada → busca de leads → "Rejeitar" → digitar ajuste em linguagem natural → ver resumo + custo → confirmar → nova busca executa e reabre o gate de aprovação (parar aí; guardrail de custo). Confirmar que o card antigo permanece rejeitado após refresh.
