# Story 22.15: Leads do Agente em "Meus Leads" — persistência + segmento automático/nomeável

Status: draft

> **P1 — pedido direto do cliente.** Hoje os leads aprovados pelo agente NÃO existem em lugar nenhum do produto: vivem no output do step e vão direto pro Instantly. Sem segmento, sem gestão, sem histórico, sem monitoramento.

## Story

As a usuário do Agente TDEC,
I want que os leads que eu aprovei numa campanha do agente sejam salvos em "Meus Leads", organizados num segmento da campanha (ou num segmento com o nome que eu pedir),
so that minha base cresce organizada a cada campanha e eu consigo gerenciar/monitorar/reaproveitar esses leads como faço com os importados.

## Contexto (verificado em teste E2E + código, 2026-07-24)

- Teste real: 2 leads aprovados (Amanda/Fast4you, Shoiti/Sato7) → campanha criada e exportada → busca por "Amanda" em Meus Leads: **"Nenhum lead encontrado"**. Base tem 875 leads (último import 26/03).
- Código: **nenhum arquivo em `src/lib/agent/**` grava na tabela `leads`** nem toca `lead_segments` (grep confirmado). Os leads aprovados existem só em `agent_steps.output` e no Instantly.
- O produto JÁ TEM toda a infra de segmentos (Story 4.1/12.1): 16 segmentos em uso pelo cliente (ex.: "Prospects - CYERA (213)"), filtro por segmento em Meus Leads, e a rota [POST /api/segments/[segmentId]/leads](../../src/app/api/segments/[segmentId]/leads/route.ts#L120) que **upserta leads e cria associações** — exatamente a mecânica necessária.
- Pedido de segmento na conversa hoje é engolido: "quero que fiquem num segmento chamado 'Teste Atibaia'" virou `campaignDescription: "Teste Atibaia"` e a pergunta "dá pra fazer isso?" ficou sem resposta.

## Acceptance Criteria

1. **[Persistência no ponto certo]** **Given** a aprovação da etapa "Busca de Leads" (modo guiado) ou a passagem equivalente no autopilot **Then** os leads **selecionados/aprovados** são upsertados na tabela `leads` do tenant (dedupe pela regra existente da rota de segmentos — não inventar regra nova) **And** leads NÃO selecionados na revisão não são salvos **And** a falha da persistência NÃO derruba o pipeline (fail-open com aviso — a campanha continua; log + mensagem "não consegui salvar em Meus Leads").

2. **[Segmento automático]** **Given** a persistência **Then** os leads entram num segmento criado (ou reusado, se mesmo nome) automaticamente com o nome da campanha (ex.: "Campanha - Teste Atibaia") **And** o segmento aparece no filtro de Meus Leads como qualquer outro.

3. **[Segmento nomeável na conversa]** **Given** o usuário pedindo na conversa um nome de segmento ("coloca no segmento X") **Then** o parser extrai `segmentName` (campo novo nullable no ParsedBriefing, padrão fail-open `.default(null).catch(null)` da 22.5) **And** o resumo do briefing exibe "Segmento: X" **And** a persistência usa esse nome no lugar do automático **And** o pedido não é mais confundido com `campaignDescription`.

4. **[Dados completos, não mascarados]** **Given** que a tabela de revisão exibe dados mascarados (ex.: "Amanda Re***l") e email "—" **Then** a persistência acontece no ponto do pipeline onde os dados REVELADOS existem (nome completo/email usados pelo create-campaign/export) — mapear no dev onde o reveal ocorre e persistir a partir dali **And** nunca gravar valores mascarados na base.

5. **[Enriquecimento visível]** **Given** leads salvos via agente **Then** em Meus Leads eles mostram origem identificável (ex.: coluna/badge "Importado em" + segmento da campanha; avaliar campo `source: "agent"` se a tabela já tiver equivalente — investigar schema antes, NUNCA assumir coluna — lição [[project-db-schema-versioning]]) **And** o icebreaker gerado pela campanha é salvo no lead (coluna de icebreaker já existe em Meus Leads).

6. **[Resposta honesta na conversa]** **Given** o usuário perguntando "dá pra colocar num segmento?" **Then** o agente responde afirmativamente citando o nome que usará (em vez de ignorar a pergunta).

7. **[Sem regressão + smoke real]** **Given** a suíte e a lição do Epic 21 (mock não prova constraint/RLS/JOIN reais) **Then** zero regressão nos fluxos de segmentos existentes **And** smoke real: rodar uma campanha pequena pelo agente e verificar em Meus Leads os leads com segmento, nome completo, email e icebreaker.

## Tasks / Subtasks

- [ ] **Task 1 — Spike de schema + ponto de reveal** (AC: #4, #5): mapear tabela `leads` (colunas reais via schema/migrations, não memória), regra de dedupe da rota de segmentos, e ONDE o pipeline revela nome/email (approve? create-campaign? export?). Documentar antes de codar.
- [ ] **Task 2 — Serviço de persistência reutilizando a mecânica de segmentos** (AC: #1, #2): extrair/reusar o upsert+associação da rota `segments/[segmentId]/leads` num helper server-side chamável pelo pipeline (service-role — padrão 22.9; RLS de leads/segments conferida).
- [ ] **Task 3 — Chamada no pipeline** (AC: #1, #4): no ponto pós-aprovação com dados revelados; fail-open com mensagem.
- [ ] **Task 4 — `segmentName` no parser + resumo + PATCH schema** (AC: #3, #6): campo novo no ParsedBriefing + SYSTEM_PROMPT + `briefingUpdateSchema` (armadilha de strip da 22.5 — RED→GREEN nos dois pontos).
- [ ] **Task 5 — Icebreaker no lead** (AC: #5).
- [ ] **Task 6 — Testes + smoke real** (AC: #7).

## Dev Notes

- **Reusar, não duplicar**: a rota de segmentos já resolve upsert de leads sem constraint única (comentário na própria rota) + associações `lead_segments`. O helper deve ser a MESMA lógica, exportada server-side.
- **NFR5 (zero migration) é DESEJÁVEL mas não certo**: se `leads` não tiver campo para icebreaker/source adequados, decidir com Fabossi (migration nova vs JSONB existente). O spike da Task 1 responde.
- **Trap #1 — RLS/roles**: pipeline roda com client de service-role para chaves (22.9), mas escrita de leads deve respeitar tenant_id explícito (única barreira pós-bypass — padrão service-keys).
- **Trap #2 — dedupe**: lead já existente na base (mesmo email) não pode duplicar nem perder histórico — seguir a regra da rota existente.
- **Trap #3 — volume**: aprovação pode ter 200 leads; upsert em lote (a rota existente já pagina? conferir) — não N round-trips.
- Relação com 22.16: a campanha persistida (22.16) pode linkar os leads via `campaign_leads` — as duas stories se encaixam; sequência sugerida: 22.15 → 22.16.

### References

- [Source: src/app/api/segments/[segmentId]/leads/route.ts#L120-L290] — upsert + associação (mecânica a reusar)
- [Source: src/types/segment.ts] — `Segment`, `LeadDataForSegment`, `AddLeadsToSegmentRequest`
- [Source: src/lib/agent/steps/search-leads-step.ts] / [export-step.ts] — pipeline sem persistência local (grep: zero `.from("leads")` em src/lib/agent)
- [Source: src/lib/agent/service-keys.ts] — padrão service-role + tenant_id (22.9)
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — evidência ("Amanda" ausente; segmento virou descrição)

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E + pergunta direta do Fabossi sobre segmento na importação. Descoberta central: agente não persiste leads em lugar nenhum do produto; infra de segmentos já existe e é usada (16 segmentos). Status: draft. |
