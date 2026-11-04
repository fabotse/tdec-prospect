/**
 * FEL-57 — posts do dossie reaproveitados pelo icebreaker premium (modulo puro).
 */

import { describe, it, expect } from "vitest";
import {
  readIcebreakerPostsState,
  emptyIcebreakerPostsState,
  DOSSIER_POSTS_REUSE_MAX_AGE_MS,
  ICEBREAKER_POSTS_LIMIT,
  buildReusableEntry,
  readReusablePosts,
} from "@/lib/agent/dossier/icebreaker-posts";
import type { LinkedInPost } from "@/types/apify";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const FETCHED_AT = "2026-11-03T11:58:00.000Z";

function post(i: number, extra: Partial<LinkedInPost> = {}): LinkedInPost {
  return {
    postUrl: `https://www.linkedin.com/feed/update/${i}`,
    text: `Post ${i}`,
    publishedAt: `2026-10-0${i}T00:00:00Z`,
    likesCount: i,
    commentsCount: i * 2,
    ...extra,
  };
}

/** O que o `agent_steps.output` devolve: JSON ida e volta. */
function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("buildReusableEntry", () => {
  it("guarda so as posicoes brutas < 3, na ordem (o que a busca com limite 3 traria)", () => {
    const raw = [post(1), post(2), post(3), post(4), post(5)];
    const entry = buildReusableEntry(raw, [0, 1, 2, 3, 4], FETCHED_AT, 10);
    expect(ICEBREAKER_POSTS_LIMIT).toBe(3);
    expect(entry).toEqual({ posts: [post(1), post(2), post(3)], fetchedAt: FETCHED_AT, fetchLimit: 10 });
  });

  it("item vazio entre os 3 primeiros do dataset: [A, vazio, B, C] -> [A, B] (nunca [A, B, C])", () => {
    // O ApifyService descartou o item vazio da posicao 1: posts=[A,B,C], posicoes=[0,2,3].
    const entry = buildReusableEntry([post(1), post(2), post(3)], [0, 2, 3], FETCHED_AT, 10);
    expect(entry!.posts).toEqual([post(1), post(2)]);
  });

  it("sem posicoes coerentes nao da para garantir a equivalencia: nada guardado", () => {
    expect(buildReusableEntry([post(1)], undefined, FETCHED_AT, 10)).toBeNull();
    expect(buildReusableEntry([post(1), post(2)], [0], FETCHED_AT, 10)).toBeNull();
    expect(buildReusableEntry([post(1), post(2)], [1, 1], FETCHED_AT, 10)).toBeNull();
    expect(buildReusableEntry([post(1), post(2)], [2, 1], FETCHED_AT, 10)).toBeNull();
    expect(buildReusableEntry([post(1)], [0.5], FETCHED_AT, 10)).toBeNull();
  });

  it("busca vazia ou so com posts depois da posicao 2: nada guardado (create_campaign busca)", () => {
    expect(buildReusableEntry([], [], FETCHED_AT, 10)).toBeNull();
    expect(buildReusableEntry([post(4)], [3], FETCHED_AT, 10)).toBeNull();
  });

  it("limite da busca menor que 3 ou data invalida: nao serve de base", () => {
    expect(buildReusableEntry([post(1)], [0], FETCHED_AT, 2)).toBeNull();
    expect(buildReusableEntry([post(1)], [0], "x", 10)).toBeNull();
  });
});

describe("readReusablePosts", () => {
  const url = "https://www.linkedin.com/in/rui";

  function output(entry: unknown) {
    return viaJson({ accounts: [], icebreakerPosts: { [url]: entry } });
  }

  it("le a entrada valida (inclusive campos opcionais) igual ao que foi gravado", () => {
    const raw = [post(1, { authorName: "Rui", repostsCount: 2 }), post(2), post(3)];
    const entry = buildReusableEntry(raw, [0, 1, 2], FETCHED_AT, 10);
    const map = readReusablePosts(output(entry), NOW);
    expect(map.get(url)).toEqual(raw);
  });

  it("entrada com lista vazia e ignorada (o create_campaign busca como hoje)", () => {
    const map = readReusablePosts(output({ posts: [], fetchedAt: FETCHED_AT, fetchLimit: 10 }), NOW);
    expect(map.has(url)).toBe(false);
  });

  it("sem `icebreakerPosts`, output nulo ou formato estranho: mapa vazio", () => {
    expect(readReusablePosts(null, NOW).size).toBe(0);
    expect(readReusablePosts({ accounts: [] }, NOW).size).toBe(0);
    expect(readReusablePosts({ icebreakerPosts: [] }, NOW).size).toBe(0);
    expect(readReusablePosts({ icebreakerPosts: "x" }, NOW).size).toBe(0);
  });

  it("descarta entrada velha (> 6 h), do futuro, com limite < 3 ou com mais de 3 posts", () => {
    const old = new Date(NOW - DOSSIER_POSTS_REUSE_MAX_AGE_MS - 1000).toISOString();
    expect(readReusablePosts(output({ posts: [post(1)], fetchedAt: old, fetchLimit: 10 }), NOW).size).toBe(0);
    const future = new Date(NOW + 60 * 60 * 1000).toISOString();
    expect(readReusablePosts(output({ posts: [post(1)], fetchedAt: future, fetchLimit: 10 }), NOW).size).toBe(0);
    expect(readReusablePosts(output({ posts: [post(1)], fetchedAt: FETCHED_AT, fetchLimit: 2 }), NOW).size).toBe(0);
    expect(
      readReusablePosts(output({ posts: [post(1), post(2), post(3), post(4)], fetchedAt: FETCHED_AT, fetchLimit: 10 }), NOW).size
    ).toBe(0);
  });

  it("qualquer post malformado descarta a entrada inteira (fallback para a busca)", () => {
    const bad = { ...post(2), likesCount: "10" };
    expect(readReusablePosts(output({ posts: [post(1), bad], fetchedAt: FETCHED_AT, fetchLimit: 10 }), NOW).size).toBe(0);
    expect(readReusablePosts(output({ posts: [post(1)], fetchedAt: 123, fetchLimit: 10 }), NOW).size).toBe(0);
  });
});

describe("readIcebreakerPostsState (FEL-77)", () => {
  const NOW = Date.parse("2026-11-04T12:00:00.000Z");
  const A = "https://linkedin.com/in/a";
  const B = "https://linkedin.com/in/b";
  const POST = { postUrl: "https://linkedin.com/posts/1", text: "Post", publishedAt: "2026-11-01", likesCount: 1, commentsCount: 0 };
  const recent = new Date(NOW - 60_000).toISOString();

  it("estado vazio por padrao", () => {
    const state = emptyIcebreakerPostsState();
    expect(state.posts.size).toBe(0);
    expect(state.attempted.size).toBe(0);
  });

  it("output antigo (sem registro) ou invalido: nenhuma tentativa", () => {
    for (const output of [null, undefined, 42, "x", {}, { icebreakerPostsAttempted: null }, { icebreakerPostsAttempted: [A] }]) {
      expect(readIcebreakerPostsState(output, NOW).attempted.size).toBe(0);
    }
  });

  it("aceita os motivos conhecidos dentro de 6 h", () => {
    for (const outcome of ["empty", "failed", "timeout", "unusable", "not_saved"]) {
      const state = readIcebreakerPostsState({ icebreakerPostsAttempted: { [A]: { attemptedAt: recent, outcome } } }, NOW);
      expect([...state.attempted]).toEqual([A]);
    }
  });

  it("descarta motivo desconhecido, data invalida, mais velha que 6 h ou no futuro alem da tolerancia", () => {
    const bad = [
      { attemptedAt: recent, outcome: "outro" },
      { attemptedAt: "ontem", outcome: "empty" },
      { attemptedAt: 123, outcome: "empty" },
      { attemptedAt: new Date(NOW - 6 * 3600_000 - 1).toISOString(), outcome: "empty" },
      { attemptedAt: new Date(NOW + 10 * 60_000).toISOString(), outcome: "empty" },
      null,
    ];
    for (const entry of bad) {
      expect(readIcebreakerPostsState({ icebreakerPostsAttempted: { [A]: entry } }, NOW).attempted.size).toBe(0);
    }
  });

  it("perfil com posts reaproveitaveis nao conta como tentado; outros perfis sim", () => {
    const output = {
      icebreakerPosts: { [A]: { posts: [POST], fetchedAt: recent, fetchLimit: 10 } },
      icebreakerPostsAttempted: {
        [A]: { attemptedAt: recent, outcome: "failed" },
        [B]: { attemptedAt: recent, outcome: "empty" },
      },
    };
    const state = readIcebreakerPostsState(output, NOW);
    expect(state.posts.get(A)).toEqual([POST]);
    expect([...state.attempted]).toEqual([B]);
  });
});
