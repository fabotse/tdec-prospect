# Story 22.12: Fix da Ativação no Instantly — endpoint de contas inexistente (email_list) + degradação graciosa no defer

Status: draft

> **P0 — hoje NENHUMA campanha do agente consegue anexar contas de envio.** A ativação real e o "Ativar Depois" quebram no mesmo ponto.

## Story

As a usuário do Agente TDEC,
I want que a etapa de Ativação funcione — tanto "Ativar Campanha" quanto "Ativar Depois" —,
so that a campanha exportada saia do agente pronta (com contas de envio anexadas) em vez de morrer num "Erro interno. Tente novamente." no último passo do fluxo.

## Contexto (bug reproduzido em teste E2E, 2026-07-24)

Fluxo completo executado ao vivo (briefing → guiado → 2 leads aprovados → campanha → export Instantly ✅). No gate de ativação, selecionada 1 conta de envio e clicado **"Ativar Depois"**:

```
[instantly] HTTP 404 Not Found {"message":"Route POST:/api/v2/account-campaign-mappings not found","error":"Not Found","statusCode":404}
[Execute Step] PipelineError step=5: {"code":"ORCHESTRATOR_SKIP_FAILED","message":"Erro interno. Tente novamente.","stepNumber":5,"stepType":"activate","isRetryable":false}
POST /api/agent/executions/.../steps/5/execute 500
```

UI: card de erro *"Erro na etapa 'Ativação': Erro interno. Tente novamente.. Entre em contato com o suporte."* — execução vai para `paused` e o usuário fica sem saída. Nota a contradição: `isRetryable: false` mas a mensagem manda "tentar novamente".

**Diagnóstico confirmado em código:**

- `InstantlyService.addAccountsToCampaign` ([instantly.ts:312-319](../../src/lib/services/instantly.ts#L312)) faz um loop de `POST /api/v2/account-campaign-mappings` por conta ([instantly.ts:62](../../src/lib/services/instantly.ts#L62), Story 7.5). **A rota não existe na API v2 do Instantly** — o próprio Instantly responde "Route not found". Ou nunca existiu ou foi removida.
- **3 call sites** dependem dela:
  1. [activate-step.ts:74](../../src/lib/agent/steps/activate-step.ts#L74) — **"Ativar Campanha" (via principal) quebra igual**
  2. [orchestrator.ts:231](../../src/lib/agent/orchestrator.ts#L231) — "Ativar Depois" (o 500 reproduzido); o attach roda ANTES do skip, então a falha derruba a etapa inteira
  3. [route.ts:59](../../src/app/api/instantly/campaign/[id]/accounts/route.ts#L59) — rota avulsa `POST /api/instantly/campaign/[id]/accounts`
- A suíte **mocka o Instantly** → verde não prova a rota externa. Mesma classe da lição do Epic 21 ([[project-schema-constraint-blind-spot]], 4ª dimensão: fronteiras que o mock não simula).

## Acceptance Criteria

1. **[Endpoint correto verificado na doc oficial]** **Given** a doc oficial da API v2 do Instantly (developer.instantly.ai) **When** `addAccountsToCampaign` for reescrito **Then** ele usa o mecanismo canônico da v2 para associar contas de envio a uma campanha — hipótese de trabalho: `PATCH /api/v2/campaigns/{id}` com o campo **`email_list`** (array de e-mails das contas) — **And** a forma exata (endpoint, verbo, shape do body, semântica replace-vs-append) é **verificada na doc oficial durante o dev**, não assumida (regra [[feedback-cost-model-accuracy]]: fonte oficial, não memória/blog).

2. **[Os 3 call sites funcionam]** **Given** a correção **Then** os 3 call sites (activate-step, orchestrator defer, rota avulsa) passam a anexar contas com sucesso via o método corrigido **And** nenhum call site mantém referência ao endpoint morto (`account-campaign-mappings` some do runtime; tipos de request/response obsoletos em [instantly.ts (types):206-221](../../src/types/instantly.ts#L206) são removidos ou marcados deprecated).

3. **[Defer degrada com graça]** **Given** o caminho "Ativar Depois" ([orchestrator.ts:223-236](../../src/lib/agent/orchestrator.ts#L223)) **When** o attach de contas falhar por QUALQUER motivo **Then** a etapa **não** falha inteira: o skip conclui, a execução completa com `activationDeferred: true`, e a mensagem-resumo avisa explicitamente que as contas não foram anexadas ("anexe manualmente no Instantly") **And** o comportamento atual de sucesso (contas anexadas + resumo normal) é preservado. Racional: adiar a ativação é a intenção primária do usuário; o attach é acessório.

4. **[Ativação real continua fail-fast]** **Given** o caminho "Ativar Campanha" ([activate-step.ts](../../src/lib/agent/steps/activate-step.ts)) **Then** ali a falha de attach CONTINUA bloqueando (ativar sem conta de envio dispararia campanha inerte/quebrada) **And** a mensagem de erro ao usuário passa a ser específica ("Não consegui anexar as contas de envio no Instantly") em vez de "Erro interno".

5. **[Mensagem coerente com isRetryable]** **Given** um `PipelineError` com `isRetryable: false` **Then** a mensagem exibida NÃO diz "Tente novamente" (varrer o formatter de erro da etapa; coerência mensagem ↔ flag).

6. **[Testes + smoke real]** **Given** a lição "mock não prova fronteira externa" **Then** (a) testes de contrato mockados cobrem o novo request shape (endpoint/verbo/body) nos 3 call sites; (b) RED provado: o teste do shape falha contra o código antigo; (c) **smoke real** (definição-de-pronto): repetir o fluxo E2E com 1-2 leads + "Ativar Depois" com conta selecionada → execução completa sem erro E contas visíveis na campanha no Instantly; "Ativar Campanha" real fica a critério do Fabossi (dispara envio de verdade).

## Tasks / Subtasks

- [ ] **Task 1 — Verificar a doc oficial do Instantly v2** (AC: #1)
  - [ ] Confirmar o mecanismo de associação de contas (campaigns PATCH `email_list` vs outro endpoint); documentar a URL da doc consultada nas Dev Notes.
  - [ ] Confirmar semântica: o PATCH substitui ou mescla `email_list`? (Se substitui, ler a campanha antes e mesclar para não derrubar contas existentes.)
- [ ] **Task 2 — Reescrever `addAccountsToCampaign`** (AC: #1, #2)
  - [ ] Trocar o loop de POSTs pelo novo request; manter a assinatura `AddAccountsParams`/`AddAccountsResult` (call sites intactos onde possível).
  - [ ] Remover/deprecar endpoint constante e tipos mortos.
- [ ] **Task 3 — Degradação graciosa no defer** (AC: #3)
  - [ ] Envolver o attach em try/catch próprio no ramo `activationDeferred` do orchestrator; falha → log + flag `accountsAttachFailed: true` no output + mensagem-resumo com aviso; skip/completion seguem.
- [ ] **Task 4 — Mensagens de erro** (AC: #4, #5)
- [ ] **Task 5 — Testes (RED→GREEN) + smoke real E2E** (AC: #6)

## Dev Notes

- **NFR1**: pipeline segue determinístico — só muda o request HTTP e o tratamento de erro. Zero migration (NFR5).
- **Trap #1**: não confundir `email_list` da CAMPANHA (contas de envio) com lista de leads. Na v2, leads entram por `/api/v2/leads`; contas de envio são atributo da campanha.
- **Trap #2**: `getServiceApiKey`/service-keys (22.9) já resolve a chave por service-role — não tocar.
- **Trap #3**: rate limit — o método antigo fazia N POSTs com delay; o novo provavelmente é 1 request só (melhor). Conferir se `RATE_LIMIT_DELAY_MS` ainda é necessário ali.
- A execução quebrada do teste (`98b5ae57`, paused) e a campanha "Campanha - Teste Atibaia" no Instantly (2 leads, sem contas, não ativada) podem servir de fixture do smoke.

### References

- [Source: src/lib/services/instantly.ts#L62] — constante do endpoint morto
- [Source: src/lib/services/instantly.ts#L312] — `addAccountsToCampaign` (alvo)
- [Source: src/lib/agent/steps/activate-step.ts#L74] — call site ativação real
- [Source: src/lib/agent/orchestrator.ts#L223-L236] — call site defer (attach antes do skip)
- [Source: src/app/api/instantly/campaign/[id]/accounts/route.ts#L59] — rota avulsa
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — relatório do teste E2E (evidência)

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E ponta-a-ponta do agente — 404 real do Instantly capturado no log do dev server; 3 call sites mapeados; prioridade P0 (bloqueia toda ativação). Status: draft (revisar com Fabossi antes de dev-story). |
