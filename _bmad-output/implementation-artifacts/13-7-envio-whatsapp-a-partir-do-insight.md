# Story 13.7: Envio WhatsApp a Partir do Insight

Status: done

## Story

As a Marco (SDR),
I want enviar uma mensagem WhatsApp diretamente a partir de um insight,
so that eu aja imediatamente quando vejo uma oportunidade quente sem sair da tela de insights.

## Acceptance Criteria

1. Botao "Enviar WhatsApp" visivel no insight SE o lead tem telefone cadastrado
2. Ao clicar, abre o WhatsAppComposer existente (reutiliza componente da Epic 11)
3. Mensagem pre-gerada baseada na sugestao de abordagem do insight
4. Marco pode editar a mensagem antes de enviar (mesmo padrao existente)
5. Apos envio, insight e automaticamente marcado como `used`
6. Se lead nao tem telefone, botao nao aparece (ou aparece desabilitado com tooltip explicativo)
7. Testes unitarios para integracao

## Tasks / Subtasks

- [x] Task 1: Expandir dados do lead no endpoint de insights (AC: #1, #6)
  - [x] 1.1 Editar `src/app/api/insights/route.ts` — adicionar `phone` e `email` ao SELECT do join com `leads`
  - [x] 1.2 Editar `src/hooks/use-lead-insights.ts` — adicionar `phone` e `email` ao tipo `InsightLeadData`
  - [x] 1.3 Editar a transformacao no GET route para incluir os novos campos no response

- [x] Task 2: Adicionar `initialMessage` prop ao WhatsAppComposerDialog (AC: #3)
  - [x] 2.1 Editar `src/components/tracking/WhatsAppComposerDialog.tsx` — adicionar prop opcional `initialMessage?: string`
  - [x] 2.2 Usar `initialMessage` no `useState` inicial: `useState(initialMessage ?? "")`
  - [x] 2.3 Reset para `initialMessage` (em vez de "") quando dialog abre novamente

- [x] Task 3: Criar server action para envio WhatsApp a partir de insight (AC: #2, #5)
  - [x] 3.1 Criar `sendWhatsAppFromInsight` em `src/actions/whatsapp.ts` (MESMO arquivo, nova funcao)
  - [x] 3.2 Schema: `{ leadId: uuid, insightId: uuid, phone: string, message: string }` (sem campaignId)
  - [x] 3.3 Flow: validate → auth → credentials → insert whatsapp_messages (campaign_id=null) → send via ZApi → update status
  - [x] 3.4 On success: tambem atualizar insight status para "used" atomicamente
  - [x] 3.5 Resolve lead por `leadId` direto (nao por email como no action existente)

- [x] Task 4: Criar hook `useWhatsAppSendFromInsight` (AC: #2, #5)
  - [x] 4.1 Criar `src/hooks/use-whatsapp-send-from-insight.ts`
  - [x] 4.2 Interface: `send({ leadId, insightId, phone, message }) => Promise<boolean>`
  - [x] 4.3 Invalidar caches: `["whatsapp-messages"]`, `["lead-tracking"]`, `["insights"]`, `["insights-new-count"]`
  - [x] 4.4 Toast success/error (mesmo padrao do useWhatsAppSend)

- [x] Task 5: Adicionar botao WhatsApp e dialog na pagina de Insights (AC: #1, #2, #3, #4, #6)
  - [x] 5.1 Editar `src/components/insights/InsightsTable.tsx` — adicionar botao WhatsApp inline na coluna "Acoes"
  - [x] 5.2 Botao visivel se `insight.lead.phone` existe; desabilitado com Tooltip se nao tem telefone
  - [x] 5.3 Editar `src/components/insights/InsightsPageContent.tsx` — gerenciar estado do WhatsAppComposerDialog
  - [x] 5.4 State: `composerInsight: InsightWithLead | null` (abrir/fechar dialog)
  - [x] 5.5 Passar `initialMessage={composerInsight.suggestion}` para pre-preencher
  - [x] 5.6 No `onSend`, chamar `useWhatsAppSendFromInsight.send()` e fechar dialog on success

- [x] Task 6: Testes unitarios (AC: #7)
  - [x] 6.1 Criar `__tests__/unit/actions/whatsapp-from-insight.test.ts` — testes da server action (auth, validation, send success, send failure, insight auto-mark)
  - [x] 6.2 Criar `__tests__/unit/hooks/use-whatsapp-send-from-insight.test.ts` — testes do hook (send, toast, cache invalidation)
  - [x] 6.3 Atualizar `__tests__/unit/components/insights/InsightsTable.test.tsx` — testes do botao WhatsApp (visivel com phone, oculto/desabilitado sem phone, aria-label)
  - [x] 6.4 Atualizar `__tests__/unit/components/insights/InsightsPageContent.test.tsx` — testes da integracao do dialog (abrir, fechar, enviar, auto-mark used)
  - [x] 6.5 Atualizar `__tests__/unit/app/api/insights/route.test.ts` — verificar que phone e email estao no response
  - [x] 6.6 Validar que TODOS os testes existentes continuam passando: `npx vitest run`

## Dev Notes

### Decisao Arquitetural: Nova Server Action vs Modificar Existente

**Problema:** A `sendWhatsAppMessage` existente exige `campaignId` (UUID obrigatorio via Zod) e resolve lead por `leadEmail`. Insights nao tem contexto de campanha.

**Abordagem escolhida: NOVA server action `sendWhatsAppFromInsight`**

Criar funcao separada no MESMO arquivo (`src/actions/whatsapp.ts`). Razoes:
- Nao quebra a action existente (usada pelo OpportunityPanel)
- Schema diferente: `leadId` direto (sem resolver por email), sem `campaignId`
- Logica adicional: auto-mark insight como "used" on success
- `campaign_id` no insert = `null` (coluna ja e nullable na tabela `whatsapp_messages`)

```typescript
// src/actions/whatsapp.ts — ADICIONAR (nao modificar sendWhatsAppMessage)
const sendFromInsightSchema = z.object({
  leadId: z.string().uuid(),
  insightId: z.string().uuid(),
  phone: z.string().regex(/^\+?\d{10,15}$/, "Formato de telefone invalido"),
  message: z.string().min(1).max(5000),
});

export async function sendWhatsAppFromInsight(
  input: z.infer<typeof sendFromInsightSchema>
): Promise<ActionResult<WhatsAppMessage>> {
  // Mesmo flow: sanitize → validate → auth → credentials → insert (campaign_id=null) → send → update
  // EXTRA: on success → update lead_insights SET status='used' WHERE id=insightId
}
```

### Decisao Arquitetural: initialMessage no WhatsAppComposerDialog

**Problema:** AC #3 exige mensagem pre-preenchida com a sugestao. O componente inicializa `useState("")`.

**Abordagem escolhida: Prop opcional `initialMessage`**

Modificacao MINIMA e nao-breaking:
```typescript
// WhatsAppComposerDialog.tsx — UNICA modificacao
export interface WhatsAppComposerDialogProps {
  // ...existing props...
  initialMessage?: string;  // NOVO — pre-preenche textarea
}

// Na funcao:
const [message, setMessage] = useState(initialMessage ?? "");

// No handleOpenChange (reset):
if (!nextOpen) {
  setMessage(initialMessage ?? "");  // Reset para initial, nao ""
  cancelAI();
  resetAI();
}
```

**ATENCAO:** O `useState` so captura o valor inicial na montagem. Se o dialog abrir com leads diferentes, precisamos de um `useEffect` para sincronizar:
```typescript
useEffect(() => {
  if (open && initialMessage !== undefined) {
    setMessage(initialMessage);
  }
}, [open, initialMessage]);
```

### Expansao do Join na API de Insights

**Arquivo:** `src/app/api/insights/route.ts`

Adicionar `phone` e `email` ao SELECT existente:
```typescript
// ANTES:
.select(`*, leads!inner (id, first_name, last_name, photo_url, company_name, title, linkedin_url)`)

// DEPOIS:
.select(`*, leads!inner (id, first_name, last_name, photo_url, company_name, title, linkedin_url, phone, email)`)
```

Atualizar a transformacao para incluir os novos campos:
```typescript
lead: {
  // ...existing fields...
  phone: row.leads.phone as string | null,     // NOVO
  email: row.leads.email as string | null,      // NOVO (usado pelo fallback)
},
```

### Tipo InsightLeadData Expandido

**Arquivo:** `src/hooks/use-lead-insights.ts`

```typescript
export interface InsightLeadData {
  id: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  companyName: string | null;
  title: string | null;
  linkedinUrl: string | null;
  phone: string | null;     // NOVO — AC #1, #6
  email: string | null;     // NOVO — fallback para identificacao
}
```

### Botao WhatsApp na InsightsTable

**Arquivo:** `src/components/insights/InsightsTable.tsx`

Adicionar botao INLINE (nao no dropdown) ao lado do dropdown de acoes. Padrao: botao direto para acao primaria + dropdown para secundarias.

```typescript
import { MessageCircle } from "lucide-react";  // Icone WhatsApp

// Na coluna Acoes, ANTES do DropdownMenu:
{insight.lead.phone ? (
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8 text-green-600 dark:text-green-400"
    onClick={() => onWhatsApp(insight)}
    aria-label="Enviar WhatsApp"
    data-testid="insight-whatsapp-button"
  >
    <MessageCircle className="h-4 w-4" />
  </Button>
) : (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          disabled
          aria-label="WhatsApp indisponivel - lead sem telefone"
          data-testid="insight-whatsapp-disabled"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Telefone nao cadastrado</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

**CRITICO:** A InsightsTable precisa de uma nova prop `onWhatsApp`:
```typescript
interface InsightsTableProps {
  insights: InsightWithLead[];
  onUpdateStatus: (insightId: string, status: InsightStatus) => void;
  onWhatsApp: (insight: InsightWithLead) => void;  // NOVO
  isPending: boolean;
}
```

### Integracao do Dialog no InsightsPageContent

**Arquivo:** `src/components/insights/InsightsPageContent.tsx`

```typescript
import { WhatsAppComposerDialog } from "@/components/tracking/WhatsAppComposerDialog";
import { useWhatsAppSendFromInsight } from "@/hooks/use-whatsapp-send-from-insight";

// State:
const [composerInsight, setComposerInsight] = useState<InsightWithLead | null>(null);
const { send: sendWhatsApp, isSending } = useWhatsAppSendFromInsight();

// Handler:
const handleWhatsAppSend = useCallback(async (data: { phone: string; message: string }) => {
  if (!composerInsight) return;
  const success = await sendWhatsApp({
    leadId: composerInsight.lead.id,
    insightId: composerInsight.id,
    phone: data.phone,
    message: data.message,
  });
  if (success) {
    setComposerInsight(null);
    // Cache invalidation no hook ja cuida de atualizar o badge e a lista
  }
}, [composerInsight, sendWhatsApp]);

// Render (apos Card):
{composerInsight && (
  <WhatsAppComposerDialog
    open={!!composerInsight}
    onOpenChange={(open) => { if (!open) setComposerInsight(null); }}
    lead={{
      firstName: composerInsight.lead.firstName,
      lastName: composerInsight.lead.lastName ?? undefined,
      phone: composerInsight.lead.phone ?? undefined,
      companyName: composerInsight.lead.companyName ?? undefined,
      title: composerInsight.lead.title ?? undefined,
    }}
    campaignId=""
    initialMessage={composerInsight.suggestion ?? ""}
    onSend={handleWhatsAppSend}
  />
)}
```

**NOTA sobre `campaignId=""`:** O WhatsAppComposerDialog recebe `campaignId` mas NAO o usa diretamente — ele passa para `onSend` callback. Como estamos usando nosso proprio hook de envio (`useWhatsAppSendFromInsight`) que nao precisa de campaignId, o valor vazio nao causa problema. O componente internamente usa campaignId apenas para o comment no codigo "reserved for story 11.4". A AI generation via `useAIGenerate` nao depende de campaignId.

### Hook useWhatsAppSendFromInsight

**Arquivo:** `src/hooks/use-whatsapp-send-from-insight.ts`

Mesmo padrao do `use-whatsapp-send.ts` mas:
- Chama `sendWhatsAppFromInsight` (nova action)
- Invalida tambem `["insights"]` e `["insights-new-count"]` (AC #5 — auto-mark)
- Interface: `{ leadId, insightId, phone, message }` (sem campaignId, sem leadEmail)

### Verificacao: campaign_id nullable no whatsapp_messages

Verificar se `campaign_id` na tabela `whatsapp_messages` aceita NULL. Se nao aceitar, sera necessaria uma migration simples:
```sql
ALTER TABLE whatsapp_messages ALTER COLUMN campaign_id DROP NOT NULL;
```

### Project Structure Notes

- Novos arquivos:
  - `src/hooks/use-whatsapp-send-from-insight.ts`
  - `__tests__/unit/actions/whatsapp-from-insight.test.ts`
  - `__tests__/unit/hooks/use-whatsapp-send-from-insight.test.ts`
- Arquivos editados:
  - `src/actions/whatsapp.ts` (nova funcao, nao modifica existente)
  - `src/app/api/insights/route.ts` (expandir join)
  - `src/hooks/use-lead-insights.ts` (expandir tipo InsightLeadData)
  - `src/components/tracking/WhatsAppComposerDialog.tsx` (prop `initialMessage`)
  - `src/components/insights/InsightsTable.tsx` (botao WhatsApp + prop)
  - `src/components/insights/InsightsPageContent.tsx` (dialog state + handler)
- Testes atualizados:
  - `__tests__/unit/components/insights/InsightsTable.test.tsx`
  - `__tests__/unit/components/insights/InsightsPageContent.test.tsx`
  - `__tests__/unit/app/api/insights/route.test.ts`

### Padrao Tailwind v4

Usar `flex flex-col gap-*` para wrappers (NAO `space-y-*`). Ja seguido na 13.6.

### Icone WhatsApp

Usar `MessageCircle` do lucide-react (ja disponivel no projeto). Cor: `text-green-600 dark:text-green-400` para evocar WhatsApp.

### Testes: Mock Pattern

Seguir mock patterns estabelecidos nas stories 13.x:
- `mockCreateClient` e `mockGetCurrentUserProfile` de `__tests__/helpers/`
- Mock factories centralizadas em test utils
- Para WhatsAppComposerDialog: mock do modulo `@/components/tracking/WhatsAppComposerDialog`
- Para `sendWhatsAppFromInsight`: mock de `@/actions/whatsapp`

### References

- [Source: src/components/tracking/WhatsAppComposerDialog.tsx] — Componente reutilizado (props interface)
- [Source: src/actions/whatsapp.ts] — Server action existente (padrao a seguir para nova action)
- [Source: src/hooks/use-whatsapp-send.ts] — Hook existente (padrao a seguir para novo hook)
- [Source: src/components/insights/InsightsTable.tsx] — Tabela a editar (adicionar botao)
- [Source: src/components/insights/InsightsPageContent.tsx] — Componente principal a editar (dialog state)
- [Source: src/hooks/use-lead-insights.ts] — Hook e tipos a expandir (phone, email)
- [Source: src/app/api/insights/route.ts] — API a expandir (join com phone, email)
- [Source: src/components/tracking/OpportunityPanel.tsx] — Padrao de referencia para integracao WhatsApp
- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.7]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Tooltip hover test on disabled button fails in jsdom (pointer events blocked) → replaced with aria-label assertion

### Completion Notes List
- Task 1: Expanded insights API join to include `phone` and `email` from leads table. Updated `InsightLeadData` type and GET route transformation. All 31 existing API tests pass.
- Task 2: Added `initialMessage` prop to `WhatsAppComposerDialog`. Uses `useEffect` to sync when dialog opens with different leads. Resets to `initialMessage` on close. All 60 existing composer tests pass.
- Task 3: Created `sendWhatsAppFromInsight` server action in same file as existing action. Uses `leadId` directly (no email resolution), `campaign_id=null`, and auto-marks insight as "used" on success. All 19 existing action tests pass.
- Task 4: Created `useWhatsAppSendFromInsight` hook following same pattern as `useWhatsAppSend`. Invalidates 4 query caches: `whatsapp-messages`, `lead-tracking`, `insights`, `insights-new-count`.
- Task 5: Added WhatsApp button inline in InsightsTable actions column (green when phone exists, disabled with aria-label when no phone). Integrated WhatsAppComposerDialog in InsightsPageContent with `composerInsight` state, `initialMessage` from suggestion, and auto-close on successful send.
- Task 6: Created 2 new test files (18 + 13 = 31 tests), updated 3 existing test files (+11 tests). Full regression suite: 272 files, 4941 tests, 0 failures (+42 new tests).
- Code Review (AI): Fixed 6 issues (4M, 2L). M1: lead ownership validation with tenant_id in sendWhatsAppFromInsight. M2: isSending prop on WhatsAppComposerDialog prevents double-send. M3/M4: insight auto-mark wrapped in try-catch with error isolation. L1: extracted getZApiCredentials shared helper. L2: leadEmail passthrough to dialog. +3 tests. Post-review: 272 files, 4944 tests, 0 failures.

### File List
- `src/app/api/insights/route.ts` (edited: phone + email in join and transform)
- `src/hooks/use-lead-insights.ts` (edited: phone + email in InsightLeadData)
- `src/components/tracking/WhatsAppComposerDialog.tsx` (edited: initialMessage prop + useEffect sync)
- `src/actions/whatsapp.ts` (edited: new sendWhatsAppFromInsight action + sendFromInsightSchema)
- `src/hooks/use-whatsapp-send-from-insight.ts` (new: hook for sending WA from insight context)
- `src/components/insights/InsightsTable.tsx` (edited: WhatsApp button + onWhatsApp prop)
- `src/components/insights/InsightsPageContent.tsx` (edited: WhatsApp dialog state + handler)
- `__tests__/unit/actions/whatsapp-from-insight.test.ts` (new: 18 tests for server action)
- `__tests__/unit/hooks/use-whatsapp-send-from-insight.test.ts` (new: 13 tests for hook)
- `__tests__/unit/components/insights/InsightsTable.test.tsx` (edited: +5 WhatsApp button tests)
- `__tests__/unit/components/insights/InsightsPageContent.test.tsx` (edited: +6 WhatsApp dialog tests)
- `__tests__/unit/app/api/insights/route.test.ts` (edited: +2 phone/email tests)
