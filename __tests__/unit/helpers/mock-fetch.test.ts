/**
 * Unit tests for Mock Fetch Helpers
 * Story: Cleanup-4 - Padrão de Mock HTTP para APIs Externas
 *
 * Tests:
 * - createMockFetch matches by exact URL string
 * - createMockFetch matches by RegExp
 * - createMockFetch matches by method (GET vs POST for same URL)
 * - Default 404 for unconfigured URLs
 * - mockNetworkError simulates network failure
 * - calls() captures request details (url, method, body, headers)
 * - mockJsonResponse creates valid JSON response
 * - mockErrorResponse creates error response
 * - restoreFetch restores original global.fetch
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  mockNetworkError,
  restoreFetch,
} from "../../helpers/mock-fetch";

describe("mock-fetch helpers", () => {
  afterEach(() => {
    restoreFetch();
  });

  // ==============================================
  // mockJsonResponse
  // ==============================================

  describe("mockJsonResponse", () => {
    it("creates response with ok=true for status 200", () => {
      const response = mockJsonResponse({ data: "test" });
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });

    it("returns data from json()", async () => {
      const data = { people: [{ name: "João" }] };
      const response = mockJsonResponse(data);
      await expect(response.json()).resolves.toEqual(data);
    });

    it("returns stringified data from text()", async () => {
      const data = { key: "value" };
      const response = mockJsonResponse(data);
      await expect(response.text()).resolves.toBe(JSON.stringify(data));
    });

    it("accepts custom status code", () => {
      const response = mockJsonResponse({ created: true }, 201);
      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
    });

    it("sets ok=false for status >= 300", () => {
      const response = mockJsonResponse(null, 400);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  // ==============================================
  // mockErrorResponse
  // ==============================================

  describe("mockErrorResponse", () => {
    it("creates response with ok=false", () => {
      const response = mockErrorResponse(401);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("includes error message in json()", async () => {
      const response = mockErrorResponse(403, "Acesso negado");
      const body = await response.json();
      expect(body).toEqual({ error: "Acesso negado" });
    });

    it("uses default message when none provided", async () => {
      const response = mockErrorResponse(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Error 500" });
    });
  });

  // ==============================================
  // createMockFetch — URL string exata (AC: #1, #2)
  // ==============================================

  describe("createMockFetch — exact URL string match", () => {
    it("matches exact URL string", async () => {
      createMockFetch([
        {
          url: "https://api.apollo.io/v1/people/search",
          response: mockJsonResponse({ people: [] }),
        },
      ]);

      const res = await fetch("https://api.apollo.io/v1/people/search");
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body).toEqual({ people: [] });
    });

    it("does not match partial URL string", async () => {
      createMockFetch([
        {
          url: "https://api.apollo.io/v1/people/search",
          response: mockJsonResponse({ people: [] }),
        },
      ]);

      const res = await fetch("https://api.apollo.io/v1/people/search?page=2");

      expect(res.status).toBe(404);
    });
  });

  // ==============================================
  // createMockFetch — RegExp (AC: #2)
  // ==============================================

  describe("createMockFetch — RegExp match", () => {
    it("matches URL by RegExp pattern", async () => {
      createMockFetch([
        {
          url: /apollo\.io.*search/,
          response: mockJsonResponse({ people: [{ name: "Test" }] }),
        },
      ]);

      const res = await fetch(
        "https://api.apollo.io/v1/people/search?page=1"
      );
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body).toEqual({ people: [{ name: "Test" }] });
    });

    it("does not match when pattern does not apply", async () => {
      createMockFetch([
        {
          url: /apollo\.io.*search/,
          response: mockJsonResponse({ people: [] }),
        },
      ]);

      const res = await fetch("https://api.instantly.ai/campaigns");
      expect(res.status).toBe(404);
    });
  });

  // ==============================================
  // createMockFetch — method matching
  // ==============================================

  describe("createMockFetch — method matching", () => {
    it("matches by method when specified", async () => {
      createMockFetch([
        {
          url: /api\.example\.com/,
          method: "GET",
          response: mockJsonResponse({ action: "get" }),
        },
        {
          url: /api\.example\.com/,
          method: "POST",
          response: mockJsonResponse({ action: "post" }),
        },
      ]);

      const getRes = await fetch("https://api.example.com/data");
      const getBody = await getRes.json();
      expect(getBody).toEqual({ action: "get" });

      const postRes = await fetch("https://api.example.com/data", {
        method: "POST",
      });
      const postBody = await postRes.json();
      expect(postBody).toEqual({ action: "post" });
    });

    it("matches any method when method is not specified", async () => {
      createMockFetch([
        {
          url: /api\.example\.com/,
          response: mockJsonResponse({ any: true }),
        },
      ]);

      const getRes = await fetch("https://api.example.com/data");
      expect((await getRes.json())).toEqual({ any: true });

      const postRes = await fetch("https://api.example.com/data", {
        method: "POST",
      });
      expect((await postRes.json())).toEqual({ any: true });
    });

    it("is case-insensitive for method matching", async () => {
      createMockFetch([
        {
          url: /api\.example\.com/,
          method: "post",
          response: mockJsonResponse({ posted: true }),
        },
      ]);

      const res = await fetch("https://api.example.com/data", {
        method: "POST",
      });
      expect((await res.json())).toEqual({ posted: true });
    });
  });

  // ==============================================
  // Default 404 (AC: #1)
  // ==============================================

  describe("default 404 for unconfigured URLs", () => {
    it("returns 404 with descriptive message for unmatched URL", async () => {
      createMockFetch([
        {
          url: /apollo\.io/,
          response: mockJsonResponse({ ok: true }),
        },
      ]);

      const res = await fetch("https://api.unknown-service.com/endpoint");

      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("Not mocked");
      expect(body.error).toContain("api.unknown-service.com/endpoint");
    });

    it("includes method in 404 error message", async () => {
      createMockFetch([]);

      const res = await fetch("https://api.test.com/data", {
        method: "DELETE",
      });
      const body = await res.json();
      expect(body.error).toContain("DELETE");
    });
  });

  // ==============================================
  // mockNetworkError (AC: #3)
  // ==============================================

  describe("mockNetworkError", () => {
    it("causes fetch to reject with TypeError", async () => {
      createMockFetch([
        {
          url: /api\.down\.com/,
          response: mockNetworkError(),
        },
      ]);

      await expect(
        fetch("https://api.down.com/health")
      ).rejects.toThrow(TypeError);
    });

    it("uses custom error message", async () => {
      createMockFetch([
        {
          url: /api\.down\.com/,
          response: mockNetworkError("Network unavailable"),
        },
      ]);

      await expect(
        fetch("https://api.down.com/health")
      ).rejects.toThrow("Network unavailable");
    });

    it("uses default message when none provided", async () => {
      createMockFetch([
        {
          url: /api\.down\.com/,
          response: mockNetworkError(),
        },
      ]);

      await expect(
        fetch("https://api.down.com/health")
      ).rejects.toThrow("Failed to fetch");
    });
  });

  // ==============================================
  // calls() — request capture (AC: #2)
  // ==============================================

  describe("calls() — request capture", () => {
    it("captures url and method", async () => {
      const { calls } = createMockFetch([
        { url: /.*/, response: mockJsonResponse({ ok: true }) },
      ]);

      await fetch("https://api.test.com/data", { method: "POST" });

      expect(calls()).toHaveLength(1);
      expect(calls()[0].url).toBe("https://api.test.com/data");
      expect(calls()[0].method).toBe("POST");
    });

    it("captures JSON body", async () => {
      const { calls } = createMockFetch([
        { url: /.*/, response: mockJsonResponse({ ok: true }) },
      ]);

      await fetch("https://api.test.com/data", {
        method: "POST",
        body: JSON.stringify({ name: "João", title: "CEO" }),
      });

      expect(calls()[0].body).toEqual({ name: "João", title: "CEO" });
    });

    it("captures headers", async () => {
      const { calls } = createMockFetch([
        { url: /.*/, response: mockJsonResponse({ ok: true }) },
      ]);

      await fetch("https://api.test.com/data", {
        headers: { "x-api-key": "secret-123", "Content-Type": "application/json" },
      });

      expect(calls()[0].headers).toEqual({
        "x-api-key": "secret-123",
        "Content-Type": "application/json",
      });
    });

    it("captures multiple calls in order", async () => {
      const { calls } = createMockFetch([
        { url: /.*/, response: mockJsonResponse({ ok: true }) },
      ]);

      await fetch("https://api.test.com/first");
      await fetch("https://api.test.com/second", { method: "POST" });

      expect(calls()).toHaveLength(2);
      expect(calls()[0].url).toContain("first");
      expect(calls()[1].url).toContain("second");
      expect(calls()[1].method).toBe("POST");
    });

    it("defaults method to GET when not specified", async () => {
      const { calls } = createMockFetch([
        { url: /.*/, response: mockJsonResponse({}) },
      ]);

      await fetch("https://api.test.com/data");

      expect(calls()[0].method).toBe("GET");
    });

    it("captures non-JSON body as-is", async () => {
      const { calls } = createMockFetch([
        { url: /.*/, response: mockJsonResponse({}) },
      ]);

      await fetch("https://api.test.com/data", {
        method: "POST",
        body: "grant_type=client_credentials&client_id=abc",
      });

      expect(calls()[0].body).toBe(
        "grant_type=client_credentials&client_id=abc"
      );
    });
  });

  // ==============================================
  // restoreFetch
  // ==============================================

  describe("restoreFetch", () => {
    it("restores global.fetch after createMockFetch", () => {
      const beforeFetch = global.fetch;

      createMockFetch([]);
      expect(global.fetch).not.toBe(beforeFetch);

      restoreFetch();
      expect(global.fetch).toBe(beforeFetch);
    });

    it("is safe to call multiple times", () => {
      createMockFetch([]);
      restoreFetch();
      restoreFetch(); // Should not throw
    });
  });
});
