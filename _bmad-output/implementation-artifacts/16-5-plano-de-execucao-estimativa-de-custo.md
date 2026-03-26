# Story 16.5: Plano de Execucao & Estimativa de Custo

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario do Agente TDEC,
I want ver o plano de execucao com estimativa de custo antes de iniciar,
so that eu saiba exatamente o que vai acontecer e quanto vai custar antes de comprometer recursos.

## Acceptance Criteria

1. **Given** o briefing foi parseado e o modo selecionado
   **When** o agente gera o plano de execucao
   **Then** apresenta as etapas que serao executadas em ordem (ex: "1. Buscar empresas com Netskope, 2. Encontrar CTOs, 3. Criar campanha...")
   **And** indica quais etapas serao puladas (se aplicavel, baseado no briefing)

2. **Given** o plano de execucao foi gerado
   **When** o CostEstimatorService calcula a estimativa
   **Then** o componente AgentExecutionPlan exibe o custo estimado por etapa e total
   **And** o calculo usa os precos unitarios da tabela `cost_models` multiplicados pelo volume estimado

3. **Given** a tabela `cost_models` no banco
   **When** consultada pelo CostEstimatorService
   **Then** contem precos unitarios para: theirStack (per search), Apollo (per lead), Apify (per profile), OpenAI (per prompt avg), Instantly (per export)
   **And** os valores sao configurados via seed data (lazy seed na primeira geracao de plano)

4. **Given** o plano e estimativa de custo exibidos ao usuario
   **When** o usuario clica em "Iniciar"
   **Then** os steps sao registrados em `agent_steps`, cost_estimate salva na execucao
   **And** o agente confirma: "Execucao iniciada!"

5. **Given** o plano e estimativa de custo exibidos ao usuario
   **When** o usuario clica em "Cancelar"
   **Then** nenhum step e criado
   **And** o agente responde: "Tudo bem! Quando quiser tentar de novo, e so me dizer"

## Tasks / Subtasks

- [x] Task 1: PlannedStep type + plan constants (AC: #1)
  - [x] 1.1 Adicionar `PlannedStep` interface ao `src/types/agent.ts`:
        ```
        interface PlannedStep {
          stepNumber: number;
          stepType: StepType;
          title: string;
          description: string;
          skipped: boolean;
          estimatedCost: number;
          costDescription: string;
        }
        ```
  - [x] 1.2 Adicionar `ExecutionPlan` interface ao `src/types/agent.ts`:
        ```
        interface ExecutionPlan {
          steps: PlannedStep[];
          costEstimate: CostEstimate;
          totalActiveSteps: number;
        }
        ```

- [x] Task 2: CostEstimatorService (AC: #2, #3)
  - [x] 2.1 Criar `src/lib/services/agent-cost-estimator.ts`
  - [x] 2.2 Constantes DEFAULT_COSTS com precos unitarios padrao:
        ```
        theirstack: 0.10 BRL per search
        apollo: 0.05 BRL per lead
        apify: 0.15 BRL per profile
        openai: 0.02 BRL per prompt avg
        instantly: 0.00 BRL per export (free tier)
        ```
  - [x] 2.3 Constantes DEFAULT_VOLUMES para estimativa:
        ```
        ESTIMATED_COMPANIES: 30
        ESTIMATED_LEADS_PER_COMPANY: 2
        ESTIMATED_EMAILS_PER_LEAD: 3
        ESTIMATED_ICEBREAKER_RATIO: 0.5
        ```
  - [x] 2.4 Metodo `getCostModels(supabase)`: query `cost_models` por tenant, retorna map `service_name → unit_price`
  - [x] 2.5 Metodo `ensureCostModels(supabase, tenantId)`: se nenhum cost_model encontrado, insere DEFAULT_COSTS (lazy seed). Retorna cost models
  - [x] 2.6 Metodo `estimateCosts(costModels, briefing)`: calcula custo por step e total. Retorna `CostEstimate`
  - [x] 2.7 Logica de calculo por step:
        - search_companies: 1 × theirstack (1 busca)
        - search_leads: ESTIMATED_COMPANIES × ESTIMATED_LEADS_PER_COMPANY × apollo
        - create_campaign: totalLeads × ESTIMATED_EMAILS_PER_LEAD × openai + (totalLeads × ESTIMATED_ICEBREAKER_RATIO × openai)
        - export: 1 × instantly
        - activate: 0 (free)
  - [x] 2.8 Steps em skipSteps tem custo 0

- [x] Task 3: PlanGeneratorService (AC: #1)
  - [x] 3.1 Criar `src/lib/services/agent-plan-generator.ts`
  - [x] 3.2 Constante PIPELINE_STEPS com metadata de cada step:
        ```
        { type: 'search_companies', title: 'Buscar Empresas', descriptionTemplate: 'Buscar empresas que usam {technology} via TheirStack' }
        { type: 'search_leads', title: 'Encontrar Contatos', descriptionTemplate: 'Encontrar {jobTitles} nas empresas encontradas via Apollo' }
        { type: 'create_campaign', title: 'Criar Campanha', descriptionTemplate: 'Gerar emails personalizados com IA' }
        { type: 'export', title: 'Exportar para Instantly', descriptionTemplate: 'Exportar campanha e leads para Instantly' }
        { type: 'activate', title: 'Ativar Campanha', descriptionTemplate: 'Ativar envio automatico no Instantly' }
        ```
  - [x] 3.3 Metodo `generatePlan(briefing, costEstimate)`: retorna `PlannedStep[]`
  - [x] 3.4 Interpolar descricao com dados do briefing (technology, jobTitles)
  - [x] 3.5 Marcar `skipped: true` para steps em `briefing.skipSteps`
  - [x] 3.6 Associar custo de cada step do costEstimate

- [x] Task 4: API Route — GET /api/agent/executions/[executionId]/plan (AC: #1, #2, #3)
  - [x] 4.1 Criar `src/app/api/agent/executions/[executionId]/plan/route.ts` com handler GET
  - [x] 4.2 Auth via `getCurrentUserProfile()` (401)
  - [x] 4.3 Buscar execucao por id (RLS filtra tenant). Verificar existe (404)
  - [x] 4.4 Extrair briefing da execucao (400 se briefing vazio/incompleto)
  - [x] 4.5 Chamar `CostEstimatorService.ensureCostModels()` + `estimateCosts()`
  - [x] 4.6 Chamar `PlanGeneratorService.generatePlan()`
  - [x] 4.7 Retornar `{ data: { steps: PlannedStep[], costEstimate: CostEstimate, totalActiveSteps: number } }`

- [x] Task 5: API Route — POST /api/agent/executions/[executionId]/confirm (AC: #4)
  - [x] 5.1 Criar `src/app/api/agent/executions/[executionId]/confirm/route.ts` com handler POST
  - [x] 5.2 Auth via `getCurrentUserProfile()` (401)
  - [x] 5.3 Buscar execucao por id (404). Verificar status === 'pending' (400 se ja confirmada)
  - [x] 5.4 Re-gerar plano (mesma logica do GET plan) para garantir consistencia
  - [x] 5.5 Inserir `agent_steps` para cada step NAO skipped:
        ```sql
        INSERT INTO agent_steps (execution_id, step_number, step_type, status)
        VALUES (execId, N, 'step_type', 'pending')
        ```
  - [x] 5.6 Atualizar `agent_executions`:
        ```
        cost_estimate = costEstimate (JSONB)
        total_steps = totalActiveSteps
        ```
  - [x] 5.7 Retornar `{ data: updatedExecution }`

- [x] Task 6: AgentExecutionPlan — Componente inline (AC: #1, #2, #4, #5)
  - [x] 6.1 Criar `src/components/agent/AgentExecutionPlan.tsx`
  - [x] 6.2 Props:
        ```typescript
        interface AgentExecutionPlanProps {
          executionId: string;
          onConfirm: () => void;
          onCancel: () => void;
          isSubmitting?: boolean;
        }
        ```
  - [x] 6.3 Buscar plano via `GET /api/agent/executions/${executionId}/plan` no mount (useEffect + fetch)
  - [x] 6.4 Estado loading: skeleton/spinner
  - [x] 6.5 Estado erro: mensagem "Erro ao gerar plano" com botao retry
  - [x] 6.6 Layout: container com `border-t border-border px-6 py-4` (mesmo padrao ModeSelector)
  - [x] 6.7 Titulo: "Plano de Execucao" com `text-body-small font-medium text-foreground mb-3`
  - [x] 6.8 Lista de steps: cada step como row com numero, icone por tipo, titulo, descricao, custo
  - [x] 6.9 Steps skipped: visual diferenciado (opacity-50, texto "Pulado", riscado)
  - [x] 6.10 Separador visual antes do total
  - [x] 6.11 Total estimado: "Custo estimado: R$ X,XX" em destaque
  - [x] 6.12 Botoes: "Cancelar" (variant ghost, a esquerda) e "Iniciar Execucao" (primary, a direita)
  - [x] 6.13 Botao Iniciar: disabled durante isSubmitting, texto "Iniciando..." quando submitting
  - [x] 6.14 `data-testid="agent-execution-plan"`, `data-testid="plan-step-{stepNumber}"`, `data-testid="plan-total-cost"`, `data-testid="plan-confirm-btn"`, `data-testid="plan-cancel-btn"`
  - [x] 6.15 Icones por step type (lucide): search_companies=Building2, search_leads=Users, create_campaign=Mail, export=Upload, activate=Play

- [x] Task 7: Integracao no AgentChat (AC: #1-#5)
  - [x] 7.1 Adicionar `showExecutionPlan` e `setShowExecutionPlan` ao `useAgentStore`
  - [x] 7.2 Alterar `handleModeSelect` no AgentChat: apos salvar modo e enviar mensagem, chamar `setShowExecutionPlan(true)`
  - [x] 7.3 Criar handler `handleConfirmPlan`:
        - Chamar POST `/api/agent/executions/${execId}/confirm`
        - Se sucesso: enviar mensagem agente "Execucao iniciada! Vou comecar pelo primeiro passo..."
        - `setShowExecutionPlan(false)`
        - Toast error se falhar
  - [x] 7.4 Criar handler `handleCancelPlan`:
        - Enviar mensagem agente "Tudo bem! Quando quiser tentar de novo, e so me dizer"
        - `setShowExecutionPlan(false)`
        - Nao cria steps nem modifica execucao
  - [x] 7.5 Renderizar `<AgentExecutionPlan>` entre `<AgentMessageList>` e `<AgentInput>` quando `showExecutionPlan === true`
  - [x] 7.6 Desabilitar `<AgentInput>` enquanto `showExecutionPlan === true`
  - [x] 7.7 Estado `isPlanSubmitting` (useState) para controlar loading do botao confirmar

- [x] Task 8: Atualizar exports e store (AC: #1-#5)
  - [x] 8.1 Adicionar `AgentExecutionPlan` ao `src/components/agent/index.ts`
  - [x] 8.2 Adicionar ao `useAgentStore`:
        ```
        showExecutionPlan: boolean
        setShowExecutionPlan: (show: boolean) => void
        ```

- [x] Task 9: Unit Tests (AC: #1-#5)
  - [x] 9.1 Testes CostEstimatorService: calcula custo corretamente, respeita skipSteps (custo 0), usa cost_models do DB quando disponivel, usa defaults quando DB vazio, ensureCostModels insere defaults
  - [x] 9.2 Testes PlanGeneratorService: gera 5 steps, interpola briefing na descricao, marca skipped steps, associa custos corretamente
  - [x] 9.3 Testes GET /api/agent/.../plan: auth 401, execucao nao encontrada 404, briefing vazio 400, sucesso retorna plan + costEstimate
  - [x] 9.4 Testes POST /api/agent/.../confirm: auth 401, execucao nao encontrada 404, execucao ja confirmada 400, sucesso cria steps + atualiza execucao
  - [x] 9.5 Testes AgentExecutionPlan: renderiza loading, renderiza steps apos fetch, step skipped com visual diferente, custo total exibido, botao confirmar chama callback, botao cancelar chama callback, retry em erro, botao confirmar desabilitado durante submitting, data-testids presentes
  - [x] 9.6 Testes AgentChat com plano: apos modo selecionado mostra execution plan, confirmar salva via API + mensagem confirmacao, cancelar envia mensagem + esconde plan, input desabilitado durante plan

## Dev Notes

### Fluxo Completo Atualizado (com 16.5)

```
1. Usuario abre pagina do agente
   ├── Primeiro uso → AgentOnboarding
   └── Uso recorrente → Placeholder breve

2. Usuario digita primeira mensagem
   → Execucao criada (POST /api/agent/executions) — status: pending
   → Briefing flow inicia

3. Briefing parseado e confirmado
   → saveBriefing (PATCH /api/agent/executions/[id]/briefing)
   → Mensagem: "Briefing confirmado! Agora escolha o modo..."
   → showModeSelector = true

4. Usuario seleciona modo (Guiado/Autopilot)
   → PATCH /api/agent/executions/[id] com { mode }
   → Mensagem: "Modo X selecionado. Preparando plano de execucao..."
   → showModeSelector = false
   → showExecutionPlan = true    ← NOVO

5. Plano de execucao exibido (AgentExecutionPlan)    ← NOVO
   → GET /api/agent/executions/[id]/plan (fetch automatico)
   → Exibe steps em ordem + custo estimado por step + total
   → Botoes: "Cancelar" / "Iniciar Execucao"

6a. Usuario clica "Iniciar"    ← NOVO
   → POST /api/agent/executions/[id]/confirm
   → Cria agent_steps no banco
   → Atualiza cost_estimate na execucao
   → Mensagem: "Execucao iniciada! Vou comecar pelo primeiro passo..."
   → showExecutionPlan = false
   → Pronto para story 16.6+ (execucao do pipeline)

6b. Usuario clica "Cancelar"    ← NOVO
   → Mensagem: "Tudo bem! Quando quiser tentar de novo, e so me dizer"
   → showExecutionPlan = false
   → Nenhum step criado, execucao fica pending
```

### Decisao: Execucao ja Existe no DB

A execucao e criada no DB na story 16.2 (primeiro sendMessage). O "confirmar" da 16.5 NAO cria nova execucao — ele:
1. Cria os `agent_steps` associados a execucao existente
2. Salva `cost_estimate` na execucao
3. Atualiza `total_steps` com o numero real de steps ativos

A execucao permanece com `status: 'pending'` ate que o primeiro step comece a executar (futuras stories).

### Decisao: Lazy Seed para cost_models

A tabela `cost_models` ja existe (migration 00050). Em vez de criar seed migration per-tenant, o `CostEstimatorService.ensureCostModels()` faz lazy seed:
- Consulta cost_models do tenant
- Se vazio, insere DEFAULT_COSTS
- Retorna cost models (do DB ou recem-inseridos)

Isso garante que cost_models existem para qualquer tenant sem necessidade de migration adicional.

### Decisao: AgentExecutionPlan como Componente Inline

Mesmo padrao do AgentModeSelector — componente renderizado entre AgentMessageList e AgentInput. Razoes:
- Interativo (botoes confirmar/cancelar)
- Bloqueia input durante exibicao
- Desaparece apos acao (confirmar ou cancelar)
- Consistente com padrao de approval gates (futuras stories)

### CostEstimatorService — Logica de Calculo

```typescript
// DEFAULT_COSTS (BRL)
const DEFAULT_COSTS: Record<string, { unitPrice: number; unitDescription: string }> = {
  theirstack:  { unitPrice: 0.10, unitDescription: "por busca" },
  apollo:      { unitPrice: 0.05, unitDescription: "por lead" },
  apify:       { unitPrice: 0.15, unitDescription: "por perfil LinkedIn" },
  openai:      { unitPrice: 0.02, unitDescription: "por prompt medio" },
  instantly:   { unitPrice: 0.00, unitDescription: "por export (free tier)" },
};

// DEFAULT_VOLUMES
const DEFAULT_VOLUMES = {
  ESTIMATED_COMPANIES: 30,
  ESTIMATED_LEADS_PER_COMPANY: 2,
  ESTIMATED_EMAILS_PER_LEAD: 3,
  ESTIMATED_ICEBREAKER_RATIO: 0.5,
};

// Calculo por step:
// search_companies: 1 × theirstack.unitPrice
// search_leads: 30 × 2 × apollo.unitPrice = 60 × 0.05 = R$3.00
// create_campaign: 60 × 3 × openai.unitPrice + 60 × 0.5 × openai.unitPrice = 210 × 0.02 = R$4.20
// export: 1 × instantly.unitPrice = R$0.00
// activate: R$0.00 (sempre free)
// TOTAL: ~R$7.30
```

### PlanGeneratorService — Step Metadata

```typescript
const PIPELINE_STEPS: StepMetadata[] = [
  {
    stepType: "search_companies",
    title: "Buscar Empresas",
    descriptionFn: (b) => b.technology
      ? `Buscar empresas que usam ${b.technology} via TheirStack`
      : "Buscar empresas via TheirStack",
    costKey: "search_companies",
    icon: "Building2",
  },
  {
    stepType: "search_leads",
    title: "Encontrar Contatos",
    descriptionFn: (b) => b.jobTitles.length > 0
      ? `Encontrar ${b.jobTitles.join(", ")} nas empresas via Apollo`
      : "Encontrar contatos nas empresas via Apollo",
    costKey: "search_leads",
    icon: "Users",
  },
  {
    stepType: "create_campaign",
    title: "Criar Campanha",
    descriptionFn: () => "Gerar emails personalizados com IA usando Knowledge Base",
    costKey: "create_campaign",
    icon: "Mail",
  },
  {
    stepType: "export",
    title: "Exportar para Instantly",
    descriptionFn: () => "Exportar campanha e leads para a plataforma Instantly",
    costKey: "export",
    icon: "Upload",
  },
  {
    stepType: "activate",
    title: "Ativar Campanha",
    descriptionFn: () => "Ativar envio automatico no Instantly",
    costKey: "activate",
    icon: "Play",
  },
];
```

### API Route — GET /api/agent/executions/[executionId]/plan

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) { /* 401 */ }
  const { executionId } = await params;
  const supabase = await createClient();

  // Buscar execucao (RLS filtra por tenant)
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, briefing, status")
    .eq("id", executionId)
    .single();
  if (!execution) { /* 404 */ }

  // Verificar briefing preenchido
  const briefing = execution.briefing as ParsedBriefing;
  if (!briefing || !briefing.technology) { /* 400: Briefing incompleto */ }

  // Buscar/criar cost models
  const costModels = await CostEstimatorService.ensureCostModels(supabase, profile.tenant_id);

  // Calcular custos
  const costEstimate = CostEstimatorService.estimateCosts(costModels, briefing);

  // Gerar plano
  const steps = PlanGeneratorService.generatePlan(briefing, costEstimate);
  const totalActiveSteps = steps.filter(s => !s.skipped).length;

  return NextResponse.json({
    data: { steps, costEstimate, totalActiveSteps }
  });
}
```

### API Route — POST /api/agent/executions/[executionId]/confirm

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) { /* 401 */ }
  const { executionId } = await params;
  const supabase = await createClient();

  // Buscar execucao
  const { data: execution } = await supabase
    .from("agent_executions")
    .select("id, briefing, status")
    .eq("id", executionId)
    .single();
  if (!execution) { /* 404 */ }
  if (execution.status !== "pending") { /* 400: Execucao ja confirmada */ }

  // Re-gerar plano (consistencia)
  const briefing = execution.briefing as ParsedBriefing;
  const costModels = await CostEstimatorService.ensureCostModels(supabase, profile.tenant_id);
  const costEstimate = CostEstimatorService.estimateCosts(costModels, briefing);
  const steps = PlanGeneratorService.generatePlan(briefing, costEstimate);
  const activeSteps = steps.filter(s => !s.skipped);

  // Criar agent_steps para steps ativos
  const stepsToInsert = activeSteps.map((step) => ({
    execution_id: executionId,
    step_number: step.stepNumber,
    step_type: step.stepType,
    status: "pending",
  }));

  const { error: stepsError } = await supabase
    .from("agent_steps")
    .insert(stepsToInsert);
  if (stepsError) { /* 500 */ }

  // Atualizar execucao
  const { data: updated, error: updateError } = await supabase
    .from("agent_executions")
    .update({
      cost_estimate: costEstimate,
      total_steps: activeSteps.length,
    })
    .eq("id", executionId)
    .select()
    .single();
  if (updateError) { /* 500 */ }

  return NextResponse.json({ data: updated });
}
```

### Padrao do AgentExecutionPlan Component

```typescript
"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Users, Mail, Upload, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlannedStep, CostEstimate } from "@/types/agent";

interface AgentExecutionPlanProps {
  executionId: string;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  search_companies: Building2,
  search_leads: Users,
  create_campaign: Mail,
  export: Upload,
  activate: Play,
};

// Fetch plan no mount, renderizar steps + custo + botoes
```

Layout: container com `border-t border-border px-6 py-4`. Steps como lista vertical com numeros. Custo total em destaque. Botoes alinhados no fundo.

### Alteracao no AgentChat.tsx

```typescript
// ADICIONAR: imports
import { AgentExecutionPlan } from "./AgentExecutionPlan";

// ADICIONAR: state
const showExecutionPlan = useAgentStore((s) => s.showExecutionPlan);
const setShowExecutionPlan = useAgentStore((s) => s.setShowExecutionPlan);
const [isPlanSubmitting, setIsPlanSubmitting] = useState(false);

// ALTERAR: handleModeSelect — adicionar no final do try (apos setShowModeSelector(false))
setShowExecutionPlan(true);

// ADICIONAR: handleConfirmPlan
const handleConfirmPlan = useCallback(async () => {
  if (!currentExecutionId) return;
  setIsPlanSubmitting(true);
  try {
    const response = await fetch(
      `/api/agent/executions/${currentExecutionId}/confirm`,
      { method: "POST" }
    );
    if (!response.ok) {
      toast.error("Erro ao confirmar execucao. Tente novamente.");
      return;
    }
    await sendAgentMessage(
      currentExecutionId,
      "Execucao iniciada! Vou comecar pelo primeiro passo..."
    );
    setShowExecutionPlan(false);
  } catch {
    toast.error("Erro ao confirmar execucao. Tente novamente.");
  } finally {
    setIsPlanSubmitting(false);
  }
}, [currentExecutionId, sendAgentMessage, setShowExecutionPlan]);

// ADICIONAR: handleCancelPlan
const handleCancelPlan = useCallback(async () => {
  if (!currentExecutionId) return;
  await sendAgentMessage(
    currentExecutionId,
    "Tudo bem! Quando quiser tentar de novo, e so me dizer"
  );
  setShowExecutionPlan(false);
}, [currentExecutionId, sendAgentMessage, setShowExecutionPlan]);

// ALTERAR: return JSX
return (
  <div className="flex flex-col flex-1 min-h-0" data-testid="agent-chat">
    <AgentMessageList
      messages={messages}
      isAgentProcessing={isAgentProcessing}
      isFirstTime={isFirstTime}
    />
    {showModeSelector && (
      <AgentModeSelector
        onModeSelect={handleModeSelect}
        defaultMode={briefingState.briefing?.mode}
        isSubmitting={isModeSubmitting}
      />
    )}
    {showExecutionPlan && currentExecutionId && (
      <AgentExecutionPlan
        executionId={currentExecutionId}
        onConfirm={handleConfirmPlan}
        onCancel={handleCancelPlan}
        isSubmitting={isPlanSubmitting}
      />
    )}
    <AgentInput
      onSendMessage={handleSendMessage}
      isSending={sendMessageMutation.isPending}
      disabled={showModeSelector || showExecutionPlan}
    />
  </div>
);
```

### Alteracao no useAgentStore

```typescript
interface AgentUIState {
  currentExecutionId: string | null;
  isInputDisabled: boolean;
  isAgentProcessing: boolean;
  showModeSelector: boolean;
  showExecutionPlan: boolean;  // NOVO
}

interface AgentUIActions {
  setCurrentExecutionId: (id: string | null) => void;
  setInputDisabled: (disabled: boolean) => void;
  setAgentProcessing: (processing: boolean) => void;
  setShowModeSelector: (show: boolean) => void;
  setShowExecutionPlan: (show: boolean) => void;  // NOVO
}

// Adicionar no create:
showExecutionPlan: false,
setShowExecutionPlan: (show) => set({ showExecutionPlan: show }),
```

### AgentInput — Disabled during plan

Ja suporta `disabled` prop (story 16.4). Basta passar `disabled={showModeSelector || showExecutionPlan}` no AgentChat. Nenhuma alteracao no AgentInput necessaria.

Placeholder quando `externalDisabled`: "Selecione o modo acima..." — esta ok para ambos os casos (modo e plano). Se quiser diferenciar, adicionar prop `disabledPlaceholder` ao AgentInput. Para simplicidade, manter o placeholder generico.

### Imports Existentes que DEVEM ser Reutilizados

| Import | De | Usado em |
|--------|-----|----------|
| `CostEstimate`, `CostModel` | `@/types/agent` | CostEstimatorService |
| `PlannedStep`, `ExecutionPlan` | `@/types/agent` | PlanGeneratorService, AgentExecutionPlan, API routes |
| `ParsedBriefing`, `StepType` | `@/types/agent` | Ambos services, API routes |
| `getCurrentUserProfile` | `@/lib/supabase/tenant` | API routes |
| `createClient` | `@/lib/supabase/server` | API routes, CostEstimatorService |
| `cn` | `@/lib/utils` | AgentExecutionPlan (styling skipped steps) |
| `Button` | `@/components/ui/button` | AgentExecutionPlan (confirmar/cancelar) |
| `useAgentStore` | `@/stores/use-agent-store` | AgentChat (showExecutionPlan) |
| `toast` | `sonner` | AgentChat (erro confirm) |
| `Building2`, `Users`, `Mail`, `Upload`, `Play` | `lucide-react` | AgentExecutionPlan (icones por step) |
| `Loader2` | `lucide-react` | AgentExecutionPlan (loading state) |

### NAO CRIAR / NAO DUPLICAR

- NAO criar tipos CostEstimate, CostModel, StepType — ja existem em `src/types/agent.ts`
- NAO criar createClient ou getCurrentUserProfile — importar de libs existentes
- NAO modificar AgentInput — ja suporta prop `disabled`
- NAO criar migration — tabela `cost_models` ja existe (00050)
- NAO modificar useBriefingFlow — briefing ja esta completo antes desta story
- NAO criar componente AgentCostEstimate separado — custo e parte do AgentExecutionPlan

### Learnings da Story 16.4 (APLICAR AQUI)

1. **Race condition execucao**: AgentChat cria execucao no primeiro sendMessage. Hooks devem usar executionId do Zustand store
2. **Mensagens via fetch direto**: `sendAgentMessage` usa fetch direto, nao hook. Manter esse padrao
3. **Guard execId**: Sempre verificar `if (!execId) return;` antes de usar executionId
4. **Toast para erros**: Usar `toast.error()` do sonner para feedback visual
5. **ESLint no-console**: NAO usar console.log nos componentes/hooks. Apenas nas API routes
6. **RouteParams com Promise**: `params: Promise<{ executionId: string }>` e `await params`
7. **isSubmitting state**: Usar useState local para controlar loading do botao (padrao do ModeSelector)
8. **Layout inline components**: `border-t border-border px-6 py-4` para componentes entre MessageList e Input
9. **CostEstimatorService e PlanGeneratorService sao classes com metodos static** — seguindo padrao BriefingParserService
10. **Supabase SupabaseClient type**: Importar de `@supabase/supabase-js` se necessario para tipagem

### Padrao de Formatacao de Custo

```typescript
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
// formatCurrency(7.30) → "R$ 7,30"
```

### Padrao de Testes (do projeto)

```typescript
// API route tests
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/supabase/tenant", () => ({ getCurrentUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Component tests
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Service tests
import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock supabase para CostEstimatorService

// Supabase mock chain builder
const mockFrom = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
});
```

### Project Structure Notes

Arquivos a CRIAR:
```
src/
├── lib/services/
│   ├── agent-cost-estimator.ts     (CostEstimatorService)
│   └── agent-plan-generator.ts     (PlanGeneratorService)
├── components/agent/
│   └── AgentExecutionPlan.tsx      (plano + custo + confirmar/cancelar)
└── app/api/agent/executions/
    └── [executionId]/
        ├── plan/
        │   └── route.ts            (GET plan + cost estimate)
        └── confirm/
            └── route.ts            (POST confirm execution)

__tests__/unit/
├── lib/services/
│   ├── agent-cost-estimator.test.ts
│   └── agent-plan-generator.test.ts
├── components/agent/
│   └── AgentExecutionPlan.test.tsx
└── api/agent/
    ├── execution-plan.test.ts
    └── execution-confirm.test.ts
```

Arquivos a MODIFICAR:
```
src/
├── types/agent.ts                       (PlannedStep, ExecutionPlan types)
├── components/agent/AgentChat.tsx        (integrar plan flow)
├── components/agent/index.ts            (export AgentExecutionPlan)
└── stores/use-agent-store.ts            (showExecutionPlan state)

__tests__/unit/
└── components/agent/AgentChat.test.tsx   (testes plan flow)
```

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md — Story 16.5 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Secao "Agente TDEC — Decisoes Arquiteturais"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Secao "Modelo de Custo"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Secao "Padrao de Step"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Secao "Agente TDEC — Estrutura do Projeto"]
- [Source: src/types/agent.ts — CostEstimate, CostModel, StepType, ParsedBriefing]
- [Source: src/components/agent/AgentChat.tsx — Fluxo atual apos selecao de modo]
- [Source: src/components/agent/AgentModeSelector.tsx — Padrao de componente inline]
- [Source: src/stores/use-agent-store.ts — Zustand store padrao]
- [Source: src/lib/agent/briefing-parser-service.ts — Padrao de service com metodos static]
- [Source: src/app/api/agent/executions/[executionId]/route.ts — Padrao PATCH com params Promise]
- [Source: src/app/api/agent/executions/route.ts — Padrao POST/GET existente]
- [Source: supabase/migrations/00047_create_agent_executions.sql — Schema agent_executions]
- [Source: supabase/migrations/00048_create_agent_steps.sql — Schema agent_steps]
- [Source: supabase/migrations/00050_create_cost_models.sql — Schema cost_models]
- [Source: _bmad-output/implementation-artifacts/16-4-onboarding-selecao-de-modo.md — Learnings e padroes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

Nenhum debug necessario — implementacao limpa sem bloqueios.

### Completion Notes List

- Task 1: Adicionadas interfaces `PlannedStep` e `ExecutionPlan` ao `src/types/agent.ts`
- Task 2: Criado `CostEstimatorService` com `getCostModels`, `ensureCostModels` (lazy seed) e `estimateCosts`. Constantes `DEFAULT_COSTS` e `DEFAULT_VOLUMES` exportadas.
- Task 3: Criado `PlanGeneratorService` com `generatePlan`. Constante `PIPELINE_STEPS` com metadata dos 5 steps do pipeline.
- Task 4: Criada API GET `/api/agent/executions/[executionId]/plan` — auth, fetch execucao, validar briefing, gerar plano + custo.
- Task 5: Criada API POST `/api/agent/executions/[executionId]/confirm` — auth, validar status pending, criar agent_steps, salvar cost_estimate.
- Task 6: Criado componente `AgentExecutionPlan` com estados loading/error/success, lista de steps com icones, custo total, botoes confirmar/cancelar, todos data-testids.
- Task 7: Integrado plano no `AgentChat`: `handleConfirmPlan`, `handleCancelPlan`, `showExecutionPlan` no render, input disabled durante plano.
- Task 8: Atualizado `useAgentStore` com `showExecutionPlan`/`setShowExecutionPlan`. Export adicionado ao `index.ts`.
- Task 9: 70 testes novos escritos (6 arquivos): CostEstimatorService (9), PlanGeneratorService (9), GET plan (6), POST confirm (6), AgentExecutionPlan (11), AgentChat plan flow (9+20 existentes). Total suite: 5615 tests, 0 failures.

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-03-26
**Issues Found:** 0 High, 3 Medium, 2 Low — ALL FIXED

**M1 [FIXED]:** POST /confirm sem validacao de briefing — `confirm/route.ts:52` fazia cast sem null check. Adicionada validacao identica ao GET plan (briefing null ou sem technology → 400). +2 testes.

**M2 [FIXED]:** handleConfirmPlan — confirm sucesso + sendAgentMessage falha deixava plan visivel. Movido `setShowExecutionPlan(false)` para antes de `sendAgentMessage`, garantindo que plan fecha mesmo se mensagem falhar. +1 teste.

**M3 [FIXED]:** handleCancelPlan sem try/catch — risco de unhandled promise rejection se sendAgentMessage lanca excecao. Adicionado try/catch + toast.error + `setShowExecutionPlan(false)` movido para antes do await. +1 teste.

**L4+L5 [FIXED]:** Steps ativos com custo zero mostravam "R$ 0,00" — agora exibem "Gratuito". Melhor UX para step activate. +1 teste.

**Test suite pos-review:** 5620 tests, 0 failures (75 testes story 16.5: +5 novos do review).

### Change Log

- 2026-03-26: Implementacao completa da Story 16.5 — Plano de execucao e estimativa de custo
- 2026-03-26: Code Review — 3M 2L issues encontrados e corrigidos, 5 testes adicionados

### File List

**Arquivos criados:**
- src/lib/services/agent-cost-estimator.ts
- src/lib/services/agent-plan-generator.ts
- src/app/api/agent/executions/[executionId]/plan/route.ts
- src/app/api/agent/executions/[executionId]/confirm/route.ts
- src/components/agent/AgentExecutionPlan.tsx
- __tests__/unit/lib/services/agent-cost-estimator.test.ts
- __tests__/unit/lib/services/agent-plan-generator.test.ts
- __tests__/unit/api/agent/execution-plan.test.ts
- __tests__/unit/api/agent/execution-confirm.test.ts
- __tests__/unit/components/agent/AgentExecutionPlan.test.tsx

**Arquivos modificados:**
- src/types/agent.ts
- src/components/agent/AgentChat.tsx
- src/components/agent/index.ts
- src/stores/use-agent-store.ts
- __tests__/unit/components/agent/AgentChat.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
