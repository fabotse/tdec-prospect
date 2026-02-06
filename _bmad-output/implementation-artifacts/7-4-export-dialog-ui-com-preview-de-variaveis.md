# Story 7.4: Export Dialog UI com Preview de Variáveis

Status: done

## Story

As a usuário,
I want um dialog de exportação que mostre as opções disponíveis e um preview do mapeamento de variáveis,
so that eu saiba exatamente como minha campanha será exportada.

## Acceptance Criteria

1. **Given** tenho uma campanha pronta
   **When** clico em "Exportar"
   **Then** um dialog abre com as opções de exportação:
   - Instantly (se configurado)
   - Snov.io (se configurado)
   - CSV (sempre disponível)
   - Copiar para Clipboard (sempre disponível)
   **And** cada opção mostra status de conexão (verde/vermelho)
   **And** integrações não configuradas mostram link "Configurar"

2. **Given** seleciono uma opção de exportação
   **When** a opção é expandida
   **Then** vejo um preview do mapeamento de variáveis:
   - `{{first_name}}` → campo correspondente na plataforma
   - `{{ice_breaker}}` → custom variable na plataforma
   **And** vejo quantos leads serão exportados
   **And** vejo aviso se algum lead tem dados incompletos

3. **Given** seleciono leads para exportação
   **When** confirmo a seleção
   **Then** posso escolher entre "Todos os leads da campanha" ou "Selecionar leads"
   **And** leads sem email são automaticamente excluídos com aviso

4. **Given** seleciono Instantly como destino de export
   **When** a opção é expandida
   **Then** vejo a lista de sending accounts configuradas no Instantly
   **And** posso selecionar uma ou mais contas de envio para a campanha
   **And** se nenhuma conta está configurada, vejo aviso: "Nenhuma conta de envio encontrada. Configure no Instantly primeiro."
   **And** a listagem usa o endpoint `GET /api/v2/accounts` do Instantly

5. **Given** seleciono uma plataforma com campanha já exportada anteriormente
   **When** a opção é expandida
   **Then** vejo indicador: "Campanha já exportada em {data}" com opção de re-exportar ou atualizar

## Tasks / Subtasks

- [x] Task 1: Tipos e interfaces do Export Dialog (AC: #1, #2, #4)
  - [x] 1.1 Em `src/types/instantly.ts` — Adicionar tipos: `ListAccountsParams`, `ListAccountsResult`, `InstantlyAccountItem` (reusar `InstantlyAccount` que já existe no service)
  - [x] 1.2 Em `src/types/export.ts` — Adicionar interface `ExportDialogPlatformOption` com campos: platform, displayName, configured, connectionStatus, exportRecord
  - [x] 1.3 Em `src/types/export.ts` — Adicionar interface `LeadExportSummary` com campos: totalLeads, leadsWithEmail, leadsWithoutEmail, leadsWithoutIcebreaker

- [x] Task 2: Expanding InstantlyService com listAccounts (AC: #4)
  - [x] 2.1 Em `src/lib/services/instantly.ts` — Adicionar método `listAccounts(params: ListAccountsParams): Promise<ListAccountsResult>`
  - [x] 2.2 O método usa `GET ${INSTANTLY_API_BASE}${INSTANTLY_ACCOUNTS_ENDPOINT}?limit=100` (mesmo endpoint do testConnection, com limit maior)
  - [x] 2.3 Mover `InstantlyAccount` e `InstantlyAccountsResponse` de interfaces locais do service para `src/types/instantly.ts` (exportar como `InstantlyAccountItem` e `ListAccountsResponse`)
  - [x] 2.4 Adaptar `testConnection` para usar os tipos exportados

- [x] Task 3: API Route para listar accounts (AC: #4)
  - [x] 3.1 Criar `src/app/api/instantly/accounts/route.ts` — GET handler
  - [x] 3.2 Seguir padrão das rotas existentes (`src/app/api/instantly/campaign/route.ts`): auth via `getApiKeyForService()`, proxy para InstantlyService
  - [x] 3.3 Retornar array de accounts com email, first_name, last_name

- [x] Task 4: Hook useSendingAccounts (AC: #4)
  - [x] 4.1 Criar `src/hooks/use-sending-accounts.ts`
  - [x] 4.2 Implementar: fetch da API route `/api/instantly/accounts`, estado loading/error, cache dos resultados
  - [x] 4.3 Retornar: `{ accounts, isLoading, error, refetch }`

- [x] Task 5: Hook useCampaignExport (AC: #1, #2, #3, #5)
  - [x] 5.1 Criar `src/hooks/use-campaign-export.ts`
  - [x] 5.2 Implementar lógica de: calcular plataformas disponíveis (configs de integração), calcular resumo de leads (com/sem email, com/sem icebreaker), buscar export record anterior (via server action que chama campaign-export-repository)
  - [x] 5.3 Retornar: `{ platformOptions, leadSummary, previousExport, isLoading }`

- [x] Task 6: Componente ExportDialog (AC: #1, #3, #5)
  - [x] 6.1 Criar `src/components/builder/ExportDialog.tsx`
  - [x] 6.2 Props: `open, onOpenChange, campaignId, campaignName, blocks (BuilderBlock[]), leads (Lead[])`
  - [x] 6.3 Layout: shadcn/ui Dialog com DialogContent `max-w-2xl`
  - [x] 6.4 Seção 1: Lista de plataformas como cards clicáveis (radio-like), cada um com: ícone, nome, status badge (Conectado/Não configurado), link "Configurar" se não configurado
  - [x] 6.5 Seção 2: Quando plataforma selecionada, mostrar ExportPreview expandido
  - [x] 6.6 Seção 3: Indicador de export anterior se `previousExport` existe ("Campanha já exportada em {data}" com ações: "Re-exportar" ou "Atualizar")
  - [x] 6.7 Footer: Botão "Cancelar" + Botão "Exportar para {plataforma}" (disabled até plataforma selecionada + validação ok)
  - [x] 6.8 O Dialog NÃO executa o export — apenas coleta as seleções e chama `onExport(config)` callback. A orquestração será Stories 7.5/7.6/7.7

- [x] Task 7: Componente ExportPreview (AC: #2, #3)
  - [x] 7.1 Criar `src/components/builder/ExportPreview.tsx`
  - [x] 7.2 Props: `platform (ExportPlatform), leads (Lead[]), blocks (BuilderBlock[])`
  - [x] 7.3 Seção "Mapeamento de Variáveis": Tabela mostrando variáveis usadas nos emails → mapeamento para plataforma (usar `getVariables()` + `mapVariableForPlatform()`)
  - [x] 7.4 Seção "Resumo de Leads": Total, com email, sem email (excluídos), sem icebreaker (aviso)
  - [x] 7.5 Seção "Preview de Email": Primeiro email com variáveis como placeholders (reusar `renderTextWithVariablePlaceholders()` do PreviewEmailStep)

- [x] Task 8: Componente SendingAccountSelector (AC: #4)
  - [x] 8.1 Criar `src/components/builder/SendingAccountSelector.tsx`
  - [x] 8.2 Props: `accounts (InstantlyAccountItem[]), selectedAccounts (string[]), onSelectionChange, isLoading`
  - [x] 8.3 Lista de accounts com checkbox (multi-select), mostrando email de cada conta
  - [x] 8.4 Estado vazio: "Nenhuma conta de envio encontrada. Configure no Instantly primeiro."
  - [x] 8.5 Renderizar dentro do ExportPreview quando platform === "instantly"

- [x] Task 9: Integrar ExportDialog no Builder (AC: #1)
  - [x] 9.1 Identificar onde o botão "Exportar" já existe (ou deve ser adicionado) no builder — provavelmente no header ou footer do campaign builder
  - [x] 9.2 Adicionar state `exportDialogOpen` e renderizar `<ExportDialog>` no componente pai
  - [x] 9.3 Passar leads da campanha e blocks do builder store

- [x] Task 10: Testes unitários
  - [x] 10.1 `__tests__/unit/lib/services/instantly.test.ts` — Expandir: testes para `listAccounts()` (sucesso, erro, accounts vazias) — ~4 testes
  - [x] 10.2 `__tests__/unit/hooks/use-sending-accounts.test.ts` — Hook tests: loading, sucesso, erro, refetch — ~5 testes
  - [x] 10.3 `__tests__/unit/hooks/use-campaign-export.test.ts` — Hook tests: plataformas disponíveis, lead summary, previous export — ~6 testes
  - [x] 10.4 `__tests__/unit/components/builder/ExportDialog.test.tsx` — Render, seleção de plataforma, status badges, export anterior indicator — ~8 testes
  - [x] 10.5 `__tests__/unit/components/builder/ExportPreview.test.tsx` — Mapeamento de variáveis, resumo de leads, preview de email — ~6 testes
  - [x] 10.6 `__tests__/unit/components/builder/SendingAccountSelector.test.tsx` — Multi-select, estado vazio, loading — ~5 testes
  - [x] 10.7 `__tests__/unit/types/export.test.ts` — Expandir: testes para novos tipos (ExportDialogPlatformOption, LeadExportSummary) — ~3 testes

## Dev Notes

### Contexto Crítico

Esta é a story de **UI** do epic de export. Conecta toda a infraestrutura construída nas Stories 7.1-7.3.1 em uma interface visual. O Dialog NÃO executa o export real — apenas coleta seleções do usuário (plataforma, sending accounts, leads) e delega para as Stories 7.5/7.6/7.7 via callback.

Referência: **Lacuna Crítica #2** do documento de pesquisa (`_bmad-output/planning-artifacts/research/instantly-integration-ideas-2026-02-06.md`) — sem sending accounts o deploy pode falhar silenciosamente.

### Infraestrutura Já Disponível (NÃO recriar)

| O que | Onde | API |
|-------|------|-----|
| Variable Registry (4 variáveis) | `src/lib/export/variable-registry.ts` | `getVariables()`, `mapVariableForPlatform(name, platform)`, `getPlatformMapping(platform)` |
| Motor de substituição | `src/lib/export/resolve-variables.ts` | `resolveEmailVariables(input, lead)` |
| Export tracking (DB) | `src/lib/services/campaign-export-repository.ts` | `hasBeenExported()`, `getExportRecord()`, `findByExternalId()` |
| InstantlyService | `src/lib/services/instantly.ts` | `testConnection()`, `createCampaign()`, `addLeadsToCampaign()` |
| SnovioService | `src/lib/services/snovio.ts` | `testConnection()`, `createProspectList()`, `addProspectsToList()` |
| Integration config hook | `src/hooks/use-integration-config.ts` | `configs`, `testConnection(name)`, estados: not_configured/configured/connected/error |
| Preview de variáveis | `src/components/builder/PreviewEmailStep.tsx` | `renderTextWithVariablePlaceholders()` com placeholders em itálico |
| Builder store | `src/stores/use-builder-store.ts` | `blocks`, `leadCount`, `previewLead`, `productId` |
| Campaign types com export | `src/types/campaign.ts` | `Campaign.externalCampaignId`, `.exportPlatform`, `.exportedAt`, `.exportStatus` |
| Export types | `src/types/export.ts` | `ExportPlatform`, `ExportStatus`, `RemoteExportPlatform`, `ExportRecord`, `PersonalizationVariable` |

### Instantly Accounts API — Detalhes Técnicos

O `testConnection()` **já usa** `GET /api/v2/accounts?limit=1` para validar a API key. Para listar accounts, basta usar o mesmo endpoint com `limit=100`.

**Tipos existentes no service (mover para types/instantly.ts):**
```typescript
// Atualmente em src/lib/services/instantly.ts (bottom, local interfaces)
interface InstantlyAccount {
  email: string;
  first_name?: string;
  last_name?: string;
}

interface InstantlyAccountsResponse {
  items: InstantlyAccount[];
  total_count: number;
}
```

**Constante já definida:** `INSTANTLY_ACCOUNTS_ENDPOINT = "/api/v2/accounts"` (linha 41 do service).

**Autenticação:** Bearer token no header `Authorization` — já encapsulada em `buildAuthHeaders(apiKey)`.

### Mapeamento de Variáveis por Plataforma (Referência Rápida)

| Variável | Instantly | Snov.io | CSV |
|----------|-----------|---------|-----|
| `first_name` | `{{first_name}}` | `{{firstName}}` | coluna `first_name` |
| `company_name` | `{{company_name}}` | `{{companyName}}` | coluna `company_name` |
| `title` | `{{title}}` | `{{title}}` | coluna `title` |
| `ice_breaker` | `{{ice_breaker}}` | `{{iceBreaker}}` | coluna `ice_breaker` |

### Padrão de Dialog no Projeto

Referência: `src/components/builder/AddLeadsDialog.tsx`

```typescript
interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // ... props específicas
}

export function ExportDialog({ open, onOpenChange, ... }: ExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar Campanha</DialogTitle>
          <DialogDescription>Selecione uma plataforma e revise o mapeamento.</DialogDescription>
        </DialogHeader>
        {/* content */}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button>Exportar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**OBRIGATÓRIO:** Incluir `<DialogDescription>` para acessibilidade Radix (sem ele gera warning no console).

### Padrão de Integration Status

Referência: `src/components/settings/IntegrationCard.tsx`

Status badges disponíveis via `useIntegrationConfig()`:
- `not_configured` → badge vermelho "Não configurado" + link "Configurar"
- `configured` → badge amarelo "Configurado"
- `connected` → badge verde "Conectado"
- `error` → badge vermelho "Erro" + mensagem

Para verificar se Instantly/Snov.io estão configurados:
```typescript
const { configs } = useIntegrationConfig();
const instantlyConfigured = configs.instantly?.status !== "not_configured";
const snovioConfigured = configs.snovio?.status !== "not_configured";
```

### Padrão de API Routes (Instantly)

Referência: `src/app/api/instantly/campaign/route.ts`

Padrão compartilhado (auth + proxy):
1. Extrair auth do request
2. Obter API key via `getApiKeyForService("instantly")`
3. Instanciar `InstantlyService()` e chamar método
4. Retornar `NextResponse.json(result)`

### Padrão de Hooks de Data Fetching

Hooks usam `fetch()` para chamar API routes do Next.js:
```typescript
const response = await fetch("/api/instantly/accounts");
const data = await response.json();
```

Padrão com `useState` + `useEffect` para fetch inicial, ou `useCallback` para fetch on-demand.

### Scan de Variáveis nos Emails (para ExportPreview)

Para determinar quais variáveis são usadas na campanha, scan os blocks:
```typescript
const usedVarNames = new Set<string>();
blocks.filter(b => b.type === "email").forEach(block => {
  const text = `${block.data.subject || ""} ${block.data.body || ""}`;
  const matches = text.match(/\{\{(\w+)\}\}/g);
  matches?.forEach(m => usedVarNames.add(m.slice(2, -2)));
});
```

Depois cruze com `getVariables()` para obter labels e mapeamentos.

### Verificação de Export Anterior (AC: #5)

O `campaign-export-repository` opera server-side com Supabase client. Para consumir do Dialog (client-side), criar um server action ou API route que:
1. Recebe `campaignId`
2. Chama `getExportRecord(supabaseClient, campaignId)`
3. Retorna o `ExportRecord` (ou null)

Alternativa: se a `Campaign` já é carregada com todos os campos (incluindo export), basta ler `campaign.exportPlatform` e `campaign.exportedAt` do objeto já disponível.

### Tailwind CSS v4 — Lembrete Crítico

**USAR**: `<div className="flex flex-col gap-2">` para todos os wrappers label+input/select.
**NÃO USAR**: `space-y-*` — não funciona com componentes Radix UI.

### Escopo Claro — O Que NÃO Fazer

- **NÃO** executar export real (é callback para Stories 7.5/7.6/7.7)
- **NÃO** implementar validação pré-export avançada (será Story 7.8)
- **NÃO** implementar export CSV/clipboard (será Story 7.7) — apenas mostrar a opção no dialog
- **NÃO** criar schedule configurável — usar default fixo (horário comercial BR)
- **NÃO** modificar o builder store — o Dialog recebe dados via props
- **NÃO** criar testes E2E/Playwright — apenas testes unitários Vitest

### Project Structure Notes

**Novos Arquivos:**
- `src/components/builder/ExportDialog.tsx`
- `src/components/builder/ExportPreview.tsx`
- `src/components/builder/SendingAccountSelector.tsx`
- `src/hooks/use-campaign-export.ts`
- `src/hooks/use-sending-accounts.ts`
- `src/app/api/instantly/accounts/route.ts`

**Arquivos Modificados:**
- `src/lib/services/instantly.ts` — adicionar `listAccounts()`, mover tipos locais
- `src/types/instantly.ts` — adicionar `ListAccountsParams`, `ListAccountsResult`, `InstantlyAccountItem`, `ListAccountsResponse`
- `src/types/export.ts` — adicionar `ExportDialogPlatformOption`, `LeadExportSummary`
- Componente pai do builder (onde botão "Exportar" será conectado) — adicionar state e render do ExportDialog

**Testes Novos:**
- `__tests__/unit/lib/services/instantly.test.ts` — expandir
- `__tests__/unit/hooks/use-sending-accounts.test.ts`
- `__tests__/unit/hooks/use-campaign-export.test.ts`
- `__tests__/unit/components/builder/ExportDialog.test.tsx`
- `__tests__/unit/components/builder/ExportPreview.test.tsx`
- `__tests__/unit/components/builder/SendingAccountSelector.test.tsx`
- `__tests__/unit/types/export.test.ts` — expandir

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.4]
- [Source: _bmad-output/planning-artifacts/research/instantly-integration-ideas-2026-02-06.md#Lacuna Crítica #2]
- [Source: src/lib/services/instantly.ts — InstantlyService, testConnection, INSTANTLY_ACCOUNTS_ENDPOINT]
- [Source: src/types/instantly.ts — All campaign/lead types]
- [Source: src/types/export.ts — ExportPlatform, PersonalizationVariable, ExportRecord]
- [Source: src/lib/export/variable-registry.ts — getVariables(), mapVariableForPlatform()]
- [Source: src/lib/export/resolve-variables.ts — resolveEmailVariables()]
- [Source: src/lib/services/campaign-export-repository.ts — getExportRecord(), hasBeenExported()]
- [Source: src/components/builder/PreviewEmailStep.tsx — renderTextWithVariablePlaceholders()]
- [Source: src/components/builder/AddLeadsDialog.tsx — Dialog pattern reference]
- [Source: src/hooks/use-integration-config.ts — configs, connectionStatus]
- [Source: src/stores/use-builder-store.ts — blocks, leadCount, previewLead]
- [Source: _bmad-output/implementation-artifacts/7-3-1-persistencia-de-campanhas-exportadas-no-banco.md — Previous story]

### Previous Story Intelligence (Story 7.3.1)

Learnings da Story 7.3.1 (Persistência):
- **DRY types**: Campaign/CampaignRow usam `RemoteExportPlatform`/`ExportStatus` aliases — não duplicar tipos
- **Error propagation**: `hasBeenExported()` retorna `{ exported, error }` (não boolean puro) para prevenir falso negativo em erro DB
- **Mock Supabase**: Usar `createMockSupabase()` de `__tests__/helpers/mock-supabase.ts` para testes que acessam banco
- **Repository pattern**: Recebe `supabaseClient` como parâmetro — não instancia próprio client

### Git Intelligence

Últimos 5 commits:
```
769904c feat(story-7.3.1): campaign export persistence with code review fixes
18d6dc0 feat(story-7.3): Snov.io integration service with code review fixes
d2d80e3 feat(story-7.2): Instantly campaign management service with code review fixes
9c3a495 feat(story-7.1): personalization variable system with code review fixes
ecc8de7 chore(epic-7): initialize epic branch and update sprint status
```

Padrão de commit: `feat(story-7.X): descrição com code review fixes`.
Todas as stories 7.1-7.3.1 adicionaram testes extensivos e passaram code review.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A

### Completion Notes List

- All 10 tasks implemented and tested (10/10 tasks, all subtasks complete)
- Full regression suite: **200 test files, 3572 tests passed, 0 failures**
- Story-specific tests: **122 tests** across 7 test files (up from 114 after code review fixes)
- `useCampaignExport` hook uses minimal `ExportLeadInfo` interface instead of full `Lead` type to accept both `Lead` and `CampaignLeadWithLead.lead` shapes
- Consolidated duplicate `useCampaignLeads` call in `page.tsx` during integration
- ExportDialog does NOT execute export — collects config and delegates via `onExport(config)` callback (scope boundary with Stories 7.5/7.6/7.7)
- Removed legacy local types (`InstantlyAccount`, `InstantlyAccountsResponse`) from instantly.ts service, moved to `types/instantly.ts` as `InstantlyAccountItem` / `ListAccountsResponse`

**Code Review Fixes Applied (1 CRITICAL, 2 HIGH, 4 MEDIUM, 3 LOW):**
- **C1 (CRITICAL)**: Task 7.5 marked [x] but email preview section never rendered — exported `renderTextWithVariablePlaceholders()` from PreviewEmailStep and added email preview section in ExportPreview
- **H1 (HIGH)**: AC #3 lead selection UI missing — added "Todos os leads" / "Selecionar leads" toggle buttons in ExportDialog, included `leadSelection` in ExportConfig
- **H2 (HIGH)**: AC #5 re-export/update actions missing — added "Re-exportar" and "Atualizar" action buttons on previous export indicator, included `exportMode` in ExportConfig
- **M1 (MEDIUM)**: useSendingAccounts fetched unconditionally — added `enabled` parameter, ExportDialog passes `enabled: selectedPlatform === "instantly"`
- **M2 (MEDIUM)**: Dialog state persisted between opens — added useEffect to reset state when `open` toggles to true
- **M3 (MEDIUM)**: `campaignId` prop was dead code — now included in ExportConfig passed to onExport callback
- **M4 (MEDIUM)**: Duplicate ExportRecord construction in useCampaignExport — refactored to single `previousExport` memo shared by `platformOptions`
- **L2 (LOW)**: Type error in test — removed invalid `id` property from `createLead()` calls
- **L3 (LOW)**: Unrealistic test fixture — Clipboard now configured/connected, Snov.io now not_configured

### Change Log

- `src/types/instantly.ts` — Added `InstantlyAccountItem`, `ListAccountsResponse`, `ListAccountsParams`, `ListAccountsResult`
- `src/types/export.ts` — Added `PlatformConnectionStatus`, `ExportDialogPlatformOption`, `LeadExportSummary`
- `src/lib/services/instantly.ts` — Added `listAccounts()` method, migrated local types to types/instantly.ts, adapted `testConnection` to use exported types
- `src/app/api/instantly/accounts/route.ts` — NEW: GET handler for listing Instantly sending accounts
- `src/hooks/use-sending-accounts.ts` — NEW: Client hook for fetching Instantly accounts. CR fix: added `enabled` parameter for conditional fetching
- `src/hooks/use-campaign-export.ts` — NEW: Hook computing export dialog state (platform options, lead summary, previous export). CR fix: deduplicated ExportRecord computation
- `src/components/builder/ExportDialog.tsx` — NEW: Main export dialog with platform selection, preview, and sending accounts. CR fixes: lead selection UI, re-export/update actions, state reset on reopen, campaignId in ExportConfig
- `src/components/builder/ExportPreview.tsx` — NEW: Variable mapping table and lead summary display. CR fix: added email preview section using renderTextWithVariablePlaceholders
- `src/components/builder/PreviewEmailStep.tsx` — CR fix: exported `renderTextWithVariablePlaceholders()` function for reuse in ExportPreview
- `src/components/builder/SendingAccountSelector.tsx` — NEW: Multi-select checkbox list for Instantly sending accounts
- `src/components/builder/index.ts` — Added barrel exports for ExportDialog, ExportPreview, SendingAccountSelector
- `src/components/builder/BuilderHeader.tsx` — Added "Exportar" button with Upload icon between Preview and Save
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Integrated ExportDialog, consolidated useCampaignLeads calls, added export state/handlers

### File List

**New Files:**
- `src/app/api/instantly/accounts/route.ts`
- `src/hooks/use-sending-accounts.ts`
- `src/hooks/use-campaign-export.ts`
- `src/components/builder/ExportDialog.tsx`
- `src/components/builder/ExportPreview.tsx`
- `src/components/builder/SendingAccountSelector.tsx`
- `__tests__/unit/hooks/use-sending-accounts.test.ts`
- `__tests__/unit/hooks/use-campaign-export.test.ts`
- `__tests__/unit/components/builder/ExportDialog.test.tsx`
- `__tests__/unit/components/builder/ExportPreview.test.tsx`
- `__tests__/unit/components/builder/SendingAccountSelector.test.tsx`

**Modified Files:**
- `src/types/instantly.ts`
- `src/types/export.ts`
- `src/lib/services/instantly.ts`
- `src/components/builder/index.ts`
- `src/components/builder/BuilderHeader.tsx`
- `src/components/builder/PreviewEmailStep.tsx` — CR: exported renderTextWithVariablePlaceholders
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx`
- `__tests__/unit/types/export.test.ts`
- `__tests__/unit/lib/services/instantly.test.ts`
