---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# tdec-prospect - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for tdec-prospect, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Lead Acquisition (Aquisição de Leads)**
- FR1: Usuário pode buscar leads via linguagem natural conversacional (ex: "Me busca 50 leads de empresas de tecnologia em SP")
- FR2: Usuário pode buscar leads usando filtros tradicionais (setor, tamanho, localização, etc.)
- FR3: Usuário pode salvar filtros de busca como favoritos para reutilização
- FR4: Usuário pode visualizar resultados de busca em formato de tabela
- FR5: Usuário pode selecionar leads individualmente ou em lote
- FR6: Sistema traduz busca conversacional em parâmetros de API do Apollo

**Lead Management (Gestão de Leads)**
- FR7: Usuário pode organizar leads em segmentos/listas
- FR8: Usuário pode atribuir status a leads (novo, em campanha, interessado, oportunidade)
- FR9: Usuário pode visualizar histórico de interações com um lead
- FR10: Usuário pode buscar telefone de um lead específico (integração SignalHire)
- FR11: Sistema destaca visualmente leads que demonstraram interesse
- FR12: Usuário pode importar resultados de campanhas externas (respostas, interesse)

**Campaign Building (Construção de Campanhas)**
- FR13: Usuário pode criar sequências de email usando builder visual drag-and-drop
- FR14: Usuário pode adicionar múltiplos touchpoints (emails) em uma sequência
- FR15: Usuário pode definir intervalos entre touchpoints
- FR16: Sistema sugere intervalos baseados em boas práticas
- FR17: Usuário pode criar múltiplas campanhas simultaneamente
- FR18: Usuário pode associar leads selecionados a uma campanha
- FR19: Usuário pode visualizar preview da campanha antes de exportar

**AI Content Generation (Geração de Conteúdo com IA)**
- FR20: Usuário pode gerar texto de email usando IA contextualizada
- FR21: Sistema utiliza base de conhecimento do tenant para personalizar textos
- FR22: Sistema gera quebra-gelos personalizados baseados em informações do lead
- FR23: Usuário pode editar manualmente textos gerados pela IA
- FR24: Usuário pode regenerar texto se não estiver satisfeito
- FR25: Sistema mantém tom de voz configurado pelo tenant
- FR26: Sistema utiliza exemplos de comunicação bem-sucedida como referência

**External Integrations (Integrações Externas)**
- FR27: Sistema integra com Apollo API para busca de leads
- FR28: Sistema integra com SignalHire API para busca de telefones
- FR29: Usuário pode exportar campanhas para Snov.io via API
- FR30: Usuário pode exportar campanhas para Instantly via API
- FR31: Usuário pode copiar campanha para exportação manual (Ramper)
- FR32: Sistema exibe mensagens claras quando APIs externas falham ou atingem limites
- FR33: Sistema oferece fallback manual quando integração falha

**User Management (Gestão de Usuários)**
- FR34: Usuário pode fazer login no sistema
- FR35: Admin pode convidar novos usuários para o tenant
- FR36: Admin pode remover usuários do tenant
- FR37: Sistema diferencia permissões entre Admin e Usuário regular
- FR38: Todos os usuários do mesmo tenant compartilham acesso aos mesmos dados

**Administration (Administração)**
- FR39: Admin pode configurar API keys das integrações (Apollo, SignalHire, Snov.io, Instantly)
- FR40: Admin pode testar conexão de cada integração configurada
- FR41: Admin pode criar e editar base de conhecimento do tenant
- FR42: Admin pode adicionar descrição da empresa e produtos
- FR43: Admin pode configurar tom de voz preferido (formal, casual, técnico)
- FR44: Admin pode adicionar exemplos de emails bem-sucedidos
- FR45: Admin pode definir informações sobre ICP (Ideal Customer Profile)

**Interface & Experience (Interface e Experiência)**
- FR46: Sistema apresenta interface visual clean no estilo Attio/Airtable
- FR47: Usuário pode navegar entre áreas principais (leads, campanhas, configurações)
- FR48: Sistema exibe feedback visual de ações em andamento (loading states)
- FR49: Sistema exibe notificações de sucesso e erro de forma clara

### NonFunctional Requirements

**Performance**
- NFR-P1: Busca de leads (Apollo) retorna em <3 segundos
- NFR-P2: Geração de texto IA completa em <5 segundos
- NFR-P3: Exportação de campanha completa em <10 segundos
- NFR-P4: Interface carrega em <2 segundos após login
- NFR-P5: Sistema suporta uso simultâneo de 10 usuários

**Security**
- NFR-S1: API keys de terceiros armazenadas criptografadas
- NFR-S2: API keys nunca expostas no frontend
- NFR-S3: Dados isolados por tenant_id em todas as queries
- NFR-S4: Sessões expiram após 24h de inatividade
- NFR-S5: Todas as comunicações via HTTPS
- NFR-S6: Logs de auditoria para ações admin

**Integration**
- NFR-I1: Sistema trata graciosamente falhas de APIs externas
- NFR-I2: Retry automático 1x para timeouts de API
- NFR-I3: Mensagens de erro traduzidas para português
- NFR-I4: Fallback manual disponível para cada integração
- NFR-I5: Testes de conexão validam APIs antes do uso

**Scalability (Preparação)**
- NFR-SC1: Arquitetura suporta adição de novos tenants sem mudança de código
- NFR-SC2: Database schema com tenant_id em todas as tabelas

### Additional Requirements

**Da Arquitetura:**
- **STARTER TEMPLATE (Epic 1, Story 1):** Next.js + shadcn/ui (abordagem limpa) - projeto greenfield
  - `npx create-next-app@latest tdec-prospect --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
  - `npx shadcn init`
  - Instalar: @supabase/supabase-js, @supabase/ssr, @tanstack/react-query, zustand, zod, react-hook-form, @dnd-kit/core, @dnd-kit/sortable, framer-motion
- Supabase Cloud para Database + Auth + RLS
- Multi-tenancy com Row Level Security desde MVP
- OpenAI/Anthropic para IA (configurável por tenant)
- TanStack Query v5 para server state
- Zustand para UI state
- @dnd-kit para drag-and-drop acessível
- Framer Motion para animações
- Vercel para hosting
- Padrões de naming: snake_case (DB), camelCase (código), PascalCase (componentes)
- External Service Pattern com error handling padronizado
- API Response Format padronizado com error codes

**Do UX Design:**
- Dark Mode Premium como padrão (background #070C1B)
- Light Mode como alternativa (toggle persistente)
- Builder Visual Drag-and-Drop como experiência central
- Componentes customizados: AISearchInput, BuilderCanvas, EmailBlock, SequenceConnector, LeadCard
- BuilderCanvas com grid de dots sutis (1px, 24px espaçamento)
- Micro-animações: blocos com pulse ao gerar, streaming de texto, draw line nos conectores
- shadcn/ui + Tailwind CSS v4 como design system base
- Responsive: Desktop-first (P0), Tablet support (P1), Mobile baixa prioridade (P2)
- Accessibility: WCAG 2.1 AA, keyboard navigation, screen reader support
- Espaçamento: base 4px, múltiplos de 8
- Tipografia: Inter (principal), JetBrains Mono (código)
- Border radius: 6px (default), 8px (cards), 12px (modais)

### FR Coverage Map

| FR | Epic | Descrição |
|----|------|-----------|
| FR1 | Epic 3 | Busca conversacional IA |
| FR2 | Epic 3 | Busca por filtros |
| FR3 | Epic 3 | Filtros salvos |
| FR4 | Epic 3 | Visualização em tabela |
| FR5 | Epic 3 | Seleção de leads |
| FR6 | Epic 3 | Tradução de busca para Apollo |
| FR7 | Epic 4 | Segmentos/listas |
| FR8 | Epic 4 | Status de leads |
| FR9 | Epic 4 | Histórico de interações |
| FR10 | Epic 4 | Busca de telefone |
| FR11 | Epic 4 | Destaque de interessados |
| FR12 | Epic 4 | Importação de resultados |
| FR13 | Epic 5 | Builder drag-and-drop |
| FR14 | Epic 5 | Múltiplos touchpoints |
| FR15 | Epic 5 | Intervalos entre touchpoints |
| FR16 | Epic 5 | Sugestão de intervalos |
| FR17 | Epic 5 | Múltiplas campanhas |
| FR18 | Epic 5 | Associar leads à campanha |
| FR19 | Epic 5 | Preview da campanha |
| FR20 | Epic 6 | Geração de texto IA |
| FR21 | Epic 6 | Base de conhecimento |
| FR22 | Epic 6 + 6.5 | Quebra-gelos personalizados (básico: 6, premium com LinkedIn: 6.5) |
| FR23 | Epic 6 | Edição manual |
| FR24 | Epic 6 | Regenerar texto |
| FR25 | Epic 6 | Tom de voz |
| FR26 | Epic 6 | Exemplos de comunicação |
| FR27 | Epic 3 | Integração Apollo |
| FR28 | Epic 4 | Integração SignalHire |
| FR29 | Epic 7 | Export Snov.io |
| FR30 | Epic 7 | Export Instantly |
| FR31 | Epic 7 | Cópia manual |
| FR32 | Epic 7 | Mensagens de erro |
| FR33 | Epic 7 | Fallback manual |
| FR34 | Epic 1 | Login |
| FR35 | Epic 2 | Convidar usuários |
| FR36 | Epic 2 | Remover usuários |
| FR37 | Epic 1 | Permissões Admin/User |
| FR38 | Epic 1 | Dados compartilhados por tenant |
| FR39 | Epic 2 | Config API keys |
| FR40 | Epic 2 | Testar conexões |
| FR41 | Epic 2 | Base de conhecimento |
| FR42 | Epic 2 | Descrição empresa |
| FR43 | Epic 2 | Tom de voz |
| FR44 | Epic 2 | Exemplos de email |
| FR45 | Epic 2 | ICP |
| FR46 | Epic 1 | Interface visual Attio |
| FR47 | Epic 1 | Navegação principal |
| FR48 | Cross-cutting | Loading states (implementado ao longo dos epics) |
| FR49 | Cross-cutting | Notificações (implementado ao longo dos epics) |

## Epic List

### Epic 1: Foundation & Authentication
Usuários podem acessar o sistema de forma segura com isolamento multi-tenant, navegando por uma interface visual premium no estilo Attio.

**FRs cobertos:** FR34, FR37, FR38, FR46, FR47

**Entregáveis:**
- Projeto inicializado com starter template (Next.js + shadcn/ui)
- UI shell com sidebar e navegação principal
- Autenticação via Supabase Auth
- Estrutura multi-tenant com RLS
- Dark mode premium como padrão

---

### Epic 2: Administration & Configuration
Admin pode configurar completamente o sistema (APIs, base de conhecimento, usuários) antes do uso pela equipe.

**FRs cobertos:** FR35, FR36, FR39, FR40, FR41, FR42, FR43, FR44, FR45

**Entregáveis:**
- Página de configuração de integrações
- Configuração de API keys (Apollo, SignalHire, Snov.io, Instantly)
- Teste de conexão para cada integração
- Editor de base de conhecimento
- Gestão de usuários do tenant

---

### Epic 3: Lead Discovery
Usuários podem buscar e encontrar leads relevantes de forma rápida usando busca conversacional com IA ou filtros tradicionais.

**FRs cobertos:** FR1, FR2, FR3, FR4, FR5, FR6, FR27

**Entregáveis:**
- AISearchInput para busca conversacional
- Painel de filtros tradicionais
- Sistema de filtros salvos/favoritos
- LeadTable com visualização elegante
- Seleção individual e em lote
- Integração completa com Apollo API

---

### Epic 4: Lead Management
Usuários podem organizar, acompanhar status e escalonar leads com busca de telefone on-demand.

**FRs cobertos:** FR7, FR8, FR9, FR10, FR11, FR12, FR28

**Entregáveis:**
- Sistema de segmentos/listas
- Gestão de status de leads
- Histórico de interações
- Busca de telefone via SignalHire
- Destaque visual de leads interessados
- Importação de resultados externos

---

### Epic 5: Campaign Builder
Usuários podem construir visualmente sequências de campanha usando drag-and-drop com experiência premium.

**FRs cobertos:** FR13, FR14, FR15, FR16, FR17, FR18, FR19

**Entregáveis:**
- BuilderCanvas com grid de dots
- EmailBlock arrastável
- DelayBlock para intervalos
- SequenceConnector visual
- Sugestão inteligente de intervalos
- Associação de leads à campanha
- Preview da campanha

---

### Epic 6: AI Content Generation
Usuários obtêm textos personalizados que soam autênticos, usando a base de conhecimento, tom de voz e contexto de produto específico configurados. Inclui também geração automatizada de estrutura de campanha.

**FRs cobertos:** FR20, FR21, FR22 (básico), FR23, FR24, FR25, FR26 + NEW (AI Campaign Generation, Product Context)

**Entregáveis:**
- AITextGenerator integrado ao builder
- Geração contextualizada com streaming
- **[NEW]** Catálogo de produtos com CRUD completo
- **[NEW]** Contexto de produto específico por campanha
- Quebra-gelos personalizados por lead (com contexto de produto)
- Edição inline de textos
- Botão de regenerar
- Aplicação de tom de voz
- Uso de exemplos de sucesso
- Geração automática de estrutura de campanha com IA
- Templates de campanha pré-configurados baseados em pesquisa

---

### Epic 6.5: Icebreaker Premium
Usuários podem gerar icebreakers altamente personalizados baseados nos posts reais do LinkedIn do lead, criando conexões genuínas que aumentam drasticamente as taxas de resposta.

**FRs cobertos:** FR22 (versão premium/enhanced)

**Entregáveis:**
- Integração Apify na página de configurações
- Serviço de extração de posts do LinkedIn
- Prompt específico e configurável para icebreaker
- API de enriquecimento de leads com icebreaker
- Coluna icebreaker na tabela de leads
- UI para geração on-demand de icebreakers
- Integração com geração de emails existente

---

### Epic 8: Visual Refresh - Clean B&W Theme
Transformação visual do sistema de um tema dark com tons azulados para um tema clean preto e branco neutro, inspirado no UI TripleD.

**FRs cobertos:** FR46 (Interface visual clean - enhanced)

**Contexto:** Mudança puramente visual, sem impacto funcional. Objetivo é modernizar a aparência com estilo minimalista B&W e componentes animados premium.

**Entregáveis:**
- Paleta de cores B&W para dark mode (remover saturação azul)
- Paleta de cores B&W para light mode
- Charts em grayscale
- Componentes UI TripleD (Native Magnetic, Glass Cards, Animated Lists, etc.)
- QA visual de todas as telas

**Referência:** ui.tripled.work

---

### Epic 7: Campaign Deployment & Export
Usuários podem exportar campanhas personalizadas para plataformas de cold email (Instantly, Snov.io) e via CSV/clipboard, com sistema completo de variáveis de personalização mapeadas para as tags de cada plataforma.

**FRs cobertos:** FR29, FR30, FR31, FR32, FR33

**Entregáveis:**
- Sistema de variáveis de personalização (`{{first_name}}`, `{{company_name}}`, `{{title}}`, `{{ice_breaker}}`) com motor de substituição
- Mapeamento de variáveis internas → tags de cada plataforma
- Export para Instantly via API (campanha + leads + sequência com tags)
- Export para Snov.io via API (drip campaign + recipients)
- Exportação CSV com variáveis ou resolvido por lead
- Copy formatado para clipboard (import manual em qualquer ferramenta)
- Validação pré-export e mensagens de erro em português com fallback manual
- Loading states elegantes
- Sistema de notificações toast

---

## Epic 1: Foundation & Authentication

Usuários podem acessar o sistema de forma segura com isolamento multi-tenant, navegando por uma interface visual premium no estilo Attio.

### Story 1.1: Project Initialization with Starter Template

As a developer,
I want the project initialized with the defined tech stack,
So that I have a solid foundation to build upon.

**Acceptance Criteria:**

**Given** the development environment is ready
**When** I run the initialization commands
**Then** the Next.js project is created with TypeScript, Tailwind, ESLint
**And** shadcn/ui is initialized with the project
**And** all core dependencies are installed (@supabase/supabase-js, @supabase/ssr, @tanstack/react-query, zustand, zod, react-hook-form, @dnd-kit/core, @dnd-kit/sortable, framer-motion)
**And** the project structure follows the architecture specification (src/app, src/components, src/lib, etc.)
**And** environment variables template (.env.example) is created

---

### Story 1.2: Design System & Theme Configuration

As a user,
I want the application to have a polished dark mode interface,
So that I have a premium visual experience.

**Acceptance Criteria:**

**Given** the project is initialized
**When** I access the application
**Then** I see the dark mode theme as default (background #070C1B)
**And** CSS custom properties are configured for all design tokens
**And** typography uses Inter (primary) and JetBrains Mono (code)
**And** spacing follows the 4px base scale
**And** border radius follows the specification (6px default, 8px cards, 12px modals)
**And** light mode toggle is available with localStorage persistence

---

### Story 1.3: Application Shell with Navigation

As a user,
I want a clean sidebar navigation,
So that I can easily navigate between main areas of the application.

**Acceptance Criteria:**

**Given** I am on the application
**When** the page loads
**Then** I see a sidebar (240px width) with navigation items
**And** the sidebar shows icons + labels for: Leads, Campanhas, Configurações
**And** the sidebar can collapse to 64px (icons only)
**And** there is a header (64px height) with user info and theme toggle
**And** the active route is visually highlighted
**And** navigation is keyboard accessible

---

### Story 1.4: Supabase Authentication Setup

As a user,
I want to log in to the system securely,
So that my data is protected and isolated.

**Acceptance Criteria:**

**Given** I am not authenticated
**When** I access any protected route
**Then** I am redirected to the login page
**And** I can log in with email/password via Supabase Auth
**And** successful login redirects me to the dashboard
**And** my session is stored in cookies (SSR compatible)
**And** session expires after 24h of inactivity (NFR-S4)

**Given** I am authenticated
**When** I access the application
**Then** I can see my user information in the header
**And** I can log out with one click

---

### Story 1.5: Multi-tenant Database Structure & RLS

As a user,
I want my data isolated from other tenants,
So that my information is private and secure.

**Acceptance Criteria:**

**Given** I am authenticated
**When** any database query is executed
**Then** it is automatically filtered by my tenant_id
**And** I cannot access data from other tenants
**And** the tenants table is created with id, name, created_at
**And** the users table links to tenants via tenant_id
**And** the profiles table stores user metadata (name, role)
**And** RLS policies are created for tenant isolation
**And** Admin role is differentiated from User role (FR37)

---

## Epic 2: Administration & Configuration

Admin pode configurar completamente o sistema (APIs, base de conhecimento, usuários) antes do uso pela equipe.

### Story 2.1: Settings Page Structure & API Configuration UI

As an admin,
I want a settings page to configure integrations,
So that I can connect external services to the platform.

**Acceptance Criteria:**

**Given** I am authenticated as Admin
**When** I navigate to Configurações
**Then** I see a settings page with tabs: Integrações, Base de Conhecimento, Equipe
**And** the Integrações tab shows cards for: Apollo, SignalHire, Snov.io, Instantly
**And** each integration card has fields for API key input
**And** API keys are masked by default with option to reveal
**And** there is a "Salvar" button for each integration

---

### Story 2.2: API Keys Storage & Encryption

As an admin,
I want my API keys stored securely,
So that they are protected from unauthorized access.

**Acceptance Criteria:**

**Given** I am on the integrations settings page
**When** I save an API key
**Then** the key is encrypted before storage in database
**And** the key is stored in api_configs table with tenant_id
**And** the key is never returned to the frontend in plain text
**And** only the last 4 characters are shown for verification
**And** the api_configs table is created with: id, tenant_id, service_name, encrypted_key, created_at, updated_at

---

### Story 2.3: Integration Connection Testing

As an admin,
I want to test each integration connection,
So that I know the API keys are valid before using the system.

**Acceptance Criteria:**

**Given** I have configured an API key for Apollo
**When** I click "Testar Conexão"
**Then** the system makes a test request to the Apollo API
**And** I see a loading state during the test
**And** success shows "✓ Conexão estabelecida com sucesso"
**And** failure shows clear error message in Portuguese
**And** the test result is displayed inline on the card

**Given** I test all integrations
**When** each test completes
**Then** I can see the status of each (connected/not configured/error)

---

### Story 2.4: Knowledge Base Editor - Company Profile

As an admin,
I want to configure my company's information for AI context,
So that generated texts reflect my business accurately.

**Acceptance Criteria:**

**Given** I am on Base de Conhecimento tab
**When** the page loads
**Then** I see sections for: Empresa, Tom de Voz, Exemplos, ICP
**And** the Empresa section has fields for:
  - Nome da empresa
  - Descrição do negócio (textarea)
  - Produtos/serviços oferecidos (textarea)
  - Diferenciais competitivos (textarea)
**And** I can save each section independently
**And** the knowledge_base table is created with: id, tenant_id, section, content, updated_at

---

### Story 2.5: Knowledge Base Editor - Tone & Examples

As an admin,
I want to configure tone of voice and successful email examples,
So that AI generates content matching my communication style.

**Acceptance Criteria:**

**Given** I am on Base de Conhecimento tab
**When** I access Tom de Voz section
**Then** I can select from: Formal, Casual, Técnico
**And** I can add custom tone description
**And** I can provide writing guidelines

**When** I access Exemplos section
**Then** I can add multiple email examples that worked well
**And** each example has fields: subject, body, context
**And** I can add, edit, and remove examples
**And** examples are stored in knowledge_base_examples table

---

### Story 2.6: Knowledge Base Editor - ICP Definition

As an admin,
I want to define my Ideal Customer Profile,
So that AI can personalize outreach appropriately.

**Acceptance Criteria:**

**Given** I am on Base de Conhecimento tab
**When** I access ICP section
**Then** I can define:
  - Target company size (employee range)
  - Target industries/sectors
  - Target job titles
  - Geographic focus
  - Pain points we solve
  - Common objections
**And** this information is saved to knowledge_base table
**And** it can be used by AI for personalization context

---

### Story 2.7: Team Management - Invite & Remove Users

As an admin,
I want to manage team members,
So that I can control who has access to the system.

**Acceptance Criteria:**

**Given** I am on Equipe tab
**When** the page loads
**Then** I see a list of current team members with: name, email, role, status
**And** I see an "Convidar Usuário" button

**When** I click "Convidar Usuário"
**Then** I can enter an email address
**And** I can select role: Admin or Usuário
**And** an invitation is sent via Supabase Auth
**And** pending invitations are shown in the list

**When** I click "Remover" on a user
**Then** I see a confirmation dialog
**And** upon confirmation, the user is removed from the tenant
**And** I cannot remove myself if I'm the only admin

---

## Epic 3: Lead Discovery

Usuários podem buscar e encontrar leads relevantes de forma rápida usando busca conversacional com IA ou filtros tradicionais.

### Story 3.1: Leads Page & Data Model

As a user,
I want a dedicated leads page,
So that I can view and manage all my leads in one place.

**Acceptance Criteria:**

**Given** I am authenticated
**When** I navigate to Leads
**Then** I see a page with search area at top and leads list below
**And** the leads table is created with: id, tenant_id, apollo_id, first_name, last_name, email, phone, company_name, company_size, industry, location, title, linkedin_url, status, created_at, updated_at
**And** RLS policies ensure tenant isolation
**And** the page shows empty state when no leads exist

---

### Story 3.2: Apollo API Integration Service

As a developer,
I want a service layer for Apollo API,
So that lead searches are executed reliably.

**Acceptance Criteria:**

**Given** the Apollo API key is configured
**When** the ApolloService is called
**Then** it uses the tenant's encrypted API key
**And** requests are proxied through API routes (never from frontend)
**And** errors are caught and translated to Portuguese
**And** timeout is set to 10 seconds with 1 retry on failure
**And** the service follows ExternalService base class pattern from architecture

---

### Story 3.3: Traditional Filter Search

As a user,
I want to search leads using filters,
So that I can find specific types of leads.

**Acceptance Criteria:**

**Given** I am on the Leads page
**When** I click on "Filtros"
**Then** I see a filter panel with fields:
  - Setor/Indústria (multi-select)
  - Tamanho da empresa (range selector)
  - Localização (text with autocomplete)
  - Cargo/Título (text)
  - Palavras-chave (text)

**When** I apply filters and click "Buscar"
**Then** the system queries Apollo API with the filter parameters
**And** results appear in the leads table in <3 seconds
**And** I see loading state during the search
**And** result count is displayed

---

### Story 3.4: AI Conversational Search

As a user,
I want to search leads using natural language,
So that I can quickly find leads without configuring complex filters.

**Acceptance Criteria:**

**Given** I am on the Leads page
**When** I type in the AISearchInput "Me busca 50 leads de empresas de tecnologia em SP"
**Then** the system sends the query to AI for translation
**And** AI converts natural language to Apollo API parameters
**And** the search is executed with translated parameters
**And** results appear in the leads table
**And** if AI cannot understand, it shows a friendly message suggesting filters

**Given** the search is processing
**When** the AI is translating
**Then** I see "Entendendo sua busca..." with animation
**And** when Apollo is querying, I see "Buscando leads..."

---

### Story 3.5: Lead Table Display

As a user,
I want to see search results in an elegant table,
So that I can quickly scan and evaluate leads.

**Acceptance Criteria:**

**Given** leads have been found
**When** results are displayed
**Then** I see a table with columns: checkbox, Nome, Empresa, Cargo, Localização, Status
**And** rows are styled in Airtable fashion (clean, spaced)
**And** I can sort by clicking column headers
**And** I can resize columns
**And** long text is truncated with tooltip on hover
**And** the table is responsive and accessible

---

### Story 3.6: Lead Selection (Individual & Batch)

As a user,
I want to select leads individually or in batch,
So that I can perform actions on multiple leads.

**Acceptance Criteria:**

**Given** I am viewing leads in the table
**When** I click the checkbox on a row
**Then** that lead is selected (checkbox filled)
**And** a selection bar appears at bottom: "X leads selecionados"

**When** I click the header checkbox
**Then** all visible leads are selected
**And** clicking again deselects all

**When** leads are selected
**Then** the selection bar shows action buttons: "Criar Campanha", "..."
**And** selection state persists while navigating filters
**And** selection is stored in Zustand store

---

### Story 3.7: Saved Filters / Favorites

As a user,
I want to save my filter configurations,
So that I can quickly reuse searches I do frequently.

**Acceptance Criteria:**

**Given** I have configured filters
**When** I click "Salvar Filtro"
**Then** I can give the filter a name
**And** the filter is saved to saved_filters table (id, tenant_id, user_id, name, filters_json, created_at)

**Given** I have saved filters
**When** I click on "Filtros Salvos"
**Then** I see a list of my saved filters
**And** clicking one applies those filters immediately
**And** I can delete saved filters

---

### Story 3.8: Lead Table Pagination

As a user,
I want to navigate through paginated search results,
So that I can browse large datasets efficiently without overwhelming the interface.

**Acceptance Criteria:**

**Given** leads have been fetched
**When** results are displayed
**Then** I see pagination controls below the table
**And** I see "Mostrando X-Y de Z resultados" indicator
**And** controls include Previous/Next buttons
**And** controls include page number indicator (current/total)

**Given** I am viewing page 1 of results
**When** I click "Próximo"
**Then** the table shows page 2 results
**And** the pagination indicator updates

**Given** Apollo API limits (100 records/page, 500 pages max)
**When** pagination is calculated
**Then** these limits are respected in UI and API calls

---

## Epic 4: Lead Management

Usuários podem organizar, acompanhar status e escalonar leads com busca de telefone on-demand.

### Story 4.1: Lead Segments/Lists

As a user,
I want to organize leads into segments,
So that I can group leads by criteria and work with them efficiently.

**Acceptance Criteria:**

**Given** I am on the Leads page
**When** I click "Criar Segmento"
**Then** I can create a new segment with a name
**And** the segments table is created with: id, tenant_id, name, description, created_at

**Given** I have leads selected
**When** I click "Adicionar ao Segmento"
**Then** I can choose an existing segment or create new
**And** leads are associated via lead_segments junction table

**Given** I have segments
**When** I view the Leads page
**Then** I see a segment filter/dropdown
**And** selecting a segment filters the leads list

---

### Story 4.2: Lead Status Management

As a user,
I want to track the status of each lead,
So that I know where they are in the outreach process.

**Acceptance Criteria:**

**Given** I am viewing a lead
**When** I click on the status badge
**Then** I see status options: Novo, Em Campanha, Interessado, Oportunidade, Não Interessado
**And** selecting a status updates it immediately
**And** the status change is saved to the lead record

**Given** a lead has a status
**When** I view the leads table
**Then** I see the status as a colored badge
**And** I can filter leads by status
**And** status colors follow the design system (success=green, etc.)

---

### Story 4.3: Lead Detail View & Interaction History

As a user,
I want to see detailed information about a lead,
So that I can understand their context and history.

**Context:** Esta story opera sobre leads **persistidos** na página "Meus Leads" (/leads/my-leads). Leads da busca Apollo são transientes e não possuem histórico de interações até serem importados.

**Acceptance Criteria:**

**Given** I am on the "Meus Leads" page (/leads/my-leads)
**When** I click on a lead row (lead already persisted in database)
**Then** a detail sidepanel opens (Sheet component)
**And** I see all lead information: name, company, title, email, phone, LinkedIn
**And** I see the interaction history section
**And** I see when the lead was imported (created_at)

**Given** I want to add an interaction
**When** I click "Adicionar Nota"
**Then** I can type a note about an interaction
**And** the note is saved to lead_interactions table (id, lead_id, tenant_id, type, content, created_at, created_by)
**And** the interaction appears in the history list with timestamp

**Given** I am on the Apollo search results page (/leads)
**When** I click on a lead row (not yet imported)
**Then** I see a simplified preview (no interaction history available)
**And** I see option to "Importar Lead" to enable full management

---

### Story 4.4: SignalHire Integration Service

As a developer,
I want a service layer for SignalHire API,
So that phone number lookups are executed reliably.

**Acceptance Criteria:**

**Given** the SignalHire API key is configured
**When** the SignalHireService is called
**Then** it uses the tenant's encrypted API key
**And** requests are proxied through API routes
**And** errors are caught and translated to Portuguese
**And** timeout is set to 10 seconds with 1 retry on failure
**And** the service follows ExternalService base class pattern

---

### Story 4.5: Phone Number Lookup

As a user,
I want to find a lead's phone number on demand,
So that I can escalate promising leads quickly.

**Context:** Esta story opera sobre leads **persistidos** na página "Meus Leads" (/leads/my-leads). O lead precisa existir no banco de dados para que o telefone encontrado seja salvo. Depende de Story 4.2.1 (Lead Import Mechanism) e Story 4.4 (SignalHire Integration Service).

**Acceptance Criteria:**

**Given** I am on "Meus Leads" page viewing an imported lead without a phone number
**When** I click "Buscar Telefone" (in lead detail sidepanel or selection bar)
**Then** the system calls SignalHire API with the lead's email/LinkedIn
**And** I see a loading state during the lookup
**And** if found, the phone number is displayed and saved to the lead record in database
**And** if not found, I see "Telefone não encontrado" message

**Given** SignalHire returns an error
**When** the lookup fails
**Then** I see a clear error message in Portuguese
**And** I see suggestion to try again or use alternative methods

**Given** I have multiple leads selected on "Meus Leads" page
**When** I click "Buscar Telefone" in selection bar
**Then** the system looks up phone numbers for all selected leads (batch operation)
**And** I see progress indicator "Buscando telefones... X de Y"
**And** results are saved to each lead record

---

### Story 4.6: Interested Leads Highlighting

As a user,
I want interested leads visually highlighted,
So that I can quickly identify hot opportunities.

**Context:** Esta story opera sobre leads **persistidos** na página "Meus Leads" (/leads/my-leads). O status "Interessado" só existe para leads que foram importados para o banco de dados. Leads transientes da busca Apollo não possuem status persistido.

**Acceptance Criteria:**

**Given** a lead has status "Interessado" in "Meus Leads" page
**When** I view the leads table
**Then** the lead row has a visual highlight (subtle green left border or background tint)
**And** the status badge shows "Interessado" in success color

**Given** I am on "Meus Leads" page and filtering leads
**When** I filter by "Interessados"
**Then** only leads with "Interessado" status are shown
**And** they appear at the top when sorting by relevance

**Given** I am on Apollo search results page (/leads)
**When** a lead was previously imported and marked as "Interessado"
**Then** the lead shows the "Importado" indicator
**And** optionally shows the current status as read-only badge

---

### Story 4.7: Import Campaign Results

As a user,
I want to import results from external campaigns,
So that I can track which leads showed interest.

**Context:** Esta story opera sobre leads **persistidos** na página "Meus Leads" (/leads/my-leads). O sistema faz match por email com leads que já existem no banco de dados. Leads não encontrados podem ser opcionalmente criados durante a importação.

**Acceptance Criteria:**

**Given** I have run campaigns in Instantly/Snov.io
**When** I click "Importar Resultados" on "Meus Leads" page
**Then** I see options: Upload CSV, Colar dados
**And** I can map columns: email, response_type (replied, clicked, bounced)

**When** I import results
**Then** the system matches leads by email against persisted leads in database
**And** matching leads have their status updated
**And** leads with positive responses (replied) are marked as "Interessado"
**And** import history is logged to lead_interactions table
**And** I see a summary: "12 leads atualizados, 3 não encontrados"

**Given** some emails in the import don't match existing leads
**When** the import completes
**Then** I see list of unmatched emails
**And** I have option to "Criar leads para emails não encontrados"
**And** new leads are created with status based on response_type

---

## Epic 5: Campaign Builder

Usuários podem construir visualmente sequências de campanha usando drag-and-drop com experiência premium.

### Story 5.1: Campaigns Page & Data Model

As a user,
I want a campaigns page to manage my campaigns,
So that I can create and track multiple outreach sequences.

**Acceptance Criteria:**

**Given** I am authenticated
**When** I navigate to Campanhas
**Then** I see a list of my campaigns with: name, status, lead count, created date
**And** I see a "Nova Campanha" button
**And** the campaigns table is created with: id, tenant_id, name, status, created_at, updated_at
**And** the campaign_leads junction table links campaigns to leads
**And** RLS policies ensure tenant isolation

---

### Story 5.2: Campaign Builder Canvas

As a user,
I want a visual canvas to build my campaign sequence,
So that I can see the flow of my outreach.

**Acceptance Criteria:**

**Given** I click "Nova Campanha" or edit an existing one
**When** the builder page loads
**Then** I see a canvas area with dotted grid background (dots 1px, spacing 24px)
**And** the canvas fills the main content area
**And** the canvas has a subtle dark background (#070C1B)
**And** there is a sidebar with available blocks
**And** there is a header with campaign name and save button

---

### Story 5.3: Email Block Component

As a user,
I want to add email blocks to my sequence,
So that I can define each touchpoint in my campaign.

**Acceptance Criteria:**

**Given** I am in the campaign builder
**When** I drag an email block from the sidebar to the canvas
**Then** the block appears where I dropped it with smooth animation
**And** the block shows: icon, "Email", placeholder for subject
**And** the block has a drag handle for repositioning
**And** the block can be selected by clicking
**And** selected blocks have a highlighted border (primary color)
**And** the email_blocks table is created with: id, campaign_id, position, subject, body, created_at

---

### Story 5.4: Delay Block Component

As a user,
I want to add delay blocks between emails,
So that I can control the timing of my sequence.

**Acceptance Criteria:**

**Given** I am in the campaign builder
**When** I drag a delay block from the sidebar
**Then** the block appears with clock icon and "Aguardar X dias"
**And** I can click to edit the delay duration
**And** options include: 1, 2, 3, 5, 7 days or custom
**And** the system suggests intervals based on best practices (FR16)
**And** delay is saved to email_blocks table with type="delay"

---

### Story 5.5: Sequence Connector Lines

As a user,
I want visual connectors between blocks,
So that I can see the flow of my sequence.

**Acceptance Criteria:**

**Given** I have multiple blocks on the canvas
**When** blocks are positioned
**Then** SVG connector lines are drawn between consecutive blocks
**And** connectors use bezier curves for elegant appearance
**And** connectors have an arrow at the end indicating direction
**And** connectors are colored using --border token (subtle)
**And** when a new block is added, connector animates in (draw effect)

---

### Story 5.6: Block Drag & Reorder

As a user,
I want to drag and reorder blocks,
So that I can reorganize my sequence easily.

**Acceptance Criteria:**

**Given** I have blocks on the canvas
**When** I drag a block by its handle
**Then** the block follows my cursor with slight opacity
**And** other blocks shift to show potential drop position
**And** dropping the block reorders the sequence
**And** connectors update automatically
**And** keyboard navigation allows reordering with arrow keys
**And** the interaction uses @dnd-kit for accessibility

---

### Story 5.7: Campaign Lead Association

As a user,
I want to associate leads with my campaign,
So that I know who will receive this sequence.

**Acceptance Criteria:**

**Given** I am in the campaign builder
**When** I click "Adicionar Leads"
**Then** a modal shows my available leads
**And** I can search/filter leads
**And** I can select multiple leads
**And** selected leads are associated with the campaign
**And** the builder header shows lead count

**Given** I came from Leads page with selection
**When** I clicked "Criar Campanha"
**Then** those leads are automatically associated
**And** I see them listed in the campaign

---

### Story 5.8: Campaign Preview

As a user,
I want to preview my campaign before exporting,
So that I can verify everything looks correct.

**Acceptance Criteria:**

**Given** I have built a campaign sequence
**When** I click "Preview"
**Then** I see a preview panel/modal
**And** the preview shows the sequence as the recipient would see it
**And** each email is shown with subject and body
**And** delays are shown as timeline indicators
**And** I can navigate between emails in the sequence
**And** I can close preview and return to editing

---

### Story 5.9: Campaign Save & Multiple Campaigns

As a user,
I want to save my campaign and create multiple campaigns,
So that I can work on different sequences simultaneously.

**Acceptance Criteria:**

**Given** I am editing a campaign
**When** I click "Salvar"
**Then** the campaign and all blocks are saved to database
**And** I see a success notification
**And** the campaign appears in my campaigns list

**Given** I want multiple campaigns
**When** I create new campaigns
**Then** each has independent leads and sequences
**And** I can switch between campaigns
**And** the campaigns list shows all my campaigns

---

## Epic 6: AI Content Generation

Usuários obtêm textos personalizados que soam autênticos, usando a base de conhecimento e tom de voz configurados.

### Story 6.1: AI Provider Service Layer & Prompt Management System

As a developer,
I want an AI service layer supporting multiple providers with centralized prompt management,
So that we can use OpenAI or Anthropic for text generation and easily adjust prompts without code deploys.

**Acceptance Criteria:**

**Given** the system needs to generate text
**When** the AI service is called
**Then** it uses the configured provider (OpenAI or Anthropic)
**And** the service follows the AIProvider base class pattern
**And** API keys are retrieved from tenant configuration
**And** errors are caught and translated to Portuguese
**And** the service supports streaming responses
**And** timeout is set appropriately for text generation

**Prompt Management (ADR-001):**

**Given** the system needs to use a prompt
**When** the PromptManager is called
**Then** it retrieves the prompt from ai_prompts table
**And** falls back to global prompt if no tenant-specific exists
**And** falls back to code default if no DB prompt exists
**And** prompts are cached for 5 minutes to reduce DB queries
**And** the ai_prompts table is created with schema per ADR-001
**And** initial prompts are seeded via migration:
  - `search_translation`: Tradução linguagem natural → filtros
  - `email_subject_generation`: Geração de assuntos
  - `email_body_generation`: Geração de corpo de email
  - `icebreaker_generation`: Quebra-gelos personalizados
  - `tone_application`: Aplicação de tom de voz

**Technical Notes:**
- Ver ADR-001 em architecture.md para schema completo
- Prompts editáveis via Supabase Studio inicialmente
- UI de admin para prompts é escopo futuro

---

### Story 6.2: AI Text Generation in Builder

As a user,
I want to generate email text using AI,
So that I get personalized content quickly.

**Acceptance Criteria:**

**Given** I have selected an email block in the builder
**When** I click "✨ Gerar com IA"
**Then** the system starts generating text
**And** I see "Gerando texto personalizado..." with animation
**And** text appears progressively (streaming)
**And** generation completes in <5 seconds
**And** the generated text includes subject and body
**And** the text is saved to the email block

**Given** the AI generation fails
**When** an error occurs
**Then** I see "Não foi possível gerar. Tente novamente."
**And** I can retry with one click

---

### Story 6.3: Knowledge Base Integration for Context

As a user,
I want AI to use my company's knowledge base,
So that generated texts reflect my business accurately.

**Acceptance Criteria:**

**Given** I am generating text
**When** the AI is called
**Then** the prompt includes:
  - Company description and products
  - Tone of voice settings
  - ICP information
  - Successful email examples (if available)
**And** the generated text aligns with company context
**And** the tone matches the configured style (formal/casual/technical)

---

### Story 6.4: Product Catalog CRUD

As an admin/user,
I want to register and manage my business products,
So that I can reuse them across multiple campaigns with specific context.

**Context:** Esta story cria a infraestrutura para cadastro de produtos que serão usados como contexto específico nas campanhas. Diferente do knowledge base geral (empresa, tom de voz), produtos são entidades reutilizáveis que podem ser vinculadas a campanhas específicas.

**Acceptance Criteria:**

**Given** I am authenticated
**When** I navigate to Configurações > Produtos (new tab)
**Then** I see a list of my registered products
**And** I see a "Novo Produto" button
**And** empty state shows "Nenhum produto cadastrado. Adicione produtos para usar como contexto em campanhas."

**Given** I click "Novo Produto"
**When** the form opens
**Then** I see fields for:
  - Nome do produto (text, required)
  - Descrição (textarea, required) - explicação detalhada do que é o produto
  - Características principais (textarea) - features, funcionalidades
  - Diferenciais (textarea) - o que diferencia dos concorrentes
  - Público-alvo (textarea) - para quem é ideal
**And** I can save or cancel

**Given** I save a product
**When** the save completes
**Then** the product appears in the list
**And** I see success notification "Produto salvo com sucesso"
**And** the products table is created with: id, tenant_id, name, description, features, differentials, target_audience, created_at, updated_at
**And** RLS ensures tenant isolation

**Given** I have products in the list
**When** I view the products page
**Then** I can search/filter products by name
**And** I can click to edit any product
**And** I can delete products (with confirmation dialog)
**And** products in use by campaigns show indicator "Usado em X campanhas"

**Technical Notes:**
- Nova aba "Produtos" em Configurações (após Base de Conhecimento)
- Tabela `products` com RLS por tenant_id
- UI similar ao padrão de listas do sistema (estilo Airtable)

---

### Story 6.5: Campaign Product Context

As a user,
I want to link a specific product to each campaign,
So that AI generates texts contextualized for that product.

**Context:** Esta story conecta o catálogo de produtos (Story 6.4) às campanhas. Quando um produto é selecionado, a IA usa as informações do produto como contexto prioritário na geração de textos, em vez de usar apenas a descrição genérica da empresa.

**Acceptance Criteria:**

**Given** I am in the campaign builder
**When** I view the campaign header/settings
**Then** I see a "Produto" dropdown field
**And** the dropdown shows:
  - "Contexto Geral" (default - usa knowledge base da empresa)
  - Lista de produtos cadastrados (Story 6.4)
**And** the field has tooltip: "Selecione um produto para contextualizar os textos desta campanha"

**Given** I select a product for the campaign
**When** the selection is saved
**Then** the builder shows indicator: "Contexto: [Nome do Produto]"
**And** the campaign record is updated with product_id (campaigns.product_id FK to products.id)
**And** subsequent AI generations will use this product's context

**Given** a campaign has a product selected
**When** AI generates text (subject, body, icebreaker)
**Then** the prompt includes:
  - Product name and description
  - Product features and differentials
  - Product target audience
**And** these REPLACE the generic company product description
**And** company name, tone of voice, and ICP still apply
**And** generated text is specific to that product

**Given** a campaign has "Contexto Geral" selected
**When** AI generates text
**Then** behavior is unchanged from current implementation
**And** uses knowledge base company description

**Given** I want to change the product mid-campaign
**When** I select a different product
**Then** existing generated texts are NOT automatically regenerated
**And** I see warning: "Textos existentes não serão alterados. Regenere manualmente se necessário."
**And** new generations use the new product context

**Technical Notes:**
- Adicionar coluna `product_id` (nullable, FK) na tabela `campaigns`
- Atualizar PromptManager para incluir contexto de produto quando disponível
- Hierarquia de contexto: Produto (se selecionado) > Knowledge Base > Defaults
- Migration para adicionar FK com ON DELETE SET NULL

---

### Story 6.6: Personalized Icebreakers

As a user,
I want AI to generate personalized icebreakers,
So that my emails don't start with generic greetings.

**Context:** Esta story depende de 6.3 (Knowledge Base) e 6.5 (Campaign Product Context). Os icebreakers são personalizados usando: (1) informações do lead, (2) contexto do produto da campanha (se selecionado), (3) knowledge base geral.

**Acceptance Criteria:**

**Given** I am generating text for an email
**When** the AI generates content
**Then** it includes a personalized icebreaker based on:
  - Lead info: company name, industry, job title, company size, location, LinkedIn context
  - Product context: se a campanha tem produto selecionado, o icebreaker menciona relevância do produto para o lead
  - Company context: knowledge base geral
**And** the icebreaker feels natural and relevant
**And** it avoids generic phrases like "Olá {nome}"

**Given** the campaign has a product selected
**When** AI generates icebreaker
**Then** it connects the lead's context with the product's value proposition
**And** example: "Vi que a [Empresa do Lead] está expandindo para [Setor]. Nosso [Produto] tem ajudado empresas nessa fase com [Diferencial específico]..."

---

### Story 6.7: Inline Text Editing

As a user,
I want to edit AI-generated text inline,
So that I can make adjustments without leaving the builder.

**Acceptance Criteria:**

**Given** text has been generated for an email block
**When** I click on the text area
**Then** I can edit the subject inline
**And** I can edit the body inline
**And** changes are saved automatically (debounced)
**And** the text area expands to fit content
**And** I see character count for subject (recommended <60 chars)

---

### Story 6.8: Text Regeneration

As a user,
I want to regenerate text if I'm not satisfied,
So that I can get alternative versions.

**Context:** A regeneração usa o mesmo contexto da geração original, incluindo o produto da campanha (se selecionado via Story 6.5).

**Acceptance Criteria:**

**Given** I have generated text for an email
**When** I click "Regenerar"
**Then** the AI generates a new version
**And** the previous text is replaced
**And** I see the streaming animation again
**And** I can regenerate multiple times
**And** each regeneration considers the same context (lead + product + knowledge base)

---

### Story 6.9: Tone of Voice Application

As a user,
I want AI to maintain my configured tone of voice,
So that all emails sound consistent with my brand.

**Context:** O tom de voz é aplicado em conjunto com o contexto de produto (Story 6.5). Mesmo com produto específico, o tom configurado na knowledge base é respeitado.

**Acceptance Criteria:**

**Given** I have configured tone of voice as "Casual"
**When** AI generates text
**Then** the language is conversational and friendly
**And** formal constructs are avoided
**And** the text feels human, not robotic
**And** product-specific content (if any) also follows this tone

**Given** I have configured tone as "Técnico"
**When** AI generates text
**Then** appropriate technical terminology is used
**And** the text is precise and professional
**And** industry-specific language is included
**And** product features are described with technical accuracy

**Given** I have custom tone guidelines
**When** AI generates text
**Then** it follows those specific guidelines

---

### Story 6.10: Use of Successful Examples

As a user,
I want AI to learn from my successful email examples,
So that generated texts match my proven style.

**Context:** Exemplos de sucesso são combinados com o contexto de produto (Story 6.5) quando disponível. A IA aprende o estilo dos exemplos e aplica ao conteúdo do produto específico.

**Acceptance Criteria:**

**Given** I have added email examples to my knowledge base
**When** AI generates text
**Then** the prompt includes these examples as reference
**And** generated text adopts similar structure and patterns
**And** personalization techniques from examples are applied
**And** the output feels like the user could have written it
**And** product-specific content (if any) follows the same style patterns

**Given** no examples are configured
**When** AI generates text
**Then** it uses general best practices
**And** the system suggests adding examples for better results

---

### Story 6.11: Follow-Up Email Mode

As a user,
I want to create follow-up emails that reference the previous email in the sequence,
So that my campaign feels like a natural conversation, not repeated first contacts.

**Context:** Esta story adiciona modo de follow-up aos emails de campanha. A partir do 2o email, o usuário pode escolher entre "Email Inicial" (comportamento atual) ou "Follow-Up" (lê contexto do email anterior). O follow-up em cadeia significa que Email 3 lê Email 2, Email 4 lê Email 3, etc. **Identificada via Course Correction durante finalização da Story 6.8 (2026-02-03).**

**Acceptance Criteria:**

**Given** I am in the campaign builder with 2+ email blocks
**When** I select an email block that is NOT the first in sequence
**Then** I see a mode selector: "Email Inicial" | "Follow-Up"
**And** the default is "Email Inicial" (backward compatible)

**Given** I select "Follow-Up" mode for an email
**When** the mode is saved
**Then** the block shows visual indicator "Follow-up do Email X"
**And** the email_blocks record is updated with email_mode = 'follow-up'

**Given** I click "Gerar com IA" on a follow-up email
**When** AI generates content
**Then** the prompt includes the subject and body of the IMMEDIATELY PREVIOUS email
**And** the generated text:
  - References the previous contact naturally
  - Does NOT repeat product information already covered
  - Creates continuity in the conversation
  - Maintains the same tone of voice

**Given** Email 3 is marked as follow-up
**When** AI generates content for Email 3
**Then** it reads context from Email 2 (not Email 1)
**And** Email 4 (if follow-up) would read from Email 3, and so on

**Given** the first email in sequence
**When** I view the mode selector
**Then** it shows "Email Inicial" and is disabled (cannot be follow-up)
**And** tooltip explains: "O primeiro email da sequencia e sempre inicial"

**Given** I change a follow-up email back to "Email Inicial"
**When** the mode changes
**Then** subsequent generations will NOT include previous email context
**And** existing generated text is NOT automatically regenerated

**Technical Notes:**
- Add `email_mode` column to `email_blocks` table: `'initial' | 'follow-up'` (default: 'initial')
- Add new prompt `follow_up_email_generation` to `ai_prompts` table
- Modify `useAIGenerate` to accept `previousEmailContext` variable
- Add method to `useBuilderStore` to get previous email in sequence
- UI: Toggle or dropdown in EmailBlock header when position > 0
- See: sprint-change-proposal-2026-02-03.md

---

### Story 6.12: AI Campaign Structure Generation

As a user,
I want AI to generate the complete campaign structure automatically,
So that I don't need to manually decide how many emails and delays to include.

**Context:** Esta story adiciona um modo alternativo de criacao de campanha. O usuario pode escolher entre: (A) criar manualmente via builder drag-and-drop (Epic 5), ou (B) usar IA para gerar a estrutura completa automaticamente. O modo AI usa pesquisa e boas praticas para sugerir quantidade de touchpoints, intervalos ideais e abordagem estrategica. **Integra com Story 6.5** permitindo selecao de produto especifico para contextualizar a estrutura. **Integra com Story 6.11** para incluir consciencia de follow-up na estrutura gerada.

**Acceptance Criteria:**

**Given** I am on the Campaigns page
**When** I click "Nova Campanha"
**Then** I see two options:
  - "Criar Manualmente" (abre builder vazio - comportamento atual)
  - "✨ Criar com IA" (abre wizard de criação assistida)

**Given** I select "✨ Criar com IA"
**When** the wizard opens
**Then** I see a form asking:
  - Produto (dropdown: "Contexto Geral" + lista de produtos cadastrados - Story 6.4)
  - Objetivo da campanha (dropdown: Cold Outreach, Reengajamento, Follow-up, Nutrição)
  - Descrição adicional (textarea, opcional - complementa o contexto do produto selecionado)
  - Tom desejado (dropdown: Formal, Casual, Técnico - default da Knowledge Base)
  - Urgência (dropdown: Baixa, Média, Alta)
**And** fields have helpful tooltips explaining each option
**And** if a product is selected, its description is shown as preview

**Given** I fill the wizard form and click "Gerar Campanha"
**When** AI processes the request
**Then** I see "Analisando e criando sua campanha..." with animation
**And** AI generates:
  - Recommended number of emails (typically 3-7 based on objective)
  - Delay intervals between emails (based on best practices)
  - Strategic approach for each touchpoint (intro, value prop, social proof, urgency, etc.)
**And** the complete structure is created in the builder canvas
**And** each email block has placeholder context (ex: "Email 1: Introdução e gancho inicial")
**And** the selected product (if any) is automatically linked to the campaign
**And** generation completes in <10 seconds

**Given** the campaign structure is generated
**When** I view the builder
**Then** I see all email blocks and delay blocks pre-positioned
**And** I see the product context indicator if a product was selected
**And** I can modify, add, or remove blocks manually
**And** I can click "Gerar Conteúdo" on each email to generate the actual text (Story 6.2) - which will use the product context
**And** I see a summary panel: "Campanha de X emails, duração total de Y dias"

**Given** AI cannot generate a valid structure
**When** an error occurs
**Then** I see "Não foi possível gerar a estrutura. Tente ajustar os parâmetros."
**And** I can retry or switch to manual creation

**Technical Notes:**
- Novo prompt `campaign_structure_generation` na tabela ai_prompts
- Usa mesma infraestrutura de AI Provider (Story 6.1)
- Estrutura gerada é convertida para blocos no canvas
- Valores de delay baseados em pesquisa de cold email best practices
- Produto selecionado no wizard é salvo em campaigns.product_id (Story 6.5)

---

### Story 6.13: Smart Campaign Templates

As a user,
I want to choose from pre-built campaign templates,
So that I can quickly start with proven structures based on common scenarios.

**Context:** Templates sao estruturas pre-definidas baseadas em pesquisa e boas praticas de cold email. Diferente da Story 6.12 (geracao dinamica), templates sao estaticos mas otimizados. O usuario seleciona um template e a estrutura e criada instantaneamente, podendo depois gerar o conteudo com IA ou escrever manualmente. **Integra com Story 6.5** permitindo selecao de produto ao usar o template. **Integra com Story 6.11** para incluir padroes de follow-up nos templates.

**Acceptance Criteria:**

**Given** I select "Criar com IA" from the campaigns page
**When** the wizard opens
**Then** I see a "Produto" dropdown at the top (same as Story 6.12)
**And** I see a "Templates Prontos" section
**And** I see 4-6 template cards with:
  - Template name
  - Brief description
  - Number of emails and total duration
  - Recommended use case

**Given** the following templates are available
**When** I view the templates section
**Then** I see at least these options:
  | Template | Emails | Duração | Uso |
  |----------|--------|---------|-----|
  | Cold Outreach Clássico | 5 | 14 dias | Primeiro contato com leads frios |
  | Reengajamento Rápido | 3 | 7 dias | Leads que não responderam antes |
  | Nutrição Longa | 7 | 30 dias | Relacionamento de longo prazo |
  | Follow-up Urgente | 3 | 5 dias | Leads quentes, decisão próxima |
  | Apresentação de Produto | 4 | 10 dias | Lançamento ou demo de produto |

**Given** I click on a template card
**When** the template is selected
**Then** I see a preview of the structure (emails + delays)
**And** I see the strategic rationale for each touchpoint
**And** I can click "Usar Este Template" or go back to browse

**Given** I click "Usar Este Template"
**When** the template is applied
**Then** the campaign builder opens with the structure pre-populated
**And** all email blocks and delay blocks are positioned
**And** each email has strategic context placeholder (ex: "Email 3: Prova social e case de sucesso")
**And** the selected product (if any) is linked to the campaign
**And** I see product context indicator if product was selected
**And** I can modify the structure freely
**And** I see "Template: [Nome]" indicator in the campaign header

**Given** I want a custom structure instead of templates
**When** I scroll past templates in the wizard
**Then** I see "Ou crie uma campanha personalizada:" section
**And** I can fill the custom form (Story 6.12) to generate a unique structure
**And** the product selection carries over to the custom form

**Given** templates need to be updated
**When** an admin updates template definitions
**Then** templates are stored in campaign_templates table (id, name, description, structure_json, use_case, is_active, created_at)
**And** structure_json contains: emails array with position and context, delays array with duration
**And** RLS allows read access to all authenticated users

**Technical Notes:**
- Templates seeded via migration with research-based defaults
- structure_json format: `{ emails: [{ position: 1, context: "..." }], delays: [{ afterEmail: 1, days: 3 }] }`
- Future: admin UI to manage templates (out of scope for this story)
- Templates são globais (não por tenant) inicialmente
- Produto selecionado no wizard é salvo em campaigns.product_id (Story 6.5)

---

## Epic 6.5: Icebreaker Premium

Usuários podem gerar icebreakers altamente personalizados baseados nos posts reais do LinkedIn do lead, criando conexões genuínas que aumentam drasticamente as taxas de resposta.

**FRs cobertos:** FR22 (Quebra-gelos personalizados) - Enhanced Version

**Contexto:** Esta Epic expande significativamente a capacidade de personalização de icebreakers (Story 6.6) usando dados reais de posts do LinkedIn. Enquanto a versão básica usa apenas dados do lead (cargo, empresa), esta versão Premium analisa o conteúdo que a pessoa realmente publica, gerando icebreakers que demonstram interesse genuíno.

**Entregáveis:**
- Integração Apify na página de configurações
- Serviço de extração de posts do LinkedIn
- Prompt específico e configurável para icebreaker
- API de enriquecimento de leads com icebreaker
- Coluna icebreaker na tabela de leads
- UI para geração on-demand de icebreakers

**Dependências:**
- Epic 6 completa (infraestrutura de AI, prompts, knowledge base)
- Apollo já integrado (dados básicos do lead)
- OpenAI já integrado (geração de texto)

**Pesquisa de Referência:** [technical-lead-enrichment-icebreakers-research-2026-02-03.md](research/technical-lead-enrichment-icebreakers-research-2026-02-03.md)

---

### Story 6.5.1: Apify Integration Configuration

As an admin,
I want to configure the Apify API key in settings,
So that the system can fetch LinkedIn posts for icebreaker generation.

**Acceptance Criteria:**

**Given** I am authenticated as Admin
**When** I navigate to Configurações > Integrações
**Then** I see a new card for "Apify" alongside Apollo, SignalHire, Snov.io, Instantly
**And** the card has a field for API token input
**And** the API token is masked by default with option to reveal
**And** there is a "Salvar" button

**Given** I save an Apify API token
**When** the save completes
**Then** the token is encrypted using existing encryption service (AES-256-GCM)
**And** the token is stored in api_configs table with service_name='apify'
**And** only the last 4 characters are shown for verification
**And** I see success notification "Apify configurado com sucesso"

**Given** I click "Testar Conexão" for Apify
**When** the test runs
**Then** the system makes a test request to Apify API (actor info endpoint)
**And** I see loading state during the test
**And** success shows "✓ Conexão estabelecida com sucesso"
**And** failure shows clear error message in Portuguese

**Technical Notes:**
- Add "apify" to SERVICE_NAMES in src/types/integration.ts
- Reuse existing IntegrationCard component
- Test endpoint: GET actor info for actor ID "Wpp1BZ6yGWjySadk3"
- Uses existing encryption infrastructure from Story 2.2

---

### Story 6.5.2: Apify LinkedIn Posts Service

As a developer,
I want a service layer for Apify LinkedIn Post scraping,
So that we can reliably fetch recent posts from a lead's LinkedIn profile.

**Acceptance Criteria:**

**Given** the Apify API token is configured
**When** the ApifyLinkedInService is called with a LinkedIn URL
**Then** it uses the tenant's encrypted API token
**And** requests are made through API routes (never from frontend)
**And** the service calls actor "Wpp1BZ6yGWjySadk3" with parameters:
  - urls: [linkedinUrl]
  - limitPerSource: 3 (configurable, default 3)
  - deepScrape: true
  - rawData: false
**And** the service waits for actor completion and fetches results
**And** errors are caught and translated to Portuguese
**And** timeout is set to 60 seconds (actor runs can take longer)

**Given** the actor returns posts
**When** results are parsed
**Then** each post contains: text, publishedAt, likesCount, commentsCount, postUrl
**And** results are typed with LinkedInPost interface
**And** empty results return an empty array (not an error)

**Given** the LinkedIn URL is invalid or has no posts
**When** the service is called
**Then** appropriate error message is returned: "Perfil não encontrado" or "Nenhum post público encontrado"

**Technical Notes:**
- Create src/lib/services/apify-linkedin.ts
- Create src/types/apify.ts with interfaces
- Use ApifyClient from 'apify-client' package
- Actor ID: "Wpp1BZ6yGWjySadk3" (supreme_coder/linkedin-post)
- Follows ExternalService base class pattern from architecture

---

### Story 6.5.3: Icebreaker Prompt Configuration

As an admin,
I want a dedicated prompt for icebreaker generation that I can customize,
So that generated icebreakers match my desired style and approach.

**Acceptance Criteria:**

**Given** the system needs to generate an icebreaker
**When** the PromptManager is called
**Then** it retrieves the prompt from ai_prompts table with key 'icebreaker_premium_generation'
**And** falls back to global prompt if no tenant-specific exists
**And** falls back to code default if no DB prompt exists

**Given** the default prompt is seeded
**When** the migration runs
**Then** the prompt includes instructions for:
  - Analyzing LinkedIn posts content
  - Identifying themes of interest, opinions, achievements
  - Creating short icebreakers (1-2 sentences, max 50 words)
  - Referencing specific content from posts
  - Avoiding generic phrases like "Vi que você..."
  - Maintaining professional but casual tone
  - Connecting lead's interests with sender's value proposition (if product context available)

**Given** variables are passed to the prompt
**When** the prompt is rendered
**Then** it supports variables:
  - {{firstName}}, {{lastName}}, {{title}}, {{companyName}}, {{industry}}
  - {{linkedinPosts}} - formatted posts content
  - {{productName}}, {{productDescription}} (optional, from campaign context)
  - {{companyContext}} - from knowledge base

**Technical Notes:**
- Add new prompt to src/lib/ai/prompts/defaults.ts
- Add migration to seed 'icebreaker_premium_generation' prompt
- Prompt editable via Supabase Studio initially (future: admin UI)
- See research document for full prompt example

---

### Story 6.5.4: Lead Icebreaker Database Schema

As a developer,
I want to store icebreakers and related data for leads,
So that generated icebreakers can be reused and displayed.

**Acceptance Criteria:**

**Given** the database needs to store icebreakers
**When** the migration runs
**Then** the leads table is altered to add:
  - icebreaker TEXT (nullable) - the generated icebreaker text
  - icebreaker_generated_at TIMESTAMPTZ (nullable) - when it was generated
  - linkedin_posts_cache JSONB (nullable) - cached posts data for reference/debugging

**Given** an icebreaker is generated for a lead
**When** the result is saved
**Then** all three fields are updated
**And** existing RLS policies continue to work (tenant isolation)

**Given** a lead already has an icebreaker
**When** a new icebreaker is generated
**Then** the previous icebreaker is overwritten
**And** icebreaker_generated_at is updated to current timestamp

**Technical Notes:**
- Migration: ALTER TABLE leads ADD COLUMN icebreaker TEXT, etc.
- Update Lead type in src/types/lead.ts
- linkedin_posts_cache stores raw API response for debugging/future use

---

### Story 6.5.5: Icebreaker Enrichment API

As a developer,
I want an API endpoint to enrich leads with premium icebreakers,
So that the frontend can trigger icebreaker generation.

**Acceptance Criteria:**

**Given** I call POST /api/leads/enrich-icebreaker
**When** the request includes { leadIds: string[] }
**Then** for each lead:
  1. Fetch lead data from database (including linkedin_url)
  2. If linkedin_url is missing, skip with error "Lead sem LinkedIn URL"
  3. Call ApifyLinkedInService to get 3 recent posts
  4. Call OpenAI with icebreaker_premium_generation prompt
  5. Save icebreaker, posts cache, and timestamp to lead record
**And** response includes: { success: boolean, results: Array<{ leadId, icebreaker?, error? }> }
**And** each lead is processed independently (one failure doesn't stop others)

**Given** the endpoint is called for multiple leads
**When** processing
**Then** leads are processed in parallel (max 5 concurrent to avoid rate limits)
**And** progress can be tracked via response streaming (optional enhancement)

**Given** a lead has no public LinkedIn posts
**When** the API is called
**Then** the lead's icebreaker field remains null
**And** result shows: { leadId, error: "Nenhum post encontrado" }

**Given** a lead already has an icebreaker
**When** the API is called with regenerate: true
**Then** a new icebreaker is generated and replaces the old one
**And** without regenerate flag, existing icebreakers are skipped

**Technical Notes:**
- Create src/app/api/leads/enrich-icebreaker/route.ts
- Endpoint requires authentication
- RLS ensures tenant isolation
- Uses existing AI provider infrastructure (Story 6.1)
- Cost estimate: ~$0.005 per lead (Apify + OpenAI)

---

### Story 6.5.6: Icebreaker UI - Lead Table Integration

As a user,
I want to see and generate icebreakers from the lead table,
So that I can easily enrich my leads with personalized openers.

**Acceptance Criteria:**

**Given** I am on "Meus Leads" page
**When** I view the leads table
**Then** I see a new column "Icebreaker" (collapsible/hideable)
**And** leads with icebreakers show the text (truncated with tooltip for full text)
**And** leads without icebreakers show "—" or empty state
**And** the column header has tooltip: "Gerado automaticamente a partir dos posts do LinkedIn"

**Given** I have leads selected (checkboxes)
**When** I click "Gerar Icebreaker" in the selection bar
**Then** I see a confirmation: "Gerar icebreaker para X leads? Custo estimado: ~$Y"
**And** clicking "Gerar" starts the enrichment process
**And** I see progress: "Gerando icebreakers... X de Y"
**And** leads are updated in real-time as each completes
**And** completion shows summary: "Z icebreakers gerados, W erros"

**Given** I click on a lead row to open detail panel
**When** the panel opens
**Then** I see an "Icebreaker" section
**And** if icebreaker exists: I see the full text with "Regenerar" button
**And** if no icebreaker: I see "Gerar Icebreaker" button
**And** clicking either button triggers generation for that single lead

**Given** generation is in progress for a lead
**When** I view the lead
**Then** I see loading spinner in the icebreaker column/section
**And** the button is disabled during generation

**Given** a lead has no LinkedIn URL
**When** I try to generate icebreaker
**Then** I see error: "Este lead não possui LinkedIn cadastrado"
**And** suggestion: "Atualize os dados do lead para incluir o LinkedIn"

**Technical Notes:**
- Update LeadTable component to include icebreaker column
- Update LeadDetailPanel to show icebreaker section
- Create useIcebreakerEnrichment hook for API calls
- Integrate with existing selection state in Zustand store
- Column should be after "Status" and before any action columns

---

### Story 6.5.7: Icebreaker Integration with Email Generation

As a user,
I want the email generation to automatically use the lead's icebreaker when available,
So that personalized emails include the premium opener without extra steps.

**Context:** Esta story conecta o Icebreaker Premium com a geração de emails existente (Stories 6.2-6.6). Quando um lead tem icebreaker gerado, ele é automaticamente usado na geração de emails.

**Acceptance Criteria:**

**Given** I am generating email content for a campaign
**When** the campaign has leads with icebreakers
**Then** the email generation prompt receives the icebreaker as additional context
**And** the AI incorporates the icebreaker naturally into the email opening
**And** the email feels cohesive (icebreaker flows into main content)

**Given** a lead does not have an icebreaker generated
**When** email is generated
**Then** the system falls back to standard icebreaker generation (Story 6.6)
**And** uses lead data (company, title, industry) for personalization

**Given** the user wants to preview email for a specific lead
**When** the preview loads
**Then** the icebreaker (if available) is shown in the email
**And** there's indication: "✨ Icebreaker Premium" badge near the opener
**And** user can click to see which LinkedIn post inspired it

**Given** a campaign uses {icebreaker} tag in email template
**When** the tag is replaced
**Then** it uses the lead's premium icebreaker if available
**And** falls back to AI-generated basic icebreaker if not

**Technical Notes:**
- Update email generation prompts to accept icebreaker context
- Update email preview to show icebreaker source
- Add icebreaker field to lead context passed to AI
- Maintain backward compatibility with leads without icebreakers

---

### Story 6.5.8: Apify Cost Tracking (Future Enhancement)

As an admin,
I want to track Apify API usage and costs,
So that I can monitor enrichment spending.

**Context:** Esta story é um enhancement futuro para controle de custos. Pode ser implementada após o MVP do Icebreaker Premium estar funcionando.

**Acceptance Criteria:**

**Given** the system uses Apify for icebreaker generation
**When** each call is made
**Then** the usage is logged to a tracking table
**And** the log includes: tenant_id, lead_id, posts_fetched, estimated_cost, timestamp

**Given** I am on the admin settings
**When** I view "Uso da API"
**Then** I see Apify usage statistics:
  - Total calls this month
  - Estimated cost
  - Average posts per lead
**And** I can set usage alerts (optional)

**Priority:** P2 (Nice to have for MVP)

**Technical Notes:**
- Create api_usage_logs table
- Track per-tenant usage
- Apify cost: ~$1 per 1000 posts
- Future: usage limits per tenant

---

## Epic 7: Campaign Deployment & Export

Usuários podem exportar campanhas personalizadas para plataformas de cold email (Instantly, Snov.io) e via CSV/clipboard, com sistema completo de variáveis de personalização mapeadas para as tags de cada plataforma.

### Story 7.1: Sistema de Variáveis de Personalização para Exportação

**Como** sistema,
**Quero** que os emails de campanha usem variáveis de personalização em vez de texto hardcoded,
**Para** que as campanhas sejam exportáveis para qualquer plataforma com substituição dinâmica por lead.

**Critérios de Aceite:**

1. **Given** o sistema de variáveis é definido
   **When** as variáveis suportadas são registradas
   **Then** o registry inclui: `{{first_name}}`, `{{company_name}}`, `{{title}}`, `{{ice_breaker}}`
   **And** cada variável tem um campo correspondente no modelo Lead
   **And** existe um mapeamento variável → campo do lead

2. **Given** o usuário gera uma campanha via AI (Wizard)
   **When** nenhum lead está selecionado para preview
   **Then** o email gerado contém variáveis (`{{first_name}}`, `{{ice_breaker}}`, etc.) em vez de dados reais
   **And** o prompt de AI instrui a gerar com variáveis de personalização

3. **Given** o usuário gera um email individual (EmailBlock) com lead selecionado
   **When** o conteúdo é gerado
   **Then** as variáveis são substituídas pelos dados reais do lead para preview
   **And** o template original com variáveis é preservado separadamente

4. **Given** o motor de substituição `resolveEmailVariables(template, lead)` é implementado
   **When** recebe um template com variáveis e um lead
   **Then** substitui cada `{{variável}}` pelo valor correspondente do lead
   **And** variáveis sem valor no lead são mantidas como estão (graceful degradation)
   **And** o preview utiliza este motor para exibir conteúdo personalizado

5. **Given** o registry de variáveis existe
   **When** é consultado para mapeamento de plataforma
   **Then** retorna o formato de tag correspondente para cada plataforma:
   - Instantly: `{{first_name}}` → `{{first_name}}` (custom variable)
   - Snov.io: `{{first_name}}` → `{{firstName}}` (campo Snov.io)
   - CSV: `{{first_name}}` → coluna `first_name`

**Arquivos Afetados:**
- `src/lib/ai/prompts/defaults.ts` — atualizar prompts para gerar com variáveis
- `src/lib/export/variable-registry.ts` — novo: registry de variáveis e mapeamento
- `src/lib/export/resolve-variables.ts` — novo: motor de substituição
- `src/types/export.ts` — novo: tipos de variáveis e mapeamento
- `src/components/builder/PreviewEmailStep.tsx` — usar motor de substituição no preview
- `src/hooks/use-ai-full-campaign-generation.ts` — gerar com variáveis

**Notas Técnicas:**
- Expandir o padrão da Story 9.4 (`{{ice_breaker}}`) para todas as variáveis de personalização
- O template engine existente (`PromptManager.interpolateTemplate`) é para prompts de AI, não para email output — são camadas separadas
- Manter backward compatibility: emails já gerados sem variáveis continuam funcionando

---

### Story 7.2: Instantly Integration Service - Gestão de Campanhas

**Como** desenvolvedor,
**Quero** expandir o `InstantlyService` com métodos de gestão de campanhas,
**Para** que o sistema possa criar campanhas e enviar leads para o Instantly via API.

**Critérios de Aceite:**

1. **Given** a API key do Instantly está configurada
   **When** o `InstantlyService` é chamado
   **Then** utiliza a API key encriptada do tenant
   **And** requests são proxied via API routes
   **And** erros são capturados e traduzidos para português
   **And** timeout de 10 segundos com 1 retry

2. **Given** o service é chamado para criar campanha
   **When** `createCampaign(name, sequences)` é invocado
   **Then** cria uma campanha no Instantly via API v2
   **And** configura a sequência de emails com delays
   **And** mapeia variáveis internas para custom variables do Instantly
   **And** retorna o `campaignId` criado

3. **Given** o service é chamado para adicionar leads
   **When** `addLeadsToCampaign(campaignId, leads)` é invocado
   **Then** envia leads em batches (máx. 100 por request)
   **And** cada lead inclui: email, first_name, company_name, custom variables (ice_breaker, etc.)
   **And** retorna contagem de leads adicionados com sucesso

4. **Given** o service é chamado para obter status
   **When** `getCampaignStatus(campaignId)` é invocado
   **Then** retorna status atual da campanha no Instantly

**Arquivos Afetados:**
- `src/lib/services/instantly.ts` — expandir service existente
- `src/app/api/instantly/campaign/route.ts` — novo: API route para criar campanha
- `src/app/api/instantly/leads/route.ts` — novo: API route para push de leads
- `src/types/instantly.ts` — novo: tipos da API Instantly

---

### Story 7.3: Snov.io Integration Service - Gestão de Campanhas

**Como** desenvolvedor,
**Quero** um service layer para a API de drip campaigns do Snov.io,
**Para** que o sistema possa criar campanhas e enviar recipients para o Snov.io.

**Critérios de Aceite:**

1. **Given** a API key do Snov.io está configurada
   **When** o `SnovioService` é chamado
   **Then** utiliza a API key encriptada do tenant
   **And** requests são proxied via API routes
   **And** erros são capturados e traduzidos para português
   **And** timeout de 10 segundos com 1 retry
   **And** segue o padrão `ExternalService` base class

2. **Given** o service é chamado para criar drip campaign
   **When** `createDripCampaign(name, sequences)` é invocado
   **Then** cria uma drip campaign no Snov.io
   **And** configura emails com delays e variáveis mapeadas
   **And** retorna o `campaignId` criado

3. **Given** o service é chamado para adicionar recipients
   **When** `addRecipients(campaignId, leads)` é invocado
   **Then** envia leads com seus dados personalizados
   **And** inclui campos customizados (ice_breaker, etc.)
   **And** retorna contagem de recipients adicionados

**Arquivos Afetados:**
- `src/lib/services/snovio.ts` — novo: service completo
- `src/app/api/snovio/campaign/route.ts` — novo: API route
- `src/app/api/snovio/recipients/route.ts` — novo: API route
- `src/types/snovio.ts` — novo: tipos da API Snov.io

---

### Story 7.4: Export Dialog UI com Preview de Variáveis

**Como** usuário,
**Quero** um dialog de exportação que mostre as opções disponíveis e um preview do mapeamento de variáveis,
**Para** que eu saiba exatamente como minha campanha será exportada.

**Critérios de Aceite:**

1. **Given** tenho uma campanha pronta
   **When** clico em "Exportar"
   **Then** um dialog abre com as opções de exportação:
   - Instantly (se configurado)
   - Snov.io (se configurado)
   - CSV (sempre disponível)
   - Copiar para Clipboard (sempre disponível)
   **And** cada opção mostra status de conexão (verde/vermelho)
   **And** integrações não configuradas mostram link "Configurar"

2. **Given** seleciono uma opção de exportação
   **When** a opção é expandida
   **Then** vejo um preview do mapeamento de variáveis:
   - `{{first_name}}` → campo correspondente na plataforma
   - `{{ice_breaker}}` → custom variable na plataforma
   **And** vejo quantos leads serão exportados
   **And** vejo aviso se algum lead tem dados incompletos

3. **Given** seleciono leads para exportação
   **When** confirmo a seleção
   **Then** posso escolher entre "Todos os leads da campanha" ou "Selecionar leads"
   **And** leads sem email são automaticamente excluídos com aviso

**Arquivos Afetados:**
- `src/components/builder/ExportDialog.tsx` — novo: dialog de exportação
- `src/components/builder/ExportPreview.tsx` — novo: preview de mapeamento
- `src/hooks/use-campaign-export.ts` — novo: hook de exportação

---

### Story 7.5: Export to Instantly - Fluxo Completo

**Como** usuário,
**Quero** exportar minha campanha para o Instantly com um clique,
**Para** que eu possa iniciar o envio de emails imediatamente.

**Critérios de Aceite:**

1. **Given** selecionei Instantly como destino
   **When** clico "Exportar para Instantly"
   **Then** o fluxo executa em sequência:
   1. Cria campanha no Instantly com nome e sequência de emails
   2. Mapeia variáveis internas → tags do Instantly
   3. Envia leads com custom variables (ice_breaker, dados do lead)
   **And** vejo progress indicator com etapa atual
   **And** cada etapa mostra feedback (criando campanha... enviando leads...)

2. **Given** a exportação completa com sucesso
   **When** todas as etapas finalizam
   **Then** vejo "Campanha exportada para Instantly" com contagem de leads
   **And** vejo link "Abrir no Instantly" para acessar a campanha criada

3. **Given** a exportação falha
   **When** qualquer etapa retorna erro
   **Then** vejo mensagem de erro em português
   **And** vejo opções: "Tentar Novamente" ou "Exportar CSV"
   **And** o fallback manual (CSV/clipboard) está sempre disponível

**Dependências:** Story 7.2 (Instantly Service) + Story 7.4 (Export Dialog UI)

---

### Story 7.6: Export to Snov.io - Fluxo Completo

**Como** usuário,
**Quero** exportar minha campanha para o Snov.io com um clique,
**Para** que eu possa iniciar o envio de emails imediatamente.

**Critérios de Aceite:**

1. **Given** selecionei Snov.io como destino
   **When** clico "Exportar para Snov.io"
   **Then** o fluxo executa em sequência:
   1. Cria drip campaign no Snov.io
   2. Mapeia variáveis internas → campos do Snov.io
   3. Adiciona recipients com dados personalizados
   **And** vejo progress indicator com etapa atual

2. **Given** a exportação completa com sucesso
   **When** todas as etapas finalizam
   **Then** vejo "Campanha exportada para Snov.io" com contagem de recipients
   **And** vejo link "Abrir no Snov.io"

3. **Given** a exportação falha
   **When** qualquer etapa retorna erro
   **Then** vejo mensagem de erro em português
   **And** vejo opções: "Tentar Novamente" ou "Exportar CSV"

**Dependências:** Story 7.3 (Snov.io Service) + Story 7.4 (Export Dialog UI)

---

### Story 7.7: Exportação Manual - CSV e Clipboard

**Como** usuário,
**Quero** exportar minha campanha via CSV ou clipboard,
**Para** que eu possa importar manualmente em qualquer ferramenta (Ramper, planilha, etc.).

**Critérios de Aceite:**

1. **Given** seleciono "Exportar CSV"
   **When** clico na opção
   **Then** um CSV é gerado com:
   - Uma linha por lead
   - Colunas: email, first_name, company_name, title, ice_breaker, email_subject_1, email_body_1, delay_1, email_subject_2, email_body_2, ...
   - Os emails contêm variáveis JÁ resolvidas por lead
   **And** o arquivo é baixado automaticamente
   **And** o nome do arquivo segue o padrão: `{campaign_name}-export-{date}.csv`

2. **Given** seleciono "Exportar CSV com Variáveis"
   **When** clico na opção
   **Then** o CSV mantém as variáveis (`{{first_name}}`, `{{ice_breaker}}`, etc.) sem resolver
   **And** leads são exportados em planilha separada ou colunas adicionais
   **And** útil para importar diretamente no Instantly/Snov.io via CSV

3. **Given** seleciono "Copiar para Clipboard"
   **When** clico na opção
   **Then** a campanha é formatada em texto estruturado
   **And** inclui: sequência de emails com subjects, bodies e delays
   **And** é copiada para o clipboard
   **And** vejo "Copiado para clipboard"

**Dependências:** Story 7.1 (Sistema de Variáveis) + Story 7.4 (Export Dialog UI)

---

### Story 7.8: Validação Pré-Export e Error Handling

**Como** usuário,
**Quero** que o sistema valide meus dados antes de exportar e me dê feedback claro quando algo der errado,
**Para** que eu nunca exporte uma campanha incompleta e sempre tenha um caminho alternativo.

**Critérios de Aceite:**

1. **Given** inicio uma exportação
   **When** os dados são validados
   **Then** verifica:
   - Todos os leads têm email válido
   - Leads sem ice_breaker são sinalizados (aviso, não bloqueio)
   - Campanha tem pelo menos 1 email completo (subject + body)
   - Variáveis no template correspondem a campos existentes nos leads
   **And** exibe resumo de validação antes de confirmar

2. **Given** a validação encontra problemas críticos
   **When** o resumo é exibido
   **Then** problemas bloqueantes (sem email) impedem a exportação
   **And** problemas não-bloqueantes (sem ice_breaker) exibem aviso mas permitem continuar
   **And** para cada problema há uma ação sugerida ("Enriquecer leads", "Gerar ice breakers", etc.)

3. **Given** qualquer exportação (API ou CSV) falha
   **When** o erro é exibido
   **Then** a mensagem está em português
   **And** explica o problema específico:
   - "Sua conta Instantly está sem créditos"
   - "API key inválida. Verifique em Configurações"
   - "Serviço temporariamente indisponível"
   - "Limite de leads excedido"
   **And** vejo "Tentar Novamente" e "Exportar Manualmente" como alternativas
   **And** a exportação manual (CSV/clipboard) SEMPRE funciona independente de erros de API

**Dependências:** Stories 7.5, 7.6, 7.7

---

## Epic 8: Visual Refresh - Clean B&W Theme

Transformação visual do sistema de um tema dark com tons azulados para um tema clean preto e branco neutro, inspirado no UI TripleD (ui.tripled.work).

**Objetivo:** Apenas visual, zero impacto funcional.

### Story 8.1: Dark Theme B&W Conversion

Como usuário,
Quero que o tema dark use cores preto e branco neutras,
Para ter uma experiência visual mais clean e moderna.

**Acceptance Criteria:**

**Given** o arquivo globals.css existe
**When** as variáveis CSS do `:root` são atualizadas
**Then** todas as cores de background usam `hsl(0 0% XX%)` (sem saturação)
**And** todas as cores de foreground usam tons neutros
**And** bordas usam cinzas neutros sem saturação azul
**And** primary color muda de indigo para branco
**And** glow effects usam branco sutil

**Given** o tema é atualizado
**When** visualizo qualquer página do sistema
**Then** os componentes herdam as novas cores automaticamente
**And** não há cores azuladas visíveis (exceto status colors)

**Given** cores de status (success, warning, destructive)
**When** são exibidas na interface
**Then** mantêm suas cores originais (verde, amarelo, vermelho)

**Arquivos Afetados:**
- src/app/globals.css

---

### Story 8.2: Light Theme B&W Conversion

Como usuário,
Quero que o tema light também use cores neutras,
Para manter consistência visual entre os temas.

**Acceptance Criteria:**

**Given** o bloco `.light` em globals.css
**When** as variáveis são atualizadas
**Then** backgrounds usam brancos/cinzas claros neutros
**And** foregrounds usam pretos/cinzas escuros neutros
**And** primary color mantém consistência com dark theme
**And** glow effects usam preto/cinza sutil

**Arquivos Afetados:**
- src/app/globals.css

---

### Story 8.3: Charts Grayscale Conversion

Como usuário,
Quero que os gráficos usem escala de cinzas,
Para manter consistência com o tema B&W.

**Acceptance Criteria:**

**Given** variáveis de charts em globals.css
**When** são atualizadas
**Then** chart-1 a chart-5 usam escala de cinzas
**And** gráficos permanecem distinguíveis entre si
**And** legendas são legíveis

**Paleta Proposta:**
- chart-1: hsl(0 0% 98%) - Branco
- chart-2: hsl(0 0% 80%) - Cinza claro
- chart-3: hsl(0 0% 60%) - Cinza médio
- chart-4: hsl(0 0% 40%) - Cinza escuro
- chart-5: hsl(0 0% 25%) - Cinza muito escuro

---

### Story 8.4: UI TripleD Components Integration

Como usuário,
Quero componentes animados premium do UI TripleD,
Para ter uma experiência visual sofisticada com micro-interações modernas.

**Acceptance Criteria:**

**Given** o CLI do UI TripleD está disponível
**When** componentes são adicionados via `npx shadcn@latest add @uitripled/[component]`
**Then** funcionam com o tema B&W existente
**And** animações rodam suavemente com framer-motion

**Given** o componente Native Magnetic é instalado
**When** aplicado aos botões primários (CTAs)
**Then** o cursor é "atraído" pelo botão (efeito magnético)
**And** a interação é fluida e responsiva

**Given** componentes são adicionados
**When** visualizados na interface
**Then** respeitam as CSS variables do tema B&W
**And** não introduzem cores hardcoded

**Componentes a Incluir:**
- Native Magnetic - Botões primários (CTAs)
- Glass Wallet Card - Cards de métricas/stats
- Animated List - Listas de leads/campanhas
- AI Unlock Animation - Geração de conteúdo IA
- Interactive Timeline - Timeline de campanha

**Dependências:**
- framer-motion (já instalado v12.29.2)
- Stories 8.1-8.3 completas

---

### Story 8.5: Visual QA & Contrast Review

Como usuário,
Quero que o contraste seja adequado em todas as telas,
Para garantir legibilidade e acessibilidade.

**Acceptance Criteria:**

**Given** o novo tema é aplicado
**When** navego por todas as páginas principais
**Then** texto é legível em todos os contextos
**And** contraste atende WCAG 2.1 AA (4.5:1 para texto normal)

**Given** elementos interativos (botões, inputs)
**When** são exibidos
**Then** são claramente distinguíveis do background
**And** estados de hover/focus são visíveis

**Given** tabelas e cards
**When** são exibidos
**Then** bordas são visíveis mas sutis
**And** hierarquia visual é clara

**Páginas para Revisar:**
- Login
- Dashboard/Home
- Leads (busca e meus leads)
- Campanhas (lista e builder)
- Configurações (todas as abas)
- Modais e sidepanels

