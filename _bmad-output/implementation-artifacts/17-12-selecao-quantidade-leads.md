# Story 17.12: Selecao de Quantidade de Leads no Approval Gate

Status: done

## Story

As a usuario do Agente TDEC em modo Guiado,
I want escolher quantos leads buscar quando a pesquisa encontra mais resultados do que o lote inicial,
So that eu tenha controle sobre o volume da campanha e nao fique limitado a 25 leads quando existem centenas ou milhares disponiveis.

## Acceptance Criteria

1. **Given** o SearchLeadsStep concluiu e `totalFound > leads.length` (mais resultados disponiveis do que o lote buscado)
   **When** o approval gate de leads e exibido
   **Then** o gate exibe "Mostrando X de Y leads encontrados" (X = lote atual, Y = totalFound)
   **And** mostra um seletor de quantidade: "Quantos leads deseja usar?" com opcoes pre-definidas (25, 50, 100, 200)
   **And** opcoes maiores que `totalFound` nao sao exibidas
   **And** mostra o custo estimado em creditos Apollo para cada opcao

2. **Given** o usuario seleciona uma quantidade maior que o lote atual (ex: 100)
   **When** clica em "Buscar N leads"
   **Then** o sistema busca os leads adicionais via paginacao Apollo
   **And** exibe indicador de loading ("Buscando mais leads...") durante a busca
   **And** ao concluir, atualiza a lista exibida com todos os leads buscados
   **And** o seletor de quantidade desaparece (ja buscou o que o usuario pediu)

3. **Given** o sistema buscou a quantidade solicitada e exibe a lista expandida
   **When** o usuario interage com o approval gate
   **Then** pode selecionar/desselecionar leads individuais (comportamento existente)
   **And** pode filtrar por nome, empresa ou cargo (comportamento existente)
   **And** pode aprovar ou rejeitar normalmente
   **And** os leads aprovados seguem para o proximo step como `approvedLeads`

4. **Given** `totalFound <= leads.length` (todos os resultados ja estao no lote)
   **When** o approval gate de leads e exibido
   **Then** o seletor de quantidade NAO e exibido
   **And** o gate funciona exatamente como antes (checkboxes + aprovar/rejeitar)

5. **Given** o modo e Autopilot
   **When** o SearchLeadsStep executa
   **Then** busca o lote padrao de 25 leads (sem quantidade configuravel)
   **And** o pipeline avanca sem intervencao (comportamento inalterado)

## Tasks / Subtasks

- [x] Task 1: SearchLeadsStep — persistir filtros de busca no output (AC: #1, #2)
  - [x] 1.1 Em `src/lib/agent/steps/search-leads-step.ts`, no metodo `buildSearchOutput()`, adicionar campo `searchFilters` ao output:
    ```typescript
    return {
      success: true,
      data: {
        leads: mappedLeads,
        totalFound: result.pagination.totalEntries,
        jobTitles,
        domainsSearched,
        searchFilters: filters, // Story 17.12: persistir filtros para paginacao
      },
      cost: { apollo_search: mappedLeads.length * CREDITS_PER_LEAD },
    };
    ```
    - Requer que `buildSearchOutput` receba o objeto `filters` como parametro adicional
    - Ajustar as duas chamadas a `buildSearchOutput()` (normal flow e direct entry flow) para passar `filters`
  - [x] 1.2 Em `src/types/agent.ts`, atualizar `SearchLeadsOutput`:
    ```typescript
    export interface SearchLeadsOutput {
      leads: SearchLeadResult[];
      totalFound: number;
      jobTitles: string[];
      domainsSearched: string[];
      searchFilters?: Record<string, unknown>; // Story 17.12: filtros para re-paginacao
    }
    ```
  - [x] 1.3 Testes: `__tests__/unit/lib/agent/steps/search-leads-step.test.ts`:
    - Teste: output inclui searchFilters com os filtros usados na busca (direct entry flow)
    - Teste: output inclui searchFilters com os filtros usados na busca (normal flow com domains)
    - Teste: searchFilters contem page, perPage, titles (campos obrigatorios)

- [x] Task 2: Nova API route — POST fetch-leads (AC: #2, #3)
  - [x] 2.1 Criar `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts`:
    ```typescript
    // Input schema
    const fetchLeadsSchema = z.object({
      desiredCount: z.number().int().min(1).max(500),
    });

    export async function POST(request: Request, { params }: RouteParams) {
      // 1. Auth + tenant validation (mesmo padrao das outras routes do agent)
      // 2. Ler step record — validar status === "awaiting_approval"
      // 3. Extrair searchFilters e leads existentes do step output
      // 4. Calcular paginas necessarias:
      //    const perPage = searchFilters.perPage ?? 25;
      //    const totalPages = Math.ceil(desiredCount / perPage);
      // 5. Loop de paginacao:
      //    for (let page = 1; page <= totalPages; page++) {
      //      const result = await apolloService.searchPeople({ ...searchFilters, page });
      //      allLeads.push(...result.leads);
      //      if (allLeads.length >= desiredCount) break;
      //      if (result.pagination.page >= result.pagination.totalPages) break;
      //    }
      // 6. Truncar para desiredCount exato: allLeads.slice(0, desiredCount)
      // 7. Deduplica por email (case-insensitive) — evitar duplicatas entre paginas
      // 8. Transformar LeadRow[] para SearchLeadResult[] (mesma logica do buildSearchOutput)
      // 9. Atualizar step output: leads = mergedLeads, custo atualizado
      // 10. Retornar { leads, totalFetched, totalFound, cost }
    }
    ```
  - [x] 2.2 Obter API key Apollo do tenant: reutilizar mesmo padrao de `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` (busca `api_configs` por `provider='apollo'`)
  - [x] 2.3 Instanciar ApolloService com a API key e chamar `searchPeople()` em loop
  - [x] 2.4 Transformar leads com mesma logica de `buildSearchOutput` — extrair para funcao utilitaria reutilizavel:
    ```typescript
    // Em search-leads-step.ts, exportar funcao pura:
    export function mapLeadRowToSearchLeadResult(lead: LeadRow): SearchLeadResult {
      return {
        name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
        title: lead.title ?? null,
        companyName: lead.company_name ?? null,
        email: lead.email ?? null,
        linkedinUrl: lead.linkedin_url ?? null,
        apolloId: lead.apollo_id ?? null,
      };
    }
    ```
  - [x] 2.5 Atualizar step output no banco:
    ```typescript
    await supabase.from("agent_steps").update({
      output: { ...existingOutput, leads: allMappedLeads, totalFetched: allMappedLeads.length },
      cost: existingCost + (newLeadsCount * CREDITS_PER_LEAD),
    }).eq("execution_id", executionId).eq("step_number", stepNumber);
    ```
  - [x] 2.6 Testes: `__tests__/unit/api/agent/fetch-leads.test.ts`:
    - Teste: 200 — busca 100 leads com paginacao (4 paginas de 25)
    - Teste: 200 — para quando totalPages e atingido antes de desiredCount
    - Teste: 200 — deduplica leads por email
    - Teste: 400 — desiredCount < 1 ou > 500
    - Teste: 400 — step nao esta em awaiting_approval
    - Teste: 400 — step nao tem searchFilters no output
    - Teste: 401 — sem autenticacao
    - Teste: custo atualizado corretamente no step

- [x] Task 3: AgentLeadReview — seletor de quantidade (AC: #1, #2, #4)
  - [x] 3.1 Em `src/components/agent/AgentLeadReview.tsx`, adicionar UI condicional quando `data.totalFound > data.leads.length`:
    ```tsx
    {data.totalFound > data.leads.length && !hasExpanded && (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          Mostrando {data.leads.length} de {data.totalFound} leads encontrados.
        </p>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Quantos leads deseja usar?</p>
          <div className="flex gap-2">
            {LEAD_COUNT_OPTIONS
              .filter(opt => opt <= data.totalFound && opt > data.leads.length)
              .map(opt => (
                <Button
                  key={opt}
                  variant={selectedCount === opt ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCount(opt)}
                >
                  {opt}
                </Button>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Custo estimado: ~{selectedCount} creditos Apollo
          </p>
          <Button
            onClick={handleFetchMore}
            disabled={!selectedCount || isFetching}
            size="sm"
          >
            {isFetching ? "Buscando mais leads..." : `Buscar ${selectedCount} leads`}
          </Button>
        </div>
      </div>
    )}
    ```
    - Constante: `const LEAD_COUNT_OPTIONS = [50, 100, 200, 500];`
    - Estados: `selectedCount`, `isFetching`, `hasExpanded`
  - [x] 3.2 Handler `handleFetchMore`:
    ```typescript
    const handleFetchMore = async () => {
      if (!selectedCount) return;
      setIsFetching(true);
      try {
        const response = await fetch(
          `/api/agent/executions/${executionId}/steps/${stepNumber}/fetch-leads`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ desiredCount: selectedCount }),
          }
        );
        if (!response.ok) throw new Error("Falha ao buscar leads");
        const result = await response.json();
        // Atualizar leads locais
        setLocalLeads(result.leads);
        setHasExpanded(true);
        // Selecionar todos os novos leads por padrao
        setSelectedIndices(new Set(result.leads.map((_: unknown, i: number) => i)));
      } catch {
        // Toast ou mensagem de erro
      } finally {
        setIsFetching(false);
      }
    };
    ```
  - [x] 3.3 Refatorar `data.leads` para usar estado local `localLeads` (inicializado com `data.leads`, atualizado apos fetch):
    ```typescript
    const [localLeads, setLocalLeads] = useState<LeadPreview[]>(data.leads);
    ```
    - Todos os renders da tabela usam `localLeads` em vez de `data.leads`
    - `handleApprove` envia `localLeads.filter(...)` em vez de `data.leads.filter(...)`
  - [x] 3.4 Testes: `__tests__/unit/components/agent/AgentLeadReview.test.tsx`:
    - Teste: seletor visivel quando totalFound (200) > leads.length (25)
    - Teste: seletor NAO visivel quando totalFound (15) <= leads.length (15)
    - Teste: clicar em opcao de quantidade → estado atualizado
    - Teste: clicar "Buscar N leads" → fetch chamado com desiredCount
    - Teste: apos fetch sucesso → leads atualizados, seletor desaparece
    - Teste: durante fetch → botao disabled com texto "Buscando..."

- [x] Task 4: Testes de integracao (AC: #1-#5)
  - [x] 4.1 Criar `__tests__/unit/lib/agent/lead-quantity-selection-integration.test.ts`:
    - Teste: SearchLeadsStep retorna 25 leads + totalFound: 500 + searchFilters → output correto
    - Teste: fetch-leads endpoint com desiredCount: 100 → 4 paginas Apollo → 100 leads retornados
    - Teste: modo Autopilot → SearchLeadsStep padrao, sem fetch-leads chamado
    - Teste: totalFound: 20 → seletor nao aparece, fluxo identico ao atual

## Dev Notes

### Padrao de Codigo Estabelecido
- **CSS**: Usar `flex flex-col gap-*` em vez de `space-y-*` (Tailwind v4 + Radix)
- **Idioma UI**: Portugues (BR) para todas as mensagens e labels
- **Testes**: Vitest, mocks centralizados em test utils, mirror de `src/` em `__tests__/unit/`
- **ESLint**: `no-console` enforced — usar logger ou remover console.log
- **Commits**: Pattern `feat(story-17.12): descricao`

### Decisoes Tecnicas

#### Apollo Service ja Suporta Paginacao
O `ApolloService.searchPeople()` aceita `page` e `perPage` nativamente. O loop de paginacao e feito no endpoint `fetch-leads`, NAO no step. O step continua fazendo apenas 1 request (page 1).

**Por que no endpoint e nao no step?**
- O step roda automaticamente. O fetch-leads e disparado pela acao do usuario no approval gate.
- Evita complexidade no step (que ja tem 2 flows: normal e direct entry)
- Permite mostrar loading no frontend durante a busca adicional

#### Constante LEADS_PER_PAGE Permanece 25
NAO alterar o valor da constante. O lote inicial continua sendo 25 — rapido e barato. O usuario expande sob demanda.

#### Extrair Funcao de Mapeamento
`mapLeadRowToSearchLeadResult()` existe dentro de `buildSearchOutput()` como logica inline. Extrair como funcao exportada pura para reutilizar no endpoint `fetch-leads` sem duplicar codigo.

#### Deduplica por Email (Nao por apolloId)
Apollo pode retornar o mesmo lead em paginas diferentes dependendo da ordenacao. Deduplica por `email` (case-insensitive) para garantir unicidade. Usar `apolloId` como fallback se email for null.

### Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts` | Endpoint de paginacao de leads |
| `__tests__/unit/api/agent/fetch-leads.test.ts` | Testes do endpoint |
| `__tests__/unit/lib/agent/lead-quantity-selection-integration.test.ts` | Testes de integracao |

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/lib/agent/steps/search-leads-step.ts` | Persistir `searchFilters` no output + exportar `mapLeadRowToSearchLeadResult` |
| `src/types/agent.ts` | Adicionar `searchFilters?` ao `SearchLeadsOutput` |
| `src/components/agent/AgentLeadReview.tsx` | Seletor de quantidade + fetch handler + estado local de leads |
| `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` | Testes de searchFilters no output |
| `__tests__/unit/components/agent/AgentLeadReview.test.tsx` | Testes do seletor de quantidade |

### Arquivos que NAO Precisam Mudar
- `src/lib/services/apollo.ts` — Ja suporta paginacao nativamente (page, perPage, totalPages)
- `src/lib/agent/steps/base-step.ts` — Template method inalterado
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts` — Ja aceita `approvedData.leads` de qualquer tamanho
- `src/lib/agent/orchestrator.ts` — Fluxo de approval inalterado
- `src/hooks/use-briefing-flow.ts` — Sem mudancas no briefing
- `src/lib/services/agent-plan-generator.ts` — Plano nao muda (step de leads continua existindo)
- `src/components/agent/AgentApprovalGate.tsx` — Delegacao para AgentLeadReview inalterada

### Limites e Validacoes
- **desiredCount max: 500** — Limite razoavel para evitar uso excessivo de creditos Apollo
- **Apollo max perPage: 100** — Acima disso, Apollo ignora. Usar 25 como perPage padrao no loop
- **Apollo max pages: 500** — Limite da API (APOLLO_MAX_PAGES na apollo.ts line 49)
- **Opcoes de quantidade**: [50, 100, 200, 500] — filtradas automaticamente pelo totalFound

### Previous Story Intelligence (17.11)
- Pattern de skip steps ja consolidado: BriefingParser → skipSteps → PlanGenerator → orchestrator → auto-trigger
- Validacao nas rotas plan/confirm ja flexivel para multiplos cenarios
- CreateCampaignStep tem dual input (previousStepOutput OU briefing.importedLeads)
- 6.057 testes passando apos story 17.11 + code review

### Git Intelligence (Ultimos commits)
- `a8e6e2b` feat(story-17.11): pipeline flexivel — entrada direta em campanha com leads proprios + code review fixes
- `a3f88ce` feat(story-17.10): pipeline flexivel — entrada direta em busca de leads + code review fixes
- `4c45941` fix(story-17.9): add accounts to campaign when activation is deferred

### Project Structure Notes
- Nova route segue padrao existente: `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/`
- Mesma estrutura de auth + tenant validation das routes vizinhas (approve, reject, execute)
- Funcao utilitaria exportada de search-leads-step.ts (nao criar arquivo novo so pra isso)

### References
- [Source: src/lib/agent/steps/search-leads-step.ts — LEADS_PER_PAGE=25 (line 25), buildSearchOutput (line 135)]
- [Source: src/lib/services/apollo.ts — searchPeople() (line 244), APOLLO_MAX_PAGES=500 (line 49), pagination (lines 274-290)]
- [Source: src/components/agent/AgentLeadReview.tsx — props (lines 32-42), handleApprove (lines 95-123)]
- [Source: src/lib/agent/steps/base-step.ts — run() (lines 45-68), approval gate flow (lines 112-162)]
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts — approvedLeads merge (lines 121-143)]
- [Source: src/types/agent.ts — SearchLeadsOutput (lines 198-203), StepInput (lines 122-127)]
- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md — FR17, FR18 (lines 47-48)]
- [Source: _bmad-output/implementation-artifacts/17-11-pipeline-flexivel-entrada-direta-campanha.md — previous story context]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

Nenhum blocker encontrado durante implementacao.

### Completion Notes List

- Task 1: Adicionado `searchFilters` ao output do `buildSearchOutput()`. Extraido `mapLeadRowToSearchLeadResult()` como funcao exportada pura para reuso no endpoint. Tipo `SearchLeadsOutput` atualizado com campo opcional. 3 testes adicionados.
- Task 2: Criado endpoint `POST fetch-leads` com paginacao Apollo em loop, dedup por email (case-insensitive) com fallback apolloId, truncamento para desiredCount, validacao Zod (1-500), verificacao de status awaiting_approval e presenca de searchFilters. Atualiza step output e custo no banco. 9 testes adicionados.
- Task 3: AgentLeadReview refatorado para usar estado local `localLeads`. Seletor de quantidade condicional (visivel quando `totalFound > localLeads.length && !hasExpanded`). Opcoes [50, 100, 200, 500] filtradas automaticamente pelo totalFound. Handler `handleFetchMore` chama fetch-leads e atualiza UI. 6 testes adicionados.
- Task 4: 4 testes de integracao validando fluxo end-to-end: output correto com searchFilters, estrutura para paginacao, modo Autopilot sem mudanca, e cenario totalFound <= leads.length.
- Regressao: 6079 testes passando (6057 antes → +22 novos), 0 falhas.
- Code Review: 5 issues corrigidos (1 High, 2 Medium, 2 Low). Dedup/truncate reordenado, leads sem key preservados, erro Supabase checado, testes com totalSteps, variavel morta removida. +1 teste. Regressao: 6080 testes, 0 falhas.

### File List

**Novos:**
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/fetch-leads/route.ts`
- `__tests__/unit/api/agent/fetch-leads.test.ts`
- `__tests__/unit/lib/agent/lead-quantity-selection-integration.test.ts`

**Modificados:**
- `src/lib/agent/steps/search-leads-step.ts`
- `src/types/agent.ts`
- `src/components/agent/AgentLeadReview.tsx`
- `__tests__/unit/lib/agent/steps/search-leads-step.test.ts`
- `__tests__/unit/components/agent/AgentLeadReview.test.tsx`

### Change Log

- 2026-03-30: Story 17.12 implementada — seletor de quantidade de leads no approval gate com paginacao Apollo
- 2026-03-30: Code review — corrigidos 5 issues (H1: dedup antes truncate, M1: leads sem key preservados, M2: totalSteps nos testes, L1: dead code removido, L2: erro check no DB update)
