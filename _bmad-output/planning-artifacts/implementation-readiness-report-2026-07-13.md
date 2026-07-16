---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
documentsIncluded:
  prd: _bmad-output/planning-artifacts/prd.md
  architecture: _bmad-output/planning-artifacts/architecture.md
  architectureSupplement: _bmad-output/planning-artifacts/architecture-epic-20-niveis-de-acesso.md
  epicTarget: _bmad-output/planning-artifacts/epic-21-loop-de-resposta.md
  ux: _bmad-output/planning-artifacts/ux-design-specification.md
  referencias:
    - _bmad-output/planning-artifacts/plano-evolucao-maquina-de-resultado-2026-07-10.md
    - _bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md
    - _bmad-output/planning-artifacts/epic-10-campaign-tracking.md
    - _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md
    - _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md
    - _bmad-output/planning-artifacts/epics-agente-tdec.md
    - _bmad-output/planning-artifacts/epics.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-13
**Project:** tdec-prospect
**Escopo:** Epic 21 — Loop de Resposta (validação pré-implementação)

## 1. Inventário de Documentos

### PRD
- `prd.md` (22,3 KB, 26/03/2026) — versão inteira; sem sharded. ✅

### Architecture
- `architecture.md` (92,8 KB, 26/03/2026) — principal. ✅
- `architecture-epic-20-niveis-de-acesso.md` (24,2 KB, 16/06/2026) — suplemento escopado ao Epic 20 (não é duplicata).

### Epics & Stories
- **Alvo:** `epic-21-loop-de-resposta.md` (19,5 KB, 13/07/2026)
- Referências para reusos brownfield:
  - `epic-10-campaign-tracking.md` (25,4 KB) — instantly-webhook / campaign_events
  - `epic-13-monitoramento-inteligente-leads-linkedin.md` (11 KB) — monitoring_approach_suggestion
  - `epic-14-analytics-avancado-campanha.md` (11,3 KB) — lt_interest_status
  - `epics-agente-tdec.md` (44,1 KB) — provável origem do Epic 11 / ZApiService (não existe `epic-11-*.md` dedicado)
  - `epics.md` (94 KB) — lista master de epics

### UX Design
- `ux-design-specification.md` (59,5 KB, 06/02/2026)

### Inputs de referência adicionais
- `plano-evolucao-maquina-de-resultado-2026-07-10.md` (11,4 KB) — Fase 1
- `_bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md` (5,6 KB) — spike de validação de APIs

### Issues do inventário
- ✅ Nenhuma duplicata whole + sharded.
- ⚠️ Não existe arquivo dedicado `epic-11-*.md`; reuso do ZApiService provavelmente documentado em `epics-agente-tdec.md` (verificar na análise).
- ⚠️ PRD e architecture.md datam de 26/03/2026 (~3,5 meses antes do Epic 21) — verificar se o épico se sustenta sem atualização dos documentos base.

## 2. PRD Analysis

### Escopo do PRD vs Escopo da Avaliação (⚠️ achado estrutural)

O `prd.md` (2026-03-25) é escopado à feature **Agente TDEC** (implementada nos Epics 16–17; Epic 18 em backlog). O **Epic 21 (Loop de Resposta) não possui FRs/NFRs formais no PRD** — sua fonte de requisitos é o `plano-evolucao-maquina-de-resultado-2026-07-10.md` (Fase 1), tratado aqui como fonte de requisitos complementar. A rastreabilidade do Epic 21 será validada contra a Fase 1 do plano, e a consistência com o PRD será verificada onde houver interseção (Growth Phase 2 do PRD prevê "Monitoramento proativo via WhatsApp (leads quentes)" — precursor direto da story 21.5).

### Functional Requirements extraídos do PRD (Agente TDEC)

**Briefing Conversacional:**
- FR1: Usuario pode iniciar uma sessao com o agente via interface de chat de texto
- FR2: Usuario pode descrever o que deseja prospectar em linguagem natural (tecnologia, cargo, localizacao, produto)
- FR3: Agente pode interpretar o briefing e extrair parametros estruturados (tecnologia, cargo, localizacao, produto, modo)
- FR4: Agente pode fazer perguntas guiadas quando nao consegue extrair todos os parametros do briefing
- FR5: Usuario pode selecionar o modo de operacao (Guiado ou Autopilot)
- FR6: Agente pode apresentar o plano de execucao antes de iniciar o pipeline
- FR7: Agente pode apresentar estimativa de custo antes de iniciar a execucao
- FR8: Usuario pode confirmar ou cancelar a execucao apos ver o plano e custo estimado
- FR9: Agente pode exibir mensagem de onboarding na primeira interacao do usuario

**Orquestracao de Pipeline:**
- FR10: Agente pode executar o pipeline completo: busca empresas -> busca leads -> criacao campanha -> export -> ativacao
- FR11: Agente pode adaptar o pipeline ao contexto do briefing (pular etapas nao aplicaveis)
- FR12: Agente pode salvar checkpoint ao concluir cada etapa do pipeline
- FR13: Agente pode retomar execucao a partir do ultimo checkpoint sem reprocessar etapas concluidas
- FR14: Agente pode preservar creditos de API ja gastos em etapas concluidas (nao reusar)
- FR15: Agente pode executar o pipeline em modo Guiado (com approval gates) ou Autopilot (sem interrupcoes)

**Approval Gates (Modo Guiado):**
- FR16: Agente pode pausar apos busca de empresas e apresentar resultados para aprovacao
- FR17: Agente pode pausar apos busca de leads e apresentar amostra para aprovacao
- FR18: Usuario pode revisar o lote completo de leads, filtrar e remover leads individuais antes de aprovar
- FR19: Agente pode pausar apos criacao de campanha e apresentar preview para revisao
- FR20: Usuario pode editar conteudo da campanha (textos dos emails) antes de aprovar
- FR21: Agente pode pausar antes da ativacao no Instantly para confirmacao final
- FR22: Usuario pode aprovar ou rejeitar em cada approval gate

**Criacao Inteligente de Campanha:**
- FR23: Agente pode criar campanha utilizando dados da Knowledge Base (perfil empresa, ICP, tom de voz)
- FR24: Agente pode selecionar o produto correto da Knowledge Base para a campanha
- FR25: Agente pode gerar icebreakers personalizados com base em posts recentes do LinkedIn do lead
- FR26: Agente pode gerar sequencia de emails com estrutura otimizada (quantidade, intervalos, objetivo)
- FR27: Agente pode detectar que um produto mencionado no briefing nao existe na Knowledge Base
- FR28: Usuario pode cadastrar um novo produto via conversa inline durante o briefing
- FR29: Agente pode utilizar o produto recem-cadastrado imediatamente na campanha corrente

**Export e Ativacao:**
- FR30: Agente pode exportar campanha com leads para o Instantly
- FR31: Agente pode configurar sending accounts na campanha exportada
- FR32: Agente pode ativar a campanha no Instantly

**Monitoramento de Execucao:**
- FR33: Agente pode exibir feedback visual de progresso durante cada etapa do pipeline
- FR34: Agente pode exibir resumo final com metricas apos conclusao (leads, emails, custo total)
- FR35: Agente pode registrar execution log de cada etapa (input, output, decisao)
- FR36: Agente pode exibir mensagem clara quando uma etapa falha, indicando qual etapa e o motivo
- FR37: Usuario pode escolher entre retry imediato ou retomar depois apos uma falha
- FR38: Usuario pode visualizar lista de execucoes pausadas/incompletas
- FR39: Usuario pode retomar uma execucao pausada a partir do ponto onde parou

**Rastreamento de Custos:**
- FR40: Agente pode calcular estimativa de custo pre-execucao baseada no volume e APIs envolvidas
- FR41: Agente pode rastrear custo real de cada etapa durante a execucao
- FR42: Agente pode exibir custo total ao final da execucao

**Total FRs: 42** (nenhum específico do Epic 21)

### Non-Functional Requirements extraídos do PRD

- NFR1 (Performance): Cada etapa do pipeline deve exibir feedback visual de progresso enquanto processa
- NFR2 (Performance): Pipeline completo deve concluir em < 15 minutos para execucoes tipicas (ate 100 leads)
- NFR3 (Performance): Respostas do agente no chat devem retornar em < 5 segundos, com loading visivel
- NFR4 (Integracao): Tratar erros de APIs externas com mensagens claras indicando qual servico falhou (problema externo)
- NFR5 (Integracao): Retry com backoff exponencial (max 3 tentativas) em cada chamada a API externa
- NFR6 (Integracao): Tolerancia a indisponibilidade parcial — falha em um servico nao corrompe etapas concluidas
- NFR7 (Confiabilidade): Taxa de conclusao do pipeline >= 90%
- NFR8 (Confiabilidade): Checkpoint persistido em banco antes de iniciar etapa seguinte
- NFR9 (Confiabilidade): Execucoes retomadas concluem com sucesso em >= 95% dos casos
- NFR10 (Confiabilidade): Creditos de API de etapas concluidas nunca reprocessados em retomada
- NFR11 (Seguranca): API keys encriptadas no Supabase (api_configs existente)
- NFR12 (Seguranca): Execution logs sem API keys/tokens em texto plano

**Total NFRs: 12** — NFR4, NFR5, NFR11 e NFR12 são diretamente aplicáveis ao Epic 21 (novas chamadas a APIs externas: Instantly emails API, OpenAI, Z-API).

### Requisitos adicionais — Fase 1 do Plano de Evolução (fonte de requisitos do Epic 21)

Stories propostas na Fase 1 ("O Pop-up do Lead"):
1. **21.1 — Processador de respostas:** ao receber `reply_received` no webhook (`supabase/functions/instantly-webhook`), atualizar status do lead (`em_campanha` → `interessado`), registrar `lead_interaction`, enfileirar classificação. Elimina import manual de CSV.
2. **21.2 — Classificação de intenção por IA:** corpo da resposta (API Instantly) + `lt_interest_status` como sinal; classes: `interessado`/`pediu_info`/`objeção`/`não_agora`/`opt_out`. Prompt `reply_intent_classification` no padrão `ai_prompts`.
3. **21.3 — Central de Oportunidades** (`/opportunities`, sidebar com badge): inbox cross-campanha; card = lead + empresa + campanha + engajamento + resposta + insight LinkedIn + telefone (SignalHire 1-clique).
4. **21.4 — Próximo passo sugerido pela IA:** rascunho de resposta/abordagem (reusa padrão `monitoring_approach_suggestion`); ações: WhatsApp (Z-API), copiar, marcar `oportunidade`/`descartado`.
5. **21.5 — Notificação proativa:** WhatsApp via Z-API + e-mail + badge in-app persistido em banco; config em `/settings/monitoring`.
6. **21.6 — Elevar a Janela de Oportunidade:** de analytics por campanha para alimentar a Central (cross-campanha), incluindo cliques.

Riscos/constraints registrados no plano:
- Corpo da resposta via API Instantly V2: confirmar endpoint/escopo (fallback: `lt_interest_status` + heurística)
- Webhook do Instantly precisa estar configurado no ambiente do cliente (ou polling mais frequente)
- Apollo API no plano Basic: pendência conhecida
- Não virar CRM (Central entrega o lead e para ali)
- Registro de "reunião marcada" deve ser 1 clique

### PRD Completeness Assessment (parcial — visão do PRD)

- ✅ PRD completo e bem estruturado para seu escopo (Agente TDEC): 42 FRs numerados, 12 NFRs categorizados, jornadas com rastreabilidade FR↔Journey.
- ⚠️ O PRD **não cobre o Epic 21**; não houve atualização formal do PRD para o Loop de Resposta. A Fase 1 do plano de evolução funciona como requirements source de fato, com stories já propostas — mas sem FRs/NFRs numerados nem critérios de aceitação formais no nível de requisito.
- ⚠️ Interseção relevante: PRD Growth (Phase 2) previa "Monitoramento proativo via WhatsApp (leads quentes)" — o Epic 21 concretiza isso; não há conflito, há continuidade.

## 3. Epic Coverage Validation

### Disposição dos FRs do PRD (Agente TDEC)

Os 42 FRs e 12 NFRs do PRD pertencem ao escopo dos Epics 16–18 (Agente TDEC): Epics 16–17 implementados (done), Epic 18 (retry/checkpoint/custo real — FR12–14, FR36–42) permanece em **backlog**, planejado como Fase 3 do plano de evolução. **Nenhum FR do PRD era esperado no Epic 21** — sem lacunas atribuíveis a este épico. O Epic 18 em backlog não é bloqueador do Epic 21 (sem dependência técnica).

### Rastreabilidade: Fase 1 do Plano de Evolução → Epic 21

| Story proposta no plano | FRs do épico | Story(s) do épico | Status |
|---|---|---|---|
| 21.1 Processador de respostas (auto-status, lead_interaction, fila) | FR1, FR5, FR6 | 21.2 (AC1, AC3), 21.3 (AC3) | ✓ Coberto |
| 21.2 Classificação de intenção por IA (+ lt_interest_status) | FR3, FR4 | 21.3 (AC1, AC2) | ✓ Coberto |
| 21.3 Central de Oportunidades (/opportunities, badge, card completo) | FR8, FR9 | 21.4 (AC1–AC3) | ✓ Coberto |
| 21.4 Próximo passo sugerido pela IA + ações do card | FR10, FR11 | 21.5 (AC1–AC3) | ✓ Coberto |
| 21.5 Notificação proativa (WhatsApp + e-mail + badge em banco) | FR13, FR14, FR15 | 21.7 (AC1–AC3) | ⚠️ Parcial: canal **e-mail** citado no plano não aparece nos FRs nem na story 21.7 (só WhatsApp + in-app) |
| 21.6 Elevar Janela de Oportunidade (cross-campanha + cliques) | FR12 | 21.6 (AC1–AC4) | ✓ Coberto |

Adições do épico além do plano (todas endereçam riscos/observações do próprio plano): FR2 (filtro de auto-reply), FR7 (backfill retroativo — mata o import de CSV também para o passado), FR16 (reunião marcada 1-clique — risco "input humano" do plano), story 21.1 de fundação (schema + validação real das 4 pendências do spike). A numeração de stories do épico diverge da proposta do plano (o épico insere 21.1 de fundação e desloca as demais) — divergência documentada, não é gap.

### Matriz de cobertura: FRs do Epic 21 → Stories (verificada contra ACs)

| FR | Requisito (resumo) | Story/AC | Status |
|---|---|---|---|
| FR1 | Detecção automática de reply via webhook | 21.2 AC1 | ✓ |
| FR2 | Auto-reply não gera lead quente | 21.2 AC2 | ✓ |
| FR3 | Classificação de intenção por IA (5 classes) | 21.3 AC1 | ✓ |
| FR4 | Ensemble com lt_interest_status | 21.3 AC2 | ✓ |
| FR5 | Auto-atualização de status do lead | 21.3 AC3 | ✓ |
| FR6 | Registro em lead_interactions | 21.2 AC3 | ✓ |
| FR7 | Backfill retroativo | 21.2 AC4 | ✓ |
| FR8 | Central de Oportunidades (página+sidebar+badge) | 21.4 AC1 | ✓ |
| FR9 | Card com contexto completo | 21.4 AC2–AC3 | ✓ |
| FR10 | Rascunho de próximo passo por IA | 21.5 AC1–AC2 | ✓ |
| FR11 | Ações do card (WhatsApp, mailto, telefone, triagem) | 21.5 AC3–AC4 | ✓ |
| FR12 | Janela de Oportunidade cross-campanha | 21.6 AC1–AC4 | ✓ |
| FR13 | Notificação proativa WhatsApp | 21.7 AC1 | ✓ |
| FR14 | Notificação in-app persistida em banco | 21.7 AC2 | ✓ |
| FR15 | Configuração de canais | 21.7 AC3 | ✓ |
| FR16 | Reunião marcada 1-clique | 21.5 AC4 | ✓ |

### Cobertura de NFRs do épico

| NFR | Story/AC implementadora | Status |
|---|---|---|
| NFR1 fail-open IA | 21.3 AC4, 21.5 AC5, 21.7 AC4 | ✓ |
| NFR2 idempotência | 21.1 AC1, 21.2 AC1/AC4 | ✓ |
| NFR3 notificação ≤5 min | 21.7 AC1 | ✓ |
| NFR4 RLS + PT-BR | 21.1 AC3, 21.4 AC7 | ✓ |
| NFR5 polling respeita rate limit | **NENHUMA STORY** | ❌ Órfão |
| NFR6 custo IA em api_usage_logs | 21.3 AC5, 21.5 AC6 | ✓ |

### Missing Coverage / Gaps

**Gap 1 (ATENÇÃO — NFR5 órfão):** O fallback por polling (`GET /api/v2/emails`, `email_type=received`) é citado no spike e no NFR5, mas **nenhuma story o implementa**. O caminho único de detecção é o webhook. O plano de evolução alerta: "o loop de resposta precisa do webhook OU de polling mais frequente". Mitigação existente: story 21.1 AC5 valida o registro do webhook no workspace antes das demais stories. **Recomendação:** decidir explicitamente — (a) declarar polling fora do escopo do MVP do épico e remover/reformular NFR5, ou (b) adicionar AC de fallback (ex.: na 21.2) caso o webhook não possa ser registrado no ambiente do cliente.

**Gap 2 (MENOR — quick win do plano fora do épico):** "Exibir `lt_interest_status` na LeadTrackingTable e na Janela de Oportunidade" (quick win #1 do plano, seção 4) não está em nenhum FR/story. O dado é gravado na `opportunity` (21.3 AC2), mas a exposição na tabela de tracking existente ficou de fora. **Recomendação:** confirmar se é intencional (pode ser entregue avulso, é UI-only) ou adicionar como AC na 21.4/21.6.

**Gap 3 (MENOR — canal e-mail):** O plano cita notificação por "WhatsApp + e-mail + badge in-app"; o épico implementa WhatsApp + in-app e omite e-mail (FR13–FR15, story 21.7). Provável decisão de escopo consciente (e-mail exigiria infra de envio transacional nova) — **documentar a exclusão explicitamente** no épico para não parecer esquecimento.

### Coverage Statistics

- FRs do Epic 21: 16/16 cobertos por stories com ACs verificados (100%)
- NFRs do Epic 21: 5/6 com story implementadora (83%) — NFR5 órfão
- Stories da Fase 1 do plano: 6/6 rastreadas (1 parcial — canal e-mail)
- FRs do PRD: 0 esperados neste épico; 0 faltantes atribuíveis

## 4. UX Alignment Assessment

### UX Document Status

**Encontrado:** `ux-design-specification.md` (59,5 KB, 06/02/2026) — design system completo do app (tokens, componentes, jornadas, responsividade). Anterior ao Epic 21; não contém spec dedicada da Central de Oportunidades.

### Alinhamentos confirmados

- ✅ **Jornada 2 do UX spec ("Escalonamento de Lead Interessado") é o blueprint do Epic 21.** O fluxo documentado — *Notificação: lead respondeu → abrir lead → ver histórico + resposta → resposta positiva? → buscar telefone (SignalHire) → ligar → marcar como "Oportunidade"* — é exatamente o que o épico automatiza e materializa (notificação 21.7, card com resposta + telefone 21.4/21.5, triagem com "reunião marcada" 21.5 AC4). O épico não inventa uma jornada nova; concretiza uma já especificada no UX. Tempo-alvo do UX ("<2 min do clique ao telefone") compatível com NFR3 (notificação ≤5 min).
- ✅ **Design system:** UX-DR1/UX-DR2 do épico ancoram em padrões já especificados no UX doc — estética Attio (espaçamento generoso, neutras + acentos), badges de status com `--success-muted`/`--warning-muted`, skeleton loaders, sidebar 240px/64px com badge (padrão Insights). Componentes shadcn/ui existentes cobrem card, badge, table, toast, skeleton.
- ✅ **Arquitetura suporta a superfície UX:** página nova no grupo `(dashboard)` do App Router, TanStack Query para dados, padrões de estados vazio/loading/erro já existentes em `OpportunityPanel`/`LeadTrackingTable`.

### Divergências e observações

- ⚠️ **Estados de triagem não idênticos à Jornada 2:** o UX prevê desfechos "Follow-up" (vai pensar) e "Tentar novamente" (não atendeu) com "Agendar lembrete"; o épico tem `contacted`/`discarded`/`meeting_booked` e intents `nao_agora`/`objecao`, **sem ação de lembrete/follow-up agendado**. Coerente com a diretriz "não virar CRM" do plano, mas a exclusão do lembrete deve ser consciente (a Jornada 2 o cita duas vezes). Não bloqueia.
- ⚠️ **Sem wireframe/spec dedicada da Central:** a UI da página nova é definida só pelos ACs da story 21.4 + UX-DRs por referência. Suficiente para um time que conhece o app (brownfield, padrões estabelecidos), mas vale um alinhamento visual rápido antes da 21.4 (ex.: rascunho do card) para evitar retrabalho.
- ℹ️ Badge da sidebar "em tempo real" (21.7 AC2): UX ok; o mecanismo (Supabase Realtime vs polling do TanStack Query) é decisão de arquitetura — verificado no passo seguinte.

### Warnings

- Nenhum bloqueador de UX. O épico herda um design system maduro e uma jornada já especificada; os dois pontos acima são refinamentos.

## 5. Epic Quality Review

### Estrutura do épico

- ✅ **Valor de usuário:** Epic 21 é orientado a resultado do usuário ("lead respondeu → oportunidade pronta na mão do vendedor"), não a marco técnico. Goal e value proposition claros.
- ✅ **Independência:** depende apenas dos Epics 10/11/13/14 (todos done, verificados no código). Habilita 22/23 sem requerê-los — FR16 (`meeting_booked_at`) coleta o dado agora com valor próprio (triagem visível) e alimenta o Epic 23 depois, sem dependência forward.
- ✅ **Sequência interna:** 21.1 → 21.7 só com dependências para trás (schema → processador → classificação → central → ações → engajamento → notificações). Nenhuma story referencia story futura.
- ✅ **Brownfield:** natureza aditiva explícita (receiver do webhook intocado — 21.2 AC6), pontos de integração nomeados, padrão defensivo de migration (21.1 AC6, `to_regclass` — aprendizado da 00053 com o banco gerenciado à mão).

### Verificação dos reusos brownfield no código (pedido explícito desta avaliação)

| Reuso citado no épico | Evidência no código | Status |
|---|---|---|
| `instantly-webhook` + `campaign_events` (Epic 10) | `supabase/functions/instantly-webhook/index.ts` — INSERT grava `payload: body` completo (JSONB, linha ~243), `ON CONFLICT DO NOTHING` (idempotência via unique constraint, base do NFR2) | ✅ Confirmado |
| Mapeamento `reply_received` → `email_replied` | `EVENT_TYPE_MAP` linha 54 — a query do épico (`event_type='email_replied'`, 21.1 AC5) está correta | ✅ Confirmado |
| `ZApiService` (Epic 11) | `src/lib/services/zapi.ts` + `src/actions/whatsapp.ts` | ✅ Confirmado |
| `monitoring_approach_suggestion` (Epic 13) | `src/lib/ai/prompts/defaults.ts`, `src/lib/utils/approach-suggestion.ts`, `monitoring-processor.ts` | ✅ Confirmado |
| `lt_interest_status` (Epic 14) | `src/lib/services/tracking.ts:166` — exatamente onde o plano/épico apontam | ✅ Confirmado |
| `opportunity-engine` (Epic 10) | `src/lib/services/opportunity-engine.ts` | ✅ Confirmado |
| `lead_interactions` | rotas `api/leads/[leadId]/interactions`, `create-batch`, `import-results` | ✅ Confirmado |
| `ai_prompts` / ADR-001 (fallback tenant→global→código) | `architecture.md` linhas 1969+ (ADR-001, schema, RLS) + PromptManager | ✅ Confirmado |
| `api_usage_logs` | `src/lib/services/usage-logger.ts` | ✅ Confirmado |
| SignalHire por lead | `src/lib/services/signalhire.ts` | ✅ Confirmado |
| `/settings/monitoring` | `src/app/(dashboard)/settings/monitoring/page.tsx` | ✅ Confirmado |

As 4 pendências do spike estão institucionalizadas na story 21.1 AC5 (webhook real, gating de plano, backfill real, escopo `emails:read`) — todas as 4 cobertas. ✅

### Achados por severidade

#### 🔴 Críticos

Nenhum.

#### 🟠 Maiores

1. **Story 21.2 AC2 (FR2) é intestável no caminho principal — conflito com o receiver existente.** O `EVENT_TYPE_MAP` do receiver não mapeia `auto_reply_received`; eventos não mapeados são **descartados silenciosamente** (`index.ts:173-182`, retorno `skipped`) e nunca chegam a `campaign_events`. Como o épico proíbe modificar o receiver (21.2 AC6), o processador jamais verá um payload `auto_reply_received` — o "Given" do AC2 é inalcançável via webhook. Na prática o receiver já faz a filtragem do FR2 (auto-replies não entram), o que é bom para o produto, mas o AC precisa ser reformulado: (a) reconhecer a filtragem no receiver e cobri-la com teste de regressão (garantir que `auto_reply_received` continua fora do mapa), e/ou (b) definir heurística defensiva para OOO que chegue disfarçado em `reply_received` (ex.: `lt_interest_status = 0` "Out of Office" do spike, padrões no subject/corpo).
2. **Semântica dupla do badge da sidebar.** 21.4 AC1 define o badge como "contagem de oportunidades `new`"; 21.7 AC2 define que "badge da sidebar reflete não-lidas [de `app_notifications`] em tempo real". São fontes de dados diferentes que divergem (oportunidade visualizada ≠ notificação lida). Reconciliar antes da implementação: recomendação — badge da sidebar = oportunidades `status='new'` (fonte única, simples); `app_notifications` alimenta histórico/central de notificações, não o badge.
3. **NFR5 (fallback por polling) sem story implementadora** — já detalhado no Gap 1 da seção 3; do ponto de vista de qualidade do épico, é um NFR declarado sem caminho de implementação. Decidir: fora do MVP (remover/reformular NFR5) ou AC adicional na 21.2.

#### 🟡 Menores

4. **Story 21.1 é técnica** ("As a desenvolvedor") e cria as 3 tabelas upfront — `notification_settings`/`app_notifications` só são usadas na 21.7 (violação formal de "tabela criada quando necessária"). Contexto atenuante forte: banco do cliente gerenciado à mão (dívida conhecida de schema versioning) torna consolidar migrations em um único ponto operacionalmente sensato, e a story carrega as validações reais do spike (fundação de de-risking). Manter, mas documentar o trade-off no épico — ou mover a migration das tabelas de notificação para a 21.7.
5. **Tipo de `lt_interest_status` inconsistente:** código existente tipa como `string` (`src/types/tracking.ts:309`); story 21.1 AC1 define coluna `int`; spike documenta escala numérica. Normalizar na ingestão (parse explícito) e cobrir com teste — senão o ensemble da 21.3 AC2 compara tipos diferentes.
6. **21.6 AC1 não especifica o threshold de cliques** (o engine atual só tem threshold de opens). Definir valor/regra (ex.: N cliques OU combinação opens+cliques) antes ou durante a story.
7. **Mecanismo do processador deferido** ("trigger de banco, cron ou invocação pós-insert" — 21.2 AC6). Aceitável como liberdade de implementação, mas o NFR3 (notificação ≤5 min) restringe a escolha: cron precisa de cadência ≤5 min ou usar trigger/realtime. Registrar a decisão na 21.2.

### Checklist de conformidade

- [x] Épico entrega valor de usuário
- [x] Épico funciona de forma independente (deps só em epics done — verificado no código)
- [x] Stories dimensionadas adequadamente (7 stories, escopo coeso por story)
- [x] Sem dependências forward
- [ ] Tabelas criadas quando necessárias (desvio consciente na 21.1 — item 4)
- [x] ACs claros em Given/When/Then, testáveis, com casos de erro (fail-open) — exceto 21.2 AC2 (item 1)
- [x] Rastreabilidade FR↔story mantida (16/16 + mapa de cobertura no próprio épico)

## 6. Summary and Recommendations

### Overall Readiness Status

**🟢 PRONTO COM AJUSTES PONTUAIS** — nenhum bloqueador crítico. O Epic 21 está acima da média de qualidade: rastreabilidade 100% verificada contra ACs, todos os 11 pontos de reuso brownfield confirmados no código, spike com pendências institucionalizadas na primeira story, sem dependências forward, ACs em BDD com fail-open e casos de erro. Os 3 achados maiores são reformulações de AC e decisões de escopo que cabem em uma edição do documento do épico — recomenda-se resolvê-los **antes de criar as stories** (`bmad-create-story`), não exigem replanejamento.

### Issues que exigem ação antes da implementação (maiores)

1. **21.2 AC2 / FR2 — filtro de auto-reply intestável:** o receiver já descarta `auto_reply_received` (não mapeado em `EVENT_TYPE_MAP`); o processador nunca verá esse payload. Reformular o AC: teste de regressão no comportamento do receiver + heurística defensiva opcional (`lt_interest_status = 0`) para OOO disfarçado em `reply_received`.
2. **Badge da sidebar com duas fontes:** 21.4 AC1 (oportunidades `new`) vs 21.7 AC2 (`app_notifications` não-lidas). Unificar semântica (recomendação: badge = oportunidades `new`).
3. **NFR5 órfão:** fallback por polling declarado sem story. Decidir: fora do MVP (reformular NFR5 como "quando implementado, respeitará...") ou AC de fallback na 21.2. A mitigação atual (21.1 AC5 valida webhook antes de tudo) torna a exclusão defensável.

### Decisões de escopo a registrar no épico (menores — 15 min de edição)

4. Canal **e-mail** de notificação (citado no plano, ausente no épico): declarar exclusão consciente ou adicionar.
5. Quick win do plano "**exibir `lt_interest_status` na LeadTrackingTable**": confirmar se sai avulso (fora do épico) ou vira AC da 21.4/21.6.
6. **Threshold de cliques** da Janela de Oportunidade (21.6 AC1): definir regra.
7. **Mecanismo do processador** (trigger vs cron): registrar que a escolha deve satisfazer NFR3 (≤5 min).
8. **Normalização de tipo** do `lt_interest_status` (string no código atual vs int no novo schema): anotar na 21.1/21.3.
9. Ação de **lembrete/follow-up** da Jornada 2 do UX (fora do épico, coerente com "não virar CRM"): documentar exclusão.
10. (Opcional) Alinhamento visual rápido do card da Central antes da 21.4 (não há wireframe dedicado).

### Observação estrutural (não bloqueia)

O PRD (26/03/2026) não foi atualizado para o Epic 21 — a Fase 1 do plano de evolução funciona como fonte de requisitos, e o próprio épico carrega inventário FR/NFR completo, o que compensa. Se o padrão de "épico carrega seus requisitos" se repetir (Epics 22–24), considerar formalizar isso ou atualizar o PRD por época de fase.

### Recommended Next Steps

1. Editar `epic-21-loop-de-resposta.md` aplicando os itens 1–3 (maiores) e registrando as decisões 4–9.
2. Rodar sprint planning para incluir o Epic 21 no `sprint-status.yaml`.
3. Criar a story 21.1 (`bmad-create-story`) — ela mesma fecha as 4 pendências operacionais do spike antes de qualquer código de feature.

### Final Note

Esta avaliação identificou **3 issues maiores e 8 menores/decisões de escopo** em 5 categorias (cobertura, NFRs, UX, qualidade de stories, consistência com código existente). Nenhum é impedimento estrutural; todos os maiores são corrigíveis com edição do épico. Os achados podem ser usados para aprimorar os artefatos, ou você pode optar por prosseguir como está — com o risco concentrado no item 1 (comportamento de auto-reply) e no item 2 (retrabalho de UI do badge).

**Avaliador:** Claude (bmad-check-implementation-readiness) · **Data:** 2026-07-13

## 7. Pós-Avaliação: Correções Aplicadas (2026-07-13)

Todas as issues foram resolvidas por edição do `epic-21-loop-de-resposta.md` na mesma sessão, com decisões do Fabossi:

| # | Issue | Resolução |
|---|---|---|
| 1 (maior) | 21.2 AC2 intestável (auto-reply) | AC reescrito: teste de regressão no receiver (garante `auto_reply_received` fora do `EVENT_TYPE_MAP`) + heurística defensiva `lt_interest_status = 0` no processador |
| 2 (maior) | Badge com duas fontes | Fonte única definida: badge = oportunidades `status='new'` (21.4 AC1); `app_notifications` é histórico, não alimenta badge (21.7 AC2 e FR14 atualizados) |
| 3 (maior) | NFR5 órfão (polling) | **Story 21.8 criada** — Reconciliação por Polling (rede de segurança): sweep no sync existente grava `campaign_events` com `source='polling'`, pipeline da 21.2 reusado; prioridade condicional ao gating de plano validado na 21.1 AC5. FR17 novo; cobertura 17/17 |
| 4 | Canal e-mail | Exclusão consciente registrada em "Fora do Escopo" |
| 5 | Quick win `lt_interest_status` na LeadTrackingTable | Fora do épico (avulso); registrado em "Fora do Escopo" |
| 6 | Threshold de cliques (21.6 AC1) | Definido: threshold de opens existente OU ≥1 clique |
| 7 | Mecanismo do processador vs NFR3 | Restrição registrada na 21.2 AC6 (cron ≤5 min ou trigger/realtime) |
| 8 | Tipo string/int do `lt_interest_status` | Normalização para int na ingestão registrada na 21.3 AC2 |
| 9 | Lembrete/follow-up da Jornada 2 | Exclusão consciente registrada ("não virar CRM") |

**Status final: 🟢 PRONTO** — épico com 8 stories, 17/17 FRs, 6/6 NFRs com caminho de implementação. Próximo passo: `bmad-sprint-planning` (incluir Epic 21 no sprint-status.yaml) e `bmad-create-story` para a 21.1.
