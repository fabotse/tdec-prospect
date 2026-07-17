---
status: approved
criadoEm: 2026-07-16
aprovadoEm: 2026-07-16
inputDocuments:
  - agente-tdec-plano-melhorias-2026-07-16.md
  - epics-agente-tdec.md
  - Código-fonte src/lib/agent/**, src/hooks/use-briefing-flow.ts, src/app/api/agent/**
decisoesDoCliente:
  - "TheirStack = opção secundária, nunca forçada nem padrão"
  - "Q1: localização OBRIGATÓRIA; setor e tecnologia opcionais"
  - "Q2: agente tool-calling SÓ na conversa; pipeline de execução determinístico (full-C adiado)"
  - "Q3: icebreaker LinkedIn aceitável, porém OPCIONAL (toggle)"
  - "Q4: capturar objetivo/urgência/descrição/nº de e-mails na conversa"
---

# tdec-prospect - Epic Breakdown: Agente TDEC 2.0

## Overview

Evolução do Agente TDEC (Epics 16/17) a partir da revisão de fluxo de 2026-07-16
(`agente-tdec-plano-melhorias-2026-07-16.md`). Diagnóstico central: o agente hoje é
**slot-filling com pele de chat** — uma única chamada de LLM extrai campos; o resto é máquina de
estados + keywords frágeis, sem memória conversacional. A tecnologia é percebida como obrigatória
(loop de perguntas), os icebreakers saem genéricos (não usam LinkedIn, contrariando FR25 do Epic
17) e o briefing não captura objetivo/urgência/descrição da campanha.

Este épico ataca três dores priorizadas pelo Fabossi: **(1) conversa inteligente, (2) fluxo
flexível, (3) qualidade dos resultados** — mantendo o pipeline de execução determinístico
(decisão Q2: inteligência via LLM só na camada de conversa; `DeterministicOrchestrator` e
approval gates intactos).

**Sequência decidida:** 22.1 (quick win tecnologia) → 22.2 (icebreaker LinkedIn) → 22.3/22.4
(conversa inteligente) → 22.5/22.6 (qualidade) → 22.7 (opcional).

## Requirements Inventory

### Functional Requirements

**Briefing — destravar a tecnologia (Frente A)**

- FR1: Usuário pode completar o briefing sem informar tecnologia — tech é filtro opcional
- FR2: Para prosseguir, o briefing exige apenas **cargo + localização** (setor/tech opcionais)
- FR3: Agente pergunta proativamente por **localização** (e cargo) quando ausentes; nunca exige tecnologia
- FR4: Tecnologia mencionada espontaneamente vira filtro extra (mantém `search_companies`/TheirStack como opção secundária)

**Conversa inteligente (Frente B)**

- FR5: Agente mantém memória conversacional real — histórico estruturado enviado ao LLM a cada turno
- FR6: Interpretação de confirmação/correção/intenção do usuário é feita pelo LLM (`nextAction`), não por listas de keywords
- FR7: Sub-fluxos (cadastro de produto inline, import de leads próprios) são disparados por decisão do LLM, não por estados aparafusados
- FR8: Agente captura na conversa: objetivo, urgência, descrição e nº de e-mails da campanha

**Qualidade dos resultados (Frente D)**

- FR9: Icebreakers do agente podem usar posts reais do LinkedIn (via caminho Apify existente) quando o toggle premium estiver ligado
- FR10: Toggle "icebreaker premium" é opcional, default desligado, exposto no plano/approval gate
- FR11: Leads sem `linkedin_url` ou sem posts recebem fallback de qualidade (icebreaker standard atual)
- FR12: Busca direta no Apollo (sem tech) aplica filtros-padrão de qualidade, sobrescrevíveis na conversa
- FR13 (opcional): Sugestões de cargos/setores contextuais ao negócio do tenant (KB/ICP), com fallback pros mapas estáticos

### NonFunctional Requirements

- NFR1: O pipeline de execução permanece 100% determinístico — nenhuma decisão de execução (ordem de steps, gasto de créditos, envio) é delegada a LLM (decisão Q2)
- NFR2: Respostas do agente no chat continuam < 5s (herda NFR3 do Epic 16); falha/timeout do LLM degrada pro comportamento determinístico atual (fail-open)
- NFR3: Custo Apify por lead é incluído na estimativa pré-execução e no custo real do step quando o toggle premium está ligado
- NFR4: Zero regressão nos fluxos existentes: 17.10 (entrada direta em leads), 17.11 (leads próprios), 16.6 (produto inline), 17.9 (sending accounts)
- NFR5: Zero migration de schema — campos novos do briefing vivem no JSONB `agent_executions.briefing`

### Additional Requirements

- `IPipelineOrchestrator` / `DeterministicOrchestrator` NÃO são substituídos (full-C adiado — provavelmente desnecessário)
- Reuso obrigatório: caminho Apify/LinkedIn de `api/leads/enrich-icebreaker` + `src/lib/services/apify.ts` (não duplicar scraping)
- O skip determinístico de `search_companies` quando tech é null (`parse/route.ts:227-230`) é mantido — é o mecanismo que torna TheirStack secundária
- Prompts continuam como constantes TS/`ai_prompts` no padrão existente (`promptManager`)
- Keywords atuais (`CONFIRMATION_KEYWORDS` etc.) podem permanecer como fallback do fail-open, fora do caminho principal

### Fora do Escopo (exclusões conscientes)

- **Full-C:** agente tool-calling orquestrando a EXECUÇÃO do pipeline (decisão Q2 — adiado)
- **Epic 18** (Resilience, Recovery & Execution Analytics) — permanece backlog próprio
- **Remoção do TheirStack** — mantida como opção secundária (decisão do cliente)
- Novos canais de conversa (voz, WhatsApp) — só o chat atual

### FR Coverage Map

| FR | Story | Descrição curta |
|----|-------|-----------------|
| FR1 | 22.1 | Briefing sem tecnologia |
| FR2 | 22.1 | canProceed = cargo + localização |
| FR3 | 22.1 | Pergunta proativa de localização |
| FR4 | 22.1 | Tech espontânea = filtro extra |
| FR5 | 22.3 | Memória conversacional real |
| FR6 | 22.3 | Intenção via LLM (nextAction) |
| FR7 | 22.4 | Sub-fluxos por decisão do LLM |
| FR8 | 22.5 | Objetivo/urgência/descrição/nº e-mails |
| FR9 | 22.2 | Icebreaker com posts LinkedIn |
| FR10 | 22.2 | Toggle premium opcional |
| FR11 | 22.2 | Fallback standard |
| FR12 | 22.6 | Filtros-padrão de qualidade |
| FR13 | 22.7 | Sugestões contextuais via KB (opcional) |

## Epic List

### Epic 22: Agente TDEC 2.0 — Conversa Inteligente & Qualidade
O usuário pode conversar naturalmente com o agente sem ser forçado a informar tecnologia,
com memória real de conversa e interpretação de intenção pelo LLM, e recebe campanhas de
qualidade superior (icebreakers com LinkedIn opcional, briefing com objetivo/urgência,
targeting com filtros-padrão) — mantendo o pipeline de execução determinístico e confiável.
**FRs cobertos:** FR1-FR13 · **NFRs:** NFR1-NFR5

---

## Epic 22: Agente TDEC 2.0 — Conversa Inteligente & Qualidade

### Story 22.1: Tecnologia Opcional, Localização Obrigatória

As a usuário do Agente TDEC,
I want completar o briefing informando apenas cargo e localização,
So that eu prospecte sem depender de tecnologia/TheirStack e sem cair em loop de perguntas.

**Acceptance Criteria:**

1. **Given** um briefing com cargo e localização (sem tech, sem setor) **When** `analyzeBriefingCompleteness` avalia (`src/app/api/agent/briefing/parse/route.ts:78-87`) **Then** `canProceed=true` **And** a regra passa a ser `hasJobTitles && hasLocation` (ou fluxo de leads importados) — tech e setor deixam de contar como parâmetro obrigatório
2. **Given** um briefing sem localização (ex.: "quero prospectar CTOs") **When** o agente faz perguntas guiadas **Then** pergunta **localização** (e cargo, se faltar) **And** `QUESTIONABLE_FIELDS` (`src/hooks/use-briefing-flow.ts:133`) passa a ser `["jobTitles","location"]` **And** tecnologia nunca é apresentada como exigência
3. **Given** o `SYSTEM_PROMPT` do parser (`briefing-parser-service.ts:43-66`) **Then** é reescrito com tecnologia descrita como filtro OPCIONAL e busca padrão = cargo + localização **And** o skip determinístico de `search_companies` quando tech é null é mantido (`parse/route.ts:227-230`)
4. **Given** o usuário recusa informar tecnologia ("não tenho tecnologia", "sem filtro de tech") **When** o agente re-avalia **Then** pivota para pedir localização/confirmar o briefing — NÃO re-pergunta tecnologia (teste de regressão do loop)
5. **Given** o usuário menciona tecnologia espontaneamente **Then** ela entra como filtro extra e `search_companies` (TheirStack) é mantido no pipeline (FR4)
6. **Given** o resumo de confirmação do briefing **Then** reflete a nova regra (ex.: "Sem tecnologia específica — busca por cargo + localização"; nota de setor apenas se informado)
7. Testes unitários atualizados: `analyzeBriefingCompleteness`, `generateSmartQuestion(s)`, prompt/schema do parser, cenário de loop morto

### Story 22.2: Icebreaker Premium com LinkedIn (Toggle Opcional)

As a usuário do Agente TDEC,
I want poder ligar icebreakers baseados em posts reais do LinkedIn na campanha do agente,
So that meus e-mails abram com personalização de verdade em vez de "vi que você é CTO na empresa X".

**Acceptance Criteria:**

1. **Given** o plano de execução (ou o approval gate de campanha em modo Guiado) **Then** existe o toggle "Icebreakers premium (LinkedIn)" com default DESLIGADO **And** a escolha é persistida no briefing (JSONB — NFR5) **And** a descrição deixa claro o custo adicional por lead
2. **Given** o toggle LIGADO **When** o `CreateCampaignStep` gera icebreakers (`create-campaign-step.ts`) **Then** para leads com `linkedin_url` busca posts recentes reusando o caminho Apify existente (`enrich-icebreaker`/`ApifyService` — não duplicar scraping) **And** gera o icebreaker com base no post real (fecha o FR25 prometido no Epic 17)
3. **Given** leads sem `linkedin_url`, sem posts recentes ou com falha no Apify **Then** caem no fallback standard atual (fail-open — nenhum lead fica sem icebreaker por causa do premium) **And** `icebreakerStats` distingue `premium` vs `standard` vs `failed`
4. **Given** o toggle LIGADO **Then** a estimativa de custo pré-execução inclui o custo Apify por lead (NFR3) **And** o custo real do step registra os créditos efetivamente gastos
5. **Given** o toggle DESLIGADO **Then** o comportamento atual permanece byte-a-byte (zero regressão — NFR4)
6. Testes unitários: toggle nos dois estados, reuso do caminho Apify (mock), fallbacks, stats e custo

### Story 22.3: Conversa com Memória Real & Intenção via LLM

As a usuário do Agente TDEC,
I want que o agente entenda minhas respostas em linguagem natural e lembre do contexto da conversa,
So that eu não precise usar palavras mágicas nem repetir o que já disse.

**Acceptance Criteria:**

1. **Given** uma conversa em andamento **When** o cliente chama `/api/agent/briefing/parse` **Then** envia o histórico como mensagens estruturadas (`{role, content}[]`) **And** o parser processa o histórico completo (substitui a concatenação com `\n` de `use-briefing-flow.ts:634-635`)
2. **Given** a resposta do parser **Then** inclui `nextAction: "ask" | "confirm" | "proceed" | "register_product" | "import_leads"` e `questionText` (pergunta/confirmação em linguagem natural gerada pelo LLM) **And** o schema Zod valida os campos novos
3. **Given** o usuário confirma com frase livre (ex.: "perfeito, manda bala") **Then** o LLM interpreta como confirmação **And** correção parcial (ex.: "sim, mas troca o cargo pra CFO") aplica a correção e re-apresenta o resumo — sem depender de `CONFIRMATION_KEYWORDS`
4. **Given** falha ou timeout do LLM **Then** o fluxo degrada pro comportamento determinístico atual (keywords como fallback — fail-open, NFR2) **And** resposta < 5s no caminho feliz
5. **Given** a máquina de estados do `use-briefing-flow` **Then** os estados de pergunta/confirmação passam a reagir ao `nextAction` (estrutura preservada, decisão movida pro LLM)
6. Testes unitários: histórico estruturado, `nextAction` em cada ramo, confirmação livre, correção parcial, fallback de timeout

### Story 22.4: Sub-fluxos como Decisão do Agente

As a usuário do Agente TDEC,
I want que cadastro de produto e import de leads aconteçam naturalmente na conversa,
So that eu não dependa de frases-gatilho específicas para acessar esses fluxos.

**Acceptance Criteria:**

1. **Given** o usuário menciona produto não cadastrado em qualquer ponto do briefing **When** o parser responde **Then** `nextAction="register_product"` dispara o sub-fluxo de produto (aposenta a detecção por keywords `PRODUCT_REJECTION_KEYWORDS` do caminho principal)
2. **Given** o usuário indica ter leads próprios em linguagem livre **Then** `nextAction="import_leads"` dispara o fluxo da 17.11 (paste/CSV) — sem depender das frases exatas do prompt atual
3. **Given** os estados `awaiting_product_*` e `*_leads` do `use-briefing-flow` **Then** são simplificados para reagir ao `nextAction`, mantendo os handlers de parse existentes (`parse-product`, `parseLeadInput`)
4. **Given** os testes existentes das stories 16.6 e 17.11 **Then** continuam passando (adaptados ao novo disparo) — zero regressão funcional (NFR4)
5. Testes unitários novos: disparo dos sub-fluxos via `nextAction`, retorno ao fluxo principal após conclusão

### Story 22.5: Briefing de Campanha — Objetivo, Urgência, Descrição e Nº de E-mails

As a usuário do Agente TDEC,
I want dizer na conversa o objetivo da campanha, a urgência, uma descrição e quantos e-mails quero,
So that a campanha gerada reflita minha intenção em vez de sair sempre no padrão genérico.

**Acceptance Criteria:**

1. **Given** o tipo `ParsedBriefing` (`src/types/agent.ts`) **Then** ganha `objective`, `urgency`, `campaignDescription`, `emailCount` (todos nullable) **And** o cast `briefing as Record<string, unknown>` em `create-campaign-step.ts:161-163` é removido em favor do tipo
2. **Given** o usuário menciona objetivo/urgência/descrição/quantidade na conversa **When** o parser extrai **Then** os campos são preenchidos no briefing **And** aparecem no resumo de confirmação
3. **Given** os campos ausentes **Then** o agente faz UMA pergunta leve sobre objetivo (não bloqueante — defaults `COLD_OUTREACH`/`MEDIUM` permanecem) **And** `canProceed` NÃO depende desses campos
4. **Given** `emailCount` informado **When** a estrutura da campanha é gerada **Then** o prompt `campaign_structure_generation` recebe a preferência e a sequência respeita a quantidade pedida
5. **Given** `campaignDescription` presente **Then** o nome da campanha usa a descrição (regra atual de `create-campaign-step.ts:204-207` passa a ser alimentada de verdade)
6. Testes unitários: extração dos campos, defaults, propagação pro step, nome da campanha

### Story 22.6: Filtros-Padrão de Qualidade na Busca Aberta

As a usuário do Agente TDEC,
I want que a busca sem tecnologia venha com filtros de qualidade por padrão,
So that meus créditos Apollo não sejam gastos em leads rasos demais.

**Acceptance Criteria:**

1. **Given** uma busca direta no Apollo (sem tech — `search-leads-step.ts:99-112`) **When** o usuário não especificou tamanho de empresa **Then** filtros-padrão de qualidade são aplicados (defaults definidos com o Fabossi na implementação; ex.: faixas de `companySizes` que excluam empresas de 1-10) **And** os defaults são constantes nomeadas, não números mágicos
2. **Given** o usuário especificou filtros na conversa **Then** os valores dele SEMPRE sobrescrevem os defaults
3. **Given** o plano de execução **Then** exibe os filtros efetivos que serão usados (incluindo defaults aplicados), antes da confirmação — sem surpresa de escopo
4. **Given** o resumo do briefing **Then** informa quando defaults foram aplicados (ex.: "Tamanho de empresa: 11+ — padrão de qualidade, me diga se quiser mudar")
5. Testes unitários: aplicação de defaults, sobrescrita pelo usuário, exibição no plano

### Story 22.7 (Opcional): Sugestões Contextuais via Knowledge Base

As a usuário do Agente TDEC,
I want que as sugestões de cargos e setores reflitam o meu negócio,
So that o agente me guie com opções relevantes ao meu ICP em vez de listas genéricas.

**Acceptance Criteria:**

1. **Given** o tenant tem ICP/perfil na Knowledge Base **When** o agente sugere cargos/setores (`briefing-suggestion-service.ts`) **Then** as sugestões derivam do ICP (via LLM leve ou heurística sobre a KB), não dos mapas estáticos
2. **Given** a KB vazia ou falha na geração **Then** fallback silencioso pros mapas estáticos atuais (`TECH_TO_TITLES`/`INDUSTRY_TO_TITLES`) — fail-open
3. **Given** a latência da sugestão **Then** não degrada o < 5s do turno (cachear por execução se necessário)
4. Testes unitários: derivação da KB (mock), fallback, cache

---

### Dependências & Sequência

- **22.1** independente — primeiro (quick win, valida na tela a dor original)
- **22.2** independente de 22.1 — segundo (maior salto de qualidade percebida)
- **22.3** independente — terceiro; **22.4 depende de 22.3** (usa `nextAction`)
- **22.5** independe de 22.3 no schema, mas a pergunta leve de objetivo fica melhor após 22.3 — quarto/quinto
- **22.6** independente — qualquer momento após 22.1
- **22.7** opcional — só se sobrar espaço; não bloqueia o épico
