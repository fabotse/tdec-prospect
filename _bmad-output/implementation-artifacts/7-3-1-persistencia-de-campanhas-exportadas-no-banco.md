# Story 7.3.1: Persistência de Campanhas Exportadas no Banco

Status: done

## Story

As a sistema,
I want persistir o vínculo entre campanhas locais e campanhas remotas (Instantly/Snov.io),
so that seja possível rastrear deploys, evitar duplicatas, e habilitar re-sincronização futura.

## Acceptance Criteria

1. **Given** a tabela `campaigns` existe no banco
   **When** a migration `00037_add_campaign_export_tracking.sql` é executada
   **Then** adiciona os campos:
   - `external_campaign_id` (text, nullable) — ID da campanha na plataforma remota
   - `export_platform` (text, nullable) — plataforma de export ('instantly' | 'snovio' | null)
   - `exported_at` (timestamptz, nullable) — data/hora do último export
   - `export_status` (text, nullable) — status do export ('pending' | 'success' | 'partial_failure' | 'failed')
   **And** campos têm índice em `external_campaign_id` para lookup rápido
   **And** RLS policies existentes continuam funcionando (campos nullable não afetam policies baseadas em `tenant_id`)

2. **Given** uma campanha é exportada com sucesso para uma plataforma
   **When** o fluxo de export finaliza
   **Then** os campos `external_campaign_id`, `export_platform`, `exported_at` e `export_status` são atualizados
   **And** a campanha pode ser consultada por `external_campaign_id`

3. **Given** uma campanha já foi exportada anteriormente
   **When** o usuário tenta exportar novamente
   **Then** o sistema detecta o export anterior via `external_campaign_id`
   **And** oferece opção: "Atualizar campanha existente" ou "Criar nova campanha"
   **And** previne duplicatas acidentais (idempotência)

4. **Given** os tipos TypeScript são atualizados
   **When** o tipo `Campaign` é usado no código
   **Then** inclui os novos campos opcionais
   **And** existe um tipo `ExportStatus` e `ExportRecord` para facilitar queries de export

## Tasks / Subtasks

- [x] Task 1: Migration SQL (AC: #1)
  - [x] 1.1 Criar `supabase/migrations/00037_add_campaign_export_tracking.sql`
  - [x] 1.2 `ALTER TABLE public.campaigns ADD COLUMN external_campaign_id TEXT NULL`
  - [x] 1.3 `ALTER TABLE public.campaigns ADD COLUMN export_platform TEXT NULL` — CHECK constraint: `export_platform IN ('instantly', 'snovio')`
  - [x] 1.4 `ALTER TABLE public.campaigns ADD COLUMN exported_at TIMESTAMPTZ NULL`
  - [x] 1.5 `ALTER TABLE public.campaigns ADD COLUMN export_status TEXT NULL` — CHECK constraint: `export_status IN ('pending', 'success', 'partial_failure', 'failed')`
  - [x] 1.6 `CREATE INDEX idx_campaigns_external_campaign_id ON public.campaigns(external_campaign_id) WHERE external_campaign_id IS NOT NULL` (partial index)
  - [x] 1.7 Verificar que RLS policies existentes NÃO são afetadas (são baseadas em `tenant_id`, campos nullable novos não interferem)

- [x] Task 2: Atualizar tipos TypeScript (AC: #4)
  - [x] 2.1 Em `src/types/campaign.ts` — Adicionar campos opcionais ao `Campaign` interface
  - [x] 2.2 Em `src/types/campaign.ts` — Adicionar campos snake_case ao `CampaignRow` interface
  - [x] 2.3 Em `src/types/campaign.ts` — Atualizar `transformCampaignRow()` para mapear os novos campos
  - [x] 2.4 Em `src/types/campaign.ts` — Atualizar `transformCampaignRowWithCount()` para propagar novos campos (usa spread de transformCampaignRow — automático)
  - [x] 2.5 Em `src/types/export.ts` — Adicionar tipo `ExportStatus`, `RemoteExportPlatform` e `ExportRecord`

- [x] Task 3: Campaign Export Repository (AC: #2, #3)
  - [x] 3.1 Criar `src/lib/services/campaign-export-repository.ts`
  - [x] 3.2 Implementar `updateExportStatus(campaignId, data)` — atualiza os 4 campos de export
  - [x] 3.3 Implementar `getExportRecord(campaignId)` — retorna campos de export de uma campanha
  - [x] 3.4 Implementar `findByExternalId(externalCampaignId, platform)` — busca campanha por ID remoto
  - [x] 3.5 Implementar `hasBeenExported(campaignId)` — boolean rápido para check de idempotência
  - [x] 3.6 Implementar `clearExportStatus(campaignId)` — limpa campos de export (para re-export como nova)

- [x] Task 4: Testes unitários
  - [x] 4.1 Testes para `transformCampaignRow()` com novos campos (nullable e preenchidos) — 3 testes
  - [x] 4.2 Testes para `transformCampaignRowWithCount()` com novos campos — 1 teste propagação
  - [x] 4.3 Testes para `ExportStatus` type guard / validation — 7 testes (ExportStatus, RemoteExportPlatform, ExportRecord)
  - [x] 4.4 Testes para `campaign-export-repository.ts` — CRUD completo com mocks Supabase — 13 testes
  - [x] 4.5 Testes para `findByExternalId` — cenário encontrado e não encontrado — 2 testes
  - [x] 4.6 Testes para `hasBeenExported` — campanha exportada vs não exportada — 3 testes
  - [x] 4.7 Testes para `clearExportStatus` — reset dos campos — 2 testes

## Dev Notes

### Contexto Crítico

Esta story foi adicionada após análise de lacunas identificada pelo documento de pesquisa (`_bmad-output/planning-artifacts/research/instantly-integration-ideas-2026-02-06.md`). É a **Lacuna Crítica #1**: campanhas exportadas não são persistidas no banco, impossibilitando rastrear deploys ou re-sincronizar.

**É pré-requisito para**: Stories 7.4 (Export Dialog detecta exports anteriores), 7.5 (Export Instantly persiste vínculo) e 7.6 (Export Snov.io persiste vínculo).

### Modelo de Dados Atual

O tipo `Campaign` em `src/types/campaign.ts` tem 7 campos:
```
id, tenantId, name, status, productId, createdAt, updatedAt
```

O tipo `CampaignRow` (snake_case) espelha exatamente para o banco:
```
id, tenant_id, name, status, product_id, created_at, updated_at
```

As funções `transformCampaignRow()` e `transformCampaignRowWithCount()` fazem a conversão snake_case → camelCase. **Ambas precisam ser atualizadas.**

### ExportPlatform já existe

O tipo `ExportPlatform` já está definido em `src/types/export.ts`:
```typescript
export type ExportPlatform = "instantly" | "snovio" | "csv" | "clipboard";
```

Para o banco, apenas `'instantly'` e `'snovio'` são válidos (csv/clipboard são exports locais sem tracking remoto). O CHECK constraint deve refletir isso.

### Padrão de Migrations

- Convenção: `000XX_descriptive_snake_case.sql` (underscores, não hifens)
- Última migration: `00036_create_icebreaker_examples.sql`
- **Próxima: `00037_add_campaign_export_tracking.sql`**
- Referência de ALTER TABLE: `00025_add_product_id_to_campaigns.sql` adicionou `product_id` à mesma tabela

### Padrão de Repository

Não existe um `CampaignRepository` centralizado — as queries Supabase são feitas diretamente nos server actions e API routes. O `campaign-export-repository.ts` será o primeiro módulo de repository para campaigns, seguindo o padrão service layer do projeto.

O repository NÃO deve depender de autenticação diretamente — ele recebe o `supabaseClient` como parâmetro (mesmo padrão dos server actions). Quem chama é responsável por passar o client autenticado.

### Decisão Arquitetural: Campos na tabela `campaigns` vs. tabela separada

**Decisão: campos na tabela `campaigns`** (não tabela separada). Motivos:
- Relação 1:1 (uma campanha → um export por vez)
- Queries simples: `SELECT * FROM campaigns WHERE external_campaign_id = ?`
- Sem JOIN adicional no listing de campanhas
- Backward compatible: campos nullable não afetam código existente
- Se no futuro precisar de histórico de exports (múltiplos), aí sim cria tabela separada

### Padrão de Mocks Supabase (Story cleanup-3)

O projeto usa mock Supabase centralizado desde o cleanup sprint 2. **Usar `createMockSupabase()` de `__tests__/helpers/mock-supabase.ts`**.

Padrão para testar queries:
```typescript
const { client, handlers } = createMockSupabase();
handlers.campaigns.select.mockResolvedValue({ data: [...], error: null });
```

Se a tabela `campaigns` já tem handlers no mock factory, os novos campos serão automaticamente incluídos nos mocks.

### Project Structure Notes

- Tipos: `src/types/campaign.ts` (existente) + `src/types/export.ts` (existente)
- Novo arquivo: `src/lib/services/campaign-export-repository.ts`
- Migration: `supabase/migrations/00037_add_campaign_export_tracking.sql`
- Testes: `__tests__/unit/lib/services/campaign-export-repository.test.ts` + atualizar `__tests__/unit/types/campaign.test.ts`

### Não fazer nesta story

- **NÃO** criar UI de export status badge no builder (será Story 7.4 ou futura)
- **NÃO** criar Deployment Service orquestrador (será Stories 7.5/7.6)
- **NÃO** modificar o builder store — os novos campos são do banco, não do estado local
- **NÃO** adicionar endpoint API — o repository será consumido server-side pelas stories futuras

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.3.1]
- [Source: _bmad-output/planning-artifacts/research/instantly-integration-ideas-2026-02-06.md#Lacuna Crítica #1]
- [Source: src/types/campaign.ts — Campaign, CampaignRow, transformCampaignRow()]
- [Source: src/types/export.ts — ExportPlatform type]
- [Source: supabase/migrations/00025_add_product_id_to_campaigns.sql — padrão ALTER TABLE]
- [Source: supabase/migrations/00016_create_campaigns.sql — schema original]
- [Source: _bmad-output/implementation-artifacts/7-3-snov-io-integration-service-gestao-de-campanhas.md — Story anterior]
- [Source: _bmad-output/implementation-artifacts/7-2-instantly-integration-service-gestao-de-campanhas.md — Story anterior]

### Previous Story Intelligence (Story 7.3)

Learnings relevantes da Story 7.3 (Snov.io):
- **Code review fix M3**: Comentários redundantes foram removidos — manter código limpo
- **Padrão de tipos**: Tipos da API ficam em `src/types/{platform}.ts`, tipos internos em `src/types/campaign.ts` e `src/types/export.ts`
- **Mock pattern**: Mock Supabase centralizado funciona bem para tabelas conhecidas
- **Testes**: Vitest com describe/it pattern, cobertura extensiva de edge cases

### Git Intelligence

Últimos 3 commits (Stories 7.1, 7.2, 7.3) adicionaram 42 arquivos com +8265 linhas. Padrão de commit: `feat(story-7.X): descrição com code review fixes`.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum debug necessário — implementação direta.

### Completion Notes List

- Task 1: Migration SQL criada com 4 ALTER TABLE ADD COLUMN, 2 CHECK constraints, 1 partial index, COMMENTs
- Task 2: Campaign/CampaignRow interfaces atualizadas (+4 campos cada), transformCampaignRow() mapeia novos campos com `?? null` fallback, transformCampaignRowWithCount() propaga via spread automático. ExportStatus, RemoteExportPlatform e ExportRecord adicionados em export.ts
- Task 3: Repository com 5 funções: updateExportStatus (partial update), getExportRecord, findByExternalId (idempotência), hasBeenExported (boolean check), clearExportStatus (reset para re-export)
- Task 4: 26 testes novos adicionados (13 repository + 3 transform + 10 export types). Suite total: 195 files, 3514 tests, 0 falhas
- Decisão: SupabaseClient type definido localmente no repository (interface mínima) — evita dependência de tipos Supabase no módulo
- Decisão: RemoteExportPlatform criado como subset de ExportPlatform (só "instantly"|"snovio") — csv/clipboard não persistem no banco

### Change Log

- 2026-02-06: Implementação completa da Story 7.3.1 — migration, tipos, repository, 26 testes
- 2026-02-06: Code review fixes — M1: Campaign/CampaignRow usam RemoteExportPlatform/ExportStatus aliases (DRY), M2: hasBeenExported retorna {exported, error} ao invés de boolean (previne falso negativo em erro DB), M3: updateExportStatus early return em payload vazio

### File List

- `supabase/migrations/00037_add_campaign_export_tracking.sql` — NOVO: migration com ALTER TABLE + CHECK constraints + partial index
- `src/types/campaign.ts` — MODIFICADO: Campaign (+4 campos), CampaignRow (+4 campos), transformCampaignRow() (+4 mappings)
- `src/types/export.ts` — MODIFICADO: +ExportStatus, +RemoteExportPlatform, +ExportRecord
- `src/lib/services/campaign-export-repository.ts` — NOVO: repository com 5 funções CRUD de export tracking
- `__tests__/unit/lib/services/campaign-export-repository.test.ts` — NOVO: 13 testes do repository
- `__tests__/unit/types/campaign.test.ts` — MODIFICADO: +4 testes (transform com novos campos nullable e preenchidos)
- `__tests__/unit/types/export.test.ts` — MODIFICADO: +10 testes (ExportStatus, RemoteExportPlatform, ExportRecord)
