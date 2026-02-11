# Story 11.7: Tracking e Histórico de Mensagens WhatsApp

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário da plataforma,
I want visualizar o histórico de mensagens WhatsApp enviadas por campanha e ver indicadores visuais de leads contactados,
so that eu tenha visibilidade completa de quais leads foram contactados via WhatsApp, quando, e qual mensagem foi enviada, permitindo acompanhar o progresso da comunicação direta.

## Acceptance Criteria

1. **AC1: Hook `useWhatsAppMessages` para buscar histórico**
   - GIVEN uma campanha com mensagens WhatsApp enviadas
   - WHEN o hook `useWhatsAppMessages(campaignId)` é chamado
   - THEN retorna lista de `WhatsAppMessage[]` ordenada por `created_at DESC`
   - AND usa TanStack Query com query key `["whatsapp-messages", campaignId]`
   - AND suporta filtro opcional por `leadEmail` para buscar histórico de um lead específico
   - AND inclui `isLoading`, `error`, `refetch` no retorno
   - AND o endpoint retorna todos os campos: `id, lead_id, phone, message, status, sent_at, created_at`
   - AND resolve `leadEmail` a partir de `lead_id` via join ou lookup

2. **AC2: API endpoint para mensagens WhatsApp**
   - GIVEN autenticação válida e `campaignId` na rota
   - WHEN `GET /api/campaigns/[campaignId]/whatsapp-messages` é chamado
   - THEN retorna `{ data: WhatsAppMessageWithLead[] }` com campos: `id, lead_id, lead_email, lead_name, phone, message, status, sent_at, created_at`
   - AND aplica RLS por `tenant_id` (segurança multi-tenant)
   - AND ordena por `created_at DESC`
   - AND suporta query param `?leadEmail=xxx` para filtrar por lead específico
   - AND retorna `401` se não autenticado, `404` se campanha não encontrada

3. **AC3: Coluna WhatsApp na LeadTrackingTable**
   - GIVEN leads exibidos na LeadTrackingTable (aba de tracking de campanha)
   - WHEN um lead teve mensagem WhatsApp enviada nesta campanha
   - THEN exibe ícone `MessageCircle` (Lucide) verde ao lado do lead na tabela
   - AND ao hover, exibe tooltip com "WhatsApp enviado em DD/MM/YYYY HH:mm"
   - AND se múltiplas mensagens, tooltip mostra "X mensagens WhatsApp | Última: DD/MM/YYYY HH:mm"
   - AND leads SEM mensagem WhatsApp NÃO exibem o ícone (sem ícone cinza — limpo)
   - AND a coluna é renderizada como um ícone inline na coluna existente de "Nome" ou como coluna separada "WA" (compacta)

4. **AC4: Painel de histórico WhatsApp no LeadDetailPanel**
   - GIVEN o painel de detalhes de um lead aberto (`LeadDetailPanel`)
   - WHEN o lead possui mensagens WhatsApp enviadas em qualquer campanha
   - THEN exibe seção "Mensagens WhatsApp" (`MessageCircle` icon) após as interações existentes
   - AND lista cada mensagem com: status icon (✓ verde = sent, ✗ vermelho = failed, ○ cinza = pending), telefone destino formatado, preview da mensagem (truncada em ~100 chars), data/hora, nome da campanha associada
   - AND mensagens são agrupadas por campanha (accordion ou heading por campanha)
   - AND mostra "Nenhuma mensagem WhatsApp enviada" se lista vazia
   - AND usa `useWhatsAppMessages` hook (sem campaignId = busca por lead across all campaigns)

5. **AC5: Integração de WhatsApp no histórico de interações do lead**
   - GIVEN que uma mensagem WhatsApp foi enviada para um lead (via individual ou bulk)
   - WHEN o lead detail panel é aberto e a seção "Histórico de Interações" é exibida
   - THEN mensagens WhatsApp aparecem como interações do tipo `"whatsapp_sent"`
   - AND exibem ícone `MessageCircle` (diferente dos outros tipos)
   - AND mostram preview da mensagem como conteúdo da interação
   - AND o tipo `"whatsapp_sent"` é adicionado ao `interactionTypeValues` em `src/types/interaction.ts`
   - AND o `LeadDetailPanel` renderiza o novo tipo com estilo visual diferenciado (ícone verde WhatsApp)

6. **AC6: Contagem de mensagens WhatsApp no OpportunityPanel**
   - GIVEN leads quentes exibidos no OpportunityPanel com indicador "✓ Enviado"
   - WHEN um lead teve mais de uma mensagem WhatsApp (individual + bulk, ou múltiplos bulk)
   - THEN o indicador mostra "✓ Enviado (X)" onde X é o total de mensagens
   - AND ao hover, tooltip mostra "X mensagens enviadas via WhatsApp | Última: DD/MM/YYYY HH:mm"
   - AND se apenas 1 mensagem, mantém "✓ Enviado" sem contagem (comportamento atual)

7. **AC7: Indicador visual de status de mensagem enriquecido**
   - GIVEN que a tabela `whatsapp_messages` armazena status `pending | sent | delivered | read | failed`
   - WHEN mensagens são exibidas (no histórico ou tooltips)
   - THEN cada status tem representação visual distinta:
     - `pending`: `Clock` cinza + "Pendente"
     - `sent`: `Check` verde + "Enviado"
     - `delivered`: `CheckCheck` azul + "Entregue" (double check)
     - `read`: `CheckCheck` azul escuro/filled + "Lido"
     - `failed`: `X` vermelho + "Falhou"
   - AND estes ícones seguem a convenção visual do WhatsApp (familiar para o usuário)

8. **AC8: Query de contagem de mensagens WhatsApp por lead (para tabela)**
   - GIVEN a necessidade de exibir contagem/status na LeadTrackingTable sem N+1 queries
   - WHEN os dados de tracking são carregados
   - THEN o endpoint existente `GET /api/campaigns/[campaignId]/leads/tracking` é estendido
   - AND retorna campo adicional `whatsappMessageCount: number` por lead
   - AND retorna `lastWhatsAppSentAt: string | null` por lead
   - AND retorna `lastWhatsAppStatus: WhatsAppMessageStatus | null` por lead
   - AND estes dados vêm de um aggregate query (COUNT + MAX) na tabela `whatsapp_messages` por `lead_id` e `campaign_id`

9. **AC9: Invalidação de cache após envio**
   - GIVEN que o usuário enviou uma mensagem WhatsApp (individual ou bulk)
   - WHEN o envio é concluído com sucesso
   - THEN a query `["whatsapp-messages", campaignId]` é invalidada automaticamente
   - AND a query `["lead-tracking", campaignId]` é invalidada (para atualizar contagens na tabela)
   - AND os indicadores visuais atualizam sem necessidade de refresh manual
   - AND a invalidação é feita via `queryClient.invalidateQueries()` no callback `onSuccess`/`onLeadSent`

10. **AC10: Cobertura de testes unitários**
    - GIVEN todos os novos componentes, hooks e endpoints
    - WHEN os testes são executados via `npx vitest run`
    - THEN todos passam com cobertura adequada:
      - `useWhatsAppMessages`: loading, data return, filter by leadEmail, error handling, empty state
      - API endpoint: auth, RLS, ordering, filtering, 401/404 errors
      - `LeadTrackingTable`: WhatsApp icon render, tooltip content, no icon for unsent leads
      - `LeadDetailPanel`: WhatsApp section render, grouping by campaign, empty state, status icons
      - `OpportunityPanel`: message count in sent indicator, tooltip with date
      - Cache invalidation: queries invalidated after send

## Tasks / Subtasks

- [x] Task 1: Criar API endpoint para mensagens WhatsApp (AC: #2, #8)
  - [x] 1.1 Criar `src/app/api/campaigns/[campaignId]/whatsapp-messages/route.ts` com GET handler
  - [x] 1.2 Implementar autenticação + RLS por `tenant_id`
  - [x] 1.3 Query `whatsapp_messages` com join em `leads` para resolver `lead_email` e `lead_name`
  - [x] 1.4 Suportar query param `?leadEmail=xxx` para filtrar por lead
  - [x] 1.5 Ordenar por `created_at DESC`
  - [x] 1.6 Definir tipo `WhatsAppMessageWithLead` em `src/types/database.ts`
  - [x] 1.7 Escrever testes em `__tests__/unit/api/campaigns/whatsapp-messages.test.ts`

- [x] Task 2: Estender endpoint de tracking com contagens WhatsApp (AC: #8)
  - [x] 2.1 Modificar `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts`
  - [x] 2.2 Adicionar aggregate query: `COUNT(*)`, `MAX(sent_at)`, últim status por `lead_id` + `campaign_id`
  - [x] 2.3 Incluir `whatsappMessageCount`, `lastWhatsAppSentAt`, `lastWhatsAppStatus` na resposta por lead
  - [x] 2.4 Atualizar tipos em `src/types/tracking.ts` para incluir novos campos
  - [x] 2.5 Atualizar testes existentes do endpoint de tracking

- [x] Task 3: Criar hook `useWhatsAppMessages` (AC: #1)
  - [x] 3.1 Criar `src/hooks/use-whatsapp-messages.ts`
  - [x] 3.2 Implementar com TanStack Query: `useQuery({ queryKey: ["whatsapp-messages", campaignId], ... })`
  - [x] 3.3 Suportar parâmetro opcional `leadEmail` para filtro
  - [x] 3.4 Suportar modo "all campaigns" quando `campaignId` é omitido (para LeadDetailPanel)
  - [x] 3.5 Retornar `{ messages, isLoading, error, refetch }`
  - [x] 3.6 Escrever testes em `__tests__/unit/hooks/use-whatsapp-messages.test.ts`

- [x] Task 4: Adicionar coluna WhatsApp na LeadTrackingTable (AC: #3, #7)
  - [x] 4.1 Modificar `src/components/tracking/LeadTrackingTable.tsx`
  - [x] 4.2 Adicionar ícone `MessageCircle` (verde) para leads com mensagens WhatsApp
  - [x] 4.3 Implementar `Tooltip` (shadcn/ui) com contagem e data da última mensagem
  - [x] 4.4 Criar helper `getWhatsAppStatusIcon(status)` para mapear status → ícone + cor
  - [x] 4.5 Usar dados de `whatsappMessageCount`, `lastWhatsAppSentAt`, `lastWhatsAppStatus` do endpoint de tracking
  - [x] 4.6 Atualizar/adicionar testes em `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx`

- [x] Task 5: Adicionar seção WhatsApp no LeadDetailPanel (AC: #4, #5, #7)
  - [x] 5.1 Adicionar `"whatsapp_sent"` ao `interactionTypeValues` em `src/types/interaction.ts`
  - [x] 5.2 Modificar `src/components/leads/LeadDetailPanel.tsx`
  - [x] 5.3 Adicionar seção "Mensagens WhatsApp" com `useWhatsAppMessages(undefined, leadEmail)` (all campaigns)
  - [x] 5.4 Agrupar mensagens por campanha (heading com nome da campanha)
  - [x] 5.5 Renderizar cada mensagem com: status icon (via `getWhatsAppStatusIcon`), telefone formatado, preview truncada (~100 chars), data/hora
  - [x] 5.6 Renderizar interações WhatsApp no histórico existente com ícone `MessageCircle` e estilo diferenciado
  - [x] 5.7 Exibir "Nenhuma mensagem WhatsApp enviada" se lista vazia
  - [x] 5.8 Atualizar/adicionar testes em `__tests__/unit/components/leads/LeadDetailPanel.test.tsx`

- [x] Task 6: Atualizar OpportunityPanel com contagem de mensagens (AC: #6)
  - [x] 6.1 Modificar `src/components/tracking/OpportunityPanel.tsx`
  - [x] 6.2 Usar dados de tracking (whatsappMessageCount) para exibir "✓ Enviado (X)" quando X > 1
  - [x] 6.3 Adicionar tooltip com "X mensagens enviadas via WhatsApp | Última: DD/MM/YYYY HH:mm"
  - [x] 6.4 Manter "✓ Enviado" sem contagem quando X = 1
  - [x] 6.5 Atualizar testes em `__tests__/unit/components/tracking/OpportunityPanel.test.tsx`

- [x] Task 7: Implementar invalidação de cache (AC: #9)
  - [x] 7.1 No `useWhatsAppSend` hook: adicionar invalidação de `["whatsapp-messages", campaignId]` no success
  - [x] 7.2 No `useWhatsAppBulkSend` hook: adicionar invalidação de `["whatsapp-messages", campaignId]` e `["lead-tracking", campaignId]` ao completar
  - [x] 7.3 Nas callbacks `onLeadSent` do OpportunityPanel: garantir que `["lead-tracking", campaignId]` é invalidado
  - [x] 7.4 Testar que queries são invalidadas após envio individual e bulk

- [x] Task 8: Testes de integração e validação final (AC: #10)
  - [x] 8.1 Garantir que todos os testes novos e existentes passam (`npx vitest run`)
  - [x] 8.2 Verificar que ESLint passa sem erros (no-console rule)
  - [x] 8.3 Verificar que nenhum teste existente regrediu
  - [x] 8.4 Validar contagem total de testes

## Dev Notes

### Arquitetura: Duas Camadas de Dados WhatsApp

O tracking de WhatsApp opera em **duas camadas**:

1. **Camada booleana (existente, story 11.4):** `useSentLeadEmails()` retorna `Set<string>` de emails de leads com ao menos 1 mensagem `sent`. Usado no `OpportunityPanel` para o indicador "✓ Enviado". **Eficiente** para checagem rápida.

2. **Camada de histórico (NOVA, story 11.7):** `useWhatsAppMessages()` retorna `WhatsAppMessageWithLead[]` com todos os campos. Usado no `LeadDetailPanel` e tooltips. **Mais pesada** mas necessária para detalhes.

**REGRA**: Não substituir a camada booleana pela camada de histórico. Ambas coexistem. A booleana é mais leve e já integrada em múltiplos componentes.

### Tipo `WhatsAppMessageWithLead`

```typescript
// src/types/database.ts — ADICIONAR
export interface WhatsAppMessageWithLead extends WhatsAppMessage {
  lead_email: string;
  lead_name: string | null; // firstName + lastName
}
```

Obtido via join na query:
```sql
SELECT wm.*, l.email as lead_email,
  CONCAT(l.first_name, ' ', l.last_name) as lead_name
FROM whatsapp_messages wm
LEFT JOIN leads l ON wm.lead_id = l.id
WHERE wm.campaign_id = $1 AND wm.tenant_id = $2
ORDER BY wm.created_at DESC
```

### Extensão do Endpoint de Tracking — Aggregate Query

```typescript
// Na route.ts de tracking — ADICIONAR após fetch de sentLeadEmails

// Fetch WhatsApp message stats per lead (Story 11.7 AC#8)
const whatsappStats = new Map<string, { count: number; lastSentAt: string | null; lastStatus: string | null }>();

if (emailByLeadId.size > 0) {
  const { data: msgStats } = await supabase
    .rpc("get_whatsapp_stats_by_campaign", {
      p_campaign_id: campaignId,
      p_tenant_id: profile.tenant_id,
    });
  // OU via query manual com GROUP BY:
  // SELECT lead_id, COUNT(*) as msg_count, MAX(sent_at) as last_sent,
  //   (SELECT status FROM whatsapp_messages wm2 WHERE wm2.lead_id = wm.lead_id
  //    AND wm2.campaign_id = wm.campaign_id ORDER BY created_at DESC LIMIT 1) as last_status
  // FROM whatsapp_messages wm WHERE campaign_id = $1 AND tenant_id = $2 GROUP BY lead_id
}
```

**ALTERNATIVA MAIS SIMPLES** (sem RPC): Fetch todas as mensagens da campanha e agrupar no JS:
```typescript
const { data: allMessages } = await supabase
  .from("whatsapp_messages")
  .select("lead_id, status, sent_at")
  .eq("campaign_id", campaignId)
  .eq("tenant_id", profile.tenant_id);

// Agrupar por lead_id no JS — aceitável para volumes de MVP (dezenas de leads)
```

**DECISÃO**: Usar abordagem JS (sem RPC/stored procedure) para simplificar. Volume de mensagens por campanha é baixo no MVP.

### Helper `getWhatsAppStatusIcon` — Padrão Visual

```typescript
// Pode ficar no próprio componente ou em um utils
function getWhatsAppStatusIcon(status: WhatsAppMessageStatus) {
  switch (status) {
    case "pending": return { icon: Clock, color: "text-muted-foreground", label: "Pendente" };
    case "sent": return { icon: Check, color: "text-green-600 dark:text-green-400", label: "Enviado" };
    case "delivered": return { icon: CheckCheck, color: "text-blue-500", label: "Entregue" };
    case "read": return { icon: CheckCheck, color: "text-blue-700 dark:text-blue-300", label: "Lido" };
    case "failed": return { icon: X, color: "text-red-500", label: "Falhou" };
  }
}
```

**`CheckCheck`** é o ícone de Lucide para double-check (2 marcas) — padrão WhatsApp para "entregue/lido".

### `interactionTypeValues` — Extensão

```typescript
// src/types/interaction.ts — MODIFICAR
const interactionTypeValues = [
  "note",
  "status_change",
  "import",
  "campaign_sent",
  "campaign_reply",
  "whatsapp_sent", // NOVO — Story 11.7
] as const;
```

O `LeadDetailPanel` já renderiza interações dinamicamente. Precisa adicionar:
- Ícone `MessageCircle` para o tipo `"whatsapp_sent"`
- Cor verde para diferenciar de outros tipos
- Preview da mensagem como conteúdo

### Tooltip com Shadcn/UI

```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Na LeadTrackingTable:
{lead.whatsappMessageCount > 0 && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger>
        <MessageCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
      </TooltipTrigger>
      <TooltipContent>
        {lead.whatsappMessageCount === 1
          ? `WhatsApp enviado em ${formatDate(lead.lastWhatsAppSentAt)}`
          : `${lead.whatsappMessageCount} mensagens WhatsApp | Última: ${formatDate(lead.lastWhatsAppSentAt)}`
        }
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

**VERIFICAR**: Se `Tooltip` (shadcn/ui) já está instalado em `src/components/ui/tooltip.tsx`. Se não, instalar via `npx shadcn@latest add tooltip`.

### Formato de Data — PT-BR

```typescript
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}
```

Reutilizar se já existir no projeto ou criar inline. **NÃO** usar `date-fns` se não estiver instalado.

### LeadDetailPanel — Seção WhatsApp Agrupada por Campanha

```
┌─── Mensagens WhatsApp ────────────────────────────┐
│ Campanha: Outbound Q1 2026                        │
│ ├── ✓ +55 11 99999-1234 — "Olá João, vi que..."  │
│ │   10/02/2026 14:32 — Enviado                    │
│ ├── ✓ +55 11 99999-1234 — "João, complementan..." │
│ │   10/02/2026 15:45 — Enviado                    │
│                                                    │
│ Campanha: Outbound Q4 2025                        │
│ ├── ✗ +55 11 99999-1234 — "Boa tarde, gostari..." │
│ │   05/12/2025 10:15 — Falhou: número inválido    │
└────────────────────────────────────────────────────┘
```

### API Endpoint para Histórico por Lead (All Campaigns)

Para o `LeadDetailPanel` que precisa de mensagens de TODAS as campanhas de um lead:

```typescript
// Opção 1: Novo endpoint
// GET /api/leads/[leadEmail]/whatsapp-messages

// Opção 2: Reutilizar endpoint com query param
// GET /api/campaigns/[campaignId]/whatsapp-messages?leadEmail=xxx
// Problema: precisa de campaignId que pode não estar disponível no LeadDetailPanel

// DECISÃO: Criar endpoint separado por lead
// GET /api/leads/whatsapp-messages?email=xxx
```

**DECISÃO**: Criar `src/app/api/leads/whatsapp-messages/route.ts` para buscar mensagens de um lead across all campaigns. Parâmetro: `?email=xxx`. Ordenado por `created_at DESC`. Inclui `campaign_name` via join.

### Invalidação de Cache — Pontos de Integração

| Componente | Evento | Queries Invalidadas |
|-----------|--------|---------------------|
| `useWhatsAppSend` | Envio individual concluído | `["whatsapp-messages", campaignId]`, `["lead-tracking", campaignId]` |
| `useWhatsAppBulkSend` | Bulk completo/cancelado | `["whatsapp-messages", campaignId]`, `["lead-tracking", campaignId]` |
| `OpportunityPanel` → `handleBulkComplete` | Dialog fecha | `["lead-tracking", campaignId]` (já existe) |

**NOTA**: A invalidação no `useWhatsAppSend` hook precisa de acesso ao `queryClient`. Usar `useQueryClient()` do TanStack Query.

**PADRÃO EXISTENTE** (de 11.4):
```typescript
// Em OpportunityPanel → handleBulkComplete:
queryClient.invalidateQueries({ queryKey: ["lead-tracking", campaignId] });
```

Precisa adicionar `["whatsapp-messages", campaignId]` ao lado.

### Componentes UI Necessários

| Componente | Origem | Uso |
|-----------|--------|-----|
| `Tooltip`, `TooltipContent`, `TooltipTrigger`, `TooltipProvider` | `@/components/ui/tooltip` | Tooltip na LeadTrackingTable e OpportunityPanel |
| `MessageCircle` | `lucide-react` | Ícone de WhatsApp em tabela e histórico |
| `Check`, `CheckCheck`, `X`, `Clock` | `lucide-react` | Ícones de status de mensagem |
| `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` | `@/components/ui/accordion` | Agrupamento por campanha no LeadDetailPanel (VERIFICAR se existe) |

**VERIFICAR**: `tooltip.tsx` e `accordion.tsx` em `src/components/ui/`. Se não existirem, instalar via `npx shadcn@latest add tooltip accordion`.

### Learnings das Stories Anteriores (Code Review)

- **11.6**: `recentlySentEmails` pattern — Set<string> atualizado em real-time via callback `onLeadSent`. Reutilizar para contagem.
- **11.6**: `allSentEmails` merge — `useMemo` combina `recentlySentEmails` + `sentLeadEmails` prop. Para contagem, precisa de dados adicionais do endpoint.
- **11.4**: `sendWhatsAppMessage` server action insere na tabela `whatsapp_messages` com status `pending`, atualiza para `sent`/`failed`. Os registros já existem no DB — só precisa buscar.
- **11.4**: `isLeadSent(email)` — check booleano atual. Para 11.7, precisa de contagem + data.
- **11.3**: `normalizeTemplateVariables()` — não relevante para 11.7.
- **11.2**: Schema define `status: pending | sent | delivered | read | failed`. Os status `delivered` e `read` seriam via webhook Z-API (fora do scope de 11.7 — futuro). Para 11.7, renderizar os 5 status mas na prática só `pending`, `sent`, `failed` terão dados.
- **10.5**: `LeadTrackingTable` — tabela de tracking com sortable columns. Modelo para adicionar coluna WhatsApp.
- **4.3**: `LeadDetailPanel` com interações — modelo para adicionar seção WhatsApp.

### Anti-Patterns (NÃO FAZER)

- **NÃO** substituir `useSentLeadEmails()` por `useWhatsAppMessages()` — booleano é mais leve e já integrado
- **NÃO** usar `console.log` — ESLint no-console rule ativo
- **NÃO** usar `space-y-*` — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
- **NÃO** usar `any` — tipagem estrita sempre
- **NÃO** criar stored procedures/RPCs no Supabase para MVP — queries JS são suficientes
- **NÃO** implementar recebimento de status via webhook Z-API (delivered/read) — fora do scope. Renderizar os ícones mas dados virão no futuro.
- **NÃO** criar tabela nova — reutilizar `whatsapp_messages` existente
- **NÃO** usar `useEffect` para estado derivado — usar `useMemo` (padrão do projeto)
- **NÃO** duplicar lógica de formatação de telefone — reutilizar `formatPhone` existente ou extrair para utils
- **NÃO** usar `date-fns` se não estiver instalado — usar `Intl.DateTimeFormat`

### Project Structure Notes

- Endpoint novo: `src/app/api/campaigns/[campaignId]/whatsapp-messages/route.ts` (NOVO)
- Endpoint novo: `src/app/api/leads/whatsapp-messages/route.ts` (NOVO — mensagens por lead, all campaigns)
- Hook novo: `src/hooks/use-whatsapp-messages.ts` (NOVO)
- Tipo novo: `WhatsAppMessageWithLead` em `src/types/database.ts` (MODIFICAR)
- Tipo modificado: `interactionTypeValues` em `src/types/interaction.ts` (MODIFICAR)
- Tipo modificado: tracking types em `src/types/tracking.ts` (MODIFICAR — add whatsapp stats)
- Componente modificado: `src/components/tracking/LeadTrackingTable.tsx` (MODIFICAR — coluna WhatsApp)
- Componente modificado: `src/components/leads/LeadDetailPanel.tsx` (MODIFICAR — seção WhatsApp)
- Componente modificado: `src/components/tracking/OpportunityPanel.tsx` (MODIFICAR — contagem no indicador)
- Endpoint modificado: `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` (MODIFICAR — stats WhatsApp)
- Hook modificado: `src/hooks/use-whatsapp-send.ts` (MODIFICAR — invalidação de cache)
- Hook modificado: `src/hooks/use-whatsapp-bulk-send.ts` (MODIFICAR — invalidação de cache)
- Testes novos: `__tests__/unit/api/campaigns/whatsapp-messages.test.ts` (NOVO)
- Testes novos: `__tests__/unit/api/leads/whatsapp-messages.test.ts` (NOVO)
- Testes novos: `__tests__/unit/hooks/use-whatsapp-messages.test.ts` (NOVO)
- Testes modificados: `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` (MODIFICAR)
- Testes modificados: `__tests__/unit/components/leads/LeadDetailPanel.test.tsx` (MODIFICAR)
- Testes modificados: `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` (MODIFICAR)
- **Verificar instalação**: `tooltip.tsx`, `accordion.tsx` em `src/components/ui/`

### Git Intelligence

Branch: `epic/11-whatsapp-integration`
Commits recentes:
- `b02c1cc` chore: WIP — CreateLeadDialog, leads page updates, instantly fixes, sprint docs
- `83e0026` feat(story-11.6): envio em massa WhatsApp com intervalos humanizados + code review fixes
- `9187c9e` feat(story-11.5): busca de telefone no fluxo de leads quentes + code review fixes
- `5bfe9cc` feat(story-11.4): envio individual WhatsApp + server action + code review fixes
- `2024b23` feat(story-11.3): WhatsApp composer dialog + AI generation + code review fixes
Padrão de commit: `feat(story-X.Y): descrição curta`

### Dependências Específicas

- **11.4 (done)**: `sendWhatsAppMessage` server action (cria registros na tabela `whatsapp_messages`)
- **11.6 (done)**: `useWhatsAppBulkSend` (cria múltiplos registros — mesma tabela)
- **11.2 (done)**: Schema `whatsapp_messages` + tipos TS `WhatsAppMessage`, `WhatsAppMessageStatus`
- **10.5 (done)**: `LeadTrackingTable` (tabela a ser estendida com coluna WhatsApp)
- **10.7 (done)**: `OpportunityPanel` (painel a ser estendido com contagem)
- **4.3 (done)**: `LeadDetailPanel` com histórico de interações (a ser estendido com WhatsApp)

### References

- [Source: src/types/database.ts] — WhatsApp message types, WhatsAppMessageStatus, isValidWhatsAppMessageStatus
- [Source: src/types/interaction.ts] — interactionTypeValues (needs "whatsapp_sent")
- [Source: src/types/tracking.ts] — Campaign tracking types (needs WhatsApp stats)
- [Source: src/components/tracking/OpportunityPanel.tsx] — Current "✓ Enviado" indicator, recentlySentEmails, allSentEmails
- [Source: src/components/tracking/LeadTrackingTable.tsx] — Table without WhatsApp columns
- [Source: src/components/leads/LeadDetailPanel.tsx] — Interaction history (needs WhatsApp section)
- [Source: src/actions/whatsapp.ts] — sendWhatsAppMessage server action (creates DB records)
- [Source: src/hooks/use-lead-tracking.ts] — useSentLeadEmails hook (model for useWhatsAppMessages)
- [Source: src/hooks/use-whatsapp-send.ts] — Individual send hook (needs cache invalidation)
- [Source: src/hooks/use-whatsapp-bulk-send.ts] — Bulk send hook (needs cache invalidation)
- [Source: src/app/api/campaigns/[campaignId]/leads/tracking/route.ts] — Tracking endpoint (needs WhatsApp stats)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-10.md] — Epic 11 definition
- [Source: _bmad-output/implementation-artifacts/11-6-envio-em-massa-com-intervalos.md] — Previous story with patterns
- [Source: _bmad-output/implementation-artifacts/11-4-envio-individual-whatsapp.md] — Individual send story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Code review found cache key mismatch: `["leadTracking"]` in OpportunityPanel vs canonical `["lead-tracking"]` — fixed
- Added missing Tooltip on "Enviado" indicator per AC#6
- Fixed `lastWhatsAppStatus` type from `string | null` to `WhatsAppMessageStatus | null`

### File List

**New files:**
- `src/hooks/use-whatsapp-messages.ts`
- `src/app/api/campaigns/[campaignId]/whatsapp-messages/route.ts`
- `src/app/api/leads/whatsapp-messages/route.ts`
- `__tests__/unit/api/campaigns/whatsapp-messages.test.ts`
- `__tests__/unit/api/leads/whatsapp-messages.test.ts`
- `__tests__/unit/hooks/use-whatsapp-messages.test.ts`

**Modified files:**
- `src/types/database.ts` (WhatsAppMessageWithLead)
- `src/types/interaction.ts` (whatsapp_sent type)
- `src/types/tracking.ts` (WhatsApp stats fields + type fix)
- `src/components/tracking/LeadTrackingTable.tsx` (WA column + status icons)
- `src/components/leads/LeadDetailPanel.tsx` (WhatsApp messages section)
- `src/components/tracking/OpportunityPanel.tsx` (count indicator + tooltip + cache key fix)
- `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` (WhatsApp aggregate stats)
- `src/hooks/use-whatsapp-send.ts` (cache invalidation)
- `src/hooks/use-whatsapp-bulk-send.ts` (cache invalidation)
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx`
- `__tests__/unit/components/leads/LeadDetailPanel.test.tsx`
- `__tests__/unit/components/tracking/OpportunityPanel.test.tsx`
- `__tests__/unit/hooks/use-whatsapp-send.test.ts`
- `__tests__/unit/hooks/use-whatsapp-bulk-send.test.ts`
