# Sprint Change Proposal — WhatsApp Integration via Z-API

**Data:** 2026-02-10
**Autor:** Bob (SM)
**Aprovado por:** Fabossi
**Status:** Aprovado

---

## 1. Resumo do Problema

### Problem Statement

O TDEC Prospect identifica leads de alto interesse via Janela de Oportunidade (Epic 10), mas o fluxo termina na identificação. O usuário não pode agir sobre o lead dentro da plataforma. O próximo passo natural — enviar WhatsApp personalizado — exige sair do sistema, quebrando a proposta de "tudo em uma ferramenta".

### Contexto

- Epic 10 concluído com sucesso (7 stories, 243 testes, 0 blockers)
- Story 10.8 (Preparação Arquitetural WhatsApp) deferida como YAGNI
- Fabossi tem credenciais Z-API prontas e documentação disponível
- Fluxo de negócio: campanha criada → lead abriu email → não respondeu → usuário quer mandar WhatsApp

### Categoria da Mudança

Nova funcionalidade emergiu como evolução natural do produto — não é bug, pivot ou limitação técnica.

---

## 2. Análise de Impacto

### Epic Impact

| Epic | Status | Impacto |
|------|--------|---------|
| Epic 10 (Campaign Tracking) | Done | Não reaberto. Serve como fundação (OpportunityPanel, OpportunityEngine) |
| **Epic 11 (novo)** | Backlog | WhatsApp Integration via Z-API |
| Epics 1-9 | Done | Sem impacto |

### Artifact Impact

| Artefato | Mudança Necessária | Severidade |
|----------|-------------------|------------|
| PRD | Novos FRs (FR57-FR63~), atualizar FR56, atualizar Growth Features | Moderado |
| Architecture | ADR-006 (Z-API), novo ZApiService, nova tabela whatsapp_messages | Moderado |
| UX Spec | Novos componentes: WhatsApp Composer, envio em massa, tracking | Moderado |
| Sprint Status | Novo epic-11 + 7 stories | Baixo |
| Settings | Card Z-API multi-field no painel de integrações | Baixo |

### Technical Impact

- **Nova API externa:** Z-API (send text endpoint)
- **Credenciais diferenciadas:** 3 valores (Instance ID, Instance Token, Security Token) — diferente das demais integrações que usam 1 API key
- **Infraestrutura existente reutilizada:**
  - `ExternalService` base class → `ZApiService`
  - SignalHire phone lookup → busca de telefone no fluxo
  - AI generation (streaming) → composição de mensagem por IA
  - `productId` na Campaign → contexto do produto para geração de texto
  - `phone` field no Lead model → já suportado
  - OpportunityPanel → ponto de integração principal

---

## 3. Abordagem Recomendada

### Caminho Selecionado: Ajuste Direto — Novo Epic 11

### Justificativa

- MVP já entregue (10 epics). Feature incremental sem risco ao core
- Padrões consolidados: `ExternalService`, `TanStack Query`, `shadcn/ui`, `Vitest`
- Z-API é API simples (endpoint send text), risco técnico baixo
- Infraestrutura pronta: phone no Lead, SignalHire integrado, AI funcional, productId na Campaign
- OpportunityPanel já tem placeholder "(WhatsApp em breve)"
- Esforço: Médio | Risco: Baixo

### Alternativas Descartadas

| Alternativa | Razão |
|-------------|-------|
| Rollback | Nada a reverter — código existente é fundação |
| MVP Review | MVP entregue, sem conflito de escopo |

---

## 4. Propostas de Mudança Detalhadas

### Epic 11: WhatsApp Integration via Z-API

**Overview:**
Envio de mensagens WhatsApp personalizadas para leads quentes identificados pela Janela de Oportunidade. Integração com Z-API, suporte a envio individual e em massa com intervalos humanizados, geração de mensagem por IA ou manual.

**Dependências:**
- Epic 10 (done): OpportunityPanel, OpportunityEngine, LeadTrackingTable
- Epic 4 (done): SignalHire integration (busca de telefone)
- Epic 6 (done): AI infrastructure (geração de texto contextualizada)
- Epic 7 (done): Campaign com productId (contexto de produto)

### Stories de Alto Nível

| # | Story | Dependência | Escopo |
|---|-------|------------|--------|
| 11.1 | Z-API Integration Service + Config | — | `ZApiService` extends `ExternalService`, IntegrationCard multi-field (3 credenciais: Instance ID, Instance Token, Security Token), API key storage criptografado, teste de conexão |
| 11.2 | Schema WhatsApp Messages + Tipos | 11.1 | Tabela `whatsapp_messages` (tracking de envios por lead/campanha), tipos TypeScript, RLS por tenant |
| 11.3 | Composer de Mensagem WhatsApp | 11.2 | UI: editor de texto + geração IA baseada no produto da campanha (reutiliza AI generation existente) |
| 11.4 | Envio Individual de WhatsApp | 11.3 | Envio via Z-API, tracking de status (enviado/falhou), integração no OpportunityPanel, substituir badge "(WhatsApp em breve)" por ação real |
| 11.5 | Busca de Telefone no Fluxo de Leads Quentes | 11.2 | Integrar SignalHire lookup no OpportunityPanel + input manual de telefone |
| 11.6 | Envio em Massa com Intervalos | 11.4, 11.5 | Seleção de múltiplos leads, configuração de intervalo entre envios (humanizado), fila de envio progressiva |
| 11.7 | Tracking e Histórico de Mensagens | 11.4 | Marcar leads contactados por campanha, histórico de mensagens enviadas, indicadores visuais na tabela |

### Detalhes Técnicos Relevantes

**Z-API — 3 Credenciais:**
- `instanceId`: Identificador da instância WhatsApp
- `instanceToken`: Token de autenticação da instância
- `securityToken`: Token de segurança da conta
- Todos necessários em cada request à Z-API
- Storage: criptografados na tabela `api_configs` (padrão existente, adaptado para multi-field)

**IntegrationCard Multi-Field:**
- Cards atuais têm 1 input de API key
- Z-API precisa de 3 inputs separados
- Variação do componente existente ou nova prop `fields` para suportar múltiplos inputs

**Fluxo de Envio Individual:**
```
OpportunityPanel → Lead quente → Verificar telefone
  ├── Tem telefone → Abrir Composer
  │   ├── Gerar mensagem IA (baseada no produto da campanha)
  │   └── Ou digitar mensagem manual
  │   └── Enviar via Z-API → Marcar como enviado
  └── Sem telefone → Buscar via SignalHire OU Input manual
      └── Telefone obtido → Abrir Composer
```

**Fluxo de Envio em Massa:**
```
Seleção de leads → Configurar intervalo (ex: 30-90s entre envios)
  → Compor mensagem (IA ou manual, mesma para todos)
  → Iniciar fila de envio progressiva
  → Exibir progresso (X de Y enviados)
  → Marcar cada lead como contactado ao enviar
```

---

## 5. Handoff de Implementação

### Classificação de Escopo: Moderado

Requer:
- Novos FRs no PRD
- Novo ADR na Architecture
- Novo epic file com stories detalhadas
- Sprint planning para sequenciamento

### Responsabilidades

| Papel | Ação |
|-------|------|
| **SM (Bob)** | Sprint Change Proposal (este documento) ✅, sprint planning |
| **PM/Analyst** | Atualizar PRD com novos FRs |
| **Architect** | Criar ADR-006, atualizar Architecture |
| **SM** | Criar `epic-11-whatsapp-integration.md` com stories detalhadas |
| **Dev** | Implementar stories via dev-story workflow |

### Próximos Passos

1. ✅ Sprint Change Proposal salvo e aprovado
2. ✅ Sprint Status atualizado com Epic 11
3. ⬜ Atualizar PRD com novos FRs (FR57+)
4. ⬜ Atualizar Architecture com ADR-006
5. ⬜ Criar `epic-11-whatsapp-integration.md` com stories detalhadas
6. ⬜ Iniciar sprint planning → create-story → dev-story

### Critérios de Sucesso

- Usuário consegue enviar WhatsApp individual para lead quente direto do OpportunityPanel
- Usuário consegue enviar em massa com intervalos humanizados
- Mensagem pode ser gerada por IA (contextualizada ao produto) ou digitada manualmente
- Leads contactados ficam marcados por campanha
- Z-API configurável via Settings com 3 credenciais
- Busca de telefone integrada ao fluxo (SignalHire ou input manual)

---

*Sprint Change Proposal criado em: 2026-02-10*
*Aprovado por: Fabossi*
*Workflow: Correct Course (SM Agent)*
