---
baseline_commit: 37e286e
---
# Story 21.5: Ações do Card + Próximo Passo por IA

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Sequência do épico (revisada 2026-07-13):** 21.1 → 21.2 → 21.6 → 21.3 → 21.4 → **21.5** → 21.7. As cinco anteriores estão `done`. A 21.4 entregou a **Central de Oportunidades** (página + cards **somente exibição**). Esta story **fecha o loop de valor**: transforma cada card de "leitura" em "ação" — rascunho de próximo passo por IA (`opportunity_next_step`) + enviar WhatsApp + `mailto:` + buscar telefone + triagem (contatada / descartada / **reunião marcada**). Depois dela só resta a **21.7** (notificações proativas + configurações).
>
> **⚠️ Escopo:** esta é uma story de **ação sobre dados já existentes** — ZERO migration (o schema `opportunities` já tem `suggestion`, `status`, `meeting_booked_at` desde a 00055; o CHECK de `api_usage_logs` já inclui `'openai'` desde a 00058/21.3). NÃO tocar o pipeline de ingestão/classificação (`reply-sweep`/`reply-processor`/`reply-classifier`/`engagement-processor`) nem o receiver do webhook.

## Story

As a usuário,
I want agir direto do card com um próximo passo já rascunhado pela IA,
so that eu responda o lead quente em minutos, não em dias.

## Acceptance Criteria

1. **Given** uma oportunidade classificada **When** o card é aberto **Then** a IA gera (on-demand, com **cache** em `opportunities.suggestion`) um rascunho de resposta/abordagem contextualizado — novo prompt `opportunity_next_step` usando Knowledge Base (tom de voz, produto) + `reply_text` + `intent` (padrão do `monitoring_approach_suggestion` do Epic 13). Aberturas subsequentes reusam o cache (sem custo novo).

2. **Given** o rascunho exibido **Then** posso **copiá-lo** em 1 clique **And** **regenerá-lo** (bypassa o cache, grava o novo texto em `suggestion`).

3. **Given** as ações do card **Then** existem: **enviar WhatsApp** (reuso do `WhatsAppComposerDialog`/`ZApiService` do Epic 11, **pré-preenchido com o rascunho**), **`mailto:`** com assunto/corpo pré-preenchidos, **buscar telefone** via SignalHire (reuso do `PhoneLookupDialog`/`usePhoneLookup` — fluxo existente por lead).

4. **Given** as ações de triagem **Then** posso marcar a oportunidade como `contacted`, `discarded`, ou registrar **"Reunião marcada"** em 1 clique (`meeting_booked_at` preenchido no servidor) (FR16) **And** marcar reunião atualiza o **status do lead** para `oportunidade`.

5. **Given** falha na geração do rascunho (IA fora / sem chave OpenAI / retorno vazio) **Then** o card **continua utilizável** com as demais ações (fail-open) **And** há opção de tentar de novo (regenerar). Nenhuma ação quebra o card.

6. **Given** custo de cada geração de rascunho **Then** é registrado em `api_usage_logs` (`service_name='openai'`, `request_type='opportunity_next_step'`) (NFR6).

7. Testes unitários para: gerador (mock OpenAI), rota de sugestão (cache-hit/regenerate/fail-open/custo), ações do card (WhatsApp/mailto/telefone), transições de status + `meeting_booked_at` + status do lead, e o server action de WhatsApp.

## Tasks / Subtasks

- [x] **Task 1: Registrar o prompt key `opportunity_next_step` (AC: #1)**
  - [x] 1.1 Em `src/types/ai-prompt.ts`, adicionar o literal `"opportunity_next_step"` em **TRÊS lugares** (senão o `z.enum` exaustivo quebra o tsc/validação — mesma lição da 21.3): (a) union `PromptKey` [ai-prompt.ts:68-81]; (b) array `PROMPT_KEYS` [ai-prompt.ts:85-99]; (c) `promptKeySchema = z.enum([...])` [ai-prompt.ts:186-192]. Espelhar exatamente como `reply_intent_classification` foi adicionado (a story 21.3 fez os 3 na mesma posição). Atualizar o teste de contagem `__tests__/unit/types/ai-prompt.test.ts` (13 → 14 keys).
  - [x] 1.2 Em `src/lib/ai/prompts/defaults.ts`, adicionar a entrada `opportunity_next_step` a `CODE_DEFAULT_PROMPTS` **espelhando `monitoring_approach_suggestion` [defaults.ts:869-924]**: `{ template, modelPreference: "gpt-4o-mini", metadata: { temperature: 0.7, maxTokens: 500 } }` (geração de texto livre — temperatura ALTA, **sem** `response_format`, ao contrário do classificador da 21.3). O template recebe as variáveis de KB (`{{company_context}}`, `{{products_services}}`, `{{competitive_advantages}}`, `{{icp_summary}}`, `{{tone_description}}`, `{{tone_style}}`), do lead (`{{lead_name}}`, `{{lead_title}}`, `{{lead_company}}`, `{{lead_industry}}`) e da oportunidade (`{{reply_subject}}`, `{{reply_text}}`, `{{intent}}`). Contrato do prompt em Dev Notes ("Contrato do prompt `opportunity_next_step`"). **NÃO** criar migration de seed (00038 = código é a fonte de verdade dos prompts; mesma regra da 21.3).

- [x] **Task 2: Gerador `src/lib/utils/opportunity-suggestion.ts` (AC: #1, #5, #6)**
  - [x] 2.1 **Espelhar estruturalmente `src/lib/utils/approach-suggestion.ts`** (é o precedente EXATO — gerador de texto livre, contexto-agnóstico: recebe `supabase` + `openaiKey` como parâmetros, funciona em cron E request-time). Reusar de lá: `interpolateTemplate` (via `relevance-classifier`, já reexportado), `calculateSuggestionCost(promptTokens, completionTokens)` [approach-suggestion.ts:50-55] (**importar**, mesma tarifa gpt-4o-mini) e o `callOpenAI` de texto livre [approach-suggestion.ts:125-162] (temp 0.7, maxTokens 500, timeout 30s, **sem** `response_format`). Copiar o `loadSuggestionPromptTemplate` [approach-suggestion.ts:65-114] trocando a `prompt_key` para `opportunity_next_step`.
  - [x] 2.2 `export interface OpportunityContextForSuggestion { replyText: string | null; replySubject: string | null; intent: OpportunityIntent | null }` e `LeadContextForSuggestion` (reusar o de `approach-suggestion.ts:23-28`: `leadName`/`leadTitle`/`leadCompany`/`leadIndustry`) + `KBContextForSuggestion` (reusar de `approach-suggestion.ts:30-33`).
  - [x] 2.3 `export async function generateOpportunityNextStep(oppContext, leadContext, kbContext, openaiKey, supabase, tenantId): Promise<SuggestionResult>` — espelhar `generateApproachSuggestion` [approach-suggestion.ts:175-233]. Guard: `openaiKey` null → `{ suggestion: null, promptTokens: 0, completionTokens: 0, error: "OpenAI key não configurada" }` (fail-open, sem custo). Interpolar KB + lead + `reply_subject`/`reply_text`/`intent` (traduzir `intent` para rótulo pt-BR legível via `getIntentConfig(intent).label`, ou "não classificado" se null). **Degradação `source='engagement'` (sem `reply_text`):** interpolar `reply_text` como string vazia e deixar o template instruir a abordagem por engajamento (aberturas/cliques) — ver Contrato do prompt. `try/catch` externo → `suggestion: null` + `error` (NÃO fail-open forjando texto — igual ao `approach-suggestion`, que retorna null em erro; o "fail-open" desta story é de UX: o card segue utilizável, AC5). Reusar `SuggestionResult` [approach-suggestion.ts:35-40].

- [x] **Task 3: Rota POST `/api/opportunities/[opportunityId]/suggestion` (AC: #1, #5, #6)**
  - [x] 3.1 Criar `src/app/api/opportunities/[opportunityId]/suggestion/route.ts` (POST) — **request-time** (auth por cookie, NÃO cron): `getCurrentUserProfile()` [tenant.ts:17-33] → 401; `const supabase = await createClient()` [@/lib/supabase/server]. Parse do body com try/catch → 400; ler flag `regenerate` (default `false`).
  - [x] 3.2 Carregar a oportunidade **tenant-scoped** com embed do lead (LEFT — `lead_id` nullable): `supabase.from("opportunities").select("*, lead:leads ( id, first_name, last_name, company_name, title )").eq("id", opportunityId).eq("tenant_id", profile.tenant_id).single()`; `PGRST116` → 404. **Cache-hit:** se `row.suggestion` presente **e** `!regenerate` → retornar `{ data: { suggestion: row.suggestion, cached: true } }` **sem chamar IA** (AC1: "aberturas subsequentes reusam o cache, sem custo").
  - [x] 3.3 Montar contexto: `leadContext` a partir do lead embedado (nome = `first_name last_name`; title/company; `industry` não está em `leads` → passar `""`); `kbContext` via **`loadKBContext(supabase, tenant_id)`** [monitoring-processor.ts:192-227] + `loadToneContext(supabase, tenant_id)` [monitoring-processor.ts:161-186] (montar `KBContextForSuggestion = { ...kbContext, toneDescription, toneStyle }`, exatamente como o monitoring-processor faz [monitoring-processor.ts:353-357]); se `loadKBContext` retornar null (KB vazia), ainda gerar (contexto mínimo) ou retornar suggestion null gracioso — ver Dev Notes. `openaiKey` via **`getApiKey(supabase, tenant_id, "openai")`** [monitoring-processor.ts:136-155] → null → `{ data: { suggestion: null } }` 200 gracioso (fail-open, AC5), **sem** logar custo.
  - [x] 3.4 Chamar `generateOpportunityNextStep(...)`. Se `suggestion` não-nula: `UPDATE opportunities SET suggestion = <texto> WHERE id = opportunityId AND tenant_id = ...` (dispara o trigger `update_updated_at_column` 00055). Registrar custo via **`logMonitoringUsage(supabase, { tenantId, serviceName: "openai", requestType: "opportunity_next_step", leadId: row.lead_id ?? undefined, estimatedCost: calculateSuggestionCost(pt, ct), status: "success", metadata: { promptTokens, completionTokens, regenerate } })`** [monitoring-processor.ts:99-130] — só quando `promptTokens + completionTokens > 0` (mesma gate do monitoring [monitoring-processor.ts:444-463] e da 21.3). Retornar `{ data: { suggestion } }`. Erro de UPDATE = secundário (o texto já foi gerado) → logar e retornar o `suggestion` mesmo assim.
  - [x] 3.5 **Leitura guardada de env** se a rota tocar `process.env` (eslint `no-non-null-assertion` linta o arquivo inteiro no pre-commit — memória do projeto); a chave OpenAI vem do `getApiKey` (decripta do `api_configs`), não de env, então provavelmente não há env aqui — confirmar. Considerar `export const maxDuration` (a geração pode levar ~30s; defer da 21.3 sobre maxDuration é relevante — ver Dev Notes).

- [x] **Task 4: Estender o PATCH `/api/opportunities/[opportunityId]` — efeitos de triagem (AC: #4)**
  - [x] 4.1 Em `src/app/api/opportunities/[opportunityId]/route.ts` (arquivo DONE 21.4 — **mudança aditiva**, o caminho `new→viewed` da 21.4 NÃO pode regredir): após validar `status` com `isValidOpportunityStatus`, **carregar a row atual** (`select("status, lead_id").eq("id").eq("tenant_id").single()`, `PGRST116`→404) para conhecer o estado anterior e o `lead_id`.
  - [x] 4.2 **Guarda de state-machine (fecha o defer da review 21.4 — deferred-work.md:99):** bloquear regressões que ressuscitam o card — se o status atual ∈ `{contacted, meeting_booked, discarded}` e o alvo ∈ `{new, viewed}` → 409 (`{ error: { code: "INVALID_TRANSITION", message } }`). As transições da 21.4 (`new→viewed`) e as ações desta story (`viewed→contacted/discarded/meeting_booked`, e laterais entre terminais) permanecem válidas. Ver Dev Notes "Máquina de estados do card".
  - [x] 4.3 **`meeting_booked` (AC4 + FR16):** ao transicionar PARA `meeting_booked`, gravar `meeting_booked_at` no UPDATE: `.update({ status, meeting_booked_at: new Date().toISOString() })` (fecha o defer da review 21.1 — deferred-work.md:20, "nada acopla `meeting_booked_at` a `status='meeting_booked'`"). Para os demais status, NÃO tocar `meeting_booked_at` (histórico preservado). Usar um objeto de update montado condicionalmente.
  - [x] 4.4 **Status do lead em `meeting_booked` (AC4):** se `row.lead_id` não-nulo e o alvo é `meeting_booked`, atualizar `leads.status = 'oportunidade'` (**secundário** — erro só loga, não falha o PATCH; espelha o padrão "update de status é secundário" da 21.3 [reply-classifier updateLeadStatus] e do `import-results`). `'oportunidade'` já existe no ENUM `lead_status` [00010:8] — sem `ALTER TYPE`. Idempotente (se já `oportunidade`, no-op). NÃO rebaixar em outras transições.
  - [x] 4.5 Manter o envelope de resposta/erros da 21.4 (`{ data }` / `{ error: { code, message } }`); a rota continua retornando a row atualizada. Atualizar o comentário do topo do arquivo (não é mais "só new→viewed").

- [x] **Task 5: Hooks — `useOpportunitySuggestion` + toasts explícitos no status (AC: #1, #2, #4)**
  - [x] 5.1 Em `src/hooks/use-opportunities.ts` (arquivo DONE 21.4 — aditivo), adicionar `useOpportunitySuggestion(opportunityId)`: `useMutation` cujo `mutationFn: ({ regenerate }: { regenerate?: boolean }) => POST /api/opportunities/${opportunityId}/suggestion` (body `{ regenerate }`), retorna `{ suggestion: string | null }`. `onSuccess` → **invalidar `["opportunities"]`** (para o `suggestion` cacheado aparecer no refetch) — ou preferir update pontual; `onError` → toast só na ação explícita de regenerar (a geração automática ao abrir é passiva/silenciosa, como o `new→viewed`). Expor `{ generate, regenerate, isGenerating, error, data }`.
  - [x] 5.2 O `useUpdateOpportunityStatus()` [use-opportunities.ts:208-230] já existe e já dá toast de sucesso quando `!silent` (usando `OPPORTUNITY_STATUS_CONFIG[status].label`). As ações de triagem explícitas (contatada/descartada/reunião) chamam-no **sem `silent`** → o toast "Oportunidade marcada como reunião marcada" já sai pronto. **Não** duplicar lógica; reusar. (A transição passiva `new→viewed` da 21.4 segue com `silent: true`.) Se o toast de `meeting_booked` precisar de copy própria ("Reunião marcada — lead promovido a oportunidade"), estender o `onSuccess` do hook por `status`.

- [x] **Task 6: Server action `sendWhatsAppFromOpportunity` + hook (AC: #3)**
  - [x] 6.1 Em `src/actions/whatsapp.ts` (arquivo DONE Epic 11/13.7 — aditivo), adicionar `sendWhatsAppFromOpportunity` **espelhando `sendWhatsAppFromInsight` [whatsapp.ts:216-348]**: schema Zod `{ opportunityId: uuid, leadId: uuid, phone: regex, message: min(1).max(5000) }`; sanitizar phone [whatsapp.ts:219-223]; auth `getCurrentUserProfile` → tenant; `getZApiCredentials` [whatsapp.ts:48-75] (reusar); verificar que o lead pertence ao tenant [whatsapp.ts:245-258].
    - **`campaign_id` — VINCULAR à campanha (decisão Fabossi #3) + pré-check com fallback.** Carregar a oportunidade tenant-scoped (`select("campaign_id, status").eq("id", opportunityId).eq("tenant_id", ...)`) → 404/erro pt-BR se não achar. `whatsapp_messages.campaign_id` tem **FK `REFERENCES campaigns(id)`** [00042:35] — mas `opportunities.campaign_id` **não tem FK** (00055:29) e pode ficar **dangling** (campanha deletada → é o caso que a 21.4 mostra como "Campanha desconhecida"). Inserir um id dangling → **FK 23503 → envio quebra**. Portanto **pré-checar**: `campaigns.select("id").eq("id", opp.campaign_id).eq("tenant_id", ...)`.
      - **Campanha existe (caminho normal)** → `campaign_id: opp.campaign_id` (decisão #3). Funciona com ou sem a 13.11.
      - **Campanha dangling (edge estreito)** → `campaign_id: null` e **envia mesmo assim** (não bloquear um lead quente por causa de uma campanha deletada). ⚠️ **Depende da Story 13.11 (`00059` aplicada)** — ver Dev Notes "Pré-requisito: Story 13.11". Se a 00059 ainda NÃO estiver aplicada quando esta story for para dev, trocar o fallback por **falha explícita** (`{ success: false, error: "Campanha de origem não encontrada — não é possível registrar o envio." }`, **sem** chamar a Z-API).
    - Inserir `whatsapp_messages` com o `campaign_id` resolvido acima + `status: "pending"`; chamar `ZApiService.sendText`.
    - **Sucesso** → update `sent` (+`external_message_id`/`external_zaap_id`/`sent_at`) **e SÓ ENTÃO auto-marcar a oportunidade `contacted`** (decisão Fabossi #2: *"sim, se o envio for feito"*) — `opportunities.update({ status: "contacted" }).eq("id", opportunityId).eq("tenant_id", ...)`, isolado em `try/catch` (falha do mark NÃO derruba o envio já feito — espelha o auto-mark "used" do insight [whatsapp.ts:303-315]). **Guarda de state-machine:** o auto-mark só promove de `new`/`viewed` → `.in("status", ["new", "viewed"])` no update (não rebaixa `meeting_booked`, não ressuscita `discarded`).
    - **Falha da Z-API** → update `failed` + `error_message`; **NÃO** marcar `contacted` (a oportunidade fica no status atual) + retornar erro pt-BR [whatsapp.ts:330-347].
  - [x] 6.2 Criar `src/hooks/use-whatsapp-send-from-opportunity.ts` **espelhando `use-whatsapp-send-from-insight.ts` [1-68]**: `send({ opportunityId, leadId, phone, message }) => Promise<boolean>`, `isSending`, `error`, `lastResult`; `onSuccess` → toast + **invalidar `["opportunities"]` E `["opportunities-new-count"]`** (o auto-mark `contacted` decrementa o badge `new`) + `["whatsapp-messages"]`. Retornar `boolean` (true = enviado) para o PageContent fechar o composer.

- [x] **Task 7: `OpportunityCard` (rascunho + ações + mailto + triagem) + `OpportunitiesPageContent` (dialogs) (AC: #1, #2, #3, #4, #5)**
  - [x] 7.1 **`OpportunityCard.tsx` (DONE 21.4 — estender, preservando exibição + `new→viewed`):**
    - **Bloco do rascunho (AC1/AC2/AC5):** ao abrir o card (`handleOpen`), se `suggestion` local é null, disparar `useOpportunitySuggestion(id).generate()` **uma única vez** (`useRef` — mesmo padrão do `markedViewedRef` [OpportunityCard.tsx:33,49-67]). Estado local `const [draft, setDraft] = useState(opportunity.suggestion)`; ao gerar/regenerar, `setDraft(result.suggestion)`. Renderizar: texto do rascunho, botão **Copiar** (`navigator.clipboard.writeText` + `toast.success("Rascunho copiado!")` — espelha `WhatsAppComposerDialog handleCopy` [WhatsAppComposerDialog.tsx:162-170]), botão **Regenerar** (`regenerate()`), estado **carregando** (`isGenerating` → "Gerando rascunho…" animate-pulse, espelha [WhatsAppComposerDialog.tsx:250-258]), estado **falha/sem rascunho** (mensagem discreta + botão "Tentar de novo" — AC5, NUNCA quebra).
    - **`mailto:` (AC3):** só quando `lead?.email` presente — `<a href={mailtoHref}>` com `mailto:${email}?subject=${encodeURIComponent("Re: " + (replySubject ?? ""))}&body=${encodeURIComponent(draft ?? "")}`; `onClick` com `stopPropagation` (o card é clicável). Ícone `Mail` (lucide, já usado no OpportunityPanel).
    - **WhatsApp / Telefone (AC3):** o card **emite** para o PageContent (dialogs vivem lá — ver 7.2), via novas props `onWhatsApp?(opportunity)` / `onPhoneLookup?(opportunity)`. Botão **WhatsApp** habilitado só quando há telefone efetivo (`effectivePhone`) — senão mostrar **"Buscar telefone"** que chama `onPhoneLookup` (espelha OpportunityPanel: sem phone → PhoneLookupDialog [OpportunityPanel.tsx:45,108]). `effectivePhone = localPhone ?? lead?.phone` (o PageContent injeta `localPhone` via prop após lookup — otimista).
    - **Triagem (AC4):** botões **Contatada** / **Descartada** / **Reunião marcada** → `useUpdateOpportunityStatus().mutate({ opportunityId, status })` (sem `silent` → toast automático da Task 5.2). Desabilitar/ocultar conforme o status atual (ex.: já `discarded` não mostra "Descartar"). `stopPropagation` em todos (o container do card tem `onClick={handleOpen}`).
    - **Degradações (AC5 — todas testadas):** `lead` null → sem WhatsApp/telefone/mailto (não há destino), só rascunho (se houver `reply_text`/contexto) + triagem; `source='engagement'` sem `reply_text` → rascunho ainda oferecido (template adapta) + sem mailto de "Re:"; sem `email` → sem mailto; sem `suggestion` e IA falhou → demais ações intactas. **Nenhum acesso a `lead.*`/`draft.*` sem guard.**
  - [x] 7.2 **`OpportunitiesPageContent.tsx` (DONE 21.4 — estender, espelhando `InsightsPageContent` [1-212]):** levantar os dialogs para o container (padrão do Insights/OpportunityPanel — **um** dialog por tipo, não um por card): estado `composerOpportunity` / `phoneLookupOpportunity` (`useState<OpportunityCardData | null>`); `localPhones` (`useState<Map<string,string>>` — chave `opportunityId`, espelha OpportunityPanel [OpportunityPanel.tsx:109]); `useWhatsAppSendFromOpportunity()`. Passar `onWhatsApp`/`onPhoneLookup`/`localPhone` a cada `<OpportunityCard>`. Renderizar `<WhatsAppComposerDialog>` (pré-preenchido com `composerOpportunity.suggestion` via `initialMessage`, `campaignId=""`, `lead={...}`, `onSend={handleWhatsAppSend}` — espelha [InsightsPageContent.tsx:190-209]) e `<PhoneLookupDialog>` (`lead={{ leadEmail, firstName, lastName, leadId }}`, `onPhoneFound={(phone) => setLocalPhones(...)}` — espelha OpportunityPanel [PhoneLookupDialog.tsx:31-41]). `handleWhatsAppSend` chama `send({ opportunityId, leadId, phone, message })` e fecha o composer em sucesso (espelha [InsightsPageContent.tsx:47-58]).
  - [x] 7.3 Tailwind v4 [memória do projeto]: `flex flex-col gap-*`, NUNCA `space-y-*` em wrappers de ação/label. Botões via `<Button>` [ui/button.tsx] com ícones lucide.

- [x] **Task 8: Testes unitários (AC: #7)**
  - [x] 8.1 `__tests__/unit/lib/utils/opportunity-suggestion.test.ts` — **espelhar `approach-suggestion.test.ts`**: `vi.stubGlobal("fetch", mockFetch)`; happy path assere o wire (model `gpt-4o-mini`, temp 0.7, **sem** `response_format`, retorna o texto trimado + tokens); guard sem `openaiKey` → `suggestion: null`, `mockFetch` NÃO chamado; erro OpenAI (429/reject) → `suggestion: null` + `error`; retorno vazio → `suggestion: null`; degradação `reply_text` null (engagement) → gera mesmo assim (interpola vazio); prompt fallback código via `setupSupabaseForCodeDefault`.
  - [x] 8.2 `__tests__/unit/app/api/opportunities/[opportunityId]/suggestion/route.test.ts`: 401 sem sessão; 404 oportunidade de outro tenant / inexistente (`PGRST116`); **cache-hit** (`suggestion` presente + `regenerate=false` → retorna cache, `mockFetch`/generate NÃO chamado, sem custo); **regenerate=true** com `suggestion` presente → gera de novo + grava; **fail-open** sem chave OpenAI → `{ data: { suggestion: null } }` 200, sem custo logado; sucesso → grava `suggestion` + **insere custo** em `api_usage_logs` (`service_name:"openai"`, `request_type:"opportunity_next_step"`). Mock-supabase resiliente + fetch stub.
  - [x] 8.3 `__tests__/unit/app/api/opportunities/[opportunityId]/route.test.ts` (estender o da 21.4): `meeting_booked` grava `meeting_booked_at` (não-nulo) **e** atualiza `leads.status='oportunidade'`; `contacted`/`discarded` NÃO tocam `meeting_booked_at` nem o lead; **guarda de state-machine** → 409 ao tentar `meeting_booked`→`new`/`viewed` (e `discarded`→`viewed`); `new→viewed` da 21.4 segue verde (regressão); `lead_id` null → `meeting_booked` grava `meeting_booked_at` sem erro (sem update de lead).
  - [x] 8.4 `__tests__/unit/hooks/use-opportunities.test.ts` (estender): `useOpportunitySuggestion` chama a rota com `regenerate` correto, invalida `["opportunities"]`; toast só no regenerate explícito. Cobrir também que `useUpdateOpportunityStatus` dá toast na ação explícita (já coberto pela 21.4 — reconfirmar `meeting_booked`).
  - [x] 8.5 `__tests__/unit/actions/whatsapp-from-opportunity.test.ts` — **espelhar `whatsapp-from-insight.test.ts`**: validação; auth; credenciais Z-API ausentes; lead cross-tenant rejeitado; **`campaign_id` vinculado** (assert que o insert usa `opportunities.campaign_id`, NÃO null — decisão #3); **campanha dangling → insert com `campaign_id: null` e o envio ACONTECE** (fallback da Task 6.1, pós-13.11; regressão contra a FK 23503 — assert que `sendText` FOI chamado); **auto-mark `contacted` SÓ no sucesso** (decisão #2): sucesso → update `contacted` com guarda `.in("status",["new","viewed"])`; **falha da Z-API → `failed` + oportunidade NÃO vira `contacted`** (assert explícito dos dois ramos); auto-mark isolado (falha do mark não derruba o envio já feito). E `__tests__/unit/hooks/use-whatsapp-send-from-opportunity.test.ts` (espelhar o hook do insight): invalida `["opportunities"]`/`["opportunities-new-count"]`.
  - [x] 8.6 `__tests__/unit/components/opportunities/OpportunityCard.test.tsx` (estender o da 21.4): rascunho gera 1x ao abrir (mock do hook); Copiar (`clipboard.writeText`); Regenerar (chama `regenerate`); estado carregando/falha (card não quebra — AC5); `mailto:` href correto (subject "Re:" + body do draft, encoded) e **ausente** quando `email` null; botão WhatsApp desabilitado sem telefone → mostra "Buscar telefone" (chama `onPhoneLookup`); com telefone → chama `onWhatsApp`; triagem contatada/descartada/reunião chamam a mutation com o status certo; **degradações**: `lead` null (sem WA/tel/mailto, sem crash), engagement sem `reply_text` (rascunho ainda oferecido).
  - [x] 8.7 `__tests__/unit/components/opportunities/OpportunitiesPageContent.test.tsx` (estender): abrir composer via `onWhatsApp` pré-preenche com `suggestion`; `onPhoneFound` atualiza `localPhones` → card recebe telefone; envio bem-sucedido fecha o composer.

- [x] **Task 9: Validação** — `npx tsc --noEmit` (0 novos erros em `src/`; baseline conhecido tem erros SÓ em `__tests__/`); `npx eslint --max-warnings=0 <arquivos novos/modificados>` limpo (inclusive `no-non-null-assertion`); `npx vitest run` verde; `npm run build` verde (rota `/api/opportunities/[opportunityId]/suggestion` registrada). **Tailwind v4:** só `flex flex-col gap-*`, zero `space-y-*`.

## Dev Notes

Esta story é a **camada de ação** sobre a Central (21.4). **Fora de escopo (não implementar):** notificações proativas WhatsApp/in-app + `app_notifications` + `/settings/monitoring` config → **21.7**; qualquer ingestão/classificação (21.2/21.3/21.6, done); agendamento de lembrete/follow-up (exclusão consciente do épico — "não virar CRM"). O agrupamento de notificações e o `notification_settings` são 21.7.

### 🟢 Zero migration — schema e CHECK já prontos

`opportunities.suggestion` (TEXT nullable), `status` (enum c/ `contacted`/`meeting_booked`/`discarded`) e `meeting_booked_at` (TIMESTAMPTZ nullable) já existem na **00055** [tipos em opportunity.ts:142-144,169-171 já mapeados por `toOpportunity`]. O CHECK de `api_usage_logs.service_name` já inclui `'openai'` desde a **00058** (aplicada na 21.3) — o custo de IA desta story persiste sem migration nova. **Esta story NÃO cria nenhuma migration.** (Se o dev achar que precisa de uma, está enganado — reler.)

### O precedente EXATO a espelhar por pilar

| Pilar | Precedente (fonte) | Alvo (21.5) |
|---|---|---|
| Gerador de texto IA (livre, cron/req-agnóstico) | `src/lib/utils/approach-suggestion.ts` (Epic 13) | `src/lib/utils/opportunity-suggestion.ts` |
| KB + tom + chave + custo (helpers reusáveis) | `monitoring-processor.ts` (`loadKBContext`/`loadToneContext`/`getApiKey`/`logMonitoringUsage`) | importar e reusar na rota de sugestão |
| Prompt key nova (3 lugares + default) | 21.3 (`reply_intent_classification`) | `opportunity_next_step` |
| Enviar WhatsApp de um card | `sendWhatsAppFromInsight` + `use-whatsapp-send-from-insight` + `InsightsPageContent` (13.7/13.6) | `sendWhatsAppFromOpportunity` + hook + `OpportunitiesPageContent` |
| Composer WhatsApp (pré-preenchido) | `WhatsAppComposerDialog` (Epic 11) — `initialMessage` | reuso direto |
| Buscar telefone (SignalHire) | `PhoneLookupDialog` + `usePhoneLookup` (11.5/4.5) — `onPhoneFound` + `localPhones` Map | reuso direto |
| Status do lead (req-time) | `useUpdateLeadStatus` (4.2) / update secundário do lead (21.3) | update `oportunidade` no PATCH (server) |

O **card com ações** (rascunho + WhatsApp + telefone + triagem) já existe em forma quase idêntica: o `OpportunityPanel` do analytics [OpportunityPanel.tsx] — leia-o como referência de wiring (composer + phone dialog + `localPhones` + `useWhatsAppSend`), mas o **destino** aqui é a `OpportunityCard` da Central (21.4), não o painel de tracking.

### Geração on-demand com cache (AC1) — arquitetura

A 21.3 (`reply-classifier`) só preenche `intent`; **ninguém gera `opportunity_next_step` no cron** — o rascunho é gerado **no momento da visualização** (request-time), diferente do insight (pré-gerado no cron). Fluxo:

1. Card aberto → se `suggestion` local null, `useOpportunitySuggestion.generate()` (POST à rota) **1x** (`useRef`, como `new→viewed`).
2. Rota: cache-hit (`suggestion` presente + `!regenerate`) → devolve sem IA (sem custo). Senão gera, **grava em `opportunities.suggestion`** (cache persistente) e loga custo.
3. "Regenerar" → POST com `regenerate: true` → bypassa o cache, gera e sobrescreve.

O gerador (`approach-suggestion.ts`) é **contexto-agnóstico** — recebe `supabase` + `openaiKey` por parâmetro, então funciona na rota request-time sem adaptação. **NÃO** use a camada SDK do Epic 6 (`AIProvider`/`/api/ai/generate`/`useAIGenerate`) para o rascunho do card — ela é o caminho do *composer* (que gera uma mensagem de WhatsApp específica), não do `opportunity_next_step`. (O `WhatsAppComposerDialog` continua usando `useAIGenerate` internamente para o botão "Gerar com IA" dele — isso é ortogonal; nós só pré-preenchemos o composer com o rascunho via `initialMessage`.)

**Custo:** a geração automática ao abrir cada card gasta ~1 chamada gpt-4o-mini (~centavos) por oportunidade **na primeira abertura**; o cache evita repetição. Ver Open Question #1 (auto ao abrir vs botão explícito).

### Contrato do prompt `opportunity_next_step`

Texto livre (não JSON), tom = "consultor de vendas que acabou de receber uma resposta/sinal quente". Espelhar a forma do `monitoring_approach_suggestion` [defaults.ts:869-924] (KB + lead + tom), trocando o "POST do LinkedIn" pela **resposta do lead + intenção**:
- Recebe: contexto da empresa/produto/diferenciais/ICP (`{{company_context}}`/`{{products_services}}`/`{{competitive_advantages}}`/`{{icp_summary}}`), tom (`{{tone_description}}`/`{{tone_style}}`), lead (`{{lead_name}}`/`{{lead_title}}`/`{{lead_company}}`/`{{lead_industry}}`), e da oportunidade: `{{reply_subject}}`, `{{reply_text}}`, `{{intent}}` (rótulo pt-BR).
- Tarefa: gerar um **rascunho de próximo passo** — se há `reply_text`, responder à resposta considerando a intenção (`interessado`→avançar/agendar; `pediu_info`→enviar material/detalhe; `objecao`→endereçar a barreira; `nao_agora`→nutrir leve; `opt_out`→encerrar cordial). Se **não há `reply_text`** (engagement — só aberturas/cliques), gerar uma abordagem que reconhece o interesse demonstrado sem citar uma resposta inexistente.
- Formato: "responda APENAS com o rascunho, sem preâmbulo", máx. ~150 palavras, tom `{{tone_style}}`, sem `[placeholders]`. Temperatura 0.7, `maxTokens` 500 (igual ao approach-suggestion).

### Máquina de estados do card (fecha 2 defers)

O CHECK do schema valida o **valor** de `status`, não a **transição**, e nada acopla `meeting_booked_at` a `meeting_booked` (deferred-work.md:20 e :99, ambos com **Dono: 21.5**). Regras desta story (mínimas, no PATCH server):
- `new → viewed` (21.4, silencioso) — mantido.
- `viewed/new → contacted | discarded | meeting_booked` (ações do card) — permitido.
- laterais entre terminais (`contacted ↔ discarded`, `meeting_booked → discarded`) — permitido (usuário muda de ideia).
- **bloqueado (409):** `{contacted, meeting_booked, discarded} → {new, viewed}` — ressuscitaria o card no badge `new` da sidebar.
- `→ meeting_booked` seta `meeting_booked_at = now()` (uma vez; não limpar ao sair — histórico p/ ROI Epic 23) **e** promove `leads.status = 'oportunidade'` (secundário, idempotente).

O auto-mark `contacted` do envio de WhatsApp (Task 6.1) segue a mesma guarda: só promove de `new/viewed` (não rebaixa `meeting_booked`).

### ✅ Pré-requisito: Story 13.11 (`00059`) — **RESOLVIDO em 2026-07-15. A migration ESTÁ APLICADA e VALIDADA.**

> ## 🟢 LEIA ISTO ANTES DE REVISAR ESTA STORY — o pré-requisito mudou de estado
>
> **A [Story 13.11](13-11-fix-envio-whatsapp-do-insight-campaign-id-nullable.md) está `done`** (code review de 3 camadas + Task 5 operacional executada). A `00059` **foi aplicada no banco real do cliente em 2026-07-15 e validada end-to-end**. Portanto:
>
> **`whatsapp_messages.campaign_id` é NULLABLE AGORA** (`is_nullable = YES`, conferido no banco do cliente; FK `whatsapp_messages_campaign_id_fkey` preservada; UNIQUE `uq_whatsapp_messages_idempotency` intacta). Toda a contingência descrita abaixo (*"se a 00059 não estiver aplicada, use falha explícita"*) **está VENCIDA** — ela foi escrita quando a resposta era "não rodou".
>
> **O fallback `campaign_id: null` + envio não é mais teórico: ele foi PROVADO em produção.** A 13.11 validou exatamente esse caminho ponta a ponta contra o banco real — insert com `campaign_id NULL` → envio via Z-API → `status='sent'` → **e a mensagem aparece no histórico do lead** (agrupada sob "Sem campanha"). O caminho que esta story precisa não tem incógnita nenhuma.
>
> ### O que a 13.11 JÁ FEZ e esta story NÃO deve refazer
>
> Dos 3 itens do `deferred-work.md` atribuídos a "Dono: Story 21.5", **DOIS já foram resolvidos pela code review da 13.11**:
>
> | Item deferido p/ a 21.5 | Situação |
> |---|---|
> | `campaigns!inner` esconde msg com `campaign_id NULL` no histórico do lead | ✅ **FEITO pela 13.11** — [`route.ts:51`](../../src/app/api/leads/whatsapp-messages/route.ts#L51) agora é LEFT join (`campaigns(name)`) + acesso null-safe; 9 testes novos em `__tests__/unit/app/api/leads/whatsapp-messages/route.test.ts`. **Não reabrir.** Consequência boa p/ esta story: o fallback `null` da 21.5 **já nasce visível** no histórico. |
> | Tipo `WhatsAppMessage.campaign_id: string` impreciso | ✅ **FEITO pela 13.11** — agora é `string \| null` [`database.ts:77`](../../src/types/database.ts#L77); `campaign_name` no hook virou `string \| null`. **Não reabrir.** |
> | **Trocar o pré-check dangling pelo fallback `null` + envio** | 🔴 **PENDENTE — É DESTA STORY.** Continua sendo o único item aberto. Ver abaixo. |
>
> ### O único item que sobra para esta review
>
> [`whatsapp.ts:448-464`](../../src/actions/whatsapp.ts#L448-L464) ainda tem o pré-check **bloqueante**, e o comentário que o justifica (*"Sem a 00059 a coluna é NOT NULL — não há fallback possível"*) **é factualmente falso desde 2026-07-15**. O JSDoc da action [`whatsapp.ts:380-384`](../../src/actions/whatsapp.ts#L380-L384) já prescreve a troca (*"Depois da 13.11, trocar esta falha pelo fallback `campaign_id: null` + envio"*) — a condição está satisfeita. Enquanto não for feita, **uma oportunidade com campanha deletada não envia WhatsApp**, que é exatamente o que a decisão #3 do Fabossi queria evitar. O teste a virar: `campanha dangling → falha explícita SEM chamar a Z-API` [`whatsapp-from-opportunity.test.ts:300`](../../__tests__/unit/actions/whatsapp-from-opportunity.test.ts#L300) → `insert com campaign_id: null e o envio ACONTECE`.
>
> ### Um achado da 13.11 que provavelmente vale para esta story
>
> A code review da 13.11 corrigiu, nas DUAS actions dela, um `console.error(..., insertError)` que despejava o **objeto de erro inteiro** — o campo `details` do PostgREST traz `Failing row contains (...)`, ou seja **telefone do lead e corpo da mensagem** (PII) no log. O fix foi logar só `code` + `message`. **`sendWhatsAppFromOpportunity` [`whatsapp.ts:~487`] tem o mesmo padrão e NÃO foi tocado** — ficou de fora por disciplina de escopo (é código desta story). Candidato a patch nesta review.
>
> **Nada disto bloqueia o deploy nem a 21.5.** O caminho normal (campanha existe → `campaign_id` real) sempre funcionou, com ou sem a 13.11.

**[Story 13.11](13-11-fix-envio-whatsapp-do-insight-campaign-id-nullable.md) roda ANTES desta** (decisão Fabossi 2026-07-14) e torna `whatsapp_messages.campaign_id` **nullable** (`00059`). Isso **não muda a decisão #3** — o caminho normal continua **vinculando** a campanha; o `null` passa a ser apenas o **fallback do caminho dangling**.

Fatos do schema que a Task 6.1 tem que respeitar (`00042` era a única migration da tabela até a `00059`):
1. **FK preservada:** `campaign_id REFERENCES campaigns(id) ON DELETE CASCADE` [00042:35] continua valendo — se preenchido, **o valor tem que existir** em `campaigns`. `null` é aceito pela FK.
2. **`opportunities.campaign_id` pode ficar dangling.** É `NOT NULL` mas **sem FK** (00055:29, decisão deliberada espelhando `campaign_events`) → aponta para campanha deletada = o caso que a 21.4 renderiza "Campanha desconhecida". Vincular esse id dispara **FK `23503`** e quebra o envio → **pré-check** (Task 6.1) e, se dangling, `null` + envia.
3. **`uq_whatsapp_messages_idempotency UNIQUE (campaign_id, lead_id, external_message_id)`** [00042:86-88] — não precisa de tratamento especial: `external_message_id` é `null` no insert (a linha nasce `pending`), então a tupla nunca bloqueia nada nesse momento. Mas **não** assuma que o insert jamais dá `23505`.

> ~~**Se a `00059` NÃO estiver aplicada** quando esta story for para dev: trocar o fallback `null` por **falha explícita** no caminho dangling (Task 6.1)~~ — **CONTINGÊNCIA VENCIDA (2026-07-15).** A `00059` **está aplicada** no banco do cliente: `SELECT is_nullable ...` retornou **`YES`**, conferido por Fabossi. O dev seguiu esta contingência em 2026-07-15 (quando ela ainda valia) e implementou a falha explícita; **agora ela precisa ser desfeita** — ver o bloco 🟢 no topo desta seção.

> **Nota sobre o molde:** a 13.7 (`sendWhatsAppFromInsight`) insere `campaign_id: null` **sempre** — correto **para ela** (insight não tem campanha), errado para nós (oportunidade **tem** campanha). É o **único** ponto onde a 13.7 não deve ser espelhada.

### Reuso obrigatório (não reinventar)

- `generateApproachSuggestion`/`calculateSuggestionCost`/`callOpenAI` (forma) [approach-suggestion.ts] — base do gerador.
- `loadKBContext`/`loadToneContext`/`getApiKey`/`logMonitoringUsage` [monitoring-processor.ts:99-227] — KB/tom/chave/custo (todos recebem `supabase` explícito, servem request-time).
- `WhatsAppComposerDialog` [tracking/WhatsAppComposerDialog.tsx] — `initialMessage` pré-preenche com o rascunho; `onSend` recebe `{ phone, message }`.
- `PhoneLookupDialog` + `usePhoneLookup` [tracking/PhoneLookupDialog.tsx; hooks/use-phone-lookup.ts] — `onPhoneFound(phone)` + `saveToDatabase`.
- `sendWhatsAppFromInsight`/`getZApiCredentials`/`ZApiService` [actions/whatsapp.ts; lib/services/zapi.ts] — molde do server action.
- `useUpdateOpportunityStatus` [use-opportunities.ts:208-230] — triagem (toast já pronto); `getIntentConfig`/`OPPORTUNITY_STATUS_CONFIG` [opportunity.ts:107-123].
- `getCurrentUserProfile` [tenant.ts:17-33]; `createClient` [@/lib/supabase/server]; `isValidOpportunityStatus` [opportunity.ts:59-61].
- Mock-supabase resiliente + fetch stub [__tests__/helpers/mock-supabase.ts]; `flex flex-col gap-*` (memória Tailwind v4).

### Anti-Patterns a evitar

1. **NÃO** criar migration — schema + CHECK 'openai' já prontos (00055/00058).
2. **NÃO** usar a camada SDK do Epic 6 (`/api/ai/generate`/`AIProvider`) para o `opportunity_next_step` — use o gerador `fetch`-direto do `approach-suggestion` (contexto-agnóstico). O SDK segue só dentro do `WhatsAppComposerDialog` (ortogonal).
3. **NÃO** gerar o rascunho no cron (reply-classifier) — é on-demand na visualização (request-time + cache em `suggestion`).
4. **NÃO** reabrir o pipeline de ingestão/classificação (`reply-sweep`/`reply-processor`/`reply-classifier`/`engagement-processor`) nem o webhook — esta story é ação + apresentação.
5. **NÃO** deixar o card quebrar quando o rascunho falha / `lead` é null / `source='engagement'` (sem `reply_text`) / sem `email`/`phone` — todas as ações têm guarda (AC5).
6. **NÃO** setar `meeting_booked_at` no cliente — é efeito **server-side** do PATCH (atômico com o status).
7. **NÃO** permitir regressão `{contacted/meeting_booked/discarded} → new/viewed` (ressuscita o badge) — guarda de state-machine no PATCH (409).
8. **NÃO** logar custo quando `tokens === 0` (erro-duro / cache-hit / sem chave) — gate `promptTokens+completionTokens > 0` (padrão monitoring/21.3).
9. **NÃO** duplicar dialogs por card — levantar `WhatsAppComposerDialog`/`PhoneLookupDialog` para o `OpportunitiesPageContent` (padrão Insights/OpportunityPanel), card **emite** `onWhatsApp`/`onPhoneLookup`.
10. **NÃO** usar `process.env.X!` (eslint `no-non-null-assertion` no pre-commit) — a chave vem do `getApiKey`.
11. **NÃO** usar `space-y-*` (Tailwind v4 + Radix não espaça) — `flex flex-col gap-*`.
12. **NÃO** copiar o `campaign_id: null` **incondicional** da 13.7 [whatsapp.ts:263] — insight não tem campanha, oportunidade **tem**. Vincular `opportunities.campaign_id` (decisão #3) **com pré-check**; `null` **só** no fallback de campanha dangling (id sem FK que aponta p/ campanha deletada → FK `23503` quebraria o envio). Único ponto onde a 13.7 não é o molde.
13. **NÃO** marcar `contacted` antes da confirmação da Z-API (decisão #2: *"se o envio for feito"*) — o auto-mark vive só no ramo de sucesso, depois do `sendText` retornar OK.
14. **NÃO** remover as guardas de custo do rascunho (cache em `suggestion`, truncagem 4000 chars, `maxTokens: 500`) — são elas que sustentam o "custo pequeno" que autorizou a geração automática (decisão #1).

### Previous Story Intelligence (21.4 + Epic 13/11)

- **21.4 (Central):** o `OpportunityCard` é clicável (`onClick={handleOpen}` no container) → **todo botão/link de ação precisa de `stopPropagation`** (senão dispara o expand/`new→viewed` junto). O `new→viewed` usa `markedViewedRef` (1x, `onError` reseta o ref) — **espelhar esse padrão** para o disparo automático do rascunho. `use-opportunities.ts` já invalida `["opportunities"]` + `["opportunities-new-count"]` no status; o hook de sugestão e o de WhatsApp devem invalidar as mesmas chaves. Defers da review 21.4 que ESTA story fecha: (a) PATCH aceita regressões → guarda de state-machine (Task 4.2); (b) `meeting_booked_at` desacoplado → Task 4.3. Defers que ESTA story NÃO precisa fechar mas deve evitar piorar: página encalhada além de `totalPages` [deferred-work.md:100]; invalidação total por abertura [deferred-work.md:101] — o disparo do rascunho ao abrir **também** invalida `["opportunities"]`; considerar update pontual do cache do `suggestion` para não amplificar o churn (ver Task 5.1).
- **13.7 (WhatsApp do insight):** `sendWhatsAppFromInsight` insere `whatsapp_messages` com `campaign_id: null` e auto-marca a fonte (`insight → used`) isolado em try/catch — **molde exato** do `sendWhatsAppFromOpportunity` (fonte = `opportunity → contacted`). O hook invalida `["insights"]`/`["insights-new-count"]` — o nosso invalida `["opportunities"]`/`["opportunities-new-count"]`.
- **21.3 (classificação):** custo via `logMonitoringUsage` (`service_name:"openai"`) só com tokens > 0; a 00058 já corrigiu o CHECK (custo IA persiste). O update de status do lead é secundário (erro só loga) — mesmo tratamento no `meeting_booked → oportunidade`.
- **21.1/21.6:** `suggestion`/`meeting_booked_at`/métricas já no schema + `toOpportunity`; `ACTIVE_OPPORTUNITY_STATUSES` inclui `meeting_booked` (dedup) — coerente com "reunião marcada não re-aborda".

### Git Intelligence (commits recentes)

- `37e286e` feat(story-21.4) — Central de Oportunidades (baseline desta story; contém `OpportunityCard`/`OpportunitiesPageContent`/`use-opportunities`/rotas `/api/opportunities/*`).
- `099532c` feat(story-21.3) — classificação IA (`reply-classifier`, prompt key, 00058, custo IA).
- `c7f4beb` feat(story-21.6) — engajamento cross-campanha.
- Branch: `epic/21-loop-de-resposta` (commitar na branch do épico — padrão do épico, não abrir feature branch).

### Project Structure Notes

**Novos:**
- `src/lib/utils/opportunity-suggestion.ts`
- `src/app/api/opportunities/[opportunityId]/suggestion/route.ts`
- `src/hooks/use-whatsapp-send-from-opportunity.ts`
- Testes: `__tests__/unit/lib/utils/opportunity-suggestion.test.ts`, `__tests__/unit/app/api/opportunities/[opportunityId]/suggestion/route.test.ts`, `__tests__/unit/actions/whatsapp-from-opportunity.test.ts`, `__tests__/unit/hooks/use-whatsapp-send-from-opportunity.test.ts` (seguir a árvore existente)

**Modificados:**
- `src/types/ai-prompt.ts` (+ `opportunity_next_step` em 3 lugares)
- `src/lib/ai/prompts/defaults.ts` (+ template `opportunity_next_step`)
- `src/app/api/opportunities/[opportunityId]/route.ts` (PATCH: `meeting_booked_at` + status do lead + guarda de state-machine)
- `src/hooks/use-opportunities.ts` (+ `useOpportunitySuggestion`; toast de `meeting_booked` se necessário)
- `src/actions/whatsapp.ts` (+ `sendWhatsAppFromOpportunity`)
- `src/components/opportunities/OpportunityCard.tsx` (rascunho + ações + mailto + triagem + emits)
- `src/components/opportunities/OpportunitiesPageContent.tsx` (dialogs WhatsApp/telefone + `localPhones` + send hook)
- Testes: `use-opportunities.test.ts`, `OpportunityCard.test.tsx`, `OpportunitiesPageContent.test.tsx`, `[opportunityId]/route.test.ts`, `ai-prompt.test.ts` (contagem 13→14)

**Intocados (garantir):** `reply-sweep.ts`, `reply-processor.ts`, `reply-classifier.ts`, `engagement-processor.ts`, `supabase/functions/instantly-webhook/*`, `supabase/functions/reply-sweep/*`, rotas `/api/replies/*`, `GET /api/opportunities` + `/new-count` (21.4, só leitura — não alterar).

Alinhamento total com a estrutura existente (`src/lib/utils/*-suggestion.ts`, `actions/whatsapp.ts`, `components/opportunities/*`). Zero conflito arquitetural.

### References

- [Source: _bmad-output/planning-artifacts/epic-21-loop-de-resposta.md#Story 21.5] — ACs, FR10/FR11/FR16, sequência
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md:771-805] — Jornada 2 (escalonamento do lead interessado; ações de WhatsApp/próximo passo)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:20] — `meeting_booked_at` desacoplado de `status` (Dono: 21.5)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:99] — PATCH aceita regressões de status; guarda de state-machine é da 21.5
- [Source: supabase/migrations/00055_create_opportunities_schema.sql] — `suggestion`/`status`/`meeting_booked_at` (existem; SEM migration)
- [Source: supabase/migrations/00058_add_openai_to_api_usage_logs_check.sql] — CHECK já inclui `'openai'` (custo IA persiste)
- [Source: supabase/migrations/00010_create_leads.sql:6-8] — ENUM `lead_status` inclui `oportunidade` (sem ALTER TYPE)
- [Source: supabase/migrations/00042_create_whatsapp_messages.sql:35,86-88] — 🔴 `campaign_id` **NOT NULL REFERENCES campaigns(id)** (decisão #3 + pré-check obrigatório) + `uq_whatsapp_messages_idempotency (campaign_id, lead_id, external_message_id)`. **Única** migration da tabela.
- [Source: src/lib/utils/approach-suggestion.ts:23-40,50-55,65-114,125-162,175-233] — molde do gerador (tipos, custo, load prompt 3-níveis, callOpenAI texto-livre, main null-on-error)
- [Source: src/lib/utils/monitoring-processor.ts:99-130,136-155,161-186,192-227,344-357,444-463] — `logMonitoringUsage`/`getApiKey`/`loadToneContext`/`loadKBContext`/montagem do KBContextForSuggestion/gate de custo tokens>0
- [Source: src/lib/ai/prompts/defaults.ts:869-924,926-...] — `monitoring_approach_suggestion` (espelhar) + `reply_intent_classification` (precedente de key nova)
- [Source: src/types/ai-prompt.ts:68-81,85-99,186-192] — `PromptKey`/`PROMPT_KEYS`/`promptKeySchema` (registrar `opportunity_next_step` nos 3)
- [Source: src/actions/whatsapp.ts:22-27,48-75,216-348] — schema/credenciais/`sendWhatsAppFromInsight` (molde de `sendWhatsAppFromOpportunity`)
- [Source: src/hooks/use-whatsapp-send-from-insight.ts:1-68] — hook a espelhar (invalidações + boolean de sucesso)
- [Source: src/components/insights/InsightsPageContent.tsx:38-58,190-209] — composer levantado + `handleWhatsAppSend` + pré-preenchimento com `suggestion`
- [Source: src/components/tracking/WhatsAppComposerDialog.tsx:37-55,84-159,162-170] — props (`initialMessage`/`onSend`), copiar, gerar-com-IA interno (ortogonal)
- [Source: src/components/tracking/PhoneLookupDialog.tsx:31-41] — props (`lead.leadId`/`onPhoneFound`)
- [Source: src/components/tracking/OpportunityPanel.tsx:25-51,102-120] — wiring de referência (composer + phone dialog + `localPhones` Map + `useWhatsAppSend`)
- [Source: src/hooks/use-phone-lookup.ts:212-335,359-368] — `usePhoneLookup`(saveToDatabase/leadId) + `getLeadIdentifier` (LinkedIn>email)
- [Source: src/hooks/use-lead-status.ts:57-75] — `useUpdateLeadStatus` (precedente req-time de status do lead)
- [Source: src/components/opportunities/OpportunityCard.tsx:29-68,169-231] — card da 21.4 (handleOpen/markedViewedRef, contato/unibox, insight) a estender
- [Source: src/hooks/use-opportunities.ts:50-55,194-230] — `OpportunityCardData`/`useUpdateOpportunityStatus` (estender)
- [Source: src/app/api/opportunities/[opportunityId]/route.ts:1-86] — PATCH da 21.4 (estender com efeitos)
- [Source: src/types/opportunity.ts:59-61,107-123,142-144,169-171,181-203] — guards/config/colunas `suggestion`/`meeting_booked_at`/`toOpportunity`
- [Source: __tests__/unit/lib/utils/approach-suggestion.test.ts; __tests__/unit/actions/whatsapp-from-insight.test.ts; __tests__/unit/hooks/use-whatsapp-send-from-insight.test.ts; __tests__/helpers/mock-supabase.ts] — padrões de teste a espelhar

## Decisões do Fabossi (2026-07-14) — Open Questions RESOLVIDAS

As 3 Open Questions do create-story foram respondidas. **Já refletidas nas Tasks/ACs acima** — não reabrir.

1. **Gerar o rascunho automaticamente ao abrir — CONFIRMADO** ("podemos gerar um rascunho se o custo for pequeno"). O custo é pequeno **e é limitado por 3 guardas que o dev NÃO pode remover**: (a) **cache em `suggestion`** → no máximo **1 geração por oportunidade, para sempre** (reabrir não gera); (b) **truncagem de `reply_text` em 4000 chars** (~1.000 tokens — teto do prompt); (c) **`maxTokens: 500`** (teto da resposta). Estimativa por geração (gpt-4o-mini, $0.15/1M in + $0.60/1M out): prompt ~2.000 tokens + resposta ~250 → **≈ US$ 0,00045 ≈ R$ 0,0025**. Mesmo em 1.000 oportunidades = **≈ US$ 0,45 ≈ R$ 2,50** (uma vez, não recorrente). *Premissa: prompt de ~2.000 tokens (KB + lead + resposta truncada) — se a KB do tenant for muito extensa, o prompt cresce; o teto real segue na casa dos centavos.* Custo real fica auditável em `api_usage_logs` (AC6).
2. **Enviar WhatsApp marca `contacted` — CONFIRMADO, mas SÓ SE O ENVIO FOI FEITO** ("sim, se o envio for feito"). O auto-mark vive **exclusivamente no ramo de sucesso**, depois do `ZApiService.sendText` retornar OK (Task 6.1) — falha de Z-API → mensagem `failed` e a oportunidade **permanece no status atual** (não vira `contacted`). Teste obrigatório dos dois ramos (Task 8.5).
3. **`campaign_id` da mensagem de WhatsApp — VINCULAR à campanha** ("vincular a campanha"). Confirmado pelo schema: `whatsapp_messages.campaign_id` é **`NOT NULL REFERENCES campaigns(id)`** [00042:35] — vincular não é preferência, é **requisito** (`null` violaria NOT NULL). Gravar `opportunities.campaign_id` (é o `campaigns.id` **local** — o `reply-sweep` resolve external→local antes de gravar [reply-sweep.ts:162-171]). **Exige a guarda de pré-check da Task 6.1** (campanha "desconhecida"/deletada → FK 23503 quebraria o envio). Ver Dev Notes "🔴 `whatsapp_messages.campaign_id` é NOT NULL + FK".

## Achado que virou story própria — RESOLVIDO (2026-07-14)

Durante o create-story desta story, ao validar o schema para a decisão #3, descobriu-se que **o envio de WhatsApp a partir do Insight (Story 13.7, `done`) nunca funcionou em produção**: insere `campaign_id: null` [whatsapp.ts:263] numa coluna `NOT NULL REFERENCES campaigns(id)` [00042:35] → `23502` → early-return genérico → mensagem nunca enviada.

**Confirmado no banco real por Fabossi (2026-07-14):** `is_nullable = NO` — o banco espelha os arquivos, a 13.7 **está quebrada**.

**Decisão do Fabossi:** fix **separado, agora**, **antes** desta story → **[Story 13.11](13-11-fix-envio-whatsapp-do-insight-campaign-id-nullable.md)** (`ready-for-dev`): migration `00059` (`DROP NOT NULL`, FK/UNIQUE preservadas) + log do `insertError` real + testes de contrato. Esta story permanece **zero-migration**.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — dev-story workflow

### Debug Log References

Nenhum bloqueio. Três atritos resolvidos durante o dev (todos de infraestrutura de teste, nenhum de produto):

1. **Mock do UPDATE encadeado** (`route.test.ts` da sugestão): `.update().eq().eq()` só resolve no await final — o chain precisa encadear `eq` e ser *thenable*. Molde adicionado (`makeUpdateChain`).
2. **`navigator.clipboard` é getter-only no happy-dom**: `Object.assign` não substitui → `Object.defineProperty`. Além disso, `userEvent.setup()` instala o **próprio** stub de clipboard: o stub do teste tem que vir **depois** do `setup()`, senão é sobrescrito silenciosamente. Helper `stubClipboard` + comentário no teste.
3. **`WhatsAppComposerDialog` exige QueryClientProvider**: ele usa `useAIGenerate` internamente (o botão "Gerar com IA" dele, ortogonal ao rascunho da 21.5) → os testes do PageContent que montam o composer usam `renderWithClient`.

### Completion Notes List

**9/9 tasks completas. 7 ACs satisfeitos.** ZERO migration (00055/00058 já cobrem), conforme escopo.

> **Correção da code review (2026-07-15):** este bloco dizia "8 ACs" — a lista de Acceptance Criteria tem **7** itens.

> 🟢 **ATUALIZAÇÃO 2026-07-15 (pós-dev): o desvio abaixo VENCEU — a `00059` foi aplicada e validada no banco do cliente no mesmo dia.** A 13.11 está `done`. A contingência descrita aqui foi correta **no momento do dev**, mas a condição que a justificava (*"a coluna ainda é NOT NULL"*) **não vale mais**. A troca prevista no item "Quando a 13.11 rodar" é agora o **único item aberto** desta story — e o fallback `campaign_id: null` + envio já foi **provado em produção** pela validação da 13.11 (insert `NULL` → Z-API → `sent` → aparece no histórico). Ver o bloco 🟢 em Dev Notes → "Pré-requisito: Story 13.11".

🔴 **DESVIO DELIBERADO E AUTORIZADO — Story 13.11 (`00059`) NÃO foi aplicada.** *(Verdadeiro em 2026-07-15 no momento do dev; superado no mesmo dia — ver nota acima.)* Verificado no início do dev: a última migration é a `00058`, a `00059` não existe e a 13.11 segue `ready-for-dev`. A story antecipa exatamente este caso (Dev Notes → "Pré-requisito: Story 13.11") e instrui a contingência, que foi seguida:
- **Caminho normal (campanha existe): inalterado** — `campaign_id` é VINCULADO (decisão #3). É o caminho de 99% dos envios.
- **Caminho dangling (campanha deletada): falha explícita** em vez do fallback `campaign_id: null` — sem a `00059` a coluna ainda é `NOT NULL`, então não há `null` a gravar. Falha ANTES do insert e sem chamar a Z-API (o `23503`/`23502` derrubaria o envio de qualquer forma).
- **Quando a 13.11 rodar:** trocar essa falha pelo fallback `null` + envio. O ponto está marcado no JSDoc de `sendWhatsAppFromOpportunity` (`src/actions/whatsapp.ts`) e o teste `campanha dangling → falha explícita SEM chamar a Z-API` é o que vai virar `→ insert com campaign_id: null e o envio ACONTECE`. **Ação para o Fabossi:** ver "Pendências operacionais" abaixo. — ✅ **FEITO na code review (2026-07-15):** o fallback foi trocado, o JSDoc e o comentário corrigidos, e o teste virado. Este bloco fica como registro histórico do desvio.

**Decisões de implementação (dentro da latitude da story, documentadas no código):**
1. **Cache: update PONTUAL em vez de `invalidateQueries`** (Task 5.1 permitia os dois; Dev Notes pediam "considerar"). O rascunho muda 1 campo de 1 linha — invalidar a lista a cada abertura de card amplificaria o churn já apontado no defer da review 21.4 (`deferred-work.md:101`). `setQueriesData` mantém o cache verdadeiro sem refetch. `suggestion: null` (fail-open) não sobrescreve o cache.
2. **`maxDuration = 60` na rota de sugestão** (Task 3.5 = "considerar"). A geração tem timeout interno de 30s; 60s dá folga sem deixar a function ser morta no meio de uma chamada paga. Bounded (1 chamada por request) — diferente do defer sistêmico da 21.3 sobre as rotas de lote.
3. **KB vazia (`loadKBContext` null) → gera com contexto mínimo** (a story deixou a escolha aberta). O rascunho ainda tem lead + resposta + tom; um rascunho magro serve mais que nenhum, e é coerente com o fail-open de UX do AC5.
4. **`meeting_booked` tem toast próprio** ("Reunião marcada — lead promovido a oportunidade") — Task 5.2 permitia. A promoção do lead é um efeito real e invisível nesta tela.
5. **mailto não duplica o prefixo "Re:"** quando o assunto já vem com "RE:" do Instantly (o caso comum — a oportunidade nasce de uma RESPOSTA). Sem isso o assunto sairia "Re: RE: Proposta".
6. **"Buscar telefone" exige `lead.email`** — o `PhoneLookupDialog`/SignalHire precisa de e-mail; oferecer o botão sem e-mail seria um beco sem saída.

**Defers da review 21.4/21.1 FECHADOS por esta story:** guarda de state-machine no PATCH (`deferred-work.md:99`) e `meeting_booked_at` acoplado ao status (`deferred-work.md:20`).

**Validações:** `npx vitest run` → **385 files / 6601 pass / 2 skip / 0 fail** (baseline 21.4: 381/6495 → **+4 arquivos, +106 testes**). `npx tsc --noEmit` → **0 erros em `src/`**. `npx eslint --max-warnings=0` nos 19 arquivos novos/modificados → **limpo** (inclusive `no-non-null-assertion`; a rota não toca `process.env` — a chave vem do `getApiKey`). `npm run build` → **verde**, rota `/api/opportunities/[opportunityId]/suggestion` registrada. Tailwind v4: **zero `space-y-*`** em `components/opportunities/` (só `flex flex-col gap-*`).

**⚠️ Pendências operacionais (Fabossi) — a suíte NÃO prova nada disto (mock não valida constraint, lição sistêmica do épico):**
1. ~~**Rodar a Story 13.11 (`00059`)**~~ ✅ **FEITO 2026-07-15** — migration aplicada no banco do cliente e validada end-to-end (`is_nullable = YES`; FK e UNIQUE preservadas; envio real do Insight provado: insert `campaign_id NULL` → `sent` → visível no histórico). ~~**Resta a metade de código: trocar o fallback dangling**~~ ✅ **FEITO na code review (2026-07-15):** oportunidade de campanha deletada agora grava `campaign_id: null` e **envia** (decisão #3 cumprida). O pré-check ganhou distinção de erro: só `PGRST116` (0 linhas) é dangling — erro de rede/RLS falha explicitamente em vez de perder a atribuição em silêncio.
2. **Validar 1 envio real end-to-end** a partir de um card: é o insert em `whatsapp_messages` com `campaign_id` **preenchido** — caminho que a 13.7 nunca exercitou (ela sempre mandava `null`). **Segue pendente**: a validação da 13.11 provou o caminho `NULL` (o oposto deste). Roteiro reutilizável: ver Task 5.3 da 13.11 (Fabossi já é lead na base — `fabotse@gmail.com`, telefone dele — o que evita mandar mensagem a prospect real).
3. **Conferir 1 geração real de rascunho** e o registro do custo em `api_usage_logs` (`service_name='openai'`, `request_type='opportunity_next_step'`) — o CHECK da 00058 é o que faz isso persistir.
4. **Deploy Vercel + `epic-21-post-deploy-checklist.md`** seguem pendentes desde a 21.4.

### File List

**Novos (7):**
- `src/lib/utils/opportunity-suggestion.ts`
- `src/app/api/opportunities/[opportunityId]/suggestion/route.ts`
- `src/hooks/use-whatsapp-send-from-opportunity.ts`
- `__tests__/unit/lib/utils/opportunity-suggestion.test.ts`
- `__tests__/unit/app/api/opportunities/[opportunityId]/suggestion/route.test.ts`
- `__tests__/unit/actions/whatsapp-from-opportunity.test.ts`
- `__tests__/unit/hooks/use-whatsapp-send-from-opportunity.test.ts`

**Modificados (12):**
- `src/types/ai-prompt.ts` (+ `opportunity_next_step` em `PromptKey`/`PROMPT_KEYS`/`promptKeySchema`)
- `src/lib/ai/prompts/defaults.ts` (+ template `opportunity_next_step`)
- `src/app/api/opportunities/[opportunityId]/route.ts` (PATCH: guarda de state-machine 409 + `meeting_booked_at` + promoção do lead)
- `src/hooks/use-opportunities.ts` (+ `useOpportunitySuggestion` + `SuggestionResponse` + toast de `meeting_booked`)
- `src/actions/whatsapp.ts` (+ `sendWhatsAppFromOpportunity` + `sendFromOpportunitySchema`)
- `src/components/opportunities/OpportunityCard.tsx` (rascunho + copiar/regenerar + WhatsApp/mailto/telefone + triagem + emits)
- `src/components/opportunities/OpportunitiesPageContent.tsx` (dialogs levantados + `localPhones` + send hook)
- `__tests__/unit/types/ai-prompt.test.ts` (13 → 14 keys)
- `__tests__/unit/app/api/opportunities/[opportunityId]/route.test.ts` (+ triagem/state-machine; 21.4 sem regressão)
- `__tests__/unit/hooks/use-opportunities.test.ts` (+ `useOpportunitySuggestion` + toast de `meeting_booked`)
- `__tests__/unit/components/opportunities/OpportunityCard.test.tsx` (+ ações da 21.5)
- `__tests__/unit/components/opportunities/OpportunitiesPageContent.test.tsx` (+ dialogs da 21.5)

### Change Log

| Data | Mudança |
|---|---|
| 2026-07-15 | Story 21.5 implementada (9/9 tasks, 7 ACs). Rascunho `opportunity_next_step` (gerador + rota on-demand com cache + custo em `api_usage_logs`), ações do card (WhatsApp/mailto/telefone), triagem (`meeting_booked_at` + promoção do lead + guarda de state-machine 409 — fecha 2 defers). +106 testes. **Desvio autorizado:** 13.11/`00059` não aplicada → caminho de campanha dangling é falha explícita (contingência prevista na story). Status → review. |
| 2026-07-15 | **Validação visual com Playwright contra o banco REAL + 3 fixes de qualidade.** Rodar a tela (o que 6.6k testes mockados não fazem) expôs o que o verde escondia. **(1) BUG INTRODUZIDO PELO PATCH D2 DA REVIEW, achado pelo Fabossi e revertido:** o `onMouseEnter → ensureDraft()` no botão E-mail gerava rascunho PAGO ao passar o mouse — percorrer a lista comprava um rascunho por card cruzado. Raciocínio errado do patch: "não dá p/ clicar sem passar o mouse" é verdade e é irrelevante — **hover não é intenção**. Quebrava o anti-pattern #14. Provado com Playwright: hover → 0 POSTs; clique → 1 POST. **(2) `[Seu Nome]`/`[Sua Empresa]` nos rascunhos — NÃO era o modelo:** duas causas de dado faltando, ambas com o dado já no banco. (a) `company_name` é OBRIGATÓRIO na KB [knowledge-base.ts:57] e o `loadKBContext` o DESCARTAVA [monitoring-processor.ts:223] — o teste `loadKBContext` entregava `company_name:"TestCo"` no fixture e a asserção CONGELAVA o descarte (bug assinado por teste verde). (b) o prompt pedia mensagem pronta de vendedor, proibia inventar fatos E proibia placeholders — **sem nunca dizer quem é o vendedor**: armadilha lógica, sem saída legal na assinatura; o modelo escolhia o placeholder (a menos pior — inventar nome mandaria identidade falsa ao prospect). Por isso trocar p/ gpt-4o NÃO resolveria (e cairia no defer do custo hardcoded ~16x). Fix: `companyName` propagado (KBContextForClassification → os 2 geradores) + `{{company_name}}` nos 2 prompts + regra "NÃO ASSINE" (destino já assina: mail client anexa; WhatsApp não se assina). Decisão Fabossi: sem assinatura + aplicar TAMBÉM no Insights (`monitoring_approach_suggestion`, Epic 13 — mesma causa, mesmo sintoma). **(3) assunto do mailto vazio** em oportunidade de engajamento (sem `reply_subject`) → fallback neutro. PROVADO CONTRA A OPENAI REAL (regenerar da Beatriz): antes `[Seu Nome]/[Seu Cargo]/[Nome da Empresa]/[Seu Telefone]` → depois "Aqui na TDEC..." + termina no CTA, MESMO gpt-4o-mini, zero custo a mais. BACKFILL REAL rodado local contra prod (200, 19s, `{swept:6, created:0, engagementCreated:4, classified:2, errors:[]}`): classificou Daniel e Deocleciano como `nao_agora` (leitura correta: "não deve evoluir este ano" / "não é prioridade") → `INTENT_TO_LEAD_STATUS.nao_agora = null` → **pipeline do cliente intacto**; e o polling descobriu 4 leads quentes invisíveis (Jefferson/Lefosse, Marcelo/ELO, Roseli/Abai, Ricardo/Creditas). Confirmado que `SUPABASE_SERVICE_ROLE_KEY` JÁ existe na Vercel Production → o patch D1 funciona pós-deploy. Suíte **386 files / 6627 pass / 2 skip / 0 fail**; tsc 0 em `src/`; eslint limpo. ACHADOS ABERTOS (não corrigidos): "Não classificado" é rótulo enganoso p/ engajamento (`classifyPendingReplies` filtra `source='reply'` — sem resposta não há intenção, é by-design mas lê como falha da IA na demo); edge fn `reply-sweep` com 100% 5XX é ESPERADO (proxy p/ `NEXT_APP_URL`, código não deployado); hydration mismatch pré-existente no submenu Leads da Sidebar. |
| 2026-07-15 | **Code review adversarial de 3 camadas.** 32 achados brutos → 2 decision-needed + 8 patches + 7 defers + 9 dismiss. **2 decisões do Fabossi:** [D1] client admin só nas leituras de contexto; [D2] gerar rascunho também no clique da ação. **10 patches aplicados:** (1) fallback dangling `campaign_id: null` + envio, JSDoc/comentário corrigidos e teste virado (fecha o item da 13.11 e cumpre a decisão #3); (2) pré-check distingue `PGRST116` de erro real (não perde atribuição em silêncio); (3) PII (telefone+mensagem) fora do log, espelhando a 13.11; (4) **chave/KB/prompt lidos com client admin** — RLS `is_admin()` (gestor\|diretor) fazia o rascunho morrer para o SDR, dono declarado da Central; (5) `ensureDraft` extraído do `handleOpen` → WhatsApp aguarda o rascunho e o emite mesclado (composer usa `useState`, não ressincroniza), mailto aquece no hover/focus; (6) `meeting_booked_at` não é reescrito na reentrada (`discarded → meeting_booked`); (7) `meta.leadPromoted` no PATCH → toast não afirma promoção que não houve; (8) `leadId` amarrado a `opportunity.lead_id`; (9) botões de triagem com `disabled={isPending}`; (10) 409 com rótulos pt-BR. **+22 testes** (386 files / 6623 pass / 2 skip / 0 fail); tsc 0 erros em `src/`; eslint `--max-warnings=0` limpo; build verde. Status → done. |

### Review Findings

> Code review adversarial de 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), 2026-07-15, `review_mode: full`, baseline `37e286e`. 32 achados brutos → 17 após dedup/triagem, 9 dispensados. Veredicto do Acceptance Auditor: **5/7 ACs plenos** (AC3 e AC7 PARCIAIS, mesma causa) + **13/14 anti-patterns respeitados** (o #12 quebrado pela metade).
>
> **Correção documental:** esta story tem **7 ACs**, não 8 — o "8 ACs satisfeitos" das Completion Notes está errado (a lista tem 7 itens).

- [x] [Review][Patch] **[D1 RESOLVIDA — Fabossi 2026-07-15: usar o client admin APENAS na leitura da chave]** **SDR nunca gera rascunho — RLS de `api_configs` exige `is_admin()`** — A rota de sugestão lê a chave com o client de sessão do usuário (`createClient`), e a policy de SELECT de `api_configs` [00005:14-20] exige `tenant_id = get_current_tenant_id() AND public.is_admin()`; a 00053:64-78 define `is_admin()` como `role IN ('gestor','diretor')` — **`sdr` fica de fora**. Para um SDR: `getApiKey` → 0 linhas → `null` → a rota devolve `200 {suggestion:null}` (fail-open do AC5) → o card mostra "Não foi possível gerar o rascunho agora" **para sempre**, culpando uma falha transitória por um problema de permissão, sem log algum. O SDR é usuário-alvo declarado da Central [Sidebar.tsx:61] (*"SEM adminOnly — a Central é ferramenta de trabalho do SDR"*), e o AC1 é a feature-título da story. Toda a suíte passa porque `mockGetApiKey.mockResolvedValue("sk-test-key")` mocka exatamente a chamada que o RLS mata. **Causa-raiz é pré-existente** (mesmo padrão em `monitoring/initial-scan` do Epic 13, também request-time e user-scoped), mas a 21.5 é a primeira a colocar geração automática de IA numa página desenhada para o SDR. Opções: (a) ler a chave com o client admin (`supabase/admin.ts`) só nessa leitura; (b) afrouxar a policy p/ SELECT da chave; (c) aceitar e corrigir a copy. [src/app/api/opportunities/[opportunityId]/suggestion/route.ts:108]
- [x] [Review][Patch] **[D2 RESOLVIDA — Fabossi 2026-07-15: gerar o rascunho também no clique da ação]** **Composer e mailto saem em branco quando o usuário clica na ação sem abrir o card** — Os botões WhatsApp/E-mail ficam **fora** do gate `expanded` [OpportunityCard.tsx:413,448] e chamam `stopPropagation`, então nunca disparam `handleOpen` — que é o único lugar que gera o rascunho [OpportunityCard.tsx:131]. Quem chega na Central e clica direto em "WhatsApp" (o botão está visível de cara) abre o composer com `initialMessage = composerOpportunity.suggestion` = `null` → **composer vazio**; e "E-mail" abre o mailto com `body=` vazio. O AC3 exige o composer *"pré-preenchido com o rascunho"*. Fluxo normal (abrir card → esperar rascunho → agir) funciona: o `setQueriesData` do hook atualiza a prop do card, então o snapshot passado ao composer já vem fresco. Opções: (a) gerar o rascunho também no clique da ação (custo no mesmo teto do cache); (b) desabilitar/aguardar a ação enquanto não há rascunho; (c) aceitar (o composer tem "Gerar com IA" próprio). [src/components/opportunities/OpportunitiesPageContent.tsx:270]
- [x] [Review][Patch] Fallback de campanha dangling não trocado — a contingência venceu em 2026-07-15 e o bloqueio permanece (código + comentário + JSDoc + teste), e o pré-check ainda engole o erro do SELECT [src/actions/whatsapp.ts:462-476]
- [x] [Review][Patch] PII (telefone do lead + corpo da mensagem) vaza para o log — as 2 actions irmãs logam só `code`+`message`, esta despeja o `insertError` inteiro [src/actions/whatsapp.ts:499]
- [x] [Review][Patch] `meeting_booked_at` é sobrescrito ao reentrar em `meeting_booked` — as Dev Notes exigem "uma vez"; o caminho `meeting_booked → discarded → meeting_booked` é permitido e alcançável pela UI [src/app/api/opportunities/[opportunityId]/route.ts:120-129]
- [x] [Review][Patch] Toast afirma "lead promovido a oportunidade" mesmo quando `lead_id` é null ou a promoção falhou (efeito secundário que só loga) [src/hooks/use-opportunities.ts:243]
- [x] [Review][Patch] `leadId` e `opportunityId` são validados de forma independente — nada assere `opportunity.lead_id === leadId` [src/actions/whatsapp.ts:446-451]
- [x] [Review][Patch] Botões de triagem não desabilitam em voo — `isPending` é exposto e ignorado; duplo-clique = 2 PATCHes [src/components/opportunities/OpportunityCard.tsx:464-500]
- [x] [Review][Patch] 409 devolve enum em inglês numa UI pt-BR ("de \"contacted\" para \"new\"") — `OPPORTUNITY_STATUS_CONFIG` existe como fonte única dos rótulos [src/app/api/opportunities/[opportunityId]/route.ts:113]
- [x] [Review][Patch] Completion Notes dizem "8 ACs" numa story de 7 ACs [_bmad-output/implementation-artifacts/21-5-acoes-do-card-proximo-passo-por-ia.md:313]
- [x] [Review][Defer] Custo hardcoded em tarifa gpt-4o-mini enquanto `model_preference` do tenant é honrado [src/lib/utils/opportunity-suggestion.ts:214] — deferred, pre-existing (idêntico em `approach-suggestion.ts:214`, Epic 13)
- [x] [Review][Defer] Guarda de state-machine é read-then-write (TOCTOU) — o UPDATE não carrega predicado de status [src/app/api/opportunities/[opportunityId]/route.ts:86-137] — deferred, pre-existing (mesma família do TOCTOU cron+backfill da 21.6)
- [x] [Review][Defer] Truncagem de custo cobre só `reply_text` (4000 chars); a KB entra no prompt sem teto [src/lib/utils/opportunity-suggestion.ts:51] — deferred, pre-existing (mesmo padrão do Epic 13)
- [x] [Review][Defer] Completion vazia com tokens consumidos: cobra, loga `status:"success"`, não cacheia e re-tenta a cada clique (inclusive ao FECHAR o card) [src/app/api/opportunities/[opportunityId]/suggestion/route.ts:152-167] — deferred, pre-existing
- [x] [Review][Defer] `opportunityId` não-UUID → 500 em vez de 404/400 (`22P02` não é `PGRST116`) [src/app/api/opportunities/[opportunityId]/suggestion/route.ts:89] — deferred, pre-existing (mesmo padrão no PATCH da 21.4)
- [x] [Review][Defer] Cache do rascunho é read-then-write sem lock — 2 abas geram (e pagam) 2x [src/app/api/opportunities/[opportunityId]/suggestion/route.ts:103-174] — deferred, pre-existing
- [x] [Review][Defer] Rejeição (não erro) do update pós-`sendText` cai no catch → marca `failed` numa mensagem JÁ ENVIADA → usuário reenvia → lead recebe 2x [src/actions/whatsapp.ts:508-571] — deferred, pre-existing (mesma forma em `sendWhatsAppFromInsight`)
