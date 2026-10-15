---
stepsCompleted: [1, 2, 3, 4]
storiesEm: [23, 24, 25]
status: approved
aprovadoEm: 2026-10-15
criadoEm: 2026-10-15
inputDocuments:
  - analise-agente-e-plano-evolucao-2026-10-15.md
  - epic-22-agente-tdec-2.0.md
  - agente-e2e-teste-atibaia-2026-07-24.md
  - epics-agente-tdec.md
  - prd.md
  - architecture.md
  - plano-evolucao-maquina-de-resultado-2026-07-10.md
  - ux-design-specification.md
  - ../implementation-artifacts/deferred-work.md
decisoesDoCliente:
  - "D1: fluxo manual continua como está; funcionalidades de qualidade/ABM entram NO agente, incrementalmente"
  - "D2: spike do Treg aprovado (antes do Marco 2/3)"
  - "D3: cliente fornece alguns números/cases para a seção de Provas da KB"
  - "D4: lista de supressão inicial (clientes, negociações, concorrentes, parceiros, opt-outs)"
  - "D5: Epic 23 = Plataforma (higiene); Epic 24 = Agente 3.0 em 3 marcos"
  - "Q2 (jul/2026) mantida: pipeline de execução determinístico; LLM só na conversa e na geração de conteúdo"
---

# tdec-prospect - Epic Breakdown: Plataforma (Higiene), Agente TDec 3.0 & Radar de Oportunidades

## Overview

Origem: análise de 2026-10-15 (`analise-agente-e-plano-evolucao-2026-10-15.md`) — 6 auditorias
somente-leitura + dados reais de produção. Diagnóstico central: o agente tem 5,4% de conclusão e
gerou 1 de 20 campanhas porque **faz o mesmo que o fluxo manual com mais atrito**. Para o objetivo
do cliente (poucos leads de altíssima qualidade), o agente evolui para **Analista de Contas**:
escolhe contas, prova o fit, pesquisa cada conta e escreve 1-para-1. Antes disso, a plataforma
precisa de higiene de segurança/operação e o agente precisa parar de travar.

- **Epic 23 — Plataforma: Higiene & Proteção de Envio** (curto, ~1 semana)
- **Epic 24 — Agente TDec 3.0: Analista de Contas** (3 marcos, com deploy + smoke + checkpoint ao fim de cada)
- **Epic 25 — Radar de Oportunidades** (in-app; depende do 23 e do Marco 2 do 24)

## Requirements Inventory

### Functional Requirements

**Epic 23 — Plataforma: ambiente de teste**

- FR43: Existe um banco de teste (segundo projeto Supabase) espelhando produção — estrutura e dados — usado pelo desenvolvimento local; produção só recebe migrations, jobs, Edge Functions e alterações de dados no deploy

**Epic 23 — Plataforma: segurança e operação**

- FR1: O webhook do Instantly rejeita requisições sem segredo válido (token na URL ou header)
- FR2: Todas as rotas de cron/processamento em lote falham fechadas quando o segredo não está configurado ou não confere
- FR3: Dependências de produção sem CVE crítico/alto conhecido (`next` ≥ 16.4.x; `xlsx` substituído por alternativa mantida no parser de upload)
- FR4: Erros de servidor são registrados e consultáveis na própria plataforma, e há alerta in-app quando um job agendado falha ou deixa de rodar — usando só a infraestrutura atual (Supabase/pg_cron/Vercel), sem ferramenta paga
- FR5: Todo PR roda CI com lint, typecheck (incluindo `__tests__`) e vitest; a base atual fica verde (6 erros de lint e 182 de tsc zerados)

**Epic 23 — Plataforma: proteção de envio (vale para manual e agente)**

- FR6: Gestor mantém uma **lista de supressão** por domínio e por e-mail (cadastro manual + import CSV, com motivo: cliente, negociação, concorrente, parceiro, opt-out)
- FR7: A supressão é aplicada na busca, no import, ao adicionar leads em campanha e no export (manual e agente); leads suprimidos aparecem marcados e não são exportados
- FR8: Opt-outs classificados pelo loop de resposta (Epic 21) entram automaticamente na lista de supressão
- FR9: O export para o Instantly não reenvia para quem já está em outra campanha (`skip_if_in_workspace`/`skip_if_in_campaign` ligados) e avisa quando um lead foi contatado nos últimos 90 dias
- FR10: O motor de oportunidades desconsidera aberturas/cliques de leads protegidos por security gateway (ESG já capturado no Epic 14.5) para não gerar "lead quente" falso

**Epic 24 / Marco 1 — Confiabilidade do agente**

- FR11: Step parado em `running` além de um tempo limite é detectado automaticamente, marcado `failed` e a execução vai para `paused`
- FR12: Toda gravação de checkpoint/aprovação/falha do step verifica erro do banco e nunca deixa o step em `running` silenciosamente
- FR13: O export do agente é idempotente — retry reaproveita a campanha já criada no Instantly em vez de criar outra
- FR14: A rota de execução só aceita steps `pending`, `failed` ou `rejected`; o PATCH de briefing só é aceito com a execução em `pending`
- FR15: A rota de execução tem tempo máximo compatível com o step mais longo; o disparo do próximo step verifica a resposta e mostra erro ao usuário quando falha
- FR16: Usuário pode tentar de novo um step que falhou, pela UI, sem recriar a execução
- FR17: A conversa nunca fica sem resposta: cancelar o plano volta ao briefing editável; mensagens após confirmação recebem resposta; ramos de produto e de leads próprios têm saída ("seguir sem produto", "na verdade quero buscar")
- FR18: Confirmações (briefing, produto, leads) são feitas por botão/card; o casamento por palavra-chave sai do caminho de decisão
- FR19: Todos os turnos (inclusive de produto e leads) entram na memória enviada ao LLM

**Epic 24 / Marco 1 — Copy que não envergonha (prompts compartilhados com o manual)**

- FR20: Nenhum e-mail sai com dados fictícios ("Nome", "Empresa", setor "Tecnologia"); dados ausentes viram variável real ou são omitidos
- FR21: Follow-ups recebem estratégia explícita e ângulo novo por posição; numeração da sequência correta
- FR22: Prompts não pedem prova social, escassez, números ou cases que não estejam na KB; corpo abre pelo problema/contexto do lead, não pelo produto
- FR23: A Knowledge Base tem seção de **Provas** (cases, números, clientes de referência, certificações) com marcação de "autorizado para uso"; só itens autorizados chegam aos prompts
- FR24: Um revisor automático avalia cada e-mail gerado (claims apoiados em fatos/provas, clichês, placeholders, relevância setor×oferta, tamanho, CTA) e reescreve até 2 vezes; persistindo a reprovação, marca para revisão humana
- FR25: O custo real de cada execução é gravado (`cost_actual`) e a estimativa pré-execução reflete o que o pipeline realmente faz (inclui enrichment)

**Epic 24 / Marco 2 — Analista de Contas**

- FR26: Usuário informa quantos leads quer (`leadCount`); o plano mostra "até N leads" e a revisão pré-seleciona N
- FR27: O agente abre a conversa propondo um briefing a partir do ICP da KB (cargos, região, porte), que o usuário ajusta
- FR28: Usuário pode informar uma lista de contas (nomes ou domínios) e o agente busca os decisores dessas contas (modo ABM)
- FR29: O agente busca um universo maior (3–5× N) e atribui **Fit Score A/B/C** a cada lead contra o ICP, com uma linha de justificativa; a revisão ordena por score e pré-seleciona os N melhores
- FR30: A busca filtra pela localização da **empresa** (não só da pessoa), exclui setor público por padrão e aplica supressão + "já contatados"
- FR31: Antes do export, o e-mail de cada lead é verificado; e-mails não verificados/catch-all são sinalizados e não exportados sem confirmação; e-mail pessoal não é revelado
- FR32: Spike do Treg executado e documentado (cobertura BR, qualidade de verify/find, custo, BYOK) antes de integrá-lo; integração via serviço próprio com chave por tenant

**Epic 24 / Marco 3 — Dossiê & "por que agora"**

- FR33: Para cada conta aprovada, o agente monta um **dossiê** (site, notícias 90 dias, vagas de segurança/infra, tecnologias, posts relevantes da pessoa) como fatos com fonte, data e confiança
- FR34: Cada lead recebe um gatilho "por que agora" escolhido entre os fatos; sem gatilho confiável, o lead segue a copy padrão e é sinalizado
- FR35: A copy do e-mail 1 e dos follow-ups é escrita por lead a partir do dossiê + hipótese de dor por persona + provas da KB, e enviada como texto por lead ao Instantly
- FR36: O dossiê é visível na revisão do agente e no card da oportunidade (Epic 21)
- FR37: Depois da execução, o usuário pode conversar sobre o resultado ("por que esse lead?", "reescreve o e-mail 3", "traz mais 2 parecidos com X") sem alterar o pipeline determinístico
- FR38: O agente usa o histórico: avisa leads já contatados e sugere briefings que tiveram resposta

**Funcionalidades novas aprovadas pelo Fabossi (2026-10-15)**

- FR39: **Contas parecidas** — usuário informa 3–5 clientes de referência; o agente deriva o perfil comum (setor, porte, tecnologias, região) e busca contas semelhantes que ainda não são clientes nem estão suprimidas
- FR40: **Preparação de reunião** — quando uma oportunidade é marcada como interessada/reunião, o agente gera um briefing de 1 página (dossiê da conta, histórico de engajamento e resposta, pontos de conversa, objeções prováveis), visível no card da oportunidade
- FR41: **Ex-clientes que mudaram de empresa** — contatos de clientes atuais/antigos da TDec são acompanhados; quando um deles muda de empresa, o sistema gera um sinal/oportunidade "contato conhecido em nova conta"
- FR42: **Radar de oportunidades (in-app)** — painel no próprio software que reúne periodicamente gatilhos sobre contas do ICP (vagas de segurança/infra, mudança de cargo, ex-clientes em nova empresa, notícias), via Treg + TheirStack + monitoramento existente, com ação de 1 clique para abrir uma execução do agente a partir do gatilho

**Descartadas conscientemente:** checagem pública de domínio (SPF/DMARC/TLS); múltiplos decisores por conta com mensagens coordenadas; envio do radar por WhatsApp (fica in-app).

### NonFunctional Requirements

- NFR1: Pipeline de execução continua determinístico (Q2) — LLM decide conversa e conteúdo, nunca ordem de steps, gasto de créditos ou envio
- NFR2: O fluxo manual não muda de comportamento, exceto pelas proteções compartilhadas (supressão, dedupe, prompts corrigidos), que são intencionais
- NFR3: Toda chamada a serviço pago nova ou existente no agente registra uso em `api_usage_logs` com tenant e execução/campanha
- NFR4: Nenhum retry cobra duas vezes o mesmo trabalho; toda execução respeita um teto de custo configurável
- NFR5: Chaves de serviços novos (Treg) seguem o padrão de chave por tenant criptografada (AES-256-GCM) e service-role no runtime do agente (22.9)
- NFR6: Definition of Done inclui smoke real (tela + banco), não só testes mockados (lição das retros 21/22)
- NFR7: Migrations novas (supressão, dossiê, provas) seguem processo controlado e versionado; código não sobe antes da migration aplicada
- NFR8: LGPD — sem e-mail pessoal em prospecção B2B; fatos do dossiê guardam a fonte; opt-out respeitado em todos os caminhos
- NFR10: Nada do desenvolvimento altera o comportamento de produção antes do deploy: migrations só aditivas; jobs agendados, Edge Functions e alterações de dados existentes são aplicados em produção apenas no deploy, após validação no banco de teste; campanhas de teste nunca são ativadas no Instantly
- NFR9: Respostas do chat < 5s; falha/timeout de LLM ou de fonte externa degrada para o comportamento anterior (fail-safe), nunca trava a execução

### Additional Requirements

- Sem orquestrador durável nesta fase: TTL de step via pg_cron (já usado: 00045/00056/00061) + `after()` do Next + idempotência por output parcial. Reavaliar Vercel Workflow/Queues só com execução recorrente (fora de escopo)
- Epic 18 é **absorvido de forma reduzida** (FR11–FR16, FR25); itens 18.3 (lista de pausadas) e 18.5 (audit log) ficam descartados
- Reuso obrigatório: `base-service` para Treg; `promptManager`/`ai_prompts` para prompts; `relevance-classifier` para filtrar posts; busca por domínio existente (`search-leads-step.ts:142-165`); `lead-persistence`/`campaign-persistence` (22.15/22.16)
- Provider de IA precisa do ajuste de compatibilidade com modelos novos (já feito no parser, `parser-config.ts`) antes de trocar modelo de escrita/revisão
- Housekeeping: fechar no sprint-status os Epics 4 (cancelar 4-5), 12, 14, 19, 20; marcar `deferred-work.md:72` como resolvido (c959f26)
- Branches: um branch por épico (`epic/23-...`, `epic/24-...`), PR para `main` ao fim

### UX Design Requirements

- UX-DR1: Tela de Lista de Supressão em Configurações (tabela domínio/e-mail/motivo/data, busca, adicionar, import CSV, remover) no padrão visual das telas de Configurações
- UX-DR2: Badge "Suprimido"/"Já contatado" nas tabelas de leads, na revisão do agente e no export
- UX-DR3: Botão "Tentar novamente" no card de step com falha, com mensagem de erro coerente com `isRetryable`
- UX-DR4: Card de resumo do briefing com botões Confirmar/Editar (chips editáveis), substituindo confirmação por texto
- UX-DR5: Na revisão de leads: badge A/B/C + justificativa de 1 linha + ordenação por score + input numérico de quantidade
- UX-DR6: Painel de dossiê por conta (fatos com fonte/data, gatilho "por que agora") na revisão do agente e no card da oportunidade
- UX-DR7: Indicador de status do revisor de copy por e-mail (aprovado / reescrito / precisa revisão humana)

### FR Coverage Map

| FR | Épico / Marco | Descrição curta |
|----|----|----|
| FR43 | Epic 23 | Banco de teste espelhando produção |
| FR1 | Epic 23 | O webhook do Instantly rejeita requisições sem segredo válido (token na URL ou header) |
| FR2 | Epic 23 | Todas as rotas de cron/processamento em lote falham fechadas quando o segredo não está con |
| FR3 | Epic 23 | Dependências de produção sem CVE crítico/alto conhecido (`next` ≥ 16.4.x |
| FR4 | Epic 23 | Erros registrados na plataforma + alerta in-app de jobs (sem ferramenta paga) |
| FR5 | Epic 23 | Todo PR roda CI com lint, typecheck (incluindo `__tests__`) e vitest |
| FR6 | Epic 23 | Gestor mantém uma lista de supressão por domínio e por e-mail (cadastro manual + import CS |
| FR7 | Epic 23 | A supressão é aplicada na busca, no import, ao adicionar leads em campanha e no export (ma |
| FR8 | Epic 23 | Opt-outs classificados pelo loop de resposta (Epic 21) entram automaticamente na lista de  |
| FR9 | Epic 23 | O export para o Instantly não reenvia para quem já está em outra campanha (`skip_if_in_wor |
| FR10 | Epic 23 | O motor de oportunidades desconsidera aberturas/cliques de leads protegidos por security g |
| FR11 | Epic 24 / Marco 1 | Step parado em `running` além de um tempo limite é detectado automaticamente, marcado `fai |
| FR12 | Epic 24 / Marco 1 | Toda gravação de checkpoint/aprovação/falha do step verifica erro do banco e nunca deixa o |
| FR13 | Epic 24 / Marco 1 | O export do agente é idempotente |
| FR14 | Epic 24 / Marco 1 | A rota de execução só aceita steps `pending`, `failed` ou `rejected` |
| FR15 | Epic 24 / Marco 1 | A rota de execução tem tempo máximo compatível com o step mais longo |
| FR16 | Epic 24 / Marco 1 | Usuário pode tentar de novo um step que falhou, pela UI, sem recriar a execução |
| FR17 | Epic 24 / Marco 1 | A conversa nunca fica sem resposta: cancelar o plano volta ao briefing editável |
| FR18 | Epic 24 / Marco 1 | Confirmações (briefing, produto, leads) são feitas por botão/card |
| FR19 | Epic 24 / Marco 1 | Todos os turnos (inclusive de produto e leads) entram na memória enviada ao LLM |
| FR20 | Epic 24 / Marco 1 | Nenhum e-mail sai com dados fictícios ("Nome", "Empresa", setor "Tecnologia") |
| FR21 | Epic 24 / Marco 1 | Follow-ups recebem estratégia explícita e ângulo novo por posição |
| FR22 | Epic 24 / Marco 1 | Prompts não pedem prova social, escassez, números ou cases que não estejam na KB |
| FR23 | Epic 24 / Marco 1 | A Knowledge Base tem seção de Provas (cases, números, clientes de referência, certificaçõe |
| FR24 | Epic 24 / Marco 1 | Um revisor automático avalia cada e-mail gerado (claims apoiados em fatos/provas, clichês, |
| FR25 | Epic 24 / Marco 1 | O custo real de cada execução é gravado (`cost_actual`) e a estimativa pré-execução reflet |
| FR26 | Epic 24 / Marco 2 | Usuário informa quantos leads quer (`leadCount`) |
| FR27 | Epic 24 / Marco 2 | O agente abre a conversa propondo um briefing a partir do ICP da KB (cargos, região, porte |
| FR28 | Epic 24 / Marco 2 | Usuário pode informar uma lista de contas (nomes ou domínios) e o agente busca os decisore |
| FR29 | Epic 24 / Marco 2 | O agente busca um universo maior (3–5× N) e atribui Fit Score A/B/C a cada lead contra o I |
| FR30 | Epic 24 / Marco 2 | A busca filtra pela localização da empresa (não só da pessoa), exclui setor público por pa |
| FR31 | Epic 24 / Marco 2 | Antes do export, o e-mail de cada lead é verificado |
| FR32 | Epic 24 / Marco 2 | Spike do Treg executado e documentado (cobertura BR, qualidade de verify/find, custo, BYOK |
| FR33 | Epic 24 / Marco 3 | Para cada conta aprovada, o agente monta um dossiê (site, notícias 90 dias, vagas de segur |
| FR34 | Epic 24 / Marco 3 | Cada lead recebe um gatilho "por que agora" escolhido entre os fatos |
| FR35 | Epic 24 / Marco 3 | A copy do e-mail 1 e dos follow-ups é escrita por lead a partir do dossiê + hipótese de do |
| FR36 | Epic 24 / Marco 3 | O dossiê é visível na revisão do agente e no card da oportunidade (Epic 21) |
| FR37 | Epic 24 / Marco 3 | Depois da execução, o usuário pode conversar sobre o resultado ("por que esse lead?", "ree |
| FR38 | Epic 24 / Marco 3 | O agente usa o histórico: avisa leads já contatados e sugere briefings que tiveram respost |
| FR39 | Epic 24 / Marco 2 | Contas parecidas |
| FR40 | Epic 24 / Marco 3 | Preparação de reunião |
| FR41 | Epic 25 | Ex-clientes que mudaram de empresa |
| FR42 | Epic 25 | Radar de oportunidades (in-app) |

## Epic List

### Epic 23: Plataforma — Higiene & Proteção de Envio
A plataforma fica segura, monitorada (com a infraestrutura atual, sem ferramentas pagas novas) e com CI; nenhuma campanha (manual ou do agente) atinge cliente, negociação em andamento, concorrente, opt-out ou quem já foi contatado; oportunidades deixam de contar aberturas automáticas de security gateway.
**FRs covered:** FR43, FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10
**Notas:** 9 stories (23.0–23.8), ~1 semana; a 23.0 vem primeiro e vale para os três épicos. Toca `instantly.ts`/export antes do Epic 24 (ordem resolve a sobreposição). Lista de supressão = migration nova (NFR7). Base de clientes da supressão é insumo do Epic 25.

### Epic 24: Agente TDec 3.0 — Analista de Contas
O agente vira o caminho para poucos leads de alta qualidade: não trava, escreve copy honesta, escolhe contas com nota de fit justificada (inclusive a partir de clientes de referência), verifica e-mails, pesquisa cada conta e prepara a reunião quando o lead responde.
**FRs covered:** FR11–FR40 (exceto FR41, FR42)
**Marcos (deploy + smoke real + checkpoint com Fabossi ao fim de cada):**
- Marco 1 — Confiável & copy honesta: FR11–FR25 (absorve Epic 18 reduzido)
- Marco 2 — Analista de Contas: FR26–FR32, FR39 (abre com spike do Treg)
- Marco 3 — Dossiê & reunião: FR33–FR38, FR40
**Notas:** ~24 stories. Pipeline segue determinístico (NFR1). Correções de prompt (FR20–FR22) beneficiam também o fluxo manual.

### Epic 25: Radar de Oportunidades
A plataforma passa a trazer oportunidades sozinha: painel in-app com gatilhos periódicos sobre contas do ICP (vagas de segurança/infra, mudança de cargo, ex-clientes em nova empresa, notícias), cada um abrindo uma execução do agente em 1 clique.
**FRs covered:** FR41, FR42
**Notas:** ~5 stories. Depende do Epic 23 (base de clientes) e do Epic 24 Marco 2 (serviço Treg). Execução agendada via pg_cron; reavaliar orquestrador durável aqui.

## Epic 23: Plataforma — Higiene & Proteção de Envio

A plataforma fica segura, monitorada (com a infraestrutura atual, sem ferramentas pagas novas) e com CI; nenhuma campanha (manual ou do agente) atinge cliente, negociação em andamento, concorrente, opt-out ou quem já foi contatado; oportunidades deixam de contar aberturas automáticas de security gateway.

### Story 23.0: Banco de teste espelhando produção

**Requisitos:** FR43 · NFR10

As a responsável técnico,
I want desenvolver e testar num banco separado, cópia do de produção,
So that nada do que fazemos localmente mude o que o cliente usa hoje até o deploy.

**Acceptance Criteria:**

**Given** um segundo projeto Supabase (plano gratuito) criado para teste
**When** a estrutura e os dados de produção são copiados para ele (Supabase CLI / pg_dump, incluindo usuários de auth necessários para login)
**Then** o app local funciona contra o banco de teste com os mesmos dados, logins e integrações (chaves criptografadas válidas com a mesma `API_KEYS_ENCRYPTION_KEY`)
**And** extensões pg_cron/pg_net estão habilitadas e as Edge Functions publicadas no projeto de teste, com os jobs agendados apontando para o próprio ambiente de teste

**Given** o `.env.local`
**When** a story é concluída
**Then** aponta para o banco de teste; as credenciais de produção ficam só nas variáveis da Vercel
**And** um passo a passo em `docs/` explica como reproduzir/atualizar a cópia e como aplicar uma mudança em produção no deploy

**Given** as 63 migrations versionadas
**When** comparadas com a estrutura copiada de produção
**Then** as divergências encontradas (drift de aplicação manual) ficam registradas

**Given** testes que tocam Instantly
**When** executados no ambiente de teste
**Then** campanhas podem ser criadas, mas nunca ativadas (regra documentada)

### Story 23.1: Webhook e crons autenticados

**Requisitos:** FR1, FR2

As a gestor da TDec,
I want que só o Instantly e os jobs agendados legítimos consigam alimentar a plataforma,
So that ninguém consiga forjar respostas/aberturas nem disparar processamentos com service role.

**Acceptance Criteria:**

**Given** a Edge Function `instantly-webhook` publicada com `--no-verify-jwt`
**When** chega uma requisição sem o segredo configurado (token na URL ou header) ou com segredo errado
**Then** responde 401 e nada é gravado em `campaign_events`
**And** a URL do webhook com segredo fica documentada para configurar no Instantly

**Given** qualquer rota de cron/lote (`monitoring/process-batch`, `replies/process-batch` e demais com `Bearer`)
**When** o segredo da env não está definido ou não confere
**Then** a rota responde 401/503 e não executa (fail-closed, mesmo padrão do `replies/process-batch`)
**And** há teste cobrindo "env ausente" e "segredo errado" para cada rota

### Story 23.2: Dependências sem vulnerabilidades críticas

**Requisitos:** FR3

As a responsável técnico,
I want as dependências de produção sem CVE crítico/alto conhecido,
So that a plataforma do cliente não fique exposta por bibliotecas desatualizadas.

**Acceptance Criteria:**

**Given** `next` 16.1.6 e `xlsx` 0.18.5 com CVEs conhecidos
**When** a story é concluída
**Then** `next` está em ≥ 16.4.x e `npm audit --omit=dev` não aponta crítico nem alto
**And** `xlsx` é substituído por alternativa mantida no parser de upload (`src/lib/utils/xlsx-parser.ts`) sem mudar o resultado do import (testes de import Excel continuam verdes)

**Given** o upgrade aplicado
**When** roda build, vitest e smoke das telas principais (login, leads, campanhas, agente, oportunidades)
**Then** tudo passa sem regressão

### Story 23.3: Saúde dos jobs e registro de erros com a infraestrutura atual

**Requisitos:** FR4

As a responsável técnico,
I want ser avisado dentro da própria plataforma quando um job agendado falha ou para de rodar, e ter os erros de servidor registrados num lugar consultável,
So that falhas não fiquem semanas invisíveis (como o cron de monitoramento que nunca rodou) — sem contratar ferramenta nova.

**Acceptance Criteria:**

**Given** os jobs agendados no pg_cron (`reply-sweep`, `monitor-leads` e os que vierem) e o histórico em `cron.job_run_details` / `net._http_response`
**When** um job falha ou não registra execução bem-sucedida dentro da janela esperada
**Then** um check agendado (pg_cron, sem serviço externo) gera uma notificação in-app para gestores, reaproveitando a infraestrutura de notificações do Epic 21
**And** o estado atual do `monitor-leads` (`last_run_at` nulo) é diagnosticado e corrigido ou documentado

**Given** uma exceção não tratada em rota de API, step do agente ou cron
**When** ela acontece
**Then** fica registrada numa tabela de erros do próprio Supabase (tenant, rota, mensagem, data; sem chaves nem PII) além do log da Vercel
**And** gestores conseguem ver os erros recentes numa seção simples de Configurações

**Fora do escopo:** ferramentas externas pagas (Sentry/Datadog). Reavaliar depois se o volume justificar.

### Story 23.4: CI no GitHub e base verde

**Requisitos:** FR5

As a responsável técnico,
I want que todo PR rode lint, typecheck e testes automaticamente,
So that regressões sejam barradas antes do merge.

**Acceptance Criteria:**

**Given** um workflow do GitHub Actions em `.github/workflows`
**When** um PR é aberto ou atualizado para `main`
**Then** roda `eslint`, `tsc --noEmit` (incluindo `__tests__`) e `vitest run`, e o PR mostra o resultado

**Given** a base atual (6 erros de lint em `src`, 182 erros de tsc em `__tests__`)
**When** a story é concluída
**Then** os três checks passam na branch do épico

### Story 23.5: Lista de supressão — cadastro e import

**Requisitos:** FR6 · UX-DR1

As a gestor da TDec,
I want manter uma lista de domínios e e-mails que nunca podem receber campanha,
So that clientes, negociações em andamento, concorrentes, parceiros e opt-outs fiquem protegidos.

**Acceptance Criteria:**

**Given** a migration nova da tabela de supressão (tenant, tipo domínio/e-mail, valor normalizado, motivo, origem, criado por/em) com RLS por tenant
**When** o gestor acessa Configurações → Lista de Supressão
**Then** vê tabela com busca, pode adicionar, remover e importar CSV (domínio ou e-mail + motivo)
**And** domínios são normalizados (minúsculas, sem `www.`/protocolo) e duplicados são ignorados com aviso

**Given** um SDR logado
**When** acessa a lista
**Then** pode consultar, mas só gestor/diretor pode alterar (matriz do Epic 20)

**Given** o import de um CSV com linhas inválidas
**When** o import termina
**Then** mostra quantas entraram, quantas foram ignoradas e por quê

### Story 23.6: Supressão aplicada em todos os caminhos

**Requisitos:** FR7, FR8 · UX-DR2

As a gestor da TDec,
I want que a lista de supressão seja respeitada em busca, import, campanha e export — manual e agente,
So that ninguém da lista receba e-mail por nenhum caminho.

**Acceptance Criteria:**

**Given** um lead cujo e-mail ou domínio da empresa está na lista
**When** aparece na busca, no import, na revisão do agente ou na tela de leads
**Then** é exibido com badge "Suprimido" (motivo no tooltip)

**Given** uma campanha (manual ou do agente) com leads suprimidos
**When** o usuário adiciona leads à campanha ou exporta para o Instantly
**Then** os suprimidos são removidos do envio e o usuário vê "N leads suprimidos não foram exportados"
**And** o step de export do agente aplica a mesma regra e registra a contagem no output

**Given** o loop de resposta (Epic 21) classifica uma resposta como `opt_out`
**When** a classificação é gravada
**Then** o e-mail do lead entra automaticamente na lista com origem "opt-out automático"

### Story 23.7: Envio sem repetição

**Requisitos:** FR9 · UX-DR2

As a gestor da TDec,
I want que o Instantly não reenvie para quem já está em outra campanha e que eu seja avisado de quem foi contatado recentemente,
So that não queimemos o lead nem a reputação do domínio.

**Acceptance Criteria:**

**Given** o envio de leads ao Instantly (`instantly.ts`, hoje com `skip_if_in_workspace/skip_if_in_campaign = false`)
**When** a story é concluída
**Then** ambos estão `true` no export manual e do agente
**And** o resultado do export informa quantos foram pulados pelo Instantly

**Given** um lead que já esteve em campanha exportada nos últimos 90 dias
**When** é adicionado a uma nova campanha ou aparece na revisão do agente
**Then** aparece com badge "Já contatado (campanha X, data)" e o usuário pode removê-lo ou manter conscientemente

### Story 23.8: Oportunidades sem falso positivo de security gateway

**Requisitos:** FR10

As a vendedor da TDec,
I want que "lead quente" por engajamento não seja disparado por aberturas automáticas de filtros de segurança de e-mail,
So that a Central de Oportunidades mostre só interesse humano real.

**Acceptance Criteria:**

**Given** um lead cujo e-mail passa por security gateway (`esg_code` já capturado pelo Epic 14.5)
**When** o motor de oportunidades avalia aberturas/cliques
**Then** esses eventos não contam para o limiar de oportunidade por engajamento
**And** respostas de e-mail continuam gerando oportunidade normalmente

**Given** oportunidades de engajamento já existentes de leads com ESG
**When** a story é concluída
**Then** elas recebem marcação "possível abertura automática" na Central (sem apagar histórico)

## Epic 24: Agente TDec 3.0 — Analista de Contas

O agente vira o caminho para poucos leads de alta qualidade: não trava, escreve copy honesta, escolhe contas com nota de fit justificada (inclusive a partir de clientes de referência), verifica e-mails, pesquisa cada conta e prepara a reunião quando o lead responde. Ao fim de cada marco: deploy, smoke real e checkpoint com o Fabossi.

**Marco 1 — Confiável & copy honesta (FR11–FR25)**

### Story 24.1: Etapa travada é destravada sozinha

**Requisitos:** FR11, FR12

As a usuário do agente,
I want que uma etapa que morreu no meio (timeout, deploy, erro de gravação) seja detectada e liberada automaticamente,
So that minha execução nunca fique presa em "rodando" para sempre.

**Acceptance Criteria:**

**Given** um step em `running` com `started_at` mais antigo que o limite configurado (ex.: 10 min)
**When** o job de varredura (pg_cron) roda
**Then** o step passa a `failed` com erro "Etapa interrompida — tente novamente", a execução vai para `paused` e uma mensagem do agente explica o ocorrido
**And** a varredura usa compare-and-swap (só atualiza se ainda estiver `running`) para não atropelar um step que terminou no mesmo instante

**Given** `saveCheckpoint`, `saveAwaitingApproval` e `saveFailure` em `base-step.ts`
**When** a gravação no banco retorna `{ error }`
**Then** o erro é tratado (retry curto e, persistindo, falha explícita registrada), nunca deixando o step em `running` silenciosamente
**And** há testes cobrindo erro de gravação em cada um dos três caminhos

### Story 24.2: Execução protegida contra cobrança dupla

**Requisitos:** FR13, FR14

As a gestor da TDec,
I want que nenhum retry ou clique duplo repita trabalho pago,
So that não paguemos duas vezes nem criemos campanhas órfãs no Instantly.

**Acceptance Criteria:**

**Given** o step de export já criou a campanha no Instantly (id no output parcial do step)
**When** o export é reexecutado após falha
**Then** reaproveita a campanha existente e só completa o que faltou (subir leads), sem criar outra

**Given** a rota `POST .../steps/[n]/execute`
**When** o step alvo está `completed`, `approved`, `running` ou `awaiting_approval`
**Then** responde 409 e não executa nada (só aceita `pending`, `failed`, `rejected`)

**Given** a rota `PATCH .../briefing`
**When** a execução não está `pending`
**Then** responde 409 e o briefing de uma execução em andamento nunca é sobrescrito
**And** o chat, após F5 numa execução em andamento, não trata mensagem livre como briefing novo

### Story 24.3: Avanço confiável e "Tentar novamente"

**Requisitos:** FR15, FR16 · UX-DR3

As a usuário do agente,
I want que a execução avance mesmo quando um disparo falha e que eu possa refazer uma etapa que deu erro,
So that eu não precise abrir uma conversa nova e perder o progresso.

**Acceptance Criteria:**

**Given** a rota de execução de step
**When** a story é concluída
**Then** declara `maxDuration` compatível com o step mais longo (300s)

**Given** o disparo do próximo step (`triggerNextStep`)
**When** a resposta não é 2xx
**Then** o usuário vê o erro no chat e um botão para tentar de novo (nenhum gate mostra "ativada" sem a ativação ter rodado)

**Given** um step em `failed`
**When** o usuário clica "Tentar novamente" no card do step
**Then** o step é reexecutado (respeitando a 24.2) e a execução sai de `paused`
**And** a mensagem de erro é coerente com `isRetryable` (não diz "tente novamente" quando não adianta)

### Story 24.4: Conversa sem becos sem saída

**Requisitos:** FR17, FR19

As a usuário do agente,
I want que o agente sempre me responda e me dê um caminho, em qualquer ponto da conversa,
So that eu nunca precise começar do zero por o agente ter "parado de ouvir".

**Acceptance Criteria:**

**Given** o usuário clica "Cancelar" no plano de execução
**When** envia uma nova mensagem
**Then** a execução volta para briefing editável e a mensagem é processada como ajuste

**Given** o briefing confirmado e fora do modo de ajuste
**When** o usuário escreve algo
**Then** o agente responde (explica o estado atual e as opções), nunca deixa a mensagem sem resposta

**Given** o ramo de cadastro de produto
**When** o pedido vem sem nome de produto ou o usuário responde "não" na confirmação
**Then** o agente pede o nome uma vez e oferece "seguir sem produto"; não entra em loop

**Given** o estado de colar leads próprios
**When** o usuário diz que prefere buscar
**Then** o agente sai do ramo e volta ao briefing de busca

**Given** qualquer turno (inclusive produto e leads)
**When** é enviado ou respondido
**Then** entra na memória enviada ao LLM (`sendAndRecord`), e o produto cadastrado não se perde em correções seguintes

### Story 24.5: Confirmação por card com botões

**Requisitos:** FR18 · UX-DR4

As a usuário do agente,
I want confirmar briefing, produto e leads clicando em botões num card de resumo,
So that uma frase como "não, pode trocar pra CFO" nunca seja entendida como "sim".

**Acceptance Criteria:**

**Given** o briefing completo
**When** o agente apresenta o resumo
**Then** mostra um card com os campos como chips editáveis e botões "Confirmar" e "Ajustar"

**Given** o card visível
**When** o usuário digita texto livre em vez de clicar
**Then** o texto vai para o LLM como ajuste, nunca como confirmação

**Given** a confirmação de produto e de leads próprios
**When** a story é concluída
**Then** também usam botões, e o casamento por palavra-chave (`includes`) sai do caminho de decisão (permanece só como fallback se o LLM falhar, sem confirmar nada sozinho)

### Story 24.6: E-mails sem dados fictícios e follow-ups com valor

**Requisitos:** FR20, FR21

As a lead que recebe o e-mail,
I want ler um texto com meu nome real e follow-ups que tragam algo novo,
So that a TDec não pareça um robô ("Oi Nome") nem insistente ("viu meu e-mail?").

**Acceptance Criteria:**

**Given** a geração de campanha pelo agente
**When** monta as variáveis de IA
**Then** não usa os valores fictícios de `buildAIVariables` ("Nome", "Empresa", setor "Tecnologia"); dado ausente vira variável do Instantly (`{{firstName}}`, `{{companyName}}`) ou é omitido
**And** o setor do lead nunca é substituído pelo setor do tenant

**Given** a geração dos follow-ups
**When** cada e-mail após o primeiro é gerado
**Then** recebe estratégia explícita e diferente por posição (ex.: insight do setor, pergunta, recurso útil, encerramento) e a numeração ignora os delays ("Email 2 de 4", nunca "5 de 4")

**Given** um teste com a campanha real gerada
**When** a saída é verificada
**Then** não contém "Nome", "Empresa", "[Sua", "{{follow_up_strategy}}" nem placeholder não suportado

### Story 24.7: Seção de Provas na Knowledge Base

**Requisitos:** FR23

As a gestor da TDec,
I want cadastrar cases, números, clientes de referência e certificações que podem ser citados,
So that a IA só use provas reais e autorizadas.

**Acceptance Criteria:**

**Given** a Knowledge Base em Configurações
**When** o gestor abre a nova seção "Provas"
**Then** pode adicionar itens com tipo (case, número, cliente de referência, certificação, tempo de mercado), texto, setor (opcional) e "autorizado para uso" (sim/não)

**Given** os itens cadastrados
**When** o contexto da KB é montado para prompts (`knowledge-base-context.ts`)
**Then** só itens autorizados entram, numa lista fechada identificada
**And** a mudança de schema segue o processo de migration controlado (NFR7)

### Story 24.8: Prompts honestos — problema primeiro, provas só da KB

**Requisitos:** FR22

As a gestor da TDec,
I want que os e-mails abram pelo contexto do lead e só citem provas da nossa lista,
So that nenhuma campanha invente case ou número em nosso nome.

**Acceptance Criteria:**

**Given** os prompts padrão (`prompts/defaults.ts`) de corpo, assunto, icebreaker, follow-up e estrutura de campanha
**When** a story é concluída
**Then** não pedem "Prova Social → Escassez", não trazem exemplos com números inventados, não mandam dedicar 70% ao produto; o corpo abre pelo problema/contexto do lead e usa CTA de baixo atrito
**And** há regra explícita: só citar números/cases presentes na lista de provas recebida; sem provas, não citar nenhuma

**Given** os prompts são compartilhados com o editor manual
**When** uma campanha manual é gerada
**Then** também segue as novas regras, sem regressão nos fluxos de geração do editor (testes existentes verdes)

**Given** prompts customizados por tenant no banco
**When** existirem
**Then** a story documenta e migra/atualiza os que tiverem as instruções antigas

### Story 24.9: Revisor automático de copy

**Requisitos:** FR24 · UX-DR7

As a gestor da TDec,
I want que cada e-mail gerado passe por uma revisão automática antes de chegar a mim,
So that clichês, afirmações sem prova e textos fora do setor do lead sejam barrados.

**Acceptance Criteria:**

**Given** um e-mail gerado (agente ou manual) + dados do lead + lista de provas
**When** o revisor roda
**Then** devolve JSON aprovado/reprovado com motivos, checando: afirmação sem prova, clichês, placeholders, relevância setor × oferta, tamanho e CTA

**Given** um e-mail reprovado
**When** o revisor termina
**Then** o sistema reescreve até 2 vezes; persistindo, marca o e-mail como "precisa revisão humana"
**And** o status (aprovado / reescrito / revisão humana) aparece por e-mail na revisão da campanha

**Given** o modelo do revisor
**When** configurado
**Then** é definido numa fonte única (padrão `parser-config.ts`), compatível com modelos novos, e o custo da revisão é registrado (NFR3)
**And** falha do revisor não bloqueia a geração: o e-mail segue marcado "não revisado"

### Story 24.10: Custo real e estimativa honesta

**Requisitos:** FR25

As a gestor da TDec,
I want ver quanto a execução vai custar antes e quanto custou de fato depois,
So that eu consiga justificar o custo por lead para a diretoria.

**Acceptance Criteria:**

**Given** o plano de execução
**When** é exibido
**Then** a estimativa reflete o que o pipeline faz hoje (busca real, enrichment no `create_campaign`, IA por campanha e por icebreaker, revisor, Apify quando ligado), em uma moeda só

**Given** cada chamada paga do agente (Apollo, TheirStack, Instantly, OpenAI, Apify)
**When** ocorre
**Then** é registrada em `api_usage_logs` com tenant e execução

**Given** uma execução concluída ou pausada
**When** o usuário vê o resumo
**Then** `cost_actual` está preenchido e é mostrado ao lado da estimativa
**And** `current_step` e `error_message` da execução passam a ser atualizados

**Marco 2 — Analista de Contas (FR26–FR32, FR39)**

### Story 24.11: Spike do Treg

**Requisitos:** FR32

As a responsável técnico,
I want validar o Treg com dados reais do cliente antes de integrá-lo,
So that a decisão de usá-lo seja baseada em cobertura, qualidade e custo medidos — não em promessa.

**Acceptance Criteria:**

**Given** uma conta Treg de teste e uma amostra de 20–30 leads/empresas brasileiras do perfil da TDec (sem expor dados além do necessário)
**When** o spike roda `people.email.verify`, `people.email.find`, `people.phone.find`, `web.search` e `web.extract`
**Then** um relatório em `implementation-artifacts/` registra cobertura BR, taxa de acerto vs Apollo, latência, custo por chamada e por lead, funcionamento de BYOK, `Idempotency-Key` e teto de custo

**Given** o relatório
**When** o Fabossi avalia
**Then** fica registrada a decisão go/no-go por capacidade (verify, find, web), que define o provedor das stories seguintes
**And** nenhum código de produção é alterado nesta story

### Story 24.12: Verificação de e-mail antes do export

**Requisitos:** FR31, FR32

As a gestor da TDec,
I want que todo e-mail seja verificado antes de ir para o Instantly,
So that bounces não queimem a reputação do domínio — cada lead conta quando são poucos.

**Acceptance Criteria:**

**Given** a decisão do spike (24.11)
**When** o provedor é escolhido
**Then** a verificação usa o Treg (se go, via serviço próprio sobre `base-service`, chave por tenant criptografada — NFR5) ou o `email_status` da Apollo (se no-go), atrás da mesma interface

**Given** a revisão de leads do agente e o export (manual e agente)
**When** um e-mail é inválido, não verificado ou catch-all
**Then** o lead aparece sinalizado e não é exportado sem confirmação explícita do usuário

**Given** o enrichment do `create_campaign`
**When** busca o e-mail do lead
**Then** não revela e-mail pessoal (`revealPersonalEmails` desligado — NFR8)
**And** cada verificação é registrada em `api_usage_logs` (NFR3)

### Story 24.13: Quantos leads eu quero

**Requisitos:** FR26 · UX-DR5

As a usuário do agente,
I want dizer quantos leads quero ("traga 5") e ver isso respeitado no plano e na revisão,
So that eu não precise desmarcar 20 leads à mão nem pagar por volume que não quero.

**Acceptance Criteria:**

**Given** a conversa
**When** o usuário informa uma quantidade de leads
**Then** o parser grava `leadCount` no briefing (sem confundir com nº de e-mails da sequência) e o card de resumo mostra "Até N leads"

**Given** o plano de execução
**When** é exibido
**Then** mostra "até N leads" e a estimativa de custo é calculada para N

**Given** a revisão de leads
**When** abre
**Then** pré-seleciona N (não todos) e tem input numérico livre de quantidade, além das opções atuais

### Story 24.14: Briefing a partir do ICP

**Requisitos:** FR27

As a usuário do agente,
I want que o agente já proponha o briefing com base no ICP cadastrado,
So that eu só ajuste em vez de responder pergunta por pergunta.

**Acceptance Criteria:**

**Given** um tenant com ICP preenchido na KB (cargos, foco geográfico, portes)
**When** o usuário abre uma conversa nova
**Then** o agente abre com uma proposta ("Pelo seu ICP: CISO/Head de TI, SP, 201–1000 funcionários. Ajusto algo?") no card de resumo editável (24.5)

**Given** o ICP
**When** o usuário não informa porte ou localização
**Then** os valores do ICP são usados como padrão no lugar do piso fixo `QUALITY_MIN_COMPANY_SIZES`, e o resumo deixa claro que vieram do ICP

**Given** um tenant sem ICP
**When** abre a conversa
**Then** o comportamento atual é mantido e o agente sugere preencher o ICP

### Story 24.15: Busca mais precisa

**Requisitos:** FR30

As a usuário do agente,
I want que a busca traga pessoas de empresas sediadas na região pedida, sem órgãos públicos e sem quem não pode ser contatado,
So that a lista que chega para revisão já seja aproveitável.

**Acceptance Criteria:**

**Given** um briefing com localização
**When** a busca de leads roda na Apollo
**Then** filtra pela localização da empresa (`organization_locations`), mantendo a da pessoa como opção, e `include_similar_titles` deixa de ser fixo `true`

**Given** os resultados
**When** a revisão é montada
**Then** organizações públicas (prefeitura, câmara, governo, autarquia) são excluídas por padrão, com opção de incluir
**And** leads suprimidos e já contatados (Epic 23) são excluídos ou sinalizados conforme a regra já existente

**Given** a indústria informada
**When** é enviada à Apollo
**Then** usa filtro de indústria real (tags) em vez de texto livre em `q_keywords`, quando houver correspondência

### Story 24.16: Fit Score A/B/C com justificativa

**Requisitos:** FR29 · UX-DR5

As a usuário do agente,
I want que cada lead venha com nota de fit e uma linha explicando o porquê,
So that eu aprove os melhores em segundos e entenda a escolha.

**Acceptance Criteria:**

**Given** um pedido de N leads
**When** a busca roda
**Then** traz um universo de 3–5× N (respeitando o teto de custo — NFR4)

**Given** o universo
**When** o score é calculado (regras determinísticas de porte, setor, senioridade, localização + LLM barato contra ICP e dores da KB)
**Then** cada lead recebe A, B ou C e uma justificativa de 1 linha, salvos no output do step e no lead persistido

**Given** a revisão de leads
**When** abre
**Then** mostra badge A/B/C + justificativa, ordena por score e pré-seleciona os N melhores
**And** falha do LLM degrada para score só por regras, sem travar a execução (NFR9)

### Story 24.17: Modo lista de contas (ABM)

**Requisitos:** FR28

As a usuário do agente,
I want informar as empresas que quero atingir pelo nome ou domínio,
So that o agente encontre os decisores certos dessas contas.

**Acceptance Criteria:**

**Given** a conversa
**When** o usuário cita empresas ("quero falar com o Banco X e a Empresa Y") ou cola uma lista de domínios
**Then** o LLM identifica o modo lista de contas, resolve nomes em domínios (confirmando no card quando ambíguo) e grava as contas no briefing

**Given** contas no briefing
**When** a busca roda
**Then** usa a busca por domínio existente (`q_organization_domains_list`), pulando a busca de empresas, com cargos do briefing ou do ICP

**Given** uma conta suprimida (cliente, negociação)
**When** é informada
**Then** o agente avisa e a remove antes de buscar

### Story 24.18: Contas parecidas com os melhores clientes

**Requisitos:** FR39

As a gestor da TDec,
I want indicar alguns dos nossos melhores clientes e receber contas parecidas que ainda não são clientes,
So that a prospecção comece por empresas com maior chance de comprar.

**Acceptance Criteria:**

**Given** a conversa
**When** o usuário informa 3–5 clientes de referência (nome/domínio ou escolhidos da lista de supressão com motivo "cliente")
**Then** o agente enriquece as empresas (setor, porte, tecnologias, região) e mostra o perfil comum derivado no card, editável

**Given** o perfil aprovado
**When** a busca roda
**Then** encontra empresas semelhantes, exclui clientes/suprimidos/já contatados e aplica o Fit Score (24.16) com justificativa citando a semelhança ("mesmo setor e porte do cliente X")

**Given** menos de 3 referências ou referências sem dados
**When** o perfil não pode ser derivado com confiança
**Then** o agente explica e pede mais referências ou volta ao briefing por ICP

**Marco 3 — Dossiê & reunião (FR33–FR38, FR40)**

### Story 24.19: Dossiê da conta

**Requisitos:** FR33

As a usuário do agente,
I want que o agente pesquise cada conta aprovada e monte um dossiê com fatos e fontes,
So that a abordagem seja baseada no que está acontecendo na empresa, não em suposição.

**Acceptance Criteria:**

**Given** leads aprovados no gate
**When** o step de pesquisa roda (antes do `create_campaign`, determinístico — NFR1)
**Then** para cada conta reúne: resumo do site, notícias dos últimos 90 dias, vagas de segurança/infra (TheirStack jobs), tecnologias conhecidas e até 10 posts da pessoa filtrados por relevância e data (`relevance-classifier`)
**And** cada item é salvo como fato `{fato, fonte_url, data, confiança}`; sem fonte, não entra (nunca inferido)

**Given** as fontes externas
**When** chamadas
**Then** usam o provedor decidido no spike (Treg `web.search`/`web.extract` se go; senão as fontes existentes), registram custo (NFR3) e respeitam teto por execução (NFR4)
**And** falha de uma fonte não falha o step: o dossiê sai parcial e sinalizado (NFR9)

**Given** o dossiê
**When** gravado
**Then** fica ligado à empresa (domínio) e ao lead, reaproveitável por outras execuções por um período configurável (ex.: 30 dias), com migration controlada (NFR7)

### Story 24.20: Motivo para abordar agora

**Requisitos:** FR34

As a usuário do agente,
I want que cada lead tenha um gatilho claro de "por que agora",
So that o primeiro e-mail tenha um motivo real e oportuno.

**Acceptance Criteria:**

**Given** o dossiê de uma conta
**When** o gatilho é escolhido (LLM sobre os fatos + hipótese de dor por persona a partir da KB)
**Then** o lead recebe gatilho, fato de origem com fonte, hipótese de dor (como pergunta) e nível de confiança

**Given** nenhum fato com confiança média/alta
**When** o gatilho é avaliado
**Then** o lead é marcado "sem gatilho" e segue a copy padrão (Marco 1), visível na revisão

### Story 24.21: Copy 1-para-1 por lead

**Requisitos:** FR35

As a lead que recebe o e-mail,
I want receber uma mensagem escrita para mim e para a minha empresa,
So that eu perceba relevância real e responda.

**Acceptance Criteria:**

**Given** um lead com gatilho
**When** o `create_campaign` gera a sequência
**Then** o e-mail 1 (≤ 90 palavras) segue observação → problema → 1 linha de credibilidade só da lista de provas → CTA de interesse, e os follow-ups seguem os ângulos planejados (24.6), todos escritos para esse lead
**And** passam pelo revisor (24.9), que agora também checa cada afirmação contra os fatos do dossiê

**Given** a campanha exportada
**When** chega ao Instantly
**Then** o texto de cada lead vai em variáveis personalizadas por lead, e leads "sem gatilho" usam o template padrão
**And** a revisão da campanha permite ver e editar o e-mail de cada lead antes de exportar

### Story 24.22: Dossiê visível na revisão e na oportunidade

**Requisitos:** FR36 · UX-DR6

As a usuário do agente e vendedor,
I want ver o dossiê e o gatilho ao revisar leads e ao abrir uma oportunidade,
So that eu entenda o contexto da conta sem pesquisar de novo.

**Acceptance Criteria:**

**Given** a revisão de leads ou de campanha do agente
**When** o usuário abre um lead
**Then** vê painel com fatos (fonte, data), gatilho e hipótese de dor

**Given** uma oportunidade na Central (Epic 21) de lead com dossiê
**When** o card é aberto
**Then** mostra o mesmo painel; leads sem dossiê mostram "sem pesquisa" com ação de gerar

### Story 24.23: Preparação de reunião

**Requisitos:** FR40

As a vendedor da TDec,
I want receber um briefing de uma página quando um lead demonstra interesse,
So that eu chegue à conversa preparado.

**Acceptance Criteria:**

**Given** uma oportunidade marcada como interessada ou com reunião marcada
**When** o usuário clica "Preparar reunião" (ou automaticamente ao marcar reunião)
**Then** é gerado um briefing com: resumo da conta (dossiê, gerando se não houver), histórico de engajamento e a resposta do lead, 3–5 pontos de conversa ligados às dores e provas da KB, objeções prováveis com resposta sugerida

**Given** o briefing gerado
**When** exibido
**Then** fica salvo no card da oportunidade, pode ser regenerado e copiado
**And** não inventa fatos: tudo que não vier de dossiê, resposta ou KB é marcado como sugestão

### Story 24.24: Conversa depois da execução

**Requisitos:** FR37

As a usuário do agente,
I want conversar com o agente sobre o resultado depois que a execução rodou,
So that eu tire dúvidas e peça ajustes sem recomeçar.

**Acceptance Criteria:**

**Given** uma execução com steps concluídos
**When** o usuário pergunta "por que esse lead?", "o que você achou da empresa X?" ou pede "reescreve o e-mail 3 do Fulano"
**Then** o LLM responde lendo o output dos steps (score, justificativa, dossiê, e-mails) e, para reescritas, gera uma nova versão que passa pelo revisor e só substitui após o usuário confirmar

**Given** um pedido que exige gasto ("traz mais 2 parecidos com X")
**When** interpretado
**Then** o agente mostra a ação e o custo estimado num card e só executa via pipeline determinístico após clique (NFR1)

### Story 24.25: Memória entre execuções

**Requisitos:** FR38

As a usuário do agente,
I want que o agente lembre o que já foi feito em execuções e campanhas anteriores,
So that eu não repita leads e aproveite o que funcionou.

**Acceptance Criteria:**

**Given** um novo briefing
**When** o agente monta a proposta
**Then** cita execuções anteriores semelhantes e seus resultados (respostas/oportunidades vindas do loop do Epic 21), ex.: "seu último briefing CISO-SP teve 2 respostas"

**Given** a revisão de leads
**When** um lead ou conta já foi trabalhado antes
**Then** aparece com o histórico resumido (campanha, data, resultado), complementando o "já contatado" do Epic 23

## Epic 25: Radar de Oportunidades

A plataforma passa a trazer oportunidades sozinha: painel in-app com gatilhos periódicos sobre contas do ICP (vagas de segurança/infra, mudança de cargo, ex-clientes em nova empresa, notícias), cada um abrindo uma execução do agente em 1 clique. Depende do Epic 23 (base de clientes) e do Epic 24 Marco 2 (serviço Treg). Execução agendada via pg_cron; reavaliar orquestrador durável aqui.

### Story 25.1: Contatos conhecidos

**Requisitos:** FR41

As a gestor da TDec,
I want cadastrar as pessoas com quem já temos relacionamento nos clientes atuais e antigos,
So that o sistema possa acompanhá-las quando mudarem de empresa.

**Acceptance Criteria:**

**Given** a migration da tabela de contatos conhecidos (tenant, nome, cargo, empresa/domínio atual, LinkedIn, tipo de relação: cliente atual, ex-cliente, parceiro; RLS por tenant)
**When** o gestor acessa Radar → Contatos conhecidos
**Then** pode adicionar, editar, remover e importar CSV, e adicionar como contato conhecido, com 1 clique, o lead de uma oportunidade com reunião marcada (`meeting_booked`)

**Given** um contato sem URL do LinkedIn
**When** cadastrado
**Then** o sistema tenta localizá-la (provedor do spike) e pede confirmação antes de salvar

### Story 25.2: Ex-clientes que mudaram de empresa

**Requisitos:** FR41

As a vendedor da TDec,
I want ser avisado quando um contato conhecido assume posição numa nova empresa,
So that eu aborde primeiro a conta onde já existe confiança.

**Acceptance Criteria:**

**Given** os contatos conhecidos com LinkedIn
**When** o job periódico (pg_cron, frequência configurável, teto de custo mensal — NFR4) verifica empresa e cargo atuais
**Then** uma mudança de empresa gera um sinal "contato conhecido em nova conta" (pessoa, empresa anterior, nova empresa, cargo, data detectada) numa tabela de sinais de conta (migration controlada)

**Given** a nova empresa já é cliente ou está suprimida
**When** o sinal é avaliado
**Then** ele é registrado como informativo, não como oportunidade de prospecção

**Given** falha do provedor
**When** o job roda
**Then** o contato é reprocessado no próximo ciclo e a falha aparece na saúde dos jobs (23.3)

### Story 25.3: Gatilhos das contas do ICP

**Requisitos:** FR42

As a gestor da TDec,
I want que o sistema vigie periodicamente sinais de compra nas contas do nosso perfil,
So that a gente aborde no momento certo.

**Acceptance Criteria:**

**Given** a configuração do radar (tipos de gatilho ligados, setores/regiões do ICP, lista de contas-alvo opcional, frequência, teto de custo)
**When** o job periódico roda
**Then** coleta e grava sinais: vagas de segurança/infra (TheirStack jobs), notícias relevantes (busca web via provedor do spike) e mudança de cargo de decisores conhecidos, cada um com fonte, data e conta

**Given** sinais repetidos da mesma conta e tipo
**When** gravados
**Then** são deduplicados; contas suprimidas, clientes e já contatadas recentemente são filtradas
**And** cada sinal recebe relevância (regras + LLM barato contra ICP e dores) e custo registrado (NFR3)

### Story 25.4: Painel do Radar

**Requisitos:** FR42

As a gestor ou SDR da TDec,
I want ver numa tela os sinais da semana, priorizados,
So that eu saiba onde agir sem procurar.

**Acceptance Criteria:**

**Given** sinais gravados (25.2, 25.3)
**When** o usuário abre Radar
**Then** vê os sinais agrupados por conta, ordenados por relevância e recência, com filtros por tipo, período e status (novo, em andamento, descartado)

**Given** um sinal
**When** o usuário descarta ou marca como em andamento
**Then** o status é salvo e o sinal sai da lista de novos

**Given** novos sinais de alta relevância
**When** surgem
**Then** o item Radar na sidebar mostra contador e é gerada notificação in-app (infra do Epic 21), sem WhatsApp

### Story 25.5: Do sinal ao agente em 1 clique

**Requisitos:** FR42

As a gestor ou SDR da TDec,
I want abrir uma prospecção a partir de um sinal com um clique,
So that o tempo entre perceber e agir seja mínimo.

**Acceptance Criteria:**

**Given** um sinal no painel
**When** o usuário clica "Prospectar esta conta"
**Then** abre uma conversa nova do agente no modo lista de contas (24.17) com a conta preenchida, cargos sugeridos pelo ICP e o sinal anexado como fato no dossiê (24.19), já usado como gatilho "por que agora" (24.20)

**Given** um sinal de ex-cliente em nova empresa
**When** prospectado
**Then** o contato conhecido entra como lead preferencial e o briefing indica a relação prévia para a copy

**Given** a execução criada
**When** concluída
**Then** o sinal passa a "em andamento" com link para a execução e a campanha
