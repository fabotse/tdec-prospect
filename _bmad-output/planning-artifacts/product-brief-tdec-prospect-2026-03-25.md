---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - product-brief-tdec-prospect-2026-01-29.md
  - product-brief-tdec-prospect-2026-02-27.md
  - product-brief-tdec-prospect-2026-03-24.md
  - research/technical-lead-enrichment-icebreakers-research-2026-02-03.md
  - research/technical-instantly-snovio-api-integration-research-2026-02-06.md
  - research/instantly-campaign-tracking-api-research-2026-02-09.md
date: 2026-03-25
author: Fabossi
---

# Product Brief: tdec-prospect

## Executive Summary

O **Agente TDEC** e uma feature transformadora do tdec-prospect que introduz um agente inteligente capaz de orquestrar automaticamente todo o pipeline de prospeccao outbound — da descoberta de leads ate o monitoramento de campanhas ativas. A partir de uma conversa natural (texto ou voz), o usuario brifa o agente sobre o que deseja prospectar e o sistema executa cada etapa do fluxo: busca de empresas por tecnologia (theirStack), descoberta de leads (Apollo), criacao de campanha com conteudo gerado por IA, export e ativacao no Instantly, e acompanhamento automatico de resultados.

A feature resolve o gap critico entre "ter as ferramentas" e "usar as ferramentas com consistencia". Hoje o TDEC Prospect possui todas as pecas do pipeline construidas e testadas ao longo de 15 epics — mas o usuario ainda precisa operar cada etapa manualmente, o que consome tempo, exige conhecimento do fluxo completo e reduz a frequencia de uso. O Agente TDEC elimina esse atrito: transforma horas de trabalho operacional em uma conversa de minutos.

O diferencial e unico no mercado: nenhuma plataforma concorrente — Clay, Instantly AI, 11x.ai, AiSDR — oferece orquestracao end-to-end com o nivel de contextualizacao que o TDEC ja possui (Knowledge Base com perfil da empresa, ICP, tom de voz, produtos, icebreakers premium baseados em posts reais do LinkedIn). O Agente TDEC nao e um chatbot generico — e um agente que conhece profundamente o negocio do cliente e toma decisoes inteligentes em cada etapa.

A implementacao segue estrategia progressiva: Fase 1 entrega o pipeline completo com dois modos de operacao (Guiado com approval gates e Autopilot), ja arquitetada para evoluir na Fase 2 para um agente semi-autonomo com capacidade de decisao dinamica.

---

## Core Vision

### Problem Statement

Equipes comerciais que utilizam o TDEC Prospect possuem acesso a um pipeline de prospeccao completo e poderoso — busca de empresas por tecnologia, descoberta de leads, enriquecimento, criacao de campanhas com IA, export para plataformas de envio e monitoramento de resultados. Porem, cada etapa ainda exige execucao manual: o usuario precisa navegar entre telas, tomar decisoes intermediarias, configurar parametros e acionar cada servico individualmente. O pipeline existe, mas o operador e humano.

### Problem Impact

- O processo completo de prospeccao (da pesquisa ate campanha ativa) consome horas de trabalho operacional que poderiam ser eliminadas
- A frequencia de criacao de campanhas e menor do que poderia ser, porque o esforco por campanha e alto
- Usuarios menos experientes subutilizam a plataforma por nao conhecerem o fluxo ideal entre as funcionalidades
- Oportunidades de prospeccao sao perdidas por falta de agilidade — o momento certo de abordar passa enquanto o usuario monta a campanha manualmente
- A consistencia da qualidade varia: um operador experiente monta campanhas melhores que um iniciante, mesmo tendo as mesmas ferramentas

### Why Existing Solutions Fall Short

| Solucao | Limitacao |
|---------|-----------|
| **Clay** | Foco em enrichment e workflows de dados, nao orquestra criacao de campanha nem export para plataformas de envio |
| **Instantly AI Agent** | Opera apenas dentro do Instantly — nao busca leads, nao integra com bases technograficas, nao tem knowledge base contextualizada |
| **11x.ai / AiSDR** | SDRs virtuais que geram emails, mas sem integracao com pipeline de prospeccao completo nem contextualizacao profunda do negocio |
| **Fluxo manual no TDEC** | Todas as pecas existem, mas o usuario precisa operar cada uma — e orquestrador e humano |

Nenhuma solucao existente combina: busca technografica + descoberta de leads + criacao de campanha contextualizada por IA + export automatico + monitoramento — tudo orquestrado por um agente que conhece o negocio do usuario.

### Proposed Solution

Um agente conversacional integrado ao TDEC Prospect que orquestra todo o pipeline de prospeccao:

1. **Briefing Conversacional** — O usuario descreve o que deseja prospectar via texto ou voz. O agente interpreta, identifica as etapas necessarias e monta o plano de execucao.

2. **Pipeline Flexivel** — O agente adapta o fluxo ao contexto:
   - Se o usuario quer buscar por tecnologia: aciona theirStack -> Apollo -> campanha
   - Se ja tem leads importados: pula direto pra criacao de campanha
   - Se quer so enriquecer e criar campanha: comeca do ponto certo
   - O usuario define o escopo, o agente executa

3. **Dois Modos de Operacao:**
   - **Guiado:** approval gates em cada etapa critica (apos busca de leads, apos criacao de campanha, antes de ativar no Instantly)
   - **Autopilot:** execucao completa apos o briefing, com campanha pronta para ativacao (ou ativacao automatica)

4. **Criacao Inteligente** — Campanha gerada com base na Knowledge Base (perfil da empresa, ICP, tom de voz, produtos), icebreakers personalizados, e estrutura otimizada pela IA

5. **Monitoramento Automatico** — Apos ativacao, o agente acompanha resultados (aberturas, respostas, leads quentes) e reporta ao usuario, integrando com o monitoramento LinkedIn e Janela de Oportunidade ja existentes

### Key Differentiators

| Diferencial | Por que importa |
|-------------|-----------------|
| **Pipeline end-to-end orquestrado** | De "quero prospectar X" ate "campanha ativa com monitoramento" — nenhum concorrente faz isso |
| **Contextualizacao profunda** | Knowledge Base com perfil, ICP, tom, produtos e icebreakers reais — nao e geracao generica |
| **Pipeline flexivel** | Usuario escolhe onde comecar e o agente adapta — nao e um fluxo rigido |
| **Dois modos de operacao** | Guiado para quem quer controle, Autopilot para quem quer velocidade |
| **Infraestrutura ja existente** | 15 epics de servicos testados — o agente orquestra, nao reinventa |
| **Arquitetura escalavel** | Fase 1 ja desenhada para evoluir para agente semi-autonomo (Fase 2) com decisoes dinamicas |

---

## Target Users

### Primary Users

**Persona: Marco — Diretor Comercial / Operador Unico**

Marco e o mesmo perfil do produto principal: lidera a prospeccao, opera diretamente a plataforma e toma decisoes estrategicas. No contexto do Agente TDEC, Marco deixa de ser o operador manual de cada etapa e passa a ser o **estrategista que brifa o agente**.

**Contexto no Agente TDEC:**
- Define a estrategia de prospeccao semanalmente: qual perfil de lead, qual tecnologia, qual produto oferecer
- Interage com o agente via conversa natural, podendo debater ideias antes de executar ("sera que faz sentido focar em fintechs ou expandir pra healthtech tambem?")
- Frequencia de uso: semanal — monta 1-3 campanhas por semana via agente
- Escolhe o modo de operacao conforme o contexto: Guiado quando quer revisar, Autopilot quando confia no setup

**Frustracoes que a Feature Resolve:**
- Hoje precisa navegar por multiplas telas e operar cada etapa manualmente
- O tempo entre "ter a ideia" e "campanha no ar" e de horas — deveria ser minutos
- Quando delega pra um SDR menos experiente, a qualidade das campanhas cai
- Perde agilidade: enquanto monta a campanha manualmente, o timing ideal de abordagem pode passar

**O que Sucesso Significa para Marco:**
- Abrir o TDEC Prospect, conversar com o agente por 5 minutos descrevendo o que quer
- Ver o agente montando tudo: buscando empresas, encontrando leads, criando a campanha
- Revisar a campanha pronta (ou confiar no Autopilot) e dar o play
- Na semana seguinte, receber o relatorio de resultados automaticamente

---

**Persona: SDR Operacional**

Mesmo perfil de uso que Marco. Com o Agente TDEC, o SDR ganha autonomia que antes nao tinha — nao precisa mais conhecer o fluxo completo entre theirStack, Apollo, Campaign Builder e Instantly. O agente guia o processo.

**Mudanca com o Agente TDEC:**
- Antes: precisava conhecer cada tela e cada integracao para operar
- Agora: descreve o que quer prospectar e o agente executa
- **Democratizacao do acesso:** SDRs menos experientes conseguem criar campanhas com a mesma qualidade de um operador senior

A plataforma oferece a mesma experiencia para ambos os perfis — sem distincao de interface ou funcionalidades por cargo.

### Secondary Users

N/A — Login unico, sem distincao de perfis. O Agente TDEC serve os mesmos usuarios que ja operam o TDEC Prospect.

### User Journey

**1. Briefing Semanal**
- Marco abre o TDEC Prospect no inicio da semana
- Acessa o Agente TDEC e inicia uma conversa
- Descreve o que quer: "Quero prospectar CTOs de fintechs em Sao Paulo que usam Netskope"
- Pode debater com a IA: "Sera que vale expandir pra empresas de 100-500 funcionarios?" — o agente responde com dados e sugestoes

**2. Plano de Execucao**
- O agente interpreta o briefing e apresenta o plano: "Vou buscar empresas via theirStack, encontrar contatos via Apollo, criar campanha com o produto X e tom Y"
- Se modo Guiado: Marco aprova o plano
- Se modo Autopilot: execucao automatica

**3. Execucao do Pipeline**
- O agente executa cada etapa com feedback visual em tempo real
- Marco ve o progresso: empresas encontradas -> leads selecionados -> campanha criada -> export para Instantly
- Em modo Guiado: para nos checkpoints para aprovacao
- Em modo Autopilot: executa tudo e apresenta resultado final

**4. Revisao e Ativacao**
- Campanha pronta para revisao: Marco pode ajustar textos, remover leads, alterar sequencia
- Da o play para ativar no Instantly (ou o Autopilot ja ativou)

**5. Monitoramento Automatico**
- Agente acompanha resultados: aberturas, respostas, leads quentes
- Integra com monitoramento LinkedIn e Janela de Oportunidade existentes
- Na proxima sessao semanal, Marco ja tem o relatorio de performance

**6. Momento "Valeu a Pena"**
- Marco conversou 5 minutos com o agente, foi tomar cafe, e quando voltou a campanha estava no ar com leads qualificados, emails personalizados e icebreakers baseados em posts reais do LinkedIn. Na semana seguinte, ja tem respostas chegando.

---

## Success Metrics

### Metricas de Sucesso do Usuario

**Resultado Principal:** Marco consegue criar e lancar campanhas de prospeccao completas — da pesquisa de leads ate campanha ativa no Instantly — em minutos, via conversa com o Agente TDEC, com qualidade igual ou superior ao processo manual.

**Indicadores de Valor:**
- **Campanhas criadas com eficacia:** Volume de campanhas lancadas via agente com conteudo personalizado e leads qualificados
- **Taxa de resposta:** Campanhas criadas pelo agente geram respostas iguais ou superiores ao baseline de campanhas manuais
- **Tempo economizado:** Reducao drastica do tempo entre "ter a ideia" e "campanha no ar" — de horas para minutos
- **Democratizacao:** SDRs menos experientes conseguem criar campanhas com qualidade equivalente a de um operador senior

**Momento "Valeu a Pena":**
Marco brifa o agente em 5 minutos, toma cafe, e quando volta a campanha esta no ar. Na semana seguinte, respostas de leads qualificados ja estao chegando. Ele repete isso toda semana com produtos e perfis diferentes.

**Comportamentos de Adocao:**
- Uso semanal consistente do Agente TDEC
- Migracao gradual do modo Guiado para Autopilot (indicador de confianca)
- Reducao do uso manual das telas individuais de busca/campanha

### Business Objectives

**Curto Prazo (1-2 meses):**
- Agente TDEC funcional com pipeline completo (busca -> campanha -> export -> monitoramento)
- Marco rodando 1 campanha por semana via agente, com produto e perfil de lead diferente a cada semana
- Primeiras campanhas gerando respostas concretas
- Custo por execucao do agente dentro de limites aceitaveis

**Medio Prazo (3-6 meses):**
- Agente TDEC consolidado como forma principal de criar campanhas
- Tendencia crescente de uso do modo Autopilot vs Guiado
- Taxa de resposta das campanhas do agente superior ao baseline manual
- Validacao do modelo para apresentar a clientes potenciais

### Key Performance Indicators

| KPI | Como Medir | Meta |
|-----|------------|------|
| **Campanhas via agente/semana** | Campanhas criadas pelo Agente TDEC por semana | 1/semana = adocao saudavel |
| **Taxa de resposta** | % de leads que respondem em campanhas do agente vs manuais | Igual ou superior ao baseline manual |
| **Tempo de criacao** | Tempo medio entre inicio do briefing e campanha ativa | < 15 minutos (vs horas no manual) |
| **Taxa de conclusao do pipeline** | % de execucoes do agente que completam todo o fluxo sem erro | 90%+ |
| **Proporcao Guiado vs Autopilot** | % de execucoes em cada modo ao longo do tempo | Tendencia crescente de Autopilot = confianca |
| **Custo por execucao** | Custo total de APIs por execucao do agente (theirStack + Apollo + OpenAI + Instantly) | Rastrear e otimizar — meta a ser definida apos baseline |
| **Leads qualificados/execucao** | Leads gerados por execucao do agente que entram no pipeline | Tendencia crescente |

**Nota:** O baseline de taxa de resposta e custo por execucao sera estabelecido nas primeiras 4 semanas de operacao. A meta de custo depende do volume de leads e APIs acionadas por execucao.

---

## MVP Scope

### Core Features

**1. Interface de Briefing Conversacional**
- Area dedicada no app para interacao com o Agente TDEC
- Input por texto (chat) ou voz (reutilizando Whisper/transcricao ja existente na busca de leads)
- O agente interpreta o briefing, identifica as etapas necessarias e apresenta o plano de execucao
- Possibilidade de debater com a IA antes de executar ("sera que faz sentido focar em fintechs?")

**2. Pipeline Flexivel de Prospeccao**
- O agente adapta o fluxo com base no briefing do usuario:
  - **Fluxo completo:** theirStack (busca technografica) -> Apollo (contatos) -> campanha -> export -> ativacao
  - **Fluxo sem technografica:** Apollo (busca de leads) -> campanha -> export -> ativacao
  - **Fluxo a partir de leads existentes:** leads importados/salvos -> campanha -> export -> ativacao
- O usuario define o ponto de entrada, o agente executa o restante

**3. Dois Modos de Operacao**
- **Guiado:** approval gates em cada etapa critica:
  - Apos busca de leads: "Encontrei X leads, aqui esta a amostra — aprova?"
  - Apos criacao de campanha: "Campanha criada com N steps — revisa antes de exportar?"
  - Antes de ativar no Instantly: "Tudo pronto — quer dar o play?"
- **Autopilot:** execucao completa apos briefing, campanha pronta e ativada automaticamente

**4. Cadastro de Produto Inline**
- Se o usuario menciona um produto que nao esta cadastrado, o agente guia o cadastro durante o briefing
- Coleta nome, descricao, features, diferenciais e publico-alvo via conversa
- Produto fica disponivel na Knowledge Base para futuras campanhas

**5. Criacao Inteligente de Campanha**
- Campanha gerada com base completa: Knowledge Base (perfil empresa, ICP, tom de voz) + produto selecionado
- Icebreakers personalizados (premium quando disponivel — posts LinkedIn via Apify)
- Estrutura otimizada pela IA (quantidade de emails, intervalos, objetivo)
- Export e ativacao automatica no Instantly com sending accounts configuradas

**6. Feedback Visual em Tempo Real**
- Interface mostrando progresso de cada etapa do pipeline durante execucao
- Indicadores visuais de fase: pesquisa -> selecao -> campanha -> export -> ativo

**7. Orquestrador como Interface Abstrata (Escalabilidade Fase 2)**
- Steps do pipeline chamam metodos de um `ProspectingAgentService`, nao os servicos diretamente
- Briefing parseado em formato estruturado consumivel por pipeline deterministico (Fase 1) ou agente AI (Fase 2)
- Approval gates como middleware configuravel — na Fase 2, usuario escolhe quais manter
- Execution log completo desde o dia 1: input/output/decisao de cada etapa

### Stretch Goals (Fase 1 — apos Core)

**8. Monitoramento Proativo via WhatsApp**
- Agente monitora analytics das campanhas lancadas (aberturas, respostas, leads quentes)
- Quando detecta lead quente (ex: abriu email 3x no step Y), notifica Marco via WhatsApp no numero configurado
- Sugestao de acao: "Lead X demonstrou interesse — quer que eu inicie conversa no WhatsApp?"
- Se Marco aprova, agente envia mensagem contextualizada automaticamente

**9. Relatorio Automatico Semanal**
- Agente gera e envia relatorio semanal de performance das campanhas ativas
- Metricas: aberturas, respostas, leads quentes, campanhas ativas, custo acumulado
- Entrega via WhatsApp ou dentro do app (area de notificacoes do agente)

**10. Integracao com Insights do LinkedIn**
- Agente detecta insights relevantes do monitoramento LinkedIn (Epic 13) e sugere acoes
- Exemplo: "Lead Y postou sobre [tema relevante] — quer que eu crie uma campanha segmentada?"
- Conecta sinais de LinkedIn com pipeline de prospeccao automatizado

**11. Multi-Campanha por Sessao**
- Usuario pode criar mais de uma campanha no mesmo briefing
- Exemplo: "Quero uma campanha pra CTOs de fintech e outra pra CISOs de healthtech"
- Agente executa pipelines em sequencia ou paralelo

### Out of Scope for MVP

| Funcionalidade | Motivo | Quando |
|----------------|--------|--------|
| **Decisoes dinamicas do agente** | Requer loop de raciocinio com tool calling — complexidade de Fase 2 | Fase 2 |
| **Agente reativo a respostas de leads** | Interpretar respostas e ajustar campanha automaticamente — requer NLU avancado | Fase 2 |
| **Vercel AI SDK / Agent framework** | Pipeline deterministico da Fase 1 nao precisa — avaliar na Fase 2 | Fase 2 |
| **Dashboard de execucoes do agente** | Historico de todas as execucoes com replay — nice-to-have | Fase 2 |
| **Multi-tenant / permissoes por agente** | Foco inicial e operador unico | Fase 2+ |
| **Integracao com Snov.io** | Plataforma de export deferred desde Epic 7 — foco no Instantly | Revisitar se demanda |

### MVP Success Criteria

O MVP sera considerado bem-sucedido quando:

1. **Pipeline funcional:** Usuario consegue ir de briefing ate campanha ativa no Instantly sem sair do Agente TDEC
2. **Ambos os modos:** Guiado e Autopilot funcionando corretamente
3. **Qualidade:** Campanhas criadas pelo agente geram taxa de resposta igual ou superior ao processo manual
4. **Frequencia:** Marco usando o agente pelo menos 1x/semana para criar campanhas
5. **Estabilidade:** Taxa de conclusao do pipeline >= 90% (execucoes sem erro)
6. **Custo controlado:** Custo por execucao rastreado e dentro de limites aceitaveis

**Gate de decisao:** Uso semanal consistente + campanhas gerando respostas + feedback positivo = sinal verde para Stretch Goals e Fase 2.

### Future Vision

**Fase 2 — Agente Semi-Autonomo (3-6 meses apos Fase 1):**
- Decisoes dinamicas: agente decide expandir filtros, ajustar tom, pausar campanha com base em resultados
- Tool calling via OpenAI ou Vercel AI SDK para raciocinio multi-step
- Agente reativo a respostas de leads (interpreta e sugere proxima acao)
- Dashboard completo de execucoes com historico e replay

**Fase 3 — Agente Autonomo com Guardrails (6-12 meses):**
- Execucao totalmente autonoma com guardrails: limites de budget, blacklists, horarios de envio
- Agente proativo: detecta oportunidades e sugere campanhas sem input do usuario
- Convergencia de sinais: technographic + LinkedIn monitoring + analytics = score de intencao de compra
- Multi-tenant com permissoes granulares por agente
