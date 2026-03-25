---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - architecture.md
  - product-brief-tdec-prospect-2026-01-29.md
date: 2026-03-24
author: Fabossi
---

# Product Brief: Technographic Prospecting - tdec-prospect

## Executive Summary

O **Technographic Prospecting** e uma feature aditiva ao tdec-prospect que permite descobrir empresas que utilizam uma tecnologia especifica e transformar essa informacao em leads acionaveis para campanhas de prospeccao. O sistema integra a API do theirStack -- a maior base de dados technograficos por vagas de emprego, cobrindo 33.000+ tecnologias e 11M empresas -- com o pipeline de prospeccao ja existente no TDEC Prospect.

A feature resolve um gap critico na prospeccao outbound: identificar empresas por stack tecnologica e um processo tao manual e penoso (Google, LinkedIn, tentativa e erro) que simplesmente nao acontece na rotina das equipes comerciais. O resultado sao oportunidades de negocio perdidas silenciosamente -- empresas que usam exatamente a tecnologia que o cliente pode complementar ou substituir, mas que nunca sao abordadas por falta de visibilidade.

Com o Technographic Prospecting, o usuario busca uma tecnologia (ex: "Netskope"), recebe uma lista de empresas com score de confianca, encontra os contatos ideais via Apollo (ja integrado), e segue o fluxo padrao: enriquecimento, segmentacao, criacao de campanha e export. De ponta a ponta, dentro do TDEC Prospect.

---

## Core Vision

### Problem Statement

Equipes comerciais que vendem produtos ou servicos complementares/concorrentes a tecnologias especificas nao conseguem identificar de forma sistematica quais empresas utilizam essas tecnologias. O processo atual e inteiramente manual -- buscas no Google, LinkedIn, tentativa e erro -- e exige dedicacao que compete com outras prioridades do time. Na pratica, a prospeccao por stack tecnologica simplesmente nao acontece.

### Problem Impact

- Oportunidades de negocio sao perdidas silenciosamente porque a equipe nao sabe quais empresas usam a tecnologia-alvo
- O processo manual e tao penoso que a equipe desiste antes de comecar, priorizando outras atividades
- Campanhas de prospeccao sao genericas em vez de segmentadas por contexto tecnologico
- Concorrentes que identificam essas empresas primeiro capturam o mercado
- A empresa nao consegue ser intencional na geracao de negocios por vertical tecnologica

### Why Existing Solutions Fall Short

| Solucao | Limitacao |
|---------|-----------|
| **BuiltWith** | Foco em tecnologias frontend/website, preco enterprise elevado |
| **Wappalyzer** | Apenas scan de websites, nao detecta tecnologias backend/security/infra |
| **Processo manual (Google/LinkedIn)** | Nao escalavel, impreciso, consome tempo que a equipe nao tem |
| **Enlyft** | Enterprise, custo proibitivo para operacoes menores |

Nenhuma dessas solucoes oferece integracao direta com um pipeline de prospeccao outbound completo -- sao ferramentas isoladas que entregam listas, mas nao conectam com a criacao de campanhas e contatos.

### Proposed Solution

Uma nova capacidade de descoberta de leads no tdec-prospect baseada em dados technograficos:

1. **Busca por tecnologia** -- Usuario digita a tecnologia-alvo (ex: "Netskope", "Salesforce", "AWS") e o sistema consulta a API do theirStack para encontrar empresas que a utilizam
2. **Score de confianca** -- Cada resultado inclui nivel de confianca (low/medium/high) baseado em quantidade de evidencias (vagas, mencoes)
3. **De empresa para contato** -- Empresas identificadas alimentam busca no Apollo (ja integrado) para encontrar contatos com cargos relevantes
4. **Pipeline existente** -- Leads criados seguem o fluxo padrao: segmentacao, enriquecimento, criacao de campanha com IA, export para Instantly/Snov.io
5. **Validacao com free tier** -- theirStack oferece 50 company credits/mes gratuitos, permitindo validacao sem investimento inicial

### Key Differentiators

| Diferencial | Por que importa |
|-------------|-----------------|
| **Deteccao de tech backend/security** | theirStack detecta tecnologias que scanners de website nao enxergam (ex: Netskope, ferramentas internas) |
| **Score de confianca** | Transparencia sobre o nivel de certeza -- nao e adivinhacao, sao indicios qualificados |
| **Pipeline integrado end-to-end** | De "qual tech?" ate "campanha rodando" sem sair do TDEC Prospect |
| **Custo acessivel** | Free tier para validar, EUR 90/mes vs. enterprise pricing dos concorrentes |
| **Apollo como ponte** | Nao duplica custo com contatos -- usa integracao existente para encontrar pessoas |
| **Buyer intent signals** | Vagas de emprego como indicador de adocao/expansao tecnologica |

---

## Target Users

### Primary Users

**Persona: Marco -- Diretor Comercial / Operador Unico**

Marco e o mesmo perfil do produto principal: lidera a prospeccao, opera diretamente a plataforma e toma decisoes estrategicas. No contexto do Technographic Prospecting, Marco e quem define quais tecnologias sao alvo de prospeccao -- decisao que conecta diretamente com a estrategia comercial da empresa.

**Contexto no Technographic Prospecting:**
- Define quais tecnologias sao relevantes para prospectar (ex: "Netskope" porque vendemos solucoes complementares de security)
- Quer descobrir empresas que usam essas tecnologias de forma rapida e sistematica
- Hoje nao faz essa busca porque o processo manual e tao penoso que nao justifica o tempo investido
- Precisa que o resultado ja alimente o pipeline de prospeccao existente -- sem retrabalho

**Frustracoes que a Feature Resolve:**
- Nao consegue identificar empresas por stack tecnologica de forma escalavel
- Perde oportunidades de negocio por falta de visibilidade sobre quem usa o que
- Quando tenta fazer manualmente (Google, LinkedIn), o resultado e impreciso e demorado
- Nao consegue ser intencional na geracao de negocios por vertical tecnologica

**O que Sucesso Significa para Marco:**
- Abrir o TDEC Prospect, buscar "Netskope", receber uma lista de empresas com score de confianca
- Encontrar contatos ideais nessas empresas e adiciona-los a uma lista de leads
- Seguir o fluxo padrao ja existente: enriquecimento, campanha com IA, export
- Ter campanhas segmentadas por tecnologia rodando em minutos

---

**Persona: SDR Operacional**

Mesmo perfil de uso que Marco no contexto desta feature. Utiliza a plataforma para:
- Executar buscas por tecnologia conforme direcao estrategica
- Selecionar empresas e encontrar contatos via Apollo
- Criar leads e alimentar campanhas segmentadas por tech stack
- Acompanhar resultados das campanhas technograficas

A plataforma oferece a mesma experiencia para ambos os perfis -- sem distincao de interface ou funcionalidades por cargo. Preparacao para restricao futura de acesso pode ser considerada, mas nao e necessaria no escopo inicial.

### Secondary Users

N/A para o escopo inicial. A feature e utilizada pelos mesmos perfis que ja operam o TDEC Prospect.

### User Journey

**1. Decisao Estrategica**
- Marco identifica uma oportunidade comercial ligada a uma tecnologia especifica (ex: "empresas que usam Netskope precisam do nosso servico de compliance")

**2. Busca Technografica**
- Acessa a area de Technographic Prospecting no TDEC Prospect
- Digita a tecnologia-alvo e configura filtros (pais, tamanho de empresa, industria)
- Recebe lista de empresas com score de confianca (low/medium/high)

**3. De Empresa para Contato**
- Seleciona empresas relevantes da lista
- Sistema busca contatos com cargos-alvo via Apollo (ja integrado)
- Visualiza contatos encontrados e seleciona os mais adequados

**4. Pipeline Padrao**
- Cria leads a partir dos contatos selecionados
- Adiciona a um segmento/lista especifico (ex: "Prospects Netskope Q1")
- Cria campanha com IA contextualizada para aquele segmento tecnologico
- Exporta para Instantly/Snov.io e acompanha resultados

**5. Momento "Valeu a Pena"**
- Marco tem campanhas segmentadas por tecnologia rodando com leads qualificados que ele jamais teria encontrado manualmente

---

## Success Metrics

### Metricas de Sucesso do Usuario

**Resultado Principal:** Marco consegue descobrir empresas por tecnologia E encontrar contatos ideais nessas empresas para iniciar campanhas segmentadas -- algo que antes simplesmente nao acontecia.

**Indicadores de Valor:**
- **Empresas descobertas:** Buscas technograficas retornam empresas relevantes que o usuario nao conhecia
- **Leads qualificados gerados:** Contatos com cargos relevantes encontrados via Apollo a partir das empresas identificadas
- **Campanhas tecnologicas criadas:** Campanhas segmentadas por tech stack sendo criadas e exportadas
- **Taxa de resposta:** Campanhas technograficas geram respostas acima do baseline de campanhas genericas

**Momento "Valeu a Pena":**
Marco busca "Netskope", encontra 30 empresas, gera 80 leads qualificados com cargos relevantes, cria uma campanha segmentada e recebe as primeiras respostas. O ciclo completo -- de tecnologia ate oportunidade -- aconteceu sem sair do TDEC Prospect.

**Comportamentos de Adocao:**
- Uso semanal da busca technografica (1x/semana = uso saudavel)
- Leads gerados via technographic prospecting entrando no pipeline regularmente
- Campanhas segmentadas por tecnologia sendo criadas com frequencia

### Business Objectives

**Curto Prazo (1 mes):**
- Primeira campanha technografica gerando respostas concretas
- Validacao do fluxo completo: tech -> empresas -> leads -> campanha -> resultado
- Confirmacao de que o free tier do theirStack (50 empresas/mes) e suficiente para o volume inicial

**Medio Prazo (3 meses):**
- Technographic prospecting se torna um canal de geracao de leads consistente
- Avaliacao de upgrade para plano pago do theirStack se volume justificar
- Campanhas technograficas com taxa de resposta superior as campanhas genericas

### Key Performance Indicators

| KPI | Como Medir | Meta |
|-----|------------|------|
| **Leads qualificados/mes** | Leads gerados via technographic prospecting | Medir baseline na primeira campanha -> crescer progressivamente |
| **Buscas technograficas/mes** | Quantidade de buscas por tecnologia realizadas | 4-5/mes (1x/semana = adocao saudavel) |
| **Conversao empresa->lead** | % de empresas encontradas que geram ao menos 1 lead qualificado | Tendencia crescente |
| **Campanhas technograficas/mes** | Campanhas criadas a partir de leads technograficos | 2-4/mes |
| **Taxa de resposta** | % de respostas em campanhas technograficas vs. genericas | Superioridade mensuravel sobre campanhas sem segmentacao por tech |
| **Consumo de credits theirStack** | Credits utilizados vs. disponiveis no mes | Monitorar para avaliar necessidade de upgrade |

**Nota:** O baseline sera estabelecido na primeira campanha technografica. Resultados em 1 mes pos-implementacao e a expectativa.

---

## MVP Scope

### Core Features

**1. Configuracao da Integracao theirStack**
- Configuracao de API key do theirStack na pagina de integracoes existente
- Teste de conexao com a API
- Monitoramento de consumo de credits (free tier: 50 company credits/mes)

**2. Busca Technografica**
- Interface de busca por tecnologia com campo de busca e autocomplete do catalogo theirStack (33.000+ tecnologias)
- Filtros complementares: pais, tamanho de empresa, industria, nivel de confianca
- Resultados em tabela com: nome da empresa, dominio, industria, tamanho, score de confianca, tecnologias detectadas

**3. De Empresa para Contato (Apollo Bridge)**
- Selecao de empresas nos resultados da busca technografica
- Busca automatica de contatos via Apollo nas empresas selecionadas, com filtro por cargos-alvo
- Visualizacao dos contatos encontrados com informacoes relevantes

**4. Integracao com Pipeline Existente**
- Criacao de leads a partir dos contatos selecionados
- Adicao a segmentos/listas existentes
- A partir daqui, o fluxo padrao do TDEC Prospect se aplica: enriquecimento, campanha com IA, export

### Out of Scope for MVP

| Funcionalidade | Motivo | Quando |
|----------------|--------|--------|
| **LinkedIn Jobs scraping via Apify** | theirStack ja usa vagas como fonte; evita duplicacao de esforco | v2 - enrichment complementar |
| **Historico de buscas salvas** | Funcionalidade de conveniencia, nao essencial para validacao | v2 |
| **Alertas automaticos de novas empresas** | Requer infraestrutura de jobs/cron; validar demanda primeiro | v2 - monitoramento continuo |
| **Dashboard de analytics technograficos** | Metricas podem ser acompanhadas manualmente no inicio | v2 |
| **Combinacao com monitoramento LinkedIn (Epic 13)** | Complexidade de integracao entre features; validar cada uma independentemente primeiro | v3 - convergencia de signals |

### MVP Success Criteria

O MVP sera considerado bem-sucedido quando:

1. **Fluxo completo funcional:** Usuario busca tecnologia -> encontra empresas -> encontra contatos -> cria leads -> inicia campanha
2. **Resultados reais:** Primeira campanha technografica gera leads qualificados e respostas em ate 1 mes pos-implementacao
3. **Qualidade dos dados:** Empresas retornadas sao relevantes e contatos encontrados via Apollo sao acionaveis
4. **Estabilidade:** Integracao com theirStack funciona sem erros criticos dentro dos limites do free tier
5. **Adocao:** Usuario realiza buscas technograficas semanalmente

**Gate de decisao:** Resultados concretos na primeira campanha + uso semanal consistente = sinal verde para evoluir alem do MVP.

### Future Vision

**Curto Prazo (apos validacao do MVP):**
- Historico de buscas technograficas salvas para reutilizacao
- LinkedIn Jobs scraping via Apify como fonte complementar de buyer intent
- Dashboard de analytics especifico para campanhas originadas de technographic prospecting

**Medio Prazo:**
- Monitoramento continuo de tech trends -- alertas quando novas empresas adotam uma tecnologia-alvo
- Alertas de buyer intent -- notificacoes quando empresas postam vagas relacionadas a tecnologias monitoradas
- Upgrade para plano pago do theirStack com webhooks para dados em tempo real

**Longo Prazo:**
- Convergencia de signals: combinacao de technographic prospecting com monitoramento de LinkedIn (Epic 13) para score de intencao de compra multi-fonte
- Recomendacoes proativas de prospeccao baseadas em padroes de adocao tecnologica
- Inteligencia competitiva: detectar quando empresas migram de uma tecnologia para outra
