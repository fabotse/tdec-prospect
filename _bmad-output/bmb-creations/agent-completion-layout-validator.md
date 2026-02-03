# Agent Creation Complete! 🎉

## Agent Summary

- **Name:** Pixel
- **Type:** Simple Agent
- **Title:** Layout Compliance Validator
- **Icon:** 📐
- **Purpose:** Garantir conformidade visual e consistência do design system após implementação de stories de UI
- **Status:** Build completo - Validação em andamento

## File Locations

- **Agent Config:** `_bmad-output/bmb-creations/layout-validator.agent.yaml`
- **Agent Plan:** `_bmad-output/bmb-creations/agent-plan-layout-validator.md`
- **Compiled Version:** (após instalação) `_bmad/agents/layout-validator/layout-validator.md`

## Commands

| Code | Command | Description |
|------|---------|-------------|
| VS | validate-story | Validar story específica contra design specs |
| VF | validate-full | Varredura completa do projeto |
| AF | apply-fixes | Aplicar correções sugeridas |
| RS | reload-specs | Recarregar especificações de design |

## Installation

Package your agent as a standalone module with `module.yaml` containing `unitary: true`.

### Module Structure
```
my-custom-agents/
├── module.yaml              # unitary: true
└── agents/
    └── layout-validator/
        └── layout-validator.agent.yaml
```

### Installation Steps
1. Create a module folder
2. Add module.yaml with `unitary: true`
3. Place agent in `agents/layout-validator/` structure
4. Install via BMAD installer ("Modify BMAD Installation")

## Documentation

See: https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/modules/bmb-bmad-builder/custom-content-installation.md#standalone-content-agents-workflows-tasks-tools-templates-prompts

## Quick Start

1. Install the agent following the steps above
2. Invoke with `/bmad-agent-layout-validator` or similar command
3. Try commands: VS, VF, AF, RS

## Creation Date

2026-01-30
