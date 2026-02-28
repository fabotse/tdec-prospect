/**
 * Tests for monitoring utility functions
 * Story 13.3: Edge Function de Verificação Semanal — AC #5, #12
 */

import { describe, it, expect } from "vitest";
import {
  detectNewPosts,
  calculateNextRunAt,
} from "@/lib/utils/monitoring-utils";
import type { LinkedInPost } from "@/types/apify";

// ==============================================
// HELPERS
// ==============================================

function createPost(overrides: Partial<LinkedInPost> = {}): LinkedInPost {
  return {
    postUrl: "https://linkedin.com/posts/default",
    text: "Default post text",
    publishedAt: "2026-02-20T10:00:00Z",
    likesCount: 10,
    commentsCount: 2,
    ...overrides,
  };
}

// ==============================================
// detectNewPosts
// ==============================================

describe("detectNewPosts", () => {
  it("retorna posts com URLs novas", () => {
    const cached = [
      createPost({ postUrl: "https://linkedin.com/posts/old-1" }),
      createPost({ postUrl: "https://linkedin.com/posts/old-2" }),
    ];
    const fresh = [
      createPost({ postUrl: "https://linkedin.com/posts/old-1" }),
      createPost({ postUrl: "https://linkedin.com/posts/new-1" }),
      createPost({ postUrl: "https://linkedin.com/posts/new-2" }),
    ];

    const result = detectNewPosts(cached, fresh);

    expect(result).toHaveLength(2);
    expect(result[0].postUrl).toBe("https://linkedin.com/posts/new-1");
    expect(result[1].postUrl).toBe("https://linkedin.com/posts/new-2");
  });

  it("retorna array vazio se todos posts já existem no cache", () => {
    const cached = [
      createPost({ postUrl: "https://linkedin.com/posts/1" }),
      createPost({ postUrl: "https://linkedin.com/posts/2" }),
    ];
    const fresh = [
      createPost({ postUrl: "https://linkedin.com/posts/1" }),
      createPost({ postUrl: "https://linkedin.com/posts/2" }),
    ];

    const result = detectNewPosts(cached, fresh);

    expect(result).toHaveLength(0);
  });

  it("retorna todos posts se cache está vazio", () => {
    const cached: LinkedInPost[] = [];
    const fresh = [
      createPost({ postUrl: "https://linkedin.com/posts/1" }),
      createPost({ postUrl: "https://linkedin.com/posts/2" }),
      createPost({ postUrl: "https://linkedin.com/posts/3" }),
    ];

    const result = detectNewPosts(cached, fresh);

    expect(result).toHaveLength(3);
  });

  it("ignora posts sem postUrl", () => {
    const cached: LinkedInPost[] = [];
    const fresh = [
      createPost({ postUrl: "https://linkedin.com/posts/valid" }),
      createPost({ postUrl: "" }),
      createPost({ postUrl: "https://linkedin.com/posts/also-valid" }),
    ];

    const result = detectNewPosts(cached, fresh);

    expect(result).toHaveLength(2);
    expect(result[0].postUrl).toBe("https://linkedin.com/posts/valid");
    expect(result[1].postUrl).toBe("https://linkedin.com/posts/also-valid");
  });

  it("retorna array vazio se fresh está vazio", () => {
    const cached = [
      createPost({ postUrl: "https://linkedin.com/posts/1" }),
    ];

    const result = detectNewPosts(cached, []);

    expect(result).toHaveLength(0);
  });

  it("retorna array vazio se ambos estão vazios", () => {
    const result = detectNewPosts([], []);
    expect(result).toHaveLength(0);
  });
});

// ==============================================
// calculateNextRunAt
// ==============================================

describe("calculateNextRunAt", () => {
  it("adiciona 7 dias para weekly", () => {
    const from = new Date("2026-02-20T08:00:00Z");
    const result = calculateNextRunAt("weekly", from);

    expect(result.toISOString()).toBe("2026-02-27T08:00:00.000Z");
  });

  it("adiciona 14 dias para biweekly", () => {
    const from = new Date("2026-02-20T08:00:00Z");
    const result = calculateNextRunAt("biweekly", from);

    expect(result.toISOString()).toBe("2026-03-06T08:00:00.000Z");
  });

  it("usa data atual como default se fromDate não for fornecido", () => {
    const before = new Date();
    const result = calculateNextRunAt("weekly");
    const after = new Date();

    // Result should be ~7 days from now
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + sevenDaysMs - 1000
    );
    expect(result.getTime()).toBeLessThanOrEqual(
      after.getTime() + sevenDaysMs + 1000
    );
  });

  it("não modifica a data original", () => {
    const from = new Date("2026-02-20T08:00:00Z");
    const originalTime = from.getTime();

    calculateNextRunAt("weekly", from);

    expect(from.getTime()).toBe(originalTime);
  });

  it("lida com mudança de mês corretamente", () => {
    const from = new Date("2026-02-25T08:00:00Z");
    const result = calculateNextRunAt("weekly", from);

    expect(result.toISOString()).toBe("2026-03-04T08:00:00.000Z");
  });
});
