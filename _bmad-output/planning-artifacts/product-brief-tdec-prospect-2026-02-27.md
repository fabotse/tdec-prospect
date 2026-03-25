---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - architecture.md
  - technical-lead-enrichment-icebreakers-research-2026-02-03.md
  - product-brief-tdec-prospect-2026-01-29.md
date: 2026-02-27
author: Fabossi
---

# Product Brief: Monitoramento Inteligente de Leads no LinkedIn

## Executive Summary

O **Monitoramento Inteligente de Leads** é uma feature aditiva ao tdec-prospect que transforma a prospecção de reativa para proativa. O sistema permite que o usuário selecione leads estratégicos (ICP) para monitoramento contínuo no LinkedIn, verificando semanalmente se houve publicações novas. Quando um post relevante é detectado — ou seja, conectado aos produtos/serviços que o usuário oferece — o sistema gera automaticamente uma sugestão de abordagem personalizada, criando uma janela de oportunidade com timing perfeito para contato.

A feature resolve um gap crítico na prospecção outbound: a personalização genuína depende de contexto atual, mas nenhum SDR tem tempo de monitorar manualmente dezenas de perfis no LinkedIn. O resultado é oportunidades perdidas e abordagens genéricas. Com o monitoramento inteligente, o sistema faz o trabalho de vigilância e entrega insights acionáveis prontos para uso.

---

## Core Vision

### Problem Statement

Profissionais de vendas que fazem prospecção outbound dependem de personalização genuína para se destacar na caixa de entrada dos leads. Posts recentes no LinkedIn são uma das melhores fontes de contexto para abordagem — mas monitorar manualmente 50-100 leads estratégicos é inviável no dia a dia de quem precisa bater meta.

### Problem Impact

- Oportunidades de abordagem contextual são perdidas por falta de visibilidade sobre a atividade dos leads
- Concorrentes que detectam o momento certo chegam primeiro
- SDRs gastam tempo scrollando LinkedIn de forma esporádica e não sistemática em vez de focarem em atividades de maior impacto
- Campanhas perdem potencial de conversão por falta de timing e contexto atual

### Why Existing Solutions Fall Short

A maioria dos profissionais de vendas simplesmente scrolla o LinkedIn manualmente — quando lembra. Não existe, no mercado acessível, uma solução que combine monitoramento de posts + filtro de relevância por produto/serviço + geração automática de sugestão de abordagem. Ferramentas como Clay oferecem signals, mas a custos elevados ($149+/mês) e sem a contextualização profunda com a knowledge base do usuário.

### Proposed Solution

Uma feature integrada ao tdec-prospect que:

1. **Marca leads para monitoramento** — O usuário seleciona leads ICP estratégicos (50-100) para vigiar
2. **Job semanal automatizado** — Supabase Edge Function + Cron verifica posts novos via Apify (mesma API já utilizada)
3. **Filtro de relevância por IA** — OpenAI analisa se o post conecta com os produtos/serviços da Knowledge Base do usuário
4. **Sugestão de abordagem automática** — Prompt especializado gera insight contextual cruzando post + produto/serviço
5. **Área dedicada no app** — Página de insights com post, link original, sugestão de abordagem e data

### Key Differentiators

| Diferencial | Por que importa |
|-------------|-----------------|
| **Relevância por produto** | Não é "post novo" genérico — é post que conecta com o que você vende |
| **Sugestão pronta** | Não é só alerta — já entrega como abordar |
| **Custo acessível** | ~$0.005/lead/semana usando infraestrutura existente (Apify + OpenAI) |
| **Zero esforço do usuário** | Marca o lead uma vez, sistema trabalha sozinho |
| **Knowledge Base contextual** | Usa o conhecimento profundo do negócio que já está configurado |

---

## Target Users

### Primary Users

**Persona: Marco — Diretor Comercial / Operador Único**

Marco é o mesmo perfil do produto principal: lidera a prospecção, opera diretamente a plataforma e toma decisões estratégicas sobre quais leads priorizar. Não há distinção de perfis — login único com acesso total.

**Contexto no Monitoramento:**
- É quem conhece profundamente o ICP e sabe quais leads valem ser monitorados
- Quer ser avisado quando há uma oportunidade de abordagem com timing perfeito
- Não tem tempo de scrollar LinkedIn procurando posts de 50-100 leads
- Precisa de munição pronta — não só informação, mas sugestão de como agir

**Frustrações que a Feature Resolve:**
- Perde oportunidades porque não vê posts relevantes dos leads a tempo
- Quando descobre um post interessante, já passou o momento ideal
- Abordagens frias sem contexto atual têm taxa de resposta baixa
- Monitorar manualmente é incompatível com a rotina de quem precisa bater meta

**O que Sucesso Significa para Marco:**
- Abre o app e vê: "3 leads postaram algo relevante esta semana"
- Cada insight traz o post, o link e uma sugestão de abordagem pronta
- Usa o insight como munição: email direto, contexto pra ligação, ou base pra campanha nova
- Sente que tem um assistente vigiando seus leads estratégicos 24/7

### Secondary Users

N/A — Login único, sem distinção de perfis. A mesma persona opera toda a feature.

### User Journey

**1. Configuração (uma vez)**
- Marco está na lista de leads, identifica leads ICP estratégicos
- Marca os leads para monitoramento (toggle ou ação em lote)
- Sistema começa a vigiar automaticamente

**2. Ciclo Semanal (automático)**
- Job roda semanalmente sem intervenção do Marco
- Sistema busca posts novos dos leads monitorados via Apify
- IA analisa relevância cruzando com Knowledge Base (produtos/serviços)
- Posts relevantes geram sugestões de abordagem automaticamente

**3. Consumo de Insights (quando disponível)**
- Marco abre o app → vê badge ou indicador de novos insights
- Acessa a área de monitoramento → tabela com leads, posts e sugestões
- Cada linha mostra: nome do lead, resumo do post, link original, sugestão de abordagem, data

**4. Ação (Marco decide)**
- Copia a sugestão e manda email direto via Instantly/Snovio
- Usa o contexto como base pra ligação ou abordagem manual
- Se inspira pra criar uma campanha nova no tdec-prospect
- Marca o insight como "usado" ou descarta

**5. Momento "Aha!"**
- Marco aborda um lead citando algo que ele postou 3 dias atrás
- O lead responde surpreso: "como você viu isso?"
- Taxa de resposta sobe porque o timing e a personalização são reais

---

## Success Metrics

### Métricas de Sucesso do Usuário

**Resultado Principal:** Marco recebe semanalmente insights relevantes sobre seus leads monitorados, sem esforço manual.

**Indicadores de Valor:**
- **Relevância dos insights:** Insights gerados são de fato conectados aos produtos/serviços do Marco (não são ruído)
- **Consistência:** O sistema roda semanalmente sem falhas e entrega resultados quando há posts novos
- **Utilidade:** Marco usa os insights — copia sugestões, abre links, age em cima da informação

**Momento "Valeu a Pena":**
Marco abre o app na segunda-feira e encontra 2-3 insights prontos sobre leads que postaram algo relevante durante a semana. Ele não precisou fazer nada — o sistema trouxe a oportunidade até ele.

**Comportamentos de Adoção:**
- Marco consulta a área de insights regularmente (pelo menos 1x/semana)
- Mantém leads ativos no monitoramento (não desativa em massa)
- Usa as sugestões de abordagem geradas

### Business Objectives

**Curto Prazo (1-2 meses):**
- Job semanal rodando sem falhas e dentro do orçamento de API
- Pelo menos 1 insight relevante gerado por semana (dependendo da atividade dos leads)
- Marco consultando a área de insights semanalmente

**Médio Prazo (3-6 meses):**
- Feature consolidada como parte do workflow semanal de prospecção
- Base de leads monitorados estável (Marco ajusta mas não abandona)
- Feedback qualitativo positivo sobre a qualidade das sugestões

### Key Performance Indicators

| KPI | Como Medir | Meta |
|-----|------------|------|
| **Taxa de execução do job** | Jobs executados com sucesso / jobs agendados | 95%+ |
| **Posts novos detectados/semana** | Posts novos encontrados por execução | Depende da atividade dos leads — baseline a ser estabelecido |
| **Taxa de relevância** | Posts classificados como relevantes / total de posts novos | Ajustar prompt até atingir precisão aceitável (evitar falsos positivos) |
| **Custo por execução** | Custo total Apify + OpenAI por job semanal | Manter dentro de ~$0.50/semana para 100 leads |
| **Engajamento** | Visitas à área de insights por semana | Pelo menos 1x/semana |
| **Insights utilizados** | Insights marcados como "usado" ou copiados | Tendência crescente |

**Nota:** O baseline de posts novos e taxa de relevância será estabelecido nas primeiras 4 semanas de operação. É esperado que algumas semanas tenham zero insights — isso é normal e não indica falha.

---

## MVP Scope

### Core Features

**1. Monitoramento de Leads**
- Toggle "Monitorar" no lead individual + ação em lote na tabela de leads
- Limite de 100 leads monitorados por tenant
- Apenas leads com `linkedin_url` preenchido podem ser monitorados
- Indicador visual na tabela de leads mostrando quais estão sendo monitorados

**2. Job Agendado de Verificação**
- Supabase Edge Function executada via Cron
- Frequência padrão: semanal (configurável: semanal/quinzenal)
- Busca posts novos via Apify (mesma API do Icebreaker existente)
- Processamento em batches para respeitar rate limits
- Comparação com `linkedin_posts_cache` para detectar posts inéditos
- Logging de execução e custos na tabela `api_usage_logs`

**3. Filtro de Relevância por IA**
- Prompt especializado que cruza conteúdo do post com Knowledge Base (produtos/serviços)
- Classifica post como relevante ou não relevante
- Apenas posts relevantes geram insight

**4. Geração de Sugestão de Abordagem**
- Prompt dedicado (diferente do Icebreaker atual) que conecta o post com o produto/serviço do usuário
- Gera sugestão contextual e oportuna, não genérica
- Armazena: post original, link do post, sugestão gerada, data de detecção

**5. Página de Insights**
- Área dedicada no app (nova rota)
- Tabela com: nome do lead, resumo do post, link original, sugestão de abordagem, data
- Badge no menu indicando quantidade de insights novos
- Ação de copiar sugestão
- Botão "Enviar WhatsApp" (se lead tem telefone) — gera mensagem editável antes do envio, mesmo padrão já existente
- Marcar insight como "usado" ou descartar

**6. Configurações**
- Tela de configuração da frequência (semanal/quinzenal)
- Visualização de quantos leads estão sendo monitorados vs. limite

### Out of Scope for MVP

| Funcionalidade | Motivo | Quando |
|----------------|--------|--------|
| **Notificação por email** | Nice-to-have; Marco já abre o app diariamente | v2 |
| **Frequência diária** | Custo alto de API; semanal já atende a necessidade | v2 se demanda |
| **Criar campanha a partir do insight** | Insight é pra 1 lead; campanha é pra muitos | Avaliar futuramente |
| **Histórico completo de posts** | Cache atual já guarda últimos posts | v2 |
| **Dashboard de analytics do monitoramento** | KPIs podem ser acompanhados manualmente no início | v2 |
| **Envio de email direto a partir do insight** | Marco usa Instantly/Snovio pra emails; copia manualmente | v2 se demanda |

### MVP Success Criteria

O MVP será considerado bem-sucedido quando:

1. **Funcional:** Job semanal roda sem falhas por 4 semanas consecutivas
2. **Relevância:** Insights gerados são considerados úteis pelo Marco (validação qualitativa)
3. **Custo:** Execução semanal para 100 leads custa menos de $1/semana (Apify + OpenAI)
4. **Adoção:** Marco consulta a área de insights pelo menos 1x/semana
5. **Estabilidade:** Zero impacto nas features existentes (Icebreaker, campanhas, leads)

**Gate de decisão:** Feedback positivo do Marco após 4 semanas + job estável = sinal verde para evoluir (notificações, analytics, frequência diária).

### Future Vision

**Curto Prazo (3-6 meses):**
- Notificações por email quando insights relevantes são detectados
- Frequência diária para leads prioritários
- Dashboard com analytics de monitoramento (posts detectados, taxa de relevância, custo)
- Histórico completo de posts por lead

**Médio Prazo (6-12 meses):**
- Score de relevância (não só binário, mas graduado: alta/média/baixa)
- Monitoramento de outros signals além de posts (mudanças de cargo, empresa, conexões)
- Integração direta com Instantly/Snovio para envio de email a partir do insight
- Sugestões de leads para adicionar ao monitoramento baseado em ICP
