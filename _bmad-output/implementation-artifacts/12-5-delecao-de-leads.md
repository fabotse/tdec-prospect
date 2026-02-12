# Story 12.5: Deleção de Leads (Individual e em Massa)

Status: done

## Story

As a usuário do sistema,
I want deletar leads da minha base de dados, tanto individualmente quanto em massa,
so that eu possa manter minha lista de leads limpa e organizada.

## Acceptance Criteria

1. **Deleção individual**: O usuário pode deletar um lead individual a partir de uma ação na linha da tabela (botão ou menu de contexto)
2. **Deleção em massa**: O usuário pode selecionar múltiplos leads via checkbox e deletar todos de uma vez a partir da LeadSelectionBar
3. **Dialog de confirmação**: Toda deleção (individual ou em massa) exige confirmação via AlertDialog antes de executar
4. **Dialog mostra contagem**: O dialog de confirmação deve exibir quantos leads serão deletados
5. **Hard delete**: Os leads são removidos permanentemente do banco de dados (não é soft delete)
6. **Feedback visual**: Toast de sucesso com contagem de leads deletados após conclusão
7. **Feedback de erro**: Toast de erro caso a deleção falhe
8. **Atualização da UI**: Após deleção, a lista de leads é atualizada automaticamente (invalidação de queries) e a seleção é limpa
9. **Segurança RLS**: A deleção respeita Row Level Security — usuário só deleta leads do próprio tenant

## Tasks / Subtasks

- [x] Task 1: API Route — `DELETE /api/leads/bulk-delete` (AC: #5, #9)
  - [x] 1.1 Criar `src/app/api/leads/bulk-delete/route.ts`
  - [x] 1.2 Validar body com Zod (`{ leadIds: string[] }`, min 1, max 500)
  - [x] 1.3 Autenticar via `createRouteHandlerClient` + `getUser()`
  - [x] 1.4 Deletar via Supabase `.delete().in('id', leadIds)` — RLS garante tenant isolation
  - [x] 1.5 Retornar `{ deleted: number }` com status 200
  - [x] 1.6 Testes unitários da route

- [x] Task 2: Hook — `useDeleteLeads` (AC: #6, #7, #8)
  - [x] 2.1 Criar `src/hooks/use-delete-leads.ts`
  - [x] 2.2 Implementar `useMutation` com `mutationFn` chamando `DELETE /api/leads/bulk-delete`
  - [x] 2.3 `onSuccess`: toast de sucesso + invalidar queries `["leads"]`, `["my-leads"]`, `["searchLeads"]`
  - [x] 2.4 `onError`: toast de erro
  - [x] 2.5 Testes unitários do hook

- [x] Task 3: Dialog — `DeleteLeadsDialog` (AC: #3, #4)
  - [x] 3.1 Criar `src/components/leads/DeleteLeadsDialog.tsx`
  - [x] 3.2 Usar `AlertDialog` do shadcn/ui (mesmo padrão de `DeleteCampaignDialog`)
  - [x] 3.3 Props: `open`, `onOpenChange`, `leadCount: number`, `onConfirm: () => Promise<void>`, `isDeleting: boolean`
  - [x] 3.4 Título: "Excluir Leads"
  - [x] 3.5 Descrição dinâmica: "Tem certeza que deseja excluir {count} lead(s)? Esta ação não pode ser desfeita."
  - [x] 3.6 Botões: "Cancelar" (outline) + "Excluir" (destructive, vermelho)
  - [x] 3.7 Loading state: spinner no botão + ambos botões disabled durante deleção
  - [x] 3.8 Testes unitários do dialog

- [x] Task 4: Deleção em massa via LeadSelectionBar (AC: #2, #8)
  - [x] 4.1 Adicionar botão "Excluir" na `LeadSelectionBar.tsx` (ícone Trash2, estilo destructive)
  - [x] 4.2 Posicionar o botão no menu "mais opções" (ellipsis `...`) — avaliado espaço, dropdown é melhor UX
  - [x] 4.3 Ao clicar: abrir `DeleteLeadsDialog` com `leadCount = selectedIds.length`
  - [x] 4.4 Ao confirmar: chamar `deleteLeads(selectedIds)` + `clearSelection()` no sucesso
  - [x] 4.5 Testes de integração na LeadSelectionBar

- [x] Task 5: Deleção individual na tabela (AC: #1)
  - [x] 5.1 Identificar onde adicionar ação de delete individual (dropdown de ações na linha ou botão na row)
  - [x] 5.2 Adicionar opção "Excluir" com ícone Trash2 e estilo destructive
  - [x] 5.3 Ao clicar: abrir `DeleteLeadsDialog` com `leadCount = 1`
  - [x] 5.4 Ao confirmar: chamar `deleteLeads([leadId])`
  - [x] 5.5 Testes unitários

## Dev Notes

### Padrões Existentes a Seguir

**API Route — Seguir padrão de `/api/leads/bulk-status/route.ts`:**
- Autenticação via `createRouteHandlerClient`
- Validação com Zod schema
- Supabase query com RLS enforced
- Retorno JSON padronizado

**Hook — Seguir padrão de `useImportLeads` / `useBulkUpdateStatus`:**
- `useMutation` do React Query
- `onSuccess`: toast + `queryClient.invalidateQueries`
- `onError`: toast de erro
- Invalidar queries: `["leads"]`, `["my-leads"]`, `["searchLeads"]`

**Dialog — Seguir padrão de `DeleteCampaignDialog.tsx`:**
- `AlertDialog` + `AlertDialogContent` + `AlertDialogHeader` + `AlertDialogFooter`
- Botão Cancel (outline) + Action (destructive)
- `e.preventDefault()` no handler async
- Loading spinner durante operação
- Ambos botões disabled durante loading

**LeadSelectionBar — Componente existente:**
- Barra fixa no bottom com ações em massa
- Já possui: Importar, Enriquecer, Icebreaker, Telefone, Criar Campanha, Segmento, Status
- Adicionar "Excluir" como ação (provavelmente no menu ellipsis ou como botão separado com estilo destructive)

### Arquivos Principais a Modificar/Criar

| Ação | Arquivo |
|------|---------|
| CRIAR | `src/app/api/leads/bulk-delete/route.ts` |
| CRIAR | `src/hooks/use-delete-leads.ts` |
| CRIAR | `src/components/leads/DeleteLeadsDialog.tsx` |
| MODIFICAR | `src/components/leads/LeadSelectionBar.tsx` |
| MODIFICAR | Componente de ação individual na tabela (verificar `LeadTable` ou row actions) |
| CRIAR | `__tests__/unit/app/api/leads/bulk-delete/route.test.ts` |
| CRIAR | `__tests__/unit/hooks/use-delete-leads.test.ts` |
| CRIAR | `__tests__/unit/components/leads/DeleteLeadsDialog.test.ts` |
| MODIFICAR | `__tests__/unit/components/leads/LeadSelectionBar.test.tsx` |

### Project Structure Notes

- API routes seguem padrão App Router: `src/app/api/leads/bulk-delete/route.ts`
- Hooks ficam em `src/hooks/`
- Componentes de leads ficam em `src/components/leads/`
- Testes espelham estrutura em `__tests__/unit/`
- Linguagem da UI: Português (BR)

### Considerações Técnicas

- **RLS (Row Level Security)**: Supabase já garante que o `.delete()` só afeta leads do tenant autenticado — não é necessário filtro manual por `tenant_id`, mas incluir como safety net
- **Cascata**: Verificar se existem tabelas dependentes (icebreakers, whatsapp_messages, campaign_leads, etc.) que precisam de `ON DELETE CASCADE` ou deleção manual prévia
- **Limite de batch**: Limitar a 500 IDs por request para evitar payloads enormes
- **Sem undo**: Hard delete não tem rollback — o dialog de confirmação é a única proteção

### References

- [Source: src/components/campaigns/DeleteCampaignDialog.tsx] — Padrão de dialog de confirmação
- [Source: src/hooks/use-lead-status.ts] — Padrão de hook com bulk mutation
- [Source: src/app/api/leads/bulk-status/route.ts] — Padrão de API route para bulk operations
- [Source: src/components/leads/LeadSelectionBar.tsx] — Barra de ações em massa
- [Source: src/components/leads/MyLeadsPageContent.tsx] — Página principal de Meus Leads
- [Source: src/stores/use-selection-store.ts] — Store de seleção de leads

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A

### Completion Notes List
- Task 1: API Route `DELETE /api/leads/bulk-delete` criada seguindo padrão de bulk-status. Zod validation (UUIDs, min 1, max 500), auth via `createClient()` + `getUser()`, hard delete via `.delete().in('id', leadIds)`. 10 testes passando.
- Task 2: Hook `useDeleteLeads` criado com `useMutation`, toast sucesso/erro (singular/plural), invalidação de 3 query keys. 5 testes passando.
- Task 3: `DeleteLeadsDialog` criado com AlertDialog, contagem dinâmica (singular/plural), loading state com spinner + botões disabled. `e.preventDefault()` no handler async. 8 testes passando.
- Task 4: Deleção em massa integrada na `LeadSelectionBar` via dropdown "Mais opções" (ícone Trash2, estilo destructive). Posicionado no dropdown por avaliação de espaço — barra já possui 7+ botões. Dialog de confirmação com contagem. `clearSelection()` após sucesso. 4 testes novos, 42 total passando.
- Task 5: Deleção individual via coluna "actions" no `LeadTable` (MoreHorizontal dropdown → "Excluir"). Coluna condicional (`onDeleteLead` prop). `MyLeadsPageContent` gerencia estado do dialog e chamada ao hook. `e.stopPropagation()` para não acionar `onRowClick`. 5 testes novos, 61 total passando.

### Change Log
- 2026-02-12: Implementação completa da Story 12.5 — 5 tasks, 32 novos testes, 252 arquivos de teste, 4607 testes passando, 0 regressões.
- 2026-02-12: Code Review (Amelia) — 5 issues encontrados e corrigidos:
  - [HIGH] Adicionado `{ count: 'exact' }` ao `.delete()` do Supabase para contagem real de leads deletados
  - [HIGH] Adicionado `try/catch` em `handleBulkDelete` (LeadSelectionBar) e `handleConfirmDeleteLead` (MyLeadsPageContent) para evitar unhandled promise rejections
  - [MEDIUM] Adicionado teste de network error no hook `useDeleteLeads`
  - [LOW] Adicionado `label: "Ações"` na coluna actions do LeadTable para acessibilidade (screen readers)
  - [MEDIUM-NOTE] Cascata de FKs: verificar no Supabase Dashboard se tabelas dependentes de `leads` têm `ON DELETE CASCADE` configurado

### File List
- CRIADO: `src/app/api/leads/bulk-delete/route.ts`
- CRIADO: `src/hooks/use-delete-leads.ts`
- CRIADO: `src/components/leads/DeleteLeadsDialog.tsx`
- MODIFICADO: `src/components/leads/LeadSelectionBar.tsx`
- MODIFICADO: `src/components/leads/LeadTable.tsx`
- MODIFICADO: `src/components/leads/MyLeadsPageContent.tsx`
- CRIADO: `__tests__/unit/app/api/leads/bulk-delete/route.test.ts`
- CRIADO: `__tests__/unit/hooks/use-delete-leads.test.tsx`
- CRIADO: `__tests__/unit/components/leads/DeleteLeadsDialog.test.tsx`
- MODIFICADO: `__tests__/unit/components/leads/LeadSelectionBar.test.tsx`
- MODIFICADO: `__tests__/unit/components/leads/LeadTable.test.tsx`
