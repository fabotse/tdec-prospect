---
title: '24.22 — Dossiê visível na revisão e na oportunidade'
type: 'feature'
created: '2026-11-05'
status: review
baseline_commit: 'badafaf'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-24-19-dossie-da-conta.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-24-20-motivo-para-abordar-agora.md'
linear: 'FEL-45'
requisitos: 'FR36 · UX-DR6'
operator_actions:
  - "Depois do merge e do deploy, fazer o smoke de leitura (sem ativar nada no Instantly): abrir o painel de um lead na prévia da campanha de uma execução que já tem research_accounts e o painel de uma oportunidade de lead com e sem dossiê. Esta story não roda smoke em produção."
  - "No Linear, a FEL-45 vai para Review humano / PR com o PR aberto. Não marcar Done antes do merge e do smoke."
---

# Story 24.22: Dossiê visível na revisão e na oportunidade

Status: review

> **BLOQUEIO:** nenhum. **Não precisa de migration.** O painel só lê dados que já existem em produção:
> - `account_dossiers`, `account_dossier_facts` e `account_dossier_leads` (migration 00073, aplicada, com RLS de SELECT por tenant);
> - `agent_steps.output.whyNow` da linha `research_accounts` (24.20);
> - `leads.apollo_id` e `opportunities.lead_id`.
>
> Se a implementação concluir que precisa de migration, **parar**: escrever o motivo aqui, marcar `status: blocked` e não escrever a migration.

## Story

As a usuário do agente e vendedor,
I want ver o dossiê e o gatilho ao revisar leads e ao abrir uma oportunidade,
so that eu entenda o contexto da conta sem pesquisar de novo.

## Acceptance Criteria (do épico, com o detalhamento desta story)

1. **Given** a revisão de leads (`AgentLeadReview`, gate do `search_leads`) ou a revisão da campanha (`AgentCampaignPreview`, gate do `create_campaign`) do agente, **when** o usuário clica em "Dossiê" num lead, **then** abre um painel lateral (`Sheet`) com:
   - os **fatos** do dossiê da conta, cada um com texto, tipo, fonte (link seguro), data e confiança;
   - o **gatilho** "por que agora" do lead, ou "sem gatilho" com o motivo em linguagem simples;
   - a **hipótese de dor** do lead (só existe quando há gatilho).
2. **Given** uma oportunidade na Central (Epic 21, `/opportunities`) de um lead com dossiê, **when** o usuário clica em "Dossiê" no card, **then** abre o **mesmo** painel.
3. **Given** um lead sem dossiê (nunca pesquisado ou sem ligação), **when** o painel abre, **then** mostra "Sem pesquisa" e a ação "Gerar pesquisa" **desabilitada** ("em breve"), com o texto que explica que hoje a pesquisa é feita pelo agente na etapa "Pesquisa das Contas" (decisão D6).
4. **Given** qualquer falha na leitura (rede, 500, timeout, RLS, migration ausente, dados fora do formato), **when** o painel abre, **then** mostra um estado de erro ("Não foi possível carregar o dossiê" + botão "Tentar de novo", que só refaz a leitura). O resto da tela segue **igual**: seleção, aprovação, rejeição, edição, export, ativação e triagem de oportunidade.
5. **Given** o painel, **when** renderizado, **then** todo texto (fato, gatilho, hipótese, nome da empresa) é exibido como **texto puro** do React (sem `dangerouslySetInnerHTML`, sem markdown). Links só existem para `fonte_url` com protocolo `http:`/`https:`, com `target="_blank"` e `rel="noopener noreferrer"`. URL inválida aparece como texto "fonte inválida", sem link.
6. **Given** o painel aberto ou fechado, **when** o agente roda, **then** nada muda no pipeline:
   - o painel não grava nada;
   - não altera `agent_steps.output` nem o `previousStepOutput` do `create_campaign`;
   - não toca prompts, export, ativação, Instantly, filtros, ordem ou seleção de leads;
   - nenhuma leitura nova acontece antes do clique em "Dossiê", então as telas carregam como hoje.

## Decisões tomadas sem humano (modo não interativo, conservadoras)

- **D1 — Sem migration.** Os dados já existem (ver BLOQUEIO). O gatilho e a hipótese ficam só em `agent_steps.output.whyNow` (por execução). O painel os lê de lá, sem copiar para tabela nova.

- **D2 — Uma rota GET de leitura**, `GET /api/account-dossiers/lookup`, usada pelas três telas.
  - Usa o client de **sessão** (`createClient` de `@/lib/supabase/server`), para que a RLS da 00073 e a de `agent_executions` valham. **Nunca** service-role.
  - Toda query leva também `.eq("tenant_id", profile.tenant_id)` explícito (dupla barreira).
  - A rota não faz `INSERT`/`UPDATE`/`DELETE`, não chama LLM, Treg, Apify, Apollo nem Instantly e não grava em `api_usage_logs`, porque não há custo.

- **D3 — Como o lead é ligado ao dossiê** (ordem de resolução, a primeira que achar vence):
  0. **Identidade única e coerente (revisão Codex rodada 1).** Antes de qualquer casamento, a request vira **uma** identidade, sempre do mesmo lead:
     - **Com `leadId`:** ler o lead (`leads`, `.eq("id").eq("tenant_id")`, `select id, apollo_id, email`) e usar **só** o `apollo_id`/e-mail dele. Se a request trouxer `apolloId` ou `email` que divirjam do lead (ou que o lead não tenha), responder `none` ("Sem pesquisa"), sem ler ligação, execução ou dossiê. Lead inexistente/de outro tenant → `none`. Erro ao ler o lead → estado de erro (não casa por identificador não verificado).
     - **Sem `leadId`:** usar **um único** identificador, por prioridade: `apolloId`; se não houver, e-mail em minúsculo. O outro é ignorado (casamento, ligações e posts da D7).
     - Ligações (D3.2) e entradas do `whyNow` (D3.1/D3.2) que carreguem identificador de **outro** lead (mesmo campo presente dos dois lados e diferente: `lead_id`, `apolloId`/`lead_apollo_id`, e-mail) são descartadas.
  1. **Com `executionId`** (telas do agente): validar que a execução é do tenant. Ler a linha `research_accounts` mais recente daquela execução (`step_type = 'research_accounts'`, `order step_number desc limit 1`, `select output`). Em `output.whyNow.leads`, casar o lead da identidade D3.0 por `apolloId` e, se não casar, por e-mail em minúsculo (entrada com identificador divergente é descartada). Se o lead casar e tiver `dossierId`, usar esse dossiê e esse `whyNow`.
  2. **Ligação gravada** (`account_dossier_leads`, mais recente por `created_at`): uma query por identificador **da identidade D3.0**, com `.eq` (até três, todos do mesmo lead: `lead_id`, `lead_apollo_id`, `lead_email` minúsculo). Ligação com identificador de outro lead é ignorada. Junta tudo e pega a mais nova. Daí sai o `dossier_id` e o `execution_id`. O `whyNow` vem da linha `research_accounts` desse `execution_id`, depois de validar que a execução é do tenant. Se não vier, `whyNow = null` ("gatilho não avaliado").
  3. Nada encontrado → `status: 'none'` ("Sem pesquisa").

  **Proibido montar `.or(...)` com string vinda da request** (injeção de filtro PostgREST). Só `.eq`/`.in` com valores. **Não** casar por domínio da empresa nem por nome: o domínio do dossiê vem do Apollo e pode não bater com o do e-mail, e um falso positivo mostraria a pesquisa de outra empresa. O lado seguro é "Sem pesquisa".

- **D4 — Identificadores por tela:**
  - **Revisão de leads e prévia da campanha:** `executionId` (da mensagem), `apolloId` e `email` do lead do `previewData`. Esses leads ainda não têm `lead_id`. Na revisão de leads, o `research_accounts` da execução ainda não rodou (ele vem depois do gate), então o painel normalmente mostra um dossiê **anterior** ligado ao lead (D3.2) ou "Sem pesquisa", com a nota "A pesquisa desta execução roda depois que você aprovar os leads".
  - **Oportunidade:** `leadId` (`opportunity.lead.id`) e `email`. A rota lê `leads.apollo_id`/`email` por `id` + `tenant_id` e casa só pelos identificadores desse lead (D3.0); o `email` da request precisa bater com o do lead. Oportunidade sem `lead` não mostra o botão.

- **D5 — Dossiê antigo/expirado:** mostra o dossiê mais recente encontrado, mesmo expirado, com "Pesquisa de dd/mm/aaaa". Se `expires_at < agora`, mostra também o badge "Desatualizado". Nada é recalculado.

- **D6 — "Gerar pesquisa" fica desabilitada ("em breve")**, com o motivo registrado. A ação só poderia existir reaproveitando o código da 24.19 e da 24.20, e esse código hoje vive em métodos privados do `ResearchAccountsStep`:
  - `researchAccount`, `link` e `evaluateWhyNow` dependem de `RunState`, `executionId`, prazo duro do step e `logUsage` do step;
  - `research-accounts-step.ts` é arquivo proibido nesta story.

  Extrair isso exigiria refatorar o step que fica no caminho até o Instantly (Regra nº 1, ponto 3), além de abrir um **caminho novo de escrita** em produção (`account_dossiers`/`facts`/`leads`) e de custo (Treg + OpenAI) fora do pipeline. Ainda faltariam teto e estimativa próprios. Isso pede o OK do Fabossi e uma story própria. No painel: `Button disabled` com o rótulo "Gerar pesquisa (em breve)" e o texto "Hoje a pesquisa da conta é feita pelo agente, na etapa Pesquisa das Contas, quando os leads são aprovados." Sem link para iniciar execução (começar uma execução nova é outro fluxo, com custo, e não cabe aqui). Registrar em `deferred-work.md` como follow-up: "ação Gerar pesquisa sob demanda (24.22 D6)".

- **D7 — Posts de outra pessoa não aparecem.** Fatos `kind = 'post'` só entram no painel quando `lead_apollo_id`/`lead_email` (minúsculo) batem com o lead aberto. Os demais tipos (`site`, `news`, `job`, `technology`) são da conta e sempre aparecem.

- **D8 — Ordem e limite dos fatos:**
  - ordem: tipo (Notícia, Vaga, Post, Site, Tecnologia), depois data desc;
  - teto de exibição de 50 fatos (`DOSSIER_VIEW_MAX_FACTS`), com "e mais N fatos";
  - o fato de origem do gatilho é destacado (badge "Gatilho") quando `kind`+`fato`+`fonte_url` batem com `whyNow.trigger.fatoOrigem`.

- **D9 — Leitura preguiçosa.** O hook só busca com o painel aberto (`enabled: open`), com `staleTime` de 5 min, `retry: 1`, sem `refetchInterval` e sem Realtime. Nenhuma chamada nova no carregamento das telas nem no polling de 3 s do agente. A Central **não** ganha indicador "tem dossiê" no card, porque isso exigiria N leituras ou mexer no `GET /api/opportunities`. O botão "Dossiê" aparece sempre que há lead, e o estado aparece ao abrir.

- **D10 — Um Sheet por tela, controlado pelo pai**, no padrão dos dialogs da Central (`OpportunitiesPageContent`: um estado `dossierTarget` + um `<AccountDossierSheet>`). O botão do card usa `event.stopPropagation()` (o card expande no clique, `OpportunityCard.tsx:204-207`). No agente, o botão fica dentro da linha e **não** é afetado por `isDisabled`: ler é permitido mesmo depois de aprovar ou rejeitar.

- **D11 — Motivos de "sem gatilho" em linguagem simples** (mapa no componente, chaves de `WhyNowNoTriggerReason`, `src/types/agent.ts`):

  | Chave | Texto exibido |
  |---|---|
  | `not_researched` | "conta não pesquisada nesta execução" |
  | `no_eligible_facts` | "nenhum fato recente com confiança média ou alta" |
  | `low_confidence` | "fato fraco demais para virar gatilho" |
  | `disabled` | "avaliação desligada" |
  | `no_openai_key` | "sem chave da OpenAI configurada" |
  | `call_limit`, `budget`, `time_budget` | "limite da execução atingido" |
  | `llm_error`, `timeout`, `invalid_response`, `facts_unavailable` | "não foi possível avaliar" |
  | `llm_declined` | "nenhum fato serviu como motivo" |
  | desconhecido | "sem gatilho" |

  Quando `whyNow` é `null`, o texto é "gatilho não avaliado".

- **D12 — Sprint-status:** só a linha `24-22-...` muda para `ready-for-dev`. O `last_updated` **não** foi tocado nesta etapa, por instrução explícita da tarefa ("apenas a linha").

## Contrato da rota (DTO)

`GET /api/account-dossiers/lookup?executionId=<uuid>&leadId=<uuid>&apolloId=<str>&email=<str>`

- Pelo menos um entre `leadId`, `apolloId` e `email`, senão 400 `VALIDATION_ERROR`.
- `executionId` e `leadId`, se vierem, precisam ser UUID (mesma validação de `steps/[stepNumber]/approve/route.ts`), senão 400.
- `email` é cortado com `trim().toLowerCase()` e limitado a 320 caracteres. `apolloId` é limitado a 100 caracteres.
- Sem perfil → 401. `executionId` de outro tenant ou inexistente → 404, igual ao `GET .../steps`.
- Erro de banco em qualquer leitura → 500 `INTERNAL_ERROR` com mensagem genérica, sem detalhe do Postgres. O resto da tela não depende disso.

```ts
// src/types/account-dossier.ts (NOVO)
export type DossierViewFactKind = 'site' | 'news' | 'job' | 'technology' | 'post';
export interface DossierViewFact {
  kind: DossierViewFactKind;
  fato: string;
  /** Já validada no servidor (http/https) ou null. */
  fonteUrl: string | null;
  /** YYYY-MM-DD */
  data: string;
  confianca: 'baixa' | 'media' | 'alta';
  isTriggerSource: boolean;
}
export interface DossierViewWhyNow {
  status: 'trigger' | 'no_trigger';
  reason: string | null;          // WhyNowNoTriggerReason ou null
  gatilho: string | null;
  hipoteseDor: string | null;
  confianca: 'media' | 'alta' | null;
  fonteUrl: string | null;        // da fatoOrigem, validada
  data: string | null;
}
export type AccountDossierView =
  | { status: 'none' }
  | {
      status: 'found';
      dossier: {
        id: string;
        companyName: string | null;
        companyDomain: string;
        dossierStatus: 'complete' | 'partial' | 'empty';
        failedSources: string[];
        researchedAt: string;     // ISO
        expired: boolean;
      };
      facts: DossierViewFact[];   // já filtrados (D7), ordenados e cortados (D8)
      totalFacts: number;         // antes do corte
      whyNow: DossierViewWhyNow | null;  // null = não avaliado
    };
// Resposta: { data: AccountDossierView }
```

O DTO **não** leva `lead_apollo_id`/`lead_email` dos fatos nem nome ou e-mail de outros leads.

## Tasks / Subtasks

- [x] **T1 — Tipos** (AC 1, 5): criar `src/types/account-dossier.ts` com o contrato acima. Não alterar `src/types/agent.ts`, só importar `WhyNowOutput`/`LeadWhyNow`/`WhyNowNoTriggerReason` de lá.
- [x] **T2 — Montagem pura** (AC 1, 5): criar `src/lib/agent/dossier/dossier-view.ts`, sem I/O:
  - [x] `findLeadWhyNow(whyNow: unknown, ident: {apolloId?, email?}): LeadWhyNow | null`: lê `output.whyNow` de forma **defensiva** (output antigo, sem `whyNow` ou fora do formato → `null`) e casa por `apolloId`, depois por e-mail minúsculo.
  - [x] `toWhyNowView(entry: LeadWhyNow | null): DossierViewWhyNow | null`, com `fonteUrl` passada por `httpUrl` (`src/lib/agent/dossier/facts.ts:91`; esse import é só server-side).
  - [x] `buildDossierView({dossierRow, facts: DossierFact[], ident, whyNowEntry, now})`:
    - aplica D7 (posts só do lead) e D8 (ordem, `isTriggerSource`, corte em `DOSSIER_VIEW_MAX_FACTS = 50`);
    - `fonteUrl = httpUrl(fato.fonte_url)`;
    - `expired = expires_at < now`;
    - `dossierStatus`/`failedSources` são sanitizados (valor desconhecido vira `'partial'`/descartado).
- [x] **T3 — Leitura** (AC 1–4): criar `src/lib/agent/dossier/dossier-lookup.ts`. Só leitura, **nunca lança** e devolve `{ view } | { error }`.
  - [x] `lookupAccountDossier(supabase, tenantId, {executionId?, leadId?, apolloId?, email?}, now)`, seguindo D3:
    - execução validada por `agent_executions.select("id, tenant_id").eq("id", …).eq("tenant_id", tenantId)`;
    - `agent_steps` com `select("output")`, `.eq("execution_id")`, `.eq("step_type","research_accounts")`, `order step_number desc`, `limit 1`;
    - `account_dossier_leads` com `select("dossier_id, execution_id, created_at")`, uma query por identificador, `.eq("tenant_id")`, `order created_at desc`, `limit 1`;
    - `account_dossiers` com `select("id, company_domain, company_name, status, failed_sources, researched_at, expires_at")`, `.eq("id")`, `.eq("tenant_id")`, `.maybeSingle()`;
    - fatos via **`readDossierFacts`** (`src/lib/agent/dossier/repository.ts:197`, existente, sem alterar).
  - [x] Com `leadId` e sem `apolloId`: `leads.select("apollo_id").eq("id", leadId).eq("tenant_id", tenantId).maybeSingle()`. Erro aqui não derruba a busca: segue sem `apolloId`.
  - [x] Dossiê apontado mas inexistente/de outro tenant → segue para o próximo passo de D3. Se nada sobrar → `none`.
  - [x] Erro do `readDossierFacts` → `{ error }` (o painel mostra o estado de erro; não mostrar dossiê "vazio" falso).
- [x] **T4 — Rota** (AC 1–4, 6): criar `src/app/api/account-dossiers/lookup/route.ts` (GET), no molde de `src/app/api/agent/executions/[executionId]/steps/route.ts`:
  - [x] usar `getCurrentUserProfile` e `createClient` de sessão; validar os parâmetros (contrato acima);
  - [x] chamar `lookupAccountDossier` e devolver `{ data }`. Erro → 500 genérico com `console.error` do detalhe;
  - [x] o handler inteiro fica em try/catch → 500, nunca 200 com dado parcial inventado;
  - [x] `export const dynamic = "force-dynamic"`, se as outras rotas GET do projeto usarem (seguir o padrão encontrado);
  - [x] nenhum `POST`/`PATCH`/`DELETE` na rota.
- [x] **T5 — Hook** (AC 4, D9): criar `src/hooks/use-account-dossier.ts`:
  - [x] `useAccountDossier(target | null, { enabled })` com TanStack `useQuery`;
  - [x] `queryKey: ["account-dossier", executionId ?? null, leadId ?? null, apolloId ?? null, emailLower ?? null]`;
  - [x] `enabled: enabled && Boolean(target)`, `staleTime: 5 * 60_000`, `retry: 1`, `refetchOnWindowFocus: false`;
  - [x] `fetch` com `AbortSignal` do React Query; resposta não-ok → throw (vira `isError`).
- [x] **T6 — Componentes compartilhados** (AC 1–5): criar a pasta nova `src/components/dossier/`.
  - [x] `AccountDossierPanel.tsx`: recebe `{ view, isLoading, isError, onRetry, leadName, companyName, context: 'lead_review' | 'campaign' | 'opportunity' }` e renderiza os estados:
    - **Carregando:** `Skeleton`.
    - **Erro:** `Alert` com "Não foi possível carregar o dossiê" + `Button` "Tentar de novo" → `onRetry`.
    - **`none`:**
      - "Sem pesquisa";
      - `Button disabled` "Gerar pesquisa (em breve)" com o texto da D6;
      - no `context === 'lead_review'`, a nota da D4.
    - **`found`:**
      - cabeçalho com empresa/domínio, "Pesquisa de dd/mm/aaaa" e os badges "Desatualizado" (D5) e "Parcial" (`dossierStatus = 'partial'`, com as fontes que falharam);
      - seção **"Por que agora"**: gatilho + "Fonte: <host>" (link) + data + `Badge` de confiança. Sem gatilho, mostra o texto da D11;
      - seção **"Hipótese de dor"**: a pergunta, só quando há gatilho. Sem gatilho: "Sem hipótese de dor (sem gatilho)";
      - seção **"Fatos"**: lista em `ScrollArea`. Por fato: `Badge` do tipo (Notícia/Vaga/Post/Site/Tecnologia), texto, data dd/mm/aaaa, `Badge` de confiança (baixa/média/alta), link da fonte (host como rótulo) e o badge "Gatilho" quando `isTriggerSource`;
      - sem fatos: "Pesquisa sem fatos com fonte";
      - "e mais N fatos" quando `totalFacts > facts.length`.
    - Datas formatadas com `Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })` sobre `YYYY-MM-DD`, para não cair no dia anterior por fuso.
  - [x] Link seguro: o componente **revalida** no cliente com uma função pura local `safeHttpUrl(url)`:
    - `new URL` dentro de try, protocolo `http:`/`https:`, senão `null`;
    - não importar `facts.ts` no cliente, porque ele puxa `target-accounts`;
    - `<a href target="_blank" rel="noopener noreferrer">`, com rótulo = `hostname`;
    - inválida → texto "fonte inválida" sem `<a>`.
  - [x] `AccountDossierSheet.tsx`: recebe `{ open, onOpenChange, target: {executionId?, leadId?, apolloId?, email?, leadName, companyName} | null, context }`. Usa `Sheet side="right"` (padrão `LeadDetailPanel.tsx:682-688`) + `SheetHeader`/`SheetTitle` ("Dossiê — <empresa>") + `useAccountDossier(target, { enabled: open })` + `AccountDossierPanel`.
  - [x] Proibido `dangerouslySetInnerHTML`, `innerHTML` e renderizador de markdown nos três arquivos.
- [x] **T7 — Revisão de leads** (AC 1, 4, 6): `src/components/agent/AgentLeadReview.tsx`:
  - [x] Na célula "Nome" (`:684-706`), um `Button variant="ghost" size="sm" type="button"` com ícone `lucide-react` (`FileSearch`), texto "Dossiê" e `aria-label={\`Ver dossiê de ${lead.name}\`}`. Ele **não** usa `isDisabled`.
  - [x] Estado local `dossierLead` + um `<AccountDossierSheet>` fora da tabela, com `target = { executionId, apolloId: lead.apolloId, email: lead.email, leadName, companyName }` e `context="lead_review"`.
  - [x] **Preservar:** colunas, checkbox, `selectedIndices`, `toggleOne`, filtros, ordenação, `mergeFitScores`, os badges da 24.12/24.15/24.16, as chamadas `fetch-leads`/`approve`/`reject` e o payload `{ approvedData: { leads } }` byte a byte. O lead aberto não é selecionado nem desmarcado.
- [x] **T8 — Prévia da campanha** (AC 1, 4, 6): `src/components/agent/AgentCampaignPreview.tsx`:
  - [x] Na interface local `LeadIcebreaker` (`:34-40`), acrescentar `apolloId?: string | null; email?: string | null`. É só tipagem: o payload real já traz esses campos (`LeadWithIcebreaker`).
  - [x] Na linha de cada lead da lista de icebreakers (`:316-332`), o mesmo botão "Dossiê" + um `AccountDossierSheet` com `context="campaign"`.
  - [x] **Preservar:** colapso (`ICEBREAKER_COLLAPSE_THRESHOLD`), `CopyReviewBadge`, edição dos blocos, aprovar/rejeitar e todo o resto. Lead sem `apolloId` e sem `email` não mostra o botão.
- [x] **T9 — Central de oportunidades** (AC 2, 3, 4):
  - [x] `src/components/opportunities/OpportunityCard.tsx`: nova prop opcional `onOpenDossier?: (opportunity: OpportunityCardData) => void`. Quando houver `opportunity.lead` e a prop, renderizar `Button` "Dossiê" junto das ações do card, com `event.stopPropagation()`. **Não** chama `handleOpen` e **não** marca `new→viewed`. Sem a prop, o card é idêntico ao de hoje.
  - [x] `src/components/opportunities/OpportunitiesPageContent.tsx`: estado `dossierTarget: OpportunityCardData | null`, passar `onOpenDossier` aos cards e um `<AccountDossierSheet>` com `target = { leadId: lead.id, email: lead.email, leadName, companyName }` e `context="opportunity"`.
  - [x] **Preservar:** os filtros, a paginação, os dialogs de WhatsApp, telefone e parar sequência, o rascunho por IA, a triagem e o `GET /api/opportunities` (não alterar a rota nem o hook `use-opportunities.ts`).
- [x] **T10 — Testes (sem rede real)**: LLM, Treg, Apify, Apollo, Instantly e Supabase sempre mockados; `global.fetch` mockado nos componentes.
  - [x] `__tests__/unit/lib/agent/dossier/dossier-view.test.ts` (NOVO):
    - `findLeadWhyNow` (por apolloId, por e-mail com caixa mista, output antigo sem `whyNow`, formato inválido → null);
    - D7 (post de outro lead some, post do lead fica);
    - D8 (ordem, corte em 50, `totalFacts`, `isTriggerSource`);
    - `fonteUrl` `javascript:`/`data:`/relativa → `null`;
    - `expired`.
  - [x] `__tests__/unit/lib/agent/dossier/dossier-lookup.test.ts` (NOVO, `createChainBuilder`/`queue-supabase`):
    - D3.1 (execução + whyNow com dossierId);
    - D3.2 (por `lead_id`, por `apollo_id` lido de `leads`, por e-mail minúsculo; mais recente vence);
    - D3.3 `none`;
    - execução de outro tenant ignorada;
    - erro de `readDossierFacts` → `error`;
    - **todas** as queries com `tenant_id` (asserção nas chamadas `.eq`);
    - nenhuma chamada a `.or(`, `.insert`, `.update`, `.delete` ou `.upsert` (asserção).
  - [x] `__tests__/unit/app/api/account-dossiers/lookup.test.ts` (NOVO, molde de `__tests__/unit/app/api/agent/executions/steps/reject.test.ts`): 401, 400 (sem identificador, UUID inválido), 404 (execução de outro tenant), 200 `found`/`none`, 500 genérico sem vazar mensagem do banco.
  - [x] `__tests__/unit/components/dossier/AccountDossierPanel.test.tsx` (NOVO):
    - cada estado (carregando, erro + "Tentar de novo" chama `onRetry`, `none` com botão **desabilitado**, `found` com gatilho, sem gatilho com o texto da D11, `whyNow` null);
    - link com `rel="noopener noreferrer"` e `target="_blank"`;
    - `javascript:alert(1)` sem `<a>`;
    - fato com `<script>`/`<b>`/`**md**` aparece como texto literal (nenhum elemento `script`/`b` criado);
    - datas dd/mm/aaaa sem deslocamento de fuso.
  - [x] `AgentLeadReview.test.tsx`: o botão "Dossiê" abre o painel (fetch para `/api/account-dossiers/lookup` com `executionId`/`apolloId`/`email`). Antes do clique, **nenhum** fetch para essa rota. Falha 500 do dossiê não muda a seleção, e o approve envia o **mesmo** payload de antes. Os testes existentes ficam verdes **sem mudar expectativa**.
  - [x] `AgentCampaignPreview.test.tsx`: botão e painel; aprovar segue igual; testes existentes sem mudança de expectativa.
  - [x] `__tests__/unit/components/opportunities/OpportunityCard.test.tsx`:
    - sem `onOpenDossier`, o card fica igual (sem botão);
    - com a prop, o clique chama o callback e **não** expande nem dispara o PATCH `viewed` nem a sugestão.
  - [x] Teste do `OpportunitiesPageContent`, se existir; se não, cobrir a abertura do Sheet pela página no teste do card ou num teste novo pequeno.
- [x] **T11 — Verificação e Regra nº 1** (obrigatório antes de dar por concluída):
  - [x] `npm run lint` (0 erros), `npm run typecheck` e `npm run test:run`, todos verdes.
  - [x] Diff vazia nos arquivos proibidos: `git diff main -- src/lib/agent/steps/ src/lib/agent/orchestrator.ts src/lib/agent/dossier/repository.ts src/lib/agent/dossier/why-now.ts src/lib/agent/dossier/config.ts 'src/lib/services/instantly*' src/app/api/opportunities/ src/hooks/use-opportunities.ts src/hooks/use-agent-execution.ts supabase/ src/types/agent.ts` → **vazio**.
  - [x] `grep -rn "dangerouslySetInnerHTML" src/components/dossier` → vazio.
  - [x] Preencher as **Completion Notes da Regra nº 1** (checklist abaixo).
  - [x] Registrar o follow-up da D6 em `_bmad-output/implementation-artifacts/deferred-work.md`.
  - [x] Commit sem `--no-verify`. No Linear, comentário com branch, SHA, checks e próximo dono. Com o PR aberto, a FEL-45 vai para **Review humano / PR**.

### Checklist das Completion Notes (Regra nº 1 do AGENTS.md/CLAUDE.md)

- [x] **O que pode ter mudado para o cliente:** listar os arquivos tocados e confirmar o que **não** mudou:
  - rotas: 1 GET nova de leitura (`/api/account-dossiers/lookup`) e nenhuma rota existente alterada;
  - prompts: nenhum;
  - tabelas: nenhuma nova; só `SELECT` em `account_dossiers`, `account_dossier_facts`, `account_dossier_leads`, `agent_executions`, `agent_steps` e `leads`;
  - jobs: nenhum (`pg_cron` intocado);
  - integrações: nenhuma chamada externa nova (sem LLM, Treg, Apollo nem Instantly);
  - UI: botão "Dossiê" + painel lateral em `AgentLeadReview`, `AgentCampaignPreview` e `OpportunityCard`.
- [x] **Ponto 1 — campanhas rodando, webhook e `reply-sweep`:** confirmar por análise da diff que nada desses caminhos foi tocado (nenhum arquivo de webhook, tracking, `reply-sweep`, Edge Function ou Instantly).
- [x] **Ponto 2 — busca de leads:** confirmar por análise da diff que `search_companies`/`search_leads`, as rotas `fetch-leads`/Apollo e as buscas manuais não foram tocadas. No `AgentLeadReview`, só a apresentação ganhou o botão; os testes existentes seguem sem mudança de expectativa.
- [x] **Ponto 3 — criação, export e ativação:** diff vazia nos arquivos de T11. Payload do approve e da prévia idêntico (testes). Nada novo no caminho até o Instantly, nenhum lead filtrado ou bloqueado e nenhum atraso no fluxo (leitura só no clique).
- [x] **Dizer qual verificação foi feita:** análise da diff + testes mockados. Sem smoke real nesta story (proibido rodar contra produção). O smoke de leitura fica em `operator_actions`, para depois do merge.
- [x] **Se algum dos 3 pontos puder ser afetado:** parar e avisar o Fabossi antes de seguir (esperado: nenhum, porque a mudança é só de leitura e exibição).

## Dev Notes

### Estado atual dos arquivos que mudam (ler inteiros antes de editar)

- **`src/components/agent/AgentLeadReview.tsx`** (gate do `search_leads`).
  - Props (`:51-71`): `data { totalFound, leads, jobTitles, … }`, `executionId`, `stepNumber`, `totalSteps`, `onAction?`, `rejected?`.
  - `LeadPreview` (`:34-49`) já tem `apolloId?` e `email`.
  - A tabela fica em `max-h-64 overflow-auto` (`:636-714`); a key é `${lead.name}-${lead.email ?? index}`.
  - Fit badge (`:668-680`), `EmailUnverifiedWarning` (`:682`), "Já contatado"/"Órgão público" (`:687-700`).
  - Rotas: `fetch-leads` (`:243`), `approve` (`:283-291`), `reject` (`:316`).
  - Hoje nenhum lead "abre". Renderizado por `AgentMessageBubble.tsx:163-172` com `executionId = message.execution_id`.
- **`src/components/agent/AgentCampaignPreview.tsx`** (gate do `create_campaign`).
  - `CampaignPreviewData` (`:42-58`) traz `leadsWithIcebreakers`.
  - A interface local `LeadIcebreaker` (`:34-40`) é mais estreita que o payload real (`LeadWithIcebreaker extends SearchLeadResult`, `src/types/agent.ts`).
  - Lista com colapso por `Button` + `useState` (`:72`, `:92-94`, `:291-335`); `CopyReviewBadge` em `:212`.
- **`src/components/opportunities/OpportunityCard.tsx`** (587 linhas).
  - O card inteiro tem `onClick={handleOpen}` (`:204-207`). `handleOpen` (`:150-174`) alterna `expanded`, marca `new→viewed` e gera o rascunho.
  - **Toda ação filha precisa de `stopPropagation`** (comentário em `:17-18`).
  - Props em `:52-73`.
- **`src/components/opportunities/OpportunitiesPageContent.tsx`**: lista de `OpportunityCard` (`:213-225`) e os dialogs compartilhados por página (`WhatsAppComposerDialog` `:286`, `PhoneLookupDialog` `:311`, `StopSequenceDialog` `:328`; estados em `:63`, `:65`, `:98`). O Sheet do dossiê segue esse padrão.
- `OpportunityCardData.lead` (`src/hooks/use-opportunities.ts:27-38`) tem `id`, `email`, `companyName`, `title`, mas não `apollo_id` nem domínio (D4).

### Dados (somente leitura)

- **00073** (`supabase/migrations/00073_create_account_dossiers.sql`):
  - `account_dossiers` (`id`, `tenant_id`, `company_domain`, `company_name`, `status complete|partial|empty`, `failed_sources text[]`, `execution_id`, `researched_at`, `expires_at`);
  - `account_dossier_facts` (`dossier_id`, `tenant_id`, `kind`, `fato`, `fonte_url` com CHECK `^https?://`, `data date`, `confianca`, `lead_apollo_id`, `lead_email`);
  - `account_dossier_leads` (`dossier_id`, `tenant_id`, `execution_id`, `lead_id` nullable, `lead_apollo_id`, `lead_email` minúsculo);
  - RLS de SELECT por `get_current_tenant_id()` nas três.
- **`linkLeads`** (`repository.ts:251`) resolve `lead_id` só se o lead **já existia** em `leads` no momento da pesquisa. Leads novos do agente são persistidos depois, no `create_campaign`, e ficam com `lead_id = NULL` na ligação. Por isso o casamento por `apollo_id`/e-mail (D3.2) é obrigatório, não opcional.
- **`whyNow`** (`ResearchAccountsOutput.whyNow`, `src/types/agent.ts:438-560`): `leads[]` com `apolloId`, `email` (minúsculo), `dossierId`, `status`, `reason?` e `trigger?`. O `trigger` tem `gatilho` (texto determinístico do fato), `hipoteseDor` (pergunta), `confianca` e `fatoOrigem` (cópia do fato com `fonte_url`).
  - Outputs anteriores à 24.20 não têm `whyNow`: tratar como `null` ("gatilho não avaliado").
  - O `research_accounts` é sempre ignorado como "step anterior" pelo orchestrator (`orchestrator.ts:150-172`). Ler esse output na rota nova não interfere nisso.
- `readDossierFacts` (`repository.ts:197`) já filtra por `dossier_id` + `tenant_id`, nunca lança e descarta linhas fora do formato. **Reusar**, não duplicar.
- `httpUrl` (`facts.ts:91`) é o validador de URL do servidor. No cliente, função local equivalente (T6).

### Guardrails

- **Regra nº 1:** a story é só de leitura e exibição. Se em algum momento parecer necessário tocar `research-accounts-step.ts`, `create-campaign-step.ts`, `export-step.ts`, `activate-step.ts`, `orchestrator.ts`, serviços do Instantly, `supabase/`, `pg_cron`, Edge Functions, env ou secrets: **parar** e registrar no topo (BLOQUEIO).
- **Tenant:** dupla barreira (RLS da sessão + `.eq("tenant_id")`). Nenhum `createServiceClient`/service-role na rota.
- **Sem injeção de filtro:** só `.eq`/`.in` com valores, nunca `.or()`/`.filter()` com string montada a partir da request.
- **XSS:** texto como filho de JSX; links só `http(s)` revalidados no cliente; `rel="noopener noreferrer"`.
- **Desempenho:** leitura só no clique (D9). Não adicionar nada ao polling de 3 s do `use-agent-execution.ts` nem ao `GET /api/opportunities`.
- **Acessibilidade:** botão com `aria-label`; o `Sheet` do shadcn já cuida do foco e do Esc. Título do Sheet obrigatório (`SheetTitle`).
- **UI:** shadcn existente em `src/components/ui` (`sheet`, `badge`, `button`, `scroll-area`, `skeleton`, `alert`, `card`, `tooltip`). Não existem `collapsible`/`accordion`/`popover`: não instalar componentes novos. Ícones de `lucide-react` (já usado). Textos em pt-BR **com** acentos na UI (padrão das telas), sem emojis.

### Testes

- Vitest + Testing Library. Mocks em `__tests__/helpers` (`mock-supabase.ts`: `createChainBuilder`, `createMockSupabaseClient`, `mockTableResponse`; `queue-supabase.ts`).
- Rotas: `vi.mock("@/lib/supabase/tenant")` e `vi.mock("@/lib/supabase/server")`, como em `__tests__/unit/app/api/agent/executions/steps/reject.test.ts`.
- Componentes que usam React Query: envolver em `QueryClientProvider` com `retry: false` no teste.
- Nenhum teste toca rede (LLM, Treg, Apify, Apollo, Instantly, Supabase).

### Project Structure Notes

- **Novos:**
  - `src/types/account-dossier.ts`;
  - `src/lib/agent/dossier/dossier-view.ts` e `src/lib/agent/dossier/dossier-lookup.ts` (junto do dossiê, só leitura);
  - `src/app/api/account-dossiers/lookup/route.ts`;
  - `src/hooks/use-account-dossier.ts`;
  - `src/components/dossier/AccountDossierPanel.tsx` e `src/components/dossier/AccountDossierSheet.tsx`. A pasta é nova porque o painel é compartilhado entre agente e oportunidades.
- **Alterados:** `AgentLeadReview.tsx`, `AgentCampaignPreview.tsx`, `OpportunityCard.tsx`, `OpportunitiesPageContent.tsx`, `deferred-work.md` e os testes.
- **Intocados:** `AgentMessageBubble.tsx` (já repassa `executionId`), `AgentActivationGate.tsx`, `LeadDetailPanel.tsx`, todo `src/lib/agent/steps/`, `orchestrator.ts`, `src/lib/agent/dossier/{repository,why-now,config,facts,budget,icebreaker-posts}.ts`, `src/types/agent.ts`, rotas de oportunidades e `supabase/`.

### Inteligência das stories anteriores

- **24.19:** o dossiê é fail-open e ligado ao **domínio** e aos leads (`account_dossier_leads`). O reuso pega só `complete` não expirado. Fatos sem fonte nunca entram. E-mail sempre comparado em minúsculo (lição da revisão).
- **24.20:** o gatilho é determinístico (`"<Noticia|Vaga|Post>: <fato>"`). Só a hipótese é texto da LLM, e passou por validação (pergunta, sem URL, sem número inventado). Fatos com sinal de injeção não viram gatilho, mas continuam gravados no dossiê, então **podem aparecer no painel como fato**. Por isso a regra de texto puro (AC 5) é obrigatória, e um teste com conteúdo malicioso também.
- **24.20 D7:** a "visibilidade na revisão" da 24.20 foi só a mensagem-resumo do `research_accounts` no chat. A 24.22 é o painel por lead e **não** muda aquela mensagem.
- **24.12/24.16:** badges novos na revisão entraram sem mudar seleção nem payload. Mesmo cuidado aqui.

### Git

- Base: `main` em `badafaf`, branch `feat/fel-45-dossie-visivel`. Recentes: 24.20 (PR #28, `b878995`) e 24.19 (PR #22). Nenhuma lib nova: `@tanstack/react-query`, `lucide-react` e shadcn já estão no projeto. Não foi preciso pesquisa web.

### References

- [Source: _bmad-output/planning-artifacts/epics-23-25-plataforma-agente-3.0-radar.md#Story 24.22] (FR36, UX-DR6, NFR8, NFR9)
- [Source: _bmad-output/implementation-artifacts/spec-24-19-dossie-da-conta.md]
- [Source: _bmad-output/implementation-artifacts/spec-24-20-motivo-para-abordar-agora.md#Tipos (contrato do output…)]
- [Source: supabase/migrations/00073_create_account_dossiers.sql]
- [Source: src/lib/agent/dossier/repository.ts#readDossierFacts, #linkLeads]
- [Source: src/app/api/agent/executions/[executionId]/steps/route.ts] (molde de rota GET com tenant)
- [Source: CLAUDE.md#Regra nº 1]

## Verification

**Commands:**
- `npm run lint`: esperado 0 erros (warnings anteriores toleradas).
- `npm run typecheck`: esperado limpo.
- `npm run test:run`: esperado tudo verde, inclusive os testes novos.
- `git diff main -- <lista de T11>`: esperado vazio.

## Dev Agent Record

### Agent Model Used

(create-story: Claude Opus 5.5 `claude-opus-5-5`, Claude Code, modo não interativo, 2026-11-05, máquina Eden)
(dev-story: Claude Opus 5.5 `claude-opus-5-5`, Claude Code, modo não interativo, 2026-11-05, máquina Eden)

### Debug Log References

- `agent_steps` **não tem** coluna `tenant_id` (migration 00048). A leitura do `research_accounts` só acontece depois de `agent_executions` ser validada com `.eq("id").eq("tenant_id")` e conferida em código (`row.tenant_id === tenantId`), além da RLS da sessão. O teste de lookup afirma `.eq("tenant_id")` em todas as tabelas que têm a coluna.
- Os testes antigos de `AgentLeadReview`/`AgentCampaignPreview` renderizam **sem** `QueryClientProvider`. Para não mudar nenhuma expectativa nem exigir provider, o hook do dossiê vive num corpo que só monta dentro do `SheetContent` (que não existe com o Sheet fechado). Efeito colateral desejado: nenhuma leitura antes do clique (D9).
- Execução de outro tenant: o lookup encerra cedo (`{ view: none, executionNotFound: true }`), sem ler steps nem ligações, e a rota responde 404.
- D3.2: o `whyNow` lido da execução da ligação só é usado se `entry.dossierId === dossier.id` (gatilho avaliado para outro dossiê não aparece; vira "gatilho não avaliado").
- Os `ECONNREFUSED 127.0.0.1:3000` no log do Vitest já existem no baseline (15 ocorrências antes e depois, nos mesmos arquivos; requisição a localhost de testes antigos, sem rede externa).
- Lint em todos os arquivos tocados: 0 erros e 0 warnings (os 134 warnings do `npm run lint` são anteriores).
- Nenhuma rota GET do projeto usa `export const dynamic`; o padrão encontrado foi seguido (sem a linha).

### Completion Notes List

- create-story: análise de contexto concluída e guia completo para o dev criado. A story não implementa código nesta etapa.
- review-fix (Codex rodada 1): 3 bloqueios corrigidos. (1) D3.0: identidade única e coerente — com `leadId` só valem o `apollo_id`/e-mail do lead (divergência → "Sem pesquisa"); sem `leadId`, um único identificador (`apolloId`, depois e-mail); ligações e entradas do `whyNow` com identificador de outro lead são descartadas, inclusive no caminho da execução. (2) DTO validado com zod no hook (`parseAccountDossierView`); resposta fora do formato vira erro local com "Tentar de novo"; painel envolto em `DossierPanelErrorBoundary` dentro do Sheet. (3) Prazo limite de 10 s (`ACCOUNT_DOSSIER_TIMEOUT_MS`) combinado com o `signal` do React Query (`AbortController` + `Promise.race`); timeout não é repetido automaticamente, vira erro com "Tentar de novo", e a nova tentativa funciona. Durante a nova tentativa o painel mostra "carregando".
- review-fix — checks: `npm run lint` 0 erros (134 warnings, todos pré-existentes; 0 nos arquivos tocados); `npm run typecheck` limpo; `npm run test:run` 474 arquivos, 9355 testes passando, 2 skipped, 0 falhas.
- review-fix — Regra nº 1: continua só leitura e exibição. Mudanças só em `dossier-lookup.ts` (uma coluna a mais no `select` de `leads` e de `account_dossier_leads`, ambas existentes na 00010/00073; só `.eq`), no hook e no Sheet do dossiê. Os 3 pontos seguem OK **por análise da diff** (nenhum arquivo do caminho até o Instantly, de busca de leads, webhook ou `reply-sweep` tocado; diff vazio nos proibidos de T11). Efeito visível possível: na revisão/prévia, lead com `apolloId` agora casa só por `apolloId` (antes também por e-mail) — pode mostrar "Sem pesquisa" onde antes casava só pelo e-mail; lado seguro, só no painel.
- dev-story: T1–T11 implementadas. Sem migration, nada em `supabase/`. Botão "Dossiê" + Sheet lateral na revisão de leads, na prévia da campanha e no card de oportunidade; uma rota GET de leitura.
- Decisões menores (conservadoras):
  - na revisão de leads, lead sem `apolloId` e sem `email` também não mostra o botão (a rota exigiria um identificador e devolveria 400), igual à prévia da campanha;
  - fato com `kind`/`confianca` desconhecidos é descartado da visão (o `readDossierFacts` só faz cast);
  - `researchedAt` (timestamp) é formatado no fuso de São Paulo; datas `YYYY-MM-DD` (fatos e gatilho) em UTC, sem deslocamento.
- Checks: `npm run lint` 0 erros (134 warnings, todos pré-existentes); `npm run typecheck` limpo; `npm run test:run` 473 arquivos, 9340 testes passando, 2 skipped, 0 falhas.
- Follow-up da D6 registrado em `deferred-work.md` (DW-34).

#### Regra nº 1 — checklist

- **Verificação feita:** **análise da diff + testes mockados.** Sem smoke real (proibido rodar contra produção nesta story). O smoke de leitura fica em `operator_actions`, para depois do merge.
- **O que pode ter mudado para o cliente:**
  - rotas: 1 GET nova de leitura (`/api/account-dossiers/lookup`), só exporta `GET` (teste afirma). Nenhuma rota existente alterada (`git diff main -- src/app/api/opportunities/` vazio; nenhuma rota do agente tocada);
  - prompts: nenhum;
  - tabelas: nenhuma nova; só `SELECT` em `account_dossiers`, `account_dossier_facts` (via `readDossierFacts` existente), `account_dossier_leads`, `agent_executions`, `agent_steps` e `leads`. Client de sessão (RLS), `.eq("tenant_id")` em toda tabela com a coluna, sem `.or()`/`.filter()`, sem `insert`/`update`/`delete`/`upsert` (asserções no teste de lookup);
  - jobs: nenhum (`pg_cron` intocado); Edge Functions, secrets e env intocados;
  - integrações: nenhuma chamada externa nova (sem LLM, Treg, Apify, Apollo nem Instantly); nada gravado em `api_usage_logs`;
  - UI: botão "Dossiê" + painel lateral em `AgentLeadReview`, `AgentCampaignPreview` e `OpportunityCard` (via `OpportunitiesPageContent`). Leitura só ao abrir o painel (testes afirmam zero fetch antes do clique).
- **Ponto 1 — campanhas rodando, webhook e `reply-sweep`:** OK por análise da diff. Nenhum arquivo de webhook, tracking, `reply-sweep`, Edge Function ou serviço do Instantly foi tocado (`git diff main -- 'src/lib/services/instantly*' supabase/` vazio).
- **Ponto 2 — busca de leads:** OK por análise da diff. `search_companies`/`search_leads` (`src/lib/agent/steps/` com diff vazio), rotas `fetch-leads`/Apollo e buscas manuais não foram tocadas. No `AgentLeadReview` só a apresentação ganhou o botão; os 62 testes antigos seguem verdes sem mudança de expectativa, e o teste novo prova que abrir o dossiê (inclusive com 500) não muda a seleção.
- **Ponto 3 — criação, export e ativação:** OK por análise da diff + testes. Diff vazio nos arquivos proibidos de T11 (`src/lib/agent/steps/`, `orchestrator.ts`, `dossier/{repository,why-now,config,facts,budget,icebreaker-posts}.ts`, `instantly*`, `src/app/api/opportunities/`, `use-opportunities.ts`, `use-agent-execution.ts`, `supabase/`, `src/types/agent.ts`, `AgentMessageBubble.tsx`, `AgentActivationGate.tsx`, `LeadDetailPanel.tsx`). Payload do approve da revisão (`{ approvedData: { leads } }`, inclusive e-mail em caixa mista intacto) e da prévia (`{ approvedData: { emailBlocks } }`) idêntico, comparado byte a byte nos testes. Nenhum lead filtrado ou bloqueado e nenhum atraso no fluxo.
- **Algum dos 3 pontos pode ser afetado?** Não. A mudança é só de leitura e exibição; nada a escalar ao Fabossi.

### File List

Novos:
- `src/types/account-dossier.ts`
- `src/lib/agent/dossier/dossier-view.ts`
- `src/lib/agent/dossier/dossier-lookup.ts`
- `src/app/api/account-dossiers/lookup/route.ts`
- `src/hooks/use-account-dossier.ts`
- `src/components/dossier/AccountDossierPanel.tsx`
- `src/components/dossier/AccountDossierSheet.tsx`
- `__tests__/unit/lib/agent/dossier/dossier-view.test.ts`
- `__tests__/unit/lib/agent/dossier/dossier-lookup.test.ts`
- `__tests__/unit/app/api/account-dossiers/lookup.test.ts`
- `__tests__/unit/components/dossier/AccountDossierPanel.test.tsx`
- `src/components/dossier/DossierPanelErrorBoundary.tsx` (review-fix rodada 1)
- `__tests__/unit/components/dossier/AccountDossierSheet.test.tsx` (review-fix rodada 1)

Alterados no review-fix (rodada 1): `src/lib/agent/dossier/dossier-lookup.ts`, `src/hooks/use-account-dossier.ts`, `src/components/dossier/AccountDossierSheet.tsx`, `__tests__/unit/lib/agent/dossier/dossier-lookup.test.ts`, esta story.

Alterados:
- `src/components/agent/AgentLeadReview.tsx`
- `src/components/agent/AgentCampaignPreview.tsx`
- `src/components/opportunities/OpportunityCard.tsx`
- `src/components/opportunities/OpportunitiesPageContent.tsx`
- `__tests__/unit/components/agent/AgentLeadReview.test.tsx` (só bloco novo no fim)
- `__tests__/unit/components/agent/AgentCampaignPreview.test.tsx` (só bloco novo no fim)
- `__tests__/unit/components/opportunities/OpportunityCard.test.tsx` (só bloco novo no fim)
- `__tests__/unit/components/opportunities/OpportunitiesPageContent.test.tsx` (só bloco novo no fim)
- `_bmad-output/implementation-artifacts/deferred-work.md` (DW-34)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (só a linha 24-22 → `review`)
- `_bmad-output/implementation-artifacts/spec-24-22-dossie-visivel-na-revisao-e-na-oportunidade.md`

### Review Triage Log

- 2026-11-05 — Codex rodada 1 (commit `4b42c5d`), veredito PRECISA CORRIGIR:
  1. **Identificadores conflitantes** (`dossier-lookup.ts` ~155/~188): `leadId`, `apolloId` e `email` de leads diferentes podiam mostrar o dossiê/posts de B no painel de A. **Aceito e corrigido** (D3.0). Testes: leadId de A + e-mail de B; leadId de A + apolloId de B; apolloId sem `apollo_id` no lead; lead inexistente; execução + identificadores conflitantes (whyNow nem é lido); sem leadId com apolloId de A + e-mail de B (só liga por apolloId, post de B não aparece); ligação por e-mail gravada para outro `apollo_id`; entrada do whyNow casada por e-mail com `apolloId` de outro lead; caso coerente com e-mail em outra caixa.
  2. **DTO sem validação estrutural** (`use-account-dossier.ts` ~40): **aceito e corrigido** (zod + error boundary local). Testes: HTTP 200 com `{status:"found"}` incompleto → erro local e nova tentativa carrega; exceção de render contida com a tela hospedeira de pé.
  3. **Sem prazo limite** (`use-account-dossier.ts` ~36): **aceito e corrigido** (10 s). Teste com fetch que nunca resolve (fake timers): erro, sinal abortado, sem retry automático, e "Tentar de novo" carrega.
  - Itens OK do relatório (somente leitura, escopo, exibição segura, Regra nº 1) sem ação.

### Spec Change Log

- 2026-11-05 — D3 ganhou o passo **D3.0** (identidade única e coerente); D3.1/D3.2 passam a casar só pela identidade D3.0 e descartam ligação/entrada com identificador de outro lead; D4 (oportunidade) agora lê `apollo_id` **e** `email` do lead e exige que o `email` da request bata. Motivo: revisão Codex rodada 1, item 1 (nunca mostrar pesquisa de outra empresa por combinação de parâmetros). Mudança de comportamento registrada nas Completion Notes.
- 2026-11-05 — AC4 (estados de erro) reforçado no cliente: validação estrutural do DTO, error boundary local e prazo limite de 10 s. Motivo: revisão Codex rodada 1, itens 2 e 3.

### Change Log

- 2026-11-05: implementação da 24.22 (dossiê visível na revisão e na oportunidade); status → review.
- 2026-11-05: review-fix Codex rodada 1 (D3.0 identidade coerente, DTO validado + error boundary, timeout de 10 s).
