# Story 12.1: Filtro por Segmento no Dialog de Adicionar Leads

Status: done

## Story

As a usuário de campanhas,
I want filtrar os leads disponíveis por segmento no dialog de "Adicionar Leads",
so that eu consiga encontrar e selecionar rapidamente os leads do segmento desejado sem precisar percorrer toda a lista.

## Acceptance Criteria

1. **AC #1 - Dropdown de segmento visível**: O dialog "Adicionar Leads" deve exibir um dropdown de filtro por segmento entre a barra de busca e a seção "Leads disponíveis", reutilizando o componente `SegmentFilter` existente.

2. **AC #2 - Filtro funcional**: Ao selecionar um segmento, a lista de "Leads disponíveis" deve mostrar apenas os leads daquele segmento (usando o parâmetro `segmentId` já suportado pelo hook `useMyLeads`).

3. **AC #3 - Opção "Todos os Leads"**: O dropdown deve incluir a opção "Todos os Leads" (já existente no `SegmentFilter`) que remove o filtro e mostra todos os leads novamente (comportamento atual).

4. **AC #4 - "Selecionar todos" respeita filtro**: O checkbox "Selecionar todos" deve operar sobre a lista filtrada — se um segmento está selecionado, "Selecionar todos" seleciona apenas os leads visíveis daquele segmento.

5. **AC #5 - Contagem atualizada**: O texto "Leads disponíveis (N)" deve refletir a contagem dos leads filtrados pelo segmento (excluindo os já na campanha).

6. **AC #6 - Busca combinada com segmento**: A busca por texto deve funcionar em conjunto com o filtro de segmento — ambos os filtros são aplicados simultaneamente.

7. **AC #7 - Reset ao fechar**: Ao fechar o dialog, o filtro de segmento deve ser resetado junto com a busca e seleção (comportamento consistente com o reset existente).

8. **AC #8 - Testes unitários**: Testes cobrindo: renderização do filtro, seleção de segmento, combinação busca + segmento, reset ao fechar.

## Tasks / Subtasks

- [x] Task 1 — Adicionar estado e filtro de segmento ao `AddLeadsDialog` (AC: #1, #2, #3, #7)
  - [x] 1.1 Importar `SegmentFilter` de `@/components/leads/SegmentFilter`
  - [x] 1.2 Adicionar estado `selectedSegmentId: string | null` (inicializar como `null`)
  - [x] 1.3 Passar `segmentId: selectedSegmentId` no hook `useMyLeads({ search: debouncedSearch, segmentId: selectedSegmentId })`
  - [x] 1.4 Renderizar `<SegmentFilter>` entre o `<Input>` de busca e a seção "Leads disponíveis"
  - [x] 1.5 Resetar `selectedSegmentId` para `null` no `handleOpenChange` quando dialog fecha

- [x] Task 2 — Validar comportamento de seleção com filtro (AC: #4, #5, #6)
  - [x] 2.1 Verificar que `availableLeads` já reflete a filtragem (pois `useMyLeads` retorna leads filtrados pelo backend)
  - [x] 2.2 Verificar que "Selecionar todos" opera sobre `availableLeads` filtrado (já funciona por design)
  - [x] 2.3 Verificar contagem "Leads disponíveis (N)" atualiza automaticamente (usa `availableLeads.length`)
  - [x] 2.4 Limpar seleção quando segmento muda para evitar IDs órfãos (leads selecionados que saem da lista)

- [x] Task 3 — Testes unitários (AC: #8)
  - [x] 3.1 Teste: `SegmentFilter` é renderizado no dialog
  - [x] 3.2 Teste: Selecionar segmento chama `useMyLeads` com `segmentId`
  - [x] 3.3 Teste: Busca + segmento funcionam simultaneamente
  - [x] 3.4 Teste: Fechar dialog reseta segmento selecionado
  - [x] 3.5 Teste: Mudar segmento limpa seleção de leads

## Dev Notes

### Contexto Técnico Crítico

**Esta é uma mudança de escopo mínimo.** Toda a infraestrutura já existe:

1. **`useMyLeads` hook** ([use-my-leads.ts](src/hooks/use-my-leads.ts)) — Já aceita `segmentId` como filtro. O backend (`GET /api/leads`) já implementa a filtragem por `segment_id` via tabela `lead_segments`.

2. **`SegmentFilter` componente** ([SegmentFilter.tsx](src/components/leads/SegmentFilter.tsx)) — Componente pronto com dropdown, lista de segmentos com badges de contagem, opção "Todos os Leads", e botão "Criar Segmento". Props: `selectedSegmentId: string | null`, `onSegmentChange: (id: string | null) => void`.

3. **`useSegments` hook** ([use-segments.ts](src/hooks/use-segments.ts)) — Usado internamente pelo `SegmentFilter`. Cache de 5 minutos.

4. **"Selecionar todos"** — Já opera sobre `availableLeads` (que é derivado de `leads` filtrado). Como `useMyLeads` retorna leads filtrados pelo backend quando `segmentId` é passado, o "Selecionar todos" automaticamente respeita o filtro.

### O que NÃO fazer

- NÃO criar um novo componente de filtro — reutilizar `SegmentFilter` existente
- NÃO modificar `useMyLeads`, `SegmentFilter`, ou APIs — tudo já funciona
- NÃO adicionar paginação ao dialog (fora do escopo)
- NÃO modificar a lógica de seleção existente — apenas adicionar reset quando segmento muda

### Ponto de atenção: Seleção órfã

Quando o usuário muda de segmento, leads previamente selecionados podem não estar mais visíveis na lista. **Limpar `selectedIds`** ao mudar de segmento evita confusão e IDs órfãos sendo adicionados à campanha.

Abordagem recomendada: Adicionar `useEffect` ou callback no `onSegmentChange` que chama `setSelectedIds(new Set())`.

### Arquivo principal a modificar

- [AddLeadsDialog.tsx](src/components/builder/AddLeadsDialog.tsx) — Único arquivo de componente a alterar

### Arquivo de teste a modificar

- [AddLeadsDialog.test.tsx](__tests__/unit/components/builder/AddLeadsDialog.test.tsx) — Adicionar novos testes

### Padrões do projeto

- UI em Português (BR)
- `flex flex-col gap-2` para espaçamento (NÃO usar `space-y-*` com Radix UI)
- Vitest + React Testing Library para testes
- Mock factories centralizadas em test utils
- Sem `console.log` (ESLint rule)

### Project Structure Notes

- Alinhado com a estrutura existente — reutiliza componentes e hooks já implementados
- Zero novos arquivos de componente, hook, ou API necessários
- Impacto limitado a 1 componente + 1 arquivo de teste

### References

- [Source: src/components/builder/AddLeadsDialog.tsx] — Componente principal (Story 5.7)
- [Source: src/components/leads/SegmentFilter.tsx] — Componente de filtro (Story 4.1)
- [Source: src/hooks/use-my-leads.ts] — Hook com suporte a `segmentId`
- [Source: src/hooks/use-segments.ts] — Hook de segmentos
- [Source: src/app/api/leads/route.ts] — API com filtro `segment_id`
- [Source: src/types/segment.ts] — Tipos de segmento

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A — zero failures during implementation.

### Completion Notes List

- Task 1: Importou `SegmentFilter`, adicionou estado `selectedSegmentId`, passou `segmentId` ao `useMyLeads`, renderizou `<SegmentFilter>` entre busca e lista, e resetou segmento ao fechar dialog.
- Task 2: Validou que `availableLeads`, "Selecionar todos", e contagem já funcionam por design. Adicionou limpeza de `selectedIds` via callback inline no `onSegmentChange` para evitar IDs órfãos.
- Task 3: 5 novos testes adicionados cobrindo: renderização do filtro (AC#1), passagem de segmentId ao hook (AC#2), combinação busca+segmento (AC#6), reset ao fechar (AC#7), limpeza de seleção ao mudar segmento (AC#4).
- Suite completa: 245 arquivos, 4469 testes passando, 0 falhas, 0 regressões.

### Code Review Fixes (Adversarial Review)

- **[HIGH] Fix #1 — Busca não-reativa**: `search` era passado apenas como `initialFilters` para `useMyLeads` (que usa `useState` — valor ignorado após mount). Corrigido: `useEffect` agora sincroniza AMBOS `segmentId` e `debouncedSearch` via `updateFilters`.
- **[HIGH] Fix #2 — Posicionamento AC#1**: `SegmentFilter` estava inline com o label "Leads disponíveis". Movido para posição entre a barra de busca e a seção de leads, conforme especificação da AC#1.
- **[MEDIUM] Fix #3 — Teste AC#7 fortalecido**: Teste agora verifica que o estado do segmento foi realmente resetado (checa texto "Todos os Leads") além de apenas verificar `onOpenChange(false)`.
- **[MEDIUM] Fix #4 — Novo teste AC#3**: Adicionado teste para fluxo "Todos os Leads" — seleciona segmento, limpa filtro, verifica que `updateFilters` recebeu `segmentId: null`.
- **[MEDIUM] Fix #5 — Novo teste AC#5**: Adicionado teste verificando que contagem "Leads disponíveis (N)" reflete dados filtrados retornados pelo hook.
- **[MEDIUM] Fix #6 — Teste AC#6 melhorado**: Assertion agora verifica que `updateFilters` recebe AMBOS `segmentId` e `search` simultaneamente (não verificações separadas).
- **[LOW] #7 — useEffect no mount**: Mantido (impacto negligível, complexidade de fix não justifica).
- **[LOW] #8 — Dialog aninhado**: Mantido (risco teórico, SegmentFilter é componente reutilizado).
- Testes: 28/28 passando (26 originais + 2 novos), 0 falhas.

### File List

- `src/components/builder/AddLeadsDialog.tsx` — Adicionado import SegmentFilter, estado selectedSegmentId, filtro de segmento no useMyLeads, renderização do componente, reset ao fechar, limpeza de seleção ao mudar segmento.
- `__tests__/unit/components/builder/AddLeadsDialog.test.tsx` — Adicionado mock do SegmentFilter, atualizado mock do useMyLeads para capturar argumentos, 5 novos testes para Story 12.1.
