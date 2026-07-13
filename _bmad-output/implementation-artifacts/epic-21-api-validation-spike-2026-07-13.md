# Spike de Validação — API Instantly v2 para o Loop de Resposta (EP21)

**Data:** 2026-07-13
**Tipo:** Spike de validação (padrão obrigatório desde Epic 15)
**Objetivo:** Validar se a API/webhooks do Instantly fornecem o conteúdo das respostas de leads — pré-requisito de todo o Epic 21 ("Pop-up do Lead" / loop de resposta)
**Status:** Concluído (nível documentação oficial) — pendências de chamada real listadas ao final
**Fonte:** developer.instantly.ai (API v2), acessado em 2026-07-13
**Contexto:** `_bmad-output/planning-artifacts/plano-evolucao-maquina-de-resultado-2026-07-10.md` (Fase 1)

---

## Pergunta central do spike

> O Epic 21 depende de classificar a intenção da resposta do lead por IA. **A plataforma consegue obter o corpo da resposta?**

**Resposta: SIM, por dois caminhos — e um deles já está parcialmente implementado.**

---

## Descoberta 1 (CRÍTICA): o webhook `reply_received` entrega o texto completo da resposta

Payload documentado do evento `reply_received` (guia oficial "Webhook Events"):

| Campo | Conteúdo |
|---|---|
| `reply_text` | **Texto completo da resposta (plain text)** |
| `reply_html` | Resposta completa em HTML |
| `reply_subject` | Assunto da resposta |
| `reply_text_snippet` | Preview curto |
| `lead_email` | E-mail do lead |
| `campaign_id` / `campaign_name` | Campanha de origem |
| `unibox_url` | **Link direto para a conversa no Unibox** (só em eventos de reply) |
| `email_id` | ID do e-mail original (threading) |
| `is_first` | Se é a primeira resposta desse tipo do lead |
| `timestamp` | Quando ocorreu |

**Implicação:** a classificação de intenção por IA roda **direto sobre o payload do webhook** — não é necessária nenhuma chamada adicional à API. Existe também o evento `auto_reply_received` (out-of-office) — deve ser tratado separadamente para não gerar falso "lead quente".

## Descoberta 2 (CRÍTICA): nosso webhook JÁ persiste o payload completo

`supabase/functions/instantly-webhook/index.ts` (linha ~243): o INSERT em `campaign_events` grava `payload: body` (JSONB) — **o payload bruto inteiro, incluindo `reply_text`**.

**Implicações:**
1. Se o webhook estiver ativo na conta do cliente, o texto das respostas **já está sendo armazenado hoje** em `campaign_events.payload` — só nunca foi lido.
2. O Epic 21 pode **processar respostas retroativas** (backfill) além das novas.
3. A story do "processador de respostas" pode ser um consumidor de `campaign_events` (trigger/cron/fila), sem tocar no receiver existente — natureza aditiva preservada.

## Descoberta 3: fallback por polling existe — `GET /api/v2/emails`

| Aspecto | Detalhe |
|---|---|
| Filtros relevantes | `email_type=received`, `campaign_id`, `lead`, `is_unread`, `latest_of_thread`, `min/max_timestamp_created`, `i_status` (interest status) |
| Corpo | `body.text` e `body.html` — **conteúdo completo** |
| Distinção enviado/recebido | `email_type` ("received" / "sent" / "manual") e `ue_type` (2 = received) |
| Threading | `thread_id`, `search="thread:ID"` |
| **Rate limit** | **20 requests/minuto** — suficiente para polling de sync, não para tempo real |

**Implicação:** clientes sem webhook configurado ainda podem ter o loop de resposta via polling no sync de analytics já existente (`TrackingService`), com latência maior.

## Descoberta 4: o Instantly tem classificação própria de interesse (sinal gratuito)

- `lt_interest_status` (já mapeado em `src/lib/services/tracking.ts:166`, nunca exibido na UI). Escala documentada: **Interested=1, Meeting Booked=2, Meeting Completed=3, Won=4, Out of Office=0, Not Interested=-1, Wrong Person=-2, Lost=-3, No Show=-4** (ou valor custom).
- Eventos de webhook dedicados: `lead_interested`, `lead_neutral`, `lead_not_interested`.

**Implicação:** a classificação da TDec por IA pode ser **combinada** com o sinal nativo do Instantly (ensemble barato). Exibir `lt_interest_status` na UI é quick win independente do épico.

## Descoberta 5: capacidades extras confirmadas (abrem portas futuras)

- `POST /api/v2/emails/reply` (`reply_to_uuid`) — **responder o lead de dentro da TDec** (candidato a story futura, não entra no MVP do Epic 21).
- API de gestão de webhooks (criar/testar/listar subscriptions) — o **onboarding pode registrar o webhook programaticamente**, sem passo manual no painel do Instantly.
- `unibox_url` no payload — o card da oportunidade pode linkar direto para a conversa.

---

## Pendências para validação com chamada real (fazer na 1ª story do épico ou antes)

| # | Validação | Como |
|---|---|---|
| 1 | Webhook registrado no workspace do cliente + payload real de `reply_received` confere com a doc | Registrar via API de webhooks apontando para a Edge Function; enviar resposta de teste real; inspecionar `campaign_events.payload` |
| 2 | Gating de plano (Growth vs. Hypergrowth) para webhooks e `GET /emails` | Testar com a conta/chave real do cliente (plano Growth $47) |
| 3 | Se `campaign_events` de produção já contém replies com `reply_text` (backfill possível?) | Query no banco do cliente: `SELECT payload FROM campaign_events WHERE event_type='email_replied' LIMIT 5` |
| 4 | Escopos da API key (`emails:read` é exigido em endpoints de email) | Conferir escopo da chave configurada em `api_configs` |

---

## Veredito

**Epic 21 é viável sem incerteza técnica de contrato.** O caminho principal (webhook → `campaign_events.payload.reply_text` → classificação IA → Central de Oportunidades → notificação Z-API) usa dados que a plataforma provavelmente já recebe hoje. Riscos remanescentes são operacionais (webhook configurado? gating de plano?) e estão isolados nas pendências acima.
