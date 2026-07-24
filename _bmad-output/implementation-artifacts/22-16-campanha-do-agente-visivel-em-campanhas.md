# Story 22.16: Campanha do Agente Visível em /campaigns — persistir na tabela `campaigns`

Status: draft

> **P1 — a campanha que o agente cria é invisível no próprio produto.** Existe só no estado da execução e no Instantly; a página Campanhas nunca fica sabendo.

## Story

As a usuário do Agente TDEC,
I want que a campanha criada pelo agente apareça na página Campanhas como as demais,
so that eu encontre, acompanhe (analytics do Epic 10/14) e gerencie a campanha depois que a conversa com o agente terminar.

## Contexto (verificado em teste E2E + código, 2026-07-24)

- Teste real: "Campanha - Teste Atibaia" criada e exportada pelo agente → `/campaigns` não lista (mais recente: 15/07). A campanha só existe no Instantly.
- Código: `create-campaign-step` e `export-step` **não gravam na tabela `campaigns`** (único insert de ambos é em `agent_messages` — [create-campaign-step.ts:148](../../src/lib/agent/steps/create-campaign-step.ts#L148), [export-step.ts:120](../../src/lib/agent/steps/export-step.ts#L120)).
- O schema está PRONTO para isso: `campaigns` já tem `external_campaign_id`, `export_platform`, `exported_at`, `export_status` ([campaign.ts:78-91,111](../../src/types/campaign.ts#L78)) — usados pelo builder manual (Epic 7) e pelo analytics (Epic 10, que busca `external_campaign_id` para puxar métricas do Instantly).
- Consequência extra de ficar fora da tabela: **o analytics/tracking do Epic 10/14 e o loop de resposta do Epic 21 nunca enxergam campanhas do agente** (ambos partem de `campaigns`).

## Acceptance Criteria

1. **[Campanha gravada na criação]** **Given** o step `create_campaign` concluindo **Then** uma linha é inserida em `campaigns` (`tenant_id`, `name` gerado, `status: "draft"` — shape do [POST /api/campaigns](../../src/app/api/campaigns/route.ts#L119)) **And** o `campaignId` local entra no output do step (disponível para os steps seguintes e para o resumo da conversa).

2. **[Export atualiza os campos de export]** **Given** o step `export` concluindo **Then** a linha ganha `external_campaign_id`, `export_platform: "instantly"`, `exported_at`, `export_status` (mesma semântica do export do builder — Epic 7/14) **And** a ativação (ou defer) atualiza `status` de forma consistente com os labels existentes de campanha.

3. **[Leads associados]** **Given** a Story 22.15 persistindo os leads **Then** os leads aprovados são associados à campanha pelo mesmo mecanismo do builder (mapear no dev: `campaign_leads`?) **And** o card em /campaigns mostra o leadCount correto **And** SEM a 22.15 no ar, a campanha ainda é gravada (leadCount 0 é aceitável como estado intermediário — decisão registrada).

4. **[Aparece e abre]** **Given** a campanha persistida **Then** /campaigns lista a campanha do agente como as demais **And** abrir o detalhe não quebra (mapear o que a página de detalhe exige — blocks/sequência do builder — e decidir o mínimo: detalhe somente-leitura com aviso "criada pelo Agente" é aceitável nesta story; edição completa da sequência fica FORA de escopo).

5. **[Fail-open]** **Given** falha na escrita em `campaigns` **Then** o pipeline NÃO falha (log + mensagem de aviso na conversa); a campanha no Instantly continua a fonte de verdade da sequência.

6. **[Analytics conectado]** **Given** `external_campaign_id` gravado **Then** o analytics existente (Epic 10) funciona para a campanha do agente sem código novo (smoke: abrir analytics da campanha e ver métricas/zeros sem erro).

7. **[Sem regressão + smoke real]** **Then** builder manual e export do builder intocados **And** smoke real: campanha pequena via agente → aparece em /campaigns, abre, analytics não quebra (lição Epic 21: mock não prova JOIN/leitura real — os LEITORES de `campaigns` são o teste que importa).

## Tasks / Subtasks

- [ ] **Task 1 — Spike de leitores** (AC: #3, #4, #6): mapear TODOS os leitores de `campaigns` (lista, detalhe, analytics, export, Epic 21 polling) e o mecanismo de associação de leads do builder; documentar o contrato mínimo que a linha nova precisa cumprir ([[project-schema-constraint-blind-spot]]: ao escrever numa tabela nova para o fluxo, varrer os leitores).
- [ ] **Task 2 — Insert no create-campaign-step** (AC: #1, #5): client de sessão do orchestrator (tenant via RLS) ou service-role + tenant_id explícito — seguir o padrão do pipeline (22.9: service-role é só para CHAVES; escrita de dados avaliar caso a caso).
- [ ] **Task 3 — Update no export-step + ativação** (AC: #2).
- [ ] **Task 4 — Associação de leads** (AC: #3): integrar com o resultado da 22.15.
- [ ] **Task 5 — Detalhe somente-leitura** (AC: #4): mínimo viável para não quebrar o clique.
- [ ] **Task 6 — Testes + smoke real** (AC: #7).

## Dev Notes

- **Zero migration esperado**: todos os campos citados já existem no schema (verificado em `types/campaign.ts` + uso no analytics route). Confirmar no spike contra as migrations reais ([[project-db-schema-versioning]]: schema do cliente é gerenciado à mão — conferir `to_regclass`-style antes de confiar).
- **Trap #1 — nome duplicado**: agente pode gerar nomes repetidos ("Campanha Outbound - {data}") — conferir se `campaigns` tem unique de nome (o Instantly aceita; o local pode ter constraint).
- **Trap #2 — status vocabulary**: usar os `CampaignStatus` existentes (não inventar status novo para "criada por agente"); origem = campo próprio ou metadata, se necessário (spike decide).
- **Trap #3 — detalhe do builder**: a página de detalhe pode assumir blocks de e-mail do builder; campanha do agente não tem blocks locais. Não forçar — somente-leitura com fallback é o escopo.
- Dependência suave: 22.15 (leads locais) para o AC3 completo. Ordem sugerida: 22.15 → 22.16 (ou juntas num movimento só, decisão do Fabossi).

### References

- [Source: src/lib/agent/steps/create-campaign-step.ts#L148] / [export-step.ts#L120] — único insert é agent_messages (evidência do gap)
- [Source: src/app/api/campaigns/route.ts#L119-L126] — shape do insert canônico
- [Source: src/types/campaign.ts#L78-L111] — campos de export já existentes
- [Source: src/app/api/campaigns/[campaignId]/analytics/route.ts#L45-L59] — leitor que usa external_campaign_id (Epic 10)
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — evidência (campanha ausente de /campaigns)

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E — campanha do agente invisível no produto; schema pronto (external_campaign_id etc.); conexão com analytics (Epic 10) e loop de resposta (Epic 21) hoje inexistente para campanhas do agente. Status: draft. |
