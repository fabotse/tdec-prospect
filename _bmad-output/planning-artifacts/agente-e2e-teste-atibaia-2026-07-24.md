# Teste E2E do Agente TDec 2.0 — Campanha completa (Atibaia) — 2026-07-24

> Executado por Amelia (dev agent) via Playwright na interface real (`/agent`), logada como `fabotse`.
> Cenário: campanha sem tecnologia, cidade pequena (Atibaia, SP), máximo 2-3 leads, comportamento de usuário real.
> Fluxo percorrido: briefing → modo guiado → plano → busca de leads → revisão/aprovação (2 leads) → campanha (5 emails + icebreakers) → export Instantly ✅ → ativação ❌ (500).

---

## 1. Travas encontradas (bugs)

### 🔴 P0 — Ativação quebrada nas DUAS vias (Instantly API)
- Evidência: `[instantly] HTTP 404 Not Found {"message":"Route POST:/api/v2/account-campaign-mappings not found"}` seguido de `PipelineError step=5: ORCHESTRATOR_SKIP_FAILED` → UI mostra "Erro na etapa 'Ativação': Erro interno. Tente novamente.. Entre em contato com o suporte."
- Causa: `InstantlyService.addAccountsToCampaign` (`src/lib/services/instantly.ts:319`, Story 7.5) usa endpoint que **não existe** na API v2 do Instantly.
- Raio de explosão (3 call sites):
  - `src/lib/agent/steps/activate-step.ts:74` — **"Ativar Campanha" (via principal) também falharia**
  - `src/lib/agent/orchestrator.ts:231` — "Ativar Depois" (falhou no teste)
  - `src/app/api/instantly/campaign/[id]/accounts/route.ts:59`
- Fix sugerido: anexar contas via `PATCH /api/v2/campaigns/{id}` com campo `email_list` (forma canônica da API v2). Adicionalmente: no caminho defer, falha no attach de contas NÃO deveria falhar a etapa inteira — completar a execução e avisar ("anexe as contas manualmente no Instantly").
- Incoerência menor: erro tem `isRetryable: false` mas a mensagem diz "Tente novamente".

### 🔴 P1 — Parser: "quero importar no máximo 2 leads" vira modo import_leads com 0 leads
- Mensagem composta do usuário ("pode incluir empresas <11 funcionários? E como é um teste, quero importar no máximo 2 leads") produziu:
  - "Etapas de busca de empresas e leads serão puladas — **0 leads importados serão usados diretamente**" (campanha nasceria com 0 leads)
  - "2" interpretado como **Nº de e-mails: 2** (confundiu quantidade de leads com tamanho da sequência)
- É exatamente o alvo da **Story 22.11** (guard de import no parser) — em andamento na branch. O teste confirma que o caso real inclui a variante "importar = limitar quantidade da busca", não só "importar = usar leads já importados".
- A correção conversacional funcionou: ao explicar de novo, o parser voltou pra busca direta (mas descartou silenciosamente o limite de 2 — ver P2 abaixo).

### 🔴 P1 — Pós-rejeição de etapa é beco sem saída
- Após rejeitar a busca de leads, agente pergunta "O que você gostaria de ajustar na etapa 'Busca de Leads'?" — mas **as respostas do usuário não são processadas**: 2 mensagens enviadas, `POST /messages` 201, e **nenhum** `briefing/parse`, PATCH ou re-execute disparado. Zero resposta do agente.
- Única saída: "Nova conversa" (perde briefing, progresso e créditos).
- Fix: handler pós-rejeição que parseia a resposta, aplica o ajuste no briefing e re-executa o step rejeitado.

### 🔴 P1 — Busca com 0 resultados tratada como sucesso, sem recuperação
- Briefing nichado (Dono/Diretor + clínicas de estética + Atibaia + <11) → "0 de 0 leads selecionados", tabela vazia, "Aprovar (0 leads)" desabilitado, e mensagem contraditória "Step 2 (search_leads) concluído com sucesso".
- Nenhuma sugestão de recuperação (ampliar localização, remover filtro de tamanho/indústria, trocar cargos).
- Fix: empty-state com diagnóstico ("provável causa: filtros restritivos") + sugestões acionáveis em 1 clique; idealmente aviso de viabilidade ANTES de cobrar a busca.

### 🟡 P2 — Não existe limite de quantidade de leads
- Pedido explícito "traga só uns 2 leads" foi silenciosamente ignorado (não há campo `leadCount` no briefing — confirmado no PATCH).
- Na revisão, seleção default = 25 e opções apenas para AUMENTAR (50/100/200). Para usar 2, foram necessários 24 cliques manuais (desmarcar todos + marcar 2).
- O plano de execução mostra custo (R$ 3,00) mas não quantos leads serão buscados/consumidos.
- Fix: `leadCount` no briefing + parser; input numérico livre na revisão; plano mostrando "até N leads".

### 🟡 P2 — "Ativar Depois" exige selecionar conta de envio
- Com 0 contas selecionadas, ambos os botões ("Ativar Campanha" E "Ativar Depois") ficam desabilitados. Quem só quer adiar fica travado sem entender por quê.

### 🟢 P3 — Timestamps no futuro
- Mensagens recém-criadas exibem "**em** menos de um minuto" (futuro) em vez de "há menos de um minuto" — provável skew servidor/cliente + `formatDistanceToNow`. Corrigir com clamp (`addSuffix` sobre max(now, date)).

### 🟢 Infra/resiliência (ambiente dev, mas expõe gap real)
- Dev server anterior com Jest worker crashed → TODAS as rotas do agente em 500; toast "Erro ao enviar resposta do agente." e a mensagem do usuário se perde sem retry. Não há recuperação de conversa órfã (execução criada, 1ª mensagem perdida).
- Hydration mismatch pré-existente no submenu Leads da Sidebar (`aria-expanded` server=false vs client=true) — observação separada, não é da story.

---

## 2. Gaps de produto (arquitetura do agente)

### Leads do agente NÃO entram em "Meus Leads" (e portanto não têm segmento)
- Nenhum código em `src/lib/agent/**` grava na tabela `leads` — os leads aprovados existem só em `agent_steps.output` e vão direto pro Instantly.
- Busca por "Amanda" em Meus Leads: "Nenhum lead encontrado". Base tem 875 leads, último import 26/03.
- **Meus Leads TEM segmentos** (16 em uso, ex.: "Prospects - CYERA (213)") e filtro por segmento — o recurso existe; o agente é que não participa.
- Pedido de segmento no briefing ("segmento 'Teste Atibaia'") virou `campaignDescription: "Teste Atibaia"` e a pergunta "dá pra fazer isso?" ficou sem resposta.
- **Resposta à pergunta do Fabossi**: hoje NÃO dá pra colocar leads do agente num segmento — eles nem entram na base local.
- Fix: persistir leads aprovados em `leads` com segmento automático (nome da campanha) + suportar `segmentName` no briefing.

### Campanha do agente NÃO aparece em /campaigns
- `create-campaign-step` e `export-step` não gravam na tabela `campaigns` — "Campanha - Teste Atibaia" invisível no app; existe só no Instantly.
- Usuário cria a campanha pelo agente e depois não encontra em lugar nenhum do produto.

### Qualidade da busca aberta (matching de localização)
- "Dono/Diretor + Atibaia" (248 resultados) incluiu: Diretor de Urbanismo da **Prefeitura de Atibaia**, Diretor da **Câmara Municipal**, Fast Shop S/A, Abril Comunicações — matching por "pessoa em Atibaia" + cargo textual, não "empresa sediada em Atibaia".
- Sugestões: filtrar organização pública por default em prospecção comercial; opção "empresa localizada em X" vs "pessoa localizada em X".

---

## 3. Avaliação da copy da campanha (vs boas práticas de cold email)

Campanha gerada: "Campanha - Teste Atibaia" — 5 emails / 19 dias / 2 leads (Amanda Real - Fast4you Home Market; Shoiti Sato - Sato7 Comunicação Estratégica).

| Problema | Evidência | Boas práticas violadas |
|---|---|---|
| Pitch-first, zero problem-first | Todos os 5 emails abrem falando da TDEC ("mais de 30 anos", "nossas soluções") | Email frio de resposta abre com o problema/contexto do prospect |
| Mensagem não se adapta ao lead | Pitch de cibersegurança/infra de TI para dona de **franquia de home market** e agência de comunicação | Relevância > personalização cosmética; queima o lead e o domínio |
| Icebreakers genéricos e com pitch embutido | "Sua experiência como Dono de Franquia... é super relevante, especialmente com o crescimento do **setor de Tecnologia**" (setor do TENANT vazando para o lead); icebreaker do Shoiti termina em pitch | Icebreaker = observação específica do lead, sem venda |
| Social proof possivelmente fabricado | "cliente do setor financeiro viu redução de 30% em incidentes" (run anterior: "cliente de tecnologia, +30% eficiência") — números iguais, setores trocados | Nunca inventar case; usar apenas claims da Knowledge Base |
| Follow-ups guilt-trip sem valor novo | "deu uma olhada na minha mensagem?", "só passando para ver se viu meu email" (3× dos 4 follow-ups) | Cada follow-up deve agregar valor novo; bump puro derruba resposta |
| CTA único e repetitivo | "bate-papo rápido" nos 5 emails | Variar CTA; usar CTA de baixo atrito (pergunta de interesse) |
| Placeholders inconsistentes | "Nome" e "Empresa" literais no assunto/corpo; só `{{ice_breaker}}` é template real | Risco de sair "Oi Nome, tudo bem?" — padronizar `{{firstName}}`/`{{companyName}}` |

Positivos: estrutura de sequência coerente, cadência razoável (~4 dias), `{{ice_breaker}}` slot no email 1, tom PT-BR natural.

---

## 4. O que funcionou bem ✅

- Parse inicial multi-atributo correto (cargos + localização + indústria) e **sem loop de tecnologia** (Story 22.1 validada).
- Ajuste conversacional do briefing funciona (tamanho `<11` aceito; recuperação do erro de "importar").
- `PATCH /briefing` persiste certinho: `technology:null`, `jobTitles`, `location`, `companySize`, `industry`, `objective:"COLD_OUTREACH"`, `skipSteps:["search_companies"]` (captura de objetivo — decisão implementada).
- Plano de execução com custo por etapa e **icebreaker LinkedIn como opt-in desligado** (decisão implementada).
- Gates de aprovação por etapa funcionam; seleção manual de leads na revisão funciona.
- Dialog de "Nova conversa" protege execução em andamento com aviso de créditos (Story 22.10 visível).
- Export para Instantly concluiu com sucesso (2 leads, 5 emails).

---

## 5. Plano de melhoria priorizado

| # | Prioridade | Item | Sugestão de destino |
|---|---|---|---|
| 1 | **P0** | Fix `addAccountsToCampaign` → `PATCH /api/v2/campaigns/{id}` `email_list` + degradação graciosa no defer | Story nova (hotfix) — bloqueia TODA ativação |
| 2 | **P1** | Guard do parser p/ "importar N leads" (import mode + emailCount + leadCount) | **Story 22.11** (em andamento) — ampliar casos de teste |
| 3 | **P1** | Handler pós-rejeição: parsear resposta, ajustar briefing, re-executar step | Story nova Epic 22 |
| 4 | **P1** | Empty-state da busca com diagnóstico e ajustes de 1 clique | Story nova Epic 22 |
| 5 | **P1** | Persistir leads aprovados em Meus Leads + segmento automático/nomeável | Story nova Epic 22 (destrava pedido do cliente) |
| 6 | **P1** | Gravar campanha do agente na tabela `campaigns` (visível em /campanhas) | Story nova Epic 22 |
| 7 | **P2** | `leadCount` no briefing + quantidade livre na revisão + plano mostrando N | Story nova Epic 22 |
| 8 | **P2** | Copy: prompt problem-first por segmento do lead; claims só da KB; placeholders `{{firstName}}`/`{{companyName}}`; follow-ups com valor novo; variar CTA | Story nova Epic 22 (qualidade percebida) |
| 9 | **P2** | Matching de localização empresa-vs-pessoa; excluir setor público por default | Story nova / backlog |
| 10 | **P3** | "Ativar Depois" sem exigir conta; timestamps futuros; mensagem de erro coerente com isRetryable | Backlog UX |

**Estado residual do teste**: execução `98b5ae57` pausada com erro na ativação; campanha "Campanha - Teste Atibaia" criada no Instantly (2 leads, sem contas de envio anexadas, não ativada — nenhum email disparado). Recomendo pausar/apagar manualmente no Instantly se não for usar.
