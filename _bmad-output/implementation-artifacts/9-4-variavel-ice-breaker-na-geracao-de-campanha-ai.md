# Story 9.4: Variavel {{ice_breaker}} na Geracao de Campanha AI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want que, ao gerar uma campanha via AI sem lead selecionado, o Ice Breaker apareca como variavel `{{ice_breaker}}` no corpo do email,
so that eu saiba onde a personalizacao sera inserida e possa edita-la depois.

## Acceptance Criteria

1. **Given** o usuario gera uma campanha via AI (AICampaignWizard → full generation)
   **When** nenhum lead esta selecionado (que e o caso PADRAO do wizard)
   **Then** o corpo do primeiro email (emailMode: "initial") contem a variavel `{{ice_breaker}}` no local onde o Ice Breaker deveria estar
   **And** os follow-ups NAO contem a variavel (follow-ups nao precisam de Ice Breaker)

2. **Given** o usuario gera conteudo de um email individual no builder (EmailBlock → handleGenerate)
   **When** pelo menos um lead esta selecionado via LeadPreviewSelector
   **Then** o Ice Breaker e gerado com dados reais daquele lead (comportamento ATUAL — nao mudar)
   **And** a variavel `{{ice_breaker}}` NAO aparece — e substituida pelo conteudo real
   **And** um aviso informa que o Ice Breaker foi gerado com base no lead selecionado e pode variar para outros leads

3. **Given** o email contem a variavel `{{ice_breaker}}` no body
   **When** e exibido no editor de campanha (EmailBlock)
   **Then** a variavel e renderizada com destaque visual (badge/chip indicativo)
   **And** o usuario pode clicar na variavel para edita-la manualmente (via textarea normal)

4. **Given** o email contem a variavel `{{ice_breaker}}` no body
   **When** o usuario visualiza o preview (PreviewEmailStep)
   **Then** e exibido um placeholder explicativo: "[Ice Breaker personalizado sera gerado para cada lead]"

## Tasks / Subtasks

- [x] Task 1: Modificar prompt `email_body_generation` para suportar `{{ice_breaker}}` como placeholder (AC: #1)
  - [x] 1.1 Adicionar logica condicional no prompt: quando `icebreaker` esta vazio, instruir AI a incluir o texto literal `{{ice_breaker}}` no local do quebra-gelo no output
  - [x] 1.2 Quando `icebreaker` tem conteudo real, manter comportamento atual (usar como abertura)
  - [x] 1.3 Garantir que o bloco FORMATO OBRIGATORIO referencia `{{ice_breaker}}` como placeholder valido

- [x] Task 2: Atualizar `useAIFullCampaignGeneration` para nao passar icebreaker (AC: #1)
  - [x] 2.1 Para emails "initial": NAO incluir variavel `icebreaker` em `baseVariables` (ja e o caso atual — apenas confirmar)
  - [x] 2.2 Para emails "follow-up": manter sem icebreaker (ja e o caso atual)
  - [x] 2.3 Validar que a variavel `icebreaker` chega vazia ao prompt, ativando o branch `{{else}}` que instrui o AI a gerar `{{ice_breaker}}`

- [x] Task 3: Adicionar destaque visual para `{{ice_breaker}}` no EmailBlock (AC: #3)
  - [x] 3.1 Criar funcao utilitaria `hasIceBreakerVariable(text: string): boolean` para detectar `{{ice_breaker}}` no body
  - [x] 3.2 Quando detectado, exibir um badge/chip informativo ACIMA da textarea do body: "Contem variavel {{ice_breaker}} — sera personalizado por lead"
  - [x] 3.3 O badge usa classes do design system (bg-muted, text-muted-foreground, border, rounded)
  - [x] 3.4 O usuario edita normalmente via textarea — o `{{ice_breaker}}` e texto simples editavel

- [x] Task 4: Atualizar PreviewEmailStep para substituir `{{ice_breaker}}` (AC: #4)
  - [x] 4.1 Detectar `{{ice_breaker}}` no body text usando regex
  - [x] 4.2 Substituir por texto placeholder estilizado: "[Ice Breaker personalizado sera gerado para cada lead]"
  - [x] 4.3 O placeholder usa estilo italico e cor muted para diferenciar de conteudo real

- [x] Task 5: Adicionar aviso quando IB e gerado com lead especifico (AC: #2)
  - [x] 5.1 No EmailBlock, apos geracao individual com lead selecionado, exibir toast informativo: "Ice Breaker gerado com base no lead {nome}. Pode variar para outros leads."
  - [x] 5.2 Usar `toast.info()` do Sonner (ja instalado)

- [x] Task 6: Testes unitarios (AC: #1-#4)
  - [x] 6.1 Testes do prompt `email_body_generation`: verificar que template renderiza corretamente COM e SEM icebreaker (4 testes)
  - [x] 6.2 Testes do `useAIFullCampaignGeneration`: verificar que `icebreaker` NAO e passado em baseVariables (2 testes)
  - [x] 6.3 Testes do EmailBlock: verificar que badge de variavel aparece quando body contem `{{ice_breaker}}` + hasIceBreakerVariable util + toast AC#2 (9 testes)
  - [x] 6.4 Testes do PreviewEmailStep: verificar substituicao do placeholder (4 testes)
  - [x] 6.5 Verificar que todos os 177 arquivos de teste e 3107 testes passando (0 falhas)
  - [x] 6.6 Verificar 0 violacoes ESLint nos arquivos modificados

## Dev Notes

### Analise Critica: Dois Fluxos de Geracao de Email

O sistema tem DOIS fluxos completamente independentes de geracao de conteudo de email:

1. **Full Campaign Generation** (`useAIFullCampaignGeneration` hook)
   - Ativado pelo AICampaignWizard → "Gerar campanha completa"
   - NAO tem lead selecionado (o wizard nao oferece selecao de lead)
   - Gera subject + body sequencialmente para cada email
   - **`baseVariables` (lines 280-283) contem apenas `tone_style` e `email_objective`** — SEM `icebreaker`
   - O prompt `email_body_generation` recebe `icebreaker` vazio → bloco `QUEBRA-GELO` fica vazio

2. **Individual EmailBlock Generation** (`EmailBlock.handleGenerate()`)
   - Ativado clicando "Gerar" em um bloco individual no builder
   - TEM lead selecionado via LeadPreviewSelector (se o usuario selecionou)
   - Gera icebreaker → subject → body em sequencia (3 fases)
   - **Passa `icebreaker: generatedIcebreaker` no body generation** (line 372)
   - O prompt recebe icebreaker real → bloco `QUEBRA-GELO` tem conteudo

**CONSEQUENCIA para Story 9.4:**
- No fluxo 1 (full campaign): o AI deve gerar `{{ice_breaker}}` literal no output
- No fluxo 2 (individual com lead): comportamento NAO muda — IB real e usado
- No fluxo 2 (individual SEM lead): mesmo comportamento do fluxo 1 (icebreaker vazio → placeholder)

### Abordagem de Implementacao: Modificar o Prompt

A abordagem mais limpa e modificar o prompt `email_body_generation` para:
- Quando `{{icebreaker}}` tem conteudo real → usar como abertura (ATUAL)
- Quando `{{icebreaker}}` esta vazio → instruir AI a incluir o texto literal `{{ice_breaker}}` no output

**COMO**: Modificar a secao `QUEBRA-GELO` do prompt de:

```
QUEBRA-GELO (se disponivel):
{{icebreaker}}
```

Para:

```
{{#if icebreaker}}
QUEBRA-GELO PERSONALIZADO (USE COMO ABERTURA):
{{icebreaker}}
{{else}}
VARIAVEL DE PERSONALIZACAO:
Inclua a variavel EXATA "{{ice_breaker}}" (com chaves duplas) no local do quebra-gelo.
Esta variavel sera substituida por um Ice Breaker personalizado para cada lead.
Trate-a como texto fixo — NAO modifique, NAO expanda, NAO explique.
{{/if}}
```

E ajustar as REGRAS para:
```
2. Se houver quebra-gelo personalizado, use-o APENAS como abertura (maximo 2 frases)
   Se houver variavel {{ice_breaker}}, inclua-a EXATAMENTE como esta, sem modificacoes
```

E o FORMATO OBRIGATORIO:
```
- Quebra-gelo (se personalizado): maximo 2 frases | OU variavel {{ice_breaker}} literal
```

### ATENCAO: Template Engine e `{{ice_breaker}}`

O template engine (`interpolateTemplate` em `prompt-manager.ts`) substitui apenas variaveis presentes no mapa de variaveis. `ice_breaker` NAO e uma variavel do mapa, entao:
- `{{icebreaker}}` → substituido pelo valor passado (string real ou vazio)
- `{{ice_breaker}}` no TEMPLATE do prompt → ficaria como `{{ice_breaker}}` no output renderizado (NÃO seria substituido)

**MAS CUIDADO**: Quando o texto `{{ice_breaker}}` aparece na instrucao do prompt (no branch `{{else}}`), o template engine nao deve tentar interpola-lo. Verificar que `interpolateTemplate` ignora variaveis desconhecidas (nao as remove). Se o template engine REMOVE variaveis desconhecidas, usar escape ou texto alternativo.

**VERIFICACAO NECESSARIA**: Testar `interpolateTemplate("texto {{ice_breaker}} aqui", {})` — se retorna `"texto {{ice_breaker}} aqui"` ou `"texto  aqui"`. Se remove, usar abordagem alternativa (ex: instruir AI com texto descritivo em vez de incluir `{{ice_breaker}}` no template).

**Decisao do prompt-manager.ts (baseado em Story 9.3 learning)**: O template engine faz single-pass replacement. Variaveis desconhecidas ficam como `{{nome}}` no output — NAO sao removidas. Confirmado pela Story 9.3 que `{{#if}}` nesting nao funciona, mas variaveis simples desconhecidas sao preservadas. Porem, as chaves `{{` e `}}` podem confundir o regex do engine. **TESTAR ISSO** no primeiro teste.

### UI: Badge de Variavel no EmailBlock

**Abordagem simples (NAO requer rich text editor):**
- O body e editado via `<textarea>` normal
- `{{ice_breaker}}` e texto puro na textarea — editavel normalmente
- ACIMA da textarea, quando `{{ice_breaker}}` e detectado no body, exibir um chip/badge informativo

```tsx
{hasIceBreakerVariable(body) && (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs text-muted-foreground border">
    <Sparkles className="h-3 w-3" />
    <span>Contem variavel {"{{ice_breaker}}"} — sera personalizado por lead</span>
  </div>
)}
```

NAO criar um rich text editor ou content editable. A textarea simples e suficiente.

### UI: Preview Placeholder

No `PreviewEmailStep.tsx`, antes de renderizar o body, aplicar substituicao:

```tsx
function renderBody(body: string): string {
  return body.replace(
    /\{\{ice_breaker\}\}/g,
    "[Ice Breaker personalizado sera gerado para cada lead]"
  );
}
```

O placeholder aparece em italico e cor muted.

### Mapeamento Variavel: `icebreaker` vs `ice_breaker`

- `{{icebreaker}}` (sem underscore) = **variavel de template** do prompt, interpolada pelo template engine
- `{{ice_breaker}}` (com underscore) = **variavel de personalizacao** no corpo do email, visivel ao usuario
- Sao coisas DIFERENTES. Nao confundir.
- O prompt usa `{{icebreaker}}` para receber o valor. O OUTPUT do AI contem `{{ice_breaker}}` quando nao ha lead.

### Arquivos a Modificar

| Arquivo | Mudanca | Tasks |
|---------|---------|-------|
| `src/lib/ai/prompts/defaults.ts` | Modificar template `email_body_generation` com branch condicional para `{{ice_breaker}}` | 1.1, 1.2, 1.3 |
| `src/hooks/use-ai-full-campaign-generation.ts` | Confirmar que `icebreaker` NAO esta em baseVariables (ja e o caso) | 2.1, 2.2, 2.3 |
| `src/components/builder/EmailBlock.tsx` | Adicionar badge de deteccao de `{{ice_breaker}}` + toast AC2 | 3.1-3.4, 5.1-5.2 |
| `src/components/builder/PreviewEmailStep.tsx` | Substituir `{{ice_breaker}}` por placeholder no preview | 4.1-4.3 |

### Arquivos de Teste a Criar/Modificar

| Arquivo | Descricao |
|---------|-----------|
| `__tests__/unit/lib/ai/prompts/email-body-icebreaker-variable.test.ts` | Testes do template com/sem icebreaker |
| `__tests__/unit/hooks/use-ai-full-campaign-generation.test.ts` | Verificar baseVariables (se existir, senao criar) |
| `__tests__/unit/components/builder/EmailBlock.test.tsx` | Testes do badge de variavel |
| `__tests__/unit/components/builder/PreviewEmailStep.test.tsx` | Testes do placeholder |

### Project Structure Notes

- Types em `src/types/` (PascalCase tipos, SCREAMING_SNAKE constantes)
- Prompts defaults em `src/lib/ai/prompts/defaults.ts`
- Hooks em `src/hooks/`
- Componentes builder em `src/components/builder/`
- Testes espelham `src/` em `__tests__/`

**NAO e necessario modificar:**
- `src/types/email-block.ts` — NAO adicionar campo `icebreaker` ao EmailBlockData. O IB e parte do body text, nao um campo separado.
- `src/app/api/ai/campaign-structure/route.ts` — A estrutura da campanha NAO muda. A variavel `{{ice_breaker}}` e injetada durante geracao de CONTEUDO, nao de ESTRUTURA.
- `src/app/api/ai/generate/route.ts` — A rota de geracao recebe prompt renderizado e gera texto. Nao precisa saber de `{{ice_breaker}}`.

### Padroes Obrigatorios (das stories anteriores)

1. **0 cores hardcoded** — Sempre usar tokens CSS do design system
2. **WCAG AA contrast** — 4.5:1 texto, 3:1 UI components
3. **ESLint no-console** — Apenas `console.warn()` e `console.error()` permitidos
4. **Mock factories centralizadas** — Se tipo usado em 3+ testes, usar factory
5. **Mensagens de erro em Portugues** — Todas as mensagens user-facing em PT-BR
6. **Validacao Zod** — Input validation nos boundaries
7. **Isolamento de testes** — `vi.clearAllMocks()` em `beforeEach`
8. **Tailwind v4** — `flex flex-col gap-*` em vez de `space-y-*`
9. **DialogDescription** — Sempre incluir em shadcn Dialogs

### Dependencias

- **Story 9.1 (DONE)**: Fornece `IcebreakerCategory` (nao diretamente usado aqui)
- **Story 9.2 (DONE)**: Fornece exemplos de IB no KB (nao diretamente usado aqui)
- **Story 9.3 (DONE)**: Prompts de IB refatorados. O prompt `email_body_generation` ja tem `{{icebreaker}}`
- **Esta story NAO depende de 9.1-9.3** — e independente conforme grafo de dependencias da Epic
- **Story 9.5 DEPENDE desta**: Story 9.5 (estrutura clara de email) usara a logica de `{{ice_breaker}}` implementada aqui

### Escopo Critico — O QUE NAO FAZER

1. **NAO criar rich text editor** — Usar textarea simples + badge informativo acima
2. **NAO armazenar icebreaker como campo separado no EmailBlockData** — O `{{ice_breaker}}` e parte do body text
3. **NAO modificar a campaign-structure route** — Estrutura nao muda, so conteudo
4. **NAO modificar o prompt `campaign_structure_generation`** — Ele gera estrutura (emails + delays), nao conteudo
5. **NAO modificar o fluxo de geracao individual do EmailBlock** — Quando tem lead, o IB real e gerado normalmente
6. **NAO implementar substituicao real de `{{ice_breaker}}` em runtime (export/envio)** — Isso e para Epic 7 (Campaign Deployment)
7. **NAO unificar camelCase/snake_case** — Isso e Story 9.6

### Git Intelligence (ultimos commits relevantes)

```
76a9b3f feat(story-9.3): Refactored Icebreaker Prompts for Quality and Category Support with code review fixes
af263c0 fix(search): AI voice search now displays leads instead of only filling filters
41070cf feat(story-9.2): Icebreaker Reference Examples in Knowledge Base with code review fixes
ac3bef2 feat(story-9.1): Icebreaker Categories with code review fixes
```

**Padrao de commit**: `{type}({scope}): {description}`
- Para esta story: `feat(story-9.4): Ice Breaker Variable in AI Campaign Generation`

### References

- [Source: _bmad-output/planning-artifacts/epic-9-ai-content-quality-personalization.md#Story 9.4]
- [Source: src/lib/ai/prompts/defaults.ts — email_body_generation (lines 128-246), campaign_structure_generation (lines 637-735)]
- [Source: src/hooks/use-ai-full-campaign-generation.ts — baseVariables (lines 280-283), generateEmailContent (lines 98-130)]
- [Source: src/components/builder/EmailBlock.tsx — handleGenerate (lines 257-396), icebreaker flow (lines 325-375)]
- [Source: src/components/builder/PreviewEmailStep.tsx — body display (lines 88-95)]
- [Source: src/types/email-block.ts — EmailBlockData interface (lines 93-102)]
- [Source: src/components/campaigns/AICampaignWizard.tsx — handleGenerateFull (lines 474-522)]
- [Source: src/lib/ai/prompt-manager.ts — interpolateTemplate, 3-level fallback]
- [Source: _bmad-output/implementation-artifacts/9-3-refatoracao-dos-prompts-de-ice-breaker.md — template engine single-pass, nested {{#if}} nao funciona]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A — Implementação sem erros ou debugging necessário.

### Completion Notes List

- **Task 1**: Prompt `email_body_generation` modificado com bloco condicional `{{#if icebreaker}}...{{else}}...{{/if}}`. Quando icebreaker vazio, instrui AI a incluir `{{ice_breaker}}` literal. Regras e FORMATO OBRIGATÓRIO atualizados. Template engine preserva `{{ice_breaker}}` (variável desconhecida não é removida — confirmado em prompt-manager.ts:256).
- **Task 2**: Confirmado que `useAIFullCampaignGeneration` NÃO passa `icebreaker` em `baseVariables` (linhas 280-283). Nenhuma mudança de código necessária — apenas testes de validação adicionados.
- **Task 3**: Adicionada função `hasIceBreakerVariable()` e badge informativo com Sparkles icon acima da textarea do body no EmailBlock. Badge usa classes do design system (bg-muted, text-muted-foreground, border, rounded).
- **Task 4**: PreviewEmailStep renderiza `{{ice_breaker}}` como placeholder estilizado em itálico e cor muted. Usa `body.split("{{ice_breaker}}")` para renderizar texto ao redor com spans estilizados.
- **Task 5**: Toast `toast.info()` do Sonner exibido após geração individual com lead selecionado. Mensagem: "Ice Breaker gerado com base no lead {nome}. Pode variar para outros leads."
- **Task 6**: 19 novos testes adicionados (4 prompt, 2 hook, 9 EmailBlock, 4 PreviewEmailStep). Suite completa: 177 arquivos, 3107 testes, 0 falhas, 0 ESLint errors.
- **Fora do escopo (Code Review)**: Módulo `sanitize-ai-output.ts` criado para sanitizar output de LLMs (remover prefixos "Assunto:", "Corpo:"). Integrado em EmailBlock.tsx e use-ai-full-campaign-generation.ts. 23 testes. Não faz parte do escopo da Story 9.4 mas foi adicionado durante a sessão.

### Change Log

- 2026-02-06: Implementação completa da Story 9.4 — variável {{ice_breaker}} no prompt, badge visual no EmailBlock, placeholder no Preview, toast informativo. 19 novos testes.
- 2026-02-06: Code Review (AI) — Corrigido File List (adicionados 3 arquivos não documentados: sanitize-ai-output.ts, sanitize-ai-output.test.ts, use-ai-full-campaign-generation.ts). Atualizada contagem de testes (177 arquivos, 3107 testes). Documentado scope creep do módulo sanitize-ai-output nas Completion Notes.

### File List

**Modificados:**
- src/lib/ai/prompts/defaults.ts — Prompt email_body_generation com branch condicional {{#if icebreaker}}
- src/components/builder/EmailBlock.tsx — hasIceBreakerVariable util, badge acima da textarea, toast.info com lead, import Sparkles + sonner + sanitize
- src/components/builder/PreviewEmailStep.tsx — Renderização de {{ice_breaker}} como placeholder estilizado
- src/hooks/use-ai-full-campaign-generation.ts — Import e uso de sanitizeGeneratedSubject/sanitizeGeneratedBody (fora do escopo 9.4)

**Criados:**
- src/lib/ai/sanitize-ai-output.ts — Módulo de sanitização de output AI (fora do escopo 9.4)
- __tests__/unit/lib/ai/prompts/email-body-icebreaker-variable.test.ts — 4 testes do template com/sem icebreaker
- __tests__/unit/hooks/use-ai-full-campaign-generation-icebreaker.test.ts — 2 testes validando baseVariables sem icebreaker
- __tests__/unit/lib/ai/sanitize-ai-output.test.ts — 23 testes de sanitização (fora do escopo 9.4)

**Testes existentes expandidos:**
- __tests__/unit/components/builder/EmailBlock.test.tsx — +9 testes (hasIceBreakerVariable, badge, toast)
- __tests__/unit/components/builder/PreviewEmailStep.test.tsx — +4 testes (placeholder rendering)
