# TDec Prospect — Custos de Operação (visão em 3 blocos)

> **Pesquisa de preços:** 09/06/2026, re-verificada nas páginas oficiais (cobrança **mensal**).
> **Câmbio premissa:** R$ 5,50 / US$ (editável — ajuste para a cotação do dia). Z-API já é em R$.
> **Base de cálculo:** operação de **~1.000 leads/mês**. Cada ferramenta com plano mostra **o plano + a quantidade incluída** nele.
> Substitui a versão anterior deste doc (corrige SignalHire, telefone e a base de cálculo — ver "Correções" no fim).

---

## Como ler este documento

O custo se separa em **três blocos** — essa separação sustenta a precificação:

1. **Bloco 1 — Infraestrutura (FIXO):** roda o app independente de volume. **Paga a TDec.**
2. **Bloco 2 — Dados & Disparo (VARIÁVEL):** escala com o volume. "Traga sua chave" — em geral **paga o cliente**.
3. **Bloco 3 — Cenários:** soma dos dois blocos, ancorada em 1.000 leads/mês.

> **Regra de ouro:** o que mais pesa, em ordem — (1) **export/seats do Apollo** (créditos zeram no mês), (2) **plano de disparo** (Instantly). **Telefone virou um add-on FLAT** (SignalHire ilimitado a $99 — não escala por lead). **Scraping (Apify) e IA (OpenAI) custam centavos.**

---

## 🧱 Bloco 1 — Custos FIXOS de infraestrutura

Pago todo mês independente de volume. **Quem paga: TDec.**

| Ferramenta | Função | Plano | Custo/mês | O que o plano inclui |
|---|---|---|---:|---|
| **Vercel** | Hospedagem (Next.js) | Pro | **US$ 20**/assento | 1 TB transferência, 1M edge requests, ~4h+ Active CPU |
| **Supabase** | Banco + Auth + Edge Functions | Pro | **US$ 25** | DB 8 GB, 100 mil MAU, 100 GB storage, 250 GB egress, 2M invocações |
| **Z-API** | WhatsApp (Epic 11) | Ultimate | **R$ 99,99**/instância (~US$ 18) | 1 número WhatsApp, **mensagens ilimitadas** (cobra por número, não por msg) |
| **OpenAI** | IA (busca, e-mail, voz) | Pay-as-you-go | **US$ 0 fixo** | Sem mensalidade — só uso (ver Bloco 2) |

**Piso fixo:** ~US$ 45 (Vercel + Supabase) **+ R$ 99,99** (Z-API) ≈ **R$ 347/mês**. Sem WhatsApp: ~R$ 247/mês.

---

## 📊 Bloco 2 — Dados & Disparo (plano + quantidade)

Cada linha = **o plano que cobre ~1.000 leads/mês** + a quantidade que esse plano libera. **Quem paga: cliente** (chave própria, criptografada).

| Etapa | Ferramenta | Plano (p/ ~1.000) | Custo/mês | O que esse plano libera |
|---|---|---|---:|---|
| Achar empresas *(opcional)* | **TheirStack** | API 1.500 créditos | **US$ 59** | 1.500 créditos API ≈ **500 empresas** (1 vaga=1 créd, 1 empresa=3). **Menos usado — flexível, pode ficar de fora** |
| Achar leads + e-mail | **Apollo.io** | Basic | **US$ 59** | **~1.000 e-mails/mês via API** (consome export credits — **NÃO é ilimitado** na API; "ilimitado" é só na web) |
| Posts LinkedIn (icebreaker) | **Apify** | Free → pay-as-you-go | **~US$ 6** | $0,002/post; 1.000 leads × 3 posts = 3.000 posts. Free cobre ~2.500 posts ($5) |
| **Telefone** | **SignalHire** | **Phones (Unlimited)** | **US$ 99** | **Telefones ILIMITADOS** — cobre 1.000+ reveals. Add-on **flat**, não escala por lead |
| Gerar e-mails + icebreakers | **OpenAI** | Pay-as-you-go | **~US$ 3** | ~3.500 gerações/mês em gpt-4o-mini (~$0,0003 cada). 10.000 e-mails ≈ US$ 3 |
| Disparar e-mails | **Instantly** | Growth | **US$ 47** | **1.000 contatos** + 5.000 envios/mês + contas/warmup ilimitados |

### Notas críticas de cobrança

- **Apollo — telefone NÃO é o caminho de volume.** Telefone sai de um *bucket de "mobile credits" separado e pequeno* (Basic 75 · Pro 100 · Org 200 por mês). Para **1.000 telefones/mês use o SignalHire** ($99 ilimitado), não o Apollo. *(A regra "8 créditos por telefone" que circula em fontes terceiras não se confirma na página oficial do Apollo — por isso não a uso.)*
- **Apollo — e-mail via API NÃO é ilimitado.** O "ilimitado (fair use)" é da **interface web**; **via API** (como o app usa) cada e-mail revelado **consome 1 export credit**. Basic ≈ **1.000 export/mês** (no talo p/ 1.000 leads); Professional ($99) = 2.000 p/ folga. Créditos zeram no mês (sem rollover).
- **⚠️ Apollo — confirmar acesso de API no Basic.** A doc oficial diz que "acesso avançado à API depende do plano" — **não está confirmado que o Basic libera enrichment/search via API em volume** (pode exigir Professional/Organization). Validar em **Settings → API** da conta antes de fechar.
- **SignalHire — telefone é flat.** Phones Unlimited = $99/mês cobrindo 1.000 ou 10.000 telefones igual. 1 crédito = 1 reveal e **só cobra se achar**. (Existe um tier Emails $69 = 1.000 e-mails, e um tier de telefone com limite, mas para volume o Unlimited $99 é a escolha.)
- **Instantly — escolher um disparador.** Growth $47 cobre 1.000 leads. Snov.io é alternativa (adiada por decisão de produto). Não pague os dois.
- **TheirStack — não engessar.** É o menos provável de usar; entra só se a prospecção for por tecnologia/vagas. Tiers (confirmados): 1.500=$59 · 5.000=$100 · 10.000=$169.

---

## 💰 Bloco 3 — Cenários (ancorados em 1.000 leads/mês)

Câmbio R$ 5,50/US$. Z-API ~US$ 18.

### 🟢 Enxuta — 1.000 leads/mês · **só e-mail**
| Item | US$/mês |
|---|---:|
| Infra (Vercel 20 + Supabase 25 + Z-API 18) | 63 |
| Apollo Basic (1.000 export) | 59 |
| Instantly Growth (1.000 contatos) | 47 |
| Apify (3.000 posts) | ~6 |
| OpenAI (e-mails + icebreakers) | ~3 |
| **Total** | **≈ US$ 178 → ~R$ 1.000** |

### 🟡 Completa — 1.000 leads/mês · **e-mail + telefone**
| Item | US$/mês |
|---|---:|
| Tudo da Enxuta | 178 |
| **SignalHire Phones Unlimited** (telefones ilimitados) | 99 |
| **Total** | **≈ US$ 277 → ~R$ 1.540** |

> *(TheirStack, se a prospecção for por tecnologia: +US$ 59 ≈ +R$ 325.)*

### 🔴 Escala — 5.000 leads/mês · completa
| Item | US$/mês |
|---|---:|
| Infra (2 assentos Vercel) | ~83 |
| **Apollo** (Professional/Organization + export extra) | ~450–650 |
| Instantly Hypergrowth (25.000 contatos) | 97 |
| Apify (~15.000 posts) | ~30 |
| OpenAI | ~25 |
| SignalHire Phones Unlimited (**flat**, cobre 5.000 igual) | 99 |
| **Total** | **≈ US$ 780–980 → ~R$ 4.300–5.400** |

> **A escala é dominada pelo Apollo** (export credits zeram no mês + mínimo de 3 usuários no Organization). Telefone segue **flat $99** mesmo a 5.000 leads — é o item que **não** escala.

---

## Pontos para a negociação

1. **Telefone barateia a história:** SignalHire dá telefone **ilimitado por $99/mês flat**. Em volume, o custo por telefone despenca — bom argumento de pacote.
2. **O verdadeiro vetor de escala é o Apollo** (export credits + seats). Dimensione o tier pelo volume real de leads; acima de ~2.000 leads/mês o export vira o item que mais cresce.
3. **"Traga sua chave":** Apollo/SignalHire/Apify/TheirStack/Instantly/Z-API = chave do cliente. **TDec arca com infra** (Vercel + Supabase) e, a decidir, IA.
4. **Quem paga a OpenAI?** O código suporta chave do cliente (banco) ou chave única da TDec (env). É a única ambiguidade de IA — definir antes de apresentar. (Custo é centavos de qualquer forma.)
5. **Um disparador só** (Instantly *ou* Snov.io) e **telefone via SignalHire, não Apollo.**

---

## Correções vs. versão anterior (transparência)

- **SignalHire** estava errado (eu tinha Phones $69/435 créd e Both $139/900). **Correto:** Emails $69 = 1.000 · **Phones/Both Unlimited = $99 ilimitado**.
- **Telefone** deixou de ser "custo unitário caro que escala" → é **add-on flat de $99/mês** (ilimitado via SignalHire).
- **Apollo "8 créditos/telefone"** removido (não confirmado na fonte oficial; telefone é bucket de mobile separado e pequeno → use SignalHire).
- **Apollo e-mail "ilimitado" corrigido:** vale só na **web**; **via API é limitado** (~1.000 e-mails/mês = export credits). Acesso de API no Basic a confirmar no painel.
- **Apify** ajustado para **$2/1.000 posts** (antes $1).
- Modelo agora é **plano + quantidade incluída** numa base de **1.000 leads/mês**, em vez de custo marginal por mil.

### Confiança das fontes
- **ALTA (página oficial / seu print):** SignalHire (Emails $69/1.000, Phones $99 ilimitado), TheirStack (tiers), Instantly (Growth $47/1.000), Apify ($2/1.000 posts), Supabase, Vercel, Z-API.
- **ALTA:** via API, e-mail do Apollo consome **export credits (NÃO é ilimitado)** — o "ilimitado" é só na interface web. (docs.apollo.io/docs/api-pricing + KB oficial)
- **MÉDIA-ALTA (5 fontes; página do Apollo é JS):** preços e cotas (Basic $59/~1.000 export, Pro $99/2.000, Org $149/4.000). **A confirmar no painel da conta Apollo:** cota exata (~1.000/mês vs ~833 se for 10k/ano), overage ($0,20/crédito) e **se o Basic libera a API de enrichment em volume**.

### Fontes
signalhire.com/pricing · theirstack.com/en/pricing · instantly.ai/pricing · apify.com/supreme_coder/linkedin-post · apollo.io/pricing (+ Saleshandy/CloudTalk/Salesmotion/Smarte) · supabase.com/pricing · vercel.com/pricing · developers.openai.com/api/docs/pricing · z-api.io — acessadas em 09/06/2026.
