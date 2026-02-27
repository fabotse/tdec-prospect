# Story 13.1: Schema de Monitoramento e Tipos

Status: done

## Story

As a desenvolvedor,
I want criar a estrutura de dados para monitoramento de leads e armazenamento de insights,
so that o sistema tenha a fundação necessária para toda a Epic 13 (Monitoramento Inteligente de Leads no LinkedIn).

## Acceptance Criteria

1. **Campo `is_monitored`**: Campo `is_monitored BOOLEAN DEFAULT false` adicionado à tabela `leads` via migration
2. **Tabela `lead_insights`**: Criada com: `id`, `tenant_id`, `lead_id`, `post_url`, `post_text`, `post_published_at`, `relevance_reasoning`, `suggestion`, `status` (enum: new/used/dismissed), `created_at`, `updated_at`
3. **Tabela `monitoring_configs`**: Criada com: `id`, `tenant_id`, `frequency` (enum: weekly/biweekly), `max_monitored_leads` (default 100), `last_run_at`, `next_run_at`, `created_at`, `updated_at`
4. **Índices**: `idx_leads_is_monitored`, `idx_lead_insights_tenant_status`, `idx_lead_insights_lead_id` criados
5. **RLS policies**: Aplicadas em todas as tabelas novas (mesmo padrão de tenant isolation existente)
6. **Tipos TypeScript**: `LeadInsight`, `LeadInsightRow`, `MonitoringConfig`, `MonitoringConfigRow`, `InsightStatus` criados
7. **Funções de transformação**: `toLeadInsight()` / `toLeadInsightRow()` implementadas
8. **Campo `isMonitored` no tipo `Lead`**: Adicionado sem quebrar nada existente
9. **Testes unitários**: Para transformações de tipos

## Tasks / Subtasks

- [x] Task 1: Migration SQL — `00043_add_lead_monitoring_schema.sql` (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Criar enum `insight_status` ('new', 'used', 'dismissed')
  - [x] 1.2 Criar enum `monitoring_frequency` ('weekly', 'biweekly')
  - [x] 1.3 Adicionar coluna `is_monitored BOOLEAN NOT NULL DEFAULT false` à tabela `leads`
  - [x] 1.4 Criar tabela `lead_insights` com todas as colunas + FK para leads + trigger updated_at
  - [x] 1.5 Criar tabela `monitoring_configs` com todas as colunas + FK para tenants + trigger updated_at + constraint UNIQUE(tenant_id)
  - [x] 1.6 Criar índices: `idx_leads_is_monitored`, `idx_lead_insights_tenant_status`, `idx_lead_insights_lead_id`
  - [x] 1.7 Habilitar RLS + criar policies (SELECT/INSERT/UPDATE/DELETE) para `lead_insights` e `monitoring_configs`

- [x] Task 2: Tipos TypeScript — `src/types/monitoring.ts` (AC: #6, #7)
  - [x] 2.1 Criar `insightStatusValues` const array + `InsightStatus` type + labels PT-BR + variants
  - [x] 2.2 Criar `monitoringFrequencyValues` const array + `MonitoringFrequency` type + labels PT-BR
  - [x] 2.3 Criar `LeadInsightRow` interface (snake_case, espelho da tabela)
  - [x] 2.4 Criar `LeadInsight` interface (camelCase, domínio)
  - [x] 2.5 Criar `MonitoringConfigRow` interface (snake_case)
  - [x] 2.6 Criar `MonitoringConfig` interface (camelCase)
  - [x] 2.7 Implementar `transformLeadInsightRow(row): LeadInsight`
  - [x] 2.8 Implementar `transformMonitoringConfigRow(row): MonitoringConfig`
  - [x] 2.9 Exportar tudo via `src/types/index.ts`

- [x] Task 3: Atualizar tipo Lead existente (AC: #8)
  - [x] 3.1 Adicionar `isMonitored: boolean` ao interface `Lead` em `src/types/lead.ts`
  - [x] 3.2 Adicionar `is_monitored: boolean` ao interface `LeadRow` em `src/types/lead.ts`
  - [x] 3.3 Adicionar mapeamento `isMonitored: row.is_monitored` no `transformLeadRow()`

- [x] Task 4: Testes unitários (AC: #9)
  - [x] 4.1 Criar `__tests__/unit/types/monitoring.test.ts`
  - [x] 4.2 Testar `transformLeadInsightRow` — todos os campos mapeados corretamente
  - [x] 4.3 Testar `transformMonitoringConfigRow` — todos os campos mapeados corretamente
  - [x] 4.4 Testar tipos de enum: `insightStatusValues`, `monitoringFrequencyValues`
  - [x] 4.5 Testar labels PT-BR dos enums
  - [x] 4.6 Atualizar teste de `transformLeadRow` (se existente) para incluir `isMonitored`

## Dev Notes

### Contexto do Epic 13

Feature 100% aditiva — **NÃO modifica nenhuma funcionalidade existente**. O Monitoramento Inteligente de Leads permite vigiar leads ICP no LinkedIn, detectar posts relevantes semanalmente via Apify, e gerar sugestões de abordagem por IA.

**Dependências do Epic:** Epic 6.5 (ApifyService, `linkedin_posts_cache`), Epic 11 (ZApiService, WhatsAppComposer), Knowledge Base

Esta story (13.1) cria apenas a **fundação de dados** — schema SQL + tipos TypeScript. Nenhuma UI, nenhuma API route, nenhum hook.

### Padrão de Migration — Seguir Exatamente

**Arquivo:** `supabase/migrations/00043_add_lead_monitoring_schema.sql`

O último migration é `00042_create_whatsapp_messages.sql`. Seguir o mesmo padrão:

```sql
-- Migration: Lead Monitoring Schema
-- Story: 13.1 - Schema de Monitoramento e Tipos
-- AC: #1-#5

-- ============================================
-- ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.insight_status AS ENUM ('new', 'used', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.monitoring_frequency AS ENUM ('weekly', 'biweekly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- ALTER TABLE: leads — adicionar is_monitored
-- ============================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_monitored BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- TABLE: lead_insights
-- ============================================

CREATE TABLE public.lead_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  post_url TEXT NOT NULL,
  post_text TEXT NOT NULL,
  post_published_at TIMESTAMPTZ,
  relevance_reasoning TEXT,
  suggestion TEXT,
  status public.insight_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TABLE: monitoring_configs
-- ============================================

CREATE TABLE public.monitoring_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  frequency public.monitoring_frequency NOT NULL DEFAULT 'weekly',
  max_monitored_leads INTEGER NOT NULL DEFAULT 100,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_monitoring_config_per_tenant UNIQUE (tenant_id)
);

-- ============================================
-- TRIGGERS: updated_at
-- ============================================

CREATE TRIGGER update_lead_insights_updated_at
  BEFORE UPDATE ON public.lead_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_monitoring_configs_updated_at
  BEFORE UPDATE ON public.monitoring_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_leads_is_monitored
  ON public.leads(is_monitored)
  WHERE is_monitored = true;

CREATE INDEX idx_lead_insights_tenant_status
  ON public.lead_insights(tenant_id, status);

CREATE INDEX idx_lead_insights_lead_id
  ON public.lead_insights(lead_id);

-- ============================================
-- RLS POLICIES: lead_insights
-- ============================================

ALTER TABLE public.lead_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant lead_insights"
  ON public.lead_insights FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert lead_insights to their tenant"
  ON public.lead_insights FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant lead_insights"
  ON public.lead_insights FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant lead_insights"
  ON public.lead_insights FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());

-- ============================================
-- RLS POLICIES: monitoring_configs
-- ============================================

ALTER TABLE public.monitoring_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant monitoring_configs"
  ON public.monitoring_configs FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert monitoring_configs to their tenant"
  ON public.monitoring_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant monitoring_configs"
  ON public.monitoring_configs FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant monitoring_configs"
  ON public.monitoring_configs FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());
```

### Padrão de Tipos TypeScript — Seguir Exatamente

**Novo arquivo:** `src/types/monitoring.ts`

Seguir o padrão idêntico de `src/types/lead.ts` e `src/types/tracking.ts`:

1. **Enum pattern:** `const array → type → labels Record → variants Record`
2. **Row type:** interface com `snake_case` (espelho exato da tabela SQL)
3. **Domain type:** interface com `camelCase` (usado no código TypeScript)
4. **Transform function:** `transformXxxRow(row: XxxRow): Xxx`

```typescript
// Padrão de enum — referência: leadStatusValues em lead.ts
export const insightStatusValues = ['new', 'used', 'dismissed'] as const;
export type InsightStatus = (typeof insightStatusValues)[number];

export const insightStatusLabels: Record<InsightStatus, string> = {
  new: 'Novo',
  used: 'Usado',
  dismissed: 'Descartado',
};

export const monitoringFrequencyValues = ['weekly', 'biweekly'] as const;
export type MonitoringFrequency = (typeof monitoringFrequencyValues)[number];

export const monitoringFrequencyLabels: Record<MonitoringFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
};
```

### Atualização do Tipo Lead — Cirúrgica

**Arquivo:** `src/types/lead.ts`

Adicionar **3 linhas** apenas:

1. No `Lead` interface (~linha 161, antes do `}`):
   ```typescript
   /** Story 13.1: Flag de monitoramento LinkedIn */
   isMonitored: boolean;
   ```

2. No `LeadRow` interface (~linha 201, antes do `}`):
   ```typescript
   /** Story 13.1: Flag de monitoramento LinkedIn */
   is_monitored: boolean;
   ```

3. No `transformLeadRow()` (~linha 240, antes do `}`):
   ```typescript
   isMonitored: row.is_monitored,
   ```

**ATENÇÃO:** O campo `is_monitored` tem `DEFAULT false` no SQL, então leads existentes não serão afetados. O tipo é `boolean` (não `boolean | null`) pois `NOT NULL DEFAULT false`.

### Testes — Padrão do Projeto

**Novo arquivo:** `__tests__/unit/types/monitoring.test.ts`

Framework: **Vitest**. Sem console.log (ESLint no-console). Seguir padrão de describe/it do projeto.

Testar:
- `transformLeadInsightRow()` mapeia todos os campos snake_case → camelCase
- `transformMonitoringConfigRow()` mapeia todos os campos
- `insightStatusValues` contém exatamente ['new', 'used', 'dismissed']
- `monitoringFrequencyValues` contém exatamente ['weekly', 'biweekly']
- Labels em português estão corretos
- Verificar que `transformLeadRow()` agora inclui `isMonitored` (atualizar teste existente se houver em `__tests__/unit/types/`)

### Project Structure Notes

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| CRIAR | `supabase/migrations/00043_add_lead_monitoring_schema.sql` | Migration: enums + ALTER leads + tabelas novas + indexes + RLS |
| CRIAR | `src/types/monitoring.ts` | Tipos: enums, Row, Domain, transform functions |
| MODIFICAR | `src/types/lead.ts` | +3 linhas: `isMonitored` em Lead, LeadRow, transformLeadRow |
| MODIFICAR | `src/types/index.ts` | +1 linha: `export * from './monitoring'` |
| CRIAR | `__tests__/unit/types/monitoring.test.ts` | Testes das transform functions e enums |

### Guardrails — O Que NÃO Fazer

- **NÃO criar API routes** — esta story é só schema + tipos
- **NÃO criar hooks React** — stories posteriores farão isso
- **NÃO criar componentes UI** — stories 13.2 e 13.6 farão isso
- **NÃO modificar nenhum componente existente** — exceto `src/types/lead.ts` (3 linhas)
- **NÃO modificar `src/types/index.ts`** além de adicionar o re-export
- **NÃO usar `space-y-*`** se criar qualquer wrapper — usar `flex flex-col gap-*` (Tailwind v4)
- **NÃO adicionar `openai` ou outros service types** em `api_usage_logs` — story 13.3/13.4 farão isso

### References

- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.1] — AC originais
- [Source: _bmad-output/planning-artifacts/product-brief-tdec-prospect-2026-02-27.md] — Product Brief
- [Source: src/types/lead.ts] — Lead/LeadRow/transformLeadRow (modificar)
- [Source: src/types/tracking.ts] — Padrão de Row+Domain+transform (referência)
- [Source: supabase/migrations/00042_create_whatsapp_messages.sql] — Último migration (padrão)
- [Source: supabase/migrations/00035_create_api_usage_logs.sql] — Padrão de índices e RLS
- [Source: supabase/migrations/00034_add_icebreaker_columns.sql] — Padrão ALTER TABLE leads
- [Source: supabase/migrations/00040_create_opportunity_configs.sql] — Padrão UNIQUE constraint per tenant

### Previous Story Intelligence (Epic 12.8)

- **Padrão de duas camadas:** Story 12.8 mostrou que ordenação server-side + client-side são ambas necessárias com paginação — considerar isso quando futuras stories adicionarem query por `is_monitored`
- **Testes totais antes desta story:** 253 arquivos, 4664 testes, 0 falhas
- **NÃO alterar queries existentes** de leads — apenas adicionar a coluna; queries existentes simplesmente ignorarão o novo campo

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum issue encontrado.

### Completion Notes List

- ✅ Task 1: Migration `00043_add_lead_monitoring_schema.sql` criada com enums, ALTER TABLE leads, tabelas `lead_insights` e `monitoring_configs`, triggers `updated_at`, 3 índices, RLS policies completas (SELECT/INSERT/UPDATE/DELETE)
- ✅ Task 2: `src/types/monitoring.ts` com `InsightStatus`, `MonitoringFrequency`, `LeadInsightRow`, `LeadInsight`, `MonitoringConfigRow`, `MonitoringConfig`, `transformLeadInsightRow()`, `transformMonitoringConfigRow()`, exportado via `index.ts`
- ✅ Task 3: 3 linhas adicionadas em `lead.ts` — `isMonitored: boolean` em Lead, `is_monitored: boolean` em LeadRow, mapeamento em `transformLeadRow()`
- ✅ Task 4: 14 testes novos em `monitoring.test.ts` + 2 testes em `lead.test.ts` (isMonitored transform). Mock factory `createMockLead` atualizada com `isMonitored: false`
- ✅ Regressão: 254 arquivos, 4680 testes, 0 falhas (+16 novos testes vs 4664 anterior)

### Change Log

- 2026-02-27: Story 13.1 implementada — schema SQL + tipos TypeScript + testes
- 2026-02-27: Code review adversarial — 5 issues encontrados (1 HIGH, 2 MEDIUM, 2 LOW), todos corrigidos:
  - [HIGH] 14 erros `tsc` em 3 arquivos de teste com mocks inline de `Lead` sem `isMonitored`
  - [MEDIUM] Mock stale em `use-enrich-persisted-lead.test.tsx` sem `is_monitored` e campos icebreaker
  - [MEDIUM] `insightStatusVariants` tipado como `string` genérico — corrigido para union literal
  - [LOW] Testes de transform usavam asserts individuais — migrados para `toEqual` (shape validation)
  - [LOW] Evidência de `tsc --noEmit` agora sem erros `isMonitored`

### File List

- `supabase/migrations/00043_add_lead_monitoring_schema.sql` (CRIADO)
- `src/types/monitoring.ts` (CRIADO — code review: tipagem variants corrigida)
- `src/types/lead.ts` (MODIFICADO — +3 linhas: isMonitored em Lead, LeadRow, transformLeadRow)
- `src/types/index.ts` (MODIFICADO — +1 linha: export monitoring)
- `__tests__/unit/types/monitoring.test.ts` (CRIADO — 14 testes, code review: toEqual shape validation)
- `__tests__/unit/types/lead.test.ts` (MODIFICADO — +2 testes isMonitored, +1 campo mockLeadRow)
- `__tests__/helpers/mock-data.ts` (MODIFICADO — +1 campo isMonitored em createMockLead)
- `__tests__/unit/components/leads/LeadSelectionBar.test.tsx` (MODIFICADO — code review: +isMonitored em 4 mocks inline)
- `__tests__/unit/components/leads/LeadTable.test.tsx` (MODIFICADO — code review: +isMonitored em 3 mocks inline)
- `__tests__/unit/components/leads/SegmentDropdown.test.tsx` (MODIFICADO — code review: +isMonitored em 5 mocks inline)
- `__tests__/unit/hooks/use-enrich-persisted-lead.test.tsx` (MODIFICADO — code review: +is_monitored, icebreaker fields em mockLeadRow)
