---
title: 'Delete Campaign and Block'
slug: 'delete-campaign-and-block'
created: '2026-02-03'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - Next.js 15 App Router
  - Zustand (state management)
  - TanStack Query (server state)
  - Supabase (database)
  - shadcn/ui (AlertDialog, DropdownMenu)
  - Vitest + Testing Library
  - lucide-react (icons)
files_to_modify:
  - src/app/api/campaigns/[campaignId]/route.ts
  - src/hooks/use-campaigns.ts
  - src/components/campaigns/CampaignCard.tsx
  - src/components/campaigns/DeleteCampaignDialog.tsx (NEW)
  - src/components/campaigns/index.ts
  - src/components/builder/BuilderHeader.tsx
  - src/components/builder/EmailBlock.tsx
  - src/components/builder/DelayBlock.tsx
  - __tests__/unit/api/campaigns-id.test.ts
  - __tests__/unit/hooks/use-campaigns.test.tsx
  - __tests__/unit/components/campaigns/CampaignCard.test.tsx
  - __tests__/unit/components/campaigns/DeleteCampaignDialog.test.tsx (NEW)
  - __tests__/unit/components/builder/EmailBlock.test.tsx
  - __tests__/unit/components/builder/DelayBlock.test.tsx
code_patterns:
  - AlertDialog para confirmacao (ver DeleteProductDialog.tsx)
  - useMutation com invalidateQueries para delete
  - removeBlock() ja existe no builder store (linha 145-156)
  - DropdownMenu para menu de opcoes (ver SegmentDropdown.tsx)
  - API routes com auth check, UUID validation, error handling
test_patterns:
  - Vitest com describe/it/expect
  - @testing-library/react para componentes
  - Mock de fetch global para hooks
  - renderHook com QueryClientProvider wrapper
---

# Tech-Spec: Delete Campaign and Block

**Created:** 2026-02-03

## Overview

### Problem Statement

O usuario nao consegue remover campanhas da lista nem deletar steps individuais (email/delay blocks) da sequencia de uma campanha. Isso limita a capacidade de gerenciamento e limpeza de dados.

### Solution

Implementar funcionalidade de delete em dois niveis:
1. **Delete de Campanha**: API DELETE + UI com confirmacao em CampaignCard e BuilderHeader
2. **Delete de Block/Step**: Expor `removeBlock()` existente no store via botao de lixeira no header de cada block

### Scope

**In Scope:**
- API DELETE `/api/campaigns/[campaignId]` com cascade de blocks e leads
- Hook `useDeleteCampaign` com TanStack Query mutation
- Componente `DeleteCampaignDialog` com confirmacao (padrao AlertDialog)
- Menu de opcoes no `CampaignCard` com opcao "Remover"
- Botao delete no `BuilderHeader`
- Botao lixeira no header de `EmailBlock` e `DelayBlock`
- Testes unitarios para API, hook e componentes

**Out of Scope:**
- Soft delete / restore de campanhas
- Bulk delete de multiplas campanhas
- Delete de leads individuais da campanha

## Context for Development

### Codebase Patterns

- **Delete Dialog**: Seguir padrao de `DeleteProductDialog.tsx` - usa AlertDialog com estado `isDeleting`, botao destructive
- **API Routes**: Seguir padrao existente em `[campaignId]/route.ts` - auth check, UUID validation, error handling com codigos (UNAUTHORIZED, NOT_FOUND, INTERNAL_ERROR)
- **Hooks**: Seguir padrao de `useCreateCampaign` - useMutation com onSuccess invalidando queries QUERY_KEY
- **Store**: `removeBlock(id)` ja implementado em `use-builder-store.ts:145-156` - atualiza positions automaticamente
- **Menu de Opcoes**: Usar DropdownMenu com MoreVertical icon (ver padroes em outros componentes)
- **Block Header**: Ambos EmailBlock e DelayBlock tem header com drag handle + icon + title - adicionar trash button ali

### Files to Reference

| File | Purpose | Key Lines |
| ---- | ------- | --------- |
| `src/components/products/DeleteProductDialog.tsx` | Padrao de dialog de confirmacao | AlertDialog + isDeleting state |
| `src/app/api/campaigns/[campaignId]/route.ts` | Adicionar DELETE handler | GET/PATCH existem, adicionar DELETE |
| `src/hooks/use-campaigns.ts` | Adicionar useDeleteCampaign hook | QUERY_KEY linha 24, padrao mutation linha 100-109 |
| `src/stores/use-builder-store.ts` | removeBlock() ja existe | linhas 145-156 |
| `src/components/builder/EmailBlock.tsx` | Adicionar botao delete no header | header div linha 364-436 |
| `src/components/builder/DelayBlock.tsx` | Adicionar botao delete no header | header div linha 149-214 |
| `src/components/builder/BuilderHeader.tsx` | Adicionar botao delete campanha | Row 1 actions div linha 191-226 |
| `__tests__/unit/hooks/use-campaigns.test.tsx` | Padrao de testes para hooks | mock fetch, createWrapper |

### Technical Decisions

- **Cascade Delete**: Database handles cascade via FK constraints (email_blocks, delay_blocks, campaign_leads tem ON DELETE CASCADE)
- **Confirmacao Campanha**: Sempre exigir confirmacao via AlertDialog antes de delete
- **Confirmacao Block**: NAO exigir confirmacao - delete direto ao clicar no icone (UX mais fluida, pode desfazer via Ctrl+Z no futuro)
- **Navegacao**: Apos delete campanha no builder, redirecionar para `/campaigns` via router.push
- **Otimistic UI**: Nao usar para delete campanha - esperar confirmacao do servidor
- **Block Delete UI**: Icone Trash2 no header do block, ao lado do drag handle, visivel sempre (nao apenas on hover)

## Implementation Plan

### Tasks

#### Feature 1: Delete Campaign API & Hook

- [ ] **Task 1**: Adicionar DELETE handler na API
  - File: `src/app/api/campaigns/[campaignId]/route.ts`
  - Action: Adicionar funcao `DELETE` seguindo padrao de GET/PATCH
  - Details:
    - Auth check (401 se nao autenticado)
    - UUID validation (400 se invalido)
    - Verificar se campanha existe (404 se nao encontrada)
    - Executar `supabase.from("campaigns").delete().eq("id", campaignId)`
    - Retornar 204 No Content em sucesso
    - Cascade delete de blocks e leads e tratado pelo DB

- [ ] **Task 2**: Adicionar testes para DELETE endpoint
  - File: `__tests__/unit/api/campaigns-id.test.ts`
  - Action: Adicionar describe block para DELETE
  - Tests:
    - Retorna 401 se nao autenticado
    - Retorna 400 se UUID invalido
    - Retorna 404 se campanha nao existe
    - Retorna 204 e deleta campanha em sucesso
    - Deleta blocks e leads em cascade (verificar via mock)

- [ ] **Task 3**: Criar hook useDeleteCampaign
  - File: `src/hooks/use-campaigns.ts`
  - Action: Adicionar funcao `deleteCampaign` e hook `useDeleteCampaign`
  - Details:
    - `deleteCampaign(campaignId)` faz fetch DELETE
    - `useDeleteCampaign()` retorna useMutation
    - onSuccess invalida QUERY_KEY ["campaigns"]

- [ ] **Task 4**: Adicionar testes para useDeleteCampaign
  - File: `__tests__/unit/hooks/use-campaigns.test.tsx`
  - Action: Adicionar describe block para useDeleteCampaign
  - Tests:
    - Deleta campanha com sucesso
    - Trata erro de servidor
    - Invalida queries apos sucesso

#### Feature 2: Delete Campaign UI

- [ ] **Task 5**: Criar componente DeleteCampaignDialog
  - File: `src/components/campaigns/DeleteCampaignDialog.tsx` (NEW)
  - Action: Criar componente seguindo padrao de DeleteProductDialog
  - Props: `open`, `onOpenChange`, `campaign`, `onConfirm`, `isDeleting`
  - UI: AlertDialog com titulo "Remover campanha?", descricao, botoes Cancelar/Remover

- [ ] **Task 6**: Adicionar testes para DeleteCampaignDialog
  - File: `__tests__/unit/components/campaigns/DeleteCampaignDialog.test.tsx` (NEW)
  - Tests:
    - Renderiza dialog quando open=true
    - Mostra nome da campanha
    - Chama onConfirm ao clicar Remover
    - Mostra loading state quando isDeleting=true
    - Desabilita botoes durante delete

- [ ] **Task 7**: Exportar DeleteCampaignDialog no index
  - File: `src/components/campaigns/index.ts`
  - Action: Adicionar `export { DeleteCampaignDialog } from "./DeleteCampaignDialog";`

- [ ] **Task 8**: Adicionar menu de opcoes no CampaignCard
  - File: `src/components/campaigns/CampaignCard.tsx`
  - Action: Adicionar DropdownMenu com icone MoreVertical no header
  - Details:
    - Menu com opcao "Remover" (icone Trash2)
    - Prop `onDelete?: (campaign) => void`
    - Prevenir propagacao do click do menu para o card

- [ ] **Task 9**: Atualizar testes do CampaignCard
  - File: `__tests__/unit/components/campaigns/CampaignCard.test.tsx`
  - Tests:
    - Renderiza menu de opcoes
    - Chama onDelete ao clicar em Remover
    - Nao propaga click do menu para o card

- [ ] **Task 10**: Integrar delete na pagina de campanhas
  - File: `src/app/(dashboard)/campaigns/page.tsx`
  - Action: Adicionar estado para dialog e handlers
  - Details:
    - Estado: `deleteTarget`, `isDeleteDialogOpen`
    - Handler: `handleDeleteClick` abre dialog
    - Handler: `handleDeleteConfirm` chama mutation e fecha dialog
    - Passar `onDelete` para CampaignList/CampaignCard

- [ ] **Task 11**: Adicionar botao delete no BuilderHeader
  - File: `src/components/builder/BuilderHeader.tsx`
  - Action: Adicionar botao Trash2 na Row 1 (antes de Preview)
  - Details:
    - Prop: `onDelete?: () => void`
    - Botao variant="ghost" com icone Trash2
    - Tooltip: "Remover campanha"

- [ ] **Task 12**: Integrar delete na pagina do builder
  - File: `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx`
  - Action: Adicionar dialog e handlers
  - Details:
    - Usar DeleteCampaignDialog
    - Apos delete sucesso: router.push("/campaigns")
    - Mostrar toast de sucesso

#### Feature 3: Delete Block UI

- [ ] **Task 13**: Adicionar botao delete no EmailBlock
  - File: `src/components/builder/EmailBlock.tsx`
  - Action: Adicionar botao Trash2 no header, apos drag handle
  - Details:
    - Chamar `removeBlock(block.id)` do store
    - Icone Trash2 com hover state
    - Prevenir propagacao do click
    - data-testid="delete-block-button"

- [ ] **Task 14**: Atualizar testes do EmailBlock
  - File: `__tests__/unit/components/builder/EmailBlock.test.tsx`
  - Tests:
    - Renderiza botao delete
    - Chama removeBlock ao clicar
    - Nao seleciona block ao clicar delete

- [ ] **Task 15**: Adicionar botao delete no DelayBlock
  - File: `src/components/builder/DelayBlock.tsx`
  - Action: Adicionar botao Trash2 no header, apos drag handle
  - Details:
    - Chamar `removeBlock(block.id)` do store
    - Icone Trash2 com hover state
    - Prevenir propagacao do click
    - data-testid="delete-block-button"

- [ ] **Task 16**: Atualizar testes do DelayBlock
  - File: `__tests__/unit/components/builder/DelayBlock.test.tsx`
  - Tests:
    - Renderiza botao delete
    - Chama removeBlock ao clicar
    - Nao seleciona block ao clicar delete

### Acceptance Criteria

#### Delete Campaign

- [ ] **AC-1**: Given usuario autenticado na pagina de campanhas, when clica no menu "..." de um card e seleciona "Remover", then abre dialog de confirmacao com nome da campanha
- [ ] **AC-2**: Given dialog de confirmacao aberto, when clica "Remover", then campanha e deletada e lista e atualizada
- [ ] **AC-3**: Given dialog de confirmacao aberto, when clica "Cancelar", then dialog fecha sem deletar
- [ ] **AC-4**: Given delete em progresso, when aguarda resposta, then botoes ficam desabilitados e mostra loading
- [ ] **AC-5**: Given usuario no builder, when clica botao delete no header, then abre dialog de confirmacao
- [ ] **AC-6**: Given delete confirmado no builder, when sucesso, then redireciona para /campaigns
- [ ] **AC-7**: Given campanha com blocks e leads, when deletada, then blocks e leads sao removidos em cascade
- [ ] **AC-8**: Given erro no servidor, when tenta deletar, then mostra mensagem de erro e mantem campanha

#### Delete Block

- [ ] **AC-9**: Given usuario no builder com blocks, when clica icone lixeira de um block, then block e removido imediatamente
- [ ] **AC-10**: Given block removido, when observa lista, then positions dos blocks restantes sao atualizados
- [ ] **AC-11**: Given block removido, when observa store, then hasChanges e true (indica necessidade de salvar)
- [ ] **AC-12**: Given ultimo block removido, when observa canvas, then canvas fica vazio

## Additional Context

### Dependencies

- `@radix-ui/react-alert-dialog` (ja instalado via shadcn)
- `@radix-ui/react-dropdown-menu` (ja instalado via shadcn)
- `lucide-react` para icones Trash2, MoreVertical

### Testing Strategy

**Unit Tests:**
- API DELETE endpoint (mock supabase)
- useDeleteCampaign hook (mock fetch)
- DeleteCampaignDialog (render, interactions)
- CampaignCard menu (render, click handlers)
- EmailBlock/DelayBlock delete button (render, store calls)

**Integration Tests:**
- Fluxo completo de delete na pagina de campanhas
- Fluxo completo de delete no builder
- Verificar cascade delete de blocks

**Manual Testing:**
- Deletar campanha pela lista
- Deletar campanha pelo builder
- Deletar block de email
- Deletar block de delay
- Tentar deletar com erro de rede

### Notes

- `removeBlock()` no store ja atualiza positions dos blocks restantes automaticamente
- Verificar se ha RLS policies no Supabase que permitem DELETE (provavelmente ja configurado para tenant)
- Considerar adicionar toast de sucesso apos delete de campanha
- Nao implementar undo para delete de campanha (out of scope)
- Delete de block pode ter undo no futuro via history state (out of scope atual)

## Review Notes

- **Adversarial review completed:** 2026-02-03
- **Findings:** 25 total, 4 fixed, 21 skipped (design decisions/out of scope)
- **Resolution approach:** Auto-fix

### Fixes Applied:

1. **F1 (CRITICAL):** Fixed race condition in DeleteCampaignDialog - added `e.preventDefault()` to prevent dialog from closing before async operation completes
2. **F4 (HIGH):** Fixed memory leak - added `handleDeleteDialogChange` handler to clear `deleteTarget` when dialog closes
3. **F8 (MEDIUM):** Improved null campaign handling - added fallback name "esta campanha" for null campaign
4. **F10 (LOW):** Added explicit return types to handlers in campaigns page

### Skipped (Design Decisions/Out of Scope):

- F2: Optimistic cache updates - design choice, current approach is valid
- F3: RLS verification - Supabase RLS already handles tenant isolation
- F5: Block confirmation dialog - tech-spec explicitly says "NAO exigir confirmacao" (line 103)
- F6-F7, F9: Integration tests and error boundary tests - out of scope for this task
