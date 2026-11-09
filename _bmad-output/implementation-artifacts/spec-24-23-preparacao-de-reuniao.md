---
title: '24.23 — Preparação de reunião'
type: 'feature'
created: '2026-11-06'
status: review
baseline_revision: '55a3671de4140722fc55521b8b4651cc39782d06'
review_loop_iteration: 0
followup_review_recommended: true
linear: 'FEL-46'
requisitos: 'FR40'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-24-22-dossie-visivel-na-revisao-e-na-oportunidade.md'
warnings: [oversized]
deferred:
  - summary: >-
      Gerar o dossiê sob demanda quando a oportunidade não tem pesquisa ("resumo da conta (dossiê, gerando se não houver)").
    evidence: |-
      Exige extrair researchAccount do ResearchAccountsStep (arquivo no caminho até o Instantly, Regra nº 1 ponto 3) e abrir escrita nova em produção (account_dossiers/facts/leads) e custo Treg sem teto próprio. DW-34 e DW-36 pedem o OK do Fabossi. Hoje o briefing mostra "Sem pesquisa da conta" e segue. Listado em operator_actions.
    location: >-
      src/app/api/opportunities/[opportunityId]/meeting-prep/route.ts (readDossier)
    severity: medium
operator_actions:
  - "Aplicar a migration supabase/migrations/00074_add_meeting_prep_to_opportunities.sql no SQL Editor do Supabase de produção (rodar o PRE-CHECK do cabeçalho antes). Sem ela o briefing é gerado e exibido, mas não fica salvo no card."
  - "Decidir a DW-34/DW-36: autorizar (ou não) a geração do dossiê sob demanda a partir da oportunidade, que abre escrita nova em produção e custo Treg e mexe no research-accounts-step. Enquanto não houver OK, o briefing mostra 'Sem pesquisa da conta' quando o lead não tem dossiê."
  - "Depois do merge e do deploy, com a 00074 aplicada, fazer o smoke em /opportunities: numa oportunidade 'interessado' ou 'Reunião marcada', clicar em Preparar reunião, conferir as 4 seções e os selos 'Sugestão', Copiar, Regenerar e reabrir o card sem nova geração. Sem ativar nada no Instantly e sem enviar nada ao lead."
  - "No Linear, mover a FEL-46 para Precisa Felipe com o label precisa-felipe por causa da migration 00074, e para Review humano / PR quando o PR estiver aberto. Não marcar Done antes do merge e do smoke."
---

<intent-contract>

## Intent

**Problem:** Quando um lead responde com interesse ou marca reunião, o vendedor chega à conversa sem preparo. O dossiê, a resposta e as provas da KB estão espalhados, e ninguém monta os pontos de conversa nem as objeções prováveis.

**Approach:** Criar um botão "Preparar reunião" no card da oportunidade elegível. Ele gera um briefing de uma página e o salva em `opportunities.meeting_prep` (migration aditiva 00074, escrita e nunca aplicada pelo agente). O resumo da conta e o histórico de engajamento são montados por código a partir de dados reais. A LLM só escreve os pontos de conversa e as objeções, citando ids de fontes. O código revalida cada citação e marca como "sugestão" tudo que não tiver uma fonte válida.

## Boundaries & Constraints

**Always:**
- Elegível = `intent = 'interessado'` **ou** `status = 'meeting_booked'`. O botão só aparece nesses cards e a rota recusa as demais oportunidades (422 `NOT_ELIGIBLE`).
- Origem por item: `dossie` | `resposta` | `kb` | `sugestao`. A origem declarada pela LLM só vale se houver ao menos um ref válido do tipo certo. Caso contrário, o item vira `sugestao` e os refs inválidos são descartados.
- O resumo da conta e o engajamento são **determinísticos** (sem LLM): fatos do dossiê via `lookupAccountDossier` (client de sessão) e dados da linha da oportunidade, mais `campaign_events` do lead. Toda leitura é tenant-scoped (`.eq("tenant_id")`).
- O briefing é fail-open: sem chave, com a LLM fora, timeout (30 s) ou JSON inválido, a rota devolve 200 com `meetingPrep: null` e `reason`, sem gravar nada. Quando a gravação falha (ex.: coluna ainda não existe), a rota devolve o briefing com `saved: false`.
- O custo vai para `api_usage_logs` (`service_name='openai'`, `request_type='opportunity_meeting_prep'`), só quando houve consumo de tokens.
- Na UI, todo texto é texto puro do React (sem `dangerouslySetInnerHTML` e sem markdown), e os links passam por `safeHttpUrl` (http/https, `rel="noopener noreferrer"`).
- Cache: com briefing salvo e `regenerate` diferente de `true`, a rota devolve o salvo, sem LLM e sem custo.

**Never:**
- Gerar dossiê sob demanda. Isso fica na DW-34, que pede o OK do Fabossi: abre escrita nova em produção, gasto com Treg e mexe em `research-accounts-step.ts`. Sem dossiê, o briefing mostra "Sem pesquisa da conta" e segue.
- Gerar automaticamente ao marcar reunião, porque seria um gasto silencioso. O AC aceita o clique ("ou"), e o automático fica registrado como follow-up.
- Aplicar a migration, tocar `pg_cron`, Edge Functions, env/secrets, `src/lib/agent/steps/`, `orchestrator.ts`, `src/lib/services/instantly*`, `src/lib/utils/reply-processor.ts`, webhooks, `GET /api/opportunities` (rota), o `PATCH /api/opportunities/[opportunityId]` ou `src/lib/agent/dossier/*`.
- Incluir `meeting_prep` em `toOpportunityRow` (um INSERT antes da migration quebraria a ingestão de respostas).
- Mandar e-mail, WhatsApp ou qualquer coisa ao lead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gera pela 1ª vez | elegível, sem `meeting_prep`, com chave, dossiê `found`, KB com provas | 200 `{meetingPrep, saved:true}`; 3–5 pontos e objeções com origem validada; 1 log de custo | — |
| Cache | `meeting_prep` salvo, `regenerate` ausente | 200 `{meetingPrep, cached:true}`, sem LLM e sem log | — |
| Regenerar | `regenerate:true` | gera de novo e sobrescreve | — |
| Não elegível | `intent='pediu_info'`, `status='viewed'` | 422 `NOT_ELIGIBLE`, sem LLM | — |
| Sem dossiê | lookup `none` ou sem lead | `account.status='none'`; nenhum item fica `dossie` | — |
| Dossiê com erro | lookup `{error}` | `account.status='error'`; o briefing é gerado sem fatos | log `console.error` |
| Ref inventado | LLM cita `F9` inexistente ou origem `kb` sem ref P/KB | item vira `sugestao`, refs inválidos removidos | — |
| Poucos pontos | LLM devolve menos de 3 pontos válidos | 200 `{meetingPrep:null, reason:'invalid_response'}`, nada gravado | custo logado se houve tokens |
| Sem chave | `getApiKey` null | 200 `{meetingPrep:null, reason:'no_openai_key'}` | sem custo |
| LLM falha | throw ou timeout | 200 `{meetingPrep:null, reason:'llm_error'}` | sem gravação |
| Gravação falha | update com erro | 200 `{meetingPrep, saved:false}` | `console.error` |
| Outro tenant ou inexistente | id fora do tenant | 404 `NOT_FOUND` | — |
| Sem sessão | — | 401 | — |

</intent-contract>

## Code Map

- `supabase/migrations/00055_create_opportunities_schema.sql:25-48` -- tabela `opportunities`: `intent` CHECK (:35), `status` CHECK (:39), RLS com 4 policies por tenant (:73-96), então o UPDATE pela sessão funciona para SDR.
- `supabase/migrations/00057_add_engagement_to_opportunities.sql:26-29` -- molde de `ADD COLUMN IF NOT EXISTS` + `COMMENT`. O cabeçalho segue `00073` (:1-52: aditiva, "NÃO APLICAR sem o OK do Fabossi", PRE-CHECK, ROLLBACK). Próximo número livre: **00074**.
- `src/types/opportunity.ts:130-237` -- `OpportunityRow`/`Opportunity`/`toOpportunity`/`toOpportunityRow`. Só `toOpportunity` é usado em `src` (`src/app/api/opportunities/route.ts:210`, que faz spread no DTO, então o campo novo chega ao cliente sem tocar na rota).
- `src/app/api/opportunities/[opportunityId]/suggestion/route.ts` -- **molde da rota nova**: perfil, oportunidade tenant-scoped com lead embedado, cache, `createAdminClient` para chave/KB (RLS `is_admin()`), `getApiKey`, `logMonitoringUsage` pelo client de sessão, update tenant-scoped, `maxDuration = 60`. Teste molde: `__tests__/unit/app/api/opportunities/[opportunityId]/suggestion/route.test.ts`.
- `src/lib/utils/monitoring-processor.ts:99,136` -- `logMonitoringUsage`, `getApiKey`. Para a KB, ler `knowledge_base` (`section='company'|'icp'`, campo `content`) com o client admin. `ICPDefinition.pain_points`/`common_objections` ficam em `src/types/knowledge-base.ts:240-248`.
- `src/lib/services/knowledge-base-proofs.ts:13` -- `fetchKnowledgeBaseProofs` (nunca lança). Usar só `is_authorized`, no máximo 20, como `formatAuthorizedProofs` (`src/lib/services/knowledge-base-context.ts:233-260`). `PROOF_TYPES` (labels) está em `src/types/knowledge-base.ts:327`.
- `src/lib/agent/dossier/dossier-lookup.ts:217` -- `lookupAccountDossier(supabase, tenantId, {leadId, email}, now)` devolve `{view}|{error}` e nunca lança. Reusar sem alterar. O tipo `AccountDossierView` está em `src/types/account-dossier.ts:45`.
- `src/lib/ai/why-now-config.ts` + `src/lib/agent/dossier/why-now.ts:104-115,264,292` -- **molde do LLM**: config SSOT (modelo `gpt-5.4-mini`, `buildXRequest` com `response_format: json_object`, sem `temperature` em gpt-5), SDK `openai` com `maxRetries: 0`, factory de client injetável para teste, system prompt em constante exportada. Preços e custo seguem `src/lib/ai/copy-review-config.ts:38-57`.
- `supabase/migrations/00039_create_campaign_events.sql:10-21` -- `campaign_events` (`tenant_id`, `campaign_id`, `lead_email`, `event_type`, `event_timestamp`). O e-mail é normalizado em minúsculo na ingestão (`reply-processor.ts:105,195`).
- `src/hooks/use-opportunities.ts:51,298-330` -- `OpportunityCardData`; `useOpportunitySuggestion` é o molde do hook (mutation + `setQueriesData` pontual em `["opportunities"]`).
- `src/components/opportunities/OpportunityCard.tsx:70-74,548-562` -- prop `onOpenDossier` e botão "Dossiê" com `stopPropagation`: o molde do botão novo. `handleCopyDraft` (:183-192) é o molde da cópia (`navigator.clipboard`).
- `src/components/opportunities/OpportunitiesPageContent.tsx:104-105,229,346-360` -- estado `dossierTarget` + um `<AccountDossierSheet>` por página: molde do Sheet novo.
- `src/components/dossier/AccountDossierPanel.tsx:31` -- `safeHttpUrl` exportado (reusar). O componente `Sheet` vem de `src/components/ui/sheet`.

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/00074_add_meeting_prep_to_opportunities.sql` -- `ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS meeting_prep JSONB` (nullable, sem default) + `COMMENT`. Cabeçalho com "NÃO APLICAR sem o OK do Fabossi", PRE-CHECK e ROLLBACK (`DROP COLUMN IF EXISTS`). -- guardar o briefing no card; a migration é só aditiva.
- `src/types/meeting-prep.ts` (NOVO) -- tipos + schema zod `meetingPrepSchema` e `parseMeetingPrep(unknown): MeetingPrep | null` (versão 1). O contrato está nas Design Notes. -- fonte única do formato, com leitura defensiva do jsonb.
- `src/types/opportunity.ts` -- `meeting_prep?: unknown` no Row e `meetingPrep?: MeetingPrep | null` no TS; `toOpportunity` usa `parseMeetingPrep(row.meeting_prep)`; `toOpportunityRow` **não** inclui o campo. -- levar o briefing salvo ao card sem quebrar INSERTs antes da migration.
- `src/lib/ai/meeting-prep-config.ts` (NOVO) -- `MEETING_PREP_MODEL`, `buildMeetingPrepRequest`, preços e `calculateMeetingPrepCost`, no molde de why-now/copy-review. -- SSOT do modelo.
- `src/lib/meeting-prep/sources.ts` (NOVO, puro) -- monta o catálogo de fontes com ids: fatos do dossiê `F1..F8` (até 8, a ordem da view, mais o gatilho/hipótese quando houver), resposta `R` (assunto + texto cortado em 2000 caracteres), provas autorizadas `P1..P20`, `KB-DORES` (pain_points) e `KB-OBJ` (common_objections). Também monta as seções determinísticas `account` e `engagement`. -- separar dado real de texto da LLM.
- `src/lib/meeting-prep/generator.ts` (NOVO) -- `MEETING_PREP_SYSTEM_PROMPT` (pt-BR: 3–5 pontos ligados às dores e provas, 1–5 objeções com resposta; citar só ids do catálogo; não inventar números, nomes nem cases; sem fonte → `sugestao`), `generateMeetingPrep({sources, apiKey, clientFactory?})` que devolve `{talkingPoints, objections, usage, reason?}` e `validateItems` (regras de origem e ref, corte em 5 itens e 400 caracteres, descarta vazio; menos de 3 pontos → `invalid_response`). Não lança. -- honestidade garantida por código, não pelo prompt.
- `src/lib/meeting-prep/format-text.ts` (NOVO, puro, client-safe) -- `formatMeetingPrepText(prep)` gera texto simples para copiar, com o prefixo "[Sugestão]" nos itens `sugestao` e a fonte (host) nos fatos. -- ação Copiar.
- `src/app/api/opportunities/[opportunityId]/meeting-prep/route.ts` (NOVO, POST `{regenerate?}`) -- fluxo da matriz I/O, no molde da rota `suggestion`. Os eventos vêm de `campaign_events` (`.eq tenant_id/campaign_id/lead_email`, `order event_timestamp desc`, `limit 20`); se falhar, segue com `[]`. -- endpoint de geração, cache e regeneração.
- `src/hooks/use-meeting-prep.ts` (NOVO) -- `useMeetingPrep(opportunityId)`: mutation POST, `setQueriesData` pontual de `meetingPrep` em `["opportunities"]` quando vier briefing, e toast de erro só no regenerar. -- integração com o cache da lista.
- `src/components/opportunities/MeetingPrepPanel.tsx` + `MeetingPrepSheet.tsx` (NOVOS) -- o Sheet abre com o briefing salvo. Sem briefing salvo, dispara `generate` uma vez ao abrir (o clique em "Preparar reunião" é a intenção). Estados: carregando (Skeleton), sem briefing com `reason` em linguagem simples + "Tentar de novo", e briefing. O briefing tem as seções "Resumo da conta" (fatos com fonte/data ou "Sem pesquisa da conta" + nota da DW-34), "Engajamento e resposta", "Pontos de conversa", "Objeções prováveis" (com a resposta sugerida), badge "Sugestão" ou a origem por item, "Gerado em dd/mm/aaaa hh:mm", e os botões "Regenerar" e "Copiar". Com `saved:false`, o aviso "não foi possível salvar". -- UI do AC.
- `src/components/opportunities/OpportunityCard.tsx` -- prop opcional `onOpenMeetingPrep?`. Só para elegível, o botão "Preparar reunião" (`data-testid="opportunity-action-meeting-prep"`, ícone lucide, `stopPropagation`, não chama `handleOpen`). Sem a prop, o card fica idêntico. -- entrada do fluxo.
- `src/components/opportunities/OpportunitiesPageContent.tsx` -- estado `meetingPrepTarget` + um `<MeetingPrepSheet>` + `onOpenMeetingPrep` nos cards. -- padrão de Sheet por página.
- Testes (sem rede; OpenAI, Supabase e fetch mockados): `__tests__/unit/lib/meeting-prep/{sources,generator,format-text}.test.ts`, `__tests__/unit/app/api/opportunities/[opportunityId]/meeting-prep/route.test.ts` (cada linha da matriz I/O, `tenant_id` em toda query, update só da coluna `meeting_prep`), `__tests__/unit/types/meeting-prep.test.ts` (`parseMeetingPrep` com lixo → null; `toOpportunityRow` sem `meeting_prep`), `__tests__/unit/components/opportunities/MeetingPrepPanel.test.tsx` (estados, Sugestão, cópia, `<script>` literal, link `javascript:` sem `<a>`) e blocos novos no fim de `OpportunityCard.test.tsx`/`OpportunitiesPageContent.test.tsx` (botão só em elegível; clique não expande nem marca viewed; abre o Sheet). Os testes existentes não mudam de expectativa.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- novos DW: "gerar o briefing automaticamente ao marcar reunião (24.23)" e "o briefing usa dossiê sob demanda quando a DW-34 for liberada". -- registrar o que ficou fora.

**Acceptance Criteria:**
- Given uma oportunidade com `intent='interessado'` ou `status='meeting_booked'`, when o usuário clica em "Preparar reunião", then abre o painel e o briefing é gerado com resumo da conta, engajamento + resposta do lead, 3–5 pontos de conversa e objeções com resposta sugerida.
- Given um briefing gerado, when o card é reaberto (inclusive depois de recarregar a página com a 00074 aplicada), then o mesmo briefing aparece sem nova chamada à LLM, e "Regenerar" troca o salvo e "Copiar" põe o texto na área de transferência.
- Given um item sem fonte válida no catálogo, when exibido ou copiado, then ele aparece marcado como "Sugestão".
- Given qualquer falha da geração, when o painel está aberto, then o resto da Central (triagem, rascunho, dossiê, WhatsApp e parar sequência) continua funcionando igual.
- Given o diff final, when comparado com `main`, then os arquivos proibidos em **Never** têm diff vazio, e o lint, o typecheck e o test:run passam.

## Design Notes

Contrato salvo (`meeting_prep`, versão 1):

```ts
type MeetingPrepOrigin = 'dossie' | 'resposta' | 'kb' | 'sugestao';
interface MeetingPrep {
  version: 1; generatedAt: string;
  account: { status: 'found'|'none'|'error'; companyName: string|null; companyDomain: string|null;
    researchedAt: string|null; expired: boolean;
    facts: { id: string; kind: string; fato: string; fonteUrl: string|null; data: string }[];
    whyNow: { gatilho: string; hipoteseDor: string|null } | null };
  engagement: { source: 'reply'|'engagement'; campaignName: string|null; replySubject: string|null;
    replyText: string|null; repliedAt: string|null; openCount: number|null; clickCount: number|null;
    lastEngagementAt: string|null; meetingBookedAt: string|null; events: { type: string; at: string }[] };
  talkingPoints: { text: string; origin: MeetingPrepOrigin; refs: string[] }[];
  objections: { objection: string; answer: string; origin: MeetingPrepOrigin; refs: string[] }[];
}
```

Regras de ref: `dossie` exige `F*` existente, `resposta` exige `R` com reply não vazio e `kb` exige `P*` existente, `KB-DORES` ou `KB-OBJ` com conteúdo. Nos refs de origens mistas, vale a primeira origem válida na ordem dossie > resposta > kb. A LLM recebe só o catálogo (fatos e provas como dados, entre delimitadores, com a instrução de ignorar ordens dentro deles).

Operador (status final esperado `awaiting-operator`): aplicar a 00074. Sem ela, o briefing é gerado e exibido, mas não fica salvo (`saved:false`).

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erros
- `npm run typecheck` -- expected: limpo
- `npm run test:run` -- expected: tudo verde, inclusive os testes novos
- `git diff main -- src/lib/agent/ src/lib/services/ src/lib/utils/reply-processor.ts src/app/api/opportunities/route.ts 'src/app/api/opportunities/[opportunityId]/route.ts' src/app/api/instantly-webhook supabase/functions` -- expected: vazio
- `grep -rn "dangerouslySetInnerHTML" src/components/opportunities src/lib/meeting-prep` -- expected: vazio

## Spec Change Log

## Review Triage Log

### 2026-11-06 — Review pass
- verdicts: 31 findings — high 0, medium 9, low 16, false 5, maybe-false 1
- findings:
  - `[low]` `[reject]` (blind) Briefing salvo fica inacessível quando a oportunidade deixa de ser elegível (422 antes do cache; botão escondido) — real, mas raro (sair de meeting_booked depois de gerar); a correção muda a regra de elegibilidade da rota e do card, mais que uma correção direta.
  - `[low]` `[reject]` (blind) Abrir, fechar e reabrir o painel durante a geração dispara 2 chamadas pagas; sem trava no servidor — real, custo de uma chamada extra (~US$0,005) em uso raro; a correção exige estado de "em andamento" fora do corpo do Sheet ou update condicional.
  - `[medium]` `[patch]` (blind) Os delimitadores `<<<DADOS`/`DADOS>>>` podiam ser fechados por dentro da resposta do lead, e a linha CONTEXTO ficava fora do bloco — corrigido: `stripDelimiters` em todo dado + CONTEXTO dentro do bloco; teste com delimitadores na resposta, fato, cargo e empresa.
  - `[false]` `[reject]` (blind) Prompt pede 300 caracteres e o código corta em 400 — o 400 é margem de segurança do corte; nenhum item válido é perdido nem cresce além do teto.
  - `[maybe-false]` `[reject]` (blind) Prompt sem acentos pode gerar saída sem acentos — para decidir, olhar respostas reais do modelo; se fosse real, seria low (cosmético), e os prompts da 24.20 seguem o mesmo padrão.
  - `[medium]` `[patch]` (blind) Nada exige ao menos uma objeção; briefing sem a parte do AC era salvo — corrigido: `MIN_OBJECTIONS = 1`, senão `invalid_response`; testes ajustados.
  - `[low]` `[reject]` (blind) Briefing salvo nunca é marcado como desatualizado — o "Regenerar" cobre; o aviso exigiria comparar várias datas (lógica nova).
  - `[low]` `[reject]` (blind) `GET /api/opportunities` passa a levar o jsonb do briefing em cada linha — lista paginada e ordenada por created_at; a carga extra é pequena, e evitar exigiria mexer na rota da lista (proibida pela Regra nº 1 da story) ou criar leitura nova.
  - `[medium]` `[patch]` (blind) Hook e Sheet sem testes diretos — agrupado com os dois achados da verification-gap; corrigido com `use-meeting-prep.test.ts` e o caso "Regenerar" no `OpportunitiesPageContent.test.tsx`.
  - `[low]` `[reject]` (blind) A geração passiva troca a mensagem real do servidor por texto genérico — o 422 não é alcançável pela UI (botão só em elegível); 404/500 têm o mesmo efeito prático para o usuário.
  - `[low]` `[reject]` (blind) `lastEngagementAt` não aparece e o nome da empresa some sem dossiê — o título do painel já mostra a empresa; a lista de eventos cobre o último engajamento.
  - `[low]` `[patch]` (blind) Ordem do gatilho e dos fatos diferente entre painel e texto copiado — corrigido: gatilho e hipótese antes dos fatos no `format-text.ts`.
  - `[low]` `[reject]` (blind) `repliedAt` cai no `created_at` da oportunidade sem evento de resposta — a oportunidade é criada na ingestão da resposta; a diferença é pequena e não muda a preparação.
  - `[low]` `[reject]` (blind) Spec sem Completion Notes e com status de revisão — a correção é editar a spec desta build; as notas e o status são preenchidos na finalização abaixo.
  - `[false]` `[reject]` (blind) Cada geração muda `updated_at` — a lista ordena por `created_at` (`src/app/api/opportunities/route.ts:118`), e a rota `suggestion` já atualiza a mesma linha do mesmo jeito.
  - `[medium]` `[patch]` (edge) `campaign_events.lead_email` é gravado com as maiúsculas originais (`src/lib/webhook/instantly-webhook-utils.ts:132`) e o filtro usava o e-mail em minúsculo — corrigido: `.in("lead_email", [original, minúsculo])`; teste com e-mail em caixa mista.
  - `[low]` `[reject]` (edge) Dois POSTs ao mesmo tempo geram duas chamadas pagas — mesmo achado do item de reabrir o painel; mesmo motivo.
  - `[low]` `[reject]` (edge) `requestedRef` zera ao remontar o Sheet durante a geração — mesmo achado; mesmo motivo.
  - `[low]` `[reject]` (edge) id que não é UUID devolve 500 em vez de 404 — a UI só manda ids reais; a rota `suggestion` irmã tem o mesmo comportamento.
  - `[low]` `[reject]` (edge) A assinatura da resposta (nome, telefone) vai para a LLM — a resposta é a própria fonte do briefing, e a 21.5 já manda o mesmo texto à OpenAI; o comentário "sem nome nem e-mail" se refere só à linha de contexto.
  - `[low]` `[patch]` (edge) Evento com data inválida deixa " em " solto no texto copiado — corrigido: só o rótulo quando a data não formata.
  - `[false]` `[reject]` (edge) O hook não atualiza o cache da lista quando `saved:false` — de propósito: sem a coluna o briefing não está salvo, e mostrar como salvo seria falso; o aviso "não foi possível salvar" aparece.
  - `[medium]` `[patch]` (verification-gap) Fluxo "Regenerar" do Sheet sem teste ponta a ponta — corrigido: caso novo com corpo `{regenerate:true}`, falha que mantém o briefing anterior + toast, e resposta não-ok com toast.
  - `[medium]` `[patch]` (verification-gap) Atualização do cache da lista pelo hook nunca exercitada — corrigido: `use-meeting-prep.test.ts` com QueryClient real (saved:true só no alvo; saved:false e null não mudam o cache).
  - `[medium]` `[defer]` (intent) O briefing não gera o dossiê quando falta ("gerando se não houver") — depende de aprovação humana (CLAUDE.md, Regra nº 1; DW-34/DW-36): abre escrita nova em produção e custo Treg e mexe no `research-accounts-step.ts`. Registrado em `deferred` e em `operator_actions`, conforme a instrução da execução para ações que só um humano pode fazer.
  - `[false]` `[reject]` (intent) Falta gerar automaticamente ao marcar reunião — o AC diz "ou"; o clique atende, e o automático fica na DW-35.
  - `[low]` `[reject]` (intent) "Resumo da conta" sai como lista de fatos com fonte, não como texto corrido — a lista é o resumo do dossiê, sem risco de invenção; um texto da LLM traria fatos sem fonte.
  - `[medium]` `[patch]` (intent) Objeções podiam faltar — mesmo grupo do mínimo de objeções; corrigido junto.
  - `[medium]` `[patch]` (intent) A origem era validada só pelos ids citados; um número inventado com ref válido mantinha "dossiê"/"KB" — corrigido: `guardNumbers` força "sugestão" quando o texto tem número que não está nas fontes citadas; testes com número presente e inventado.
  - `[false]` `[reject]` (intent) Salvar no card depende da 00074, que não está aplicada — não é defeito: aplicar migration é ação do Fabossi; a rota responde `saved:false` até lá. Listado em `operator_actions`.
  - `[low]` `[reject]` (intent) Spec em `in-review` sem `operator_actions` — a correção é editar a spec desta build; feito na finalização (status `awaiting-operator`).

## Completion Notes — Regra nº 1

- **Verificação feita:** análise do diff + testes mockados (OpenAI e Supabase mockados). Sem smoke real nesta etapa: a coluna 00074 não está aplicada e não se roda nada contra produção. O smoke está em `operator_actions`.
- **O que pode ter mudado para o cliente:**
  - rota nova: `POST /api/opportunities/[opportunityId]/meeting-prep`; nenhuma rota existente alterada;
  - tabela: coluna nova `opportunities.meeting_prep` (jsonb, nullable) na migration 00074, **escrita e não aplicada**; `toOpportunityRow` não inclui a coluna, então os INSERTs da ingestão de respostas não mudam;
  - leituras novas (só no clique): `opportunities`, `campaigns`, `campaign_events`, `knowledge_base` (icp), `knowledge_base_proofs`, `api_configs` (chave) e o dossiê via `lookupAccountDossier` existente;
  - integração: 1 chamada OpenAI (`gpt-5.4-mini`) por geração, registrada em `api_usage_logs` (`opportunity_meeting_prep`); nada de Treg, Apollo nem Instantly;
  - prompts: um prompt novo (constante em `generator.ts`); nenhum prompt existente alterado;
  - jobs: nenhum (`pg_cron`, Edge Functions, env e secrets intocados);
  - UI: botão "Preparar reunião" nos cards elegíveis da Central e painel lateral.
- **Ponto 1 — campanhas rodando, webhook e `reply-sweep`:** OK por análise do diff. Webhook, `reply-processor`, `reply-sweep` e serviços do Instantly com diff vazio.
- **Ponto 2 — busca de leads:** OK por análise do diff. Nada em `src/lib/agent/`, `src/lib/services/` nem nas rotas de leads/Apollo.
- **Ponto 3 — criação, export e ativação:** OK por análise do diff. Nenhum arquivo do caminho até o Instantly tocado; nenhum filtro, trava ou atraso novo.
- **Algum dos 3 pontos pode ser afetado?** Não. A story para em `awaiting-operator` só pela migration 00074 (e pela decisão da DW-34), não por risco aos 3 pontos.

## Auto Run Result

Status: awaiting-operator

**Resumo:** botão "Preparar reunião" na Central de oportunidades (lead `interessado` ou `Reunião marcada`) que gera um briefing de uma página. O resumo da conta (fatos do dossiê com fonte e gatilho) e o engajamento (resposta, aberturas, cliques e eventos) são montados por código. A LLM escreve 3–5 pontos de conversa e 1–5 objeções com resposta, citando ids de fontes. O código revalida cada citação e cada número, e marca como "Sugestão" o que não tem fonte. O briefing fica salvo em `opportunities.meeting_prep` (migration 00074, a aplicar), pode ser regenerado e copiado. Sem a migration, o briefing aparece mas não é salvo (`saved:false`).

**Arquivos:**
- `supabase/migrations/00074_add_meeting_prep_to_opportunities.sql` — coluna jsonb nullable (não aplicada).
- `src/types/meeting-prep.ts` — contrato v1 + `parseMeetingPrep` defensivo.
- `src/types/opportunity.ts` — `meetingPrep` opcional; fora do `toOpportunityRow`.
- `src/lib/ai/meeting-prep-config.ts` — modelo, request e custo.
- `src/lib/meeting-prep/sources.ts` — catálogo de fontes com ids e seções determinísticas.
- `src/lib/meeting-prep/generator.ts` — prompt, chamada, validação de origem/ref/número, limpeza dos delimitadores.
- `src/lib/meeting-prep/format-text.ts` — texto para copiar.
- `src/app/api/opportunities/[opportunityId]/meeting-prep/route.ts` — POST com cache, regeneração, fail-open e log de custo.
- `src/hooks/use-meeting-prep.ts` — mutation e atualização pontual da lista.
- `src/components/opportunities/MeetingPrepPanel.tsx`, `MeetingPrepSheet.tsx` — painel lateral.
- `src/components/opportunities/OpportunityCard.tsx`, `OpportunitiesPageContent.tsx` — botão e Sheet por página.
- `_bmad-output/implementation-artifacts/deferred-work.md` — DW-35 (gerar ao marcar reunião) e DW-36 (dossiê sob demanda).
- Testes novos: `sources`, `generator`, `format-text`, `meeting-prep` (tipo), rota, `MeetingPrepPanel`, `use-meeting-prep`, e blocos novos em `OpportunityCard`/`OpportunitiesPageContent`.

**Revisão:** 31 achados. 9 patches aplicados (7 medium, 2 low): delimitadores do prompt, mínimo de 1 objeção, guarda de números inventados, e-mail em caixa mista nos eventos, ordem e data no texto copiado, testes do hook e do "Regenerar". 1 adiado (dossiê sob demanda, em `operator_actions`). 21 rejeitados, cada um com o motivo no log acima.

**Revisão de acompanhamento recomendada:** sim (patches: 0 high, 7 medium, 2 low). Risco não verificado: a guarda de números e a limpeza dos delimitadores são lógica nova de honestidade, testada só com respostas mockadas; o comportamento do modelo real (quantos itens viram "Sugestão") não foi visto.

**Verificação:** `npm run lint` 0 erros (134 warnings, todos anteriores); `npm run typecheck` limpo; `npm run test:run` 481 arquivos, 9480 testes passando, 2 skipped. Numa rodada anterior, `SegmentFilter.test.tsx` falhou uma vez ("loading state") e passou 3 de 3 vezes isolado; a área não foi tocada. Diff vazio nos caminhos proibidos e nenhum `dangerouslySetInnerHTML`.

**Riscos residuais:** sem a 00074 aplicada, cada abertura sem briefing salvo gera de novo (custo por clique); qualidade dos pontos de conversa nunca vista com a LLM real; reabrir o painel durante a geração pode cobrar duas vezes (rejeitado como low).
