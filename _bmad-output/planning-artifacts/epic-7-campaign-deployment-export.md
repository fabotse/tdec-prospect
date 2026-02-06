# Epic 7: Campaign Deployment & Export

## Overview

Export de campanhas personalizadas para plataformas de cold email (Instantly, Snov.io) e via CSV/clipboard. Inclui sistema completo de variáveis de personalização (`{{first_name}}`, `{{company_name}}`, `{{title}}`, `{{ice_breaker}}`) com motor de substituição e mapeamento para as tags de cada plataforma.

## Contexto

### Situação Atual
- **`{{ice_breaker}}` é a única variável**: A Story 9.4 implementou a variável `{{ice_breaker}}` na geração de campanha AI, mas não existem outras variáveis de personalização
- **AI hardcoda dados do lead**: Quando o email é gerado com lead selecionado, o nome, empresa, etc. são escritos diretamente no texto — não como variáveis
- **Dois fluxos diferentes**: O Wizard gera com `{{ice_breaker}}`; o EmailBlock individual gera com texto resolvido
- **Icebreakers armazenados por lead**: Campo `leads.icebreaker` existe e suporta geração em lote (até 50/request)
- **Instantly Service mínimo**: Apenas `testConnection()` implementado, sem gestão de campanhas
- **Snov.io inexistente**: Nenhum service implementado
- **CSV desabilitado**: Botão "Exportar CSV (em breve)" existe apenas como placeholder
- **Import de resultados existe**: A importação de resultados de campanha (respostas, bounces) já funciona — é o fluxo inverso

### Objetivo
- Sistema completo de variáveis de personalização nos emails gerados pela AI
- Motor de substituição para preview (resolve variáveis com dados do lead) e export (mapeia para tags da plataforma)
- Export via API para Instantly e Snov.io (campanha + leads + sequência)
- Export via CSV (com variáveis para import em plataformas, ou resolvido por lead)
- Copy manual para clipboard (import em qualquer ferramenta)
- Validação pré-export e error handling robusto com fallback manual

### Infraestrutura Existente (referência)
- **InstantlyService** com `testConnection()` — `src/lib/services/instantly.ts`
- **Prompt Manager** com fallback 3 níveis — `src/lib/ai/prompt-manager.ts`
- **Template engine** com `{{variável}}` e `{{#if}}...{{else}}...{{/if}}` — `src/lib/ai/prompt-manager.ts`
- **Variável `{{ice_breaker}}`** já funcional na geração de campanha — Story 9.4
- **Preview com placeholder** visual para `{{ice_breaker}}` — `src/components/builder/PreviewEmailStep.tsx`
- **Icebreaker enrichment** em lote — `src/hooks/use-icebreaker-enrichment.ts`
- **Campaign-leads junction** — tabela `campaign_leads` associa leads a campanhas
- **Builder store** com blocos email + delay — `src/stores/use-builder-store.ts`
- **CSV parser** para import de resultados — `src/lib/csv-parser.ts` (adaptável para export)

---

## Stories

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

**Notas Técnicas:**
- Instantly API v2 docs: verificar endpoints exatos para campaign creation e lead management
- Custom variables no Instantly são passadas como campos adicionais no lead object
- Rate limiting: respeitar limites da API do Instantly

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

**Notas Técnicas:**
- Snov.io API docs: verificar endpoints para drip campaign e recipient management
- Autenticação: Snov.io usa OAuth2 com client_id + client_secret para obter access_token
- Campos customizados no Snov.io podem ter formato diferente do Instantly

---

### Story 7.3.1: Persistência de Campanhas Exportadas no Banco

**Como** sistema,
**Quero** persistir o vínculo entre campanhas locais e campanhas remotas (Instantly/Snov.io),
**Para** que seja possível rastrear deploys, evitar duplicatas, e habilitar re-sincronização futura.

**Critérios de Aceite:**

1. **Given** a tabela `campaigns` existe no banco
   **When** a migration é executada
   **Then** adiciona os campos:
   - `external_campaign_id` (text, nullable) — ID da campanha na plataforma remota
   - `export_platform` (text, nullable) — plataforma de export ('instantly' | 'snovio' | null)
   - `exported_at` (timestamptz, nullable) — data/hora do último export
   - `export_status` (text, nullable) — status do export ('pending' | 'success' | 'partial_failure' | 'failed')
   **And** campos têm índice em `external_campaign_id` para lookup rápido
   **And** RLS policies existentes continuam funcionando

2. **Given** uma campanha é exportada com sucesso para uma plataforma
   **When** o fluxo de export finaliza
   **Then** os campos `external_campaign_id`, `export_platform`, `exported_at` e `export_status` são atualizados
   **And** a campanha pode ser consultada por `external_campaign_id`

3. **Given** uma campanha já foi exportada anteriormente
   **When** o usuário tenta exportar novamente
   **Then** o sistema detecta o export anterior via `external_campaign_id`
   **And** oferece opção: "Atualizar campanha existente" ou "Criar nova campanha"
   **And** previne duplicatas acidentais (idempotência)

4. **Given** os tipos TypeScript são atualizados
   **When** o tipo `Campaign` é usado no código
   **Then** inclui os novos campos opcionais
   **And** existe um tipo `ExportRecord` para facilitar queries de export

**Arquivos Afetados:**
- `supabase/migrations/000XX-add-campaign-export-tracking.sql` — nova migration
- `src/types/campaign.ts` — atualizar tipo Campaign com campos de export
- `src/types/export.ts` — adicionar tipo ExportRecord
- `src/lib/services/campaign-export-repository.ts` — novo: CRUD para campos de export

**Notas Técnicas:**
- Referência: Lacuna Crítica #1 do documento de pesquisa (instantly-integration-ideas-2026-02-06.md)
- Campos nullable para backward compatibility — campanhas existentes não são afetadas
- `export_status` permite rastrear exports parciais (leads adicionados mas campanha não ativada)
- Pré-requisito para Stories 7.5 e 7.6 gravarem o vínculo após export

**Dependências:** Nenhuma (pode ser feita imediatamente após 7.3)

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

4. **Given** seleciono Instantly como destino de export
   **When** a opção é expandida
   **Then** vejo a lista de sending accounts configuradas no Instantly
   **And** posso selecionar uma ou mais contas de envio para a campanha
   **And** se nenhuma conta está configurada, vejo aviso: "Nenhuma conta de envio encontrada. Configure no Instantly primeiro."
   **And** a listagem usa o endpoint `GET /api/v2/accounts` do Instantly

5. **Given** seleciono uma plataforma com campanha já exportada anteriormente
   **When** a opção é expandida
   **Then** vejo indicador: "Campanha já exportada em {data}" com opção de re-exportar ou atualizar

**Arquivos Afetados:**
- `src/components/builder/ExportDialog.tsx` — novo: dialog de exportação
- `src/components/builder/ExportPreview.tsx` — novo: preview de mapeamento
- `src/components/builder/SendingAccountSelector.tsx` — novo: seletor de contas de envio
- `src/hooks/use-campaign-export.ts` — novo: hook de exportação
- `src/hooks/use-sending-accounts.ts` — novo: hook para listar contas de envio
- `src/lib/services/instantly.ts` — expandir: método `listAccounts()`
- `src/app/api/instantly/accounts/route.ts` — novo: API route para listar contas

**Notas Técnicas:**
- Dialog segue padrão shadcn/ui Dialog com Radix UI
- Status de conexão reutiliza `testConnection()` existente
- Preview de variáveis usa o registry da Story 7.1
- Sending accounts: Instantly API `GET /api/v2/accounts?limit=100` retorna contas configuradas
- Referência: Lacuna Crítica #2 do documento de pesquisa

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

3. **Given** a exportação falha em qualquer etapa
   **When** o erro é detectado
   **Then** o Deployment Service trata a falha com compensação:
   - Se criação da campanha falha → nada a reverter, exibe erro
   - Se adição de leads falha → campanha órfã é logada, usuário é informado
   - Se ativação falha → campanha existe com leads mas inativa, opção "Ativar manualmente"
   **And** vejo mensagem de erro em português com a etapa específica que falhou
   **And** vejo opções: "Tentar Novamente" (retenta da etapa que falhou) ou "Exportar CSV"
   **And** o fallback manual (CSV/clipboard) está sempre disponível

4. **Given** o fluxo de export é iniciado
   **When** o Deployment Service executa
   **Then** valida antes de começar:
   - Pelo menos 1 lead com email válido
   - Campanha tem pelo menos 1 email completo (subject + body)
   - Sending account selecionada (AC da Story 7.4)
   **And** se validação falha, exibe resumo de problemas e não inicia o export
   **And** problemas não-bloqueantes (leads sem ice_breaker) exibem aviso mas permitem continuar

5. **Given** o export completa com sucesso
   **When** o Deployment Service finaliza
   **Then** persiste o vínculo no banco via campos da Story 7.3.1:
   - `external_campaign_id` = ID da campanha criada no Instantly
   - `export_platform` = 'instantly'
   - `exported_at` = timestamp atual
   - `export_status` = 'success' (ou 'partial_failure' se nem todos os leads foram adicionados)

**Dependências:** Story 7.2 (Instantly Service) + Story 7.3.1 (Persistência) + Story 7.4 (Export Dialog UI)

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

3. **Given** a exportação falha em qualquer etapa
   **When** o erro é detectado
   **Then** o Deployment Service trata a falha com compensação:
   - Se criação da list/campanha falha → nada a reverter, exibe erro
   - Se adição de prospects falha → list/campanha órfã é logada, usuário é informado
   **And** vejo mensagem de erro em português com a etapa específica que falhou
   **And** vejo opções: "Tentar Novamente" (retenta da etapa que falhou) ou "Exportar CSV"
   **And** o fallback manual (CSV/clipboard) está sempre disponível

4. **Given** o fluxo de export é iniciado
   **When** o Deployment Service executa
   **Then** valida antes de começar:
   - Pelo menos 1 lead com email válido
   - Campanha tem pelo menos 1 email completo (subject + body)
   **And** se validação falha, exibe resumo de problemas e não inicia o export
   **And** problemas não-bloqueantes (leads sem ice_breaker) exibem aviso mas permitem continuar

5. **Given** o export completa com sucesso
   **When** o Deployment Service finaliza
   **Then** persiste o vínculo no banco via campos da Story 7.3.1:
   - `external_campaign_id` = ID da list/campanha criada no Snov.io
   - `export_platform` = 'snovio'
   - `exported_at` = timestamp atual
   - `export_status` = 'success' (ou 'partial_failure' se nem todos os prospects foram adicionados)

**Dependências:** Story 7.3 (Snov.io Service) + Story 7.3.1 (Persistência) + Story 7.4 (Export Dialog UI)

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

## Estimativa de Esforço

| Story | Complexidade | Arquivos | Prioridade | Dependência |
|-------|-------------|----------|------------|-------------|
| 7.1 Sistema de Variáveis | ⭐⭐⭐ Alta | ~6 | P0 | Epic 9 (base `{{ice_breaker}}`) |
| 7.2 Instantly Service | ⭐⭐ Média | ~4 | P1 | 7.1 |
| 7.3 Snov.io Service | ⭐⭐ Média | ~4 | P1 | 7.1 |
| **7.3.1 Persistência de Export** | **⭐ Baixa** | **~4** | **P0** | **Nenhuma** |
| 7.4 Export Dialog UI + Sending Accounts | ⭐⭐⭐ Alta | ~7 | P1 | 7.1 + 7.3.1 |
| 7.5 Export Instantly (orquestrado + validação) | ⭐⭐⭐ Alta | ~4 | P1 | 7.2 + 7.3.1 + 7.4 |
| 7.6 Export Snov.io (orquestrado + validação) | ⭐⭐⭐ Alta | ~4 | P1 | 7.3 + 7.3.1 + 7.4 |
| 7.7 CSV + Clipboard | ⭐⭐ Média | ~4 | P1 | 7.1 + 7.4 |
| 7.8 Validação Avançada + Edge Cases | ⭐⭐ Média | ~3 | P2 | 7.5 + 7.6 + 7.7 |

**Total Epic:** 9 stories (8 originais + 1 nova)

---

## Ordem de Execução Recomendada

```
7.1 (Variáveis) ──┬──→ 7.2 (Instantly Service) ──┐
                   │                                │
                   ├──→ 7.3 (Snov.io Service) ────┤
                   │                                │
                   └──→ 7.3.1 (Persistência) ──────┼──→ 7.4 (Export Dialog + Accounts) ──┐
                                                    │                                     │
                                                    ├────────────────────→ 7.5 (Export Instantly + Orquestração) ──┐
                                                    │                                     │                        │
                                                    ├────────────────────→ 7.6 (Export Snov.io + Orquestração) ───┤
                                                    │                                     │                        │
                                                    └────────────────────→ 7.7 (CSV + Clipboard) ────────────────┼──→ 7.8 (Validação Avançada)
```

- **7.1** é a fundação — DONE
- **7.2, 7.3** são os services — DONE
- **7.3.1** (Persistência) é a PRÓXIMA — pré-requisito para 7.4, 7.5, 7.6
- **7.4** agora inclui sending accounts e depende de 7.3.1
- **7.5, 7.6** agora incluem orquestração + validação básica + persistência do vínculo
- **7.7** (CSV) pode ser feita em paralelo com 7.5/7.6
- **7.8** é a última — validação avançada e edge cases

### Mudanças vs. Plano Original (2026-02-06)
- **NOVA**: Story 7.3.1 adicionada para persistência de export no banco
- **EXPANDIDA**: Story 7.4 agora inclui listing/seleção de sending accounts do Instantly
- **EXPANDIDAS**: Stories 7.5 e 7.6 agora incluem Deployment Service orquestrado com compensação + validação pré-deploy + persistência do vínculo
- **Motivação**: Lacunas críticas identificadas pelo documento de pesquisa (instantly-integration-ideas-2026-02-06.md)

---

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| APIs de plataformas mudam sem aviso | Média | Camada de abstração no service; testes de integração; versão da API fixa |
| Limites de rate limiting das plataformas | Alta | Envio em batches; exponential backoff; queue para grandes volumes |
| Variáveis complexas demais para a AI gerar corretamente | Média | Prompts com exemplos claros; validação pós-geração; fallback para menos variáveis |
| Mapeamento incorreto de variáveis para plataformas | Baixa | Testes automatizados por plataforma; preview antes do export; documentação de formatos |
| Leads sem dados necessários para export | Alta | Validação pré-export (Story 7.8); enriquecimento sugerido; degradação graceful |
| Instantly/Snov.io sem créditos ou conta limitada | Alta | Feedback claro; fallback para CSV sempre disponível |

---

## Decisões Pendentes

| Decisão | Opções | Status |
|---------|--------|--------|
| Formato de variáveis unificado | Manter `{{snake_case}}` para todas | Definir na Story 7.1 |
| Como preservar template vs resolved | Campo separado no EmailBlock vs resolução on-demand | Definir na Story 7.1 |
| Formato CSV para Instantly import | CSV padrão do Instantly vs formato customizado | Pesquisar API docs |
| Autenticação Snov.io | OAuth2 vs API key simples | Pesquisar API docs na Story 7.3 |
| Limite de leads por export | Sem limite vs batch máximo | Definir na Story 7.2/7.3 |

---

## Aprovação

- [ ] Product Owner aprova escopo
- [ ] Decisões de design definidas
- [ ] Dev confirma viabilidade técnica

---

*Documento criado em: 2026-02-06*
*Epic anterior: Epic 9 - AI Content Quality & Personalization*
*Pré-requisitos: Epic 9 concluída (base do sistema de variáveis `{{ice_breaker}}`)*
