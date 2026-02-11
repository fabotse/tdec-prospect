# Story 11.6: Envio em Massa de WhatsApp com Intervalos Humanizados

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário da plataforma,
I want selecionar múltiplos leads quentes e enviar WhatsApp em massa com intervalos humanizados entre envios,
so that eu possa contactar vários leads de alto interesse de forma eficiente sem parecer automação ou ser bloqueado pelo WhatsApp.

## Acceptance Criteria

1. **AC1: Modo de seleção no OpportunityPanel**
   - GIVEN leads quentes exibidos no OpportunityPanel
   - WHEN o painel tem ≥2 leads com telefone disponível (`effectivePhone`)
   - THEN exibe um botão "Enviar em Massa" (`Users` icon do Lucide) no header do painel, ao lado do título "Leads Quentes"
   - AND ao clicar no botão, ativa o modo de seleção: checkboxes aparecem ao lado de cada lead que TEM telefone
   - AND leads SEM telefone NÃO exibem checkbox (mantêm o botão "Buscar Telefone" normalmente)
   - AND exibe um header de seleção com: checkbox "Selecionar todos", contador "X de Y selecionados", botão "Cancelar" (sai do modo seleção)
   - AND quando ≥2 leads estão selecionados, exibe botão "Enviar WhatsApp (X)" que abre o BulkWhatsAppDialog
   - AND ao ativar modo de seleção, automaticamente expande a lista (remove limite de 5 leads)

2. **AC2: Dialog de envio em massa**
   - GIVEN que o usuário clicou "Enviar WhatsApp (X)" com leads selecionados
   - WHEN o BulkWhatsAppDialog abre
   - THEN exibe header "Enviar WhatsApp em Massa"
   - AND exibe lista scrollável dos leads selecionados (nome, email, telefone formatado)
   - AND exibe contador: "X leads selecionados"
   - AND exibe seção de composição de mensagem com textarea (mesma mensagem para todos)
   - AND exibe seção de configuração de intervalo entre envios
   - AND exibe botão "Iniciar Envio" (desabilitado se mensagem vazia)
   - AND exibe botão "Cancelar" para fechar o dialog
   - AND o dialog usa componentes shadcn/ui (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`)

3. **AC3: Configuração de intervalo**
   - GIVEN a seção de intervalo no BulkWhatsAppDialog
   - WHEN o usuário configura o intervalo
   - THEN exibe 3 opções como `RadioGroup` (shadcn/ui):
     - "Rápido — ~30s entre envios"
     - "Normal — ~60s entre envios" (selecionado por padrão)
     - "Seguro — ~90s entre envios"
   - AND o símbolo "~" indica que o intervalo real varia ±20% para humanização (ex: 60s → entre 48s e 72s)
   - AND exibe nota explicativa: "Intervalos variados simulam comportamento humano"

4. **AC4: Geração de mensagem por IA**
   - GIVEN a textarea de composição no BulkWhatsAppDialog
   - WHEN o usuário clica "Gerar com IA"
   - THEN usa `useAIGenerate` com `promptKey: "whatsapp_message_generation"` e `useKnowledgeBaseContext`
   - AND passa `productId` da campanha para contexto de produto
   - AND NÃO passa dados de lead específico (mensagem genérica para todos)
   - AND streaming é exibido na textarea durante geração
   - AND texto anterior é preservado em caso de erro na geração (padrão story 11.3 AC#5)
   - AND botão "Gerar com IA" fica desabilitado durante streaming

5. **AC5: Fila de envio progressiva**
   - GIVEN que o usuário clicou "Iniciar Envio"
   - WHEN a fila começa
   - THEN cada lead é processado sequencialmente (um por vez)
   - AND para cada lead, chama `sendWhatsAppMessage` server action existente (reutiliza 100% — auth, credentials, insert pending, Z-API call, update sent/failed)
   - AND entre cada envio, aplica intervalo com jitter humanizado: `baseInterval ± 20%` (ex: 60s base → valor aleatório entre 48s e 72s)
   - AND NÃO envia o último intervalo (após o último lead, não espera)
   - AND se um envio falha, continua para o próximo (não para a fila)
   - AND a fila processa apenas no client-side — se browser fechar, fila para (aceitável para MVP)

6. **AC6: Feedback visual de progresso**
   - GIVEN que a fila está em execução
   - WHEN a UI de progresso é exibida
   - THEN o dialog transforma para "modo progresso":
     - Progress bar visual (X de Y)
     - Contadores: "Enviados: X | Falharam: Y | Restantes: Z"
     - Lista de leads com status individual:
       - Pendente: ícone `Clock` cinza
       - Enviando: `Loader2` spinner azul
       - Enviado: `Check` verde + "Enviado"
       - Falhou: `X` vermelho + mensagem de erro truncada
     - Texto "Aguardando ~Xs para próximo envio..." durante intervalo
   - AND textarea e configuração de intervalo ficam desabilitados durante envio
   - AND botão "Iniciar Envio" é substituído por "Cancelar Envio"
   - AND ao completar todos: exibe resumo final "Concluído: X enviados, Y falharam" com botão "Fechar"

7. **AC7: Cancelamento**
   - GIVEN que a fila está em execução
   - WHEN o usuário clica "Cancelar Envio"
   - THEN a fila para imediatamente (cancela o intervalo em andamento)
   - AND leads já enviados mantêm status "sent" (irreversível)
   - AND leads não processados ficam como "cancelled" na UI (sem registro no DB)
   - AND exibe resumo parcial: "Cancelado: X enviados, Y falharam, Z cancelados"
   - AND botão muda para "Fechar"

8. **AC8: Marcação de leads contactados**
   - GIVEN que um lead foi enviado com sucesso durante a fila
   - WHEN o envio individual completa
   - THEN `recentlySentEmails` é atualizado imediatamente no OpportunityPanel (via callback `onLeadSent`)
   - AND o indicador visual "✓ Enviado" aparece ao lado do lead em tempo real (mesmo com dialog aberto)
   - AND ao fechar o dialog, `sentLeadEmails` query é invalidada para persistir no refresh
   - AND checkboxes dos leads enviados são automaticamente desmarcados

9. **AC9: Proteções e edge cases**
   - GIVEN diferentes cenários de uso
   - THEN:
     - Leads já marcados como "Enviado" (`allSentEmails.has`) NÃO aparecem com checkbox (já contactados)
     - Se Z-API não configurado, primeiro envio falha e fila continua tentando os demais (cada um falhará com mesma mensagem — aceitável)
     - Se campaignId não disponível, botão "Enviar em Massa" não aparece
     - Ao fechar dialog durante envio via overlay click ou ESC, mostra confirm: "Envio em andamento. Deseja cancelar?" (usa `e.preventDefault()` no `onOpenChange`)
     - Botão "Enviar em Massa" só aparece se ≥2 leads com phone E não já enviados

10. **AC10: Cobertura de testes unitários**
    - GIVEN todos os novos componentes e hooks
    - WHEN os testes são executados via `npx vitest run`
    - THEN todos passam com cobertura adequada:
      - `useWhatsAppBulkSend`: start, cancel mid-send, individual failures continue, interval applied, jitter randomized, progress updates, onLeadSent callback, empty leads array
      - `BulkWhatsAppDialog`: render leads list, message composition, AI generation, interval selection, start send → progress view, cancel, close on complete, disabled states, close confirm during send
      - `OpportunityPanel`: modo de seleção toggle, checkbox para leads com phone, sem checkbox para leads sem phone, select all/deselect all, selection counter, bulk send button appears ≥2 selected, bulk send button hidden <2 selected, selection cleared on dialog close

## Tasks / Subtasks

- [x] Task 1: Criar hook `useWhatsAppBulkSend` (AC: #5, #7)
  - [x] 1.1 Criar `src/hooks/use-whatsapp-bulk-send.ts`
  - [x] 1.2 Definir interfaces: `BulkSendLead` (`{ leadEmail, phone, firstName?, lastName? }`), `BulkSendParams` (`{ campaignId, leads, message, intervalMs }`), `BulkLeadStatus` (`'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'`), `BulkSendProgress` (`{ total, sent, failed, cancelled, current }`)
  - [x] 1.3 Implementar state: `isRunning`, `isCancelled`, `isComplete`, `progress`, `leadStatuses` (Map<string, BulkLeadStatus>), `leadErrors` (Map<string, string>)
  - [x] 1.4 Implementar `start(params)`: loop `for...of` com `await sendWhatsAppMessage()` por lead + `await cancellableDelay(intervalWithJitter)` entre envios
  - [x] 1.5 Implementar jitter humanizado: `actualInterval = baseInterval + (Math.random() * 2 - 1) * baseInterval * 0.2`
  - [x] 1.6 Implementar `cancel()`: set `cancelRef.current = true` + `clearTimeout` do delay em andamento
  - [x] 1.7 Implementar callback `onLeadSent?: (leadEmail: string) => void` chamado após cada sucesso
  - [x] 1.8 Implementar `reset()` para limpar estado e permitir novo envio
  - [x] 1.9 Usar `useRef<boolean>` para `cancelRef` e `useRef<NodeJS.Timeout | null>` para `timeoutRef` (delay cancellable)
  - [x] 1.10 Escrever testes em `__tests__/unit/hooks/use-whatsapp-bulk-send.test.ts`

- [x] Task 2: Criar componente `BulkWhatsAppDialog` (AC: #2, #3, #4, #6, #7, #9)
  - [x] 2.1 Criar `src/components/tracking/BulkWhatsAppDialog.tsx`
  - [x] 2.2 Definir props: `open`, `onOpenChange`, `leads: BulkSendLead[]`, `campaignId`, `campaignName?`, `productId?`, `onLeadSent?: (email: string) => void`, `onComplete?: () => void`
  - [x] 2.3 Implementar header com título "Enviar WhatsApp em Massa" e DialogDescription com contagem
  - [x] 2.4 Implementar lista scrollável de leads selecionados (max-h com overflow-y-auto) com nome, email, telefone formatado, status icon
  - [x] 2.5 Implementar textarea de composição com contador de caracteres (reutilizar padrões do WhatsAppComposerDialog)
  - [x] 2.6 Implementar botão "Gerar com IA" usando `useAIGenerate({ promptKey: "whatsapp_message_generation" })` + `useKnowledgeBaseContext()` + `productId`, sem dados de lead específico
  - [x] 2.7 Implementar `RadioGroup` (shadcn/ui) para seleção de intervalo: Rápido (30000ms), Normal (60000ms, default), Seguro (90000ms)
  - [x] 2.8 Implementar integração com `useWhatsAppBulkSend` hook: `start()`, `cancel()`, progress state
  - [x] 2.9 Implementar "modo progresso": progress bar (div com width% e transition), contadores, status por lead, texto de espera durante intervalo
  - [x] 2.10 Implementar resumo final (completo ou cancelado) com botão "Fechar"
  - [x] 2.11 Implementar proteção contra fechar durante envio: `onOpenChange` com `e.preventDefault()` e confirm dialog via estado interno
  - [x] 2.12 Exportar de `src/components/tracking/index.ts`
  - [x] 2.13 Escrever testes em `__tests__/unit/components/tracking/BulkWhatsAppDialog.test.tsx`

- [x] Task 3: Atualizar OpportunityPanel com modo de seleção (AC: #1, #8, #9)
  - [x] 3.1 Adicionar state `selectionMode: boolean` (default: false)
  - [x] 3.2 Adicionar state `selectedEmails: Set<string>` para tracking de seleção
  - [x] 3.3 Computar `selectableLeads` via `useMemo`: leads com `effectivePhone` E NÃO em `allSentEmails` (leads selecionáveis)
  - [x] 3.4 Renderizar botão "Enviar em Massa" (`Users` icon) no header quando `selectableLeads.length >= 2 && campaignId`
  - [x] 3.5 Quando `selectionMode = true`: exibir header de seleção (checkbox "Selecionar todos", "X de Y selecionados", botão "Cancelar")
  - [x] 3.6 Quando `selectionMode = true`: expandir lista automaticamente (`showAll = true`)
  - [x] 3.7 Renderizar `Checkbox` (shadcn/ui) ao lado de cada lead selecionável no modo de seleção
  - [x] 3.8 Implementar toggle de checkbox individual: `toggleSelection(leadEmail)`
  - [x] 3.9 Implementar "Selecionar todos" / "Desmarcar todos": set/clear `selectedEmails`
  - [x] 3.10 Exibir botão "Enviar WhatsApp (X)" quando `selectedEmails.size >= 2` no header de seleção
  - [x] 3.11 Ao clicar "Enviar WhatsApp (X)": abrir BulkWhatsAppDialog com leads selecionados mapeados para `BulkSendLead[]`
  - [x] 3.12 Implementar `handleBulkLeadSent(email)`: atualizar `recentlySentEmails`, remover de `selectedEmails`
  - [x] 3.13 Implementar `handleBulkComplete()`: sair do modo de seleção, limpar seleção, invalidar `sentLeadEmails` query
  - [x] 3.14 Atualizar/adicionar testes em `__tests__/unit/components/tracking/OpportunityPanel.test.tsx`

- [x] Task 4: Testes de integração e validação final (AC: #10)
  - [x] 4.1 Garantir que todos os testes novos e existentes passam (`npx vitest run`)
  - [x] 4.2 Verificar que exports de `src/components/tracking/index.ts` estão corretos
  - [x] 4.3 Validar que ESLint passa sem erros (no-console rule)
  - [x] 4.4 Verificar que nenhum teste existente regrediu (especialmente OpportunityPanel, WhatsAppComposerDialog)

## Dev Notes

### Arquitetura: Orquestração Client-Side (NÃO server-side)

O projeto NÃO tem job queue (Bull, BullMQ, etc.). A decisão arquitetural é:
- **Client-side orchestration**: o hook `useWhatsAppBulkSend` controla a fila no browser
- **Reutiliza 100% da server action**: `sendWhatsAppMessage` (auth, credentials, insert, Z-API, update) é chamada N vezes, uma por lead
- **Overhead aceitável**: re-auth + re-decrypt credentials por mensagem é negligível comparado ao intervalo de 30-90s entre envios
- **Trade-off**: se o browser fechar, fila para (aceitável para MVP de 5-20 leads)
- **Benefício**: progresso em tempo real, cancelamento instantâneo, zero complexidade server-side

### Hook `useWhatsAppBulkSend` — Estrutura Detalhada

```typescript
// src/hooks/use-whatsapp-bulk-send.ts

import { useState, useCallback, useRef } from "react";
import { sendWhatsAppMessage } from "@/actions/whatsapp";

// Types
export interface BulkSendLead {
  leadEmail: string;
  phone: string;
  firstName?: string;
  lastName?: string;
}

export type BulkLeadStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

export interface BulkSendProgress {
  total: number;
  sent: number;
  failed: number;
  cancelled: number;
  current: number; // index do lead sendo processado
}

interface BulkSendParams {
  campaignId: string;
  leads: BulkSendLead[];
  message: string;
  intervalMs: number;
  onLeadSent?: (leadEmail: string) => void;
}

interface UseWhatsAppBulkSendReturn {
  start: (params: BulkSendParams) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  isRunning: boolean;
  isComplete: boolean;
  isCancelled: boolean;
  progress: BulkSendProgress;
  leadStatuses: Map<string, BulkLeadStatus>;
  leadErrors: Map<string, string>;
}
```

### Delay Cancellable — Pattern

```typescript
const cancelRef = useRef(false);
const timeoutRef = useRef<NodeJS.Timeout | null>(null);

function cancellableDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      resolve();
    }, ms);
  });
}

function cancel() {
  cancelRef.current = true;
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}
```

**IMPORTANTE**: O `cancel()` limpa o timeout para que o delay resolva imediatamente. O `cancelRef.current = true` faz o loop `for` sair na próxima iteração. O efeito é cancelamento quase instantâneo.

### Jitter Humanizado — Cálculo

```typescript
function getHumanizedInterval(baseMs: number): number {
  const jitterFactor = 0.2; // ±20%
  const jitter = baseMs * jitterFactor;
  return baseMs + (Math.random() * 2 - 1) * jitter;
  // Ex: 60000ms → entre 48000ms e 72000ms
}
```

### BulkWhatsAppDialog — Layout

```
┌─────────────────────────────────────────────┐
│ Enviar WhatsApp em Massa                    │
│ 5 leads selecionados                        │
├─────────────────────────────────────────────┤
│ ┌─── Leads ──────────────────────────────┐  │
│ │ ● João Silva — joao@acme.com — +55...  │  │
│ │ ● Maria Costa — maria@xyz.com — +55... │  │
│ │ ● Pedro Santos — pedro@... — +55...    │  │
│ │ (scrollable se > 4 leads)              │  │
│ └────────────────────────────────────────┘  │
│                                             │
│ Mensagem (mesma para todos):                │
│ ┌────────────────────────────────────────┐  │
│ │ [textarea]                             │  │
│ │                                        │  │
│ └────────────────────────────────────────┘  │
│ 142 caracteres                  ideal: ≤500 │
│                                             │
│ [Gerar com IA]                              │
│                                             │
│ Intervalo entre envios:                     │
│ ○ Rápido (~30s)  ● Normal (~60s)  ○ Seguro │
│ Intervalos variados simulam comportamento   │
│ humano                                      │
│                                             │
│            [Cancelar]  [Iniciar Envio (5)]  │
└─────────────────────────────────────────────┘
```

**Modo Progresso (após "Iniciar Envio"):**

```
┌─────────────────────────────────────────────┐
│ Enviando WhatsApp em Massa                  │
│ Enviados: 2 | Falharam: 0 | Restantes: 3   │
├─────────────────────────────────────────────┤
│ ████████░░░░░░░░░░░░  2 de 5               │
│                                             │
│ ✓ João Silva — joao@acme.com — Enviado      │
│ ✓ Maria Costa — maria@xyz.com — Enviado     │
│ ⟳ Pedro Santos — pedro@... — Enviando...    │
│ ○ Ana Lima — ana@... — Pendente             │
│ ○ Carlos Souza — carlos@... — Pendente      │
│                                             │
│ Aguardando ~54s para próximo envio...       │
│                                             │
│                       [Cancelar Envio]      │
└─────────────────────────────────────────────┘
```

### OpportunityPanel — Modo de Seleção

Fluxo de estado:

```
[Leads Quentes ♨️]  [👥 Enviar em Massa]    ← botão no header (≥2 leads com phone)
     │
     ▼ click
[☑ Selecionar todos] [3 de 5 selecionados] [Cancelar]
☑ João Silva — joao@acme.com — +55... — [WhatsApp]
☑ Maria Costa — maria@xyz.com — +55... — [WhatsApp]
☐ Pedro Santos — pedro@tech.com — +55... — [WhatsApp]
  Ana Lima — ana@corp.com — [🔍 Buscar Telefone]    ← sem checkbox (sem phone)
☑ Carlos Souza — carlos@... — +55... — [WhatsApp]

     [Enviar WhatsApp (3)]    ← quando ≥2 selecionados
```

**IMPORTANTE**: Ao entrar no modo de seleção:
- `setShowAll(true)` — expande a lista completa
- Leads sem `effectivePhone` NÃO recebem checkbox
- Leads já em `allSentEmails` NÃO recebem checkbox
- Individual WhatsApp buttons permanecem funcionais (seleção não bloqueia envio individual)

### Composição de Mensagem — Sem Personalização por Lead

A mensagem do envio em massa é a MESMA para todos os leads. NÃO há substituição de variáveis como `{{nome}}`. Isso é proposital:
- Sprint proposal define: "mesma para todos"
- Simplifica a implementação significativamente
- IA gera mensagem genérica baseada no produto da campanha
- Personalização por lead seria scope creep (futura story se necessário)

**Para geração IA no BulkWhatsAppDialog:**
```typescript
const result = await generate({
  promptKey: "whatsapp_message_generation",
  variables: {
    ...kbVariables,
    lead_name: "",      // vazio — mensagem genérica
    lead_title: "",
    lead_company: "",
    lead_industry: "",
  },
  stream: true,
  productId,
});
```

O template de prompt já tem `{{#if lead_name}}` condicional — com valores vazios, gera mensagem sem referência a lead específico.

### Reutilização do `sendWhatsAppMessage` Server Action

O hook `useWhatsAppBulkSend` chama `sendWhatsAppMessage` (de `src/actions/whatsapp.ts`) diretamente, **NÃO** através do hook `useWhatsAppSend`. Razão:
- `useWhatsAppSend` gerencia estado de envio ÚNICO (isSending, lastResult) e mostra toasts
- Bulk send precisa de estado por-lead e NÃO deve mostrar toast individual por envio
- Chamada direta à server action é mais limpa para bulk

```typescript
import { sendWhatsAppMessage } from "@/actions/whatsapp";

// No loop:
const result = await sendWhatsAppMessage({
  campaignId: params.campaignId,
  leadEmail: lead.leadEmail,
  phone: lead.phone,
  message: params.message,
});

if (result.success) {
  // Update status to 'sent' + call onLeadSent
} else {
  // Update status to 'failed' + store error message
}
```

### Proteção contra Fechar Dialog Durante Envio

```typescript
// BulkWhatsAppDialog
const [showCloseConfirm, setShowCloseConfirm] = useState(false);

const handleOpenChange = (nextOpen: boolean) => {
  if (!nextOpen && isRunning) {
    // Prevenir fechamento automático durante envio
    setShowCloseConfirm(true);
    return;
  }
  if (!nextOpen) {
    bulkSend.reset();
    onComplete?.();
  }
  onOpenChange(nextOpen);
};

// Se user confirma fechar durante envio:
const handleConfirmClose = () => {
  bulkSend.cancel();
  setShowCloseConfirm(false);
  onComplete?.();
  onOpenChange(false);
};
```

**NOTA**: `showCloseConfirm` exibe inline no dialog (NÃO usa `window.confirm`). Usar inline overlay com "Tem certeza? Envio em andamento será cancelado." + botões "Continuar Envio" / "Cancelar e Fechar".

### Componentes UI Necessários

| Componente | Origem | Uso |
|-----------|--------|-----|
| `Checkbox` | `@/components/ui/checkbox` | Seleção de leads no OpportunityPanel |
| `RadioGroup`, `RadioGroupItem` | `@/components/ui/radio-group` | Seleção de intervalo |
| `Label` | `@/components/ui/label` | Labels para radio items |
| `Dialog`, `DialogContent`, etc. | `@/components/ui/dialog` | BulkWhatsAppDialog |
| `Button` | `@/components/ui/button` | Todos os botões |
| `Textarea` | `@/components/ui/textarea` | Composição de mensagem |
| `Progress` | `@/components/ui/progress` | Barra de progresso |
| Lucide icons | `lucide-react` | `Users`, `Clock`, `Loader2`, `Check`, `X`, `Sparkles`, `Send`, `Square`, `CheckSquare` |

**Todos confirmados existentes**: `checkbox.tsx`, `radio-group.tsx`, `progress.tsx` já estão em `src/components/ui/`. Não precisa instalar nada.

### `formatPhone` — Reutilizar

A função `formatPhone` do `WhatsAppComposerDialog.tsx` (linhas 59-69) deve ser extraída ou importada. Opções:
1. **Importar diretamente**: `import { formatPhone } from "@/components/tracking/WhatsAppComposerDialog"` — NÃO recomendado (importar componente para utility)
2. **Duplicar**: Copiar a função no BulkWhatsAppDialog — aceitável para MVP
3. **Extrair para utils**: Mover para `src/lib/utils/format-phone.ts` — ideal mas pode ser scope creep

**DECISÃO**: Duplicar a função no BulkWhatsAppDialog. Se code review pedir extração, é uma melhoria simples.

### Testes — Padrões e Mocks

**Para `useWhatsAppBulkSend` (hook test):**
```typescript
// Mock da server action
vi.mock("@/actions/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn(),
}));

// Setup com renderHook + act
import { renderHook, act } from "@testing-library/react";
import { sendWhatsAppMessage } from "@/actions/whatsapp";

// Testar: start com N leads, verificar progress, verificar callbacks
// Testar: cancel mid-send, verificar leads restantes como 'cancelled'
// Testar: failure handling (continua para próximo lead)
// Testar: intervalos aplicados (vi.useFakeTimers)
// Testar: onLeadSent callback chamado após cada sucesso
```

**Para `BulkWhatsAppDialog` (component test):**
```typescript
// Mocks necessários:
vi.mock("@/hooks/use-whatsapp-bulk-send");
vi.mock("@/hooks/use-ai-generate");
vi.mock("@/hooks/use-knowledge-base-context");

// Testar: render com leads, compose message, select interval, start send
// Testar: progress view render (mock hook state)
// Testar: cancel during send
// Testar: close confirm during send
// Testar: disabled states (empty message, no leads)
```

**Para OpportunityPanel (selection mode):**
```typescript
// Testes adicionais ao arquivo existente
// Testar: botão "Enviar em Massa" visível com ≥2 leads com phone
// Testar: botão "Enviar em Massa" oculto com <2 leads com phone
// Testar: toggle modo de seleção
// Testar: checkbox render apenas para leads com phone
// Testar: select all / deselect all
// Testar: selection counter
// Testar: "Enviar WhatsApp (X)" button com X selecionados
// Testar: sem checkbox para leads já enviados
```

### Learnings das Stories Anteriores (Code Review)

- **11.5**: `effectivePhone` pattern: `lead.phone || localPhones.get(lead.leadEmail)` — reutilizar para determinar leads selecionáveis
- **11.5**: `localPhones` Map para phones obtidos na sessão — já funcional
- **11.4**: `recentlySentEmails` Set<string> para tracking local — reutilizar para bulk sent
- **11.4**: `allSentEmails` merge de `recentlySentEmails` + `sentLeadEmails` prop — usar para filtrar leads selecionáveis
- **11.4**: `handleSend` fecha dialog apenas em sucesso — no bulk, dialog fica aberto até completar
- **11.3**: `cancelAI()` ao fechar dialog — aplicar no BulkWhatsAppDialog também
- **11.3**: `normalizeTemplateVariables()` para limpar output AI — reutilizar
- **11.3**: `displayMessage` pattern para streaming — reutilizar no BulkWhatsAppDialog

### Anti-Patterns (NÃO FAZER)

- **NÃO** criar nova server action para bulk — reutilizar `sendWhatsAppMessage` existente
- **NÃO** usar `useWhatsAppSend` hook no bulk — chamar `sendWhatsAppMessage` diretamente (evita toast por envio)
- **NÃO** usar `console.log` — ESLint no-console rule ativo
- **NÃO** usar `space-y-*` — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
- **NÃO** usar `any` — tipagem estrita sempre
- **NÃO** implementar personalização por lead (scope creep) — mesma mensagem para todos
- **NÃO** usar `window.confirm` — usar UI inline no dialog
- **NÃO** usar Zustand store (`useSelectionStore`) para seleção — usar estado local no OpportunityPanel (escopo limitado ao painel)
- **NÃO** bloquear envios individuais durante modo de seleção — ambos devem funcionar
- **NÃO** usar `useEffect` para estado derivado — usar `useMemo` (padrão do projeto)
- **NÃO** adicionar checkbox para leads sem phone — impossível enviar WhatsApp sem phone

### Project Structure Notes

- Componente novo: `src/components/tracking/BulkWhatsAppDialog.tsx` (NOVO)
- Hook novo: `src/hooks/use-whatsapp-bulk-send.ts` (NOVO)
- Componente modificado: `src/components/tracking/OpportunityPanel.tsx` (MODIFICAR — modo de seleção + botão envio em massa)
- Export modificado: `src/components/tracking/index.ts` (MODIFICAR — adicionar BulkWhatsAppDialog)
- Testes novos: `__tests__/unit/hooks/use-whatsapp-bulk-send.test.ts` (NOVO)
- Testes novos: `__tests__/unit/components/tracking/BulkWhatsAppDialog.test.tsx` (NOVO)
- Testes modificados: `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` (MODIFICAR)
- **Sem install necessário**: `checkbox.tsx`, `radio-group.tsx`, `progress.tsx` já existem em `src/components/ui/`

### Git Intelligence

Branch: `epic/11-whatsapp-integration`
Commits recentes:
- `9187c9e` feat(story-11.5): busca de telefone no fluxo de leads quentes + code review fixes
- `5bfe9cc` feat(story-11.4): envio individual WhatsApp + server action + code review fixes
- `2024b23` feat(story-11.3): WhatsApp composer dialog + AI generation + code review fixes
- `9ef5152` feat(story-11.2): schema WhatsApp messages + tipos TS + code review fixes
- `9898abb` feat(story-11.1): Z-API integration service + config + code review fixes
Padrão de commit: `feat(story-X.Y): descrição curta`

### Dependências Específicas

- **11.4 (done)**: `sendWhatsAppMessage` server action, `useWhatsAppSend` hook, `WhatsAppComposerDialog`, `recentlySentEmails` pattern, `sentLeadEmails` prop
- **11.5 (done)**: `PhoneLookupDialog`, `localPhones` Map, `effectivePhone` pattern, `handlePhoneFound`
- **11.3 (done)**: `useAIGenerate`, `useKnowledgeBaseContext`, `normalizeTemplateVariables`, streaming display pattern
- **11.2 (done)**: Schema `whatsapp_messages` + tipos TS
- **11.1 (done)**: `ZApiService`, credenciais multi-field, `decryptApiKey`
- **10.7 (done)**: OpportunityPanel collapsible, `OpportunityLead[]`, VISIBLE_LIMIT pattern

### References

- [Source: src/components/tracking/OpportunityPanel.tsx] — Componente principal a modificar (adicionar modo de seleção + botão envio em massa)
- [Source: src/hooks/use-whatsapp-send.ts] — Hook de envio individual (referência de pattern, NÃO reutilizar no bulk)
- [Source: src/actions/whatsapp.ts] — Server action `sendWhatsAppMessage` (reutilizar 100% no bulk)
- [Source: src/components/tracking/WhatsAppComposerDialog.tsx] — Referência de UI patterns (textarea, AI, formatPhone)
- [Source: src/hooks/use-ai-generate.ts] — Hook de geração IA (reutilizar no BulkWhatsAppDialog)
- [Source: src/hooks/use-knowledge-base-context.ts] — Hook de contexto KB (reutilizar no BulkWhatsAppDialog)
- [Source: src/lib/ai/sanitize-ai-output.ts] — `normalizeTemplateVariables` (reutilizar)
- [Source: src/types/tracking.ts] — `LeadTracking`, `OpportunityLead` (tipos dos leads)
- [Source: src/types/database.ts] — `WhatsAppMessage`, `WhatsAppMessageStatus` (tipos do DB)
- [Source: src/lib/services/zapi.ts] — `ZApiService.sendText()` (chamado pela server action)
- [Source: src/components/tracking/PhoneLookupDialog.tsx] — Referência de dialog pattern
- [Source: src/components/tracking/index.ts] — Exports do módulo (adicionar BulkWhatsAppDialog)
- [Source: src/app/api/leads/enrich/bulk/route.ts] — Referência de batch processing pattern (sequential for loop)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-10.md] — Fluxo de envio em massa definido no sprint change
- [Source: _bmad-output/implementation-artifacts/11-5-busca-telefone-fluxo-leads-quentes.md] — Story anterior com learnings
- [Source: _bmad-output/implementation-artifacts/11-4-envio-individual-whatsapp.md] — Story de envio individual com patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Cancel test fix: `cancellableDelay` needed `delayResolveRef` to resolve promise on cancel (clearTimeout alone leaves promise pending)
- OpportunityPanel test fix: "nao exibe checkbox para lead ja enviado" required ≥3 phone leads to keep bulk button visible after 1 sent

### Completion Notes List

- Task 1: Hook `useWhatsAppBulkSend` — 14 tests. Client-side orchestration via for-of loop + cancellable delay. Jitter ±20%. cancelRef + delayResolveRef pattern for instant cancel.
- Task 2: Component `BulkWhatsAppDialog` — 33 tests. Compose + RadioGroup interval + progress bar + status icons + close protection + AI generation. Exported via index.ts.
- Task 3: OpportunityPanel selection mode — 17 new tests (56 total). Checkbox per selectable lead (has phone + not sent). Select all/deselect all. "Enviar WhatsApp (X)" when ≥2 selected. handleBulkLeadSent + handleBulkComplete callbacks.
- Task 4: Full regression suite 239 files, 4370 tests, 0 failures. ESLint clean.

### File List

- `src/hooks/use-whatsapp-bulk-send.ts` (NEW) — Bulk send hook with cancellable delay + jitter
- `src/components/tracking/BulkWhatsAppDialog.tsx` (NEW) — Bulk send dialog with compose, interval, progress, summary
- `src/components/tracking/OpportunityPanel.tsx` (MODIFIED) — Added selection mode, bulk send button, checkbox per lead
- `src/components/tracking/index.ts` (MODIFIED) — Added BulkWhatsAppDialog export
- `__tests__/unit/hooks/use-whatsapp-bulk-send.test.ts` (NEW) — 14 tests
- `__tests__/unit/components/tracking/BulkWhatsAppDialog.test.tsx` (NEW) — 33 tests
- `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` (MODIFIED) — 17 new tests (56 total)

### Change Log

- 2026-02-11: Story 11.6 implemented — bulk WhatsApp send with humanized intervals, selection mode, progress UI, cancel support. 103 story tests. 239 files, 4370 total tests, 0 failures.
- 2026-02-11: Code Review fixes — 4 MEDIUM + 3 LOW issues fixed: (M1) added isWaiting state to hook + "Aguardando ~Xs" text in dialog AC#6, (M2) fixed PT-BR accents (Rápido, Concluído, será), (M3) rewrote close protection tests with real Escape-key simulation, (M4) fixed double-call onComplete/onOpenChange in OpportunityPanel, (L2) added bulkSend.reset() to handleConfirmClose, (L3) exported BulkSendParams. 110 story tests (+7). 242 files, 4408 total tests, 0 failures.
