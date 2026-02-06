/**
 * Mock Supabase Client Helper
 * Cleanup-3: Mock Supabase Resiliente
 *
 * Provides a resilient mock Supabase client where `from(anyTable)`
 * always returns a functional chain builder. Unknown tables resolve
 * to `{ data: null, error: null }` by default, preventing cascade
 * failures when new tables are added to the database.
 *
 * Complementary to mock-data.ts (data factories).
 * Pattern: mock-data.ts = dados, mock-supabase.ts = infraestrutura de cliente
 */

import { vi } from "vitest";

const DEFAULT_RESPONSE = { data: null, error: null };

/**
 * All Supabase chain methods used across the project.
 * Each is a vi.fn() that returns the chain (for chaining).
 * The chain is thenable — resolves to defaultResponse when awaited.
 */
const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "in",
  "is",
  "gt",
  "gte",
  "lt",
  "lte",
  "or",
  "not",
  "filter",
  "match",
  "order",
  "range",
  "limit",
  "single",
  "maybeSingle",
  "count",
  "csv",
  "ilike",
  "like",
  "contains",
  "containedBy",
  "textSearch",
] as const;

type ChainMethod = (typeof CHAIN_METHODS)[number];

export type ChainBuilder = {
  [K in ChainMethod]: ReturnType<typeof vi.fn>;
} & {
  then: (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
};

/**
 * Cria um chain builder que simula o Supabase PostgREST query builder.
 *
 * - Todos os métodos são vi.fn() que retornam o próprio chain (chaining)
 * - O chain é "thenable": quando await'd, resolve com defaultResponse
 * - Permite override de métodos individuais via .mockResolvedValueOnce() etc.
 */
export function createChainBuilder(
  defaultResponse: { data: unknown; error: unknown } = DEFAULT_RESPONSE
): ChainBuilder {
  const chain = {} as ChainBuilder;

  // Thenable — permite `await from("x").select().eq()`
  chain.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown
  ) => {
    return Promise.resolve(defaultResponse).then(resolve, reject);
  };

  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  return chain;
}

export interface MockSupabaseClientOptions {
  /** Pre-configure specific tables with custom chain builders */
  tableOverrides?: Record<string, Partial<ChainBuilder> | Record<string, unknown>>;
}

export interface MockSupabaseClient {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
}

/**
 * Cria um mock Supabase client resiliente.
 *
 * - `from(qualquerTabela)` sempre retorna um chain builder funcional
 * - Tabelas não configuradas resolvem { data: null, error: null }
 * - auth.getUser retorna { data: { user: null }, error: null } por padrão
 *
 * @example
 * ```ts
 * const client = createMockSupabaseClient();
 * vi.mock("@/lib/supabase/server", () => ({
 *   createClient: vi.fn(() => client),
 * }));
 * ```
 */
export function createMockSupabaseClient(
  options?: MockSupabaseClientOptions
): MockSupabaseClient {
  const mockGetUser = vi.fn().mockResolvedValue({
    data: { user: null },
    error: null,
  });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (options?.tableOverrides?.[table]) {
      return options.tableOverrides[table];
    }
    return createChainBuilder();
  });

  return {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  };
}

/**
 * Configura retorno específico para uma tabela.
 *
 * Cria um chain builder com o response dado e registra no client.from().
 * Múltiplas chamadas para tabelas diferentes compõem corretamente.
 *
 * @returns O chain builder criado (para configuração adicional se necessário)
 *
 * @example
 * ```ts
 * const client = createMockSupabaseClient();
 * mockTableResponse(client, "campaigns", { data: [{ id: "1" }] });
 * // from("campaigns").select().eq().order() → resolve { data: [{ id: "1" }] }
 * // from("outraTabela").select() → resolve { data: null, error: null }
 * ```
 */
export function mockTableResponse(
  client: MockSupabaseClient,
  tableName: string,
  response: { data?: unknown; error?: unknown }
): ChainBuilder {
  const resolvedResponse = {
    data: response.data ?? null,
    error: response.error ?? null,
  };
  const chain = createChainBuilder(resolvedResponse);

  // Wrap existing from() to add this table override
  const prevImpl =
    client.from.getMockImplementation() ?? (() => createChainBuilder());

  client.from.mockImplementation((table: string) => {
    if (table === tableName) return chain;
    return prevImpl(table);
  });

  return chain;
}
