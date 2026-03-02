# Story 13.10: Coluna de Raciocinio da IA na Tabela de Insights

Status: done

## Story

As a Marco (SDR),
I want ver o raciocinio da IA que justifica cada indicacao de insight diretamente na tabela de insights,
so that eu entenda rapidamente por que aquele post foi considerado relevante e tome decisoes de abordagem mais informadas.

## Acceptance Criteria

1. Nova coluna "Por que?" exibida na tabela de insights entre a coluna "Sugestao de Abordagem" e "Status"
2. A coluna exibe o campo `relevanceReasoning` ja existente no modelo de dados (nenhuma alteracao de backend necessaria)
3. Texto do raciocinio exibido com `line-clamp-2` (maximo 2 linhas visíveis) para manter a tabela compacta
4. Tooltip com texto completo do raciocinio ao passar o mouse (mesmo padrao usado nas colunas "Post" e "Sugestao")
5. Quando `relevanceReasoning` for `null`, exibir texto placeholder em italico: "Raciocinio nao disponivel"
6. Coluna com `max-w-[200px]` para nao comprimir demais as colunas adjacentes
7. Testes unitarios atualizados para cobrir a nova coluna (renderizacao, tooltip, placeholder null)

## Tasks / Subtasks

- [x] Task 1: Adicionar coluna "Por que?" na InsightsTable (AC: #1, #2, #3, #4, #5, #6)
  - [x] 1.1 Adicionar `<th>` "Por que?" no `<thead>` entre "Sugestao de Abordagem" e "Status"
  - [x] 1.2 Adicionar `<td>` no componente `InsightRow` com Tooltip + line-clamp-2 (mesmo padrao da coluna Post)
  - [x] 1.3 Tratar caso `relevanceReasoning === null` com placeholder italico
  - [x] 1.4 Aplicar `max-w-[200px]` na coluna

- [x] Task 2: Atualizar testes unitarios (AC: #7)
  - [x] 2.1 Ajustar testes existentes de InsightsTable para incluir `relevanceReasoning` nos mocks
  - [x] 2.2 Teste: coluna "Por que?" renderiza o texto do raciocinio
  - [x] 2.3 Teste: placeholder exibido quando `relevanceReasoning` e null
  - [x] 2.4 Teste: tooltip exibe texto completo do raciocinio

## Dev Notes

### Dados ja disponiveis — Zero alteracao de backend

O campo `relevanceReasoning` ja percorre todo o stack:

1. **Banco**: coluna `relevance_reasoning` na tabela `lead_insights` (migration 00043)
2. **API**: `GET /api/insights` ja faz `SELECT *` e usa `transformLeadInsightRow()` que mapeia o campo
3. **Hook**: tipo `InsightWithLead` em `use-lead-insights.ts` ja declara `relevanceReasoning: string | null`
4. **Componente**: `InsightsTable.tsx` recebe `InsightWithLead[]` — campo disponivel, apenas nao renderizado

### Padrao de Tooltip a seguir

Replicar exatamente o padrao da coluna "Post" (linhas 107-116 de InsightsTable.tsx):

```tsx
<TooltipProvider>
  <Tooltip delayDuration={300}>
    <TooltipTrigger asChild>
      <p className="text-sm text-muted-foreground line-clamp-2">{insight.relevanceReasoning}</p>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="max-w-[400px]">
      <p className="text-sm whitespace-pre-wrap">{insight.relevanceReasoning}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Arquivos impactados

**Modificados:**
- `src/components/insights/InsightsTable.tsx` — adicionar `<th>` + `<td>` com tooltip
- `__tests__/unit/components/insights/InsightsTable.test.tsx` — novos assertions

**Nenhum arquivo novo necessario.**

## Dev Agent Record

### Implementation Plan
- Seguir padrao de tooltip existente da coluna "Post" (TooltipProvider > Tooltip > TooltipTrigger + TooltipContent)
- Adicionar `<th>` entre "Sugestao de Abordagem" e "Status"
- Adicionar `<td>` no InsightRow com logica condicional para null
- Testes red-green-refactor: 5 testes novos escritos antes da implementacao

### Completion Notes
- Coluna "Por que?" adicionada entre "Sugestao de Abordagem" e "Status" (AC #1)
- Campo `relevanceReasoning` renderizado com tooltip + line-clamp-2 (AC #2, #3, #4)
- Placeholder italico "Raciocinio nao disponivel" quando null (AC #5)
- `max-w-[200px]` aplicado na coluna (AC #6)
- 6 testes novos adicionados (AC #7): header, texto, line-clamp, tooltip trigger, placeholder null, max-w-[200px]
- Mock `makeInsight()` ja incluia `relevanceReasoning` — nenhum ajuste necessario
- Zero alteracao de backend — campo ja disponivel no stack completo
- Ajuste colateral: `max-w-[220px]` adicionado ao `<th>` e `<td>` da coluna Lead para evitar compressao ao adicionar nova coluna
- 277 arquivos de teste, 5033 testes passando, 0 regressoes

## File List

**Modificados:**
- `src/components/insights/InsightsTable.tsx` — nova coluna "Por que?" com tooltip + placeholder
- `__tests__/unit/components/insights/InsightsTable.test.tsx` — 5 testes novos para coluna "Por que?"

## Change Log

- 2026-03-02: Implementada coluna "Por que?" na InsightsTable com tooltip, line-clamp-2, placeholder null e 6 testes unitarios
- 2026-03-02: Code review — corrigidos 7 issues: header test atualizado, assercoes precisas, AC#4 reescrito sem dependencia Radix, reordenacao testes, teste AC#6 max-w, mudanca Lead documentada

### References

- [Source: src/components/insights/InsightsTable.tsx] — Componente da tabela (coluna a adicionar)
- [Source: src/hooks/use-lead-insights.ts:35-50] — Tipo InsightWithLead (campo relevanceReasoning ja existe)
- [Source: src/types/monitoring.ts:65-77] — Interface LeadInsight (campo relevanceReasoning)
- [Source: src/app/api/insights/route.ts:37-38] — API SELECT * ja retorna o campo
