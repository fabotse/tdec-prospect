# Story 6.1: AI Provider Service Layer & Prompt Management System

Status: done

## Story

As a developer,
I want an AI service layer supporting multiple providers with centralized prompt management,
So that we can use OpenAI or Anthropic for text generation and easily adjust prompts without code deploys.

## Acceptance Criteria

### AC #1: Multi-Provider AI Service
**Given** the system needs to generate text
**When** the AI service is called
**Then** it uses the configured provider (OpenAI or Anthropic)
**And** the service follows the AIProvider base class pattern
**And** API keys are retrieved from tenant configuration
**And** errors are caught and translated to Portuguese
**And** the service supports streaming responses
**And** timeout is set appropriately for text generation (5 seconds per AC)

### AC #2: Prompt Management System (ADR-001)
**Given** the system needs to use a prompt
**When** the PromptManager is called
**Then** it retrieves the prompt from `ai_prompts` table
**And** falls back to global prompt if no tenant-specific exists
**And** falls back to code default if no DB prompt exists
**And** prompts are cached for 5 minutes to reduce DB queries

### AC #3: ai_prompts Table Schema
**Given** prompt management needs storage
**When** the migration is run
**Then** the `ai_prompts` table is created with schema per ADR-001:
- `id` UUID PRIMARY KEY
- `tenant_id` UUID REFERENCES tenants(id) (nullable for global prompts)
- `prompt_key` VARCHAR(100) NOT NULL
- `prompt_template` TEXT NOT NULL
- `model_preference` VARCHAR(50)
- `version` INTEGER DEFAULT 1
- `is_active` BOOLEAN DEFAULT true
- `metadata` JSONB DEFAULT '{}'
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ
- `created_by` UUID REFERENCES auth.users(id)
- UNIQUE(tenant_id, prompt_key, version)
**And** RLS policies ensure tenant isolation

### AC #4: Initial Prompts Seeded
**Given** the system needs prompts to function
**When** the migration is run
**Then** initial prompts are seeded via migration:
- `search_translation`: Tradução linguagem natural → filtros (ALREADY EXISTS in code)
- `email_subject_generation`: Geração de assuntos
- `email_body_generation`: Geração de corpo de email
- `icebreaker_generation`: Quebra-gelos personalizados
- `tone_application`: Aplicação de tom de voz

### AC #5: AIProvider Abstract Base Class
**Given** multiple AI providers need common interface
**When** implementing OpenAI or Anthropic provider
**Then** both follow the same AIProvider interface:
- `generateText(prompt, options)`: Generate text with optional streaming
- `generateStream(prompt, options)`: Stream text generation
- `getModelConfig()`: Return model configuration
**And** error handling follows ExternalService pattern (see base-service.ts)

### AC #6: OpenAI Provider Implementation
**Given** OpenAI is selected as provider
**When** the AIProvider is instantiated
**Then** it uses OpenAI SDK with configured API key
**And** supports models: gpt-4o-mini, gpt-4o, gpt-4-turbo
**And** streaming responses use Server-Sent Events pattern

### AC #7: Anthropic Provider Implementation (Optional - P1)
**Given** Anthropic is selected as provider
**When** the AIProvider is instantiated
**Then** it uses Anthropic SDK with configured API key
**And** supports models: claude-3-haiku, claude-3.5-sonnet
**And** streaming follows same pattern as OpenAI

## Tasks / Subtasks

- [x] Task 1: Create ai_prompts migration (AC: #3)
  - [x] 1.1 Create `00020_create_ai_prompts.sql` migration
  - [x] 1.2 Add RLS policies for tenant isolation (SELECT for all users, INSERT/UPDATE/DELETE for admins)
  - [x] 1.3 Create index for `tenant_id, prompt_key, is_active`

- [x] Task 2: Seed initial prompts (AC: #4)
  - [x] 2.1 Create `00021_seed_ai_prompts.sql` migration
  - [x] 2.2 Seed `email_subject_generation` prompt (Portuguese context)
  - [x] 2.3 Seed `email_body_generation` prompt (Portuguese context)
  - [x] 2.4 Seed `icebreaker_generation` prompt
  - [x] 2.5 Seed `tone_application` prompt

- [x] Task 3: Create TypeScript types (AC: #2, #5)
  - [x] 3.1 Create `src/types/ai-provider.ts` with AIProvider interfaces
  - [x] 3.2 Create `src/types/ai-prompt.ts` with Prompt types and Zod schemas
  - [x] 3.3 Export from `src/types/index.ts`

- [x] Task 4: Implement PromptManager (AC: #2)
  - [x] 4.1 Create `src/lib/ai/prompt-manager.ts`
  - [x] 4.2 Implement `getPrompt(key, tenantId?)` with 3-level fallback
  - [x] 4.3 Implement `renderPrompt(key, variables)` for template interpolation
  - [x] 4.4 Implement caching with 5-minute TTL (use Map with timestamps)

- [x] Task 5: Create AIProvider base class (AC: #5)
  - [x] 5.1 Create `src/lib/ai/providers/base-provider.ts`
  - [x] 5.2 Define abstract methods: `generateText`, `generateStream`, `getModelConfig`
  - [x] 5.3 Implement common error handling (follow ExternalService pattern)

- [x] Task 6: Implement OpenAI Provider (AC: #1, #6)
  - [x] 6.1 Refactor existing `src/lib/ai/ai-service.ts` to `src/lib/ai/providers/openai.ts`
  - [x] 6.2 Implement streaming with Server-Sent Events
  - [x] 6.3 Add model configuration (gpt-4o-mini, gpt-4o, gpt-4-turbo)
  - [x] 6.4 Implement timeout (5 seconds for text generation)

- [x] Task 7: Create AI Service Facade (AC: #1)
  - [x] 7.1 Update `src/lib/ai/index.ts` to export new structure
  - [x] 7.2 Create factory function `createAIProvider(provider, apiKey)`
  - [x] 7.3 Integrate PromptManager for text generation

- [x] Task 8: Create API routes for AI generation
  - [x] 8.1 Create `src/app/api/ai/generate/route.ts` for text generation
  - [x] 8.2 Support streaming responses (ReadableStream)
  - [x] 8.3 Validate request with Zod schema

- [x] Task 9: Unit tests
  - [x] 9.1 Test PromptManager fallback logic
  - [x] 9.2 Test OpenAIProvider error handling
  - [x] 9.3 Test API route validation

## Dev Notes

### Architecture Compliance

**CRITICAL:** Esta story é a base para todo o Epic 6 (AI Content Generation). O design deve suportar:
- FR20: Geração de texto de email usando IA contextualizada
- FR21: Base de conhecimento do tenant para personalizar textos
- FR22: Quebra-gelos personalizados
- FR23-24: Edição e regeneração de texto
- FR25: Tom de voz configurado
- FR26: Exemplos de comunicação bem-sucedida

### Existing Code Patterns

**External Service Pattern (base-service.ts:121-276):**
```typescript
// SEGUIR este padrão para AIProvider
export abstract class ExternalService {
  abstract readonly name: string;
  protected async request<T>(url: string, options: RequestInit): Promise<T>
  protected handleError(error: unknown): ExternalServiceError
}
```

**Existing AI Service (ai-service.ts):**
- Já existe `AIService` com `translateSearchToFilters()` e `transcribeAudio()`
- MANTER compatibilidade - não quebrar busca conversacional
- REFATORAR para usar nova estrutura de providers

**Error Messages Pattern:**
```typescript
// SEGUIR padrão de mensagens em português
export const AI_ERROR_MESSAGES = {
  PARSE_FAILURE: "Não consegui entender sua busca...",
  TIMEOUT: "A busca demorou muito...",
  API_ERROR: "Erro no serviço de IA...",
}
```

### Project Structure Notes

**Estrutura alvo:**
```
src/lib/ai/
├── index.ts                     # Exports facade
├── prompt-manager.ts            # NEW: PromptManager class
├── providers/
│   ├── base-provider.ts         # NEW: Abstract AIProvider
│   ├── openai.ts               # REFACTOR from ai-service.ts
│   └── anthropic.ts            # NEW: P1 (opcional)
├── prompts/
│   ├── filter-extraction.ts    # EXISTS: Manter para busca
│   ├── email-generation.ts     # NEW: Defaults para email
│   └── icebreaker.ts           # NEW: Defaults para icebreaker
└── ai-service.ts               # KEEP: translateSearchToFilters
```

**Migration files:**
```
supabase/migrations/
├── 00020_create_ai_prompts.sql
└── 00021_seed_ai_prompts.sql
```

### ADR-001: Prompt Management System

**Schema da tabela `ai_prompts` (definido em architecture.md):**
```sql
CREATE TABLE ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  prompt_key VARCHAR(100) NOT NULL,
  prompt_template TEXT NOT NULL,
  model_preference VARCHAR(50),
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(tenant_id, prompt_key, version)
);
```

**Fallback Logic (3 levels):**
1. Tenant-specific prompt (`tenant_id = current_tenant`)
2. Global prompt (`tenant_id IS NULL`)
3. Code default (hardcoded in `src/lib/ai/prompts/`)

### Knowledge Base Integration

**Tabelas existentes para contexto de IA:**
- `knowledge_base` (section: company, tone, examples, icp)
- `knowledge_base_examples` (subject, body, context)

**Types existentes (knowledge-base.ts):**
- `CompanyProfile`: company_name, business_description, products_services, competitive_advantages
- `ToneOfVoice`: preset (formal/casual/technical), custom_description, writing_guidelines
- `ICPDefinition`: company_sizes, industries, job_titles, geographic_focus, pain_points

### Technical Constraints

1. **Timeout:** 5 segundos para geração de texto (NFR-P2)
2. **Retry:** 1 retry automático em timeout (seguir padrão ExternalService)
3. **Streaming:** Usar Server-Sent Events para streaming response
4. **Cache:** 5 minutos TTL para prompts do banco

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-001]
- [Source: src/lib/services/base-service.ts - ExternalService pattern]
- [Source: src/lib/ai/ai-service.ts - Existing AI implementation]
- [Source: src/lib/ai/prompts/filter-extraction.ts - Existing prompt]
- [Source: src/types/knowledge-base.ts - Context types]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- Implemented complete AI Provider architecture with multi-provider support (OpenAI ready, Anthropic interface prepared)
- Created ai_prompts table with RLS policies for tenant isolation
- Seeded 5 global prompts in Portuguese (search_translation, email_subject_generation, email_body_generation, icebreaker_generation, tone_application)
- PromptManager implements 3-level fallback: tenant → global → code default with 5-min TTL caching
- AIProvider base class follows ExternalService pattern with retry logic and error handling
- OpenAIProvider supports gpt-4o-mini, gpt-4o, gpt-4-turbo models with streaming
- API route `/api/ai/generate` supports both text and streaming responses via SSE
- All 61 AI-related unit tests pass (prompt-manager: 12, openai-provider: 17, ai-generate route: 17, ai-service: 15)
- vi.hoisted() pattern used for Vitest mocks to handle factory hoisting issues

### Code Review Fixes Applied

**HIGH severity fixes:**
1. **base-provider.ts - import type incorreto**: Changed `import type` to proper value import for `AI_GENERATION_ERROR_MESSAGES` which is used at runtime
2. **openai.ts - generateStream sem timeout**: Added AbortController with timeout to streaming method for consistency with generateText
3. **00021_seed_ai_prompts.sql - search_translation missing**: Added `search_translation` prompt to seed (AC #4 requires 5 prompts)

**MEDIUM severity fixes:**
4. **ai-provider.ts - promptKey validation**: Changed `aiGenerateRequestSchema` to use `promptKeySchema` enum validation instead of `z.string().min(1).max(100)`
5. **prompt-manager.test.ts - mock improvement**: Added comprehensive chainable mock pattern for Supabase query builder to prevent false positives
6. **prompt-manager.ts - console.error**: Added `[PromptManager]` prefix context and conditional logging for development mode

### File List

**New Files:**
- `supabase/migrations/00020_create_ai_prompts.sql` - ai_prompts table schema + RLS
- `supabase/migrations/00021_seed_ai_prompts.sql` - Initial global prompts seed
- `src/types/ai-provider.ts` - AI provider types, generation options/results, Zod schemas
- `src/types/ai-prompt.ts` - Prompt types (AIPrompt, RenderedPrompt), Zod schemas
- `src/lib/ai/prompt-manager.ts` - PromptManager class with 3-level fallback + caching
- `src/lib/ai/prompts/defaults.ts` - Code default prompts (level 3 fallback)
- `src/lib/ai/providers/base-provider.ts` - Abstract AIProvider + AIProviderError class
- `src/lib/ai/providers/openai.ts` - OpenAI provider implementation
- `src/lib/ai/providers/index.ts` - Provider factory + exports
- `src/app/api/ai/generate/route.ts` - Text generation API with streaming support
- `__tests__/unit/lib/ai/prompt-manager.test.ts` - PromptManager unit tests (12 tests)
- `__tests__/unit/lib/ai/openai-provider.test.ts` - OpenAI provider unit tests (12 tests)
- `__tests__/unit/api/ai-generate.test.ts` - AI generate route unit tests (14 tests)

**Modified Files:**
- `src/types/index.ts` - Added exports for ai-provider and ai-prompt types
- `src/lib/ai/index.ts` - Updated to export new provider architecture
- `src/lib/ai/providers/base-provider.ts` - Code review: fixed import type issue
- `src/lib/ai/providers/openai.ts` - Code review: added timeout to generateStream
- `src/lib/ai/prompt-manager.ts` - Code review: improved error logging with context
- `src/types/ai-provider.ts` - Code review: use promptKeySchema for validation
- `supabase/migrations/00021_seed_ai_prompts.sql` - Code review: added search_translation prompt
- `__tests__/unit/lib/ai/prompt-manager.test.ts` - Code review: improved Supabase mock
- `__tests__/unit/lib/ai/openai-provider.test.ts` - Code review: added timeout/error tests
- `__tests__/unit/api/ai-generate.test.ts` - Code review: added promptKey validation tests

