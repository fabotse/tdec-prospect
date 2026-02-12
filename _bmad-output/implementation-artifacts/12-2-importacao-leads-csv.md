# Story 12.2: Importação de Leads via CSV

Status: done

## Story

As a usuário do sistema,
I want importar uma lista de leads a partir de um arquivo CSV,
so that eu consiga trazer meus contatos existentes para o sistema, organizá-los em segmentos e enriquecê-los via Apollo sem precisar buscar um a um.

## Acceptance Criteria

1. **AC #1 - Botão de importação acessível**: Deve existir um botão "Importar CSV" na página "Meus Leads" (`MyLeadsPageContent`) que abre o dialog de importação.

2. **AC #2 - Upload de arquivo CSV**: O dialog deve aceitar upload de arquivo CSV via clique ou drag-and-drop. Limite de 5MB. Formatos suportados: CSV (vírgula), TSV (tab), ponto-e-vírgula. Reutilizar o padrão de upload do `ImportCampaignResultsDialog`.

3. **AC #3 - Colar dados**: Alternativa ao upload — o usuário pode colar dados tabulares (CSV/TSV) diretamente num textarea. Mesmos formatos suportados.

4. **AC #4 - Mapeamento de colunas**: Após o parsing, exibir UI de mapeamento com auto-detecção para os campos: **Nome** (obrigatório), **Sobrenome**, **Email**, **Empresa**, **Cargo**, **LinkedIn URL**, **Telefone**. O usuário pode ajustar manualmente. Preview das primeiras 5 linhas com colunas mapeadas destacadas.

5. **AC #5 - Seleção de segmento (opcional)**: Antes de processar, o usuário pode opcionalmente selecionar um segmento existente ou criar um novo para associar os leads importados. Se nenhum segmento for selecionado, os leads são importados sem associação.

6. **AC #6 - Processamento e criação de leads**: Os leads são criados no banco via upsert. Duplicatas são detectadas por **email** (case-insensitive). Leads existentes (mesmo email) são ignorados (não atualizados). Leads sem email são criados normalmente (sem deduplicação).

7. **AC #7 - Resumo da importação**: Após processamento, exibir resumo com: total processado, importados com sucesso, duplicatas ignoradas, erros (com detalhes). Botão "Fechar" para encerrar.

8. **AC #8 - Download de modelo CSV**: Link "Baixar modelo CSV" no dialog que gera um arquivo CSV de exemplo com os cabeçalhos esperados.

9. **AC #9 - Testes unitários**: Cobertura completa: parsing, mapeamento de colunas, dialog multi-step, API de importação, hook de importação, detecção de duplicatas.

## Tasks / Subtasks

- [x] Task 1 — Estender csv-parser para campos de lead (AC: #4)
  - [x] 1.1 Adicionar `detectLeadColumnMappings()` em `csv-parser.ts` com auto-detecção para: nome/first_name, sobrenome/last_name, email, empresa/company, cargo/title, linkedin/linkedin_url, telefone/phone
  - [x] 1.2 Definir interface `LeadColumnMappingResult` com os índices de cada campo
  - [x] 1.3 Testes unitários para auto-detecção de colunas com variações de nomes (português e inglês)

- [x] Task 2 — Criar tipos para importação de leads (AC: #6, #7)
  - [x] 2.1 Criar interface `ImportLeadRow` com campos mapeados
  - [x] 2.2 Criar interface `ImportLeadsResponse` com contagens (imported, existing, errors)
  - [x] 2.3 Definir schema Zod de validação para `ImportLeadRow`

- [x] Task 3 — Criar API route `/api/leads/import-csv` (AC: #6)
  - [x] 3.1 POST route com validação Zod do body (array de leads)
  - [x] 3.2 Detecção de duplicatas por email (case-insensitive): buscar emails existentes no banco, filtrar leads novos
  - [x] 3.3 Insert dos leads novos usando padrão de `getCurrentUserProfile()` para tenant isolation
  - [x] 3.4 Se `segmentId` fornecido: associar leads ao segmento via insert em `lead_segments`
  - [x] 3.5 Retornar resumo: `{ imported, existing, errors, leads }`
  - [x] 3.6 Testes unitários da API route

- [x] Task 4 — Criar hook `useImportLeadsCsv` (AC: #6, #7)
  - [x] 4.1 TanStack Query mutation chamando `/api/leads/import-csv`
  - [x] 4.2 Invalidar queries `myLeads` e `segments` no sucesso
  - [x] 4.3 Toast de sucesso com singular/plural correto
  - [x] 4.4 Testes unitários do hook

- [x] Task 5 — Criar `ImportLeadsDialog` componente (AC: #1, #2, #3, #4, #5, #7, #8)
  - [x] 5.1 Criar `src/components/leads/ImportLeadsDialog.tsx` seguindo padrão do `ImportCampaignResultsDialog`
  - [x] 5.2 Step "input": Tabs Upload CSV / Colar Dados (reutilizar padrão existente)
  - [x] 5.3 Step "mapping": UI de mapeamento com 7 campos (auto-detecção + override manual). Preview de 5 linhas. Campo "Nome" obrigatório com indicador visual
  - [x] 5.4 Step "segment" (novo): Seleção opcional de segmento — dropdown com segmentos existentes + opção "Criar novo segmento" + opção "Sem segmento" (padrão). Reutilizar `useSegments` e `useCreateSegment`
  - [x] 5.5 Step "processing": Spinner com contagem de leads sendo processados
  - [x] 5.6 Step "summary": Resumo com contagens (importados, duplicatas, erros)
  - [x] 5.7 Download de modelo CSV com cabeçalhos de exemplo
  - [x] 5.8 Reset de estado ao fechar dialog
  - [x] 5.9 Testes unitários do componente (todos os steps)

- [x] Task 6 — Integrar na página Meus Leads (AC: #1)
  - [x] 6.1 Adicionar botão "Importar CSV" no `MyLeadsPageContent` (ao lado do botão existente "Importar Resultados")
  - [x] 6.2 Gerenciar estado do dialog (open/close)
  - [x] 6.3 Teste de integração: botão abre dialog

## Dev Notes

### Contexto Técnico Crítico

**Padrão de referência**: O `ImportCampaignResultsDialog` ([ImportCampaignResultsDialog.tsx](src/components/leads/ImportCampaignResultsDialog.tsx)) é o template a seguir. Ele já implementa:
- Dialog multi-step (input → mapping → processing → summary)
- Upload com drag-and-drop + paste
- CSV parsing com `parseCSVData()` de [csv-parser.ts](src/lib/utils/csv-parser.ts)
- Auto-detecção de colunas
- Preview de dados em tabela
- Download de modelo CSV
- Feedback de processamento

**Diferenças chave desta story:**
- Mais campos a mapear (7 vs 2)
- Step adicional de seleção de segmento
- Criação de leads (vs atualização de status)
- Deduplicação por email (vs match por email para update)

### Infraestrutura existente a reutilizar

| O que | Arquivo | Como usar |
|---|---|---|
| CSV parser | [csv-parser.ts](src/lib/utils/csv-parser.ts) | `parseCSVData()`, `parseCSVLine()`, `detectDelimiter()` |
| Validação de email | [csv-parser.ts](src/lib/utils/csv-parser.ts) | `isValidEmail()` |
| Constantes de tamanho | [campaign-import.ts](src/types/campaign-import.ts) | `MAX_FILE_SIZE_BYTES`, `MAX_FILE_SIZE_MB` |
| Hooks de segmento | [use-segments.ts](src/hooks/use-segments.ts) | `useSegments()`, `useCreateSegment()` |
| Dialog components | shadcn/ui | `Dialog`, `Tabs`, `Select`, `ScrollArea`, etc. |
| Padrão de import API | [leads/import/route.ts](src/app/api/leads/import/route.ts) | Referência para upsert pattern |
| Tenant isolation | `getCurrentUserProfile()` | Padrão RLS do projeto |

### O que NÃO fazer

- NÃO adicionar suporte a Excel (.xlsx) — story separada (12-4)
- NÃO modificar o `ImportCampaignResultsDialog` existente — criar novo componente
- NÃO modificar `csv-parser.ts` para breaking changes — apenas adicionar novas funções
- NÃO implementar enriquecimento Apollo nesta story — story separada (12-3)
- NÃO implementar atualização de leads existentes (merge) — apenas ignorar duplicatas
- NÃO adicionar paginação ao processamento — batch único

### Auto-detecção de colunas — Padrões esperados

```typescript
// Padrões para detectLeadColumnMappings()
const namePatterns = ["nome", "name", "first_name", "first name", "primeiro_nome", "primeiro nome"];
const lastNamePatterns = ["sobrenome", "last_name", "last name", "último nome", "surname"];
const emailPatterns = ["email", "e-mail", "email_address", "emailaddress"];
const companyPatterns = ["empresa", "company", "company_name", "organização", "organization"];
const titlePatterns = ["cargo", "title", "job_title", "job title", "posição", "position", "role"];
const linkedinPatterns = ["linkedin", "linkedin_url", "linkedin url", "perfil linkedin"];
const phonePatterns = ["telefone", "phone", "phone_number", "celular", "mobile", "whatsapp"];
```

### API Route — Schema de validação

```typescript
// Zod schema para o body do POST /api/leads/import-csv
const importLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().default(""),
  email: z.string().email().optional().nullable(),
  companyName: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  phone: z.string().optional().nullable(),
});

const importLeadsCsvBody = z.object({
  leads: z.array(importLeadSchema).min(1).max(1000),
  segmentId: z.string().uuid().optional().nullable(),
});
```

### Deduplicação por email — Lógica

```typescript
// 1. Extrair emails do CSV (não-nulos, válidos)
const csvEmails = leads
  .map(l => l.email?.toLowerCase().trim())
  .filter(Boolean);

// 2. Buscar emails existentes no banco
const { data: existingLeads } = await supabase
  .from("leads")
  .select("id, email")
  .eq("tenant_id", tenantId)
  .in("email", csvEmails);

// 3. Criar Set de emails existentes
const existingEmails = new Set(existingLeads?.map(l => l.email?.toLowerCase()) ?? []);

// 4. Filtrar leads novos (sem email duplicado OU sem email)
const newLeads = leads.filter(l =>
  !l.email || !existingEmails.has(l.email.toLowerCase().trim())
);
```

### Download de modelo CSV

```typescript
const template = `nome,sobrenome,email,empresa,cargo,linkedin,telefone
João,Silva,joao@empresa.com,Empresa ABC,Diretor de TI,https://linkedin.com/in/joaosilva,11999887766
Maria,Santos,maria@empresa.com,Tech Corp,CTO,,
Pedro,Oliveira,,,Gerente Comercial,,11988776655`;
```

### Modelo CSV de exemplo para download

O modelo deve demonstrar:
- Todos os cabeçalhos esperados
- Campos opcionais vazios (é válido)
- Leads sem email (válido — sem deduplicação)
- Leads sem telefone/LinkedIn (válido)

### Fluxo completo (5 steps)

```
input → mapping → segment → processing → summary
  │         │         │          │           │
  ├ Upload  ├ Auto-   ├ Seleção  ├ POST API  ├ Contagens
  │ CSV     │ detect  │ opcional │ criar     │ importados
  ├ Colar   ├ Manual  ├ Criar    │ leads     │ duplicatas
  │ dados   │ adjust  │ novo     ├ Associar  │ erros
  │         ├ Preview ├ Nenhum   │ segmento  │
  │         │ 5 rows  │ (padrão) │           │
```

### Project Structure Notes

- Componente novo: `src/components/leads/ImportLeadsDialog.tsx`
- Hook novo: `src/hooks/use-import-leads-csv.ts`
- API nova: `src/app/api/leads/import-csv/route.ts`
- Extensão: `src/lib/utils/csv-parser.ts` (novas funções, sem breaking changes)
- Extensão: `src/types/` (novos tipos para import CSV)
- Integração: `src/components/leads/MyLeadsPageContent.tsx` (novo botão)

### Testes a criar

- `__tests__/unit/lib/utils/csv-parser.test.ts` — Novos testes para `detectLeadColumnMappings()`
- `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` — Dialog completo
- `__tests__/unit/hooks/use-import-leads-csv.test.tsx` — Hook mutation
- `__tests__/unit/app/api/leads/import-csv/route.test.ts` — API route

### References

- [Source: src/components/leads/ImportCampaignResultsDialog.tsx] — Template de referência (Story 4.7)
- [Source: src/lib/utils/csv-parser.ts] — Parser CSV existente
- [Source: src/app/api/leads/import/route.ts] — Padrão de upsert de leads (Story 4.2.1)
- [Source: src/app/api/segments/[segmentId]/leads/route.ts] — Associação lead-segmento (Story 4.1)
- [Source: src/hooks/use-import-leads.ts] — Hook de importação existente (referência)
- [Source: src/hooks/use-segments.ts] — Hooks de segmento
- [Source: src/components/leads/MyLeadsPageContent.tsx] — Ponto de integração do botão
- [Source: src/types/campaign-import.ts] — Constantes MAX_FILE_SIZE
- [Source: src/types/lead.ts] — Interface Lead
- [Source: src/types/segment.ts] — Interface Segment

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- ImportLeadsDialog test v1: 19/24 failures — `document.createElement` mock corrupted DOM; Radix UI Tabs don't switch in happy-dom
- Fix: Mocked `@/components/ui/tabs` entirely to render all content simultaneously, mocked `@/lib/utils/csv-parser` directly
- MyLeadsPageContent test: needed `useCreateSegment` and `useImportLeadsCsv` mocks for ImportLeadsDialog rendered within

### Completion Notes List
- All 6 tasks completed with full test coverage
- CSV parser extended non-destructively (new functions only)
- Email deduplication: case-insensitive, leads without email always imported
- Segment association is best-effort: import succeeds even if association fails
- Multi-step dialog: input → mapping → segment → processing → summary
- 60 new tests across 4 test files (13 csv-parser + 13 API route + 6 hook + 27 dialog + 1 integration)

### Code Review (AI) — 2026-02-12

**Reviewer:** Amelia (Dev Agent — Claude Opus 4.6)
**Issues Found:** 2 HIGH, 3 MEDIUM, 3 LOW
**Issues Fixed:** 2 HIGH, 3 MEDIUM (all auto-fixed)
**Tests after fixes:** 109 passing (+5 new tests added by review)

#### Fixes Applied

1. **[H1] AC #4: Preview 3→5 linhas** — `ImportLeadsDialog.tsx`: `slice(0,3)` → `slice(0,5)`, `Math.min(3,...)` → `Math.min(5,...)`
2. **[H2] `detectLeadColumnMappings` false positive** — `csv-parser.ts`: refatorado para two-pass strategy (exact match first, then substring match with used-column tracking). Previne "sobrenome" matching "nome" pattern e "company_name" matching "name". +4 novos testes de edge case.
3. **[M1] `request.json()` sem try/catch** — `route.ts`: wrapped em try/catch com resposta 400 para JSON malformado. +1 novo teste.
4. **[M2] `existingEmails` Set com undefined** — `route.ts`: adicionado `.filter(Boolean)` ao map de emails existentes.
5. **[M3] `ALLOWED_MIME_TYPES` dentro do componente** — `ImportLeadsDialog.tsx`: movido para constante no nível do módulo.

#### LOW issues (não corrigidos — documentados)

- **[L1]** Zod `linkedinUrl` usa `z.string().url()` — rejeita URLs parciais sem protocolo
- **[L2]** Dev Agent Record contava 28 dialog tests, real é 27 (corrigido acima)
- **[L3]** `ImportLeadsResponse.leads` tipado como `unknown[]` ao invés de `string[]`

### File List

**Created:**
- `src/types/lead-import.ts` — ImportLeadRow, ImportLeadsResponse, Zod schemas
- `src/app/api/leads/import-csv/route.ts` — POST API route with dedup and segment association
- `src/hooks/use-import-leads-csv.ts` — TanStack Query mutation hook
- `src/components/leads/ImportLeadsDialog.tsx` — Multi-step import dialog component
- `__tests__/unit/app/api/leads/import-csv/route.test.ts` — 14 API route tests
- `__tests__/unit/hooks/use-import-leads-csv.test.ts` — 6 hook tests
- `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` — 27 dialog tests

**Modified:**
- `src/lib/utils/csv-parser.ts` — Added `LeadColumnMappingResult` interface and `detectLeadColumnMappings()` function (two-pass strategy)
- `__tests__/unit/lib/utils/csv-parser.test.ts` — Added 17 tests for `detectLeadColumnMappings` (13 original + 4 edge case from review)
- `src/components/leads/MyLeadsPageContent.tsx` — Added "Importar CSV" button and ImportLeadsDialog integration
- `__tests__/unit/components/leads/MyLeadsPageContent.test.tsx` — Added integration test + mocks for new dependencies
