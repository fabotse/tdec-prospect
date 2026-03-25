# Story 15.3: Resultados de Empresas -- Tabela e Selecao

Status: done

## Story

As a Usuario,
I want visualizar os resultados da busca technografica em tabela e selecionar empresas,
so that eu consiga identificar e escolher as empresas mais relevantes para prospectar.

## Acceptance Criteria

1. **Given** a busca technografica retornou resultados **When** o Usuario visualiza a tabela de resultados **Then** exibe colunas: nome da empresa, dominio, industria, tamanho (funcionarios), score de confianca, tecnologias detectadas **And** o visual segue padrao premium existente (dark mode, estilo Airtable, shadcn/ui)

2. **Given** os resultados estao exibidos na tabela **When** o Usuario visualiza o score de confianca **Then** exibe indicador visual claro (badge colorido low=amarelo, medium=laranja, high=verde)

3. **Given** a tabela de resultados esta exibida **When** o Usuario clica no checkbox de uma empresa **Then** a empresa e marcada como selecionada **And** um contador de selecao e exibido

4. **Given** multiplas empresas estao listadas **When** o Usuario clica no checkbox do cabecalho **Then** todas as empresas visiveis sao selecionadas em lote **And** o padrao de selecao segue o comportamento existente de selecao de leads

5. **Given** a busca retorna muitos resultados **When** o Usuario navega pelos resultados **Then** o sistema suporta paginacao **And** exibe total de resultados e credits consumidos

6. **Given** a busca nao retorna resultados **When** o Usuario visualiza a pagina **Then** exibe estado vazio com mensagem orientativa (ex: "Nenhuma empresa encontrada com essa tecnologia. Tente ajustar os filtros.")

## Tasks / Subtasks

- [x] Task 1: Corrigir cores dos badges de confidence (AC: #2)
  - [x] 1.1 Alterar `confidenceConfig` em `CompanyResultsTable.tsx`: `low` = amarelo (yellow/amber), `medium` = laranja (orange), `high` = verde (green -- ja correto)
  - [x] 1.2 Atualizar testes que validam as classes CSS dos badges

- [x] Task 2: Adicionar selecao individual por checkbox (AC: #3)
  - [x] 2.1 Adicionar coluna checkbox como primeira coluna da tabela em `CompanyResultsTable.tsx`
  - [x] 2.2 Expandir props de `CompanyResultsTableProps`: `selectedDomains: string[]`, `onSelectionChange: (domains: string[]) => void`
  - [x] 2.3 Implementar checkbox por row com `checked={selectedDomains.includes(company.domain)}` e toggle via `onSelectionChange`
  - [x] 2.4 Limpar selecao quando nova busca e executada

- [x] Task 3: Adicionar selecao em lote via checkbox do cabecalho (AC: #4)
  - [x] 3.1 Adicionar Checkbox no header com estado `indeterminate` (all/some/none seguindo padrao LeadTable)
  - [x] 3.2 `checked={allSelected ? true : someSelected ? "indeterminate" : false}`
  - [x] 3.3 `onCheckedChange` -> selecionar todos os dominios visiveis ou limpar selecao

- [x] Task 4: Adicionar contador de selecao (AC: #3)
  - [x] 4.1 Exibir contador ao lado do total de resultados: "{count} empresa(s) selecionada(s)" quando count > 0
  - [x] 4.2 Botao "Limpar selecao" ao lado do contador

- [x] Task 5: Integrar estado de selecao no TechnographicPageContent (AC: #3, #4)
  - [x] 5.1 Adicionar estado local `selectedDomains: string[]` via `useState` em `TechnographicPageContent.tsx`
  - [x] 5.2 Passar `selectedDomains` e `onSelectionChange` para `CompanyResultsTable`
  - [x] 5.3 Limpar selecao ao executar nova busca (`handleSearch` reseta `selectedDomains` para `[]`)
  - [x] 5.4 Limpar selecao ao mudar de pagina

- [x] Task 6: Testes (AC: #1-#6)
  - [x] 6.1 Testes CompanyResultsTable: checkbox individual (selecionar/deselecionar empresa), checkbox header (selecionar todos/deselecionar todos, estado indeterminate), contador de selecao (exibir/ocultar, texto correto singular/plural), botao limpar selecao, cores corretas dos badges de confidence
  - [x] 6.2 Testes TechnographicPageContent: integracao de selecao (selecionar empresa atualiza estado, nova busca limpa selecao)
  - [x] 6.3 Atualizar testes existentes que agora precisam das novas props (`selectedDomains`, `onSelectionChange`)

## Dev Notes

### O que JA existe (Story 15.2 -- NAO recriar)

`CompanyResultsTable.tsx` ja tem:
- Tabela com todas as colunas (empresa, dominio, pais, industria, tamanho, techs encontradas, score)
- ConfidenceBadge com cores (PRECISA CORRECAO -- ver Task 1)
- Paginacao (anterior/proxima com total de paginas)
- Empty state (buscou sem resultados + estado inicial)
- Loading skeleton
- Info de total de resultados e credits consumidos

`TechnographicPageContent.tsx` ja tem:
- Orquestracao de autocomplete + filtros + tabela
- Hook `useCompanySearch` (mutation + page state)
- Calculo de credits usados
- Estado `hasSearched`

**Esta story EXPANDE esses componentes. NAO criar componentes novos para tabela ou pagina.**

### Correcao de Cores dos Badges (Task 1)

O epic especifica: `low=amarelo, medium=laranja, high=verde`. O codigo atual tem:
- `high`: verde (green) -- CORRETO
- `medium`: amarelo (yellow) -- ERRADO, deveria ser laranja (orange)
- `low`: cinza (gray) -- ERRADO, deveria ser amarelo (yellow/amber)

**Corrigir `confidenceConfig` em `CompanyResultsTable.tsx`:**
```ts
const confidenceConfig = {
  high: { label: "Alto", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  medium: { label: "Medio", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  low: { label: "Baixo", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};
```

### Padrao de Selecao -- Seguir LeadTable (NAO reinventar)

**Componente Checkbox:** `import { Checkbox } from "@/components/ui/checkbox"`

**Header checkbox (select-all):**
```tsx
<Checkbox
  checked={allSelected ? true : someSelected ? "indeterminate" : false}
  onCheckedChange={(checked) => handleSelectAll(checked === true)}
  aria-label="Selecionar todas as empresas"
/>
```

**Row checkbox (individual):**
```tsx
<Checkbox
  checked={selectedDomains.includes(company.domain)}
  onCheckedChange={(checked) => handleSelectRow(company.domain, checked === true)}
  aria-label={`Selecionar ${company.name}`}
/>
```

**Logica de selecao:**
```ts
const allSelected = companies.length > 0 && selectedDomains.length === companies.length;
const someSelected = selectedDomains.length > 0 && selectedDomains.length < companies.length;
```

### Identificador Unico: `domain`

`TheirStackCompany` NAO tem campo `id`. Usar `domain` como identificador unico (cada empresa tem dominio unico nos resultados). O campo `domain` e obrigatorio (nao nullable) no tipo.

### Estado de Selecao: useState Local (NAO Zustand)

O `useSelectionStore` (Zustand) e para leads e usado globalmente entre paginas. A selecao de empresas da busca technografica e:
- Escopo de pagina (nao precisa persistir entre navegacoes)
- Escopo de busca (limpa ao buscar novamente)
- Dados temporarios (empresas vem de API, nao sao entidades persistidas)

**Usar `useState<string[]>([])` em `TechnographicPageContent` e passar via props.**

### Limpar Selecao em Eventos

Selecao DEVE ser limpa quando:
1. Nova busca e executada (`handleSearch`)
2. Pagina muda (`handlePageChange`)

Isso previne estado inconsistente (empresas selecionadas de pagina anterior).

### Contador de Selecao -- Padrao UI

Exibir na barra de info acima da tabela (onde ja mostra total de resultados + credits):
```
"12 empresas encontradas (6 credits consumidos) | 3 selecionada(s) [Limpar]"
```

Usar singular/plural: "1 selecionada" / "3 selecionadas"

### Preparacao para Story 15.4

O estado `selectedDomains` sera utilizado na Story 15.4 (Apollo Bridge) para o botao "Buscar Contatos". Nesta story, NAO adicionar o botao de acao -- apenas a mecanica de selecao.

Na story 15.4, o `TechnographicPageContent` ira:
1. Mapear `selectedDomains` para objetos `TheirStackCompany[]` completos
2. Passar para componente de busca de contatos Apollo

### Previous Story Intelligence (Story 15.2)

**Aprendizados criticos:**
- typeof guards em TODOS os campos nullable da response API
- `flex flex-col gap-2` para wrappers (NAO `space-y-*`) -- Tailwind v4
- ESLint no-console -- nunca usar console.log
- Mock HTTP: `createMockFetch(routes)` de `__tests__/helpers/mock-fetch.ts`
- Hook tests: usar real timers com waitFor extendido (fake timers conflitam com React Query async)
- Componentes: `@testing-library/react` com `render`, `screen`, `fireEvent`, `waitFor`
- DEFAULT_LIMIT = 2 para ambiente demo/teste (economiza credits)
- Code review corrigiu: Score mostra TODAS as tecnologias (nao apenas primeira), Select components resetam via `key` prop, Zod refine min<=max

**Arquivos criados em 15.2 que serao MODIFICADOS nesta story:**
- `src/components/technographic/CompanyResultsTable.tsx` -- adicionar checkboxes, corrigir badges
- `src/components/technographic/TechnographicPageContent.tsx` -- adicionar estado de selecao
- `__tests__/unit/components/technographic/CompanyResultsTable.test.tsx` -- expandir testes
- `__tests__/unit/components/technographic/TechnographicPageContent.test.tsx` -- expandir testes

**NAO MODIFICAR:**
- `src/types/theirstack.ts` -- tipos ja completos
- `src/lib/services/theirstack.ts` -- service ja completo
- `src/hooks/use-company-search.ts` -- hook ja completo
- API routes -- nao relevante para esta story
- `src/stores/use-selection-store.ts` -- store de leads, NAO usar para empresas

### Git Intelligence

Ultimo commit relevante: `426e5ce feat(story-15.1): integracao theirStack config, teste conexao e credits + code review fixes`
Story 15.2 esta em `done` mas aparece nos untracked files do git (ainda nao commitada separadamente, faz parte das mudancas locais no branch `epic/15-technographic-prospecting`).

### Project Structure Notes

**Arquivos a MODIFICAR:**
- `src/components/technographic/CompanyResultsTable.tsx` -- checkboxes + correcao badges
- `src/components/technographic/TechnographicPageContent.tsx` -- estado de selecao
- `__tests__/unit/components/technographic/CompanyResultsTable.test.tsx` -- testes selecao + badges
- `__tests__/unit/components/technographic/TechnographicPageContent.test.tsx` -- testes integracao selecao

**NAO CRIAR arquivos novos.** Toda a funcionalidade cabe nos componentes existentes.

### Testing Standards

- Framework: Vitest + happy-dom
- Componentes: `@testing-library/react` com `render`, `screen`, `fireEvent`, `waitFor`
- Checkbox: testar `checked` attribute, `onCheckedChange` callback, aria-labels
- Indeterminate: shadcn/ui Checkbox aceita `checked="indeterminate"` (string, nao boolean)
- Testes existentes precisam ser atualizados para incluir as novas props obrigatorias (`selectedDomains`, `onSelectionChange`)
- ESLint: no-console

### Tailwind CSS v4 Alert

Usar `flex flex-col gap-*` para wrappers. NAO usar `space-y-*`.

### UI Language

Todo texto em portugues brasileiro. Labels, aria-labels, contadores, mensagens.

### References

- [Source: _bmad-output/planning-artifacts/epic-15-technographic-prospecting.md#Story 15.3]
- [Source: _bmad-output/implementation-artifacts/15-2-busca-technografica-autocomplete-filtros.md -- Story anterior completa]
- [Source: src/components/technographic/CompanyResultsTable.tsx -- componente a expandir]
- [Source: src/components/technographic/TechnographicPageContent.tsx -- orquestrador a expandir]
- [Source: src/components/leads/LeadTable.tsx -- padrao de selecao (checkbox header + row)]
- [Source: src/stores/use-selection-store.ts -- referencia de padrao, NAO usar diretamente]
- [Source: src/components/leads/LeadSelectionBar.tsx -- referencia de padrao UI contador]
- [Source: src/types/theirstack.ts -- TheirStackCompany type (domain como unique key)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Corrigido `confidenceConfig` — medium de yellow para orange, low de gray para yellow. Testes atualizados para validar classes CSS.
- Tasks 2-4: Adicionado Checkbox (shadcn/ui) como primeira coluna da tabela. Header checkbox com estado indeterminate (all/some/none). Row checkbox com toggle via `onSelectionChange`. Contador de selecao com singular/plural e botao "Limpar". Props `selectedDomains` e `onSelectionChange` adicionadas ao interface.
- Task 5: Estado `selectedDomains` via `useState<string[]>([])` em `TechnographicPageContent`. Passado via props para `CompanyResultsTable`. Selecao limpa ao executar nova busca e ao mudar de pagina.
- Task 6: 31 testes em CompanyResultsTable (18 novos para selecao + badges). 8 testes em TechnographicPageContent (3 novos para integracao de selecao). Todos os 295 test files passando (5287 testes, 0 falhas).

### Change Log

- 2026-03-24: Story 15.3 implementada — correcao badges confidence, selecao individual/lote, contador, integracao estado
- 2026-03-25: Code review fixes — contador com "empresa(s)", logica allSelected robusta, validacao URL, testes fortalecidos (+2 testes)

### File List

- `src/components/technographic/CompanyResultsTable.tsx` — correcao badges + checkbox column + header checkbox + contador selecao + validacao URL + logica selecao robusta
- `src/components/technographic/TechnographicPageContent.tsx` — estado selectedDomains + limpar ao buscar/paginar
- `__tests__/unit/components/technographic/CompanyResultsTable.test.tsx` — 32 testes (expandido com selecao + badges + URL validation + empty state text)
- `__tests__/unit/components/technographic/TechnographicPageContent.test.tsx` — 9 testes (expandido com integracao selecao + page change limpa selecao)

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) | **Data:** 2026-03-25 | **Resultado:** APPROVED com fixes aplicados

**Issues encontrados e corrigidos (7):**

| # | Severidade | Issue | Fix |
|---|-----------|-------|-----|
| H1 | HIGH | Contador dizia "X selecionada(s)" sem "empresa(s)" — divergia da Task 4.1 | Texto corrigido para "X empresa(s) selecionada(s)" |
| H2 | HIGH | Sem teste para page change limpar selecao (Task 5.4) | Novo teste adicionado em TechnographicPageContent |
| M1 | MEDIUM | allSelected/someSelected comparava apenas length, nao membership | Filtro por dominio da pagina atual via Set |
| M2 | MEDIUM | Headers dos arquivos diziam "Story: 15.2" | Atualizado para "Story: 15.3" |
| M3 | MEDIUM | URL externo sem validacao de protocolo (risco XSS) | Adicionado regex `/^https?:\/\//i` + teste |
| L1 | LOW | Teste empty state nao verificava texto orientativo | Adicionadas assercoes de texto |
| L2 | LOW | TableRow key composta desnecessaria | Simplificado para `key={company.domain}` |

**Suite completa:** 295 test files, 5289 testes passando, 0 falhas.
