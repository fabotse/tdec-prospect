# Story 7.5: Export to Instantly - Fluxo Completo

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário,
I want exportar minha campanha para o Instantly com um clique,
so that eu possa iniciar o envio de emails imediatamente.

## Acceptance Criteria

1. **Given** selecionei Instantly como destino
   **When** clico "Exportar para Instantly"
   **Then** o fluxo executa em sequência:
   1. Valida dados pré-deploy (leads, emails, sending accounts)
   2. Cria campanha no Instantly com nome e sequência de emails
   3. Associa sending accounts selecionadas à campanha
   4. Mapeia variáveis internas → tags do Instantly
   5. Envia leads com custom variables (ice_breaker, dados do lead)
   **And** vejo progress indicator com etapa atual
   **And** cada etapa mostra feedback (validando... criando campanha... enviando leads...)

2. **Given** a exportação completa com sucesso
   **When** todas as etapas finalizam
   **Then** vejo toast de sucesso "Campanha exportada para Instantly" com contagem de leads
   **And** vejo link "Abrir no Instantly" para acessar a campanha criada

3. **Given** a exportação falha em qualquer etapa
   **When** o erro é detectado
   **Then** o Deployment Service trata a falha com compensação:
   - Se criação da campanha falha → nada a reverter, exibe erro
   - Se adição de leads falha parcialmente → contagem parcial exibida, status `partial_failure`
   - Se ativação falha → campanha existe com leads mas inativa, opção "Ativar manualmente"
   **And** vejo mensagem de erro em português com a etapa específica que falhou
   **And** vejo opções: "Tentar Novamente" ou "Exportar CSV" como fallback
   **And** o fallback manual (CSV/clipboard) está sempre disponível

4. **Given** o fluxo de export é iniciado
   **When** o Deployment Service executa
   **Then** valida antes de começar:
   - Pelo menos 1 lead com email válido
   - Campanha tem pelo menos 1 email block completo (subject + body)
   - Sending account selecionada
   **And** se validação falha, exibe resumo de problemas e não inicia o export
   **And** problemas não-bloqueantes (leads sem ice_breaker) exibem aviso mas permitem continuar

5. **Given** o export completa (sucesso ou parcial)
   **When** o Deployment Service finaliza
   **Then** persiste o vínculo no banco via campos da Story 7.3.1:
   - `external_campaign_id` = ID da campanha criada no Instantly
   - `export_platform` = 'instantly'
   - `exported_at` = timestamp atual
   - `export_status` = 'success' | 'partial_failure' | 'failed'

## Tasks / Subtasks

- [x] Task 1: Tipos de deployment e validação (AC: #1, #3, #4, #5)
  - [x] 1.1 Em `src/types/export.ts` — Adicionar tipo `DeploymentStepId` = `"validate"` | `"create_campaign"` | `"add_accounts"` | `"add_leads"` | `"activate"` | `"persist"`
  - [x] 1.2 Em `src/types/export.ts` — Adicionar interface `DeploymentStep` com: `id: DeploymentStepId`, `label: string`, `status: "pending" | "running" | "success" | "failed" | "skipped"`, `error?: string`, `detail?: string`
  - [x] 1.3 Em `src/types/export.ts` — Adicionar interface `DeploymentResult` com: `success: boolean`, `externalCampaignId?: string`, `leadsUploaded?: number`, `duplicatedLeads?: number`, `steps: DeploymentStep[]`, `error?: string`
  - [x] 1.4 Em `src/types/export.ts` — Adicionar interface `PreDeployValidationResult` com: `valid: boolean`, `errors: string[]` (bloqueantes), `warnings: string[]` (não-bloqueantes)
  - [x] 1.5 Mover `ExportConfig`, `LeadSelection`, `ExportMode` do `ExportDialog.tsx` para `src/types/export.ts` — são tipos compartilhados usados pelo hook de export (o ExportDialog deve importar de `@/types/export`)

- [x] Task 2: Função de conversão blocks → sequences (AC: #1)
  - [x] 2.1 Criar `src/lib/export/blocks-to-sequences.ts` — Função `blocksToInstantlySequences(blocks: BuilderBlock[]): Array<{ subject: string; body: string; delayDays: number }>`
  - [x] 2.2 Lógica: percorrer blocks em ordem de posição; para cada email block, extrair subject + body; para delays entre emails, acumular delayDays; primeiro email sempre delayDays=0
  - [x] 2.3 Mapear variáveis nos templates: para Instantly as variáveis internas `{{first_name}}` mapeiam para `{{first_name}}` (identidade) — mas executar via `mapVariableForPlatform()` para correctness
  - [x] 2.4 Validar: retornar array vazio se nenhum email block válido encontrado

- [x] Task 3: Função de validação pré-deploy (AC: #4)
  - [x] 3.1 Criar `src/lib/export/validate-pre-deploy.ts` — Função `validateInstantlyPreDeploy(params): PreDeployValidationResult`
  - [x] 3.2 Params: `{ blocks: BuilderBlock[], leads: ExportLeadInfo[], sendingAccounts: string[] }`
  - [x] 3.3 Errors (bloqueantes): ≥1 lead com email, ≥1 email block com subject E body preenchidos, ≥1 sending account selecionada
  - [x] 3.4 Warnings (não-bloqueantes): leads sem icebreaker (contagem), email blocks com subject mas sem body ou vice-versa
  - [x] 3.5 Mensagens em português

- [x] Task 4: Expandir InstantlyService com addAccountsToCampaign (AC: #1)
  - [x] 4.1 Pesquisar API Instantly v2 — verificar se `POST /api/v2/campaigns` aceita `account_list` no body, OU se existe endpoint separado `POST /api/v2/campaigns/{id}/accounts`
  - [x] 4.2 Em `src/types/instantly.ts` — Adicionar `AddAccountsParams` (`apiKey`, `campaignId`, `accountEmails: string[]`) e `AddAccountsResult` (`success: boolean`, `accountsAdded: number`)
  - [x] 4.3 Em `src/lib/services/instantly.ts` — Adicionar método `addAccountsToCampaign(params: AddAccountsParams): Promise<AddAccountsResult>` que associa as sending accounts à campanha
  - [x] 4.4 Se a API suportar `account_list` na criação: alternativa é expandir `CreateCampaignParams` com campo opcional `accountList?: string[]` — escolher a abordagem que a API v2 suportar

- [x] Task 5: API Route para associar sending accounts à campanha (AC: #1)
  - [x] 5.1 Criar `src/app/api/instantly/campaign/[id]/accounts/route.ts` — POST handler
  - [x] 5.2 Seguir padrão exato das rotas existentes (auth via `getCurrentUserProfile()`, API key via `api_configs`, proxy para InstantlyService)
  - [x] 5.3 Request body: `{ accountEmails: string[] }`
  - [x] 5.4 Response: `{ success: boolean, accountsAdded: number }`
  - [x] 5.5 Se Task 4 determinar que accounts vão no body do `createCampaign`, esta task é desnecessária — SKIP

- [x] Task 6: API Route para atualizar export status (AC: #5)
  - [x] 6.1 Criar `src/app/api/campaigns/[campaignId]/export-status/route.ts` — PUT handler
  - [x] 6.2 Auth: `createClient()` + `supabase.auth.getUser()` (padrão da rota de campaigns existente)
  - [x] 6.3 Request body (validar com Zod): `{ externalCampaignId?: string, exportPlatform?: RemoteExportPlatform, exportedAt?: string, exportStatus?: ExportStatus }`
  - [x] 6.4 Chamar `updateExportStatus(supabase, campaignId, data)` do `campaign-export-repository.ts`
  - [x] 6.5 Para `clearExportStatus` (re-export como "new"): aceitar body `{ clear: true }` que chama `clearExportStatus()`
  - [x] 6.6 Retornar 200 com `{ success: true }` ou error com mensagem PT-BR

- [x] Task 7: Hook useInstantlyExport — orquestração client-side (AC: #1, #2, #3, #5)
  - [x] 7.1 Criar `src/hooks/use-instantly-export.ts`
  - [x] 7.2 Interface do hook:
    ```typescript
    function useInstantlyExport(): {
      steps: DeploymentStep[];
      isExporting: boolean;
      result: DeploymentResult | null;
      exportToInstantly: (params: {
        config: ExportConfig;
        campaignName: string;
        blocks: BuilderBlock[];
        leads: ExportLeadInfo[];
      }) => Promise<DeploymentResult>;
      reset: () => void;
    }
    ```
  - [x] 7.3 Inicializar steps com 6 etapas: Validação, Criar Campanha, Associar Accounts, Enviar Leads, Ativar Campanha, Salvar Registro — todas "pending"
  - [x] 7.4 Lógica de orquestração sequencial:
    - Step 1 ("validate"): Chamar `validateInstantlyPreDeploy()` — se inválido, retornar imediatamente com errors
    - Step 2 ("create_campaign"): POST `/api/instantly/campaign` com sequences convertidas via `blocksToInstantlySequences()`
    - Step 3 ("add_accounts"): POST `/api/instantly/campaign/[id]/accounts` com sendingAccounts — se skip (task 5), marcar como "skipped"
    - Step 4 ("add_leads"): POST `/api/instantly/leads` com campaignId + leads array (já inclui firstName, companyName, title, icebreaker como custom_variables)
    - Step 5 ("activate"): POST `/api/instantly/campaign/[id]/activate` — se falha, campanha fica Draft (compensação: mensagem "Ativar manualmente no Instantly")
    - Step 6 ("persist"): PUT `/api/campaigns/[campaignId]/export-status` com externalCampaignId, platform='instantly', exportedAt, exportStatus
  - [x] 7.5 Re-export mode handling:
    - `exportMode === "new"`: fluxo normal (cria campanha nova)
    - `exportMode === "re-export"`: primeiro PUT clear no export-status, depois fluxo normal
    - `exportMode === "update"`: POST `/api/instantly/leads` na campanha existente (usar `previousExport.externalCampaignId`) — skip criação de campanha e accounts
  - [x] 7.6 Error handling por step: cada falha marca step como "failed" + preenche `error` + steps subsequentes ficam "pending" (não executados)
  - [x] 7.7 `reset()` limpa state (steps volta a pending, result a null)

- [x] Task 8: Integrar no Campaign Edit Page (AC: #1, #2, #3)
  - [x] 8.1 Em `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Importar `useInstantlyExport` hook
  - [x] 8.2 Substituir `handleExportConfirm` placeholder pelo fluxo real:
    - Chamar `exportToInstantly({ config, campaignName, blocks, leads })`
    - Fechar o ExportDialog
  - [x] 8.3 Adicionar estado de deployment progress: enquanto `isExporting`, mostrar progresso (pode ser via toast ou inline no dialog)
  - [x] 8.4 No sucesso: toast com "Campanha exportada para Instantly — {N} leads enviados" + link externo "Abrir no Instantly" (URL: `https://app.instantly.ai/app/campaign/status/{externalCampaignId}`)
  - [x] 8.5 No erro: toast de erro com mensagem PT-BR da etapa que falhou + opção de retry
  - [x] 8.6 No `partial_failure`: toast warning com contagem parcial
  - [x] 8.7 Dispatch apenas para platform === "instantly" — CSV/clipboard/snovio serão Stories 7.6/7.7

- [x] Task 9: Testes unitários (todos os ACs)
  - [x] 9.1 `__tests__/unit/lib/export/blocks-to-sequences.test.ts` — Conversão de blocks para sequences: email blocks, delay blocks, blocks vazios, variáveis preservadas — ~8 testes
  - [x] 9.2 `__tests__/unit/lib/export/validate-pre-deploy.test.ts` — Validação: leads sem email, sem email blocks, sem accounts, warnings icebreaker, tudo válido — ~10 testes
  - [x] 9.3 `__tests__/unit/lib/services/instantly.test.ts` — Expandir: testes para `addAccountsToCampaign()` (sucesso, erro, accounts vazias) — ~4 testes novos
  - [x] 9.4 `__tests__/unit/hooks/use-instantly-export.test.ts` — Hook: fluxo completo sucesso, falha em cada step, re-export mode, update mode, validação pré-deploy falha, partial_failure — ~15 testes
  - [x] 9.5 `__tests__/unit/types/export.test.ts` — Expandir: testes para novos tipos (DeploymentStep, DeploymentResult, PreDeployValidationResult) — ~4 testes
  - [x] 9.6 Se Task 5 criou rota de accounts: `__tests__/unit/app/api/instantly/campaign/accounts.test.ts` — ~4 testes
  - [x] 9.7 `__tests__/unit/app/api/campaigns/export-status.test.ts` — PUT handler: sucesso, clear, auth, validação — ~6 testes

## Dev Notes

### Contexto Crítico

Esta é a story de **ORQUESTRAÇÃO** do epic de export. Conecta toda a infraestrutura das Stories 7.1-7.4 em um fluxo end-to-end funcional. O ExportDialog (7.4) já coleta as configurações do usuário e chama `onExport(config)` — esta story implementa O QUE acontece quando esse callback é chamado para a plataforma Instantly.

**Padrão de arquitetura**: Client-side orchestration via hook que chama API routes sequencialmente. Cada step = 1 API call. Progress é rastreado entre chamadas.

### Infraestrutura Já Disponível (NÃO recriar)

| O que | Onde | API |
|-------|------|-----|
| Variable Registry (4 variáveis) | `src/lib/export/variable-registry.ts` | `getVariables()`, `mapVariableForPlatform(name, platform)` |
| Motor de substituição | `src/lib/export/resolve-variables.ts` | `resolveEmailVariables(input, lead)` |
| Export tracking (DB) | `src/lib/services/campaign-export-repository.ts` | `updateExportStatus()`, `getExportRecord()`, `clearExportStatus()`, `hasBeenExported()` |
| InstantlyService | `src/lib/services/instantly.ts` | `testConnection()`, `createCampaign()`, `addLeadsToCampaign()`, `activateCampaign()`, `getCampaignStatus()`, `listAccounts()` |
| API Routes Instantly | `src/app/api/instantly/` | `POST campaign`, `POST leads`, `GET accounts`, `GET campaign/[id]`, `POST campaign/[id]/activate` |
| ExportDialog UI | `src/components/builder/ExportDialog.tsx` | `ExportConfig` (platform, sendingAccounts, leadSelection, exportMode) |
| useCampaignExport hook | `src/hooks/use-campaign-export.ts` | `platformOptions`, `leadSummary`, `previousExport` |
| Builder store | `src/stores/use-builder-store.ts` | `blocks`, `leadCount`, `previewLead` |
| Campaign types com export | `src/types/campaign.ts` | `Campaign.externalCampaignId`, `.exportPlatform`, `.exportedAt`, `.exportStatus` |
| Campaign CRUD route | `src/app/api/campaigns/[campaignId]/route.ts` | GET, PATCH, DELETE |

### Placeholder Atual (substituir na Task 8)

Em `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx`, linha ~342:
```typescript
// Story 7.4: Export callback (placeholder — real orchestration in Stories 7.5/7.6/7.7)
const handleExportConfirm = () => {
  setIsExportOpen(false);
  toast.success("Configuração de export salva. Implementação do deploy nas próximas stories.");
};
```
Este placeholder DEVE ser substituído pela chamada ao hook `useInstantlyExport`.

### ExportConfig (definida no ExportDialog.tsx — mover para types/export.ts)

```typescript
export type LeadSelection = "all" | "selected";
export type ExportMode = "new" | "re-export" | "update";

export interface ExportConfig {
  campaignId: string;
  platform: ExportPlatform;
  sendingAccounts?: string[];
  leadSelection: LeadSelection;
  exportMode: ExportMode;
}
```

Estes tipos estão em `src/components/builder/ExportDialog.tsx` linhas 34-43. Devem ser movidos para `src/types/export.ts` porque o hook `useInstantlyExport` precisa importá-los. O ExportDialog passa a importar de `@/types/export`.

### Conversão de BuilderBlocks para Instantly Sequences

O builder armazena blocos em ordem de `position`. Exemplo:
```
position 0: email { subject: "Olá {{first_name}}", body: "..." }
position 1: delay { delayValue: 3, delayUnit: "days" }
position 2: email { subject: "Follow-up", body: "..." }
position 3: delay { delayValue: 2, delayUnit: "days" }
position 4: email { subject: "Último contato", body: "..." }
```

Deve converter para:
```typescript
[
  { subject: "Olá {{first_name}}", body: "...", delayDays: 0 },   // 1º email: sem delay
  { subject: "Follow-up", body: "...", delayDays: 3 },             // delay antes
  { subject: "Último contato", body: "...", delayDays: 2 },        // delay antes
]
```

**Regra:** O `delayDays` de um email é o delay do bloco ANTERIOR a ele. Se não há delay block antes, `delayDays = 0`. O primeiro email SEMPRE tem `delayDays = 0`.

### Mapeamento de Variáveis para Instantly

Para Instantly, o mapeamento é **identidade** (nossas variáveis usam o mesmo formato):
| Variável interna | Instantly tag |
|---|---|
| `{{first_name}}` | `{{first_name}}` |
| `{{company_name}}` | `{{company_name}}` |
| `{{title}}` | `{{title}}` |
| `{{ice_breaker}}` | `{{ice_breaker}}` |

A substituição de variáveis para dados reais é feita pelo PRÓPRIO Instantly usando os custom_variables do lead. Os templates de email vão COM variáveis para o Instantly, e os leads vão COM seus dados. O Instantly faz o merge.

### Leads: Formato Esperado pelo InstantlyService

O `addLeadsToCampaign` aceita:
```typescript
interface AddLeadsParams {
  apiKey: string;
  campaignId: string;
  leads: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phone?: string;
    title?: string;
    icebreaker?: string;
  }>;
}
```

O service internamente:
- Filtra leads sem email
- Mapeia para formato Instantly (first_name, last_name, company_name, phone como campos nativos)
- Coloca `title` e `icebreaker` em `custom_variables`
- Envia em batches de 1000 com 150ms delay entre batches

**Não é necessário resolver variáveis nos dados do lead** — eles são dados raw que o Instantly usa para preencher os templates.

### ExportLeadInfo — Interface Mínima do Hook useCampaignExport

O hook `useCampaignExport` usa `ExportLeadInfo[]`:
```typescript
interface ExportLeadInfo {
  email: string | null;
  icebreaker?: string | null;
}
```

Para o `addLeadsToCampaign`, precisamos de MAIS campos (firstName, companyName, etc.). O `useCampaignLeads` retorna leads completos que incluem esses campos. A page edit já tem acesso aos leads completos. Passar os leads completos para o hook de export.

### Sending Accounts — Lacuna a Resolver

O `createCampaign()` existente NÃO inclui sending accounts. A Instantly API v2 requer que accounts sejam associadas à campanha antes da ativação. **PESQUISAR**:

1. Verificar se `POST /api/v2/campaigns` aceita campo `account_list` ou `sending_accounts` no body
2. Se sim: expandir `CreateCampaignParams` e `CreateCampaignRequest` para incluir o campo
3. Se não: usar endpoint separado `POST /api/v2/campaigns/{id}/accounts` (criar novo método no service)

**Referência**: [Instantly API v2 Docs](https://developer.instantly.ai/getting-started/authorization)

### Padrão de API Routes (copiar)

Todas as rotas Instantly seguem o MESMO padrão. Referência: `src/app/api/instantly/campaign/[id]/activate/route.ts`:
1. `getCurrentUserProfile()` para auth
2. `supabase.from("api_configs").select("encrypted_key").eq("tenant_id", ...).eq("service_name", "instantly").single()`
3. `decryptApiKey(config.encrypted_key)`
4. `new InstantlyService().método(params)`
5. `NextResponse.json(result)`

Para a rota de export-status (`src/app/api/campaigns/[campaignId]/export-status/`), usar o padrão da rota campaigns existente: `createClient()` + `supabase.auth.getUser()` + UUID validation + Zod schema.

### Compensação de Erros (AC: #3)

Fluxo de compensação por etapa:
| Step que falha | Estado resultante | Ação de compensação | User feedback |
|---|---|---|---|
| Validação | Nada criado | N/A | Listar erros, manter dialog aberto |
| Criar campanha | Nada criado | N/A | Toast erro + "Verifique sua API key" |
| Associar accounts | Campanha criada, sem accounts | Campanha existe mas sem accounts | Toast erro + "Associe accounts manualmente no Instantly" |
| Enviar leads | Campanha com accounts | Campanha órfã | Toast erro + contagem parcial se batch parcial |
| Ativar | Campanha com leads, Draft | Campanha funcional mas inativa | Toast warning + "Ative manualmente no Instantly" |
| Persistir | Campanha ativa no Instantly | Export funcionou mas registro local falhou | Toast warning + retry persist |

**Importante:** Falha em "Ativar" NÃO é um erro fatal — a campanha está funcional, apenas em Draft. Marcar step como "failed" mas `exportStatus = "success"` (campanha exportada com sucesso, só não ativada).

### Re-export e Update Modes

- **"new"**: Criar nova campanha no Instantly. Fluxo completo.
- **"re-export"**: Limpar registro de export anterior (`clearExportStatus`), criar nova campanha. Fluxo completo.
- **"update"**: Adicionar mais leads à campanha existente. Skip criação de campanha e accounts. Usar `previousExport.externalCampaignId` como campaignId no Instantly.

### Instantly Campaign URL

Para gerar o link "Abrir no Instantly" (AC: #2):
```
https://app.instantly.ai/app/campaign/status/{externalCampaignId}
```

Verificar se esta URL é correta pesquisando na web ou testando manualmente. Se a URL mudar, usar fallback `https://app.instantly.ai`.

### Tailwind CSS v4 — Lembrete Crítico

**USAR**: `<div className="flex flex-col gap-2">` para todos os wrappers label+input/select.
**NÃO USAR**: `space-y-*` — não funciona com componentes Radix UI.

### Escopo Claro — O Que NÃO Fazer

- **NÃO** implementar export Snov.io (será Story 7.6)
- **NÃO** implementar export CSV/clipboard (será Story 7.7)
- **NÃO** implementar validação avançada (será Story 7.8) — apenas validação básica (leads, emails, accounts)
- **NÃO** implementar retry automático com backoff — retry é manual pelo usuário
- **NÃO** criar componente de progress separado — usar toasts ou inline no dialog existente
- **NÃO** modificar a lógica do ExportDialog — apenas mover tipos e wiring do callback
- **NÃO** modificar o InstantlyService.createCampaign existente (exceto se necessário para sending accounts, Task 4)
- **NÃO** criar testes E2E/Playwright — apenas testes unitários Vitest

### Project Structure Notes

**Novos Arquivos:**
- `src/lib/export/blocks-to-sequences.ts` — Conversão blocks → sequences
- `src/lib/export/validate-pre-deploy.ts` — Validação pré-deploy
- `src/hooks/use-instantly-export.ts` — Hook de orquestração
- `src/app/api/campaigns/[campaignId]/export-status/route.ts` — Rota de persistência
- `src/app/api/instantly/campaign/[id]/accounts/route.ts` — Rota de sending accounts (condicional, ver Task 4/5)

**Arquivos Modificados:**
- `src/types/export.ts` — Novos tipos (DeploymentStep, DeploymentResult, PreDeployValidationResult, ExportConfig, LeadSelection, ExportMode)
- `src/types/instantly.ts` — Novos tipos (AddAccountsParams, AddAccountsResult) — condicional Task 4
- `src/lib/services/instantly.ts` — Novo método `addAccountsToCampaign()` — condicional Task 4
- `src/components/builder/ExportDialog.tsx` — Remover definição local de ExportConfig/LeadSelection/ExportMode, importar de `@/types/export`
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Substituir placeholder handleExportConfirm, integrar useInstantlyExport

**Testes Novos:**
- `__tests__/unit/lib/export/blocks-to-sequences.test.ts`
- `__tests__/unit/lib/export/validate-pre-deploy.test.ts`
- `__tests__/unit/hooks/use-instantly-export.test.ts`
- `__tests__/unit/app/api/campaigns/export-status.test.ts`
- `__tests__/unit/app/api/instantly/campaign/accounts.test.ts` (condicional)

**Testes Expandidos:**
- `__tests__/unit/lib/services/instantly.test.ts` — Novos testes para addAccountsToCampaign
- `__tests__/unit/types/export.test.ts` — Novos tipos

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.5]
- [Source: src/lib/services/instantly.ts — InstantlyService (createCampaign, addLeadsToCampaign, activateCampaign)]
- [Source: src/types/instantly.ts — CreateCampaignParams, AddLeadsParams, ActivateCampaignParams]
- [Source: src/types/export.ts — ExportPlatform, ExportStatus, ExportRecord, PersonalizationVariable]
- [Source: src/lib/services/campaign-export-repository.ts — updateExportStatus(), clearExportStatus()]
- [Source: src/lib/export/variable-registry.ts — getVariables(), mapVariableForPlatform()]
- [Source: src/lib/export/resolve-variables.ts — resolveEmailVariables()]
- [Source: src/components/builder/ExportDialog.tsx — ExportConfig, onExport callback]
- [Source: src/hooks/use-campaign-export.ts — platformOptions, leadSummary, previousExport]
- [Source: src/app/api/instantly/campaign/route.ts — POST create campaign pattern]
- [Source: src/app/api/instantly/campaign/[id]/activate/route.ts — POST activate pattern]
- [Source: src/app/api/instantly/leads/route.ts — POST add leads pattern]
- [Source: src/app/api/campaigns/[campaignId]/route.ts — Campaign CRUD patterns (auth, UUID validation, Zod)]
- [Source: src/stores/use-builder-store.ts — BuilderBlock type]

### Previous Story Intelligence (Story 7.4)

Learnings da Story 7.4 (Export Dialog UI):
- **ExportConfig não é exportado para fora do componente** — está definido localmente em ExportDialog.tsx. Precisa mover para types/export.ts para que o hook possa usá-lo
- **ExportLeadInfo é interface mínima** — `useCampaignExport` usa `{ email, icebreaker? }` mas para o Instantly precisamos de mais campos (firstName, companyName, title). Usar lead completo na integração
- **Conditional fetch pattern**: `useSendingAccounts` aceita `enabled` param para evitar fetch desnecessário. Seguir o mesmo padrão no hook de export
- **State reset on dialog close**: O ExportDialog reseta state quando fecha. O hook de export deve ter `reset()` para limpar state entre exports
- **Toast pattern**: projeto usa `toast.success()`, `toast.error()` do sonner/shadcn — importar de `sonner`
- **Code review patterns**: Sempre verificar imports mortos, tipos duplicados, e testes com fixtures realistas

### Git Intelligence

Últimos commits relevantes:
```
157c377 feat(story-7.4): export dialog UI with variable preview and code review fixes
769904c feat(story-7.3.1): campaign export persistence with code review fixes
18d6dc0 feat(story-7.3): Snov.io integration service with code review fixes
d2d80e3 feat(story-7.2): Instantly campaign management service with code review fixes
9c3a495 feat(story-7.1): personalization variable system for export with code review fixes
```

Padrão de commit: `feat(story-7.X): descrição com code review fixes`.
Todas as stories 7.1-7.4 passaram code review rigoroso — patterns estáveis.
Branch atual: `epic/7-campaign-deployment-export`.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Instantly API v2 não aceita `account_list` na criação de campanha. Endpoint separado `POST /api/v2/account-campaign-mappings` usado para associar accounts (Task 4.1)
- WebFetch falhou para docs.instantly.ai (SPA rendering). Resolvido via WebSearch para encontrar endpoint correto
- Task 4.4: API v2 requer endpoint separado — implementado como `addAccountsToCampaign()` com rate limiting (150ms entre requests)
- Task 5.5: Rota de accounts FOI necessária (não SKIP) — criada em `src/app/api/instantly/campaign/[id]/accounts/route.ts`
- Erros TypeScript pré-existentes em mock-data.ts, CampaignCard.test, CampaignList.test, campaign-export-repository.test — todos anteriores à Story 7.5, nenhum introduzido

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-02-06
**Issues Found:** 4 High, 3 Medium, 3 Low → **All HIGH/MEDIUM fixed**

**Fixes Applied:**
- H1: Update mode agora envia `config.externalCampaignId` para API de leads (era undefined)
- H2: Toast de sucesso inclui action "Abrir no Instantly" com link para campanha
- H3: Progress indicator via `toast.loading()` atualiza com label da etapa corrente (useEffect em exportSteps)
- H4: Toast de erro inclui action "Tentar Novamente" + descrição mencionando fallback CSV
- M5: Ternário morto `exportStatus` simplificado para `"success"` direto
- M6: Ternário morto de conversão de delay removido (ambos branches eram idênticos)
- M7: `ExportLeadData` interface criada com campos tipados, removidos `as Record<string, unknown>` casts
- ExportConfig: adicionado campo opcional `externalCampaignId` para update mode
- ExportDialog: passa `previousExport.externalCampaignId` quando exportMode === "update"
- Story File List: corrigido contagem e categorização (export.ts é Modified, não New)

### Completion Notes List

- 9 tasks, 56 subtasks — todos completados
- 143 testes específicos da Story 7.5 (7 arquivos de teste)
- Suite completa: 205 arquivos, 3636 testes passaram, 0 falhas, 2 skipped (pré-existentes)
- Tipos `ExportConfig`, `LeadSelection`, `ExportMode` movidos de ExportDialog.tsx para types/export.ts
- Hook `useInstantlyExport` implementa pipeline sequencial de 6 steps com tratamento de erro por etapa
- Falha em "activate" e "persist" são non-fatal — export é considerado sucesso
- Re-export mode limpa export-status antes de criar nova campanha
- Update mode pula criação de campanha/accounts, envia leads para campanha existente via externalCampaignId

### File List

**Novos Arquivos (5):**
- `src/lib/export/blocks-to-sequences.ts` — Conversão BuilderBlock[] → InstantlySequenceEmail[]
- `src/lib/export/validate-pre-deploy.ts` — Validação pré-deploy (errors + warnings)
- `src/hooks/use-instantly-export.ts` — Hook de orquestração client-side (6 steps), ExportLeadData type
- `src/app/api/instantly/campaign/[id]/accounts/route.ts` — POST handler para associar sending accounts
- `src/app/api/campaigns/[campaignId]/export-status/route.ts` — PUT handler para persistir export status

**Arquivos Modificados (5):**
- `src/types/export.ts` — DeploymentStepId, DeploymentStep, DeploymentResult, PreDeployValidationResult, ExportConfig (com externalCampaignId), LeadSelection, ExportMode
- `src/types/instantly.ts` — AddAccountsParams, AddAccountsResult, AccountCampaignMappingRequest/Response
- `src/lib/services/instantly.ts` — Método addAccountsToCampaign() com rate limiting
- `src/components/builder/ExportDialog.tsx` — Removidos tipos locais, importa de @/types/export, passa externalCampaignId em update mode
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Integração useInstantlyExport, progress toast, link Instantly, retry/fallback

**Outros Modificados:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status atualizado

**Testes Novos (5):**
- `__tests__/unit/lib/export/blocks-to-sequences.test.ts` — 12 testes
- `__tests__/unit/lib/export/validate-pre-deploy.test.ts` — 11 testes
- `__tests__/unit/hooks/use-instantly-export.test.ts` — 15 testes
- `__tests__/unit/app/api/instantly/campaign/accounts.test.ts` — 4 testes
- `__tests__/unit/app/api/campaigns/export-status.test.ts` — 6 testes

**Testes Expandidos (2):**
- `__tests__/unit/lib/services/instantly.test.ts` — +5 testes (54 total)
- `__tests__/unit/types/export.test.ts` — +41 testes (expandido com novos tipos)
