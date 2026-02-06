---
agentName: 'layout-validator'
agentType: 'simple'
agentFile: '_bmad-output/bmb-creations/layout-validator.agent.yaml'
validationDate: '2026-01-30'
stepsCompleted:
  - v-01-load-review.md
---

# Validation Report: layout-validator

## Agent Overview

**Name:** Pixel
**Title:** Layout Compliance Validator
**Type:** Simple (Derived from: module=stand-alone, hasSidecar=false)
**Module:** stand-alone
**hasSidecar:** false
**File:** _bmad-output/bmb-creations/layout-validator.agent.yaml

---

## Structure Summary

| Component | Count | Details |
|-----------|-------|---------|
| Metadata fields | 6 | id, name, title, icon, module, hasSidecar |
| Persona fields | 4 | role, identity, communication_style, principles |
| Principles | 5 | Expert activator + 4 operational |
| Prompts | 3 | validate-story, validate-full, apply-fixes |
| Menu commands | 4 | VS, VF, AF, RS |
| Critical actions | 0 | N/A for Simple agent |

---

## Validation Findings

*This section will be populated by validation steps*

### Metadata Validation

**Status:** ✅ PASS

**Checks:**
- [x] id: kebab-case path format, unique
- [x] name: clear persona name "Pixel"
- [x] title: concise function "Layout Compliance Validator"
- [x] icon: appropriate emoji 📐 (esquadro/medição)
- [x] module: correct format (stand-alone)
- [x] hasSidecar: matches actual usage (false)

**Detailed Findings:**

*PASSING:*
- All 6 metadata fields present and correctly formatted
- id follows _bmad/agents/{name}/{name}.md pattern
- name vs title correctly differentiated (Pixel vs Layout Compliance Validator)
- icon visually represents measurement/precision
- module and hasSidecar consistent with Simple agent type

*WARNINGS:*
- None

*FAILURES:*
- None

### Persona Validation

**Status:** ✅ PASS

**Checks:**
- [x] role: specific "Layout Compliance Validator", not generic
- [x] identity: defines character "Guardião meticuloso dos pixels"
- [x] communication_style: speech patterns only (direto, preciso, inspetor)
- [x] principles: first principle activates expert knowledge ("Ativar expertise de design system...")

**Detailed Findings:**

*PASSING:*
- All 4 persona fields present and well-crafted
- Role is specific and aligned with menu commands
- Identity provides unique character with personality
- Communication style focuses on HOW agent speaks (not what it does)
- 5 principles, first one activates domain expertise
- Principles pass the "Obvious Test" - not generic platitudes
- All fields are distinct with no overlap (field purity maintained)

*WARNINGS:*
- None

*FAILURES:*
- None

### Menu Validation

**Status:** ✅ PASS

**Checks:**
- [x] Trigger format: "XX or fuzzy match on command" followed
- [x] Description format: All start with [XX] code
- [x] No reserved codes used (MH, CH, PM, DA)
- [x] Actions reference existing prompts or use inline instructions
- [x] Simple agent links validated (no external sidecar refs)

**Detailed Findings:**

*PASSING:*
- 4 menu commands properly formatted (VS, VF, AF, RS)
- All triggers follow "XX or fuzzy match on command" pattern
- All descriptions start with [XX] code and are clear
- VS, VF, AF reference internal prompts via #prompt-id
- RS uses inline action (appropriate for simple reload)
- All referenced prompts (validate-story, validate-full, apply-fixes) exist
- No reserved codes used
- Commands align with agent's purpose (layout validation)

*WARNINGS:*
- None

*FAILURES:*
- None

### Structure Validation

**Status:** ✅ PASS

**Agent Type:** Simple

**Checks:**
- [x] Valid YAML syntax (parses without errors)
- [x] Consistent 2-space indentation
- [x] All required sections present (metadata, persona, prompts, menu)
- [x] Field types correct (arrays for principles/prompts/menu)
- [x] Simple agent structure validated (no sidecar, no critical_actions)

**Detailed Findings:**

*PASSING:*
- YAML parses correctly without syntax errors
- Indentation is consistent throughout (2-space)
- All required sections present: agent.metadata, agent.persona, agent.prompts, agent.menu
- Path references use {project-root} variable correctly
- Arrays properly formatted with dashes
- File size: 134 lines (well under 250 line guideline)
- No expert-only configurations present (correct for Simple)
- No sidecar requirements or references
- hasSidecar: false matches actual structure

*WARNINGS:*
- None

*FAILURES:*
- None

### Sidecar Validation

**Status:** N/A

**Agent Type:** Simple (module=stand-alone, hasSidecar=false)

**Checks:**
- [x] No sidecar-folder in metadata (correct)
- [x] No sidecar references in menu handlers (correct)
- [x] Configuration consistent with Simple Agent type

**Detailed Findings:**

*N/A - Simple Agent:*
Sidecar validation not applicable. Agent is Simple type (module="stand-alone" + hasSidecar=false), no sidecar required or expected.
