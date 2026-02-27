# Story 12.8: Ordenação Padrão — Leads Enriquecidos Primeiro

Status: done

## Story

As a usuário da página Meus Leads,
I want que leads enriquecidos (com foto, email, dados completos) apareçam no topo da tabela por padrão,
so that não preciso rolar até o final da lista para encontrar os leads que acabei de enriquecer.

## Acceptance Criteria

1. **Leads enriquecidos no topo**: Na ordenação padrão (sem clique em coluna), leads enriquecidos devem aparecer antes dos não-enriquecidos
2. **Critério de enriquecimento**: Um lead é considerado "enriquecido" se possui `photoUrl` não-nulo (campo preenchido pelo Apollo People Enrichment)
3. **Hierarquia de ordenação mantida**: A ordenação padrão deve ser: (1) leads interessados primeiro, (2) dentro de cada grupo (interessado/não-interessado), enriquecidos antes de não-enriquecidos, (3) dentro de cada subgrupo, por `createdAt` descendente
4. **Ordenação explícita não afetada**: Quando o usuário clica em uma coluna para ordenar, o comportamento atual é mantido (sem priorização de enriquecidos) — a priorização só se aplica à ordenação padrão
5. **Testes unitários**: Cobertura para: (a) leads enriquecidos aparecem antes de não-enriquecidos, (b) hierarquia completa (interessado+enriquecido > interessado+não-enriquecido > não-interessado+enriquecido > não-interessado+não-enriquecido), (c) ordenação explícita por coluna ignora priorização

## Tasks / Subtasks

- [x] Task 1: Ajustar ordenação padrão no LeadTable (AC: #1, #2, #3, #4)
  - [x] 1.1 Em `LeadTable.tsx`, no `useMemo` de `sortedLeads` (bloco `if (!sort.column || !sort.direction)`), adicionar critério secundário de enriquecimento
  - [x] 1.2 Definir heurística de enriquecimento: `lead.photoUrl !== null` (Apollo People Enrichment preenche este campo)
  - [x] 1.3 Hierarquia final: `status === "interessado"` (0/1) → `photoUrl !== null` (0/1) → `createdAt` desc
  - [x] 1.4 NÃO alterar o bloco de ordenação explícita (quando `sort.column` e `sort.direction` estão definidos)

- [x] Task 2: Testes unitários (AC: #5)
  - [x] 2.1 Teste: lead enriquecido (com photoUrl) aparece antes de não-enriquecido (sem photoUrl), ambos com mesmo status
  - [x] 2.2 Teste: hierarquia completa — interessado+enriquecido > interessado > enriquecido > não-enriquecido
  - [x] 2.3 Teste: ordenação explícita por coluna (clique) ignora priorização de enriquecidos
  - [x] 2.4 Teste: leads com mesmo status e mesmo enrichment state ordenam por createdAt desc

## Dev Notes

### Causa Raiz

A ordenação padrão em `LeadTable.tsx` (linhas 329-341) prioriza apenas status `"interessado"` e depois ordena por `createdAt DESC`. Quando um lead é enriquecido via Apollo, o `createdAt` não muda — mas visualmente o lead "parece" ir para o final porque ele não ganha nenhuma priorização, e a ordem por `createdAt` o mantém na posição original de importação.

### Código Atual (LeadTable.tsx:329-341)

```typescript
if (!sort.column || !sort.direction) {
  return [...leads].sort((a, b) => {
    const aInterested = a.status === "interessado" ? 0 : 1;
    const bInterested = b.status === "interessado" ? 0 : 1;
    if (aInterested !== bInterested) return aInterested - bInterested;
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });
}
```

### Código Proposto

```typescript
if (!sort.column || !sort.direction) {
  return [...leads].sort((a, b) => {
    // 1. Leads interessados primeiro
    const aInterested = a.status === "interessado" ? 0 : 1;
    const bInterested = b.status === "interessado" ? 0 : 1;
    if (aInterested !== bInterested) return aInterested - bInterested;
    // 2. Leads enriquecidos antes (têm photoUrl via Apollo)
    const aEnriched = a.photoUrl ? 0 : 1;
    const bEnriched = b.photoUrl ? 0 : 1;
    if (aEnriched !== bEnriched) return aEnriched - bEnriched;
    // 3. Por data de criação (mais recente primeiro)
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });
}
```

### Arquivos a Modificar

| Ação | Arquivo |
|------|---------|
| MODIFICAR | `src/components/leads/LeadTable.tsx` — linhas 329-341, adicionar critério de enrichment |
| MODIFICAR | `__tests__/unit/components/leads/LeadTable.test.tsx` — adicionar testes de ordenação com enrichment |

### Decisão Arquitetural: Ordenação em Duas Camadas

A ordenação foi implementada em **duas camadas complementares**:

1. **Server-side** (`GET /api/leads` — `route.ts`): `.order("photo_url", { nullsFirst: false })` + `.order("created_at", { ascending: false })`. Garante que a **paginação** entregue leads enriquecidos nas primeiras páginas. Sem isso, um lead enriquecido com `created_at` antigo ficaria em páginas posteriores e o sort client-side não conseguiria trazê-lo ao topo.

2. **Client-side** (`LeadTable.tsx` — `sortedLeads` useMemo): Hierarquia completa `interessado → enriched → createdAt DESC`. Reordena os leads **dentro da página** renderizada, incluindo o critério de status "interessado" que o Supabase `.order()` não suporta como expressão (`CASE WHEN`).

**Por que não apenas server-side?** O Supabase `.order()` não suporta ordering por expressões SQL (e.g., `status = 'interessado'`). O critério "interessado primeiro" só é viável client-side.

**Por que não apenas client-side?** O client-side só reordena os N leads da página atual. Sem o ORDER BY server-side, leads enriquecidos com `created_at` antigo ficariam em páginas posteriores.

> **NOTA PARA CODE REVIEW:** Esta é uma decisão intencional de duas camadas. NÃO remover nenhuma delas — ambas são necessárias para o funcionamento correto com paginação.

### Tipo Lead — Campo photoUrl

```typescript
export interface Lead {
  // ...
  /** Story 4.4.1: URL da foto do lead obtida via Apollo People Enrichment */
  photoUrl: string | null;
  // ...
}
```

O `photoUrl` é preenchido exclusivamente pelo Apollo People Enrichment (Story 4.4.1), então é um indicador confiável de enriquecimento.

### References

- [Source: src/components/leads/LeadTable.tsx:329-341] — Ordenação padrão atual
- [Source: src/types/lead.ts:143-144] — Campo `photoUrl` (Apollo enrichment)
- [Source: src/hooks/use-my-leads.ts] — Hook de dados (não precisa alterar)

## Dev Agent Record

### Implementation Plan

Duas camadas de ordenação:
1. **Server-side** (API route): `.order("photo_url", { ascending: false, nullsFirst: false })` antes de `.order("created_at", { ascending: false })` — garante que leads enriquecidos venham nas primeiras páginas da paginação.
2. **Client-side** (LeadTable): critério `a.photoUrl ? 0 : 1` entre status "interessado" e createdAt no sort comparator — reordena dentro da página renderizada.

### Completion Notes

- Implementação RED→GREEN→REFACTOR concluída em ciclo único
- 3 linhas adicionadas ao sort comparator client-side (LeadTable.tsx:337-340)
- ORDER BY server-side ajustado na API route (route.ts:103-106): photo_url nulls last + created_at DESC
- 4 novos testes LeadTable + 1 teste API atualizado (ordering assertion)
- 253 arquivos de teste, 4663 testes passando, 0 regressões
- Todos os 5 Acceptance Criteria satisfeitos

## File List

| Ação | Arquivo |
|------|---------|
| MODIFICAR | `src/components/leads/LeadTable.tsx` |
| MODIFICAR | `__tests__/unit/components/leads/LeadTable.test.tsx` |
| MODIFICAR | `src/app/api/leads/route.ts` |
| MODIFICAR | `__tests__/unit/api/leads-get.test.ts` |
| MODIFICAR | `_bmad-output/implementation-artifacts/sprint-status.yaml` |

## Change Log

- 2026-02-27: Implementação completa — ordenação padrão com priorização de leads enriquecidos (photoUrl) + 4 testes unitários
- 2026-02-27: Fix server-side — ORDER BY photo_url nulls last + created_at DESC na API /api/leads para paginação correta
- 2026-02-27: Code review fixes — truthiness→null check (M3), comentário expandido route.ts (M1/M2), headers atualizados (L1), teste edge case empty string photoUrl (L2), File List atualizado (L3)
