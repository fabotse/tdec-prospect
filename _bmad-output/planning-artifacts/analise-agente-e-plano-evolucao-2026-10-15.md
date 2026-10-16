---
tipo: analise-e-plano-de-evolucao
status: draft
criadoEm: 2026-10-15
autor: Fabossi + Claude
escopo: Agente TDec (foco) + demais módulos (leads, sinais, campanhas, IA, plataforma)
metodo: 6 auditorias paralelas somente-leitura (conversa, pipeline, copy/IA, leads/sinais, campanhas/plataforma, dados reais do banco de produção)
inputDocuments:
  - agente-tdec-plano-melhorias-2026-07-16.md
  - agente-e2e-teste-atibaia-2026-07-24.md
  - plano-evolucao-maquina-de-resultado-2026-07-10.md
  - epic-22-agente-tdec-2.0.md
  - implementation-artifacts/sprint-status.yaml, deferred-work.md
---

# Agente TDec — Análise densa & Plano de Evolução (2026-10-15)

## 0. Veredito em uma frase

**O agente não falha por falta de inteligência na conversa — falha porque faz a mesma coisa que o fluxo manual (cargo + cidade → Apollo → campanha), só que com mais atrito.** Para um cliente que quer *poucos leads de altíssima qualidade*, o agente precisa fazer o que o humano não tem tempo de fazer: **escolher as contas certas, pesquisar cada uma, provar por que é fit e escrever 1-para-1**. É aí que ele passa a agregar valor — e é aí que uma API como o Treg se encaixa.

---

## 1. O que os dados de produção dizem (leitura read-only, 2026-10-15)

| Indicador | Valor |
|---|---|
| Execuções do agente | **92**, todas em modo Guiado (Autopilot nunca usado) |
| Concentração | 2 rajadas (26–30/03 e 20–28/07); **1 gestor = 90%** das execuções; **1 execução desde agosto** |
| Funil | 92 criadas → 35 com algum step → 16 leads aprovados → 12 campanhas → 9 exportadas → **2 ativadas** |
| Concluídas | **5 (5,4%)**; 57 nunca chegaram ao 1º step (31 com briefing vazio) |
| Briefing típico | "CTO, São Paulo, Netskope" — indústria/porte/produto/objetivo quase nunca preenchidos |
| Campanhas | 20 no total, **só 1 veio do agente**; **7 campanhas manuais em outubro** (o manual está vivo) |
| Leads | 1.120; 55% com e-mail; indústria/porte ~100% vazios; status nunca evolui (1.117 "novo") |
| Oportunidades | 72 (70 por engajamento, 2 por resposta), **0 reuniões** registradas |
| Abandonados | Monitoramento LinkedIn (cron nunca rodou), WhatsApp, SignalHire, icebreakers — sem uso desde julho |
| Custo real | **Não mensurável**: `cost_actual` nunca gravado; Apollo/TheirStack/Instantly/OpenAI-de-copy não logam uso |

**Leituras:**
1. O agente foi usado como *homologação*, não como rotina. Ninguém adotou.
2. O fluxo manual vence porque o agente não entrega nada **a mais** — e entrega com mais passos e mais falhas.
3. O módulo mais vivo é Oportunidades por engajamento — mas sem desconto de security gateway (ver §5), parte disso é falso positivo em público de cibersegurança.

---

## 2. Por que o agente "não está 100%" — defeitos que ainda existem no código

Já resolvido pelo Epic 22 (confirmado no código): tecnologia opcional, LLM com memória/nextAction, ativação Instantly via `email_list`, ajuste pós-rejeição, diagnóstico de busca vazia, leads em Meus Leads, campanha em /campaigns, reattach, chaves de serviço p/ SDR.

### 2.1 Bloqueantes de confiabilidade (P0)

| # | Defeito | Evidência |
|---|---|---|
| 1 | **Step preso em `running` para sempre** (timeout/deploy/erro de gravação). Sem TTL nem sweeper; autopilot e UI travam. | `steps/base-step.ts:293-318`, `hooks/use-auto-trigger.ts:57` |
| 2 | **Gravações de checkpoint não checam `{error}`** do supabase-js → step trabalhou, pagou, e ficou `running`. | `base-step.ts:149-157, 224-233, 245-253` |
| 3 | **Export não idempotente**: retry cria **segunda campanha órfã** no Instantly. | `steps/export-step.ts:154-189` |
| 4 | **Rota de execute não valida status do step** → step `completed` pode rodar de novo e cobrar de novo. | `api/agent/executions/[id]/steps/[n]/execute/route.ts:87-97` |
| 5 | **Sem `maxDuration` na rota de execute**; `create_campaign` com icebreaker premium e 25 leads estoura 300s. | `vercel.json:4-6`, `create-campaign-step.ts:53,124-142` |
| 6 | **`triggerNextStep` ignora falha** → modo guiado para em silêncio; gate pode dizer "ativada" sem ter ativado. | `lib/agent/client-utils.ts:10-21`, `AgentActivationGate.tsx:103` |
| 7 | **Re-briefing de execução em andamento**: após F5, mensagem livre + "sim" faz `PATCH /briefing` sobrescrever briefing de execução paga (rota não checa status). | `AgentChat.tsx:756`, `use-briefing-flow.ts:1126`, `api/agent/executions/.../briefing/route.ts:79` |

### 2.2 Becos sem saída na conversa (P1)

- **"Cancelar" no plano** → status fica `confirmed`, nenhuma mensagem é mais respondida (`AgentChat.tsx:890-902, 792-793`).
- **Nada responde após o briefing confirmado** (fora do modo ajuste) (`AgentChat.tsx:792-793`).
- **Ramo de produto** sem nome → 400 em loop; "não" em `confirming_product` não permite seguir sem produto (`use-briefing-flow.ts:714,871,948-959`).
- **`awaiting_leads_input`** sem saída ("na verdade quero buscar" → loop) (`:973-984`).
- **Keywords com `includes()`** ainda decidem em produto/leads/fallback: "não, **pode** trocar pra CFO" confirma; "**isso** está errado" grava produto errado (`:56-73, 895, 1062`).
- **Turnos de produto/leads não entram na memória** do LLM (`sendAgentMessage` em vez de `sendAndRecord`) (`:878,913,940,995…`).

### 2.3 Itens do E2E de Atibaia ainda abertos

`leadCount` inexistente (busca fixa em 25, revisão pré-seleciona todos, plano supõe 60); localização da **pessoa** e não da empresa (`apollo.ts:324`) + `include_similar_titles=true` fixo; sem exclusão de setor público; "Ativar depois" exige conta; timestamps no futuro; porte em texto livre cru para a Apollo; estimativa de custo divergente do código (supõe 60 leads, busca traz 2 empresas/25 leads, não inclui o enrichment que é onde a Apollo cobra).

### 2.4 A copy continua o elo mais fraco (nenhuma story 22.x tratou)

- **"Oi Nome" / "Empresa" / setor "Tecnologia" vazando**: `buildAIVariables` preenche defaults fictícios e o agente os repassa (`knowledge-base-context.ts:329-332`, `create-campaign-step.ts:937-944, 839, 896`).
- **Follow-ups ocos**: agente nunca passa `follow_up_strategy` → o modelo recebe o literal `{{follow_up_strategy}}`; numeração "Email 5 de 4" (`create-campaign-step.ts:930,972`, `prompt-manager.ts:256`).
- **Social proof inventado é induzido pelo próprio prompt** ("Prova Social → Escassez", exemplos com "40%", "ROI comprovado") e a KB **não tem campo de cases/provas** (`prompts/defaults.ts:103,217,758`).
- **Pitch-first por instrução**: "70% sobre o produto" (`defaults.ts:273`).
- Modelos de 2024 (gpt-4o-mini/4o), prompt sem system message, nenhuma checagem pós-geração além de strip de prefixo.

---

## 3. Reposicionamento: de "montador de pipeline" para **Analista de Contas**

Hoje: *briefing → busca larga → 25 leads → template único → envio.*
Proposto: *briefing/ICP → universo de contas → **sinais + fit score** → shortlist com justificativa → **dossiê por conta** → copy 1-para-1 revisada → envio verificado e deduplicado.*

O pipeline determinístico (decisão Q2 de jul/2026) **continua** — o que muda é o que cada step faz.

| Etapa nova/atualizada | O que faz | Reuso do que já existe |
|---|---|---|
| **A. Briefing a partir do ICP** | Agente abre com "Pelo seu ICP: CISO/Head de TI, SP, 201–1000 func. Ajusto?"; aceita **lista de contas** por nome/domínio (modo ABM). `leadCount` real. Confirmação por **botão**, não por keyword. | ICP já lido no `/parse`; busca por domínio já existe (`search-leads-step.ts:142-165`) |
| **B. Universo → Shortlist com Fit Score** | Busca 3–5× o N pedido; nota A/B/C contra ICP (porte, setor real, senioridade, tecnologia, sinais) com **1 linha de "por que é fit"**; pré-seleciona só o top N no gate. Exclui setor público, clientes atuais, já contatados. | `AgentLeadReview`, `lead-persistence`, Apollo |
| **C. Sinais de timing ("por que agora")** | Vagas de SOC/CISO/Infra, novo CISO, notícias/incidentes, regulação (BACEN/LGPD/ANS), tecnologia concorrente. Sem sinal → lead vai para fluxo padrão ou revisão manual. | TheirStack (jobs API ainda não usada) + **Treg** (web search/extract, SERP) |
| **D. Dossiê por conta** | Site, notícias 90 dias, vagas, posts da pessoa filtrados por relevância/data → JSON `{fato, fonte, data, confiança}`. Visível no gate e no card de oportunidade. | Apify (posts), `relevance-classifier`, **Treg** |
| **E. Copy 1-para-1** | E-mail 1 ≤ 90 palavras: observação → problema (hipótese por persona) → 1 linha de credibilidade **só da KB** → CTA de interesse. Follow-ups com ângulo novo pré-planejado. Texto final por lead em custom fields do Instantly. | `create-campaign-step`, Instantly |
| **F. Revisor automático (LLM-as-judge)** | Checa: cada claim tem fato/prova; clichês; placeholders; relevância setor×oferta; tamanho/CTA. Até 2 reescritas, senão revisão humana. Calibrar com 20–30 e-mails rotulados pela TDec. | novo |
| **G. Envio higienizado** | E-mail verificado (bloquear "guessed"/catch-all), `skip_if_in_workspace/campaign = true`, supressão por domínio, sem `revealPersonalEmails`. | `instantly.ts:562-564`, **Treg** `people.email.verify` |
| **H. Conversa pós-execução** | "Por que o Fulano?", "reescreve o e-mail 3", "traz mais 2 parecidos com X" — LLM lê `agent_steps.output`; pipeline segue determinístico. | ponto morto `AgentChat.tsx:793` |
| **I. Memória entre execuções** | "3 destes já estão na campanha Y"; "seu último briefing CISO-SP teve 2 respostas". | Epics 21/22.15/22.16 já gravam o necessário |

**Custo estimado** (ordem de grandeza, confirmar preços): pesquisa + escrita + revisão com modelo forte ≈ US$ 0,15–0,50 de LLM + US$ 0,02–0,10 de dados por lead → **US$ 5–30 por campanha de 20–50 contas**. Irrelevante frente a um contrato de cibersegurança — e é exatamente o argumento de "máquina de resultado" do plano de julho.

---

## 4. Onde o Treg entra

[Treg](https://treg.to/llms.txt) é um gateway de ferramentas para agentes: ~3.900 endpoints / ~111 provedores com um único token (`X-Treg-Token`), também via MCP; roteamento com fallback (`treg.<capability>`), BYOK (chaves próprias não são tarifadas), `Idempotency-Key`, teto de custo por chamada (`X-Treg-Route-Max-Cost`), falha não cobra, cache de lookup repetido ~10% do preço.

Capacidades relevantes confirmadas no llms.txt: `treg.people.email.find`, **`treg.people.email.verify` (~US$ 0,006)**, `treg.people.phone.find`, `treg.people.search`, `treg.people.contact.verify`, `treg.web.search`, `treg.web.extract`, Google SERP (orgânico/maps), `hunter.companies.emails`. **Não confirmado** no catálogo: enriquecimento de empresa dedicado, notícias, LinkedIn específico, Apollo/Crunchbase.

| Uso no TDec | Endpoint Treg | Substitui/complementa |
|---|---|---|
| Verificação de e-mail antes do export | `people.email.verify` | hoje inexistente |
| Cascata de e-mail/telefone quando Apollo falha | `people.email.find`, `people.phone.find` | SignalHire on-click, Snov.io não usado |
| Dossiê da conta e sinais | `web.search`, `web.extract`, `google.serp.organic` | hoje inexistente |
| Telefone validado p/ WhatsApp | `contact.verify` | — |

**Arquitetura sugerida:** um `TregService` atrás do `base-service` existente, com chave por tenant criptografada (mesmo padrão das demais integrações), `usage-logger` obrigatório por chamada (resolve também a lacuna de custo real) e teto por execução. Começar por **verify** (valor imediato, risco zero) e **web.search/extract** (dossiê). Fazer um spike de 1 dia validando cobertura BR e qualidade antes de prometer ao cliente.

---

## 5. Demais módulos — o que evoluir

### 5.1 Higiene e risco (rápido, alto impacto)
- **Webhook do Instantly sem autenticação** (`supabase/functions/instantly-webhook/index.ts:17-19,126`) — eventos forjáveis alimentam oportunidades.
- **Cron de monitoramento fail-open** sem segredo (`api/monitoring/process-batch/route.ts:35-37`; modelo correto em `replies/process-batch`).
- **13 CVEs** (`next` 16.1.6 → 16.4.x; `xlsx` 0.18.5 lendo upload do usuário → exceljs/CDN SheetJS).
- **Sem Sentry/alerta de cron, sem CI** (não há `.github/`), migrations aplicadas à mão (63, sem controle).
- **Instantly reenvia para quem já está em outra campanha** (`skip_if_* = false`) e **não verifica e-mail** — risco de reputação de domínio.

### 5.2 Qualificação (o coração de "poucos premium")
- **Fit Score nunca foi construído** — o "Epic 22 Lead Score" do plano de julho foi reutilizado pelo Agente 2.0. Zero `fit_score` no código.
- **Entidade Conta** inexistente (empresa é texto em `leads`) → sem comitê de compra, sem supressão por conta, sem cobertura por conta.
- **Lista de supressão** por domínio (clientes, pipeline, concorrentes, opt-out).
- **Filtros finos da Apollo** (senioridade, departamento, indústria real por tag, receita; localização da empresa).

### 5.3 Sinais e engajamento
- **Oportunidade por abertura sem descontar security gateway** (`opportunity-engine.ts:56`) — em público de cibersegurança (Proofpoint/Mimecast) isso gera falso "quente". O ESG já é capturado (Epic 14.5), só não é usado.
- Insights do LinkedIn não viram oportunidade (`opportunities.source` só aceita `reply|engagement`); classificador aceita como relevante quando falha (fail-open).
- Engagement Score com decaimento no lugar de "3 aberturas"; corrigir duplicação de cards (`engagement-processor.ts:169-200`).

### 5.4 Prova de valor para a diretoria
- **Painel de ROI**: custo por lead / resposta / reunião por campanha. Exige logar Apollo, SignalHire, Instantly, OpenAI-de-copy (e Treg) com `campaign_id`. `meeting_booked_at` já existe — falta o registro em 1 clique e a agregação.
- Analytics **cross-campanha por persona/segmento/produto**.
- A/B de copy (`variants[]` do Instantly); sync de analytics por cron (hoje manual).
- Integração CRM (decidir com o cliente qual) — não virar CRM.

---

## 6. Roadmap proposto

| Fase | Nome | Conteúdo | Esforço |
|---|---|---|---|
| **0** | **Higiene & Confiança** (1 sprint) | §5.1 inteiro; P0 do agente §2.1 (sweeper de `running` via pg_cron, checagem de `{error}`, idempotência do Export, guard de status no execute/PATCH briefing, `maxDuration=300`, `triggerNextStep` com `ok`); `skip_if_*=true`; fechar status de épicos 4/12/14/19/20 | S |
| **1** | **Copy que não envergonha** | zerar defaults fictícios; passar estratégias de follow-up; numeração; remover "Prova Social/Escassez", números de exemplo e "70% produto"; **seção de Provas na KB**; revisor automático v1; modelo atual no provider | S/M |
| **2** | **Agente Analista de Contas v1** | briefing a partir do ICP + `leadCount` + confirmação por botão + saídas dos becos; modo ABM (lista de contas); busca ampla → **Fit Score** → shortlist com justificativa; exclusão setor público/supressão/já contatados; **Treg: verify + cascata** | M |
| **3** | **Dossiê & Por-que-agora** | `TregService` web.search/extract + TheirStack jobs + posts filtrados → dossiê por conta; copy 1-para-1 com claims só da KB; dossiê visível no gate e no card de oportunidade | M |
| **4** | **Entidade Conta + Sinais contínuos** | tabela `companies`/`account_signals`, comitê de compra, supressão por conta; ESG no motor de oportunidades; insight → oportunidade | L |
| **5** | **Prova de ROI** | logging completo de custo, painel custo por resposta/reunião, analytics por persona; reunião em 1 clique | M |
| **6** | **Motor recorrente** | briefing aprovado roda semanalmente com teto de custo e dedupe ("N contas A por semana"). Aqui sim adotar orquestrador durável (Vercel Workflow/Queues) | M/L |

**Sobre orquestração durável:** para os problemas atuais (step preso, autopilot dependente do browser, export não idempotente), **pg_cron + `after()` + idempotência resolvem** — não justifica Trigger.dev/Inngest agora. Passa a justificar na Fase 6 (execução sem ninguém olhando + cascata multi-fonte).

**Epic 18 revisado:** manter só retry manual de step falho, TTL de `running`, idempotência por output parcial e custo real; descartar backoff automático, lista de execuções pausadas e audit log dedicado (volume não justifica).

---

## 7. Decisões tomadas (Fabossi, 2026-10-15)

- **D1:** o fluxo manual continua como está. Não existe "caminho premium" separado — as funcionalidades de §3 entram **no agente**, de forma incremental, e vamos medindo o uso.
- **D2:** spike do Treg aprovado (data a definir).
- **D3:** o cliente consegue fornecer alguns números/cases para a seção de Provas da KB.
- **D4:** lista de supressão inicial aprovada (clientes atuais, negociações em andamento, concorrentes, parceiros, opt-outs).
- **D5:** Fase 0 será o próximo épico no BMAD.

## 7.1 Perguntas originais

1. **O agente é o produto principal ou um acelerador do fluxo manual?** Os dados dizem que o manual é o que o time usa. Proposta: o agente vira o caminho "premium/ABM" e o manual segue para listas maiores.
2. **Treg entra?** Spike de 1 dia (cobertura BR, qualidade de verify, custo) antes de comprometer o roadmap.
3. **Provas/cases na KB:** o cliente precisa fornecer cases, números e clientes de referência *autorizados* — sem isso a copy continua sem prova social legítima.
4. **Lista de supressão inicial:** clientes atuais e pipeline da TDec.
5. **Modelo de LLM para escrita/revisão** (custo por campanha aceitável?).
6. **CRM do cliente** (qual, e se integrar agora ou na Fase 5).
