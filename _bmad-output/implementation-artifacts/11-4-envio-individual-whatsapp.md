# Story 11.4: Envio Individual de WhatsApp

Status: done

## Story

As a usuário da plataforma,
I want enviar mensagens WhatsApp individuais para leads quentes diretamente do OpportunityPanel,
so that eu possa agir rapidamente sobre leads com alto interesse, aumentando a taxa de conversão.

## Acceptance Criteria

1. **AC1: Método sendText no ZApiService**
   - GIVEN o ZApiService já existente em `src/lib/services/zapi.ts`
   - WHEN o método `sendText(apiKey, phone, message)` é chamado
   - THEN ele faz POST para `https://api.z-api.io/instances/{instanceId}/token/{instanceToken}/send-text` com headers `Client-Token: {securityToken}` e `Content-Type: application/json`
   - AND o body contém `{ phone, message }`
   - AND retorna `{ zaapId: string, messageId: string }` em caso de sucesso
   - AND lança `ExternalServiceError` com mensagem em português em caso de falha

2. **AC2: Server Action para envio de WhatsApp**
   - GIVEN uma nova server action `sendWhatsAppMessage` em `src/actions/whatsapp.ts`
   - WHEN chamada com `{ campaignId, leadEmail, phone, message }`
   - THEN valida input com Zod schema
   - AND autentica via `getCurrentUserProfile()` para obter `tenant_id`
   - AND busca credenciais Z-API: `api_configs WHERE service_name='zapi' AND tenant_id` + `decryptApiKey()`
   - AND resolve `leadId` via `leads WHERE email=leadEmail AND tenant_id` (CRITICO: OpportunityLead não tem leadId)
   - AND insere registro na tabela `whatsapp_messages` com status `pending`
   - AND chama `ZApiService.sendText()` para enviar a mensagem
   - AND atualiza o registro para status `sent` com `external_message_id` e `external_zaap_id` do response
   - AND em caso de falha na API, atualiza status para `failed` com `error_message`
   - AND retorna `ActionResult<WhatsAppMessage>` (padrão do projeto)

3. **AC3: Hook useWhatsAppSend**
   - GIVEN um novo hook `useWhatsAppSend` em `src/hooks/use-whatsapp-send.ts`
   - WHEN usado por um componente React
   - THEN expõe `{ send, isSending, error, lastResult }`
   - AND `send(data)` chama a server action `sendWhatsAppMessage` com `{ campaignId, leadEmail, phone, message }`
   - AND gerencia estados de loading/error/success
   - AND exibe toast de sucesso ("Mensagem WhatsApp enviada com sucesso!") ou erro ("Falha ao enviar mensagem WhatsApp: {motivo}")

4. **AC4: Botão WhatsApp no OpportunityPanel**
   - GIVEN o componente `OpportunityPanel` em `src/components/tracking/OpportunityPanel.tsx`
   - WHEN um lead qualificado é exibido na lista
   - THEN o badge estático "(WhatsApp em breve)" é substituído por um botão/ícone clicável de WhatsApp
   - AND o botão fica habilitado SOMENTE se o lead possui `phone` (telefone disponível)
   - AND se o lead não tem telefone, o botão fica desabilitado com tooltip "Telefone não disponível"
   - AND ao clicar no botão, abre o `WhatsAppComposerDialog` com os dados do lead

5. **AC5: Integração OpportunityPanel + WhatsAppComposerDialog**
   - GIVEN o `WhatsAppComposerDialog` aberto a partir do OpportunityPanel
   - WHEN o usuário compõe (manual ou IA) e clica "Enviar"
   - THEN o callback `onSend` chama `useWhatsAppSend.send()` com `{ campaignId, leadEmail: lead.leadEmail, phone, message }`
   - AND durante o envio, o botão mostra spinner/loading state
   - AND o dialog fecha automaticamente após envio com sucesso
   - AND toast de confirmação é exibido
   - AND em caso de erro, o dialog permanece aberto com mensagem de erro

6. **AC6: Props adicionais no OpportunityPanel**
   - GIVEN o OpportunityPanel atualmente recebe `{ leads, isLoading }`
   - WHEN a story 11.4 é implementada
   - THEN o OpportunityPanel recebe adicionalmente `{ campaignId: string }` para identificar a campanha
   - AND o componente pai que renderiza OpportunityPanel passa o `campaignId` correto
   - AND opcionalmente recebe `productId?: string | null` para contexto do composer de IA

7. **AC7: Feedback visual de status do envio**
   - GIVEN que uma mensagem foi enviada com sucesso
   - WHEN o lead é exibido novamente no OpportunityPanel
   - THEN um indicador visual sutil (ex: ícone check ou badge "Enviado") aparece ao lado do botão WhatsApp
   - AND isso é baseado em query ao banco para verificar se existe `whatsapp_messages` para aquele `lead_id + campaign_id`

8. **AC8: Cobertura de testes unitários**
   - GIVEN todos os novos componentes e funções
   - WHEN os testes são executados via `npx vitest run`
   - THEN todos passam com cobertura adequada:
     - ZApiService.sendText: sucesso, erro de rede, erro 4xx/5xx, timeout, credenciais inválidas
     - Server action: fluxo completo (pending→sent), fluxo de erro (pending→failed), Z-API não configurado, lead não encontrado por email
     - Hook useWhatsAppSend: estados de loading, sucesso, erro, toast
     - OpportunityPanel: botão habilitado com phone, desabilitado sem phone, abertura do dialog
     - Integração: envio com sucesso fecha dialog, erro mantém aberto

## Tasks / Subtasks

- [x] Task 1: Implementar `sendText` no ZApiService (AC: #1)
  - [x] 1.1 Adicionar método `sendText(apiKey: string, phone: string, message: string): Promise<ZApiSendResult>` ao `ZApiService`
  - [x] 1.2 Criar interface `ZApiSendResult` com `{ zaapId: string, messageId: string }`
  - [x] 1.3 Implementar chamada POST com `buildZApiUrl` e `buildZApiHeaders` existentes
  - [x] 1.4 Tratar erros (rede, 405, 415, timeout) com mensagens em português
  - [x] 1.5 Escrever testes unitários em `__tests__/unit/lib/services/zapi.test.ts` (adicionar ao arquivo existente)

- [x] Task 2: Criar Server Action `sendWhatsAppMessage` (AC: #2)
  - [x] 2.1 Criar arquivo `src/actions/whatsapp.ts`
  - [x] 2.2 Implementar `sendWhatsAppMessage({ campaignId, leadEmail, phone, message })` com "use server"
  - [x] 2.3 Validar input com Zod schema (`sendWhatsAppSchema`)
  - [x] 2.4 Autenticar via `getCurrentUserProfile()` → obter `tenant_id`
  - [x] 2.5 Buscar credenciais Z-API: `api_configs WHERE service_name='zapi'` + `decryptApiKey()`
  - [x] 2.6 Resolver `leadId` FROM `leads WHERE email=leadEmail AND tenant_id` (CRITICO)
  - [x] 2.7 Inserir registro `whatsapp_messages` com status `pending` via Supabase
  - [x] 2.8 Chamar `ZApiService.sendText()` e atualizar registro para `sent` ou `failed`
  - [x] 2.9 Escrever testes em `__tests__/unit/actions/whatsapp.test.ts`

- [x] Task 3: Criar hook `useWhatsAppSend` (AC: #3)
  - [x] 3.1 Criar `src/hooks/use-whatsapp-send.ts`
  - [x] 3.2 Implementar gerenciamento de estado `{ send, isSending, error, lastResult }`
  - [x] 3.3 Integrar toast via `sonner` (padrão do projeto: `toast.success()` / `toast.error()`)
  - [x] 3.4 Escrever testes em `__tests__/unit/hooks/use-whatsapp-send.test.ts`

- [x] Task 4: Atualizar OpportunityPanel com botão WhatsApp (AC: #4, #5, #6, #7)
  - [x] 4.1 Adicionar props `campaignId` e `productId?` ao `OpportunityPanelProps`
  - [x] 4.2 Substituir badge "(WhatsApp em breve)" por botão/ícone WhatsApp (MessageSquare do Lucide)
  - [x] 4.3 Condicionar habilitação do botão à existência de `lead.phone` (se disponível no tipo)
  - [x] 4.4 Adicionar estado para controlar abertura do `WhatsAppComposerDialog`
  - [x] 4.5 Implementar `handleSend` usando `useWhatsAppSend` hook — passar `leadEmail: lead.leadEmail`
  - [x] 4.6 Fechar dialog automaticamente após envio com sucesso
  - [x] 4.7 Adicionar indicador visual de "já enviado" (query `whatsapp_messages` por lead+campaign)
  - [x] 4.8 Atualizar analytics page (`src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx:184-188`) para passar `campaignId` e `productId` ao OpportunityPanel
  - [x] 4.9 Escrever/atualizar testes em `__tests__/unit/components/tracking/OpportunityPanel.test.tsx`

- [x] Task 5: Testes de integração e validação final (AC: #8)
  - [x] 5.1 Garantir que todos os testes novos e existentes passam (`npx vitest run`)
  - [x] 5.2 Verificar que exports de `src/components/tracking/index.ts` estão corretos
  - [x] 5.3 Validar que ESLint passa sem erros (no-console rule)

## Dev Notes

### CRITICO: OpportunityLead NÃO tem `leadId`

O tipo `OpportunityLead` (extends `LeadTracking`) **NÃO possui campo `leadId`/`id`**. Campos disponíveis:
```typescript
interface LeadTracking {
  leadEmail: string;     // ← identificador principal
  campaignId: string;
  openCount: number; clickCount: number; hasReplied: boolean;
  lastOpenAt: string | null; events: CampaignEvent[];
  firstName?: string; lastName?: string; phone?: string;
}
interface OpportunityLead extends LeadTracking {
  qualifiedAt: string; isInOpportunityWindow: boolean;
}
```

**Solução**: O server action `sendWhatsAppMessage` deve aceitar `leadEmail` em vez de `leadId`, e resolver o UUID internamente:
```typescript
// Dentro do server action:
const { data: lead } = await supabase
  .from("leads")
  .select("id")
  .eq("email", params.leadEmail)
  .eq("tenant_id", profile.tenant_id)
  .single();
```
Isto evita alterar `LeadTracking` e os hooks de tracking (escopo mínimo).

### Onde OpportunityPanel é renderizado (analytics page)

[Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx:184-188]

```typescript
<OpportunityPanel
  ref={opportunityPanelRef}
  leads={opportunityLeads}
  isLoading={isLoadingLeads}
/>
```

O `campaignId` já está disponível via `use(params)` na linha 64. O `campaign?.productId` está disponível via `useCampaign(campaignId)`. Basta adicionar essas props ao `<OpportunityPanel>`.

### Contexto da Story Anterior (11.3)

O `WhatsAppComposerDialog` (story 11.3) já:
- Exibe info do lead (nome, empresa, cargo, indústria) + telefone formatado
- Composição manual com contador de caracteres (verde/amarelo/vermelho)
- Geração IA via `useAIGenerate()` com prompt `whatsapp_message_generation`
- Botão "Enviar" chama callback `onSend({ phone, message })`
- **IMPORTANTE**: `onSend` é callback prop — esta story fornece a implementação real
- Lead sem telefone: botão Enviar desabilitado, mostra "Copiar mensagem"

**Props do WhatsAppComposerDialog:**
```typescript
interface WhatsAppComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { firstName?; lastName?; phone?; leadEmail?; companyName?; title?; industry?; };
  campaignId: string;
  campaignName?: string;
  productId?: string | null;
  onSend?: (data: { phone: string; message: string }) => void;
}
```

### Learnings das Stories Anteriores (Code Review)
- **11.3**: Preservar texto do usuário em erro IA; abort request ao fechar dialog; manter arrays de mock sincronizados
- **11.2**: `WhatsAppMessageInsert` omite campos auto-gerados (id, status, created_at, updated_at); UNIQUE constraint em `(campaign_id, lead_id, external_message_id)`
- **11.1**: Credenciais Z-API armazenadas como JSON em `encrypted_key`; `parseZApiCredentials()` já valida e lança `ExternalServiceError`

### Z-API Send Text — Endpoint (Verificado via docs oficiais)

[Source: https://developer.z-api.io/en/message/send-message-text]

```
POST https://api.z-api.io/instances/{instanceId}/token/{instanceToken}/send-text

Headers:
  Client-Token: {securityToken}
  Content-Type: application/json

Body (required):
{
  "phone": "5511999999999",
  "message": "Texto da mensagem"
}

Body (optional):
  "delayMessage": 1-15 (delay em segundos antes de enviar)
  "delayTyping": 1-15 (indicador "digitando..." em segundos)

Response (200):
{
  "zaapId": "3999984263738042930CD6ECDE9VDWSA",
  "messageId": "D241XXXX732339502B68"
}

Erros: 405 (método errado), 415 (Content-Type ausente)
Formatos texto: suporta emojis, \n, \r, \r\n para quebras de linha
```

**Recomendação**: Incluir `delayTyping: 3` no envio para simular digitação natural (3s). Valor hardcoded — story 11.6 parametriza.

### Infraestrutura Já Disponível

| Componente | Arquivo | Status |
|-----------|---------|--------|
| ZApiService (testConnection) | `src/lib/services/zapi.ts` | Existente — adicionar `sendText` |
| parseZApiCredentials + buildZApiUrl + buildZApiHeaders | `src/lib/services/zapi.ts` | Reutilizar |
| ExternalService base (request, retry, timeout 10s) | `src/lib/services/base-service.ts` | Reutilizar `this.request()` |
| WhatsAppComposerDialog | `src/components/tracking/WhatsAppComposerDialog.tsx` | Pronto (11.3) |
| whatsapp_messages table | migration 00042 | Schema pronto + RLS + indexes |
| WhatsAppMessage/Insert/Update types | `src/types/database.ts` | Tipos prontos |
| OpportunityPanel | `src/components/tracking/OpportunityPanel.tsx` | Badge placeholder linha 160 |
| Analytics page (componente pai) | `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` | Renderiza OpportunityPanel linha 184 |
| Server action pattern | `src/actions/integrations.ts` | Padrão: createClient + getCurrentUserProfile |
| Supabase server client | `src/lib/supabase/server.ts` | `createClient()` |
| Tenant auth | `src/lib/supabase/tenant.ts` | `getCurrentUserProfile()` → `{ id, tenant_id, role }` |
| Encryption | `src/lib/crypto/encryption.ts` | `decryptApiKey()` para credenciais |

### Padrão sendText no ZApiService

```typescript
// Adicionar ao ZApiService em src/lib/services/zapi.ts

export interface ZApiSendResult {
  zaapId: string;
  messageId: string;
}

async sendText(apiKey: string, phone: string, message: string): Promise<ZApiSendResult> {
  const { instanceId, instanceToken, securityToken } = parseZApiCredentials(apiKey);
  const url = buildZApiUrl(instanceId, instanceToken, "/send-text");

  return this.request<ZApiSendResult>(url, {
    method: "POST",
    headers: buildZApiHeaders(securityToken),
    body: JSON.stringify({ phone, message, delayTyping: 3 }),
  });
}
```

**Nota**: `this.request()` da base class já trata timeout (10s), retry (1x em timeout/rede), e traduz erros para `ExternalServiceError` com mensagens em português.

### Padrão de Server Action (referência: `src/actions/integrations.ts`)

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { ZApiService, parseZApiCredentials } from "@/lib/services/zapi";
import type { WhatsAppMessage, WhatsAppMessageInsert } from "@/types/database";
import { z } from "zod";

const sendWhatsAppSchema = z.object({
  campaignId: z.string().uuid(),
  leadEmail: z.string().email(),
  phone: z.string().min(10),
  message: z.string().min(1).max(5000),
});

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function sendWhatsAppMessage(
  input: z.infer<typeof sendWhatsAppSchema>
): Promise<ActionResult<WhatsAppMessage>> {
  // 1. Validar input com Zod
  // 2. getCurrentUserProfile() → tenant_id
  // 3. Buscar credenciais: api_configs WHERE service_name='zapi' AND tenant_id
  // 4. Resolver leadId: leads WHERE email=leadEmail AND tenant_id (CRITICO)
  // 5. INSERT whatsapp_messages com status 'pending'
  // 6. ZApiService.sendText()
  // 7. UPDATE para 'sent' (sucesso) ou 'failed' (erro) + external_message_id/external_zaap_id
  // 8. Retornar resultado
}
```

### Fluxo de Dados Completo

```
Analytics Page (campaignId via URL params, productId via useCampaign)
  └→ OpportunityPanel (props: leads, isLoading, campaignId, productId)
       └→ [botão WhatsApp por lead] → abre WhatsAppComposerDialog
            └→ [composição manual ou IA]
            └→ [botão Enviar] → onSend({ phone, message })
                 └→ useWhatsAppSend.send({ campaignId, leadEmail, phone, message })
                      └→ server action sendWhatsAppMessage()
                           ├→ Resolve leadId FROM leads WHERE email=leadEmail
                           ├→ INSERT whatsapp_messages (status: pending)
                           ├→ ZApiService.sendText(decryptedKey, phone, message)
                           └→ UPDATE whatsapp_messages (status: sent | failed)
                      └→ toast sucesso/erro
                 └→ fechar dialog (se sucesso)
```

### Anti-Patterns (NÃO FAZER)

- **NÃO** criar novo service pattern — reutilizar `this.request()` da `ExternalService` base class
- **NÃO** usar `console.log` — ESLint no-console rule ativo
- **NÃO** chamar `ZApiService.sendText` do client — SEMPRE via server action
- **NÃO** duplicar lógica de parsing — reutilizar `parseZApiCredentials` existente
- **NÃO** hardcodar URLs — usar `buildZApiUrl` existente
- **NÃO** usar `space-y-*` — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
- **NÃO** importar `useEffect` sem necessidade real
- **NÃO** usar `any` — tipagem estrita sempre
- **NÃO** assumir que `OpportunityLead` tem `leadId` — tem apenas `leadEmail`

### Project Structure Notes

- Server actions: `src/actions/whatsapp.ts` (NOVO)
- Hook: `src/hooks/use-whatsapp-send.ts` (NOVO)
- Service: `src/lib/services/zapi.ts` (MODIFICAR — adicionar `sendText`)
- Componente: `src/components/tracking/OpportunityPanel.tsx` (MODIFICAR — botão + dialog)
- Página pai: `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` (MODIFICAR — passar props)
- Testes: `__tests__/unit/` espelhando estrutura src

### Git Intelligence

Branch: `epic/11-whatsapp-integration`
Commits recentes:
- `2024b23` feat(story-11.3): WhatsApp composer dialog + AI generation + code review fixes
- `9ef5152` feat(story-11.2): schema WhatsApp messages + tipos TS + code review fixes
- `9898abb` feat(story-11.1): Z-API integration service + config + code review fixes
Padrão de commit: `feat(story-X.Y): descrição curta`

### Dependências Específicas

- **11.1 (done)**: `ZApiService` + helpers de URL/headers/parsing
- **11.2 (done)**: Schema `whatsapp_messages` + tipos TS (`WhatsAppMessage/Insert/Update`)
- **11.3 (done)**: `WhatsAppComposerDialog` com `onSend` callback
- **10.6/10.7 (done)**: `OpportunityPanel` + `OpportunityEngine` + leads qualificados

### References

- [Source: src/lib/services/zapi.ts] — ZApiService, parseZApiCredentials, buildZApiUrl, buildZApiHeaders
- [Source: src/lib/services/base-service.ts] — ExternalService base class, request() com retry/timeout
- [Source: src/components/tracking/WhatsAppComposerDialog.tsx] — WhatsAppComposerDialogProps, onSend callback
- [Source: src/components/tracking/OpportunityPanel.tsx:159-162] — Badge placeholder "(WhatsApp em breve)"
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx:184-188] — Onde OpportunityPanel é renderizado
- [Source: src/types/database.ts] — WhatsAppMessage, WhatsAppMessageInsert, WhatsAppMessageUpdate
- [Source: src/types/tracking.ts:137-157] — LeadTracking + OpportunityLead (SEM leadId, tem leadEmail)
- [Source: src/actions/integrations.ts] — Padrão de server action com getCurrentUserProfile + createClient
- [Source: src/lib/supabase/tenant.ts] — getCurrentUserProfile() retorna { id, tenant_id, role }
- [Source: src/lib/crypto/encryption.ts] — decryptApiKey()
- [Source: supabase/migrations/00042_create_whatsapp_messages.sql] — Schema da tabela
- [Source: Z-API Docs] — https://developer.z-api.io/en/message/send-message-text (verificado 2026-02-10)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- ESLint: `set-state-in-effect` lint error fixed by replacing `useEffect` + `setState` with `useMemo` for merging sent emails
- ZApiService mock: `vi.fn().mockImplementation(() => ...)` não funciona como constructor — corrigido com `class MockZApiService`

### Completion Notes List
- Task 1: `ZApiSendResult` interface + `sendText()` method added to `ZApiService`. Uses `this.request()` from base class (retry/timeout included). Sends `delayTyping: 3` for natural typing simulation. 8 new tests (34 total in file).
- Task 2: Server action `sendWhatsAppMessage` with full flow: Zod validation → auth → Z-API credentials → resolve leadId by email → insert pending → send via Z-API → update sent/failed. 14 new tests.
- Task 3: `useWhatsAppSend` hook with `{ send, isSending, error, lastResult }`. Toast success/error via sonner. 9 new tests.
- Task 4: OpportunityPanel refactored — removed "(WhatsApp em breve)" badge, added per-lead WhatsApp button (MessageSquare icon), WhatsAppComposerDialog integration, "Enviado" indicator, Tooltip for disabled state, `campaignId`/`productId`/`sentLeadEmails` props. Analytics page updated to pass props. 32 tests (15 new for 11.4).
- Task 5: Full suite: 235 files, 4253 tests, 0 failures. ESLint clean. Exports verified.

### File List
- `src/lib/services/zapi.ts` — MODIFIED: Added `ZApiSendResult` interface + `sendText()` method
- `src/actions/whatsapp.ts` — NEW: Server action `sendWhatsAppMessage` (phone regex validation)
- `src/hooks/use-whatsapp-send.ts` — NEW: Hook for WhatsApp send state management
- `src/hooks/use-lead-tracking.ts` — MODIFIED: Added `useSentLeadEmails` hook (AC#7) + internal refactor for shared queryKey
- `src/components/tracking/OpportunityPanel.tsx` — MODIFIED: WhatsApp button + dialog integration + sent indicator
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — MODIFIED: Pass campaignId, campaignName, productId, sentLeadEmails to OpportunityPanel
- `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` — MODIFIED: Phone enrichment from leads table + sentLeadEmails query (AC#7) + tenant_id filter
- `__tests__/unit/lib/services/zapi.test.ts` — MODIFIED: Added 8 sendText tests
- `__tests__/unit/actions/whatsapp.test.ts` — NEW: 17 server action tests (incl. phone regex + max message)
- `__tests__/unit/hooks/use-whatsapp-send.test.ts` — NEW: 9 hook tests
- `__tests__/unit/hooks/use-lead-tracking.test.ts` — MODIFIED: Added 3 tests for useSentLeadEmails + backward compat
- `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` — MODIFIED: Added 15 tests for WhatsApp integration
- `__tests__/unit/app/api/campaigns/leads-tracking.test.ts` — NEW: 14 tests (phone enrichment + sentLeadEmails + auth)
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — MODIFIED: Added useSentLeadEmails mock

### Change Log
- 2026-02-10: Story 11.4 implementation complete — 89 story tests, 235 files, 4253 total tests passing
- 2026-02-10: Code review fixes — H1: AC7 sentLeadEmails backed by DB query (route + hook + page); H2: tenant_id filter on phone enrichment; M2: phone regex validation; M1/M3: File List updated with undocumented files
