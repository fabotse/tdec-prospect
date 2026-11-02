# Spike 24.11 — Treg: relatório

**Data:** 2026-10-28 · **Story:** 24.11 Spike do Treg (FR32) · **Código de produção alterado:** nenhum
**Gasto total:** US$ 1,356318 de um teto de US$ 3,00 (426 chamadas) · **Decisão final:** do Fabossi. Este documento só recomenda.

Scripts em `spikes/24-11-treg/`. Os resultados brutos ficam em `spikes/24-11-treg/out/`, que está no `.gitignore` porque tem dados pessoais dos leads.

---

## 1. Resumo e recomendação por capacidade

**web.search + web.extract: GO CONDICIONAL. É a capacidade que importa para a 24.19.** A rota `treg.web.search` custa US$ 0,00015 por chamada e foi servida 100% pelo crawl4ai, que traz resultados do Google. Funciona bem com consulta em português e sites `.com.br`, mas não aceita filtro de data nem de país. Por isso a busca "<empresa> notícias" trouxe notícia datada dos últimos 90 dias em só 9 das 25 empresas. Chamando o provedor direto pelo Treg, o resultado muda. O `exa.web.search` com `startPublishedDate` e `userLocation: BR` (US$ 0,007) deu em 9 de 10 empresas pelo menos 3 notícias recentes que citam a empresa: Valor, Exame, CNN Brasil, InfoMoney e o próprio site da empresa, sempre com data publicada. Um exemplo é "Grupo Bradesco Seguros anuncia novo CISO" (2026-09-28), que é exatamente o "por que agora" da 24.20. O `treg.web.extract` (US$ 0,00015–0,0023) trouxe conteúdo útil em 20/25 home pages, 22/25 notícias e 20/25 páginas de vaga. A condição do GO é a 24.19 não usar só a rota genérica. A recomendação é: `exa.web.search` com data para notícias e vagas, `treg.web.extract` para resumir o site e as páginas, cache próprio de 30 dias e timeout ≥ 60 s com `Idempotency-Key`. Custo estimado: **US$ 0,015–0,02 por conta** no dossiê básico.

**people.email.verify: NO-GO por enquanto, alinhado com o descope da 24.12.** Funciona e é barato (US$ 0–0,0004 por verificação, p50 ~2,5 s), mas os provedores discordam entre si. O contactout (grátis) e o trykitt concordaram em só 13 de 19 e-mails. Na amostra, 8/25 e-mails são catch-all (`accept_all`), um padrão comum em domínio corporativo brasileiro. A rota grátis (contactout) deu 429 depois de 19 chamadas, e o Treg caiu sozinho para o trykitt. Não deu para medir acerto contra o Apollo porque o `email_status` do Apollo não está gravado em `leads`. Se a verificação voltar ao escopo, o Treg serve como provedor, desde que um único provedor seja fixado (`X-Treg-Route-Prefer`) para o resultado ser consistente.

**people.email.find: NO-GO como fonte principal. Fica como possível GO CONDICIONAL de fallback, ainda não testado.** Achou e-mail para 24 dos 25 leads (96%), e 17 dos 24 são idênticos ao do Apollo (71%). O custo foi US$ 0,0071 por lead, mas a latência é alta: p50 8,7 s, p95 37 s, máximo 71 s. Dos 7 que diferem, 3 estão em outro domínio da mesma empresa (grupobrisanet.com.br, totvs.com.br, mbrf.com). No desempate por verify, o Treg ganhou em 1 caso, o Apollo em 1 e os outros 5 ficaram inconclusivos. Há um viés a favor do Treg: o domínio enviado saiu do próprio e-mail do Apollo. O Apollo já entrega o e-mail na busca, então o find só faria sentido para leads **sem** e-mail do Apollo, cenário que este spike não amostrou. Ponto de LGPD: na waterfall, o nome do lead chegou a ir para até **14 provedores** numa única chamada.

**people.phone.find: NO-GO.** Achou telefone para 2 dos 15 leads (13%), e só 1 bate com o Apollo. Com teto de US$ 0,03, os 8 primeiros deram miss, porque os provedores caros foram pulados. Com teto mais alto, um acerto custou US$ 0,245. Cobertura baixa no Brasil e custo alto por acerto.

---

## 2. Método

**Conta Treg:** org `fabossi` (owner), token de time lido do `.env.local` do repo principal, que nunca foi impresso nem gravado. Não é uma conta de teste: é a conta paga do Fabossi, com blocos de crédito comprados. Saldo no início: **US$ 8,29886**. Saldo no fim: **US$ 6,942542**. Nenhuma ferramenta própria ou chave de provedor conectada (`/tools` e `/connections` vazios).

**Docs seguidas:** `https://treg.to/llms.txt`, `skill.md` e `integrate.md`, além do catálogo público (`/catalog/endpoints/<id>`, sem autenticação) para preços e parâmetros. Tudo por HTTP (`POST https://treg.to/call/<id>`, header `X-Treg-Token`). A CLI não foi instalada.

**Amostra:** 25 leads de produção, lidos só por `scripts/db-ro.sh`. A query está em `spikes/24-11-treg/sample.sql`. Critérios: e-mail do Apollo presente, localização Brasil e cargo de segurança, infra ou TI (CISO, Segurança da Informação, Cyber, Infra, CTO). Uma pessoa por empresa, em ordem pseudoaleatória estável (md5 do id). Foram excluídas 2 linhas: uma sem empresa e uma com e-mail de outra empresa. Das 25, 19 têm e-mail `.com.br`. As empresas são Riachuelo, Caixa Seguradora, Marfrig, PicPay, Brisanet, HSBC Brasil, Hospital Alemão Oswaldo Cruz, Embraer, Arco Educação, Bradesco Seguros, TOTVS, CVC, Bioma Genetics, Rede Américas, Simpar, Aché, Cosan, UOL, Grupo Cornélio Brennand, Movida, Sequoia, Andrade Gutierrez, TIM, Natura &Co e BRF.

**O que foi enviado ao Treg (mínimo necessário):**

| Capacidade | Campos enviados |
|---|---|
| email.verify | só o e-mail do Apollo |
| email.find | `first_name`, `last_name`, `domain` (domínio do e-mail do Apollo; não há coluna de domínio em `leads`) |
| phone.find | `first_name`, `last_name`, `domain` (8 leads); `linkedin_url` sozinho (5 leads); nome + domínio com teto alto (2 leads) |
| web.search / extract e afins | só nome e domínio da empresa |

**Controle de custo:** todas as chamadas pagas levaram `X-Treg-Route-Max-Cost`. O ledger local (`out/ledger.jsonl`) somava `X-Treg-Cost-Micro` e recusava uma chamada quando gasto + teto passaria de US$ 3. Toda chamada levou `X-Treg-Meta: feature=spike-24-11`. O total do ledger bateu **ao micro-dólar** com a queda do saldo (US$ 1,356318) e com `/orgs/<id>/usage/by-tag`.

**Regras de produção respeitadas:** nenhuma escrita no banco, nenhuma chamada ao Instantly, nenhum envio de e-mail ou WhatsApp, nenhuma chamada paga ao Apollo (a comparação usou o que já está em `leads`) e nenhuma mudança em código, migration, cron ou env.

---

## 3. Resultados por capacidade

### 3.1 web.search (rota) — 100 buscas em português, 25 empresas

Quatro buscas por empresa: "<empresa> site oficial", "<empresa> notícias", "vagas segurança da informação <empresa>" e "<empresa> ataque hacker vazamento de dados incidente cibernético".

| Métrica | Resultado |
|---|---|
| Sucesso HTTP | 100/100 |
| Provedor servido | crawl4ai.web.search em 100% (resultados do Google: título, URL, snippet com data) |
| Custo | US$ 0,00015 por chamada · US$ 0,0006 por empresa (4 buscas) |
| Latência | p50 5,2 s · p95 9,6 s |
| Site da empresa entre os resultados | 18/25 pelo domínio do e-mail. Na prática ~20/25: Andrade Gutierrez e Embraer acharam o site certo num domínio diferente do e-mail. As falhas foram Marfrig (Facebook), Aché (ach.com, errado), Sequoia (homônimo nos EUA), TIM (Wikipédia) e Rede Américas (Instagram) |
| Notícia datada nos últimos 90 dias | **9/25** empresas com ≥ 1 (média 0,4 por empresa). Esse é o ponto fraco: a rota não aceita filtro de data |
| Vagas citando a empresa | 24/25 com ≥ 1 resultado de vaga (Indeed, Glassdoor, Gupy, portais próprios como `atracaodetalentos.totvs.app`) |
| Incidente de segurança | a heurística marcou 17/25, mas cerca de metade é falso positivo (Riachuelo → Renner, Sequoia → empresa dos EUA). Incidente real da própria empresa em ~8/25: Embraer, TOTVS, CVC, Cosan, HSBC, PicPay, Natura/Avon e TIM |

### 3.2 Notícias recentes: comparação de provedores (10 empresas, chamadas diretas pelo Treg)

| Provedor (pelo Treg) | Parâmetros BR/data | Empresas com ≥ 3 notícias recentes citando a empresa | Média de itens datados ≤ 90 d | Custo por chamada | p50 |
|---|---|---|---|---|---|
| **exa.web.search** | `startPublishedDate`, `userLocation: BR` | **9/10** | **8,9** | US$ 0,007 | 6,2 s |
| serper.web.search (Google) | `gl=br`, `hl=pt-br`, `tbs=qdr:m3` | 9/10 pela contagem | 6,8 | US$ 0,001 | 1,8 s |
| tavily.web.search | `topic: news`, `start_date` | 0/10: **recusado** (432 "plan's usage limit" e 503 `provider_capacity_unavailable`, na conta do próprio Treg) | — | US$ 0 | — |
| treg.companies.news (rota por domínio: akta → predictleads) | domínio | 8/10 com linhas | — | US$ 0,0195 em média (US$ 0,01–0,045) | 2,3 s |

Leitura qualitativa:

- **Exa** traz notícias de imprensa brasileira, relevantes e com data em ISO. Exemplos: Embraer (pedido de 26 E2, compra de 51% de empresa da Mahindra), PicPay (lançamento com IA, carteira de crédito), Marfrig/BRF (fusão MBRF), Bradesco Seguros (lucro do 3º tri, **novo CISO**).
- **Serper**, mesmo com o filtro de 3 meses, mistura muito ruído: Google Play, Instagram, Jusbrasil e binlist. A contagem é alta, mas a utilidade é menor.
- **companies.news:** o akta tem data, resumo e sentimento, mas a relevância é irregular. Para HSBC veio notícia da CMS Energy, e para PicPay uma notícia sobre o AliExpress. O predictleads trouxe eventos antigos (2023). O pior caso foi a Caixa Seguradora, **cobrada US$ 0,045 sem nenhuma linha**: a waterfall cobra miss dos dois provedores.

### 3.3 Vagas de segurança/infra (10 outras empresas, e mais 5 + 2 na rota de jobs)

| Fonte | Resultado | Custo |
|---|---|---|
| exa.web.search ("vaga segurança da informação … na <empresa>", ≤ 90 d) | 10/10 com ≥ 1 resultado de vaga da empresa. Boa parte são **posts de pessoas no LinkedIn** anunciando a vaga (dado pessoal de terceiros, ver §6) e páginas Gupy/Vagando | US$ 0,007 por chamada |
| crawl4ai.linkedin.search.jobs | 4/10 com linha da empresa. Com o nome da empresa na query, os 10 primeiros vieram vazios | US$ 0,00045 |
| treg.companies.jobs.search (rota: predictleads/crustdata) | 4/5 acertos. Vagas **frescas** (first_seen 2026-10-27/28, Brasil), mas de toda a empresa e **sem filtro de cargo**: das 10 vagas inspecionadas, nenhuma é de segurança. 1 miss (Embraer) foi cobrado US$ 0,04 | US$ 0,04–0,045 por chamada |
| theirstack.companies.technologies (pedido pela 24.19) | 3/3 responderam, 50 tecnologias cada, mas com ruído: palavras em português viraram "tecnologia" ("Moda", "Agora", "Venda", "Centro", "Validar"). Nenhuma ferramenta de segurança (CrowdStrike, Fortinet etc.) apareceu nas 50 primeiras | US$ 0,06 por chamada |

`theirstack.jobs.search`, que é o "TheirStack jobs" citado na 24.19 e na 25.3, com filtro por cargo, **não foi testado** (US$ 0,02 por vaga retornada).

### 3.4 web.extract (rota) — 75 extrações

| Página | HTTP 200 | Útil (> 500 caracteres) | Provedores | p50 / p95 | Custo |
|---|---|---|---|---|---|
| Home (`https://www.<domínio>`) | 21/25 | 20/25 | crawl4ai em 19; fallback para anyapi (US$ 0,0014) e parallel (US$ 0,00225) | 1,7 s / 11,7 s | US$ 0,0065 no total |
| 1ª notícia encontrada | 23/25 | 22/25 | crawl4ai | 1,7 s / 15 s | US$ 0,0035 |
| 1ª vaga encontrada | 22/25 | 20/25 | crawl4ai | 1,7 s / 4,9 s | US$ 0,0033 |

Falhas da home:

- 3 timeouts **do meu lado**, com limite de 120 s. O Treg não cobrou nada: conferido pelo saldo.
- 1 erro 502 (HAOC).
- 1 resposta 200 vazia: o domínio do e-mail da Sequoia não resolve DNS. A waterfall tentou 5 provedores e cobrou US$ 0,00225 mesmo assim.

Várias falhas vêm do domínio do e-mail não ser o site da empresa (agnet.com.br, timbrasil.com.br, natura.net). O dossiê deve achar o site pela busca antes de extrair. O fallback entre provedores funcionou: quando o crawl4ai recebeu 403, o anyapi serviu a página.

### 3.5 people.email.verify — 25 e-mails do Apollo, mais uma 2ª opinião

| Métrica | Resultado |
|---|---|
| Sucesso | 25/25 |
| Provedores | 1ª rodada: contactout (grátis) em 19, depois 429 e fallback automático para trykitt em 6. 2ª rodada (contactout excluído): trykitt em 25 |
| Status (contactout/trykitt mistos) | valid 9 · invalid 8 · accept_all 8 |
| Status (trykitt) | valid 9 · valid-risky 5 · invalid 9 · unknown 2 |
| Concordância contactout × trykitt | 13/19 (68%) |
| Custo | US$ 0 (contactout) · US$ 0,0004 (trykitt) por e-mail |
| Latência | p50 2,5–2,8 s · p95 12–15 s |
| Acerto vs Apollo | **não medido**: `email_status` do Apollo não é gravado em `leads` (nenhuma coluna de status ou verificação no schema) |

A saída da rota só tem `status`/`valid`/`score`. `score` veio sempre nulo. Para catch-all, descartável etc. é preciso chamar o provedor direto.

### 3.6 people.email.find — 25 leads (nome + domínio)

| Métrica | Resultado |
|---|---|
| Cobertura | 24/25 (96%). O lead restante estourou o timeout de 120 s do cliente. Repetido com `Idempotency-Key`: miss depois de 14 provedores, 50 s, US$ 0 |
| Igual ao Apollo | 17/24 (71%) |
| Diferente do Apollo | 7. Três em **outro domínio** da mesma empresa: l\*\*\*@grupobrisanet.com.br × l\*\*\*@brisanet.com.br, d\*\*\*@totvs.com.br × d\*\*\*@totvs.com, w\*\*\*@mbrf.com × w\*\*\*@brf.com (pós-fusão; talvez o do Treg seja o mais atual). Quatro no mesmo domínio, com outra parte local |
| Desempate por verify (trykitt) | Treg melhor em 1 (Brisanet: Apollo `invalid`, Treg `valid`) · Apollo melhor em 1 (TIM: Apollo `valid`, Treg `invalid`) · ambos `valid` em 2 (UOL, BRF) · inconclusivos em 3 |
| `output.verified: true` | 8/24 |
| Provedores que acertaram | trykitt 11, dropleads 4, limadata 3, moltsets 2, quickenrich 2, tomba 1, leadsforge 1 |
| Provedores tentados por chamada | p50 2 · p95 7 · máximo 14 |
| Custo | **US$ 0,0071 por lead** · US$ 0,0074 por acerto (US$ 0 a US$ 0,0245) |
| Latência | p50 8,7 s · p95 36,8 s · máximo 71 s |

Viés: o domínio enviado é o do e-mail do Apollo, o que favorece repetir o Apollo. Leads sem e-mail no Apollo não foram testados.

### 3.7 people.phone.find — 15 tentativas

| Variante | Tentativas | Acertos | Custo |
|---|---|---|---|
| nome + domínio, teto US$ 0,03 | 8 | 0 (provedores caros "skipped: would exceed max cost") | US$ 0 |
| só `linkedin_url`, teto US$ 0,05 | 5 | 1 (tomba; **igual ao Apollo**, celular) | US$ 0,0445 |
| nome + domínio, teto US$ 0,25 | 2 | 1 (prospeo; **diferente** do Apollo, celular) | US$ 0,245 |
| **Total** | 15 | **2 (13%)**, 1 igual ao Apollo | US$ 0,2895 · US$ 0,145 por acerto |

Latência p50 2,4 s. Na waterfall, só cobra o provedor que acerta.

---

## 4. BYOK, Idempotency-Key, teto de custo (e cache)

**Idempotency-Key: funciona exatamente como documentado.** Testado numa chamada direta (exa) e numa rota (`treg.web.search`):

- 1ª chamada: cobrada (US$ 0,007 / US$ 0,00015).
- Repetição com a mesma chave: 200 em ~0,3 s, `X-Treg-Idempotent-Replay: true`, `X-Treg-Cost-Micro: 0` e `X-Treg-Original-Cost-Micro` com o valor original.
- Mesma chave com corpo diferente: **422**, "already used for a different request", sem cobrança.

**Teto de custo (`X-Treg-Route-Max-Cost`): funciona como documentado.**

- Chamada direta com teto abaixo do preço: **402 `route_max_cost`**, com `estimated_cost_micro` e "nothing was charged".
- Rota com teto mínimo: 402 com o plano de provedores e os preços.
- Na waterfall, os provedores mais caros que o teto aparecem como `skipped: "would exceed max cost"` e não são cobrados.
- Atenção: o teto limita **cada chamada**, não o lote. E miss **é cobrado** em provedores `per_call`: companies.news custou US$ 0,045 sem linhas, jobs custou US$ 0,04 num miss e extract custou US$ 0,00225 num domínio inexistente. O teto do lote precisa ser controlado pelo nosso lado. O ledger mostrou que dá: `X-Treg-Cost-Micro` bate com o saldo.

**BYOK: não testado na prática.** O time não tem chave nem ferramenta própria conectada (`/tools` e `/connections` vazios). Testar exigiria cadastrar no Treg uma chave de provedor da TDec, por exemplo a do Apollo, e entregar a chave a um terceiro está fora do que este spike foi autorizado a fazer. O que as docs dizem: a chave do próprio time é usada antes da do Treg e nunca é cobrada, e a ordem é ferramenta própria → chave do time → rota pública grátis → conta do Treg. O Apollo existe no catálogo (`apollo.people.enrich`, `apollo.companies.jobs`, `apollo.companies.news`), mas a TDec já chama o Apollo direto. Pôr o Apollo atrás do Treg só traria o ledger unificado.

**Cache de repetição: não funcionou como documentado.** As docs dizem que a repetição da mesma pergunta sai a 10% do preço (`X-Treg-Cache: hit`). No teste:

- Repetir a busca exa e a busca da rota sem chave foi cobrado **preço cheio**, sem header de cache. `Cache-Control: no-cache` também cobrou cheio, como esperado.
- Só as verificações de e-mail repetidas (trykitt) saíram a **US$ 0**, marcadas `cached: true` em `/calls`, mas também sem o header.

Conclusão: não contar com o cache do Treg. O cache de 30 dias do dossiê (24.19) precisa ser nosso.

**Outros comportamentos observados:**

- **Recuperação de resposta paga** (`GET /calls/<id>/result`): para as rotas, voltou `stored: false` ("not stored"). Não dá para depender disso para recuperar uma resposta perdida. A saída é salvar a resposta ou usar `Idempotency-Key`.
- **Timeouts do cliente:** 4 chamadas passaram de 120 s do meu lado e não foram cobradas (conferido pelo saldo). Mesmo assim, o find tem p95 de 37 s: o cliente da 24.19 precisa de timeout generoso e `Idempotency-Key` em toda chamada.
- **Capacidade da conta do Treg:** o Tavily foi recusado (432 e depois 503 `provider_capacity_unavailable`, com sugestão de alternativas) e o contactout deu 429. As contas compartilhadas do Treg esgotam. A rota cai para o próximo provedor sozinha, mas a chamada direta a um provedor específico falha.

---

## 5. Custo total gasto no spike

| Bloco | Chamadas | US$ |
|---|---|---|
| web.search rota (100) + probes | 102 | 0,0153 |
| web.extract rota | 76 | 0,0134 |
| Notícias: exa, serper, tavily, companies.news | 40 | 0,2745 |
| Vagas: exa, LinkedIn, rota jobs; tecnologias (TheirStack) | 41 | 0,5445 |
| email.verify (3 rodadas) | 57 | 0,0128 |
| email.find (+ retry) | 26 | 0,1781 |
| phone.find | 15 | 0,2895 |
| Testes de idempotência, cache e teto | 11 | 0,0283 |
| Leitura de conta, saldo, `/calls` e recuperação | 58 | 0 |
| **Total** | **426** | **1,356318** |

Por capacidade, comparado com a divisão sugerida: web (search, extract, notícias, vagas e tecnologias) US$ 0,876, ou 65% do gasto · verify US$ 0,013 · find US$ 0,178 · phone US$ 0,290. Sobraram US$ 1,64 do teto.

**Não testado:**

- BYOK, pelo motivo da §4.
- `theirstack.jobs.search` com filtro de cargo.
- find em leads **sem** e-mail do Apollo.
- `X-Treg-Route-Verify: true` no find.
- Verificação contra o `email_status` do Apollo (não está gravado).
- Volume e concorrência acima de 5 chamadas em paralelo.

---

## 6. Implicações para 24.19 (dossiê) e Epic 25 (radar), e riscos

**24.19, desenho recomendado por conta:**

1. Site: `treg.web.search` "<empresa> site oficial" (US$ 0,00015). Usar o domínio do resultado em vez do domínio do e-mail.
2. Resumo do site: `treg.web.extract` na home e em 1–2 páginas institucionais (cerca de US$ 0,0003–0,0005).
3. Notícias de 90 dias: `exa.web.search` com `startPublishedDate` e `userLocation: BR` (US$ 0,007). Cada resultado já traz `url` e `publishedDate`, o que cobre o formato `{fato, fonte_url, data, confiança}`.
4. Vagas de segurança/infra: `exa.web.search` com data (US$ 0,007), ou testar o `theirstack.jobs.search` com filtro de cargo antes de decidir. A rota `companies.jobs.search` não filtra cargo e custa US$ 0,04.
5. Tecnologias: o TheirStack via Treg veio com ruído para empresas brasileiras. Não recomendo sem filtro.

Total do dossiê básico: **~US$ 0,015–0,02 por conta**. São 5–8 chamadas e cerca de 10–20 s com paralelismo. Recomendações para a implementação:

- Toda chamada passa por um wrapper único, com `X-Treg-Meta` (tenant/execução), `X-Treg-Route-Max-Cost`, `Idempotency-Key`, registro em `api_usage_logs` (NFR3) e teto por execução somado do nosso lado (NFR4).
- Uma fonte que falha não derruba o dossiê (NFR9). O fallback entre provedores ajuda, mas um provedor esgotado na conta do Treg (o caso do Tavily) exige ter um segundo provedor configurado.

**Epic 25 (radar, 25.3):** varrer contas do ICP periodicamente atrás de notícias e vagas cabe no custo: 100 contas × 2 buscas exa ≈ US$ 1,40 por rodada. Se `companies.news` ou `companies.jobs` entrarem, o teto precisa considerar que miss é cobrado.

**Riscos:**

- **LGPD e dados de terceiros:**
  - No find e no phone, a waterfall manda nome e domínio do lead para vários fornecedores numa única chamada: até 14 no find, até 14 no phone por LinkedIn. Cada fornecedor é mais um operador de dados pessoais.
  - Os resultados de vagas e notícias trazem posts de pessoas no LinkedIn e nomes de executivos. O dossiê deve guardar só o fato e a fonte que interessam à conta, sem perfilar terceiros.
  - Para web search/extract de **empresa** não vai dado pessoal nenhum. É a capacidade de menor risco.
- **Dependência de fornecedor:** o Treg é um agregador que revende contas compartilhadas. Observamos esgotamento (Tavily) e rate limit (contactout), o cache e a recuperação não se comportaram como as docs dizem, e o provedor servido muda sem aviso: no spike foi sempre o crawl4ai, mas o plano lista 19. Mitigação:
  - Manter a interface da 24.19 independente do provedor.
  - Fixar os provedores que importam (`X-Treg-Route-Prefer` ou chamada direta, como o exa).
  - Ter fallback para as fontes atuais.
- **Custo por miss:** rotas com provedores `per_call` cobram tentativa sem resultado. O teto por chamada protege cada chamada, e o teto do lote precisa ser nosso.
- **Conta:** os testes rodaram na conta paga do Fabossi. Para produção, convém um token de agente só para a TDec (`treg org agent-new`, com `--cap`) e orçamento por tenant via `X-Treg-Meta` + `/budgets`. É o modelo descrito em `integrate.md`.

---

### Como reproduzir

Em `spikes/24-11-treg/`, com Node 24:

| Comando | O que faz |
|---|---|
| `node 00-account.mjs start` | conta, saldo e ferramentas próprias |
| `node 02-web.mjs` | web search/extract, 25 empresas |
| `node 03-people.mjs verify\|verify2\|find\|phone\|phone2\|verifyfound\|findretry` | capacidades de pessoas |
| `node 04-features.mjs` | idempotência, cache e teto |
| `node 05-web-compare.mjs` | comparação de notícias |
| `node 06-jobs.mjs` | vagas |
| `node 07-jobs-tech.mjs` | jobs e tecnologias |
| `node 08-analyze.mjs` e `node 09-ledger.mjs` | números agregados |

A amostra sai de `sample.sql` via `scripts/db-ro.sh` para `out/candidates.csv`. Os números deste relatório estão em `out/analysis.json` e `out/ledger-summary.json` (locais, fora do git).

## Decisão do Fabossi (2026-10-28)

- **Pesquisa web: GO.** A 24.19 (dossiê) usa o Treg para `web.search`/`web.extract`, com **Exa via Treg** (filtro de data e Brasil) para notícias e vagas, cache próprio de 30 dias e teto de custo por execução no nosso código (alguns provedores cobram busca sem resultado).
- **Verificação de e-mail, busca de e-mail e telefone: NO-GO.** Ficam como estão hoje (Apollo e fontes atuais). A 24.12 já usa só o `email_status` do Apollo.
- BYOK não testado; reavaliar só se o custo por conta subir.
