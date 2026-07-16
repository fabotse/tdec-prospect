---
baseline_commit: 37e286e
---
# Story 13.11: Fix — Envio de WhatsApp a partir do Insight (`campaign_id` NOT NULL)

Status: done

> ## 🔴 PRODUÇÃO ESTÁ EM MEIO-ESTADO ATÉ O DEPLOY — LER ANTES DE FECHAR
>
> A `00059` **foi aplicada no banco do cliente** (2026-07-15), mas **o código NÃO foi deployado** (9 commits locais não enviados + os patches da code review sequer commitados no momento em que isto foi escrito). Efeito **agora, em produção**:
>
> | Comportamento em prod hoje | |
> |---|---|
> | Envio de WhatsApp a partir do Insight (13.7) | ✅ **passou a funcionar** — a migration destravou o insert |
> | Mensagem aparece no histórico do lead | ❌ **NÃO** — prod ainda roda `campaigns!inner`, que descarta `campaign_id NULL` |
>
> Não é regressão (antes o envio falhava 100% das vezes — nada era gravado), e é estritamente melhor que o estado anterior. Mas é um meio-estado **criado hoje** ao aplicar a migration antes do deploy: o usuário consegue enviar e a mensagem some do histórico. **O deploy deixou de ser opcional — ele fecha a metade que falta.** A validação (d) só passou porque foi feita LOCAL, com o fix do read path em memória.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Bug de produção confirmado (2026-07-14).** Descoberto durante o create-story da 21.5, ao validar o schema de `whatsapp_messages` para a decisão de vincular campanha. **Confirmado no banco real do cliente por Fabossi:** `information_schema` retorna `is_nullable = NO` para `whatsapp_messages.campaign_id` — o banco espelha os arquivos de migration.
>
> **Impacto:** o envio de WhatsApp a partir do Insight (Story 13.7, `done`) **nunca funcionou em produção**. Toda tentativa falha silenciosamente com um erro genérico e a mensagem não é enviada. Feature entregue + code-review aprovada + quebrada.
>
> **Tamanho:** 1 linha de SQL, 0 linha de código de produção. O código da 13.7 já está correto.

## Story

As a usuário,
I want enviar WhatsApp a partir de um insight do LinkedIn,
so that o fluxo entregue na Story 13.7 realmente funcione — hoje ele falha em 100% das tentativas com "Erro ao registrar mensagem. Tente novamente."

## Contexto Técnico (causa-raiz)

**O schema foi modelado para um caso de uso e reusado por outro sem ajuste.**

1. **Epic 11 (11.2)** criou `whatsapp_messages` para envios **de campanha** → [`00042:35`](../../supabase/migrations/00042_create_whatsapp_messages.sql#L35):
   ```sql
   campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
   ```
2. **Epic 13 (13.7)** reusou a mesma tabela para o envio **a partir de um insight** — um fluxo que, por natureza, **não tem campanha** (o insight vem do monitoramento de posts do LinkedIn, não de uma sequência de e-mail). Por isso `sendWhatsAppFromInsight` insere [`whatsapp.ts:263`](../../src/actions/whatsapp.ts#L263):
   ```js
   campaign_id: null,   // ← viola NOT NULL → Postgres 23502
   ```
3. **A 00042 é a ÚNICA migration que toca `whatsapp_messages`** (varredura confirmada em `supabase/migrations`) — nenhuma migration posterior afrouxou a coluna.

**Por que passou batido:** o insert falha → `insertError` → a action cai no early-return genérico [`whatsapp.ts:278-283`](../../src/actions/whatsapp.ts#L278) *"Erro ao registrar mensagem. Tente novamente."* — o `23502` real nunca é logado nem propagado. E **os testes unitários mockam o Supabase** (`whatsapp-from-insight.test.ts`), então uma violação de constraint do banco é estruturalmente invisível para a suíte. Dev + code-review adversarial da 13.7 passaram.

**A decisão de modelagem:** o `null` da 13.7 está **semanticamente correto** — não existe campanha para vincular. Quem está errado é o `NOT NULL`, que codifica uma premissa ("toda mensagem WhatsApp nasce de uma campanha") que deixou de valer no Epic 13. **Fix = afrouxar a coluna, não inventar uma campanha.**

## Acceptance Criteria

1. **Given** a migration `00059` é aplicada **When** o schema é inspecionado **Then** `whatsapp_messages.campaign_id` é **nullable** (`is_nullable = YES`) **And** a FK `REFERENCES campaigns(id) ON DELETE CASCADE` é **preservada** (quando preenchido, o valor continua tendo que existir) **And** a migration é idempotente/defensiva (banco gerido à mão — padrão 00053/00055).

2. **Given** o fluxo da 13.7 (Insight → "Enviar WhatsApp" → composer → enviar) **When** o envio é disparado **Then** a linha em `whatsapp_messages` é criada com `campaign_id = null` **And** a mensagem é efetivamente enviada via Z-API **And** o insight é auto-marcado `used` (AC5 da 13.7, que hoje nunca é alcançado).

3. **Given** os fluxos de campanha (11.4 individual, 11.6 em massa) **Then** continuam gravando `campaign_id` **real** e funcionando sem regressão (eles sempre passam um id válido — não são afetados pelo afrouxamento).

4. **Given** o erro genérico que escondeu o bug [`whatsapp.ts:278-283`] **Then** o `insertError` real passa a ser logado (código + mensagem do Postgres) para que a próxima violação de schema não fique invisível — sem vazar detalhe de banco na mensagem ao usuário (mantém o texto pt-BR atual).

5. Testes: regressão de que o insert do fluxo de insight usa `campaign_id: null` e o de campanha usa o id real; teste do ramo de erro de insert (mensagem pt-BR + log do código real). **Ver "Limite conhecido dos testes" em Dev Notes** — a suíte NÃO consegue provar o AC1/AC2 (mock do Supabase); a validação real é operacional (AC2 manual).

## Tasks / Subtasks

- [x] **Task 1: Migration `00059_make_whatsapp_campaign_id_nullable.sql` (AC: #1)**
  - [x] 1.1 Criar `supabase/migrations/00059_make_whatsapp_campaign_id_nullable.sql`: `ALTER TABLE public.whatsapp_messages ALTER COLUMN campaign_id DROP NOT NULL;`. **Idempotente por natureza** (`DROP NOT NULL` é no-op se já nullable) — mas envolver em guarda defensiva `to_regclass('public.whatsapp_messages') IS NOT NULL` no padrão do projeto (banco gerido à mão — 00053/00055/00058).
  - [x] 1.2 **NÃO** tocar a FK (`REFERENCES campaigns(id) ON DELETE CASCADE` permanece — `null` é permitido por FK; um valor **preenchido** continua tendo que existir em `campaigns`). **NÃO** tocar a UNIQUE `uq_whatsapp_messages_idempotency (campaign_id, lead_id, external_message_id)` [00042:86-88] — ver Dev Notes "Efeito na constraint de idempotência" (efeito nulo na prática).
  - [x] 1.3 `COMMENT ON COLUMN public.whatsapp_messages.campaign_id` documentando o porquê do nullable: *"Campanha de origem. NULL quando a mensagem não nasce de uma campanha (ex.: envio a partir de um insight do LinkedIn — Story 13.7 — ou de oportunidade sem campanha resolvível — Story 21.5)."*

- [x] **Task 2: Log do erro real de insert (AC: #4)**
  - [x] 2.1 Em `src/actions/whatsapp.ts`, nos ramos de `insertError` das DUAS actions [`whatsapp.ts:147-152` (sendWhatsAppMessage) e `whatsapp.ts:278-283` (sendWhatsAppFromInsight)], logar o erro real antes do return (`console.error` com `insertError.code`/`insertError.message`, ou o logger estruturado do projeto se houver um em uso nas actions — **verificar antes**; eslint tem regra `no-console` [memória do projeto] → conferir se actions têm exceção ou usar o padrão vigente). **Manter a mensagem pt-BR ao usuário inalterada** (não vazar detalhe de banco).
  - [x] 2.2 **NÃO** mudar mais nada nas actions — o `campaign_id: null` da 13.7 está correto e é exatamente o que a Task 1 legaliza.

- [x] **Task 3: Testes (AC: #5)**
  - [x] 3.1 `__tests__/unit/actions/whatsapp-from-insight.test.ts` (estender): assert explícito de que o insert é chamado com `campaign_id: null` (trava o contrato — se alguém "consertar" isso inventando uma campanha, o teste quebra) + o fluxo completo de sucesso (insert → sendText → update `sent` → insight `used`).
  - [x] 3.2 `__tests__/unit/actions/whatsapp.test.ts` (ou o arquivo do 11.4, se separado): regressão de que `sendWhatsAppMessage` segue inserindo o `campaign_id` **real** (não afetado pelo nullable).
  - [x] 3.3 Ramo de erro: `insertError` → mensagem pt-BR ao usuário **e** log do código real (mock do logger/console; assert que `insertError.code` aparece no log). Cobre o AC4 — a lacuna que escondeu o bug.

- [x] **Task 4: Validação** — `npx tsc --noEmit` (0 novos erros em `src/`); `npx eslint --max-warnings=0 <arquivos modificados>` limpo; `npx vitest run` verde; `npm run build` verde.

- [x] **Task 5: OPERACIONAL (Fabossi) — validação real (AC: #1, #2)** — ✅ **CONCLUÍDA 2026-07-15. AC1 e AC2 PROVADOS contra o banco real do cliente.** (Descrição original abaixo preservada.) — ~~🔴 PENDENTE — NÃO executável pelo dev agent~~ (exige acesso ao banco do cliente + um envio real de WhatsApp). Precedente: 21.1 (Task 6) / 21.6 (aplicar 00057). **O AC1 e o AC2 só ficam PROVADOS aqui** — a suíte mocka o Supabase e é estruturalmente incapaz de provar (ver "Limite conhecido dos testes").
  - [x] 5.1 Aplicar a `00059` no banco do cliente (idempotente). — **FEITO por Fabossi, 2026-07-15.**
  - [x] 5.2 Reconferir: `SELECT is_nullable ...` → esperado **`YES`**. — **✅ AC1 PROVADO no banco real do cliente, 2026-07-15.** Verificação ampliada na code review (o AC1 promete 4 coisas e nada as checava): (1) `is_nullable = **YES**` — o fix; (2) FK **preservada** — `whatsapp_messages_campaign_id_fkey` presente; (3) UNIQUE **intacta** — `uq_whatsapp_messages_idempotency` presente; (4) `COMMENT ON COLUMN` **aplicado** — e isto **prova que o bloco `DO $$` executou**, em vez de a guarda `to_regclass` ter dado um no-op silencioso reportando sucesso (a preocupação levantada pelo Blind Hunter); (5) **baseline = 0 linhas** com `campaign_id NULL`, confirmando que o insert da 13.7 nunca passou em prod. SQL de verificação: ver Change Log.
  - [x] 5.3 **Validação end-to-end (a única que prova o AC2 — a suíte não prova)** — ✅ **EXECUTADA 2026-07-15 por Fabossi, contra o banco real do cliente, com a app rodando LOCAL (`npm run dev` + `.env.local` → banco do cliente), o que permitiu validar também o fix do read path da code review.** Setup: Fabossi já era lead na base (`fabotse@gmail.com`, `+5511995421150` — telefone dele, sem risco de mensagem a prospect real); inserido um `lead_insights` de teste marcado `[TESTE 13.11 — APAGAR]` (`post_url` `.../TESTE-13-11-VALIDACAO` como alça de limpeza), removido junto com as mensagens após a validação.
    **RESULTADOS (4/4):** (a) ✅ mensagem **chegou** no WhatsApp; (b) ✅ linha com `campaign_id = NULL`, `status = 'sent'`, `external_message_id = 3EB045757C34C29D765E91`, `external_zaap_id` preenchido, `error_message` NULL, `sent_at` 2026-07-15 11:49:50 — **o baseline saiu de 0 para 2**; (c) ✅ insight marcado `used` — **o AC5 da 13.7, jamais alcançado em produção**, rodou pela primeira vez; (d) ✅ **[item acrescentado pela code review]** a mensagem **aparece no histórico do lead**, agrupada sob **"Sem campanha"** — o bucket `?? "Sem campanha"` [`LeadDetailPanel.tsx:564`], código morto desde o Epic 11, executou pela primeira vez. O painel do mesmo lead exibia "Nenhuma mensagem WhatsApp enviada" antes do teste.
    **Sobre as 2 linhas (esperávamos 1):** a 1ª saiu `failed` porque a **instância da Z-API estava mal configurada**; Fabossi corrigiu e a 2ª saiu `sent`. Causa ambiental, não de código/schema — e **reforça** o fix por dois motivos: (1) o insert da linha `failed` **também gravou `campaign_id NULL`** (duas provas da 00059, não uma); (2) o ramo de erro se comportou como projetado (`status='failed'` + `error_message`) em vez de falhar em silêncio — com o código anterior essa falha da Z-API **nunca teria sido alcançada**, porque o insert morria antes.
    **Ressalva metodológica registrada:** a query de verificação que a code review forneceu usava `CASE ... >= 1` e por isso reportou ✅ mesmo com uma linha `failed` presente — asserção frouxa, exatamente o vício que esta story combate. Quem repetir este roteiro deve exigir a contagem exata esperada, não "existe ao menos uma".

### Review Findings

**Code review adversarial (3 camadas: Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 2026-07-15.** As três camadas, de forma independente e sem contexto prévio, elegeram o MESMO achado nº1 (`campaigns!inner`). Triagem inicial: 2 decision-needed, 4 patch, 1 defer, 7 descartados como ruído. **Ambas as decisões foram resolvidas pelo Fabossi (2026-07-15) → 7 patches, 1 defer, 7 dismissed.**

**Decisões resolvidas:**

- **Decisão 1 → CORRIGIR NA 13.11** (era: deferir p/ 21.5). O read path entra no escopo desta story. Consequência aceita: o defer do tipo `WhatsAppMessage.campaign_id` é **promovido a patch** — o próprio registro do dev diz que "a mudança pertence a quem tratar o `!inner`", e a 13.11 passou a ser essa pessoa.
- **Decisão 2 → CORRIGIR SÓ O `COMMENT` AQUI.** A migration é artefato desta story, então a promessa falsa sobre a 21.5 sai do `COMMENT ON COLUMN`. A troca do pré-check bloqueante da 21.5 pelo fallback `null` **permanece deferida à review da 21.5** (dona real do código) — já registrada em `deferred-work.md`.

- [x] [Review][Patch] **HIGH — O fix destrava a escrita e a leitura descarta: `campaigns!inner` torna a mensagem do Insight invisível no histórico do lead** — [`src/app/api/leads/whatsapp-messages/route.ts:51`](../../src/app/api/leads/whatsapp-messages/route.ts#L51) faz `.select("*, campaigns!inner(name)")`; `!inner` é INNER JOIN → linha com `campaign_id IS NULL` não casa com campanha alguma e é **descartada em silêncio**. Confirmado nas 3 camadas + já registrado pelo dev em `deferred-work.md`. **O que a review acrescenta ao registro do dev:** (a) a Task 5.3 (a validação que a story diz ser a única que "conta") checa entrega no WhatsApp + linha no banco + insight `used`, mas **nunca abre o histórico do lead** → o gap **passa** na validação operacional; (b) a UI já tem o bucket `msg.campaign_name ?? "Sem campanha"` [`LeadDetailPanel.tsx:564`](../../src/components/leads/LeadDetailPanel.tsx#L564) — código morto que só a 00059 tornaria alcançável; (c) o dono atribuído (**Story 21.5**) é discutível: o escopo da 21.5 é *oportunidades*, ela já está em `review` (pode fechar sem pegar isto) e o fluxo afetado é 13.7/11.7. Resultado líquido: a story troca uma falha ruidosa por uma silenciosa — a mesma família do bug que ela existe para matar. **Armadilha no fix:** trocar por LEFT join sem mais nada faz [`route.ts:70`](../../src/app/api/leads/whatsapp-messages/route.ts#L70) (`campaignData.name`, sob um `as unknown as { name: string }`) lançar TypeError → 500 genérico. Fix = LEFT join + acesso null-safe + `campaign_name` degradando p/ null + teste da rota.
- [x] [Review][Patch] **MEDIUM — A 00059 documenta no schema um comportamento que nenhum código produz** — O `COMMENT ON COLUMN` da migration afirma que NULL vale *"ou de oportunidade sem campanha resolvível — Story 21.5"*, mas a 21.5 **nunca grava NULL nesse caso**: [`whatsapp.ts:457-464`](../../src/actions/whatsapp.ts#L457-L464) ainda retorna `"Campanha de origem não encontrada"`. Fix: remover a promessa sobre a 21.5 do `COMMENT` (a coluna passa a documentar só o que existe hoje: o envio a partir do insight). **Fora do fix:** o comentário vizinho *"Sem a 00059 a coluna é NOT NULL — não há fallback possível"* [`whatsapp.ts:458-459`](../../src/actions/whatsapp.ts#L458-L459) e o JSDoc [`whatsapp.ts:380-384`](../../src/actions/whatsapp.ts#L380-L384) nascem falsos com este diff, mas são código da 21.5 → deferidos à review dela.
- [x] [Review][Patch] LOW — `WhatsAppMessage.campaign_id` declara `string` enquanto o schema pós-00059 permite NULL [`src/types/database.ts:77`](../../src/types/database.ts#L77) — **promovido de defer a patch** por consequência da Decisão 1 (quem trata o `!inner` trata o tipo). Nota da review: não gera erro de compilação porque `createServerClient` é chamado **sem o generic `Database`** [`src/lib/supabase/server.ts:7`](../../src/lib/supabase/server.ts#L7) — a interface `Database` não vincula nada, é decorativa; os `as WhatsAppMessage` mascaram o resto.
- [x] [Review][Patch] MEDIUM — `console.error(..., insertError)` despeja o objeto de erro inteiro; em `23502`/CHECK o campo `details` do PostgREST carrega `Failing row contains (...)` = **telefone do lead + corpo da mensagem** em log. O AC4 pede "código + mensagem do Postgres", não o objeto. Ironia registrada: o diff se protege 3× para o *usuário* não ver detalhe de banco e então joga PII no log [`src/actions/whatsapp.ts:159,297`](../../src/actions/whatsapp.ts#L159)
- [x] [Review][Patch] LOW — No sub-ramo `!insertedMessage` (guarda é `insertError || !insertedMessage`) o log emite `falha ao registrar mensagem: null` — a mesma cegueira de zero-diagnóstico que o AC4 existe para matar, um ramo ao lado. Quase inalcançável na prática (`.select().single()` com 0 linhas gera `PGRST116`) [`src/actions/whatsapp.ts:159,297`](../../src/actions/whatsapp.ts#L159)
- [x] [Review][Patch] LOW — Os 2 testes de AC#4 não asseguram `expect(mockSendText).not.toHaveBeenCalled()`. O contrato do ramo é *não enviar mensagem sem registro*; se alguém mover o `sendText` para antes da guarda, ambos continuam verdes e o sistema envia WhatsApp sem rastro [`__tests__/unit/actions/whatsapp-from-insight.test.ts`, `__tests__/unit/actions/whatsapp.test.ts`]
- [x] [Review][Patch] LOW — Dev Agent Record e Change Log dizem "5 testes novos"; são **4**. O 5º é o rename de um teste pré-existente (`inserts message with campaign_id=null` → `13.11 AC#2: ...`) com corpo inalterado — consistente com a própria nota de Debug Log ("os testes de contrato passaram já no RED": um rename não fica vermelho). Task 3.1 já estava satisfeita antes desta story [story record]
- [x] [Review][Defer] MEDIUM — Pré-check de campanha *dangling* da 21.5 ainda bloqueia o envio, e o comentário que o justifica (*"Sem a 00059 a coluna é NOT NULL"*) nasce falso com este diff [`src/actions/whatsapp.ts:448-464`](../../src/actions/whatsapp.ts#L448-L464) — deferido à **review da Story 21.5** (dona real do código; mexer nisso a partir da 13.11 exigiria reescrever código e teste de outra story). Já registrado em `deferred-work.md` pelo dev-story. Decisão do Fabossi, 2026-07-15.

**Patches aplicados (7/7) — 2026-07-15.** Validação: `tsc --noEmit` → **0 erros em `src/`** (os erros restantes são pré-existentes em `__tests__/`, nenhum tocando whatsapp/database); `eslint --max-warnings=0` limpo nos 7 arquivos; `vitest run` → **386 files / 6614 pass / 2 skip / 0 fail** (era 385/6605: +1 arquivo, +9 testes); `npm run build` → 75/75 páginas.

**RED provado para o patch HIGH** (a lição da story aplicada à própria review): revertendo `route.ts` ao `!inner` + acesso direto, **5 dos 9 testes novos falham**. Sem essa checagem, o teste "inclui a mensagem de insight no histórico" seria mais um teste de mock — o `createChainBuilder` devolve as linhas que eu mandar, com ou sem INNER JOIN. O que trava a regressão de verdade é o assert sobre o `select` (`not.toHaveBeenCalledWith(stringContaining("!inner"))`) e o assert de que a campanha nula não vira 500.

**Bloqueador de commit resolvido de carona:** `leadEmail!` pré-existente em [`use-whatsapp-messages.ts:101`](../../src/hooks/use-whatsapp-messages.ts#L101) (`no-non-null-assertion`) reprovava o gate `--max-warnings=0` num arquivo que os patches precisam tocar (o hook linta o arquivo inteiro). Trocado por leitura guardada — nunca `--no-verify`.

**🔴 Achado NOVO durante a aplicação (nenhuma das 3 camadas viu) — não implementado, decisão do Fabossi:** existe [`__tests__/unit/migrations/00042-whatsapp-messages.test.ts`](../../__tests__/unit/migrations/00042-whatsapp-messages.test.ts) — o projeto **tem padrão de testar migration** lendo o texto do `.sql` (e é para **esta mesma tabela**). A `00059` **não tem teste**, embora esta story seja essencialmente 1 migration. Um teste de texto cobriria o AC1 no nível do artefato (presença do `DROP NOT NULL`, da guarda `to_regclass`, do `COMMENT`; ausência de qualquer toque em FK/UNIQUE) — não substitui a Task 5 (só o banco real prova), mas pegaria uma edição futura que afrouxasse a coluna errada ou dropasse a FK. Ressalva: a 00042 é o **único** teste de migration do projeto (a 00053/00055/00058 não têm) → não existe norma consolidada, é uma exceção. Nota: o assert `"campaign_id UUID NOT NULL"` [`00042-...test.ts:60`](../../__tests__/unit/migrations/00042-whatsapp-messages.test.ts#L60) **não deve mudar** — ele valida o texto histórico da 00042, que é imutável e continua verdadeiro.

**Descartados como ruído (7)** — com o motivo, para não voltarem na próxima review: `to_regclass` "falha em silêncio" (é o padrão exigido pelo AC1/00053, e o banco de prod **provadamente** tem a tabela — foi de lá que veio o `is_nullable = NO`; a Task 5.2 pega um no-op); guarda não cobre existência da *coluna* (se ocorresse, `42703` aborta **ruidosamente** — o oposto de silencioso); análise da UNIQUE de idempotência é imprecisa (ela engata no UPDATE, não só no insert — mas a conclusão "não tocar" está certa e nada decorre); índice `(campaign_id, status)` acumula NULLs inúteis (volume desprezível neste fluxo); narrativa do postmortem duplicada em 4 lugares (estilo do projeto; a parte que apodreceu está capturada no Decision nº2); números de linha desatualizados no record (substância confere); "a suíte não prova AC1/AC2" (a story **declara** isso em alto e bom som e encaminha p/ Task 5 + retro — está tratado, não é defeito do diff).

## Dev Notes

Escopo **cirúrgico**: 1 migration + 1 melhoria de log + testes. **NÃO** refatorar as actions de WhatsApp, **NÃO** mexer no `ZApiService`/composer/hooks, **NÃO** tocar o fluxo de campanha.

### Por que nullable é o fix certo (e não "vincular uma campanha")

A alternativa seria dar uma campanha ao insight — mas **não existe uma**: o insight nasce do monitoramento de posts do LinkedIn (Epic 13), sem qualquer vínculo com sequência de e-mail. Inventar um vínculo (ex.: "a última campanha do lead") seria **dado falso** num registro que alimenta métricas por campanha (`idx_whatsapp_messages_campaign_status` [00042:74-75], stats agregadas da 11.7). O `NOT NULL` codificou uma premissa do Epic 11 ("toda mensagem nasce de campanha") que o Epic 13 invalidou. Afrouxar a coluna é alinhar o schema à realidade do domínio.

### Efeito na constraint de idempotência (nenhum, na prática)

`uq_whatsapp_messages_idempotency UNIQUE (campaign_id, lead_id, external_message_id)` [00042:86-88]. Em Postgres, `NULL` não conflita com `NULL` → linhas com `campaign_id NULL` nunca colidem entre si. **Isso não é uma perda:** a constraint já era inefetiva no insert, porque `external_message_id` **só existe depois** do envio (a linha nasce `pending` com `external_message_id: null` [whatsapp.ts:139-141,269-271]) — ou seja, a tupla no momento do insert já continha NULL e nunca bloqueou nada. A constraint só teria efeito num hipotético insert pós-envio. Não tocar.

### 🔴 Limite conhecido dos testes (a lição desta story)

**A suíte não consegue provar o AC1/AC2.** Os testes mockam o Supabase (`createChainBuilder`/`setupSupabase*` [__tests__/helpers/mock-supabase.ts]) → o mock aceita alegremente um insert que o Postgres real rejeita. Foi exatamente essa lacuna que deixou a 13.7 passar por dev **e** por um code-review adversarial de 3 camadas com uma feature 100% quebrada. Nenhum teste unitário desta story fecha essa lacuna — por isso a **Task 5 (operacional)** é a validação que conta.

**Padrão sistêmico (não é desta story resolver, mas registrar):** todo fluxo que insere em tabela com constraint não-trivial (NOT NULL/CHECK/FK) está sujeito ao mesmo ponto cego. **Precedente idêntico e recente:** a Story 21.3 descobriu que o CHECK de `api_usage_logs.service_name` não incluía `'openai'` → todo custo de IA era rejeitado (`23514`) e **engolido por `catch {}`** — mesma classe de bug (violação de constraint invisível), mesma causa (mock não valida schema), mesmo sintoma (falha silenciosa). Dois casos em duas stories consecutivas. **Candidato forte a action item de retrô do Epic 21 / `deferred-work.md`:** teste de contrato schema↔código (ex.: validar payloads de insert contra o DDL das migrations) ou um smoke test de integração contra banco real. Levar para a retro.

### Reuso / precedentes

- Migration defensiva idempotente: `00053` (padrão `to_regclass`), `00058` (`DROP CONSTRAINT IF EXISTS` + `ADD` — a irmã desta, criada pela 21.3 para o mesmo tipo de bug).
- `sendWhatsAppFromInsight` [whatsapp.ts:216-348] — o código está **correto**, só a coluna estava errada.
- Testes: `__tests__/unit/actions/whatsapp-from-insight.test.ts` (estender, não reescrever).

### Anti-Patterns a evitar

1. **NÃO** "consertar" o `campaign_id: null` da 13.7 inventando uma campanha — o null é correto; o schema é que muda (Task 3.1 trava isso com teste).
2. **NÃO** dropar/recriar a FK nem a UNIQUE — só `DROP NOT NULL`.
3. **NÃO** tornar `lead_id`/`tenant_id` nullable de carona — o afrouxamento é **só** de `campaign_id`.
4. **NÃO** alterar a mensagem pt-BR ao usuário no ramo de erro — só **logar** o erro real (AC4).
5. **NÃO** declarar o AC2 satisfeito com base na suíte verde — a suíte mocka o banco; só a Task 5.3 prova (ver "Limite conhecido dos testes").
6. **NÃO** usar `process.env.X!` / `console.log` sem conferir a regra `no-console` do projeto [memória] — seguir o padrão vigente das actions.

### Relação com a Story 21.5 (Ações do Card)

A 21.5 (`ready-for-dev`) também insere em `whatsapp_messages`, via `sendWhatsAppFromOpportunity`, e — por decisão do Fabossi — **vincula** `opportunities.campaign_id` (o caminho normal, com campanha real, funciona **com ou sem** esta story). **Esta story roda ANTES** e habilita o caminho degradado da 21.5: quando `opportunities.campaign_id` está *dangling* (campanha deletada — `opportunities.campaign_id` não tem FK [00055:29]), a 21.5 grava `campaign_id: null` e **envia mesmo assim**, em vez de bloquear o envio de um lead quente por causa de uma campanha deletada. Se esta story **não** for aplicada antes, a 21.5 deve manter o pré-check bloqueante nesse caminho (ver Task 6.1 da 21.5).

### Project Structure Notes

**Novos:**
- `supabase/migrations/00059_make_whatsapp_campaign_id_nullable.sql`

**Modificados:**
- `src/actions/whatsapp.ts` (só o log do `insertError` — AC4)
- `__tests__/unit/actions/whatsapp-from-insight.test.ts` (+ contrato `campaign_id: null` + ramo de erro)
- `__tests__/unit/actions/whatsapp.test.ts` (regressão do fluxo de campanha — confirmar o nome real do arquivo)

**Intocados (garantir):** `src/lib/services/zapi.ts`, `WhatsAppComposerDialog`, `use-whatsapp-send*`, `OpportunityPanel`, todo o fluxo de campanha (11.4/11.6/11.7).

### References

- [Source: supabase/migrations/00042_create_whatsapp_messages.sql:32-46,74-75,86-88] — `campaign_id NOT NULL REFERENCES campaigns(id)` (a causa-raiz), índice por campanha, UNIQUE de idempotência. **Única** migration da tabela.
- [Source: src/actions/whatsapp.ts:216-348,263,278-283] — `sendWhatsAppFromInsight` (correto), o `campaign_id: null`, o early-return genérico que escondeu o `23502`
- [Source: src/actions/whatsapp.ts:85-204,139-141,147-152] — `sendWhatsAppMessage` (fluxo de campanha — regressão a preservar)
- [Source: _bmad-output/implementation-artifacts/13-7-envio-whatsapp-a-partir-do-insight.md] — a story original (ACs do fluxo que passa a funcionar; AC5 = auto-mark `used`)
- [Source: _bmad-output/implementation-artifacts/21-5-acoes-do-card-proximo-passo-por-ia.md] — story irmã (decisão de vincular campanha + o achado que originou esta story)
- [Source: supabase/migrations/00058_add_openai_to_api_usage_logs_check.sql] — precedente EXATO da mesma classe de bug (constraint violada + erro engolido), corrigido pela 21.3
- [Source: supabase/migrations/00053_*, 00055_*] — padrão de migration defensiva/idempotente (banco gerido à mão)
- [Source: __tests__/unit/actions/whatsapp-from-insight.test.ts; __tests__/helpers/mock-supabase.ts] — testes a estender + o mock que não valida schema (a lacuna)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — dev-story workflow, 2026-07-15

### Debug Log References

**Ciclo red-green-refactor do AC4** (a única mudança de código de produção):

- **RED:** `npx vitest run __tests__/unit/actions/whatsapp.test.ts __tests__/unit/actions/whatsapp-from-insight.test.ts` → `2 failed | 41 passed`. Os 2 que falharam foram exatamente os novos testes de log do AC4, com `AssertionError: expected "error" to be called ... Number of calls: 0` — provando que o `insertError` real era descartado em silêncio nas DUAS actions (a cegueira que escondeu o bug).
- **GREEN:** `console.error` adicionado nos dois ramos → `3 files / 62 passed` (incluindo `whatsapp-from-opportunity.test.ts`, para pegar regressão da 21.5 na mesma action).
- **Nota de RED parcial (esperado):** os testes de contrato `campaign_id: null` (Task 3.1) passaram já no RED — o código da 13.7 sempre esteve correto; o defeito era só o schema. Eles travam o contrato daqui pra frente, não descrevem um bug de código.

**Validações (Task 4):**

- `npx tsc --noEmit` → 0 erros em `src/`
- `npx eslint --max-warnings=0` nos 3 arquivos modificados → limpo
- `npx vitest run` (suíte completa) → **385 files / 6605 pass / 2 skip / 0 fail**
- `npm run build` → `✓ Compiled successfully in 3.9s`, 75/75 páginas estáticas

### Completion Notes List

**O que foi entregue (escopo cirúrgico, como especificado): 1 migration + 1 melhoria de log + 5 testes. ZERO mudança de lógica de produção.**

1. **Task 1 (AC1) — migration `00059`.** `ALTER COLUMN campaign_id DROP NOT NULL` dentro de guarda `DO $$ ... IF to_regclass('public.whatsapp_messages') IS NOT NULL` (padrão 00053 — banco gerido à mão). Duplamente idempotente: `DROP NOT NULL` é no-op numa coluna já nullable. FK (`REFERENCES campaigns(id) ON DELETE CASCADE`) e UNIQUE `uq_whatsapp_messages_idempotency` **intocadas** — só o NOT NULL caiu. `COMMENT ON COLUMN` documenta o porquê do nullable (13.7 + 21.5), dentro da mesma guarda.

2. **Task 2 (AC4) — log do erro real.** `console.error` nos ramos de `insertError` das DUAS actions: `sendWhatsAppMessage` [`whatsapp.ts:154`] e `sendWhatsAppFromInsight` [`whatsapp.ts:291`]. **A mensagem pt-BR ao usuário está literalmente inalterada** — teste explícito assegura que o `23502` não vaza para o usuário. O logger é `console.error` porque (a) o eslint do projeto permite (`"no-console": ["error", { allow: ["warn", "error"] }]` — só `console.log` é banido), e (b) é exatamente o padrão que a 21.5 já usa em `sendWhatsAppFromOpportunity` [`whatsapp.ts:475`]. Prefixo por action (`[whatsapp]` / `[whatsapp-from-insight]`) para rastreabilidade no log.

3. **Task 3 (AC5) — 4 testes novos** (corrigido na code review: eram declarados "5"; o 5º é o **rename** de um teste pré-existente — `inserts message with campaign_id=null` → `13.11 AC#2: ...` — com corpo inalterado, consistente com a nota de Debug Log de que os testes de contrato "passaram já no RED": um rename não fica vermelho. A Task 3.1 já estava satisfeita antes desta story). (3.1) contrato `campaign_id: null` renomeado/reforçado + **novo** fluxo completo insert→sendText→`sent`→insight `used` (o AC5 da 13.7, que hoje nunca é alcançado); (3.2) **novo** — regressão do fluxo de campanha gravando o `campaign_id` **real** (AC3 — não afetado pelo afrouxamento); (3.3) **2 novos** — ramo de erro nas duas actions: log do `code: "23502"` **e** mensagem pt-BR preservada.

4. **Anti-patterns respeitados.** Nenhuma campanha foi inventada para o insight (o `campaign_id: null` da 13.7 permanece — a Task 3.1 agora o trava); FK/UNIQUE não tocadas; `lead_id`/`tenant_id` não afrouxados de carona; mensagem ao usuário inalterada; `no-console` verificado antes de usar (não presumido).

**🔴 Desvio menor (declarado):** removi um contador morto (`insightCallCount`, incrementado e nunca lido) no helper `setupMockClient` de `whatsapp-from-insight.test.ts`. **Pré-existente, não introduzido por esta story** — mas disparava `@typescript-eslint/no-unused-vars` e o gate `eslint --max-warnings=0` da Task 4 (e o pre-commit hook, que linta o arquivo inteiro) reprovava um arquivo que esta story precisa modificar. Remoção de código morto, zero efeito em comportamento de teste.

**🔴 O AC1 e o AC2 NÃO estão provados — e não podem ser pela suíte.** Suíte verde aqui significa apenas "o código chama o insert com `campaign_id: null` e loga o erro". Os testes mockam o Supabase (`createChainBuilder`) → o mock aceita alegremente o insert que o Postgres real rejeitava. **Foi exatamente essa lacuna que deixou a 13.7 passar por dev + code-review adversarial 100% quebrada.** Só a **Task 5 (operacional, Fabossi)** prova o fix: aplicar a 00059, reconferir `is_nullable = YES` e fazer **um envio real end-to-end**. Não declarar esta story `done` com base na suíte.

**⚠️ Achado durante a implementação — decisão pendente do Fabossi (fora do escopo desta story, NÃO implementado):**
A **21.5 acabou sendo implementada ANTES desta story** (está em `review`), ao contrário da sequência planejada. Por isso, `sendWhatsAppFromOpportunity` [`whatsapp.ts:436-452`] carrega hoje o **pré-check bloqueante** do caminho *dangling* — com um comentário no código dizendo, textualmente, *"Depois da 13.11, trocar esta falha pelo fallback `campaign_id: null` + envio"*. Essa troca é justamente o que a 00059 agora habilita, **mas não está mapeada a nenhuma task desta story** — então não foi feita (regra: não implementar o que não está numa task). Enquanto não for feita, uma oportunidade com campanha deletada continua **bloqueando o envio** de um lead quente.

**Reconciliação 13.11 ↔ 21.5 (pedida pelo Fabossi, 2026-07-15) — CONCLUÍDA. Veredito: aplicar a `00059` é seguro e NÃO interfere na 21.5.** As duas stories concordam, e o handshake está escrito nos dois lados. Fatos apurados:
- **A 21.5 nunca esteve bloqueada pela 00059.** Ela pediu o SQL porque o *achado* que gerou esta story saiu do create-story dela (validar o schema p/ a decisão #3 revelou o `NOT NULL` → e, de carona, que a 13.7 estava quebrada). A própria Task 6.1 da 21.5 diz: *"Campanha existe (caminho normal) → `campaign_id: opp.campaign_id`. **Funciona com ou sem a 13.11**"*.
- **A 21.5 previu a inversão de sequência antes de ser implementada** ("Pré-requisito: Story 13.11 — e o que fazer se ela não tiver rodado") e seguiu a contingência documentada, registrada como desvio autorizado no Change Log dela + JSDoc da action + "Pendências operacionais".
- **Aplicar a 00059 não muda o comportamento da 21.5 em nada.** O caminho normal grava `campaign_id` real (segue válido — afrouxar constraint não invalida dado que já passava). O caminho dangling continua falhando explicitamente, porque **o bloqueio está no pré-check (código), não no schema**. A migration apenas torna o fallback *possível*; não o ativa.
- **Efeito real da 00059 em prod:** destrava a 13.7 (o objetivo) e nada mais. Nenhuma linha existente é reescrita ou vira `null` (mudança só de catálogo, sem rewrite/scan); hoje **zero** linhas têm `campaign_id IS NULL` (o insert sempre falhava com `23502`).
- **Leitores por campanha não são afetados:** filtram `.eq("campaign_id", campaignId)` e `null` nunca casa com UUID → linhas de insight ficam fora das métricas de campanha (comportamento desejado).

**Encaminhamento: 3 itens registrados em [`deferred-work.md`](deferred-work.md) (seção "dev-story 13.11", 2026-07-15), todos com dono = Story 21.5** — nenhum bloqueia a `00059`: (1) troca do fallback dangling + virar o teste correspondente; (2) `campaigns!inner` em [`leads/whatsapp-messages/route.ts:50`] torna toda mensagem com `campaign_id NULL` **invisível** no histórico do lead (atinge a 13.7 hoje e o fallback da 21.5 amanhã — mesma causa, mesmo movimento); (3) tipo `WhatsAppMessage.campaign_id: string` passa a ser impreciso (deveria ser `string | null`; o `as WhatsAppMessage` mascara).

### File List

**Novos:**
- `supabase/migrations/00059_make_whatsapp_campaign_id_nullable.sql`
- `__tests__/unit/app/api/leads/whatsapp-messages/route.test.ts` — **[code review]** 9 testes da rota do histórico: mensagem de insight (`campaign_id NULL`) não pode ser descartada, `campaign_name` degrada p/ null, select sem `!inner`, campanha nula não vira 500, + regressão do caminho com campanha e guardas da rota

**Modificados:**
- `src/actions/whatsapp.ts` — log do `insertError` real nos 2 ramos de erro de insert (AC4). **[code review]** passou a logar `code` + `message` em vez do objeto inteiro (o `details` do PostgREST traz `Failing row contains (...)` = telefone + corpo da mensagem → PII no log) e a degradar com texto útil no sub-ramo `!insertedMessage` (antes logava `null`).
- `src/app/api/leads/whatsapp-messages/route.ts` — **[code review]** `campaigns!inner(name)` → `campaigns(name)` (LEFT join) + acesso null-safe (`campaignData?.name ?? null`). Sem isto a 00059 destrava a escrita e a leitura descarta em silêncio: a mensagem do insight é enviada e some do histórico do lead.
- `src/types/database.ts` — **[code review]** `WhatsAppMessage.campaign_id: string` → `string | null` (o tipo contradizia o schema pós-00059)
- `src/hooks/use-whatsapp-messages.ts` — **[code review]** `campaign_name?: string` → `string | null`; e `leadEmail!` → leitura guardada (warning `no-non-null-assertion` pré-existente que reprovava o gate `--max-warnings=0` neste arquivo)
- `__tests__/unit/actions/whatsapp-from-insight.test.ts` — contrato `campaign_id: null` + fluxo completo + ramo de erro c/ log; remoção do contador morto `insightCallCount`
- `__tests__/unit/actions/whatsapp.test.ts` — regressão do `campaign_id` real (AC3) + ramo de erro c/ log (AC4)
- `_bmad-output/implementation-artifacts/13-11-fix-envio-whatsapp-do-insight-campaign-id-nullable.md` — tasks, Dev Agent Record, Change Log, Status
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status da story
- `_bmad-output/implementation-artifacts/deferred-work.md` — 3 defers da reconciliação 13.11 ↔ 21.5 (dono: 21.5; nenhum bloqueia a `00059`)

## Change Log

- 2026-07-15: **✅ TASK 5 EXECUTADA — AC1 e AC2 PROVADOS no banco real do cliente. Status: in-progress → done.** Fabossi aplicou a `00059` e validou end-to-end com a app rodando LOCAL contra o banco do cliente (`.env.local`), o que permitiu provar também o fix do read path da code review. **AC1 (5/5):** `is_nullable = YES`; FK `whatsapp_messages_campaign_id_fkey` **preservada**; UNIQUE `uq_whatsapp_messages_idempotency` **intacta**; `COMMENT ON COLUMN` aplicado — **provando que o bloco `DO $$` executou** e não que a guarda `to_regclass` deu no-op silencioso (a preocupação do Blind Hunter); baseline **0 linhas** com `campaign_id NULL`, confirmando que o insert nunca passou em prod. **AC2 (4/4):** mensagem **chegou** no WhatsApp; linha com `campaign_id = NULL` + `status = 'sent'` + `external_message_id = 3EB045757C34C29D765E91` (**baseline 0 → 2**); insight marcado `used` — **o AC5 da 13.7 rodou pela primeira vez na vida**; e a mensagem **aparece no histórico do lead sob "Sem campanha"** — o bucket `?? "Sem campanha"` [`LeadDetailPanel.tsx:564`], código morto desde o Epic 11, executou pela primeira vez (o painel do mesmo lead dizia "Nenhuma mensagem WhatsApp enviada" antes do teste). **As 2 linhas (esperávamos 1):** a 1ª saiu `failed` por **instância da Z-API mal configurada** (causa ambiental, corrigida por Fabossi; a 2ª saiu `sent`) — e isso REFORÇA o fix: o insert da linha `failed` **também gravou `campaign_id NULL`** (duas provas da 00059) e o ramo de erro se comportou como projetado (`failed` + `error_message`) em vez de sumir em silêncio; com o código anterior essa falha da Z-API **nunca teria sido alcançada**, pois o insert morria antes. **Autocrítica registrada:** a query de verificação que a review forneceu usava `CASE ... >= 1` e reportou ✅ mesmo com a linha `failed` presente — asserção frouxa, o mesmo vício que esta story combate; quem repetir o roteiro deve exigir a contagem exata. Dados de teste (1 `lead_insights` + 2 `whatsapp_messages`) removidos após a validação. **🔴 PENDENTE: DEPLOY.** A migration está em prod e o código não — hoje, em produção, o envio do Insight **funciona** e a mensagem **não aparece no histórico** (prod ainda roda `campaigns!inner`). Ver o alerta no topo da story.
- 2026-07-15: **Code review adversarial (3 camadas) — 7 patches aplicados; 1 defer; 7 dismissed. Status: review → in-progress (Task 5 então PENDENTE).** As 3 camadas, independentes e sem contexto prévio, elegeram o MESMO achado nº1: **a story destravava a escrita e a leitura descartava**. [`route.ts:51`](../../src/app/api/leads/whatsapp-messages/route.ts#L51) usava `campaigns!inner(name)` — INNER JOIN que descarta em silêncio toda linha com `campaign_id NULL`, isto é, exatamente as linhas que a 00059 passou a permitir: o WhatsApp do Insight enviaria de verdade e sumiria do histórico do lead — uma falha silenciosa no lugar de uma ruidosa, na story cujo motivo de existir é matar falhas silenciosas. Agravante decisivo: **a Task 5.3 não pegaria** (valida entrega + linha no banco + insight `used`; nunca abre o histórico), e a UI já tinha o bucket `?? "Sem campanha"` [`LeadDetailPanel.tsx:564`](../../src/components/leads/LeadDetailPanel.tsx#L564) como código morto. **Decisões do Fabossi:** (1) corrigir o read path DENTRO da 13.11 (em vez de deferir p/ 21.5 — escopo errado: 21.5 é sobre oportunidades, já está em `review` e o fluxo afetado é 13.7/11.7) → arrastou o tipo `campaign_id: string | null` de defer p/ patch; (2) corrigir só o `COMMENT ON COLUMN` aqui (a migration é artefato desta story), deferindo a troca do pré-check dangling à review da 21.5, dona real do código. **PATCHES:** LEFT join + acesso null-safe + 9 testes de rota (a armadilha: LEFT join sozinho faz `campaignData.name` lançar TypeError → 500); `COMMENT` deixou de prometer um fallback da 21.5 que nenhum código produz; log passou a levar `code` + `message` em vez do objeto inteiro (`details` do PostgREST = `Failing row contains (...)` com telefone e corpo da mensagem → o diff se protegia 3× para o USUÁRIO não ver detalhe de banco e despejava PII no log) + assert de PII travando isso; sub-ramo `!insertedMessage` não loga mais `null`; testes de AC#4 passaram a travar `sendText` não-chamado; record corrigido de "5 testes novos" para 4 (o 5º era rename). **RED PROVADO** no patch HIGH — revertendo o `route.ts`, 5 dos 9 testes novos falham (sem essa checagem o teste de histórico seria mais um teste de mock: o `createChainBuilder` não simula JOIN, exatamente o ponto cego que originou esta story). Resolvido de carona o `leadEmail!` pré-existente que reprovava o gate `--max-warnings=0` num arquivo tocado. VALIDAÇÕES: tsc 0 erros em `src/`; eslint limpo; vitest **386 files / 6614 pass / 2 skip / 0 fail**; build 75/75. **🔴 ACHADO NOVO p/ decisão do Fabossi (nenhuma camada viu, não implementado):** existe `__tests__/unit/migrations/00042-whatsapp-messages.test.ts` — o projeto testa migration lendo o texto do `.sql`, para ESTA MESMA tabela — e a `00059` não tem teste, embora a story seja essencialmente 1 migration (ressalva: a 00042 é o único teste de migration do projeto; não há norma consolidada). **AC1/AC2 SEGUEM NÃO PROVADOS — nada aqui muda isso: a review não aplicou a `00059` em banco algum. Só a Task 5 prova.**
- 2026-07-15: **Implementação (dev-story) — Tasks 1-4 completas; Task 5 (operacional) PENDENTE.** Entregue exatamente o escopo cirúrgico especificado: migration `00059` (`DROP NOT NULL` em `whatsapp_messages.campaign_id`, guardado por `to_regclass` no padrão 00053; FK e UNIQUE preservadas; `COMMENT ON COLUMN` documentando o porquê) + `console.error` do `insertError` real nos 2 ramos de erro de insert de `whatsapp.ts` (AC4 — a cegueira que escondeu o bug; mensagem pt-BR ao usuário literalmente inalterada, com teste travando que o `23502` não vaza) + 5 testes (contrato `campaign_id: null` da 13.7 + fluxo completo insert→sent→insight `used`; regressão do `campaign_id` real do fluxo de campanha (AC3); ramo de erro c/ log nas 2 actions). **ZERO mudança de lógica de produção** — o código da 13.7 sempre esteve correto. Ciclo RED confirmou a cegueira do AC4 (`console.error` chamado 0 vezes nas 2 actions); os testes de contrato passaram já no RED (o defeito era só o schema). Desvio menor declarado: removido contador morto `insightCallCount` (pré-existente) que reprovava o gate `eslint --max-warnings=0` da Task 4. VALIDAÇÕES: tsc 0 erros em `src/`; eslint `--max-warnings=0` limpo; vitest **385 files / 6605 pass / 2 skip / 0 fail**; build verde. **🔴 AC1/AC2 NÃO PROVADOS — a suíte mocka o Supabase e é estruturalmente incapaz de provar (foi essa lacuna que deixou a 13.7 passar quebrada). Só a Task 5 (Fabossi: aplicar 00059 → reconferir `is_nullable=YES` → 1 envio real end-to-end) prova o fix. NÃO marcar `done` com base na suíte verde.** ACHADO p/ decisão do Fabossi (fora de escopo, não implementado): a 21.5 foi implementada ANTES desta story (está em `review`), então `sendWhatsAppFromOpportunity` mantém o pré-check bloqueante do caminho dangling — o próprio código comenta "depois da 13.11, trocar pelo fallback `campaign_id: null`", troca que a 00059 agora habilita mas que nenhuma task desta story mapeia → encaminhar como patch na review da 21.5 ou defer explícito. Status: in-progress → review.
- 2026-07-14: Story 13.11 criada (create-story) — **fix de bug de produção confirmado**. Descoberto durante o create-story da 21.5 ao validar o schema de `whatsapp_messages` para a decisão "vincular campanha"; **confirmado no banco real por Fabossi** (`is_nullable = NO`). O envio de WhatsApp a partir do Insight (13.7, `done`) nunca funcionou: insere `campaign_id: null` [whatsapp.ts:263] numa coluna `NOT NULL REFERENCES campaigns(id)` [00042:35] → `23502` → early-return genérico → mensagem nunca enviada. Causa-raiz: schema do Epic 11 (envio de campanha) reusado pelo Epic 13 (envio de insight, que não tem campanha) sem ajuste. Fix = migration `00059` (`DROP NOT NULL`, FK/UNIQUE preservadas) + log do `insertError` real (AC4, fecha a cegueira) + testes de contrato. **O código da 13.7 já está correto** — o `null` é semanticamente certo, o `NOT NULL` é que codificava premissa vencida. Lição registrada (candidata a retrô do Epic 21): mock do Supabase não valida constraint → 2 bugs desta classe em 2 stories consecutivas (21.3: CHECK sem `'openai'` + `catch {}`; esta: NOT NULL + early-return). Decisão Fabossi (2026-07-14): fix separado agora, antes da 21.5 — libera o fallback `null` do caminho dangling da 21.5. Status: ready-for-dev.
