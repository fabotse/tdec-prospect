# Story 16.2: Sistema de Mensagens do Chat

Status: done

## Story

As a usuario do Agente TDEC,
I want enviar mensagens e receber respostas do agente em tempo real,
So that eu possa conversar com o agente de forma fluida e natural.

## Acceptance Criteria

1. **Given** o usuario esta na pagina do agente com uma execucao ativa **When** digita uma mensagem no input e pressiona Enter ou clica no botao de envio **Then** a mensagem aparece imediatamente na lista de mensagens com role 'user' **And** a mensagem e persistida na tabela `agent_messages`

2. **Given** uma nova mensagem com role 'agent' e inserida no banco **When** a subscription Supabase Realtime detecta a mudanca **Then** a mensagem aparece automaticamente na lista de mensagens do frontend sem refresh **And** a lista rola automaticamente para a mensagem mais recente

3. **Given** mensagens de diferentes tipos (text, progress, error, cost_estimate) **When** renderizadas na lista **Then** cada tipo tem estilo visual distinto conforme o messageType no metadata **And** mensagens do usuario aparecem alinhadas a direita, do agente a esquerda

4. **Given** o chat com historico de mensagens **When** o usuario recarrega a pagina **Then** o historico completo de mensagens da execucao e carregado na ordem cronologica

5. **Given** o usuario digita no input **When** o agente esta processando (aguardando resposta) **Then** um indicador de "agente digitando" e exibido na area de mensagens

## Tasks / Subtasks

- [x] Task 1: Criar API Route para enviar mensagens do usuario (AC: #1)
  - [x] 1.1 Criar `src/app/api/agent/executions/[executionId]/messages/route.ts` com handler POST
  - [x] 1.2 Validar que a execucao existe e pertence ao tenant (RLS via Supabase server client)
  - [x] 1.3 Inserir mensagem com role='user' na tabela `agent_messages`
  - [x] 1.4 Retornar a mensagem criada com status 201

- [x] Task 2: Criar API Route para listar mensagens de uma execucao (AC: #4)
  - [x] 2.1 Adicionar handler GET na mesma route `messages/route.ts`
  - [x] 2.2 Buscar mensagens ordenadas por `created_at ASC` para a execucao
  - [x] 2.3 Retornar array de mensagens

- [x] Task 3: Criar API Route para criar execucao (AC: #1)
  - [x] 3.1 Criar `src/app/api/agent/executions/route.ts` com handler POST
  - [x] 3.2 Criar execucao com status='pending', briefing vazio, total_steps=5 (padrao pipeline completo)
  - [x] 3.3 Retornar a execucao criada

- [x] Task 4: Criar hook `useAgentMessages` com Supabase Realtime (AC: #2, #4)
  - [x] 4.1 Criar `src/hooks/use-agent-messages.ts`
  - [x] 4.2 Usar TanStack Query para fetch inicial de mensagens (GET /api/agent/executions/[id]/messages)
  - [x] 4.3 Configurar Supabase Realtime subscription em `agent_messages` filtrado por `execution_id`
  - [x] 4.4 On INSERT event: adicionar mensagem ao cache do TanStack Query (setQueryData)
  - [x] 4.5 Cleanup: remover channel no unmount
  - [x] 4.6 Retornar `{ messages, isLoading, isConnected }`

- [x] Task 5: Criar hook `useSendMessage` para enviar mensagens (AC: #1)
  - [x] 5.1 Criar mutation em `src/hooks/use-agent-messages.ts` (mesmo arquivo)
  - [x] 5.2 Implementar optimistic update: adicionar mensagem ao cache antes da resposta do server
  - [x] 5.3 On success: substituir mensagem optimistic pela do server (com id real)
  - [x] 5.4 On error: remover mensagem optimistic e mostrar erro

- [x] Task 6: Criar componente `AgentMessageBubble` (AC: #3)
  - [x] 6.1 Criar `src/components/agent/AgentMessageBubble.tsx`
  - [x] 6.2 Renderizar mensagens do usuario alinhadas a direita com bg diferenciado
  - [x] 6.3 Renderizar mensagens do agente alinhadas a esquerda com icone Bot
  - [x] 6.4 Estilizar por messageType: text (bolha padrao), progress (com icone loading), error (borda vermelha), cost_estimate (card especial), summary (card com metricas)
  - [x] 6.5 Exibir timestamp relativo (ex: "agora", "2min atras")

- [x] Task 7: Criar componente `AgentTypingIndicator` (AC: #5)
  - [x] 7.1 Criar `src/components/agent/AgentTypingIndicator.tsx`
  - [x] 7.2 Renderizar indicador com 3 dots animados + "Agente digitando..."
  - [x] 7.3 Usar Framer Motion para animacao dos dots
  - [x] 7.4 Exibir apenas quando `isAgentProcessing` e true no store

- [x] Task 8: Atualizar `AgentMessageList` para renderizar mensagens reais (AC: #2, #3, #4)
  - [x] 8.1 Receber `messages` como prop (do hook useAgentMessages)
  - [x] 8.2 Renderizar lista de `AgentMessageBubble` para cada mensagem
  - [x] 8.3 Manter placeholder (estado vazio) quando nao ha mensagens
  - [x] 8.4 Implementar auto-scroll para o final quando nova mensagem chega (useRef + scrollIntoView)
  - [x] 8.5 Renderizar `AgentTypingIndicator` no final da lista quando agente esta processando

- [x] Task 9: Atualizar `AgentInput` para enviar mensagens via hook (AC: #1)
  - [x] 9.1 Integrar com `useSendMessage` no handleSubmit
  - [x] 9.2 Desabilitar input enquanto aguarda resposta (isAgentProcessing)
  - [x] 9.3 Limpar input apos envio bem-sucedido

- [x] Task 10: Atualizar `AgentChat` para orquestrar estado (AC: #1-#5)
  - [x] 10.1 Gerenciar criacao/selecao de execucao (criar nova se nao existe)
  - [x] 10.2 Usar `useAgentMessages` com executionId
  - [x] 10.3 Passar messages e handlers para componentes filhos
  - [x] 10.4 Gerenciar estado `isAgentProcessing` no store

- [x] Task 11: Atualizar Zustand store com novos estados (AC: #5)
  - [x] 11.1 Adicionar `isAgentProcessing: boolean` ao store
  - [x] 11.2 Adicionar `setAgentProcessing: (processing: boolean) => void`

- [x] Task 12: Atualizar barrel export (AC: N/A)
  - [x] 12.1 Adicionar `AgentMessageBubble` e `AgentTypingIndicator` ao `index.ts`

- [x] Task 13: Testes unitarios (AC: #1-#5)
  - [x] 13.1 Testes para API Route POST messages (insercao, validacao, erro)
  - [x] 13.2 Testes para API Route GET messages (busca ordenada, execucao inexistente)
  - [x] 13.3 Testes para API Route POST executions (criacao)
  - [x] 13.4 Testes para useAgentMessages hook (fetch inicial, realtime insert, cleanup)
  - [x] 13.5 Testes para useSendMessage hook (optimistic update, sucesso, erro)
  - [x] 13.6 Testes para AgentMessageBubble (role user/agent, cada messageType, timestamp)
  - [x] 13.7 Testes para AgentTypingIndicator (renderiza quando ativo, oculta quando inativo)
  - [x] 13.8 Testes para AgentMessageList atualizado (lista de mensagens, auto-scroll, placeholder vazio, typing indicator)
  - [x] 13.9 Testes para AgentInput atualizado (envio via hook, estado disabled)
  - [x] 13.10 Testes para AgentChat atualizado (orquestracao, criacao execucao)
  - [x] 13.11 Testes para store atualizado (isAgentProcessing)

## Dev Notes

### Contexto do Epic 16

Esta e a SEGUNDA story do Epic 16 (Agent Foundation & Briefing Conversacional). Constroi sobre a Story 16.1 que criou: data models (4 tabelas SQL), tipos TypeScript, pagina basica do agente, componentes shell (AgentChat, AgentInput, AgentMessageList), e Zustand store minimo.

**Esta story implementa:** Sistema completo de chat com envio, recebimento realtime, renderizacao por tipo de mensagem, historico e indicador de digitacao.

**NAO implementar nesta story:** Parsing de briefing (16.3), onboarding (16.4), plano de execucao (16.5), cadastro de produto inline (16.6). As mensagens nesta story sao enviadas e persistidas, mas a resposta do agente sera mock/manual — o processamento inteligente vem na 16.3.

### Supabase Realtime — Primeira Implementacao no Projeto

**IMPORTANTE:** Este projeto NAO tem nenhuma subscription Supabase Realtime implementada ate agora. Todos os hooks usam TanStack Query com fetch convencional para API Routes. Esta story e a PRIMEIRA a usar realtime.

**Padrao a seguir (da arquitetura):**

```typescript
import { createClient } from "@/lib/supabase/client";

// Dentro do hook useAgentMessages:
const supabase = createClient(); // Singleton browser client

const channel = supabase
  .channel(`agent-messages-${executionId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "agent_messages",
      filter: `execution_id=eq.${executionId}`,
    },
    (payload) => {
      // Adicionar nova mensagem ao cache do TanStack Query
      queryClient.setQueryData(
        ["agent-messages", executionId],
        (old: AgentMessage[] | undefined) => [...(old || []), payload.new as AgentMessage]
      );
    }
  )
  .subscribe((status) => {
    setIsConnected(status === "SUBSCRIBED");
  });

// Cleanup no useEffect return:
return () => {
  supabase.removeChannel(channel);
};
```

**Regra da arquitetura:** Um unico hook gerencia todas as subscriptions de uma execucao. Componentes filhos consomem dados via props — NAO criam subscriptions proprias.

**Prerequisito Supabase:** Para que Realtime funcione com `postgres_changes`, a tabela `agent_messages` precisa ter replication habilitada no Supabase. Verificar se o projeto ja tem isso configurado. Se nao, adicionar via Supabase Dashboard > Database > Replication, ou via SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;
```
Considerar incluir isso como migration `00051_enable_realtime_agent_messages.sql`.

### Supabase Browser Client — Singleton

O client browser esta em `src/lib/supabase/client.ts` e usa padrao singleton:
```typescript
import { createBrowserClient } from "@supabase/ssr";
let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;
export function createClient() {
  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return supabaseInstance;
}
```
Usar `createClient()` do `@/lib/supabase/client` para o channel realtime no hook.

### API Route — Padrao do Projeto

API Routes seguem este padrao (ex: `src/app/api/campaigns/route.ts`):
```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  // ... validacao, operacao, retorno
  return NextResponse.json({ data: result }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  // ... fetch, retorno
  return NextResponse.json({ data: results });
}
```

**Importante:** API Routes usam `createClient` de `@/lib/supabase/server` (server-side), NAO o browser client.

### TanStack Query — Padrao de Hooks

Seguir o padrao existente de hooks como `use-campaigns.ts`:
```typescript
const QUERY_KEY = ["agent-messages", executionId];

async function fetchMessages(executionId: string): Promise<AgentMessage[]> {
  const response = await fetch(`/api/agent/executions/${executionId}/messages`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Erro ao buscar mensagens");
  return result.data;
}

// No hook:
const { data: messages, isLoading } = useQuery({
  queryKey: QUERY_KEY,
  queryFn: () => fetchMessages(executionId),
  enabled: !!executionId,
});
```

### Optimistic Update para Envio de Mensagem

Quando o usuario envia, a mensagem deve aparecer IMEDIATAMENTE (antes da resposta do server):

```typescript
const sendMessageMutation = useMutation({
  mutationFn: async (content: string) => {
    const response = await fetch(`/api/agent/executions/${executionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, role: "user" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Erro ao enviar mensagem");
    return result.data as AgentMessage;
  },
  onMutate: async (content) => {
    await queryClient.cancelQueries({ queryKey: QUERY_KEY });
    const previous = queryClient.getQueryData<AgentMessage[]>(QUERY_KEY);
    const optimistic: AgentMessage = {
      id: `temp-${Date.now()}`,
      execution_id: executionId,
      role: "user",
      content,
      metadata: { messageType: "text" },
      created_at: new Date().toISOString(),
    };
    queryClient.setQueryData<AgentMessage[]>(QUERY_KEY, (old) => [...(old || []), optimistic]);
    return { previous };
  },
  onError: (_err, _content, context) => {
    if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  },
});
```

### Renderizacao por MessageType

Cada `messageType` no metadata determina o visual:

| messageType | Visual | Descricao |
|-------------|--------|-----------|
| `text` | Bolha padrao | Mensagem de texto simples (user ou agent) |
| `progress` | Bolha com icone `Loader2` animado | Progresso de uma etapa do pipeline |
| `error` | Bolha com borda vermelha + icone `AlertCircle` | Mensagem de erro |
| `cost_estimate` | Card com tabela de custos | Estimativa de custo pre-execucao |
| `summary` | Card com metricas | Resumo final da execucao |
| `approval_gate` | Card interativo (futuro) | Para stories posteriores — nesta story, renderizar como card informativo |

**Regra:** Mensagens do `user` sao sempre `text`. Outros tipos sao do `agent` ou `system`.

### Auto-Scroll

Usar `useRef` + `scrollIntoView` no final da lista:

```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);

// No JSX:
<div ref={messagesEndRef} />
```

### Indicador de "Agente Digitando"

Controle via `isAgentProcessing` no Zustand store. O flag e ligado quando o usuario envia uma mensagem e desligado quando uma mensagem do agente chega via realtime. Nesta story, o desligamento sera baseado no recebimento de qualquer mensagem com `role: 'agent'` via realtime.

Animacao com Framer Motion (3 dots bouncing):
```typescript
import { motion } from "framer-motion";

const dotVariants = {
  animate: (i: number) => ({
    y: [0, -6, 0],
    transition: { repeat: Infinity, duration: 0.6, delay: i * 0.15 },
  }),
};
```

### Criacao de Execucao

Quando o usuario abre a pagina do agente e nao tem uma execucao ativa, ao enviar a primeira mensagem o sistema deve criar uma execucao automaticamente. Fluxo:

1. AgentChat verifica `currentExecutionId` no store
2. Se nao tem → ao enviar primeira mensagem, cria execucao via POST `/api/agent/executions`
3. Salva `executionId` no store
4. Inicia subscription realtime
5. Envia mensagem

### Gerenciamento de Execucao na Pagina

A Story 16.4 (Onboarding) cuidara da logica de "primeira vez vs retorno". Nesta story, o fluxo simplificado:
- Ao entrar na pagina: se `currentExecutionId` no store → carregar mensagens dessa execucao
- Se nao tem execucao → mostrar placeholder (como esta hoje)
- Ao enviar primeira mensagem sem execucao → criar execucao, salvar no store, enviar mensagem

### Padroes de UI do Projeto (CRITICOS)

- **Tailwind CSS v4** — usar `flex flex-col gap-*` (NAO `space-y-*`)
- **shadcn/ui** para componentes base (Button, Input, Skeleton, Card)
- **Texto em portugues brasileiro**
- **Framer Motion** para animacoes/transicoes
- **Classes de tipografia:** `text-h1`, `text-body-small`, `text-muted-foreground`
- **Tema B&W:** cores de foreground/background/muted do tema — sem cores hardcoded
- **Desktop-first:** layout responsivo, mas foco desktop

### Migrations — Realtime Publication

Considerar criar migration `00051_enable_realtime_agent_messages.sql` para habilitar realtime:
```sql
-- Habilitar Supabase Realtime para tabela agent_messages
-- Necessario para subscriptions de postgres_changes
ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;
```

**NOTA:** Verificar se `supabase_realtime` publication ja existe. Em projetos Supabase hospedados, ela existe por padrao. Se o projeto usa Supabase local (Docker), pode ser necessario criar a publication primeiro. Verificar e adaptar.

### Project Structure Notes

Novos arquivos criados nesta story:
```
src/app/api/agent/executions/
  route.ts                                        # POST - criar execucao
  [executionId]/
    messages/
      route.ts                                    # GET - listar mensagens, POST - enviar mensagem

src/components/agent/
  AgentMessageBubble.tsx                          # Bolha de mensagem individual
  AgentTypingIndicator.tsx                        # Indicador "agente digitando"

src/hooks/
  use-agent-messages.ts                           # Hook com TanStack Query + Realtime subscription

supabase/migrations/
  00051_enable_realtime_agent_messages.sql         # Habilitar realtime para agent_messages
```

Arquivos modificados:
```
src/components/agent/AgentChat.tsx                 # Orquestracao de execucao + mensagens
src/components/agent/AgentInput.tsx                # Integrar com useSendMessage
src/components/agent/AgentMessageList.tsx          # Renderizar mensagens reais + auto-scroll + typing
src/components/agent/index.ts                      # Adicionar novos exports
src/stores/use-agent-store.ts                      # Adicionar isAgentProcessing
```

### Learnings da Story 16.1

- RLS policies devem usar `public.get_current_tenant_id()` (NAO `auth.jwt() ->> 'tenant_id'`)
- Policies devem ser granulares: SELECT/INSERT/UPDATE/DELETE separados com WITH CHECK explicito
- Usar shadcn `<Input>` com overrides visuais (NAO `<input>` nativo)
- Suite de testes atual: 306 arquivos, 5409 testes passando
- Componentes agent usam `data-testid` para testes

### References

- [Source: epics-agente-tdec.md#Story 16.2](/_bmad-output/planning-artifacts/epics-agente-tdec.md) linhas 240-270
- [Source: architecture.md#Comunicacao Realtime](/_bmad-output/planning-artifacts/architecture.md) linhas 1437-1461
- [Source: architecture.md#Padrao de Realtime Subscriptions](/_bmad-output/planning-artifacts/architecture.md) linhas 1482-1494
- [Source: architecture.md#Padrao de Mensagens do Chat](/_bmad-output/planning-artifacts/architecture.md) linhas 1496-1519
- [Source: architecture.md#Estrutura do Projeto](/_bmad-output/planning-artifacts/architecture.md) linhas 1576-1661
- [Source: architecture.md#Boundaries e Data Flow](/_bmad-output/planning-artifacts/architecture.md) linhas 1635-1661
- [Source: Story 16.1](/_bmad-output/implementation-artifacts/16-1-data-models-tipos-e-pagina-do-agente.md) — learnings e padroes
- [Source: use-campaigns.ts](src/hooks/use-campaigns.ts) — padrao TanStack Query hooks
- [Source: supabase/client.ts](src/lib/supabase/client.ts) — singleton browser client
- [Source: supabase/server.ts](src/lib/supabase/server.ts) — server client para API Routes

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

Nenhum debug necessario — implementacao direta sem bloqueios.

### Completion Notes List

- **Tasks 1-3:** API Routes criadas (`POST /api/agent/executions`, `POST/GET /api/agent/executions/[id]/messages`). Seguem padrao de campaigns: autenticacao via `getCurrentUserProfile`, validacao de existencia de execucao, error codes padronizados.
- **Task 4:** Hook `useAgentMessages` implementado com TanStack Query + Supabase Realtime subscription. Primeira implementacao de Realtime no projeto. Subscription filtra por `execution_id` e atualiza cache do TanStack Query via `setQueryData`. Inclui de-dup para evitar duplicatas com optimistic updates.
- **Task 5:** Hook `useSendMessage` com optimistic update — mensagem aparece instantaneamente na lista antes da confirmacao do servidor. On error: rollback para estado anterior. Ativa `isAgentProcessing` no store ao enviar.
- **Task 6:** `AgentMessageBubble` renderiza 6 tipos de mensagem (text, progress, error, cost_estimate, summary, approval_gate) com estilos visuais distintos. Timestamp relativo via date-fns/ptBR.
- **Task 7:** `AgentTypingIndicator` com 3 dots animados via Framer Motion + texto "Agente digitando...".
- **Task 8:** `AgentMessageList` atualizado: recebe messages como prop, renderiza bubbles, auto-scroll com useRef + scrollIntoView, typing indicator, placeholder quando vazio.
- **Task 9:** `AgentInput` atualizado: recebe `onSendMessage` e `isSending` como props, desabilita durante `isAgentProcessing`.
- **Task 10:** `AgentChat` orquestra: criacao automatica de execucao na primeira mensagem, integra hooks `useAgentMessages`/`useSendMessage`, passa state para filhos.
- **Task 11:** Store atualizado com `isAgentProcessing` e `setAgentProcessing`.
- **Task 12:** Barrel export atualizado com novos componentes.
- **Task 13:** 82 testes novos/atualizados cobrindo API routes, hooks, componentes e store. Suite completa: 311 files, 5467 testes passando, 0 falhas.
- **Migration:** `00051_enable_realtime_agent_messages.sql` para habilitar Supabase Realtime na tabela agent_messages.

### Change Log

- 2026-03-26: Implementacao completa da Story 16.2 — sistema de mensagens do chat com envio, realtime, renderizacao por tipo, historico e indicador de digitacao.
- 2026-03-26: Code Review — 5 issues encontrados (1 CRITICAL, 2 HIGH, 1 MEDIUM, 1 LOW), todos corrigidos automaticamente (YOLO mode).

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) | **Date:** 2026-03-26 | **Model:** Claude Opus 4.6

**Issues Found:** 1 Critical, 2 High, 1 Medium, 1 Low — **ALL FIXED (YOLO mode)**

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| 1 | CRITICAL | Race condition: `useSendMessage(currentExecutionId)` capturava `null` — apos criar execucao, `mutate(content)` usava executionId stale | Reestruturado hook: `useSendMessage()` sem param, `executionId` passado via `mutate({ executionId, content })` |
| 2 | HIGH | `queryKey` criava nova ref a cada render, causando useEffect re-criar canal Realtime a cada render | `useMemo` no queryKey + reconstruir key dentro do effect usando `executionId` direto |
| 3 | HIGH | `filter(!m.id.startsWith("temp-"))` removia TODOS temp messages ao receber qualquer msg realtime | Adicionado `onSuccess` que substitui temp especifico por `tempId` rastreado no context; realtime handler agora so faz de-dup por ID |
| 4 | MEDIUM | Catch vazio na criacao de execucao — sem feedback ao usuario | Adicionado `toast.error("Erro ao iniciar conversa...")` via sonner |
| 5 | LOW | `approval_gate` renderizava label "Aprovacao" sem icone | Adicionado `ShieldCheck` icon de lucide-react |

**Tests:** 82 testes, 0 falhas apos correcoes.

### File List

**Novos:**
- src/app/api/agent/executions/route.ts
- src/app/api/agent/executions/[executionId]/messages/route.ts
- src/hooks/use-agent-messages.ts
- src/components/agent/AgentMessageBubble.tsx
- src/components/agent/AgentTypingIndicator.tsx
- supabase/migrations/00051_enable_realtime_agent_messages.sql
- __tests__/unit/api/agent-messages.test.ts
- __tests__/unit/api/agent-executions.test.ts
- __tests__/unit/hooks/use-agent-messages.test.tsx
- __tests__/unit/components/agent/AgentMessageBubble.test.tsx
- __tests__/unit/components/agent/AgentTypingIndicator.test.tsx

**Modificados:**
- src/components/agent/AgentChat.tsx
- src/components/agent/AgentInput.tsx
- src/components/agent/AgentMessageList.tsx
- src/components/agent/index.ts
- src/stores/use-agent-store.ts
- __tests__/unit/components/agent/AgentChat.test.tsx
- __tests__/unit/components/agent/AgentInput.test.tsx
- __tests__/unit/components/agent/AgentMessageList.test.tsx
- __tests__/unit/stores/use-agent-store.test.ts
