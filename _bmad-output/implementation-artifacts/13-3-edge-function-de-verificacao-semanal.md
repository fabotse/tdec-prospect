# Story 13.3: Edge Function de Verificação Semanal

Status: done

## Story

As a sistema,
I want executar automaticamente uma verificação semanal dos posts dos leads monitorados,
so that posts novos sejam detectados sem intervenção do usuário.

## Acceptance Criteria

1. Supabase Edge Function `monitor-leads` criada em `supabase/functions/monitor-leads/index.ts`
2. Cron configurado para execução semanal (padrão) ou quinzenal (configurável via `monitoring_configs`)
3. Busca todos os leads com `is_monitored = true` por tenant
4. Para cada lead: chama Apify REST API (mesma API/actor do Icebreaker — `Wpp1BZ6yGWjySadk3`)
5. Compara posts retornados com `linkedin_posts_cache` do lead — identifica posts novos por `postUrl`
6. Atualiza `linkedin_posts_cache` com os posts mais recentes
7. Processamento em batches de 5 (mesmo padrão do Icebreaker) para respeitar rate limits
8. Logging de execução na tabela `api_usage_logs` (custo, duração, posts encontrados)
9. Atualiza `last_run_at` e `next_run_at` na `monitoring_configs`
10. Posts novos detectados são inseridos em `lead_insights` com `status='new'` (pipeline 13.4 processará depois)
11. Edge Function respeita timeout do Supabase — processa um batch de 5 leads por invocação, pg_cron chama a cada 5 minutos
12. Testes unitários para lógica de detecção de posts novos e batch processing

## Tasks / Subtasks

- [x] Task 1: Migration 00044 — Colunas de tracking de run (AC: #9, #11)
  - [x] 1.1 Criar `supabase/migrations/00044_monitoring_run_tracking.sql`
  - [x] 1.2 ALTER `monitoring_configs`: ADD `run_status TEXT NOT NULL DEFAULT 'idle'` CHECK (`run_status IN ('idle', 'running')`)
  - [x] 1.3 ALTER `monitoring_configs`: ADD `run_cursor UUID DEFAULT NULL` (último lead processado)
  - [x] 1.4 COMMENT: run_cursor referencia lead.id para paginação cursor-based entre invocações

- [x] Task 2: Utility functions — Lógica pura de detecção (AC: #5, #12)
  - [x] 2.1 Criar `src/lib/utils/monitoring-utils.ts`
  - [x] 2.2 Função `detectNewPosts(cachedPosts, freshPosts)` — retorna posts novos por comparação de `postUrl`
  - [x] 2.3 Função `calculateNextRunAt(frequency, fromDate)` — calcula próxima execução (weekly = +7 dias, biweekly = +14 dias)
  - [x] 2.4 Tipo `MonitoringBatchResult` para retorno do processamento

- [x] Task 3: API Route `POST /api/monitoring/process-batch` (AC: #3, #4, #5, #6, #7, #8, #9, #10, #11)
  - [x] 3.1 Criar `src/app/api/monitoring/process-batch/route.ts`
  - [x] 3.2 Auth: validar header `Authorization: Bearer <MONITORING_CRON_SECRET>` — 401 se inválido
  - [x] 3.3 Usar `createClient()` com service role para queries sem RLS
  - [x] 3.4 Buscar monitoring_configs com `next_run_at <= now()` ou `run_status = 'running'` (retomar run em progresso)
  - [x] 3.5 Se `run_status = 'idle'` e `next_run_at <= now()`: iniciar novo run (`run_status = 'running'`, `run_cursor = NULL`)
  - [x] 3.6 Se `run_status = 'idle'` e `next_run_at > now()`: retornar 200 `{ status: 'no_run_due' }`
  - [x] 3.7 Buscar 5 leads: `is_monitored = true AND (id > run_cursor OR run_cursor IS NULL)` ORDER BY id ASC LIMIT 5
  - [x] 3.8 Se nenhum lead encontrado: run completo — atualizar `run_status='idle'`, `run_cursor=NULL`, `last_run_at=now()`, `next_run_at=calculateNextRunAt(frequency)`
  - [x] 3.9 Para cada lead no batch: buscar Apify key do tenant, chamar Apify, detectar posts novos, atualizar cache, inserir insights, logar uso
  - [x] 3.10 Atualizar `run_cursor` para o último lead.id processado
  - [x] 3.11 Retornar `{ status: 'batch_processed', leadsProcessed, newPostsFound, cursor }`

- [x] Task 4: Edge Function `monitor-leads` (AC: #1, #2)
  - [x] 4.1 Criar `supabase/functions/monitor-leads/index.ts`
  - [x] 4.2 `Deno.serve()` handler — chama API route `/api/monitoring/process-batch`
  - [x] 4.3 Ler `NEXT_APP_URL` e `MONITORING_CRON_SECRET` de `Deno.env`
  - [x] 4.4 POST para `${NEXT_APP_URL}/api/monitoring/process-batch` com header `Authorization: Bearer ${secret}`
  - [x] 4.5 Retornar resultado da API route (pass-through)
  - [x] 4.6 CORS headers para compatibilidade com pg_cron/pg_net

- [x] Task 5: pg_cron scheduling SQL (AC: #2)
  - [x] 5.1 Criar `supabase/migrations/00045_schedule_monitor_leads_cron.sql`
  - [x] 5.2 Habilitar extensions: `pg_cron`, `pg_net`
  - [x] 5.3 Armazenar secrets no Vault: `project_url`, `anon_key` ou `service_role_key`
  - [x] 5.4 Criar schedule: `cron.schedule('monitor-leads-cron', '*/5 * * * *', ...)` — a cada 5 minutos
  - [x] 5.5 Documentar: o cron roda a cada 5 min, mas a API route só processa quando `next_run_at <= now()`

- [x] Task 6: Testes unitários (AC: #12)
  - [x] 6.1 Criar `__tests__/unit/lib/utils/monitoring-utils.test.ts` — detectNewPosts, calculateNextRunAt
  - [x] 6.2 Criar `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` — fluxo completo da API route
  - [x] 6.3 Testar: novo run (idle → running), batch processing, run completion, no leads, Apify failure graceful
  - [x] 6.4 Testar: post detection (novos, duplicados, cache vazio, nenhum novo)
  - [x] 6.5 Testar: auth validation (sem header, header inválido)
  - [x] 6.6 Testar: sem monitoring_config existente (criar default)

## Dev Notes

### Decisão Arquitetural: Hybrid Edge Function → API Route

**Problema:** Edge Functions rodam em Deno. O `ApifyService` usa `apify-client` (npm/Node.js) e `decryptApiKey` usa `crypto.createDecipheriv` (Node.js). Reimplementar em Deno é complexo e duplica código.

**Solução:** Edge Function como thin cron trigger que chama uma API Route Next.js (Node.js) onde toda a lógica existe. Isso reutiliza: `ApifyService`, `decryptApiKey`, `logApiUsage`, todo o ecossistema de testes Vitest.

**Fluxo:**
```
pg_cron (*/5 * * * *) → pg_net → Edge Function → fetch(NEXT_APP_URL/api/monitoring/process-batch) → Lógica Node.js
```

### Gestão de Timeout — Batch-per-Invocation

**Problema:** 100 leads × ~30-60s Apify por batch de 5 = 10-20 min. Edge Functions limitadas a ~60-150s.

**Solução:** Processar 5 leads por invocação. pg_cron chama a cada 5 min. Progress tracking via `run_cursor` em `monitoring_configs`.

**Ciclo completo:** 100 leads / 5 por batch = 20 invocações × 5 min = ~100 min para processar todos os leads de um tenant. Para semanal, isso é aceitável.

**Estado da máquina de estados:**
```
idle (next_run_at > now)  → aguardando
idle (next_run_at <= now) → iniciar run: set run_status='running', run_cursor=NULL
running (leads restantes) → processar batch de 5, atualizar run_cursor
running (sem leads)       → run completo: set run_status='idle', atualizar timestamps
```

### API Route — Padrão de Auth Interna (Cron Secret)

**Referência:** NÃO usar `supabase.auth.getUser()` — esta route é chamada por cron, não por usuário.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js"; // CLIENT DIRETO, não @/lib/supabase/server

const MONITORING_SECRET = process.env.MONITORING_CRON_SECRET;

export async function POST(req: NextRequest) {
  // Auth: validar secret do cron
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${MONITORING_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Usar service role key para bypass RLS (multi-tenant)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ... lógica de processamento ...
}
```

**IMPORTANTE:** Usar `createClient` direto do `@supabase/supabase-js` com SERVICE_ROLE_KEY, NÃO `@/lib/supabase/server` (que usa cookies de usuário). A route precisa de acesso multi-tenant sem RLS.

### Fluxo de Processamento por Batch

```typescript
// 1. Buscar config do tenant
const { data: configs } = await supabase
  .from("monitoring_configs")
  .select("*")
  .or("run_status.eq.running,and(run_status.eq.idle,next_run_at.lte.now())") // running OU idle com run due
  .limit(1)
  .single();

// Se idle e next_run_at <= now → iniciar run
if (config.run_status === "idle") {
  await supabase.from("monitoring_configs")
    .update({ run_status: "running", run_cursor: null, updated_at: new Date().toISOString() })
    .eq("id", config.id);
}

// 2. Buscar batch de 5 leads
let query = supabase
  .from("leads")
  .select("id, linkedin_url, linkedin_posts_cache, first_name, last_name, tenant_id")
  .eq("tenant_id", config.tenant_id)
  .eq("is_monitored", true)
  .order("id", { ascending: true })
  .limit(5);

if (config.run_cursor) {
  query = query.gt("id", config.run_cursor);
}

const { data: leads } = await query;

// 3. Se nenhum lead → run completo
if (!leads || leads.length === 0) {
  const nextRunAt = calculateNextRunAt(config.frequency, new Date());
  await supabase.from("monitoring_configs").update({
    run_status: "idle",
    run_cursor: null,
    last_run_at: new Date().toISOString(),
    next_run_at: nextRunAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", config.id);
  return { status: "run_completed" };
}

// 4. Processar batch com Promise.allSettled
const results = await Promise.allSettled(
  leads.map(lead => processLead(lead, apifyKey, supabase, config.tenant_id))
);

// 5. Atualizar cursor
const lastLeadId = leads[leads.length - 1].id;
await supabase.from("monitoring_configs")
  .update({ run_cursor: lastLeadId, updated_at: new Date().toISOString() })
  .eq("id", config.id);
```

### Processamento de Lead Individual

```typescript
async function processLead(lead, apifyKey, supabase, tenantId) {
  const startTime = Date.now();

  // 1. Chamar ApifyService (reutilizar instância existente)
  const apifyService = new ApifyService();
  const result = await apifyService.fetchLinkedInPosts(apifyKey, lead.linkedin_url, 3);

  if (!result.success) {
    // Logar falha mas NÃO parar o batch
    await logApiUsage({
      tenantId,
      serviceName: "apify",
      requestType: "monitoring_posts_fetch",
      leadId: lead.id,
      status: "failed",
      errorMessage: result.error,
      durationMs: Date.now() - startTime,
    });
    return { leadId: lead.id, success: false, error: result.error };
  }

  // 2. Detectar posts novos
  const cachedPosts = (lead.linkedin_posts_cache as LinkedInPostsCache)?.posts ?? [];
  const newPosts = detectNewPosts(cachedPosts, result.posts);

  // 3. Atualizar cache
  const updatedCache: LinkedInPostsCache = {
    posts: result.posts,
    fetchedAt: result.fetchedAt,
    profileUrl: result.profileUrl,
  };

  await supabase.from("leads").update({
    linkedin_posts_cache: updatedCache,
    updated_at: new Date().toISOString(),
  }).eq("id", lead.id);

  // 4. Inserir insights para posts novos (se houver)
  if (newPosts.length > 0) {
    const insights = newPosts.map(post => ({
      tenant_id: tenantId,
      lead_id: lead.id,
      post_url: post.postUrl,
      post_text: post.text,
      post_published_at: post.publishedAt || null,
      status: "new" as const,
    }));
    await supabase.from("lead_insights").insert(insights);
  }

  // 5. Logar uso
  await logApiUsage({
    tenantId,
    serviceName: "apify",
    requestType: "monitoring_posts_fetch",
    leadId: lead.id,
    postsFetched: result.posts.length,
    estimatedCost: calculateApifyCost(result.posts.length),
    status: "success",
    durationMs: Date.now() - startTime,
    metadata: { newPostsFound: newPosts.length, linkedinUrl: lead.linkedin_url },
  });

  return { leadId: lead.id, success: true, newPostsFound: newPosts.length };
}
```

### Detecção de Posts Novos — Lógica Pura

**Arquivo:** `src/lib/utils/monitoring-utils.ts`

```typescript
import type { LinkedInPost } from "@/types/apify";
import type { MonitoringFrequency } from "@/types/monitoring";

/**
 * Detecta posts novos comparando URLs. Um post é novo se seu postUrl
 * NÃO existe na lista de posts cacheados.
 */
export function detectNewPosts(
  cachedPosts: LinkedInPost[],
  freshPosts: LinkedInPost[]
): LinkedInPost[] {
  const cachedUrls = new Set(cachedPosts.map(p => p.postUrl));
  return freshPosts.filter(p => p.postUrl && !cachedUrls.has(p.postUrl));
}

/**
 * Calcula próxima data de execução baseado na frequência.
 */
export function calculateNextRunAt(
  frequency: MonitoringFrequency,
  fromDate: Date = new Date()
): Date {
  const next = new Date(fromDate);
  next.setDate(next.getDate() + (frequency === "weekly" ? 7 : 14));
  return next;
}
```

### Obtenção da Apify API Key — Mesmo Padrão do Icebreaker

**Referência:** `src/app/api/leads/enrich-icebreaker/route.ts` linhas 117-138

```typescript
import { decryptApiKey } from "@/lib/crypto/encryption";

async function getApifyKey(supabase, tenantId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("service_name", "apify")
    .single();

  if (error || !data) return null;

  try {
    return decryptApiKey(data.encrypted_key);
  } catch {
    return null;
  }
}
```

**IMPORTANTE:** Se o tenant não tem Apify key configurada, pular TODOS os leads do tenant e logar aviso. NÃO é erro — o tenant simplesmente não configurou a integração.

### Edge Function — Código Completo

**Arquivo:** `supabase/functions/monitor-leads/index.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const nextAppUrl = Deno.env.get("NEXT_APP_URL");
    const cronSecret = Deno.env.get("MONITORING_CRON_SECRET");

    if (!nextAppUrl || !cronSecret) {
      console.error("Missing environment variables: NEXT_APP_URL or MONITORING_CRON_SECRET");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const response = await fetch(`${nextAppUrl}/api/monitoring/process-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("monitor-leads error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
```

### pg_cron Scheduling — Migration SQL

**Arquivo:** `supabase/migrations/00045_schedule_monitor_leads_cron.sql`

```sql
-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- NOTA: Os secrets devem ser configurados MANUALMENTE no Supabase Dashboard:
-- 1. SQL Editor → select vault.create_secret('https://SEU-PROJETO.supabase.co', 'supabase_url');
-- 2. SQL Editor → select vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key');
-- A migration apenas cria o schedule.

-- Schedule: a cada 5 minutos, invocar a Edge Function
SELECT cron.schedule(
  'monitor-leads-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
           || '/functions/v1/monitor-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Para desabilitar: SELECT cron.unschedule('monitor-leads-cron');
```

### Variáveis de Ambiente Necessárias

**No `.env` do Next.js (Vercel):**
```
MONITORING_CRON_SECRET=<gerar com: openssl rand -hex 32>
```

**No Supabase (Edge Function env):**
```
NEXT_APP_URL=https://seu-dominio.vercel.app   (ou http://localhost:3000 em dev)
MONITORING_CRON_SECRET=<mesmo valor do .env>
```

**No Supabase Vault (via SQL Editor):**
```sql
SELECT vault.create_secret('https://SEU-REF.supabase.co', 'supabase_url');
SELECT vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key');
```

### Padrão de Testes — Seguir Exatamente

**Framework:** Vitest. **ESLint:** no-console.

**Testes de monitoring-utils (pure functions):**
```typescript
import { describe, it, expect } from "vitest";
import { detectNewPosts, calculateNextRunAt } from "@/lib/utils/monitoring-utils";

describe("detectNewPosts", () => {
  it("retorna posts com URLs novas", () => { ... });
  it("retorna array vazio se todos posts já existem no cache", () => { ... });
  it("retorna todos posts se cache está vazio", () => { ... });
  it("ignora posts sem postUrl", () => { ... });
});

describe("calculateNextRunAt", () => {
  it("adiciona 7 dias para weekly", () => { ... });
  it("adiciona 14 dias para biweekly", () => { ... });
});
```

**Testes da API route:**
```typescript
vi.mock("@/lib/crypto/encryption", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/lib/services/apify", () => ({
  ApifyService: vi.fn().mockImplementation(() => ({
    fetchLinkedInPosts: vi.fn(),
  })),
}));
vi.mock("@/lib/services/usage-logger", () => ({
  logApiUsage: vi.fn(),
  calculateApifyCost: vi.fn(),
}));
```

**Mock de Supabase:** Usar padrão centralizado de `__tests__/helpers/mock-supabase.ts`. O mock precisa suportar queries com `.or()`, `.gt()`, `.order()`, `.limit()`.

### Imports Existentes Reutilizados

| Import | De | Para |
|--------|----|------|
| `ApifyService` | `src/lib/services/apify.ts` | Chamada Apify para posts LinkedIn |
| `decryptApiKey` | `src/lib/crypto/encryption.ts` | Descriptografar API key do tenant |
| `logApiUsage`, `calculateApifyCost` | `src/lib/services/usage-logger.ts` | Logging na `api_usage_logs` |
| `LinkedInPost`, `FetchLinkedInPostsResult` | `src/types/apify.ts` | Tipos de posts LinkedIn |
| `LinkedInPostsCache` | `src/types/lead.ts` | Cache de posts no lead |
| `MonitoringConfig`, `MonitoringFrequency` | `src/types/monitoring.ts` | Config de monitoramento |
| `LeadInsightRow` | `src/types/monitoring.ts` | Inserção de insights |

### Project Structure Notes

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| CRIAR | `supabase/migrations/00044_monitoring_run_tracking.sql` | ALTER monitoring_configs + run_status/run_cursor |
| CRIAR | `supabase/migrations/00045_schedule_monitor_leads_cron.sql` | pg_cron + pg_net schedule |
| CRIAR | `src/lib/utils/monitoring-utils.ts` | detectNewPosts + calculateNextRunAt (puras) |
| CRIAR | `src/app/api/monitoring/process-batch/route.ts` | API Route: lógica de processamento completa |
| CRIAR | `supabase/functions/monitor-leads/index.ts` | Edge Function: thin cron trigger |
| CRIAR | `__tests__/unit/lib/utils/monitoring-utils.test.ts` | Testes funções puras |
| CRIAR | `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` | Testes API route |

### Guardrails — O Que NÃO Fazer

- **NÃO implementar filtro de relevância** — story 13.4 fará isso
- **NÃO gerar sugestões de abordagem** — story 13.5 fará isso
- **NÃO criar UI de insights** — story 13.6 fará isso
- **NÃO modificar `ApifyService`** — reutilizar tal qual
- **NÃO modificar `decryptApiKey`** — reutilizar tal qual
- **NÃO modificar `logApiUsage`** — reutilizar tal qual
- **NÃO modificar tabelas `leads`, `lead_insights`, `monitoring_configs`** (exceto a migration 00044 para colunas de tracking)
- **NÃO reimplementar crypto em Deno** — a Edge Function apenas chama a API Route (Node.js)
- **NÃO usar `@/lib/supabase/server`** na API Route — usar `createClient` direto com SERVICE_ROLE_KEY
- **NÃO usar `supabase.auth.getUser()`** — route é chamada por cron, sem sessão de usuário
- **NÃO processar múltiplos tenants por invocação** — 1 tenant, 1 batch de 5 leads
- **NÃO alterar queries existentes de leads** (use-my-leads, etc.)
- **NÃO usar `space-y-*`** — este story é backend-only, mas se houver qualquer UI, usar `flex flex-col gap-*`

### Types Necessários — Adicionar em monitoring.ts

```typescript
// Adicionar ao src/types/monitoring.ts
export type MonitoringRunStatus = "idle" | "running";

// Atualizar MonitoringConfigRow para incluir novos campos
export interface MonitoringConfigRow {
  // ... campos existentes ...
  run_status: MonitoringRunStatus;
  run_cursor: string | null;
}

// Atualizar MonitoringConfig (camelCase)
export interface MonitoringConfig {
  // ... campos existentes ...
  runStatus: MonitoringRunStatus;
  runCursor: string | null;
}
```

**NOTA:** Atualizar `transformMonitoringConfigRow()` para incluir `runStatus` e `runCursor`.

### Logging — requestType para Monitoramento

Usar `requestType: "monitoring_posts_fetch"` para distinguir de `"linkedin_posts_fetch"` (Icebreaker). O campo `metadata` deve incluir `{ source: "monitoring", newPostsFound: N }`.

**NOTA:** O service_name CHECK constraint em `api_usage_logs` já inclui `'apify'`. O `request_type` é TEXT livre — nenhuma migration necessária.

### Previous Story Intelligence (Story 13.2)

**Learnings da 13.2:**
- Mock factory `createMockLead()` já tem `isMonitored: false` — usar em testes
- `LeadRow.is_monitored` retorna boolean do banco
- `linkedin_posts_cache` é JSONB no banco, tipo `LinkedInPostsCache | null` no TypeScript
- Switch component instalado: `@radix-ui/react-switch`
- Total antes desta story: **258 arquivos, 4729 testes, 0 falhas**

**Learnings da 13.1:**
- Migration 00043 criou schema completo: `lead_insights`, `monitoring_configs`, `is_monitored`
- Tipos em `src/types/monitoring.ts`: `LeadInsight`, `MonitoringConfig`, transforms
- RLS policies em todas as tabelas novas

### Git Intelligence

Último commit: `b07bbd9 feat(story-13.2): toggle de monitoramento na tabela de leads + code review fixes`
Branch: `epic/12-melhorias-ux-produtividade`

Padrão de commit: `feat(story-13.3): edge function de verificação semanal`

### Edge Cases a Tratar

1. **Tenant sem Apify key:** Pular tenant, logar warning, NÃO marcar run como completo (tentar novamente quando key existir? Ou marcar completo e pular)
   - **Decisão:** Marcar run como completo mas logar aviso. Se não tem key, não pode processar.
2. **Tenant sem monitoring_configs:** Se leads monitorados existem mas config não existe, criar config default (frequency='weekly', next_run_at=now) e processar.
3. **Lead sem linkedin_url:** Impossível chegar aqui (story 13.2 valida no toggle), mas defensivamente pular e logar.
4. **Apify falha para um lead:** Promise.allSettled garante que os outros leads do batch continuam. Logar falha individual.
5. **linkedin_posts_cache é null:** Tratar como cache vazio — todos os posts retornados são "novos".
6. **Post sem postUrl:** Ignorar na detecção (não pode comparar sem URL).
7. **Múltiplos tenants com runs pendentes:** Processar apenas o PRIMEIRO tenant encontrado por invocação.

### Deploy

```bash
# Edge Function
npx supabase functions deploy monitor-leads --no-verify-jwt

# Variáveis da Edge Function (Supabase Dashboard → Edge Functions → Secrets)
NEXT_APP_URL=https://seu-dominio.vercel.app
MONITORING_CRON_SECRET=<secret>

# Migrations
npx supabase db push
```

### References

- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.3] — AC originais
- [Source: _bmad-output/implementation-artifacts/13-2-toggle-de-monitoramento-na-tabela-de-leads.md] — Story anterior
- [Source: _bmad-output/implementation-artifacts/13-1-schema-de-monitoramento-e-tipos.md] — Fundação de schema e tipos
- [Source: src/lib/services/apify.ts] — ApifyService para reutilizar
- [Source: src/lib/crypto/encryption.ts] — decryptApiKey para reutilizar
- [Source: src/lib/services/usage-logger.ts] — logApiUsage + calculateApifyCost
- [Source: src/types/apify.ts] — LinkedInPost, FetchLinkedInPostsResult
- [Source: src/types/lead.ts] — LeadRow, LinkedInPostsCache
- [Source: src/types/monitoring.ts] — MonitoringConfig, LeadInsight, transforms
- [Source: src/app/api/leads/enrich-icebreaker/route.ts] — Padrão de batch processing e getApiKey
- [Source: supabase/functions/instantly-webhook/index.ts] — Padrão de Edge Function existente
- [Source: supabase/migrations/00043_add_lead_monitoring_schema.sql] — Schema de monitoramento
- [Source: supabase/migrations/00035_create_api_usage_logs.sql] — api_usage_logs schema
- [Source: https://supabase.com/docs/guides/functions/schedule-functions] — pg_cron + Edge Functions
- [Source: https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post] — Apify sync API

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- vi.clearAllMocks() clears mockImplementation on vi.fn() mocks — fixed by using class syntax for ApifyService mock
- logApiUsage uses @/lib/supabase/server (cookies) — created local logMonitoringUsage helper using service-role client
- MONITORING_CRON_SECRET read at module level blocked testability — moved to request-time read inside POST handler

### Completion Notes List

- Task 1: Migration 00044 — run_status (idle/running) + run_cursor (UUID) columns on monitoring_configs. Updated MonitoringConfigRow/MonitoringConfig types and transform function. Existing monitoring.test.ts updated for new fields.
- Task 2: monitoring-utils.ts — detectNewPosts (Set-based URL comparison), calculateNextRunAt (weekly +7d, biweekly +14d), MonitoringBatchResult type. 11 unit tests covering all edge cases.
- Task 3: API Route process-batch — Full state machine: auth validation, config discovery, idle→running transition, cursor-based batch processing (5 leads), Apify integration, post detection, insight insertion, usage logging, run completion. Uses @supabase/supabase-js createClient directly with SERVICE_ROLE_KEY (no cookies/RLS).
- Task 4: Edge Function monitor-leads — Thin Deno.serve() handler calling Next.js API route. CORS headers, env var validation, error handling.
- Task 5: pg_cron migration 00045 — pg_cron + pg_net extensions, schedule every 5 minutes, Vault secrets documentation.
- Task 6: 25 new tests total (11 utils + 14 route). Coverage: auth (3), no config (1), no run due (1), run completion (1), no apify key (1), new run (1), post detection (3), Apify failure graceful (2), internal error (1).

### Code Review Record

**Reviewer:** Claude Opus 4.6 (adversarial code review)
**Date:** 2026-02-28

**Issues Found:** 1 Critical, 3 Medium, 2 Low — ALL FIXED

1. **[CRITICAL][FIXED] Hardcoded secrets in migration 00045** — service_role_key JWT real e URL do Supabase hardcoded. Substituído por comentários instruindo configuração manual via SQL Editor.
2. **[MEDIUM][FIXED] Sem try-catch no POST handler** — Exceções não tratadas resultariam em 500 genérico. Adicionado try-catch retornando JSON com mensagem de erro.
3. **[MEDIUM][FIXED] ApifyService instanciado por lead** — `new ApifyService()` dentro de processLead (5x por batch). Movido para POST handler, passado como argumento.
4. **[MEDIUM][FIXED] `.env.example` não listado no File List** — Arquivo modificado mas não documentado. Adicionado ao File List.
5. **[LOW][FIXED] Comentário AC incorreto** — `// Update cursor (AC #10)` corrigido para `(AC #11)`.
6. **[LOW][FIXED] Race condition documentada** — Comentário adicionado no start run explicando que pg_cron 5min interval torna races improváveis.

### File List

- CRIAR `supabase/migrations/00044_monitoring_run_tracking.sql`
- CRIAR `supabase/migrations/00045_schedule_monitor_leads_cron.sql`
- CRIAR `src/lib/utils/monitoring-utils.ts`
- CRIAR `src/app/api/monitoring/process-batch/route.ts`
- CRIAR `supabase/functions/monitor-leads/index.ts`
- CRIAR `__tests__/unit/lib/utils/monitoring-utils.test.ts`
- CRIAR `__tests__/unit/app/api/monitoring/process-batch/route.test.ts`
- EDITAR `src/types/monitoring.ts` — MonitoringRunStatus, run_status/run_cursor em MonitoringConfigRow/MonitoringConfig, transformMonitoringConfigRow
- EDITAR `__tests__/unit/types/monitoring.test.ts` — mockRow atualizado com run_status/run_cursor
- EDITAR `.env.example` — MONITORING_CRON_SECRET adicionado
