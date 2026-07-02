---
title: 'Deletar segmento a partir do filtro "Segmentos"'
type: 'refactor'
created: '2026-07-02'
status: 'done'
baseline_commit: 'f5e93e59299e82c41183fbbceb6ab2215a092801'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A opção de deletar segmento existe (backend `DELETE /api/segments/[id]`, hook `useDeleteSegment`), mas está escondida dentro do dropdown "Adicionar ao Segmento" (`SegmentDropdown`), que fica desabilitado enquanto nenhum lead está selecionado. Na prática o usuário não encontra como deletar um segmento.

**Approach:** Extrair um componente reutilizável `DeleteSegmentButton` (lixeira + AlertDialog de confirmação + `useDeleteSegment`) e integrá-lo em cada item do `SegmentFilter` (dropdown "Segmentos", o lugar natural de gestão). Remover a lógica de delete do `SegmentDropdown`, que passa a ser só-adicionar. Nenhuma mudança de backend, RLS, schema ou controle de acesso.

## Boundaries & Constraints

**Always:**
- Reusar `useDeleteSegment()` existente e o texto de confirmação atual ("Os leads não serão excluídos, apenas a associação com o segmento").
- Clicar na lixeira NÃO pode disparar `onSegmentChange` do item (usar `stopPropagation`/`preventDefault`).
- Toasts de sucesso/erro preservados ("Segmento removido" / mensagem de erro).
- Todos os papéis (gestor|diretor|sdr) continuam podendo deletar — comportamento atual.

**Ask First:**
- Qualquer necessidade de mudar API, RLS, migration ou de gatear delete por papel.

**Never:**
- Não deletar leads (só a associação, via CASCADE no backend já existente).
- Não alterar o fluxo de adicionar leads ao segmento nem o de criar segmento.
- Não adicionar rota/tela nova de gestão de segmentos.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deletar via filtro | Usuário abre "Segmentos", clica na lixeira de um segmento, confirma | `useDeleteSegment` chamado com o id; toast "Segmento removido"; lista atualiza | Toast de erro; dropdown/dialog não travam |
| Cancelar confirmação | Abre confirmação e clica "Cancelar" | Nenhuma mutation; segmento permanece | N/A |
| Clique na lixeira não filtra | Clica na lixeira dentro do item de segmento | `onSegmentChange` NÃO é chamado; abre confirmação | N/A |
| Mutation em andamento | Confirmação com `deleteSegment.isPending` | Botão "Removendo..." desabilitado | N/A |

</frozen-after-approval>

## Code Map

- `src/components/leads/DeleteSegmentButton.tsx` -- **novo**: botão ghost `Trash2` + `AlertDialog` de confirmação + `useDeleteSegment`. Props: `{ segment: SegmentWithCount }`.
- `src/components/leads/SegmentFilter.tsx` -- integrar `DeleteSegmentButton` em cada item; tornar `DropdownMenu` controlado para não fechar sob o `AlertDialog`.
- `src/components/leads/SegmentDropdown.tsx` -- remover delete (botão, `AlertDialog`, `handleDeleteClick`, `handleConfirmDelete`, states `deleteDialogOpen`/`segmentToDelete`, `useDeleteSegment`, imports órfãos); vira só-adicionar.
- `src/hooks/use-segments.ts` -- `useDeleteSegment()` (reuso, sem mudança).
- `__tests__/unit/components/leads/DeleteSegmentButton.test.tsx` -- **novo**.
- `__tests__/unit/components/leads/SegmentFilter.test.tsx` -- adicionar cobertura de delete.
- `__tests__/unit/components/leads/SegmentDropdown.test.tsx` -- remover asserts de delete.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/leads/DeleteSegmentButton.tsx` -- criar componente reutilizável (lixeira + AlertDialog + `useDeleteSegment` + toasts), `data-testid="delete-segment-${segment.id}"`, click com `stopPropagation`/`preventDefault` -- centraliza a lógica de delete.
- [x] `src/components/leads/SegmentFilter.tsx` -- renderizar `DeleteSegmentButton` por item e controlar o `DropdownMenu` (`open`/`onOpenChange`) com guard ref -- expõe o delete no lugar natural sem quebrar o filtro.
- [x] `src/components/leads/SegmentDropdown.tsx` -- remover toda a lógica de delete e imports órfãos -- passa a ser só-adicionar.
- [x] `__tests__/unit/components/leads/DeleteSegmentButton.test.tsx` -- testar render, abrir/cancelar/confirmar, erro, `onOpenChange`, e que não propaga clique -- cobre a matriz de I/O.
- [x] `__tests__/unit/components/leads/SegmentFilter.test.tsx` -- asserts do botão de delete por segmento e que clicar nele não chama `onSegmentChange`.
- [x] `__tests__/unit/components/leads/SegmentDropdown.test.tsx` -- remover asserts de delete (ausentes agora).

**Acceptance Criteria:**
- Given estou na tela de leads sem nada selecionado, when abro o dropdown "Segmentos", then vejo um botão de lixeira em cada segmento.
- Given cliquei na lixeira de um segmento e confirmei, when a operação conclui, then o segmento some da lista e vejo "Segmento removido", sem que os leads sejam apagados.
- Given cliquei na lixeira, when o clique acontece, then o filtro por aquele segmento NÃO é aplicado (`onSegmentChange` não é chamado).
- Given o dropdown "Adicionar ao Segmento", when o abro, then não existe mais botão de deletar ali.
- Given a suíte de testes, when rodo `npx vitest run`, then todos passam (nenhuma regressão nos testes de segmentos existentes).

## Spec Change Log

- **Feedback do usuário (2026-07-02): faltava o delete na tela "Meus Leads".** A investigação inicial só cobriu o `SegmentFilter` da tela **Buscar** (`/leads`), mas o usuário gerencia segmentos em **Meus Leads** (`/leads/my-leads`), que usa outro seletor — um `Select` simples no [MyLeadsFilterBar.tsx](../../src/components/leads/MyLeadsFilterBar.tsx). Radix `Select` não hospeda bem botões aninhados nos itens, então o `DeleteSegmentButton` (autocontido, sem menu) foi colocado **ao lado do Select**: aparece quando um segmento está selecionado e deleta esse segmento, resetando o filtro (`segmentId: null`). Delete agora está nas **duas** telas, reusando o mesmo componente. Testes: 3 novos em `MyLeadsFilterBar.test.tsx`.


- **Review adversarial 3 camadas (blind hunter / edge-case hunter / acceptance auditor).** Acceptance auditor: 100% compatível com ACs e constraints (sem backend/RLS/migration/acesso; leads preservados; lixeira não filtra; toasts mantidos). Patches aplicados a partir dos achados:
  - **Filtro órfão** (edge #4): ao deletar o segmento atualmente filtrado, `SegmentFilter` chama `onSegmentChange(null)` via novo callback `onDeleted` — evita a lista de leads presa num `segmentId` morto.
  - **Auto-close/duplo-submit** (edge #5, auditor): `handleConfirmDelete` faz `e.preventDefault()` + guarda `isPending`, mantendo o dialog aberto até a mutation resolver (estado "Removendo…" visível, sem DELETE duplicado).
  - **Race de seleção Radix** (blind #1/#2, edge #2): investigado — `DropdownMenuItem` do Radix seleciona no evento **click**, então `onClick` com `stopPropagation` já barra o filtro (confirmado pelos testes). Tentativa de `onPointerDown` foi revertida por conflitar com a abertura do dialog.
  - **KEEP:** dialog aninhado com `DropdownMenu` controlado + `deleteDialogGuard` ref (mantém o menu montado sob o dialog); reuso de `useDeleteSegment`; texto de confirmação verbatim.
  - **Rejeitados:** imports mortos (ESLint 0), custo de N instâncias, overflow cosmético de nome, warning de unmount raro.
  - **Deferido:** a11y de `<button>` aninhado em `role="menuitem"` + delete inacessível por teclado — é o padrão já existente em `SegmentDropdown`; registrado em `deferred-work.md`.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/components/leads/DeleteSegmentButton.test.tsx __tests__/unit/components/leads/SegmentFilter.test.tsx __tests__/unit/components/leads/SegmentDropdown.test.tsx __tests__/unit/hooks/use-segments.test.tsx` -- expected: todos passam
- `npx tsc --noEmit` -- expected: sem erros de tipo nos arquivos tocados
- `npx eslint src/components/leads/DeleteSegmentButton.tsx src/components/leads/SegmentFilter.tsx src/components/leads/SegmentDropdown.tsx` -- expected: 0 warnings

**Manual checks (Playwright, opcional):**
- Abrir a página de leads, abrir "Segmentos", deletar um segmento de teste, confirmar que some e que os leads permanecem na lista "Todos os Leads".

## Suggested Review Order

**Componente reutilizável (entry point)**

- Novo componente: lixeira + confirmação + `useDeleteSegment`, `stopPropagation` no clique.
  [`DeleteSegmentButton.tsx:66`](../../src/components/leads/DeleteSegmentButton.tsx#L66)

- Confirmação mantém o dialog aberto até resolver (anti-duplo-submit + `isPending` visível).
  [`DeleteSegmentButton.tsx:75`](../../src/components/leads/DeleteSegmentButton.tsx#L75)

**Integração no filtro**

- Dropdown controlado + `deleteDialogGuard` ref para não desmontar o dialog aninhado.
  [`SegmentFilter.tsx:50`](../../src/components/leads/SegmentFilter.tsx#L50)

- Render por item + `onDeleted` que limpa o filtro se o segmento ativo é deletado.
  [`SegmentFilter.tsx:120`](../../src/components/leads/SegmentFilter.tsx#L120)

**Remoção (dropdown vira só-adicionar)**

- `SegmentDropdown` sem lógica de delete; imports enxutos.
  [`SegmentDropdown.tsx:23`](../../src/components/leads/SegmentDropdown.tsx#L23)

**Testes**

- Componente novo: render, abrir/cancelar/confirmar, erro, `isPending`, não-propagação.
  [`DeleteSegmentButton.test.tsx:1`](../../__tests__/unit/components/leads/DeleteSegmentButton.test.tsx#L1)

- Filtro: delete por item, não-filtra ao clicar, limpa filtro do segmento deletado.
  [`SegmentFilter.test.tsx:1`](../../__tests__/unit/components/leads/SegmentFilter.test.tsx#L1)

- Dropdown: garante ausência do delete (agora só-adicionar).
  [`SegmentDropdown.test.tsx:1`](../../__tests__/unit/components/leads/SegmentDropdown.test.tsx#L1)
