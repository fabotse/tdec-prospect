# Story 12.7: Carregamento Completo de Leads no Dialog de Adicionar à Campanha

Status: done

## Story

As a criador de campanhas,
I want ver todos os leads disponíveis no dialog "Adicionar Leads" (não apenas os primeiros 25),
so that posso selecionar qualquer lead da minha base para adicionar à campanha, sem limitação artificial.

## Acceptance Criteria

1. **Todos os leads carregados**: Ao abrir o dialog "Adicionar Leads", todos os leads do segmento selecionado (ou todos os leads se nenhum segmento estiver selecionado) devem estar disponíveis para seleção — não apenas os primeiros 25
2. **Contagem correta**: O contador "Leads disponíveis (N)" deve exibir o total real de leads disponíveis, não o total da página atual
3. **Selecionar todos real**: O checkbox "Selecionar todos" deve selecionar TODOS os leads do segmento/filtro, não apenas os primeiros 25 visíveis
4. **Performance adequada**: Para listas grandes (100+ leads), usar carregamento progressivo (infinite scroll ou "Carregar mais") para não travar a UI com renderização de centenas de itens de uma vez
5. **Busca funciona no conjunto completo**: O filtro de busca por nome/empresa/email deve buscar no conjunto completo de leads, não apenas nos já carregados
6. **Testes unitários**: Cobertura para: (a) carregamento de mais de 25 leads, (b) "selecionar todos" com mais de 25 leads, (c) busca no conjunto completo, (d) carregamento progressivo se implementado

## Tasks / Subtasks

- [x] Task 1: Suporte a carregamento completo no hook (AC: #1, #5)
  - [x] 1.1 Adicionar opção `fetchAll: boolean` ao `useMyLeads` ou criar hook dedicado `useAllLeads` que busca todas as páginas automaticamente
  - [x] 1.2 Implementar lógica de fetch iterativo: buscar página 1, verificar `totalPages`, buscar demais páginas em paralelo (ou sequencialmente com acumulação)
  - [x] 1.3 Retornar array consolidado de todos os leads + flag `isLoadingAll` para indicar que ainda está carregando mais páginas
  - [x] 1.4 Testes unitários do hook com mock de múltiplas páginas

- [x] Task 2: Infinite scroll no dialog (AC: #4)
  - [x] 2.1 Implementar detecção de scroll perto do final da `ScrollArea` no `AddLeadsDialog`
  - [x] 2.2 Ao atingir threshold (~80% scroll), carregar próxima página automaticamente
  - [x] 2.3 Mostrar indicador de loading (spinner) no final da lista durante carregamento
  - [x] 2.4 Alternativa: se o total for <= 100, carregar tudo de uma vez (sem infinite scroll); se > 100, usar paginação progressiva
  - [x] 2.5 Testes do comportamento de infinite scroll / carregamento progressivo

- [x] Task 3: Contagem e "Selecionar todos" corrigidos (AC: #2, #3)
  - [x] 3.1 Alterar o contador "Leads disponíveis" para usar `pagination.total` (que já vem da API com count: exact) em vez de `availableLeads.length`
  - [x] 3.2 Garantir que "Selecionar todos" seleciona TODOS os leads carregados (não apenas os da primeira página)
  - [x] 3.3 Se nem todos estiverem carregados ainda, "Selecionar todos" deve ou (a) carregar todos primeiro e depois selecionar, ou (b) indicar "X de Y selecionados" e oferecer opção de "Selecionar todos os Y leads"
  - [x] 3.4 Testes unitários para seleção total com mais de 25 leads

## Dev Notes

### Causa Raiz do Bug

O `AddLeadsDialog` (linha 59) chama `useMyLeads({ search: debouncedSearch })` que usa `DEFAULT_PER_PAGE = 25`. O dialog não implementa paginação, então simplesmente mostra os primeiros 25 leads retornados.

### Arquivos Principais

| Ação | Arquivo |
|------|---------|
| MODIFICAR | `src/components/builder/AddLeadsDialog.tsx` — implementar carregamento completo |
| MODIFICAR | `src/hooks/use-my-leads.ts` — adicionar modo `fetchAll` ou criar hook derivado |
| POSSÍVEL MODIFICAR | `src/app/api/leads/route.ts` — considerar aumentar max `per_page` para contexto de dialog (ou manter 100 e iterar) |
| MODIFICAR | `__tests__/unit/components/builder/AddLeadsDialog.test.tsx` |
| POSSÍVEL MODIFICAR | `__tests__/unit/hooks/use-my-leads.test.ts` |

### API Existente

A API `GET /api/leads` já suporta paginação com `page` e `per_page` (max 100) e retorna `meta.total` e `meta.totalPages`. Não é necessário criar nova rota — basta buscar múltiplas páginas do client.

### Abordagem Recomendada

**Opção A (Simples)**: Se a base de leads do usuário é tipicamente < 200, aumentar o `perPage` para 100 no contexto do dialog e iterar as páginas. Consolidar todos os resultados num array único.

**Opção B (Robusta)**: Usar `useInfiniteQuery` do React Query para carregamento progressivo dentro do dialog, com infinite scroll na `ScrollArea`.

A Opção B é mais escalável e segue padrões modernos de UX. Usar `useInfiniteQuery` simplifica a lógica de acumulação de páginas.

### Padrão de Infinite Scroll com ScrollArea

```typescript
// Detectar scroll perto do final
const handleScroll = (e: React.UIEvent) => {
  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
  if (scrollHeight - scrollTop - clientHeight < 100) {
    fetchNextPage();
  }
};
```

### Dados de Paginação Já Disponíveis

O hook `useMyLeads` já retorna `pagination: { total, page, limit, totalPages }`. O `total` vem do Supabase com `count: "exact"`, então é confiável para exibir a contagem real.

### References

- [Source: src/components/builder/AddLeadsDialog.tsx] — Dialog atual (limitado a 25)
- [Source: src/hooks/use-my-leads.ts] — Hook com `DEFAULT_PER_PAGE = 25`
- [Source: src/app/api/leads/route.ts] — API com paginação (max 100)
- [Source: src/hooks/use-campaign-leads.ts] — Hook de leads na campanha (sem paginação)

## Dev Agent Record

### Implementation Plan

**Abordagem escolhida**: Opção B — `useInfiniteQuery` do React Query para carregamento progressivo.

**Hook `useAllLeads`**: Criado em `use-my-leads.ts` usando `useInfiniteQuery` com `per_page=100`. Para bases <= 100 leads, tudo carrega numa única página (sem infinite scroll). Para bases > 100, expõe `fetchNextPage` para scroll progressivo e `fetchAllPages` para "selecionar todos".

**Infinite Scroll**: Implementado com `IntersectionObserver` observando um sentinel div no final da lista. O observer detecta quando o sentinel entra no viewport da ScrollArea e dispara `fetchNextPage()` automaticamente.

**"Selecionar Todos" com múltiplas páginas**: Quando o usuário clica "Selecionar todos" e nem todas as páginas foram carregadas, o componente ativa `selectAllPending` state, dispara `fetchAllPages()`, e um `useEffect` aguarda todas as páginas carregarem para então selecionar todos os leads.

**Contagem real**: O contador agora usa `total` da API (via `count: exact` do Supabase) menos o número de leads já na campanha, em vez de `availableLeads.length` limitado pela paginação.

### Completion Notes

✅ Task 1: Hook `useAllLeads` criado com `useInfiniteQuery`, `per_page=100`, acumulação de páginas, `fetchAllPages`. 9 testes unitários cobrindo: fetch com per_page=100, hasNextPage, acumulação de páginas, total correto, filtros search/segment, erros, fetchAllPages, carregamento single-page.

✅ Task 2: AddLeadsDialog refatorado para usar `useAllLeads` com IntersectionObserver para infinite scroll. Sentinel div renderizado condicionalmente quando `hasNextPage`. Spinner de loading ao buscar próxima página. Para <= 100 leads, tudo carrega de uma vez (sem sentinel).

✅ Task 3: Contador usa `total` da API (real) menos campaign leads. "Selecionar todos" dispara `fetchAllPages()` quando há mais páginas, com feedback visual "Carregando todos os leads...".

**Testes**: 64 testes nos 2 arquivos (22 hook + 42 dialog). 4654 testes totais, 0 falhas, 0 regressões.

### Debug Log

- IntersectionObserver em JSDOM/Radix Dialog: refs dentro de portals Radix não são acessíveis no timing do useEffect em JSDOM. Testes ajustados para verificar comportamento observável (sentinel no DOM, spinner, props do hook) em vez de implementação interna do IntersectionObserver.

## File List

| Ação | Arquivo |
|------|---------|
| MODIFICADO | `src/hooks/use-my-leads.ts` — Adicionado hook `useAllLeads` com `useInfiniteQuery` |
| MODIFICADO | `src/components/builder/AddLeadsDialog.tsx` — Refatorado para usar `useAllLeads`, infinite scroll, contagem real, "selecionar todos" com múltiplas páginas |
| MODIFICADO | `__tests__/unit/hooks/use-my-leads.test.tsx` — 9 novos testes para `useAllLeads` |
| MODIFICADO | `__tests__/unit/components/builder/AddLeadsDialog.test.tsx` — Atualizado mocks para `useAllLeads`, 21 novos testes para Story 12.7 (AC #1-#5) |
| MODIFICADO | `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status 12.7 atualizado para review/done |

## Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-02-27
**Outcome:** Changes Requested → Auto-fixed

### Findings (2 HIGH, 3 MEDIUM, 2 LOW)

| Sev | ID | Descrição | Fix |
|-----|----|-----------|-----|
| HIGH | H1 | `selectAllPending` fica preso se `fetchAllPages` falhar — sem `.catch()` | ✅ Adicionado `.catch(() => setSelectAllPending(false))` em `toggleAll` |
| HIGH | H2 | Teste positivo do IntersectionObserver ausente (AC #4) | ✅ Teste adicionado com fallback para limitação JSDOM/Radix portal ref timing |
| MEDIUM | M1 | `availableTotal = total - existingLeadIds.size` impreciso com busca filtrada | ✅ Refatorado: `availableLeads.length + Math.max(0, total - leads.length)` |
| MEDIUM | M2 | IntersectionObserver destruído/recriado a cada mudança de `isFetchingNextPage` | ✅ Migrado para `useRef` pattern — observer só recria quando `hasNextPage` ou `fetchNextPage` mudam |
| MEDIUM | M3 | `sprint-status.yaml` modificado no git mas ausente do File List | ✅ Adicionado ao File List |
| LOW | L1 | Teste "never shows negative count" não exercita `Math.max(0, ...)` guard | ✅ Teste edge case adicionado (`total < leads.length`) |
| LOW | L2 | `handleAddLeads` sem `try/catch` — unhandled promise rejection (pré-existente 5.7) | ✅ Adicionado `try/catch` com teste de erro |

### Test Impact

- **Before review:** 64 testes (42 dialog + 22 hook)
- **After review:** 69 testes (47 dialog + 22 hook) — +5 novos testes
- **Suite completo:** 253 files, 4659 tests, 0 failures, 0 regressões

## Change Log

| Data | Mudança |
|------|---------|
| 2026-02-27 | Implementação completa da Story 12.7 — hook `useAllLeads` com `useInfiniteQuery`, infinite scroll no dialog, contagem real, "selecionar todos" com múltiplas páginas. 253 files, 4654 tests, 0 failures. |
| 2026-02-27 | Code review: 7 fixes aplicados (2H, 3M, 2L). Error handling `selectAllPending`, `availableTotal` accuracy, IntersectionObserver ref optimization, `handleAddLeads` try/catch. +5 testes. 253 files, 4659 tests, 0 failures. |
