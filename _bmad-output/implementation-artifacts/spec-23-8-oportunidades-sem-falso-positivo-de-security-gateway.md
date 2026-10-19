---
title: 'Story 23.8 — Oportunidades sem falso positivo de security gateway'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: '0cd1ddc1c4481dccc58913f085c796f11385f3ef'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Security gateways (Proofpoint, Mimecast, Barracuda, Cisco) abrem e-mails e clicam em links para escanear, e o motor de oportunidades conta isso como interesse humano. A Central de Oportunidades mostra "Alto engajamento" que pode ser só a máquina do filtro.

**Approach:** O motor (`evaluateOpportunityWindow`) passa a ignorar aberturas e cliques de leads com `esgCode`, e então o cron deixa de criar oportunidades de engajamento para eles. As respostas seguem por outro pipeline e continuam gerando oportunidade. Para as oportunidades de engajamento que já existem, a `GET /api/opportunities` consulta o ESG no Instantly na hora da leitura, só para os leads da página, com cache e em fail-open. O card mostra o badge "Possível abertura automática", sem gravar nem apagar nada no banco.

## Boundaries & Constraints

**Always:**
- Um lead "tem ESG" quando `esgCode` é uma string não vazia e diferente de `"Not Found"` e de `"Unknown(0)"`. Hoje, sem gateway, a API simplesmente omite `esg_code` (confirmado em produção).
- A regra fica num helper único, exportado do `opportunity-engine.ts`, usado pelo motor e pela rota.
- O enriquecimento da Central é fail-open: se faltar chave, se o Instantly der erro ou passar do timeout de 3s, a Central responde normalmente, com `possibleAutoOpen: false`.
- Só oportunidades `source='engagement'` podem receber a marcação. As de resposta nunca recebem.

**Never:**
- Nenhuma migration, `UPDATE` ou `DELETE` em `opportunities` ou em outra tabela. Também não mexer em job pg_cron, Edge Function, secret ou env.
- Não mexer em `reply-sweep`, `reply-processor`, `notification-processor`, no export/ativação do Instantly nem na busca de leads.
- Não tornar o threshold configurável e não mudar as superfícies do `opportunity-config`.
- Nenhuma escrita no Instantly. A consulta é só `POST /api/v2/leads/list` de leitura.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ESG com aberturas | lead `esgCode:"Mimecast"`, 5 opens recentes, minOpens 3 | não qualifica (fora da lista do motor) | — |
| ESG só clique | lead `esgCode:"Proofpoint"`, 1 click recente | não qualifica | — |
| Sem ESG | `esgCode` undefined / `"Not Found"` / `"Unknown(0)"` | comportamento atual intacto (opens/clicks/both) | — |
| Engajamento antigo com ESG | oportunidade engagement cujo e-mail tem `esg_code` no Instantly | DTO `possibleAutoOpen: true`, `securityGateway: "Mimecast"`; o card mostra o badge | — |
| Resposta de lead ESG | oportunidade `source='reply'` | `possibleAutoOpen: false`, sem consultar o Instantly por ela | — |
| Instantly fora / sem chave / lento | erro, `undefined` ou mais de 3s | lista retornada normalmente, todos `possibleAutoOpen: false` | `console.warn`, sem 500 |

</intent-contract>

## Code Map

- `src/lib/services/opportunity-engine.ts:43` -- `evaluateOpportunityWindow`: filtro central, usado pelo cron (`engagement-processor.ts:257`), pelo preview `ThresholdConfig.tsx:60` e por `use-opportunity-window.ts:91`. Adicionar `hasSecurityGateway(esgCode)` e excluir os leads com ESG antes de qualificar.
- `src/lib/services/tracking.ts:108-126,161` -- `ESG_CODE_MAP` e `resolveEsgCode`: código numérico vira label, e código desconhecido vira `Unknown(n)`. Fica como está. `getLeadTracking` (l.288) é o modelo de paginação (`starting_after` → `next_starting_after`).
- `src/lib/services/tracking.ts` -- adicionar `getSecurityGatewaysByEmails({ apiKey, emails })`: faz `POST /api/v2/leads/list` com `{ contacts: emails, limit: 100 }`, paginado até 5 páginas, e retorna um `Map<emailLowercase, gatewayLabel>` só com os e-mails que têm ESG. Basta uma entrada com ESG para marcar o e-mail. Em produção o filtro `contacts` devolve só os e-mails pedidos, com uma entrada por campanha.
- `src/app/api/opportunities/route.ts:124-200` -- monta o DTO (map de nomes de campanha, depois insights, depois `transformed`). Inserir o enriquecimento de ESG depois dos insights, usando `getInjectableServiceApiKey(profile.tenant_id, "instantly")` (`src/lib/agent/service-keys.ts:139`, que lança erro em `decrypt_error`, então o try/catch precisa cobrir). Usar cache em memória no módulo, por `tenantId:email`, com TTL de 30 min e guardando também os negativos, e `Promise.race` com timeout de 3s.
- `src/hooks/use-opportunities.ts:51` -- `OpportunityCardData`: adicionar `possibleAutoOpen: boolean` e `securityGateway: string | null`.
- `src/components/opportunities/OpportunityCard.tsx:225-233` -- badge "Alto engajamento". Ao lado dele, quando `possibleAutoOpen`, mostrar o badge "Possível abertura automática" (`data-testid="opportunity-auto-open-badge"`, `title` com o nome do gateway e a explicação).
- `src/types/tracking.ts:177` -- `esgCode?: string` em `LeadTracking`.
- Testes: `__tests__/unit/lib/services/opportunity-engine.test.ts`, `__tests__/unit/lib/services/tracking.test.ts`, `__tests__/unit/app/api/opportunities/route.test.ts`, `__tests__/unit/components/opportunities/OpportunityCard.test.tsx`. Fixtures: `__tests__/helpers/mock-data.ts` (`createMockLeadTracking` tem `esgCode` default; conferir o valor, porque se for uma string de gateway os testes atuais do motor quebram e o default tem de virar `undefined`).
- Somente leitura / não tocar: `src/lib/utils/engagement-processor.ts` (herda o filtro do motor), `src/app/api/replies/process-batch/route.ts`, `src/lib/utils/reply-*.ts`.

## Tasks & Acceptance

**Execution:**
- `src/lib/services/opportunity-engine.ts` -- exportar `hasSecurityGateway(esgCode: string | null | undefined): boolean` e fazer `evaluateOpportunityWindow` descartar os leads com ESG (`qualifiesByOpens` e `qualifiesByClicks` ficam falsos) -- AC1.
- `src/lib/services/tracking.ts` -- `getSecurityGatewaysByEmails` como descrito no Code Map, retornando um Map vazio quando não há e-mails, sem chamar a API -- consulta mínima.
- `src/app/api/opportunities/route.ts` -- enriquecer com `possibleAutoOpen` e `securityGateway` só as linhas `engagement` com `lead.email`, com cache, timeout de 3s e fail-open -- AC2.
- `src/hooks/use-opportunities.ts` + `src/components/opportunities/OpportunityCard.tsx` -- tipo e badge -- AC2 visível na Central.
- Testes nos 4 arquivos do Code Map, cobrindo todas as linhas da matriz de I/O: o motor com ESG e sem ESG (os 3 sentinelas), o service (filtro `contacts`, paginação, e-mail sem ESG fora do Map, lista vazia sem fetch), a rota (flag só em engagement, reply sem flag, erro/timeout/sem chave em fail-open, cache evitando a segunda chamada) e o card (badge presente e ausente).

**Acceptance Criteria:**
- Given um lead com `esgCode` e aberturas/cliques acima do limiar, when o cron `replies/process-batch` roda `processEngagement`, then nenhuma oportunidade `engagement` é criada para ele, e uma resposta desse lead continua criando oportunidade `reply`.
- Given as 70 oportunidades `engagement` já existentes em produção (1 delas de lead com Mimecast), when a Central de Oportunidades é aberta, then só o card desse lead mostra "Possível abertura automática", e nenhuma linha do banco é alterada.
- Given o Instantly indisponível, when a Central é aberta, then a lista carrega igual a antes, só que sem o badge.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 34 findings — high 0, medium 3, low 25, false 5, maybe-false 1
- findings:
  - `[low]` `[patch]` (blind) smoke grava em `SMOKE_OUT` antes do `mkdirSync`. Corrigido: a pasta é criada no início do teste.
  - `[low]` `[patch]` (blind) a contagem de badges na tela com per_page=100 era comparada com o total de todas as páginas da API. Corrigido: a comparação agora usa a mesma resposta reescrita que a tela renderizou.
  - `[low]` `[reject]` (blind) smoke instável se uma carga cair no timeout e a outra não. É um cenário de timing raro, e o cache torna as cargas seguintes consistentes.
  - `[low]` `[patch]` (blind) `blockedWrites` era coletado mas nunca verificado. Adicionado `expect(blockedWrites).toEqual([])`.
  - `[low]` `[reject]` (blind) chamadas extras ao Instantly podem pressionar o `reply-sweep` (sem single-flight nem backoff para 429). Uma carga sem cache faz de 1 a 3 requisições, e o cache de 30 min com negativos absorve as recargas. O cron é fail-open e tenta de novo no ciclo seguinte. Single-flight acrescentaria estado novo sem dano demonstrado. Registrado como risco residual.
  - `[medium]` `[patch]` (blind) o timeout não cancela o lookup e o resultado tardio era descartado, então todo reload refazia até 5 páginas. Corrigido: o cache é gravado dentro do lookup e um sucesso tardio preenche o cache de 30 min.
  - `[low]` `[reject]` (blind) o corte em 5 páginas guarda "sem gateway" no cache. Só acontece com mais de 500 entradas para até 100 e-mails. Em produção, 70 e-mails geram 102 entradas (3 páginas), e com a página padrão de 25 o caso não ocorre na prática.
  - `[low]` `[patch]` (blind) o comentário de `MAX_ESG_LOOKUP_PAGES` dizia 25 leads, mas o limit é 100. Comentário corrigido.
  - `[low]` `[reject]` (blind) `esgCache` sem eviction. O número de e-mails de engajamento é pequeno (70 em produção) e as chaves se repetem, então o crescimento é desprezível.
  - `[low]` `[reject]` (blind) tenant sem chave não ia para o cache. Agora já vai, como efeito do patch do cache negativo de 60s.
  - `[low]` `[reject]` (blind) o tooltip mostra `Unknown(7)` cru e `title` não aparece no toque. Código desconhecido é raro, e o `title` segue o padrão dos badges existentes.
  - `[low]` `[reject]` (blind) motor por campanha e rota por e-mail podem divergir. Se o e-mail passa por gateway em qualquer campanha, o aviso no card é informação correta.
  - `[low]` `[reject]` (blind) o motor descarta leads sem log. A spec não pede métrica, e o impacto está nas Completion Notes (1 oportunidade de 70).
  - `[false]` `[reject]` (blind) a troca do default do mock pode esconder regressões. A camada verification-gap conferiu que todo teste que depende de gateway define `esgCode` explicitamente.
  - `[false]` `[reject]` (blind) `hasSecurityGateway` na camada errada, com ciclo de import e `gateway &&` redundante. Não há ciclo, porque o motor só importa tipos. O `gateway &&` é necessário para estreitar o tipo para `string` no `set`.
  - `[false]` `[reject]` (blind) faltam spec e Completion Notes no patch. A spec é o claims file, excluído de propósito, e as notas são escritas no Finalize.
  - `[medium]` `[patch]` (edge) resultado tardio após o timeout é descartado. É a mesma causa do item do blind, corrigida pelo mesmo patch.
  - `[low]` `[reject]` (edge) truncamento em 5 páginas no cache negativo. Mesmo item rejeitado acima.
  - `[low]` `[reject]` (edge) cache sem eviction. Mesmo item rejeitado acima.
  - `[low]` `[reject]` (edge) GETs concorrentes duplicam chamadas. A janela é curta e o cache cobre as cargas seguintes. Ver o risco residual.
  - `[low]` `[reject]` (edge) com 100 e-mails, leads em muitas campanhas empurram os outros para fora. É a mesma causa do truncamento e tem a mesma justificativa.
  - `[maybe-false]` `[reject]` (edge) `esg_code` vindo como string "0" seria tratado como gateway. Em produção a API devolve número ou omite o campo (sonda de 102 entradas). Se acontecesse, seria `low`. Para confirmar, basta observar uma resposta com esg_code string.
  - `[low]` `[reject]` (edge) divergência entre motor e rota. Mesmo item do blind.
  - `[false]` `[reject]` (edge) o preview do ThresholdConfig e o `use-opportunity-window` também excluem leads com ESG. Isso é intencional: a intenção fala do "motor de oportunidades", e a spec lista esses chamadores no Code Map.
  - `[low]` `[patch]` (edge) smoke com mais de 100 oportunidades. Mesma correção do item do blind.
  - `[low]` `[patch]` (edge) o `waitForResponse` da primeira página podia casar com outra resposta. A comparação da primeira página foi removida e o smoke usa a resposta da lista reescrita.
  - `[medium]` `[patch]` (edge) com o Instantly lento ou fora, toda carga da Central esperava 3s. Corrigido: falhas e timeouts vão para o cache negativo por 60s, então no máximo uma espera de 3s por minuto.
  - `[low]` `[reject]` (verification-gap) `esgCache` sem eviction. Mesmo item rejeitado acima.
  - `[low]` `[patch]` (verification-gap) comentário 25 vs. 100. Mesma correção do item do blind.
  - `[low]` `[patch]` (intent) nenhum teste exercitava o cron (`processEngagement`) com lead com ESG. Adicionado teste em `engagement-processor.test.ts`: o lead com Mimecast não gera insert e o lead sem ESG gera um.
  - `[low]` `[reject]` (intent) o smoke verifica invariantes e não o número "1 Mimecast". Os dados de produção mudam. O número observado (1, Mimecast) está registrado nas Completion Notes.
  - `[low]` `[reject]` (intent) a marcação é calculada na leitura e não persistida (R2a vs. R2b). É a leitura que o CLAUDE.md impõe: sem migration e sem UPDATE em produção. Ver o risco residual.
  - `[false]` `[reject]` (intent) efeito colateral no preview e na janela. É intencional, igual ao item do edge.
  - `[low]` `[reject]` (intent) não há teste de UI com o Instantly fora. Os testes da rota cobrem erro, timeout, falta de chave e decrypt_error no handler.

## Design Notes

A marcação é calculada na leitura porque o ESG não é persistido em nenhuma tabela. Gravar a flag exigiria uma migration e um `UPDATE` nas linhas existentes, e o CLAUDE.md e a ordem do épico ("23.8 sem migration") proíbem as duas coisas. O custo fica perto de 1 a 3 requisições ao Instantly por carga sem cache, por página de até 25 leads. Com o TTL de 30 min e o cache guardando também os negativos, as recargas a cada 2 min não voltam a bater na API, o que respeita o limite de 20 req/min que o cron `reply-sweep` também usa.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erros
- `npm run typecheck` -- expected: exit 0
- `npm run test:run` -- expected: tudo passando (base 7544 mais os novos)

**Manual checks (if no CLI):**
- Smoke de leitura em produção: chamar `getSecurityGatewaysByEmails` com os e-mails das oportunidades `engagement` deve marcar exatamente 1 (Mimecast). `git diff` não pode ter migration nem tocar arquivos de `reply-*`, `instantly.ts`, export ou busca.

## Completion Notes

**O que pode ter mudado para o cliente:**
- Motor `evaluateOpportunityWindow` (`src/lib/services/opportunity-engine.ts`): leads com security gateway deixam de qualificar por abertura ou clique. Isso vale para o cron `replies/process-batch` (`processEngagement` não cria mais oportunidade `engagement` para eles), para o preview do limiar (`ThresholdConfig`) e para a janela de oportunidade da campanha (`use-opportunity-window`). Hoje isso afeta 1 lead (Mimecast).
- `GET /api/opportunities`: passa a consultar o Instantly em modo leitura (`POST /api/v2/leads/list` com `contacts`), só para os e-mails das oportunidades `engagement` da página. Usa cache de 30 min, cache negativo de 60s em falhas e espera no máximo 3s, sempre em fail-open. O DTO ganhou `possibleAutoOpen` e `securityGateway`.
- O card da Central mostra o badge "Possível abertura automática", com o gateway no tooltip.
- Nenhuma migration, tabela, job pg_cron, Edge Function, secret ou env foi alterado, e nada foi gravado no banco.

**Os 3 pontos do CLAUDE.md:**
1. Campanhas rodando, webhook e `reply-sweep`: verificado **por análise do diff e por testes**. Webhook, `reply-sweep`, `reply-processor` e `notification-processor` não foram tocados. O cron continua igual, exceto pela exclusão dos leads com ESG no engajamento, que é a mudança pedida. As respostas desses leads seguem gerando oportunidade, porque passam por outro pipeline. O teste novo em `engagement-processor.test.ts` cobre isso. A Central agora divide o limite de taxa do Instantly com o cron, o que está mitigado pelo cache (ver riscos).
2. Busca de leads: verificado **por análise do diff**. Nenhum arquivo do Apollo ou de outras fontes foi tocado.
3. Criação, export e ativação no Instantly: verificado **por análise do diff**. `instantly.ts`, as rotas de export e a ativação não foram tocados.

**Smoke real (somente leitura, produção):** `__tests__/e2e/smoke-23-8.spec.ts` contra `next dev -p 3100`, com trava bloqueando qualquer requisição que não seja GET. Resultado: 72 oportunidades, 70 `engagement`, exatamente 1 marcada (Mimecast, id `2e14c40a-731d-4be4-b3d6-7d7327976632`), 1 badge na tela, 0 escritas bloqueadas e 0 erros de página. Também rodou uma sonda com a chave do tenant: 102 entradas do Instantly para os 70 e-mails, só 1 com `esg_code` (2, Mimecast). Sem gateway, a API omite o campo.

## Auto Run Result

Status: done

**Resumo:** o motor de oportunidades ignora aberturas e cliques de leads com security gateway (ESG). As respostas continuam gerando oportunidade. As oportunidades de engajamento antigas de leads com ESG mostram "Possível abertura automática" na Central, com o ESG consultado no Instantly na hora da leitura e sem gravar nada.

**Arquivos:**
- `src/lib/services/opportunity-engine.ts`: `hasSecurityGateway` e a exclusão dos leads com ESG no `evaluateOpportunityWindow`.
- `src/lib/services/tracking.ts`: `getSecurityGatewaysByEmails`, só leitura, com filtro `contacts` e no máximo 5 páginas.
- `src/app/api/opportunities/route.ts`: enriquecimento `possibleAutoOpen`/`securityGateway` com cache, timeout de 3s e fail-open.
- `src/hooks/use-opportunities.ts`: campos novos em `OpportunityCardData`.
- `src/components/opportunities/OpportunityCard.tsx`: badge "Possível abertura automática".
- `__tests__/...`: testes do motor, do service, da rota, do card e do engagement-processor. Fixtures ajustadas: o `esgCode` default do mock virou `undefined`.
- `__tests__/e2e/smoke-23-8.spec.ts`: smoke somente leitura da Central.

**Revisão:** 34 achados (0 high, 3 medium, 25 low, 5 false, 1 maybe-false).
- Patches: as 3 medium, que têm a mesma causa (resultado tardio e falha fora do cache), e 8 low (smoke: mkdir, blockedWrites e comparação na mesma resposta; comentário; teste do cron).
- Nada adiado.
- Rejeitados: os demais, com os motivos no Review Triage Log.
- Follow-up: `false`. Só uma entrada medium (agrupada) recebeu patch, nenhuma high.

**Verificação:** `npm run lint` com 0 erros (134 warnings, nenhum nos arquivos tocados). `npm run typecheck` com exit 0. `npm run test:run` com 409 arquivos e 7583 testes passando (2 skipped). Smoke e2e somente leitura em produção passou: 1 badge (Mimecast), 0 escritas.

**Riscos residuais:**
- A Central divide o limite de 20 req/min do Instantly com o `reply-sweep`. Uma carga sem cache faz de 1 a 3 requisições, sem single-flight. Se houver muitas abas abertas ao mesmo tempo, o cron pode levar um 429, mas é fail-open e repete no ciclo seguinte.
- A marcação é calculada na leitura, não persistida. Ela some se o Instantly falhar (por 60s), e outros consumidores de `opportunities` não a enxergam.
- O cache vive em memória, por instância.

## Fix pós-entrega — ESG persistido (2026-10-16)

**Branch:** `fix/23-8-esg-persistido`, a partir da `epic/23-plataforma-higiene`. Fica segurada até a janela de deploy da 23.1/23.3. **Não fazer merge antes de aplicar a migration.**

**Motivo:** resolve os 3 riscos residuais da entrega original: a Central dividia com o `reply-sweep` o limite de requisições do Instantly, a marcação era só na leitura e o cache era por instância.

**O que muda:**
- `supabase/migrations/00064_create_lead_security_gateways.sql` (nova, **só aditiva**): tabela `lead_security_gateways` (tenant, e-mail normalizado, gateway, `last_seen_at`) com `UNIQUE (tenant_id, email)` e RLS de leitura por tenant. A escrita é só do cron, via service role. Não toca linhas existentes.
- `src/lib/utils/engagement-processor.ts`: depois do `getLeadTracking` de cada campanha, faz upsert dos e-mails com ESG na tabela. Não faz nenhuma chamada nova ao Instantly (reaproveita o tracking do ciclo) e é fail-open: erro só gera log e o ciclo segue criando oportunidades.
- `src/app/api/opportunities/route.ts`: lê `lead_security_gateways` do banco em vez de consultar o Instantly. Saem o cache em memória, o timeout e a chave do Instantly. Se a leitura falhar, a lista segue sem marcação.
- `src/lib/services/tracking.ts`: `getSecurityGatewaysByEmails` foi removido (sem uso) e o arquivo voltou ao estado anterior à 23.8.
- Testes: rota (marca pelo banco, reply sem consulta, erro em fail-open) e cron (grava só ESG normalizado, não grava sem ESG, falha não derruba o ciclo).

**Verificação local:** `npm run lint` 0 erros, `npm run typecheck` ok, `npm run test:run` 409 arquivos / 7577 testes passando (2 skipped).

**Os 3 pontos do CLAUDE.md:** o ponto 1 é afetado, porque o cron do `reply-sweep` passa a gravar numa tabela nova. A gravação é fail-open e não muda respostas, oportunidades nem notificações. Por isso o fix fica na janela de deploy. Pontos 2 e 3: não tocados (análise do diff).

**Na janela de deploy (operador):**
1. Aplicar `00064_create_lead_security_gateways.sql` no Supabase de produção, com o OK do Fabossi.
2. Fazer merge da `fix/23-8-esg-persistido` na branch do épico e o deploy.
3. Esperar um ciclo do `reply-sweep` (até 5 min) e conferir que `lead_security_gateways` tem 1 linha (Mimecast).
4. Rodar `__tests__/e2e/smoke-23-8.spec.ts`. O esperado é 1 badge na Central e 0 escritas.

## Deploy em produção (2026-10-16)

- **Migration `00064`:** aplicada pelo Fabossi no SQL Editor do projeto `kdgogyqyaxncqoyklyxx`. Conferido por leitura: a tabela existe e, sem login (anon), retorna 0 linhas (RLS ativa).
  - Antes disso, a `00063` (backfill da 22.10) foi rodada por engano. Ela estava pendente desde julho e é idempotente. Atualizou as 12 execuções do agente previstas, todas em modo `guided` e paradas aguardando aprovação, então nenhuma avança sozinha. Não toca campanha, lead nem Instantly.
- **Deploy:** o fix entrou na `epic/23-plataforma-higiene` (fast-forward `18c469c`). O CI do PR #7 (Lint, Typecheck, Tests e preview da Vercel) ficou verde, e o merge do PR #7 na `main` (`266fc24`, 10:14 UTC) gerou o deploy de produção `https://tdec-prospect.vercel.app` às 10:16 UTC. O pacote incluiu as stories 23.4, 23.2 e 23.8 com o fix. O deploy anterior (`c109771`) fica disponível para rollback.
- **Cron:** o `reply-sweep` das 10:20 gravou **61 linhas** em `lead_security_gateways` (Proofpoint, Mimecast e Cisco), cobrindo todos os leads das campanhas exportadas, e não só os que têm oportunidade. Por isso o número é maior que a "1 linha" prevista no passo 3 acima. O ciclo completou normalmente.
- **Smoke 23.8 em produção (somente leitura):** 72 oportunidades, 70 de engajamento e exatamente 1 com o selo (Mimecast, `2e14c40a`). Sem erros de página e sem escritas.
- **Smoke 23.2 em produção (somente leitura):** 17 passaram e 1 foi pulado (a busca no Apollo, que só roda com `SMOKE_APOLLO=1`). Nenhuma error boundary, nenhum erro de página e nenhuma resposta ≥ 400.
  - Os erros de console em 8 telas vieram das Server Actions de leitura (`getConfiguredIntegrations`, `getApiConfigs`, `get*` da base de conhecimento e da equipe), que a trava do smoke bloqueia por serem POST. Não são erros do app.
  - Verificação humana recomendada: em Configurações → Integrações, Instantly e Apollo devem aparecer conectados.
- **Os 3 pontos do CLAUDE.md:**
  1. **Campanhas rodando, webhook e `reply-sweep`:** verificado por smoke real (o cron rodou e gravou). Nenhuma chamada de export ou ativação, e nenhuma alteração no Instantly.
  2. **Busca de leads:** coberta pelo smoke da 23.2 em 15/10 (busca real no Apollo). O código não mudou desde então.
  3. **Export e ativação:** o diálogo de export abre com o Instantly conectado. O código desse caminho não mudou.
