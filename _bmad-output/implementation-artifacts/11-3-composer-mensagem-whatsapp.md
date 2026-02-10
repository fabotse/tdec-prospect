# Story 11.3: Composer de Mensagem WhatsApp

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario com acesso a leads quentes,
I want compor mensagens WhatsApp manualmente ou gerar com IA baseada no produto da campanha,
so that eu possa preparar mensagens personalizadas e relevantes antes de enviar para leads qualificados.

## Acceptance Criteria

1. **Given** o WhatsAppComposerDialog aberto com dados de um lead **When** o dialog renderiza **Then** exibe o nome do lead, telefone formatado, empresa e cargo **And** um Textarea para composicao manual da mensagem **And** um botao "Gerar com IA" para geracao automatica **And** um botao "Enviar" (desabilitado quando mensagem vazia) **And** um DialogDescription acessivel

2. **Given** o Textarea de composicao **When** o usuario digita uma mensagem manualmente **Then** o texto aparece no Textarea **And** o contador de caracteres atualiza em tempo real **And** o botao "Enviar" habilita quando ha texto (`.trim()` nao vazio) **And** uma orientacao visual indica faixa ideal de caracteres para WhatsApp (ate 500 chars)

3. **Given** o botao "Gerar com IA" **When** o usuario clica **Then** o sistema chama `useAIGenerate()` com promptKey `"whatsapp_message_generation"` **And** passa as variaveis do knowledge base (`useKnowledgeBaseContext()`) **And** passa o `productId` da campanha para contexto de produto **And** passa dados do lead (nome, empresa, cargo, setor) como variaveis **And** o streaming exibe texto progressivamente no Textarea **And** um indicador visual "Gerando mensagem..." aparece durante a geracao

4. **Given** a geracao IA em andamento **When** o texto esta sendo streamed **Then** o botao "Gerar com IA" fica desabilitado **And** o botao "Enviar" fica desabilitado **And** o Textarea exibe o texto acumulado em tempo real **And** ao concluir, o botao "Enviar" habilita automaticamente

5. **Given** um erro na geracao IA **When** a geracao falha (timeout, API error) **Then** uma mensagem de erro em portugues aparece abaixo do Textarea **And** o botao "Gerar com IA" reabilita para nova tentativa **And** o Textarea mantem qualquer texto ja digitado anteriormente (nao limpa)

6. **Given** o prompt `whatsapp_message_generation` **When** registrado em `defaults.ts` e `ai-prompt.ts` **Then** gera mensagens curtas e conversacionais adequadas para WhatsApp **And** usa contexto do produto quando `productId` fornecido **And** usa contexto da empresa via knowledge base **And** respeita o tom de voz configurado **And** inclui dados do lead para personalizacao **And** limita a ~300 tokens (mensagens WhatsApp sao curtas)

7. **Given** o dialog com lead sem telefone (phone null/undefined) **When** o dialog abre **Then** exibe aviso "Telefone nao disponivel" no lugar do numero **And** o botao "Enviar" fica permanentemente desabilitado **And** a composicao e geracao IA ainda funcionam (usuario pode copiar texto) **And** um botao ou link "Copiar mensagem" aparece como alternativa

8. **Given** o componente WhatsAppComposerDialog **When** testado com Vitest + React Testing Library **Then** todos os ACs acima tem cobertura de testes **And** mocks de `useAIGenerate` e `useKnowledgeBaseContext` seguem o padrao do projeto **And** testes organizados por AC com `describe` blocks

## Tasks / Subtasks

- [x] Task 1: Adicionar prompt key `whatsapp_message_generation` (AC: #6)
  - [x] 1.1 Em `src/types/ai-prompt.ts`: adicionar `"whatsapp_message_generation"` ao `promptKeySchema` enum
  - [x] 1.2 Em `src/lib/ai/prompts/defaults.ts`: adicionar template do prompt WhatsApp ao `CODE_DEFAULT_PROMPTS`
  - [x] 1.3 Prompt deve gerar mensagens curtas (max 300 tokens), conversacionais, sem assunto
  - [x] 1.4 Prompt deve suportar `{{#if product_name}}` para contexto de produto
  - [x] 1.5 Prompt deve usar variaveis: `lead_name`, `lead_title`, `lead_company`, `lead_industry`, `company_context`, `tone_style`, `tone_description`, `writing_guidelines`
- [x] Task 2: Criar componente `WhatsAppComposerDialog` (AC: #1, #2, #3, #4, #5, #7)
  - [x] 2.1 Criar `src/components/tracking/WhatsAppComposerDialog.tsx`
  - [x] 2.2 Props: `open`, `onOpenChange`, `lead` (OpportunityLead), `campaignId`, `productId`, `onSend` callback
  - [x] 2.3 Header com dados do lead: nome, telefone formatado, empresa, cargo
  - [x] 2.4 Textarea para composicao manual com `data-testid`
  - [x] 2.5 Contador de caracteres com orientacao visual (verde ate 500, amarelo 500-1000, vermelho 1000+)
  - [x] 2.6 Botao "Gerar com IA" usando `useAIGenerate()` hook
  - [x] 2.7 Integracao com `useKnowledgeBaseContext()` para variaveis do KB
  - [x] 2.8 Streaming de texto no Textarea durante geracao
  - [x] 2.9 Estados de loading/error/success com feedback visual
  - [x] 2.10 Tratamento de lead sem telefone (aviso + botao "Copiar mensagem")
  - [x] 2.11 Botao "Enviar" chama `onSend({ phone, message })` — logica de envio real fica na story 11.4
  - [x] 2.12 DialogDescription para acessibilidade (obrigatorio com Radix Dialog)
- [x] Task 3: Exportar componente (AC: #1)
  - [x] 3.1 Verificar se `src/components/tracking/index.ts` existe; se sim, adicionar export
  - [x] 3.2 Se nao existir, exportar diretamente do arquivo do componente
- [x] Task 4: Testes unitarios (AC: #8)
  - [x] 4.1 Criar `__tests__/unit/components/tracking/WhatsAppComposerDialog.test.tsx`
  - [x] 4.2 Mock de `useAIGenerate` com estados: idle, generating, streaming, done, error
  - [x] 4.3 Mock de `useKnowledgeBaseContext` com variaveis padrao
  - [x] 4.4 Testes AC #1: renderizacao com dados do lead (nome, telefone, empresa, cargo)
  - [x] 4.5 Testes AC #2: composicao manual + contador de caracteres + botao Enviar enable/disable
  - [x] 4.6 Testes AC #3: clique em "Gerar com IA" chama generate com promptKey e variaveis corretas
  - [x] 4.7 Testes AC #4: estados durante streaming (botoes desabilitados, texto acumulado)
  - [x] 4.8 Testes AC #5: erro na geracao (mensagem de erro, botao reabilita, texto preservado)
  - [x] 4.9 Testes AC #6: validar que prompt key esta registrado (teste de tipo/constante)
  - [x] 4.10 Testes AC #7: lead sem telefone (aviso, botao Enviar desabilitado, botao Copiar)
  - [x] 4.11 Verificar regressao: `npx vitest run` — 233 files, 4210 tests, 0 falhas

## Dev Notes

### Decisao Arquitetural: Composer como Dialog Reutilizavel

O `WhatsAppComposerDialog` e um componente de dialog controlado (props `open`/`onOpenChange`) que recebe contexto via props e delega o envio via callback `onSend`. Esta abordagem permite:
- **Story 11.4** usar o dialog com envio individual via Z-API
- **Story 11.6** reutilizar o composer para envio em massa
- **Testabilidade** sem dependencias de API ou banco

### Referencia de Implementacao: EmailBlock Pattern

[Source: src/components/builder/EmailBlock.tsx]

O WhatsAppComposerDialog segue o mesmo padrao de AI generation do EmailBlock:

```typescript
// Hook de AI generation (REUTILIZAR — zero mudancas no hook)
const {
  generate,
  phase: aiPhase,
  text: streamingText,
  error: aiError,
  reset: resetAI,
  isGenerating,
} = useAIGenerate();

// Hook de Knowledge Base context (REUTILIZAR — zero mudancas)
const { variables: kbVariables, isLoading: kbLoading } = useKnowledgeBaseContext();

// Geracao de mensagem WhatsApp
const handleGenerateAI = async () => {
  resetAI();
  const result = await generate({
    promptKey: "whatsapp_message_generation",
    variables: {
      ...kbVariables,
      lead_name: lead.firstName || "",
      lead_title: lead.title || "",
      lead_company: lead.companyName || "",
      lead_industry: lead.industry || "",
    },
    stream: true,
    productId,
  });
  if (result) {
    setMessage(normalizeTemplateVariables(result));
  }
};
```

**Diferenca crucial vs EmailBlock:** WhatsApp nao tem campo "assunto" — apenas um Textarea de mensagem. A geracao e de um unico campo, simplificando o fluxo.

### Prompt WhatsApp — Especificacao

[Source: src/lib/ai/prompts/defaults.ts — padrao de prompt]

O prompt `whatsapp_message_generation` deve ser adicionado a `CODE_DEFAULT_PROMPTS`:

```typescript
whatsapp_message_generation: {
  template: `Você é um especialista em comunicação WhatsApp B2B no Brasil.

Gere uma mensagem WhatsApp curta, conversacional e persuasiva para prospecção comercial.

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}
Diferenciais: {{competitive_advantages}}

{{#if product_name}}
PRODUTO EM FOCO:
- Nome: {{product_name}}
- Descrição: {{product_description}}
- Características: {{product_features}}
- Diferenciais: {{product_differentials}}
- Público-alvo: {{product_target_audience}}

A mensagem DEVE mencionar o produto "{{product_name}}" de forma natural e conversacional.
{{else}}
Produtos/Serviços: {{products_services}}
{{/if}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}

ICP (Perfil de Cliente Ideal):
{{icp_summary}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}
Diretrizes: {{writing_guidelines}}

REGRAS PARA WHATSAPP:
1. Máximo 3-4 parágrafos curtos (WhatsApp não é email)
2. Tom conversacional — como uma mensagem real entre profissionais
3. Comece com saudação breve: "Olá {{lead_name}}" ou "Oi {{lead_name}}"
4. Vá direto ao ponto — sem rodeios corporativos
5. Termine com pergunta aberta que convida resposta
6. NÃO use formatação de email (sem "Prezado", sem assinatura formal)
7. NÃO use emojis excessivos (máximo 1-2 se o tom permitir)
8. Use linguagem natural brasileira (não robotizada)
9. Mencione algo específico sobre a empresa ou setor do lead
10. Mantenha entre 200-400 caracteres (ideal para WhatsApp)

Responda APENAS com a mensagem WhatsApp, sem explicações ou formatação extra.`,
  modelPreference: "gpt-4o-mini",
  metadata: {
    temperature: 0.7,
    maxTokens: 300,
  },
},
```

### PromptKey Registry

[Source: src/types/ai-prompt.ts:171-181]

Adicionar `"whatsapp_message_generation"` ao `promptKeySchema`:

```typescript
export const promptKeySchema = z.enum([
  "search_translation",
  "email_subject_generation",
  "email_body_generation",
  "icebreaker_generation",
  "icebreaker_premium_generation",
  "tone_application",
  "follow_up_email_generation",
  "follow_up_subject_generation",
  "campaign_structure_generation",
  "whatsapp_message_generation",  // ← NOVO (Story 11.3)
]);
```

### WhatsAppComposerDialog — Especificacao do Componente

```typescript
// src/components/tracking/WhatsAppComposerDialog.tsx

interface WhatsAppComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    leadEmail?: string;
    companyName?: string;
    title?: string;
    industry?: string;
  };
  campaignId: string;
  campaignName?: string;
  productId?: string | null;
  onSend?: (data: { phone: string; message: string }) => void;
}
```

**Layout do Dialog:**

```
+------------------------------------------------------+
| ✕                                                     |
| Enviar WhatsApp                                       |
| Compor mensagem para [Lead Name]                      |
|                                                       |
| 📱 +55 11 99999-9999  |  Empresa: Acme Corp          |
| Cargo: CTO            |  Setor: Tecnologia            |
|                                                       |
| +----------------------------------------------------+|
| | Textarea para mensagem                             ||
| |                                                    ||
| |                                                    ||
| |                                                    ||
| +----------------------------------------------------+|
| 247 caracteres                            [ideal: ≤500]|
|                                                       |
| [Gerar com IA ✨]                                     |
|                                                       |
|                        [Cancelar]  [Enviar WhatsApp]  |
+------------------------------------------------------+
```

**Quando lead sem telefone:**

```
+------------------------------------------------------+
| ✕                                                     |
| Enviar WhatsApp                                       |
| Compor mensagem para [Lead Name]                      |
|                                                       |
| ⚠ Telefone nao disponivel                            |
|                                                       |
| +----------------------------------------------------+|
| | Textarea para mensagem                             ||
| +----------------------------------------------------+|
|                                                       |
| [Gerar com IA ✨]          [Copiar mensagem 📋]       |
|                                                       |
|                [Cancelar]  [Enviar WhatsApp] (disabled)|
+------------------------------------------------------+
```

### Imports Necessarios (todos ja instalados)

```typescript
// shadcn/ui
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

// Hooks do projeto (REUTILIZAR — zero mudancas)
import { useAIGenerate } from "@/hooks/use-ai-generate";
import { useKnowledgeBaseContext } from "@/hooks/use-knowledge-base-context";

// Utilidades
import { normalizeTemplateVariables } from "@/lib/ai/sanitize-ai-output";
import { cn } from "@/lib/utils";

// Icons (lucide-react)
import { MessageSquare, Copy, Sparkles, Send, AlertTriangle } from "lucide-react";
```

### Formatacao de Telefone

Telefones vem no formato E.164 do banco (ex: `"551199999999"`). O dialog deve exibir formatado:

```typescript
function formatPhone(phone: string): string {
  // Remove caracteres nao numericos
  const digits = phone.replace(/\D/g, "");

  // Formato brasileiro: +55 (11) 99999-9999
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  // Fallback: retorna como veio
  return phone;
}
```

Esta funcao pode ficar dentro do componente ou em um `utils` se necessario. NAO criar arquivo separado so para isso.

### Contador de Caracteres — Orientacao Visual

```typescript
function getCharCountColor(length: number): string {
  if (length === 0) return "text-muted-foreground";
  if (length <= 500) return "text-green-600 dark:text-green-400";
  if (length <= 1000) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}
```

**Nota:** Nao e um limite rigido (WhatsApp suporta ate ~65.536 chars), mas orientacao de boas praticas. Mensagens curtas tem taxa de resposta muito maior.

### Clipboard API — Copiar Mensagem

Para o cenario de lead sem telefone, usar `navigator.clipboard`:

```typescript
const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(message);
    toast.success("Mensagem copiada!");
  } catch {
    toast.error("Erro ao copiar mensagem");
  }
};
```

### Padrao de Toast (sonner)

[Source: src/components/builder/ExportDialog.tsx]

```typescript
import { toast } from "sonner";

// Sucesso
toast.success("Mensagem copiada!");

// Erro
toast.error("Erro ao gerar mensagem");
```

### Data-Testid Convention

Seguir o padrao do projeto:

```
"whatsapp-composer-dialog"
"whatsapp-lead-name"
"whatsapp-lead-phone"
"whatsapp-lead-company"
"whatsapp-lead-title"
"whatsapp-message-textarea"
"whatsapp-char-count"
"whatsapp-generate-ai-button"
"whatsapp-send-button"
"whatsapp-copy-button"
"whatsapp-no-phone-warning"
"whatsapp-ai-error"
"whatsapp-ai-generating"
```

### Project Structure Notes

- Componente: `src/components/tracking/WhatsAppComposerDialog.tsx` — novo arquivo na pasta tracking (onde esta OpportunityPanel)
- Prompt key: `src/types/ai-prompt.ts` — modificar `promptKeySchema` enum
- Prompt template: `src/lib/ai/prompts/defaults.ts` — adicionar `whatsapp_message_generation` ao `CODE_DEFAULT_PROMPTS`
- Testes: `__tests__/unit/components/tracking/WhatsAppComposerDialog.test.tsx` — novo arquivo
- **NAO** modificar `useAIGenerate`, `useKnowledgeBaseContext`, `sanitize-ai-output` — reutilizar como estao
- **NAO** modificar `OpportunityPanel` — a integracao do botao/trigger fica na story 11.4
- **NAO** criar server action ou API route de envio — fica na story 11.4
- **NAO** inserir dados no banco `whatsapp_messages` — fica na story 11.4
- **NAO** criar Zustand store — estado do dialog e local (useState)

### Padrao de Testes — Referencia

[Source: __tests__/unit/components/ — padrao do projeto]

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhatsAppComposerDialog } from "@/components/tracking/WhatsAppComposerDialog";

// Mocks
vi.mock("@/hooks/use-ai-generate", () => ({
  useAIGenerate: vi.fn(() => ({
    generate: vi.fn(),
    phase: "idle",
    text: "",
    error: null,
    reset: vi.fn(),
    cancel: vi.fn(),
    isGenerating: false,
  })),
}));

vi.mock("@/hooks/use-knowledge-base-context", () => ({
  useKnowledgeBaseContext: vi.fn(() => ({
    variables: {
      company_context: "TDEC Prospect",
      tone_style: "casual",
    },
    isLoading: false,
    hasExamples: false,
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Factory de props
const createDefaultProps = (overrides = {}) => ({
  open: true,
  onOpenChange: vi.fn(),
  lead: {
    firstName: "Joao",
    lastName: "Silva",
    phone: "551199999999",
    leadEmail: "joao@acme.com",
    companyName: "Acme Corp",
    title: "CTO",
    industry: "Tecnologia",
  },
  campaignId: "campaign-123",
  campaignName: "Campanha Q1",
  productId: "product-456",
  onSend: vi.fn(),
  ...overrides,
});

describe("WhatsAppComposerDialog", () => {
  describe("AC #1: Renderizacao com dados do lead", () => {
    it("exibe nome, telefone formatado, empresa e cargo do lead", () => { /* ... */ });
    it("renderiza Textarea para composicao", () => { /* ... */ });
    it("renderiza botao Gerar com IA", () => { /* ... */ });
    it("renderiza botao Enviar desabilitado quando mensagem vazia", () => { /* ... */ });
  });

  describe("AC #2: Composicao manual", () => {
    it("atualiza texto no textarea ao digitar", () => { /* ... */ });
    it("exibe contador de caracteres atualizado", () => { /* ... */ });
    it("habilita botao Enviar quando mensagem nao vazia", () => { /* ... */ });
    it("indica faixa verde ate 500 caracteres", () => { /* ... */ });
  });

  describe("AC #3: Geracao com IA", () => {
    it("chama generate com promptKey whatsapp_message_generation", () => { /* ... */ });
    it("passa variaveis do KB e dados do lead", () => { /* ... */ });
    it("passa productId da campanha", () => { /* ... */ });
  });

  // ... demais ACs
});
```

### Anti-Patterns a Evitar

1. **NAO** criar hook customizado para este dialog — `useAIGenerate()` + `useKnowledgeBaseContext()` ja existem
2. **NAO** criar server action de envio — escopo da story 11.4
3. **NAO** modificar OpportunityPanel — integracao do trigger fica na story 11.4
4. **NAO** usar `space-y-*` — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
5. **NAO** usar `console.log` — ESLint enforces no-console
6. **NAO** usar `any` — tipagem estrita em todos os tipos
7. **NAO** criar Zustand store para estado do dialog — useState local e suficiente
8. **NAO** esquecer `DialogDescription` — Radix Dialog exige para acessibilidade
9. **NAO** duplicar logica de sanitizacao — reutilizar `normalizeTemplateVariables()` de `sanitize-ai-output.ts`
10. **NAO** fazer fetch de dados do banco — dialog recebe tudo via props
11. **NAO** ignorar lead sem telefone — tratar com aviso visual e botao "Copiar"

### Dependencias Downstream

Esta story e FUNDACAO para:
- **11.4** (Envio Individual): Importa `WhatsAppComposerDialog`, passa `onSend` callback com logica Z-API real
- **11.5** (Busca Telefone): Pode passar telefone encontrado via SignalHire como prop ao dialog
- **11.6** (Envio em Massa): Reutiliza o prompt WhatsApp e possivelmente o layout do composer para preview

### Previous Story Intelligence (11.2)

**Learnings from Story 11.2:**
- Tabela `whatsapp_messages` criada com 12 colunas, RLS e indexes
- Tipos TypeScript: `WhatsAppMessage`, `WhatsAppMessageInsert`, `WhatsAppMessageUpdate`, `WhatsAppMessageStatus`
- `isValidWhatsAppMessageStatus()` type guard disponivel
- `WHATSAPP_MESSAGE_STATUSES` array const disponivel
- Padroes: `DO $$ block` para ENUM, `ON DELETE CASCADE` para FKs, trigger `updated_at`
- **BUG corrigido no code review**: `WhatsAppMessageInsert` tinha bug de intersection type no campo `status` opcional
- 232 test files, 4150 tests, 0 failures pos code review

### Previous Story Intelligence (11.1)

**Learnings from Story 11.1:**
- `ZApiService` em `src/lib/services/zapi.ts` — helpers `parseZApiCredentials()`, `buildZApiUrl()`, `buildZApiHeaders()`
- `ZApiCredentials` type: `{ instanceId, instanceToken, securityToken }`
- IntegrationCard multi-field via prop `fields` — backward compatible
- `encodeURIComponent()` em `buildZApiUrl` para defensive URL encoding
- Credenciais armazenadas como JSON criptografado em `api_configs`
- 44 testes adicionados, 231 files, 4110 tests pos code review

### Git Intelligence

**Branch:** `epic/11-whatsapp-integration`
**Commits recentes:**
- `9898abb feat(story-11.1): Z-API integration service + config + code review fixes`
- Story 11.2 tambem ja commitada (schema + tipos)

**Arquivos que esta story CRIA (novos):**
- `src/components/tracking/WhatsAppComposerDialog.tsx`
- `__tests__/unit/components/tracking/WhatsAppComposerDialog.test.tsx`

**Arquivos que esta story MODIFICA (existentes):**
- `src/types/ai-prompt.ts` — adicionar `"whatsapp_message_generation"` ao `promptKeySchema`
- `src/lib/ai/prompts/defaults.ts` — adicionar template do prompt WhatsApp ao `CODE_DEFAULT_PROMPTS`

### Componentes shadcn/ui Necessarios

Todos ja instalados:
- **Dialog**: `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle` de `@/components/ui/dialog`
- **Button**: `Button` de `@/components/ui/button`
- **Textarea**: `Textarea` de `@/components/ui/textarea`
- **Badge**: `Badge` de `@/components/ui/badge`

### Icones (lucide-react)

Usar icones ja disponiveis no projeto:
- `MessageSquare` — icone do dialog (ou nao usar icone no titulo)
- `Copy` — botao copiar mensagem
- `Sparkles` — botao Gerar com IA (padrao do projeto)
- `Send` — botao Enviar
- `AlertTriangle` — aviso de telefone indisponivel

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-10.md#Stories de Alto Nivel] — Definicao da story 11.3
- [Source: _bmad-output/implementation-artifacts/11-2-schema-whatsapp-messages-tipos.md] — Schema e tipos WhatsApp (story anterior)
- [Source: _bmad-output/implementation-artifacts/11-1-zapi-integration-service-config.md] — ZApiService e credenciais (story anterior)
- [Source: src/components/builder/EmailBlock.tsx] — Padrao de AI generation com useAIGenerate()
- [Source: src/hooks/use-ai-generate.ts] — Hook de geracao AI com streaming SSE
- [Source: src/hooks/use-knowledge-base-context.ts] — Hook de contexto KB
- [Source: src/lib/ai/prompts/defaults.ts] — Padrao de prompt templates (CODE_DEFAULT_PROMPTS)
- [Source: src/types/ai-prompt.ts:171-181] — PromptKey schema (onde adicionar novo key)
- [Source: src/lib/ai/sanitize-ai-output.ts] — normalizeTemplateVariables() para output cleanup
- [Source: src/components/builder/ExportDialog.tsx] — Padrao de Dialog com toast notifications
- [Source: src/components/tracking/OpportunityPanel.tsx] — Componente que vai integrar o dialog (story 11.4)
- [Source: src/types/tracking.ts] — OpportunityLead type com campo phone
- [Source: src/types/campaign.ts] — Campaign.productId para contexto de produto
- [Source: src/types/product.ts] — Product type para AI context injection

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- 3 test fixes applied: phone format assertion (12 vs 13 digits), dialog title duplicate match (getByRole), clipboard mock (Object.defineProperty)
- Pre-existing TS errors in mock-data.ts, mock-supabase.ts unrelated to story changes

### Completion Notes List

- Task 1: Added `whatsapp_message_generation` to `PromptKey` union type, `PROMPT_KEYS` array, `promptKeySchema` Zod enum, `AIPromptKey` type in hook, and `CODE_DEFAULT_PROMPTS` with full Brazilian WhatsApp-specific prompt template (300 max tokens, 0.7 temperature)
- Task 2: Created `WhatsAppComposerDialog` component with all AC requirements — lead info display, phone formatting (E.164), manual composition with character counter (green/yellow/red), AI generation via `useAIGenerate()` with streaming, KB context via `useKnowledgeBaseContext()`, no-phone mode with copy button, DialogDescription accessibility
- Task 3: Exported component from `src/components/tracking/index.ts` barrel file
- Task 4: 60 unit tests covering all 8 ACs. Updated existing `ai-prompt.test.ts` PROMPT_KEYS length assertion (9 → 10). Full regression: 233 files, 4210 tests, 0 failures

### Change Log

- 2026-02-10: Story 11.3 implemented — WhatsApp composer dialog with AI generation, manual composition, character counter, phone formatting, no-phone fallback. 60 tests added.
- 2026-02-10: Code review fixes — H1: handleGenerateAI preserva texto anterior em caso de erro (AC #5), M1: dialog aborta request ao fechar, H2: teste AC #5 reescrito com fluxo real, H3: arrays ai-prompt.test.ts completados, M2: AIPromptKey derivado de PromptKey

### File List

- `src/types/ai-prompt.ts` — modified (added `whatsapp_message_generation` to PromptKey, PROMPT_KEYS, promptKeySchema)
- `src/hooks/use-ai-generate.ts` — modified (AIPromptKey now derives from PromptKey, import added)
- `src/lib/ai/prompts/defaults.ts` — modified (added whatsapp_message_generation prompt template to CODE_DEFAULT_PROMPTS)
- `src/components/tracking/WhatsAppComposerDialog.tsx` — new (dialog component, code review: try/catch + cancelAI on close)
- `src/components/tracking/index.ts` — modified (added WhatsAppComposerDialog export)
- `__tests__/unit/components/tracking/WhatsAppComposerDialog.test.tsx` — new (60 tests, code review: AC #5 test rewritten)
- `__tests__/unit/types/ai-prompt.test.ts` — modified (expectedKeys + keys arrays updated to 10)
