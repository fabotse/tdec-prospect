# Story 15.4: Apollo Bridge -- Busca de Contatos nas Empresas

Status: done

## Story

As a Usuario,
I want buscar contatos com cargos relevantes nas empresas selecionadas via Apollo,
so that eu consiga encontrar as pessoas certas para prospectar nessas empresas.

## Acceptance Criteria

1. **Given** o Usuario selecionou uma ou mais empresas na tabela de resultados **When** clica em "Buscar Contatos" **Then** o sistema exibe opcao para filtrar por cargos-alvo (ex: "CTO", "CISO", "Head of IT")

2. **Given** o Usuario definiu os cargos-alvo **When** confirma a busca de contatos **Then** o sistema busca contatos via Apollo API usando o dominio das empresas selecionadas e os filtros de cargo **And** exibe loading state durante a busca

3. **Given** a busca de contatos retornou resultados **When** o Usuario visualiza a lista de contatos **Then** exibe: nome, cargo, email (badge disponibilidade), empresa, telefone (badge disponibilidade) **And** o visual segue padrao existente de exibicao de leads (Nota: LinkedIn URL indisponivel via api_search -- substituido por indicador de telefone conforme Dev Notes)

4. **Given** a busca de contatos em uma empresa nao retorna resultados **When** o Usuario visualiza os resultados **Then** a empresa e exibida com indicacao "Nenhum contato encontrado com os cargos selecionados"

5. **Given** a API do Apollo falha **When** o sistema detecta o erro **Then** exibe mensagem de erro em portugues **And** permite retry manual

## Tasks / Subtasks

- [x] Task 1: Criar hook `useContactSearch` (AC: #2, #5)
  - [x] 1.1 Criar `src/hooks/use-contact-search.ts` usando `useMutation` (padrao `useCompanySearch`)
  - [x] 1.2 Chamar `POST /api/integrations/apollo` com `{ domains: string[], titles: string[] }`
  - [x] 1.3 Retornar `{ search, data, isLoading, error, reset }`
  - [x] 1.4 Testes unitarios do hook

- [x] Task 2: Criar componente `ContactSearchDialog` (AC: #1)
  - [x] 2.1 Criar `src/components/technographic/ContactSearchDialog.tsx`
  - [x] 2.2 Dialog (shadcn/ui) com campo de input para cargos-alvo (tags/chips ou textarea separado por virgula)
  - [x] 2.3 Props: `selectedCompanies: TheirStackCompany[]`, `onSearch: (titles: string[]) => void`, `isLoading: boolean`
  - [x] 2.4 Botao "Buscar Contatos" como trigger (desabilitado se nenhuma empresa selecionada)
  - [x] 2.5 Sugestoes de cargos comuns (ex: "CEO", "CTO", "CISO", "Head of IT", "VP Engineering")
  - [x] 2.6 Testes unitarios

- [x] Task 3: Criar componente `ContactResultsTable` (AC: #3, #4)
  - [x] 3.1 Criar `src/components/technographic/ContactResultsTable.tsx`
  - [x] 3.2 Tabela shadcn/ui com colunas: Nome, Cargo, Email (disponibilidade), Empresa, Telefone (disponibilidade)
  - [x] 3.3 Empty state: "Nenhum contato encontrado com os cargos selecionados"
  - [x] 3.4 Loading skeleton (padrao existente)
  - [x] 3.5 Testes unitarios

- [x] Task 4: Integrar no TechnographicPageContent (AC: #1-#5)
  - [x] 4.1 Adicionar botao "Buscar Contatos" que aparece quando `selectedDomains.length > 0`
  - [x] 4.2 Mapear `selectedDomains` para `TheirStackCompany[]` completos via `data.companies`
  - [x] 4.3 Adicionar estado e handler para busca de contatos (`useContactSearch`)
  - [x] 4.4 Renderizar `ContactSearchDialog` + `ContactResultsTable` abaixo da tabela de empresas
  - [x] 4.5 Exibir erro Apollo em portugues com botao de retry (AC: #5)
  - [x] 4.6 Testes de integracao

- [x] Task 5: Testes completos (AC: #1-#5)
  - [x] 5.1 Testes ContactSearchDialog: abertura, input de cargos, submit, disabled states
  - [x] 5.2 Testes ContactResultsTable: renderizacao de contatos, empty state, loading, disponibilidade email
  - [x] 5.3 Testes TechnographicPageContent: fluxo completo busca contatos, erro + retry, limpar ao nova busca
  - [x] 5.4 Garantir todos os testes existentes continuam passando

## Dev Notes

### CRITICO: Apollo api_search retorna dados LIMITADOS

O endpoint `POST /api/integrations/apollo` usa Apollo `/v1/mixed_people/api_search` que retorna dados de prospecao, NAO dados completos:

**Campos DISPONIVEIS (api_search):**
- `first_name` -- nome completo
- `last_name` -- OFUSCADO (ex: "Sil***a")
- `title` -- cargo (pode ser null)
- `has_email` -- boolean indicando se email existe
- `has_direct_phone` -- string "Yes" ou "Maybe: please request..."
- `organization.name` -- nome da empresa

**Campos NAO DISPONIVEIS (requerem People Enrichment):**
- `email` -- retorna `null`
- `linkedin_url` -- retorna `null`
- `phone` -- retorna `null`
- `last_name` completo

**Impacto no AC #3:** A coluna "Email" deve mostrar indicador de disponibilidade (badge "Disponivel"/"Indisponivel") baseado em `hasEmail`, NAO o email real. A coluna "LinkedIn URL" nao sera exibida (indisponivel neste endpoint). Mostrar colunas: Nome, Cargo, Email (badge), Empresa, Telefone (badge).

**Nota:** O enriquecimento completo sera abordado na Story 15.5 (Criacao de Leads), onde os contatos selecionados serao criados como leads e podem ser enriquecidos via endpoints existentes.

### API Route JA EXISTE -- NAO criar nova

A rota `POST /api/integrations/apollo` (`src/app/api/integrations/apollo/route.ts`) JA faz exatamente o que precisamos:
- Aceita `ApolloSearchFilters` com `domains: string[]` e `titles: string[]`
- Autentica usuario, busca tenant_id
- Busca via `ApolloService.searchPeople(filters)`
- Retorna `{ data: Lead[], meta: { total, page, limit, totalPages } }`
- Trata erros com mensagens em portugues

**NAO CRIAR nova rota API. Reusar a existente.**

### ApolloService JA EXISTE -- NAO recriar

`src/lib/services/apollo.ts` -- `ApolloService` extends `ExternalService`:
- `searchPeople(filters: ApolloSearchFilters)` -- busca via `/v1/mixed_people/api_search`
- `handleError()` -- traduz erros para portugues
- Timeout 10s + 1 retry automatico (via `ExternalService.request()`)
- API key obtida automaticamente do `api_configs` table via tenant_id

### TheirStackCompany tem `apollo_id` -- Ponte Natural

O tipo `TheirStackCompany` (`src/types/theirstack.ts`) inclui `apollo_id: string | null`. Isso vem direto da API theirStack e facilita a correlacao. Porem, para a busca de contatos usaremos `domain` (NAO apollo_id), pois Apollo API busca por dominio da organizacao.

### Hook `useContactSearch` -- Seguir padrao `useCompanySearch`

```ts
// src/hooks/use-contact-search.ts
// Padrao: useMutation (busca on-demand, nao automatica)
// Endpoint: POST /api/integrations/apollo
// Body: { domains: string[], titles: string[] }
// Response: { data: Lead[], meta: PaginationMeta }
```

O hook deve:
- Usar `useMutation` do TanStack Query (NAO useQuery)
- Chamar `POST /api/integrations/apollo` com fetch
- Aceitar `{ domains: string[], titles: string[] }` como parametros
- Retornar `{ search, data, isLoading, error, reset }`

### Tipo Lead JA existe -- Usar para contatos

A resposta da rota `/api/integrations/apollo` retorna `Lead[]` (tipo camelCase). Campos relevantes para exibicao:

```ts
interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;     // OFUSCADO do api_search
  title: string | null;
  companyName: string | null;
  email: string | null;        // null do api_search
  linkedinUrl: string | null;  // null do api_search
  hasEmail: boolean;           // USAR para indicador
  hasDirectPhone: string | null; // USAR para indicador
}
```

Importar tipo de `@/types/lead`.

### Componente ContactSearchDialog -- Design

**Trigger:** Botao "Buscar Contatos" que aparece quando `selectedDomains.length > 0` no TechnographicPageContent

**Dialog contem:**
1. Titulo: "Buscar Contatos nas Empresas Selecionadas"
2. Info: "X empresa(s) selecionada(s)"
3. Campo de cargos-alvo (input com tags/chips ou textarea)
4. Sugestoes rapidas: badges clicaveis com cargos comuns
5. Botao "Buscar" (disabled se nenhum cargo informado)

**Componentes shadcn/ui:** `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Button`, `Input`, `Badge`

### Componente ContactResultsTable -- Design

Tabela shadcn/ui seguindo padrao `CompanyResultsTable`:

| Nome | Cargo | Email | Empresa | Telefone |
|------|-------|-------|---------|----------|
| Joao Sil***a | CTO | Badge verde "Disponivel" | Acme Corp | Badge "Disponivel" |
| Maria Fer***s | VP Eng | Badge cinza "Indisponivel" | Beta Inc | Badge cinza "N/A" |

**Badges de disponibilidade:**
- `hasEmail === true` -> badge verde "Disponivel"
- `hasEmail === false` -> badge cinza "Indisponivel"
- `hasDirectPhone === "Yes"` -> badge verde "Disponivel"
- Outros -> badge cinza "N/A"

**Empty state:** Icone + "Nenhum contato encontrado com os cargos selecionados"

**Paginacao:** Reusar padrao anterior/proxima (Apollo API suporta paginacao via `page`/`perPage`)

### Estado no TechnographicPageContent

```tsx
// Estado existente (Story 15.3):
const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

// Novo estado (Story 15.4):
const contactSearch = useContactSearch();

// Mapear dominios selecionados para empresas completas:
const selectedCompanies = data?.companies.filter(
  (c) => selectedDomains.includes(c.domain)
) ?? [];

// Handler de busca de contatos:
const handleContactSearch = (titles: string[]) => {
  contactSearch.search({
    domains: selectedDomains,
    titles,
  });
};

// Limpar contatos quando nova busca de empresas e executada:
// Em handleSearch: contactSearch.reset();
```

### Fluxo do Usuario

1. Busca empresas por tecnologia (15.2) -> tabela aparece (15.3)
2. Seleciona empresas via checkbox -> botao "Buscar Contatos" aparece
3. Clica "Buscar Contatos" -> dialog abre com campo de cargos
4. Digita/seleciona cargos -> clica "Buscar"
5. Dialog fecha, loading state aparece
6. Tabela de contatos aparece abaixo da tabela de empresas
7. Se erro -> mensagem em portugues + botao "Tentar novamente"

### Previous Story Intelligence (Story 15.3)

**Aprendizados criticos:**
- `flex flex-col gap-*` para wrappers (NAO `space-y-*`) -- Tailwind v4
- ESLint no-console -- nunca usar console.log
- Checkbox usa `@/components/ui/checkbox` (shadcn/ui Radix)
- domain e o identificador unico de empresas (nao tem id)
- Selecao via useState local (NAO Zustand) -- escopo de pagina
- `beforeEach(() => vi.clearAllMocks())` + `afterEach(() => vi.restoreAllMocks())`
- `vi.mock("@/hooks/...")` para controlar retornos em testes
- `data-testid` em TODOS os elementos interativos/estruturais
- Validar URL com regex `/^https?:\/\//i` antes de usar como href
- allSelected/someSelected: filtrar por dominios da pagina atual via Set

**Arquivos criados em 15.3 que serao MODIFICADOS nesta story:**
- `src/components/technographic/TechnographicPageContent.tsx` -- adicionar botao, dialog, resultados contatos
- `__tests__/unit/components/technographic/TechnographicPageContent.test.tsx` -- expandir testes

**NAO MODIFICAR:**
- `src/components/technographic/CompanyResultsTable.tsx` -- ja completo
- `src/types/theirstack.ts` -- tipos ja completos
- `src/lib/services/theirstack.ts` -- service ja completo
- `src/lib/services/apollo.ts` -- service ja completo
- `src/app/api/integrations/apollo/route.ts` -- rota ja completa
- `src/types/apollo.ts` -- tipos ja completos

### Project Structure Notes

**Arquivos a CRIAR:**
- `src/hooks/use-contact-search.ts` -- hook de busca contatos (padrao useCompanySearch)
- `src/components/technographic/ContactSearchDialog.tsx` -- dialog cargos + trigger busca
- `src/components/technographic/ContactResultsTable.tsx` -- tabela de contatos
- `__tests__/unit/hooks/use-contact-search.test.ts` -- testes do hook
- `__tests__/unit/components/technographic/ContactSearchDialog.test.tsx` -- testes dialog
- `__tests__/unit/components/technographic/ContactResultsTable.test.tsx` -- testes tabela

**Arquivos a MODIFICAR:**
- `src/components/technographic/TechnographicPageContent.tsx` -- integracao completa
- `__tests__/unit/components/technographic/TechnographicPageContent.test.tsx` -- expandir testes

### Testing Standards

- Framework: Vitest + happy-dom
- Componentes: `@testing-library/react` com `render`, `screen`, `fireEvent`, `waitFor`
- Hooks: `useMutation` mock via `vi.mock("@tanstack/react-query")` ou wrapper com `QueryClientProvider`
- Mock fetch: `vi.stubGlobal("fetch", vi.fn())` ou `createMockFetch` de `__tests__/helpers/mock-fetch.ts`
- `data-testid` em TODOS os elementos interativos
- ESLint: no-console (nunca usar console.log em testes)
- Testes existentes DEVEM continuar passando

### Tailwind CSS v4 Alert

Usar `flex flex-col gap-*` para wrappers. NAO usar `space-y-*`.

### UI Language

Todo texto em portugues brasileiro. Labels, aria-labels, placeholders, mensagens de erro.

### References

- [Source: _bmad-output/planning-artifacts/epic-15-technographic-prospecting.md#Story 15.4]
- [Source: _bmad-output/implementation-artifacts/15-3-resultados-empresas-tabela-selecao.md -- Story anterior completa]
- [Source: src/app/api/integrations/apollo/route.ts -- API route existente a REUSAR]
- [Source: src/lib/services/apollo.ts -- ApolloService existente]
- [Source: src/types/apollo.ts -- tipos Apollo + transformApolloToLeadRow]
- [Source: src/types/lead.ts -- Lead/LeadRow types]
- [Source: src/hooks/use-company-search.ts -- padrao de hook useMutation a seguir]
- [Source: src/components/technographic/TechnographicPageContent.tsx -- orquestrador a expandir]
- [Source: src/components/technographic/CompanyResultsTable.tsx -- tabela existente (referencia visual)]
- [Source: src/types/theirstack.ts -- TheirStackCompany.apollo_id campo ponte]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Hook test file needed .tsx extension (JSX support) — renamed from .test.ts to .test.tsx
- Import path for mock-fetch helpers uses relative paths (../../helpers/mock-fetch), not alias paths
- isLoading test required deferred promise to capture pending state before mock resolves
- reset test needed waitFor to allow React re-render after mutation reset

### Completion Notes List

- Task 1: Created `useContactSearch` hook following `useCompanySearch` pattern. Uses `useMutation` from TanStack Query, calls `POST /api/integrations/apollo` with `{ domains, titles }`. Returns `{ search, data, isLoading, error, reset }`. 7 unit tests passing.
- Task 2: Created `ContactSearchDialog` with shadcn/ui Dialog, Input, Badge. Supports title input via Enter/comma keys, chip removal, quick suggestions (CEO, CTO, CISO, etc), disabled state. Added DialogDescription for a11y. 13 unit tests passing.
- Task 3: Created `ContactResultsTable` with shadcn/ui Table. Shows Nome, Cargo, Email (badge), Empresa, Telefone (badge). AvailabilityBadge for hasEmail, PhoneBadge for hasDirectPhone. Empty state and loading skeleton. 13 unit tests passing.
- Task 4: Integrated all components in TechnographicPageContent. Contact section appears when selectedDomains.length > 0. Error display with retry button (AC #5). Contact results cleared on new company search. 16 tests passing (9 existing + 7 new).
- Task 5: Full test coverage across 4 test files, 49 tests total. Full regression suite: 298 files, 5329 tests, 0 failures.

### File List

**Created:**
- src/hooks/use-contact-search.ts
- src/components/technographic/ContactSearchDialog.tsx
- src/components/technographic/ContactResultsTable.tsx
- __tests__/unit/hooks/use-contact-search.test.tsx
- __tests__/unit/components/technographic/ContactSearchDialog.test.tsx
- __tests__/unit/components/technographic/ContactResultsTable.test.tsx

**Modified:**
- src/components/technographic/TechnographicPageContent.tsx
- __tests__/unit/components/technographic/TechnographicPageContent.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/15-4-apollo-bridge-busca-contatos.md

### Change Log

- 2026-03-25: Story 15.4 implementada — hook useContactSearch, ContactSearchDialog, ContactResultsTable, integracao TechnographicPageContent. 49 novos testes, 5329 total sem regressoes.
- 2026-03-25: Code review fixes — 7 issues corrigidos (1 HIGH, 3 MEDIUM, 3 LOW): retry real no handleContactRetry, memoizacao com refs desestruturadas, teste integracao empty state AC#4, limpeza mock redundante, merge AvailabilityBadge/PhoneBadge em StatusBadge, slugify data-testid sugestoes, AC#3 texto atualizado. 50 testes, 5330 total, 0 regressoes.
