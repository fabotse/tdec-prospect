# Story 16.4: Onboarding & Selecao de Modo

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario novo do Agente TDEC,
I want ver uma mensagem de boas-vindas explicando o que o agente faz e poder escolher o modo de operacao,
so that eu entenda como usar o agente e tenha controle sobre o nivel de autonomia.

## Acceptance Criteria

1. **Given** o usuario abre o Agente TDEC pela primeira vez (nenhuma execucao anterior)
   **When** a pagina carrega
   **Then** o agente exibe uma mensagem de onboarding explicando suas capacidades
   **And** a mensagem inclui: o que o agente faz, como funciona o fluxo, e convida o usuario a comecar

2. **Given** o usuario ja usou o agente anteriormente (tem execucoes no historico)
   **When** a pagina carrega
   **Then** a mensagem de onboarding NAO e exibida
   **And** o agente mostra uma saudacao breve e esta pronto para receber o briefing

3. **Given** o briefing foi parseado e confirmado pelo usuario
   **When** o agente apresenta o plano de execucao
   **Then** inclui o seletor de modo com as opcoes "Guiado" e "Autopilot"
   **And** cada modo tem descricao clara: Guiado = "Vou pedir sua aprovacao em cada etapa" / Autopilot = "Executo tudo sem interrupcoes"

4. **Given** o usuario seleciona um modo
   **When** confirma a selecao
   **Then** o modo e salvo no campo `mode` da execucao (agent_executions)
   **And** o agente confirma: "Modo [Guiado/Autopilot] selecionado"

## Tasks / Subtasks

- [x] Task 1: GET /api/agent/executions — Listar execucoes (AC: #1, #2)
  - [x] 1.1 Adicionar handler GET ao arquivo existente `src/app/api/agent/executions/route.ts`
  - [x] 1.2 Auth via `getCurrentUserProfile()` (401 se nao autenticado)
  - [x] 1.3 Query `agent_executions` filtrado por RLS (tenant automatico), ordenado `created_at DESC`
  - [x] 1.4 Retornar `{ data: AgentExecution[] }` — mesmo formato das outras rotas

- [x] Task 2: useAgentOnboarding hook (AC: #1, #2)
  - [x] 2.1 Criar `src/hooks/use-agent-onboarding.ts`
  - [x] 2.2 Usar TanStack Query para chamar `GET /api/agent/executions`
  - [x] 2.3 Retornar `{ isFirstTime: boolean, isLoading: boolean }` — isFirstTime = data.length === 0
  - [x] 2.4 Configurar `staleTime: 5 * 60 * 1000` (cache 5min — nao precisa refetch constante)

- [x] Task 3: AgentOnboarding — Componente de boas-vindas (AC: #1)
  - [x] 3.1 Criar `src/components/agent/AgentOnboarding.tsx`
  - [x] 3.2 Icone Bot (lucide-react) com container circular `bg-muted`
  - [x] 3.3 Titulo: "Agente TDEC" com `text-h2`
  - [x] 3.4 Texto explicativo em portugues cobrindo:
        - O que o agente faz (monta campanhas de prospeccao completas)
        - Como funciona o fluxo (briefing → parametros → modo → execucao)
        - Convite a comecar ("Descreva quem voce quer prospectar!")
  - [x] 3.5 Estilo: centralizado vertical/horizontal, `max-w-md`, `text-body-small text-muted-foreground`
  - [x] 3.6 `data-testid="agent-onboarding"`

- [x] Task 4: Atualizar AgentMessageList — Diferenciar empty states (AC: #1, #2)
  - [x] 4.1 Adicionar prop `isFirstTime?: boolean` a `AgentMessageListProps`
  - [x] 4.2 Quando `messages.length === 0 && isFirstTime === true`: renderizar `<AgentOnboarding />`
  - [x] 4.3 Quando `messages.length === 0 && isFirstTime === false`: manter placeholder atual (saudacao breve)
  - [x] 4.4 Quando `messages.length === 0 && isFirstTime === undefined` (loading): manter placeholder atual (evitar flash)

- [x] Task 5: AgentModeSelector — Componente seletor de modo (AC: #3)
  - [x] 5.1 Criar `src/components/agent/AgentModeSelector.tsx`
  - [x] 5.2 Props: `onModeSelect: (mode: ExecutionMode) => void`, `defaultMode?: ExecutionMode`
  - [x] 5.3 Layout: card com titulo "Escolha o modo de operacao" + duas opcoes lado a lado
  - [x] 5.4 Card Guiado: icone `ShieldCheck` (lucide), titulo "Guiado", descricao "Vou pedir sua aprovacao em cada etapa"
  - [x] 5.5 Card Autopilot: icone `Zap` (lucide), titulo "Autopilot", descricao "Executo tudo sem interrupcoes"
  - [x] 5.6 Cada card: `border rounded-lg p-4 cursor-pointer hover:border-foreground transition-colors`
  - [x] 5.7 Card selecionado: `border-foreground bg-muted` (destaque visual)
  - [x] 5.8 Botao "Confirmar" habilitado somente apos selecao. Ao clicar chama `onModeSelect(selectedMode)`
  - [x] 5.9 Se `defaultMode` fornecido (do briefing parser), pre-selecionar esse modo
  - [x] 5.10 `data-testid="agent-mode-selector"`, `data-testid="mode-guided"`, `data-testid="mode-autopilot"`, `data-testid="mode-confirm-btn"`
  - [x] 5.11 Estilo: `border-t border-border px-6 py-4` (mesmo padrao do AgentInput)

- [x] Task 6: PATCH /api/agent/executions/[executionId] — Atualizar modo (AC: #4)
  - [x] 6.1 Criar `src/app/api/agent/executions/[executionId]/route.ts` com handler PATCH
  - [x] 6.2 Auth via `getCurrentUserProfile()` (401)
  - [x] 6.3 Validar execucao existe e pertence ao tenant via RLS (404)
  - [x] 6.4 Aceitar body `{ mode: 'guided' | 'autopilot' }` — validar com array `validModes`
  - [x] 6.5 Atualizar `agent_executions.mode` via Supabase `.update({ mode }).eq('id', executionId)`
  - [x] 6.6 Retornar `{ data: updatedExecution }` (200)
  - [x] 6.7 Erros: 400 (modo invalido), 404 (execucao nao encontrada), 500 (erro interno)
  - [x] 6.8 Mensagens de erro em portugues

- [x] Task 7: Integracao no AgentChat (AC: #1, #2, #3, #4)
  - [x] 7.1 Importar `useAgentOnboarding` e passar `isFirstTime` para `AgentMessageList`
  - [x] 7.2 Adicionar estado `showModeSelector` ao `useAgentStore` (Zustand)
  - [x] 7.3 Alterar fluxo apos briefing confirmado:
        - Antes: `sendAgentMessage("Briefing confirmado! Iniciando prospeccao...")`
        - Agora: `sendAgentMessage("Briefing confirmado! Agora escolha o modo de operacao:")` + `setShowModeSelector(true)`
  - [x] 7.4 Renderizar `<AgentModeSelector>` entre `<AgentMessageList>` e `<AgentInput>` quando `showModeSelector === true`
  - [x] 7.5 Desabilitar `<AgentInput>` enquanto `showModeSelector === true` (input disabled)
  - [x] 7.6 Criar handler `handleModeSelect`:
        - Chamar PATCH `/api/agent/executions/${execId}` com `{ mode }`
        - Inserir mensagem agente: `"Modo ${mode === 'guided' ? 'Guiado' : 'Autopilot'} selecionado. Preparando plano de execucao..."`
        - `setShowModeSelector(false)`
        - Toast error se API falhar
  - [x] 7.7 Se briefing parser ja detectou modo (briefingState.briefing?.mode), passar como `defaultMode` ao AgentModeSelector

- [x] Task 8: Atualizar exports e store (AC: #1-#4)
  - [x] 8.1 Adicionar `AgentOnboarding` e `AgentModeSelector` ao `src/components/agent/index.ts`
  - [x] 8.2 Adicionar ao `useAgentStore`:
        ```
        showModeSelector: boolean
        setShowModeSelector: (show: boolean) => void
        ```

- [x] Task 9: Unit Tests (AC: #1-#4)
  - [x] 9.1 Testes GET /api/agent/executions: auth 401, sucesso lista vazia, sucesso com execucoes, erro 500
  - [x] 9.2 Testes useAgentOnboarding: isFirstTime true (0 execucoes), isFirstTime false (>0 execucoes), isLoading state
  - [x] 9.3 Testes AgentOnboarding: renderiza titulo, renderiza texto explicativo, renderiza icone
  - [x] 9.4 Testes AgentModeSelector: renderiza dois cards, selecao visual, botao confirmar desabilitado sem selecao, callback com modo correto, defaultMode pre-seleciona, data-testids presentes
  - [x] 9.5 Testes PATCH /api/agent/executions/[id]: auth 401, execucao nao encontrada 404, modo invalido 400, sucesso 200, erro 500
  - [x] 9.6 Testes AgentMessageList: renderiza AgentOnboarding quando isFirstTime=true, renderiza placeholder quando isFirstTime=false, nao renderiza nenhum quando tem mensagens
  - [x] 9.7 Testes AgentChat com onboarding+modo: isFirstTime passado para MessageList, apos briefing confirmado mostra mode selector, modo selecionado salva via API + mensagem confirmacao, input desabilitado durante selecao de modo

## Dev Notes

### Fluxo Completo Atualizado (com 16.4)

```
1. Usuario abre pagina do agente
   ├── Primeiro uso (0 execucoes) → AgentOnboarding (boas-vindas detalhada)
   └── Uso recorrente (>0 execucoes) → Placeholder breve

2. Usuario digita primeira mensagem
   → Execucao criada (POST /api/agent/executions) — status: pending, mode: guided
   → Briefing flow inicia (useBriefingFlow)

3. Briefing parseado e confirmado
   → saveBriefing (PATCH /api/agent/executions/[id]/briefing)
   → Mensagem agente: "Briefing confirmado! Agora escolha o modo de operacao:"
   → showModeSelector = true (input desabilitado)

4. Usuario seleciona modo (Guiado/Autopilot)
   → PATCH /api/agent/executions/[id] com { mode }
   → Mensagem agente: "Modo X selecionado. Preparando plano de execucao..."
   → showModeSelector = false (input reabilitado)
   → Pronto para story 16.5 (plano de execucao + estimativa de custo)
```

### Decisao Arquitetural: Onboarding como Empty State

O onboarding e implementado como variacao do empty state do `AgentMessageList`, NAO como mensagem persistida no banco. Razoes:
- Nao poluir historico de mensagens com mensagens de sistema de onboarding
- Onboarding desaparece naturalmente quando o usuario envia a primeira mensagem
- Sem necessidade de criar execucao para mostrar onboarding

### Decisao Arquitetural: Mode Selector como Componente Inline

O mode selector e renderizado como componente entre `AgentMessageList` e `AgentInput`, NAO como mensagem no chat. Razoes:
- Interativo (cards clicaveis + botao confirmar) — mensagens sao passivas
- Segue padrao de approval gates (story 16.5+) que tambem serao componentes inline
- Desaparece apos selecao, sem poluir historico de mensagens
- Input desabilitado durante selecao forca o usuario a escolher antes de continuar

### Modo Default do Briefing Parser

O `ParsedBriefing.mode` ja e preenchido pelo briefing parser (story 16.3) com default `'guided'`. Se o usuario mencionou "autopilot" no briefing, o parser seta `mode: 'autopilot'`. O `AgentModeSelector` recebe isso como `defaultMode` para pre-selecionar, mas o usuario pode mudar. O modo definitivo e salvo em `agent_executions.mode` (AC #4).

### Padrao de API — GET /api/agent/executions

Segue padrao existente no projeto:
```typescript
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_executions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { /* 500 */ }
  return NextResponse.json({ data: data || [] });
}
```
RLS filtra automaticamente por tenant_id — nao precisa `.eq('tenant_id', ...)`.

### Padrao de API — PATCH /api/agent/executions/[executionId]

Segue padrao do PATCH briefing (`src/app/api/agent/executions/[executionId]/briefing/route.ts`):
```typescript
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const profile = await getCurrentUserProfile();
  if (!profile) { /* 401 */ }
  const { executionId } = await params;
  const supabase = await createClient();
  // Verificar execucao existe (RLS filtra por tenant)
  const { data: execution } = await supabase
    .from("agent_executions").select("id").eq("id", executionId).single();
  if (!execution) { /* 404 */ }
  // Validar body
  const body = await request.json();
  const validModes = ["guided", "autopilot"];
  if (!body.mode || !validModes.includes(body.mode)) { /* 400 */ }
  // Update
  const { data, error } = await supabase
    .from("agent_executions")
    .update({ mode: body.mode })
    .eq("id", executionId)
    .select()
    .single();
  if (error) { /* 500 */ }
  return NextResponse.json({ data });
}
```

### Padrao de Hook — useAgentOnboarding

```typescript
import { useQuery } from "@tanstack/react-query";
import type { AgentExecution } from "@/types/agent";

export function useAgentOnboarding() {
  const { data, isLoading } = useQuery<{ data: AgentExecution[] }>({
    queryKey: ["agent-executions-onboarding"],
    queryFn: async () => {
      const response = await fetch("/api/agent/executions");
      if (!response.ok) throw new Error("Falha ao verificar historico");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    isFirstTime: !isLoading && (data?.data?.length ?? 0) === 0,
    isLoading,
  };
}
```

### Padrao de Componente — AgentModeSelector

```typescript
"use client";
import { useState } from "react";
import { ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExecutionMode } from "@/types/agent";

interface AgentModeSelectorProps {
  onModeSelect: (mode: ExecutionMode) => void;
  defaultMode?: ExecutionMode;
}
```

Layout: container com `border-t border-border px-6 py-4` (mesmo padrao do AgentInput). Dois cards lado a lado com `grid grid-cols-2 gap-3`. Botao "Confirmar" abaixo alinhado a direita.

### Padrao de Componente — AgentOnboarding

Substituir o placeholder atual do AgentMessageList para first-time users:
```typescript
"use client";
import { Bot, ArrowRight } from "lucide-react";

export function AgentOnboarding() {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center" data-testid="agent-onboarding">
      <div className="text-center flex flex-col items-center gap-4 max-w-md px-6">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Bot className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-h2 text-foreground">Agente TDEC</h2>
        <div className="text-body-small text-muted-foreground flex flex-col gap-2">
          <p>Eu monto campanhas de prospeccao completas — da busca de empresas ate a ativacao de emails.</p>
          <p>Como funciona:</p>
          <ol className="text-left list-decimal list-inside flex flex-col gap-1">
            <li>Voce descreve quem quer prospectar</li>
            <li>Eu interpreto e extraio os parametros</li>
            <li>Voce escolhe o modo (Guiado ou Autopilot)</li>
            <li>Eu executo o pipeline passo a passo</li>
          </ol>
        </div>
        <p className="text-body-small text-foreground font-medium flex items-center gap-1.5">
          Comece descrevendo quem voce quer prospectar <ArrowRight className="h-4 w-4" />
        </p>
      </div>
    </div>
  );
}
```

### Alteracao no AgentChat.tsx

Mudancas pontuais no fluxo:

```typescript
// ADICIONAR: import
import { useAgentOnboarding } from "@/hooks/use-agent-onboarding";

// ADICIONAR: no componente
const { isFirstTime } = useAgentOnboarding();
const showModeSelector = useAgentStore((s) => s.showModeSelector);
const setShowModeSelector = useAgentStore((s) => s.setShowModeSelector);

// ALTERAR: handleSendMessage — bloco apos briefing confirmado
if (result.confirmed) {
  await saveBriefing(execId);
  await sendAgentMessage(execId, "Briefing confirmado! Agora escolha o modo de operacao:");
  setShowModeSelector(true);
}

// ADICIONAR: handler de selecao de modo
const handleModeSelect = useCallback(async (mode: ExecutionMode) => {
  if (!currentExecutionId) return;
  try {
    const response = await fetch(`/api/agent/executions/${currentExecutionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!response.ok) {
      toast.error("Erro ao salvar modo. Tente novamente.");
      return;
    }
    const label = mode === "guided" ? "Guiado" : "Autopilot";
    await sendAgentMessage(currentExecutionId, `Modo ${label} selecionado. Preparando plano de execucao...`);
    setShowModeSelector(false);
  } catch {
    toast.error("Erro ao salvar modo. Tente novamente.");
  }
}, [currentExecutionId, sendAgentMessage, setShowModeSelector]);

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
      />
    )}
    <AgentInput
      onSendMessage={handleSendMessage}
      isSending={sendMessageMutation.isPending}
      disabled={showModeSelector}
    />
  </div>
);
```

### Alteracao no AgentInput — Prop disabled

Adicionar prop `disabled?: boolean` ao AgentInput. Quando `disabled=true`:
- Input field desabilitado
- Botao de envio desabilitado
- Placeholder muda para "Selecione o modo acima..."

Verificar arquivo atual `src/components/agent/AgentInput.tsx` — pode ja suportar desabilitar via `isSending`. Se sim, pode reaproveitar logica. Se nao, adicionar prop.

### Alteracao no useAgentStore

```typescript
interface AgentUIState {
  currentExecutionId: string | null;
  isInputDisabled: boolean;
  isAgentProcessing: boolean;
  showModeSelector: boolean;  // NOVO
}

interface AgentUIActions {
  setCurrentExecutionId: (id: string | null) => void;
  setInputDisabled: (disabled: boolean) => void;
  setAgentProcessing: (processing: boolean) => void;
  setShowModeSelector: (show: boolean) => void;  // NOVO
}

// Adicionar no create:
showModeSelector: false,
setShowModeSelector: (show) => set({ showModeSelector: show }),
```

### Imports Existentes que DEVEM ser Reutilizados

| Import | De | Usado em |
|--------|-----|----------|
| `ExecutionMode` | `@/types/agent` | AgentModeSelector, handleModeSelect |
| `AgentExecution` | `@/types/agent` | useAgentOnboarding response typing |
| `getCurrentUserProfile` | `@/lib/supabase/tenant` | API routes |
| `createClient` | `@/lib/supabase/server` | API routes |
| `cn` | `@/lib/utils` | AgentModeSelector card styling |
| `Button` | `@/components/ui/button` | AgentModeSelector confirm button |
| `useQuery` | `@tanstack/react-query` | useAgentOnboarding |
| `useAgentStore` | `@/stores/use-agent-store` | AgentChat (showModeSelector) |
| `Bot` | `lucide-react` | AgentOnboarding |
| `ShieldCheck`, `Zap` | `lucide-react` | AgentModeSelector |
| `toast` | `sonner` | AgentChat (erro modo) |

### NAO CRIAR / NAO DUPLICAR

- NAO criar tipo ExecutionMode — ja existe em `src/types/agent.ts:11`
- NAO criar createClient ou getCurrentUserProfile — importar de `@/lib/supabase/server` e `@/lib/supabase/tenant`
- NAO adicionar messageType novo — onboarding e modo sao componentes, nao mensagens
- NAO criar migration — campo `mode` ja existe em `agent_executions` (story 16.1)
- NAO modificar useBriefingFlow — o hook esta completo, modo e tratado APOS confirmacao

### Learnings da Story 16.3 (APLICAR AQUI)

1. **Race condition execucao**: AgentChat cria execucao no primeiro sendMessage. Hooks devem usar executionId do Zustand store, nao criar duplicata
2. **Mensagens via fetch direto**: `sendAgentMessage` usa fetch, nao o hook `useSendMessage`. Manter esse padrao para mensagens do agente
3. **Guard execId**: Sempre verificar `if (!execId) return;` antes de usar executionId
4. **Toast para erros**: Usar `toast.error()` do sonner para feedback visual em erros de API
5. **Teste ESLint no-console**: NAO usar console.log nos componentes/hooks. Apenas nas API routes com pattern `console.error("[Context] message:", error)`
6. **RouteParams com Promise**: Next.js App Router requer `params: Promise<{ executionId: string }>` e `const { executionId } = await params;`
7. **Retorno de resposta ok check**: Sempre verificar `if (!response.ok)` antes de processar resposta

### Padrao de Testes (do projeto)

```typescript
// API route tests
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/supabase/tenant", () => ({ getCurrentUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Component tests
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hook tests
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Wrapper com QueryClientProvider para hooks que usam TanStack Query

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
├── components/agent/
│   ├── AgentOnboarding.tsx        (componente de boas-vindas)
│   └── AgentModeSelector.tsx      (seletor Guiado/Autopilot)
├── hooks/
│   └── use-agent-onboarding.ts    (deteccao first-time user)
└── app/api/agent/executions/
    └── [executionId]/
        └── route.ts               (PATCH mode update)

__tests__/unit/
├── components/agent/
│   ├── AgentOnboarding.test.tsx
│   └── AgentModeSelector.test.tsx
├── hooks/
│   └── use-agent-onboarding.test.tsx
└── api/agent/
    ├── executions-list.test.ts    (GET /api/agent/executions)
    └── executions-detail.test.ts  (PATCH /api/agent/executions/[id])
```

Arquivos a MODIFICAR:
```
src/
├── app/api/agent/executions/route.ts      (adicionar GET handler)
├── components/agent/AgentChat.tsx          (integrar onboarding + modo)
├── components/agent/AgentMessageList.tsx   (prop isFirstTime)
├── components/agent/AgentInput.tsx         (prop disabled)
├── components/agent/index.ts              (exports novos)
└── stores/use-agent-store.ts              (showModeSelector state)

__tests__/unit/
├── components/agent/AgentChat.test.tsx     (testes onboarding + modo)
└── components/agent/AgentMessageList.test.tsx (testes isFirstTime)
```

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md — Story 16.4 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Secao "Agente TDEC — Decisoes Arquiteturais"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Secao "Agente TDEC — Padroes de Implementacao"]
- [Source: _bmad-output/planning-artifacts/architecture.md — Secao "Agente TDEC — Estrutura do Projeto"]
- [Source: src/components/agent/AgentChat.tsx — Fluxo atual de briefing e mensagens]
- [Source: src/hooks/use-briefing-flow.ts — Estado confirmed e briefing.mode]
- [Source: src/types/agent.ts:11 — ExecutionMode type]
- [Source: src/types/agent.ts:19-36 — AgentExecution interface (campo mode)]
- [Source: src/stores/use-agent-store.ts — Zustand store padrao]
- [Source: src/components/agent/AgentMessageList.tsx — Empty state placeholder atual]
- [Source: src/app/api/agent/executions/route.ts — POST handler existente]
- [Source: src/app/api/agent/executions/[executionId]/briefing/route.ts — PATCH briefing padrao]
- [Source: _bmad-output/implementation-artifacts/16-3-briefing-parser-linguagem-natural.md — Learnings e code review fixes]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A

### Completion Notes List
- Task 1: GET handler adicionado ao route.ts existente, seguindo padrao do POST. Auth + RLS + order created_at DESC.
- Task 2: useAgentOnboarding hook com TanStack Query, staleTime 5min, retorna isFirstTime/isLoading.
- Task 3: AgentOnboarding componente com icone Bot, titulo, texto explicativo 4 etapas, convite, data-testid.
- Task 4: AgentMessageList diferencia 3 estados: isFirstTime=true (onboarding), false (placeholder breve), undefined (placeholder — evita flash).
- Task 5: AgentModeSelector com 2 cards (Guiado/Autopilot), selecao visual, botao Confirmar, defaultMode, todos data-testids.
- Task 6: PATCH /api/agent/executions/[executionId] com validacao existencia, modo valido, mensagens pt-BR.
- Task 7: AgentChat integra useAgentOnboarding, showModeSelector state, handleModeSelect com PATCH + mensagem, input disabled durante selecao, defaultMode do briefing parser.
- Task 8: Exports atualizados no index.ts, showModeSelector/setShowModeSelector adicionados ao Zustand store.
- Task 9: 79 testes novos/atualizados, 320 test files passando, 5560 testes no total, 0 regressoes.

### Change Log
- 2026-03-26: Story 16.4 implementada — onboarding, deteccao first-time, seletor de modo Guiado/Autopilot, integracao completa no AgentChat
- 2026-03-26: Fix layout onboarding — wrapper do AgentOnboarding em AgentMessageList nao tinha `flex-1 flex flex-col min-h-0`, input ficava colado no onboarding ao inves de ficar no fundo como chat. Adicionado script `scripts/clean-agent-executions.ts` para facilitar testes visuais (limpa agent_executions + cascade)
- 2026-03-26: Code review fixes (4 issues):
  - [M1] useAgentOnboarding: isFirstTime retornava true em erro de API (bug). Fix: checar isError do useQuery
  - [M2] AgentModeSelector: botao Confirmar sem loading state (double-click risk). Fix: prop isSubmitting + isModeSubmitting state no AgentChat
  - [L1] AgentModeSelector: faltava aria-pressed nos cards de modo. Fix: adicionado aria-pressed={isSelected}
  - [L2] AgentModeSelector test: mock nao resetava entre testes. Fix: adicionado beforeEach + clearMocks

### File List

**Criados:**
- src/hooks/use-agent-onboarding.ts
- src/components/agent/AgentOnboarding.tsx
- src/components/agent/AgentModeSelector.tsx
- src/app/api/agent/executions/[executionId]/route.ts
- scripts/clean-agent-executions.ts
- __tests__/unit/api/agent/executions-list.test.ts
- __tests__/unit/api/agent/executions-detail.test.ts
- __tests__/unit/hooks/use-agent-onboarding.test.tsx
- __tests__/unit/components/agent/AgentOnboarding.test.tsx
- __tests__/unit/components/agent/AgentModeSelector.test.tsx

**Modificados:**
- src/app/api/agent/executions/route.ts (GET handler)
- src/components/agent/AgentChat.tsx (onboarding + mode selector integration)
- src/components/agent/AgentMessageList.tsx (isFirstTime prop)
- src/components/agent/AgentInput.tsx (disabled prop + placeholder)
- src/components/agent/index.ts (exports)
- src/stores/use-agent-store.ts (showModeSelector state)
- __tests__/unit/components/agent/AgentChat.test.tsx (16.4 tests)
- __tests__/unit/components/agent/AgentMessageList.test.tsx (onboarding tests)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status update)
