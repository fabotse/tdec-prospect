---
tipo: plano-de-melhorias
status: draft
criadoEm: 2026-07-16
autor: Fabossi + Claude
escopo: Agente TDEC (Epics 16, 17 — Briefing Conversacional + Pipeline)
decisoesDoCliente:
  - "TheirStack (busca por tecnologia) = opção secundária, nunca forçada nem padrão"
  - "Prioridades: (1) conversa inteligente, (2) fluxo flexível, (3) qualidade dos resultados"
  - "Q1: localização OBRIGATÓRIA pra avançar; setor (indústria) opcional; tech opcional"
  - "Q2: agente tool-calling só na CONVERSA/briefing; pipeline de execução continua determinístico (full-C adiado)"
  - "Q3: icebreaker LinkedIn/Apify aceitável, mas deve ser OPCIONAL (toggle/sob demanda)"
  - "Q4: capturar objetivo/urgência/descrição/nº de e-mails da campanha na conversa"
inputDocuments:
  - epics-agente-tdec.md
  - Código-fonte src/lib/agent/**, src/hooks/use-briefing-flow.ts, src/app/api/agent/**
---

# Agente TDEC — Revisão do Fluxo & Plano de Melhorias

## 1. Objetivo

Revisar o fluxo completo do Agente TDEC (construído nos Epics 16 e 17) e definir um plano
priorizado de melhorias, ancorado em três dores levantadas pelo Fabossi em teste manual:

1. **Conversa pouco inteligente** — o agente entende mal, repete perguntas, entra em loop.
2. **Fluxo rígido** — sequência engessada, difícil pular etapas / entrar no meio.
3. **Qualidade dos resultados** — leads e campanhas geradas vêm rasos.

Gatilho imediato: o agente **parece obrigar** o usuário a informar uma tecnologia (pra conectar
com o TheirStack), mesmo quando o cliente não pretende mais depender dessa ferramenta.

**Decisão de produto (Fabossi, 2026-07-16):** TheirStack passa a ser **opção secundária** —
disponível pra quem quiser filtrar por stack, mas nunca o caminho obrigatório nem o padrão.

## 2. Veredito da arquitetura (o achado central)

**O "Agente TDEC" não é um agente — é um formulário de slots com pele de chat.**

- Há **uma única chamada de LLM** governando a conversa: o parser
  (`src/lib/agent/briefing-parser-service.ts:43-66`), `gpt-4o-mini` a `temperature 0.1`, que
  extrai um schema fixo de campos e nada mais.
- **Todo o resto da conversa é determinístico**: máquina de estados + casamento de
  palavras-chave hardcoded — `CONFIRMATION_KEYWORDS`, `HELP_KEYWORDS`,
  `PRODUCT_REJECTION_KEYWORDS` (`src/hooks/use-briefing-flow.ts:49-92`). Confirmar com uma frase
  fora da lista quebra o fluxo.
- A cada turno o histórico é **concatenado com `\n` e re-parseado do zero**
  (`use-briefing-flow.ts:634-635`) — não há memória conversacional real.
- As "sugestões inteligentes" são **mapas estáticos** escritos à mão
  (`src/lib/agent/briefing-suggestion-service.ts`: `TECH_TO_TITLES`, `INDUSTRY_TO_TITLES`).

**Consequência:** ele parece burro e rígido porque é. **Porém**, a camada de baixo é sólida — o
pipeline determinístico (5 steps, skip-aware, checkpoints, retry, approval gates) está bem-feito,
e a arquitetura **foi projetada para trocar o orquestrador por um agente de IA na "Fase 2"** (a
interface `IPipelineOrchestrator` existe exatamente pra isso). O encanamento está pronto pra
receber inteligência real.

## 3. Mapa do fluxo atual

```
Briefing (chat, client-side)                 Execução (pipeline determinístico)
─────────────────────────────               ────────────────────────────────────
idle → parse (LLM) → canProceed?             confirm → [1] search_companies (TheirStack, exige tech)
   ├ sim → confirmar (keywords)                        [2] search_leads      (Apollo)
   ├ não → pergunta SÓ tech/cargo                      [3] create_campaign   (KB + IA)
   ├ produto novo → sub-fluxo                          [4] export            (Instantly)
   └ "já tenho leads" → sub-fluxo                      [5] activate          (Instantly)
        ↓                                    Guiado = pausa em cada gate | Autopilot = corre sozinho
   modo → plano+custo → confirm ──────────────────────→
```

**Componentes-chave:**
- UI: `src/components/agent/*` (`AgentChat.tsx` é o orquestrador de estado do chat).
- Máquina de estados do briefing: `src/hooks/use-briefing-flow.ts`.
- Parser (única LLM da conversa): `src/lib/agent/briefing-parser-service.ts`.
- Gate de completude: `src/app/api/agent/briefing/parse/route.ts` (`analyzeBriefingCompleteness`).
- Orquestrador do pipeline: `src/lib/agent/orchestrator.ts` (`DeterministicOrchestrator`).
- Steps: `src/lib/agent/steps/*`.
- Dados: `agent_executions`, `agent_steps`, `agent_messages` (migrations 00047-00049); o briefing
  é JSONB em `agent_executions.briefing`, mutado conversacionalmente até confirmar.

## 4. Diagnóstico por dor

| Dor | Causa raiz |
|-----|-----------|
| **Tecnologia forçada** | `canProceed` exige cargo + (tech OU indústria OU localização) (`parse/route.ts:85`), mas o agente **só sabe perguntar tech e cargo** (`QUESTIONABLE_FIELDS`, `use-briefing-flow.ts:133`). Se o usuário não dá localização/setor, o agente fica pedindo tech em loop. O prompt do parser ainda lista tech como atributo **primário**. **Nota:** a arquitetura já suporta tech opcional (skip determinístico de `search_companies` em `parse/route.ts:227-230`); a obrigatoriedade é só percebida, vinda da conversa. |
| **Conversa pouco inteligente** | 1 LLM só extrai slots; confirmação/intenção por keywords frágeis; sem histórico conversacional real. |
| **Fluxo rígido** | Máquina de estados linear; sub-fluxos (produto, import de leads) aparafusados como estados extras; entrada só pelo começo. |
| **Qualidade** | Ver Seção 5 (aprofundamento dedicado). |

## 5. Aprofundamento — Qualidade dos resultados (Frente D)

Leitura dedicada de `create-campaign-step.ts`, `search-leads-step.ts` e do caminho de icebreaker.
Achados concretos:

### D1 — Icebreakers do agente são genéricos (não usam LinkedIn) — **ALTO impacto**
O `CreateCampaignStep` gera icebreakers passando ao prompt **apenas** `lead_name`, `lead_title`,
`lead_company`, `lead_industry`, `lead_location` (`create-campaign-step.ts:428-437`). **Não há
chamada ao Apify nem uso de posts do LinkedIn.** Isso contradiz a spec (FR25 / Story 17.3, que
prometia "icebreakers personalizados baseados em posts recentes do LinkedIn") e desperdiça o
caminho premium que já existe no app (`src/app/api/leads/enrich-icebreaker/route.ts` +
`src/lib/services/apify.ts`). Resultado: icebreakers rasos, do tipo "Vi que você é CTO na
[empresa]".

### D2 — Briefing não captura objetivo/urgência/descrição da campanha — **MÉDIO**
`create-campaign-step.ts:161-163` e `:204` acessam `objective`, `urgency` e `campaignDescription`
via cast `briefing as Record<string, unknown>` com defaults, porque **esses campos não existem no
`ParsedBriefing`**. Ou seja: toda campanha sai como `COLD_OUTREACH` / `MEDIUM`, independente do
que o usuário quer. O usuário não consegue dizer "campanha pro evento X" ou "tom mais urgente".

### D3 — Targeting sem tech vem raso — **MÉDIO**
Sem tecnologia, `SearchLeadsStep` busca "mercado aberto" no Apollo só por cargo, com
localização/indústria/tamanho **opcionais e sem defaults de qualidade** (`search-leads-step.ts:99-112`).
Sem senioridade ou tamanho de empresa como filtro padrão, o resultado tende a ser amplo e raso.

### D4 — Sugestões estáticas e rasas — **BAIXO**
`TECH_TO_TITLES` / `INDUSTRY_TO_TITLES` / `INDUSTRY_TO_TECH` são mapas hardcoded curtos
(`briefing-suggestion-service.ts`). Não são contextuais ao negócio do cliente (KB/ICP).

## 6. Plano de melhorias — 4 frentes

### 🟢 Frente A — Destravar a tecnologia (quick win, ~1-2 dias, risco baixo)
Resolve **hoje** a dor de teste manual. Sem rewrite.

**Regra de avanço decidida (Q1):** pra prosseguir basta **cargo + localização**. Tecnologia e
setor (indústria) são **opcionais**. Ou seja `canProceed = hasJobTitles && hasLocation` (ou
fluxo de leads importados). Tech nunca é exigida nem perguntada como primária.

- **A1** Reescrever `SYSTEM_PROMPT` do parser: tecnologia deixa de ser atributo primário e vira
  filtro **opcional**; padrão = busca por cargo + localização (+ setor se o usuário disser).
- **A2** Ajustar `canProceed` (`parse/route.ts:78-87`): trocar `hasSearchParam` (tech OR industry
  OR location) por **`hasLocation` obrigatório**. Trocar `QUESTIONABLE_FIELDS` (hoje
  `["technology","jobTitles"]`) por **`["jobTitles","location"]`** — o agente passa a pedir
  localização, nunca tecnologia.
- **A3** Matar o loop: quando falta parâmetro, perguntar "qual região/localização?"; se o usuário
  mencionar tech espontaneamente, usar como filtro extra (mantém `search_companies`).
- **A4** ~~Permitir só cargo~~ **RESOLVIDO (Q1): NÃO.** Localização é obrigatória — evita queimar
  créditos Apollo em busca ampla demais.

### 🔵 Frente B — Conversa inteligente de verdade (~1 semana, risco médio)
- **B1** Passar **histórico real** da conversa pro LLM (mensagens estruturadas), em vez de
  concatenar com `\n` e re-parsear do zero.
- **B2** Mover confirmação/intenção **pra dentro do LLM** (parser retorna
  `nextAction: ask|confirm|proceed|register_product|import_leads` + a pergunta em linguagem
  natural). Aposenta as listas de keywords e o `generateSmartQuestion` templatizado.
- **B3** Com B2, os sub-fluxos de produto e import de leads deixam de ser estados aparafusados e
  viram decisões naturais do modelo.

### 🟣 Frente C — Fluxo flexível: agente tool-calling **(DECIDIDO Q2: incremental, só na conversa)**
**Decisão:** o agente tool-calling fica **restrito à camada de briefing/conversa**. O
**pipeline de execução continua determinístico** (`DeterministicOrchestrator` intacto) — é a parte
que toca créditos de API e envio no Instantly, onde não se quer não-determinismo. O full-C (agente
orquestrando a execução) fica **adiado e provavelmente desnecessário**.

Na prática, a Frente C **encolhe pra dentro da Frente B**: o "agente da conversa" decide via
tool-calling se pergunta, cadastra produto, importa leads ou escolhe ponto de entrada — mantendo o
pipeline abaixo determinístico. Reavaliar full-C só se surgir necessidade real de composição
dinâmica de pipeline além da lógica de skip atual.

### 🟠 Frente D — Qualidade dos resultados
- **D1** Ligar o icebreaker do agente ao caminho LinkedIn/Apify já existente (reusar
  `enrich-icebreaker`) para leads com `linkedin_url`; fallback de qualidade pros sem.
  **(ALTO impacto, esforço médio.)** **Decisão Q3:** deve ser **opcional** — toggle no
  plano/approval gate ou sob demanda (custo Apify por lead é aceitável, mas não obrigatório). Sem
  o toggle ligado, mantém o icebreaker leve atual.
- **D2** Adicionar `objective`, `urgency`, `campaignDescription` **e nº de e-mails da sequência**
  ao `ParsedBriefing` e capturá-los na conversa, propagando pro `create_campaign`. **(Médio —
  confirmado Q4.)**
- **D3** Definir filtros-padrão de qualidade pra busca "mercado aberto" (senioridade, tamanho de
  empresa) quando não há tech. **(Médio.)**
- **D4** (Opcional) Sugestões contextuais via LLM/KB em vez de mapas estáticos. **(Baixo.)**

## 7. Sequência recomendada

**A → D1 → B → (decidir C) → D2/D3.**

Racional:
- **A** primeiro: destrava a dor imediata com risco quase zero.
- **D1** logo em seguida: maior salto de qualidade percebida por menor esforço (reuso de caminho
  existente), e é a diferença entre uma campanha "genérica" e uma "personalizada".
- **B** depois: eleva a inteligência da conversa; prepara terreno pra C.
- **C** é decisão estratégica deliberada — traz os trade-offs quando chegarmos lá.
- **D2/D3** refinam qualidade em cima de uma conversa já mais inteligente (B facilita capturar
  objetivo/urgência).

## 8. Questões — RESOLVIDAS (Fabossi, 2026-07-16)

- **Q1 (A4):** ✅ **Localização obrigatória** pra avançar; setor (indústria) opcional; tech
  opcional. `canProceed = hasJobTitles && hasLocation`.
- **Q2 (C):** ✅ **Incremental — agente tool-calling só na conversa/briefing.** Pipeline de
  execução continua determinístico. Full-C adiado.
- **Q3 (D1):** ✅ Icebreaker LinkedIn/Apify **aceitável, porém opcional** (toggle / sob demanda).
- **Q4 (D2):** ✅ Capturar na conversa: **objetivo, urgência, descrição e nº de e-mails** da
  campanha.

## 9. Próximos passos possíveis

- Rodar `bmad-correct-course` pra transformar este plano em ajuste de escopo / novas stories.
- Ou criar stories diretas (ex.: "Agente 2.1 — Tecnologia opcional", "Agente 2.2 — Icebreaker
  LinkedIn no pipeline") via `bmad-create-story`.
- Recomendado começar implementação pela **Frente A** (quick win já validável na tela).
