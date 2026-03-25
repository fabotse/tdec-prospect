# Story 16.1: Data Models, Tipos e Pagina do Agente

Status: complete

## Story

As a usuario do TDEC Prospect,
I want acessar a pagina do Agente TDEC no menu do app,
So that eu tenha uma interface dedicada para interagir com o agente conversacional.

## Acceptance Criteria

1. **Given** o usuario esta autenticado no TDEC Prospect **When** clica em "Agente TDEC" no menu lateral **Then** a pagina do agente e exibida com o container de chat vazio e input de mensagem **And** a pagina segue os padroes visuais do app (sidebar, header, tema B&W)

2. **Given** o banco de dados do projeto **When** as migrations sao executadas **Then** as tabelas `agent_executions`, `agent_steps`, `agent_messages` e `cost_models` sao criadas com RLS por tenant_id **And** os indices definidos na arquitetura estao presentes

3. **Given** o projeto TypeScript **When** os tipos do agente sao importados **Then** estao disponiveis: `AgentExecution`, `AgentStep`, `AgentMessage`, `ParsedBriefing`, `PipelineStep`, `StepType`, `CostModel`, `CostEstimate`, `PipelineError` **And** todos os tipos seguem as interfaces definidas na arquitetura

4. **Given** a pagina do agente carregada **When** o componente AgentChat renderiza **Then** exibe area de mensagens (vazia), input de texto na parte inferior, e layout responsivo desktop-first

## Tasks / Subtasks

- [x] Task 1: Criar migrations SQL para tabelas do agente (AC: #2)
  - [x] 1.1 Criar `supabase/migrations/00047_create_agent_executions.sql` com tabela `agent_executions`, RLS policy `tenant_isolation` e indice em `tenant_id`
  - [x] 1.2 Criar `supabase/migrations/00048_create_agent_steps.sql` com tabela `agent_steps`, constraint UNIQUE(execution_id, step_number), indice `idx_agent_steps_execution`
  - [x] 1.3 Criar `supabase/migrations/00049_create_agent_messages.sql` com tabela `agent_messages`, indices `idx_agent_messages_execution` e `idx_agent_messages_created`
  - [x] 1.4 Criar `supabase/migrations/00050_create_cost_models.sql` com tabela `cost_models` (tenant_id, service_name, unit_price, unit_description, currency) + RLS + seed data inicial

- [x] Task 2: Criar tipos TypeScript do agente (AC: #3)
  - [x] 2.1 Criar `src/types/agent.ts` com todas as interfaces e tipos
  - [x] 2.2 Exportar tipos no `src/types/index.ts`
  - [x] 2.3 Escrever testes unitarios para validar que os tipos estao acessiveis

- [x] Task 3: Adicionar item "Agente TDEC" no menu lateral (AC: #1)
  - [x] 3.1 Adicionar item nav em `src/components/common/Sidebar.tsx` no array `navItems`
  - [x] 3.2 Importar icone adequado do lucide-react (sugestao: `Bot` ou `Sparkles`)
  - [x] 3.3 Verificar que a rota `/agent` esta ativa no sidebar quando na pagina

- [x] Task 4: Criar pagina do Agente TDEC (AC: #1, #4)
  - [x] 4.1 Criar `src/app/(dashboard)/agent/page.tsx` seguindo o padrao do technographic/page.tsx
  - [x] 4.2 Criar `src/app/(dashboard)/agent/loading.tsx` com skeleton
  - [x] 4.3 Criar `src/components/agent/AgentChat.tsx` — container principal do chat (area de mensagens vazia + input)
  - [x] 4.4 Criar `src/components/agent/AgentInput.tsx` — input de texto com botao de envio
  - [x] 4.5 Criar `src/components/agent/AgentMessageList.tsx` — lista de mensagens (inicialmente vazia, com mensagem placeholder)
  - [x] 4.6 Criar `src/components/agent/index.ts` — barrel export

- [x] Task 5: Criar Zustand store para UI state do agente (AC: #4)
  - [x] 5.1 Criar `src/stores/use-agent-store.ts` com estado inicial (currentExecutionId, isInputDisabled, etc.)

- [x] Task 6: Testes unitarios (AC: #1-#4)
  - [x] 6.1 Testes para AgentChat (renderiza area de mensagens e input)
  - [x] 6.2 Testes para AgentInput (input de texto, botao envio, estado disabled)
  - [x] 6.3 Testes para AgentMessageList (renderiza lista vazia com placeholder)
  - [x] 6.4 Testes para Sidebar (item "Agente TDEC" presente, rota ativa)
  - [x] 6.5 Testes para tipos (importacao correta de todas as interfaces)

## Dev Notes

### Contexto do Epic 16

Este e o PRIMEIRO story do Epic 16 (Agent Foundation & Briefing Conversacional). Estabelece a fundacao: data models, tipos TypeScript, pagina basica. As stories seguintes (16.2-16.6) constroem sobre essa base: sistema de mensagens realtime, briefing parser, onboarding, plano de execucao, cadastro inline de produto.

**NAO implementar nesta story:** realtime subscriptions, parsing de briefing, envio de mensagens, onboarding, modos guiado/autopilot. Apenas a estrutura base.

### Migrations SQL — Schema Exato

Seguir EXATAMENTE o SQL definido na arquitetura. Os schemas estao em [architecture.md:1316-1374](_bmad-output/planning-artifacts/architecture.md#L1316-L1374).

**agent_executions:**
```sql
CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  mode VARCHAR(10) NOT NULL DEFAULT 'guided',
  briefing JSONB NOT NULL,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER NOT NULL,
  cost_estimate JSONB,
  cost_actual JSONB,
  result_summary JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON agent_executions
  FOR ALL USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

**agent_steps:**
```sql
CREATE TABLE agent_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  cost JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(execution_id, step_number)
);
CREATE INDEX idx_agent_steps_execution ON agent_steps(execution_id);
```

**agent_messages:**
```sql
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_agent_messages_execution ON agent_messages(execution_id);
CREATE INDEX idx_agent_messages_created ON agent_messages(execution_id, created_at);
```

**cost_models** (nao definido na arquitetura, precisa ser criado):
```sql
CREATE TABLE cost_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_name VARCHAR(30) NOT NULL,
  unit_price DECIMAL(10, 4) NOT NULL,
  unit_description VARCHAR(100) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, service_name)
);
ALTER TABLE cost_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON cost_models
  FOR ALL USING (tenant_id = auth.jwt() ->> 'tenant_id');

-- Seed data (valores iniciais estimados — admin pode configurar depois)
-- NAO inserir seed aqui; seed sera via app ou migration futura quando tivermos valores reais
```

**IMPORTANTE para RLS:** Seguir o padrao existente. Ver migrations `00003_setup_rls_policies.sql` e `00005_api_configs_rls.sql` para referencia. A policy usa `auth.jwt() ->> 'tenant_id'`. Tabelas `agent_steps` e `agent_messages` NAO precisam de RLS propria — acesso e via JOIN com `agent_executions` que ja tem RLS.

**Numeracao de migrations:** Ultima migration existente e `00046_add_theirstack_service_name.sql`. Proximas: 00047, 00048, 00049, 00050.

### Tipos TypeScript — Interfaces Exatas

Criar em `src/types/agent.ts`. Seguir interfaces da arquitetura em [architecture.md:1378-1428](_bmad-output/planning-artifacts/architecture.md#L1378-L1428) e [architecture.md:1536-1571](_bmad-output/planning-artifacts/architecture.md#L1536-L1571).

```typescript
// === Enums / Unions ===

export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';
export type ExecutionMode = 'guided' | 'autopilot';
export type StepType = 'search_companies' | 'search_leads' | 'create_campaign' | 'export' | 'activate';
export type StepStatus = 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'completed' | 'failed' | 'skipped';
export type MessageRole = 'user' | 'agent' | 'system';
export type MessageType = 'text' | 'approval_gate' | 'progress' | 'error' | 'cost_estimate' | 'summary';

// === Database Row Types ===

export interface AgentExecution {
  id: string;
  tenant_id: string;
  user_id: string;
  status: ExecutionStatus;
  mode: ExecutionMode;
  briefing: ParsedBriefing;
  current_step: number;
  total_steps: number;
  cost_estimate: CostEstimate | null;
  cost_actual: Record<string, number> | null;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentStep {
  id: string;
  execution_id: string;
  step_number: number;
  step_type: StepType;
  status: StepStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  cost: Record<string, number> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AgentMessage {
  id: string;
  execution_id: string;
  role: MessageRole;
  content: string;
  metadata: AgentMessageMetadata;
  created_at: string;
}

export interface AgentMessageMetadata {
  stepNumber?: number;
  messageType?: MessageType;
  approvalData?: {
    stepType: StepType;
    previewData: unknown;
  };
}

// === Domain Types ===

export interface ParsedBriefing {
  technology: string | null;
  jobTitles: string[];
  location: string | null;
  companySize: string | null;
  industry: string | null;
  productSlug: string | null;
  mode: ExecutionMode;
  skipSteps: string[];
}

export interface CostModel {
  id: string;
  tenant_id: string;
  service_name: string;
  unit_price: number;
  unit_description: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface CostEstimate {
  steps: Record<string, { estimated: number; description: string }>;
  total: number;
  currency: 'BRL';
}

// === Pipeline Types ===

export interface StepInput {
  executionId: string;
  briefing: ParsedBriefing;
  previousStepOutput?: Record<string, unknown>;
}

export interface StepOutput {
  success: boolean;
  data: Record<string, unknown>;
  cost?: Record<string, number>;
}

export interface PipelineError {
  code: string;
  message: string;
  stepNumber: number;
  stepType: StepType;
  isRetryable: boolean;
  externalService?: string;
}

export const AGENT_ERROR_CODES = {
  BRIEFING_PARSE_ERROR: 'Nao consegui interpretar o briefing',
  STEP_EXECUTION_ERROR: 'Erro ao executar etapa do pipeline',
  STEP_TIMEOUT: 'Etapa demorou demais para responder',
  APPROVAL_TIMEOUT: 'Aprovacao expirou',
  COST_ESTIMATE_ERROR: 'Erro ao calcular estimativa de custo',
  EXECUTION_RESUME_ERROR: 'Erro ao retomar execucao',
} as const;
```

**NAO criar interface `PipelineStep` (abstrata com execute/estimateCost/shouldSkip) nesta story.** Isso e para Story 17.1 (BaseStep + DeterministicOrchestrator). Nesta story, apenas tipos de dados.

### Sidebar — Padrao Existente

O menu lateral esta em [Sidebar.tsx](src/components/common/Sidebar.tsx). O array `navItems` define a navegacao:

```typescript
const navItems: NavItem[] = [
  { label: "Leads", href: "/leads", icon: Users, subItems: [...] },
  { label: "Technographic", href: "/technographic", icon: Radar },
  { label: "Campanhas", href: "/campaigns", icon: Send },
  { label: "Insights", href: "/insights", icon: Lightbulb },
  { label: "Configuracoes", href: "/settings", icon: Settings },
];
```

Adicionar item ANTES de "Configuracoes" (ultimo item util). Usar icone `Bot` do lucide-react:
```typescript
import { Bot } from "lucide-react";
// ...
{ label: "Agente TDEC", href: "/agent", icon: Bot },
```

### Pagina — Padrao a Seguir

Seguir exatamente o padrao de [technographic/page.tsx](src/app/(dashboard)/technographic/page.tsx):

1. **page.tsx:** metadata + Suspense wrapper com Skeleton fallback + componente principal
2. **loading.tsx:** Skeleton simples
3. **Componente principal** em `src/components/agent/AgentChat.tsx`

Layout do AgentChat (desktop-first):
- Container full-height (calc(100vh - header height)) com flex column
- Area de mensagens (flex-1, overflow-y-auto) — inicialmente vazia com placeholder central
- Input fixo na parte inferior (border-top, padding)
- Visual premium: fundo clean, sem bordas excessivas, consistente com o app

### Zustand Store

Seguir padrao existente de stores (ver `src/stores/`). Store minimo para UI state:

```typescript
// src/stores/use-agent-store.ts
interface AgentUIState {
  currentExecutionId: string | null;
  isInputDisabled: boolean;
  setCurrentExecutionId: (id: string | null) => void;
  setInputDisabled: (disabled: boolean) => void;
}
```

### Testes — Padrao do Projeto

- Framework: Vitest (NAO Jest)
- Testes em `__tests__/` colocados no mesmo diretorio ou em `src/__tests__/`
- Mock factories centralizadas em test utils
- `@testing-library/react` para componentes
- Importar de `vitest` (describe, it, expect, vi)
- ESLint proibe `console.log` — usar mocks de console nos testes se necessario

### Padroes de UI do Projeto

- Tailwind CSS v4 — usar `flex flex-col gap-*` (NAO `space-y-*`)
- shadcn/ui para componentes base (Button, Input, Skeleton, etc.)
- Texto em portugues brasileiro
- Framer Motion para animacoes/transicoes
- Classes de tipografia: `text-h1`, `text-body-small`, `text-muted-foreground`

### Project Structure Notes

Novos arquivos criados nesta story:
```
supabase/migrations/
  00047_create_agent_executions.sql
  00048_create_agent_steps.sql
  00049_create_agent_messages.sql
  00050_create_cost_models.sql

src/types/agent.ts                          # Tipos do agente

src/app/(dashboard)/agent/
  page.tsx                                   # Pagina do agente
  loading.tsx                                # Skeleton loading

src/components/agent/
  AgentChat.tsx                              # Container principal
  AgentInput.tsx                             # Input de texto
  AgentMessageList.tsx                       # Lista de mensagens
  index.ts                                   # Barrel export

src/stores/use-agent-store.ts               # UI state
```

Arquivos modificados:
```
src/components/common/Sidebar.tsx            # Adicionar item "Agente TDEC"
src/types/index.ts                           # Exportar tipos de agent.ts
```

### References

- [Source: architecture.md#Agente TDEC — Decisoes Arquiteturais](/_bmad-output/planning-artifacts/architecture.md) linhas 1293-1461
- [Source: architecture.md#Agente TDEC — Padroes de Implementacao](/_bmad-output/planning-artifacts/architecture.md) linhas 1462-1575
- [Source: architecture.md#Agente TDEC — Estrutura do Projeto](/_bmad-output/planning-artifacts/architecture.md) linhas 1576-1661
- [Source: epics-agente-tdec.md#Story 16.1](/_bmad-output/planning-artifacts/epics-agente-tdec.md) linhas 213-239
- [Source: Sidebar.tsx](src/components/common/Sidebar.tsx) linhas 37-51
- [Source: technographic/page.tsx](src/app/(dashboard)/technographic/page.tsx) — padrao de pagina

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A

### Completion Notes List
- Todas 4 migrations SQL criadas seguindo exatamente o schema da arquitetura
- Tipos TypeScript criados em src/types/agent.ts com todas as interfaces especificadas
- Item "Agente TDEC" adicionado no sidebar antes de "Configuracoes" com icone Bot
- Pagina /agent criada seguindo padrao do technographic/page.tsx
- AgentChat, AgentInput, AgentMessageList criados com layout desktop-first
- Zustand store minimo para UI state do agente
- Testes: 19 tipos + 6 store + 4 chat + 11 input + 4 message list + 3 sidebar novos (Story 16.1)
- Suite completa: 306 test files, 5409 passed, 0 failed

### Code Review (AI) - 2026-03-25
**Reviewer:** Amelia (Dev Agent) — Claude Opus 4.6
**Issues encontrados:** 2 High, 3 Medium, 2 Low
**Issues corrigidos:** 2 High, 2 Medium, 1 Low

**Correcoes aplicadas:**
- [H1] RLS policies migraram de `auth.jwt() ->> 'tenant_id'` para `public.get_current_tenant_id()` (padrao do projeto)
- [H2] RLS policies divididas em SELECT/INSERT/UPDATE/DELETE granulares com WITH CHECK explicito
- [M2] AgentInput.tsx: substituido `<input>` nativo por shadcn `<Input>` com overrides para visual clean
- [M3] Adicionado teste de submit via Enter key em AgentInput.test.tsx
- [L2] Contagem de testes corrigida no Dev Agent Record

**Issues validados (sem acao):**
- [M1] page.tsx metadata export — validado como correto (Server Component com Suspense boundary)
- [L1] Acentuacao em labels do Sidebar — confirmado correto (portugues)

### File List

**Novos:**
- supabase/migrations/00047_create_agent_executions.sql
- supabase/migrations/00048_create_agent_steps.sql
- supabase/migrations/00049_create_agent_messages.sql
- supabase/migrations/00050_create_cost_models.sql
- src/types/agent.ts
- src/app/(dashboard)/agent/page.tsx
- src/app/(dashboard)/agent/loading.tsx
- src/components/agent/AgentChat.tsx
- src/components/agent/AgentInput.tsx
- src/components/agent/AgentMessageList.tsx
- src/components/agent/index.ts
- src/stores/use-agent-store.ts
- __tests__/unit/types/agent.test.ts
- __tests__/unit/stores/use-agent-store.test.ts
- __tests__/unit/components/agent/AgentChat.test.tsx
- __tests__/unit/components/agent/AgentInput.test.tsx
- __tests__/unit/components/agent/AgentMessageList.test.tsx

**Modificados:**
- src/components/common/Sidebar.tsx (adicionado Bot import + item navItems)
- src/types/index.ts (adicionado export agent)
- __tests__/unit/components/Sidebar.test.tsx (adicionados testes Agente TDEC)
