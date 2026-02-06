/**
 * Mock Fetch Helpers for Tests
 * Provides centralized helpers for mocking global.fetch with URL-based dispatch
 *
 * Usage:
 *   import { createMockFetch, mockJsonResponse, mockErrorResponse, restoreFetch } from "__tests__/helpers/mock-fetch";
 *
 *   beforeEach(() => {
 *     createMockFetch([
 *       { url: /apollo\.io.*search/, method: "POST", response: mockJsonResponse({ people: [] }) },
 *       { url: /apollo\.io.*auth/, response: mockJsonResponse({ is_logged_in: true }) },
 *     ]);
 *   });
 *
 *   afterEach(() => restoreFetch());
 */

import { vi } from "vitest";

// ==============================================
// TYPES
// ==============================================

export type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

/** Marker class for network errors — causes fetch() to reject */
export class MockNetworkErrorMarker {
  constructor(public message: string) {}
}

export type MockRoute = {
  url: string | RegExp;
  method?: string;
  response: MockResponse | MockNetworkErrorMarker;
};

export type FetchCall = {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string> | undefined;
};

export type MockFetchResult = {
  /** Returns all captured fetch calls for assertions */
  calls: () => FetchCall[];
  /** The underlying vi.fn() mock for direct assertions */
  mock: ReturnType<typeof vi.fn>;
};

// ==============================================
// RESPONSE HELPERS
// ==============================================

/**
 * Creates a successful JSON response
 * @param data - Response body data
 * @param status - HTTP status code (default: 200)
 */
export function mockJsonResponse(data: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

/**
 * Creates an error HTTP response
 * @param status - HTTP error status code
 * @param message - Optional error message
 */
export function mockErrorResponse(status: number, message?: string): MockResponse {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: message ?? `Error ${status}` }),
    text: () => Promise.resolve(JSON.stringify({ error: message ?? `Error ${status}` })),
  };
}

/**
 * Creates a network error marker — fetch() will reject with TypeError
 * @param message - Error message (default: "Failed to fetch")
 */
export function mockNetworkError(message = "Failed to fetch"): MockNetworkErrorMarker {
  return new MockNetworkErrorMarker(message);
}

// ==============================================
// CORE: createMockFetch / restoreFetch
// ==============================================

let originalFetch: typeof global.fetch | undefined;

/**
 * Assigns global.fetch with a vi.fn() that dispatches responses based on URL/method.
 * URLs not matching any route return 404 with descriptive message.
 *
 * @param routes - Array of route definitions with URL patterns and responses
 * @returns Object with calls() for inspection and mock for direct vi.fn() assertions
 */
export function createMockFetch(routes: MockRoute[]): MockFetchResult {
  const callLog: FetchCall[] = [];

  if (originalFetch === undefined) {
    originalFetch = global.fetch;
  }

  const mockFn = vi.fn().mockImplementation((url: string | URL | Request, options?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const method = (options?.method ?? "GET").toUpperCase();

    let parsedBody: unknown;
    if (options?.body) {
      try {
        parsedBody = JSON.parse(options.body as string);
      } catch {
        parsedBody = options.body;
      }
    }

    callLog.push({
      url: urlStr,
      method,
      body: parsedBody,
      headers:
        options?.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : (options?.headers as Record<string, string> | undefined),
    });

    for (const route of routes) {
      const urlMatch =
        typeof route.url === "string"
          ? urlStr === route.url
          : route.url.test(urlStr);

      const methodMatch = !route.method || route.method.toUpperCase() === method;

      if (urlMatch && methodMatch) {
        if (route.response instanceof MockNetworkErrorMarker) {
          return Promise.reject(new TypeError(route.response.message));
        }
        return Promise.resolve(route.response);
      }
    }

    // Default: 404 with descriptive message including the URL called
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: `Not mocked: ${method} ${urlStr}` }),
      text: () => Promise.resolve(JSON.stringify({ error: `Not mocked: ${method} ${urlStr}` })),
    });
  });

  global.fetch = mockFn as unknown as typeof global.fetch;

  return {
    calls: () => callLog,
    mock: mockFn,
  };
}

/**
 * Restores global.fetch to its original value before createMockFetch was called.
 * Use in afterEach() for cleanup:
 *   afterEach(() => restoreFetch());
 */
export function restoreFetch(): void {
  if (originalFetch !== undefined) {
    global.fetch = originalFetch;
    originalFetch = undefined;
  }
}
