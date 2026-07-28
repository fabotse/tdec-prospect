# Epic 22 Context: Agente TDEC 2.0 — Conversa Inteligente & Qualidade

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Evoluir o Agente TDEC (herdado dos Epics 16/17) que hoje é, na prática, um "formulário de slots com pele de chat": uma única chamada de LLM extrai campos e todo o resto da conversa é máquina de estados + keywords hardcoded, sem memória conversacional. O épico ataca três dores priorizadas: (1) conversa inteligente — memória real e interpretação de intenção pelo LLM; (2) fluxo flexível — deixar de forçar tecnologia e disparar sub-fluxos naturalmente; (3) qualidade dos resultados — icebreakers com posts reais do LinkedIn (opcional), briefing que captura objetivo/urgência/descrição/nº de e-mails, e filtros-padrão de qualidade na busca aberta. Tudo isso mantendo o pipeline de execução 100% determinístico (o `DeterministicOrchestrator`, os approval gates e o gasto de créditos nunca são delegados ao LLM). Importa porque o agente atual "parece burro e rígido" e obriga o usuário a informar tecnologia (para o TheirStack), enquanto a camada de execução por baixo já é sólida e estava projetada para receber inteligência real na conversa.

## Stories

- Story 22.1: Tecnologia Opcional, Localização Obrigatória
- Story 22.2: Icebreaker Premium com LinkedIn (Toggle Opcional)
- Story 22.3: Conversa com Memória Real & Intenção via LLM
- Story 22.4: Sub-fluxos como Decisão do Agente
- Story 22.5: Briefing de Campanha — Objetivo, Urgência, Descrição e Nº de E-mails
- Story 22.6: Filtros-Padrão de Qualidade na Busca Aberta
- Story 22.7 (Opcional): Sugestões Contextuais via Knowledge Base
- Story 22.8: Reattach de Execução no Refresh (Persistir & Reidratar)
- Story 22.10: Conversa Limpa — Reattach só de Execução Confirmada + "Nova Conversa"
- Story 22.11: Guardrail Determinístico de Sub-fluxo (import_leads) + Atualização do Modelo do Parser

## Requirements & Constraints

- **Regra de avanço do briefing:** para prosseguir basta cargo + localização (ou fluxo de leads importados). Tecnologia e setor são opcionais; tecnologia nunca é exigida nem perguntada como campo primário. Localização é obrigatória para evitar queimar créditos Apollo em busca ampla demais.
- **TheirStack é opção secundária, nunca padrão:** tech mencionada espontaneamente vira filtro extra; o skip determinístico da busca por empresas quando tech é null é o mecanismo que a mantém secundária e deve ser preservado.
- **Conversa inteligente:** o agente mantém histórico conversacional estruturado enviado ao LLM a cada turno; confirmação/correção/intenção são interpretadas pelo LLM (via um `nextAction`), não por listas de keywords; sub-fluxos (produto inline, import de leads) são disparados por decisão do LLM.
- **Icebreaker premium:** toggle opcional, default DESLIGADO, exposto no plano/approval gate, com custo adicional por lead comunicado. Ligado, usa posts reais do LinkedIn reusando o caminho Apify já existente; leads sem `linkedin_url`/posts ou com falha caem em fallback standard (nenhum lead fica sem icebreaker).
- **Briefing de campanha:** captura objetivo, urgência, descrição e nº de e-mails — todos opcionais e não bloqueantes (defaults `COLD_OUTREACH`/`MEDIUM` permanecem); `canProceed` não depende deles.
- **Busca aberta com qualidade:** busca direta no Apollo sem tech aplica filtros-padrão de qualidade (constantes nomeadas, não números mágicos); valores informados pelo usuário sempre sobrescrevem defaults; filtros efetivos exibidos no plano antes da confirmação.
- **Determinismo (invariante):** nenhuma decisão de execução (ordem de steps, gasto de créditos, envio Instantly) é delegada a LLM. Falha/timeout do LLM degrada para o comportamento determinístico atual (fail-open); as keywords atuais podem permanecer só como fallback fora do caminho principal.
- **Performance:** respostas do agente no chat permanecem < 5s (herdado do Epic 16).
- **Zero regressão / zero migration:** fluxos existentes (entrada direta em leads, leads próprios, produto inline, sending accounts) intactos; campos novos do briefing vivem no JSONB `agent_executions.briefing` — sem migration de schema. Backfills quando necessários são dado, não schema.

## Technical Decisions

- **Full-C adiado (provavelmente desnecessário):** o agente tool-calling fica restrito à camada de briefing/conversa. `IPipelineOrchestrator` / `DeterministicOrchestrator` NÃO são substituídos.
- **Reuso obrigatório do caminho Apify/LinkedIn** (rota de enrich-icebreaker + serviço Apify) — proibido duplicar scraping.
- **Prompts** continuam como constantes TS / `ai_prompts` no padrão existente (`promptManager`).
- **Modelo do parser:** atualizar o `gpt-4o-mini` para modelo atual da família gpt-5 (verificar compat de API — a família pode rejeitar `temperature` custom); alinhar também o parser de produto e documentar custo/prompt caching.
- **Persistência/reattach (22.8/22.10):** `currentExecutionId` persistido client-side (zustand persist/localStorage), validado no mount contra `GET /api/agent/executions` (RLS por tenant). Só reataca execução do próprio usuário e ativa. A semântica de status foi corrigida: `POST /confirm` grava `status: "running"` + `started_at` (antes ficava `pending`); reattach exige `status ∈ {running, paused}`; introduzido status `'cancelled'` com guardas anti-race (execute/approve recusam execução terminal com 409; PATCH de cancelamento só pelo dono, só de não-terminal).
- **Guardrail determinístico de sub-fluxo (22.11):** o ramo `import_leads` só entra se a mensagem crua tiver sinal real de leads (regex de e-mail OU keyword de leads próprios) — âncora determinística sobre o `nextAction` alucinado pelo LLM. Helper puro como SSOT; trade-off fail-safe (na dúvida, não sequestra a conversa).
- **Sugestões contextuais (opcional):** derivar cargos/setores do ICP na Knowledge Base, com fallback silencioso para os mapas estáticos atuais.

## UX & Interaction Patterns

- **Sem loop de tecnologia:** quando falta parâmetro, o agente pergunta localização (e cargo se faltar), nunca apresenta tecnologia como exigência; recusar informar tech deve pivotar para pedir localização/confirmar, jamais re-perguntar tech.
- **Resumo de confirmação** reflete as novas regras (ex.: "Sem tecnologia específica — busca por cargo + localização"; nota de setor só se informado; sinaliza quando filtros-padrão de qualidade foram aplicados).
- **Confirmação/correção em linguagem livre:** frases como "perfeito, manda bala" são interpretadas como confirmação; correção parcial ("sim, mas troca o cargo pra CFO") aplica a mudança e re-apresenta o resumo.
- **Chat abre limpo:** conversa abandonada em briefing (`pending`) não reaparece a cada refresh/login; botão "Nova conversa" (cancela direto se `pending`; AlertDialog se `running`/`paused`) com reset integral do cliente.
- **Pergunta leve de objetivo:** uma única pergunta não bloqueante sobre objetivo da campanha quando os campos novos estiverem ausentes.

## Cross-Story Dependencies

- **22.1** e **22.2** independentes (primeiras da sequência: quick win de tech e maior salto de qualidade percebida).
- **22.4 depende de 22.3** (usa o `nextAction` introduzido nela).
- **22.5** independe de 22.3 no schema, mas a pergunta leve de objetivo fica melhor após 22.3.
- **22.6** independente — qualquer momento após 22.1.
- **22.7** opcional — não bloqueia o épico.
- **22.8** independente (só UI/store do chat); prioridade elevada por proteger execução paga (origem: code-review da 22.2).
- **22.10 depende de 22.8** (estreita o critério de reattach que ela criou); toca rotas de execução, não o orchestrator.
- **22.11 depende do commit da 22.10**; reforça a decisão da 22.4 com âncora determinística. Frente A (guard) autocontida; Frente B (troca de modelo) mexe em todo o parsing de briefing e exige smoke real (a suíte mocka a OpenAI e não prova a interpretação real).
