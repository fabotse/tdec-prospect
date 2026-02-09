---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish", "step-12-complete"]
status: complete
completedAt: 2026-01-29
inputDocuments: ["product-brief-tdec-prospect-2026-01-29.md"]
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: "SaaS B2B"
  domain: "SalesTech/MarTech"
  complexity: "medium"
  projectContext: "greenfield"
---

# Product Requirements Document - tdec-prospect

**Author:** Fabossi
**Date:** 2026-01-29

## Executive Summary

### Vision

O **tdec-prospect** é uma plataforma de otimização de prospecção outbound que unifica captação de leads e construção de campanhas em uma experiência visual elegante, potencializada por IA contextualizada.

### Core Differentiator

Diferente de ferramentas genéricas, o tdec-prospect oferece:
- **Busca conversacional de leads** - "Me busca 50 leads de empresas de tecnologia em SP" em vez de 10 filtros manuais
- **Personalização contextual profunda** - IA que conhece o negócio e gera textos que parecem escritos pelo usuário
- **Camada de inteligência** - Não substitui ferramentas existentes, complementa o stack (Apollo, SignalHire, Instantly)

### Target Users

**Primário:** Marco - Diretor Comercial hands-on que quer velocidade + qualidade na captação de leads
**Secundário:** SDRs operacionais que executam prospecção em escala

### Project Context

- **Tipo:** SaaS B2B
- **Domínio:** SalesTech/MarTech
- **Complexidade:** Média
- **Contexto:** Greenfield (produto novo)
- **MVP Client:** TDEC (empresa do Marco)

## Success Criteria

### User Success

**Resultado Principal:** Marco e SDRs conseguem captar leads de qualidade e criar campanhas profissionais em uma fração do tempo atual.

**Momento "Aha!":** Quando o usuário lê o texto gerado pela IA e pensa "parece que fui eu que escrevi" - quebra-gelos personalizados, tom humano, sem cara de robô de marketing.

**Indicadores de Valor:**
- Leads captados são relevantes para o ICP definido
- Campanhas geram respostas acima do baseline atual
- Tempo de criação reduzido de horas para minutos
- Textos personalizados que refletem o conhecimento do negócio

**Comportamentos de Adoção:**
- Uso diário da plataforma (4-5 dias/semana)
- Centralização: para de acessar Apollo/Navigator diretamente
- Cria campanhas consistentemente pela plataforma

### Business Success

**Curto Prazo (3 meses):**
- Volume consistente de campanhas: 5-10/mês = adoção saudável
- Feedback positivo sobre qualidade das sugestões da IA
- Leads respondendo e convertendo em oportunidades

**Médio Prazo (12 meses):**
- Marco retido como case de sucesso comprovado
- Modelo validado para escalar para outras empresas
- Resultados replicáveis com novos clientes

### Technical Success

**Integrações (CRÍTICO):**
- Apollo API: busca de leads funcionando com <3s de resposta
- SignalHire API: enriquecimento de telefones confiável
- Exportação para Snov.io/Instantly: sem falhas ou perda de dados

**Performance da IA:**
- Geração de textos em <5s por email
- Qualidade consistente independente do volume
- Custo de IA otimizado (modelos inteligentes por tarefa)

**Disponibilidade:**
- Sistema estável sem bugs críticos
- Uptime adequado para uso comercial diário

### Measurable Outcomes

| Métrica | Como Medir | Meta MVP |
|---------|------------|----------|
| Taxa de Resposta | % leads que respondem | Estabelecer baseline → melhorar 20%+ |
| Campanhas/Mês | Quantidade criadas | 5-10 campanhas |
| Uso Diário | Dias/semana com login | 4-5 dias |
| Centralização | % leads via tdec-prospect | Tendência crescente |
| Tempo de Criação | Minutos por campanha | <15 min para campanha completa |
| Qualidade IA | Aprovação do texto sem edição | >70% textos aprovados direto |

## Product Scope

### MVP - Minimum Viable Product

**Captação de Leads:**
- Integração Apollo para busca de leads
- Integração SignalHire para telefones
- Busca conversacional com IA
- Busca por filtros tradicionais
- Organização e segmentação

**Construção de Campanhas:**
- Builder visual drag-and-drop
- IA contextualizada para textos personalizados
- Sugestão de intervalos e timing
- Base de conhecimento da empresa

**Integrações de Saída:**
- Exportação para Snov.io (API)
- Exportação para Instantly (API)
- Exportação para Ramper (copy/paste)
- Importação de leads interessados

**Gestão:**
- Múltiplos usuários da mesma empresa
- Autenticação simples
- Interface clean estilo Attio/Airtable

### Growth Features (Post-MVP)

- Integração Sales Navigator
- ~~Analytics avançados de campanhas~~ → Antecipado para Epic 10 (Campaign Tracking & Janela de Oportunidade)
- Divisão por times e permissões
- Automação de WhatsApp (preparação arquitetural no Epic 10, implementação futura)

### Vision (Future)

- Produto multi-tenant para diversas empresas
- Ecossistema expandido de integrações
- IA preditiva e cada vez mais contextualizada
- Plataforma de referência em otimização outbound

## User Journeys

### Jornada 1: Marco - O Diretor que Recuperou seu Tempo

**Persona:** Marco, 38 anos, Diretor Comercial de uma empresa de tecnologia B2B. Lidera 4 SDRs, mas é do tipo que gosta de colocar a mão na massa. Acordou às 6h, já respondeu 12 emails antes do café.

**Opening Scene - O Problema:**
São 9h de segunda-feira. Marco tem uma reunião de pipeline às 14h e precisa mostrar resultados. Sua lista de leads do último evento está parada há duas semanas porque ninguém teve tempo de criar as campanhas. Ele abre o Apollo, depois o SignalHire, depois uma planilha, depois o Instantly... 4 abas, 4 logins, nenhuma conexão entre eles. Suspira.

**Rising Action - A Descoberta:**
Marco abre o tdec-prospect. Digita na busca conversacional: *"Me busca 30 leads de empresas de tecnologia em São Paulo, 50-200 funcionários, que estejam contratando desenvolvedores"*. Em 15 segundos, a lista aparece. Ele seleciona os 20 mais relevantes e clica em "Criar Campanha".

O builder visual abre - limpo, bonito, sem aquela cara de software enterprise dos anos 2000. Ele arrasta um bloco de email, clica em "Gerar com IA". O sistema já conhece sua empresa, seus produtos, o tom que funciona. O texto aparece:

*"João, vi que a TechCorp está expandindo o time de desenvolvimento. Quando escalamos nosso time aqui na [empresa], o maior desafio foi..."*

Marco lê e pensa: "Caramba, parece que fui eu que escrevi."

**Climax - O Momento de Valor:**
Em 12 minutos, Marco tem uma sequência completa de 4 emails prontos. Personalização real, não aquele "Olá {primeiro_nome}" genérico. Ele exporta para o Instantly com um clique. Campanha no ar.

**Resolution - A Nova Realidade:**
São 9h47. Marco ainda tem a manhã inteira livre. Ele pensa nos últimos 6 meses - quantas vezes deixou de fazer prospecção porque "não tinha tempo"? Agora ele faz em minutos o que antes levava horas. A reunião das 14h? Vai ser diferente dessa vez.

**Requisitos Revelados:**
- Busca conversacional com IA
- Builder visual intuitivo
- Geração de textos contextualizados
- Exportação one-click para Instantly
- Performance: fluxo completo em <15 min

---

### Jornada 2: Marco - Quando o Lead Responde

**Persona:** Marco, Diretor Comercial (continuação).

**Opening Scene - O Sinal:**
Quinta-feira, 16h. Marco recebe uma notificação: 3 leads da campanha de segunda responderam. Um deles é a TechCorp - exatamente o perfil que ele queria.

**Rising Action - O Escalonamento:**
Marco abre o tdec-prospect e vê os leads que demonstraram interesse destacados. O João da TechCorp respondeu: *"Interessante, podemos conversar semana que vem?"*

Marco precisa do telefone dele agora. Clica em "Buscar telefone" - a integração com SignalHire roda em background. Em 3 segundos, o número aparece. Marco liga direto do celular.

**Climax - A Conversão:**
A ligação dura 8 minutos. João está interessado. Marco agenda uma demo para terça-feira.

**Resolution - O Ciclo Completo:**
Marco marca o lead como "Oportunidade" no sistema. O ciclo fechou: captura → campanha → interesse → telefone → conversa → oportunidade. Tudo em uma plataforma, sem copiar/colar entre 5 ferramentas.

**Requisitos Revelados:**
- Importação de resultados de campanhas (interesse/resposta)
- Destaque visual de leads interessados
- Busca de telefone on-demand (SignalHire)
- Status/tracking de leads
- Fluxo de escalonamento claro

---

### Jornada 3: Carla - SDR em Ritmo de Cruzeiro

**Persona:** Carla, 26 anos, SDR há 2 anos. Conhece o processo, sabe o que funciona. Sua meta é 50 leads qualificados por semana.

**Opening Scene - A Rotina:**
Segunda-feira, 8h30. Carla chega, café na mão, e abre o tdec-prospect. Sua rotina é clara: segunda e terça são dias de prospecção nova, quarta a sexta são follow-ups.

**Rising Action - Produtividade:**
Ela já tem os filtros salvos: empresas de e-commerce, 20-100 funcionários, São Paulo e região. Clica, 40 leads aparecem. Seleciona os 25 melhores baseado no fit.

Cria duas campanhas diferentes - uma para e-commerces de moda, outra para eletrônicos. A IA adapta o tom automaticamente porque a base de conhecimento tem exemplos para cada segmento.

**Climax - Qualidade + Velocidade:**
Em 45 minutos, Carla tem 25 leads em 2 campanhas rodando. Antes, isso era trabalho de uma manhã inteira. Ela ainda tem tempo de revisar os textos e fazer pequenos ajustes no tom.

**Resolution - Meta Batida:**
Sexta-feira, Carla olha seus números: 52 leads qualificados, 3 reuniões agendadas. A ferramenta não substituiu seu trabalho - amplificou. Ela ainda escolhe os leads, ainda revisa os textos, mas o trabalho braçal sumiu.

**Requisitos Revelados:**
- Filtros salvos/favoritos
- Seleção em lote de leads
- Múltiplas campanhas simultâneas
- Base de conhecimento com exemplos por segmento
- Edição manual pós-geração de IA

---

### Jornada 4: Setup Inicial - Fabossi Configura o Sistema

**Persona:** Fabossi, desenvolvedor/admin que vai configurar o sistema para a empresa do Marco.

**Opening Scene - A Preparação:**
Antes do Marco usar, alguém precisa conectar tudo. Fabossi recebe as credenciais de API do Apollo, SignalHire, Snov.io e Instantly.

**Rising Action - Configuração:**
No painel de admin, Fabossi:
1. Conecta a API do Apollo - testa com uma busca simples, funciona
2. Conecta SignalHire - testa busca de telefone, OK
3. Conecta Snov.io e Instantly - configura credenciais de exportação
4. Abre a Base de Conhecimento - é hora de "ensinar" a IA

**Climax - Alimentando a IA:**
A base de conhecimento pede:
- Descrição da empresa e produtos
- Tom de voz (formal? casual? técnico?)
- Exemplos de emails que funcionaram
- Informações sobre o ICP

Fabossi cola 5 emails que o Marco já usou e tiveram boas respostas. A IA agora tem contexto real.

**Resolution - Sistema Pronto:**
Teste final: Fabossi faz uma busca, cria uma campanha teste, gera um texto. O resultado parece com os emails do Marco. Sistema pronto para uso.

**Requisitos Revelados:**
- Painel de admin para configuração de APIs
- Teste de conexão para cada integração
- Interface de Base de Conhecimento
- Upload/input de exemplos de comunicação
- Configuração de tom de voz e ICP

---

### Journey Requirements Summary

| Jornada | Capabilities Necessárias |
|---------|-------------------------|
| **Marco - Tempo** | Busca conversacional, Builder visual, IA contextualizada, Export one-click |
| **Marco - Resposta** | Import de resultados, Status de leads, Busca telefone on-demand |
| **Carla - SDR** | Filtros salvos, Seleção em lote, Múltiplas campanhas, Edição manual |
| **Setup - Admin** | Config de APIs, Base de conhecimento, Exemplos de comunicação |

**Capabilities Consolidadas:**
1. **Captação:** Busca conversacional + filtros + salvamento
2. **Builder:** Visual drag-and-drop + múltiplas campanhas
3. **IA:** Geração contextualizada + base de conhecimento + tom de voz
4. **Integrações:** Apollo, SignalHire, Snov.io, Instantly (config + uso)
5. **Gestão:** Status de leads + importação de resultados
6. **Admin:** Painel de configuração + base de conhecimento

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. IA Conversacional para Busca de Leads**
- **O que é:** Busca de leads via linguagem natural ("Me busca 50 leads de empresas de tecnologia em SP...")
- **Por que é inovador:** Elimina a fricção de interfaces com 10+ filtros. Nenhuma ferramenta atual no mercado de prospecção oferece isso de forma natural e integrada
- **Impacto:** Reduz barreira de entrada e acelera o fluxo de trabalho

**2. IA Contextualizada para Personalização Profunda**
- **O que é:** Geração de textos que conhecem o negócio, os produtos e o tom de comunicação do usuário
- **Por que é inovador:** Vai além do "Olá {primeiro_nome}" - cria quebra-gelos e conteúdo que soa autêntico, como se o usuário tivesse escrito
- **Impacto:** Qualidade de campanha profissional em minutos, não horas

**3. Camada de Inteligência (não substituição)**
- **O que é:** Posicionamento como camada de otimização sobre ferramentas existentes (Apollo, SignalHire, Instantly)
- **Por que é inovador:** Em vez de competir sendo "mais um all-in-one", foca no diferencial de IA e integração
- **Impacto:** Menor resistência à adoção - usuários mantêm ferramentas que já funcionam

### Market Context & Competitive Landscape

**Ferramentas existentes e suas limitações:**

| Ferramenta | O que faz | O que falta |
|------------|-----------|-------------|
| Apollo | Busca de leads por filtros | Busca é manual, não tem IA conversacional |
| Outreach/Salesloft | Sequências de email | Complexo, caro, textos genéricos |
| ChatGPT/Claude | Gera textos | Não integra com fontes de leads, não tem contexto do negócio |
| Instantly/Snov.io | Envio de campanhas | Não gera conteúdo, não busca leads |

**Posição única do tdec-prospect:**
- Combina busca conversacional + personalização contextual + integração com ferramentas de execução
- Não compete diretamente - complementa o stack existente

### Validation Approach

**Como validar a inovação:**

1. **Busca Conversacional:**
   - Teste com Marco: ele consegue buscar leads sem precisar de ajuda?
   - Métrica: % de buscas bem-sucedidas via conversa vs. filtros manuais

2. **Qualidade da Personalização:**
   - Teste cego: Marco consegue distinguir emails gerados pela IA dos que ele escreveu?
   - Métrica: % de textos aprovados sem edição (meta: >70%)

3. **Adoção do Fluxo:**
   - Marco para de acessar Apollo/SignalHire diretamente?
   - Métrica: centralização de uso (meta: tendência a 100%)

## SaaS B2B Specific Requirements

### Project-Type Overview

O tdec-prospect é uma plataforma SaaS B2B focada em otimização de prospecção outbound. A arquitetura será preparada para multi-tenant desde o MVP, embora o primeiro cliente seja a empresa TDEC.

**Características SaaS B2B:**
- Plataforma web acessada por múltiplos usuários de uma empresa
- Integrações com ferramentas externas via APIs do cliente
- Modelo de permissões simples (admin vs. usuário)
- Preparado para escala futura

### Technical Architecture Considerations

#### Tenant Model (Multi-tenancy)

**Decisão:** Arquitetura multi-tenant ready desde o MVP

| Aspecto | MVP (TDEC) | Futuro (Multi-tenant) |
|---------|------------|----------------------|
| Dados | Isolados por tenant_id | Isolados por tenant_id |
| API Keys | Por tenant | Por tenant |
| Base de Conhecimento | Por tenant | Por tenant |
| Infraestrutura | Compartilhada | Compartilhada |

**Implementação:**
- Todas as tabelas terão `tenant_id` como chave de isolamento
- Queries sempre filtram por tenant
- Sem acesso cruzado entre dados de diferentes empresas

#### RBAC Matrix (Modelo de Permissões)

**Decisão:** Dois níveis de acesso no MVP

| Funcionalidade | Admin | Usuário |
|----------------|-------|---------|
| Buscar leads | ✅ | ✅ |
| Criar campanhas | ✅ | ✅ |
| Gerar textos com IA | ✅ | ✅ |
| Exportar campanhas | ✅ | ✅ |
| Configurar APIs | ✅ | ❌ |
| Editar Base de Conhecimento | ✅ | ❌ |
| Gerenciar usuários | ✅ | ❌ |

**Nota:** No MVP, Marco será o admin. SDRs serão usuários regulares.

#### Subscription Model (Preparação para Billing)

**Decisão:** MVP sem cobrança, estrutura preparada para futuro

**MVP:**
- Sem sistema de billing
- Uso interno TDEC

**Estrutura para Futuro:**
- Campo `subscription_tier` no tenant (free, pro, enterprise)
- Campo `billing_status` (active, trial, suspended)
- Limites configuráveis por tier (leads/mês, campanhas/mês, usuários)

### Integration Architecture

#### API Keys por Tenant

**Decisão:** Cada empresa configura suas próprias API keys

```
Tenant (TDEC)
├── Apollo API Key: [configurado pelo admin]
├── SignalHire API Key: [configurado pelo admin]
├── Snov.io API Key: [configurado pelo admin]
└── Instantly API Key: [configurado pelo admin]
```

**Benefícios:**
- Custos das APIs são do cliente, não nossos
- Cliente tem controle total sobre seus limites
- Não há dependência de uma conta central

#### Rate Limits & Error Handling

**Estratégia:** Transparência total com o usuário

| Cenário | Comportamento do Sistema |
|---------|-------------------------|
| Apollo sem créditos | Mostra: "Sua conta Apollo está sem créditos. Recarregue em apollo.io para continuar buscando leads." |
| SignalHire limite atingido | Mostra: "Limite de buscas SignalHire atingido. Verifique seu plano em signalhire.com." |
| API indisponível | Mostra: "Serviço [nome] temporariamente indisponível. Tente novamente em alguns minutos." |
| Timeout | Retry automático (1x), depois mostra erro amigável |

**Implementação:**
- Capturar códigos de erro específicos de cada API (401, 402, 429, etc.)
- Traduzir para mensagens amigáveis em português
- Logar erros para diagnóstico
- Nunca expor detalhes técnicos ao usuário final

### Implementation Considerations

#### Stack Tecnológico Sugerido (SaaS B2B)

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| Frontend | React/Next.js | SPA moderna, boa DX, ecossistema rico |
| Backend | Node.js ou Python | Fácil integração com APIs e LLMs |
| Database | PostgreSQL | Multi-tenant com row-level security |
| Auth | Auth0 ou similar | Multi-tenant ready, SSO futuro |
| IA | OpenAI/Anthropic API | Geração de texto contextualizada |

#### Considerações de Segurança

- API keys de terceiros armazenadas criptografadas
- Nunca expor API keys no frontend
- Todas as chamadas a APIs externas via backend
- Logs de auditoria para ações sensíveis (admin)

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Abordagem MVP:** Problem-Solving MVP
- Foco em resolver o problema central: "captação de leads + criação de campanhas leva muito tempo"
- Entregar valor real para um usuário real (Marco/TDEC) antes de escalar

**Filosofia:**
- Mínimo que faz o Marco dizer "isso é útil"
- Qualidade > Quantidade de features
- Se a IA gera texto bom e as integrações funcionam, o resto é secundário

### MVP Feature Set (Phase 1)

**Core User Journeys Suportadas:**
- ✅ Marco busca leads e cria campanha em <15 min
- ✅ Marco escalona lead interessado (busca telefone)
- ✅ SDR em ritmo de produção (múltiplas campanhas)
- ✅ Admin configura sistema (APIs + base conhecimento)

**Must-Have Capabilities:**

| Capability | Justificativa |
|------------|---------------|
| Busca conversacional IA | Diferencial #1 - único no mercado |
| Busca por filtros | Fallback se conversa falhar |
| Builder visual campanhas | UX premium prometida |
| Geração texto contextualizada | Diferencial #2 - momento "aha!" |
| Base de conhecimento | Alimenta a personalização |
| Integração Apollo | Fonte de leads |
| Integração SignalHire | Escalonamento telefone |
| Export Snov.io/Instantly | Saída para execução |
| Multi-user com roles | Admin vs. usuário |

**Explicitly OUT of MVP:**
- ❌ Sales Navigator (complexidade de integração)
- ~~❌ Analytics avançados~~ → ✅ Antecipado: Epic 10 implementa tracking de campanhas + Janela de Oportunidade
- ❌ WhatsApp — implementação (preparação arquitetural incluída no Epic 10)
- ❌ Divisão por times (só uma empresa no MVP)

### Post-MVP Features

**Phase 2 - Growth (após validação com TDEC):**
- Integração Sales Navigator
- Analytics de campanhas dentro da plataforma
- Mais opções de exportação
- Onboarding self-service

**Phase 3 - Expansion (multi-tenant):**
- Divisão por times e permissões granulares
- Sistema de billing/assinatura
- Automação WhatsApp
- API pública para integrações custom
- Multi-tenant onboarding

### Risk Mitigation Strategy

**Risco Técnico #1: Geração de Texto Contextualizada (CRÍTICO)**

| Aspecto | Estratégia |
|---------|------------|
| **Problema** | IA gerar texto genérico ou "robótico" |
| **Mitigação** | Base de conhecimento rica + exemplos reais do Marco |
| **Validação** | Teste cego: Marco distingue IA vs. ele mesmo? |
| **Fallback** | Edição manual sempre disponível |
| **Meta** | >70% aprovação sem edição |

**Risco Técnico #2: Integrações com APIs (CRÍTICO)**

| Aspecto | Estratégia |
|---------|------------|
| **Problema** | APIs externas falharem ou mudarem |
| **Mitigação** | Arquitetura modular, tratamento de erros robusto |
| **Validação** | Testes de integração antes de cada deploy |
| **Fallback** | Mensagens claras + alternativas manuais |
| **Meta** | <1% de falhas não tratadas |

**Risco Técnico #3: Busca Conversacional**

| Aspecto | Estratégia |
|---------|------------|
| **Problema** | IA não entender o que o usuário quer |
| **Mitigação** | Prompts bem desenhados + exemplos de treino |
| **Validação** | Marco consegue buscar sem ajuda? |
| **Fallback** | Filtros tradicionais sempre disponíveis |
| **Meta** | >80% de buscas bem-sucedidas via conversa |

**Risco de Mercado:**
- Mitigação: Validação com usuário real (Marco) antes de escalar
- Se Marco não adotar → pivotar ou ajustar antes de investir em multi-tenant

**Risco de Recursos:**
- MVP mínimo pode ser entregue por 1 dev full-stack + uso de APIs de IA
- Se recursos limitados: priorizar texto contextualizado > busca conversacional

## Functional Requirements

### Lead Acquisition (Aquisição de Leads)

- **FR1:** Usuário pode buscar leads via linguagem natural conversacional (ex: "Me busca 50 leads de empresas de tecnologia em SP")
- **FR2:** Usuário pode buscar leads usando filtros tradicionais (setor, tamanho, localização, etc.)
- **FR3:** Usuário pode salvar filtros de busca como favoritos para reutilização
- **FR4:** Usuário pode visualizar resultados de busca em formato de tabela
- **FR5:** Usuário pode selecionar leads individualmente ou em lote
- **FR6:** Sistema traduz busca conversacional em parâmetros de API do Apollo

### Lead Management (Gestão de Leads)

- **FR7:** Usuário pode organizar leads em segmentos/listas
- **FR8:** Usuário pode atribuir status a leads (novo, em campanha, interessado, oportunidade)
- **FR9:** Usuário pode visualizar histórico de interações com um lead
- **FR10:** Usuário pode buscar telefone de um lead específico (integração SignalHire)
- **FR11:** Sistema destaca visualmente leads que demonstraram interesse
- **FR12:** Usuário pode importar resultados de campanhas externas (respostas, interesse)

### Campaign Building (Construção de Campanhas)

- **FR13:** Usuário pode criar sequências de email usando builder visual drag-and-drop
- **FR14:** Usuário pode adicionar múltiplos touchpoints (emails) em uma sequência
- **FR15:** Usuário pode definir intervalos entre touchpoints
- **FR16:** Sistema sugere intervalos baseados em boas práticas
- **FR17:** Usuário pode criar múltiplas campanhas simultaneamente
- **FR18:** Usuário pode associar leads selecionados a uma campanha
- **FR19:** Usuário pode visualizar preview da campanha antes de exportar

### AI Content Generation (Geração de Conteúdo com IA)

- **FR20:** Usuário pode gerar texto de email usando IA contextualizada
- **FR21:** Sistema utiliza base de conhecimento do tenant para personalizar textos
- **FR22:** Sistema gera quebra-gelos personalizados baseados em informações do lead
- **FR23:** Usuário pode editar manualmente textos gerados pela IA
- **FR24:** Usuário pode regenerar texto se não estiver satisfeito
- **FR25:** Sistema mantém tom de voz configurado pelo tenant
- **FR26:** Sistema utiliza exemplos de comunicação bem-sucedida como referência

### External Integrations (Integrações Externas)

- **FR27:** Sistema integra com Apollo API para busca de leads
- **FR28:** Sistema integra com SignalHire API para busca de telefones
- **FR29:** Usuário pode exportar campanhas para Snov.io via API
- **FR30:** Usuário pode exportar campanhas para Instantly via API
- **FR31:** Usuário pode copiar campanha para exportação manual (Ramper)
- **FR32:** Sistema exibe mensagens claras quando APIs externas falham ou atingem limites
- **FR33:** Sistema oferece fallback manual quando integração falha

### User Management (Gestão de Usuários)

- **FR34:** Usuário pode fazer login no sistema
- **FR35:** Admin pode convidar novos usuários para o tenant
- **FR36:** Admin pode remover usuários do tenant
- **FR37:** Sistema diferencia permissões entre Admin e Usuário regular
- **FR38:** Todos os usuários do mesmo tenant compartilham acesso aos mesmos dados

### Administration (Administração)

- **FR39:** Admin pode configurar API keys das integrações (Apollo, SignalHire, Snov.io, Instantly)
- **FR40:** Admin pode testar conexão de cada integração configurada
- **FR41:** Admin pode criar e editar base de conhecimento do tenant
- **FR42:** Admin pode adicionar descrição da empresa e produtos
- **FR43:** Admin pode configurar tom de voz preferido (formal, casual, técnico)
- **FR44:** Admin pode adicionar exemplos de emails bem-sucedidos
- **FR45:** Admin pode definir informações sobre ICP (Ideal Customer Profile)

### Interface & Experience (Interface e Experiência)

- **FR46:** Sistema apresenta interface visual clean no estilo Attio/Airtable
- **FR47:** Usuário pode navegar entre áreas principais (leads, campanhas, configurações)
- **FR48:** Sistema exibe feedback visual de ações em andamento (loading states)
- **FR49:** Sistema exibe notificações de sucesso e erro de forma clara

### Campaign Tracking & Janela de Oportunidade

*Adicionado via Sprint Change Proposal 2026-02-09. Referência: [sprint-change-proposal-2026-02-09.md](sprint-change-proposal-2026-02-09.md)*

- **FR50:** Sistema recebe eventos de tracking (opens, clicks, replies) via webhook do Instantly em tempo real
- **FR51:** Sistema exibe dashboard de métricas por campanha (opens, clicks, replies, bounces, taxas percentuais)
- **FR52:** Sistema identifica leads com email_open_count acima do threshold configurado pelo usuário (Janela de Oportunidade)
- **FR53:** Usuário pode configurar threshold da Janela de Oportunidade (mínimo de aberturas e período em dias)
- **FR54:** Sistema exibe lista de leads na Janela de Oportunidade com dados de tracking individuais por lead
- **FR55:** Sistema faz polling de analytics da API Instantly como backup/sincronização dos webhooks
- **FR56:** Arquitetura suporta extensão para automação de WhatsApp baseada na Janela de Oportunidade (interfaces preparadas, sem implementação)

## Non-Functional Requirements

### Performance

- **NFR-P1:** Busca de leads (Apollo) retorna em <3 segundos
- **NFR-P2:** Geração de texto IA completa em <5 segundos
- **NFR-P3:** Exportação de campanha completa em <10 segundos
- **NFR-P4:** Interface carrega em <2 segundos após login
- **NFR-P5:** Sistema suporta uso simultâneo de 10 usuários

### Security

- **NFR-S1:** API keys de terceiros armazenadas criptografadas
- **NFR-S2:** API keys nunca expostas no frontend
- **NFR-S3:** Dados isolados por tenant_id em todas as queries
- **NFR-S4:** Sessões expiram após 24h de inatividade
- **NFR-S5:** Todas as comunicações via HTTPS
- **NFR-S6:** Logs de auditoria para ações admin

### Integration

- **NFR-I1:** Sistema trata graciosamente falhas de APIs externas
- **NFR-I2:** Retry automático 1x para timeouts de API
- **NFR-I3:** Mensagens de erro traduzidas para português
- **NFR-I4:** Fallback manual disponível para cada integração
- **NFR-I5:** Testes de conexão validam APIs antes do uso

### Scalability (Preparação)

- **NFR-SC1:** Arquitetura suporta adição de novos tenants sem mudança de código
- **NFR-SC2:** Database schema com tenant_id em todas as tabelas

