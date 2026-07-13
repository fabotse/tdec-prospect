# TDec Prospect — Custos de Plataformas (V1)

> **Preços re-verificados em 09/06/2026** nas páginas oficiais de cada fornecedor.
> **Sincronizado em 15/06/2026** com a fonte de verdade [`docs/custos-operacao.md`](../custos-operacao.md).
> **Câmbio premissa:** R$ 5,50 / US$ (editável — ajuste conforme o dia). Z-API já é em R$.
> **Base de cálculo:** operação de **~1.000 leads/mês**. Todos os valores são **mensais**.
>
> **Correções desta versão vs. a anterior (02/06):** (1) telefone **não** sai do Apollo a "8 créditos" — isso não se confirma na fonte oficial; telefone é via **SignalHire**. (2) SignalHire **Phones Unlimited = US$ 99 flat (ilimitado)**, não US$ 69/435 créditos. (3) **OpenAI = por nossa conta** (decisão 2026-06-15, uso baixo).
>
> **Papéis:** **"Nós"** = fornecedor (quem desenvolve/opera); **"TDec"** = cliente. **Nós** arcamos com **infraestrutura + IA** (embutido na mensalidade); a **TDec** arca com as **ferramentas de dados** (direto, no "traga sua chave", ou via nós, no "gerenciado").

---

## 1. Resumo — três cenários (ancorados em volume real)

| Cenário | US$/mês | R$/mês | O que inclui |
|---|---:|---:|---|
| 🟢 **Enxuta** — 1.000 leads, **só e-mail** | **~178** | **~1.000** | Infra (Vercel+Supabase+Z-API) + Apollo Basic + Instantly Growth + Apify + IA. SignalHire e theirStack **fora**. |
| 🟡 **Completa** — 1.000 leads, **e-mail + telefone** | **~277** | **~1.540** | Tudo da Enxuta + **SignalHire Phones Unlimited** (telefones ilimitados). |
| 🔴 **Escala** — 5.000 leads, completa | **~780–980** | **~4.300–5.400** | Apollo Professional/Organization + Instantly Hypergrowth + Apify maior + SignalHire (flat). |

> **Quebra por quem paga:** destes totais, **infra + IA (por nossa conta)** ≈ US$ 66 (~R$ 363) na base de 1.000 leads; o restante são as **ferramentas de dados (pagas pela TDec)** — Enxuta **~R$ 620** · Completa **~R$ 1.160** · Escala **~R$ 3.700–4.800**.

### O modelo de custo — três tipos, separados e transparentes

1. **Infraestrutura (FIXO — por nossa conta):** Supabase + Vercel + Z-API. A base que mantém a plataforma no ar. Piso ≈ **R$ 347/mês** (com WhatsApp) ou ≈ R$ 247 (sem).
2. **IA por uso (CENTAVOS — por nossa conta):** OpenAI. Paga-se por texto gerado — frações de centavo por e-mail. **10 mil e-mails ≈ US$ 3.** Decisão 2026-06-15: nós arcamos por ora (uso baixo); revisar se o volume crescer.
3. **APIs "traga sua chave" (pela TDec):** Apollo, SignalHire, Apify, theirStack, Instantly. A TDec conecta a própria conta; o custo acompanha o uso.

> **Onde está o maior custo:** (1) **export/seats do Apollo** (créditos zeram no mês) e (2) **plano de disparo** (Instantly). **Telefone virou add-on FLAT** (SignalHire ilimitado a US$ 99 — não escala por lead). **Scraping (Apify) e IA (OpenAI) custam centavos.**

---

## 2. Detalhe por plataforma

| Plataforma | Categoria | Para que serve | Plano (mín → prod) | US$ mín | US$ prod | Como cobra / o que medir | Quem paga | Obrigatória? |
|---|---|---|---|---:|---:|---|---|---|
| **Supabase** | Infra | Auth + banco multi-tenant + Edge Functions + cron | Pro | 25 | 25 | Assinatura mensal + uso (DB, egress, usuários ativos, invocações) | **Nós** | ✅ Sim |
| **Vercel** | Infra | Hospedagem do app Next.js | Pro (1→2 assentos) | 20 | 40 | US$ 20/assento/mês + uso. Hobby não permite uso comercial | **Nós** | ✅ Sim |
| **Z-API** | Infra | WhatsApp para leads quentes | Ultimate | 18 | 18 | **Mensal por instância** (R$ 99,99 ≈ US$ 18). Mensagens ilimitadas, sem custo por msg | **Nós** | ✅ p/ WhatsApp |
| **OpenAI** | IA | Toda a IA (e-mails, icebreakers, busca, voz) | Uso (pré-pago) | 3 | 50 | Por token. ~US$ 0,0003/e-mail (gpt-4o-mini); Whisper US$ 0,006/min | **Nós** | ✅ p/ IA |
| **Apollo.io** | Dados | Busca de leads + revelar e-mail | Basic → Professional | 59 | 99 | Por **export credit**. E-mail via API = 1 crédito (**não** é ilimitado na API). Overage US$ 0,20/créd. Sem rollover | TDec | ⬜ Não |
| **SignalHire** | Dados | Busca de **telefone** (callback assíncrono) | **Phones Unlimited** | 0 | 99 | **US$ 99 flat = telefones ILIMITADOS.** 1 crédito = 1 reveal, só cobra se achar. Add-on que **não** escala por lead | TDec | ⬜ Não |
| **theirStack** | Dados | Busca de empresas por tecnologia | Free → Tier 1 | 0 | 59 | **3 créditos por empresa.** Tier 1 = 1.500 créd ≈ 500 empresas/mês. Créditos valem 12 meses | TDec | ⬜ Não |
| **Apify** | Dados | Scraping de posts do LinkedIn | Free → pay-as-you-go | 0 | 6 | Actor **~US$ 0,002 / post** (~US$ 0,006/lead, 3 posts). Free cobre ~2.500 posts | TDec | ⬜ Não |
| **Instantly** | Disparo | Envio de cold e-mail + analytics | Growth → Hypergrowth | 47 | 97 | Assinatura por volume. Growth = 1.000 contatos. API em todos; **webhooks só Hypergrowth+** | TDec | ⬜ Não |
| **Snov.io** | Disparo | Export alternativo (**adiado**) | Starter | 0 | 0 | Créditos + recipients. Fluxo adiado por decisão de produto | TDec | ⬜ Não (adiado) |
| **Anthropic (Claude)** | IA | 2º provedor de IA (**planejado**) | — | 0 | 0 | Por token (futuro). Código ainda lança "não implementado" | — | ⬜ Não (planejado) |
| | | | **TOTAL** | **~178** | **~277** (Completa) | (mín = Enxuta só e-mail; prod = Completa c/ telefone) | | |

---

## 3. Custo por unidade (IA e dados)

| Item | Serviço / modelo | Custo aprox. | Notas |
|---|---|---:|---|
| 1 e-mail personalizado (~800 in + 300 out) | OpenAI gpt-4o-mini | US$ 0,0003 | ~3.300 e-mails por US$ 1 |
| 1 icebreaker (~1.500 in + 150 out) | OpenAI gpt-4o-mini | US$ 0,0003 | ~3.170 por US$ 1 |
| 10.000 e-mails | OpenAI gpt-4o-mini | US$ 3,00 | Em gpt-4o seria ~US$ 50 |
| 10.000 icebreakers | OpenAI gpt-4o-mini | US$ 3,15 | |
| Transcrição de voz | OpenAI whisper-1 | US$ 0,006/min | Equivalente atual: gpt-4o-mini-transcribe ~US$ 0,003/min |
| Posts do LinkedIn por lead | Apify | US$ 0,006/lead | ~US$ 0,002/post; ~3 posts/lead |
| 1 empresa (technographic) | theirStack | 3 créditos | Tier 1: 1.500 créd ≈ 500 empresas |
| Revelar 1 e-mail | Apollo.io | 1 export credit | Via API consome export (overage US$ 0,20) |
| **Revelar 1 telefone** | **SignalHire** | **~US$ 0 (dentro do plano)** | Plano Phones Unlimited US$ 99/mês = **telefones ilimitados**; custo marginal ≈ zero. **Não use Apollo para telefone** (bucket de mobile pequeno) |

---

## 4. Observações importantes para a negociação

- **OpenAI — RESOLVIDO (2026-06-15):** nós pagamos por ora (uso baixo, custo em centavos). O código suporta chave própria da TDec (banco) ou chave única nossa (env). Revisar quem paga **se o volume de IA crescer**.
- **"Traga sua chave":** quase todas as APIs pagas usam chave própria da TDec (criptografada). Na prática a **TDec** arca com **Apollo / SignalHire / Apify / theirStack / Instantly**; **nós** arcamos com **infraestrutura (Supabase + Vercel + Z-API) e IA (OpenAI)**.
- **Telefone = SignalHire, não Apollo.** SignalHire Phones Unlimited = US$ 99/mês cobre 1.000 ou 10.000 telefones igual (flat). A regra "8 créditos por telefone" do Apollo **não** se confirma na página oficial — o telefone do Apollo sai de um bucket de "mobile credits" separado e pequeno (Basic 75 · Pro 100 · Org 200/mês).
- **Apollo — e-mail via API NÃO é ilimitado.** O "ilimitado (fair use)" vale só na **interface web**; **via API** (como o app usa) cada e-mail revelado consome **1 export credit**. Basic ≈ 1.000/mês. **A confirmar no painel:** se o Basic libera enrichment/search via API em volume (a doc diz que "acesso avançado depende do plano").
- **Um disparador só** (Instantly *ou* Snov.io — Snov adiado). **Não pague os dois.**
- **theirStack — opcional.** Entra só se a prospecção for por tecnologia/vagas. Tiers: 1.500 = US$ 59 · 5.000 = US$ 100 · 10.000 = US$ 169.
- **A escala é dominada pelo Apollo** (export credits zeram no mês + mínimo de 3 usuários no Organization). Telefone segue **flat US$ 99** mesmo a 5.000 leads.
- **Modelos OpenAI:** `gpt-4o-mini`/`gpt-4o` ainda funcionam via API mas saíram da página de preços. Equivalentes atuais mantêm o custo em centavos. Migrar é trivial.

> **Fontes:** signalhire.com/pricing · theirstack.com/pricing · instantly.ai/pricing · apify.com/supreme_coder/linkedin-post · apollo.io/pricing · supabase.com/pricing · vercel.com/pricing · developers.openai.com/api/docs/pricing · z-api.io — re-verificadas em 09/06/2026. Detalhamento completo em [`docs/custos-operacao.md`](../custos-operacao.md).
