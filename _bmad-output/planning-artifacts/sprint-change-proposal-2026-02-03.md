# Sprint Change Proposal

**Data:** 2026-02-03
**Autor:** Bob (SM Agent)
**Solicitante:** Fabossi
**Status:** APPROVED

---

## 1. Issue Summary

### Problem Statement

Durante a finalização da Story 6.8 (Text Regeneration), identificou-se que a geração de emails em campanhas multi-step não possui consciência de contexto sequencial. Cada email é gerado de forma independente, resultando em:

1. **Repetição de informações de produto** - Cada email fala do produto como se fosse o primeiro contato
2. **Falta de referência ao contato anterior** - Não há menção a emails enviados previamente
3. **Follow-ups desconectados** - Parecem "primeiro contato" novamente

### Discovery Context

- **Story Trigger:** 6.8 - Text Regeneration
- **Epic:** 6 - AI Content Generation
- **Descoberto por:** Fabossi (Product Owner)
- **Tipo:** New requirement emerged from real usage experience

### Specification Detail

**Follow-up em cadeia:** Cada email de follow-up deve ler o contexto do email **imediatamente anterior** na sequência:
- Email 2 (follow-up) → lê Email 1
- Email 3 (follow-up) → lê Email 2
- Email 4 (follow-up) → lê Email 3
- E assim por diante

---

## 2. Impact Analysis

### Epic Impact

| Epic | Status | Impacto |
|------|--------|---------|
| Epic 1-5 | Done | Nenhum |
| **Epic 6** | In Progress | **Reorganização necessária** |
| Epic 7 | Backlog | Nenhum |

### Story Impact (Epic 6)

| Story Atual | Nova Numeração | Ação |
|-------------|----------------|------|
| 6.9 Tone of Voice Application | 6.9 | Mantém (independente) |
| 6.10 Use of Successful Examples | 6.10 | Mantém (independente) |
| - | **6.11** | **NOVA: Follow-Up Email Mode** |
| 6.11 AI Campaign Structure Generation | 6.12 | Renumera |
| 6.12 Smart Campaign Templates | 6.13 | Renumera |

### Artifact Conflicts

| Artefato | Conflito | Ação Necessária |
|----------|----------|-----------------|
| epics.md | Sim | Adicionar Story 6.11, renumerar 6.11→6.12, 6.12→6.13 |
| sprint-status.yaml | Sim | Adicionar entry 6.11, renumerar entries |
| architecture.md | Sim | Adicionar prompt `follow_up_email_generation` em ADR-001 |
| PRD | Parcial | Considerar adicionar FR para follow-ups contextualizados |
| UX Design | Parcial | Atualizar EmailBlock com toggle de modo |

### Technical Impact

| Componente | Mudança |
|------------|---------|
| `email_blocks` table | Novo campo: `email_mode: 'initial' \| 'follow-up'` |
| `ai_prompts` table | Novo prompt: `follow_up_email_generation` |
| `useAIGenerate` hook | Aceitar `previousEmailContext` como variável |
| `EmailBlock` component | Toggle/dropdown para selecionar modo |
| `useBuilderStore` | Método para acessar email anterior na sequência |

---

## 3. Recommended Approach

### Selected Path: Direct Adjustment (Option 1)

**Descrição:** Criar nova Story 6.11 (Follow-Up Email Mode) e renumerar stories subsequentes.

### Rationale

1. **Timing Ideal** - Contexto de AI generation está fresco na memória
2. **Incremental** - Não quebra código existente, é extensão
3. **Preventivo** - Evita retrabalho em 6.12 (AI Campaign Structure) e 6.13 (Smart Templates)
4. **Baixo Risco** - Arquitetura atual suporta (position existe, store acessível)
5. **Alto Valor** - Melhora significativa na qualidade de campanhas

### Effort & Risk Assessment

| Aspecto | Avaliação |
|---------|-----------|
| Esforço | **Médio** - Similar às stories 6.6-6.8 |
| Risco | **Baixo** - Extensão de funcionalidade existente |
| Timeline | +1 story ao Epic 6 |

### Alternatives Considered

| Opção | Avaliação | Motivo Rejeição |
|-------|-----------|-----------------|
| Rollback | Não Viável | Não há stories para reverter |
| MVP Review | Não Necessário | MVP não está em risco |
| Deixar para depois (6.13) | Rejeitado | Causaria retrabalho em 6.12 e 6.13 |

---

## 4. Detailed Change Proposals

### Proposal 4.1: New Story 6.11 - Follow-Up Email Mode

```markdown
### Story 6.11: Follow-Up Email Mode

As a user,
I want to create follow-up emails that reference the previous email in the sequence,
So that my campaign feels like a natural conversation, not repeated first contacts.

**Context:** Esta story adiciona modo de follow-up aos emails de campanha. A partir do 2o email, o usuário pode escolher entre "Email Inicial" (comportamento atual) ou "Follow-Up" (lê contexto do email anterior). O follow-up em cadeia significa que Email 3 lê Email 2, Email 4 lê Email 3, etc.

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
**And** tooltip explains: "O primeiro email da sequência é sempre inicial"

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
```

---

### Proposal 4.2: Architecture Update - New AI Prompt

**File:** architecture.md (ADR-001 section)

**OLD (Prompt Keys Definidos):**
```markdown
| Key | Uso | Epic |
|-----|-----|------|
| `search_translation` | Tradução de linguagem natural → filtros Apollo | Epic 3 |
| `email_subject_generation` | Geração de assunto de email | Epic 6 |
| `email_body_generation` | Geração de corpo de email | Epic 6 |
| `icebreaker_generation` | Quebra-gelos personalizados | Epic 6 |
| `tone_application` | Aplicação de tom de voz | Epic 6 |
```

**NEW:**
```markdown
| Key | Uso | Epic |
|-----|-----|------|
| `search_translation` | Tradução de linguagem natural → filtros Apollo | Epic 3 |
| `email_subject_generation` | Geração de assunto de email | Epic 6 |
| `email_body_generation` | Geração de corpo de email | Epic 6 |
| `icebreaker_generation` | Quebra-gelos personalizados | Epic 6 |
| `tone_application` | Aplicação de tom de voz | Epic 6 |
| `follow_up_email_generation` | Geração de email de follow-up com contexto do email anterior | Epic 6 |
```

**Rationale:** Follow-up emails precisam de prompt específico que instrui a IA a:
1. Ler o contexto do email anterior
2. Não repetir informações de produto
3. Criar referência natural ao contato anterior
4. Manter continuidade na conversa

---

### Proposal 4.3: Sprint Status Update

**File:** sprint-status.yaml

**Changes:**
1. Add new entry: `6-11-follow-up-email-mode: backlog`
2. Rename: `6-11-ai-campaign-structure-generation` → `6-12-ai-campaign-structure-generation`
3. Rename: `6-12-smart-campaign-templates` → `6-13-smart-campaign-templates`
4. Add comment explaining the change

---

### Proposal 4.4: Epics.md Story Renumbering

**File:** epics.md

**Changes:**
1. Insert new Story 6.11 (Follow-Up Email Mode) after Story 6.10
2. Renumber Story 6.11 (AI Campaign Structure Generation) → 6.12
3. Renumber Story 6.12 (Smart Campaign Templates) → 6.13
4. Update any internal references

---

## 5. Implementation Handoff

### Change Scope Classification

**Scope:** Minor - Can be implemented directly by development team

### Handoff Plan

| Role | Responsibilities |
|------|------------------|
| **SM (current session)** | Update epics.md, sprint-status.yaml, architecture.md |
| **Dev Agent** | Implement Story 6.11, then continue with 6.12 and 6.13 |

### Success Criteria

1. [ ] epics.md contains complete Story 6.11 with all acceptance criteria
2. [ ] sprint-status.yaml reflects new story and renumbering
3. [ ] architecture.md includes `follow_up_email_generation` prompt
4. [ ] Story 6.11 implemented and code-reviewed
5. [ ] Stories 6.12 and 6.13 updated to leverage follow-up capability

### Timeline Impact

- **Added:** 1 new story (6.11)
- **Changed:** 2 stories renumbered (6.11→6.12, 6.12→6.13)
- **Estimated Impact:** Minor extension to Epic 6 timeline

---

## 6. Approval

**Approved by:** Fabossi
**Approval Date:** 2026-02-03

- [x] **APPROVED** - Proceed with implementation
- [ ] **REVISE** - Request changes to proposal
- [ ] **REJECT** - Do not proceed

### Artifacts Updated

- [x] sprint-status.yaml - Added 6-11-follow-up-email-mode, renumbered 6.11->6.12, 6.12->6.13
- [x] epics.md - Added complete Story 6.11, renumbered subsequent stories
- [x] architecture.md - Added `follow_up_email_generation` prompt to ADR-001

---

*Generated by SM Agent (Bob) via Correct Course Workflow*
*Date: 2026-02-03*
*Approved: 2026-02-03*
