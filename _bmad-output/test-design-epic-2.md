# Test Design: Epic 2 - Administration & Configuration

**Date:** 2026-01-30
**Author:** Fabossi
**Status:** Draft

---

## Executive Summary

**Scope:** Full test design for Epic 2 - Administration & Configuration

**Risk Summary:**

- Total risks identified: 4
- High-priority risks (≥6): 2
- Critical categories: SEC (Security)

**Coverage Summary:**

- P0 scenarios: 10 (8-12 hours)
- P1 scenarios: 17 (10-15 hours)
- P2/P3 scenarios: 11 (2-4 hours)
- **Total effort**: ~20-31 hours (~3-4 days)

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | API Keys Encryption Vulnerability - API keys de terceiros podem ser expostas se criptografia falhar | 2 | 3 | **6** | Testes unitários de encryption/decryption, nunca retornar plain text, mascarar na UI | QA + Security | Sprint atual |
| R-002 | SEC | Admin Role Bypass - Usuário não-admin pode acessar funções de gestão de equipe | 2 | 3 | **6** | Testes E2E de role enforcement, middleware coverage, RLS policies | QA + Dev | Sprint atual |

### Medium-Priority Risks (Score 4-5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-003 | OPS | Connection Test Reliability - Testes de conexão podem falhar por instabilidade de APIs externas | 2 | 2 | 4 | Mensagens de erro claras, retry automático, mock para testes | Dev Team |
| R-004 | BUS | Knowledge Base Context Quality - Base mal preenchida resulta em geração de texto pobre | 2 | 2 | 4 | Validação de campos obrigatórios, exemplos de preenchimento | UX + Dev |

### Low-Priority Risks (Score 1-3)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-005 | TECH | Settings Page rendering - UI pode não renderizar corretamente | 1 | 1 | 1 | Monitor |
| R-006 | BUS | ICP Definition - Informações de ICP podem ser incompletas | 1 | 1 | 1 | Monitor |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## Test Coverage Plan

### P0 (Critical) - Run on every commit

**Criteria**: Blocks core journey + High risk (≥6) + No workaround

| Test ID | Requirement | Test Level | Risk Link | Status | Owner | Notes |
| ------- | ----------- | ---------- | --------- | ------ | ----- | ----- |
| 2.2-UNIT-001 | Encryption de API key funciona | Unit | R-001 | ✅ Existente | Dev | encryption.test.ts |
| 2.2-UNIT-002 | Decryption de API key retorna original | Unit | R-001 | ✅ Existente | Dev | encryption.test.ts |
| 2.2-UNIT-003 | API key nunca em plain text | Unit | R-001 | ⏳ Necessário | Dev | Security critical |
| 2.2-API-001 | POST /api/integrations salva criptografado | API | R-001 | ⏳ Necessário | QA | Integration test |
| 2.2-API-002 | GET /api/integrations retorna mascarado | API | R-001 | ⏳ Necessário | QA | Security validation |
| 2.7-UNIT-001 | AdminGuard bloqueia não-admin | Unit | R-002 | ✅ Existente | Dev | AdminGuard.test.tsx |
| 2.7-API-001 | POST /api/team/invite (admin only) | API | R-002 | ⏳ Necessário | QA | Authorization test |
| 2.7-API-002 | DELETE /api/team/:userId funciona | API | R-002 | ⏳ Necessário | QA | Authorization test |
| 2.7-API-003 | Não-admin recebe 403 | API | R-002 | ⏳ Necessário | QA | Security critical |
| 2.7-E2E-004 | Não pode remover único admin | E2E | R-002 | ⏳ Necessário | QA | Edge case |

**Total P0**: 10 tests (~8-12 hours) | Existentes: 3 | Novos: 7

### P1 (High) - Run on PR to main

**Criteria**: Important features + Medium risk (3-4) + Common workflows

| Test ID | Requirement | Test Level | Risk Link | Status | Owner | Notes |
| ------- | ----------- | ---------- | --------- | ------ | ----- | ----- |
| 2.2-E2E-001 | Salvar API key mostra sucesso | E2E | R-001 | ⏳ Necessário | QA | Happy path |
| 2.2-E2E-002 | Campo mostra mascarado | E2E | R-001 | ⏳ Necessário | QA | UX validation |
| 2.3-UNIT-001 | ApolloService.testConnection | Unit | R-003 | ✅ Existente | Dev | apollo.test.ts |
| 2.3-UNIT-002 | SignalHireService.testConnection | Unit | R-003 | ✅ Existente | Dev | signalhire.test.ts |
| 2.3-UNIT-003 | SnovioService.testConnection | Unit | R-003 | ✅ Existente | Dev | snovio.test.ts |
| 2.3-UNIT-004 | InstantlyService.testConnection | Unit | R-003 | ✅ Existente | Dev | instantly.test.ts |
| 2.3-UNIT-005 | Retry automático em timeout | Unit | R-003 | ⏳ Necessário | Dev | base-service pattern |
| 2.3-API-001 | POST /api/integrations/test | API | R-003 | ⏳ Necessário | QA | Connection test API |
| 2.3-E2E-002 | Conexão OK mostra sucesso | E2E | R-003 | ⏳ Necessário | QA | Happy path |
| 2.3-E2E-003 | Erro mostra msg português | E2E | R-003 | ⏳ Necessário | QA | Error handling |
| 2.4-UNIT-002 | useKnowledgeBase hook | Unit | - | ✅ Existente | Dev | hook test |
| 2.4-API-001 | POST /api/knowledge-base | API | R-004 | ⏳ Necessário | QA | Save endpoint |
| 2.5-UNIT-002 | EmailExamplesForm add/remove | Unit | R-004 | ✅ Existente | Dev | form test |
| 2.5-UNIT-003 | useToneOfVoice hook | Unit | - | ✅ Existente | Dev | hook test |
| 2.5-UNIT-004 | useEmailExamples hook | Unit | - | ✅ Existente | Dev | hook test |
| 2.5-API-001 | POST /api/knowledge-base/examples | API | R-004 | ⏳ Necessário | QA | Examples endpoint |
| 2.5-E2E-001 | Tom de voz persiste | E2E | R-004 | ⏳ Necessário | QA | Persistence test |

**Total P1**: 17 tests (~10-15 hours) | Existentes: 10 | Novos: 7

### P2 (Medium) - Run nightly/weekly

**Criteria**: Secondary features + Low risk (1-2) + Edge cases

| Test ID | Requirement | Test Level | Risk Link | Status | Owner | Notes |
| ------- | ----------- | ---------- | --------- | ------ | ----- | ----- |
| 2.1-UNIT-001 | SettingsTabs renderiza | Unit | - | ✅ Existente | Dev | SettingsTabs.test.tsx |
| 2.1-E2E-001 | Navegação mostra tabs | E2E | - | ✅ Existente | QA | navigation.spec.ts |
| 2.4-UNIT-001 | CompanyProfileForm renderiza | Unit | - | ✅ Existente | Dev | CompanyProfileForm.test.tsx |
| 2.4-UNIT-003 | Validação campos obrigatórios | Unit | R-004 | ⏳ Necessário | Dev | Form validation |
| 2.4-E2E-001 | Salvar perfil mostra sucesso | E2E | - | ⏳ Opcional | QA | Happy path |
| 2.5-UNIT-001 | ToneOfVoiceForm opções | Unit | - | ✅ Existente | Dev | ToneOfVoiceForm.test.tsx |
| 2.5-E2E-002 | Add/edit/remove exemplo | E2E | R-004 | ⏳ Necessário | QA | CRUD operations |
| 2.7-UNIT-002 | TeamMemberList renderiza | Unit | - | ⏳ Necessário | Dev | Component test |
| 2.7-E2E-001 | Admin vê lista membros | E2E | R-002 | ⏳ Necessário | QA | Happy path |
| 2.7-E2E-002 | Admin convida usuário | E2E | R-002 | ⏳ Necessário | QA | Invite flow |
| 2.7-E2E-003 | Confirmação antes de remover | E2E | R-002 | ⏳ Necessário | QA | UX validation |

**Total P2**: 11 tests (~2-4 hours) | Existentes: 5 | Novos: 6

### P3 (Low) - Run on-demand

**Criteria**: Nice-to-have + Exploratory + Performance benchmarks

| Test ID | Requirement | Test Level | Status | Owner | Notes |
| ------- | ----------- | ---------- | ------ | ----- | ----- |
| 2.1-UNIT-002 | Tab ativa destacada | Unit | ⏳ Opcional | Dev | Visual detail |
| 2.3-E2E-001 | Loading durante teste | E2E | ⏳ Opcional | QA | UX polish |

**Total P3**: 2 tests (~0.5 hours)

---

## Execution Order

### Smoke Tests (<5 min)

**Purpose**: Fast feedback, catch build-breaking issues

- [x] Auth flow básico (auth.spec.ts)
- [x] Navegação para Settings (navigation.spec.ts)
- [x] AdminGuard bloqueia não-admin

**Total**: 3 cenários

### P0 Tests (<10 min)

**Purpose**: Critical path validation (Security focus)

- [ ] API key encryption/decryption (Unit)
- [ ] API key nunca em plain text (Unit)
- [ ] POST /api/integrations criptografado (API)
- [ ] AdminGuard authorization (Unit)
- [ ] POST /api/team/invite 403 para não-admin (API)
- [ ] DELETE /api/team/:userId authorization (API)

**Total**: 10 cenários

### P1 Tests (<30 min)

**Purpose**: Important feature coverage

- [ ] Connection testing para todas integrações (Unit + API)
- [ ] Knowledge base CRUD (API + E2E)
- [ ] Tone of voice persistence (E2E)
- [ ] Team management happy paths (E2E)

**Total**: 17 cenários

### P2/P3 Tests (<60 min)

**Purpose**: Full regression coverage

- [ ] Settings page rendering (Unit)
- [ ] Form validations (Unit)
- [ ] Full E2E flows (E2E)

**Total**: 13 cenários

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Existente | Novo | Hours/Test | Total Hours | Notes |
| -------- | ----- | --------- | ---- | ---------- | ----------- | ----- |
| P0 | 10 | 3 | 7 | 1.5 | 8-12 | Security critical |
| P1 | 17 | 10 | 7 | 1.0 | 10-15 | Standard coverage |
| P2 | 11 | 5 | 6 | 0.5 | 2-4 | Simple scenarios |
| P3 | 2 | 0 | 2 | 0.25 | 0.5 | Optional |
| **Total** | **40** | **18** | **22** | **-** | **~20-31** | **~3-4 days** |

### Prerequisites

**Test Data:**

- `createTenant` factory (faker-based, auto-cleanup)
- `createUser` factory com roles (admin/user)
- `createApiConfig` factory para integrações

**Tooling:**

- Playwright for E2E tests
- Vitest for Unit/Integration tests
- MSW (Mock Service Worker) para mock de APIs externas

**Environment:**

- Supabase local para testes de integração
- Variáveis de ambiente de teste (.env.test)
- Fixtures de autenticação (admin user, regular user)

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2/P3 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers

### Coverage Targets

- **Critical paths (Security)**: 100%
- **API endpoints**: ≥80%
- **Business logic**: ≥70%
- **Edge cases**: ≥50%

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No high-risk (≥6) items unmitigated
- [ ] Security tests (SEC category) pass 100%
- [ ] R-001 (API Keys Encryption) verified
- [ ] R-002 (Admin Role Bypass) verified

---

## Mitigation Plans

### R-001: API Keys Encryption Vulnerability (Score: 6)

**Mitigation Strategy:**
1. Testes unitários verificam encryption/decryption cycle
2. API response NUNCA retorna plain text
3. UI mostra apenas últimos 4 caracteres (****XXXX)
4. Logs não contêm API keys em plain text
5. Code review obrigatório para changes em encryption.ts

**Owner:** QA Team + Security Review
**Timeline:** Sprint atual (antes de go-live)
**Status:** In Progress
**Verification:**
- `2.2-UNIT-001`, `2.2-UNIT-002`, `2.2-UNIT-003` passing
- `2.2-API-001`, `2.2-API-002` passing
- Security audit sign-off

### R-002: Admin Role Bypass (Score: 6)

**Mitigation Strategy:**
1. AdminGuard component testado isoladamente
2. RLS policies para `team_invitations` e `profiles` tables
3. Middleware verifica role antes de todas server actions
4. E2E tests validam que non-admin não acessa /settings/team
5. API endpoints retornam 403 para non-admin

**Owner:** QA Team + Dev Team
**Timeline:** Sprint atual
**Status:** In Progress
**Verification:**
- `2.7-UNIT-001` passing (AdminGuard)
- `2.7-API-001`, `2.7-API-002`, `2.7-API-003` passing
- E2E flow completo testado

---

## Assumptions and Dependencies

### Assumptions

1. Supabase Auth continua funcionando conforme documentado
2. APIs externas (Apollo, SignalHire, etc.) têm endpoints de teste disponíveis
3. Encryption library (pgcrypto ou similar) está configurada no Supabase

### Dependencies

1. **AdminGuard component** - Já implementado (Story 2.7 prerequisite)
2. **knowledge_base_examples migration** - Já criada (00008)
3. **MSW setup** - Necessário para mock de APIs externas

### Risks to Plan

- **Risk**: APIs externas podem mudar endpoints de teste
  - **Impact**: Testes de conexão falham falsamente
  - **Contingency**: Mock completo para todos cenários de teste

- **Risk**: Supabase local pode diferir de produção
  - **Impact**: Testes passam local, falham em staging
  - **Contingency**: Ambiente de staging para validação final

---

## Follow-on Workflows (Manual)

- Run `/bmad-tea-testarch-atdd` para gerar failing P0 tests (TDD approach)
- Run `/bmad-tea-testarch-automate` para broader coverage após implementação
- Run `/bmad-tea-testarch-trace` para validar traceability matrix

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: _____________ Date: _________
- [ ] Tech Lead: _____________ Date: _________
- [ ] QA Lead: _____________ Date: _________

**Comments:**

---

## Appendix

### Knowledge Base References

- `risk-governance.md` - Risk classification framework
- `probability-impact.md` - Risk scoring methodology
- `test-levels-framework.md` - Test level selection
- `test-priorities-matrix.md` - P0-P3 prioritization

### Related Documents

- PRD: `_bmad-output/planning-artifacts/prd.md`
- Epic: `_bmad-output/planning-artifacts/epics.md` (Epic 2 section)
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Sprint Status: `_bmad-output/implementation-artifacts/sprint-status.yaml`

---

**Generated by**: BMad TEA Agent - Test Architect Module
**Workflow**: `_bmad/tea/workflows/testarch/test-design`
**Version**: 5.0 (Step-File Architecture)
