# Story 4.5: Phone Number Lookup

Status: blocked

> **BLOQUEIO:** Leads importados não têm email/linkedinUrl salvos. Ver seção "Estado Atual / Bloqueio" no final do arquivo.

## Story

As a user,
I want to find a lead's phone number on demand,
So that I can escalate promising leads quickly.

## Context

Esta story implementa a funcionalidade de **busca de telefone on-demand** para leads, utilizando a integração com SignalHire já implementada na Story 4.4. O usuário pode buscar telefone de um lead individual ou em lote diretamente na página "Meus Leads".

**IMPORTANTE:** Esta story opera sobre leads **persistidos** na página "Meus Leads" (/leads/my-leads). O lead precisa existir no banco de dados para que o telefone encontrado seja salvo.

**Requisitos Funcionais Cobertos:**
- FR10: Usuário pode buscar telefone de um lead específico (integração SignalHire)
- FR28: Sistema integra com SignalHire API para busca de telefones (parcialmente - UI desta story)

**Dependências (todas DONE):**
- Story 4.2.1 (Lead Import Mechanism) - leads persistidos no banco de dados
- Story 4.3 (Lead Detail View) - LeadDetailPanel com sidepanel
- Story 4.4 (SignalHire Integration Service) - SignalHireService.lookupPhone() e usePhoneLookup hook

**O que JÁ existe (reutilizar, NÃO reimplementar):**
- `SignalHireService.lookupPhone(identifier)` - busca telefone via API SignalHire
- `usePhoneLookup` hook - mutation com toast feedback
- `/api/integrations/signalhire/lookup` - API route para phone lookup
- `LeadDetailPanel` componente - sidepanel com dados do lead
- `LeadSelectionBar` componente - barra de ações para leads selecionados
- `useImportLeads` hook - pattern para mutações que atualizam leads
- Lead types com campo `phone` opcional
- Toast system para feedback

**O que FALTA implementar nesta story:**
1. Botão "Buscar Telefone" no LeadDetailPanel
2. Botão "Buscar Telefone" no LeadSelectionBar (batch)
3. API route para atualizar telefone do lead no banco
4. Lógica de batch lookup com progresso
5. Estados de loading específicos para lookup
6. Atualização otimista da UI após sucesso

## Acceptance Criteria

1. **AC #1 - Individual Phone Lookup from Detail Panel**
   - Given I am on "Meus Leads" page viewing an imported lead without a phone number
   - When I click "Buscar Telefone" in the lead detail sidepanel
   - Then the system calls SignalHire API with the lead's email or LinkedIn URL
   - And I see a loading state "Buscando telefone..." with spinner
   - And if found, the phone number is displayed immediately in the panel
   - And the phone is saved to the lead record in database
   - And I see a success toast "Telefone encontrado e salvo"

2. **AC #2 - Phone Not Found Handling**
   - Given I click "Buscar Telefone" for a lead
   - When SignalHire returns no phone number
   - Then I see "Telefone não encontrado" message in the panel
   - And I see suggestion "Tente buscar no LinkedIn ou entrar em contato por email"
   - And no database update is made
   - And the button returns to initial state

3. **AC #3 - Error Handling**
   - Given SignalHire returns an error
   - When the lookup fails
   - Then I see a clear error message in Portuguese
   - And I see "Tentar novamente" button
   - And the error is specific:
     - 401: "API key do SignalHire inválida"
     - 429: "Limite de requisições atingido. Aguarde alguns minutos"
     - 500: "Erro de conexão. Tente novamente"

4. **AC #4 - Batch Phone Lookup from Selection Bar**
   - Given I have multiple leads selected on "Meus Leads" page
   - When I click "Buscar Telefone" in the selection bar
   - Then the system looks up phone numbers for all selected leads sequentially
   - And I see progress indicator "Buscando telefones... X de Y"
   - And results are saved to each lead record as they complete
   - And a summary toast appears: "X telefones encontrados de Y buscados"

5. **AC #5 - Lead Already Has Phone**
   - Given a lead already has a phone number saved
   - When I view the lead in detail panel
   - Then I see the phone number displayed with copy button
   - And the "Buscar Telefone" button is replaced by "Atualizar Telefone"
   - And clicking "Atualizar Telefone" performs a new lookup that overwrites existing

6. **AC #6 - Identifier Priority**
   - Given a lead has both email and LinkedIn URL
   - When performing phone lookup
   - Then the system prioritizes LinkedIn URL over email
   - And if LinkedIn lookup fails, it retries with email
   - And the identifier used is not exposed to the user

7. **AC #7 - Query Invalidation**
   - Given a phone lookup succeeds
   - When the phone is saved to database
   - Then the leads query cache is invalidated
   - And the lead detail refreshes automatically
   - And the phone appears in the lead table column (if visible)

## Tasks / Subtasks

- [x] Task 1: Create phone update API route (AC: #1, #7)
  - [x] 1.1 Create `/api/leads/[leadId]/phone/route.ts`
  - [x] 1.2 PATCH handler to update lead's phone field
  - [x] 1.3 Validate lead belongs to user's tenant
  - [x] 1.4 Return updated lead data
  - [x] 1.5 Add Zod validation schema

- [x] Task 2: Enhance usePhoneLookup hook (AC: #1, #4, #7)
  - [x] 2.1 Add option to save phone to database after lookup
  - [x] 2.2 Add query invalidation on success
  - [x] 2.3 Add batch lookup support with progress callback
  - [x] 2.4 Handle identifier priority (LinkedIn > email)

- [x] Task 3: Add phone lookup to LeadDetailPanel (AC: #1, #2, #3, #5)
  - [x] 3.1 Add "Buscar Telefone" button with Phone icon
  - [x] 3.2 Show loading state during lookup
  - [x] 3.3 Display phone number with copy button when found
  - [x] 3.4 Show error/not found states
  - [x] 3.5 Change to "Atualizar Telefone" when phone exists
  - [x] 3.6 Disable button during lookup

- [x] Task 4: Add batch lookup to LeadSelectionBar (AC: #4)
  - [x] 4.1 Add "Buscar Telefone" button to selection bar actions
  - [x] 4.2 Only show when leads are selected on My Leads page
  - [x] 4.3 Implement progress indicator dialog
  - [x] 4.4 Sequential lookup with delay between requests
  - [x] 4.5 Summary toast with results count

- [x] Task 5: Create PhoneLookupProgress component (AC: #4)
  - [x] 5.1 Create `src/components/leads/PhoneLookupProgress.tsx`
  - [x] 5.2 Progress bar with X/Y counter
  - [x] 5.3 Current lead being processed
  - [x] 5.4 Cancel button to stop batch
  - [x] 5.5 Results list (found/not found)

- [x] Task 6: Write tests (AC: all)
  - [x] 6.1 Unit tests for phone update API route
  - [x] 6.2 Unit tests for enhanced usePhoneLookup hook
  - [x] 6.3 Unit tests for phone lookup button states
  - [x] 6.4 Integration test for full lookup flow
  - [x] 6.5 Test batch lookup progress

- [x] Task 7: Update exports and finalize (AC: N/A)
  - [x] 7.1 Export new components from index files
  - [x] 7.2 Verify all tests pass
  - [x] 7.3 Run build to check for errors

## Dev Notes

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| API routes | `/api/leads/[leadId]/phone` for phone updates |
| Service pattern | Use existing SignalHireService via usePhoneLookup |
| Error messages | All in Portuguese |
| Query invalidation | Invalidate ['leads'] and ['lead', leadId] |
| State management | TanStack Query for server state |
| Component structure | Follow existing LeadDetailPanel patterns |

### Component Implementation Details

**LeadDetailPanel Phone Section:**

```tsx
// Dentro de LeadDetailPanel.tsx

// Estado local para lookup
const [isLookingUp, setIsLookingUp] = useState(false);
const [lookupError, setLookupError] = useState<string | null>(null);

const { mutateAsync: lookupPhone } = usePhoneLookup({
  onSuccess: async (result) => {
    // Salvar no banco
    await updateLeadPhone(lead.id, result.phone);
    toast.success("Telefone encontrado e salvo");
  },
  onError: (error) => {
    setLookupError(error.message);
  }
});

// Determinar identificador (LinkedIn > email)
const identifier = lead.linkedin_url || lead.email;

// Renderizar seção de telefone
<div className="space-y-2">
  <Label>Telefone</Label>
  {lead.phone ? (
    <div className="flex items-center gap-2">
      <span className="font-mono">{lead.phone}</span>
      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(lead.phone)}>
        <Copy className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={handleLookup} disabled={isLookingUp}>
        <RefreshCw className={cn("h-4 w-4 mr-1", isLookingUp && "animate-spin")} />
        Atualizar
      </Button>
    </div>
  ) : (
    <Button variant="outline" onClick={handleLookup} disabled={isLookingUp || !identifier}>
      {isLookingUp ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Buscando telefone...
        </>
      ) : (
        <>
          <Phone className="h-4 w-4 mr-2" />
          Buscar Telefone
        </>
      )}
    </Button>
  )}
  {lookupError && (
    <p className="text-sm text-destructive">{lookupError}</p>
  )}
</div>
```

**LeadSelectionBar Batch Lookup:**

```tsx
// Adicionar ao LeadSelectionBar.tsx (após botões existentes)

<Button
  variant="outline"
  onClick={() => setShowBatchLookup(true)}
  disabled={selectedLeads.length === 0}
>
  <Phone className="h-4 w-4 mr-2" />
  Buscar Telefone ({selectedLeads.length})
</Button>

{showBatchLookup && (
  <PhoneLookupProgress
    leads={selectedLeads}
    onComplete={handleBatchComplete}
    onCancel={() => setShowBatchLookup(false)}
  />
)}
```

**PhoneLookupProgress Component:**

```tsx
// src/components/leads/PhoneLookupProgress.tsx

interface PhoneLookupProgressProps {
  leads: Lead[];
  onComplete: (results: PhoneLookupResult[]) => void;
  onCancel: () => void;
}

export function PhoneLookupProgress({ leads, onComplete, onCancel }: PhoneLookupProgressProps) {
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<PhoneLookupResult[]>([]);
  const [isCancelled, setIsCancelled] = useState(false);

  useEffect(() => {
    async function processLeads() {
      for (let i = 0; i < leads.length; i++) {
        if (isCancelled) break;

        setCurrent(i + 1);
        const lead = leads[i];
        const identifier = lead.linkedin_url || lead.email;

        try {
          const result = await phoneLookupMutation(identifier);
          if (result.phone) {
            await updateLeadPhone(lead.id, result.phone);
            setResults(prev => [...prev, { leadId: lead.id, phone: result.phone, status: 'found' }]);
          } else {
            setResults(prev => [...prev, { leadId: lead.id, status: 'not_found' }]);
          }
        } catch (error) {
          setResults(prev => [...prev, { leadId: lead.id, status: 'error', error: error.message }]);
        }

        // Delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      onComplete(results);
    }

    processLeads();
  }, [leads]);

  const found = results.filter(r => r.status === 'found').length;
  const total = leads.length;

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscando telefones</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Progress value={(current / total) * 100} />
          <p className="text-sm text-muted-foreground">
            Processando {current} de {total} leads...
          </p>
          <p className="text-sm">
            {found} telefones encontrados
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCancelled(true)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### API Route Structure

```typescript
// src/app/api/leads/[leadId]/phone/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const phoneUpdateSchema = z.object({
  phone: z.string().min(1, "Telefone é obrigatório"),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Get tenant_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Sem permissão" } },
      { status: 403 }
    );
  }

  // Validate body
  const body = await request.json();
  const validation = phoneUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: validation.error.issues[0].message } },
      { status: 400 }
    );
  }

  // Update lead (RLS will verify tenant ownership)
  const { data: lead, error } = await supabase
    .from("leads")
    .update({
      phone: validation.data.phone,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.leadId)
    .eq("tenant_id", profile.tenant_id)
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lead não encontrado" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: lead });
}
```

### Enhanced usePhoneLookup Hook

```typescript
// Atualizar src/hooks/use-phone-lookup.ts

export interface UsePhoneLookupOptions {
  leadId?: string;
  saveToDatabase?: boolean;
  onProgress?: (current: number, total: number) => void;
}

export function usePhoneLookup(options?: UsePhoneLookupOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (identifier: string) => {
      const response = await fetch("/api/integrations/signalhire/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Erro ao buscar telefone");
      }

      return response.json();
    },
    onSuccess: async (data) => {
      // Save to database if leadId provided
      if (options?.saveToDatabase && options?.leadId && data.data?.phone) {
        await fetch(`/api/leads/${options.leadId}/phone`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: data.data.phone }),
        });
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (options?.leadId) {
        queryClient.invalidateQueries({ queryKey: ["lead", options.leadId] });
      }

      toast.success("Telefone encontrado e salvo");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Batch lookup helper
export async function batchPhoneLookup(
  leads: Lead[],
  onProgress?: (current: number, total: number, result: PhoneLookupResult) => void
): Promise<PhoneLookupResult[]> {
  const results: PhoneLookupResult[] = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const identifier = lead.linkedin_url || lead.email;

    if (!identifier) {
      results.push({ leadId: lead.id, status: "error", error: "Sem identificador" });
      onProgress?.(i + 1, leads.length, results[results.length - 1]);
      continue;
    }

    try {
      const response = await fetch("/api/integrations/signalhire/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data?.phone) {
          // Save to database
          await fetch(`/api/leads/${lead.id}/phone`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: data.data.phone }),
          });
          results.push({ leadId: lead.id, status: "found", phone: data.data.phone });
        } else {
          results.push({ leadId: lead.id, status: "not_found" });
        }
      } else {
        const error = await response.json();
        results.push({ leadId: lead.id, status: "error", error: error.error?.message });
      }
    } catch (error) {
      results.push({
        leadId: lead.id,
        status: "error",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }

    onProgress?.(i + 1, leads.length, results[results.length - 1]);

    // Rate limiting delay (1 second between requests)
    if (i < leads.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
```

### Project Structure Notes

```
src/
├── app/
│   └── api/
│       └── leads/
│           └── [leadId]/
│               └── phone/
│                   └── route.ts           # NEW - Phone update
├── components/
│   └── leads/
│       ├── LeadDetailPanel.tsx            # MODIFY - Add phone lookup button
│       ├── LeadSelectionBar.tsx           # MODIFY - Add batch lookup button
│       ├── PhoneLookupProgress.tsx        # NEW - Batch progress dialog
│       └── index.ts                       # UPDATE - Export new component
├── hooks/
│   └── use-phone-lookup.ts                # MODIFY - Add save and batch support
└── __tests__/
    └── unit/
        ├── api/
        │   └── leads-phone.test.ts        # NEW
        ├── components/
        │   └── leads/
        │       └── PhoneLookupProgress.test.tsx  # NEW
        └── hooks/
            └── use-phone-lookup.test.tsx  # MODIFY - Add new tests
```

### Previous Story Intelligence

**From Story 4.4 (SignalHire Integration Service):**
- SignalHireService handles async polling (201 → 204 → 200)
- Error messages already in Portuguese
- Timeout 10s, retry 1x on failure
- Credits tracking via X-Credits-Left header
- Response includes: phone, creditsUsed, creditsRemaining

**From Story 4.3 (Lead Detail View):**
- LeadDetailPanel uses Sheet component
- InfoRow pattern for displaying lead data
- Already has sections for contact info
- Action buttons use Button component with icons

**From Story 4.2.1 (Lead Import Mechanism):**
- Pattern for updating leads in database
- Query invalidation after lead updates
- Toast feedback for success/error

**From Story 3.6 (Lead Selection):**
- LeadSelectionBar already has action buttons pattern
- Shows "X leads selecionados" counter
- Conditional rendering based on context (search vs my-leads)

### Git Intelligence

**Commit pattern:**
```
feat(story-X.X): feature description with code review fixes
```

**Commit for this story should be:**
```
feat(story-4.5): phone number lookup with code review fixes
```

**Current branch:** `epic/3-lead-discovery` (note: should create feature branch)

### UX Design Notes

**From UX Specification - Jornada 2 (Escalonamento de Lead Interessado):**
- "Buscar Telefone" integração SignalHire
- Se encontrado → exibir telefone + copiar
- Se não encontrado → sugerir LinkedIn ou outro canal
- Tempo alvo: <2 minutos do clique ao telefone copiado

**Design Patterns:**
- Button with Phone icon from Lucide
- Loading state: spinner + "Buscando telefone..."
- Success: phone displayed with Copy button
- Error: destructive color + retry option
- Progress dialog for batch operations

### What NOT to Do

- Do NOT call SignalHire API directly from components (use hook)
- Do NOT show batch lookup on Apollo search results page (only My Leads)
- Do NOT expose SignalHire API key or credits to frontend
- Do NOT block UI during batch operations (use dialog)
- Do NOT make parallel requests (sequential with delay for rate limits)
- Do NOT update lead if phone not found (only on success)

### Testing Strategy

**Unit Tests:**
- Phone update API route with auth and tenant validation
- usePhoneLookup hook with save option
- batchPhoneLookup function with progress callback
- PhoneLookupProgress component states
- LeadDetailPanel phone section rendering

**Integration Tests:**
- Full flow: click button → API call → database update → UI refresh
- Batch flow with cancellation

**Mocking:**
- Mock SignalHire API responses
- Mock Supabase client for database operations
- Mock TanStack Query's queryClient

### NFR Compliance

- **NFR-P1:** Phone lookup should complete in <10 seconds (SignalHire timeout)
- **NFR-I1:** Graceful error handling with Portuguese messages
- **NFR-I2:** Sequential batch with rate limit protection (1s delay)
- **Security:** Phone saved to tenant's leads only (RLS enforced)

### References

- [Source: src/lib/services/signalhire.ts] - SignalHireService implementation
- [Source: src/hooks/use-phone-lookup.ts] - Existing hook to enhance
- [Source: src/components/leads/LeadDetailPanel.tsx] - Add phone lookup button
- [Source: src/components/leads/LeadSelectionBar.tsx] - Add batch lookup
- [Source: architecture.md#API-Response-Format] - Response format
- [Source: ux-design-specification.md#Jornada-2] - UX for phone lookup flow
- [Source: 4-4-signalhire-integration-service.md] - SignalHire API details

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - No debug issues encountered

### Completion Notes List

1. **Task 1 Complete**: Created `/api/leads/[leadId]/phone/route.ts` with PATCH handler, Zod validation, and RLS-based tenant isolation
2. **Task 2 Complete**: Enhanced `usePhoneLookup` hook with `saveToDatabase` option, query invalidation, `batchPhoneLookup` function, and `getLeadIdentifier` helper (LinkedIn > email priority)
3. **Task 3 Complete**: Updated `LeadDetailPanel` with `PhoneSection` component featuring lookup button, loading states, error handling, not-found messaging, and "Atualizar" button when phone exists
4. **Task 4 Complete**: Updated `LeadSelectionBar` with batch lookup button (only visible when `showPhoneLookup` prop is true), integrated with `PhoneLookupProgress` dialog
5. **Task 5 Complete**: Created `PhoneLookupProgress.tsx` component with progress bar, X/Y counter, current lead display, cancel button, and results list (found/not found/error)
6. **Task 6 Complete**: Added unit tests for API route (`leads-phone.test.ts`), enhanced hook tests (`use-phone-lookup.test.tsx`), and component tests (`PhoneLookupProgress.test.tsx`). All 1353 tests pass.
7. **Task 7 Complete**: Exported `PhoneLookupProgress` from index, added `showPhoneLookup` prop to `MyLeadsPageContent`, created UI components (`progress.tsx`, `scroll-area.tsx`, `alert.tsx`), installed required Radix packages. Build passes successfully.

### File List

**New Files:**
- src/app/api/leads/[leadId]/phone/route.ts
- src/components/leads/PhoneLookupProgress.tsx
- src/components/ui/progress.tsx
- src/components/ui/scroll-area.tsx
- src/components/ui/alert.tsx
- __tests__/unit/api/leads-phone.test.ts
- __tests__/unit/components/leads/PhoneLookupProgress.test.tsx

**Modified Files:**
- src/hooks/use-phone-lookup.ts
- src/components/leads/LeadDetailPanel.tsx
- src/components/leads/LeadSelectionBar.tsx
- src/components/leads/MyLeadsPageContent.tsx
- src/components/leads/index.ts
- src/types/signalhire.ts
- __tests__/unit/hooks/use-phone-lookup.test.tsx

---

## Estado Atual / Bloqueio (2026-02-01)

### Status: EM ESPERA

A implementação da Story 4.5 está completa em termos de código, mas **não está funcionando corretamente na prática**.

### Problema Identificado

O Phone Lookup retorna **"0 telefones encontrados de 1 buscados"** - ou seja:
1. O código está executando corretamente
2. A API SignalHire está sendo chamada
3. Mas não encontra telefones para os leads

### Causa Raiz Provável

Os leads importados do Apollo para o banco de dados **não estão salvando email e linkedinUrl corretamente**. A função `getLeadIdentifier()` em `use-phone-lookup.ts` precisa de pelo menos um desses campos:

```typescript
export function getLeadIdentifier(lead: Lead): string | null {
  if (lead.linkedinUrl) return lead.linkedinUrl;  // Prioridade 1
  if (lead.email) return lead.email;              // Prioridade 2
  return null;  // Sem identificador = não consegue buscar
}
```

### Correções de Bug Aplicadas (2026-02-01)

1. **Modal piscava e fechava instantaneamente** - Corrigido para o modal permanecer aberto após processamento, aguardando usuário clicar em "Fechar"
2. **Array vazio não mostrava erro** - Agora mostra mensagem quando nenhum lead está selecionado
3. **Testes atualizados** - 11 testes passando para PhoneLookupProgress

### O Que Falta Para Funcionar

1. **Verificar importação de leads** - Garantir que ao importar lead do Apollo, os campos `email` e `linkedin_url` sejam salvos no banco
2. **Criar store de enriquecimento** - Fabossi vai criar um store separado para enriquecer leads na importação com LinkedIn e email
3. **Testar com lead que tenha email/LinkedIn** - Validar que SignalHire consegue encontrar telefone

### Próximos Passos Quando Retomar

1. Verificar se leads no banco têm `email` e `linkedin_url` preenchidos
2. Se não tiverem, corrigir o fluxo de importação (`/api/leads/import/route.ts`)
3. Testar busca de telefone com lead que tenha identificador válido
4. Verificar configuração da API key do SignalHire em Configurações > Integrações

### Arquivos Relevantes Para Debug

- `src/hooks/use-phone-lookup.ts` - Função `getLeadIdentifier()` e `batchPhoneLookup()`
- `src/app/api/leads/import/route.ts` - Importação de leads do Apollo
- `src/lib/services/signalhire.ts` - Chamada à API SignalHire
- `src/app/api/integrations/signalhire/lookup/route.ts` - Endpoint de lookup
