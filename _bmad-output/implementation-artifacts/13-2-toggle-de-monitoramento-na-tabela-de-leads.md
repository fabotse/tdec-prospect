# Story 13.2: Toggle de Monitoramento na Tabela de Leads

Status: done

## Story

As a Marco (usuário de prospecção),
I want marcar leads específicos para monitoramento diretamente na tabela de leads,
so that eu escolha quais leads ICP vigiar sem sair do meu workflow atual.

## Acceptance Criteria

1. **Coluna "Monitorar"**: Coluna na tabela de leads (Meus Leads) com toggle/switch visual
2. **Ação em lote**: Selecionar múltiplos leads e ativar/desativar monitoramento via LeadSelectionBar
3. **Validação LinkedIn**: Apenas leads com `linkedinUrl` podem ser monitorados — tooltip explicativo se tentar monitorar lead sem LinkedIn
4. **Limite 100/tenant**: Máximo de 100 leads monitorados por tenant — toast de erro claro quando atingir limite
5. **Indicador visual**: Ícone/badge distinguindo leads monitorados na tabela
6. **Contador**: "X/100 leads monitorados" visível no header da tabela (CardHeader do MyLeadsPageContent)
7. **API individual**: `PATCH /api/leads/[leadId]/monitor` para toggle individual
8. **API bulk**: `PATCH /api/leads/bulk-monitor` para ação em lote
9. **Testes unitários**: APIs, hook, componentes de UI

## Tasks / Subtasks

- [x] Task 1: API Route individual — `PATCH /api/leads/[leadId]/monitor` (AC: #7, #3, #4)
  - [x]1.1 Criar `src/app/api/leads/[leadId]/monitor/route.ts`
  - [x]1.2 Zod schema: `{ isMonitored: z.boolean() }`
  - [x]1.3 UUID validation do leadId (mesmo padrão de `[leadId]/status/route.ts`)
  - [x]1.4 Auth check: `supabase.auth.getUser()`
  - [x]1.5 Se `isMonitored === true`: validar que lead tem `linkedin_url IS NOT NULL` (query `.select('linkedin_url').eq('id', leadId).single()`) — 400 se não tiver
  - [x]1.6 Se `isMonitored === true`: contar leads monitorados do tenant (`supabase.from('leads').select('id', { count: 'exact' }).eq('is_monitored', true)`) — verificar contra `monitoring_configs.max_monitored_leads` (default 100) — 409 se atingir limite
  - [x]1.7 Update: `supabase.from('leads').update({ is_monitored, updated_at }).eq('id', leadId).select().single()`
  - [x]1.8 Retornar `{ data: leadRow }` em sucesso

- [x] Task 2: API Route bulk — `PATCH /api/leads/bulk-monitor` (AC: #8, #3, #4)
  - [x]2.1 Criar `src/app/api/leads/bulk-monitor/route.ts`
  - [x]2.2 Zod schema: `{ leadIds: z.array(z.string().uuid()).min(1), isMonitored: z.boolean() }`
  - [x]2.3 Auth check
  - [x]2.4 Se `isMonitored === true`: filtrar leads sem `linkedin_url` — retornar lista de excluídos no response para feedback UI
  - [x]2.5 Se `isMonitored === true`: verificar limite (current count + eligible leads <= max) — 409 se exceder
  - [x]2.6 Update em batch apenas leads elegíveis: `.update({ is_monitored, updated_at }).in('id', eligibleIds)`
  - [x]2.7 Retornar `{ data: { updated: number, skippedNoLinkedin: string[], limitExceeded: boolean } }`

- [x] Task 3: Hook `useLeadMonitoring` (AC: #1, #2, #6)
  - [x]3.1 Criar `src/hooks/use-lead-monitoring.ts`
  - [x]3.2 `useToggleMonitoring()`: useMutation para PATCH individual — toast sucesso/erro
  - [x]3.3 `useBulkToggleMonitoring()`: useMutation para PATCH bulk — toast com contagem + skipped
  - [x]3.4 `useMonitoredCount()`: useQuery para GET count de leads monitorados + max limit — endpoint: `GET /api/leads/monitored-count`
  - [x]3.5 Invalidar queryKeys `["leads"]`, `["my-leads"]`, `["monitored-count"]` no onSuccess de todas as mutations

- [x] Task 4: API auxiliar — `GET /api/leads/monitored-count` (AC: #6)
  - [x]4.1 Criar `src/app/api/leads/monitored-count/route.ts`
  - [x]4.2 Query: `supabase.from('leads').select('id', { count: 'exact' }).eq('is_monitored', true)` para count atual
  - [x]4.3 Query: `supabase.from('monitoring_configs').select('max_monitored_leads').single()` — fallback 100 se não existir
  - [x]4.4 Retornar `{ data: { current: number, max: number } }`

- [x] Task 5: Coluna "Monitorar" no LeadTable (AC: #1, #3, #5)
  - [x]5.1 Adicionar prop `showMonitoring?: boolean` ao LeadTable
  - [x]5.2 Adicionar coluna `monitoring` no array COLUMNS: key `"monitoring"`, label `"Monitorar"`, ~80px, não-sortable
  - [x]5.3 Filtrar coluna via `showMonitoring` (mesmo padrão `showIcebreaker`)
  - [x]5.4 Criar célula `MonitoringToggleCell` inline ou como sub-componente:
    - Switch/toggle usando `<Switch>` do shadcn/ui
    - Se lead não tem `linkedinUrl`: switch desabilitado + `<TooltipProvider>/<Tooltip>` com texto "Lead sem LinkedIn não pode ser monitorado"
    - Se lead tem `linkedinUrl`: switch habilitado, `checked={lead.isMonitored}`, onClick chama `toggleMonitoring`
    - Loading state: spinner durante mutation (use `isPending` do mutation com leadId tracking)
  - [x]5.5 Passar `onToggleMonitoring` callback como prop do LeadTable (mesmo padrão: prop do componente pai)

- [x] Task 6: Contador no MyLeadsPageContent (AC: #6)
  - [x]6.1 Chamar `useMonitoredCount()` no MyLeadsPageContent
  - [x]6.2 Exibir no CardHeader ao lado do count de leads: `"• X/100 monitorados"` (mesmo estilo do `interestedCount`)
  - [x]6.3 data-testid: `"monitored-count"`

- [x] Task 7: Ação bulk no LeadSelectionBar (AC: #2)
  - [x]7.1 Adicionar prop `showMonitoring?: boolean` ao LeadSelectionBar
  - [x]7.2 Adicionar botão "Monitorar (N)" com ícone `Eye` do lucide-react
  - [x]7.3 Ao clicar: chamar `bulkToggleMonitoring({ leadIds, isMonitored: true })`
  - [x]7.4 No dropdown "Mais opções": item "Desativar Monitoramento" para bulk desativar
  - [x]7.5 Toast com feedback: "X leads monitorados" + se skipped: "Y leads sem LinkedIn ignorados"

- [x] Task 8: Integrar no MyLeadsPageContent (AC: #1, #2)
  - [x]8.1 Passar `showMonitoring` ao LeadTable
  - [x]8.2 Passar `showMonitoring` ao LeadSelectionBar
  - [x]8.3 Implementar callback `handleToggleMonitoring` para o toggle individual

- [x] Task 9: Testes unitários (AC: #9)
  - [x]9.1 `__tests__/unit/app/api/leads/[leadId]/monitor/route.test.ts` — individual: sucesso, sem linkedin, limite atingido, UUID inválido, não autenticado
  - [x]9.2 `__tests__/unit/app/api/leads/bulk-monitor/route.test.ts` — bulk: sucesso, parcial (sem linkedin), limite, validação
  - [x]9.3 `__tests__/unit/app/api/leads/monitored-count/route.test.ts` — count: sucesso, sem config (fallback 100)
  - [x]9.4 `__tests__/unit/hooks/use-lead-monitoring.test.ts` — mutations e query
  - [x]9.5 `__tests__/unit/components/leads/LeadTable.test.tsx` — adicionar testes para coluna monitoring: toggle, disabled sem linkedin, tooltip
  - [x]9.6 `__tests__/unit/components/leads/LeadSelectionBar.test.tsx` — adicionar testes para botão bulk monitor

## Dev Notes

### Contexto do Epic 13

Feature 100% aditiva — **NÃO modifica nenhuma funcionalidade existente**. Story 13.1 (done) criou toda a fundação: migration SQL (`is_monitored` na tabela `leads`, tabelas `lead_insights` e `monitoring_configs`), tipos TypeScript (`monitoring.ts`), e campo `isMonitored` no tipo `Lead`.

Esta story (13.2) adiciona a **UI de toggle** + **API routes** + **hook** para ativar/desativar monitoramento. Não cria nenhum componente de monitoramento avançado — apenas o mecanismo de marcar/desmarcar leads.

### Padrão de API Route — Copiar de `[leadId]/status/route.ts`

**Referência exata:** `src/app/api/leads/[leadId]/status/route.ts` (105 linhas)

```typescript
// Padrão de route params (Next.js 15)
interface RouteParams {
  params: Promise<{ leadId: string }>;
}

// Padrão de validação
const uuidSchema = z.string().uuid("ID de lead inválido");
const updateMonitoringSchema = z.object({
  isMonitored: z.boolean(),
});

// Padrão de auth check
const supabase = await createClient();
const { data: user } = await supabase.auth.getUser();
if (!user.user) { return 401; }

// Padrão de update
const { data, error } = await supabase
  .from("leads")
  .update({ is_monitored: isMonitored, updated_at: new Date().toISOString() })
  .eq("id", leadId)
  .select()
  .single();
```

**Imports obrigatórios:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
```

### Padrão de Hook — Copiar de `use-lead-status.ts`

**Referência exata:** `src/hooks/use-lead-status.ts` (99 linhas)

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Fetch function
async function toggleMonitoring(leadId: string, isMonitored: boolean): Promise<void> {
  const response = await fetch(`/api/leads/${leadId}/monitor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isMonitored }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar monitoramento");
  }
}

// Hook
export function useToggleMonitoring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, isMonitored }: { leadId: string; isMonitored: boolean }) =>
      toggleMonitoring(leadId, isMonitored),
    onSuccess: (_data, { isMonitored }) => {
      toast.success(isMonitored ? "Lead monitorado" : "Monitoramento desativado");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["monitored-count"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
```

### Padrão de Bulk Route — Copiar de `bulk-status/route.ts`

**Referência exata:** `src/app/api/leads/bulk-status/route.ts` (86 linhas)

Diferença principal: bulk-monitor precisa **filtrar leads sem linkedin_url** antes de atualizar e retornar os IDs que foram pulados.

```typescript
// Filtrar leads elegíveis
const { data: leadsWithLinkedin } = await supabase
  .from("leads")
  .select("id, linkedin_url")
  .in("id", leadIds);

const eligible = leadsWithLinkedin?.filter(l => l.linkedin_url !== null).map(l => l.id) ?? [];
const skipped = leadIds.filter(id => !eligible.includes(id));

// Verificar limite ANTES de update
const { count: currentCount } = await supabase
  .from("leads")
  .select("id", { count: "exact", head: true })
  .eq("is_monitored", true);

// Buscar max_monitored_leads da monitoring_configs
const { data: config } = await supabase
  .from("monitoring_configs")
  .select("max_monitored_leads")
  .single();
const maxLimit = config?.max_monitored_leads ?? 100;

if ((currentCount ?? 0) + eligible.length > maxLimit) {
  return 409 com mensagem clara sobre o limite
}
```

### Padrão de Coluna LeadTable — Copiar de `icebreaker`

**Referência:** `src/components/leads/LeadTable.tsx`

1. **COLUMNS array** (~linha 135-230): Adicionar entry para `monitoring`
2. **Props interface**: Adicionar `showMonitoring?: boolean`
3. **visibleColumns useMemo** (~linha 248-256): Filtrar como `showIcebreaker`
4. **Cell rendering**: Seguir padrão de `IcebreakerCell` para componente inline

```typescript
// No COLUMNS array
{
  key: "monitoring",
  label: "Monitorar",
  width: 80,
  sortable: false,
}

// No filtering
if (col.key === "monitoring" && !showMonitoring) return false;
```

### Componente Switch do shadcn/ui

O projeto já tem `@/components/ui/switch`. Usar:
```typescript
import { Switch } from "@/components/ui/switch";

<Switch
  checked={lead.isMonitored}
  onCheckedChange={(checked) => onToggleMonitoring(lead.id, checked)}
  disabled={!lead.linkedinUrl || isPending}
  aria-label={`Monitorar ${lead.firstName}`}
/>
```

**Tooltip para lead sem LinkedIn:**
```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

{!lead.linkedinUrl ? (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span><Switch disabled checked={false} /></span>
      </TooltipTrigger>
      <TooltipContent>Lead sem perfil LinkedIn</TooltipContent>
    </Tooltip>
  </TooltipProvider>
) : (
  <Switch checked={lead.isMonitored} ... />
)}
```

### Padrão LeadSelectionBar — Copiar de `showEnrichment`

**Referência:** `src/components/leads/LeadSelectionBar.tsx` (481 linhas)

1. Adicionar prop `showMonitoring?: boolean`
2. Adicionar botão condicional `{showMonitoring && (...)}`
3. Ícone: `Eye` do lucide-react (para ativar) ou usar `EyeOff` no dropdown para desativar
4. Padrão de toast + feedback idêntico ao enrichment

### Padrão de Integração MyLeadsPageContent

**Referência:** `src/components/leads/MyLeadsPageContent.tsx` (417 linhas)

1. Chamar `useMonitoredCount()` no topo do componente
2. Exibir contador no `CardHeader` (~linha 223-242, mesmo bloco do `interestedCount`)
3. Passar `showMonitoring` para `LeadTable` (~linha 281-291) e `LeadSelectionBar` (~linha 370-378)

### Validação do Limite — monitoring_configs

A tabela `monitoring_configs` tem `max_monitored_leads INTEGER NOT NULL DEFAULT 100`. Se não existir registro para o tenant, o default da tabela é 100 — mas em SQL o default só se aplica em INSERT. Para segurança, a API deve:
1. Tentar buscar config: `supabase.from('monitoring_configs').select('max_monitored_leads').single()`
2. Se retornar null/error (config não existe): usar fallback hardcoded de 100

### Padrão de Testes — Seguir Exatamente

**Framework:** Vitest. **ESLint:** no-console (sem console.log).

**Testes de API route:** seguir padrão de `__tests__/unit/app/api/leads/[leadId]/status/`
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock supabase
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
```

**Testes de hook:** seguir padrão de `__tests__/unit/hooks/use-lead-status.test.ts`

**Mock de Lead:** usar `createMockLead()` de `__tests__/helpers/mock-data.ts` — já tem `isMonitored: false`

### Project Structure Notes

| Acao | Arquivo | Descricao |
|------|---------|-----------|
| CRIAR | `src/app/api/leads/[leadId]/monitor/route.ts` | API: toggle individual com validacao LinkedIn + limite |
| CRIAR | `src/app/api/leads/bulk-monitor/route.ts` | API: toggle bulk com filtro LinkedIn + limite |
| CRIAR | `src/app/api/leads/monitored-count/route.ts` | API: count atual + max para contador UI |
| CRIAR | `src/hooks/use-lead-monitoring.ts` | Hook: useToggleMonitoring + useBulkToggleMonitoring + useMonitoredCount |
| MODIFICAR | `src/components/leads/LeadTable.tsx` | +coluna "Monitorar" com Switch, +prop showMonitoring, +MonitoringToggleCell |
| MODIFICAR | `src/components/leads/LeadSelectionBar.tsx` | +prop showMonitoring, +botao bulk monitor, +item dropdown desativar |
| MODIFICAR | `src/components/leads/MyLeadsPageContent.tsx` | +useMonitoredCount, +contador header, +showMonitoring props |
| CRIAR | `__tests__/unit/app/api/leads/[leadId]/monitor/route.test.ts` | Testes API individual |
| CRIAR | `__tests__/unit/app/api/leads/bulk-monitor/route.test.ts` | Testes API bulk |
| CRIAR | `__tests__/unit/app/api/leads/monitored-count/route.test.ts` | Testes API count |
| CRIAR | `__tests__/unit/hooks/use-lead-monitoring.test.ts` | Testes hook |
| MODIFICAR | `__tests__/unit/components/leads/LeadTable.test.tsx` | +testes coluna monitoring |
| MODIFICAR | `__tests__/unit/components/leads/LeadSelectionBar.test.tsx` | +testes botao bulk monitor |

### Guardrails — O Que NAO Fazer

- **NAO criar componentes de insight/dashboard** — story 13.6 fara isso
- **NAO modificar a tabela leads no SQL** — migration ja existe (story 13.1)
- **NAO criar edge functions** — story 13.3 fara isso
- **NAO modificar tipos em `src/types/lead.ts`** — `isMonitored` ja esta la
- **NAO modificar tipos em `src/types/monitoring.ts`** — ja estao completos
- **NAO usar `space-y-*`** em wrappers — usar `flex flex-col gap-*` (Tailwind v4)
- **NAO adicionar coluna de monitoring na pagina de busca Apollo** — apenas em Meus Leads
- **NAO modificar `use-my-leads.ts`** — a query ja retorna `is_monitored` do banco
- **NAO criar novas migrations** — schema ja esta pronto desde story 13.1
- **NAO hardcodar limite 100 no frontend** — buscar de `monitoring_configs` via API

### Previous Story Intelligence (Story 13.1)

**Learnings da 13.1:**
- Mock factory `createMockLead()` ja tem `isMonitored: false` — usar em todos os testes
- `LeadRow.is_monitored` ja existe — APIs retornam snake_case do banco
- Testes inline de `Lead` em `LeadTable.test.tsx`, `LeadSelectionBar.test.tsx`, `SegmentDropdown.test.tsx` ja foram atualizados com `isMonitored`
- Total antes desta story: **254 arquivos, 4680 testes, 0 falhas**

**Learnings da 12.8 (anterior no epic anterior):**
- Ordenacao server-side + client-side sao ambas necessarias com paginacao
- NÃO alterar queries existentes de leads

### Git Intelligence

Ultimo commit: `06bfd2a feat(story-13.1): schema de monitoramento e tipos + code review fixes`
Branch: `epic/12-melhorias-ux-produtividade` (nota: deveria ser `epic/13-*` mas seguir branch atual)

### References

- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.2] — AC originais
- [Source: _bmad-output/implementation-artifacts/13-1-schema-de-monitoramento-e-tipos.md] — Story anterior (fundacao)
- [Source: src/app/api/leads/[leadId]/status/route.ts] — Padrao de API route individual
- [Source: src/app/api/leads/bulk-status/route.ts] — Padrao de API route bulk
- [Source: src/hooks/use-lead-status.ts] — Padrao de hook mutations
- [Source: src/components/leads/LeadTable.tsx] — Componente alvo (coluna monitoring)
- [Source: src/components/leads/LeadSelectionBar.tsx] — Componente alvo (bulk action)
- [Source: src/components/leads/MyLeadsPageContent.tsx] — Pagina alvo (integracao)
- [Source: supabase/migrations/00043_add_lead_monitoring_schema.sql] — Schema existente
- [Source: src/types/monitoring.ts] — Tipos monitoring existentes
- [Source: src/types/lead.ts] — Lead.isMonitored ja definido

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Switch component (`@radix-ui/react-switch`) not installed — added via `npm install` + created `src/components/ui/switch.tsx`
- Supabase count query mock with `head: true` requires `.eq()` to resolve directly (not intermediate fn)

### Completion Notes List

- Task 1: API Route `PATCH /api/leads/[leadId]/monitor` — toggle individual com validação LinkedIn + limite monitoring_configs. 11 testes.
- Task 2: API Route `PATCH /api/leads/bulk-monitor` — toggle bulk com filtro LinkedIn + limite + skipped IDs. 10 testes.
- Task 3: Hook `useLeadMonitoring` — useToggleMonitoring, useBulkToggleMonitoring, useMonitoredCount. 9 testes.
- Task 4: API Route `GET /api/leads/monitored-count` — count atual + max config com fallback 100. 4 testes.
- Task 5: Coluna "Monitorar" no LeadTable — Switch toggle, disabled + tooltip sem LinkedIn, loading state. 7 testes.
- Task 6: Contador "X/100 monitorados" no CardHeader do MyLeadsPageContent via useMonitoredCount.
- Task 7: Botão "Monitorar (N)" no LeadSelectionBar + item "Desativar Monitoramento" no dropdown. 4 testes.
- Task 8: Integração completa no MyLeadsPageContent — props showMonitoring, callbacks, pendingMonitoringId.
- Task 9: Todos os testes unitários escritos e passando. 258 arquivos, 4725 testes, 0 falhas.

### Change Log

- 2026-02-27: Story 13.2 implementada — toggle de monitoramento na tabela de leads (9 tasks, 45 novos testes)
- 2026-02-27: Code review fixes — 8 issues (2H, 2M, 4L): H1/H2 limit check edge cases, M1 404 vs 400, M2 loading UX, L1 dropdown spec, L2 file list, L3/L4 edge case tests (+4 testes)

### File List

**Criados:**
- `src/app/api/leads/[leadId]/monitor/route.ts` — API toggle individual
- `src/app/api/leads/bulk-monitor/route.ts` — API toggle bulk
- `src/app/api/leads/monitored-count/route.ts` — API count + max
- `src/hooks/use-lead-monitoring.ts` — Hook com 3 exports
- `src/components/ui/switch.tsx` — Componente Switch do shadcn/ui (Radix)
- `__tests__/unit/app/api/leads/[leadId]/monitor/route.test.ts` — 11 testes
- `__tests__/unit/app/api/leads/bulk-monitor/route.test.ts` — 10 testes
- `__tests__/unit/app/api/leads/monitored-count/route.test.ts` — 4 testes
- `__tests__/unit/hooks/use-lead-monitoring.test.tsx` — 9 testes

**Modificados:**
- `src/components/leads/LeadTable.tsx` — +coluna monitoring, +MonitoringToggleCell (M2: Switch visível durante loading), +props showMonitoring/onToggleMonitoring/pendingMonitoringId
- `src/components/leads/LeadSelectionBar.tsx` — +botão Monitorar, +item fixo "Desativar Monitoramento" no dropdown (L1: task 7.4), +props showMonitoring/onBulkMonitor/isBulkMonitorPending
- `src/components/leads/MyLeadsPageContent.tsx` — +useMonitoredCount, +contador header, +handleToggleMonitoring, +handleBulkMonitor, +showMonitoring props
- `__tests__/unit/components/leads/LeadTable.test.tsx` — +7 testes monitoring
- `__tests__/unit/components/leads/LeadSelectionBar.test.tsx` — +6 testes bulk monitoring (L1: +2 testes dropdown fixo)
- `package.json` — +@radix-ui/react-switch dependency
- `package-lock.json` — lockfile atualizado
