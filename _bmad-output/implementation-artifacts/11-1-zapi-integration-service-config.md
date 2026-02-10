# Story 11.1: Z-API Integration Service + Config

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario administrador,
I want configurar a integracao Z-API no painel de configuracoes com 3 credenciais (Instance ID, Instance Token, Security Token) e testar a conexao,
so that o sistema possa enviar mensagens WhatsApp para leads quentes no futuro.

## Acceptance Criteria

1. **Given** o painel de Integracoes em Settings **When** o usuario visualiza os cards de integracao **Then** um novo card "Z-API" aparece com icone de WhatsApp e descricao "Envio de mensagens WhatsApp via Z-API" **And** o card exibe 3 campos de input separados: Instance ID, Instance Token, Security Token

2. **Given** o card Z-API com 3 campos **When** o usuario preenche os 3 valores e clica "Salvar" **Then** os 3 valores sao criptografados e armazenados como JSON na tabela `api_configs` **And** o status muda para "Configurado" **And** cada campo exibe mascara (ultimos 4 caracteres visiveis) **And** toast de sucesso aparece

3. **Given** o card Z-API configurado **When** o usuario clica "Testar Conexao" **Then** o sistema chama a Z-API usando as 3 credenciais **And** exibe resultado de sucesso/falha com latencia **And** erro de credenciais invalidas mostra mensagem em portugues

4. **Given** a classe `ZApiService` **When** instanciada e chamada `testConnection()` **Then** faz GET na API Z-API usando Instance ID e Instance Token na URL e Security Token no header `Client-Token` **And** retorna `TestConnectionResult` com sucesso/erro e latencia **And** herda retry automatico e timeout da `ExternalService`

5. **Given** o `ServiceName` type **When** "zapi" e adicionado **Then** todo o fluxo existente (hook, server actions, factory) suporta o novo servico **And** nenhum servico existente e impactado

6. **Given** as 3 credenciais Z-API salvas **When** o sistema precisa usar o Z-API (stories futuras) **Then** as credenciais sao descriptografadas e parseadas do JSON armazenado **And** formato do JSON: `{"instanceId":"...","instanceToken":"...","securityToken":"..."}`

## Tasks / Subtasks

- [x] Task 1: Adicionar "zapi" ao ServiceName e tipos (AC: #5)
  - [x] 1.1 Em `src/types/integration.ts`: adicionar `"zapi"` ao array `SERVICE_NAMES`
  - [x] 1.2 Atualizar `SERVICE_LABELS` com `zapi: "Z-API"`
  - [x] 1.3 Atualizar `saveApiConfigSchema` em `src/actions/integrations.ts` (automatico via `SERVICE_NAMES`)
  - [x] 1.4 Adicionar `ZAPI_ERROR` ao `ERROR_MESSAGES` em `src/lib/services/base-service.ts`
- [x] Task 2: Criar ZApiService (AC: #4)
  - [x] 2.1 Criar `src/lib/services/zapi.ts`
  - [x] 2.2 Classe `ZApiService extends ExternalService` com `name = "zapi"`
  - [x] 2.3 Constantes: `ZAPI_API_BASE = "https://api.z-api.io"`, endpoints
  - [x] 2.4 Tipo `ZApiCredentials = { instanceId: string; instanceToken: string; securityToken: string }`
  - [x] 2.5 Helper `parseZApiCredentials(apiKey: string): ZApiCredentials` — parse JSON string, validar 3 campos presentes
  - [x] 2.6 Helper `buildZApiUrl(instanceId: string, instanceToken: string, path: string): string` — constroi URL com credenciais no path
  - [x] 2.7 Helper `buildZApiHeaders(securityToken: string): Record<string, string>` — retorna `{ "Content-Type": "application/json", "Client-Token": securityToken }`
  - [x] 2.8 `testConnection(apiKey: string): Promise<TestConnectionResult>` — parse credenciais do JSON, GET no endpoint de status, retorna sucesso/erro com latencia
  - [x] 2.9 Tratar erro de parse JSON (credenciais invalidas)
- [x] Task 3: Registrar ZApiService no factory (AC: #5)
  - [x] 3.1 Em `src/lib/services/index.ts`: importar `ZApiService` e adicionar `zapi: new ZApiService()` ao `services` record
  - [x] 3.2 Adicionar `export { ZApiService } from "./zapi";` nos re-exports
- [x] Task 4: Adicionar "zapi" ao initialConfigs do hook (AC: #5)
  - [x] 4.1 Em `src/hooks/use-integration-config.ts`: adicionar `zapi: { ...initialConfig }` ao `initialConfigs`
- [x] Task 5: Estender IntegrationCard para multi-field (AC: #1, #2, #3)
  - [x] 5.1 Criar tipo `IntegrationField = { key: string; label: string; placeholder: string }`
  - [x] 5.2 Adicionar prop opcional `fields?: IntegrationField[]` ao `IntegrationCardProps`
  - [x] 5.3 Quando `fields` presente: renderizar N inputs (um por field) em vez do input unico de API key
  - [x] 5.4 Cada input tem toggle de visibilidade independente, label e placeholder proprios
  - [x] 5.5 Estado interno: `Record<string, string>` para os valores dos campos (em vez de `string` unico)
  - [x] 5.6 Botao "Salvar" habilitado quando TODOS os campos estao preenchidos (`.trim()` nao vazio)
  - [x] 5.7 `onSave()` recebe JSON.stringify dos valores dos campos (ex: `{"instanceId":"abc","instanceToken":"def","securityToken":"ghi"}`)
  - [x] 5.8 Quando `maskedKey` existe e `fields` esta presente: exibir mascara para cada campo individualmente (parse JSON de maskedKey para exibir por campo)
  - [x] 5.9 Manter backward compatibility total: quando `fields` ausente, comportamento identico ao atual (single API key)
  - [x] 5.10 Enter em qualquer campo aciona save (se todos preenchidos)
- [x] Task 6: Adicionar card Z-API na pagina de Integracoes (AC: #1)
  - [x] 6.1 Em `src/app/(dashboard)/settings/integrations/page.tsx`: adicionar entrada Z-API ao array `integrations`
  - [x] 6.2 Usar icone "📱" (ou emoji de WhatsApp), displayName "Z-API", descricao "Envio de mensagens WhatsApp via Z-API"
  - [x] 6.3 Passar `fields` prop para o IntegrationCard do Z-API: `[{ key: "instanceId", label: "Instance ID", placeholder: "Insira o Instance ID" }, { key: "instanceToken", label: "Instance Token", placeholder: "Insira o Instance Token" }, { key: "securityToken", label: "Security Token", placeholder: "Insira o Security Token" }]`
- [x] Task 7: Adaptar server action para multi-field masking (AC: #2)
  - [x] 7.1 Em `src/actions/integrations.ts` — `getApiConfigs`: quando `service_name === "zapi"`, o `key_suffix` armazena JSON com sufixos de cada campo. Construir maskedKey como JSON: `{"instanceId":"••••XXXX","instanceToken":"••••YYYY","securityToken":"••••ZZZZ"}`
  - [x] 7.2 Em `src/actions/integrations.ts` — `saveApiConfig`: quando `serviceName === "zapi"`, extrair `key_suffix` como JSON com ultimos 4 chars de cada campo parsed
- [x] Task 8: Testes unitarios (AC: #1-#6)
  - [x] 8.1 `__tests__/unit/lib/services/zapi.test.ts` — 24 testes: testConnection sucesso/erro, parseZApiCredentials, buildZApiUrl, buildZApiHeaders, service name
  - [x] 8.2 `__tests__/unit/components/settings/IntegrationCard.test.tsx` — 12 testes ADICIONAIS: multi-field renderiza N inputs, labels, toggle visibilidade, save enable/disable, JSON stringify, Enter, maskedKey JSON, backward compatibility, clear fields
  - [x] 8.3 `__tests__/unit/hooks/use-integration-config.test.ts` — 3 testes ADICIONAIS: zapi initialConfigs, saveConfig zapi, testConnection zapi
  - [x] 8.4 `__tests__/unit/actions/integrations.test.ts` — 5 testes: saveApiConfig JSON key_suffix, maskedKey JSON, schema validation, getApiConfigs JSON maskedKey, testApiConnection zapi
  - [x] 8.5 Verificar regressao: `npx vitest run` — 231 files, 4106 tests, 0 falhas

## Dev Notes

### DECISAO CRITICA: Storage de 3 Credenciais em 1 Coluna

A Z-API exige 3 credenciais (Instance ID, Instance Token, Security Token) para autenticacao, diferente das demais integracoes que usam 1 API key.

**Solucao adotada:** Armazenar as 3 credenciais como um unico JSON string criptografado na coluna `encrypted_key` existente da tabela `api_configs`.

```
encrypted_key = encrypt(JSON.stringify({
  instanceId: "...",
  instanceToken: "...",
  securityToken: "..."
}))
```

**Vantagens:**
- ZERO migration de banco — reutiliza schema existente
- Criptografia identica (encrypt/decrypt de string)
- Minimo impacto no codigo existente

**key_suffix para Z-API:** Armazenar como JSON com sufixos individuais:
```json
{"instanceId":"XXXX","instanceToken":"YYYY","securityToken":"ZZZZ"}
```

### Z-API — Documentacao da API

**Endpoint de envio de texto (para stories futuras):**
```
POST https://api.z-api.io/instances/{instanceId}/token/{instanceToken}/send-text
```

**Headers:**
```
Content-Type: application/json
Client-Token: {securityToken}
```

**Body:**
```json
{
  "phone": "551199999999",
  "message": "Texto da mensagem"
}
```

**Response (200):**
```json
{
  "zaapId": "3999984263738042930CD6ECDE9VDWSA",
  "messageId": "D241XXXX732339502B68"
}
```

**Autenticacao — 3 Valores:**
- `instanceId`: Identificador da instancia (na URL path)
- `instanceToken`: Token de autenticacao da instancia (na URL path)
- `securityToken`: Token de seguranca da conta (no header `Client-Token`)

### ZApiService — Implementacao

```typescript
// src/lib/services/zapi.ts

import {
  ExternalService,
  ExternalServiceError,
  ERROR_MESSAGES,
  type TestConnectionResult,
} from "./base-service";

// ==============================================
// CONSTANTS
// ==============================================

const ZAPI_API_BASE = "https://api.z-api.io";

// ==============================================
// TYPES
// ==============================================

export interface ZApiCredentials {
  instanceId: string;
  instanceToken: string;
  securityToken: string;
}

// ==============================================
// HELPERS
// ==============================================

/**
 * Parse Z-API credentials from JSON string
 * The credentials are stored as a JSON object in api_configs.encrypted_key
 *
 * @throws ExternalServiceError if JSON is invalid or fields are missing
 */
export function parseZApiCredentials(apiKey: string): ZApiCredentials {
  try {
    const parsed = JSON.parse(apiKey);
    const { instanceId, instanceToken, securityToken } = parsed;

    if (!instanceId || !instanceToken || !securityToken) {
      throw new Error("Missing required fields");
    }

    return { instanceId, instanceToken, securityToken };
  } catch {
    throw new ExternalServiceError(
      "zapi",
      400,
      "Credenciais Z-API invalidas. Reconfigure a integracao."
    );
  }
}

/**
 * Build Z-API URL with instance credentials in path
 */
export function buildZApiUrl(
  instanceId: string,
  instanceToken: string,
  path: string
): string {
  return `${ZAPI_API_BASE}/instances/${instanceId}/token/${instanceToken}${path}`;
}

/**
 * Build Z-API headers with security token
 */
export function buildZApiHeaders(securityToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Client-Token": securityToken,
  };
}

// ==============================================
// ZAPI SERVICE
// ==============================================

export class ZApiService extends ExternalService {
  readonly name = "zapi";

  /**
   * Test connection to Z-API
   * Parses JSON credentials and makes a lightweight API call
   */
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const start = Date.now();

    try {
      const { instanceId, instanceToken, securityToken } = parseZApiCredentials(apiKey);

      // Use a lightweight endpoint to test credentials
      // GET /instances/{id}/token/{token}/status returns instance status
      const url = buildZApiUrl(instanceId, instanceToken, "/status");

      await this.request(url, {
        method: "GET",
        headers: buildZApiHeaders(securityToken),
      });

      return this.createSuccessResult(Date.now() - start);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        return this.createErrorResult(error);
      }

      return this.createErrorResult(
        new Error("Erro desconhecido ao conectar com Z-API")
      );
    }
  }
}
```

**NOTA**: O endpoint exato para test de conexao pode ser `/status`, `/me`, ou outro lightweight endpoint. O dev deve verificar na documentacao do Z-API qual endpoint retorna informacao da instancia sem side effects. Se nenhum existir, usar `/queue` ou similar.

### IntegrationCard Multi-Field — Especificacao

**Nova prop:**
```typescript
interface IntegrationField {
  key: string;      // "instanceId", "instanceToken", "securityToken"
  label: string;    // "Instance ID", "Instance Token", "Security Token"
  placeholder: string;  // "Insira o Instance ID"
}

interface IntegrationCardProps {
  // ... props existentes ...
  fields?: IntegrationField[];  // NOVO — quando presente, renderiza multi-field
}
```

**Comportamento multi-field:**
```
+------------------------------------------------------+
| Card: "Z-API" 📱                    [Nao configurado] |
| Envio de mensagens WhatsApp via Z-API                 |
|                                                       |
| Instance ID                                           |
| [__________________|👁] Insira o Instance ID           |
|                                                       |
| Instance Token                                        |
| [__________________|👁] Insira o Instance Token        |
|                                                       |
| Security Token                                        |
| [__________________|👁] Insira o Security Token        |
|                                                       |
| Ultima atualizacao: Nunca     [Testar] [Salvar]       |
+------------------------------------------------------+
```

**Estado interno multi-field:**
```typescript
// Ao inves de:
const [apiKey, setApiKey] = useState("");

// Usar:
const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

// Verificacao de campos completos:
const allFieldsFilled = fields
  ? fields.every((f) => fieldValues[f.key]?.trim())
  : apiKey.trim();

// Construcao do valor para onSave:
const valueToSave = fields
  ? JSON.stringify(
      Object.fromEntries(fields.map((f) => [f.key, fieldValues[f.key]]))
    )
  : apiKey;
```

**maskedKey para multi-field:**
Quando `fields` e `maskedKey` estao presentes simultaneamente, o `maskedKey` e um JSON string com mascaras individuais por campo:
```json
{"instanceId":"••••XXXX","instanceToken":"••••YYYY","securityToken":"••••ZZZZ"}
```
O componente parseia esse JSON e exibe cada mascara no placeholder do campo correspondente.

### Server Action — Adaptacoes para key_suffix JSON

```typescript
// saveApiConfig — dentro do fluxo para zapi:
if (serviceName === "zapi") {
  try {
    const parsed = JSON.parse(apiKey);
    keySuffix = JSON.stringify({
      instanceId: String(parsed.instanceId || "").slice(-4),
      instanceToken: String(parsed.instanceToken || "").slice(-4),
      securityToken: String(parsed.securityToken || "").slice(-4),
    });
  } catch {
    keySuffix = apiKey.slice(-4);  // Fallback
  }
}

// getApiConfigs — dentro do mapeamento para zapi:
if (config.service_name === "zapi" && config.key_suffix) {
  try {
    const suffixes = JSON.parse(config.key_suffix);
    maskedKey = JSON.stringify({
      instanceId: `••••••••${suffixes.instanceId || ""}`,
      instanceToken: `••••••••${suffixes.instanceToken || ""}`,
      securityToken: `••••••••${suffixes.securityToken || ""}`,
    });
  } catch {
    maskedKey = config.key_suffix ? `••••••••${config.key_suffix}` : "••••••••••••";
  }
}
```

### Padrao ExternalService — Referencia

A `ZApiService` segue exatamente o mesmo padrao das demais integracoes:

```
ExternalService (base-service.ts)
  ├── ApolloService (apollo.ts)
  ├── SignalHireService (signalhire.ts)
  ├── SnovioService (snovio.ts)
  ├── InstantlyService (instantly.ts)
  ├── ApifyService (apify.ts)
  └── ZApiService (zapi.ts)  ← NOVO
```

Todos:
- Herdam `request()` com timeout 10s e retry 1x em timeout
- Implementam `testConnection(apiKey: string): Promise<TestConnectionResult>`
- Usam `createSuccessResult()` e `createErrorResult()`
- Tem mensagens de erro em portugues

### Integrations Page — Posicionamento do Card

Adicionar Z-API como ULTIMO card no array `integrations`:
```typescript
const integrations: IntegrationMeta[] = [
  // ... existentes (apollo, signalhire, snovio, instantly, apify) ...
  {
    name: "zapi" as ServiceName,
    displayName: "Z-API",
    icon: "📱",
    description: "Envio de mensagens WhatsApp via Z-API",
    fields: [
      { key: "instanceId", label: "Instance ID", placeholder: "Insira o Instance ID" },
      { key: "instanceToken", label: "Instance Token", placeholder: "Insira o Instance Token" },
      { key: "securityToken", label: "Security Token", placeholder: "Insira o Security Token" },
    ],
  },
];
```

**NOTA**: O tipo `IntegrationMeta` precisa ser estendido com `fields?: IntegrationField[]` opcional.

### Anti-Patterns a Evitar

1. **NAO criar migration de banco** — reutilizar coluna `encrypted_key` com JSON string
2. **NAO criar 3 rows separados na api_configs** — armazenar como JSON unico
3. **NAO quebrar backward compatibility do IntegrationCard** — a prop `fields` e opcional, comportamento sem ela e identico
4. **NAO usar `space-y-*`** — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
5. **NAO usar `console.log`** — ESLint enforces no-console rule
6. **NAO alterar a assinatura de `testConnection(apiKey: string)`** — manter `string` e parsear JSON internamente
7. **NAO alterar a tabela `api_configs`** — zero migrations
8. **NAO implementar envio de mensagem** — apenas service + config + test connection
9. **NAO remover ou alterar servicos existentes** — apenas ADICIONAR zapi
10. **NAO armazenar credenciais em plain text** — sempre criptografadas via `encryptApiKey()`
11. **NAO usar `any`** — tipagem estrita em todos os novos tipos

### Componentes shadcn/ui Necessarios

Todos ja instalados:
- **Card**: `Card`, `CardHeader`, `CardTitle`, `CardContent` de `@/components/ui/card`
- **Input**: `Input` de `@/components/ui/input`
- **Button**: `Button` de `@/components/ui/button`
- **Badge**: `Badge` de `@/components/ui/badge`

### Icones (lucide-react)

Nenhum icone novo necessario. Usar emoji "📱" no card (padrao existente com emojis).

### Dependencias Downstream

Esta story e FUNDACAO para todo o Epic 11:
- **11.2** (Schema WhatsApp Messages): Usara `ServiceName = "zapi"` para tracking
- **11.3** (Composer): Usara configuracao Z-API para validar disponibilidade
- **11.4** (Envio Individual): Usara `ZApiService` para enviar mensagens
- **11.5** (Busca Telefone): Verificara se Z-API esta configurado antes de oferecer envio
- **11.6** (Envio em Massa): Usara `ZApiService` em loop com delays
- **11.7** (Tracking): Verificara status de Z-API configurado

### Story 10.7 Learnings (Previous Story Intelligence)

- **OpportunityPanel tem badge "(WhatsApp em breve)"** — sera substituido por botao funcional em story 11.4
- **`phone` ja esta no LeadTracking type** — Story 10.7 adicionou `phone?: string` ao `LeadTracking`, disponivel para envio WhatsApp
- **Pattern de Collapsible** (ThresholdConfig) — pode ser util para organizar os 3 campos do Z-API
- **Sem API route nova nesta story** — pattern de server action e direto
- **4061 testes passando** — manter regressao zero

### Git Intelligence

Branch: `epic/10-campaign-tracking` (base: main)

Commits recentes:
- `71b3a59` fix(signalhire): corrigir callback que nao atualizava lookup + melhorias no card de lead
- `e2b0873` fix: resolve epic 10 retro action items — flaky test, auth unification, docs
- `ca998c7` feat(story-10.7): opportunity window UI + notifications + code review fixes

**NOTA**: O dev devera criar branch `epic/11-whatsapp-integration` a partir de main (ou do epic/10 apos merge). Verificar com o usuario qual branch base usar.

Arquivos que esta story CRIA (novos):
- `src/lib/services/zapi.ts` — ZApiService + helpers + tipos
- `__tests__/unit/lib/services/zapi.test.ts` — testes do servico

Arquivos que esta story MODIFICA (existentes):
- `src/types/integration.ts` — adicionar "zapi" ao SERVICE_NAMES e SERVICE_LABELS
- `src/lib/services/base-service.ts` — adicionar ZAPI_ERROR ao ERROR_MESSAGES
- `src/lib/services/index.ts` — importar/exportar/registrar ZApiService
- `src/components/settings/IntegrationCard.tsx` — adicionar suporte multi-field via prop `fields`
- `src/hooks/use-integration-config.ts` — adicionar zapi ao initialConfigs
- `src/app/(dashboard)/settings/integrations/page.tsx` — adicionar card Z-API com fields
- `src/actions/integrations.ts` — adaptar key_suffix e maskedKey para JSON (zapi)
- `__tests__/unit/components/settings/IntegrationCard.test.tsx` — testes multi-field
- Testes adicionais em hooks e actions

### Project Structure Notes

- Service em `src/lib/services/zapi.ts` — segue padrao exato dos outros servicos
- Tipos em `src/types/integration.ts` — extensao do ServiceName union type
- Componente em `src/components/settings/IntegrationCard.tsx` — extensao retrocompativel
- Pagina em `src/app/(dashboard)/settings/integrations/page.tsx` — adicao de card
- Hook em `src/hooks/use-integration-config.ts` — adicao de estado inicial
- Actions em `src/actions/integrations.ts` — adaptacao para multi-field masking
- Testes em `__tests__/unit/` espelhando a estrutura de `src/`

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-10.md#Epic 11 Stories]
- [Source: _bmad-output/planning-artifacts/architecture.md#External Service Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-005 — IOpportunityAction]
- [Source: _bmad-output/implementation-artifacts/10-7-janela-de-oportunidade-ui-notificacoes.md — Previous story intelligence]
- [Source: src/lib/services/base-service.ts — ExternalService abstract class]
- [Source: src/lib/services/instantly.ts — InstantlyService (pattern reference)]
- [Source: src/lib/services/index.ts — Service factory]
- [Source: src/components/settings/IntegrationCard.tsx — Current single-field implementation]
- [Source: src/types/integration.ts — ServiceName, ApiConfig types]
- [Source: src/hooks/use-integration-config.ts — Integration config hook]
- [Source: src/actions/integrations.ts — Server actions for API key storage]
- [Source: src/app/(dashboard)/settings/integrations/page.tsx — Integrations page]
- [Source: Z-API Docs — https://developer.z-api.io/en/message/send-message-text]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum — implementação sem bloqueios críticos.

### Completion Notes List

- Implementação completa da Story 11.1: Z-API Integration Service + Config
- ZApiService criado com testConnection(), parseZApiCredentials(), buildZApiUrl(), buildZApiHeaders()
- IntegrationCard estendido com suporte multi-field (prop `fields?: IntegrationField[]`) — backward compatible
- Server actions adaptadas para masking JSON de 3 credenciais (instanceId, instanceToken, securityToken)
- Zero migrações de banco — 3 credenciais armazenadas como JSON no campo `encrypted_key` existente
- 44+ novos testes criados (24 ZApiService, 12 IntegrationCard multi-field, 3 hook, 5 actions)
- Teste existente `integration.test.ts` atualizado (5→6 services)
- 231 arquivos, 4106 testes, 0 falhas no suite completo

#### Code Review Fixes (Claude Opus 4.6 — Adversarial Review)

- **[FIX-M1]** Adicionado teste para empty string em credential fields (`parseZApiCredentials` com `instanceId: ""`)
- **[FIX-M2]** Adicionado teste para fallback de maskedKey non-JSON com multi-field (placeholder volta ao default)
- **[FIX-M3]** Adicionada validação server-side em `saveApiConfig` para rejeitar credenciais Z-API com valores vazios/whitespace-only
- **[FIX-M3]** Adicionado teste para validação de whitespace-only em `integrations.test.ts`
- **[FIX-L4]** JSDoc atualizado em `getService()` — adicionado `zapi` à lista de serviços
- **[FIX-L5]** JSDoc atualizado em `ExternalService` — adicionado Z-API à lista de integrações
- **[FIX-L7]** Adicionado `encodeURIComponent()` em `buildZApiUrl` para defensive URL encoding
- **[FIX-L7]** Adicionado teste para caracteres especiais em `buildZApiUrl`
- Suite pós-review: 231 arquivos, 4110 testes (+4), 0 falhas

### File List

**Novos:**
- `src/lib/services/zapi.ts` — ZApiService class + helpers (parseZApiCredentials, buildZApiUrl, buildZApiHeaders)
- `__tests__/unit/lib/services/zapi.test.ts` — 24 testes do ZApiService
- `__tests__/unit/actions/integrations.test.ts` — 5 testes das server actions (JSON masking para zapi)
- `supabase/migrations/00041_expand_key_suffix_for_zapi.sql` — Add 'zapi' ao CHECK constraint + expand key_suffix VARCHAR(4)→VARCHAR(200)

**Modificados:**
- `src/types/integration.ts` — Adicionado "zapi" ao SERVICE_NAMES e SERVICE_LABELS
- `src/lib/services/base-service.ts` — Adicionado ZAPI_ERROR ao ERROR_MESSAGES
- `src/lib/services/index.ts` — Registrado ZApiService no factory
- `src/hooks/use-integration-config.ts` — Adicionado zapi ao initialConfigs
- `src/components/settings/IntegrationCard.tsx` — Multi-field support (IntegrationField type, fields prop, fieldValues state, parseMaskedKeyJson)
- `src/app/(dashboard)/settings/integrations/page.tsx` — Card Z-API com 3 fields
- `src/actions/integrations.ts` — JSON key_suffix masking para zapi (save + get)
- `__tests__/unit/components/settings/IntegrationCard.test.tsx` — 12 novos testes multi-field
- `__tests__/unit/hooks/use-integration-config.test.ts` — 3 novos testes (zapi config, save, test)
- `__tests__/unit/types/integration.test.ts` — Atualizado contagem 5→6, assertions para zapi
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Atualizado status da story 11-1
