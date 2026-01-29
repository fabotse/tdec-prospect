---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments: []
date: 2026-01-29
author: Fabossi
---

# Product Brief: tdec-prospect

## Executive Summary

O **tdec-prospect** é uma plataforma web de otimização de prospecção outbound que unifica a captação de leads e a construção de campanhas em uma experiência visual elegante, potencializada por IA contextualizada. O produto resolve a fragmentação entre ferramentas como Apollo, Sales Navigator, Signal Hire, Hamper e Snowview - permitindo que empresas reduzam drasticamente o trabalho manual de SDRs ao automatizar a busca de leads via conversa natural e gerar sequências de email personalizadas com qualidade profissional em minutos.

Diferente de ferramentas genéricas, a IA do tdec-prospect conhece profundamente o negócio do cliente, seus produtos e exemplos de comunicação efetiva, entregando textos e cadências que realmente convertem - não templates vazios. O foco é ser a camada de inteligência e personalização, deixando a execução técnica (envio de emails, tracking) para ferramentas especializadas.

---

## Core Vision

### Problem Statement

Empresas que fazem prospecção outbound perdem tempo significativo alternando entre múltiplas plataformas desconectadas. Apollo para buscar leads, Signal Hire para telefones, Sales Navigator para pesquisa, Hamper ou Snowview para envio de emails - cada ferramenta faz uma etapa, mas nenhuma oferece uma visão integrada do processo. A criação de campanhas e textos é manual, repetitiva e raramente personalizada de verdade.

### Problem Impact

- SDRs gastam horas em trabalho operacional que poderia ser automatizado
- Campanhas saem genéricas por falta de tempo para personalização real
- Leads de alta qualidade recebem o mesmo tratamento que leads frios
- Empresas pagam por múltiplas ferramentas que não conversam entre si
- O processo de prospecção é fragmentado e difícil de visualizar como um todo

### Why Existing Solutions Fall Short

Ferramentas como Apollo já possuem funcionalidades de sequência, mas a experiência visual é limitada e a IA gera conteúdo genérico. Plataformas all-in-one como Outreach e Salesloft são complexas e caras. Nenhuma solução atual oferece:
- Busca de leads por conversa natural com IA
- Personalização contextualizada baseada no conhecimento profundo do negócio
- Visual builder elegante no nível de Attio/Airtable
- Foco exclusivo na otimização sem tentar substituir ferramentas de execução

### Proposed Solution

Uma plataforma web que funciona como camada de inteligência sobre as ferramentas existentes:

1. **Captação Unificada:** Integração com Apollo, Signal Hire e Sales Navigator em uma interface única, com busca conversacional ("Me busca 50 leads de empresas de tecnologia em SP com 50-200 funcionários")

2. **Builder Visual:** Construtor drag-and-drop de sequências/cadências inspirado em Attio e Airtable - bonito, claro e intuitivo

3. **IA Contextualizada:** Geração de textos que conhece a empresa, o produto e cria quebra-gelos personalizados para cada lead baseado em suas informações específicas

4. **Sugestões Inteligentes:** Recomendação de intervalos e timing baseados na qualidade do lead

5. **Ciclo Completo:** Importação de leads interessados de volta ao sistema para controle e follow-up direcionado

### Key Differentiators

| Diferencial | Por que importa |
|-------------|-----------------|
| **IA Conversacional para busca** | "Me busca leads de..." em vez de preencher 10 filtros |
| **Personalização real** | IA que conhece SEU negócio, não templates genéricos |
| **Visual premium** | Qualidade Attio/Airtable, não interfaces enterprise feias |
| **Foco na otimização** | Não tenta fazer tudo - integra com o que já funciona |
| **Velocidade + Qualidade** | Campanhas em minutos com qualidade de horas de trabalho manual |

---

## Target Users

### Primary Users

**Persona: Marco - Diretor Comercial**

Marco é diretor comercial de uma empresa que faz prospecção ativa. Ele lidera uma equipe de SDRs, mas é inovador e gosta de estar na linha de frente - não quer só ver dashboards, quer entender e participar do processo de captação.

**Contexto:**
- Supervisiona toda a equipe comercial
- Quer velocidade e qualidade na captação de leads
- Hoje depende dos SDRs para operar múltiplas ferramentas
- Precisa dividir atenção entre captação e outras responsabilidades estratégicas

**Frustrações Atuais:**
- Processo de captação não acontece na velocidade que gostaria
- Qualidade das campanhas varia dependendo de quem executa
- Fragmentação entre ferramentas consome tempo da equipe
- Pouca visibilidade em tempo real do que está funcionando

**O que sucesso significa para Marco:**
- Construir campanhas completas em minutos, não horas
- Copiar facilmente as sequências para a ferramenta de envio (Snowview/Instantly)
- Ter autonomia para fazer ele mesmo quando necessário
- Ver rapidamente o que está funcionando e alimentar o sistema com esse feedback

**Padrão de Uso:**
- Acesso quase diário para busca de novos leads
- Escalonamento inteligente: email primeiro → interesse detectado → busca telefone via SignalHire
- Revisão de resultados de campanhas via integração com Snowview/Instantly

---

**Persona: SDR Operacional**

Mesmo perfil de uso que Marco, porém focado na execução. Usa a plataforma para:
- Buscar leads seguindo critérios definidos
- Montar sequências de campanha com apoio da IA
- Exportar campanhas para ferramentas de envio
- Acompanhar resultados e marcar leads de interesse

A plataforma oferece a mesma experiência para ambos os perfis - não há distinção de interface ou funcionalidades por cargo.

### Secondary Users

N/A para o escopo inicial. O produto é focado em quem opera diretamente o processo de prospecção (diretores comerciais e SDRs).

### User Journey

**1. Onboarding (Configuração Inicial)**
- APIs pré-configuradas pela equipe (Apollo, SignalHire, Snowview/Instantly)
- Base de conhecimento alimentada com informações da empresa e produtos
- Usuário recebe acesso e pode começar imediatamente

**2. Uso Diário - Captação de Leads**
- Entra na plataforma → busca leads por filtros ou conversa com IA
- "Me busca 50 leads de empresas de tecnologia em SP contratando devs"
- Organiza e segmenta os leads capturados

**3. Construção de Campanha**
- Usa o builder visual para criar sequência de emails
- IA sugere textos personalizados baseados no produto e no perfil do lead
- Sistema recomenda intervalos entre touchpoints

**4. Exportação e Execução**
- Copia/exporta a campanha para Snowview ou Instantly
- Coloca campanha para rodar na ferramenta de envio

**5. Acompanhamento e Escalonamento**
- Resultados retornam via integração (aberturas, respostas, interesse)
- Leads que demonstram interesse são marcados
- Para leads interessados: busca telefone via SignalHire para contato direto
- Feedback alimenta o sistema para melhorar sugestões futuras

---

## Success Metrics

### Métricas de Sucesso do Usuário

**Resultado Principal:** Marco consegue captar leads de qualidade e criar campanhas profissionais em uma fração do tempo atual.

**Indicadores de Valor:**
- **Qualidade dos leads:** Leads captados são relevantes e respondem às campanhas
- **Tempo economizado:** Criação de campanhas em minutos vs. horas
- **Taxa de resposta:** Campanhas geram respostas acima do baseline atual

**Momento "Valeu a Pena":**
Marco vê leads de qualidade + campanhas bem construídas + criadas rapidamente + leads respondendo. Esse é o ciclo completo de valor.

**Comportamentos de Adoção:**
- Uso diário da plataforma
- Centralização: para de acessar Apollo/Navigator diretamente
- Cria campanhas consistentemente pela plataforma

### Business Objectives

**Curto Prazo (3 meses):**
- Volume consistente de campanhas criadas (5-10/mês = bom uso)
- Feedback positivo sobre qualidade das sugestões da IA
- Resultados concretos: leads respondendo e convertendo

**Médio Prazo (12 meses):**
- Retenção do Marco como case de sucesso comprovado
- Validação do modelo para escalar para outras empresas
- Outras empresas conseguindo resultados similares

### Key Performance Indicators

| KPI | Como Medir | Meta |
|-----|------------|------|
| **Taxa de Resposta** | % de leads que respondem às campanhas | Medir baseline inicial → melhorar progressivamente |
| **Campanhas/Mês** | Quantidade de campanhas criadas | 5-10 campanhas = adoção saudável |
| **Uso Diário** | Dias por semana com login ativo | 4-5 dias/semana |
| **Centralização** | % de leads captados via tdec-prospect vs. outras ferramentas | Tendência crescente até ~100% |
| **Tempo de Criação** | Tempo médio para montar uma campanha completa | Redução significativa vs. processo manual |

**Nota:** O baseline da taxa de resposta será medido nas primeiras campanhas para estabelecer meta de melhoria.

---

## MVP Scope

### Core Features

**1. Captação de Leads**
- Integração com Apollo para busca de leads
- Integração com SignalHire para busca de telefones
- Busca conversacional com IA ("Me busca 50 leads de empresas de tecnologia em SP...")
- Busca por filtros tradicionais
- Organização e segmentação de leads capturados

**2. Construção de Campanhas**
- Builder visual drag-and-drop de sequências de email
- IA contextualizada para geração de textos personalizados
- Sugestão inteligente de intervalos e timing entre touchpoints
- Base de conhecimento com informações da empresa e produtos

**3. Integrações de Saída**
- Exportação para Snov.io (via API)
- Exportação para Instantly (via API)
- Exportação para Ramper (copy/paste manual - sem API disponível)
- Importação de leads interessados de volta ao sistema (via API ou importação manual)

**4. Gestão de Usuários**
- Múltiplos usuários da mesma empresa
- Todos os usuários acessam os mesmos dados (sem divisão por times)
- Autenticação simples

**5. Interface/UX**
- Design clean, minimalista e moderno
- Dashboard inspirado em Attio
- Tabelas inspiradas em Airtable
- Experiência visual premium

### Out of Scope for MVP

| Funcionalidade | Motivo | Quando |
|----------------|--------|--------|
| **Sales Navigator** | Complexidade de integração | v2.0 |
| **Divisão por times/permissões** | Foco inicial é uma empresa | Escalabilidade futura |
| **Analytics avançados de campanhas** | Usuários já têm isso nas ferramentas de envio | v2.0 |
| **Envio direto de emails** | Fora do escopo - fica com Snov.io/Instantly/Ramper | Possivelmente nunca |
| **Automação WhatsApp** | Feature avançada | v2.0+ |

### MVP Success Criteria

O MVP será considerado bem-sucedido quando:

1. **Adoção:** Marco e equipe usando a plataforma diariamente
2. **Execução:** Campanhas completas sendo criadas e exportadas
3. **Resultados:** Leads respondendo com taxas satisfatórias
4. **Estabilidade:** Sistema funcionando sem bugs críticos
5. **Eficiência:** Custo de IA otimizado (usando modelos de forma inteligente)

**Gate de decisão:** Feedback positivo do Marco + métricas de uso consistentes = sinal verde para evoluir além do MVP.

### Future Vision

**Curto Prazo (1 ano):**
- Mais integrações de fontes de leads (Sales Navigator, outras plataformas)
- Arquitetura escalável para múltiplas empresas
- Divisão por times e permissões granulares
- Analytics completos de campanhas dentro da plataforma
- Automação de WhatsApp integrada

**Médio/Longo Prazo (2-3 anos):**
- Produto multi-tenant para diversas empresas
- Plataforma de referência em otimização de prospecção outbound
- Ecossistema de integrações expandido
- IA cada vez mais contextualizada e preditiva
- Diferencial máximo: a camada de inteligência que nenhuma outra ferramenta oferece
