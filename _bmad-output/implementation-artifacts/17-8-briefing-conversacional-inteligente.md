# Story 17.8: Briefing Conversacional Inteligente

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario do Agente TDEC,
I want que o agente seja conversacional e inteligente durante o briefing, sugerindo valores, aceitando respostas parciais e nao bloqueando por campos opcionais,
So that eu tenha uma experiencia natural de conversa sem precisar saber exatamente todos os parametros de antemao.

## Acceptance Criteria

1. **Given** o usuario envia um briefing incompleto (ex: "Quero prospectar empresas de tecnologia")
   **When** o parser nao extrai `technology` ou `jobTitles`
   **Then** o agente NAO bloqueia o fluxo insistindo no campo
   **And** em vez disso, o agente SUGERE valores contextualizados (ex: "Para empresas de tecnologia, cargos comuns seriam: CTO, Head de TI, VP Engineering. Quer usar algum desses ou tem outra preferencia?")
   **And** o usuario pode aceitar a sugestao, modificar, ou pedir para seguir sem aquele campo

2. **Given** o usuario pede ajuda ou sugestao explicitamente (ex: "me sugere os cargos", "nao sei qual tecnologia")
   **When** o agente detecta o pedido de ajuda
   **Then** o agente oferece 3-5 sugestoes contextualizadas baseadas nos parametros ja extraidos (industria, tecnologia, localizacao)
   **And** as sugestoes sao apresentadas de forma conversacional, nao como lista de formulario
   **And** o usuario pode escolher, combinar, ou pedir mais opcoes

3. **Given** o usuario fornece informacoes parciais ao longo de varias mensagens
   **When** o agente acumula contexto suficiente para uma prospeccao viavel
   **Then** o agente apresenta o briefing consolidado em bloco (resumo de tudo que entendeu)
   **And** indica quais campos ficaram sem valor e o que isso implica (ex: "Sem tecnologia especifica, vou buscar todas as empresas do setor")
   **And** o usuario pode confirmar ou ajustar antes de prosseguir

4. **Given** o campo `technology` ou `jobTitles` nao foi informado
   **When** o agente avalia se pode prosseguir sem o campo
   **Then** `technology` se torna opcional — se ausente, o TheirStackService busca por industria/localizacao apenas (prospeccao mais ampla)
   **And** `jobTitles` permanece obrigatorio mas com sugestao inteligente — o agente DEVE sugerir cargos baseados no contexto antes de bloquear
   **And** o agente so bloqueia de fato se nao tiver NENHUM parametro viavel para busca (nem tecnologia, nem industria, nem localizacao)

5. **Given** o agente gera a resposta conversacional com sugestoes
   **When** a resposta e renderizada no chat
   **Then** as sugestoes aparecem inline na mensagem de texto (nao como componente UI separado)
   **And** o tom e conversacional e em portugues, consistente com as demais mensagens do agente
   **And** a resposta retorna em menos de 5 segundos (NFR3)

## Tasks / Subtasks

- [x] Task 1: Refatorar `detectMissingFields()` para logica inteligente em `src/app/api/agent/briefing/parse/route.ts` (AC: #1, #4)
  - [x] 1.1 Renomear para `analyzeBriefingCompleteness()` — retorna objeto `{ missingFields: string[], suggestions: Record<string, string[]>, canProceed: boolean }` em vez de apenas array de campos
  - [x] 1.2 `technology` passa a ser **opcional**: se ausente mas `industry` ou `location` presentes, `canProceed = true` e `suggestions.technology` contem sugestoes baseadas na industria
  - [x] 1.3 `jobTitles` continua obrigatorio mas com sugestoes: se ausente, `canProceed = false` E `suggestions.jobTitles` contem 3-5 cargos sugeridos baseados no contexto (technology + industry)
  - [x] 1.4 Novo campo no response: `suggestions: Record<string, string[]>` (sugestoes por campo) — adicionado a `BriefingParseResponse`
  - [x] 1.5 Novo campo no response: `canProceed: boolean` — true se o briefing tem parametros suficientes para uma busca viavel, mesmo com campos faltantes

- [x] Task 2: Criar logica de sugestoes contextuais em `src/lib/agent/briefing-suggestion-service.ts` (AC: #2)
  - [x] 2.1 Criar `BriefingSuggestionService` com metodo estatico `generateSuggestions(briefing: ParsedBriefing): Record<string, string[]>`
  - [x] 2.2 Mapeamento `technology → jobTitles`: sugerir cargos tipicos por tecnologia (ex: Netskope → CISO, Head de Seguranca; Salesforce → Head de Vendas, CRO)
  - [x] 2.3 Mapeamento `industry → jobTitles`: sugerir cargos tipicos por industria (ex: fintech → CTO, CPO, Head de Produto)
  - [x] 2.4 Mapeamento `industry → technology`: sugerir tecnologias tipicas por industria (ex: fintech → Stripe, Plaid; saude → Tasy, MV)
  - [x] 2.5 Fallback generico: se nenhum contexto, sugerir cargos mais comuns em prospeccao B2B (CTO, Head de TI, Diretor de Tecnologia, VP Engineering, CISO)
  - [x] 2.6 Mapeamentos definidos como constantes exportadas (TECH_TO_TITLES, INDUSTRY_TO_TITLES, INDUSTRY_TO_TECH) — facilita manutencao e testes

- [x] Task 3: Refatorar `FIELD_QUESTIONS` e `generateGuidedQuestions()` em `src/hooks/use-briefing-flow.ts` (AC: #1, #2, #3)
  - [x] 3.1 Substituir `FIELD_QUESTIONS` (dict estatico) por `generateSmartQuestion(field: string, suggestions: string[], briefing: ParsedBriefing): string` — gera pergunta contextual com sugestoes inline
  - [x] 3.2 Quando `suggestions` disponivel para o campo, incluir na pergunta: "Algumas opcoes comuns seriam: [sugestao1], [sugestao2], [sugestao3]. Quer usar alguma dessas?"
  - [x] 3.3 Quando usuario pede ajuda (detectar "sugere", "me ajuda", "nao sei", "qual", "quais"), tratar como pedido de sugestao mesmo se o campo ja foi informado — permitir refinamento
  - [x] 3.4 Adicionar `HELP_KEYWORDS: string[]` = ["sugere", "sugestao", "me ajuda", "nao sei", "qual deveria", "recomenda", "indica"] para deteccao de pedido de ajuda

- [x] Task 4: Adaptar `handleParseResult()` e `processMessage()` em `use-briefing-flow.ts` (AC: #1, #3, #4)
  - [x] 4.1 `handleParseResult()` agora recebe `suggestions` e `canProceed` do response da API
  - [x] 4.2 Se `canProceed = true` mas `missingFields.length > 0`: ir para `confirming` (nao `awaiting_fields`) com nota sobre campos opcionais nao preenchidos
  - [x] 4.3 Se `canProceed = false` e `suggestions` disponivel: ir para `awaiting_fields` com perguntas inteligentes (incluindo sugestoes)
  - [x] 4.4 Se `canProceed = false` e sem sugestoes: ir para `awaiting_fields` com pergunta generica amigavel
  - [x] 4.5 Atualizar `generateBriefingSummary()` para incluir nota sobre campos nao informados e suas implicacoes (ex: "Sem tecnologia especifica — busca mais ampla")
  - [x] 4.6 No estado `awaiting_fields`, detectar `HELP_KEYWORDS` na mensagem do usuario e responder com sugestoes do `BriefingSuggestionService` (chamada client-side, sem API extra)

- [x] Task 5: Atualizar `BriefingParseResponse` e route handler (AC: #1, #4, #5)
  - [x] 5.1 Expandir `BriefingParseResponse` com `suggestions: Record<string, string[]>` e `canProceed: boolean`
  - [x] 5.2 No route handler, chamar `BriefingSuggestionService.generateSuggestions()` apos o parse
  - [x] 5.3 Calcular `canProceed` baseado na nova logica: true se pelo menos `jobTitles` preenchido E (`technology` OU `industry` OU `location` presentes)
  - [x] 5.4 Manter compatibilidade: `missingFields` continua existindo para referencia, `isComplete` agora e true apenas quando TODOS os campos informados (nao so os obrigatorios)

- [x] Task 6: Testes unitarios (AC: todos)
  - [x] 6.1 BriefingSuggestionService: technology → jobTitles mapping retorna sugestoes corretas
  - [x] 6.2 BriefingSuggestionService: industry → jobTitles mapping retorna sugestoes corretas
  - [x] 6.3 BriefingSuggestionService: industry → technology mapping retorna sugestoes corretas
  - [x] 6.4 BriefingSuggestionService: fallback generico quando nenhum contexto disponivel
  - [x] 6.5 BriefingSuggestionService: combinacao de technology + industry gera sugestoes refinadas
  - [x] 6.6 analyzeBriefingCompleteness: technology ausente mas industry presente → canProceed = true, suggestions.technology preenchido
  - [x] 6.7 analyzeBriefingCompleteness: technology ausente e industry ausente e location ausente → canProceed = false (nenhum parametro viavel)
  - [x] 6.8 analyzeBriefingCompleteness: jobTitles ausente → canProceed = false, suggestions.jobTitles preenchido com sugestoes contextuais
  - [x] 6.9 analyzeBriefingCompleteness: tudo preenchido → canProceed = true, missingFields vazio, suggestions vazio
  - [x] 6.10 API route: response inclui suggestions e canProceed corretamente
  - [x] 6.11 API route: briefing incompleto retorna suggestions nao-vazias
  - [x] 6.12 useBriefingFlow: canProceed=true com missingFields → vai para 'confirming' (nao 'awaiting_fields')
  - [x] 6.13 useBriefingFlow: canProceed=false com suggestions → gera perguntas com sugestoes inline
  - [x] 6.14 useBriefingFlow: usuario envia HELP_KEYWORD → agente responde com sugestoes
  - [x] 6.15 useBriefingFlow: usuario aceita sugestao (ex: "usa CTO e Head de TI") → re-parse com contexto acumulado extrai os cargos
  - [x] 6.16 useBriefingFlow: briefing summary inclui nota sobre campos nao informados
  - [x] 6.17 generateSmartQuestion: com sugestoes → pergunta inclui opcoes inline
  - [x] 6.18 generateSmartQuestion: sem sugestoes → pergunta generica amigavel (sem lista vazia)

## Dev Notes

### Diagnostico do Problema Atual

O briefing atual funciona como **"formulario disfarçado de conversa"**. A rigidez vem de 2 pontos:

1. **`detectMissingFields()`** em `src/app/api/agent/briefing/parse/route.ts` (linhas 41-53): Hardcoded para exigir `technology` e `jobTitles` como obrigatorios. Se um deles esta vazio, `isComplete = false` e o fluxo bloqueia.

2. **`FIELD_QUESTIONS`** em `src/hooks/use-briefing-flow.ts` (linhas 77-82): Dict estatico com perguntas fixas. Nao oferece sugestoes, nao adapta ao contexto, nao aceita "nao sei" como resposta valida.

**Resultado:** Se o usuario nao sabe a tecnologia, o agente insiste. Se pede sugestao de cargos, o agente repete a pergunta. Experiencia travada e frustrante.

### Principio da Solucao: Assistente Proativo, Nao Entrevistador Passivo

O agente deve se comportar como um **colega de vendas experiente**:
- Se o usuario nao sabe algo, o agente sugere baseado no contexto
- Se um campo nao e critico, o agente segue sem ele e avisa a implicacao
- A conversa e livre — o agente extrai informacao de linguagem natural
- No final, mostra o resumo consolidado para confirmacao

### Decisao Arquitetural: Sugestoes Client-side (Mapeamentos Estaticos)

**NAO usar chamada AI para gerar sugestoes.** Motivos:
1. Sugestoes precisam ser instantaneas (< 100ms) — chamada OpenAI levaria 2-5s
2. Mapeamentos technology→cargos e industry→cargos sao relativamente estaveis no contexto B2B
3. Mantemos a chamada AI somente para o parse do briefing (que ja existe)
4. Se no futuro quisermos sugestoes mais inteligentes (ex: baseadas no historico de campanhas do tenant), isso seria uma story separada

**Implementacao:** `BriefingSuggestionService` com constantes `TECH_TO_TITLES`, `INDUSTRY_TO_TITLES`, `INDUSTRY_TO_TECH`. Logica pura, sem I/O, facilmente testavel.

### Decisao Arquitetural: `technology` Passa a Ser Opcional

Hoje o TheirStackService exige `technology` para buscar empresas. Mas a API do TheirStack tambem aceita buscas por `industry` e `location` sem technology. Na pratica:
- **Com technology:** busca empresas que usam aquela ferramenta (mais preciso, menos resultados)
- **Sem technology:** busca empresas do setor/localizacao (mais amplo, mais resultados)

Ambos sao cenarios validos de prospeccao. O agente deve informar a diferenca ao usuario, nao bloquear.

**IMPORTANTE:** Esta story NAO altera o TheirStackService ou o SearchCompaniesStep. Apenas muda a validacao do briefing para permitir que `technology = null` passe. O step de busca ja lida com technology null (faz busca sem filtro de tecnologia).

### Decisao: `jobTitles` Continua Obrigatorio (com Sugestao)

Sem cargos, o ApolloService nao tem como buscar leads (nao existe busca de leads sem job title na API). Portanto:
- `jobTitles` continua sendo o unico campo realmente bloqueante
- MAS o agente DEVE sugerir cargos antes de insistir
- So bloqueia se o usuario nao fornecer NEM aceitar nenhuma sugestao

### Fluxo Revisado do Briefing

```
Usuario envia mensagem
  ↓
API parse → extrai parametros
  ↓
analyzeBriefingCompleteness() → { missingFields, suggestions, canProceed }
  ↓
┌─ canProceed = true (jobTitles preenchido + pelo menos 1 parametro de busca)
│   ↓
│   Mostrar resumo consolidado com notas sobre campos nao informados
│   → "confirming"
│
└─ canProceed = false
    ↓
    ┌─ suggestions disponivel
    │   → Pergunta inteligente com sugestoes inline → "awaiting_fields"
    │
    └─ sem sugestoes
        → Pergunta generica amigavel → "awaiting_fields"

Em "awaiting_fields":
  Usuario responde
    ↓
    ┌─ Contem HELP_KEYWORD → mostrar sugestoes do BriefingSuggestionService
    │
    └─ Resposta normal → re-parse com contexto acumulado → loop
```

### Contrato: BriefingParseResponse Expandido

```typescript
// ANTES (atual):
interface BriefingParseResponse {
  briefing: ParsedBriefing;
  missingFields: string[];
  isComplete: boolean;
  productMentioned: string | null;
}

// DEPOIS (story 17.8):
interface BriefingParseResponse {
  briefing: ParsedBriefing;
  missingFields: string[];
  isComplete: boolean;           // true quando TODOS os campos informados
  canProceed: boolean;           // NOVO — true quando ha parametros suficientes para busca
  suggestions: Record<string, string[]>; // NOVO — sugestoes por campo faltante
  productMentioned: string | null;
}
```

**Compatibilidade:** `isComplete` mantido para backward compat. O hook deve usar `canProceed` para decidir se vai para `confirming` ou `awaiting_fields`.

### Contrato: BriefingSuggestionService

```typescript
// src/lib/agent/briefing-suggestion-service.ts

export const TECH_TO_TITLES: Record<string, string[]> = {
  netskope: ["CISO", "Head de Seguranca", "Diretor de TI", "VP Engineering"],
  salesforce: ["Head de Vendas", "CRO", "Diretor Comercial", "Head de CRM"],
  aws: ["CTO", "Head de Infraestrutura", "VP Engineering", "Cloud Architect"],
  // ... outros mapeamentos
};

export const INDUSTRY_TO_TITLES: Record<string, string[]> = {
  fintech: ["CTO", "CPO", "Head de Produto", "VP Engineering"],
  saude: ["CTO", "CIO", "Head de TI", "Diretor de Inovacao"],
  varejo: ["CTO", "Head de E-commerce", "Diretor de TI", "CDO"],
  // ... outros mapeamentos
};

export const INDUSTRY_TO_TECH: Record<string, string[]> = {
  fintech: ["Stripe", "Plaid", "Brex", "Segment"],
  saude: ["Tasy", "MV", "Pixeon", "Salesforce Health Cloud"],
  // ... outros mapeamentos
};

export const DEFAULT_JOB_TITLES = ["CTO", "Head de TI", "VP Engineering", "Diretor de Tecnologia", "CISO"];

export class BriefingSuggestionService {
  static generateSuggestions(briefing: ParsedBriefing): Record<string, string[]> {
    const suggestions: Record<string, string[]> = {};

    // Sugerir jobTitles se ausente
    if (!briefing.jobTitles || briefing.jobTitles.length === 0) {
      if (briefing.technology && TECH_TO_TITLES[briefing.technology.toLowerCase()]) {
        suggestions.jobTitles = TECH_TO_TITLES[briefing.technology.toLowerCase()];
      } else if (briefing.industry && INDUSTRY_TO_TITLES[briefing.industry.toLowerCase()]) {
        suggestions.jobTitles = INDUSTRY_TO_TITLES[briefing.industry.toLowerCase()];
      } else {
        suggestions.jobTitles = DEFAULT_JOB_TITLES;
      }
    }

    // Sugerir technology se ausente
    if (!briefing.technology) {
      if (briefing.industry && INDUSTRY_TO_TECH[briefing.industry.toLowerCase()]) {
        suggestions.technology = INDUSTRY_TO_TECH[briefing.industry.toLowerCase()];
      }
    }

    return suggestions;
  }
}
```

**NOTA:** Os mapeamentos acima sao exemplos. O dev deve expandir com pelo menos 8-10 industrias e 8-10 tecnologias relevantes para o mercado B2B brasileiro. Consultar dados reais de campanhas anteriores se disponivel.

### Contrato: generateSmartQuestion()

```typescript
// Substitui FIELD_QUESTIONS + generateGuidedQuestions()

function generateSmartQuestion(
  field: string,
  suggestions: string[],
  briefing: ParsedBriefing
): string {
  if (field === "jobTitles" && suggestions.length > 0) {
    const context = briefing.technology
      ? `Para empresas que usam ${briefing.technology}`
      : briefing.industry
        ? `No setor de ${briefing.industry}`
        : "Para prospeccao B2B";
    return `${context}, cargos comuns seriam: ${suggestions.join(", ")}. Quer usar algum desses ou tem outra preferencia?`;
  }

  if (field === "technology" && suggestions.length > 0) {
    return `Algumas tecnologias comuns no setor seriam: ${suggestions.join(", ")}. Quer filtrar por alguma ou prefere buscar sem filtro de tecnologia?`;
  }

  // Fallback generico
  const fieldLabels: Record<string, string> = {
    technology: "tecnologia ou ferramenta",
    jobTitles: "cargos-alvo",
  };
  return `Qual ${fieldLabels[field] || field} voce tem em mente? Se nao souber, posso sugerir opcoes.`;
}
```

### Dados do Step Anterior

Esta story nao depende de previousStepOutput (briefing acontece antes do pipeline). Depende apenas do output do BriefingParserService (OpenAI parse).

### Servicos/Funcoes a REUTILIZAR (NAO RECRIAR)

| Servico/Funcao | Arquivo | Uso nesta story |
|----------------|---------|----------------|
| BriefingParserService | `src/lib/agent/briefing-parser-service.ts` | Manter como esta — parse continua igual |
| useBriefingFlow | `src/hooks/use-briefing-flow.ts` | Refatorar handleParseResult e generateGuidedQuestions |
| detectMissingFields | `src/app/api/agent/briefing/parse/route.ts` | Substituir por analyzeBriefingCompleteness |
| BriefingParseResponse | `src/app/api/agent/briefing/parse/route.ts` | Expandir com suggestions e canProceed |
| ParsedBriefing | `src/types/agent.ts` | NAO MODIFICAR — manter interface intacta |
| FIELD_QUESTIONS | `src/hooks/use-briefing-flow.ts` | Substituir por generateSmartQuestion |
| generateGuidedQuestions | `src/hooks/use-briefing-flow.ts` | Substituir por logica que usa suggestions |
| generateBriefingSummary | `src/hooks/use-briefing-flow.ts` | Expandir para incluir notas sobre campos opcionais |

### Convencao de Error Handling (OBRIGATORIA)

Seguir EXATAMENTE o mesmo padrao das Stories 16.3 e 17.1-17.2:
- Todo `fetch` tem check de `response.ok`
- Todo `catch` propaga ou exibe o erro (nunca engole)
- Nao usar `!` (non-null assertions)
- ESLint no-console: nao usar console.log

### Padroes de Codigo (Learnings Epic 16)

- **Testes (Vitest):** Mock do fetch global para API route tests. Mock do hook state via renderHook + act.
- **Testes de hook:** Usar `renderHook` + `act()` do @testing-library/react para testar transicoes de estado
- **Mensagens em portugues:** Todas as mensagens do agente devem ser em pt-BR
- **Timeout:** Sugestoes sao client-side, sem timeout adicional. O parse API ja tem timeout de 5s.

### Project Structure Notes

**Novo arquivo a criar:**
```
src/lib/agent/briefing-suggestion-service.ts         <- BriefingSuggestionService
__tests__/unit/lib/agent/briefing-suggestion-service.test.ts
```

**Arquivos a modificar:**
```
src/app/api/agent/briefing/parse/route.ts            <- detectMissingFields → analyzeBriefingCompleteness + expandir response
src/hooks/use-briefing-flow.ts                       <- FIELD_QUESTIONS → generateSmartQuestion + adaptar handleParseResult + HELP_KEYWORDS
__tests__/unit/api/agent/briefing-parse.test.ts      <- Atualizar testes para nova response (suggestions, canProceed)
__tests__/unit/hooks/use-briefing-flow.test.tsx       <- Novos testes para sugestoes, HELP_KEYWORDS, canProceed logic
```

**Arquivos que NAO devem ser modificados:**
```
src/types/agent.ts                                    <- ParsedBriefing NAO muda
src/lib/agent/briefing-parser-service.ts              <- Parser NAO muda (extracao continua igual)
src/components/agent/AgentChat.tsx                     <- Nao precisa mudar (orquestracao via hook)
```

### Convencoes de naming (seguir Epic 16/17)

- Service class: `BriefingSuggestionService` (PascalCase)
- Arquivo: `briefing-suggestion-service.ts` (kebab-case)
- Constantes de mapeamento: `TECH_TO_TITLES`, `INDUSTRY_TO_TITLES` (UPPER_SNAKE_CASE)
- Helper functions: `generateSmartQuestion`, `analyzeBriefingCompleteness` (camelCase)

### Checklist de Code Review (Epic 17)

Toda story deve passar:
- [x] Todo `fetch` tem check de `response.ok`
- [x] Todo handler/callback tem `try/catch`
- [x] Todo `catch` propaga ou exibe o erro (nunca engole)
- [x] Nenhum console.log (usar toast.error para erros no frontend)
- [x] Nenhuma non-null assertion (!)
- [x] Mensagens do agente em portugues (pt-BR)
- [x] Testes cobrem: happy path + sugestoes + help keywords + canProceed logic + campos opcionais

### References

- [Source: src/app/api/agent/briefing/parse/route.ts — detectMissingFields(), BriefingParseResponse]
- [Source: src/hooks/use-briefing-flow.ts — FIELD_QUESTIONS, generateGuidedQuestions(), handleParseResult(), processMessage()]
- [Source: src/lib/agent/briefing-parser-service.ts — BriefingParserService, SYSTEM_PROMPT, briefingResponseSchema]
- [Source: src/types/agent.ts — ParsedBriefing interface]
- [Source: src/components/agent/AgentChat.tsx — integracao com useBriefingFlow]
- [Source: __tests__/unit/hooks/use-briefing-flow.test.tsx — padrao de testes do hook]
- [Source: __tests__/unit/api/agent/briefing-parse.test.ts — padrao de testes da API route]
- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md — FR3, FR4, NFR3]
- [Source: _bmad-output/implementation-artifacts/16-3-briefing-parser-linguagem-natural.md — Story original do briefing]
- [Source: _bmad-output/implementation-artifacts/epic-17-error-handling-convention.md — Convencao de error handling]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Refatorado `detectMissingFields()` → `analyzeBriefingCompleteness()` em route.ts. Nova funcao retorna `{ missingFields, suggestions, canProceed }`. `technology` agora opcional; `canProceed = true` quando `jobTitles` preenchido + pelo menos 1 search param.
- Task 2: Criado `BriefingSuggestionService` com mapeamentos estaticos: 10 tecnologias (TECH_TO_TITLES), 10 industrias (INDUSTRY_TO_TITLES, INDUSTRY_TO_TECH), fallback generico (DEFAULT_JOB_TITLES). Combinacao tech+industry gera merge deduplicado limitado a 6 sugestoes.
- Task 3: Substituido `FIELD_QUESTIONS` + `generateGuidedQuestions()` por `generateSmartQuestion()` + `generateSmartQuestions()`. Adicionado `HELP_KEYWORDS` e `isHelpRequest()` para deteccao de pedidos de ajuda.
- Task 4: `handleParseResult()` agora usa `canProceed` (nao `isComplete`) para decisao de fluxo. `generateBriefingSummary()` expandido com notas sobre campos opcionais ausentes. Handler `awaiting_fields` detecta HELP_KEYWORDS e responde com sugestoes client-side.
- Task 5: `BriefingParseResponse` expandida com `canProceed: boolean` e `suggestions: Record<string, string[]>`. Route handler chama `BriefingSuggestionService.generateSuggestions()` apos parse.
- Task 6: 63 testes cobrindo os 3 arquivos modificados/criados. 10 testes BriefingSuggestionService, 20 testes API route (6 novos), 33 testes hook (7 novos). Suite completa: 350 arquivos, 5962 testes, 0 falhas.

### Change Log

- 2026-03-27: Story 17.8 implementada — briefing conversacional inteligente com sugestoes contextuais, technology opcional, HELP_KEYWORDS, smart questions
- 2026-03-27: Code Review fixes (7 issues — 3M, 4L):
  - M1: `isComplete` agora tracked ALL fields (location, industry, companySize) — alinhado com Task 5.4
  - M2: `normalizeKey()` strip diacriticos (NFD) — "saúde" → "saude" funciona
  - M3: sprint-status.yaml adicionado ao File List
  - L1: Removido assignment redundante de jobTitles no merge tech+industry
  - L2: "quais" em HELP_KEYWORDS substituido por variantes especificas ("quais cargos", "quais tecnologias", "quais opcoes")
  - L3: Industry aliases adicionados (healthcare→saude, financial services→fintech, etc.)
  - L4: Labels pt-BR adicionados para location, industry, companySize em generateSmartQuestion
  - 6 novos testes: diacriticos, aliases, normalizeKey. Suite: 350 files, 5968 tests, 0 failures
- 2026-03-27: Code Review #2 fixes (6 issues — 3M, 3L):
  - M1: `callParseAPI`/`callParseProductAPI` error response JSON parsing agora com try/catch — protege contra respostas HTML (502/503)
  - M2: `generateBriefingSummary` agora nota todos os campos opcionais faltantes (industry, location, companySize) — alinhado com AC #3
  - M3: `generateSmartQuestion` para technology agora contextualiza por industria (ex: "no setor de fintech" em vez de "no setor")
  - L1: Removido param `suggestions` desnecessario de `analyzeBriefingCompleteness` — caller ja tem o valor
  - L2: Test fixtures `COMPLETE_PARSE_RESPONSE` et al. corrigidos para refletir isComplete/missingFields consistentes com companySize:null
  - L3: Adicionado teste para `normalizeKey("")` edge case
  - 1 novo teste. Suite: 350 files, 5984 tests, 0 failures

### File List

**Novos:**
- src/lib/agent/briefing-suggestion-service.ts
- __tests__/unit/lib/agent/briefing-suggestion-service.test.ts

**Modificados:**
- src/app/api/agent/briefing/parse/route.ts
- src/hooks/use-briefing-flow.ts
- __tests__/unit/api/agent/briefing-parse.test.ts
- __tests__/unit/hooks/use-briefing-flow.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
