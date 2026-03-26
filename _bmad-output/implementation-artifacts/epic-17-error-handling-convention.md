# Convenção de Error Handling — Pipeline Steps (Epic 17)

**Data:** 2026-03-26
**Owner:** Charlie (Senior Dev)
**Status:** Aprovada
**Contexto:** Action Item Crítico da Retro Epic 16 — resolver ANTES da Story 17.1

---

## 1. Problema

Epic 16 teve error handling silencioso em 3/6 stories:
- Fetches sem check de `response.ok`
- Promises sem try/catch
- Erros engolidos sem feedback ao usuário

Na Epic 17, erro silencioso no pipeline = **dados inconsistentes no banco** + **créditos de API desperdiçados** + **usuário sem visibilidade do que aconteceu**.

## 2. Princípio

> **Todo erro deve ser visível, classificado e acionável.**
>
> - Visível: o usuário sempre sabe que algo falhou e onde
> - Classificado: retryable vs terminal, externo vs interno
> - Acionável: o usuário tem um próximo passo claro

---

## 3. Camadas de Error Handling

O pipeline tem 4 camadas. Cada uma tem responsabilidade clara:

```
┌─────────────────────────────────────────────┐
│  Frontend (hooks/componentes)               │  Camada 4: Exibição + ação do usuário
├─────────────────────────────────────────────┤
│  API Route (/api/agent/executions/.../execute)│  Camada 3: HTTP → PipelineError → Response
├─────────────────────────────────────────────┤
│  Orchestrator (DeterministicOrchestrator)    │  Camada 2: Coordenação + estado da execução
├─────────────────────────────────────────────┤
│  Step (BaseStep → SearchCompaniesStep etc.)  │  Camada 1: Execução + checkpoint
├─────────────────────────────────────────────┤
│  Service (TheirStackService, Apollo etc.)    │  Camada 0: Já existe, NÃO modificar
└─────────────────────────────────────────────┘
```

---

## 4. Camada 0 — Services Existentes (NÃO MODIFICAR)

Os services já possuem error handling maduro. **Não alterar.**

| Service | Erro | Retry | Identificação |
|---------|------|-------|---------------|
| TheirStack | `ExternalServiceError` | 1x (timeout/network) | `serviceName: "theirstack"` |
| Apollo | `ExternalServiceError` | 1x (timeout/network) | `serviceName: "apollo"` |
| Instantly | `ExternalServiceError` | 1x (timeout/network) | `serviceName: "instantly"` |
| Apify | `{ success: false, error: string }` | Não (Apify Client gerencia) | Via resultado |
| OpenAI (AI) | `Error` genérico | Não | Via `AGENT_ERROR_CODES` |

### ExternalServiceError (referência)
```typescript
class ExternalServiceError extends Error {
  serviceName: string;   // "theirstack", "apollo", "instantly"
  statusCode: number;    // 401, 408, 429, 500, 0 (network)
  userMessage: string;   // Português, pronto para UI
  details?: unknown;     // Erro raw para logging
}
```

---

## 5. Camada 1 — BaseStep (CRIAR na 17.1)

### Responsabilidade
- Executar o service com try/catch **obrigatório**
- Salvar checkpoint **sempre** (sucesso ou falha)
- Converter qualquer erro em `PipelineError`
- **Nunca** engolir erros silenciosamente

### Convenção obrigatória

```typescript
abstract class BaseStep {
  abstract execute(input: StepInput): Promise<StepOutput>;

  // Template method — steps concretos implementam executeInternal()
  async run(input: StepInput): Promise<StepOutput> {
    await this.updateStepStatus('running');

    try {
      const output = await this.executeInternal(input);
      await this.saveCheckpoint(output);       // SEMPRE salvar antes de retornar
      await this.logStep(input, output);
      return output;
    } catch (error: unknown) {
      const pipelineError = this.toPipelineError(error);
      await this.saveFailure(pipelineError);   // SEMPRE persistir falha
      await this.logStep(input, null, pipelineError);
      throw pipelineError;                     // SEMPRE propagar
    }
  }

  // Converte qualquer erro para PipelineError
  protected toPipelineError(error: unknown): PipelineError {
    // ExternalServiceError → PipelineError (mapeamento direto)
    if (error instanceof ExternalServiceError) {
      return {
        code: `STEP_${this.stepType.toUpperCase()}_ERROR`,
        message: error.userMessage,           // Já em português
        stepNumber: this.stepNumber,
        stepType: this.stepType,
        isRetryable: this.isRetryableStatus(error.statusCode),
        externalService: error.serviceName,
      };
    }

    // Apify result com error → PipelineError
    if (this.isApifyError(error)) {
      return {
        code: `STEP_${this.stepType.toUpperCase()}_ERROR`,
        message: error.error || 'Erro ao buscar dados do LinkedIn',
        stepNumber: this.stepNumber,
        stepType: this.stepType,
        isRetryable: true,
        externalService: 'apify',
      };
    }

    // Error genérico → PipelineError terminal
    return {
      code: `STEP_${this.stepType.toUpperCase()}_ERROR`,
      message: error instanceof Error
        ? error.message
        : AGENT_ERROR_CODES.STEP_EXECUTION_ERROR,
      stepNumber: this.stepNumber,
      stepType: this.stepType,
      isRetryable: false,
      externalService: undefined,
    };
  }

  // Status codes retryable
  private isRetryableStatus(statusCode: number): boolean {
    return [0, 408, 429, 502, 503, 504].includes(statusCode);
  }
}
```

### Regras para steps concretos

1. **NÃO** usar try/catch dentro de `executeInternal()` — o `run()` do BaseStep já faz isso
2. **NÃO** chamar `saveCheckpoint()` manualmente — o `run()` já faz isso
3. **PODE** fazer validação de input no início de `executeInternal()` e jogar erro se inválido
4. **DEVE** retornar `StepOutput` com `success: true` e `data` populado
5. Se o service retornar resultado com `success: false` (padrão Apify), jogar `Error` explicitamente

```typescript
// CORRETO — step concreto simples e limpo
class SearchCompaniesStep extends BaseStep {
  async executeInternal(input: StepInput): Promise<StepOutput> {
    const { technology, location, industry } = input.briefing;

    if (!technology) {
      throw new Error('Tecnologia é obrigatória para busca de empresas');
    }

    const companies = await TheirStackService.searchCompanies({
      technology,
      country: location,
      industry,
    });

    return {
      success: true,
      data: { companies, totalFound: companies.length },
      cost: { theirstack_search: companies.length * unitPrice },
    };
  }
}
```

---

## 6. Camada 2 — Orchestrator

### Responsabilidade
- Coordenar a sequência de steps
- Atualizar status da execução (`agent_executions`)
- Enviar mensagem de erro para o chat
- **Nunca** engolir o PipelineError

### Convenção obrigatória

```typescript
class DeterministicOrchestrator implements IPipelineOrchestrator {
  async executeStep(executionId: string, stepNumber: number): Promise<StepOutput> {
    const step = this.getStep(stepNumber);

    try {
      const output = await step.run(input);
      return output;
    } catch (error: unknown) {
      if (!(error instanceof Object && 'isRetryable' in error)) {
        // Erro inesperado — não é PipelineError
        throw error;
      }

      const pipelineError = error as PipelineError;

      // 1. Atualizar execução para 'paused' (NUNCA 'failed' direto)
      await this.updateExecutionStatus(executionId, 'paused', pipelineError.message);

      // 2. Enviar mensagem de erro no chat (OBRIGATÓRIO)
      await this.sendErrorMessage(executionId, pipelineError);

      // 3. Propagar para a API route
      throw pipelineError;
    }
  }

  private async sendErrorMessage(executionId: string, error: PipelineError): Promise<void> {
    const stepLabel = STEP_LABELS[error.stepType]; // ex: "Busca de Empresas"

    const message = error.externalService
      ? `Ocorreu um problema na etapa "${stepLabel}". O serviço ${error.externalService} retornou: ${error.message}`
      : `Ocorreu um problema na etapa "${stepLabel}": ${error.message}`;

    await this.saveAgentMessage({
      execution_id: executionId,
      role: 'agent',
      content: message,
      metadata: {
        stepNumber: error.stepNumber,
        messageType: 'error',
      },
    });
  }
}
```

### Regra de status da execução em falha

| Situação | Status execução | Status step | Ação |
|----------|----------------|-------------|------|
| Erro retryable | `paused` | `failed` | Botões: "Tentar novamente" + "Retomar depois" |
| Erro terminal | `paused` | `failed` | Botão: "Retomar depois" |
| Rejeição no gate | `paused` | `awaiting_approval` | Aguarda nova aprovação |

**IMPORTANTE:** Execução NUNCA vai direto para `failed`. Sempre `paused` primeiro, dando ao usuário a chance de retomar. Execução só vai para `failed` se o usuário explicitamente abandonar.

---

## 7. Camada 3 — API Route

### Responsabilidade
- Autenticação e validação
- Chamar orchestrator
- Traduzir PipelineError para HTTP response
- **Nunca** retornar 200 quando houve erro

### Convenção obrigatória

```typescript
// POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute
export async function POST(req: Request, { params }: RouteParams) {
  // 1. Auth (padrão existente)
  const profile = await getCurrentUserProfile();
  if (!profile) return NextResponse.json({ error: { code: 'AUTH_ERROR', message: 'Não autenticado' } }, { status: 401 });

  // 2. Validação de params
  const { executionId, stepNumber } = await params;
  if (!executionId || !stepNumber) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Parâmetros inválidos' } }, { status: 400 });
  }

  // 3. Executar step via orchestrator
  try {
    const output = await orchestrator.executeStep(executionId, Number(stepNumber));
    return NextResponse.json({ data: output });
  } catch (error: unknown) {
    // PipelineError → resposta estruturada
    if (isPipelineError(error)) {
      const statusCode = error.isRetryable ? 503 : 500;
      return NextResponse.json({
        error: {
          code: error.code,
          message: error.message,
          stepNumber: error.stepNumber,
          stepType: error.stepType,
          isRetryable: error.isRetryable,
          externalService: error.externalService,
        }
      }, { status: statusCode });
    }

    // Erro inesperado — NUNCA engolir
    return NextResponse.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: AGENT_ERROR_CODES.STEP_EXECUTION_ERROR,
        isRetryable: false,
      }
    }, { status: 500 });
  }
}

// Type guard
function isPipelineError(error: unknown): error is PipelineError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'stepNumber' in error &&
    'isRetryable' in error
  );
}
```

### Shape da resposta de erro (padrão obrigatório)

```typescript
// TODA resposta de erro segue este formato
interface ErrorResponse {
  error: {
    code: string;                    // Ex: "STEP_SEARCH_COMPANIES_ERROR"
    message: string;                 // Português, pronto para exibir
    stepNumber?: number;             // Qual step falhou
    stepType?: StepType;             // Tipo do step
    isRetryable?: boolean;           // Frontend usa para exibir/esconder botão retry
    externalService?: string;        // Qual serviço externo falhou
  };
}
```

---

## 8. Camada 4 — Frontend (hooks/componentes)

### Responsabilidade
- Verificar `response.ok` em **toda** chamada fetch
- Exibir erro via mensagem no chat (já enviada pelo orchestrator via Realtime)
- Exibir botões de ação baseados em `isRetryable`
- **Nunca** engolir erros no catch

### Convenção obrigatória

```typescript
// Em hooks que chamam API routes de step
async function executeStep(executionId: string, stepNumber: number): Promise<void> {
  try {
    const response = await fetch(`/api/agent/executions/${executionId}/steps/${stepNumber}/execute`, {
      method: 'POST',
    });

    // OBRIGATÓRIO: sempre checar response.ok
    if (!response.ok) {
      const errorData = await response.json();
      // Erro já foi persistido no banco pelo orchestrator
      // Mensagem de erro já chegou via Realtime
      // Aqui só precisamos atualizar o estado local
      return; // NÃO jogar exceção — o Realtime já notificou o chat
    }

    const { data } = await response.json();
    // Processar sucesso...
  } catch (error: unknown) {
    // Erro de rede (fetch falhou completamente)
    // Este é o ÚNICO caso onde o frontend precisa criar a mensagem de erro
    toast.error('Erro de conexão. Verifique sua internet e tente novamente.');
  }
}
```

### Regras de exibição no chat

| `isRetryable` | Botões | Mensagem extra |
|---------------|--------|---------------|
| `true` | "Tentar novamente" + "Retomar depois" | Inclui nome do serviço externo |
| `false` | "Retomar depois" | Orienta próximo passo |

---

## 9. Códigos de Erro (expandir AGENT_ERROR_CODES)

```typescript
export const AGENT_ERROR_CODES = {
  // Existentes (Epic 16)
  BRIEFING_PARSE_ERROR: 'Nao consegui interpretar o briefing',
  PRODUCT_PARSE_ERROR: 'Nao consegui extrair dados do produto',
  STEP_EXECUTION_ERROR: 'Erro ao executar etapa do pipeline',
  STEP_TIMEOUT: 'Etapa demorou demais para responder',
  APPROVAL_TIMEOUT: 'Aprovacao expirou',
  COST_ESTIMATE_ERROR: 'Erro ao calcular estimativa de custo',
  EXECUTION_RESUME_ERROR: 'Erro ao retomar execucao',

  // Novos (Epic 17) — um por step
  STEP_SEARCH_COMPANIES_ERROR: 'Erro na busca de empresas',
  STEP_SEARCH_LEADS_ERROR: 'Erro na busca de leads',
  STEP_CREATE_CAMPAIGN_ERROR: 'Erro na criacao da campanha',
  STEP_EXPORT_ERROR: 'Erro na exportacao para plataforma',
  STEP_ACTIVATE_ERROR: 'Erro na ativacao da campanha',

  // Orquestração
  ORCHESTRATOR_INVALID_STEP: 'Etapa invalida para esta execucao',
  ORCHESTRATOR_STEP_NOT_READY: 'Etapa anterior ainda nao concluida',
  CHECKPOINT_SAVE_ERROR: 'Erro ao salvar progresso da etapa',
} as const;
```

---

## 10. Classificação de Erros por Service

| Service | Status Code | isRetryable | Exemplo |
|---------|------------|-------------|---------|
| TheirStack | 401 | false | API key inválida |
| TheirStack | 402 | false | Créditos esgotados |
| TheirStack | 408 | true | Timeout |
| TheirStack | 429 | true | Rate limit |
| Apollo | 400 | false | API key não configurada |
| Apollo | 401 | false | API key inválida |
| Apollo | 408 | true | Timeout |
| Apollo | 429 | true | Rate limit |
| Instantly | 401 | false | API key inválida |
| Instantly | batch error | true | Falha parcial em batch |
| Apify | success: false | true | Actor falhou/timeout |
| OpenAI | timeout | true | Timeout de geração |
| OpenAI | 401 | false | API key inválida |
| OpenAI | 429 | true | Rate limit |
| Supabase | query error | false | Erro de banco |
| Network | 0 | true | Sem conexão |

---

## 11. Retry Strategy no Pipeline

### O que já existe (Camada 0)
- Services externos fazem 1 retry automático em timeout/network

### O que o pipeline adiciona (Camada 1-2)
- **Step-level retry**: Usuário clica "Tentar novamente" → API route re-executa o step completo
- **Backoff**: NFR5 exige backoff exponencial (max 3 tentativas). Implementar no BaseStep:

```typescript
// No BaseStep — retry com backoff quando acionado pelo usuário
async retryStep(input: StepInput, attempt: number = 1): Promise<StepOutput> {
  const MAX_RETRIES = 3;
  const BACKOFF_MS = [0, 2000, 5000]; // 0s, 2s, 5s

  if (attempt > 1) {
    await this.delay(BACKOFF_MS[attempt - 1] ?? 5000);
  }

  try {
    return await this.run(input);
  } catch (error: unknown) {
    const pipelineError = error as PipelineError;
    if (pipelineError.isRetryable && attempt < MAX_RETRIES) {
      return this.retryStep(input, attempt + 1);
    }
    throw error;
  }
}
```

---

## 12. Logging

### O que registrar (obrigatório)

Cada step falho deve ter no `agent_steps`:
- `status`: `'failed'`
- `error_message`: Mensagem em português (para exibição)
- `output`: `{ error: { code, message, externalService, isRetryable, rawError } }` (para debugging)

### O que NÃO registrar
- API keys ou tokens (NFR12)
- Headers de autenticação
- Payloads completos de requests com dados sensíveis

---

## 13. Checklist para Code Review

Toda story da Epic 17 deve passar neste checklist:

- [ ] Todo `fetch` tem check de `response.ok`
- [ ] Todo handler/callback tem `try/catch`
- [ ] Todo `catch` propaga ou exibe o erro (nunca engole)
- [ ] Erros de service são convertidos em `PipelineError` via `toPipelineError()`
- [ ] `saveCheckpoint()` é chamado tanto no sucesso quanto na falha
- [ ] Mensagem de erro enviada ao chat via `sendErrorMessage()`
- [ ] `isRetryable` está corretamente classificado
- [ ] `externalService` está preenchido quando aplicável
- [ ] Nenhum `console.log` de erro (usar `logStep()`)
- [ ] Nenhuma non-null assertion (`!`)
- [ ] Testes cobrem: happy path + erro retryable + erro terminal + erro de rede

---

## 14. Padrões Proibidos

```typescript
// ❌ PROIBIDO: fetch sem check de response
const res = await fetch('/api/...');
const data = await res.json(); // Pode explodir se res não é ok

// ❌ PROIBIDO: catch vazio ou só com console
catch (error) {
  console.error(error);
}

// ❌ PROIBIDO: catch que retorna silenciosamente
catch {
  return null;
}

// ❌ PROIBIDO: non-null assertion
const id = execution.id!;

// ❌ PROIBIDO: erro genérico sem contexto
throw new Error('Something went wrong');
```

```typescript
// ✅ CORRETO: fetch com check
const res = await fetch('/api/...');
if (!res.ok) {
  const errorData = await res.json();
  // tratar erro...
}

// ✅ CORRETO: catch que propaga
catch (error: unknown) {
  const pipelineError = this.toPipelineError(error);
  await this.saveFailure(pipelineError);
  throw pipelineError;
}

// ✅ CORRETO: null guard
if (!execution.id) return;

// ✅ CORRETO: erro com contexto
throw new Error(`Tecnologia é obrigatória para busca de empresas`);
```

---

## 15. Preservação de Créditos (NFR10)

Quando um step falha, os créditos de API **já gastos** naquele step são registrados no `cost` do `agent_steps` **antes** de propagar o erro:

```typescript
// No BaseStep.saveFailure()
async saveFailure(error: PipelineError, partialCost?: Record<string, number>): Promise<void> {
  await supabase.from('agent_steps').update({
    status: 'failed',
    error_message: error.message,
    cost: partialCost ?? null,  // Preservar custo parcial se houver
    output: { error: { ...error } },
  }).eq('id', this.stepId);
}
```

Steps concluídos com sucesso **nunca** são re-executados em retomada (NFR10, NFR6).

---

## Resumo Executivo

| Regra | Aplicação |
|-------|-----------|
| Todo fetch → `response.ok` check | API routes, hooks, componentes |
| Todo handler → `try/catch` + propagação | Steps, orchestrator, routes |
| Todo erro → `PipelineError` | BaseStep.toPipelineError() |
| Todo falha → checkpoint salvo | BaseStep.saveFailure() |
| Todo falha → mensagem no chat | Orchestrator.sendErrorMessage() |
| Execução falha → status `paused` (nunca `failed` direto) | Orchestrator |
| Retry → backoff exponencial, max 3 | BaseStep.retryStep() |
| Créditos parciais → preservados | BaseStep.saveFailure(partialCost) |
| Non-null assertions → banidas | ESLint rule ativa |
| Erros silenciosos → proibidos | Code review checklist |
