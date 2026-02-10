# Story 11.5: Busca de Telefone no Fluxo de Leads Quentes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário da plataforma,
I want buscar o telefone de um lead quente diretamente do OpportunityPanel,
so that eu possa enviar WhatsApp sem sair do contexto de análise da campanha.

## Acceptance Criteria

1. **AC1: Botão "Buscar Telefone" no OpportunityPanel**
   - GIVEN um lead quente SEM telefone no OpportunityPanel
   - WHEN o lead é exibido na lista de leads quentes
   - THEN em vez do botão WhatsApp desabilitado com tooltip "Telefone não disponível", exibe um botão "Buscar Telefone" (ícone `Search` do Lucide)
   - AND o tooltip indica "Buscar telefone para enviar WhatsApp"
   - AND se o lead TEM telefone, exibe o botão WhatsApp normal (comportamento 11.4 inalterado)

2. **AC2: Dialog de busca de telefone**
   - GIVEN que o usuário clicou em "Buscar Telefone"
   - WHEN o dialog abre
   - THEN exibe informações do lead (nome, email) no header
   - AND exibe duas opções: "Buscar via SignalHire" (botão primário) e "Inserir manualmente" (link/botão secundário)
   - AND o dialog usa componentes shadcn/ui (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`)

3. **AC3: Busca via SignalHire**
   - GIVEN que o usuário clicou "Buscar via SignalHire"
   - WHEN o lookup é iniciado
   - THEN usa `usePhoneLookup` existente com `identifier: lead.leadEmail` e `leadId: lead.leadId` (se disponível)
   - AND exibe spinner com texto "Buscando telefone..." durante o polling (até 30s timeout)
   - AND em caso de **sucesso**: exibe telefone encontrado, salva no lead via `PATCH /api/leads/[leadId]/phone` (se leadId disponível), fecha dialog e atualiza estado local com o phone
   - AND em caso de **"não encontrado"**: exibe "Telefone não encontrado no SignalHire" e sugere "Inserir manualmente"
   - AND em caso de **erro**: exibe mensagem de erro em português (ex: "Créditos esgotados", "API key não configurada")

4. **AC4: Inserir telefone manualmente**
   - GIVEN que o usuário selecionou "Inserir manualmente" (ou após SignalHire falhar)
   - WHEN o campo de input aparece
   - THEN aceita formato telefônico com placeholder "+5511999999999"
   - AND valida com regex `/^\+?\d{10,15}$/` (mesma validação da story 11.4)
   - AND botão "Salvar" fica habilitado somente com telefone válido
   - AND ao confirmar: salva via `PATCH /api/leads/[leadId]/phone` (se leadId disponível), ou mantém telefone apenas na sessão local (se lead não existe no DB)
   - AND fecha dialog e atualiza estado local com o phone

5. **AC5: Após telefone obtido — habilitar WhatsApp**
   - GIVEN que um telefone foi obtido (via SignalHire ou manual)
   - WHEN o dialog fecha
   - THEN o lead no OpportunityPanel atualiza imediatamente para mostrar o telefone (link `tel:`)
   - AND o botão WhatsApp fica habilitado (substitui o botão "Buscar Telefone")
   - AND o telefone é passado corretamente ao `WhatsAppComposerDialog` quando o botão WhatsApp é clicado
   - AND se o telefone foi salvo no DB, a query de tracking (`leadTracking`) é invalidada para persistir na próxima carga

6. **AC6: leadId disponível na response de tracking**
   - GIVEN que a API de tracking já consulta `leads` table para enriquecer phone (linhas 87-110 da route)
   - WHEN a response é construída
   - THEN cada lead no array `data` inclui campo `leadId?: string` (o UUID do lead no DB, se existir)
   - AND o tipo `LeadTracking` em `src/types/tracking.ts` ganha campo `leadId?: string`
   - AND a query já existente (`leads WHERE email IN (...) AND tenant_id`) já retorna `id` — basta criar um `leadIdMap` (email→id) e incluir no mapeamento

7. **AC7: SignalHire não configurado**
   - GIVEN que a API key do SignalHire NÃO está configurada no tenant
   - WHEN o usuário clica "Buscar via SignalHire"
   - THEN o erro é capturado via try/catch e exibe mensagem "API key não configurada" (abordagem try/catch conforme Dev Notes)
   - AND a opção "Inserir manualmente" fica disponível como fallback principal

8. **AC8: Cobertura de testes unitários**
   - GIVEN todos os novos componentes e funções modificadas
   - WHEN os testes são executados via `npx vitest run`
   - THEN todos passam com cobertura adequada:
     - PhoneLookupDialog: render com/sem SignalHire config, modo SignalHire (loading, sucesso, erro, not_found), modo manual (validação, save), fechamento
     - OpportunityPanel: botão "Buscar Telefone" quando sem phone, botão WhatsApp quando tem phone, transição após phone obtido
     - Tracking route: leadId no response, mapeamento correto
     - Tipo LeadTracking: campo leadId opcional

## Tasks / Subtasks

- [x] Task 1: Adicionar `leadId` na response de tracking (AC: #6)
  - [x] 1.1 Criar `leadIdMap` (email→id) a partir da query `dbLeads` já existente em `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts`
  - [x] 1.2 Incluir `leadId: leadIdMap.get(lead.leadEmail) || undefined` no `mappedLeads`
  - [x] 1.3 Adicionar `leadId?: string` ao tipo `LeadTracking` em `src/types/tracking.ts`
  - [x] 1.4 Atualizar testes existentes em `__tests__/unit/app/api/campaigns/leads-tracking.test.ts` para verificar `leadId` no response
  - [x] 1.5 Atualizar testes existentes do OpportunityPanel para incluir `leadId` nos mocks de leads

- [x] Task 2: Criar componente `PhoneLookupDialog` (AC: #2, #3, #4, #7)
  - [x] 2.1 Criar `src/components/tracking/PhoneLookupDialog.tsx`
  - [x] 2.2 Implementar header com info do lead (nome, email)
  - [x] 2.3 Implementar modo "Buscar via SignalHire" usando `usePhoneLookup` existente com `identifier: leadEmail, leadId: leadId`
  - [x] 2.4 Implementar indicador de progresso durante polling ("Buscando telefone...")
  - [x] 2.5 Implementar tratamento de resultado: sucesso (exibir phone + fechar), not_found (sugerir manual), erro (mensagem PT)
  - [x] 2.6 Implementar modo "Inserir manualmente" com input validado (regex `/^\+?\d{10,15}$/`)
  - [x] 2.7 Implementar save manual via `fetch('/api/leads/${leadId}/phone', { method: 'PATCH', body: { phone } })` se leadId disponível
  - [x] 2.8 Implementar detecção de SignalHire config (desabilitar botão se não configurado) via check no `useIntegrationConfig` ou prop
  - [x] 2.9 Callback `onPhoneFound(phone: string)` para o componente pai
  - [x] 2.10 Exportar de `src/components/tracking/index.ts`
  - [x] 2.11 Escrever testes em `__tests__/unit/components/tracking/PhoneLookupDialog.test.tsx`

- [x] Task 3: Atualizar OpportunityPanel com fluxo de busca de telefone (AC: #1, #5)
  - [x] 3.1 Adicionar state `phoneLookupLead` para controlar abertura do PhoneLookupDialog
  - [x] 3.2 Adicionar state `localPhones` (`Map<string, string>`) para phones obtidos na sessão
  - [x] 3.3 Quando `!hasPhone`: render botão "Buscar Telefone" (ícone Search) em vez do botão WhatsApp desabilitado
  - [x] 3.4 Ao clicar: `setPhoneLookupLead(lead)` para abrir o dialog
  - [x] 3.5 Implementar callback `handlePhoneFound(phone)`: atualizar `localPhones`, fechar dialog, invalidar tracking query
  - [x] 3.6 Computar `effectivePhone = lead.phone || localPhones.get(lead.leadEmail)` para cada lead
  - [x] 3.7 Usar `effectivePhone` para decidir botão WhatsApp vs Buscar Telefone e para o WhatsAppComposerDialog
  - [x] 3.8 Atualizar/adicionar testes em `__tests__/unit/components/tracking/OpportunityPanel.test.tsx`

- [x] Task 4: Testes de integração e validação final (AC: #8)
  - [x] 4.1 Garantir que todos os testes novos e existentes passam (`npx vitest run`)
  - [x] 4.2 Verificar que exports de `src/components/tracking/index.ts` estão corretos
  - [x] 4.3 Validar que ESLint passa sem erros (no-console rule)

## Dev Notes

### CRITICO: OpportunityLead NÃO tem `leadId` — Resolver via Tracking Route

O tipo `OpportunityLead` (extends `LeadTracking`) NÃO possui `leadId`. A tracking route já consulta `leads` table para enriquecer phone. A solução é incluir `leadId` no response da mesma query:

```typescript
// src/app/api/campaigns/[campaignId]/leads/tracking/route.ts
// Já existe (linhas 93-109):
const { data: dbLeads } = await supabase
  .from("leads")
  .select("id, email, phone")  // id JÁ É SELECIONADO
  .in("email", emails)
  .eq("tenant_id", profile.tenant_id);

// ADICIONAR: leadIdMap (email → id)
const leadIdMap = new Map<string, string>();
if (dbLeads) {
  for (const row of dbLeads) {
    if (row.id && row.email) {
      leadIdMap.set(row.email, row.id);
    }
  }
}

// MODIFICAR mappedLeads (linha 131-136):
const mappedLeads = leads.map((lead) => ({
  ...lead,
  campaignId,
  phone: lead.phone || phoneMap.get(lead.leadEmail) || undefined,
  leadId: leadIdMap.get(lead.leadEmail) || undefined,  // NOVO
}));
```

### Tipo LeadTracking — Adicionar `leadId`

```typescript
// src/types/tracking.ts — MODIFICAR
export interface LeadTracking {
  leadEmail: string;
  campaignId: string;
  openCount: number;
  clickCount: number;
  hasReplied: boolean;
  lastOpenAt: string | null;
  events: CampaignEvent[];
  firstName?: string;
  lastName?: string;
  phone?: string;
  leadId?: string;  // NOVO — UUID do lead no DB (se existir)
}
```

### PhoneLookupDialog — Estrutura do Componente

```typescript
// src/components/tracking/PhoneLookupDialog.tsx

interface PhoneLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    leadEmail: string;
    firstName?: string;
    lastName?: string;
    leadId?: string;
  };
  onPhoneFound: (phone: string) => void;
}

// Estados internos:
// mode: 'choose' | 'signalhire' | 'manual'
// usePhoneLookup({ leadId, saveToDatabase: !!leadId, invalidateLeads: true })
```

### Fluxo de Dados Completo

```
Analytics Page
  └→ OpportunityPanel (leads incluem leadId agora)
       └→ [lead sem phone]
            └→ Botão "Buscar Telefone" (Search icon)
                 └→ PhoneLookupDialog abre
                      ├→ "Buscar via SignalHire"
                      │    └→ usePhoneLookup({ identifier: leadEmail, leadId })
                      │         ├→ POST /api/integrations/signalhire/lookup
                      │         ├→ GET  /api/integrations/signalhire/lookup/[id] (polling)
                      │         ├→ Sucesso → PATCH /api/leads/[leadId]/phone (se leadId)
                      │         └→ onPhoneFound(phone) → atualiza localPhones
                      └→ "Inserir manualmente"
                           └→ Input + validação regex
                                ├→ PATCH /api/leads/[leadId]/phone (se leadId)
                                └→ onPhoneFound(phone) → atualiza localPhones
       └→ [lead com phone (original ou localPhones)]
            └→ Botão WhatsApp → WhatsAppComposerDialog → envio
```

### OpportunityPanel — Gerenciamento de Phone Local

O `localPhones` state (`Map<string, string>`) permite que o lead ganhe telefone na sessão atual sem esperar o re-fetch da query de tracking:

```typescript
// Dentro do OpportunityPanel:
const [localPhones, setLocalPhones] = useState<Map<string, string>>(new Map());

// Para cada lead:
const effectivePhone = lead.phone || localPhones.get(lead.leadEmail);
const hasPhone = Boolean(effectivePhone);

// Callback do PhoneLookupDialog:
const handlePhoneFound = useCallback((phone: string) => {
  if (!phoneLookupLead) return;
  setLocalPhones(prev => new Map(prev).set(phoneLookupLead.leadEmail, phone));
  setPhoneLookupLead(null);
  // Invalidar tracking query para próximo refresh
  queryClient.invalidateQueries({ queryKey: ["leadTracking", campaignId] });
}, [phoneLookupLead, campaignId, queryClient]);
```

**IMPORTANTE**: Precisa importar `useQueryClient` do `@tanstack/react-query` no OpportunityPanel.

### usePhoneLookup — Já Disponível e Funcional

O hook `usePhoneLookup` em `src/hooks/use-phone-lookup.ts` já:
- Inicia lookup via `POST /api/integrations/signalhire/lookup`
- Faz polling via `GET /api/integrations/signalhire/lookup/[lookupId]` (interval 2s, timeout 30s)
- Salva phone no lead via `PATCH /api/leads/[leadId]/phone` (quando `saveToDatabase: true`)
- Invalida queries de leads (quando `invalidateLeads: true`)
- Exibe toasts de sucesso/erro via sonner

**Uso no PhoneLookupDialog:**
```typescript
const { lookupPhoneAsync, isLoading, error, reset } = usePhoneLookup({
  leadId: lead.leadId,
  saveToDatabase: Boolean(lead.leadId),
  invalidateLeads: Boolean(lead.leadId),
  showSuccessToast: false,  // Dialog mostra próprio feedback
  showErrorToast: false,    // Dialog mostra próprio feedback
});

// Chamar:
const result = await lookupPhoneAsync({ identifier: lead.leadEmail });
onPhoneFound(result.phone!);
```

### Infraestrutura Já Disponível (Reutilizar)

| Componente | Arquivo | Como Usar |
|-----------|---------|-----------|
| usePhoneLookup hook | `src/hooks/use-phone-lookup.ts` | Lookup completo: initiate + poll + save |
| SignalHire API POST | `src/app/api/integrations/signalhire/lookup/route.ts` | Rota já funcional |
| SignalHire API GET | `src/app/api/.../lookup/[lookupId]/route.ts` | Polling já funcional |
| Phone save API | `src/app/api/leads/[leadId]/phone/route.ts` | PATCH para salvar phone |
| SignalHireService | `src/lib/services/signalhire.ts` | Server-side lookup + polling |
| LeadTracking type | `src/types/tracking.ts:137-148` | Adicionar `leadId?: string` |
| Tracking route | `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` | Enriquecer com leadId |
| Dialog (shadcn) | `src/components/ui/dialog.tsx` | Componente base |
| Button/Input (shadcn) | `src/components/ui/button.tsx`, `input.tsx` | Componentes UI |
| Toast (sonner) | Lib sonner | `toast.success()` / `toast.error()` |
| Lucide icons | lucide-react | `Search`, `Phone`, `Loader2`, `Check` |

### Verificação de SignalHire Configurado

Existem duas abordagens para verificar se SignalHire está configurado:

**Opção A (Recomendada)**: Verificar via `useIntegrationConfig('signalhire')` existente em `src/hooks/use-integration-config.ts`. Se retorna dados, está configurado.

**Opção B**: Tentar o lookup e tratar o erro 401 "API key não configurada" — abordagem mais simples mas UX inferior (mostra erro depois de clicar).

Usar **Opção A**: passar `isSignalHireConfigured` como prop para o PhoneLookupDialog, verificando no OpportunityPanel.

Mas atenção: `useIntegrationConfig` faz request a `/api/settings/integrations`. Para evitar fetch desnecessário, considerar:
- Verificar no PhoneLookupDialog apenas quando ele abre (lazy check)
- Ou receber como prop do componente pai

**Abordagem mais simples e sem fetch extra**: No PhoneLookupDialog, simplesmente tentar o lookup. Se falhar com "API key não configurada", exibir mensagem e oferecer input manual. Isso evita complexidade de pré-check.

**DECISÃO**: Usar try/catch no lookup. Se `error.message` contém "não configurada" → exibir mensagem amigável + foco no input manual.

### Learnings das Stories Anteriores (Code Review)

- **11.4**: `OpportunityLead` não tem `leadId` — resolver via email (agora resolvido via tracking route)
- **11.4**: phone regex validation: `/^\+?\d{10,15}$/` — reutilizar a mesma
- **11.4**: `useMemo` para merge de sentEmails — mesmo padrão para `effectivePhone`
- **11.3**: Abort on close — fechar dialog cancela operação em progresso (aplicar no phone lookup)
- **4.4.2**: SignalHire callback é ASYNC — `usePhoneLookup` já gerencia o polling completo
- **4.4.2**: `requestId` vem no body (não header) — já corrigido no service
- **4.5**: `getLeadIdentifier` prioriza LinkedIn > email — no OpportunityPanel só temos email, o que é suficiente

### Anti-Patterns (NÃO FAZER)

- **NÃO** criar novo hook de phone lookup — reutilizar `usePhoneLookup` existente
- **NÃO** criar nova API route para lookup — usar as existentes (`/api/integrations/signalhire/lookup`)
- **NÃO** fazer fetch de configuração de integrações preemptivamente — usar try/catch
- **NÃO** usar `console.log` — ESLint no-console rule ativo
- **NÃO** usar `space-y-*` — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
- **NÃO** assumir que todos os leads do tracking existem no DB — `leadId` pode ser `undefined`
- **NÃO** bloquear input manual se lead não está no DB — phone funciona na sessão
- **NÃO** duplicar a lógica de polling — `usePhoneLookup.phoneLookupWithPolling` faz tudo
- **NÃO** usar `any` — tipagem estrita sempre
- **NÃO** usar `useEffect` para atualizar state derivado — usar `useMemo` (padrão 11.4)

### Project Structure Notes

- Componente novo: `src/components/tracking/PhoneLookupDialog.tsx` (NOVO)
- Componente modificado: `src/components/tracking/OpportunityPanel.tsx` (MODIFICAR — botão buscar + state localPhones)
- Tipo modificado: `src/types/tracking.ts` (MODIFICAR — `leadId?: string` em `LeadTracking`)
- API route modificada: `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` (MODIFICAR — leadIdMap no response)
- Testes novos: `__tests__/unit/components/tracking/PhoneLookupDialog.test.tsx` (NOVO)
- Testes modificados: `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` (MODIFICAR)
- Testes modificados: `__tests__/unit/app/api/campaigns/leads-tracking.test.ts` (MODIFICAR)
- Export: `src/components/tracking/index.ts` (MODIFICAR — adicionar PhoneLookupDialog)

### Git Intelligence

Branch: `epic/11-whatsapp-integration`
Commits recentes:
- `5bfe9cc` feat(story-11.4): envio individual WhatsApp + server action + code review fixes
- `2024b23` feat(story-11.3): WhatsApp composer dialog + AI generation + code review fixes
- `9ef5152` feat(story-11.2): schema WhatsApp messages + tipos TS + code review fixes
- `9898abb` feat(story-11.1): Z-API integration service + config + code review fixes
Padrão de commit: `feat(story-X.Y): descrição curta`

### Dependências Específicas

- **11.4 (done)**: OpportunityPanel com botão WhatsApp, `useWhatsAppSend`, `sentLeadEmails`
- **11.2 (done)**: Schema `whatsapp_messages` + tipos TS
- **4.4.2 (done)**: SignalHire callback architecture (Edge Function + DB polling)
- **4.5 (blocked mas código existe)**: `usePhoneLookup` hook + API routes + `savePhoneToLead`
- **10.5/10.7 (done)**: Tracking route com enrichment de phone via DB

### References

- [Source: src/components/tracking/OpportunityPanel.tsx] — Componente principal a modificar (botão WhatsApp desabilitado → buscar telefone)
- [Source: src/hooks/use-phone-lookup.ts] — Hook completo para lookup SignalHire com polling + save
- [Source: src/app/api/integrations/signalhire/lookup/route.ts] — POST para iniciar lookup
- [Source: src/app/api/integrations/signalhire/lookup/[lookupId]/route.ts] — GET para polling status
- [Source: src/app/api/leads/[leadId]/phone/route.ts] — PATCH para salvar phone no lead
- [Source: src/app/api/campaigns/[campaignId]/leads/tracking/route.ts:87-136] — Query já existente que enriquece phone e pode incluir leadId
- [Source: src/types/tracking.ts:137-157] — LeadTracking + OpportunityLead (adicionar leadId)
- [Source: src/types/signalhire.ts] — SignalHireLookupInitResponse, SignalHireLookupStatus
- [Source: src/lib/services/signalhire.ts] — SignalHireService (lookupPhone, getLookupStatus)
- [Source: src/types/lead.ts:129-162] — Lead interface com `id`, `email`, `phone`, `linkedinUrl`
- [Source: src/hooks/use-whatsapp-send.ts] — Hook de envio WhatsApp (reutilizado após phone obtido)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- CampaignAnalyticsPage.test.tsx falhava por falta de `QueryClientProvider` mock após adicionar `useQueryClient` no OpportunityPanel → corrigido adicionando mock de `@tanstack/react-query` no teste

### Completion Notes List

- Task 1: Criado `leadIdMap` (email→id) na tracking route, incluído `leadId` no `mappedLeads`, adicionado `leadId?: string` ao tipo `LeadTracking`. 3 novos testes de leadId enrichment (DB match, not in DB, mixed).
- Task 2: Criado `PhoneLookupDialog` com 3 modos (choose/signalhire/manual). Usa `usePhoneLookup` existente. SignalHire: loading spinner, success com confirm, not_found com sugestão manual, error com mensagem PT. Manual: input com regex `/^\+?\d{10,15}$/`, PATCH para DB se leadId. Reset completo ao fechar. 23 testes.
- Task 3: OpportunityPanel agora exibe botão "Buscar Telefone" (Search icon) em vez de WhatsApp desabilitado quando lead sem phone. State `localPhones` (Map) para phones obtidos na sessão. `effectivePhone` = lead.phone || localPhones. Após phone obtido: phone link aparece, botão WhatsApp habilitado, tracking query invalidada. 39 testes (13 novos para 11.5).
- Task 4: Full test suite 237/237 files, 4304/4304 testes passando. Exports corretos. Fix de regressão em CampaignAnalyticsPage mock.
- Decisão AC#7 (SignalHire não configurado): try/catch no lookup em vez de pre-check, conforme Dev Notes. Se erro "não configurada" → mensagem amigável + opção manual.

### Change Log

- 2026-02-10: Story 11.5 implementada — busca de telefone no fluxo de leads quentes
- 2026-02-10: Code Review — 6 issues encontrados (3M, 3L), todos corrigidos:
  - M1: Removido AbortController dead code (nunca wired)
  - M2: Adicionado toast.warning quando PATCH falha no save manual
  - M3: Adicionado teste para loading spinner no PhoneLookupDialog
  - L1: Removido else branch inalcançável no success handler
  - L2: Atualizado AC7 text para refletir abordagem try/catch
  - L3: Adicionado aria-label nos botões icon-only (acessibilidade)

### File List

- `src/types/tracking.ts` — MODIFICADO: adicionado `leadId?: string` ao `LeadTracking`
- `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` — MODIFICADO: `leadIdMap` + `leadId` no `mappedLeads`
- `src/components/tracking/PhoneLookupDialog.tsx` — NOVO: dialog de busca de telefone (SignalHire + manual)
- `src/components/tracking/OpportunityPanel.tsx` — MODIFICADO: botão "Buscar Telefone", `localPhones`, `effectivePhone`, `PhoneLookupDialog` integrado
- `src/components/tracking/index.ts` — MODIFICADO: export `PhoneLookupDialog`
- `__tests__/unit/app/api/campaigns/leads-tracking.test.ts` — MODIFICADO: 3 testes de leadId enrichment
- `__tests__/unit/components/tracking/PhoneLookupDialog.test.tsx` — NOVO: 25 testes (23 originais + 2 code review)
- `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` — MODIFICADO: 39 testes (13 novos para 11.5, ajustados existentes)
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — MODIFICADO: mock `useQueryClient`
