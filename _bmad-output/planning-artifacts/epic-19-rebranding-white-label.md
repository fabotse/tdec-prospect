---
stepsCompleted: ["step-02-design-epics", "step-03-create-stories"]
inputDocuments:
  - docs/client/ (e-mail / brief do cliente — rebranding)
notes: "Epic de preparacao de entrega. Mudancas cosmeticas/conteudo, baixo risco. Nao requer PRD/arquitetura formal (padrao das Epics avulsas, ex: Epic 12)."
---

# tdec-prospect - Epic Breakdown: Rebranding / White-label

## Overview

Preparacao da plataforma para entrega ao cliente: aplicar a identidade visual da TDec. Inclui troca de logos com inteligencia de tema (claro/escuro), padronizacao da grafia do nome da empresa para "TDec", e centralizacao do branding num ponto unico de configuracao. Feature 100% cosmetica/conteudo -- nao altera nenhuma logica de negocio.

## Requirements Inventory

### Functional Requirements

**Logo theme-aware**
- FR1: Sistema exibe o logo correto conforme o tema ativo -- logo branco no tema escuro, logo escuro no tema claro -- trocando automaticamente quando o usuario alterna o tema.

**Nome da empresa**
- FR2: O nome da empresa e exibido sempre como "TDec" (T e D maiusculos, "ec" minusculo) em toda a aplicacao, nunca "TDEC".

**Centralizacao do branding**
- FR3: Nome e assets de marca centralizados num ponto unico de configuracao (constant `BRAND`), de modo que futuras renomeacoes/trocas sejam alteracoes pontuais.

**Identidade do app**
- FR4: Favicon, titulo da aba e metadata (OpenGraph) refletem a marca TDec.

### NonFunctional Requirements

**Compatibilidade**
- NFR-C1: Troca de logo respeita o mecanismo de tema existente (light/dark, Epic 8) sem flash/FOUC ao carregar.
- NFR-C2: Assets servidos estaticamente de `public/brand/` (SVG preferencial, fundo transparente).

**Qualidade**
- NFR-Q1: Sweep de "TDEC" -> "TDec" nao deve alterar referencias ao design-system "TripleD" nem strings tecnicas (chaves, slugs, ids).
- NFR-Q2: Nenhuma regressao visual nos cabecalhos/paginas que exibem o logo (Header, login).

### FR Coverage Map

| FR  | Epic    | Story | Descricao                                            |
| --- | ------- | ----- | ---------------------------------------------------- |
| FR1 | Epic 19 | 19.1  | Componente BrandLogo theme-aware                     |
| FR3 | Epic 19 | 19.1  | Centralizacao do branding (constant BRAND)           |
| FR2 | Epic 19 | 19.2  | Padronizacao "TDEC" -> "TDec" em toda a UI           |
| FR4 | Epic 19 | 19.3  | Favicon, titulo e metadata com a marca TDec          |

## Epic List

### Epic 19: Rebranding / White-label
Aplicar a identidade visual da TDec na plataforma -- logo theme-aware, grafia padronizada "TDec" e branding centralizado -- preparando o software para entrega ao cliente sem impacto em funcionalidades existentes.

**FRs cobertos:** FR1, FR2, FR3, FR4

**Entregaveis:**
- Componente `<BrandLogo/>` que escolhe o asset conforme o tema (branco no escuro / escuro no claro)
- Constant `BRAND` como fonte unica de nome e assets de marca
- Toda a UI exibindo "TDec" com a grafia correta
- Favicon, titulo e metadata com a marca TDec

**Pre-requisito:** arquivos de logo entregues pelo cliente em `public/brand/` (ver `public/brand/README.md` para convencao de nomes).

---

## Epic 19: Rebranding / White-label

### Story 19.1: Componente BrandLogo theme-aware + centralizacao do branding

As a usuario da plataforma,
I want ver o logo da TDec sempre legivel, trocando automaticamente conforme o tema claro/escuro,
So that a identidade visual fique correta e profissional em qualquer modo.

**Acceptance Criteria:**

**Given** os assets de logo estao em `public/brand/` seguindo a convencao de nomes
**When** a aplicacao renderiza o logo
**Then** existe um componente unico `<BrandLogo/>` responsavel por exibir o logo
**And** o nome e os caminhos dos assets vem de uma constant `BRAND` (fonte unica de verdade)

**Given** o usuario esta com o tema ESCURO ativo
**When** o `<BrandLogo/>` e exibido
**Then** mostra o logo BRANCO (`tdec-logo-white`)

**Given** o usuario esta com o tema CLARO ativo
**When** o `<BrandLogo/>` e exibido
**Then** mostra o logo ESCURO (`tdec-logo-dark`)

**Given** o usuario alterna o tema com a aplicacao aberta
**When** o tema muda
**Then** o logo troca automaticamente para a variante correta sem reload
**And** nao ha flash/FOUC do logo errado durante o carregamento inicial

**Given** o logo aparece no Header e na pagina de login
**When** o `<BrandLogo/>` substitui as ocorrencias atuais
**Then** ambos os locais usam o mesmo componente
**And** nao ha regressao de layout/alinhamento

### Story 19.2: Padronizacao do nome "TDEC" -> "TDec" em toda a UI

As a cliente TDec,
I want que o nome da minha empresa apareca sempre escrito "TDec",
So that a marca seja apresentada de forma consistente e correta.

**Acceptance Criteria:**

**Given** o codigo possui ocorrencias do nome da empresa escritas como "TDEC"
**When** o sweep de padronizacao e aplicado
**Then** todas as strings voltadas ao usuario exibem "TDec"
**And** preferencialmente referenciam `BRAND.name` em vez de string literal

**Given** existem referencias ao design-system "TripleD" e strings tecnicas (slugs, chaves, ids)
**When** o sweep e aplicado
**Then** essas referencias NAO sao alteradas (apenas o nome de marca voltado ao usuario)

**Given** o nome da empresa e exibido em paginas, dialogs, prompts de IA e textos auxiliares
**When** o usuario navega pela aplicacao
**Then** nao resta nenhuma ocorrencia visivel de "TDEC"

### Story 19.3: Favicon, titulo e metadata com a marca TDec

As a usuario,
I want que a aba do navegador e os previews de link reflitam a marca TDec,
So that a identidade seja consistente fora da area de conteudo tambem.

**Acceptance Criteria:**

**Given** os assets de favicon/icone estao disponiveis em `public/brand/`
**When** a aplicacao carrega
**Then** o favicon exibido e o da TDec

**Given** o usuario abre qualquer pagina da aplicacao
**When** observa o titulo da aba
**Then** o titulo reflete a marca TDec (via metadata do App Router)

**Given** um link da aplicacao e compartilhado
**When** o preview (OpenGraph) e gerado
**Then** titulo e imagem refletem a marca TDec
