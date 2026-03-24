---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - product-brief-tdec-prospect-2026-03-24.md
  - architecture.md
  - ux-design-specification.md
---

# tdec-prospect - Epic Breakdown: Technographic Prospecting

## Overview

This document provides the epic and story breakdown for the Technographic Prospecting feature of tdec-prospect, decomposing requirements from the Product Brief into implementable stories.

## Requirements Inventory

### Functional Requirements

**Integracao theirStack**
- FR1: Admin pode configurar API key do theirStack na pagina de integracoes existente
- FR2: Sistema testa conexao com a API do theirStack e exibe status
- FR3: Sistema exibe consumo de credits do theirStack (utilizados vs. disponiveis)

**Busca Technografica**
- FR4: Usuario pode buscar tecnologias com autocomplete do catalogo theirStack (33.000+ tecnologias)
- FR5: Usuario pode aplicar filtros complementares na busca: pais, tamanho de empresa, industria, nivel de confianca
- FR6: Sistema exibe resultados em tabela com: nome da empresa, dominio, industria, tamanho, score de confianca, tecnologias detectadas

**Apollo Bridge (Empresa para Contato)**
- FR7: Usuario pode selecionar empresas dos resultados (individual e em lote)
- FR8: Sistema busca contatos via Apollo nas empresas selecionadas, com filtro por cargos-alvo
- FR9: Sistema exibe contatos encontrados com informacoes relevantes (nome, cargo, email, empresa)

**Integracao com Pipeline Existente**
- FR10: Usuario pode criar leads a partir dos contatos selecionados
- FR11: Usuario pode adicionar leads criados a segmentos/listas existentes

### NonFunctional Requirements

**Security**
- NFR-S1: API key do theirStack armazenada criptografada via Supabase Vault (padrao existente)
- NFR-S2: API key nunca exposta no frontend
- NFR-S3: Dados isolados por tenant_id com RLS (padrao existente)

**Performance**
- NFR-P1: Busca technografica retorna em <3 segundos

**Integration**
- NFR-I1: Retry automatico 1x para timeouts da API theirStack
- NFR-I2: Mensagens de erro em portugues quando API falha ou credits esgotados
- NFR-I3: Rate limiting respeitado (free tier: 4/sec, 10/min, 50/hr, 400/day)

### Additional Requirements

**Da Arquitetura:**
- theirStack service deve implementar interface `ExternalAPIService` (padrao: `testConnection()`, `handleError()`)
- API routes para isolamento e error handling (nao Server Actions) para integracao externa
- TanStack Query para cache e refetch dos resultados
- Bearer token auth para theirStack API (`Authorization: Bearer <token>`)
- Endpoints: `POST /v1/companies/search` (3 credits), `POST /v1/jobs/search` (1 credit), `GET /v0/catalog/keywords` (free)

**Do UX Design:**
- Visual segue padrao premium existente (dark mode, tabelas estilo Airtable, shadcn/ui)
- Interface em portugues brasileiro
- Selecao em lote segue padrao existente de selecao de leads (checkbox + acoes em lote)
- Loading states e feedback visual durante buscas API

### FR Coverage Map

| FR | Epic | Story | Descricao |
|----|------|-------|-----------|
| FR1 | Epic 15 | 15.1 | Configuracao API key theirStack |
| FR2 | Epic 15 | 15.1 | Teste de conexao theirStack |
| FR3 | Epic 15 | 15.1 | Monitoramento de credits |
| FR4 | Epic 15 | 15.2 | Busca por tecnologia com autocomplete |
| FR5 | Epic 15 | 15.2 | Filtros complementares |
| FR6 | Epic 15 | 15.3 | Tabela de resultados de empresas |
| FR7 | Epic 15 | 15.3 | Selecao de empresas |
| FR8 | Epic 15 | 15.4 | Busca de contatos via Apollo |
| FR9 | Epic 15 | 15.4 | Visualizacao de contatos |
| FR10 | Epic 15 | 15.5 | Criacao de leads |
| FR11 | Epic 15 | 15.5 | Adicao a segmentos/listas |

## Epic List

### Epic 15: Technographic Prospecting
Usuarios podem descobrir empresas que utilizam tecnologias especificas, encontrar contatos relevantes nessas empresas via Apollo, e criar leads para alimentar o pipeline de prospeccao existente -- habilitando campanhas segmentadas por stack tecnologica.

**FRs cobertos:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11

**Entregaveis:**
- Integracao theirStack configuravel na pagina de integracoes (API key, teste, credits)
- Interface de busca por tecnologia com autocomplete e filtros
- Tabela de resultados de empresas com score de confianca
- Apollo Bridge: busca de contatos nas empresas selecionadas
- Criacao de leads e adicao a segmentos existentes

---

## Epic 15: Technographic Prospecting

Usuarios podem descobrir empresas que utilizam tecnologias especificas, encontrar contatos relevantes nessas empresas via Apollo, e criar leads para alimentar o pipeline de prospeccao existente -- habilitando campanhas segmentadas por stack tecnologica.

### Story 15.1: Integracao theirStack -- Configuracao, Teste e Credits

As a Admin,
I want configurar a API key do theirStack, testar a conexao e visualizar o consumo de credits,
So that o sistema esteja pronto para realizar buscas technograficas com visibilidade do uso.

**Acceptance Criteria:**

**Given** o Admin esta na pagina de integracoes
**When** adiciona a API key do theirStack no campo dedicado
**Then** a key e armazenada criptografada via Supabase Vault
**And** a key nunca e exposta no frontend

**Given** a API key do theirStack esta configurada
**When** o Admin clica em "Testar Conexao"
**Then** o sistema chama a API do theirStack para validar a key
**And** exibe status de sucesso ou erro com mensagem em portugues

**Given** a integracao theirStack esta ativa
**When** o Admin visualiza o card da integracao
**Then** o sistema exibe credits utilizados vs. disponiveis no mes (ex: "12/50 company credits")
**And** os dados sao obtidos via endpoint GET /v1/account/credits

**Given** a API key e invalida ou expirada
**When** o sistema tenta conectar
**Then** exibe mensagem de erro clara em portugues orientando o usuario

### Story 15.2: Busca Technografica -- Autocomplete e Filtros

As a Usuario,
I want buscar tecnologias com autocomplete e aplicar filtros complementares,
So that eu consiga encontrar empresas que usam uma tecnologia especifica com precisao.

**Acceptance Criteria:**

**Given** o Usuario esta na pagina de Technographic Prospecting
**When** digita no campo de busca de tecnologia (ex: "Nets")
**Then** o sistema consulta GET /v0/catalog/keywords e exibe sugestoes em autocomplete
**And** as sugestoes mostram nome da tecnologia e categoria

**Given** o Usuario selecionou uma tecnologia no autocomplete
**When** visualiza o painel de filtros
**Then** pode aplicar filtros complementares: pais, tamanho de empresa (min/max funcionarios), industria, nivel de confianca (low/medium/high)

**Given** o Usuario configurou tecnologia e filtros
**When** clica em "Buscar"
**Then** o sistema chama POST /v1/companies/search com os parametros
**And** respeita rate limiting do free tier (4/sec, 10/min, 50/hr, 400/day)
**And** a busca retorna em <3 segundos

**Given** a API do theirStack falha ou retorna timeout
**When** o sistema detecta o erro
**Then** realiza 1 retry automatico
**And** se falhar novamente, exibe mensagem de erro em portugues

**Given** os credits do free tier estao esgotados
**When** o Usuario tenta realizar uma busca
**Then** o sistema exibe mensagem informando que os credits mensais foram consumidos
**And** indica a data de renovacao

### Story 15.3: Resultados de Empresas -- Tabela e Selecao

As a Usuario,
I want visualizar os resultados da busca technografica em tabela e selecionar empresas,
So that eu consiga identificar e escolher as empresas mais relevantes para prospectar.

**Acceptance Criteria:**

**Given** a busca technografica retornou resultados
**When** o Usuario visualiza a tabela de resultados
**Then** exibe colunas: nome da empresa, dominio, industria, tamanho (funcionarios), score de confianca, tecnologias detectadas
**And** o visual segue padrao premium existente (dark mode, estilo Airtable, shadcn/ui)

**Given** os resultados estao exibidos na tabela
**When** o Usuario visualiza o score de confianca
**Then** exibe indicador visual claro (ex: badge colorido low=amarelo, medium=laranja, high=verde)

**Given** a tabela de resultados esta exibida
**When** o Usuario clica no checkbox de uma empresa
**Then** a empresa e marcada como selecionada
**And** um contador de selecao e exibido

**Given** multiplas empresas estao listadas
**When** o Usuario clica no checkbox do cabecalho
**Then** todas as empresas visiveis sao selecionadas em lote
**And** o padrao de selecao segue o comportamento existente de selecao de leads

**Given** a busca retorna muitos resultados
**When** o Usuario navega pelos resultados
**Then** o sistema suporta paginacao
**And** exibe total de resultados e credits consumidos

**Given** a busca nao retorna resultados
**When** o Usuario visualiza a pagina
**Then** exibe estado vazio com mensagem orientativa (ex: "Nenhuma empresa encontrada com essa tecnologia. Tente ajustar os filtros.")

### Story 15.4: Apollo Bridge -- Busca de Contatos nas Empresas

As a Usuario,
I want buscar contatos com cargos relevantes nas empresas selecionadas via Apollo,
So that eu consiga encontrar as pessoas certas para prospectar nessas empresas.

**Acceptance Criteria:**

**Given** o Usuario selecionou uma ou mais empresas na tabela de resultados
**When** clica em "Buscar Contatos"
**Then** o sistema exibe opcao para filtrar por cargos-alvo (ex: "CTO", "CISO", "Head of IT")

**Given** o Usuario definiu os cargos-alvo
**When** confirma a busca de contatos
**Then** o sistema busca contatos via Apollo API usando o dominio/nome das empresas selecionadas e os filtros de cargo
**And** exibe loading state durante a busca

**Given** a busca de contatos retornou resultados
**When** o Usuario visualiza a lista de contatos
**Then** exibe: nome, cargo, email, empresa, LinkedIn URL (quando disponivel)
**And** o visual segue padrao existente de exibicao de leads

**Given** a busca de contatos em uma empresa nao retorna resultados
**When** o Usuario visualiza os resultados
**Then** a empresa e exibida com indicacao "Nenhum contato encontrado com os cargos selecionados"

**Given** a API do Apollo falha
**When** o sistema detecta o erro
**Then** exibe mensagem de erro em portugues
**And** permite retry manual

### Story 15.5: Criacao de Leads e Integracao com Pipeline

As a Usuario,
I want criar leads a partir dos contatos encontrados e adiciona-los a segmentos existentes,
So that eu consiga iniciar campanhas de prospeccao segmentadas por tecnologia usando o fluxo padrao do TDEC Prospect.

**Acceptance Criteria:**

**Given** o Usuario visualiza contatos encontrados via Apollo Bridge
**When** seleciona contatos (individual ou em lote)
**Then** pode clicar em "Criar Leads"

**Given** o Usuario clicou em "Criar Leads"
**When** o sistema processa a criacao
**Then** leads sao criados no banco com tenant_id do usuario
**And** dados do lead incluem: nome, email, cargo, empresa, fonte ("theirStack + Apollo")
**And** metadado da tecnologia-alvo e preservado no lead (ex: origem "Netskope")

**Given** os leads foram criados com sucesso
**When** o sistema exibe confirmacao
**Then** mostra quantidade de leads criados
**And** oferece opcao de adicionar a um segmento/lista existente

**Given** o Usuario escolhe adicionar a um segmento
**When** seleciona o segmento no dropdown
**Then** os leads sao adicionados ao segmento escolhido
**And** exibe confirmacao de sucesso

**Given** um contato ja existe como lead no sistema (mesmo email)
**When** o Usuario tenta criar o lead
**Then** o sistema detecta a duplicata
**And** oferece opcao de pular ou atualizar o lead existente

**Given** os leads foram criados e adicionados ao segmento
**When** o Usuario navega para a area de leads/campanhas
**Then** os leads aparecem normalmente no pipeline existente
**And** podem ser usados em campanhas, enriquecimento e export como qualquer outro lead
