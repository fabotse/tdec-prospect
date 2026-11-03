# Epic 24 Context: Agente TDec 3.0 — Analista de Contas

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Transformar o agente no caminho para poucos leads de altíssima qualidade. Hoje ele faz o mesmo que o fluxo manual com mais atrito (5,4% de conclusão). Para mudar isso, o agente passa a se comportar como um Analista de Contas: não trava, escreve copy honesta, escolhe contas com nota de fit justificada (inclusive a partir de clientes de referência), pesquisa cada conta e monta um dossiê com fontes, escreve 1-para-1 e prepara a reunião quando o lead responde. O épico é entregue em 3 marcos. Cada marco termina com deploy, smoke real e checkpoint com o Fabossi: Marco 1 (confiável e copy honesta), Marco 2 (analista de contas) e Marco 3 (dossiê e reunião).

## Stories

- Story 24.1: Etapa travada é destravada sozinha
- Story 24.2: Execução protegida contra cobrança dupla
- Story 24.3: Avanço confiável e "Tentar novamente"
- Story 24.4: Conversa sem becos sem saída
- Story 24.5: Confirmação por card com botões
- Story 24.6: E-mails sem dados fictícios e follow-ups com valor
- Story 24.7: Seção de Provas na Knowledge Base
- Story 24.8: Prompts honestos — problema primeiro, provas só da KB
- Story 24.9: Revisor automático de copy
- Story 24.10: Custo real e estimativa honesta
- Story 24.11: Spike do Treg
- Story 24.12: Status do e-mail visível na revisão (sem custo e sem trava)
- Story 24.13: Quantos leads eu quero
- Story 24.14: Briefing a partir do ICP
- Story 24.15: Busca mais precisa
- Story 24.16: Fit Score A/B/C com justificativa
- Story 24.17: Modo lista de contas (ABM)
- Story 24.18: Contas parecidas com os melhores clientes
- Story 24.19: Dossiê da conta
- Story 24.20: Motivo para abordar agora
- Story 24.21: Copy 1-para-1 por lead
- Story 24.22: Dossiê visível na revisão e na oportunidade
- Story 24.23: Preparação de reunião
- Story 24.24: Conversa depois da execução
- Story 24.25: Memória entre execuções

## Requirements & Constraints

- **Regra nº 1 (produção):** as campanhas em andamento, a busca de leads e o caminho de criação, export e ativação no Instantly continuam funcionando sem nenhuma trava, filtro ou bloqueio novo. Tudo que depende de dados novos (dossiê, status de e-mail, score) é informativo ou fail-open até uma liberação explícita. Ex.: o status de e-mail é só um aviso, e `revealPersonalEmails` continua `true`.
- **Pipeline determinístico:** o LLM decide só a conversa e o conteúdo. Nunca decide a ordem dos steps, o gasto de créditos ou o envio. Ações que custam dinheiro pedidas na conversa viram um card com custo estimado e só rodam após clique.
- **Fluxo manual inalterado**, exceto pelas proteções compartilhadas e intencionais: prompts corrigidos, revisor e supressão/dedupe do Epic 23. Os testes existentes do editor manual precisam continuar verdes.
- **Custo:** toda chamada paga (Apollo, TheirStack, Instantly, OpenAI, Apify, Treg) é registrada em `api_usage_logs` com tenant e execução. Nenhum retry cobra duas vezes. Cada execução respeita um teto de custo configurável aplicado no nosso código.
- **Fail-safe:** falha ou timeout de LLM ou de fonte externa degrada para o comportamento anterior e nunca trava a execução. Ex.: o score cai para só regras, o dossiê sai parcial e sinalizado, o e-mail fica "não revisado".
- **Honestidade da copy:** nada de dados fictícios ("Nome", "Empresa", setor "Tecnologia"). Provas, números e cases saem só da lista autorizada da KB. Fatos do dossiê só entram com fonte e nunca são inferidos. A preparação de reunião marca como sugestão tudo que não vier de dossiê, resposta ou KB.
- **LGPD:** fatos guardam a fonte, o opt-out é respeitado e não há prospecção por e-mail pessoal (a mudança no caminho do Instantly fica pendente por causa da regra nº 1).
- Respostas do chat em menos de 5 s.
- **Definition of Done:** inclui smoke real (tela + banco) por marco, não só testes mockados. Nas stories com Treg, testes e verificação ficam sem rede real (tudo mockado) até o Fabossi aplicar a migration e cadastrar a chave.

## Technical Decisions

- **Modelo do agente:** pipeline sequencial de steps com checkpoint em `agent_executions`/`agent_steps`/`agent_messages`. Uma API route por step, orquestração no client, gates via status `awaiting_approval`, Supabase Realtime. Sem orquestrador durável: TTL de step via pg_cron + `after()` do Next + idempotência por output parcial.
- **Reuso obrigatório:** `base-service` para novos serviços (Treg), `promptManager`/`ai_prompts` para prompts, `relevance-classifier` para posts, busca por domínio existente (`q_organization_domains_list`) para ABM, `lead-persistence`/`campaign-persistence`, `knowledge-base-context.ts` para montar o contexto da KB.
- **Modelos de IA** (escrita e revisão) configurados numa fonte única no padrão `parser-config.ts`, compatível com modelos novos.
- **Treg (spike 24.11, decisão de 2026-10-28):** GO só para `web.search`/`web.extract`, com Exa via Treg (filtro de data e Brasil) para notícias e vagas e cache próprio de 30 dias. NO-GO para verify/find de e-mail e telefone, que continuam com o Apollo e as fontes atuais.
- **Chaves de serviços novos:** por tenant, criptografadas (AES-256-GCM) em `api_configs`, lidas pelo agente via `src/lib/agent/service-keys.ts` (service-role). O Treg aparece em Configurações → Integrações (`SERVICE_NAMES`/`SERVICE_LABELS`). Nunca usar variável de ambiente para a chave do Treg.
- **Migrations:** só aditivas e versionadas (próximo número livre em `supabase/migrations/`). Agentes escrevem e nunca aplicam; o código não sobe antes da migration aplicada. Para incluir um serviço novo nos CHECKs de `service_name` (`api_configs`, `api_usage_logs`), seguir o modelo drop + add da constraint (ver `00065`), sem tocar em linhas. Documentar o rollback.
- **Dossiê:** fatos `{fato, fonte_url, data, confiança}` ligados a tenant, domínio da empresa e lead, com RLS por tenant e reuso por cerca de 30 dias.
- **Saída para o Instantly:** texto 1-para-1 em variáveis personalizadas por lead. Leads "sem gatilho" usam o template padrão. Dado ausente vira variável do Instantly (`{{firstName}}`, `{{companyName}}`) ou é omitido.
- Branch por épico, com PR para `main` ao final.

## UX & Interaction Patterns

- Card de resumo do briefing com chips editáveis e botões Confirmar/Ajustar. Produto e leads próprios também confirmam por botão. Texto livre é sempre ajuste, nunca confirmação.
- "Tentar novamente" no card de step com falha, com mensagem coerente com `isRetryable`.
- Revisão de leads: badge A/B/C + justificativa de 1 linha, ordenação por score, pré-seleção dos N pedidos, input numérico de quantidade e aviso discreto de "e-mail não verificado".
- Indicador por e-mail do revisor: aprovado / reescrito / precisa revisão humana / não revisado.
- Painel de dossiê (fatos com fonte e data, gatilho "por que agora", hipótese de dor) na revisão do agente e no card da oportunidade. Sem dossiê, mostra "sem pesquisa" com ação de gerar.

## Cross-Story Dependencies

- O Epic 23 (supressão, dedupe/"já contatado", CI) vem antes: as stories 24.15, 24.17, 24.18 e 24.25 usam essa base.
- O Marco 1 dá a base dos demais: 24.2 é pré-requisito do retry da 24.3, 24.5 do card da 24.14, 24.7 das provas usadas em 24.8/24.9/24.21/24.23, 24.6 dos ângulos de follow-up da 24.21, e 24.9 do revisor reaplicado em 24.21/24.24.
- O Marco 2 se encadeia assim: 24.13 (N) leva à 24.16 (universo de 3–5× N com score), que é reaproveitada pela 24.18. A 24.11 já decidiu o provedor da 24.19.
- O Marco 3 segue a cadeia 24.19 (dossiê) → 24.20 (gatilho) → 24.21 (copy por lead) → 24.22 (visualização). A 24.23 usa o dossiê e a Central de oportunidades do Epic 21. A 24.25 usa os dados do loop de resposta do Epic 21.
- O Epic 25 depende do serviço Treg e da base de clientes criados aqui e no Epic 23.
