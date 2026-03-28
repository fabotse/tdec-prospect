# Story 17.11: Pipeline Flexivel — Entrada Direta em Criacao de Campanha (Leads Proprios)

Status: done

## Story

As a usuario do Agente TDEC,
I want poder fornecer minha propria lista de leads e iniciar o pipeline diretamente na criacao de campanha,
So that eu possa usar o agente apenas para gerar e enviar campanhas para contatos que ja possuo, sem gastar creditos de busca.

## Acceptance Criteria

1. **Given** o usuario indica no briefing que ja possui leads (ex: "ja tenho os contatos", "quero importar meus leads")
   **When** o agente detecta a intencao de pular busca
   **Then** o agente solicita a lista de leads em formato estruturado (CSV, lista de emails, ou input manual)
   **And** orienta o formato minimo esperado: email (obrigatorio), nome, empresa, cargo
   **And** NAO exige tecnologia, industria nem localizacao no briefing

2. **Given** o usuario forneceu a lista de leads
   **When** o agente valida a lista
   **Then** valida que cada lead tem ao menos email valido
   **And** informa quantos leads foram aceitos vs rejeitados (emails invalidos)
   **And** apresenta preview dos leads importados no mesmo formato do approval gate de leads

3. **Given** leads proprios foram aceitos e o pipeline e montado
   **When** o DeterministicOrchestrator configura os steps
   **Then** os steps `search_companies` e `search_leads` recebem status 'skipped'
   **And** o pipeline inicia diretamente no step `create_campaign`
   **And** o CreateCampaignStep recebe os leads importados no mesmo formato que receberia do SearchLeadsStep

4. **Given** o pipeline pulou empresas e leads
   **When** o AgentStepProgress renderiza
   **Then** os dois primeiros steps aparecem como 'skipped'
   **And** a numeracao reflete "Etapa 1 de 3" (campanha, export, ativacao)
   **And** os leads importados ficam visiveis no contexto da execucao

5. **Given** os leads importados nao tem empresa associada
   **When** o CreateCampaignStep gera icebreakers
   **Then** os icebreakers sao gerados com base nos dados disponiveis (nome, cargo, email domain)
   **And** se nao houver dados suficientes para icebreaker personalizado, usa um icebreaker generico baseado no tom de voz configurado

## Tasks / Subtasks

- [x]Task 1: BriefingParserService — detectar intencao de leads proprios (AC: #1)
  - [x]1.1 Em `src/lib/agent/briefing-parser-service.ts`, atualizar `SYSTEM_PROMPT` (line 43-64) para adicionar regras de deteccao:
    ```
    - Se o usuario indicar que ja possui leads/contatos proprios (ex: "ja tenho os contatos", "quero importar meus leads",
      "tenho uma planilha de leads", "leads proprios", "minha lista de emails", "CSV com contatos"),
      adicione ["search_companies", "search_leads"] no skipSteps.
    - Se skipSteps contem "search_leads", NAO exija jobTitles — o usuario fornecera os leads diretamente.
    ```
  - [x]1.2 NAO alterar schema Zod (`briefingResponseSchema` line 26-35) — `skipSteps: z.array(z.string())` ja suporta multiplos valores
  - [x]1.3 NAO alterar `BriefingParserService.parse()` — `skipSteps` ja flui corretamente do parser ate o briefing
  - [x]1.4 Testes: `__tests__/unit/lib/agent/briefing-parser-service.test.ts` — adicionar cenarios onde resposta mockada do OpenAI inclui `skipSteps: ["search_companies", "search_leads"]`:
    - Cenario: usuario diz "ja tenho meus leads" → skipSteps inclui ambos
    - Cenario: usuario diz "quero importar CSV de contatos" → skipSteps inclui ambos
    - Cenario: usuario diz "buscar CTOs em SP" (sem leads proprios) → skipSteps NAO inclui search_leads

- [x]Task 2: ParsedBriefing + schemas — suportar importedLeads (AC: #1, #3)
  - [x]2.1 Em `src/types/agent.ts`, adicionar campo opcional ao `ParsedBriefing` (line 73-82):
    ```typescript
    export interface ParsedBriefing {
      technology: string | null;
      jobTitles: string[];
      location: string | null;
      companySize: string | null;
      industry: string | null;
      productSlug: string | null;
      mode: ExecutionMode;
      skipSteps: string[];
      importedLeads?: SearchLeadResult[]; // Story 17.11: leads fornecidos pelo usuario
    }
    ```
  - [x]2.2 Em `src/app/api/agent/executions/[executionId]/briefing/route.ts`, adicionar `importedLeads` ao schema de PATCH:
    ```typescript
    importedLeads: z.array(z.object({
      name: z.string(),
      title: z.string().nullable(),
      companyName: z.string().nullable(),
      email: z.string().nullable(),
      linkedinUrl: z.string().nullable(),
      apolloId: z.string().nullable(),
    })).optional(),
    ```
  - [x]2.3 Testes: verificar que briefing com importedLeads e salvo e recuperado corretamente via PATCH

- [x]Task 3: LeadImportParser — parsear e validar leads do texto do usuario (AC: #1, #2)
  - [x]3.1 Criar `src/lib/agent/lead-import-parser.ts`:
    ```typescript
    export interface LeadImportResult {
      accepted: SearchLeadResult[];
      rejected: { line: string; reason: string }[];
    }

    export function parseLeadInput(text: string): LeadImportResult
    ```
  - [x]3.2 Formatos suportados para parsing (um lead por linha):
    - **Apenas email**: `joao@empresa.com` → name extraido do email (parte antes do @), companyName do dominio
    - **Nome, Email**: `Joao Silva, joao@empresa.com`
    - **Nome, Cargo, Email**: `Joao Silva, CTO, joao@empresa.com`
    - **Nome, Cargo, Empresa, Email**: `Joao Silva, CTO, Empresa X, joao@empresa.com`
    - **CSV com header**: detectar header (se primeira linha contem "email" ou "nome") e parsear colunas
    - Separadores: virgula `,` ou tab `\t` ou ponto-e-virgula `;`
  - [x]3.3 Validacao:
    - Email: regex basica `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — OBRIGATORIO
    - Linhas vazias: ignorar (nao contar como rejeitadas)
    - Linhas sem email valido: rejeitar com reason "Email invalido ou ausente"
    - Deduplica por email (case-insensitive) — se duplicado, manter primeiro e rejeitar segundo com reason "Email duplicado"
  - [x]3.4 Retorno `SearchLeadResult` para cada lead aceito:
    - `name`: nome fornecido OU parte antes do @ do email (capitalizada)
    - `title`: cargo fornecido OU null
    - `companyName`: empresa fornecida OU dominio do email (sem TLD) OU null
    - `email`: email validado
    - `linkedinUrl`: null (nao coletado neste fluxo)
    - `apolloId`: null (nao vem do Apollo)
  - [x]3.5 Testes: `__tests__/unit/lib/agent/lead-import-parser.test.ts`:
    - Teste: apenas emails → extrai nomes do email
    - Teste: formato nome,email → parseia corretamente
    - Teste: formato completo nome,cargo,empresa,email
    - Teste: CSV com header → detecta e ignora header
    - Teste: mix de formatos na mesma entrada
    - Teste: emails invalidos → rejeitados com reason
    - Teste: linhas vazias → ignoradas
    - Teste: emails duplicados → segundo rejeitado
    - Teste: separadores tab e ponto-e-virgula

- [x]Task 4: useBriefingFlow — fluxo de coleta de leads (AC: #1, #2)
  - [x]4.1 Em `src/hooks/use-briefing-flow.ts`, adicionar novos status ao `BriefingFlowStatus` (line 23-31):
    ```typescript
    export type BriefingFlowStatus =
      | "idle"
      | "parsing"
      | "awaiting_fields"
      | "confirming"
      | "confirmed"
      | "awaiting_product_decision"
      | "awaiting_product_details"
      | "confirming_product"
      | "awaiting_leads_input"    // Story 17.11: esperando usuario colar leads
      | "confirming_leads";       // Story 17.11: preview dos leads para confirmacao
    ```
  - [x]4.2 Em `handleParseResult` (line 289-344), ANTES do check de productMentioned, detectar fluxo de leads importados:
    ```typescript
    if (result.canProceed || isImportedLeadsFlow(result.briefing)) {
      // Story 17.11: Check if this is an imported leads flow
      if (result.briefing.skipSteps?.includes("search_companies") &&
          result.briefing.skipSteps?.includes("search_leads")) {
        setState((prev) => ({
          ...prev,
          status: "awaiting_leads_input",
          briefing: result.briefing,
          missingFields: result.missingFields,
          isComplete: false, // Not complete until leads provided
        }));
        await sendAgentMessage(
          executionId,
          "Entendi! Voce ja tem seus proprios leads. Cole a lista abaixo no formato:\n\n" +
          "**Formato aceito** (um lead por linha):\n" +
          "- `email@empresa.com` (minimo)\n" +
          "- `Nome, email@empresa.com`\n" +
          "- `Nome, Cargo, email@empresa.com`\n" +
          "- `Nome, Cargo, Empresa, email@empresa.com`\n\n" +
          "Tambem aceito CSV com header (nome, cargo, empresa, email).\n\n" +
          "Cole seus leads:"
        );
        return { handled: true };
      }
      // ... rest of existing flow (product check, confirming, etc.)
    }
    ```
  - [x]4.3 Helper function `isImportedLeadsFlow`:
    ```typescript
    function isImportedLeadsFlow(briefing: ParsedBriefing): boolean {
      return briefing.skipSteps?.includes("search_companies") === true &&
             briefing.skipSteps?.includes("search_leads") === true;
    }
    ```
  - [x]4.4 Handler para status `"awaiting_leads_input"` em `processMessage` (apos handlers de produto existentes):
    ```typescript
    if (currentStatus === "awaiting_leads_input") {
      const result = parseLeadInput(content);

      if (result.accepted.length === 0) {
        await sendAgentMessage(
          executionId,
          `Nenhum lead valido encontrado. ${result.rejected.length > 0
            ? `${result.rejected.length} rejeitados:\n${result.rejected.map(r => `- "${r.line}" — ${r.reason}`).join("\n")}`
            : "Cole ao menos um email valido."}`
        );
        return { handled: true };
      }

      // Store leads and show preview
      const updatedBriefing = { ...state.briefing!, importedLeads: result.accepted };
      setState((prev) => ({
        ...prev,
        status: "confirming_leads",
        briefing: updatedBriefing,
      }));

      const preview = formatLeadPreview(result);
      await sendAgentMessage(executionId, preview);
      return { handled: true };
    }
    ```
  - [x]4.5 Helper function `formatLeadPreview`:
    ```typescript
    function formatLeadPreview(result: LeadImportResult): string {
      const lines: string[] = [];
      lines.push(`**${result.accepted.length} leads aceitos**${result.rejected.length > 0 ? ` | ${result.rejected.length} rejeitados` : ""}:\n`);

      // Table header
      lines.push("| # | Nome | Cargo | Empresa | Email |");
      lines.push("|---|------|-------|---------|-------|");

      for (let i = 0; i < Math.min(result.accepted.length, 10); i++) {
        const lead = result.accepted[i];
        lines.push(`| ${i + 1} | ${lead.name} | ${lead.title ?? "-"} | ${lead.companyName ?? "-"} | ${lead.email} |`);
      }

      if (result.accepted.length > 10) {
        lines.push(`\n...e mais ${result.accepted.length - 10} leads.`);
      }

      if (result.rejected.length > 0) {
        lines.push(`\n**Rejeitados:**`);
        for (const r of result.rejected.slice(0, 5)) {
          lines.push(`- "${r.line}" — ${r.reason}`);
        }
        if (result.rejected.length > 5) {
          lines.push(`- ...e mais ${result.rejected.length - 5}.`);
        }
      }

      lines.push("\nConfirma esses leads para a campanha?");
      return lines.join("\n");
    }
    ```
  - [x]4.6 Handler para status `"confirming_leads"` em `processMessage`:
    ```typescript
    if (currentStatus === "confirming_leads") {
      if (isConfirmation(content)) {
        // Proceed to normal briefing confirmation with leads included
        setState((prev) => ({
          ...prev,
          status: "confirming",
        }));
        if (state.briefing) {
          await sendAgentMessage(
            executionId,
            generateBriefingSummary(state.briefing)
          );
        }
        return { handled: true };
      }

      // User wants to redo leads
      setState((prev) => ({ ...prev, status: "awaiting_leads_input" }));
      await sendAgentMessage(
        executionId,
        "Ok, cole a lista de leads novamente:"
      );
      return { handled: true };
    }
    ```
  - [x]4.7 Testes: `__tests__/unit/hooks/use-briefing-flow.test.tsx`:
    - Teste: briefing com skipSteps ["search_companies", "search_leads"] → status "awaiting_leads_input"
    - Teste: usuario cola leads validos → status "confirming_leads" + preview exibido
    - Teste: usuario cola leads invalidos (sem email) → mensagem de erro, continua em "awaiting_leads_input"
    - Teste: usuario confirma leads → status "confirming" + summary exibido
    - Teste: usuario rejeita leads → volta para "awaiting_leads_input"

- [x]Task 5: analyzeBriefingCompleteness + validacoes de rota (AC: #1, #3)
  - [x]5.1 Em `src/app/api/agent/briefing/parse/route.ts`, atualizar `analyzeBriefingCompleteness` (line 49-82):
    ```typescript
    function analyzeBriefingCompleteness(briefing: ParsedBriefing): BriefingCompletenessResult {
      const missingFields: string[] = [];
      // ... existing field checks ...

      // canProceed logic:
      const hasJobTitles = briefing.jobTitles && briefing.jobTitles.length > 0;
      const hasSearchParam = Boolean(briefing.technology || briefing.industry || briefing.location);
      const hasImportedLeads = briefing.importedLeads && briefing.importedLeads.length > 0;

      // Story 17.11: imported leads flow doesn't need jobTitles or search params
      const isImportedLeadsFlow =
        briefing.skipSteps?.includes("search_companies") &&
        briefing.skipSteps?.includes("search_leads");

      const canProceed = Boolean(
        (hasJobTitles && hasSearchParam) || isImportedLeadsFlow
      );

      return { missingFields, canProceed };
    }
    ```
  - [x]5.2 Em `src/app/api/agent/executions/[executionId]/plan/route.ts`, atualizar `hasMinimumFields` (line 48):
    ```typescript
    const hasImportedLeads = briefing.importedLeads && briefing.importedLeads.length > 0;
    const hasMinimumFields = briefing && (
      briefing.technology ||
      (briefing.jobTitles && briefing.jobTitles.length > 0) ||
      hasImportedLeads
    );
    ```
  - [x]5.3 Em `src/app/api/agent/executions/[executionId]/confirm/route.ts`, mesma atualizacao (line 53):
    ```typescript
    const hasImportedLeads = briefing.importedLeads && briefing.importedLeads.length > 0;
    const hasMinimumFields = briefing && (
      briefing.technology ||
      (briefing.jobTitles && briefing.jobTitles.length > 0) ||
      hasImportedLeads
    );
    ```
  - [x]5.4 Em `src/hooks/use-briefing-flow.ts`, atualizar `generateBriefingSummary` (line 153-194):
    ```typescript
    // Story 17.11: imported leads summary
    if (briefing.skipSteps?.includes("search_companies") &&
        briefing.skipSteps?.includes("search_leads")) {
      const leadCount = briefing.importedLeads?.length ?? 0;
      lines.push(`Etapas de busca de empresas e leads serao puladas — ${leadCount} leads importados serao usados diretamente.`);
    } else if (briefing.skipSteps?.includes("search_companies")) {
      // existing Story 17.10 logic
    }
    ```
  - [x]5.5 Testes:
    - `__tests__/unit/api/agent/briefing-parse.test.ts`: canProceed=true com isImportedLeadsFlow mesmo sem jobTitles/technology
    - `__tests__/unit/api/agent/execution-plan.test.ts`: 200 com briefing contendo importedLeads (sem technology nem jobTitles)
    - `__tests__/unit/api/agent/execution-confirm.test.ts`: 200 com briefing contendo importedLeads

- [x]Task 6: CreateCampaignStep — aceitar leads importados (AC: #3, #5)
  - [x]6.1 Em `src/lib/agent/steps/create-campaign-step.ts`, refatorar `executeInternal` (line 74-86):
    ```typescript
    protected async executeInternal(input: StepInput): Promise<StepOutput> {
      const { briefing, previousStepOutput } = input;

      // Story 17.11: Imported leads flow (both search steps skipped)
      const isImportedLeadsFlow =
        briefing.skipSteps?.includes("search_companies") &&
        briefing.skipSteps?.includes("search_leads");

      let leads: SearchLeadResult[];

      if (isImportedLeadsFlow && briefing.importedLeads && briefing.importedLeads.length > 0) {
        leads = briefing.importedLeads;
      } else if (previousStepOutput) {
        const prevLeads = previousStepOutput.leads as SearchLeadResult[] | undefined;
        if (!prevLeads || !Array.isArray(prevLeads) || prevLeads.length === 0) {
          throw new Error("Lista de leads do step anterior e obrigatoria para criacao de campanha");
        }
        leads = prevLeads;
      } else {
        throw new Error("Output do step anterior e obrigatorio para criacao de campanha");
      }

      // ... rest of existing code from line 87 onwards (enrichment, KB, icebreakers, etc.)
    }
    ```
  - [x]6.2 Para leads importados SEM apolloId, o bloco de enrichment (lines 88-108) NAO fara nada — o `if (typedLead.apolloId && ...)` ja protege. Nenhuma alteracao necessaria no enrichment.
  - [x]6.3 Para icebreakers com dados insuficientes (AC: #5), o sistema ja suporta:
    - `generateSingleIcebreaker` (line 397-430) usa `lead.title ?? ""` e `lead.companyName ?? ""` — valores vazios ja passam para o prompt
    - O prompt `icebreaker_generation` ja gera icebreakers com base nos dados disponiveis
    - Se `name` e o unico dado, o icebreaker sera generico baseado no tom de voz (KB context)
    - **NENHUMA alteracao necessaria na geracao de icebreakers** — o fluxo existente ja trata campos null/empty
  - [x]6.4 Corrigir progress message hardcoded (line 116): substituir `/5` por contagem dinamica:
    ```typescript
    // Calcular activeSteps: total de steps nao-skipped
    const { data: allSteps } = await this.supabase
      .from("agent_steps")
      .select("status")
      .eq("execution_id", input.executionId);
    const activeSteps = allSteps?.filter(s => s.status !== "skipped").length ?? 5;
    const activeStepIndex = (allSteps?.filter(s =>
      s.status !== "skipped" && s.status !== "pending"
    ).length ?? 0) + 1;

    await this.supabase.from("agent_messages").insert({
      execution_id: input.executionId,
      role: "system",
      content: `Etapa ${activeStepIndex}/${activeSteps}: Criando campanha com emails personalizados para ${totalLeads} leads...`,
      metadata: { stepNumber: this.stepNumber, messageType: "progress" },
    });
    ```
  - [x]6.5 Testes: `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts`:
    - Teste: imported leads flow — briefing.importedLeads usado quando previousStepOutput=undefined
    - Teste: imported leads flow — leads sem apolloId NAO tentam enrichment
    - Teste: imported leads flow — icebreakers gerados com dados parciais (so nome + email)
    - Teste: imported leads flow — erro se briefing.importedLeads vazio E previousStepOutput undefined
    - Teste: fluxo normal com previousStepOutput — comportamento identico ao existente (regressao)
    - Teste: progress message usa contagem dinamica em vez de /5

- [x]Task 7: PlanGeneratorService — descricoes adaptadas (AC: #4)
  - [x]7.1 Em `src/lib/services/agent-plan-generator.ts`, atualizar `descriptionFn` do step `search_leads` (line 34-46):
    ```typescript
    descriptionFn: (b) => {
      if (b.skipSteps?.includes("search_leads")) {
        return "Etapa pulada — leads fornecidos pelo usuario";
      }
      if (b.skipSteps?.includes("search_companies")) {
        // existing Story 17.10 logic
      }
      // existing default logic
    },
    ```
  - [x]7.2 Atualizar `descriptionFn` do step `create_campaign` (line ~48-52):
    ```typescript
    descriptionFn: (b) => {
      if (b.skipSteps?.includes("search_leads") && b.importedLeads?.length) {
        return `Criar campanha com emails personalizados para ${b.importedLeads.length} leads importados`;
      }
      return "Criar campanha com emails personalizados para os leads encontrados";
    },
    ```
  - [x]7.3 Testes: `__tests__/unit/lib/services/agent-plan-generator.test.ts`:
    - Teste: skipSteps inclui "search_leads" → descricao "Etapa pulada"
    - Teste: create_campaign com importedLeads → descricao menciona quantidade de leads importados
    - Teste: descricao default sem skipSteps → comportamento existente (regressao)

- [x]Task 8: Testes de integracao do fluxo completo (AC: #1-#5)
  - [x]8.1 Criar `__tests__/unit/lib/agent/imported-leads-integration.test.ts`:
    - Teste E2E-style: briefing "ja tenho meus leads" → parser retorna skipSteps: ["search_companies", "search_leads"] → plano gerado com steps 1-2 skipped → usuario cola leads → validados → briefing salvo com importedLeads → confirm OK → orchestrator executa step 3 com briefing.importedLeads → CreateCampaignStep gera campanha com leads importados → output correto
  - [x]8.2 Verificar que `AgentStepProgress` ja renderiza corretamente (Story 17.7 implementou: skipped steps com line-through, activeSteps exclui skipped, numeracao dinamica) — NAO precisa de alteracao no componente, apenas validar que 2 steps skipped funciona (testado 1 step skipped na Story 17.10)
  - [x]8.3 Teste: orchestrator com steps 1 e 2 skipped → step 3 executa com previousStepOutput=undefined → orchestrator detecta allSkipped (Story 17.10 logica em orchestrator.ts line 136-151 ja cobre este caso com multiplos steps skipped)

## Dev Notes

### Padrao de Codigo Estabelecido
- **CSS**: Usar `flex flex-col gap-*` em vez de `space-y-*` (Tailwind v4 + Radix)
- **Idioma UI**: Portugues (BR) para todas as mensagens e labels
- **Testes**: Vitest, mocks centralizados em test utils, mirror de `src/` em `__tests__/unit/`
- **ESLint**: `no-console` enforced — usar logger ou remover console.log

### Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/agent/lead-import-parser.ts` | Parser de leads do texto do usuario (CSV/email/manual) |
| `__tests__/unit/lib/agent/lead-import-parser.test.ts` | Testes do parser |
| `__tests__/unit/lib/agent/imported-leads-integration.test.ts` | Testes de integracao |

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/types/agent.ts` | Adicionar `importedLeads?: SearchLeadResult[]` ao `ParsedBriefing` |
| `src/lib/agent/briefing-parser-service.ts` | Atualizar SYSTEM_PROMPT para detectar leads proprios |
| `src/hooks/use-briefing-flow.ts` | Novos status `awaiting_leads_input` + `confirming_leads`, handlers, helpers |
| `src/app/api/agent/briefing/parse/route.ts` | `analyzeBriefingCompleteness`: canProceed com imported leads flow |
| `src/app/api/agent/executions/[executionId]/briefing/route.ts` | Schema PATCH aceita importedLeads |
| `src/app/api/agent/executions/[executionId]/plan/route.ts` | hasMinimumFields aceita importedLeads |
| `src/app/api/agent/executions/[executionId]/confirm/route.ts` | hasMinimumFields aceita importedLeads |
| `src/lib/agent/steps/create-campaign-step.ts` | Dual input: previousStepOutput OU briefing.importedLeads + fix /5 hardcoded |
| `src/lib/services/agent-plan-generator.ts` | Descricoes adaptadas para search_leads e create_campaign |

### Arquivos de Teste a Criar/Atualizar

| Arquivo | Tipo |
|---------|------|
| `__tests__/unit/lib/agent/lead-import-parser.test.ts` | Criar (parser de leads) |
| `__tests__/unit/lib/agent/briefing-parser-service.test.ts` | Atualizar (skipSteps com ambos steps) |
| `__tests__/unit/hooks/use-briefing-flow.test.tsx` | Atualizar (novos status e handlers) |
| `__tests__/unit/api/agent/briefing-parse.test.ts` | Atualizar (canProceed com imported leads) |
| `__tests__/unit/api/agent/execution-plan.test.ts` | Atualizar (200 com importedLeads) |
| `__tests__/unit/api/agent/execution-confirm.test.ts` | Atualizar (200 com importedLeads) |
| `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` | Atualizar (dual input) |
| `__tests__/unit/lib/services/agent-plan-generator.test.ts` | Atualizar (descricoes) |
| `__tests__/unit/lib/agent/imported-leads-integration.test.ts` | Criar (integracao) |

### Arquivos que NAO Precisam Mudar
- `src/components/agent/AgentStepProgress.tsx` — Story 17.7 ja implementou visual de skipped (line-through, SkipForward icon, numeracao dinamica). Funciona com 1 ou N steps skipped
- `src/components/agent/AgentApprovalGate.tsx` — Gate de campanha funciona igual independente da origem dos leads
- `src/lib/agent/orchestrator.ts` — Story 17.10 ja corrigiu: quando TODOS os steps anteriores estao skipped, previousStepOutput fica undefined (line 136-151). Funciona com 2 steps skipped tambem
- `src/hooks/use-auto-trigger.ts` — Story 17.10 ja corrigiu: auto-trigger apos skipped steps funciona em guided e autopilot
- `src/types/apollo.ts` / `src/lib/services/apollo.ts` — NAO usados neste fluxo (sem busca Apollo)
- `src/lib/agent/steps/search-leads-step.ts` — Step inteiro e pulado, nao precisa de mudanca
- `src/lib/agent/steps/search-companies-step.ts` — Step inteiro e pulado, nao precisa de mudanca

### Decisao Arquitetural: Leads no briefing JSONB
Os leads importados serao armazenados em `briefing.importedLeads` (campo JSONB na tabela `agent_executions`). Justificativas:
- Briefing ja e JSONB — aceita arrays sem schema change no DB
- CreateCampaignStep ja recebe `input.briefing` — acesso direto sem query adicional
- Para volumes tipicos (10-200 leads), o tamanho do JSONB e aceitavel (~50KB para 200 leads)
- Se no futuro precisar suportar milhares de leads, migrar para tabela separada

### Orchestrator — Skip de Multiplos Steps (Ja Funciona)
O orchestrator.ts (line 136-151) verifica `prevSteps.every((s) => s.status === "skipped")`. Com 2 steps skipped:
- Step 3 executa → busca prevSteps (steps 1 e 2) → ambos skipped → allSkipped=true → previousStepOutput=undefined
- CreateCampaignStep recebe previousStepOutput=undefined → busca briefing.importedLeads
- **NENHUMA alteracao no orchestrator necessaria**

### Lead Import Parser — Estrategia de Deteccao de Formato
O parser tentara detectar o formato automaticamente:
1. Se primeira linha contem "email" (case-insensitive) → CSV com header → ignorar header, parsear rest
2. Para cada linha: split por separador (detectar: tab > ponto-e-virgula > virgula)
3. Identificar qual campo e email (contem @) → deduzir posicao dos outros campos
4. Fallback: se so tem 1 campo e contem @ → tratrar como email puro

### Icebreakers para Leads com Dados Parciais (AC: #5)
O fluxo de icebreakers em `generateSingleIcebreaker` (line 397-430) ja e resiliente:
- `lead_name`: sempre presente (extraido do email se necessario)
- `lead_title`: usa `lead.title ?? ""` — prompt recebe string vazia
- `lead_company`: usa `lead.companyName ?? ""` — prompt recebe string vazia
- O prompt `icebreaker_generation` gera um icebreaker generico quando dados sao escassos
- O tom de voz do KB (company/tone) ainda e usado como contexto
- **Resultado**: icebreaker funcional mesmo com so nome + email

### Bug Fix Incluido: Progress Message Hardcoded (Task 6.4)
`create-campaign-step.ts` line 116 hardcoda `"Etapa ${this.stepNumber}/5"`. No fluxo de leads importados, so tem 3 steps ativos. Mesmo no fluxo normal de skip empresas (Story 17.10), deveria ser `/4`. Story 17.10 corrigiu isso no SearchLeadsStep mas NAO no CreateCampaignStep.

### Learnings da Story 17.10
- Fluxo de skip: BriefingParserService detecta → skipSteps popula → PlanGenerator marca como skipped → orchestrator pula step → auto-trigger avanca
- Validacao nas rotas plan/confirm: Story 17.10 corrigiu para aceitar technology=null. Story 17.11 precisa aceitar jobTitles=[] tambem
- CreateCampaignStep lines 88-108: enrichment so roda com apolloId — safe para leads importados
- orchestrator allSkipped check: funciona com N steps skipped, nao so 1

### Git Intelligence (Ultimos commits relevantes)
- `a3f88ce` feat(story-17.10): pipeline flexivel — entrada direta em busca de leads + code review fixes
- `4c45941` fix(story-17.9): add accounts to campaign when activation is deferred
- `06962bd` feat(story-17.9): selecao de conta Instantly no export + code review fixes

### Project Structure Notes
- Alinhamento com estrutura unificada: steps em `src/lib/agent/steps/`, services em `src/lib/services/`, hooks em `src/hooks/`, tipos em `src/types/`
- **1 arquivo novo**: `src/lib/agent/lead-import-parser.ts` — parser puro (funcao, sem classe) na pasta de agent utilities
- Demais mudancas sao em arquivos existentes

### References
- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Epic 17 Story 11]
- [Source: _bmad-output/implementation-artifacts/17-10-pipeline-flexivel-entrada-direta-leads.md#Dev Notes]
- [Source: src/types/agent.ts#ParsedBriefing (line 73-82)]
- [Source: src/lib/agent/briefing-parser-service.ts#SYSTEM_PROMPT (line 43-64)]
- [Source: src/hooks/use-briefing-flow.ts#BriefingFlowStatus (line 23-31), generateBriefingSummary (line 153-194)]
- [Source: src/app/api/agent/briefing/parse/route.ts#analyzeBriefingCompleteness (line 49-82)]
- [Source: src/app/api/agent/executions/[executionId]/plan/route.ts#hasMinimumFields (line 48)]
- [Source: src/app/api/agent/executions/[executionId]/confirm/route.ts#hasMinimumFields (line 53)]
- [Source: src/lib/agent/steps/create-campaign-step.ts#executeInternal (line 74-86), enrichment (line 88-108), generateSingleIcebreaker (line 397-430)]
- [Source: src/lib/services/agent-plan-generator.ts#PIPELINE_STEPS descriptionFn]
- [Source: src/lib/agent/orchestrator.ts#allSkipped check (line 136-151)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Header detection fix in lead-import-parser: `isHeaderLine` matched "empresa" keyword inside email addresses. Fixed to check fields (after split) instead of raw substring, and skip lines containing `@`.
- Progress message `/5` hardcoded in CreateCampaignStep: changed to dynamic count via `agent_steps` query with Array.isArray fallback for robustness.

### Completion Notes List

- Task 1: Updated SYSTEM_PROMPT in BriefingParserService to detect imported leads intent (skipSteps: ["search_companies", "search_leads"]). 3 new tests.
- Task 2: Added `importedLeads?: SearchLeadResult[]` to ParsedBriefing type. Updated briefing PATCH route schema. 2 new tests.
- Task 3: Created `lead-import-parser.ts` — pure function parser supporting email-only, name+email, name+title+email, full CSV with header, tab/semicolon separators, deduplication, validation. 15 tests.
- Task 4: Added `awaiting_leads_input` and `confirming_leads` statuses to useBriefingFlow. Imported parseLeadInput, added formatLeadPreview and isImportedLeadsFlow helpers. 5 new tests.
- Task 5: Updated analyzeBriefingCompleteness to allow canProceed for imported leads flow. Updated hasMinimumFields in plan and confirm routes. Updated generateBriefingSummary for imported leads. 3 new tests.
- Task 6: Refactored CreateCampaignStep.executeInternal for dual input (previousStepOutput OR briefing.importedLeads). Fixed progress message hardcoded /5 to dynamic step count. 4 new tests.
- Task 7: Updated PlanGeneratorService descriptions for search_leads (skipped) and create_campaign (imported leads count). 3 new tests.
- Task 8: Created integration test file covering full E2E-style flow across all ACs. 7 tests.

### File List

**Created:**
- `src/lib/agent/lead-import-parser.ts`
- `__tests__/unit/lib/agent/lead-import-parser.test.ts`
- `__tests__/unit/lib/agent/imported-leads-integration.test.ts`

**Modified:**
- `src/types/agent.ts` — Added `importedLeads?: SearchLeadResult[]` to ParsedBriefing
- `src/lib/agent/briefing-parser-service.ts` — Updated SYSTEM_PROMPT for leads proprios detection
- `src/hooks/use-briefing-flow.ts` — New statuses, handlers, helpers for imported leads flow
- `src/app/api/agent/briefing/parse/route.ts` — canProceed accepts imported leads flow
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` — Schema accepts importedLeads
- `src/app/api/agent/executions/[executionId]/plan/route.ts` — hasMinimumFields accepts importedLeads
- `src/app/api/agent/executions/[executionId]/confirm/route.ts` — hasMinimumFields accepts importedLeads
- `src/lib/agent/steps/create-campaign-step.ts` — Dual input + dynamic progress message
- `src/lib/services/agent-plan-generator.ts` — Adapted descriptions
- `__tests__/unit/lib/agent/briefing-parser-service.test.ts` — 3 new tests
- `__tests__/unit/api/agent/briefing-update.test.ts` — 2 new tests
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — 5 new tests
- `__tests__/unit/api/agent/briefing-parse.test.ts` — 1 new test
- `__tests__/unit/api/agent/execution-plan.test.ts` — 1 new test
- `__tests__/unit/api/agent/execution-confirm.test.ts` — 1 new test
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` — 4 new tests + 2 CR fixes + 1 CR test
- `__tests__/unit/lib/services/agent-plan-generator.test.ts` — 3 new tests + 1 CR test
- `__tests__/unit/lib/agent/imported-leads-integration.test.ts` — CR fix: activeStepIndex assertion
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status updated

### Code Review Record (2026-03-28)

**Reviewer:** Amelia (Dev Agent) — Claude Opus 4.6

**Issues Found:** 4 Medium, 3 Low — **All Fixed**

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| M1 | MEDIUM | create-campaign-step.ts:133 | Off-by-one: `activeStepIndex` had extra `+1` causing "Etapa 2/3" instead of "Etapa 1/3" | Removed `+ 1` — filter already includes running step |
| M2 | MEDIUM | create-campaign-step.ts:93 | Error "Output do step anterior" wrong for imported leads with empty list | Added `isImportedLeadsFlow` branch with specific error message |
| M3 | MEDIUM | create-campaign-step.test.ts | 2 tests missing per Task 6.5 spec: enrichment skip + partial icebreakers | Added both tests |
| M4 | MEDIUM | imported-leads-integration.test.ts:171 | Assertion `toBe(2)` matched off-by-one bug | Fixed to `toBe(1)` and removed `+ 1` |
| L1 | LOW | use-briefing-flow.ts:586 | `state.briefing!` non-null assertion unsafe | Added null guard with early return |
| L2 | LOW | agent-plan-generator.ts:25-28 | `search_companies` description didn't handle skipped state | Added skipped check matching `search_leads` pattern |
| L3 | LOW | use-briefing-flow.ts:342 | Redundant `\|\| isImportedLeadsFlow()` in outer condition | Kept as defense-in-depth (reviewed, intentional) |

**Test Results:** 353 files, 6057 passed, 0 failed
