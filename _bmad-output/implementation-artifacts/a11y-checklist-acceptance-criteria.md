# Checklist de Acessibilidade para Acceptance Criteria

**Data:** 2026-02-10
**Contexto:** Action Item #8 da Retrospectiva Epic 10

---

## Uso

Este checklist deve ser consultado ao definir acceptance criteria para stories que envolvam componentes de UI. Nem todos os itens se aplicam a todas as stories — selecione os relevantes.

---

## 1. Navegacao por Teclado

- [ ] Todos os elementos interativos sao focaveis via Tab
- [ ] A ordem de foco (tab order) segue a ordem visual logica
- [ ] Elementos focados tem indicador visual claro (focus ring)
- [ ] Dialogs/modais capturam o foco e retornam ao elemento original ao fechar
- [ ] Menus dropdown podem ser navegados com setas e fechados com Escape

## 2. Semantica HTML

- [ ] Headings (`h1`-`h6`) seguem hierarquia logica (sem pular niveis)
- [ ] Formularios usam `<label>` associado ao input (via `htmlFor` ou wrapper)
- [ ] Botoes usam `<button>`, nao `<div onClick>`
- [ ] Links usam `<a>`, nao `<span onClick>`
- [ ] Listas usam `<ul>/<ol>/<li>` quando apropriado

## 3. ARIA e Roles

- [ ] Icones decorativos tem `aria-hidden="true"`
- [ ] Icones informativos tem `aria-label` descritivo
- [ ] Dialogs tem `aria-labelledby` apontando para o titulo
- [ ] Dialogs tem `aria-describedby` ou `Description` (Radix UI)
- [ ] Loading states tem `aria-busy="true"` ou `role="status"`
- [ ] Alerts/toasts usam `role="alert"` ou `aria-live="polite"`

## 4. Contraste e Visual

- [ ] Texto normal: ratio minimo 4.5:1 (WCAG AA)
- [ ] Texto grande (18px+ ou 14px bold): ratio minimo 3:1
- [ ] Elementos interativos: indicador de estado que nao depende apenas de cor
- [ ] Dark mode mantém os mesmos ratios de contraste (quando aplicavel)

## 5. Formularios

- [ ] Campos obrigatorios indicados visualmente E via `aria-required`
- [ ] Erros de validacao associados ao campo via `aria-describedby`
- [ ] Mensagens de erro descrevem o que fazer (nao apenas "invalido")
- [ ] Selects/comboboxes acessiveis via teclado (shadcn/ui Radix garante)

## 6. Conteudo Dinamico

- [ ] Conteudo carregado async anunciado via `aria-live` region
- [ ] Skeleton loaders nao capturam foco desnecessariamente
- [ ] Tabelas com sort indicam direcao via `aria-sort`
- [ ] Paginacao acessivel com labels descritivos

## 7. Imagens e Media

- [ ] Imagens informativas tem `alt` descritivo
- [ ] Imagens decorativas tem `alt=""`
- [ ] Graficos/charts tem alternativa textual (tabela de dados ou descricao)

---

## Niveis de Aplicacao

| Tipo de Story | Itens Obrigatorios |
|---------------|-------------------|
| Componente UI novo | Secoes 1, 2, 3, 5 |
| Pagina/dashboard | Secoes 1, 2, 3, 4, 6 |
| Formulario | Secoes 1, 2, 3, 5 |
| Tabela de dados | Secoes 1, 2, 6 |
| Dialog/modal | Secoes 1, 3 |

---

## Referencia

- [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/?levels=aaa)
- [Radix UI Accessibility](https://www.radix-ui.com/docs/primitives/overview/accessibility)
- [Testing Library Accessibility Queries](https://testing-library.com/docs/queries/byrole)
