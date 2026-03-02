# Story 13.8: Configuracoes de Monitoramento

Status: done

## Story

As a Marco (SDR),
I want configurar a frequencia do monitoramento e visualizar o uso atual na pagina de Settings,
so that eu tenha controle sobre como o sistema de monitoramento de leads opera e consiga planejar meus custos.

## Acceptance Criteria

1. Nova aba "Monitoramento" na pagina de Settings (`/settings/monitoring`) acessivel via `SettingsTabs`
2. Dropdown para frequencia: Semanal (padrao) / Quinzenal — salva na tabela `monitoring_configs`
3. Visualizacao read-only: "X/100 leads monitorados" — reutiliza endpoint `GET /api/leads/monitored-count`
4. Informacao da proxima execucao agendada (`next_run_at`) — formatada em PT-BR
5. Informacao da ultima execucao (`last_run_at`) com status de run (`run_status`: idle/running)
6. Estimativa de custo mensal baseado na quantidade de leads monitorados (formula: leads * custo Apify por lead * frequencia mensal)
7. API route `GET /api/settings/monitoring` para buscar config do tenant + `PATCH /api/settings/monitoring` para atualizar frequencia
8. Testes unitarios para componentes, hook e API routes

## Tasks / Subtasks

- [x] Task 1: Criar API routes para configuracao de monitoramento (AC: #2, #7)
  - [x] 1.1 Criar `src/app/api/settings/monitoring/route.ts` com handlers GET e PATCH
  - [x] 1.2 GET: buscar `monitoring_configs` por tenant (auth + admin check) — retornar config ou defaults se nao existir
  - [x] 1.3 PATCH: validar com Zod schema (`{ frequency: "weekly" | "biweekly" }`) e fazer upsert na `monitoring_configs`
  - [x] 1.4 Recalcular `next_run_at` ao mudar frequencia (usar `calculateNextRunAt` de `monitoring-utils.ts`)

- [x] Task 2: Criar hook `useMonitoringConfig` (AC: #2, #3, #4, #5, #6)
  - [x] 2.1 Criar `src/hooks/use-monitoring-config.ts`
  - [x] 2.2 `useQuery(["monitoring-config"])` para GET da config
  - [x] 2.3 `useMutation` para PATCH da frequencia com invalidacao de `["monitoring-config"]`
  - [x] 2.4 Reutilizar `useMonitoredCount()` existente de `use-lead-monitoring.ts` para dados de leads monitorados
  - [x] 2.5 Toast success/error (mesmo padrao do projeto)

- [x] Task 3: Adicionar aba "Monitoramento" ao SettingsTabs (AC: #1)
  - [x] 3.1 Editar `src/components/settings/SettingsTabs.tsx` — adicionar `{ id: "monitoring", label: "Monitoramento", href: "/settings/monitoring" }` ao array `tabs`

- [x] Task 4: Criar pagina e componente de configuracoes (AC: #1, #2, #3, #4, #5, #6)
  - [x] 4.1 Criar `src/app/(dashboard)/settings/monitoring/page.tsx` — page wrapper "use client"
  - [x] 4.2 Criar `src/components/settings/MonitoringSettings.tsx` — componente principal
  - [x] 4.3 Card "Configuracao": dropdown frequencia (Semanal/Quinzenal) com botao Salvar
  - [x] 4.4 Card "Status do Monitoramento": leads monitorados (X/100), status do run, ultima execucao, proxima execucao
  - [x] 4.5 Card "Estimativa de Custo": calculo baseado em leads monitorados * custo por lead * execucoes mensais
  - [x] 4.6 Skeleton loading state para todos os cards enquanto dados carregam
  - [x] 4.7 Empty state: se nenhum lead monitorado, mostrar mensagem orientando o usuario

- [x] Task 5: Testes unitarios (AC: #8)
  - [x] 5.1 Criar `__tests__/unit/app/api/settings/monitoring/route.test.ts` — testes GET (com config, sem config/defaults), PATCH (frequencia valida, invalida, admin check, recalculo next_run_at)
  - [x] 5.2 Criar `__tests__/unit/hooks/use-monitoring-config.test.ts` — testes do hook (fetch, mutation, toast, cache invalidation)
  - [x] 5.3 Criar `__tests__/unit/components/settings/MonitoringSettings.test.ts` — testes do componente (render cards, dropdown change, save, loading, empty state)
  - [x] 5.4 Atualizar testes do `SettingsTabs` se existentes (verificar que nova aba renderiza)
  - [x] 5.5 Validar que TODOS os testes existentes continuam passando: `npx vitest run`

## Dev Notes

### Decisao Arquitetural: Nova Aba em Settings vs Secao em Pagina Existente

**Abordagem escolhida: Nova aba `/settings/monitoring`**

Razoes:
- Padrao consistente com as demais secoes (integrações, KB, produtos, uso, equipe)
- Cada aba = 1 pagina = 1 componente principal — facil de manter
- `SettingsTabs` ja suporta N abas dinamicamente — basta adicionar ao array

**Modificacao no SettingsTabs:**
```typescript
// src/components/settings/SettingsTabs.tsx — ADICIONAR ao array tabs
const tabs: Tab[] = [
  { id: "integrations", label: "Integracoes", href: "/settings/integrations" },
  { id: "knowledge-base", label: "Base de Conhecimento", href: "/settings/knowledge-base" },
  { id: "products", label: "Produtos", href: "/settings/products" },
  { id: "usage", label: "Uso da API", href: "/settings/usage" },
  { id: "monitoring", label: "Monitoramento", href: "/settings/monitoring" }, // NOVO
  { id: "team", label: "Equipe", href: "/settings/team" },
];
```

**NOTA:** Posicionar ANTES de "Equipe" (ultimo item = sempre equipe, padrao de apps SaaS).

### API Route Pattern

**Arquivo:** `src/app/api/settings/monitoring/route.ts`

Seguir o mesmo padrao de `src/app/api/settings/integrations/route.ts`:
1. Auth check via `getCurrentUserProfile()`
2. Verificar role admin
3. Validacao Zod
4. Operacao no Supabase
5. Error handling com status codes apropriados

```typescript
// GET handler — buscar config
export async function GET() {
  // 1. Auth + admin check
  // 2. SELECT * FROM monitoring_configs WHERE tenant_id = profile.tenant_id
  // 3. Se nao existir: retornar defaults { frequency: "weekly", maxMonitoredLeads: 100, ... }
  // 4. Transformar com transformMonitoringConfigRow()
}

// PATCH handler — atualizar frequencia
const updateSchema = z.object({
  frequency: z.enum(["weekly", "biweekly"]),
});

export async function PATCH(request: Request) {
  // 1. Auth + admin check
  // 2. Validar body com updateSchema
  // 3. Upsert monitoring_configs (INSERT ON CONFLICT tenant_id UPDATE)
  // 4. Recalcular next_run_at com calculateNextRunAt(newFrequency, lastRunAt ?? new Date())
  // 5. Retornar config atualizada
}
```

**CRITICO — Upsert pattern:**
O `monitoring_configs` tem UNIQUE(tenant_id). Usar upsert do Supabase:
```typescript
const { data, error } = await supabase
  .from("monitoring_configs")
  .upsert({
    tenant_id: profile.tenant_id,
    frequency: validated.frequency,
    next_run_at: calculateNextRunAt(validated.frequency, lastRunAt ?? new Date()).toISOString(),
  }, { onConflict: "tenant_id" })
  .select()
  .single();
```

**NOTA:** A tabela pode nao ter registro para o tenant se ele nunca rodou o cron (o `process-batch` auto-cria). O GET DEVE retornar defaults quando nao encontrar registro. O PATCH DEVE fazer upsert para criar se nao existir.

### Hook useMonitoringConfig

**Arquivo:** `src/hooks/use-monitoring-config.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MonitoringConfig, MonitoringFrequency } from "@/types/monitoring";

interface MonitoringConfigResponse {
  config: MonitoringConfig;
  exists: boolean; // true se veio do DB, false se sao defaults
}

export function useMonitoringConfig() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<MonitoringConfigResponse>({
    queryKey: ["monitoring-config"],
    queryFn: async () => {
      const res = await fetch("/api/settings/monitoring");
      if (!res.ok) throw new Error("Erro ao carregar configuracoes");
      return res.json();
    },
  });

  const updateFrequency = useMutation({
    mutationFn: async (frequency: MonitoringFrequency) => {
      const res = await fetch("/api/settings/monitoring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency }),
      });
      if (!res.ok) throw new Error("Erro ao salvar configuracao");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring-config"] });
      toast.success("Configuracao de monitoramento atualizada");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    config: data?.config ?? null,
    configExists: data?.exists ?? false,
    isLoading,
    error,
    updateFrequency,
  };
}
```

**IMPORTANTE:** Reutilizar `useMonitoredCount()` de `src/hooks/use-lead-monitoring.ts` para o dado de "X/100 leads monitorados". NAO duplicar esse fetch.

### Componente MonitoringSettings

**Arquivo:** `src/components/settings/MonitoringSettings.tsx`

Layout com 3 Cards:

**Card 1 — Configuracao (editavel):**
- Label "Frequencia de verificacao"
- `Select` (shadcn/ui) com opcoes: Semanal / Quinzenal
- Botao "Salvar" (desabilitado se valor nao mudou)
- Usar `flex flex-col gap-2` para label+select (Tailwind v4 — NAO space-y-*)

**Card 2 — Status do Monitoramento (read-only):**
- "Leads monitorados: X/100" — usar `useMonitoredCount()` existente
- "Status: Ocioso / Em execucao" — de `config.runStatus` (idle/running)
- "Ultima execucao: DD/MM/YYYY HH:mm" — de `config.lastRunAt` formatado PT-BR
- "Proxima execucao: DD/MM/YYYY HH:mm" — de `config.nextRunAt` formatado PT-BR
- Se `lastRunAt` null: "Nenhuma execucao realizada"
- Se `nextRunAt` null: "Nao agendado"

**Card 3 — Estimativa de Custo (read-only, informativo):**
- Formula: `leads_monitorados * custo_por_lead * execucoes_por_mes`
- Custo por lead (Apify): ~$0.005 (5 posts/lead * $0.001/post, conforme `calculateApifyCost`)
- Execucoes por mes: weekly=4, biweekly=2
- Exemplo: 50 leads * $0.005 * 4 = $1.00/mes
- Texto informativo: "Estimativa baseada no preco publico do Apify (~$1 por 1.000 posts)"
- **NAO inclui custo OpenAI** — manter simples, so Apify que e o custo principal

**Empty State (nenhum lead monitorado):**
```
Nenhum lead esta sendo monitorado.
Acesse "Meus Leads" e ative o monitoramento nos leads desejados.
```

### Formatacao de Datas PT-BR

Usar `Intl.DateTimeFormat` nativo (sem biblioteca adicional):
```typescript
function formatDatePtBr(dateStr: string | null): string {
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

### calculateNextRunAt — Ja Existente

**Arquivo:** `src/lib/utils/monitoring-utils.ts`

```typescript
export function calculateNextRunAt(
  frequency: MonitoringFrequency,
  fromDate: Date
): Date {
  const next = new Date(fromDate);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else next.setDate(next.getDate() + 14);
  return next;
}
```

**CRITICO:** NAO reimplementar essa funcao — importar de `monitoring-utils.ts`.

### Padrao Admin Check

Reutilizar exatamente o mesmo padrao das demais rotas de settings:
```typescript
const profile = await getCurrentUserProfile();
if (!profile) {
  return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
}
if (profile.role !== "admin") {
  return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
}
```

### Project Structure Notes

- Alinhado com estrutura existente de Settings: 1 aba = 1 pasta em `settings/`
- Componente separado do page (page = wrapper fino, componente = logica)
- Hook dedicado com React Query (padrao do projeto)
- Nenhum conflito com componentes existentes — feature 100% aditiva

### References

- [Source: src/components/settings/SettingsTabs.tsx] — Array de tabs a editar
- [Source: src/app/(dashboard)/settings/layout.tsx] — Layout com AdminGuard
- [Source: src/app/(dashboard)/settings/usage/page.tsx] — Padrao de pagina de settings (referencia UI)
- [Source: src/types/monitoring.ts] — MonitoringConfig, MonitoringConfigRow, MonitoringFrequency, transformMonitoringConfigRow
- [Source: src/lib/utils/monitoring-utils.ts] — calculateNextRunAt (reutilizar)
- [Source: src/hooks/use-lead-monitoring.ts] — useMonitoredCount() (reutilizar para X/100)
- [Source: src/app/api/settings/integrations/route.ts] — Padrao de API route para settings (auth, admin, Zod)
- [Source: src/app/api/monitoring/process-batch/route.ts] — Auto-create config pattern (referencia)
- [Source: src/types/api-usage.ts] — calculateApifyCost para estimativa de custo
- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.8]
- [Source: _bmad-output/implementation-artifacts/13-7-envio-whatsapp-a-partir-do-insight.md] — Story anterior (context continuity)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum debug necessario — implementacao limpa sem erros.

### Completion Notes List

- Task 1: API route GET/PATCH criada seguindo padrao de integrations/route.ts. GET retorna defaults quando nao ha config (PGRST116). PATCH faz upsert com recalculo de next_run_at via calculateNextRunAt. 13 testes.
- Task 2: Hook useMonitoringConfig com useQuery + useMutation + toast success/error. Reutiliza useMonitoredCount() existente no componente. 7 testes.
- Task 3: Aba "Monitoramento" adicionada ao SettingsTabs antes de "Equipe" (padrao SaaS).
- Task 4: Pagina wrapper + componente MonitoringSettings com 3 Cards (Configuracao, Status, Custo), skeleton loading e empty state. Usa flex flex-col gap-2 (Tailwind v4). 21 testes.
- Task 5: 54 testes da story + 13 testes atualizados no SettingsTabs. Suite completa: 275 arquivos, 4985 testes, 0 falhas.
- Code Review Fix (H1): Adicionado error state ao MonitoringSettings — exibe mensagem de erro quando fetch de config ou count falha, em vez de UI enganosa.
- Code Review Fix (M1): Corrigido type mismatch — MonitoringConfig.id agora aceita `string | null` para suportar default config sem registro no DB.
- Code Review Fix (M2/M3): Adicionados 5 testes de interacao — Save button + Select change flow + error state rendering. Mock simplificado do Radix Select para JSDOM.
- Code Review Fix (L1): Constante COST_PER_LEAD agora derivada de SERVICE_COST_RATES.apify (api-usage.ts) em vez de hardcoded.
- Code Review Fix (L2): Removido setupMocks() redundante no teste "Salvando...".

### Change Log

- 2026-03-02: Implementacao completa da story 13.8 — todas as 5 tasks e subtasks concluidas.
- 2026-03-02: Code review adversarial — 6 issues encontradas (1H, 3M, 2L), todas corrigidas. Suite: 275 arquivos, 4990 testes, 0 falhas.

### File List

- src/app/api/settings/monitoring/route.ts (NOVO)
- src/hooks/use-monitoring-config.ts (NOVO)
- src/components/settings/MonitoringSettings.tsx (NOVO — CR: error state, SERVICE_COST_RATES import)
- src/app/(dashboard)/settings/monitoring/page.tsx (NOVO)
- src/components/settings/SettingsTabs.tsx (MODIFICADO — adicionada aba Monitoramento)
- src/types/monitoring.ts (MODIFICADO — CR: MonitoringConfig.id string | null)
- __tests__/unit/app/api/settings/monitoring/route.test.ts (NOVO)
- __tests__/unit/hooks/use-monitoring-config.test.ts (NOVO)
- __tests__/unit/components/settings/MonitoringSettings.test.tsx (NOVO — CR: +5 testes interacao/error)
- __tests__/unit/components/settings/SettingsTabs.test.tsx (MODIFICADO — 6 tabs, assertions atualizadas)
