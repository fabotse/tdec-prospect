/**
 * Tests: handler Deno real da Edge Function instantly-webhook (DW-25)
 *
 * O instantly-webhook.test.ts testa a cópia da lógica em
 * src/lib/webhook/instantly-webhook-utils.ts. Este arquivo executa o próprio
 * supabase/functions/instantly-webhook/index.ts, que é o que roda publicado:
 *   - `Deno` é simulado: `Deno.serve` captura o handler e `Deno.env.get` lê um
 *     mapa controlado pelo teste.
 *   - `npm:@supabase/supabase-js@2` é trocado por um client falso em memória.
 *
 * Cobre o guard de segredo (Story 23.1), `extractWebhookSecret` e `safeEqual`
 * inline, o smoke do operador pós-deploy (401 sem token, 400 com token e corpo
 * vazio) e a paridade com `processWebhookRequest`, que antes dependia só do
 * SYNC-NOTICE.
 */

import path from "path";
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import {
  extractWebhookSecret,
  processWebhookRequest,
} from "@/lib/webhook/instantly-webhook-utils";
import type { WebhookDeps } from "@/lib/webhook/instantly-webhook-utils";

// ==============================================
// FAKE SUPABASE (npm:@supabase/supabase-js@2)
// ==============================================

const supabaseFake = vi.hoisted(() => {
  const state = {
    lookupResult: {
      data: null as { id: string; tenant_id: string } | null,
      error: null as { message: string } | null,
    },
    insertResult: {
      error: null as { message: string; code: string } | null,
    },
    lookups: [] as Array<{
      table: string;
      columns: string;
      column: string;
      value: unknown;
      limit: number | undefined;
    }>,
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  };

  const createClient = vi.fn((url: string, key: string) => ({
    url,
    key,
    from(table: string) {
      return {
        select(columns: string) {
          let column = "";
          let value: unknown;
          let limit: number | undefined;
          const chain = {
            eq(col: string, val: unknown) {
              column = col;
              value = val;
              return chain;
            },
            limit(n: number) {
              limit = n;
              return chain;
            },
            async maybeSingle() {
              state.lookups.push({ table, columns, column, value, limit });
              return state.lookupResult;
            },
          };
          return chain;
        },
        async insert(row: Record<string, unknown>) {
          state.inserts.push({ table, row });
          return state.insertResult;
        },
      };
    },
  }));

  return { state, createClient };
});

vi.mock("npm:@supabase/supabase-js@2", () => ({
  createClient: supabaseFake.createClient,
}));

// ==============================================
// FAKE DENO
// ==============================================

const SECRET = "s3cr3t-webhook-token-0123456789abcdef";
const BASE_URL =
  "https://kdgogyqyaxncqoyklyxx.supabase.co/functions/v1/instantly-webhook";

const env = new Map<string, string>();
let handler: (req: Request) => Promise<Response>;
const originalDeno = (globalThis as Record<string, unknown>).Deno;

// Caminho montado em runtime para o tsc não seguir o import: o arquivo é Deno
// (global `Deno`, specifier `npm:`) e o tsconfig exclui supabase/functions.
const HANDLER_PATH = path.resolve(
  __dirname,
  "../../../supabase/functions/instantly-webhook/index.ts"
);

function resetEnv() {
  env.clear();
  env.set("INSTANTLY_WEBHOOK_SECRET", SECRET);
  env.set("SUPABASE_URL", "https://example.supabase.co");
  env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

beforeAll(async () => {
  const serve = vi.fn((fn: (req: Request) => Promise<Response>) => {
    handler = fn;
  });
  (globalThis as Record<string, unknown>).Deno = {
    serve,
    env: { get: (key: string) => env.get(key) },
  };
  await import(/* @vite-ignore */ HANDLER_PATH);
  expect(serve).toHaveBeenCalledTimes(1);
});

afterAll(() => {
  if (originalDeno === undefined) {
    delete (globalThis as Record<string, unknown>).Deno;
  } else {
    (globalThis as Record<string, unknown>).Deno = originalDeno;
  }
});

const CONSOLE_METHODS = ["log", "info", "debug", "warn", "error"] as const;
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];
let warnSpy: ReturnType<typeof vi.spyOn>;
// Segredos (esperado e recebidos) usados no teste corrente; nenhum pode ir para log.
const secretsInPlay = new Set<string>();

function trackSecret(value: string | null | undefined) {
  const trimmed = value?.trim();
  // Valores curtos ("x") dariam falso positivo em qualquer mensagem.
  if (trimmed && trimmed.length >= 8) secretsInPlay.add(trimmed);
}

function serializeArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name} ${arg.message} ${arg.stack ?? ""}`;
  try {
    return `${String(arg)} ${JSON.stringify(arg)}`;
  } catch {
    return String(arg);
  }
}

beforeEach(() => {
  secretsInPlay.clear();
  resetEnv();
  supabaseFake.createClient.mockClear();
  supabaseFake.state.lookupResult = {
    data: { id: "campaign-uuid-1", tenant_id: "tenant-uuid-1" },
    error: null,
  };
  supabaseFake.state.insertResult = { error: null };
  supabaseFake.state.lookups = [];
  supabaseFake.state.inserts = [];
  consoleSpies = CONSOLE_METHODS.map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );
  warnSpy = consoleSpies[CONSOLE_METHODS.indexOf("warn")];
});

afterEach(() => {
  try {
    // Nenhum caminho pode logar o segredo esperado nem o recebido.
    const logged = consoleSpies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => call.map(serializeArg).join(" "));
    for (const line of logged) {
      for (const secret of secretsInPlay) {
        expect(line).not.toContain(secret);
        expect(line).not.toContain(encodeURIComponent(secret));
        // Como aparece em req.url (URLSearchParams usa "+" para espaço).
        expect(line).not.toContain(new URLSearchParams({ t: secret }).toString().slice(2));
      }
    }
  } finally {
    for (const spy of consoleSpies) spy.mockRestore();
  }
});

// ==============================================
// HELPERS
// ==============================================

const VALID_PAYLOAD = {
  event_type: "reply_received",
  lead_email: "lead@empresa.com.br",
  campaign_id: "instantly-campaign-1",
  timestamp: "2026-11-11T10:00:00.000Z",
};

interface SendOptions {
  method?: string;
  token?: string | null;
  headerSecret?: string;
  body?: string | null;
  url?: string;
}

function buildRequest(opts: SendOptions = {}): Request {
  const method = opts.method ?? "POST";
  const url = new URL(opts.url ?? BASE_URL);
  if (opts.token !== undefined && opts.token !== null) {
    url.searchParams.set("token", opts.token);
  }
  const headers = new Headers({ "Content-Type": "application/json" });
  if (opts.headerSecret !== undefined) {
    headers.set("x-webhook-secret", opts.headerSecret);
  }
  const canHaveBody = method !== "GET" && method !== "HEAD";
  return new Request(url.toString(), {
    method,
    headers,
    body: canHaveBody ? (opts.body ?? null) : undefined,
  });
}

async function send(opts: SendOptions = {}) {
  trackSecret(env.get("INSTANTLY_WEBHOOK_SECRET"));
  trackSecret(opts.token);
  trackSecret(opts.headerSecret);
  const req = buildRequest(opts);
  const res = await handler(req);
  const text = await res.text();
  return {
    req,
    res,
    status: res.status,
    json: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

// ==============================================
// MÉTODOS E CORS
// ==============================================

describe("handler Deno: métodos e CORS", () => {
  it("OPTIONS → 204 sem segredo, com CORS que aceita x-webhook-secret", async () => {
    env.delete("INSTANTLY_WEBHOOK_SECRET");
    const { status, res } = await send({ method: "OPTIONS" });
    expect(status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "x-webhook-secret"
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS"
    );
  });

  it.each(["GET", "PUT", "DELETE"])("%s → 405 antes do guard", async (method) => {
    env.delete("INSTANTLY_WEBHOOK_SECRET");
    const { status, json } = await send({ method });
    expect(status).toBe(405);
    expect(json).toEqual({ error: "Method not allowed" });
  });
});

// ==============================================
// GUARD DE SEGREDO (Story 23.1)
// ==============================================

describe("handler Deno: guard de segredo", () => {
  it.each([
    ["ausente", undefined],
    ["vazio", ""],
    ["só espaços", "   "],
  ])(
    "INSTANTLY_WEBHOOK_SECRET %s → 503, sem ler o corpo nem criar client",
    async (_label, value) => {
      if (value === undefined) env.delete("INSTANTLY_WEBHOOK_SECRET");
      else env.set("INSTANTLY_WEBHOOK_SECRET", value);
      const { status, json, req } = await send({
        token: SECRET,
        body: JSON.stringify(VALID_PAYLOAD),
      });
      expect(status).toBe(503);
      expect(json).toEqual({ error: "Webhook not configured" });
      expect(req.bodyUsed).toBe(false);
      expect(supabaseFake.createClient).not.toHaveBeenCalled();
    }
  );

  it("smoke do operador: sem token → 401, sem ler o corpo nem tocar o banco", async () => {
    const { status, json, req, res } = await send({
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(req.bodyUsed).toBe(false);
    expect(supabaseFake.createClient).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("Webhook rejected: secret missing");
  });

  it("smoke do operador: token certo e corpo vazio → 400 Invalid JSON payload", async () => {
    const { status, json } = await send({ token: SECRET, body: null });
    expect(status).toBe(400);
    expect(json).toEqual({ error: "Invalid JSON payload" });
    expect(supabaseFake.createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["errado", "outro-segredo"],
    ["prefixo do certo (mais curto)", SECRET.slice(0, -1)],
    ["certo com sufixo (mais longo)", `${SECRET}x`],
    ["mesmo tamanho, último char diferente", `${SECRET.slice(0, -1)}X`],
    ["caixa diferente", SECRET.toUpperCase()],
    // Só o XOR dos tamanhos em safeEqual pega um NUL a mais (charCode 0).
    ["certo com NUL no fim (%00)", `${SECRET}\u0000`],
  ])("token na query %s → 401 sem tocar o banco", async (_label, token) => {
    const { status, json, req } = await send({
      token,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(req.bodyUsed).toBe(false);
    expect(supabaseFake.createClient).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("Webhook rejected: secret invalid");
  });

  it("segredo pelo header x-webhook-secret passa o guard", async () => {
    const { status, json } = await send({
      headerSecret: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(200);
    expect(json).toEqual({ success: true });
  });

  it("header errado → 401", async () => {
    const { status } = await send({
      headerSecret: "outro-segredo",
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(401);
  });

  it("query tem prioridade: query errada + header certo → 401", async () => {
    const { status } = await send({
      token: "outro-segredo",
      headerSecret: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(401);
  });

  it("query vazia (?token=) cai para o header certo → passa", async () => {
    const { status } = await send({
      token: "",
      headerSecret: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(200);
  });

  it("segredo da env com espaços nas pontas é aparado antes de comparar", async () => {
    env.set("INSTANTLY_WEBHOOK_SECRET", `  ${SECRET}\n`);
    const { status } = await send({
      token: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(200);
  });

  it("token com caracteres codificados na URL é decodificado antes de comparar", async () => {
    const special = "a+b/c=d&e f";
    env.set("INSTANTLY_WEBHOOK_SECRET", special);
    const { status } = await send({
      token: special,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(200);
  });
});

// ==============================================
// CORPO, VALIDAÇÃO E PERSISTÊNCIA
// ==============================================

describe("handler Deno: corpo e persistência (com token certo)", () => {
  it("JSON malformado → 400", async () => {
    const { status, json } = await send({ token: SECRET, body: "{not json" });
    expect(status).toBe(400);
    expect(json).toEqual({ error: "Invalid JSON payload" });
  });

  it("campos obrigatórios faltando → 400 com a lista", async () => {
    const { status, json } = await send({ token: SECRET, body: "{}" });
    expect(status).toBe(400);
    expect(json).toEqual({
      error: "Missing required fields: event_type, lead_email, campaign_id",
    });
    expect(supabaseFake.createClient).not.toHaveBeenCalled();
  });

  it("event type não suportado → 200 skipped sem criar client", async () => {
    const { status, json } = await send({
      token: SECRET,
      body: JSON.stringify({ ...VALID_PAYLOAD, event_type: "email_sent" }),
    });
    expect(status).toBe(200);
    expect(json).toEqual({ success: true, skipped: true });
    expect(supabaseFake.createClient).not.toHaveBeenCalled();
  });

  it("env do Supabase ausente → 500", async () => {
    env.delete("SUPABASE_SERVICE_ROLE_KEY");
    const { status, json } = await send({
      token: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(500);
    expect(json).toEqual({ error: "Server configuration error" });
  });

  it("payload válido → lookup por external_campaign_id + insert com source webhook → 200", async () => {
    const { status, json } = await send({
      token: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(supabaseFake.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key"
    );
    expect(supabaseFake.state.lookups).toEqual([
      {
        table: "campaigns",
        columns: "id, tenant_id",
        column: "external_campaign_id",
        value: "instantly-campaign-1",
        limit: 1,
      },
    ]);
    expect(supabaseFake.state.inserts).toEqual([
      {
        table: "campaign_events",
        row: {
          tenant_id: "tenant-uuid-1",
          campaign_id: "campaign-uuid-1",
          event_type: "email_replied",
          lead_email: "lead@empresa.com.br",
          event_timestamp: "2026-11-11T10:00:00.000Z",
          payload: VALID_PAYLOAD,
          source: "webhook",
        },
      },
    ]);
  });

  it("campanha desconhecida → 200 skipped sem insert", async () => {
    supabaseFake.state.lookupResult = { data: null, error: null };
    const { status, json } = await send({
      token: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(200);
    expect(json).toEqual({ success: true, skipped: true });
    expect(supabaseFake.state.inserts).toEqual([]);
  });

  it("erro no lookup → 500", async () => {
    supabaseFake.state.lookupResult = { data: null, error: { message: "boom" } };
    const { status, json } = await send({
      token: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(500);
    expect(json).toEqual({ error: "Internal error" });
  });

  it("duplicata (23505) no insert → 200", async () => {
    supabaseFake.state.insertResult = {
      error: { message: "duplicate", code: "23505" },
    };
    const { status, json } = await send({
      token: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(200);
    expect(json).toEqual({ success: true });
  });

  it("outro erro no insert → 500", async () => {
    supabaseFake.state.insertResult = {
      error: { message: "boom", code: "42P01" },
    };
    const { status, json } = await send({
      token: SECRET,
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(status).toBe(500);
    expect(json).toEqual({ error: "Failed to persist event" });
  });
});

// ==============================================
// PARIDADE COM A CÓPIA EM src/lib (SYNC-NOTICE)
// ==============================================

describe("handler Deno: paridade com processWebhookRequest", () => {
  type Scenario = {
    name: string;
    request: SendOptions;
    envSecret?: string | null;
    lookup?: {
      data: { id: string; tenant_id: string } | null;
      error: { message: string } | null;
    };
    insert?: { error: { message: string; code: string } | null };
  };

  const valid = JSON.stringify(VALID_PAYLOAD);
  const scenarios: Scenario[] = [
    { name: "OPTIONS", request: { method: "OPTIONS" } },
    { name: "GET", request: { method: "GET" } },
    { name: "sem segredo na env", request: { token: SECRET, body: valid }, envSecret: null },
    { name: "segredo da env só espaços", request: { token: SECRET, body: valid }, envSecret: "  " },
    { name: "sem token", request: { body: valid } },
    { name: "token errado", request: { token: "x", body: valid } },
    { name: "token prefixo", request: { token: SECRET.slice(0, 5), body: valid } },
    { name: "header certo", request: { headerSecret: SECRET, body: valid } },
    { name: "query errada + header certo", request: { token: "x", headerSecret: SECRET, body: valid } },
    { name: "query vazia + header certo", request: { token: "", headerSecret: SECRET, body: valid } },
    { name: "env com espaços", request: { token: SECRET, body: valid }, envSecret: ` ${SECRET} ` },
    { name: "corpo vazio", request: { token: SECRET, body: null } },
    { name: "JSON malformado", request: { token: SECRET, body: "{" } },
    { name: "JSON null", request: { token: SECRET, body: "null" } },
    { name: "campos faltando", request: { token: SECRET, body: '{"event_type":"reply_received"}' } },
    {
      name: "event type não suportado",
      request: { token: SECRET, body: JSON.stringify({ ...VALID_PAYLOAD, event_type: "x" }) },
    },
    { name: "válido", request: { token: SECRET, body: valid } },
    {
      name: "campanha desconhecida",
      request: { token: SECRET, body: valid },
      lookup: { data: null, error: null },
    },
    {
      name: "erro no lookup",
      request: { token: SECRET, body: valid },
      lookup: { data: null, error: { message: "boom" } },
    },
    {
      name: "duplicata",
      request: { token: SECRET, body: valid },
      insert: { error: { message: "dup", code: "23505" } },
    },
    {
      name: "erro no insert",
      request: { token: SECRET, body: valid },
      insert: { error: { message: "boom", code: "42P01" } },
    },
    // Todos os tipos do EVENT_TYPE_MAP, para pegar um mapeamento que mude só numa cópia.
    ...[
      "email_opened",
      "email_link_clicked",
      "reply_received",
      "email_bounced",
      "lead_unsubscribed",
    ].map((event_type) => ({
      name: `evento ${event_type}`,
      request: { token: SECRET, body: JSON.stringify({ ...VALID_PAYLOAD, event_type }) },
    })),
    {
      name: "válido sem timestamp (usa agora)",
      request: {
        token: SECRET,
        body: JSON.stringify({ ...VALID_PAYLOAD, timestamp: undefined }),
      },
    },
    {
      name: "válido com campos extras no payload",
      request: {
        token: SECRET,
        body: JSON.stringify({ ...VALID_PAYLOAD, step: 2, variant: 1, is_first: true }),
      },
    },
  ];

  it.each(scenarios.map((s) => [s.name, s] as const))(
    "%s: mesmo status, corpo, lookup e insert",
    async (_name, scenario) => {
      if (scenario.envSecret === null) env.delete("INSTANTLY_WEBHOOK_SECRET");
      else if (scenario.envSecret !== undefined)
        env.set("INSTANTLY_WEBHOOK_SECRET", scenario.envSecret);
      const lookup = scenario.lookup ?? {
        data: { id: "campaign-uuid-1", tenant_id: "tenant-uuid-1" },
        error: null,
      };
      const insert = scenario.insert ?? { error: null };
      supabaseFake.state.lookupResult = lookup;
      supabaseFake.state.insertResult = insert;

      // Lado Deno (arquivo publicado)
      const startedAt = Date.now();
      const deno = await send(scenario.request);

      // Lado src/lib, montado como o handler monta (env aparada, segredo extraído
      // da mesma URL e headers, corpo parseado do mesmo texto).
      const req = buildRequest(scenario.request);
      let body: unknown = null;
      let bodyParseError = false;
      if (req.method === "POST") {
        try {
          body = await req.json();
        } catch {
          bodyParseError = true;
        }
      }
      const deps: WebhookDeps = {
        lookupCampaign: vi.fn().mockResolvedValue(lookup),
        insertEvent: vi.fn().mockResolvedValue(insert),
        auth: {
          expectedSecret: env.get("INSTANTLY_WEBHOOK_SECRET")?.trim(),
          providedSecret: extractWebhookSecret(req.url, req.headers),
        },
      };
      const lib = await processWebhookRequest(
        req.method,
        body,
        bodyParseError,
        deps
      );

      expect(deno.status).toBe(lib.status);
      if (lib.status === 204) {
        expect(deno.json).toBeNull();
      } else {
        expect(deno.json).toEqual(lib.body);
      }

      // Mesmas chamadas ao banco, com os mesmos argumentos (e nenhuma nos
      // caminhos rejeitados).
      const libLookups = vi
        .mocked(deps.lookupCampaign)
        .mock.calls.map(([externalId]) => externalId);
      expect(supabaseFake.state.lookups.map((l) => l.value)).toEqual(libLookups);
      for (const l of supabaseFake.state.lookups) {
        expect(l).toMatchObject({
          table: "campaigns",
          columns: "id, tenant_id",
          column: "external_campaign_id",
          limit: 1,
        });
      }

      // Sem timestamp no payload, as duas cópias usam "agora": confere que caiu
      // dentro da janela do teste e só então normaliza esse campo.
      const finishedAt = Date.now();
      const normalize = (row: Record<string, unknown>) => {
        const payloadTs = (row.payload as Record<string, unknown> | undefined)?.timestamp;
        if (payloadTs !== undefined) return row;
        const ts = Date.parse(String(row.event_timestamp));
        expect(ts).toBeGreaterThanOrEqual(startedAt);
        expect(ts).toBeLessThanOrEqual(finishedAt);
        expect(new Date(ts).toISOString()).toBe(row.event_timestamp);
        return { ...row, event_timestamp: "<agora>" };
      };
      const libInserts = vi
        .mocked(deps.insertEvent)
        .mock.calls.map(([row]) => normalize(row as unknown as Record<string, unknown>));
      expect(supabaseFake.state.inserts.map((i) => i.table)).toEqual(
        libInserts.map(() => "campaign_events")
      );
      expect(supabaseFake.state.inserts.map((i) => normalize(i.row))).toEqual(libInserts);
    }
  );
});
