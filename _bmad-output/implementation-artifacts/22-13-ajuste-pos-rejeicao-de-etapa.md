# Story 22.13: Ajuste Pós-Rejeição de Etapa — a resposta do usuário precisa ter um consumidor

Status: draft

> **P1 — hoje rejeitar uma etapa é um beco sem saída.** O agente pergunta "o que você gostaria de ajustar?" e ignora a resposta para sempre.

## Story

As a usuário do Agente TDEC,
I want que, ao rejeitar uma etapa (ex.: leads ruins) e responder o que quero ajustar, o agente aplique o ajuste e re-execute a etapa,
so that eu não precise abandonar a conversa inteira (e o briefing que construí) só porque a primeira busca não veio boa.

## Contexto (bug reproduzido em teste E2E, 2026-07-24)

Busca de leads retornou 0 resultados → "Rejeitar" → agente: *"Entendido. O que você gostaria de ajustar na etapa 'Busca de Leads'?"* → usuário respondeu **duas vezes** ("remove o filtro de tamanho e o de indústria...", "pode buscar de novo sem os filtros?") → **zero reação**. Network: `POST /messages` 201 e só polling — nenhum `briefing/parse`, nenhum PATCH, nenhum re-execute. Única saída: "Nova conversa" (perde tudo).

**Diagnóstico confirmado em código:**

- O route de reject ([reject/route.ts:122-136](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts#L122)) só insere a mensagem-pergunta e mantém o step `awaiting_approval`. Comentário do próprio arquivo: "Pipeline does NOT advance until user approves". **Não existe consumidor da resposta.**
- No cliente, [AgentChat.tsx:302-303](../../src/components/agent/AgentChat.tsx#L302): com `briefingState.status === "confirmed"`, `handleSendMessage` cai no "fluxo normal" = `sendMessageMutation.mutate(...)` — a mensagem é **persistida e nada mais**. Todo o roteamento inteligente (parse/briefing flow) só existe PRÉ-confirmação.
- A UI marca o card como "❌ Rejeitado" e desabilita os botões, mas o step segue `awaiting_approval` no banco — não há sequer um estado "rejeitado aguardando ajuste".

## Acceptance Criteria

1. **[Estado de ajuste]** **Given** uma execução guiada com step em `awaiting_approval` **When** o usuário clica "Rejeitar" **Then** o sistema entra num estado identificável de **ajuste pós-rejeição** (client-side no mínimo; avaliar persistir `rejected_at`/flag no step) **And** o input de chat fica habilitado com placeholder orientando ("Descreva o ajuste — ex.: 'remove o filtro de tamanho'").

2. **[A resposta é parseada e aplicada ao briefing]** **Given** o estado de ajuste ativo **When** o usuário envia uma mensagem **Then** ela é enviada ao parser de briefing (`/parse`, LLM só na conversa — NFR1) com o briefing atual como contexto **And** os campos ajustados (ex.: `companySize: null`, `industry: null`) são aplicados e persistidos via `PATCH /briefing` **And** o agente re-apresenta um resumo curto do ajuste ("Ok — removi o filtro de tamanho e indústria. Vou buscar de novo.").

3. **[Re-execução do step rejeitado]** **Given** o ajuste aplicado **Then** o step rejeitado é re-executado (`POST /steps/{n}/execute`) com o briefing atualizado **And** o novo resultado abre um novo gate de aprovação (novo card de revisão) **And** o card antigo permanece no histórico marcado como rejeitado (auditoria).

4. **[Guard determinístico — padrão 22.11]** **Given** a lição da 22.11 (LLM não decide sozinho fluxo caro) **Then** a re-execução (que gasta créditos) só dispara após o usuário **ver o resumo do ajuste e confirmar** (ex.: "Confirma a nova busca?" + sim/ajusta de novo) — nunca direto da interpretação do LLM **And** o custo estimado da re-execução é re-exibido antes da confirmação.

5. **[Sem regressão nos fluxos existentes]** **Given** approve normal, autopilot, e o fluxo de briefing pré-confirmação **Then** nada muda neles (o roteamento novo só ativa no estado de ajuste pós-rejeição).

6. **[Smoke real]** **Given** que a suíte mocka OpenAI e pipeline **Then** smoke pela interface real: rejeitar uma busca → pedir ajuste em linguagem natural → confirmar → nova busca executa e reabre aprovação (parar aí; guardrail de custo).

## Tasks / Subtasks

- [ ] **Task 1 — Estado de ajuste** (AC: #1): store/hook (`adjustingStep: number | null`) setado no sucesso do reject; placeholder do input.
- [ ] **Task 2 — Roteamento da mensagem no estado de ajuste** (AC: #2): em `handleSendMessage`, ramo novo ANTES do "fluxo normal" quando `adjustingStep != null` → `/parse` com briefing atual → aplicar delta → `PATCH /briefing` → resumo.
- [ ] **Task 3 — Confirmação + re-execute** (AC: #3, #4): mini-gate de confirmação; ao confirmar, `POST /steps/{n}/execute` e limpar `adjustingStep`.
- [ ] **Task 4 — Backend (avaliar)** (AC: #1, #3): o execute route aceita re-execução de step `awaiting_approval`? Mapear a máquina de estados de `agent_steps` e ajustar guardas se necessário (CAS da 22.10 intocado).
- [ ] **Task 5 — Testes RED→GREEN + smoke real** (AC: #5, #6): RED = hoje a mensagem pós-rejeição não dispara nada.

## Dev Notes

- **NFR1 sagrado**: LLM interpreta a CONVERSA (que ajuste fazer); o pipeline re-executa deterministicamente. A decisão cara (re-busca paga) exige confirmação explícita do usuário (padrão âncora da 22.11 / D1 da 22.4).
- **Trap #1**: o `/parse` retorna briefing completo — cuidado com o parser "esquecer" campos preenchidos (mandar o briefing atual como contexto; a mecânica de memória da 22.3 já faz isso no fluxo de briefing — REUSAR, não duplicar).
- **Trap #2**: step re-executado gasta de novo — por isso o gate do AC4. O custo já existe no plan (`/plan`); re-exibir o número da etapa.
- **Trap #3**: não confundir com o fluxo de rejeição de CAMPANHA (AgentCampaignPreview) — mesma UX de rejeição, mesmo dead-end. O design do estado de ajuste deve nascer genérico por step (`adjustingStep`), cobrindo busca E campanha.
- Dependência conceitual: a 22.14 (0 resultados) usa este handler como caminho de recuperação. Sequência sugerida: 22.13 → 22.14.

### References

- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts#L122-L136] — reject insere pergunta e para
- [Source: src/components/agent/AgentChat.tsx#L302-L303] — mensagens pós-briefing só são persistidas
- [Source: src/components/agent/AgentApprovalGate.tsx] — UI do gate (botões aprovar/rejeitar)
- [Source: _bmad-output/implementation-artifacts/22-11-guard-import-leads-e-modelo-do-parser.md] — padrão "LLM sugere, âncora/confirmação decide"
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — evidência (2 mensagens ignoradas, network limpo)

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E — dead-end pós-rejeição reproduzido com evidência de network; diagnóstico em código (reject route sem consumidor + AgentChat fluxo "normal" inerte). Status: draft. |
