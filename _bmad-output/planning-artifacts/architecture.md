---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - prd.md
  - product-brief-tdec-prospect-2026-01-29.md
  - ux-design-specification.md
workflowType: 'architecture'
project_name: 'tdec-prospect'
user_name: 'Fabossi'
date: '2026-01-29'
lastStep: 8
status: 'complete'
completedAt: '2026-01-29'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
O projeto possui 49 requisitos funcionais organizados em 8 domínios:
- Lead Acquisition (6 FRs): Busca conversacional IA, filtros, seleção em lote
- Lead Management (6 FRs): Status, histórico, segmentação, escalonamento
- Campaign Building (7 FRs): Builder visual drag-and-drop, sequências, intervalos
- AI Content Generation (7 FRs): Textos contextualizados, base de conhecimento
- External Integrations (7 FRs): Apollo, SignalHire, Snov.io, Instantly
- User Management (5 FRs): Auth, roles Admin/Usuário, convites
- Administration (7 FRs): Config APIs, base de conhecimento, tom de voz
- Interface & Experience (4 FRs): Visual clean, navegação, feedback

**Non-Functional Requirements:**
- Performance: Busca <3s, IA <5s, Export <10s, UI <2s, 10 usuários simultâneos
- Security: API keys criptografadas, nunca no frontend, isolamento tenant, HTTPS
- Integration: Retry automático, mensagens em português, fallback manual
- Scalability: Multi-tenant ready com tenant_id em todas as tabelas

**Scale & Complexity:**
- Primary domain: Full-stack Web Application (SPA + API)
- Complexity level: Medium-High
- Estimated architectural components: 8-10 core modules

### Technical Constraints & Dependencies

**Decisões Pré-Definidas:**
- Database/Auth: Supabase Cloud (PostgreSQL + Supabase Auth + RLS)
- Frontend: React/Next.js + shadcn/ui + Tailwind CSS
- IA: OpenAI ou Anthropic API para geração de texto

**Dependências Externas Críticas:**
- Apollo API: Fonte principal de leads
- SignalHire API: Enriquecimento de telefones
- Snov.io API: Exportação de campanhas
- Instantly API: Exportação de campanhas

**Restrições:**
- API keys são do cliente, não centralizadas
- Custos de IA devem ser otimizados por tarefa
- Interface em português brasileiro

### Cross-Cutting Concerns Identified

1. **Authentication & Multi-tenancy**: Supabase Auth + Row Level Security
2. **API Error Handling**: Circuit breaker, retry, fallback gracioso
3. **Secrets Management**: Criptografia de API keys de terceiros
4. **AI Context Management**: Base de conhecimento isolada por tenant
5. **Cost Optimization**: Escolha de modelos IA por complexidade de tarefa
6. **Observability**: Logs de auditoria para ações admin

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Web Application baseado em:
- Next.js (App Router) com React 19
- Supabase Cloud (Database + Auth + RLS)
- shadcn/ui + Tailwind CSS
- TypeScript strict mode

### Starter Options Considered

| Opção | Descrição | Avaliação |
|-------|-----------|-----------|
| **Vercel Supabase Starter** | Template oficial com Auth cookie-based | Bom, mas mínimo |
| **Production SaaS Template** | Template completo com RLS, i18n | Muito opinativo |
| **Next.js + shadcn/ui (Limpo)** | Abordagem manual com controle total | **Selecionado** |
| **create-t3-turbo** | T3 Stack com tRPC e Drizzle | Usa Better Auth, não Supabase Auth |

### Selected Starter: Next.js + shadcn/ui (Abordagem Limpa)

**Rationale for Selection:**
1. **Controle Total:** Não traz código/padrões que não vamos usar
2. **Supabase Auth Nativo:** Usaremos Supabase Auth diretamente sem wrappers
3. **RLS Customizado:** Configuraremos policies específicas para nosso modelo de tenant
4. **Alinhado com UX Spec:** shadcn/ui + Tailwind já definidos na especificação
5. **Flexibilidade:** Adicionar @dnd-kit, Framer Motion conforme necessário
6. **Manutenibilidade:** Menos dependências = menos breaking changes

**Initialization Commands:**

```bash
# 1. Criar projeto Next.js
npx create-next-app@latest tdec-prospect --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 2. Inicializar shadcn/ui
cd tdec-prospect
npx shadcn init

# 3. Instalar Supabase
npm install @supabase/supabase-js @supabase/ssr
```

### Architectural Decisions Provided by Starter

**Language & Runtime:**
- TypeScript strict mode habilitado
- Node.js runtime via Next.js
- React 19 com Server Components e Client Components

**Styling Solution:**
- Tailwind CSS v4 com PostCSS
- CSS Variables para theming (dark/light mode)
- Design tokens configuráveis via tailwind.config

**Build Tooling:**
- Turbopack para desenvolvimento (fast refresh)
- Webpack para produção (optimized bundles)
- ESLint com regras Next.js
- Path aliases configurados (@/*)

**Project Structure:**
```
src/
├── app/                 # Next.js App Router
│   ├── (auth)/         # Auth routes group
│   ├── (dashboard)/    # Dashboard routes group
│   ├── api/            # API routes
│   └── layout.tsx      # Root layout
├── components/
│   ├── ui/             # shadcn/ui components
│   ├── builder/        # Campaign builder components
│   ├── leads/          # Lead management components
│   └── search/         # AI search components
├── lib/
│   ├── supabase/       # Supabase client config
│   ├── ai/             # AI service integrations
│   └── utils/          # Utilities
├── hooks/              # Custom React hooks
├── types/              # TypeScript types
└── styles/             # Global styles
```

**Additional Packages Required:**
- `@supabase/supabase-js` + `@supabase/ssr` - Supabase client
- `@dnd-kit/core` + `@dnd-kit/sortable` - Drag and drop
- `framer-motion` - Animações
- `react-hook-form` + `zod` - Forms e validação
- `zustand` - State management (se necessário)

**Note:** Project initialization using these commands should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data access pattern: Supabase Client + Zod
- Authentication: Supabase Auth + RLS
- API pattern: Server Actions + API Routes
- Hosting: Vercel

**Important Decisions (Shape Architecture):**
- State management: TanStack Query + Zustand
- Builder architecture: Compound Components
- AI provider strategy: Multi-model (OpenAI + Anthropic)
- External API pattern: Service Classes

**Deferred Decisions (Post-MVP):**
- Advanced caching (Redis)
- Analytics platform
- Mobile app architecture

### Data Architecture

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| Database | PostgreSQL | 15+ (Supabase) | Multi-tenant ready, RLS nativo |
| ORM/Client | Supabase Client | @supabase/supabase-js | Acesso direto, real-time, RLS automático |
| Validation | Zod | latest | Type-safe, composable, runtime validation |
| Caching | TanStack Query | v5 | Stale-while-revalidate, mutations, optimistic updates |

**Data Modeling Approach:**
- Todas as tabelas com `tenant_id` para isolamento
- RLS policies em todas as tabelas
- Soft deletes para dados críticos (leads, campanhas)
- Timestamps automáticos (created_at, updated_at)

### Authentication & Security

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth Provider | Supabase Auth | Integrado, session management, MFA ready |
| Session | Cookie-based (SSR) | Seguro, funciona com Server Components |
| Authorization | RLS + Middleware | RLS no DB, middleware para rotas |
| API Keys Storage | Supabase Vault (encrypted) | Criptografia at-rest para keys de terceiros |

**Multi-tenancy Pattern:**
```sql
-- Exemplo de RLS policy
CREATE POLICY "tenant_isolation" ON leads
  FOR ALL USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

### API & Communication Patterns

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Internal Mutations | Server Actions | Type-safe, colocated, simples |
| External Integrations | API Routes | Isolamento, error handling, retry |
| Data Fetching | TanStack Query | Cache, refetch, optimistic updates |

**External API Service Pattern:**
```typescript
// Interface comum para todos os serviços
interface ExternalAPIService {
  name: string;
  testConnection(): Promise<boolean>;
  handleError(error: unknown): APIError;
}

// Implementações específicas
class ApolloService implements ExternalAPIService { ... }
class SignalHireService implements ExternalAPIService { ... }
class SnovioService implements ExternalAPIService { ... }
class InstantlyService implements ExternalAPIService { ... }
```

**Error Handling Standard:**
- Retry automático 1x para timeouts
- Circuit breaker para falhas repetidas
- Mensagens traduzidas para português
- Fallback manual sempre disponível

### Frontend Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Server State | TanStack Query v5 | Cache, mutations, devtools |
| UI State | Zustand | Leve, simples, TypeScript-first |
| Forms | React Hook Form + Zod | Validação integrada, performance |
| Drag & Drop | @dnd-kit | Acessível, flexível, touch support |
| Animations | Framer Motion | Declarativo, gestures, layout |

**Builder Component Architecture:**
```tsx
// Compound Components pattern
<CampaignBuilder>
  <CampaignBuilder.Canvas>
    <CampaignBuilder.Block type="email" />
    <CampaignBuilder.Block type="delay" />
    <CampaignBuilder.Connector />
  </CampaignBuilder.Canvas>
  <CampaignBuilder.Sidebar />
  <CampaignBuilder.Preview />
</CampaignBuilder>
```

### AI Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary Provider | OpenAI | Ecossistema maduro, streaming |
| Secondary Provider | Anthropic | Qualidade de texto, alternativa |
| Model Selection | User configurable | Otimização de custo/qualidade |
| Streaming | Enabled | UX de geração progressiva |

**Model Configuration per Tenant:**
```typescript
interface AIConfig {
  defaultProvider: 'openai' | 'anthropic';
  models: {
    search: string;      // Busca conversacional (gpt-4o-mini)
    personalization: string; // Texto personalizado (gpt-4o)
    suggestions: string; // Sugestões rápidas (gpt-4o-mini)
  };
  fallbackProvider?: 'openai' | 'anthropic';
}
```

**Available Models:**
- OpenAI: gpt-4o-mini, gpt-4o, gpt-4-turbo
- Anthropic: claude-3-haiku, claude-3.5-sonnet

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hosting | Vercel | Next.js native, edge functions |
| Database | Supabase Cloud | Managed PostgreSQL, global |
| CI/CD | Vercel + GitHub Actions | Preview deploys, automated |
| Monitoring | Vercel Analytics + Sentry | Performance + errors |

**Environment Strategy:**
- `development` - Local Supabase + .env.local
- `preview` - Supabase branch + Vercel preview
- `production` - Supabase prod + Vercel prod

### Decision Impact Analysis

**Implementation Sequence:**
1. Project setup (Next.js + Supabase config)
2. Auth flow (Supabase Auth + RLS policies)
3. Core data models (tenants, users, leads)
4. External API services (Apollo, SignalHire)
5. AI service layer (multi-model)
6. UI components (shadcn + custom)
7. Builder component (drag-and-drop)
8. Campaign flow (creation → export)

**Cross-Component Dependencies:**
- Auth → RLS → Todos os dados
- AI Config → Geração de texto → Builder
- External Services → Error Handling → UI Feedback
- Zustand Store → Builder → Campaign State

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 25+ áreas onde agentes de IA poderiam fazer escolhas diferentes, agora padronizadas.

### Naming Patterns

**Database Naming Conventions:**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Tabelas | snake_case, plural | `leads`, `campaigns`, `email_blocks` |
| Colunas | snake_case | `tenant_id`, `created_at`, `email_subject` |
| Foreign Keys | `{table}_id` | `tenant_id`, `campaign_id`, `lead_id` |
| Indexes | `idx_{table}_{columns}` | `idx_leads_tenant_id` |
| Enums | snake_case | `lead_status`, `campaign_status` |

**API Naming Conventions:**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Endpoints | kebab-case, plural | `/api/leads`, `/api/campaigns` |
| Route Params | camelCase | `/api/leads/[leadId]` |
| Query Params | camelCase | `?tenantId=xxx&status=active` |
| API Route files | route.ts | `app/api/leads/route.ts` |

**Code Naming Conventions:**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Components | PascalCase | `LeadCard`, `CampaignBuilder` |
| Component files | PascalCase.tsx | `LeadCard.tsx` |
| Utility files | kebab-case.ts | `api-client.ts`, `date-utils.ts` |
| Functions | camelCase | `fetchLeads`, `createCampaign` |
| Variables | camelCase | `leadStatus`, `campaignData` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES`, `API_TIMEOUT` |
| Types/Interfaces | PascalCase | `Lead`, `Campaign`, `APIResponse` |
| Hooks | use + PascalCase | `useLeads`, `useCampaignBuilder` |
| Zustand stores | use + PascalCase + Store | `useBuilderStore` |

### Structure Patterns

**Project Organization:**

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Route group - auth pages
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/         # Route group - authenticated
│   │   ├── leads/
│   │   ├── campaigns/
│   │   └── settings/
│   ├── api/                 # API Routes
│   │   ├── leads/
│   │   ├── campaigns/
│   │   └── integrations/
│   └── layout.tsx
│
├── components/
│   ├── ui/                  # shadcn/ui (gerado)
│   ├── builder/             # Campaign builder
│   │   ├── BuilderCanvas.tsx
│   │   ├── EmailBlock.tsx
│   │   └── index.ts
│   ├── leads/               # Lead components
│   └── common/              # Shared components
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser client
│   │   ├── server.ts        # Server client
│   │   └── middleware.ts    # Auth middleware
│   ├── services/            # External API services
│   │   ├── apollo.ts
│   │   ├── signalhire.ts
│   │   ├── snovio.ts
│   │   └── instantly.ts
│   ├── ai/
│   │   ├── providers/
│   │   │   ├── openai.ts
│   │   │   └── anthropic.ts
│   │   └── index.ts
│   └── utils/
│
├── hooks/                   # Custom hooks
├── stores/                  # Zustand stores
├── types/                   # TypeScript types
│   ├── database.ts          # Supabase generated types
│   ├── api.ts               # API types
│   └── index.ts
└── __tests__/               # Testes (estrutura espelha src/)
```

**Test Organization:**

| Tipo | Localização | Naming |
|------|-------------|--------|
| Unit tests | `__tests__/` espelhando src | `LeadCard.test.tsx` |
| Integration | `__tests__/integration/` | `leads-api.test.ts` |
| E2E | `e2e/` (root) | `campaign-flow.spec.ts` |

### Format Patterns

**API Response Format:**

```typescript
// Sucesso
interface APISuccessResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

// Erro
interface APIErrorResponse {
  error: {
    code: string;        // 'VALIDATION_ERROR', 'NOT_FOUND', etc.
    message: string;     // Mensagem amigável em português
    details?: unknown;   // Detalhes técnicos (dev only)
  };
}
```

**Data Exchange Format:**

| Formato | Convenção | Exemplo |
|---------|-----------|---------|
| JSON fields (API) | camelCase | `{ "leadId": "...", "createdAt": "..." }` |
| Dates | ISO 8601 string | `"2026-01-29T15:30:00Z"` |
| IDs | UUID v4 | `"550e8400-e29b-41d4-a716-446655440000"` |
| Booleans | true/false | `{ "isActive": true }` |
| Nulls | null (não omitir) | `{ "phone": null }` |

**Standard Error Codes:**

```typescript
const ERROR_CODES = {
  // Validation
  VALIDATION_ERROR: 'Dados inválidos',
  MISSING_REQUIRED: 'Campo obrigatório não informado',

  // Auth
  UNAUTHORIZED: 'Não autenticado',
  FORBIDDEN: 'Sem permissão',

  // Resources
  NOT_FOUND: 'Recurso não encontrado',
  CONFLICT: 'Conflito de dados',

  // External APIs
  APOLLO_ERROR: 'Erro na comunicação com Apollo',
  SIGNALHIRE_ERROR: 'Erro na comunicação com SignalHire',
  SNOVIO_ERROR: 'Erro na comunicação com Snov.io',
  INSTANTLY_ERROR: 'Erro na comunicação com Instantly',

  // AI
  AI_GENERATION_ERROR: 'Erro ao gerar texto',
  AI_RATE_LIMIT: 'Limite de requisições atingido',

  // Generic
  INTERNAL_ERROR: 'Erro interno',
  SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível',
} as const;
```

### Communication Patterns

**Zustand Store Pattern:**

```typescript
// stores/builder-store.ts
interface BuilderState {
  blocks: EmailBlock[];
  selectedBlockId: string | null;
  isDragging: boolean;
}

interface BuilderActions {
  addBlock: (block: EmailBlock) => void;
  removeBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;
  setDragging: (isDragging: boolean) => void;
  reset: () => void;
}

export const useBuilderStore = create<BuilderState & BuilderActions>((set) => ({
  // state
  blocks: [],
  selectedBlockId: null,
  isDragging: false,

  // actions
  addBlock: (block) => set((state) => ({
    blocks: [...state.blocks, block]
  })),
  // ...
}));
```

**TanStack Query Pattern:**

```typescript
// hooks/use-leads.ts
export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => fetchLeads(filters),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
```

### Process Patterns

**Loading State Pattern:**

```typescript
// Padrão para loading em queries
const { data, isLoading, isError, error } = useLeads();

// UI Pattern
if (isLoading) return <LeadsSkeleton />;
if (isError) return <ErrorMessage error={error} />;
return <LeadsList data={data} />;
```

**Error Handling Pattern:**

```typescript
// lib/utils/error-handler.ts
export function handleAPIError(error: unknown): APIErrorResponse {
  if (error instanceof APIError) {
    return {
      error: {
        code: error.code,
        message: error.userMessage,
        details: process.env.NODE_ENV === 'development' ? error.details : undefined,
      }
    };
  }

  // Erro desconhecido
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro inesperado. Tente novamente.',
    }
  };
}
```

**External Service Pattern:**

```typescript
// lib/services/base-service.ts
export abstract class ExternalService {
  abstract name: string;

  protected async request<T>(
    url: string,
    options: RequestInit
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ExternalServiceError(this.name, response.status);
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError(this.name, 408, 'Timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

### Enforcement Guidelines

**All AI Agents MUST:**

1. ✅ Usar snake_case para tabelas/colunas do banco
2. ✅ Usar camelCase para variáveis e funções TypeScript
3. ✅ Usar PascalCase para componentes React e tipos
4. ✅ Seguir a estrutura de pastas definida
5. ✅ Usar o formato de resposta API padrão
6. ✅ Usar ISO 8601 para datas
7. ✅ Implementar error handling com códigos padrão
8. ✅ Usar TanStack Query para server state
9. ✅ Usar Zustand para UI state
10. ✅ Mensagens de erro em português

**Pattern Enforcement:**

- ESLint rules para naming conventions
- TypeScript strict mode para type safety
- PR review checklist inclui verificação de padrões
- Testes validam formatos de API response

## Project Structure & Boundaries

### Requirements to Structure Mapping

| Domínio FR | Diretório Principal | Componentes |
|------------|---------------------|-------------|
| Lead Acquisition (FR1-6) | `app/(dashboard)/leads/`, `components/leads/`, `lib/services/apollo.ts` | AISearchInput, LeadTable, Filters |
| Lead Management (FR7-12) | `app/(dashboard)/leads/`, `components/leads/`, `stores/leads-store.ts` | LeadCard, LeadDetail, StatusBadge |
| Campaign Building (FR13-19) | `app/(dashboard)/campaigns/`, `components/builder/` | CampaignBuilder, EmailBlock, Canvas |
| AI Generation (FR20-26) | `lib/ai/`, `components/builder/` | AITextGenerator, PromptBuilder |
| External Integrations (FR27-33) | `lib/services/`, `app/api/integrations/` | Apollo, SignalHire, Snov.io, Instantly |
| User Management (FR34-38) | `app/(auth)/`, `lib/supabase/` | Auth flows, middleware |
| Administration (FR39-45) | `app/(dashboard)/settings/` | APIConfig, KnowledgeBase |
| Interface (FR46-49) | `components/ui/`, `components/common/` | Layout, Navigation, Feedback |

### Complete Project Directory Structure

```
tdec-prospect/
├── README.md
├── package.json
├── package-lock.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── components.json                    # shadcn/ui config
├── .env.local                         # Variáveis locais (git ignored)
├── .env.example                       # Template de variáveis
├── .gitignore
├── .eslintrc.json
├── .prettierrc
│
├── .github/
│   └── workflows/
│       ├── ci.yml                     # Lint, test, build
│       └── preview.yml                # Vercel preview deploy
│
├── supabase/
│   ├── config.toml                    # Supabase local config
│   ├── seed.sql                       # Dados iniciais (dev)
│   └── migrations/
│       ├── 00001_create_tenants.sql
│       ├── 00002_create_users.sql
│       ├── 00003_create_leads.sql
│       ├── 00004_create_campaigns.sql
│       ├── 00005_create_email_blocks.sql
│       ├── 00006_create_knowledge_base.sql
│       ├── 00007_create_api_configs.sql
│       └── 00008_setup_rls_policies.sql
│
├── public/
│   ├── favicon.ico
│   └── images/
│       └── logo.svg
│
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx                 # Root layout
│   │   ├── page.tsx                   # Landing/redirect
│   │   ├── loading.tsx                # Global loading
│   │   ├── error.tsx                  # Global error
│   │   ├── not-found.tsx              # 404
│   │   │
│   │   ├── (auth)/                    # Auth route group
│   │   │   ├── layout.tsx             # Auth layout (centered)
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── signup/
│   │   │   │   └── page.tsx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   └── callback/
│   │   │       └── route.ts           # OAuth callback
│   │   │
│   │   ├── (dashboard)/               # Protected route group
│   │   │   ├── layout.tsx             # Dashboard layout (sidebar)
│   │   │   │
│   │   │   ├── leads/
│   │   │   │   ├── page.tsx           # Lista de leads
│   │   │   │   ├── loading.tsx
│   │   │   │   └── [leadId]/
│   │   │   │       └── page.tsx       # Detalhe do lead
│   │   │   │
│   │   │   ├── campaigns/
│   │   │   │   ├── page.tsx           # Lista de campanhas
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx       # Nova campanha (builder)
│   │   │   │   └── [campaignId]/
│   │   │   │       ├── page.tsx       # Editar campanha
│   │   │   │       └── preview/
│   │   │   │           └── page.tsx   # Preview da campanha
│   │   │   │
│   │   │   └── settings/
│   │   │       ├── page.tsx           # Settings overview
│   │   │       ├── integrations/
│   │   │       │   └── page.tsx       # Config APIs externas
│   │   │       ├── knowledge-base/
│   │   │       │   └── page.tsx       # Base de conhecimento
│   │   │       ├── ai-config/
│   │   │       │   └── page.tsx       # Config modelos IA
│   │   │       └── team/
│   │   │           └── page.tsx       # Gerenciar usuários
│   │   │
│   │   └── api/
│   │       ├── leads/
│   │       │   ├── route.ts           # GET (list), POST (create)
│   │       │   ├── search/
│   │       │   │   └── route.ts       # POST (AI search)
│   │       │   └── [leadId]/
│   │       │       ├── route.ts       # GET, PATCH, DELETE
│   │       │       └── phone/
│   │       │           └── route.ts   # POST (SignalHire)
│   │       │
│   │       ├── campaigns/
│   │       │   ├── route.ts           # GET, POST
│   │       │   └── [campaignId]/
│   │       │       ├── route.ts       # GET, PATCH, DELETE
│   │       │       └── export/
│   │       │           └── route.ts   # POST (export to Snov/Instantly)
│   │       │
│   │       ├── ai/
│   │       │   ├── generate/
│   │       │   │   └── route.ts       # POST (generate text)
│   │       │   └── translate-search/
│   │       │       └── route.ts       # POST (NL to filters)
│   │       │
│   │       └── integrations/
│   │           ├── apollo/
│   │           │   ├── route.ts       # Proxy to Apollo
│   │           │   └── test/
│   │           │       └── route.ts   # Test connection
│   │           ├── signalhire/
│   │           │   └── route.ts
│   │           ├── snovio/
│   │           │   └── route.ts
│   │           └── instantly/
│   │               └── route.ts
│   │
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── ... (outros shadcn)
│   │   │
│   │   ├── common/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── ErrorMessage.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── ThemeToggle.tsx
│   │   │
│   │   ├── leads/
│   │   │   ├── LeadTable.tsx
│   │   │   ├── LeadCard.tsx
│   │   │   ├── LeadDetail.tsx
│   │   │   ├── LeadFilters.tsx
│   │   │   ├── LeadStatusBadge.tsx
│   │   │   ├── LeadSelectionBar.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── search/
│   │   │   ├── AISearchInput.tsx
│   │   │   ├── SearchSuggestions.tsx
│   │   │   ├── FilterPanel.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── builder/
│   │   │   ├── CampaignBuilder.tsx    # Compound component root
│   │   │   ├── BuilderCanvas.tsx
│   │   │   ├── BuilderSidebar.tsx
│   │   │   ├── BuilderPreview.tsx
│   │   │   ├── EmailBlock.tsx
│   │   │   ├── DelayBlock.tsx
│   │   │   ├── SequenceConnector.tsx
│   │   │   ├── BlockEditor.tsx
│   │   │   ├── AITextGenerator.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── campaigns/
│   │   │   ├── CampaignCard.tsx
│   │   │   ├── CampaignList.tsx
│   │   │   ├── ExportDialog.tsx
│   │   │   └── index.ts
│   │   │
│   │   └── settings/
│   │       ├── IntegrationCard.tsx
│   │       ├── APIKeyInput.tsx
│   │       ├── ConnectionStatus.tsx
│   │       ├── KnowledgeBaseEditor.tsx
│   │       ├── AIModelSelector.tsx
│   │       ├── TeamMemberList.tsx
│   │       └── index.ts
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # Browser client
│   │   │   ├── server.ts              # Server client
│   │   │   ├── middleware.ts          # Auth middleware helper
│   │   │   └── admin.ts               # Service role client
│   │   │
│   │   ├── services/
│   │   │   ├── base-service.ts        # Abstract base class
│   │   │   ├── apollo.ts              # ApolloService
│   │   │   ├── signalhire.ts          # SignalHireService
│   │   │   ├── snovio.ts              # SnovioService
│   │   │   ├── instantly.ts           # InstantlyService
│   │   │   └── index.ts               # Service factory
│   │   │
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   │   ├── base-provider.ts   # Abstract AI provider
│   │   │   │   ├── openai.ts          # OpenAI implementation
│   │   │   │   └── anthropic.ts       # Anthropic implementation
│   │   │   ├── prompts/
│   │   │   │   ├── search-prompt.ts   # NL to filters
│   │   │   │   ├── email-prompt.ts    # Email generation
│   │   │   │   └── personalization-prompt.ts
│   │   │   └── index.ts               # AI service facade
│   │   │
│   │   ├── utils/
│   │   │   ├── cn.ts                  # classNames utility
│   │   │   ├── date.ts                # Date formatting
│   │   │   ├── error-handler.ts       # Error handling
│   │   │   ├── api-response.ts        # Response helpers
│   │   │   └── validation.ts          # Common Zod schemas
│   │   │
│   │   └── constants/
│   │       ├── error-codes.ts
│   │       ├── lead-status.ts
│   │       └── ai-models.ts
│   │
│   ├── hooks/
│   │   ├── use-leads.ts               # TanStack Query: leads
│   │   ├── use-campaigns.ts           # TanStack Query: campaigns
│   │   ├── use-ai-search.ts           # AI search mutation
│   │   ├── use-ai-generate.ts         # AI text generation
│   │   ├── use-export.ts              # Campaign export
│   │   └── use-debounce.ts            # Utility hook
│   │
│   ├── stores/
│   │   ├── builder-store.ts           # Campaign builder state
│   │   ├── selection-store.ts         # Lead selection state
│   │   └── ui-store.ts                # UI state (sidebar, theme)
│   │
│   ├── types/
│   │   ├── database.ts                # Supabase generated types
│   │   ├── api.ts                     # API request/response types
│   │   ├── lead.ts                    # Lead domain types
│   │   ├── campaign.ts                # Campaign domain types
│   │   ├── ai.ts                      # AI config types
│   │   └── index.ts                   # Re-exports
│   │
│   ├── actions/                       # Server Actions
│   │   ├── leads.ts                   # Lead mutations
│   │   ├── campaigns.ts               # Campaign mutations
│   │   └── settings.ts                # Settings mutations
│   │
│   └── middleware.ts                  # Next.js middleware (auth)
│
├── __tests__/
│   ├── components/
│   │   ├── leads/
│   │   │   └── LeadCard.test.tsx
│   │   └── builder/
│   │       └── EmailBlock.test.tsx
│   ├── hooks/
│   │   └── use-leads.test.ts
│   ├── lib/
│   │   └── services/
│   │       └── apollo.test.ts
│   └── integration/
│       └── leads-api.test.ts
│
└── e2e/
    ├── playwright.config.ts
    ├── fixtures/
    │   └── auth.ts
    └── specs/
        ├── auth.spec.ts
        ├── leads.spec.ts
        └── campaign-flow.spec.ts
```

### Architectural Boundaries

**API Boundaries:**

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │ Components  │  │ Stores (Zustand)    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   TanStack Query                             │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │  API Routes │  ← Boundary: HTTP/JSON
                    │  /api/*     │
                    └──────┬──────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
┌────┴────┐         ┌──────┴──────┐       ┌─────┴─────┐
│Supabase │         │ AI Services │       │ External  │
│ Client  │         │ (OpenAI,    │       │   APIs    │
│         │         │  Anthropic) │       │(Apollo,   │
│ Auth    │         └─────────────┘       │SignalHire)│
│ Database│                               └───────────┘
│ RLS     │
└─────────┘
```

**Component Boundaries:**

| Boundary | Comunicação | Padrão |
|----------|-------------|--------|
| Page → Components | Props | Unidirecional |
| Components → Store | Zustand hooks | Reativo |
| Components → API | TanStack Query | Cache + Mutations |
| API Routes → Services | Direct calls | Async/await |
| Services → External | HTTP | Error handling |

**Data Boundaries:**

| Camada | Responsabilidade | Isolamento |
|--------|-----------------|------------|
| Supabase RLS | Tenant isolation | Row-level |
| API Routes | Request validation | Zod schemas |
| Services | External API errors | Error translation |
| Frontend | UI state | Component-scoped |

### Feature to Structure Mapping

**Epic: Lead Acquisition (FR1-6)**
```
Componentes:  src/components/search/, src/components/leads/
Hooks:        src/hooks/use-leads.ts, src/hooks/use-ai-search.ts
API:          src/app/api/leads/, src/app/api/leads/search/
Services:     src/lib/services/apollo.ts
Pages:        src/app/(dashboard)/leads/
```

**Epic: Campaign Building (FR13-19)**
```
Componentes:  src/components/builder/
Stores:       src/stores/builder-store.ts
Hooks:        src/hooks/use-campaigns.ts
API:          src/app/api/campaigns/
Pages:        src/app/(dashboard)/campaigns/new/
```

**Epic: AI Generation (FR20-26)**
```
Componentes:  src/components/builder/AITextGenerator.tsx
Hooks:        src/hooks/use-ai-generate.ts
API:          src/app/api/ai/
Services:     src/lib/ai/
Config:       src/app/(dashboard)/settings/ai-config/
```

**Epic: External Integrations (FR27-33)**
```
Services:     src/lib/services/
API:          src/app/api/integrations/
Config:       src/app/(dashboard)/settings/integrations/
Componentes:  src/components/settings/IntegrationCard.tsx
```

### Integration Points

**Internal Communication:**
- Pages fetch data via TanStack Query hooks
- Components update UI state via Zustand stores
- Server Actions handle form mutations
- API Routes proxy external service calls

**External Integrations:**
- Apollo API: Lead search and enrichment
- SignalHire API: Phone number lookup
- Snov.io API: Campaign export
- Instantly API: Campaign export
- OpenAI/Anthropic API: Text generation

**Data Flow:**
```
User Input → Component → Hook/Action → API Route → Service → External API
                                              ↓
User Display ← Component ← TanStack Cache ← Response
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
Todas as decisões tecnológicas foram validadas como compatíveis:
- Next.js 15+ com Supabase Cloud (integração oficial)
- Supabase Auth com RLS (combinação nativa)
- TanStack Query v5 com Supabase Client
- Zustand com React 19
- shadcn/ui com Tailwind CSS v4
- @dnd-kit e Framer Motion com Next.js App Router

**Pattern Consistency:**
Todos os padrões de implementação suportam as decisões arquiteturais sem conflitos.
Naming conventions consistentes entre camadas (DB → API → Frontend).

**Structure Alignment:**
A estrutura do projeto suporta todas as decisões e permite crescimento futuro.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
49/49 requisitos funcionais têm suporte arquitetural completo:
- Lead Acquisition: Apollo service + AI search
- Campaign Building: Builder components + Zustand + @dnd-kit
- AI Generation: Multi-provider + streaming
- Integrations: Service classes com error handling

**Non-Functional Requirements Coverage:**
11/11 NFRs endereçados arquiteturalmente:
- Performance: TanStack cache, streaming, SSR
- Security: RLS, Vault, middleware
- Scalability: Multi-tenant ready

### Implementation Readiness Validation ✅

**Decision Completeness:** 100% - Todas decisões críticas documentadas com versões
**Structure Completeness:** 100% - Projeto completo com 100+ arquivos mapeados
**Pattern Completeness:** 100% - Exemplos para todos os padrões principais

### Gap Analysis Results

**Critical Gaps:** None
**Important Gaps:** None
**Nice-to-Have (Post-MVP):**
- Observability avançado (Sentry)
- Cache Redis se necessário
- Rate limiting se necessário

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium-High)
- [x] Technical constraints identified (4 external APIs, multi-tenant)
- [x] Cross-cutting concerns mapped (6 concerns)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established (DB, API, Code)
- [x] Structure patterns defined
- [x] Communication patterns specified (Zustand, TanStack)
- [x] Process patterns documented (Error, Loading)

**✅ Project Structure**
- [x] Complete directory structure defined (100+ files)
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
- Stack moderno e bem integrado (Next.js + Supabase)
- Multi-tenancy nativo com RLS
- Flexibilidade de AI providers
- Padrões claros para consistência

**Areas for Future Enhancement:**
- Observability avançado (Post-MVP)
- Analytics e métricas de uso
- Mobile app (se necessário)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions

**First Implementation Priority:**
```bash
# 1. Criar projeto Next.js
npx create-next-app@latest tdec-prospect --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 2. Inicializar shadcn/ui
cd tdec-prospect
npx shadcn init

# 3. Instalar dependências core
npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query zustand zod react-hook-form @dnd-kit/core @dnd-kit/sortable framer-motion
```

---

## Architectural Decision Records (ADRs)

### ADR-001: AI Prompt Management System

**Status:** Accepted
**Date:** 2026-01-30
**Context:** O sistema utilizará AI para múltiplas funcionalidades (busca conversacional, geração de texto, personalização). Os criadores do software precisam de flexibilidade para ajustar prompts sem necessidade de deploy.

**Decision:**

Todos os prompts de AI serão centralizados e externalizados, permitindo alteração fácil pelos desenvolvedores.

**Abordagem de Armazenamento:**

| Componente | Localização | Rationale |
|------------|-------------|-----------|
| **Prompts Base** | Tabela `ai_prompts` no Supabase | Editável via admin, versionável, sem deploy |
| **System Prompts** | `lib/ai/prompts/*.ts` com fallback | Defaults no código, override via DB |
| **Tenant Customizations** | Tabela `ai_prompts` com `tenant_id` | Personalização por cliente |

**Schema da Tabela `ai_prompts`:**

```sql
CREATE TABLE ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  prompt_key VARCHAR(100) NOT NULL,           -- 'search_translation', 'email_generation', etc.
  prompt_template TEXT NOT NULL,              -- Template com {{variáveis}}
  model_preference VARCHAR(50),               -- 'gpt-4o', 'claude-3.5-sonnet', etc.
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',                -- Parâmetros extras (temperature, max_tokens)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(tenant_id, prompt_key, version)
);

-- RLS para isolamento
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON ai_prompts
  FOR ALL USING (tenant_id IS NULL OR tenant_id = auth.jwt() ->> 'tenant_id');
```

**Prompt Keys Definidos:**

| Key | Uso | Epic |
|-----|-----|------|
| `search_translation` | Tradução de linguagem natural → filtros Apollo | Epic 3 |
| `email_subject_generation` | Geração de assunto de email | Epic 6 |
| `email_body_generation` | Geração de corpo de email | Epic 6 |
| `icebreaker_generation` | Quebra-gelos personalizados | Epic 6 |
| `tone_application` | Aplicação de tom de voz | Epic 6 |

**Padrão de Uso no Código:**

```typescript
// lib/ai/prompt-manager.ts
export class PromptManager {
  async getPrompt(key: string, tenantId?: string): Promise<PromptConfig> {
    // 1. Busca prompt específico do tenant
    // 2. Fallback para prompt global (tenant_id = NULL)
    // 3. Fallback para default no código
  }

  async renderPrompt(key: string, variables: Record<string, string>): Promise<string> {
    const template = await this.getPrompt(key);
    return this.interpolate(template.prompt_template, variables);
  }
}
```

**Interface Admin (Futuro):**
- UI para editar prompts será disponibilizada em fase posterior
- Inicialmente, alterações via Supabase Studio ou migrations
- Versionamento automático para rollback

**Consequences:**

✅ **Positivas:**
- Prompts editáveis sem deploy de código
- Experimentação A/B possível com versionamento
- Personalização por tenant
- Auditoria de alterações

⚠️ **Trade-offs:**
- Latência adicional (query ao DB antes de cada chamada AI)
- Mitigação: cache de prompts em memória com TTL de 5 minutos
- Complexidade adicional no setup inicial

**Implementation Notes:**

1. **Epic 6, Story 6.1** deve incluir a criação do `PromptManager` e tabela `ai_prompts`
2. Prompts iniciais serão seed no banco via migration
3. Cache implementado via `unstable_cache` do Next.js ou TanStack Query

**Related:**
- Epic 6: AI Content Generation
- Story 6.1: AI Provider Service Layer

