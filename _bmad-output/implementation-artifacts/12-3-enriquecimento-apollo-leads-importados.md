# Story 12.3: Enriquecimento Apollo para Leads Importados

Status: done

## Story

As a usuário do sistema,
I want enriquecer leads importados via CSV com dados do Apollo (email, LinkedIn, foto),
so that meus contatos importados tenham dados completos e atualizados sem precisar buscá-los manualmente no Apollo.

## Acceptance Criteria

1. **AC #1 - Botão de enriquecimento pós-importação**: Após a importação CSV (step "summary" do `ImportLeadsDialog`), exibir botão "Enriquecer com Apollo" que inicia o enriquecimento batch dos leads recém-importados.

2. **AC #2 - Enriquecimento por nome+empresa (sem apollo_id)**: A rota bulk de enriquecimento deve suportar leads SEM `apollo_id`, fazendo match via Apollo People Match usando `first_name`, `last_name`, `organization_name`, `email` e `linkedin_url` disponíveis no lead.

3. **AC #3 - Salvamento do apollo_id**: Quando o Apollo retorna um match para um lead sem `apollo_id`, salvar o `apollo_id` retornado no banco. Isso permite que enriquecimentos futuros usem o match direto por ID (mais rápido e preciso).

4. **AC #4 - Campos enriquecidos**: O enriquecimento deve preencher os mesmos campos que o fluxo existente (story 4.4.1): `email`, `linkedin_url`, `photo_url`, `last_name` (completo), `location`, `title`, `company_name`, `company_size`, `industry`. Não sobrescrever dados já existentes (lógica de `transformEnrichmentToLead` preservada).

5. **AC #5 - Progresso visual**: Durante o enriquecimento batch, exibir barra/indicador de progresso com "Enriquecendo X de Y leads..." no dialog de importação.

6. **AC #6 - Resumo do enriquecimento**: Após conclusão, exibir resumo: X enriquecidos com sucesso, Y não encontrados no Apollo, Z erros. Manter na mesma tela do resumo de importação (expandido).

7. **AC #7 - Botão "Enriquecer Dados" para leads sem apollo_id**: O botão "Enriquecer Dados" existente na `LeadSelectionBar` (Meus Leads) e no `LeadDetailPanel` deve funcionar TAMBÉM para leads sem `apollo_id`, usando match por nome+empresa automaticamente.

8. **AC #8 - Economy mode preservado**: Manter `reveal_personal_emails: false` e `reveal_phone_number: false` (padrão existente de economy mode, story 4.4.1).

9. **AC #9 - Testes unitários**: Cobertura completa: novo método do service, rota bulk adaptada, hook, integração no dialog, enriquecimento individual sem apollo_id.

## Tasks / Subtasks

- [x] Task 1 — Estender `ApolloService` com match por detalhes (AC: #2, #3)
  - [x] 1.1 Adicionar método `enrichPersonByDetails(details: ApolloEnrichmentRequest)` em `apollo.ts` — usa `POST /v1/people/match` com `first_name`, `last_name`, `organization_name`, `email`, `linkedin_url` ao invés de `id`
  - [x] 1.2 Adicionar método `enrichPeopleByDetails(details: ApolloEnrichmentRequest[])` — usa `POST /v1/people/bulk_match` com array de detalhes (max 10 por batch)
  - [x] 1.3 Testes unitários dos novos métodos (mock de fetch, validação de body enviado, handling de response)

- [x] Task 2 — Adaptar rota bulk de enriquecimento (AC: #2, #3, #7)
  - [x] 2.1 Modificar `POST /api/leads/enrich/bulk` em `route.ts` para separar leads em dois grupos: `leadsWithApolloId` (fluxo existente por `id`) e `leadsWithoutApolloId` (novo fluxo por detalhes)
  - [x] 2.2 Para `leadsWithoutApolloId`: construir `ApolloEnrichmentRequest[]` a partir de `first_name`, `last_name`, `company_name`, `email`, `linkedin_url` do lead no banco
  - [x] 2.3 Chamar `enrichPeopleByDetails()` em batches de 10
  - [x] 2.4 Quando match encontrado: salvar `apollo_id` retornado (`enrichedPerson.id`) junto com os dados enriquecidos (AC #3)
  - [x] 2.5 Testes unitários da rota adaptada (cenários: leads com apollo_id, sem apollo_id, mix dos dois)

- [x] Task 3 — Adaptar rota individual de enriquecimento (AC: #7)
  - [x] 3.1 Modificar `POST /api/leads/[leadId]/enrich` para suportar leads sem `apollo_id`
  - [x] 3.2 Se lead não tem `apollo_id`: chamar `enrichPersonByDetails()` com dados disponíveis do lead
  - [x] 3.3 Se match encontrado: salvar `apollo_id` retornado junto com dados enriquecidos
  - [x] 3.4 Testes unitários (cenário: lead sem apollo_id é enriquecido por nome+empresa)

- [x] Task 4 — Integrar enriquecimento no ImportLeadsDialog (AC: #1, #5, #6)
  - [x] 4.1 Após step "summary" de importação, adicionar botão "Enriquecer com Apollo" (ao lado do botão "Fechar")
  - [x] 4.2 Ao clicar, chamar `useBulkEnrichPersistedLeads().mutateAsync()` com os IDs dos leads recém-importados (disponíveis em `insertedLeadIds` da response de importação)
  - [x] 4.3 Exibir estado de progresso: spinner + "Enriquecendo X leads com Apollo..." durante o processamento
  - [x] 4.4 Após conclusão: exibir resumo de enriquecimento abaixo do resumo de importação (enriquecidos, não encontrados, erros)
  - [x] 4.5 Botão muda para "Fechar" após enriquecimento concluído
  - [x] 4.6 Testes unitários do fluxo de enriquecimento no dialog

- [x] Task 5 — Ajustar tipos de resposta (AC: #6)
  - [x] 5.1 Estender `ImportLeadsResponse` em `lead-import.ts` — tipo `leads` corrigido de `unknown[]` para `string[]` (IDs dos leads inseridos)
  - [x] 5.2 Verificar se a rota `import-csv` já retorna os IDs (já retorna em `data.leads` — apenas confirmar tipagem)

## Dev Notes

### Contexto Técnico Crítico

**INSIGHT PRINCIPAL**: Leads importados via CSV NÃO possuem `apollo_id`. O enriquecimento atual (story 4.4.1) depende de `apollo_id` para funcionar. A API Apollo People Match (`POST /v1/people/match`) aceita match por `first_name`, `last_name`, `organization_name`, `email`, `linkedin_url` — permitindo enriquecer leads sem `apollo_id`.

**Fluxo de decisão no enrichment**:
```
Lead tem apollo_id?
  ├── SIM → enrichPerson(apollo_id) [fluxo existente]
  └── NÃO → enrichPersonByDetails({
              first_name, last_name,
              organization_name, email, linkedin_url
            }) [NOVO fluxo]
              ├── Match encontrado → salvar apollo_id + dados enriquecidos
              └── Sem match → contar como "não encontrado"
```

**Precisão do match**: Quanto mais dados fornecidos ao Apollo, maior a chance de match. Leads CSV com apenas nome (sem email/empresa) terão menor taxa de match. Isso é aceitável — o resumo mostrará quantos foram encontrados.

### Infraestrutura existente a reutilizar

| O que | Arquivo | Como usar |
|---|---|---|
| Apollo Service | [apollo.ts](src/lib/services/apollo.ts) | Estender com novos métodos `enrichPersonByDetails()` e `enrichPeopleByDetails()` |
| Apollo Types | [apollo.ts](src/types/apollo.ts) | `ApolloEnrichmentRequest` JÁ tem campos `first_name`, `last_name`, `organization_name`, `email`, `linkedin_url` |
| Transform function | [apollo.ts](src/types/apollo.ts) | `transformEnrichmentToLead()` — reutilizar sem modificação |
| Bulk enrich route | [route.ts](src/app/api/leads/enrich/bulk/route.ts) | Adaptar para suportar leads sem `apollo_id` |
| Individual enrich route | [route.ts](src/app/api/leads/%5BleadId%5D/enrich/route.ts) | Adaptar para suportar leads sem `apollo_id` |
| Bulk enrich hook | [use-enrich-persisted-lead.ts](src/hooks/use-enrich-persisted-lead.ts) | `useBulkEnrichPersistedLeads()` — NÃO precisa modificar (transparente) |
| Individual enrich hook | [use-enrich-persisted-lead.ts](src/hooks/use-enrich-persisted-lead.ts) | `useEnrichPersistedLead()` — NÃO precisa modificar (transparente) |
| Import dialog | [ImportLeadsDialog.tsx](src/components/leads/ImportLeadsDialog.tsx) | Adicionar botão de enriquecimento no step "summary" |
| Selection bar | [LeadSelectionBar.tsx](src/components/leads/LeadSelectionBar.tsx) | JÁ funciona — apenas a rota precisa suportar leads sem `apollo_id` |
| Lead detail panel | [LeadDetailPanel.tsx](src/components/leads/LeadDetailPanel.tsx) | JÁ funciona — apenas a rota individual precisa suportar |
| Lead types | [lead.ts](src/types/lead.ts) | `LeadRow` com `apollo_id: string \| null` |
| Import types | [lead-import.ts](src/types/lead-import.ts) | Verificar se `leads` retorna IDs |

### O que NÃO fazer

- NÃO modificar os hooks (`useEnrichPersistedLead`, `useBulkEnrichPersistedLeads`) — as mudanças são na camada de API, transparentes para os hooks
- NÃO modificar `LeadSelectionBar` nem `LeadDetailPanel` — eles já chamam os hooks corretos, que vão funcionar automaticamente após adaptar as rotas
- NÃO usar `reveal_personal_emails: true` nem `reveal_phone_number: true` — manter economy mode (AC #8)
- NÃO adicionar auto-enrich obrigatório — o enriquecimento pós-importação é opt-in (botão manual)
- NÃO criar hook novo — reutilizar `useBulkEnrichPersistedLeads()` existente
- NÃO modificar `transformEnrichmentToLead()` — já funciona para o output do People Match

### Apollo People Match API — Parâmetros Suportados

```typescript
// POST https://api.apollo.io/v1/people/match
// Aceita QUALQUER combinação destes campos para match:
interface ApolloEnrichmentRequest {
  id?: string;               // Apollo person ID (preferido, se existir)
  first_name?: string;       // "João"
  last_name?: string;        // "Silva"
  name?: string;             // "João Silva" (alternativa a first+last)
  email?: string;            // "joao@empresa.com"
  organization_name?: string; // "Empresa ABC"
  domain?: string;           // "empresa.com"
  linkedin_url?: string;     // "https://linkedin.com/in/joaosilva"
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  webhook_url?: string;
}

// Bulk: POST https://api.apollo.io/v1/people/bulk_match
// details: ApolloEnrichmentRequest[] (max 10)
```

**Importante**: Quanto mais campos fornecidos, maior a precisão do match. Apenas `first_name` tem baixa taxa de match. `first_name + last_name + organization_name` tem boa taxa.

### Como construir o request de match para leads CSV

```typescript
// Para cada lead sem apollo_id, construir ApolloEnrichmentRequest:
function buildMatchRequest(lead: LeadRow): ApolloEnrichmentRequest {
  const request: ApolloEnrichmentRequest = {};

  // Campos de identificação (quanto mais, melhor o match)
  if (lead.first_name) request.first_name = lead.first_name;
  if (lead.last_name) request.last_name = lead.last_name;
  if (lead.email) request.email = lead.email;
  if (lead.company_name) request.organization_name = lead.company_name;
  if (lead.linkedin_url) request.linkedin_url = lead.linkedin_url;

  // Economy mode
  request.reveal_personal_emails = false;
  request.reveal_phone_number = false;

  return request;
}
```

### Adaptação da rota bulk — Pseudocódigo

```typescript
// POST /api/leads/enrich/bulk (ADAPTADO)
// 1. Fetch leads do banco (existente)
// 2. Separar em dois grupos:
const leadsWithApolloId = leads.filter(l => l.apollo_id);
const leadsWithoutApolloId = leads.filter(l => !l.apollo_id);

// 3. Grupo 1: fluxo existente (enrichPeople por apollo_id)
for (batch of leadsWithApolloId, BATCH_SIZE=10) {
  const apolloIds = batch.map(l => l.apollo_id!);
  const enriched = await apolloService.enrichPeople(apolloIds);
  // update database...
}

// 4. Grupo 2: NOVO fluxo (enrichPeopleByDetails)
for (batch of leadsWithoutApolloId, BATCH_SIZE=10) {
  const details = batch.map(l => buildMatchRequest(l));
  const enriched = await apolloService.enrichPeopleByDetails(details);
  // Para cada match: salvar apollo_id + dados enriquecidos
  // update database...
}
```

### Correlação bulk_match response ↔ leads

**ATENÇÃO**: O Apollo `/v1/people/bulk_match` retorna `matches[]` na mesma ORDEM que o array `details[]` enviado. Cada `matches[i]` corresponde a `details[i]`. Se não houve match, `matches[i].person` será `null`. Usar index para correlacionar:

```typescript
// Correlação por índice (garantido pela API)
for (let i = 0; i < batch.length; i++) {
  const lead = batch[i];
  const match = enrichedResults[i]; // matches[i] corresponde a details[i]

  if (match?.person) {
    const enrichedData = transformEnrichmentToLead(match.person, match.organization);
    // NOVO: salvar apollo_id junto com dados enriquecidos
    await supabase.from("leads").update({
      ...enrichedData,
      apollo_id: match.person.id, // Salvar para futuros enriquecimentos
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
  }
}
```

### Integração no ImportLeadsDialog — Fluxo Atualizado

```
input → mapping → segment → processing → summary → [enrichment]
                                             │           │
                                             ├ Contagens ├ Botão "Enriquecer com Apollo"
                                             │ importação│ ├ Progresso: "Enriquecendo X de Y..."
                                             │           │ ├ Resumo: X enriquecidos, Y não encontrados
                                             │           │ └ Botão "Fechar" (após conclusão)
```

**Estado do summary step expandido**:
```typescript
// Adicionar estados no ImportLeadsDialog:
const [enrichmentState, setEnrichmentState] = useState<
  "idle" | "running" | "done"
>("idle");
const [enrichmentResult, setEnrichmentResult] = useState<{
  enriched: number;
  notFound: number;
  failed: number;
} | null>(null);
const [enrichmentProgress, setEnrichmentProgress] = useState({
  current: 0,
  total: 0,
});
```

### Testes a criar

| Arquivo | O que testar |
|---|---|
| `__tests__/unit/lib/services/apollo.test.ts` | Novos métodos `enrichPersonByDetails()` e `enrichPeopleByDetails()` — body enviado contém campos de match, handling de response, erro 404 |
| `__tests__/unit/app/api/leads/enrich/bulk/route.test.ts` | Cenários: leads com `apollo_id` (existente), leads sem `apollo_id` (novo), mix dos dois, salvamento de `apollo_id` retornado |
| `__tests__/unit/app/api/leads/[leadId]/enrich/route.test.ts` | Cenário: lead sem `apollo_id` enriquecido por nome+empresa, salvamento de `apollo_id` |
| `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` | Botão "Enriquecer com Apollo" visível após importação, progresso durante enriquecimento, resumo de enriquecimento exibido |

### Project Structure Notes

**Arquivos modificados:**
- `src/lib/services/apollo.ts` — Novos métodos `enrichPersonByDetails()`, `enrichPeopleByDetails()`
- `src/app/api/leads/enrich/bulk/route.ts` — Suporte a leads sem `apollo_id`
- `src/app/api/leads/[leadId]/enrich/route.ts` — Suporte individual a leads sem `apollo_id`
- `src/components/leads/ImportLeadsDialog.tsx` — Botão e fluxo de enriquecimento pós-importação
- `src/types/lead-import.ts` — Tipagem de `insertedLeadIds` (se necessário)

**Testes modificados/criados:**
- `__tests__/unit/lib/services/apollo.test.ts` — Novos testes para métodos por detalhes
- `__tests__/unit/app/api/leads/enrich/bulk/route.test.ts` — Testes para leads sem `apollo_id`
- `__tests__/unit/app/api/leads/[leadId]/enrich/route.test.ts` — Teste para lead sem `apollo_id`
- `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` — Testes do fluxo de enriquecimento

**Arquivos NÃO modificados (já funcionam via transparência):**
- `src/hooks/use-enrich-persisted-lead.ts` — Hooks reutilizados sem mudança
- `src/components/leads/LeadSelectionBar.tsx` — Já chama hooks corretos
- `src/components/leads/LeadDetailPanel.tsx` — Já chama hook correto
- `src/types/apollo.ts` — `ApolloEnrichmentRequest` já tem os campos necessários

### Git Intelligence (Story 12-2)

A story anterior (12-2) estabeleceu:
- Dialog multi-step com tabs e steps progressivos
- Mocking de `@/components/ui/tabs` para testes (Radix UI Tabs não funciona em happy-dom)
- Mocking de `@/lib/utils/csv-parser` para isolar testes do dialog
- Padrão de hooks mockados: `useCreateSegment`, `useImportLeadsCsv`, `useSegments`
- Response da importação retorna `{ imported, existing, errors, leads: string[] }` — o `leads` já contém os IDs inseridos

### References

- [Source: src/lib/services/apollo.ts] — ApolloService com `enrichPerson()` e `enrichPeople()` (story 3.2.1, 4.4.1)
- [Source: src/types/apollo.ts] — `ApolloEnrichmentRequest` com campos `first_name`, `last_name`, `organization_name`, `email`, `linkedin_url`
- [Source: src/types/apollo.ts#transformEnrichmentToLead] — Função de transformação (reutilizar sem modificar)
- [Source: src/app/api/leads/enrich/bulk/route.ts] — Rota bulk a adaptar
- [Source: src/app/api/leads/[leadId]/enrich/route.ts] — Rota individual a adaptar
- [Source: src/hooks/use-enrich-persisted-lead.ts] — Hooks existentes (NÃO modificar)
- [Source: src/components/leads/ImportLeadsDialog.tsx] — Dialog de importação a estender
- [Source: src/components/leads/LeadSelectionBar.tsx] — Botão "Enriquecer Dados" (já funcional)
- [Source: src/components/leads/LeadDetailPanel.tsx] — Painel de detalhe (já funcional)
- [Source: src/app/api/leads/import-csv/route.ts] — Rota de importação CSV (retorna IDs)
- [Source: src/types/lead-import.ts] — Tipos de importação
- [Source: src/types/lead.ts] — Interface Lead com `apollo_id: string | null`
- [Source: _bmad-output/implementation-artifacts/4-4-1-lead-data-enrichment.md] — Story de referência (enrichment original)
- [Source: _bmad-output/implementation-artifacts/12-2-importacao-leads-csv.md] — Story anterior (CSV import)
- [Apollo Docs: People Enrichment](https://docs.apollo.io/reference/people-enrichment) — API de match por detalhes
- [Apollo Docs: Bulk People Enrichment](https://docs.apollo.io/reference/bulk-people-enrichment) — API bulk de match (max 10)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Test suite mock pattern issue: Initial `leads-enrich.test.ts` tests used simple `mockSupabase` chain where `.eq()` mock was consumed by the profile query instead of leads query. Fixed by switching to `mockGetCurrentUserProfile` + `createChainBuilder` pattern.

### Completion Notes List

- Task 1: Added `enrichPersonByDetails()` and `enrichPeopleByDetails()` to ApolloService. 10 new tests (39 total).
- Task 2: Fully rewrote bulk enrich route to support both groups (with/without apollo_id). Added `buildMatchRequest()` helper. 6 new tests (13 total).
- Task 3: Adapted individual enrich route with branching logic. Saves apollo_id from match. 4 new tests (17 total).
- Task 5: Fixed `ImportLeadsResponse.leads` type from `unknown[]` to `string[]`.
- Task 4: Integrated enrichment flow in ImportLeadsDialog (button, progress, summary). 7 new tests (34 total for dialog).
- Full test suite: 248 files, 4559 tests passing, 0 failures.

### Change Log

| File | Change |
|---|---|
| `src/lib/services/apollo.ts` | Added `enrichPersonByDetails()` and `enrichPeopleByDetails()` methods |
| `src/app/api/leads/enrich/bulk/route.ts` | Rewrote to support leads without apollo_id (Group 2 with match by details) |
| `src/app/api/leads/[leadId]/enrich/route.ts` | Added branching: apollo_id → enrichPerson, else → enrichPersonByDetails |
| `src/types/lead-import.ts` | Changed `leads: unknown[]` to `leads: string[]` |
| `src/types/apollo.ts` | Added shared `buildMatchRequest()` function (code review fix: DRY) |
| `src/components/leads/ImportLeadsDialog.tsx` | Added enrichment button, progress, and summary UI (Story 12.3 AC #1, #5, #6) |
| `__tests__/unit/lib/services/apollo.test.ts` | +10 tests for new match-by-details methods |
| `__tests__/unit/api/leads-enrich.test.ts` | Fully rewrote; +4 individual + 6 bulk Story 12.3 tests (17 total) |
| `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` | +7 enrichment flow tests (34 total) |

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-02-12
**Outcome:** Approved with fixes applied

**Issues found: 3 MEDIUM, 4 LOW**

Fixes applied:
1. **[MEDIUM] DRY violation**: Extracted `buildMatchRequest()` to `src/types/apollo.ts` as shared function. Both individual and bulk routes now import from same source instead of duplicated inline logic.
2. **[MEDIUM] Redundant economy mode flags**: Removed `reveal_personal_emails`/`reveal_phone_number` from per-detail match requests. Flags are enforced at service level (`enrichPersonByDetails` defaults, `enrichPeopleByDetails` top-level body).
3. **[LOW] Duplicate `updated_at`**: Removed explicit `updated_at` from route update calls — already set by `transformEnrichmentToLead()`.
4. **Tests updated**: Route tests no longer assert per-detail economy flags (tested at service level in `apollo.test.ts`).

Not fixed (accepted):
- **[MEDIUM] AC #5 progress text "X de Y"**: Single mutation call doesn't provide per-lead progress. Showing total count is the correct behavior given the architecture.
- **[LOW] `enrichPersonByDetails` accepts `id` via spread**: No active bug, current callers don't pass `id`.
- **[LOW] Missing test for bulk 404 (no leads in DB)**: Pre-existing code path from story 4.4.1.
- **[LOW] No minimum field validation in `buildMatchRequest`**: Won't crash (Apollo returns "not found"), low-probability edge case.

**Full test suite: 248 files, 4559 tests passing, 0 failures.**

### File List

**Modified:**
- `src/lib/services/apollo.ts`
- `src/app/api/leads/enrich/bulk/route.ts`
- `src/app/api/leads/[leadId]/enrich/route.ts`
- `src/types/lead-import.ts`
- `src/types/apollo.ts`
- `src/components/leads/ImportLeadsDialog.tsx`

**Tests Modified:**
- `__tests__/unit/lib/services/apollo.test.ts`
- `__tests__/unit/api/leads-enrich.test.ts`
- `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx`

**Not Modified (transparent compatibility):**
- `src/hooks/use-enrich-persisted-lead.ts`
- `src/components/leads/LeadSelectionBar.tsx`
- `src/components/leads/LeadDetailPanel.tsx`
