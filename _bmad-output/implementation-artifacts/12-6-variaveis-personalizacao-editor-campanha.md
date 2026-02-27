# Story 12.6: Variáveis de Personalização no Editor de Campanha

Status: review

## Story

As a criador de campanhas,
I want visualizar as variáveis de personalização disponíveis no editor de email e ter a certeza de que {{first_name}} usa apenas o primeiro nome,
so that posso escrever emails personalizados com confiança e sem erros.

## Acceptance Criteria

1. **Referência de variáveis visível no editor**: Abaixo (ou próximo) do textarea de corpo do email no `EmailBlock`, exibir as variáveis disponíveis com formato de template e label em português
2. **Click para inserir**: Ao clicar em uma variável na referência, ela é inserida na posição do cursor no textarea (subject ou body, dependendo de qual está ativo)
3. **Todas as 4 variáveis exibidas**: `{{first_name}}` (Nome), `{{company_name}}` (Empresa), `{{title}}` (Cargo), `{{ice_breaker}}` (Quebra-gelo)
4. **FirstName extrai apenas o primeiro nome**: Na resolução de variáveis (`resolveEmailVariables`), `{{first_name}}` deve usar apenas a primeira palavra do campo `firstName` do lead (ex: "João Silva" → "João")
5. **Importação CSV com split de nome**: Quando CSV tem coluna "Nome" com nome completo e NÃO tem coluna separada de sobrenome, fazer split automático: primeira palavra → `firstName`, restante → `lastName`
6. **Testes unitários**: Cobertura para: (a) componente de referência de variáveis, (b) lógica de extração do primeiro nome, (c) split de nome no CSV import
7. **Sem regressão no preview**: A resolução de variáveis no `PreviewEmailStep` e no export continua funcionando corretamente com a nova lógica

## Tasks / Subtasks

- [x] Task 1: Componente de referência de variáveis no EmailBlock (AC: #1, #2, #3)
  - [x] 1.1 Criar componente `VariableReference` que consome `getVariables()` do registry
  - [x] 1.2 Renderizar chips/badges clicáveis com label PT-BR e template format
  - [x] 1.3 Integrar no `EmailBlock.tsx` abaixo do textarea de body
  - [x] 1.4 Implementar inserção no cursor via ref do textarea (`selectionStart`/`selectionEnd`)
  - [x] 1.5 Garantir que inserção dispara o `handleBodyChange` para sync com store (debounced)
  - [x] 1.6 Testes unitários do componente e da interação de inserção

- [x] Task 2: Extração do primeiro nome na resolução de variáveis (AC: #4, #7)
  - [x] 2.1 Em `resolve-variables.ts`, ao resolver `first_name`, aplicar `.split(' ')[0]` no valor do lead
  - [x] 2.2 Manter graceful degradation (se valor vazio/null, manter variável como está)
  - [x] 2.3 Testes unitários: nome completo → primeiro nome, nome simples → inalterado, vazio → mantém variável
  - [x] 2.4 Verificar que preview e export não quebram com a mudança

- [x] Task 3: Split automático de nome na importação CSV (AC: #5)
  - [x] 3.1 Em `csv-parser.ts` ou na lógica de mapeamento, detectar quando coluna "Nome" está mapeada mas "Sobrenome" não
  - [x] 3.2 Nesse caso, aplicar split: primeira palavra → firstName, restante → lastName
  - [x] 3.3 Se "Sobrenome" já está mapeado, NÃO fazer split (respeitar mapeamento do usuário)
  - [x] 3.4 Testes unitários: nome completo sem sobrenome → split, nome completo com sobrenome → respeitar, nome simples → inalterado

## Dev Notes

### Arquitetura de Variáveis Existente

O sistema de variáveis de personalização já está bem estruturado:

- **Registry**: `src/lib/export/variable-registry.ts` — 4 variáveis com `name`, `label`, `leadField`, `template`, `placeholderLabel`
- **Resolução**: `src/lib/export/resolve-variables.ts` — `resolveEmailVariables()` usa regex `/\{\{(\w+)\}\}/g`
- **Normalização AI**: `src/lib/ai/sanitize-ai-output.ts` — `normalizeTemplateVariables()` mapeia PT→EN
- **Preview**: `src/components/builder/PreviewEmailStep.tsx` — `renderTextWithVariablePlaceholders()`

### Componentes-Chave a Modificar

1. **`src/components/builder/EmailBlock.tsx`** (687 linhas)
   - Textarea de body: `AutoResizeTextarea` (linha ~606-622)
   - Já usa `flex flex-col gap-2` para espaçamento (Tailwind v4 pattern)
   - Estado local `body`/`subject` com debounced sync para store
   - Inserção no cursor precisa acessar ref do textarea

2. **`src/lib/export/resolve-variables.ts`** (74 linhas)
   - Função `resolveTemplate()` — adicionar lógica de first-name extraction
   - APENAS para variável `first_name`, não para outras

3. **`src/lib/utils/csv-parser.ts`** (322 linhas)
   - Função `detectLeadColumnMappings()` — já tem two-pass strategy
   - Ou criar helper separado para split de nome

4. **Importação CSV** — O split pode ser feito no `ImportLeadsDialog.tsx` na etapa de mapeamento, ou no hook/API route

### Interface PersonalizationVariable (Já Existe)

```typescript
export interface PersonalizationVariable {
  name: string;           // "first_name"
  label: string;          // "Nome"
  leadField: string;      // "firstName"
  template: string;       // "{{first_name}}"
  placeholderLabel: string; // "Nome personalizado para cada lead"
}
```

### Funções Disponíveis no Registry

```typescript
getVariables(): PersonalizationVariable[]        // Todas as 4 variáveis
getVariable(name: string): PersonalizationVariable | undefined
```

### Padrão de Inserção no Cursor (Textarea)

```typescript
// Exemplo de inserção no cursor
const textarea = textareaRef.current;
const start = textarea.selectionStart;
const end = textarea.selectionEnd;
const text = textarea.value;
const newText = text.substring(0, start) + variable.template + text.substring(end);
handleBodyChange(newText);
// Reposicionar cursor após a variável inserida
```

### Lógica de First Name Extraction

```typescript
// Em resolve-variables.ts, dentro de resolveTemplate():
// Quando variável é "first_name", extrair primeiro nome
if (variable.name === "first_name" && typeof value === "string") {
  return value.split(" ")[0] || value;
}
```

### Lógica de Split de Nome no CSV

```typescript
// Quando nameColumn mapeado mas lastNameColumn NÃO mapeado:
if (nameColumn && !lastNameColumn) {
  const parts = rawName.trim().split(/\s+/);
  firstName = parts[0];
  lastName = parts.slice(1).join(" ");
}
```

### Padrão Visual para Chips de Variáveis

Usar `Badge` do shadcn/ui com variant `outline`:
```tsx
<Badge variant="outline" className="cursor-pointer hover:bg-accent">
  {{first_name}} — Nome
</Badge>
```

### Project Structure Notes

- Componente `VariableReference` pode ser inline no `EmailBlock.tsx` ou arquivo separado em `src/components/builder/VariableReference.tsx`
- Se separar, exportar via `src/components/builder/index.ts`
- Testes em `__tests__/unit/components/builder/` para o componente
- Testes de resolução em `__tests__/unit/lib/export/resolve-variables.test.ts` (já existente — adicionar casos)
- Testes de CSV em `__tests__/unit/lib/utils/csv-parser.test.ts` (já existente — adicionar casos)

### Padrão Tailwind v4 (CRÍTICO)

Usar `flex flex-col gap-*` em vez de `space-y-*` para wrappers de label+input/select/textarea.

### References

- [Source: src/lib/export/variable-registry.ts] — Registry completo de variáveis
- [Source: src/lib/export/resolve-variables.ts] — Motor de resolução de variáveis
- [Source: src/components/builder/EmailBlock.tsx] — Editor de email (textarea subject/body)
- [Source: src/components/builder/PreviewEmailStep.tsx] — Preview com placeholders
- [Source: src/lib/utils/csv-parser.ts] — Parser CSV com detecção de colunas
- [Source: src/lib/ai/sanitize-ai-output.ts] — Normalização de variáveis AI
- [Source: src/types/lead-import.ts] — Tipos de importação de leads
- [Source: _bmad-output/implementation-artifacts/12-5-delecao-de-leads.md] — Story anterior (padrões)

### Git Intelligence

Commits recentes seguem padrão: `feat(story-12.X): descrição + code review fixes`
Branch atual: `epic/12-melhorias-ux-produtividade`
Último commit: `ecdcc15` (story 12.5)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum debug necessário.

### Completion Notes List

- **Task 1 (AC #1, #2, #3)**: Criado componente `VariableReference` com 4 chips (Badge outline) clicáveis. Integrado no `EmailBlock.tsx` abaixo do body textarea. Implementada inserção no cursor usando refs para subject (Input) e body (AutoResizeTextarea) com tracking de campo ativo via `onFocus`. Inserção dispara `handleSubjectChange`/`handleBodyChange` (debounced sync). 12 testes unitários.
- **Task 2 (AC #4, #7)**: Em `resolveTemplate()`, variável `first_name` agora aplica `.split(" ")[0]` para extrair apenas o primeiro nome. Graceful degradation mantida (vazio/null → variável preservada). Outras variáveis (company_name, title, ice_breaker) NÃO são afetadas. 8 testes adicionados. Preview e export: 190 testes passando sem regressão.
- **Task 3 (AC #5)**: No `ImportLeadsDialog.tsx`, quando `lastNameColumn === null` e o nome contém espaço, faz split automático: primeira palavra → firstName, restante → lastName. Se `lastNameColumn` está mapeado, respeita mapeamento do usuário. 2 testes adicionados.
- **Regressão**: 253 arquivos, 4630 testes, 0 falhas.

### File List

- `src/components/builder/VariableReference.tsx` (novo) — Componente de referência de variáveis
- `src/components/builder/EmailBlock.tsx` (modificado) — Integração VariableReference + refs + inserção no cursor
- `src/components/builder/index.ts` (modificado) — Export do VariableReference
- `src/lib/export/resolve-variables.ts` (modificado) — First name extraction para {{first_name}}
- `src/components/leads/ImportLeadsDialog.tsx` (modificado) — Split automático de nome no CSV import
- `__tests__/unit/components/builder/VariableReference.test.tsx` (novo) — 12 testes
- `__tests__/unit/lib/export/resolve-variables.test.ts` (modificado) — 8 testes adicionados
- `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` (modificado) — 2 testes adicionados

### Change Log

- 2026-02-27: Story 12.6 implementada — referência de variáveis no editor, first name extraction, CSV name split. 22 novos testes.

