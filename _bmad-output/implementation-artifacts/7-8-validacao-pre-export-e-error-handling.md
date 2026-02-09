# Story 7.8: Validacao Pre-Export e Error Handling

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want que o sistema valide meus dados antes de exportar e me de feedback claro quando algo der errado,
so that eu nunca exporte uma campanha incompleta e sempre tenha um caminho alternativo.

## Acceptance Criteria

1. **Given** inicio uma exportacao
   **When** os dados sao validados
   **Then** verifica:
   - Todos os leads tem email valido (formato RFC basico)
   - Leads sem ice_breaker sao sinalizados (aviso, nao bloqueio)
   - Campanha tem pelo menos 1 email completo (subject + body)
   - Variaveis no template correspondem a campos existentes no registry
   **And** exibe resumo de validacao antes de confirmar

2. **Given** a validacao encontra problemas criticos
   **When** o resumo e exibido
   **Then** problemas bloqueantes (sem email, email invalido) impedem a exportacao
   **And** problemas nao-bloqueantes (sem ice_breaker) exibem aviso mas permitem continuar
   **And** para cada problema ha uma acao sugerida ("Enriquecer leads", "Gerar ice breakers", etc.)

3. **Given** qualquer exportacao (API ou CSV) falha
   **When** o erro e exibido
   **Then** a mensagem esta em portugues
   **And** explica o problema especifico:
   - "Sua conta Instantly esta sem creditos"
   - "API key invalida. Verifique em Configuracoes"
   - "Servico temporariamente indisponivel"
   - "Limite de leads excedido"
   **And** vejo "Tentar Novamente" e "Exportar Manualmente" como alternativas
   **And** a exportacao manual (CSV/clipboard) SEMPRE funciona independente de erros de API

## Tasks / Subtasks

- [x] Task 1: Funcao de validacao de email avancada (AC: #1)
  - [x] 1.1 Criar `src/lib/export/validate-email.ts` com funcao `isValidEmail(email: string): boolean`
  - [x] 1.2 Usar regex RFC 5322 simplificada: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — suficiente para deteccao de emails invalidos obvios
  - [x] 1.3 Criar funcao `validateLeadEmails(leads: ExportLeadInfo[]): EmailValidationResult` que retorna: `{ valid: ExportLeadInfo[], invalid: Array<{ lead: ExportLeadInfo, reason: string }>, duplicates: ExportLeadInfo[] }`
  - [x] 1.4 Detectar emails duplicados na lista (case-insensitive, trim)
  - [x] 1.5 Mensagens de erro PT-BR: "Email invalido: {email}", "Email duplicado: {email} (aparece {N} vezes)"

- [x] Task 2: Funcao de validacao de variaveis no template (AC: #1)
  - [x] 2.1 Criar `src/lib/export/validate-template-variables.ts` com funcao `validateTemplateVariables(blocks: BuilderBlock[]): TemplateVariableValidation`
  - [x] 2.2 Extrair todas as variaveis `{{...}}` dos campos subject e body de cada email block usando regex `/\{\{(\w+)\}\}/g`
  - [x] 2.3 Verificar cada variavel extraida contra o registry (`getVariables()` de `variable-registry.ts`) — variaveis que nao existem no registry geram warning
  - [x] 2.4 Detectar sintaxe malformada: `{{` sem `}}` correspondente, ou `}}` sem `{{` — gera warning (nao erro, para nao bloquear edge cases)
  - [x] 2.5 Retornar `{ validVariables: string[], unknownVariables: string[], malformedSyntax: Array<{ block: number, text: string }> }`
  - [x] 2.6 Mensagens PT-BR: "Variavel desconhecida: {{xyz}} no Email {N}. Variaveis disponiveis: {{first_name}}, {{company_name}}, {{title}}, {{ice_breaker}}", "Sintaxe malformada no Email {N}: chaves nao fechadas"

- [x] Task 3: Funcao de validacao unificada avancada (AC: #1, #2)
  - [x] 3.1 Criar `src/lib/export/validate-export-advanced.ts` com funcao `validateExportAdvanced(params): AdvancedValidationResult`
  - [x] 3.2 Params: `{ blocks: BuilderBlock[], leads: ExportLeadInfo[], platform: ExportPlatform, sendingAccounts?: string[] }`
  - [x] 3.3 Orquestrar: chamar `validateLeadEmails()` + `validateTemplateVariables()` + validacao existente (`validateInstantlyPreDeploy` ou `validateCsvExport`)
  - [x] 3.4 Interface `AdvancedValidationResult`:
    ```typescript
    interface AdvancedValidationResult {
      valid: boolean;
      errors: ValidationIssue[];      // Bloqueantes — impedem export
      warnings: ValidationIssue[];    // Nao-bloqueantes — permitem continuar
      summary: ValidationSummary;     // Resumo para UI
    }

    interface ValidationIssue {
      type: ValidationIssueType;      // 'no_email' | 'invalid_email' | 'duplicate_email' | 'no_email_blocks' | 'no_sending_accounts' | 'unknown_variable' | 'malformed_syntax' | 'no_icebreaker' | 'incomplete_block'
      message: string;                // Mensagem PT-BR
      suggestedAction?: string;       // Acao sugerida PT-BR
      count?: number;                 // Quantidade afetada
      details?: string[];             // Detalhes (ex: lista de emails invalidos)
    }

    interface ValidationSummary {
      totalLeads: number;
      validLeads: number;
      invalidLeads: number;
      duplicateLeads: number;
      leadsWithoutIcebreaker: number;
      emailBlocks: number;
      completeEmailBlocks: number;
      unknownVariables: number;
    }
    ```
  - [x] 3.5 Erros bloqueantes: nenhum lead com email valido, nenhum email block completo, nenhuma sending account (Instantly), TODOS os emails invalidos
  - [x] 3.6 Warnings nao-bloqueantes: leads sem icebreaker, emails duplicados (contagem), variaveis desconhecidas, email blocks incompletos, sintaxe malformada
  - [x] 3.7 Sugestoes de acao por tipo:
    - `no_email` → "Adicione leads com email a campanha"
    - `invalid_email` → "Corrija os emails invalidos nos leads"
    - `duplicate_email` → "Remova leads duplicados ou verifique os dados"
    - `no_email_blocks` → "Adicione pelo menos 1 email completo a campanha"
    - `no_sending_accounts` → "Selecione uma conta de envio nas opcoes acima"
    - `unknown_variable` → "Verifique o nome da variavel. Disponiveis: {{first_name}}, {{company_name}}, {{title}}, {{ice_breaker}}"
    - `no_icebreaker` → "Gere icebreakers para esses leads em Meus Leads"
    - `incomplete_block` → "Complete o assunto e corpo do email"

- [x] Task 4: Componente ValidationSummaryPanel (AC: #1, #2)
  - [x] 4.1 Criar `src/components/builder/ValidationSummaryPanel.tsx`
  - [x] 4.2 Props: `{ validation: AdvancedValidationResult, onDismissWarnings?: () => void }`
  - [x] 4.3 Se `validation.valid === true` e sem warnings: mostrar checkmark verde "Tudo pronto para exportar"
  - [x] 4.4 Se `validation.valid === true` com warnings: mostrar resumo amarelo com warnings + botao "Continuar mesmo assim"
  - [x] 4.5 Se `validation.valid === false`: mostrar resumo vermelho com errors + warnings, botao de export desabilitado
  - [x] 4.6 Para cada issue, mostrar: icone (erro/warning), mensagem, contagem se aplicavel, e `suggestedAction` em texto menor
  - [x] 4.7 Layout: Card com border colorida (verde/amarelo/vermelho), lista de issues agrupadas por tipo (errors primeiro, depois warnings)
  - [x] 4.8 Usar shadcn/ui `Alert` com variantes `destructive` (erro) e `default` (warning)
  - [x] 4.9 Sem `space-y-*` — usar `flex flex-col gap-2` para spacing (Tailwind v4 + Radix)
  - [x] 4.10 Componente deve ser compacto — maximo 200px de altura com scroll se muitos issues

- [x] Task 5: Integrar validacao avancada no ExportDialog (AC: #1, #2)
  - [x] 5.1 Em `src/components/builder/ExportDialog.tsx` — importar `validateExportAdvanced` e `ValidationSummaryPanel`
  - [x] 5.2 Executar validacao avancada quando: (a) plataforma e selecionada E (b) leads estao carregados. Recalcular quando plataforma muda ou sending accounts mudam
  - [x] 5.3 Mostrar `ValidationSummaryPanel` entre a selecao de plataforma e o botao "Exportar"
  - [x] 5.4 Botao "Exportar" desabilitado quando `validation.valid === false`
  - [x] 5.5 Quando `validation.valid === true` com warnings: botao habilitado, label muda para "Exportar com avisos"
  - [x] 5.6 Manter compatibilidade: a validacao existente nos hooks (`validateInstantlyPreDeploy`, `validateCsvExport`) continua funcionando como safety net — a validacao avancada e uma camada ADICIONAL no UI
  - [x] 5.7 Para clipboard: pular validacao de leads (consistente com comportamento atual)

- [x] Task 6: Mapeamento de erros de API para mensagens amigaveis (AC: #3)
  - [x] 6.1 Criar `src/lib/export/error-messages.ts` com funcao `mapExportError(error: unknown, platform: ExportPlatform): ExportErrorInfo`
  - [x] 6.2 Interface `ExportErrorInfo`:
    ```typescript
    interface ExportErrorInfo {
      title: string;            // Titulo curto PT-BR (ex: "Erro de autenticacao")
      message: string;          // Mensagem descritiva PT-BR
      suggestedAction: string;  // Acao sugerida PT-BR
      canRetry: boolean;        // Se faz sentido tentar novamente
      canFallback: boolean;     // Se fallback manual (CSV) e viavel
    }
    ```
  - [x] 6.3 Mapeamento de erros conhecidos do Instantly:
    - HTTP 401 → "API key invalida. Verifique em Configuracoes > Instantly."
    - HTTP 402/Payment Required → "Sua conta Instantly esta sem creditos. Verifique seu plano."
    - HTTP 429/Rate Limited → "Muitas requisicoes. Aguarde alguns minutos e tente novamente."
    - HTTP 500 → "Servico Instantly temporariamente indisponivel. Tente novamente em alguns minutos."
    - Network error → "Erro de conexao. Verifique sua internet."
    - Timeout → "A requisicao demorou demais. Tente novamente."
  - [x] 6.4 Fallback generico: "Erro inesperado durante o export. Tente novamente ou exporte via CSV."
  - [x] 6.5 Todos com `canFallback: true` — CSV/clipboard sempre disponivel como alternativa
  - [x] 6.6 `canRetry: true` para erros transientes (429, 500, network, timeout); `canRetry: false` para erros permanentes (401, 402)

- [x] Task 7: Integrar error mapping nos hooks de export (AC: #3)
  - [x] 7.1 Em `src/hooks/use-instantly-export.ts` — no catch de cada step, chamar `mapExportError(error, "instantly")` para gerar mensagem amigavel
  - [x] 7.2 Atualizar `DeploymentStep.error` com `errorInfo.message` em vez de mensagem generica
  - [x] 7.3 Adicionar campo `errorInfo?: ExportErrorInfo` ao `DeploymentStep` em `src/types/export.ts`
  - [x] 7.4 Em `src/hooks/use-csv-clipboard-export.ts` — no catch, chamar `mapExportError(error, "csv"/"clipboard")` para mensagem amigavel
  - [x] 7.5 Manter backward compatibility: se `mapExportError` retornar null/generico, usar mensagem existente como fallback

- [x] Task 8: Melhorar toasts de erro no page edit (AC: #3)
  - [x] 8.1 Em `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — no handler de erro do Instantly export:
    - Usar `errorInfo.title` como titulo do toast
    - Usar `errorInfo.message` como descricao
    - Se `canRetry === true`: mostrar action "Tentar Novamente" no toast
    - Se `canFallback === true`: mostrar action "Exportar CSV" no toast (chamar `exportToCsv` diretamente)
  - [x] 8.2 No handler de erro do CSV/clipboard export: usar `errorInfo.message` no toast de erro
  - [x] 8.3 Manter toast de sucesso e partial_failure como estao (ja funcionam bem)

- [x] Task 9: Testes unitarios (todos os ACs)
  - [x] 9.1 `__tests__/unit/lib/export/validate-email.test.ts` — isValidEmail: emails validos, invalidos (sem @, sem dominio, espacos, vazio), duplicatas, case-insensitive — 12 testes
  - [x] 9.2 `__tests__/unit/lib/export/validate-template-variables.test.ts` — variaveis validas, desconhecidas, sintaxe malformada, sem variaveis, multiplos blocks — 10 testes
  - [x] 9.3 `__tests__/unit/lib/export/validate-export-advanced.test.ts` — validacao completa: tudo ok, errors bloqueantes, warnings nao-bloqueantes, mixed, clipboard sem leads, acoes sugeridas — 15 testes
  - [x] 9.4 `__tests__/unit/components/builder/ValidationSummaryPanel.test.tsx` — render: tudo ok (verde), warnings (amarelo), errors (vermelho), acoes sugeridas, scroll com muitos issues — 8 testes
  - [x] 9.5 `__tests__/unit/lib/export/error-messages.test.ts` — mapeamento: 401, 402, 429, 500, network, timeout, generico, canRetry, canFallback — 10 testes
  - [x] 9.6 `__tests__/unit/components/builder/ExportDialog.test.tsx` — Expandir: ValidationSummaryPanel aparece, botao desabilitado com erros, label "Exportar com avisos", clipboard sem validacao de leads — 5 testes novos

## Dev Notes

### Contexto Critico

Esta e a story de **VALIDACAO AVANCADA** do epic de export. O objetivo e ELEVAR a qualidade da experiencia de export com:
1. **Validacao proativa**: Detectar problemas ANTES do usuario clicar "Exportar"
2. **Feedback visual claro**: Resumo de validacao no dialog com cores e acoes sugeridas
3. **Error handling inteligente**: Mensagens especificas por tipo de erro com fallback sempre disponivel

**Filosofia**: A validacao basica ja existe nos hooks (`validateInstantlyPreDeploy`, `validateCsvExport`). Esta story adiciona uma camada VISUAL no ExportDialog que mostra problemas antes do export e melhora as mensagens de erro quando algo falha.

**NAO e uma reescrita**: Os hooks existentes continuam como safety net. A validacao avancada e uma camada ADICIONAL de UX.

### Dependencia 7.6 (Snov.io) — Ainda em Backlog

A Story 7.6 (Export to Snov.io) esta em `backlog`. A validacao avancada sera implementada para:
- **Instantly**: Validacao completa (leads, emails, accounts, variaveis)
- **CSV/Clipboard**: Validacao completa (leads, emails, variaveis)
- **Snov.io**: O ExportDialog ja mostra Snov.io como opcao desabilitada se nao configurado. Quando 7.6 for implementada, a validacao avancada funcionara automaticamente porque `validateExportAdvanced` aceita `platform` como parametro.

### Infraestrutura Ja Disponivel (NAO recriar)

| O que | Onde | API |
|-------|------|-----|
| Variable Registry (4 variaveis) | `src/lib/export/variable-registry.ts` | `getVariables()`, `mapVariableForPlatform(name, platform)` |
| Validacao Instantly | `src/lib/export/validate-pre-deploy.ts` | `validateInstantlyPreDeploy()` |
| Validacao CSV/Clipboard | `src/lib/export/validate-csv-export.ts` | `validateCsvExport()` |
| ExportDialog UI | `src/components/builder/ExportDialog.tsx` | Platform selection, lead summary, `onExport(config)` |
| useCampaignExport hook | `src/hooks/use-campaign-export.ts` | `platformOptions`, `leadSummary`, `previousExport` |
| useInstantlyExport hook | `src/hooks/use-instantly-export.ts` | `exportToInstantly()`, `steps`, `DeploymentStep[]` |
| useCsvClipboardExport hook | `src/hooks/use-csv-clipboard-export.ts` | `exportToCsv()`, `exportToClipboard()` |
| Export types | `src/types/export.ts` | `PreDeployValidationResult`, `DeploymentStep`, `ExportConfig` |
| Lead summary | `src/hooks/use-campaign-export.ts` | `LeadExportSummary` com totalLeads, leadsWithEmail, etc. |
| Toast pattern | `sonner` | `toast.success()`, `toast.error()`, `toast.loading()` |

### Validacao Existente vs. Avancada

| Check | Existente (hooks) | Avancada (7.8) |
|-------|-------------------|----------------|
| Lead tem email | Apenas existencia | + Formato RFC valido |
| Email duplicado | Nao detecta | Detecta + conta |
| Email block completo | Subject + body | Mesma + warning para incompletos |
| Sending account | Pelo menos 1 | Mesma |
| Icebreaker | Warning contagem | + Acao sugerida |
| Variaveis template | Nao valida | Valida contra registry |
| Sintaxe {{}} | Nao valida | Detecta malformada |
| Resumo visual | Nenhum | Panel com cores + acoes |
| Mensagem de erro | Generica | Especifica por HTTP status |
| Fallback sugerido | Nao | CSV/clipboard sempre |

### Padrao de ValidationIssueType (enum)

```typescript
type ValidationIssueType =
  | 'no_leads_with_email'     // Bloqueante: nenhum lead com email
  | 'invalid_email'           // Bloqueante: emails com formato invalido
  | 'duplicate_email'         // Warning: emails duplicados na lista
  | 'no_email_blocks'         // Bloqueante: nenhum email block completo
  | 'incomplete_block'        // Warning: email block com subject OU body
  | 'no_sending_accounts'     // Bloqueante (Instantly): sem conta de envio
  | 'unknown_variable'        // Warning: variavel nao existe no registry
  | 'malformed_syntax'        // Warning: chaves {{ ou }} desbalanceadas
  | 'no_icebreaker';          // Warning: leads sem icebreaker
```

### ExportDialog — Onde Inserir o ValidationSummaryPanel

O ExportDialog atual tem a seguinte estrutura no DialogContent:
1. Header "Exportar Campanha"
2. Selecao de plataforma (platform cards)
3. Detalhes da plataforma selecionada (accounts, preview, etc.)
4. Lead summary (ExportPreview)
5. Botao "Exportar"

O `ValidationSummaryPanel` deve ser inserido **entre 4 e 5** — depois do lead summary e antes do botao de exportar. Assim o usuario ve o resumo de validacao antes de confirmar.

### Error Mapping — Estrategia

Os erros de API chegam nos hooks como:
```typescript
// use-instantly-export.ts, nos catch blocks
catch (error) {
  const errorMessage = error instanceof Error ? error.message : "Erro inesperado";
  // Atualmente: step.error = errorMessage
  // Com 7.8: step.error = mapExportError(error, "instantly").message
}
```

A funcao `mapExportError` inspeciona:
1. Se e um `Response` object: verifica `status` (401, 402, 429, 500)
2. Se e um `Error` com `message` contendo patterns: "timeout", "network", "fetch failed"
3. Se e string: usa como esta
4. Fallback: mensagem generica

### Toasts Atuais vs. Melhorados

**Atualmente (Instantly erro):**
```typescript
toast.error("Erro ao exportar para Instantly", {
  description: result.error,
  action: { label: "Tentar Novamente", onClick: () => handleExportConfirm(lastConfig) }
});
```

**Com 7.8:**
```typescript
const errorInfo = mapExportError(failedStep.error, "instantly");
toast.error(errorInfo.title, {
  description: errorInfo.message,
  action: errorInfo.canRetry
    ? { label: "Tentar Novamente", onClick: () => handleExportConfirm(lastConfig) }
    : errorInfo.canFallback
    ? { label: "Exportar CSV", onClick: () => handleCsvFallback() }
    : undefined
});
```

### Tailwind CSS v4 — Lembrete Critico

**USAR**: `<div className="flex flex-col gap-2">` para todos os wrappers label+input/select.
**NAO USAR**: `space-y-*` — nao funciona com componentes Radix UI.

### Escopo Claro — O Que NAO Fazer

- **NAO** implementar export Snov.io (Story 7.6 — esta em backlog)
- **NAO** reescrever validacao existente nos hooks — adicionar CAMADA ADICIONAL no UI
- **NAO** implementar retry automatico com backoff — retry e manual pelo usuario
- **NAO** implementar cancelamento mid-export — complexidade desnecessaria para P2
- **NAO** validar formato de email com lookup DNS/MX — apenas regex basica
- **NAO** validar contra listas de emails descartaveis — fora do escopo
- **NAO** adicionar progress bar para uploads grandes — ja existe toast.loading no Instantly
- **NAO** criar testes E2E/Playwright — apenas testes unitarios Vitest
- **NAO** modificar logica de export nos hooks — apenas mensagens de erro e metadata
- **NAO** bloquear export por warnings — warnings SEMPRE permitem continuar

### Project Structure Notes

**Novos Arquivos:**
- `src/lib/export/validate-email.ts` — Validacao de formato de email + duplicatas
- `src/lib/export/validate-template-variables.ts` — Validacao de variaveis {{}} contra registry
- `src/lib/export/validate-export-advanced.ts` — Orquestrador de validacao unificada
- `src/lib/export/error-messages.ts` — Mapeamento de erros de API para mensagens amigaveis
- `src/components/builder/ValidationSummaryPanel.tsx` — Componente de resumo de validacao

**Arquivos Modificados:**
- `src/types/export.ts` — Adicionar tipos: `ValidationIssue`, `ValidationIssueType`, `ValidationSummary`, `AdvancedValidationResult`, `ExportErrorInfo`; Adicionar campo `errorInfo?: ExportErrorInfo` ao `DeploymentStep`
- `src/components/builder/ExportDialog.tsx` — Importar e renderizar `ValidationSummaryPanel`, executar validacao avancada on-change, desabilitar botao com erros
- `src/hooks/use-instantly-export.ts` — Usar `mapExportError()` nos catch blocks para mensagens amigaveis
- `src/hooks/use-csv-clipboard-export.ts` — Usar `mapExportError()` nos catch blocks
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — Usar `errorInfo` dos steps para toasts melhorados com fallback CSV

**Testes Novos:**
- `__tests__/unit/lib/export/validate-email.test.ts` — ~12 testes
- `__tests__/unit/lib/export/validate-template-variables.test.ts` — ~10 testes
- `__tests__/unit/lib/export/validate-export-advanced.test.ts` — ~15 testes
- `__tests__/unit/components/builder/ValidationSummaryPanel.test.tsx` — ~8 testes
- `__tests__/unit/lib/export/error-messages.test.ts` — ~10 testes

**Testes Expandidos:**
- `__tests__/unit/components/builder/ExportDialog.test.tsx` — ~5 testes novos

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.8]
- [Source: src/lib/export/validate-pre-deploy.ts — validateInstantlyPreDeploy() (padrao de referencia)]
- [Source: src/lib/export/validate-csv-export.ts — validateCsvExport() (padrao de referencia)]
- [Source: src/lib/export/variable-registry.ts — getVariables(), SUPPORTED_VARIABLES]
- [Source: src/types/export.ts — PreDeployValidationResult, DeploymentStep, ExportConfig, ExportPlatform]
- [Source: src/components/builder/ExportDialog.tsx — Platform selection, lead summary, onExport callback]
- [Source: src/hooks/use-instantly-export.ts — catch blocks com error handling, DeploymentStep updates]
- [Source: src/hooks/use-csv-clipboard-export.ts — catch blocks com error handling]
- [Source: src/hooks/use-campaign-export.ts — platformOptions, leadSummary, ExportLeadInfo]
- [Source: src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx — handleExportConfirm, toast patterns]

### Previous Story Intelligence (Stories 7.5 + 7.7)

**Learnings da Story 7.5 (Export to Instantly):**
- `DeploymentStep` com `status`, `error`, `detail` — padrao estavel para tracking de pipeline
- `validateInstantlyPreDeploy()` retorna `{ valid, errors[], warnings[] }` — tipo `PreDeployValidationResult`
- Error handling via try-catch em cada step, mensagem generica "Erro ao criar campanha"
- Toast com action "Tentar Novamente" + description mencionando fallback CSV
- `ExportLeadData` interface com campos: email, firstName, lastName, companyName, title, icebreaker
- Progress indicator via `toast.loading()` com label da etapa corrente

**Learnings da Story 7.7 (CSV e Clipboard):**
- `validateCsvExport()` segue mesmo padrao de `PreDeployValidationResult`
- Clipboard mode pula validacao de leads (nao requer leads)
- Error handling simples: try-catch com `toast.error("Erro ao exportar CSV")`
- Toast generico — oportunidade para mensagem mais especifica na 7.8
- `copyToClipboard()` reutilizado diretamente — funciona sem internet
- Code review: `canExport` permite clipboard sem leads (AC #3 da 7.7)

### Git Intelligence

Ultimos commits relevantes:
```
e95b3d1 style: custom scrollbar global e padding no ExportDialog
38d59cd feat(story-7.7): CSV and clipboard manual export with code review fixes
7ddd77d feat(story-7.5): export to Instantly with template variables and draft mode
157c377 feat(story-7.4): export dialog UI with variable preview and code review fixes
769904c feat(story-7.3.1): campaign export persistence with code review fixes
```

Padrao de commit: `feat(story-7.X): descricao com code review fixes`.
Branch atual: `epic/7-campaign-deployment-export`.
Todas as stories 7.1-7.7 passaram code review rigoroso — patterns estaveis.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- ExportDialog tests: 5 failures fixed (button text changed due to validation warnings; mockLeads adjusted to all-valid emails + role-based selectors)
- use-instantly-export tests: 2 failures fixed (mock Response missing `status: 401`; network error assertion updated to mapped PT-BR message)

### Completion Notes List

- All 9 tasks implemented with tests alongside (TDD red-green)
- 67 new tests across 5 new test files + 5 new tests in ExportDialog.test.tsx + 3 new tests in use-csv-clipboard-export.test.ts
- Full regression: 215 test files, 3796 tests passed, 0 failures
- Validation layer is ADDITIVE — existing hook validations remain as safety net
- Clipboard platform correctly skips lead validation across all layers
- Error mapping integrated in both Instantly and CSV/Clipboard hooks
- Toast improvements include retry/fallback action buttons based on error type

### Code Review Fixes (Adversarial Review)
- **H1**: Added 3 tests for `mapExportError` integration in `use-csv-clipboard-export.test.ts` (network error, generic error, clipboard error all map to PT-BR)
- **M1**: Removed dead `ErrorPattern` interface from `error-messages.ts`
- **M2**: Extracted duplicate `leadsWithoutIcebreaker` computation to single variable in `validate-export-advanced.ts`
- **M3**: Removed unnecessary `g` flag from `OPEN_BRACE_REGEX`/`CLOSE_BRACE_REGEX` in `validate-template-variables.ts` (eliminates `lastIndex` footgun)
- **M4**: Added `sprint-status.yaml` and `use-csv-clipboard-export.test.ts` to File List

### Change Log

| Task | Files | Description |
|------|-------|-------------|
| Task 1 | `validate-email.ts` | `isValidEmail()` RFC regex + `validateLeadEmails()` with duplicate detection |
| Task 2 | `validate-template-variables.ts` | `validateTemplateVariables()` checks `{{}}` against variable registry |
| Task 3 | `validate-export-advanced.ts` | Unified orchestrator with errors/warnings/summary |
| Task 4 | `ValidationSummaryPanel.tsx` | Green/yellow/red validation panel with shadcn Alert |
| Task 5 | `ExportDialog.tsx`, `page.tsx` | Integrated validation panel + `leads` prop + button disable/label logic |
| Task 6 | `error-messages.ts` | `mapExportError()` with HTTP status/network/timeout pattern matching |
| Task 7 | `use-instantly-export.ts`, `use-csv-clipboard-export.ts`, `export.ts` | Integrated `mapExportError` in catch blocks + `errorInfo` on DeploymentStep |
| Task 8 | `page.tsx` | `mapExportError` in toasts + `handleCsvFallback()` + retry/fallback actions |
| Task 9 | 6 test files | 69 total new/updated tests, all passing |
| CR fix | `error-messages.ts`, `validate-template-variables.ts`, `validate-export-advanced.ts`, `use-csv-clipboard-export.test.ts` | Dead code removal, regex safety, dedup, +3 tests |

### File List

**New Files:**
- `src/lib/export/validate-email.ts`
- `src/lib/export/validate-template-variables.ts`
- `src/lib/export/validate-export-advanced.ts`
- `src/lib/export/error-messages.ts`
- `src/components/builder/ValidationSummaryPanel.tsx`
- `__tests__/unit/lib/export/validate-email.test.ts`
- `__tests__/unit/lib/export/validate-template-variables.test.ts`
- `__tests__/unit/lib/export/validate-export-advanced.test.ts`
- `__tests__/unit/lib/export/error-messages.test.ts`
- `__tests__/unit/components/builder/ValidationSummaryPanel.test.tsx`

**Modified Files:**
- `src/types/export.ts` — Added `errorInfo?: ExportErrorInfo` to `DeploymentStep`
- `src/components/builder/ExportDialog.tsx` — Added `leads` prop, `validateExportAdvanced` useMemo, `ValidationSummaryPanel`, button disable/label
- `src/hooks/use-instantly-export.ts` — Integrated `mapExportError` in catch blocks
- `src/hooks/use-csv-clipboard-export.ts` — Integrated `mapExportError` in catch blocks
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — `mapExportError` toasts + `handleCsvFallback()` + `leads` prop
- `__tests__/unit/components/builder/ExportDialog.test.tsx` — Added mockLeads, 5 new Story 7.8 tests
- `__tests__/unit/hooks/use-instantly-export.test.ts` — Updated assertions for mapped error messages
- `__tests__/unit/hooks/use-csv-clipboard-export.test.ts` — Added 3 tests for mapExportError integration (code review fix)
