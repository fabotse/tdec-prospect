# Story 7.7: Exportacao Manual - CSV e Clipboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want exportar minha campanha via CSV ou clipboard,
so that eu possa importar manualmente em qualquer ferramenta (Ramper, planilha, etc.).

## Acceptance Criteria

1. **Given** seleciono "Exportar CSV"
   **When** clico na opcao
   **Then** um CSV e gerado com:
   - Uma linha por lead
   - Colunas: email, first_name, company_name, title, ice_breaker, subject_1, body_1, delay_1, subject_2, body_2, delay_2, ...
   - Os emails contem variaveis JA resolvidas por lead (dados reais substituidos)
   **And** o arquivo e baixado automaticamente
   **And** o nome do arquivo segue o padrao: `{campaign_name}-export-{YYYY-MM-DD}.csv`

2. **Given** seleciono "Exportar CSV com Variaveis"
   **When** clico na opcao
   **Then** o CSV mantem as variaveis (`{{first_name}}`, `{{ice_breaker}}`, etc.) sem resolver
   **And** leads sao exportados com seus dados em colunas separadas (email, first_name, company_name, title, ice_breaker)
   **And** emails sao exportados como templates com variaveis intactas
   **And** util para importar diretamente no Instantly/Snov.io via CSV

3. **Given** seleciono "Copiar para Clipboard"
   **When** clico na opcao
   **Then** a campanha e formatada em texto estruturado legivel
   **And** inclui: sequencia de emails com subjects, bodies e delays
   **And** variaveis sao mantidas como `{{first_name}}`, `{{ice_breaker}}`, etc. (template)
   **And** e copiada para o clipboard
   **And** vejo toast "Copiado para clipboard!"

## Tasks / Subtasks

- [x] Task 1: Funcao de geracao de CSV (AC: #1, #2)
  - [x] 1.1 Criar `src/lib/export/generate-csv.ts` com funcao `generateCsvContent(params): string`
  - [x] 1.2 Params: `{ blocks: BuilderBlock[], leads: ExportLeadData[], campaignName: string, resolveVariables: boolean }`
  - [x] 1.3 Extrair sequencia de emails dos blocks usando logica similar a `blocksToInstantlySequences()` (reutilizar ou adaptar)
  - [x] 1.4 Gerar header row: `email,first_name,company_name,title,ice_breaker,subject_1,body_1,delay_days_1,subject_2,body_2,delay_days_2,...`
  - [x] 1.5 Modo `resolveVariables: true` (AC #1): para cada lead, chamar `resolveEmailVariables({ subject, body }, leadRecord)` para cada email na sequencia, gerando conteudo personalizado
  - [x] 1.6 Modo `resolveVariables: false` (AC #2): manter templates com `{{variaveis}}` intactas nos emails; colunas de lead data preenchidas normalmente
  - [x] 1.7 Escapar valores CSV: aspas duplas ao redor de campos que contenham virgula, aspas ou quebra de linha; aspas internas duplicadas (`"` -> `""`)
  - [x] 1.8 Filtrar leads sem email (nao incluir na saida CSV)
  - [x] 1.9 Retornar string CSV completa (com BOM UTF-8 para compatibilidade com Excel)

- [x] Task 2: Funcao de download de arquivo CSV (AC: #1, #2)
  - [x] 2.1 Criar `src/lib/export/download-csv.ts` com funcao `downloadCsvFile(csvContent: string, fileName: string): void`
  - [x] 2.2 Criar Blob com type `text/csv;charset=utf-8` e BOM UTF-8 (`\uFEFF`)
  - [x] 2.3 Criar URL via `URL.createObjectURL(blob)`
  - [x] 2.4 Criar elemento `<a>` invisivel com atributo `download` e nome do arquivo
  - [x] 2.5 Disparar click programatico, depois revogar URL (`URL.revokeObjectURL`)
  - [x] 2.6 Nome do arquivo: `{campaignName}-export-{YYYY-MM-DD}.csv` (sanitizar campaignName: remover caracteres invalidos para nome de arquivo)

- [x] Task 3: Funcao de formatacao para clipboard (AC: #3)
  - [x] 3.1 Criar `src/lib/export/format-clipboard.ts` com funcao `formatCampaignForClipboard(params): string`
  - [x] 3.2 Params: `{ blocks: BuilderBlock[], campaignName: string }`
  - [x] 3.3 Formato de saida legivel:
    ```
    === {campaignName} ===

    --- Email 1 ---
    Assunto: {subject}

    {body}

    --- Delay: {N} dias ---

    --- Email 2 ---
    Assunto: {subject}

    {body}

    --- Delay: {N} dias ---

    --- Email 3 ---
    ...
    ```
  - [x] 3.4 Manter variaveis como `{{first_name}}`, `{{ice_breaker}}` sem resolver (template para uso manual)
  - [x] 3.5 Extrair sequencia de emails dos blocks usando logica similar a Task 1.3
  - [x] 3.6 Retornar string formatada

- [x] Task 4: Funcao de validacao pre-export para CSV/Clipboard (AC: #1, #2, #3)
  - [x] 4.1 Criar `src/lib/export/validate-csv-export.ts` com funcao `validateCsvExport(params): PreDeployValidationResult`
  - [x] 4.2 Params: `{ blocks: BuilderBlock[], leads: ExportLeadInfo[] }` (sem sendingAccounts — nao necessario para CSV/clipboard)
  - [x] 4.3 Errors (bloqueantes): nenhum lead com email valido, nenhum email block com subject E body preenchidos
  - [x] 4.4 Warnings (nao-bloqueantes): leads sem icebreaker (contagem), email blocks com subject mas sem body ou vice-versa
  - [x] 4.5 Para Clipboard: nao exigir leads (pode copiar template sem leads) — validar apenas email blocks
  - [x] 4.6 Mensagens em portugues

- [x] Task 5: Hook useCsvClipboardExport — orquestracao client-side (AC: #1, #2, #3)
  - [x] 5.1 Criar `src/hooks/use-csv-clipboard-export.ts`
  - [x] 5.2 Interface do hook:
    ```typescript
    function useCsvClipboardExport(): {
      isExporting: boolean;
      exportToCsv: (params: CsvExportParams) => Promise<CsvExportResult>;
      exportToCsvWithVariables: (params: CsvExportParams) => Promise<CsvExportResult>;
      exportToClipboard: (params: ClipboardExportParams) => Promise<ClipboardExportResult>;
    }
    ```
  - [x] 5.3 `CsvExportParams`: `{ blocks: BuilderBlock[], leads: ExportLeadData[], campaignName: string }`
  - [x] 5.4 `ClipboardExportParams`: `{ blocks: BuilderBlock[], campaignName: string }`
  - [x] 5.5 `CsvExportResult`: `{ success: boolean, rowCount: number, error?: string }`
  - [x] 5.6 `ClipboardExportResult`: `{ success: boolean, error?: string }`
  - [x] 5.7 `exportToCsv`: validar -> gerar CSV (resolvido) -> download -> retornar resultado
  - [x] 5.8 `exportToCsvWithVariables`: validar -> gerar CSV (com variaveis) -> download -> retornar resultado
  - [x] 5.9 `exportToClipboard`: validar (apenas blocks) -> formatar -> `copyToClipboard()` do `src/lib/utils/clipboard.ts` -> retornar resultado

- [x] Task 6: Adicionar opcao "CSV com Variaveis" ao ExportDialog (AC: #2)
  - [x] 6.1 Em `src/components/builder/ExportDialog.tsx` — Quando plataforma CSV selecionada, mostrar toggle/radio: "CSV Resolvido" vs "CSV com Variaveis"
  - [x] 6.2 Adicionar campo `csvMode?: "resolved" | "with_variables"` no `ExportConfig` (em `src/types/export.ts`)
  - [x] 6.3 O toggle so aparece quando `selectedPlatform === "csv"` — para clipboard/instantly/snovio nao se aplica
  - [x] 6.4 Default: "resolved" (CSV com dados reais do lead — caso mais comum)

- [x] Task 7: Integrar no Campaign Edit Page (AC: #1, #2, #3)
  - [x] 7.1 Em `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Importar `useCsvClipboardExport` hook
  - [x] 7.2 Substituir placeholder nas linhas 429-433 (`else` block do `handleExportConfirm`) pelo fluxo real:
    - Se `config.platform === "csv"`: chamar `exportToCsv()` ou `exportToCsvWithVariables()` conforme `config.csvMode`
    - Se `config.platform === "clipboard"`: chamar `exportToClipboard()`
    - Se `config.platform === "snovio"`: manter placeholder (Story 7.6)
  - [x] 7.3 CSV sucesso: toast com "Campanha exportada — {N} leads em CSV" + nome do arquivo
  - [x] 7.4 CSV erro: toast de erro com mensagem PT-BR
  - [x] 7.5 Clipboard sucesso: o toast ja e feito pela funcao `copyToClipboard()` existente — adicionar toast customizado com contagem de emails: "Campanha copiada — {N} emails na sequencia"
  - [x] 7.6 Clipboard erro: toast de erro
  - [x] 7.7 Fechar ExportDialog antes de processar (`setIsExportOpen(false)`)

- [x] Task 8: Testes unitarios (todos os ACs)
  - [x] 8.1 `__tests__/unit/lib/export/generate-csv.test.ts` — Geracao CSV: modo resolvido, modo com variaveis, escape de caracteres especiais, leads sem email filtrados, multiplos emails na sequencia, BOM UTF-8, campanha vazia — 15 testes
  - [x] 8.2 `__tests__/unit/lib/export/download-csv.test.ts` — Download: criacao de blob, elemento anchor, nome do arquivo, sanitizacao de nome, revokeObjectURL — 10 testes
  - [x] 8.3 `__tests__/unit/lib/export/format-clipboard.test.ts` — Formatacao clipboard: emails com delays, sem delays, variaveis preservadas, campanha com 1 email, campanha com multiplos emails — 6 testes
  - [x] 8.4 `__tests__/unit/lib/export/validate-csv-export.test.ts` — Validacao: sem leads com email, sem email blocks, warnings icebreaker, clipboard sem leads ok, tudo valido — 10 testes
  - [x] 8.5 `__tests__/unit/hooks/use-csv-clipboard-export.test.ts` — Hook: CSV resolvido sucesso, CSV com variaveis sucesso, clipboard sucesso, validacao falha, erro no download, erro no clipboard — 9 testes
  - [x] 8.6 `__tests__/unit/components/builder/ExportDialog.test.tsx` — Expandir: toggle CSV resolvido/variaveis aparece ao selecionar CSV, nao aparece para outras plataformas — 3 testes novos

## Dev Notes

### Contexto Critico

Esta e a story de **EXPORTACAO LOCAL** do epic de export. Implementa CSV download e clipboard copy — funcionalidades que NAO dependem de APIs externas e devem funcionar SEMPRE, independente de conexao ou configuracao de integracao. Sao o fallback universal para todas as plataformas e tambem servem como alternativa primaria para ferramentas nao integradas (Ramper, planilhas, etc.).

**Diferenca fundamental vs Stories 7.5/7.6**: Nao ha orquestracao multi-step com API calls. CSV e clipboard sao operacoes locais, sincronas (gerar string -> download/copy). Nao ha persistencia no banco, nao ha tracking de export status.

### Infraestrutura Ja Disponivel (NAO recriar)

| O que | Onde | API |
|-------|------|-----|
| Variable Registry (4 variaveis) | `src/lib/export/variable-registry.ts` | `getVariables()`, `mapVariableForPlatform(name, platform)` |
| Motor de substituicao | `src/lib/export/resolve-variables.ts` | `resolveEmailVariables(input, lead)` |
| Conversao blocks -> sequences | `src/lib/export/blocks-to-sequences.ts` | `blocksToInstantlySequences(blocks)` — retorna `{ subject, body, delayDays }[]` |
| Clipboard utility | `src/lib/utils/clipboard.ts` | `copyToClipboard(text)` — com fallback para browsers antigos + toast automatico |
| ExportDialog UI | `src/components/builder/ExportDialog.tsx` | Platform selection, lead summary, `onExport(config)` callback |
| useCampaignExport hook | `src/hooks/use-campaign-export.ts` | `platformOptions` (CSV/Clipboard sempre `configured: true`) |
| Builder store | `src/stores/use-builder-store.ts` | `blocks: BuilderBlock[]` |
| Campaign leads | `src/hooks/use-campaign-leads.ts` | Retorna `{ lead: Lead }[]` com dados completos |
| Export types | `src/types/export.ts` | `ExportConfig`, `ExportPlatform`, `PreDeployValidationResult`, `ExportLeadInfo` |
| Pre-deploy validation | `src/lib/export/validate-pre-deploy.ts` | `validateInstantlyPreDeploy()` — padrao de referencia para validacao similar |

### Placeholder Atual (substituir na Task 7)

Em `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx`, linhas 429-433:
```typescript
} else {
  // CSV/clipboard/snovio — Stories 7.6/7.7
  setIsExportOpen(false);
  toast.success("Configuracao de export salva. Implementacao do deploy nas proximas stories.");
}
```
Este placeholder DEVE ser substituido pela logica de CSV/clipboard. O branch do Snov.io (Story 7.6) deve manter placeholder separado.

### Reutilizacao de blocksToInstantlySequences

A funcao `blocksToInstantlySequences()` em `src/lib/export/blocks-to-sequences.ts` ja faz exatamente o que precisamos: percorre blocks por posicao, extrai subject/body de email blocks, acumula delays. O retorno `InstantlySequenceEmail[]` com `{ subject, body, delayDays }` e o formato ideal para gerar tanto CSV quanto clipboard.

**Recomendacao**: Reutilizar diretamente `blocksToInstantlySequences()` nas funcoes de geracao CSV e clipboard. O nome contem "Instantly" mas a logica e generica. Se necessario, pode ser renomeado para `blocksToEmailSequences()` ou simplesmente reutilizado como esta (a funcao e pura, sem side-effects).

### ExportLeadData — Interface para Leads no Export

O hook `useInstantlyExport` define `ExportLeadData` (em `src/hooks/use-instantly-export.ts`):
```typescript
interface ExportLeadData {
  email: string | undefined;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  title?: string;
  icebreaker?: string;
}
```

A page edit ja mapeia `campaignLeadsForExport` para este formato (linhas 363-370). Reutilizar o MESMO mapeamento para CSV export. Importar ou replicar o tipo no hook de CSV.

### Formato CSV — Especificacao Detalhada

**Header (dinamico baseado no numero de emails na sequencia):**
```
email,first_name,company_name,title,ice_breaker,subject_1,body_1,delay_days_1,subject_2,body_2,delay_days_2,...
```

**Modo Resolvido (AC #1):**
```csv
email,first_name,company_name,title,ice_breaker,subject_1,body_1,delay_days_1,subject_2,body_2,delay_days_2
joao@empresa.com,Joao,Empresa X,CTO,"Ice breaker do Joao","Ola Joao","Olhei o perfil da Empresa X...",0,"Follow-up","Joao, vi que...",3
maria@corp.com,Maria,Corp Y,CEO,"Ice breaker da Maria","Ola Maria","Olhei o perfil da Corp Y...",0,"Follow-up","Maria, vi que...",3
```

**Modo com Variaveis (AC #2):**
```csv
email,first_name,company_name,title,ice_breaker,subject_1,body_1,delay_days_1,subject_2,body_2,delay_days_2
joao@empresa.com,Joao,Empresa X,CTO,"Ice breaker do Joao","Ola {{first_name}}","{{ice_breaker}} Olhei o perfil da {{company_name}}...",0,"Follow-up","{{first_name}}, vi que...",3
maria@corp.com,Maria,Corp Y,CEO,"Ice breaker da Maria","Ola {{first_name}}","{{ice_breaker}} Olhei o perfil da {{company_name}}...",0,"Follow-up","{{first_name}}, vi que...",3
```

**Nota**: No modo "com variaveis", os dados do lead (email, first_name, company_name, title, ice_breaker) sao preenchidos com valores reais nas colunas de dados, mas os templates de email mantem `{{variaveis}}` para importar em plataformas que suportam merge fields.

### CSV Escaping — Regras RFC 4180

- Campos que contenham `,`, `"`, ou `\n` devem ser envolvidos em aspas duplas
- Aspas dentro de um campo devem ser escapadas como `""` (aspas duplas)
- Quebras de linha dentro de campos sao permitidas se o campo estiver entre aspas
- Usar `\r\n` como terminador de linha (padrao CSV)
- BOM UTF-8 (`\uFEFF`) no inicio para compatibilidade com Excel

### Formato Clipboard — Especificacao Detalhada

```
=== Campanha: {campaignName} ===

--- Email 1 (inicial) ---
Assunto: Ola {{first_name}}, uma ideia para {{company_name}}

{{ice_breaker}}

Estou entrando em contato porque...

--- Aguardar 3 dia(s) ---

--- Email 2 (follow-up) ---
Assunto: Re: Ola {{first_name}}, uma ideia para {{company_name}}

{{first_name}}, voltando ao meu email anterior...

--- Aguardar 2 dia(s) ---

--- Email 3 (follow-up) ---
Assunto: Ultimo contato, {{first_name}}

{{first_name}}, esta e minha ultima tentativa...
```

### copyToClipboard — Funcao Existente

A funcao `copyToClipboard(text)` em `src/lib/utils/clipboard.ts` ja:
- Usa `navigator.clipboard.writeText(text)` com fallback para `document.execCommand("copy")`
- Exibe toast "Copiado!" automaticamente
- **Nao e necessario criar nova funcao de clipboard** — apenas chamar `copyToClipboard(formattedText)`

**ATENCAO**: A funcao ja faz toast generico "Copiado!". Para a story 7.7, pode ser melhor NAO usar o toast automatico e sim fazer toast customizado com contagem de emails. Duas opcoes:
1. Usar `copyToClipboard()` como esta e aceitar toast generico "Copiado!"
2. Fazer `navigator.clipboard.writeText()` diretamente no hook e fazer toast customizado

**Recomendacao**: Opcao 1 (reutilizar). O toast "Copiado!" e suficiente. Adicionar informacao de contagem no content copiado ou em mensagem separada se necessario.

### Validacao Pre-Export — Diferenca do Instantly

A validacao para CSV/clipboard e mais simples que a do Instantly:

| Check | Instantly | CSV | Clipboard |
|-------|-----------|-----|-----------|
| Lead com email | Bloqueante | Bloqueante | N/A (sem leads) |
| Email block completo | Bloqueante | Bloqueante | Bloqueante |
| Sending account | Bloqueante | N/A | N/A |
| Lead sem icebreaker | Warning | Warning | N/A |

**Clipboard especial**: Nao requer leads porque o clipboard copia apenas o template da campanha (sequencia de emails com variaveis). O usuario pode usar o template manualmente.

### Sanitizacao de Nome de Arquivo

Para o nome do CSV (`{campaignName}-export-{date}.csv`), sanitizar o nome da campanha:
```typescript
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "") // Caracteres invalidos em Windows/Mac
    .replace(/\s+/g, "-")          // Espacos -> hifens
    .toLowerCase()
    .slice(0, 100);                 // Limitar tamanho
}
```

### Tailwind CSS v4 — Lembrete Critico

**USAR**: `<div className="flex flex-col gap-2">` para todos os wrappers label+input/select.
**NAO USAR**: `space-y-*` — nao funciona com componentes Radix UI.

### Escopo Claro — O Que NAO Fazer

- **NAO** implementar export Snov.io (Story 7.6 — manter placeholder separado no handleExportConfirm)
- **NAO** persistir export CSV/clipboard no banco (sao exports locais, sem tracking)
- **NAO** implementar validacao avancada (Story 7.8) — apenas validacao basica (leads, email blocks)
- **NAO** criar progress indicator multi-step — CSV/clipboard sao operacoes rapidas e sincronas
- **NAO** modificar o ExportDialog alem de adicionar o toggle CSV resolvido/variaveis
- **NAO** modificar `copyToClipboard()` existente — reutilizar como esta
- **NAO** modificar `blocksToInstantlySequences()` — reutilizar sem alteracoes
- **NAO** criar testes E2E/Playwright — apenas testes unitarios Vitest
- **NAO** criar API routes — CSV e clipboard sao operacoes client-side puras

### Project Structure Notes

**Novos Arquivos:**
- `src/lib/export/generate-csv.ts` — Geracao de conteudo CSV (resolvido e com variaveis)
- `src/lib/export/download-csv.ts` — Utility de download de arquivo via Blob
- `src/lib/export/format-clipboard.ts` — Formatacao de campanha para texto legivel
- `src/lib/export/validate-csv-export.ts` — Validacao pre-export para CSV/clipboard
- `src/hooks/use-csv-clipboard-export.ts` — Hook de orquestracao

**Arquivos Modificados:**
- `src/types/export.ts` — Adicionar `csvMode?: "resolved" | "with_variables"` ao `ExportConfig`; adicionar tipos `CsvExportResult`, `ClipboardExportResult`
- `src/components/builder/ExportDialog.tsx` — Toggle CSV resolvido/variaveis quando platform === "csv"
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Substituir placeholder, integrar `useCsvClipboardExport`

**Testes Novos:**
- `__tests__/unit/lib/export/generate-csv.test.ts` — ~12 testes
- `__tests__/unit/lib/export/download-csv.test.ts` — ~5 testes
- `__tests__/unit/lib/export/format-clipboard.test.ts` — ~6 testes
- `__tests__/unit/lib/export/validate-csv-export.test.ts` — ~8 testes
- `__tests__/unit/hooks/use-csv-clipboard-export.test.ts` — ~10 testes

**Testes Expandidos:**
- `__tests__/unit/components/builder/ExportDialog.test.tsx` — ~3 testes novos (toggle CSV mode)

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.7]
- [Source: src/lib/export/variable-registry.ts — getVariables(), mapVariableForPlatform(), PLATFORM_MAPPINGS.csv]
- [Source: src/lib/export/resolve-variables.ts — resolveEmailVariables()]
- [Source: src/lib/export/blocks-to-sequences.ts — blocksToInstantlySequences()]
- [Source: src/lib/utils/clipboard.ts — copyToClipboard() com fallback]
- [Source: src/types/export.ts — ExportConfig, ExportPlatform, PreDeployValidationResult, ExportLeadInfo]
- [Source: src/lib/export/validate-pre-deploy.ts — validateInstantlyPreDeploy() (padrao de referencia)]
- [Source: src/components/builder/ExportDialog.tsx — Platform selection, onExport callback]
- [Source: src/hooks/use-campaign-export.ts — platformOptions, leadSummary]
- [Source: src/hooks/use-instantly-export.ts — ExportLeadData interface, orchestration pattern]
- [Source: src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx — handleExportConfirm placeholder linhas 429-433]
- [Source: src/stores/use-builder-store.ts — BuilderBlock type, blocks]

### Previous Story Intelligence (Story 7.5)

Learnings da Story 7.5 (Export to Instantly):
- **ExportConfig importado de `@/types/export`**: Tipos ja foram movidos do ExportDialog para types/export.ts (feito na 7.5)
- **ExportLeadData interface**: Definida no hook use-instantly-export.ts — campos: email, firstName, lastName, companyName, title, icebreaker
- **Toast pattern**: `toast.success()`, `toast.error()` do `sonner` — usado extensivamente na integracao
- **Lead mapping na page edit**: `campaignLeadsForExport.map(cl => ({ email: cl.lead.email, firstName: cl.lead.firstName ?? undefined, ... }))` — reutilizar mesmo mapeamento
- **setIsExportOpen(false) ANTES do processamento**: Fechar dialog antes de executar export (padrao consistente)
- **Error handling**: try/catch com toast.error e mensagem PT-BR especifica
- **Code review patterns**: Verificar imports mortos, tipos duplicados, testes com fixtures realistas, contagem de testes

### Git Intelligence

Ultimos commits relevantes:
```
157c377 feat(story-7.4): export dialog UI with variable preview and code review fixes
769904c feat(story-7.3.1): campaign export persistence with code review fixes
18d6dc0 feat(story-7.3): Snov.io integration service with code review fixes
d2d80e3 feat(story-7.2): Instantly campaign management service with code review fixes
9c3a495 feat(story-7.1): personalization variable system for export with code review fixes
```

Padrao de commit: `feat(story-7.X): descricao com code review fixes`.
Branch atual: `epic/7-campaign-deployment-export`.
Todas as stories 7.1-7.5 passaram code review rigoroso — patterns estaveis.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum debug necessario — implementacao direta sem blockers.

### Completion Notes List

- Task 1: `generateCsvContent()` — Reutiliza `blocksToInstantlySequences()` para extrair emails/delays. Suporta modo resolvido (AC #1) e modo com variaveis (AC #2). Header dinamico baseado no numero de emails. Escape RFC 4180, BOM UTF-8, CRLF. 15 testes.
- Task 2: `downloadCsvFile()` + `sanitizeFileName()` — Blob + anchor programatico. Sanitiza nome: remove chars invalidos, lowercase, hifens, max 100 chars. 10 testes.
- Task 3: `formatCampaignForClipboard()` — Texto estruturado legivel com emails numerados (inicial/follow-up), delays em dias, variaveis mantidas. 6 testes.
- Task 4: `validateCsvExport()` — Validacao simplificada vs Instantly (sem sending accounts). Clipboard mode pula validacao de leads. Mensagens PT-BR. 10 testes.
- Task 5: `useCsvClipboardExport` hook — 3 metodos: `exportToCsv`, `exportToCsvWithVariables`, `exportToClipboard`. Valida, gera, executa. 9 testes.
- Task 6: Toggle CSV mode no ExportDialog — `csvMode: "resolved" | "with_variables"` no `ExportConfig`. Toggle visivel apenas para plataforma CSV. Default: resolved. State resetado ao fechar dialog. 3 testes novos, 1 teste existente atualizado.
- Task 7: Integracao na page edit — Substituido placeholder por fluxo real: CSV resolvido/com variaveis via `csvMode`, clipboard via `exportToClipboard`, Snov.io mantido como placeholder. Toast com contagem de leads/emails. Dialog fechado antes do processamento.
- Task 8: Total 53 testes novos da story + 3 no ExportDialog expandido. Suite completa: 210 arquivos, 3728 testes, 0 falhas.
- Code Review: 1 HIGH, 3 MEDIUM, 2 LOW fixes applied. H1: canExport permite clipboard sem leads (AC #3). M1: double toast removido (navigator.clipboard.writeText direto). M2: lead mapping duplicado extraído para useMemo. M3: filtragem leadsWithEmail deduplicada. +1 teste novo (clipboard sem leads). Suite: 210 arquivos, 3729 testes, 0 falhas.

### Change Log

- 2026-02-08: Story 7.7 implementada — exportacao manual CSV e clipboard com 53 testes novos
- 2026-02-08: Code review — 1 HIGH, 3 MEDIUM fixes applied, +1 teste. 210 files, 3729 tests

### File List

**Novos:**
- `src/lib/export/generate-csv.ts` — Geracao de conteudo CSV (resolvido e com variaveis)
- `src/lib/export/download-csv.ts` — Utility de download de arquivo via Blob + sanitizacao de nome
- `src/lib/export/format-clipboard.ts` — Formatacao de campanha para texto legivel de clipboard
- `src/lib/export/validate-csv-export.ts` — Validacao pre-export para CSV/clipboard
- `src/hooks/use-csv-clipboard-export.ts` — Hook de orquestracao client-side
- `__tests__/unit/lib/export/generate-csv.test.ts` — 15 testes
- `__tests__/unit/lib/export/download-csv.test.ts` — 10 testes
- `__tests__/unit/lib/export/format-clipboard.test.ts` — 6 testes
- `__tests__/unit/lib/export/validate-csv-export.test.ts` — 10 testes
- `__tests__/unit/hooks/use-csv-clipboard-export.test.ts` — 9 testes

**Modificados:**
- `src/types/export.ts` — Adicionado `csvMode?: "resolved" | "with_variables"` ao `ExportConfig`
- `src/components/builder/ExportDialog.tsx` — Toggle CSV mode (state, UI, reset, config)
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Import `useCsvClipboardExport`, substituido placeholder por fluxo CSV/clipboard real
- `__tests__/unit/components/builder/ExportDialog.test.tsx` — 3 testes novos (toggle CSV mode) + 1 teste atualizado (csvMode no config)
