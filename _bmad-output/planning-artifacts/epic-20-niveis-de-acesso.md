---
stepsCompleted: ["step-02-design-epics", "step-03-create-stories"]
inputDocuments:
  - docs/client/ (e-mail do cliente — niveis de acesso)
notes: "Epic toca auth + RLS (sensivel a seguranca). Pre-requisito: doc de decisao (matriz de permissao + plano de migracao) ANTES das stories irem para dev. Base atual ja enforça admin/user em profundidade — este epic expande, nao constroi do zero."
---

# tdec-prospect - Epic Breakdown: Niveis de Acesso (Gestor / Diretor / SDR)

## Overview

O cliente solicitou niveis de acesso distintos na plataforma. Hoje o sistema ja possui um modelo binario `role = "admin" | "user"` enforçado em profundidade (middleware bloqueia `/settings`, `AdminGuard`, ~30 guards server-side `role !== "admin"`, RLS por tenant). Este epic **expande** esse modelo para tres papeis -- **Gestor**, **Diretor** e **SDR** -- e provisiona os usuarios do cliente.

**Decisao de produto (Fabossi, 2026-06-01):** modelar os tres papeis no enum, mas **Gestor e Diretor compartilham as mesmas permissoes por enquanto** (acesso total); a diferenciacao do Diretor vira depois. **SDR** e o nivel restrito conforme o e-mail do cliente (sem configuracoes/funcionalidades administrativas).

**Implicacao tecnica chave:** para que a futura diferenciacao do Diretor seja barata, as verificacoes de permissao devem ser **centralizadas num helper de capacidade** (ex.: `hasAdminAccess(role)`), em vez de comparacoes `role === "admin"` espalhadas. Assim, diferenciar o Diretor depois e uma alteracao pontual, nao uma caca a ~30 call-sites.

## Pre-sprint (obrigatorio antes das stories irem para dev)

- [x] **Doc de decisao / Matriz de permissao**: tabela explicita do que cada papel (Gestor, Diretor, SDR) ve e faz; plano de migracao `admin|user -> gestor|diretor|sdr` (mapeamento de dados + RLS); mecanismo de provisionamento dos 4 usuarios. Gerar via `bmad-create-architecture`. → **APROVADO (2026-06-15):** [architecture-epic-20-niveis-de-acesso.md](architecture-epic-20-niveis-de-acesso.md)

## Requirements Inventory

### Functional Requirements

**Modelo de papeis**
- FR1: Sistema suporta tres papeis de acesso -- Gestor, Diretor e SDR (enum expandido a partir de admin/user).
- FR2: Gestor e Diretor possuem acesso completo a todas as funcionalidades e configuracoes (permissoes identicas por enquanto).
- FR3: SDR possui acesso restrito -- sem visualizacao de configuracoes nem de funcionalidades administrativas.

**Centralizacao da autorizacao**
- FR4: Verificacoes de permissao administrativa sao centralizadas num helper de capacidade (`hasAdminAccess(role)` ou equivalente), usado por middleware, guards de UI e actions/rotas server-side.

**Migracao**
- FR5: Dados de papeis existentes sao migrados sem perda de acesso (`admin -> gestor`, `user -> sdr`); politicas RLS atualizadas para o novo enum.

**Gestao de papeis na UI**
- FR6: A UI de gestao de time exibe e permite atribuir os papeis Gestor / Diretor / SDR (relabel do atual Admin / Usuario).

**Provisionamento dos usuarios do cliente**
- FR7: Os quatro usuarios do cliente sao provisionados com os papeis corretos:
  - Gestao (acesso total): mfabossi@tdec.com.br, seste@tdec.com.br
  - SDR (restrito): ccase@tdec.com.br, rgomes@tdec.com.br

### NonFunctional Requirements

**Security**
- NFR-S1: SDR nunca acessa `/settings`, integracoes, knowledge base, gestao de time, uso/custos nem configuracoes de monitoramento -- bloqueado em todas as camadas (middleware, guard de UI, action/rota server-side, RLS).
- NFR-S2: Autorizacao validada no servidor (defense-in-depth); gating de UI e apenas conveniencia, nunca a unica barreira.
- NFR-S3: Isolamento por tenant_id preservado (padrao existente).

**Compatibilidade**
- NFR-C1: Nenhuma quebra de acesso para usuarios admin existentes durante/apos a migracao.

**Qualidade**
- NFR-Q1: Cobertura de testes para cada papel x superficie protegida (Gestor/Diretor acessa, SDR e negado).

### FR Coverage Map

| FR  | Epic    | Story | Descricao                                                  |
| --- | ------- | ----- | ---------------------------------------------------------- |
| FR1 | Epic 20 | 20.1  | Enum de tres papeis + migracao de dados + RLS              |
| FR5 | Epic 20 | 20.1  | Migracao admin/user -> gestor/diretor/sdr                  |
| FR4 | Epic 20 | 20.2  | Helper de capacidade + refatoracao dos guards              |
| FR2 | Epic 20 | 20.2  | Gestor e Diretor com permissoes identicas (via helper)     |
| FR3 | Epic 20 | 20.2  | SDR restrito (via helper)                                  |
| FR6 | Epic 20 | 20.3  | UI de papeis na gestao de time (relabel + atribuicao)      |
| FR7 | Epic 20 | 20.4  | Provisionamento dos 4 usuarios do cliente                  |
| NFR-S1 | Epic 20 | 20.5 | Auditoria de acesso do SDR (sem vazamentos)               |

## Epic List

### Epic 20: Niveis de Acesso (Gestor / Diretor / SDR)
Expandir o modelo de acesso binario atual para tres papeis -- Gestor, Diretor (identico a Gestor por enquanto) e SDR (restrito) -- centralizando a autorizacao num helper de capacidade, migrando os dados existentes, e provisionando os usuarios do cliente. Prepara a plataforma para entrega com controle de acesso por papel.

**FRs cobertos:** FR1, FR2, FR3, FR4, FR5, FR6, FR7

**Entregaveis:**
- Enum de tres papeis (`gestor | diretor | sdr`) com migracao dos dados existentes e RLS atualizado
- Helper de capacidade central (`hasAdminAccess`) consumido por middleware, guards e server-side
- UI de gestao de time com atribuicao de Gestor / Diretor / SDR
- Quatro usuarios do cliente provisionados com os papeis corretos
- Auditoria comprovando que o SDR nao acessa nenhuma superficie administrativa

---

## Epic 20: Niveis de Acesso (Gestor / Diretor / SDR)

### Story 20.1: Modelo de tres papeis -- enum, migracao e RLS

As a sistema,
I want suportar os papeis Gestor, Diretor e SDR no banco com migracao dos dados existentes,
So that o controle de acesso por papel tenha base solida sem quebrar usuarios atuais.

**Acceptance Criteria:**

**Given** o tipo de papel hoje e `UserRole = "admin" | "user"`
**When** o modelo e expandido
**Then** `UserRole` passa a ser `"gestor" | "diretor" | "sdr"`
**And** os helpers de validacao (`isValidRole`, etc.) refletem os novos valores

**Given** existem perfis com papeis `admin` e `user`
**When** a migration e aplicada
**Then** `admin` e mapeado para `gestor` e `user` e mapeado para `sdr`
**And** nenhum usuario perde o nivel de acesso que tinha

**Given** existem politicas RLS que referenciam `role = 'admin'`/`'user'`
**When** a migration e aplicada
**Then** as politicas sao atualizadas para o novo enum
**And** o isolamento por tenant_id e preservado

**Given** o doc de decisao (matriz de permissao) foi aprovado
**When** a story e iniciada
**Then** a migracao segue exatamente o mapeamento definido no doc

### Story 20.2: Helper de capacidade + refatoracao dos guards

As a desenvolvedor,
I want centralizar a verificacao de permissao administrativa num helper unico,
So that Gestor e Diretor compartilhem acesso hoje e a diferenciacao futura do Diretor seja uma alteracao pontual.

**Acceptance Criteria:**

**Given** as verificacoes hoje sao comparacoes `role === "admin"` / `role !== "admin"` espalhadas (~30 call-sites + middleware + AdminGuard + tenant.isAdmin)
**When** o helper de capacidade e introduzido
**Then** existe uma funcao unica (ex.: `hasAdminAccess(role)`) que retorna `true` para Gestor E Diretor, e `false` para SDR
**And** middleware, `AdminGuard`, `tenant.isAdmin` e todas as actions/rotas passam a usar o helper

**Given** um usuario Gestor ou Diretor
**When** acessa qualquer superficie administrativa (settings, integracoes, knowledge base, time, uso, monitoramento)
**Then** o acesso e permitido

**Given** um usuario SDR
**When** tenta acessar qualquer superficie administrativa
**Then** o acesso e negado em todas as camadas

**Given** no futuro o Diretor precisar de permissoes diferentes do Gestor
**When** a regra for ajustada
**Then** a mudanca ocorre no helper de capacidade (ponto unico), sem caca a call-sites

### Story 20.3: UI de papeis na gestao de time (relabel + atribuicao)

As a Gestor,
I want visualizar e atribuir os papeis Gestor / Diretor / SDR aos membros do time,
So that eu controle quem tem cada nivel de acesso pela interface.

**Acceptance Criteria:**

**Given** a lista de membros do time hoje exibe badges "Admin" / "Usuario"
**When** a UI e atualizada
**Then** os badges passam a exibir "Gestor", "Diretor" ou "SDR" conforme o papel

**Given** o Gestor esta convidando ou editando um membro
**When** seleciona o papel
**Then** as opcoes disponiveis sao Gestor, Diretor e SDR
**And** o papel selecionado e persistido no perfil do membro

**Given** apenas Gestor/Diretor tem acesso a gestao de time
**When** um SDR tenta acessar a pagina de time
**Then** o acesso e negado (consistente com NFR-S1)

### Story 20.4: Provisionamento dos usuarios do cliente

As a Gestor,
I want que os quatro usuarios do cliente existam com os papeis corretos,
So that a equipe da TDec consiga acessar a plataforma com os niveis adequados na entrega.

**Acceptance Criteria:**

**Given** os quatro e-mails do cliente ainda nao possuem conta
**When** o provisionamento e executado (mecanismo definido no doc de decisao: convite via UI de time ou seed)
**Then** sao criadas/convidadas as contas:
  - mfabossi@tdec.com.br -> Gestor
  - seste@tdec.com.br -> Gestor
  - ccase@tdec.com.br -> SDR
  - rgomes@tdec.com.br -> SDR

**Given** um usuario provisionado faz login pela primeira vez
**When** acessa a plataforma
**Then** ve exatamente as funcionalidades correspondentes ao seu papel

**Given** os usuarios pertencem ao tenant do cliente
**When** sao criados
**Then** o `tenant_id` correto e atribuido (isolamento preservado)

### Story 20.5: Auditoria de acesso do SDR (sem vazamentos)

As a responsavel pela seguranca,
I want garantir que o SDR nao enxergue nem acione nenhuma funcionalidade administrativa,
So that o controle de acesso seja efetivo em todas as camadas antes da entrega.

**Acceptance Criteria:**

**Given** o modelo de tres papeis e o helper de capacidade estao em producao
**When** uma varredura e feita em rotas, itens de navegacao, dialogs e endpoints
**Then** confirma-se que nenhum link/rota/endpoint administrativo fica visivel ou acionavel para SDR

**Given** cada superficie protegida (settings, integracoes, knowledge base, time, uso, monitoramento)
**When** acessada por um SDR (UI e chamada direta de API/action)
**Then** o acesso e negado tanto na UI quanto no servidor (defense-in-depth)

**Given** a auditoria identifica alguma superficie nao protegida
**When** o gap e encontrado
**Then** e corrigido e coberto por teste automatizado (papel x superficie)
