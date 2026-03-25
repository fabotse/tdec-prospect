---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
status: complete
completedAt: 2026-03-25
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# tdec-prospect - Epic Breakdown (Agente TDEC)

## Overview

Este documento contem o breakdown de epics e stories para o Agente TDEC, a feature de orquestracao conversacional do pipeline de prospeccao outbound. A numeracao dos epics continua a partir do Epic 16, seguindo a sequencia do projeto (Epics 1-15 ja implementados).

**Contexto:** Projeto brownfield com 15 epics implementados. Todos os servicos do pipeline ja existem e estao testados. O agente e a camada de orquestracao + interface conversacional que os conecta.

## Requirements Inventory

### Functional Requirements

**Briefing Conversacional**

- FR1: Usuario pode iniciar uma sessao com o agente via interface de chat de texto
- FR2: Usuario pode descrever o que deseja prospectar em linguagem natural (tecnologia, cargo, localizacao, produto)
- FR3: Agente pode interpretar o briefing e extrair parametros estruturados (tecnologia, cargo, localizacao, produto, modo)
- FR4: Agente pode fazer perguntas guiadas quando nao consegue extrair todos os parametros do briefing
- FR5: Usuario pode selecionar o modo de operacao (Guiado ou Autopilot)
- FR6: Agente pode apresentar o plano de execucao antes de iniciar o pipeline
- FR7: Agente pode apresentar estimativa de custo antes de iniciar a execucao
- FR8: Usuario pode confirmar ou cancelar a execucao apos ver o plano e custo estimado
- FR9: Agente pode exibir mensagem de onboarding na primeira interacao do usuario

**Orquestracao de Pipeline**

- FR10: Agente pode executar o pipeline completo: busca empresas -> busca leads -> criacao campanha -> export -> ativacao
- FR11: Agente pode adaptar o pipeline ao contexto do briefing (pular etapas nao aplicaveis)
- FR12: Agente pode salvar checkpoint ao concluir cada etapa do pipeline
- FR13: Agente pode retomar execucao a partir do ultimo checkpoint sem reprocessar etapas concluidas
- FR14: Agente pode preservar creditos de API ja gastos em etapas concluidas (nao reusar)
- FR15: Agente pode executar o pipeline em modo Guiado (com approval gates) ou Autopilot (sem interrupcoes)

**Approval Gates (Modo Guiado)**

- FR16: Agente pode pausar apos busca de empresas e apresentar resultados para aprovacao
- FR17: Agente pode pausar apos busca de leads e apresentar amostra para aprovacao
- FR18: Usuario pode revisar o lote completo de leads, filtrar e remover leads individuais antes de aprovar
- FR19: Agente pode pausar apos criacao de campanha e apresentar preview para revisao
- FR20: Usuario pode editar conteudo da campanha (textos dos emails) antes de aprovar
- FR21: Agente pode pausar antes da ativacao no Instantly para confirmacao final
- FR22: Usuario pode aprovar ou rejeitar em cada approval gate

**Criacao Inteligente de Campanha**

- FR23: Agente pode criar campanha utilizando dados da Knowledge Base (perfil empresa, ICP, tom de voz)
- FR24: Agente pode selecionar o produto correto da Knowledge Base para a campanha
- FR25: Agente pode gerar icebreakers personalizados com base em posts recentes do LinkedIn do lead
- FR26: Agente pode gerar sequencia de emails com estrutura otimizada (quantidade, intervalos, objetivo)
- FR27: Agente pode detectar que um produto mencionado no briefing nao existe na Knowledge Base
- FR28: Usuario pode cadastrar um novo produto via conversa inline durante o briefing
- FR29: Agente pode utilizar o produto recem-cadastrado imediatamente na campanha corrente

**Export e Ativacao**

- FR30: Agente pode exportar campanha com leads para o Instantly
- FR31: Agente pode configurar sending accounts na campanha exportada
- FR32: Agente pode ativar a campanha no Instantly

**Monitoramento de Execucao**

- FR33: Agente pode exibir feedback visual de progresso durante cada etapa do pipeline
- FR34: Agente pode exibir resumo final com metricas apos conclusao (leads, emails, custo total)
- FR35: Agente pode registrar execution log de cada etapa (input, output, decisao)
- FR36: Agente pode exibir mensagem clara quando uma etapa falha, indicando qual etapa e o motivo
- FR37: Usuario pode escolher entre retry imediato ou retomar depois apos uma falha
- FR38: Usuario pode visualizar lista de execucoes pausadas/incompletas
- FR39: Usuario pode retomar uma execucao pausada a partir do ponto onde parou

**Rastreamento de Custos**

- FR40: Agente pode calcular estimativa de custo pre-execucao baseada no volume e APIs envolvidas
- FR41: Agente pode rastrear custo real de cada etapa durante a execucao
- FR42: Agente pode exibir custo total ao final da execucao

### NonFunctional Requirements

**Performance**

- NFR1: Cada etapa do pipeline deve exibir feedback visual de progresso ao usuario enquanto processa (indicacao de loading com descricao da acao em andamento)
- NFR2: Pipeline completo (briefing ate campanha ativa) deve concluir em menos de 15 minutos para execucoes tipicas (ate 100 leads)
- NFR3: Respostas do agente no chat (interpretacao de briefing, perguntas guiadas) devem retornar em menos de 5 segundos, com indicador de loading visivel durante processamento

**Integracao**

- NFR4: O agente deve tratar erros de APIs externas (theirStack, Apollo, Apify, OpenAI, Instantly) com mensagens claras indicando qual servico falhou e que o problema e externo
- NFR5: Cada chamada a API externa deve implementar retry com backoff exponencial (maximo 3 tentativas) antes de reportar falha ao usuario
- NFR6: O pipeline deve ser tolerante a indisponibilidade parcial — falha em um servico nao deve corromper resultados de etapas ja concluidas

**Confiabilidade**

- NFR7: Taxa de conclusao do pipeline deve ser >= 90% (execucoes que completam todas as etapas sem erro critico)
- NFR8: Checkpoint de cada etapa deve ser persistido em banco antes de iniciar a etapa seguinte (protecao contra crash)
- NFR9: Execucoes retomadas apos falha devem concluir com sucesso em >= 95% dos casos
- NFR10: Creditos de API gastos em etapas concluidas nunca devem ser reprocessados em retomada de execucao

**Seguranca**

- NFR11: API keys de servicos externos devem ser armazenadas encriptadas no Supabase (api_configs existente) — sem mudancas na abordagem atual
- NFR12: Execution logs nao devem conter API keys ou tokens em texto plano

### Additional Requirements

**Da Arquitetura — Decisoes Tecnicas que Impactam Implementacao:**

- Pipeline Sequencial com Steps isolados + interface abstrata `IPipelineOrchestrator` (permite trocar por agente AI na Fase 2)
- 3 novas tabelas Supabase: `agent_executions`, `agent_steps`, `agent_messages` com RLS por tenant
- Comunicacao realtime via Supabase Realtime (subscriptions em `agent_messages` e `agent_steps`)
- API Route por Step — cada rota faz UMA coisa (executar step, aprovar gate, parsear briefing sao routes separadas)
- Orquestracao client-side (frontend dispara steps, nao server-side job)
- Parsing de briefing via OpenAI structured output (gpt-4o-mini)
- Tabela `cost_models` com precos unitarios por API (admin configura)
- Approval gates via status `awaiting_approval` no `agent_steps` — dados controlam fluxo
- Cada step chama UM servico existente; steps nao chamam outros steps
- Classes de Step herdam de `BaseStep` com `saveCheckpoint()` e `logStep()` herdados
- Mensagens do chat com `messageType` (text, approval_gate, progress, error, cost_estimate, summary)
- Error handling com `PipelineError` incluindo `isRetryable` e `externalService`
- Servicos existentes reutilizados: TheirStackService, ApolloService, ApifyService, AI providers, KnowledgeBaseContext, InstantlyService
- Tabela `cost_models` mencionada mas SQL nao definido — sera criada durante implementacao
- Produto inline (FR27-29) e interacao conversacional dentro do briefing, nao um PipelineStep

**Da UX — Padroes que Afetam o Agente:**

- Interface desktop-first, tablet suportado, mobile baixa prioridade
- Visual premium estilo Attio/Airtable — manter consistencia total com o app existente
- Feedback visual durante loading com descricao da acao (nao spinner generico)
- Mensagens de erro em portugues claro, nunca culpar usuario, sempre proximo passo
- Transicoes suaves (Framer Motion) para estados de UI
- Padroes de componentes shadcn/ui + Tailwind CSS v4 conforme app existente
- Consistencia total com UI patterns do app (sidebar, cards, tables, badges, toasts)
- Seguir todos os padroes visuais e de interacao ja estabelecidos no tdec-prospect

### FR Coverage Map

| FR | Epic | Descricao |
|----|------|-----------|
| FR1 | 16 | Interface de chat de texto |
| FR2 | 16 | Briefing em linguagem natural |
| FR3 | 16 | Parsing de parametros estruturados |
| FR4 | 16 | Perguntas guiadas (fallback) |
| FR5 | 16 | Selecao de modo (Guiado/Autopilot) |
| FR6 | 16 | Plano de execucao |
| FR7 | 16 | Estimativa de custo pre-execucao |
| FR8 | 16 | Confirmar/cancelar execucao |
| FR9 | 16 | Onboarding na primeira interacao |
| FR10 | 17 | Pipeline completo end-to-end |
| FR11 | 17 | Adaptacao do pipeline (pular etapas) |
| FR12 | 17 | Checkpoint ao concluir etapa |
| FR13 | 18 | Retomar do ultimo checkpoint |
| FR14 | 18 | Preservar creditos de API |
| FR15 | 17 | Modo Guiado vs Autopilot |
| FR16 | 17 | Gate - empresas encontradas |
| FR17 | 17 | Gate - leads encontrados |
| FR18 | 17 | Filtragem/remocao de leads |
| FR19 | 17 | Gate - campanha criada |
| FR20 | 17 | Edicao de conteudo da campanha |
| FR21 | 17 | Gate - ativacao |
| FR22 | 17 | Aprovar/rejeitar em cada gate |
| FR23 | 17 | Campanha com Knowledge Base |
| FR24 | 17 | Selecao de produto |
| FR25 | 17 | Icebreakers LinkedIn |
| FR26 | 17 | Sequencia de emails otimizada |
| FR27 | 16 | Deteccao de produto nao cadastrado |
| FR28 | 16 | Cadastro de produto inline |
| FR29 | 16 | Uso imediato do produto cadastrado |
| FR30 | 17 | Export para Instantly |
| FR31 | 17 | Sending accounts |
| FR32 | 17 | Ativacao no Instantly |
| FR33 | 17 | Feedback visual de progresso |
| FR34 | 18 | Resumo final com metricas |
| FR35 | 18 | Execution log por etapa |
| FR36 | 18 | Mensagem clara de falha |
| FR37 | 18 | Retry ou retomar depois |
| FR38 | 18 | Lista de execucoes pausadas |
| FR39 | 18 | Retomar execucao pausada |
| FR40 | 16 | Calculo de estimativa de custo |
| FR41 | 18 | Custo real por etapa |
| FR42 | 18 | Custo total ao final |

## Epic List

### Epic 16: Agent Foundation & Briefing Conversacional
O usuario pode abrir o Agente TDEC, conversar naturalmente, ter o briefing interpretado com extracao de parametros, ver o plano de execucao com estimativa de custo, e cadastrar produtos inline quando necessario.
**FRs cobertos:** FR1-FR9, FR27-FR29, FR40 (13 FRs)
**NFRs:** NFR3, NFR11-NFR12

### Epic 17: Pipeline Execution & Approval Gates
O usuario pode executar o pipeline completo de prospeccao (busca empresas -> leads -> campanha -> export -> ativacao) em modo Guiado com 4 approval gates ou Autopilot sem interrupcoes, com feedback visual de progresso em tempo real.
**FRs cobertos:** FR10-FR12, FR15-FR26, FR30-FR33 (19 FRs)
**NFRs:** NFR1-NFR2, NFR8

### Epic 18: Resilience, Recovery & Execution Analytics
O usuario pode recuperar de falhas no pipeline, retomar execucoes pausadas do ponto onde pararam, acompanhar custos reais por etapa, e revisar historico de execucoes com logs completos de auditoria.
**FRs cobertos:** FR13-FR14, FR34-FR39, FR41-FR42 (10 FRs)
**NFRs:** NFR4-NFR10

---

## Epic 16: Agent Foundation & Briefing Conversacional

O usuario pode abrir o Agente TDEC, conversar naturalmente, ter o briefing interpretado com extracao de parametros estruturados, ver o plano de execucao com estimativa de custo, e cadastrar produtos inline quando necessario.

### Story 16.1: Data Models, Tipos e Pagina do Agente

As a usuario do TDEC Prospect,
I want acessar a pagina do Agente TDEC no menu do app,
So that eu tenha uma interface dedicada para interagir com o agente conversacional.

**Acceptance Criteria:**

**Given** o usuario esta autenticado no TDEC Prospect
**When** clica em "Agente TDEC" no menu lateral
**Then** a pagina do agente e exibida com o container de chat vazio e input de mensagem
**And** a pagina segue os padroes visuais do app (sidebar, header, tema B&W)

**Given** o banco de dados do projeto
**When** as migrations sao executadas
**Then** as tabelas `agent_executions`, `agent_steps`, `agent_messages` e `cost_models` sao criadas com RLS por tenant_id
**And** os indices definidos na arquitetura estao presentes

**Given** o projeto TypeScript
**When** os tipos do agente sao importados
**Then** estao disponiveis: `AgentExecution`, `AgentStep`, `AgentMessage`, `ParsedBriefing`, `PipelineStep`, `StepType`, `CostModel`, `CostEstimate`, `PipelineError`
**And** todos os tipos seguem as interfaces definidas na arquitetura

**Given** a pagina do agente carregada
**When** o componente AgentChat renderiza
**Then** exibe area de mensagens (vazia), input de texto na parte inferior, e layout responsivo desktop-first

### Story 16.2: Sistema de Mensagens do Chat

As a usuario do Agente TDEC,
I want enviar mensagens e receber respostas do agente em tempo real,
So that eu possa conversar com o agente de forma fluida e natural.

**Acceptance Criteria:**

**Given** o usuario esta na pagina do agente com uma execucao ativa
**When** digita uma mensagem no input e pressiona Enter ou clica no botao de envio
**Then** a mensagem aparece imediatamente na lista de mensagens com role 'user'
**And** a mensagem e persistida na tabela `agent_messages`

**Given** uma nova mensagem com role 'agent' e inserida no banco
**When** a subscription Supabase Realtime detecta a mudanca
**Then** a mensagem aparece automaticamente na lista de mensagens do frontend sem refresh
**And** a lista rola automaticamente para a mensagem mais recente

**Given** mensagens de diferentes tipos (text, progress, error, cost_estimate)
**When** renderizadas na lista
**Then** cada tipo tem estilo visual distinto conforme o messageType no metadata
**And** mensagens do usuario aparecem alinhadas a direita, do agente a esquerda

**Given** o chat com historico de mensagens
**When** o usuario recarrega a pagina
**Then** o historico completo de mensagens da execucao e carregado na ordem cronologica

**Given** o usuario digita no input
**When** o agente esta processando (aguardando resposta)
**Then** um indicador de "agente digitando" e exibido na area de mensagens

### Story 16.3: Briefing Parser & Linguagem Natural

As a usuario do Agente TDEC,
I want descrever o que quero prospectar em linguagem natural,
So that o agente interprete meu briefing e extraia os parametros sem eu precisar preencher formularios.

**Acceptance Criteria:**

**Given** o usuario envia uma mensagem como "Quero prospectar CTOs de fintechs em SP que usam Netskope"
**When** o agente processa o briefing via BriefingParserService
**Then** os parametros sao extraidos: technology="Netskope", jobTitles=["CTO"], location="Sao Paulo", industry="fintech"
**And** o agente confirma os parametros interpretados na resposta

**Given** o briefing e enviado para a API POST /api/agent/briefing/parse
**When** o OpenAI structured output (gpt-4o-mini) processa
**Then** retorna um objeto ParsedBriefing com todos os campos tipados
**And** a resposta retorna em menos de 5 segundos (NFR3)

**Given** o briefing esta incompleto (ex: "Quero prospectar empresas de tecnologia")
**When** o parser nao consegue extrair cargo, localizacao ou produto
**Then** o agente faz perguntas guiadas especificas para os campos faltantes
**And** cada pergunta e clara e contextualizada (ex: "Qual cargo voce quer atingir? Ex: CTOs, Heads de TI...")

**Given** o usuario responde as perguntas guiadas
**When** todos os parametros obrigatorios estao completos
**Then** o agente apresenta o briefing consolidado para confirmacao
**And** o usuario pode confirmar ou corrigir antes de prosseguir

**Given** o briefing menciona um produto cadastrado na Knowledge Base
**When** o parser identifica o produto
**Then** o campo productSlug do ParsedBriefing e preenchido com o slug correto

### Story 16.4: Onboarding & Selecao de Modo

As a usuario novo do Agente TDEC,
I want ver uma mensagem de boas-vindas explicando o que o agente faz e poder escolher o modo de operacao,
So that eu entenda como usar o agente e tenha controle sobre o nivel de autonomia.

**Acceptance Criteria:**

**Given** o usuario abre o Agente TDEC pela primeira vez (nenhuma execucao anterior)
**When** a pagina carrega
**Then** o agente exibe uma mensagem de onboarding explicando suas capacidades
**And** a mensagem inclui: o que o agente faz, como funciona o fluxo, e convida o usuario a comecar

**Given** o usuario ja usou o agente anteriormente (tem execucoes no historico)
**When** a pagina carrega
**Then** a mensagem de onboarding NAO e exibida
**And** o agente mostra uma saudacao breve e esta pronto para receber o briefing

**Given** o briefing foi parseado e confirmado pelo usuario
**When** o agente apresenta o plano de execucao
**Then** inclui o seletor de modo com as opcoes "Guiado" e "Autopilot"
**And** cada modo tem descricao clara: Guiado = "Vou pedir sua aprovacao em cada etapa" / Autopilot = "Executo tudo sem interrupcoes"

**Given** o usuario seleciona um modo
**When** confirma a selecao
**Then** o modo e salvo no campo `mode` da execucao (agent_executions)
**And** o agente confirma: "Modo [Guiado/Autopilot] selecionado"

### Story 16.5: Plano de Execucao & Estimativa de Custo

As a usuario do Agente TDEC,
I want ver o plano de execucao com estimativa de custo antes de iniciar,
So that eu saiba exatamente o que vai acontecer e quanto vai custar antes de comprometer recursos.

**Acceptance Criteria:**

**Given** o briefing foi parseado e o modo selecionado
**When** o agente gera o plano de execucao
**Then** apresenta as etapas que serao executadas em ordem (ex: "1. Buscar empresas com Netskope, 2. Encontrar CTOs, 3. Criar campanha...")
**And** indica quais etapas serao puladas (se aplicavel, baseado no briefing)

**Given** o plano de execucao foi gerado
**When** o CostEstimatorService calcula a estimativa
**Then** o componente AgentCostEstimate exibe o custo estimado por etapa e total
**And** o calculo usa os precos unitarios da tabela `cost_models` multiplicados pelo volume estimado

**Given** a tabela `cost_models` no banco
**When** consultada pelo CostEstimatorService
**Then** contem precos unitarios para: theirStack (per search), Apollo (per lead), Apify (per profile), OpenAI (per prompt avg), Instantly (per export)
**And** os valores sao configurados via seed data inicial

**Given** o plano e estimativa de custo exibidos ao usuario
**When** o usuario clica em "Confirmar" ou "Iniciar"
**Then** a execucao e criada no banco (agent_executions com status='pending') e os steps sao registrados em agent_steps
**And** o agente confirma: "Execucao iniciada!"

**Given** o plano e estimativa de custo exibidos ao usuario
**When** o usuario clica em "Cancelar"
**Then** a execucao NAO e criada
**And** o agente responde: "Tudo bem! Quando quiser tentar de novo, e so me dizer"

### Story 16.6: Cadastro de Produto Inline

As a usuario do Agente TDEC,
I want cadastrar um produto novo durante o briefing sem sair do chat,
So that eu possa prospectar para produtos novos imediatamente sem precisar ir ate as configuracoes.

**Acceptance Criteria:**

**Given** o usuario menciona um produto no briefing (ex: "Quero prospectar pro TDEC Analytics")
**When** o BriefingParserService nao encontra o produto na Knowledge Base
**Then** o agente informa: "Nao encontrei o produto 'TDEC Analytics'. Quer cadastrar agora?"
**And** explica os campos necessarios: nome, descricao, principais features, diferenciais, publico-alvo

**Given** o agente ofereceu cadastrar o produto inline
**When** o usuario aceita e fornece as informacoes em linguagem natural
**Then** o agente extrai os campos estruturados da resposta
**And** apresenta um resumo para confirmacao: "Cadastrei o TDEC Analytics: [resumo]. Esta correto?"

**Given** o usuario confirma o cadastro do produto
**When** o agente persiste o produto
**Then** o produto e salvo na Knowledge Base via servico existente
**And** o campo productSlug do ParsedBriefing e atualizado com o novo produto

**Given** o produto foi cadastrado inline
**When** o fluxo de briefing continua
**Then** o agente utiliza o produto recem-cadastrado normalmente na campanha
**And** a transicao e transparente — o usuario nao percebe diferenca entre produto existente e recem-criado

**Given** o usuario nao quer cadastrar o produto agora
**When** recusa a oferta de cadastro inline
**Then** o agente pergunta se quer usar outro produto ja cadastrado ou continuar sem produto especifico

---

## Epic 17: Pipeline Execution & Approval Gates

O usuario pode executar o pipeline completo de prospeccao (busca empresas -> leads -> campanha -> export -> ativacao) em modo Guiado com 4 approval gates ou Autopilot sem interrupcoes, com feedback visual de progresso em tempo real.

### Story 17.1: Pipeline Orchestrator & Step de Busca de Empresas

As a usuario do Agente TDEC,
I want que o agente busque empresas por tecnologia apos eu confirmar o plano,
So that eu veja as empresas encontradas como primeiro resultado concreto do pipeline.

**Acceptance Criteria:**

**Given** uma execucao confirmada pelo usuario (status='pending')
**When** o frontend dispara a execucao do primeiro step via POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute
**Then** o DeterministicOrchestrator despacha para o SearchCompaniesStep
**And** o step chama o TheirStackService existente com os parametros do briefing (tecnologia, localizacao, industria)

**Given** o SearchCompaniesStep esta executando
**When** o status do step muda para 'running' no agent_steps
**Then** o frontend recebe a atualizacao via Supabase Realtime
**And** o AgentStepProgress exibe "Etapa 1/5: Buscando empresas com [tecnologia]..." com indicador de loading

**Given** o SearchCompaniesStep concluiu com sucesso
**When** o resultado e retornado (lista de empresas)
**Then** o output e salvo no campo `output` do agent_steps
**And** um checkpoint e salvo (status='completed', completed_at preenchido) antes de qualquer acao seguinte (NFR8)
**And** o custo do step e registrado no campo `cost` do agent_steps

**Given** a classe BaseStep
**When** qualquer step herda dela
**Then** tem acesso a saveCheckpoint() e logStep() como metodos herdados
**And** saveCheckpoint() persiste output + status no banco antes de retornar
**And** logStep() registra input, output e decisao na execucao

**Given** o DeterministicOrchestrator
**When** implementa IPipelineOrchestrator
**Then** expoe planExecution(), executeStep() e getExecution()
**And** o step registry contem os 5 tipos de step: search_companies, search_leads, create_campaign, export, activate

### Story 17.2: Step de Busca de Leads

As a usuario do Agente TDEC,
I want que o agente encontre leads (contatos) nas empresas descobertas,
So that eu tenha pessoas reais para contatar na minha campanha.

**Acceptance Criteria:**

**Given** o step de busca de empresas foi concluido com sucesso
**When** o frontend dispara a execucao do SearchLeadsStep
**Then** o step chama o ApolloService existente com os cargos do briefing e as empresas encontradas no step anterior
**And** o AgentStepProgress atualiza para "Etapa 2/5: Buscando leads ([cargos]) nas [N] empresas..."

**Given** o SearchLeadsStep concluiu com sucesso
**When** o resultado e retornado (lista de leads com nome, cargo, empresa, email)
**Then** o output e salvo com checkpoint no agent_steps
**And** o custo do step (baseado no numero de leads encontrados) e registrado

**Given** o ApolloService retorna leads
**When** o output e formatado
**Then** inclui para cada lead: nome, cargo, empresa, email, LinkedIn URL (quando disponivel)
**And** o total de leads encontrados e registrado no output

### Story 17.3: Step de Criacao de Campanha

As a usuario do Agente TDEC,
I want que o agente crie uma campanha completa com emails personalizados e icebreakers,
So that eu tenha uma campanha pronta para envio sem precisar escrever os textos manualmente.

**Acceptance Criteria:**

**Given** os leads foram encontrados no step anterior
**When** o CreateCampaignStep e executado
**Then** o step carrega o contexto da Knowledge Base via KnowledgeBaseContext existente (perfil empresa, ICP, tom de voz)
**And** seleciona o produto correto baseado no productSlug do briefing (FR24)

**Given** o contexto da Knowledge Base esta carregado
**When** o step gera os emails da campanha
**Then** utiliza os AI providers existentes para gerar a sequencia de emails
**And** a sequencia segue estrutura otimizada: quantidade de emails, intervalos entre envios, objetivo de cada email (FR26)
**And** o tom de voz da Knowledge Base e aplicado a todos os textos

**Given** os leads possuem LinkedIn URL
**When** o step gera icebreakers
**Then** chama o ApifyService existente para buscar posts recentes do LinkedIn
**And** gera icebreakers personalizados baseados nos posts reais de cada lead (FR25)

**Given** o CreateCampaignStep concluiu
**When** o output e salvo
**Then** contem: campanha completa (nome, emails com assuntos e corpos, icebreakers por lead, configuracoes)
**And** checkpoint e custo sao registrados

### Story 17.4: Steps de Export & Ativacao

As a usuario do Agente TDEC,
I want que o agente exporte a campanha para o Instantly e ative o envio,
So that minha campanha esteja no ar e enviando emails automaticamente.

**Acceptance Criteria:**

**Given** a campanha foi criada no step anterior
**When** o ExportStep e executado
**Then** chama o InstantlyService existente para exportar a campanha com os leads
**And** o AgentStepProgress exibe "Etapa 4/5: Exportando campanha para o Instantly..."

**Given** o export para o Instantly
**When** a campanha e criada no Instantly
**Then** as sending accounts sao configuradas na campanha exportada (FR31)
**And** o ID da campanha no Instantly e salvo no output do step

**Given** o export concluiu com sucesso
**When** o ActivateStep e executado
**Then** chama o InstantlyService para ativar a campanha pelo ID retornado no step anterior
**And** o AgentStepProgress exibe "Etapa 5/5: Ativando campanha no Instantly..."

**Given** a ativacao concluiu com sucesso
**When** o pipeline completa todas as etapas
**Then** o status da execucao (agent_executions) muda para 'completed'
**And** o agente envia mensagem confirmando: "Campanha '[nome]' ativa no Instantly com [N] leads"

### Story 17.5: Approval Gates - Empresas & Leads

As a usuario do Agente TDEC em modo Guiado,
I want revisar as empresas encontradas e os leads antes de prosseguir,
So that eu tenha controle sobre quais empresas e contatos entram na minha campanha.

**Acceptance Criteria:**

**Given** o modo e Guiado e o SearchCompaniesStep concluiu
**When** o status do step muda para 'awaiting_approval'
**Then** o AgentApprovalGate renderiza um card interativo com a lista de empresas encontradas
**And** exibe total de empresas e amostra das maiores
**And** botoes "Aprovar" e "Rejeitar" estao visiveis

**Given** o usuario clica em "Aprovar" no gate de empresas
**When** a API POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve e chamada
**Then** o status do step muda para 'approved'
**And** o pipeline avanca para o proximo step automaticamente

**Given** o SearchLeadsStep concluiu em modo Guiado
**When** o gate de leads e exibido
**Then** o AgentLeadReview renderiza uma tabela com todos os leads encontrados (nome, cargo, empresa, email)
**And** cada lead tem checkbox para selecao/desselecao individual
**And** exibe o total de leads e permite filtrar por empresa ou cargo

**Given** o usuario desmarca leads individuais na tabela de revisao
**When** clica em "Aprovar" com leads filtrados
**Then** apenas os leads aprovados sao passados para o proximo step
**And** a contagem de leads aprovados e registrada no output do gate

**Given** o usuario clica em "Rejeitar" em qualquer gate
**When** a API POST /api/agent/executions/[executionId]/steps/[stepNumber]/reject e chamada
**Then** o agente pergunta o que o usuario gostaria de ajustar
**And** o pipeline NAO avanca ate nova aprovacao

### Story 17.6: Approval Gates - Campanha & Ativacao

As a usuario do Agente TDEC em modo Guiado,
I want revisar e editar a campanha criada antes de exportar, e confirmar a ativacao,
So that eu tenha controle total sobre o conteudo que sera enviado e quando sera ativado.

**Acceptance Criteria:**

**Given** o modo e Guiado e o CreateCampaignStep concluiu
**When** o gate de campanha e exibido
**Then** o AgentCampaignPreview renderiza o preview completo da campanha
**And** exibe: nome da campanha, sequencia de emails (assunto + corpo de cada um), icebreakers por lead

**Given** o preview da campanha esta visivel
**When** o usuario clica em um texto de email para editar
**Then** o campo torna-se editavel inline (FR20)
**And** as alteracoes sao salvas no output do step ao aprovar

**Given** o usuario editou textos e esta satisfeito
**When** clica em "Aprovar" no gate de campanha
**Then** a campanha atualizada (com edicoes) e passada para o ExportStep
**And** o status do step muda para 'approved'

**Given** o ExportStep concluiu em modo Guiado
**When** o gate de ativacao e exibido
**Then** o agente apresenta resumo final: "[N] leads, [M] emails na sequencia, [K] sending accounts"
**And** pergunta: "Quer ativar a campanha agora?"

**Given** o usuario confirma a ativacao
**When** clica em "Ativar" no gate final
**Then** o ActivateStep e executado
**And** a campanha e ativada no Instantly

**Given** o usuario nao quer ativar agora
**When** recusa no gate de ativacao
**Then** a campanha permanece exportada mas nao ativa no Instantly
**And** a execucao e marcada como 'completed' com nota de que a ativacao foi adiada

### Story 17.7: Logica Guiado vs Autopilot & Adaptacao de Pipeline

As a usuario do Agente TDEC,
I want poder executar o pipeline sem interrupcoes no modo Autopilot e ter etapas puladas quando nao aplicaveis,
So that eu tenha flexibilidade entre controle total e execucao rapida conforme minha confianca no agente.

**Acceptance Criteria:**

**Given** o modo selecionado e Autopilot
**When** cada step do pipeline conclui
**Then** o status vai direto de 'running' para 'completed' (sem 'awaiting_approval')
**And** o proximo step e disparado automaticamente pelo frontend
**And** o usuario ve o progresso em tempo real mas nao precisa intervir

**Given** o modo e Autopilot e o pipeline completa todas as etapas
**When** o ultimo step (Activate) conclui
**Then** o agente envia mensagem com resumo final completo
**And** a execucao e marcada como 'completed'

**Given** o briefing indica que uma etapa nao e aplicavel
**When** o DeterministicOrchestrator avalia shouldSkip() de cada step
**Then** etapas nao aplicaveis recebem status 'skipped' e sao puladas (FR11)
**And** o agente informa quais etapas foram puladas e por que

**Given** o pipeline tem etapas puladas
**When** o AgentStepProgress renderiza
**Then** etapas puladas aparecem com visual distinto (ex: riscadas ou cinza) mas visiveis
**And** a numeracao de "Etapa X de Y" reflete apenas as etapas ativas

---

## Epic 18: Resilience, Recovery & Execution Analytics

O usuario pode recuperar de falhas no pipeline, retomar execucoes pausadas do ponto onde pararam, acompanhar custos reais por etapa, e revisar historico de execucoes com logs completos de auditoria.

### Story 18.1: Error Handling & Retry

As a usuario do Agente TDEC,
I want ver uma mensagem clara quando algo falha e poder tentar novamente imediatamente,
So that eu entenda o que aconteceu e nao perca o progresso do pipeline por causa de um erro temporario.

**Acceptance Criteria:**

**Given** um step do pipeline falha durante a execucao (ex: API do Apollo retorna erro 500)
**When** o erro e capturado pelo BaseStep
**Then** o PipelineError e criado com: code, message (em portugues), stepNumber, stepType, isRetryable, externalService
**And** o status do step muda para 'failed' com error_message preenchido
**And** o status da execucao muda para 'paused'

**Given** o step falhou com um erro retryable (ex: timeout, 503)
**When** o agente exibe a mensagem de erro no chat
**Then** a mensagem indica claramente: qual etapa falhou, qual servico externo causou o problema, e que o problema e externo
**And** exibe dois botoes: "Tentar novamente" e "Retomar depois" (FR37)

**Given** o usuario clica em "Tentar novamente"
**When** o step e re-executado
**Then** implementa retry com backoff exponencial (maximo 3 tentativas) antes de reportar falha definitiva (NFR5)
**And** se o retry for bem-sucedido, o pipeline continua normalmente
**And** se todas as tentativas falharem, o step permanece 'failed' e o usuario e informado

**Given** o step falhou com erro nao-retryable (ex: dados invalidos, 400)
**When** o agente exibe a mensagem de erro
**Then** o botao "Tentar novamente" NAO e exibido (apenas "Retomar depois")
**And** a mensagem orienta o usuario sobre o que fazer

**Given** uma falha em qualquer servico externo
**When** o pipeline esta em modo Autopilot
**Then** o pipeline pausa automaticamente (nao continua cegamente)
**And** o usuario e notificado da falha com as mesmas opcoes de retry/retomar

### Story 18.2: Checkpoint Resume & Protecao de Creditos

As a usuario do Agente TDEC,
I want retomar uma execucao do ponto onde parou sem reprocessar etapas ja concluidas,
So that eu nao perca tempo nem gaste creditos de API desnecessariamente.

**Acceptance Criteria:**

**Given** uma execucao com status 'paused' e steps 1-3 com status 'completed'
**When** o usuario retoma a execucao
**Then** o DeterministicOrchestrator identifica o primeiro step nao-completo (step 4)
**And** inicia a execucao a partir desse step, pulando os anteriores (FR13)

**Given** steps ja concluidos com output salvo
**When** a execucao e retomada
**Then** os outputs dos steps anteriores sao reutilizados como input para o step atual
**And** nenhuma chamada de API e feita para steps ja concluidos (FR14, NFR10)
**And** os custos dos steps concluidos NAO sao recalculados ou duplicados

**Given** o checkpoint de um step foi salvo (status='completed', output preenchido)
**When** ocorre um crash ou desconexao do frontend
**Then** o estado persiste no banco (NFR8)
**And** ao reconectar, o usuario ve o estado real da execucao via Realtime

**Given** a tolerancia a falha parcial (NFR6)
**When** um step falha apos outros terem concluido
**Then** os resultados dos steps concluidos permanecem intactos e utilizaveis
**And** o step que falhou pode ser retentado sem afetar os anteriores

### Story 18.3: Lista de Execucoes Pausadas & Retomada

As a usuario do Agente TDEC,
I want ver todas as minhas execucoes pausadas ou incompletas e poder retomar qualquer uma,
So that eu nao perca trabalho ja feito e possa voltar a execucoes anteriores quando conveniente.

**Acceptance Criteria:**

**Given** o usuario abre a pagina do Agente TDEC
**When** existem execucoes com status 'paused' ou 'failed'
**Then** o AgentPausedExecutions exibe uma lista com as execucoes pendentes
**And** cada item mostra: nome do briefing, data, etapas concluidas/total, motivo da pausa

**Given** a lista de execucoes pausadas
**When** o usuario clica em "Retomar" em uma execucao
**Then** o chat carrega o historico de mensagens daquela execucao
**And** o agente mostra o status atual: "Execucao pausada — '[briefing]'. Etapas concluidas: [lista]. Pendente: [proxima etapa]. [Retomar]"
**And** ao confirmar, a execucao reinicia do proximo step pendente

**Given** nenhuma execucao pausada existe
**When** o usuario abre a pagina do agente
**Then** o AgentPausedExecutions nao e exibido (ou mostra estado vazio discreto)
**And** o agente esta pronto para receber um novo briefing

**Given** o usuario tem multiplas execucoes pausadas
**When** visualiza a lista
**Then** as execucoes sao ordenadas por data (mais recente primeiro)
**And** o usuario pode distinguir entre 'paused' (usuario escolheu retomar depois) e 'failed' (erro)

### Story 18.4: Resumo Final & Rastreamento de Custos

As a usuario do Agente TDEC,
I want ver um resumo completo com metricas e custos ao final de cada execucao,
So that eu saiba exatamente o que foi feito e quanto custou.

**Acceptance Criteria:**

**Given** o pipeline completou todas as etapas com sucesso
**When** a execucao e marcada como 'completed'
**Then** o AgentExecutionSummary e exibido no chat com: total de empresas encontradas, total de leads, nome da campanha, quantidade de emails, sending accounts, custo total
**And** o result_summary e salvo no campo `result_summary` de agent_executions (FR34)

**Given** cada step do pipeline em execucao
**When** o step conclui e registra seu custo
**Then** o custo real e baseado no uso efetivo (numero real de chamadas API, nao estimativa) (FR41)
**And** o custo acumulado e atualizado no campo `cost_actual` de agent_executions

**Given** a execucao completou
**When** o custo total e exibido no resumo
**Then** mostra o custo por etapa e o total consolidado (FR42)
**And** compara com a estimativa pre-execucao: "Estimado: R$2,50 | Real: R$2,30"

**Given** a execucao falhou e foi retomada
**When** o resumo final e gerado
**Then** os custos refletem apenas os gastos reais (sem duplicatas de steps retentados com sucesso)
**And** steps que falharam e foram retentados mostram o custo apenas da tentativa bem-sucedida

### Story 18.5: Execution Log & Auditoria

As a usuario do Agente TDEC,
I want acessar logs detalhados de cada etapa da execucao,
So that eu possa auditar o que o agente fez e diagnosticar problemas quando necessario.

**Acceptance Criteria:**

**Given** cada step do pipeline e executado
**When** o BaseStep.logStep() registra a acao
**Then** o log contem: input enviado ao servico, output recebido, decisao tomada (ex: "87 leads encontrados, 3 removidos pelo usuario") (FR35)
**And** os logs sao salvos no campo `output` de agent_steps com estrutura padronizada

**Given** os logs de execucao
**When** armazenados no banco
**Then** NAO contem API keys, tokens ou credenciais em texto plano (NFR12)
**And** dados sensiveis sao sanitizados antes do registro

**Given** uma execucao completa ou pausada
**When** o usuario quer ver os detalhes de uma etapa especifica
**Then** pode expandir o step no AgentStepProgress para ver o log detalhado
**And** o log mostra: timestamp de inicio/fim, input resumido, output resumido, custo do step

**Given** o execution log de uma execucao
**When** consultado para debug de um problema
**Then** e possivel rastrear toda a cadeia de decisoes do agente
**And** cada entrada tem timestamp e e ordenada cronologicamente
