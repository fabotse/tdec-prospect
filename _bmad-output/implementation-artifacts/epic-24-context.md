# Epic 24 Context: Agente TDec 3.0 — Analista de Contas

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Transformar o agente no caminho para poucos leads de altíssima qualidade. Hoje ele faz o mesmo que o fluxo manual (cargo + cidade → Apollo → campanha), só que com mais atrito e mais falhas: 5,4% das execuções concluídas e 1 de 20 campanhas geradas. O épico tem 3 marcos. **M1** faz o agente parar de travar e escrever copy honesta. **M2** coloca o agente para escolher contas com Fit Score justificado (inclusive a partir de clientes de referência) e verificar e-mails. **M3** faz o agente pesquisar cada conta (dossiê + "por que agora"), escrever 1-para-1 e preparar a reunião quando o lead responde. Ao fim de cada marco: deploy, smoke real e checkpoint com o Fabossi.

## Stories

**Marco 1 — Confiável & copy honesta**
- Story 24.1: Etapa travada é destravada sozinha
- Story 24.2: Execução protegida contra cobrança dupla
- Story 24.3: Avanço confiável e "Tentar novamente"
- Story 24.4: Conversa sem becos sem saída
- Story 24.5: Confirmação por card com botões
- Story 24.6: E-mails sem dados fictícios e follow-ups com valor
- Story 24.7: Seção de Provas na Knowledge Base
- Story 24.8: Prompts honestos — problema primeiro, provas só da KB
- Story 24.9: Revisor automático de copy
- Story 24.10: Custo real e estimativa honesta

**Marco 2 — Analista de Contas**
- Story 24.11: Spike do Treg
- Story 24.12: Verificação de e-mail antes do export
- Story 24.13: Quantos leads eu quero
- Story 24.14: Briefing a partir do ICP
- Story 24.15: Busca mais precisa
- Story 24.16: Fit Score A/B/C com justificativa
- Story 24.17: Modo lista de contas (ABM)
- Story 24.18: Contas parecidas com os melhores clientes

**Marco 3 — Dossiê & reunião**
- Story 24.19: Dossiê da conta
- Story 24.20: Motivo para abordar agora
- Story 24.21: Copy 1-para-1 por lead
- Story 24.22: Dossiê visível na revisão e na oportunidade
- Story 24.23: Preparação de reunião
- Story 24.24: Conversa depois da execução
- Story 24.25: Memória entre execuções

## Requirements & Constraints

**Restrição operacional dominante: o desenvolvimento roda contra PRODUÇÃO.** O banco de teste (23.0) foi adiado. O `.env.local` aponta para o Supabase de produção do cliente (`kdgogyqyaxncqoyklyxx`) e usa as contas reais do Instantly e do Apollo. Por isso:
- Precisam continuar funcionando sem nenhuma trava nova: (1) as campanhas que já rodam no Instantly, junto com o recebimento de respostas e aberturas (webhook + `reply-sweep`); (2) a busca de novos leads; (3) a criação de campanhas e o export/ativação no Instantly.
- Migrations só aditivas (tabela, coluna nullable, índice), sem `DROP`, `ALTER` destrutivo ou `UPDATE`/`DELETE` em dados existentes. Só aplicar com OK do Fabossi. O código não sobe antes da migration aplicada.
- Sem pedido explícito, não criar, alterar nem reagendar jobs `pg_cron`, não publicar Edge Functions e não mudar secrets/variáveis.
- Smokes: nunca ativar campanha de teste no Instantly, não mexer em campanhas reais e não enviar WhatsApp para leads. Nos smokes do agente, parar antes de gastos/ativação.
- Ao fim de cada story, registrar nas Completion Notes o que pode mudar para o cliente (arquivos, rotas, prompts, tabelas, jobs, integrações) e confirmar os 3 pontos acima, dizendo se foi por smoke real ou por análise do diff. Se algum dos 3 puder ser afetado, parar e avisar o Fabossi antes de seguir.

**Ordem de execução definida pelo Fabossi** (substitui a ordem numérica; o bmad-loop roda uma story por vez, ex.: `bmad-loop run --story 24-2`):
1. Já concluídas no Epic 23: 23.4, 23.2 e 23.8.
2. **24.2 → 24.3 → 24.4 → 24.5 → 24.6**: Marco 1, só código do agente.
3. Só em janela de deploy combinada: **24.1** (sweeper via pg_cron) e **24.7** (tabela nova de Provas), junto com 23.1 e 23.3.
4. As demais (24.8 em diante) não têm ordem definida além da sequência dos marcos. Só com decisão do Fabossi: 23.5–23.7 (supressão/dedupe, que travam envio).

**Requisitos de produto:**
- Confiabilidade: o step preso em `running` além do limite vira `failed` e a execução vai para `paused`. Toda gravação de checkpoint, aprovação e falha checa erro do banco. Export idempotente, com retry reaproveitando a campanha já criada no Instantly. A rota execute só aceita steps `pending`/`failed`/`rejected` (senão 409), e o PATCH de briefing só é aceito com a execução `pending`. O usuário pode refazer um step que falhou pela UI.
- Conversa: nunca fica sem resposta e todo ramo tem saída. As confirmações (briefing, produto, leads) são feitas por botão; a keyword `includes()` fica só como fallback e nunca confirma nada sozinha. Todos os turnos entram na memória do LLM.
- Copy: nada de dados fictícios ("Nome", "Empresa", setor "Tecnologia"). Follow-ups com estratégia e ângulo próprios por posição e numeração correta. Abrir pelo problema do lead, nunca pelo produto. Citar só provas autorizadas da KB, e sem provas não citar nenhuma. O revisor automático reescreve até 2× e, se ainda reprovar, marca para revisão humana. As correções de prompt valem também para o fluxo manual, e isso é intencional.
- Qualificação: `leadCount` (N) respeitado no plano, no custo e na pré-seleção. Briefing proposto a partir do ICP. Busca por localização da **empresa**, sem setor público por padrão. Universo de 3–5× N, com Fit Score A/B/C e justificativa de 1 linha. Modo ABM por lista de contas. Contas parecidas a partir de 3–5 clientes de referência. E-mail verificado antes do export: inválido ou catch-all fica sinalizado e não sai sem confirmação. Nunca revelar e-mail pessoal.
- Dossiê: fatos `{fato, fonte_url, data, confiança}`, e fato sem fonte não entra. Gatilho "por que agora"; sem gatilho confiável, o lead segue a copy padrão e fica sinalizado. Copy por lead enviada em variáveis personalizadas no Instantly. Briefing de reunião que não inventa fatos. Conversa pós-execução e memória entre execuções.

**Não funcionais:** pipeline determinístico, em que o LLM decide só conversa e conteúdo, nunca ordem de steps, gasto ou envio. Toda ação com custo pedida no chat passa por card + clique. Toda chamada paga é logada em `api_usage_logs` com tenant e execução. Nenhum retry cobra duas vezes, e há teto de custo por execução. Chaves novas (Treg) ficam por tenant, criptografadas com AES-256-GCM, e o runtime do agente usa service-role. Chat responde em menos de 5s. Falha de LLM ou de fonte externa degrada para o comportamento anterior e nunca trava a execução. LGPD: sem e-mail pessoal, fatos guardam a fonte. A Definition of Done inclui smoke real (tela + banco).

## Technical Decisions

- Sem orquestrador durável. A recuperação de step usa TTL via pg_cron (sweeper com compare-and-swap, só atualiza se ainda estiver `running`), `after()` do Next e idempotência por output parcial do step (o id da campanha Instantly fica no output). A rota execute declara `maxDuration` de 300s. `triggerNextStep` precisa checar a resposta.
- Pontos de defeito já mapeados: `base-step.ts` (`saveCheckpoint`/`saveAwaitingApproval`/`saveFailure`), `export-step.ts`, rota `.../steps/[n]/execute`, rota `.../briefing`, `client-utils.ts`, `AgentActivationGate.tsx`, `AgentChat.tsx`, `use-briefing-flow.ts` (`sendAgentMessage` → `sendAndRecord`).
- Copy: `buildAIVariables` (`knowledge-base-context.ts`) injeta defaults fictícios. Dado ausente vira variável do Instantly (`{{firstName}}`, `{{companyName}}`) ou é omitido. O literal `{{follow_up_strategy}}` vaza hoje. Os prompts ficam em `prompts/defaults.ts` via `promptManager`/`ai_prompts`, e os prompts customizados por tenant no banco precisam ser documentados e migrados.
- O modelo de escrita/revisão é definido em fonte única no padrão `parser-config.ts`, já compatível com modelos novos.
- Reuso obrigatório: `base-service` (para o `TregService`), `promptManager`, `relevance-classifier` (posts), busca por domínio (`q_organization_domains_list` em `search-leads-step.ts`), `lead-persistence` e `campaign-persistence`, `usage-logger`.
- Treg: gateway com token único, BYOK, `Idempotency-Key` e teto por chamada. As capacidades-alvo são `people.email.verify`, `people.email.find`, `web.search` e `web.extract`. A integração só acontece após o go/no-go do spike (24.11). Se for no-go, usar o `email_status` da Apollo atrás da mesma interface.
- Busca Apollo: `organization_locations` em vez de localização da pessoa; `include_similar_titles` deixa de ser fixo `true`; filtro de indústria por tags em vez de `q_keywords`; o ICP substitui o piso `QUALITY_MIN_COMPANY_SIZES` quando o porte não for informado.
- Migrations novas previstas: Provas da KB (24.7), dossiê ligado a domínio e lead, reaproveitável por cerca de 30 dias (24.19). Ambas aditivas.
- Branch do épico: `epic/24-...`, com PR para `main` ao fim.

## UX & Interaction Patterns

- Botão "Tentar novamente" no card de step com falha, com a mensagem coerente com `isRetryable`.
- Card de resumo do briefing com chips editáveis e botões Confirmar/Ajustar (também para produto e leads). Texto livre digitado com o card visível é tratado como ajuste.
- Revisão de leads: badge A/B/C, justificativa de 1 linha, ordenação por score, input numérico de quantidade e pré-seleção dos N melhores. Badges "Suprimido"/"Já contatado" vêm do Epic 23.
- Status do revisor por e-mail: aprovado / reescrito / precisa revisão humana / não revisado.
- Painel de dossiê (fatos com fonte e data, gatilho, hipótese de dor) na revisão do agente e no card da oportunidade, com "sem pesquisa" + ação de gerar. Briefing de reunião salvo no card, que pode ser regenerado e copiado.
- Ações com custo no chat pós-execução aparecem num card com o custo estimado e só rodam após clique.

## Cross-Story Dependencies

- 24.2 precede 24.3, porque o retry depende da proteção contra execução dupla. 24.5 reaproveita os caminhos que a 24.4 corrige. 24.14 e 24.17/24.18 usam o card da 24.5.
- 24.7 (Provas) alimenta 24.8, 24.9, 24.21 e 24.23. 24.9 é reusado na 24.21 (checagem contra o dossiê) e na 24.24.
- 24.11 (spike, sem código de produção) define o provedor de 24.12 e 24.19, e o serviço Treg é pré-requisito do Epic 25.
- 24.13 (N) alimenta 24.16. 24.16 é reusado em 24.18. 24.19 alimenta 24.20, 24.21, 24.22 e 24.23. 24.6 define os ângulos dos follow-ups usados na 24.21.
- Do Epic 23: supressão e "já contatado" (23.5–23.7) são consumidos em 24.15, 24.17, 24.18 e 24.25. Como essas stories estão em espera, aplicar "conforme a regra já existente". O export (`instantly.ts`) é compartilhado com 23.6/23.7.
- Do Epic 21: Central de Oportunidades e loop de respostas (24.22, 24.23, 24.25). O Epic 18 é absorvido de forma reduzida (FR11–16, FR25).
