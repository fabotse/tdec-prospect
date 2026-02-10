# ADR: Limitacao Single-Pass do Template Engine

**Data:** 2026-02-10
**Status:** Aceito
**Contexto:** Action Item #6 da Retrospectiva Epic 10

---

## Contexto

O projeto utiliza um template engine customizado (regex-based) em `src/lib/ai/prompt-manager.ts` para interpolacao de variaveis em prompts de IA. Este engine foi construido como alternativa leve a Handlebars/Mustache.

## Decisao

O engine processa templates em **duas etapas sequenciais, single-pass**:

1. **Condicionais primeiro:** `{{#if varName}}...{{else}}...{{/if}}`
2. **Variaveis simples depois:** `{{variable}}`

## Limitacoes Conhecidas

### 1. Sem Loops/Iteracao
Nao suporta `{{#each}}` ou similar. Listas devem ser pre-formatadas como string antes da interpolacao.

### 2. Sem Aninhamento de Condicionais
`{{#if a}}{{#if b}}...{{/if}}{{/if}}` nao e suportado. Apenas um nivel de condicional.

### 3. Variaveis Dentro de Condicionais
Variaveis `{{var}}` dentro de blocos `{{#if}}` sao resolvidas na segunda etapa (apos os condicionais). Isto funciona corretamente porque a ordem de processamento e: condicionais → variaveis.

### 4. Graceful Degradation
Variaveis nao encontradas permanecem como `{{variavel}}` no output — nao geram erro. Isto e intencional para evitar crashes em runtime.

## Arquivos Relevantes

- **Engine:** `src/lib/ai/prompt-manager.ts` (linhas 235-260)
- **Variaveis de email:** `src/lib/export/resolve-variables.ts`
- **Registry de variaveis:** `src/lib/export/variable-registry.ts`

## Sintaxe Suportada

| Sintaxe | Exemplo | Suportado |
|---------|---------|-----------|
| Variavel simples | `{{company_name}}` | Sim |
| Condicional | `{{#if tone_description}}...{{/if}}` | Sim |
| Condicional com else | `{{#if product_name}}...{{else}}...{{/if}}` | Sim |
| Loop | `{{#each items}}...{{/each}}` | Nao |
| Condicional aninhado | `{{#if a}}{{#if b}}...{{/if}}{{/if}}` | Nao |

## Consequencias

- Para casos que necessitem iteracao, a solucao e formatar a lista como string antes de passar como variavel (ex: `formatEmailExamples()` em `knowledge-base-context.ts`)
- Se o projeto precisar de templates mais complexos no futuro, considerar migracao para Handlebars ou similar
- A simplicidade do engine atual e uma vantagem: zero dependencias externas, facil de entender e testar
