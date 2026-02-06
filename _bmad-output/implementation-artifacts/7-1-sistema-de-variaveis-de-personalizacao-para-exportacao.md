# Story 7.1: Sistema de Variáveis de Personalização para Exportação

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a sistema,
I want que os emails de campanha usem variáveis de personalização em vez de texto hardcoded,
So that as campanhas sejam exportáveis para qualquer plataforma com substituição dinâmica por lead.

## Acceptance Criteria

1. **Given** o sistema de variáveis é definido
   **When** as variáveis suportadas são registradas
   **Then** o registry inclui: `{{first_name}}`, `{{company_name}}`, `{{title}}`, `{{ice_breaker}}`
   **And** cada variável tem um campo correspondente no modelo Lead
   **And** existe um mapeamento variável → campo do lead
   (AC: #1)

2. **Given** o usuário gera uma campanha via AI (Wizard)
   **When** nenhum lead está selecionado para preview
   **Then** o email gerado contém variáveis (`{{first_name}}`, `{{ice_breaker}}`, etc.) em vez de dados reais
   **And** o prompt de AI instrui a gerar com variáveis de personalização
   (AC: #2)

3. **Given** o usuário gera um email individual (EmailBlock) com lead selecionado
   **When** o conteúdo é gerado
   **Then** as variáveis são substituídas pelos dados reais do lead para preview
   **And** o template original com variáveis é preservado separadamente
   (AC: #3)

4. **Given** o motor de substituição `resolveEmailVariables(template, lead)` é implementado
   **When** recebe um template com variáveis e um lead
   **Then** substitui cada `{{variável}}` pelo valor correspondente do lead
   **And** variáveis sem valor no lead são mantidas como estão (graceful degradation)
   **And** o preview utiliza este motor para exibir conteúdo personalizado
   (AC: #4)

5. **Given** o registry de variáveis existe
   **When** é consultado para mapeamento de plataforma
   **Then** retorna o formato de tag correspondente para cada plataforma:
   - Instantly: `{{first_name}}` → `{{first_name}}` (custom variable)
   - Snov.io: `{{first_name}}` → `{{firstName}}` (campo Snov.io)
   - CSV: `{{first_name}}` → coluna `first_name`
   (AC: #5)

## Tasks / Subtasks

- [x] Task 1: Criar tipos do sistema de variáveis (AC: #1, #5)
  - [x] 1.1 Criar `src/types/export.ts` com tipos `PersonalizationVariable`, `VariableMapping`, `PlatformMapping`, `ExportPlatform`
  - [x] 1.2 Definir enum/union type para plataformas suportadas: `'instantly' | 'snovio' | 'csv' | 'clipboard'`
  - [x] 1.3 Criar testes de tipo (type-level assertions)

- [x] Task 2: Criar registry de variáveis (AC: #1, #5)
  - [x] 2.1 Criar `src/lib/export/variable-registry.ts` com registry centralizado
  - [x] 2.2 Registrar variáveis: `{{first_name}}`, `{{company_name}}`, `{{title}}`, `{{ice_breaker}}`
  - [x] 2.3 Mapear cada variável → campo do Lead (`firstName`, `companyName`, `title`, `icebreaker`)
  - [x] 2.4 Implementar mapeamento por plataforma (Instantly, Snov.io, CSV)
  - [x] 2.5 Exportar funções: `getVariables()`, `getVariable(name)`, `getPlatformMapping(platform)`, `mapVariableForPlatform(variable, platform)`
  - [x] 2.6 Criar testes: `__tests__/unit/lib/export/variable-registry.test.ts`

- [x] Task 3: Criar motor de substituição (AC: #4)
  - [x] 3.1 Criar `src/lib/export/resolve-variables.ts` com `resolveEmailVariables(template, lead)`
  - [x] 3.2 Implementar substituição de `{{variável}}` → valor do lead usando registry
  - [x] 3.3 Graceful degradation: variáveis sem valor no lead mantidas como estão
  - [x] 3.4 Suportar tanto subject quanto body (resolver ambos)
  - [x] 3.5 Criar testes: `__tests__/unit/lib/export/resolve-variables.test.ts`
    - Teste com todas variáveis preenchidas
    - Teste com variáveis parciais (graceful degradation)
    - Teste com lead sem dados (todas variáveis mantidas)
    - Teste com template sem variáveis (retorna inalterado)
    - Teste com subject + body simultâneos

- [x] Task 4: Atualizar prompts de AI para gerar com variáveis (AC: #2)
  - [x] 4.1 Modificar prompt `email_body_generation` em `src/lib/ai/prompts/defaults.ts`
    - Quando sem lead selecionado: instruir AI a usar `{{first_name}}`, `{{company_name}}`, `{{title}}` além do existente `{{ice_breaker}}`
    - Quando com lead: manter comportamento atual (dados reais inline)
  - [x] 4.2 Modificar prompt `email_subject_generation` para suportar variáveis no subject
  - [x] 4.3 Modificar prompt `follow_up_email_generation` para incluir variáveis em follow-ups
  - [x] 4.4 Modificar prompt `follow_up_subject_generation` para incluir variáveis em subjects follow-up
  - [x] 4.5 Atualizar testes dos prompts para validar presença de instruções sobre variáveis

- [x] Task 5: Atualizar geração de campanha AI (AC: #2, #3)
  - [x] 5.1 Modificar `src/hooks/use-ai-full-campaign-generation.ts`:
    - Sem previewLead: gerar com variáveis (não passar dados de lead ao prompt)
    - Com previewLead: gerar com dados reais (comportamento atual)
  - [x] 5.2 Armazenar template com variáveis separadamente (se lead selecionado, preservar versão com variáveis)
  - [x] 5.3 Atualizar testes do hook

- [x] Task 6: Atualizar preview para usar motor de substituição (AC: #3, #4)
  - [x] 6.1 Modificar `src/components/builder/PreviewEmailStep.tsx`:
    - Substituir lógica hardcoded de `split("{{ice_breaker}}")` por uso de `resolveEmailVariables`
    - Quando previewLead selecionado: mostrar email com variáveis resolvidas
    - Quando sem previewLead: mostrar variáveis como placeholders visuais (highlight estilizado)
  - [x] 6.2 Generalizar visualização de variáveis para todas as variáveis do registry (não apenas ice_breaker)
  - [x] 6.3 Atualizar testes do PreviewEmailStep

## Dev Notes

### Contexto Crítico do Codebase

**Fluxo atual do `{{ice_breaker}}`** (implementado na Story 9.4):
1. **Prompt**: Em `defaults.ts`, o prompt `email_body_generation` tem bloco condicional `{{#if icebreaker}}` — se sem icebreaker, instrui a AI a incluir literal `{{ice_breaker}}`
2. **Storage**: Email body armazenado com `{{ice_breaker}}` como texto literal no `EmailBlock.data.body`
3. **Preview**: `PreviewEmailStep.tsx` faz `body.split("{{ice_breaker}}")` e renderiza placeholder visual entre partes

**A AI NÃO passa dados do lead para geração de email!** O hook `use-ai-full-campaign-generation.ts` envia apenas `tone_style` e `email_objective` como variáveis. O lead data NÃO é passado para os prompts de geração de email. Isso significa que emails gerados via Wizard SEMPRE serão templates (sem dados reais do lead).

**PromptManager.interpolateTemplate** é para variáveis de PROMPT (contexto para a AI), NÃO para variáveis de OUTPUT (personalização de email). São camadas separadas:
- Camada 1: Prompt variables (`{{tone_style}}`, `{{icebreaker}}`, `{{lead_name}}`) → resolvidas ANTES de enviar para AI
- Camada 2: Email output variables (`{{first_name}}`, `{{ice_breaker}}`) → resolvidas DEPOIS, no export/preview

**ATENÇÃO**: Não confundir os dois sistemas de `{{variáveis}}`:
1. `PromptManager.interpolateTemplate()` em `prompt-manager.ts` → interpola variáveis nos prompts de AI (input para AI)
2. `resolveEmailVariables()` (NOVO) em `export/resolve-variables.ts` → interpola variáveis nos emails gerados (output da AI)

### Arquivos Existentes Relevantes

| Arquivo | O que contém | Ação |
|---------|-------------|------|
| `src/lib/ai/prompts/defaults.ts` | Prompts com `{{ice_breaker}}` condicional | Modificar: adicionar variáveis `{{first_name}}`, `{{company_name}}`, `{{title}}` |
| `src/lib/ai/prompt-manager.ts` | Template engine com `{{variable}}` e `{{#if}}` | Referência apenas — NÃO modificar |
| `src/hooks/use-ai-full-campaign-generation.ts` | Hook de geração de campanha AI | Modificar: flag para modo variáveis vs dados reais |
| `src/components/builder/PreviewEmailStep.tsx` | Preview com split de `{{ice_breaker}}` hardcoded | Modificar: usar `resolveEmailVariables` genérico |
| `src/stores/use-builder-store.ts` | Store do builder com `previewLead` | Referência — usar `previewLead` para resolver variáveis |
| `src/types/lead.ts` | Interface `Lead` completa | Referência — mapear campos para variáveis |
| `src/types/email-block.ts` | Interface `EmailBlock` com `data.body` | Referência — email body é string com variáveis |

### Interface Lead — Campos Disponíveis para Personalização

```typescript
interface Lead {
  id: string;
  firstName: string;         // → {{first_name}}
  lastName: string | null;
  email: string | null;
  companyName: string | null; // → {{company_name}}
  title: string | null;      // → {{title}}
  icebreaker: string | null;  // → {{ice_breaker}}
  // Campos adicionais (não mapeados na v1):
  // phone, companySize, industry, location, linkedinUrl, photoUrl
}
```

### PreviewLead — Subset no Builder Store

```typescript
interface PreviewLead {
  id: string;
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  title: string | null;
  email: string | null;
  icebreaker: string | null;
  icebreakerGeneratedAt: string | null;
  linkedinPostsCache: {...} | null;
}
```

### Padrão de Preview Atual (PreviewEmailStep.tsx)

Lógica hardcoded para `{{ice_breaker}}` em linhas ~87-108:
```tsx
body.split("{{ice_breaker}}").map((part, i, arr) => (
  <span key={i}>
    {part}
    {i < arr.length - 1 && (
      <span className="italic text-muted-foreground/70" data-testid="icebreaker-placeholder">
        [Ice Breaker personalizado será gerado para cada lead]
      </span>
    )}
  </span>
))
```
**Deve ser substituído** por lógica genérica que detecta TODAS variáveis do registry e renderiza cada uma como placeholder visual (quando sem lead) ou como texto resolvido (quando com lead).

### Prompt Structure Relevante (defaults.ts)

O prompt `email_body_generation` já tem bloco condicional para ice_breaker:
```
{{#if icebreaker}}
QUEBRA-GELO PERSONALIZADO (USE COMO ABERTURA):
{{icebreaker}}
{{else}}
VARIÁVEL DE PERSONALIZAÇÃO:
Inclua a variável EXATA "{{ice_breaker}}" (com chaves duplas) no local do quebra-gelo.
{{/if}}
```

**Padrão a expandir**: Adicionar blocos condicionais similares para `{{first_name}}`, `{{company_name}}`, `{{title}}`:
- Se `lead_name` fornecido → usar nome real
- Se NÃO fornecido → instruir AI a usar `{{first_name}}`

### Decisões de Design

1. **Formato de variáveis**: Manter `{{snake_case}}` — consistente com `{{ice_breaker}}` existente
2. **Template vs Resolved**: Email body no `EmailBlock.data.body` sempre armazena versão com variáveis (template). Resolução é feita on-demand no preview e no export.
3. **Backward compatibility**: Emails já gerados sem variáveis (texto hardcoded) continuam funcionando — o motor de resolução simplesmente não encontra variáveis para substituir e retorna texto inalterado.

### Project Structure Notes

**Novos arquivos seguem padrões existentes:**
- `src/lib/export/` — novo módulo, kebab-case para arquivos
- `src/types/export.ts` — tipos no padrão do projeto
- Testes em `__tests__/unit/lib/export/` espelhando src/

**Sem conflitos** com estrutura existente. O diretório `src/lib/export/` é novo e não colide com nada.

### Testing Requirements

**Framework**: Vitest (projeto usa Vitest, NÃO Jest)
**Padrão de mocks**: `vi.hoisted()` para setup, `vi.mock()` para módulos
**Mock Supabase**: Usar `createMockSupabase` de `__tests__/test-utils/mock-supabase.ts`
**Mock Fetch**: Usar `createMockFetch` de `__tests__/test-utils/mock-fetch.ts`
**ESLint**: `no-console` rule ativa — NÃO usar console.log/warn/error

**Testes obrigatórios:**

| Arquivo de Teste | Escopo |
|-----------------|--------|
| `__tests__/unit/lib/export/variable-registry.test.ts` | Registry CRUD, mapeamentos, plataformas |
| `__tests__/unit/lib/export/resolve-variables.test.ts` | Motor de substituição, edge cases, graceful degradation |
| Atualizar `__tests__/unit/lib/ai/prompts/defaults.test.ts` | Validar instruções de variáveis nos prompts |
| Atualizar `__tests__/unit/hooks/use-ai-full-campaign-generation.test.ts` | Modo variáveis vs dados reais |
| Atualizar `__tests__/unit/components/builder/PreviewEmailStep.test.ts` | Preview genérico com todas variáveis |

### Architecture Compliance

- **Naming**: Arquivos utility em kebab-case (`variable-registry.ts`, `resolve-variables.ts`)
- **Types**: PascalCase para interfaces (`PersonalizationVariable`, `PlatformMapping`)
- **Functions**: camelCase (`resolveEmailVariables`, `getVariables`, `mapVariableForPlatform`)
- **Constants**: SCREAMING_SNAKE para constantes (`PERSONALIZATION_VARIABLES`)
- **Errors**: Mensagens em português brasileiro
- **Exports**: Named exports (não default)

### Library / Framework Requirements

- **Sem novas dependências** — Esta story usa apenas TypeScript puro, utilidades existentes do projeto
- **Vitest** para testes (já instalado)
- **Regex** para detecção/substituição de `{{variáveis}}` — usar regex simples `/\{\{(\w+)\}\}/g`

### Git Intelligence Summary

**Branch atual**: `epic/7-campaign-deployment-export` (criada a partir de main)
**Último commit**: `ecc8de7 chore(epic-7): initialize epic branch and update sprint status`
**Branch base para PR**: `main`

**Commits recentes relevantes:**
- `1d83871 feat(story-9.4): Ice Breaker Variable in AI Campaign Generation` — implementou `{{ice_breaker}}` nos prompts
- `cfe6ecc feat(story-9.6): AI Prompt Quality Review` — padronizou variáveis e tone guides
- `49bd93b feat(cleanup-sprint-2): centralized mock infrastructure` — mock helpers que devem ser usados

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-001: AI Prompt Management System]
- [Source: src/lib/ai/prompts/defaults.ts — prompt email_body_generation com {{ice_breaker}}]
- [Source: src/lib/ai/prompt-manager.ts — interpolateTemplate() engine]
- [Source: src/hooks/use-ai-full-campaign-generation.ts — hook de geração]
- [Source: src/components/builder/PreviewEmailStep.tsx — preview com split ice_breaker]
- [Source: src/stores/use-builder-store.ts — PreviewLead interface]
- [Source: src/types/lead.ts — Lead interface completa]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum problema de debug durante implementação.

### Completion Notes List

- Task 1: Criado `src/types/export.ts` com tipos `PersonalizationVariable`, `VariableMapping`, `PlatformMapping`, `ExportPlatform`, `ResolveEmailInput`, `ResolveEmailOutput`. Adicionado re-export em `types/index.ts`. 12 testes de tipo.
- Task 2: Criado `src/lib/export/variable-registry.ts` com registry centralizado de 4 variáveis (`first_name`, `company_name`, `title`, `ice_breaker`), mapeamento por plataforma (Instantly, Snov.io, CSV, Clipboard), e API pública (`getVariables`, `getVariable`, `getPlatformMapping`, `mapVariableForPlatform`). 21 testes.
- Task 3: Criado `src/lib/export/resolve-variables.ts` com motor `resolveEmailVariables(input, lead)`. Suporta subject+body simultâneos, graceful degradation, variáveis desconhecidas preservadas. 14 testes cobrindo todos edge cases.
- Task 4: Adicionados blocos condicionais `{{#if lead_name}}` em 4 prompts (email_body, email_subject, follow_up_body, follow_up_subject). Quando sem lead: MODO TEMPLATE instrui AI a usar `{{first_name}}`, `{{company_name}}`, `{{title}}`. Quando com lead: usa dados reais. 14 testes novos, 118 testes de prompt passando.
- Task 5: Wizard gera SEMPRE em MODO TEMPLATE (sem lead data nos prompts). Preview resolution feita on-demand no PreviewEmailStep via `resolveEmailVariables()`. previewLead removido de FullGenerationParams (Code Review fix H1). 2 testes.
- Task 6: Substituída lógica hardcoded `split("{{ice_breaker}}")` no PreviewEmailStep por renderização genérica via `getVariables()` e `resolveEmailVariables()`. Todas as variáveis do registry são renderizadas como placeholders estilizados (sem lead) ou texto resolvido (com lead). CampaignPreviewPanel agora passa `previewLead` do builder store. 28 testes (14 novos).

### Change Log

- 2026-02-06: Story 7.1 implementada — sistema de variáveis de personalização com 6 tasks, 75 novos testes, 185 arquivos de teste passando (3317 testes total)
- 2026-02-06: Code Review (Amelia) — 5 fixes aplicados: removido previewLead de FullGenerationParams (H1), type-safe cast em resolve-variables (H2), placeholderLabel no registry eliminando mapa hardcoded (M1), EXPORT_PLATFORMS movido de types para registry (M2), barrel file index.ts criado (M3). 185 test files, 3315 testes passando.

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-02-06
**Outcome:** Approve (após fixes)

**Issues encontrados:** 2 HIGH, 3 MEDIUM, 3 LOW
**Issues corrigidos:** 2 HIGH, 3 MEDIUM (5 total)
**Issues pendentes:** 3 LOW (documentados)

**HIGH fixes:**
- H1: Removido `previewLead` de `FullGenerationParams` — eliminava footgun onde template podia ser sobrescrito sem preservação. Wizard agora SEMPRE gera templates. Preview resolution feita on-demand.
- H2: Adicionado `typeof value !== 'string'` check em `resolve-variables.ts` — cast inseguro de `Record<string, unknown>` podia produzir resultados inesperados.

**MEDIUM fixes:**
- M1: Adicionado `placeholderLabel` ao tipo `PersonalizationVariable` e ao registry — eliminado mapa hardcoded `VARIABLE_PLACEHOLDER_LABELS` no PreviewEmailStep. DRY.
- M2: Movido `EXPORT_PLATFORMS` de `src/types/export.ts` para `src/lib/export/variable-registry.ts` — tipos files devem conter apenas tipos.
- M3: Criado `src/lib/export/index.ts` barrel file — padrão consistente com outros módulos do projeto.

**LOW pendentes (não corrigidos):**
- L1: `getVariables()` chamada sem cache em cada resolução — otimizar em batch export
- L2: Screenshots `story-7.1-*.png` no git status — adicionar ao .gitignore
- L3: Teste faltando para CampaignPreviewPanel previewLead prop forwarding

### File List

**Novos:**
- `src/types/export.ts` — Tipos do sistema de variáveis e plataformas
- `src/lib/export/variable-registry.ts` — Registry centralizado de variáveis + EXPORT_PLATFORMS
- `src/lib/export/resolve-variables.ts` — Motor de substituição de variáveis
- `src/lib/export/index.ts` — Barrel file (Code Review M3)
- `__tests__/unit/types/export.test.ts` — Testes de tipos
- `__tests__/unit/lib/export/variable-registry.test.ts` — Testes do registry
- `__tests__/unit/lib/export/resolve-variables.test.ts` — Testes do motor
- `__tests__/unit/lib/ai/prompts/email-personalization-variables.test.ts` — Testes de prompts

**Modificados:**
- `src/types/index.ts` — Adicionado re-export de export.ts
- `src/lib/ai/prompts/defaults.ts` — Adicionados blocos condicionais para variáveis em 4 prompts
- `src/hooks/use-ai-full-campaign-generation.ts` — Sempre MODO TEMPLATE (previewLead removido - CR H1)
- `src/components/builder/PreviewEmailStep.tsx` — Renderização genérica via registry placeholderLabel (CR M1)
- `src/components/builder/CampaignPreviewPanel.tsx` — Passa previewLead ao PreviewEmailStep
- `__tests__/unit/hooks/use-ai-full-campaign-generation.test.tsx` — 2 testes template mode
- `__tests__/unit/components/builder/PreviewEmailStep.test.tsx` — 28 testes (14 novos)
