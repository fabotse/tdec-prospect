---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish", "step-12-complete"]
status: complete
completedAt: 2026-03-25
startedAt: 2026-03-25
inputDocuments:
  - product-brief-tdec-prospect-2026-03-25.md
  - research/technical-lead-enrichment-icebreakers-research-2026-02-03.md
  - research/technical-instantly-snovio-api-integration-research-2026-02-06.md
  - research/instantly-campaign-tracking-api-research-2026-02-09.md
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 3
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: "SaaS B2B"
  domain: "SalesTech/MarTech"
  complexity: "medium"
  projectContext: "brownfield"
---

# Product Requirements Document - Agente TDEC

**Author:** Fabossi
**Date:** 2026-03-25
**Project:** tdec-prospect (brownfield — 15 epics implementadas)

## Executive Summary

O Agente TDEC e uma feature do tdec-prospect que introduz um agente conversacional capaz de orquestrar automaticamente todo o pipeline de prospeccao outbound — da descoberta de leads ate o monitoramento de campanhas ativas. A partir de uma conversa natural, o usuario descreve o que deseja prospectar e o agente executa cada etapa: busca de empresas por tecnologia (theirStack), descoberta de leads (Apollo), criacao de campanha com conteudo gerado por IA, export e ativacao no Instantly.

### Problema

O TDEC Prospect possui todas as pecas do pipeline construidas e testadas ao longo de 15 epics — mas o usuario ainda opera cada etapa manualmente. O processo completo consome horas, exige conhecimento do fluxo, reduz frequencia de uso, e gera inconsistencia de qualidade entre operadores experientes e iniciantes.

### Diferencial

Nenhuma solucao existente combina: busca technografica + descoberta de leads + criacao de campanha contextualizada por IA + export automatico + ativacao — tudo orquestrado por um agente que conhece o negocio do usuario via Knowledge Base (perfil empresa, ICP, tom de voz, produtos, icebreakers baseados em posts reais do LinkedIn).

### Contexto Tecnico

Projeto brownfield — todos os servicos do pipeline ja existem e estao testados. O agente e a camada de orquestracao + interface conversacional que os conecta. O risco nao esta nos servicos, esta na cola que os une.

---

## Success Criteria

### User Success

- Marco cria campanhas completas (briefing -> campanha ativa no Instantly) em < 15 minutos via agente
- Frequencia de uso: minimo 1 campanha/semana, elastico conforme demanda comercial
- SDRs menos experientes criam campanhas com qualidade equivalente a de um operador senior (democratizacao)
- Momento "valeu a pena": briefing de 5 minutos, campanha no ar sem intervencao manual nas etapas intermediarias

### Business Success

- Taxa de resposta das campanhas do agente >= 2% (baseline atual: 1-2% em campanhas manuais)
- Migracao gradual do modo Guiado para Autopilot ao longo do tempo (indicador de confianca)
- Reducao do uso manual das telas individuais de busca/campanha (agente como interface principal)
- Custo por execucao rastreado e visivel ao usuario ANTES de iniciar — transparencia, nao teto rigido

### Technical Success

- Taxa de conclusao do pipeline >= 90% (execucoes sem erro critico)
- Checkpointing por etapa: se o agente travar, retoma do ultimo checkpoint sem reprocessar etapas ja concluidas e sem reusar creditos de API
- Execution log completo: input/output/decisao de cada etapa para auditoria e debug
- Estimativa de custo pre-execucao baseada no volume de leads e APIs que serao acionadas

### Measurable Outcomes

| KPI | Como Medir | Meta |
|-----|------------|------|
| Campanhas via agente/semana | Contagem no sistema | >= 1/semana |
| Taxa de resposta | Instantly analytics vs baseline manual | >= 2% |
| Tempo briefing -> campanha ativa | Timestamp inicio/fim da execucao | < 15 min |
| Taxa de conclusao do pipeline | Execucoes completas / total iniciadas | >= 90% |
| Proporcao Guiado vs Autopilot | % por modo ao longo do tempo | Tendencia crescente de Autopilot |
| Custo por execucao | Soma de API calls (Apollo + Apify + OpenAI + Instantly) | Rastreado com estimativa previa |
| Taxa de recuperacao | Execucoes retomadas com sucesso apos falha | >= 95% |

---

## Product Scope & Phased Development

### MVP Strategy

**Approach:** Problem-solving MVP — provar que o pipeline end-to-end funciona via agente conversacional, entregando valor real desde a primeira execucao.

### MVP (Phase 1) — Must-Have

1. Interface de chat conversacional (texto)
2. Parsing de briefing — linguagem natural com fallback para perguntas guiadas
3. Pipeline flexivel (theirStack -> Apollo -> campanha -> export -> ativacao)
4. Dois modos de operacao (Guiado com 4 approval gates / Autopilot)
5. Approval gates com filtragem granular de leads
6. Criacao de campanha com Knowledge Base (perfil, ICP, tom, produtos, icebreakers)
7. Cadastro de produto inline durante briefing
8. Feedback visual de progresso em tempo real
9. Checkpointing por etapa com recuperacao de falhas e protecao de creditos
10. Estimativa de custo pre-execucao
11. Export e ativacao automatica no Instantly
12. Execution log de cada etapa (input/output/decisao)

**Core User Journeys Supported:** J1 (Onboarding), J2 (Guiado), J3 (Autopilot), J4 (Error Recovery), J5 (Democratizacao SDR), J6 (Cadastro Produto Inline)

### Growth (Phase 2)

- Monitoramento proativo via WhatsApp (leads quentes)
- Relatorio automatico semanal de performance
- Integracao com insights do LinkedIn (Epic 13)
- Multi-campanha por sessao
- Input por voz (Whisper)
- Parsing de briefing mais avancado (linguagem natural livre)

### Vision (Phase 3)

- Agente semi-autonomo com decisoes dinamicas (tool calling)
- Agente reativo a respostas de leads
- Agente proativo: detecta oportunidades e sugere campanhas
- Dashboard de execucoes com historico e replay
- Multi-tenant com permissoes granulares

### Risk Mitigation

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|--------------|---------|----------|
| Parsing de briefing falha em interpretar | Media | Alto | Fallback para perguntas guiadas |
| API externa indisponivel durante execucao | Media | Medio | Checkpointing + retry + retomada posterior. Alertar que problema e externo |
| Custo por execucao acima do esperado | Baixa | Medio | Estimativa pre-execucao + rastreamento |
| Orquestracao de 5 APIs com timing/sequencia | Media | Alto | Pipeline deterministico com steps isolados e testados |
| Qualidade inferior ao manual | Baixa | Alto | Modo Guiado permite revisao humana ate usuario confiar |

**Contingencia de Recursos:**
- MVP minimo absoluto: chat + pipeline guiado (sem Autopilot) + export Instantly
- Se recursos forem limitados, Autopilot pode ser Fase 1.5

---

## User Journeys

### Journey 1: Marco — Primeira Vez com o Agente (Onboarding)

Marco acabou de ver a nova feature no menu do TDEC Prospect. Clica em "Agente TDEC" e encontra uma interface de chat limpa. O agente se apresenta brevemente: "Sou o Agente TDEC. Posso criar campanhas de prospeccao completas pra voce — da busca de leads ate campanha ativa no Instantly. Me conta o que voce quer prospectar e eu cuido do resto. Quer ver como funciona?"

Marco digita: "Quero prospectar CTOs de fintechs em Sao Paulo que usam Netskope". O agente responde com o plano de execucao: "Vou buscar empresas via theirStack com filtro Netskope, encontrar contatos de CTOs via Apollo, criar campanha com o produto X e tom Y. Modo Guiado — vou te pedir aprovacao em cada etapa. Posso comecar?"

Marco aprova. O agente mostra a estimativa de custo: "Estimativa: ~R$2,50 em APIs (theirStack + Apollo + OpenAI). Confirma?" Marco confirma e acompanha o progresso visual enquanto o agente trabalha.

**Capacidades reveladas:** onboarding contextual, explicacao do fluxo, estimativa de custo pre-execucao, plano de execucao antes de iniciar.

### Journey 2: Marco — Campanha Semanal em Modo Guiado (Happy Path)

Segunda-feira de manha. Marco abre o Agente TDEC ja sabendo o que quer: "Essa semana quero focar em heads de seguranca de healthtechs que usam CrowdStrike. Produto: TDEC Shield."

O agente interpreta: "Entendi. Vou buscar healthtechs com CrowdStrike no stack, encontrar Heads de Seguranca e CISOs, e criar campanha do TDEC Shield. Quer modo Guiado ou Autopilot?" Marco escolhe Guiado.

**Gate 1 — Empresas encontradas:** "Encontrei 32 empresas healthtech com CrowdStrike no stack. Aqui estao as 5 maiores: [lista]. Aprova para buscar contatos?"
Marco aprova.

**Gate 2 — Leads encontrados:** "Encontrei 87 leads (CISOs e Heads de Seguranca). Aqui esta a amostra: [tabela com nome, cargo, empresa, email]. Voce pode revisar o lote completo, remover leads individuais ou filtrar antes de aprovar."
Marco nota 3 leads de empresas que ja sao clientes. Remove os 3 e aprova os 84 restantes.

**Gate 3 — Campanha criada:** "Campanha criada: 'TDEC Shield — Healthtech Security Leaders'. 3 emails na sequencia, icebreakers personalizados com posts do LinkedIn. Aqui esta o preview do primeiro email. Quer revisar/editar ou exportar pro Instantly?"
Marco ajusta uma frase no primeiro email e aprova.

**Gate 4 — Export e ativacao:** "Campanha exportada pro Instantly com 84 leads e 3 sending accounts. Quer ativar agora?" Marco da o play.

5 minutos de conversa. Campanha no ar. Cafe.

**Capacidades reveladas:** briefing natural, selecao de modo, 4 approval gates, filtragem granular de leads, edicao de conteudo da campanha, export e ativacao com confirmacao.

### Journey 3: Marco — Autopilot (Fire-and-Forget)

Quarta-feira. Marco ja confia no agente apos 3 semanas de uso. "Quero prospectar DevOps managers de empresas com Kubernetes em Campinas. Produto: TDEC Cloud. Autopilot."

O agente mostra o plano e a estimativa de custo. Marco confirma. O agente executa tudo: busca empresas, encontra leads, cria campanha com icebreakers, exporta pro Instantly e ativa. Marco ve o progresso em tempo real mas nao precisa intervir.

Ao final: "Campanha 'TDEC Cloud — DevOps Campinas' ativa no Instantly. 56 leads, 3 emails na sequencia. Custo total: R$1,80."

Marco fecha o app e vai pra proxima tarefa.

**Capacidades reveladas:** modo Autopilot sem interrupcoes, feedback visual de progresso, resumo final com metricas e custo.

### Journey 4: Marco — Falha no Meio do Pipeline (Error Recovery)

Marco inicia uma campanha via Autopilot. O agente busca 45 empresas, encontra 120 leads no Apollo... e a API do Instantly retorna erro 503.

O agente mostra: "Etapa 4 de 5 falhou: Instantly indisponivel. Progresso salvo — empresas e leads ja processados nao serao reprocessados. Voce pode: [Tentar novamente] [Retomar depois]"

Marco escolhe "Retomar depois". 2 horas depois, volta ao Agente TDEC e ve: "Execucao pausada — 'DevOps SP'. Etapas concluidas: busca de empresas, busca de leads, criacao de campanha. Pendente: export pro Instantly. [Retomar]"

Marco clica em Retomar. O agente pula as 3 etapas ja concluidas, exporta pro Instantly (que ja voltou) e ativa. Sem creditos gastos duas vezes. Sem retrabalho.

**Capacidades reveladas:** checkpoint por etapa, feedback claro da falha, opcao de retry imediato ou retomar depois, lista de execucoes pausadas, retomada sem reprocessamento, protecao de creditos.

### Journey 5: SDR — Democratizacao (Usuario Menos Experiente)

Julia e SDR ha 2 meses. Nunca usou theirStack ou Apollo diretamente. Seu gestor pede: "Cria uma campanha pra CTOs de empresas de logistica que usam SAP."

Antes do Agente: Julia precisaria aprender a navegar 4 telas diferentes, entender os filtros de cada servico, montar a campanha manualmente. Levaria horas e o resultado seria inferior ao de um operador experiente.

Com o Agente: Julia abre o chat e digita exatamente o que o gestor pediu. O agente interpreta, monta o plano, executa em modo Guiado. Julia revisa os leads e a campanha nos approval gates — aprendendo o fluxo enquanto o agente faz o trabalho pesado.

O resultado: campanha com a mesma qualidade que Marco faria, porque a inteligencia esta no agente (Knowledge Base, ICP, tom de voz), nao no operador.

**Capacidades reveladas:** mesma interface para todos os niveis de experiencia, modo Guiado como ferramenta de aprendizado, qualidade independente do operador.

### Journey 6: Marco — Cadastro de Produto Inline

Marco quer prospectar para um produto novo que ainda nao esta cadastrado. Digita: "Quero prospectar pra o TDEC Analytics — nosso novo produto de BI."

O agente detecta que "TDEC Analytics" nao existe na Knowledge Base: "Nao encontrei o produto 'TDEC Analytics'. Quer cadastrar agora? Preciso de: nome, descricao breve, principais features, diferenciais e publico-alvo."

Marco responde em linguagem natural, o agente extrai os campos e confirma: "Cadastrei o TDEC Analytics. Quer que eu use ele nessa campanha?" Marco confirma e o fluxo continua normalmente.

**Capacidades reveladas:** deteccao de produto nao cadastrado, cadastro conversacional inline, integracao imediata com o fluxo do agente.

### Journey-to-Capability Traceability

| Capacidade | Jornadas | FRs |
|------------|----------|-----|
| Interface de chat conversacional | Todas | FR1 |
| Onboarding contextual (primeira vez) | J1 | FR9 |
| Interpretacao de briefing natural | J1, J2, J3, J5 | FR2, FR3, FR4 |
| Plano de execucao com estimativa de custo | J1, J2, J3 | FR6, FR7, FR8 |
| Selecao de modo (Guiado/Autopilot) | J2, J3 | FR5, FR15 |
| Approval gates com 4 checkpoints | J2, J5 | FR16-FR22 |
| Filtragem/remocao granular de leads | J2 | FR18 |
| Edicao de conteudo da campanha | J2 | FR20 |
| Feedback visual de progresso | J2, J3, J4 | FR33 |
| Checkpointing por etapa | J4 | FR12, FR13, FR14 |
| Retry/retomada apos falha | J4 | FR36, FR37, FR38, FR39 |
| Cadastro de produto inline | J6 | FR27, FR28, FR29 |
| Qualidade independente do operador | J5 | FR23, FR24, FR25, FR26 |

---

## Innovation & Competitive Landscape

### Posicionamento

O Agente TDEC traz o melhor de cada ferramenta e orquestra dentro de uma plataforma propria, com Knowledge Base contextualizada.

| Concorrente | O que faz bem | O que nao faz |
|-------------|--------------|---------------|
| **Clay** | Enrichment, waterfall de dados, workflows | Nao cria campanha, nao exporta pra plataforma de envio, nao orquestra pipeline completo |
| **Instantly AI** | Envio de cold email, warming, agent basico | Opera so dentro do Instantly — nao busca leads, nao integra technografica, sem Knowledge Base |
| **11x.ai / AiSDR** | SDRs virtuais, geracao de emails | Sem pipeline de prospeccao completo, sem contextualizacao profunda |

### Validation Approach

- **Fase 1:** Pipeline completo end-to-end com taxa de resposta >= 2% e tempo < 15 minutos
- **Indicador de confianca:** Migracao do modo Guiado para Autopilot
- **Comparacao direta:** Campanhas do agente vs manuais — mesma base de leads

---

## Technical Architecture

### Camada de Orquestracao

- `ProspectingAgentService` como orquestrador central do pipeline
- Chama servicos existentes ja construidos (theirStack, Apollo, Apify, Campaign Builder, Instantly)
- Gerencia: ordem de execucao, checkpointing, approval gates, estimativa de custo
- Nao substitui os servicos — orquestra eles

### Pipeline Deterministico (Fase 1)

- Briefing parseado em formato estruturado (tecnologia, cargo, localizacao, produto, modo)
- Steps fixos executados em ordem: busca empresas -> busca leads -> cria campanha -> export -> ativacao
- Steps pulados quando nao aplicaveis (ex: usuario ja tem leads)
- Cada step tem input/output tipado e checkpoint salvo

### Preparacao para Fase 2

- Interface abstrata do orquestrador permite trocar pipeline deterministico por agente com tool calling
- Approval gates como middleware configuravel
- Execution log completo desde o dia 1

### Integration List

| Servico | Funcao no Pipeline | Ja Existe | Step |
|---------|-------------------|-----------|------|
| theirStack | Busca technografica de empresas | Sim (Epic 15) | 1 - Busca empresas |
| Apollo | Descoberta de contatos/leads | Sim (Epic 15) | 2 - Busca leads |
| Apify | Posts LinkedIn para icebreakers | Sim (Epic 10) | 3 - Criacao campanha |
| OpenAI | Geracao de conteudo + icebreakers | Sim (Epics 6, 10) | 3 - Criacao campanha |
| Instantly | Export de leads + ativacao | Sim (Epic 7) | 4/5 - Export e ativacao |
| Knowledge Base | Perfil, ICP, tom de voz, produtos | Sim (Epics 4, 5) | 3 - Contexto |

---

## Functional Requirements

### Briefing Conversacional

- **FR1:** Usuario pode iniciar uma sessao com o agente via interface de chat de texto
- **FR2:** Usuario pode descrever o que deseja prospectar em linguagem natural (tecnologia, cargo, localizacao, produto)
- **FR3:** Agente pode interpretar o briefing e extrair parametros estruturados (tecnologia, cargo, localizacao, produto, modo)
- **FR4:** Agente pode fazer perguntas guiadas quando nao consegue extrair todos os parametros do briefing
- **FR5:** Usuario pode selecionar o modo de operacao (Guiado ou Autopilot)
- **FR6:** Agente pode apresentar o plano de execucao antes de iniciar o pipeline
- **FR7:** Agente pode apresentar estimativa de custo antes de iniciar a execucao
- **FR8:** Usuario pode confirmar ou cancelar a execucao apos ver o plano e custo estimado
- **FR9:** Agente pode exibir mensagem de onboarding na primeira interacao do usuario

### Orquestracao de Pipeline

- **FR10:** Agente pode executar o pipeline completo: busca empresas -> busca leads -> criacao campanha -> export -> ativacao
- **FR11:** Agente pode adaptar o pipeline ao contexto do briefing (pular etapas nao aplicaveis)
- **FR12:** Agente pode salvar checkpoint ao concluir cada etapa do pipeline
- **FR13:** Agente pode retomar execucao a partir do ultimo checkpoint sem reprocessar etapas concluidas
- **FR14:** Agente pode preservar creditos de API ja gastos em etapas concluidas (nao reusar)
- **FR15:** Agente pode executar o pipeline em modo Guiado (com approval gates) ou Autopilot (sem interrupcoes)

### Approval Gates (Modo Guiado)

- **FR16:** Agente pode pausar apos busca de empresas e apresentar resultados para aprovacao
- **FR17:** Agente pode pausar apos busca de leads e apresentar amostra para aprovacao
- **FR18:** Usuario pode revisar o lote completo de leads, filtrar e remover leads individuais antes de aprovar
- **FR19:** Agente pode pausar apos criacao de campanha e apresentar preview para revisao
- **FR20:** Usuario pode editar conteudo da campanha (textos dos emails) antes de aprovar
- **FR21:** Agente pode pausar antes da ativacao no Instantly para confirmacao final
- **FR22:** Usuario pode aprovar ou rejeitar em cada approval gate

### Criacao Inteligente de Campanha

- **FR23:** Agente pode criar campanha utilizando dados da Knowledge Base (perfil empresa, ICP, tom de voz)
- **FR24:** Agente pode selecionar o produto correto da Knowledge Base para a campanha
- **FR25:** Agente pode gerar icebreakers personalizados com base em posts recentes do LinkedIn do lead
- **FR26:** Agente pode gerar sequencia de emails com estrutura otimizada (quantidade, intervalos, objetivo)
- **FR27:** Agente pode detectar que um produto mencionado no briefing nao existe na Knowledge Base
- **FR28:** Usuario pode cadastrar um novo produto via conversa inline durante o briefing
- **FR29:** Agente pode utilizar o produto recem-cadastrado imediatamente na campanha corrente

### Export e Ativacao

- **FR30:** Agente pode exportar campanha com leads para o Instantly
- **FR31:** Agente pode configurar sending accounts na campanha exportada
- **FR32:** Agente pode ativar a campanha no Instantly

### Monitoramento de Execucao

- **FR33:** Agente pode exibir feedback visual de progresso durante cada etapa do pipeline
- **FR34:** Agente pode exibir resumo final com metricas apos conclusao (leads, emails, custo total)
- **FR35:** Agente pode registrar execution log de cada etapa (input, output, decisao)
- **FR36:** Agente pode exibir mensagem clara quando uma etapa falha, indicando qual etapa e o motivo
- **FR37:** Usuario pode escolher entre retry imediato ou retomar depois apos uma falha
- **FR38:** Usuario pode visualizar lista de execucoes pausadas/incompletas
- **FR39:** Usuario pode retomar uma execucao pausada a partir do ponto onde parou

### Rastreamento de Custos

- **FR40:** Agente pode calcular estimativa de custo pre-execucao baseada no volume e APIs envolvidas
- **FR41:** Agente pode rastrear custo real de cada etapa durante a execucao
- **FR42:** Agente pode exibir custo total ao final da execucao

---

## Non-Functional Requirements

### Performance

- **NFR1:** Cada etapa do pipeline deve exibir feedback visual de progresso ao usuario enquanto processa (indicacao de loading com descricao da acao em andamento)
- **NFR2:** Pipeline completo (briefing ate campanha ativa) deve concluir em menos de 15 minutos para execucoes tipicas (ate 100 leads)
- **NFR3:** Respostas do agente no chat (interpretacao de briefing, perguntas guiadas) devem retornar em menos de 5 segundos, com indicador de loading visivel durante processamento

### Integracao

- **NFR4:** O agente deve tratar erros de APIs externas (theirStack, Apollo, Apify, OpenAI, Instantly) com mensagens claras indicando qual servico falhou e que o problema e externo
- **NFR5:** Cada chamada a API externa deve implementar retry com backoff exponencial (maximo 3 tentativas) antes de reportar falha ao usuario
- **NFR6:** O pipeline deve ser tolerante a indisponibilidade parcial — falha em um servico nao deve corromper resultados de etapas ja concluidas

### Confiabilidade

- **NFR7:** Taxa de conclusao do pipeline deve ser >= 90% (execucoes que completam todas as etapas sem erro critico)
- **NFR8:** Checkpoint de cada etapa deve ser persistido em banco antes de iniciar a etapa seguinte (protecao contra crash)
- **NFR9:** Execucoes retomadas apos falha devem concluir com sucesso em >= 95% dos casos
- **NFR10:** Creditos de API gastos em etapas concluidas nunca devem ser reprocessados em retomada de execucao

### Seguranca

- **NFR11:** API keys de servicos externos devem ser armazenadas encriptadas no Supabase (api_configs existente) — sem mudancas na abordagem atual
- **NFR12:** Execution logs nao devem conter API keys ou tokens em texto plano
