# TDec Prospect — Plano de Evolução: de "Integrador" para "Máquina de Resultado"

**Data:** 2026-07-10
**Gatilho:** Reunião com cliente em fase de fechamento. Objeção levantada: *"Hoje eu já pago todas essas plataformas individualmente. Como justifico para a diretoria pagar mais caro por algo que, na prática, já temos — só que separado?"*
**Objetivo:** Reposicionar a plataforma de "unifica ferramentas" para "entrega leads qualificados", com um roadmap que torna essa promessa verdadeira e demonstrável.

---

## 1. Diagnóstico honesto — o que a plataforma É hoje

Auditoria completa do código (Epics 1–20, sprint-status + inventário funcional):

**Já existe e é mais do que "conectar" (a narrativa de venda está subvendida):**
- **Agente TDec** (Epics 16–17, done): briefing conversacional → pipeline completo busca empresas (TheirStack) → busca leads (Apollo) → cria campanha com IA → exporta → ativa no Instantly. Modos Guiado (approval gates) e Autopilot. **Nenhuma das ferramentas que o cliente paga faz isso — nem juntas.**
- **Monitoramento LinkedIn** (Epic 13, done): vigia posts de leads ICP, IA filtra relevância e sugere abordagem, envia WhatsApp a partir do insight.
- **IA contextualizada**: emails, icebreakers (inclusive premium com posts reais do LinkedIn), follow-ups, tom de voz, ICP, produtos — knowledge base por tenant.
- **WhatsApp (Z-API)**: composer, envio individual e em massa, tracking (Epic 11).
- **Analytics de campanha** (Epics 10 + 14): métricas do Instantly, evolução diária, detalhe por step, Janela de Oportunidade (leads com N+ aberturas).

**O gap real (por que a objeção do cliente "cola"):**

| Gap | Evidência no código |
|---|---|
| Resposta de lead **não dispara nada** | Webhook `reply_received` grava em `campaign_events` e morre ali. Reconciliação de respostas é **manual via import de CSV** (`/api/leads/import-results`) |
| Interesse do lead já chega e é **descartado** | `lt_interest_status` (classificação de interesse do próprio Instantly) é mapeado em `src/lib/services/tracking.ts:166` e **nunca aparece na UI** |
| "Lead quente" = só aberturas, só in-app | `opportunity-engine.ts`: threshold de opens, visível apenas dentro do analytics de UMA campanha; notificação = toast via localStorage |
| **Zero notificação proativa** | Nenhum push, e-mail de alerta ou WhatsApp para o dono da conta quando um lead esquenta |
| **Sem lead scoring** | Nenhum score de fit vs ICP nem de engajamento calculado pela plataforma |
| **Sem pós-resposta** | Nenhuma central de oportunidades cross-campanha, nenhum próximo passo, nenhum handoff para vendedor |
| Autopilot sem rede de proteção | Epic 18 (retry, checkpoint/resume, custo real por execução, execution log) está em **backlog** |
| **Sem prova de ROI** | Existe `api_usage_logs` + `cost_models`, mas nenhum relatório "custo por lead qualificado" para a diretoria |

**Síntese:** a plataforma cobre topo/meio de funil de outbound de ponta a ponta, mas **o funil termina no envio**. O momento de maior valor — *alguém respondeu interessado* — é exatamente onde a plataforma fica muda. É por isso que a comparação com "ferramentas que já pagamos" é possível: o cliente compara envio com envio.

---

## 2. A resposta à objeção (narrativa de venda)

**A frase-chave:** *"As ferramentas que vocês já pagam terminam o trabalho quando o e-mail sai. A TDec começa onde elas param: transforma resposta em lead qualificado entregue na mão do vendedor — com contexto, telefone e próximo passo sugerido."*

Três pilares para a diretoria:

1. **Ferramenta não faz prospecção; gente operando ferramenta faz.** Apollo + Instantly + planilha exigem alguém colando dados, escrevendo email, conferindo resposta. A TDec é a *operação*: um briefing → campanhas no ar → leads qualificados entregues. O comparável não é a soma das licenças; é **licenças + horas de SDR + leads perdidos por demora**.
2. **O loop fechado não existe em nenhuma das ferramentas soltas.** Nenhuma delas: qualifica contra o ICP do cliente, vigia o LinkedIn do lead, classifica a resposta com IA e avisa o vendedor no WhatsApp em minutos. *Speed-to-lead* é o KPI: responder um lead interessado em minutos vs. dias muda taxa de conversão — esse é o número que a diretoria entende.
3. **BYOK elimina o argumento "pagar duas vezes".** O cliente segue com as chaves/planos dele (Apollo, Instantly, SignalHire — ver `docs/custos-operacao.md`); a TDec cobra pela operação e pelo resultado, não pelas ferramentas. Âncora de preço: custo total de um SDR júnior operando isso à mão (salário + encargos + ferramentas ≈ R$8–12k/mês) vs. tier Evolução (R$5,5–7,5k, cf. estratégia de pricing).

**Regra de ouro da demo:** nunca mais demonstrar "busca no Apollo dentro da TDec". Demonstrar: *briefing de 2 minutos no Agente → campanha no ar → [Fase 1 abaixo] lead respondeu → WhatsApp do vendedor apita com o card do lead pronto.*

---

## 3. Roadmap — 5 fases em ordem de impacto na venda

### 🔴 Fase 1 — "O Pop-up do Lead": fechar o loop de resposta (Epic 21) — ANTES de fechar o contrato

Exatamente o que o cliente pediu. É também a fase mais barata em relação ao impacto, porque ~80% dos blocos já existem (webhook, Z-API, IA, engine de oportunidade, `lt_interest_status` já mapeado).

**Stories propostas:**
1. **21.1 — Processador de respostas**: ao receber `reply_received` no webhook (`supabase/functions/instantly-webhook`), atualizar status do lead automaticamente (`em_campanha` → `interessado`), registrar `lead_interaction`, e enfileirar classificação. Acaba o import manual de CSV.
2. **21.2 — Classificação de intenção por IA**: buscar o corpo da resposta (API Instantly de emails) + usar `lt_interest_status` como sinal; classificar: `interessado` / `pediu_info` / `objeção` / `não_agora` / `opt_out`. Novo prompt `reply_intent_classification` no padrão `ai_prompts` existente.
3. **21.3 — Central de Oportunidades** (`/opportunities`, item novo na sidebar com badge): inbox cross-campanha de leads quentes (respostas classificadas + janela de oportunidade atual). Cada card = lead + empresa + campanha + o que abriu/clicou + **a resposta** + insight do LinkedIn (se monitorado) + telefone (SignalHire 1-clique, já existe).
4. **21.4 — Próximo passo sugerido pela IA**: para cada oportunidade, IA gera rascunho de resposta/abordagem (reusa padrão do `monitoring_approach_suggestion`). Ações no card: enviar WhatsApp (Z-API pronto), copiar resposta, marcar como `oportunidade`/`descartado`.
5. **21.5 — Notificação proativa**: WhatsApp via Z-API para número(s) configurados do tenant ("🔥 Lead quente: Fulano (Empresa X) respondeu interessado na campanha Y — abrir: link") + e-mail + badge in-app persistido em banco (não localStorage). Config em `/settings/monitoring` (padrão já existe).
6. **21.6 — Elevar a Janela de Oportunidade**: de dentro do analytics de campanha para alimentar a Central (cross-campanha), incluindo cliques além de aberturas.

**Resultado demonstrável:** o "pop-up de um lead, onde ele tem ali onde entrar" — literal.

### 🟠 Fase 2 — Qualificação: Lead Score (Epic 22)

Responde "resultado de qualificação de leads, onde eles consigam saber as empresas".

1. **22.1 — Fit Score (A/B/C)** contra o ICP da knowledge base (indústrias, cargos, pains + tamanho/segmento do Apollo), calculado na busca/import via gpt-4o-mini (centavos). Badge na tabela de leads e no approval gate do Agente ("destes 200 leads, 47 são fit A").
2. **22.2 — Engagement Score** (0–100): opens, clicks, reply, recência, insights LinkedIn. Esquenta/esfria com decay temporal.
3. **22.3 — Priorização**: ordenação padrão por score na Central de Oportunidades e em Meus Leads; filtro "só fit A".

### 🟡 Fase 3 — Confiabilidade do Autopilot = Epic 18 (já especificado, tirar do backlog)

Pré-requisito para vender "operação autônoma" sem medo: retry, checkpoint/resume com proteção de créditos, lista de execuções pausadas, resumo final com custo real, execution log. Sem isso, o Autopilot é demo; com isso, é produto. O custo real por execução alimenta a Fase 4.

### 🟢 Fase 4 — Relatório Executivo de ROI ("Modo Diretoria") (Epic 23)

O artefato que o champion leva para a diretoria — resolve a objeção de forma permanente.

1. **23.1 — Dashboard executivo** (visão diretor, papel `diretor` do Epic 20 já existe): leads gerados, taxa de resposta, leads qualificados (fit A + interessado), reuniões marcadas (input manual leve), **custo por lead qualificado** (de `api_usage_logs` + `cost_models` + custo real do Epic 18).
2. **23.2 — Relatório mensal em PDF** exportável, com comparativo: custo da operação TDec vs. benchmark (ferramentas soltas + horas de SDR).
3. **23.3 — Metas**: tenant define meta de leads qualificados/mês; dashboards mostram progresso. Prepara o pricing por resultado.

### 🔵 Fase 5 — Motor Contínuo de Demanda (Epic 24)

Transforma o produto de "ferramenta que uso" em "assinatura que entrega N leads/mês":

1. **24.1 — Execuções recorrentes do Agente**: agendar briefing aprovado para rodar semanal/quinzenal (infra de cron já existe — `monitor_leads`), com teto de custo e dedupe de leads já contatados.
2. **24.2 — Sinais de timing na descoberta**: usar TheirStack (vagas abertas/tecnologia adotada) como gatilho de novas empresas para o ICP, não só busca pontual.
3. **24.3 — Pipeline pós-oportunidade leve**: kanban mínimo (Oportunidade → Contatado → Reunião → Ganho/Perdido) OU integração com o CRM do cliente — decidir com o cliente; não competir com CRM se ele já tem um.

---

## 4. Sequência recomendada

| Ordem | Fase | Por quê agora |
|---|---|---|
| 1º | **Fase 1 (Epic 21)** | É a resposta literal ao pedido do cliente; máximo impacto/esforço; viabiliza a demo que fecha a venda |
| 2º | **Fase 2 (Epic 22)** | "Qualificação" foi a palavra do cliente; dá substância ao card da oportunidade |
| 3º | **Fase 3 (Epic 18)** | Confiabilidade antes de escalar o Autopilot no cliente real |
| 4º | **Fase 4 (Epic 23)** | Renovação/expansão: prova de ROI mensal automática |
| 5º | **Fase 5 (Epic 24)** | Consolida o modelo de receita recorrente por resultado |

**Quick wins imediatos (dias, não semanas):**
- Exibir `lt_interest_status` na LeadTrackingTable e na Janela de Oportunidade (dado já buscado e mapeado — só falta UI).
- Auto-status no reply via webhook (story 21.1) — mata o import manual de CSV.
- Notificação WhatsApp de lead quente (21.5) reusando ZApiService — é o "uau" da próxima reunião com o cliente.

---

## 5. Riscos e pontos de atenção

- **Corpo da resposta via Instantly**: confirmar endpoint/escopo da API V2 para ler o conteúdo do reply (a classificação por IA depende disso; fallback: usar só `lt_interest_status` + heurística).
- **Webhook em produção**: garantir que o webhook do Instantly está configurado no ambiente do cliente (hoje analytics funciona por polling; o loop de resposta precisa do webhook OU de polling mais frequente do `/leads/list`).
- **Apollo API no plano Basic**: pendência conhecida (`docs/custos-operacao.md`) — validar antes de prometer volume.
- **Não virar CRM**: a Central de Oportunidades entrega o lead pronto e para ali (ou integra). Competir com CRM dilui o posicionamento e o cliente já tem esses fluxos.
- **Reuniões marcadas** é o KPI que a diretoria vai querer; como depende de input humano, desenhar o registro para ser 1 clique (no card da oportunidade), senão o dado morre.
