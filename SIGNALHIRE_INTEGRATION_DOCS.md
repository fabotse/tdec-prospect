# Documentação da Integração com Signal Hire

Este documento descreve como funciona a integração com o Signal Hire para busca de telefones via LinkedIn.

---

## 1. Visão Geral

A integração usa um **modelo assíncrono com polling** porque o Signal Hire não retorna os dados imediatamente. O fluxo é:

1. Enviamos uma requisição para o Signal Hire com uma **callback URL**
2. O Signal Hire retorna apenas um `requestId`
3. Fazemos **polling** no nosso banco para verificar o status
4. Quando o Signal Hire termina de processar, ele faz um **POST para o nosso webhook**
5. O webhook atualiza o banco de dados com os telefones encontrados
6. O polling detecta a mudança e retorna os dados para o frontend

---

## 2. Fluxo Completo (Diagrama)

```
USUÁRIO CLICA EM "BUSCAR TELEFONE"
         │
         ▼
┌─────────────────────────────────────┐
│  Frontend: Valida URL do LinkedIn   │
│  Chama Edge Function: signalhire-search
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Edge Function: signalhire-search   │
│  1. Verifica autenticação           │
│  2. Decide qual API Key usar        │
│  3. Verifica créditos (se pago)     │
│  4. POST → Signal Hire API          │
│  5. Salva no DB (status: pending)   │
│  6. Retorna searchId                │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Frontend: Inicia POLLING           │
│  A cada 1 segundo, chama:           │
│  signalhire-check-status            │
│  (até 60 tentativas = 1 minuto)     │
└─────────────────────────────────────┘
         │                    │
         │                    ▼
         │    ┌───────────────────────────────┐
         │    │  Signal Hire processa...      │
         │    │  (pode levar segundos)        │
         │    │                               │
         │    │  Quando pronto:               │
         │    │  POST → nosso webhook         │
         │    └───────────────────────────────┘
         │                    │
         │                    ▼
         │    ┌───────────────────────────────┐
         │    │  Webhook: signalhire-webhook  │
         │    │  1. Recebe Request-Id header  │
         │    │  2. Busca registro no DB      │
         │    │  3. Extrai telefones          │
         │    │  4. Atualiza DB (completed)   │
         │    │  5. Retorna 200 OK            │
         │    └───────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Polling detecta status: completed  │
│  Retorna telefones para o frontend  │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Frontend exibe lista de telefones  │
│  Usuário seleciona um               │
└─────────────────────────────────────┘
```

---

## 3. Chamada ao Signal Hire (Endpoint de Busca)

### Request

```http
POST https://www.signalhire.com/api/v1/candidate/search
Content-Type: application/json
apikey: {SUA_API_KEY}

{
  "items": ["https://linkedin.com/in/username"],
  "callbackUrl": "https://{SEU_SUPABASE_URL}/functions/v1/signalhire-webhook"
}
```

### Response (201 Created)

```json
{
  "requestId": 12345
}
```

**IMPORTANTE:** O Signal Hire NÃO retorna os telefones nesta chamada! Ele apenas retorna um `requestId` e vai processar de forma assíncrona. Os dados virão via callback.

---

## 4. O Callback/Webhook

### 4.1 URL do Webhook

```
https://{SEU_SUPABASE_URL}/functions/v1/signalhire-webhook
```

Esta URL é passada no campo `callbackUrl` quando fazemos a busca.

### 4.2 O que o Signal Hire envia para o Webhook

```http
POST /functions/v1/signalhire-webhook
Headers:
  Request-Id: 12345  ← MESMO requestId que você recebeu na busca
  Content-Type: application/json

Body:
[
  {
    "item": "https://linkedin.com/in/username",
    "status": "success",
    "candidate": {
      "uid": "unique-id",
      "fullName": "João Silva",
      "contacts": [
        {
          "type": "phone",
          "value": "5511999999999",
          "rating": "high",
          "subType": "mobile"
        },
        {
          "type": "email",
          "value": "joao@email.com",
          "rating": "medium"
        }
      ]
    }
  }
]
```

### 4.3 Possíveis Status no Callback

| Status | Significado |
|--------|-------------|
| `success` | Encontrou dados do candidato |
| `failed` | Falha na busca |
| `credits_are_over` | Créditos da API Key acabaram |
| `timeout_exceeded` | Timeout na busca |
| `duplicate_query` | Busca duplicada recente |

### 4.4 Como processar o Webhook

```typescript
// Pseudocódigo do webhook
export async function handleWebhook(request) {
  // 1. Pega o Request-Id do header (OBRIGATÓRIO)
  const requestId = request.headers.get("Request-Id");

  if (!requestId) {
    return new Response("Request-Id header required", { status: 400 });
  }

  // 2. Pega o body
  const results = await request.json();

  // 3. Para cada resultado
  for (const result of results) {
    // 4. Busca o registro no banco pelo requestId
    const search = await db
      .from("signalhire_searches")
      .select("*")
      .eq("request_id", requestId)
      .eq("linkedin_url", result.item)
      .single();

    if (!search) continue;

    // 5. Extrai os telefones
    const phones = result.candidate?.contacts
      ?.filter(c => c.type === "phone")
      ?.map(c => ({
        number: c.value,
        type: c.subType,
        rating: c.rating
      })) || [];

    // 6. Atualiza o registro no banco
    await db
      .from("signalhire_searches")
      .update({
        status: result.status === "success" ? "completed" : "failed",
        result: { phones },
        error: result.error || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", search.id);
  }

  // 7. SEMPRE retorna 200 (importante para não reenviar)
  return new Response("OK", { status: 200 });
}
```

---

## 5. O Polling (Check Status)

Enquanto o Signal Hire processa, o frontend faz polling para verificar se já temos resultado:

### Request

```http
POST https://{SEU_SUPABASE_URL}/functions/v1/signalhire-check-status
Content-Type: application/json
Authorization: Bearer {USER_TOKEN}

{
  "searchId": "uuid-da-busca"
}
```

### Response

```json
{
  "status": "pending" | "completed" | "failed",
  "result": {
    "phones": [
      {
        "number": "5511999999999",
        "type": "mobile",
        "rating": "high"
      }
    ]
  },
  "error": null
}
```

### Lógica do Polling no Frontend

```typescript
async function searchWithPolling(linkedinUrl: string): Promise<Phone[]> {
  // 1. Inicia a busca
  const { searchId } = await startSearch(linkedinUrl);

  // 2. Polling
  const maxAttempts = 60;
  const intervalMs = 1000;

  for (let i = 0; i < maxAttempts; i++) {
    // Espera 1 segundo
    await new Promise(resolve => setTimeout(resolve, intervalMs));

    // Verifica status
    const { status, result, error } = await checkStatus(searchId);

    if (status === "completed") {
      return result.phones;
    }

    if (status === "failed") {
      throw new Error(error || "Busca falhou");
    }

    // status === "pending" → continua polling
  }

  throw new Error("Timeout: busca demorou demais");
}
```

---

## 6. Verificação de Créditos

A verificação de créditos acontece ANTES de chamar o Signal Hire:

```typescript
// Na Edge Function signalhire-search
async function handleSearch(userId, linkedinUrl) {
  // 1. Busca a assinatura do usuário
  const subscription = await db
    .from("user_subscriptions")
    .select("*, subscription_plans(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  // 2. Se tem plano PAGO
  if (subscription && subscription.subscription_plans.name !== "FREE") {
    const limits = subscription.subscription_plans.limits;

    // 3. Verifica uso atual no período
    const currentUsage = await db.rpc("get_current_period_usage", {
      p_user_id: userId,
      p_service_type: "signalhire"
    });

    // 4. Verifica se ainda tem créditos
    if (limits.signalhire_searches && currentUsage >= limits.signalhire_searches) {
      return new Response(JSON.stringify({
        error: "Limite de buscas atingido"
      }), { status: 429 });
    }

    // 5. Usa API Key da plataforma
    apiKey = process.env.SIGNALHIRE_API_KEY;
  } else {
    // 6. Plano FREE: usa API Key própria do usuário
    const profile = await db
      .from("profiles")
      .select("signalhire_api_key")
      .eq("id", userId)
      .single();

    if (!profile.signalhire_api_key) {
      return new Response(JSON.stringify({
        error: "Configure sua API Key do SignalHire"
      }), { status: 400 });
    }

    apiKey = profile.signalhire_api_key;
  }

  // Continua com a busca...
}
```

---

## 7. Tabela do Banco de Dados

```sql
CREATE TABLE signalhire_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  request_id TEXT NOT NULL,        -- ID retornado pelo Signal Hire
  linkedin_url TEXT NOT NULL,      -- URL buscada
  status TEXT DEFAULT 'pending',   -- pending, completed, failed
  result JSONB,                    -- { phones: [...] }
  error TEXT,                      -- Mensagem de erro se falhou
  subscription_id UUID,            -- Para tracking de uso
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices importantes
CREATE INDEX idx_request_id ON signalhire_searches(request_id);
CREATE INDEX idx_user_id ON signalhire_searches(user_id);
CREATE INDEX idx_status ON signalhire_searches(status);
```

---

## 8. Variáveis de Ambiente

```env
# API Key do Signal Hire (plataforma)
SIGNALHIRE_API_KEY=sk_xxx...

# Secret para validar webhooks (opcional, mas recomendado)
SIGNALHIRE_WEBHOOK_SECRET=secret_xxx...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx...
```

---

## 9. Resumo: Pontos Importantes

### O que você PRECISA:

1. **Endpoint de busca** que:
   - Recebe a URL do LinkedIn
   - Faz POST para `https://www.signalhire.com/api/v1/candidate/search`
   - Passa sua `callbackUrl` no body
   - Salva o `requestId` no banco com status "pending"
   - Retorna um identificador da busca para o frontend

2. **Webhook** que:
   - Recebe o POST do Signal Hire
   - Pega o `Request-Id` do header
   - Busca o registro no banco pelo `request_id`
   - Extrai os telefones do `candidate.contacts`
   - Atualiza o registro com status "completed"
   - **SEMPRE retorna 200** (mesmo se der erro)

3. **Endpoint de check-status** que:
   - Recebe o identificador da busca
   - Retorna o status atual do banco
   - Se "completed", retorna os telefones

4. **Frontend** que:
   - Chama o endpoint de busca
   - Faz polling no check-status a cada 1 segundo
   - Para quando status for "completed" ou "failed"
   - Timeout após 60 segundos

### Erros comuns:

- **"Não recebo o callback"**: Verifique se a URL do webhook está correta e acessível publicamente
- **"Request-Id não bate"**: O Signal Hire envia o mesmo `requestId` no header do callback
- **"Dados não aparecem"**: O webhook precisa retornar 200, senão o Signal Hire pode reenviar
- **"Créditos não batem"**: A verificação de créditos deve ser feita ANTES de chamar o Signal Hire

---

## 10. Exemplo Completo de Código

### Edge Function: Iniciar Busca

```typescript
// supabase/functions/signalhire-search/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth
  const authHeader = req.headers.get("Authorization");
  const { data: { user } } = await supabase.auth.getUser(
    authHeader?.replace("Bearer ", "")
  );

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401
    });
  }

  const { linkedinUrl } = await req.json();

  // Monta callback URL
  const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/signalhire-webhook`;

  // Chama Signal Hire
  const response = await fetch(
    "https://www.signalhire.com/api/v1/candidate/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": Deno.env.get("SIGNALHIRE_API_KEY")!
      },
      body: JSON.stringify({
        items: [linkedinUrl],
        callbackUrl
      })
    }
  );

  const { requestId } = await response.json();

  // Salva no banco
  const { data: search } = await supabase
    .from("signalhire_searches")
    .insert({
      user_id: user.id,
      request_id: String(requestId),
      linkedin_url: linkedinUrl,
      status: "pending"
    })
    .select()
    .single();

  return new Response(JSON.stringify({
    searchId: search.id,
    requestId
  }), { status: 200 });
});
```

### Edge Function: Webhook

```typescript
// supabase/functions/signalhire-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Pega Request-Id do header
  const requestId = req.headers.get("Request-Id");

  if (!requestId) {
    return new Response("Request-Id header required", { status: 400 });
  }

  const results = await req.json();

  for (const result of results) {
    // Busca registro
    const { data: search } = await supabase
      .from("signalhire_searches")
      .select("*")
      .eq("request_id", requestId)
      .eq("linkedin_url", result.item)
      .single();

    if (!search) continue;

    // Extrai telefones
    const phones = result.candidate?.contacts
      ?.filter((c: any) => c.type === "phone")
      ?.map((c: any) => ({
        number: c.value,
        type: c.subType || "unknown",
        rating: c.rating || "unknown"
      })) || [];

    // Atualiza registro
    await supabase
      .from("signalhire_searches")
      .update({
        status: result.status === "success" ? "completed" : "failed",
        result: { phones },
        error: result.error || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", search.id);
  }

  // SEMPRE retorna 200
  return new Response("OK", { status: 200 });
});
```

### Edge Function: Check Status

```typescript
// supabase/functions/signalhire-check-status/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { searchId } = await req.json();

  const { data: search } = await supabase
    .from("signalhire_searches")
    .select("status, result, error")
    .eq("id", searchId)
    .single();

  if (!search) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404
    });
  }

  return new Response(JSON.stringify({
    status: search.status,
    result: search.result,
    error: search.error
  }), { status: 200 });
});
```

---

## 11. Checklist de Implementação

- [ ] Criar tabela `signalhire_searches` no banco
- [ ] Criar Edge Function para iniciar busca
- [ ] Criar Edge Function para webhook (callback)
- [ ] Criar Edge Function para check-status
- [ ] Configurar variáveis de ambiente (API Key)
- [ ] Implementar polling no frontend
- [ ] Testar callback URL está acessível publicamente
- [ ] Verificar que webhook sempre retorna 200

---

**Dúvidas?** O fluxo principal é: Busca → Salva pending → Polling → Webhook atualiza → Polling detecta → Retorna dados.
