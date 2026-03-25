# Epic 13: Monitoramento Inteligente de Leads no LinkedIn

**Objetivo:** Monitoramento automatizado de posts de leads ICP no LinkedIn com geração de insights de abordagem contextualizados por IA.

**Product Brief:** `_bmad-output/planning-artifacts/product-brief-tdec-prospect-2026-02-27.md`

**Natureza:** Feature 100% aditiva — não modifica nenhuma funcionalidade existente.

**Dependências:** Epic 6.5 (ApifyService, linkedin_posts_cache), Epic 11 (ZApiService, WhatsAppComposer), Knowledge Base (produtos/serviços)

---

## Story 13.1: Schema de Monitoramento e Tipos

**Como** desenvolvedor, **quero** criar a estrutura de dados para monitoramento de leads e armazenamento de insights, **para que** o sistema tenha a fundação necessária para toda a epic.

### Acceptance Criteria

1. Campo `is_monitored BOOLEAN DEFAULT false` adicionado à tabela `leads` via migration
2. Tabela `lead_insights` criada com: `id`, `tenant_id`, `lead_id`, `post_url`, `post_text`, `post_published_at`, `relevance_reasoning`, `suggestion`, `status` (enum: new/used/dismissed), `created_at`, `updated_at`
3. Tabela `monitoring_configs` criada com: `id`, `tenant_id`, `frequency` (enum: weekly/biweekly), `max_monitored_leads` (default 100), `last_run_at`, `next_run_at`, `created_at`, `updated_at`
4. Índices criados: `idx_leads_is_monitored`, `idx_lead_insights_tenant_status`, `idx_lead_insights_lead_id`
5. RLS policies aplicadas em todas as tabelas novas (mesmo padrão de tenant isolation existente)
6. Tipos TypeScript criados: `LeadInsight`, `LeadInsightRow`, `MonitoringConfig`, `MonitoringConfigRow`, `InsightStatus`
7. Funções de transformação `toLeadInsight()` / `toLeadInsightRow()` implementadas
8. Campo `isMonitored` adicionado ao tipo `Lead` existente (sem quebrar nada)
9. Testes unitários para transformações de tipos

### Technical Notes

- Seguir padrão de migrations existente (`supabase/migrations/`)
- RLS: `tenant_id = get_current_tenant_id()` em todas as policies
- Trigger `update_updated_at_column()` nas tabelas novas

---

## Story 13.2: Toggle de Monitoramento na Tabela de Leads

**Como** Marco, **quero** marcar leads específicos para monitoramento diretamente na tabela de leads, **para que** eu escolha quais leads ICP vigiar sem sair do meu workflow atual.

### Acceptance Criteria

1. Coluna "Monitorar" na tabela de leads (Meus Leads) com toggle/checkbox
2. Ação em lote: selecionar múltiplos leads e ativar/desativar monitoramento
3. Validação: apenas leads com `linkedin_url` podem ser monitorados — feedback claro se tentar monitorar lead sem LinkedIn
4. Limite de 100 leads monitorados por tenant — mensagem clara quando atingir limite
5. Indicador visual (ícone ou badge) mostrando quais leads estão sendo monitorados
6. Contador visível: "X/100 leads monitorados"
7. API route `PATCH /api/leads/[leadId]/monitor` para toggle individual
8. API route `PATCH /api/leads/bulk-monitor` para ação em lote
9. Testes unitários para APIs e componentes

### Technical Notes

- Reutilizar padrão de bulk actions existente na LeadTable
- Toggle não deve afetar nenhuma outra funcionalidade do lead

---

## Story 13.3: Edge Function de Verificação Semanal

**Como** sistema, **quero** executar automaticamente uma verificação semanal dos posts dos leads monitorados, **para que** posts novos sejam detectados sem intervenção do usuário.

### Acceptance Criteria

1. Supabase Edge Function `monitor-leads` criada em `supabase/functions/monitor-leads/index.ts`
2. Cron configurado para execução semanal (padrão) ou quinzenal (configurável via `monitoring_configs`)
3. Busca todos os leads com `is_monitored = true` por tenant
4. Para cada lead: chama `ApifyService.fetchLinkedInPosts()` (mesma API do Icebreaker)
5. Compara posts retornados com `linkedin_posts_cache` do lead — identifica posts novos por `postUrl`
6. Atualiza `linkedin_posts_cache` com os posts mais recentes
7. Processamento em batches de 5 (mesmo padrão do Icebreaker) para respeitar rate limits
8. Logging de execução na tabela `api_usage_logs` (custo, duração, posts encontrados)
9. Atualiza `last_run_at` e `next_run_at` na `monitoring_configs`
10. Posts novos detectados são passados para o pipeline de relevância (13.4)
11. Edge Function respeita timeout do Supabase — se 100 leads, processa em múltiplas invocações se necessário
12. Testes unitários para lógica de detecção de posts novos

### Technical Notes

- Reutilizar `ApifyService` existente — NÃO modificar o serviço
- Deploy: `npx supabase functions deploy monitor-leads`
- Se nenhum post novo encontrado para um lead, simplesmente pula (não é erro)

---

## Story 13.4: Filtro de Relevância por IA

**Como** sistema, **quero** analisar se um post novo é relevante para os produtos/serviços do usuário, **para que** apenas posts com potencial de abordagem gerem insights.

### Acceptance Criteria

1. Prompt `monitoring_relevance_filter` criado no sistema de prompts (tabela `ai_prompts`)
2. Prompt recebe: conteúdo do post, dados da Knowledge Base (company profile, produtos/serviços)
3. OpenAI retorna classificação binária: relevante ou não relevante
4. Se relevante: inclui breve justificativa (1 frase) do porquê é relevante
5. Se não relevante: post é descartado (não gera insight, não é armazenado)
6. Prompt configurável pelo usuário via Knowledge Base (mesmo padrão existente)
7. Fallback: se Knowledge Base não configurada, marca todos os posts novos como relevantes (melhor ter falsos positivos que perder oportunidades)
8. Custo otimizado: usar modelo mais barato para classificação (gpt-4o-mini ou similar)
9. Testes unitários para lógica de classificação

### Technical Notes

- Prompt NOVO — não altera prompts existentes de Icebreaker
- Usar `PromptManager` existente para fallback (tenant → global → default)

---

## Story 13.5: Geração de Sugestão de Abordagem

**Como** sistema, **quero** gerar automaticamente uma sugestão de abordagem quando um post relevante é detectado, **para que** o Marco tenha munição pronta para agir.

### Acceptance Criteria

1. Prompt `monitoring_approach_suggestion` criado no sistema de prompts
2. Prompt recebe: conteúdo do post, dados do lead, Knowledge Base (produtos/serviços, tom de voz)
3. Gera sugestão contextual que conecta o post com o produto/serviço do usuário
4. Sugestão é diferente do Icebreaker — foco em oportunidade temporal, não apresentação fria
5. Insight salvo na tabela `lead_insights` com: post_url, post_text, post_published_at, relevance_reasoning, suggestion, status='new'
6. Se geração falhar, salva insight apenas com o post (sem sugestão) — melhor ter o post que perder tudo
7. Logging de custo na `api_usage_logs`
8. Testes unitários para geração e persistência

### Technical Notes

- Prompt NOVO — diferente do `icebreaker_premium_generation`
- Usar Knowledge Base existente para contexto (mesma lógica do Icebreaker)

---

## Story 13.6: Página de Insights — UI

**Como** Marco, **quero** uma área dedicada no app para visualizar os insights gerados pelo monitoramento, **para que** eu veja rapidamente quais leads postaram algo relevante e tenha a sugestão de abordagem pronta.

### Acceptance Criteria

1. Nova rota `/insights` (ou `/monitoramento`) acessível via sidebar
2. Tabela de insights com colunas: nome do lead (com avatar), resumo do post (truncado), link original do post (abre em nova aba), sugestão de abordagem, data de detecção
3. Badge no menu lateral indicando quantidade de insights com status `new`
4. Botão "Copiar Sugestão" em cada linha — copia texto para clipboard com feedback toast
5. Ação "Marcar como Usado" — muda status para `used`
6. Ação "Descartar" — muda status para `dismissed`
7. Filtros: status (novos/usados/descartados), período
8. Ordenação padrão: mais recentes primeiro
9. Empty state quando não há insights
10. Hook `useLeadInsights` com React Query para fetch e mutations
11. Testes unitários para componentes e hook

### Technical Notes

- Seguir design system existente (shadcn/ui, Tailwind v4)
- Padrão de tabela similar ao LeadTable
- API route `GET /api/insights` com paginação
- API route `PATCH /api/insights/[insightId]` para atualizar status

---

## Story 13.7: Envio WhatsApp a Partir do Insight

**Como** Marco, **quero** enviar uma mensagem WhatsApp diretamente a partir de um insight, **para que** eu aja imediatamente quando vejo uma oportunidade quente.

### Acceptance Criteria

1. Botão "Enviar WhatsApp" visível no insight SE o lead tem telefone cadastrado
2. Ao clicar, abre o WhatsAppComposer existente (reutiliza componente da Epic 11)
3. Mensagem pré-gerada baseada na sugestão de abordagem do insight
4. Marco pode editar a mensagem antes de enviar (mesmo padrão existente)
5. Após envio, insight é automaticamente marcado como `used`
6. Se lead não tem telefone, botão não aparece (ou aparece desabilitado com tooltip explicativo)
7. Testes unitários para integração

### Technical Notes

- Reutilizar `WhatsAppComposer` e `ZApiService` existentes — NÃO modificar
- Apenas chamar os componentes existentes com os dados do insight

---

## Story 13.8: Configurações de Monitoramento

**Como** Marco, **quero** configurar a frequência do monitoramento e visualizar o uso atual, **para que** eu tenha controle sobre como o sistema opera.

### Acceptance Criteria

1. Seção "Monitoramento" na página de Settings (ou seção dedicada)
2. Dropdown para frequência: Semanal (padrão) / Quinzenal
3. Visualização: "X/100 leads monitorados"
4. Informação da próxima execução agendada
5. Informação da última execução (data + resultado resumido)
6. Estimativa de custo mensal baseado na quantidade de leads monitorados
7. API route para salvar configurações de monitoramento
8. Testes unitários para componentes e API

### Technical Notes

- Seguir padrão de Settings existente
- Dados salvos na tabela `monitoring_configs`

---

## Story 13.10: Coluna de Raciocinio da IA na Tabela de Insights

**Como** Marco, **quero** ver o raciocinio da IA que justifica cada indicacao de insight diretamente na tabela de insights, **para que** eu entenda rapidamente por que aquele post foi considerado relevante e tome decisoes de abordagem mais informadas.

### Acceptance Criteria

1. Nova coluna "Por que?" exibida na tabela de insights entre "Sugestao de Abordagem" e "Status"
2. A coluna exibe o campo `relevanceReasoning` ja existente no modelo de dados (nenhuma alteracao de backend)
3. Texto com `line-clamp-2` e tooltip com texto completo (mesmo padrao das colunas existentes)
4. Placeholder em italico "Raciocinio nao disponivel" quando campo for null
5. Coluna com `max-w-[200px]` para nao comprimir colunas adjacentes
6. Testes unitarios atualizados para nova coluna

### Technical Notes

- Campo `relevanceReasoning` ja existe no banco, API e tipos — zero alteracao de backend
- Apenas InsightsTable.tsx precisa ser modificado (+ testes)
- Complexidade: 1 story point
