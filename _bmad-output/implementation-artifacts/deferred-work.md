# Deferred Work

Itens reais identificados em reviews mas adiados (pré-existentes ou fora do escopo da story revisada).

## Deferred from: code review of story-19.1 (2026-06-15)

- **Divergência de resolução de tema: inline-script (`layout.tsx`) × `ThemeProvider`/`getStoredTheme`.** Para um usuário novo (sem `theme` no `localStorage`) cujo SO está em modo claro: o script inline aplica `dark` por padrão e **não** consulta `prefers-color-scheme`, enquanto `getStoredTheme()` retornaria `light`. Resultado: o app pinta `dark` e o `useTheme()` JS passa a discordar do tema efetivamente pintado. **Não afeta o BrandLogo** (a troca é 100% CSS, segue a classe `.dark`/`.light` do `<html>`) e **não foi introduzido pela Story 19.1** — é comportamento do theme system (o default-dark pode ser intencional). Follow-up sugerido: decidir se o default deve honrar `prefers-color-scheme` no script inline, ou documentar o default-dark como intencional. Severidade: MEDIUM (UX), sem impacto funcional no logo. Fonte: Blind Hunter + Edge Case Hunter, review 19.1.
