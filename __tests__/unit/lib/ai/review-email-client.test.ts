/**
 * Review Email Client Tests — Story 24.9
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestEmailReview } from "@/lib/ai/review-email-client";

const PARAMS = {
  subject: "Assunto",
  body: "Corpo",
  emailMode: "initial" as const,
  productId: "p1",
  variables: { target_titles: "CTO" },
  emailPosition: 1,
};

describe("requestEmailReview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sucesso: devolve o texto e o status da rota", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { subject: "Novo", body: "Novo corpo", status: "rewritten", reasons: [] },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await requestEmailReview(PARAMS);

    expect(result).toEqual({ subject: "Novo", body: "Novo corpo", status: "rewritten", reasons: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/review-email",
      expect.objectContaining({ method: "POST", body: JSON.stringify(PARAMS) })
    );
  });

  it("nao-2xx: not_reviewed com o texto enviado", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "x" } }),
    }) as unknown as typeof fetch;

    const result = await requestEmailReview(PARAMS);
    expect(result).toEqual({ subject: "Assunto", body: "Corpo", status: "not_reviewed", reasons: [] });
  });

  it("erro de rede: not_reviewed, nunca lanca", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    await expect(requestEmailReview(PARAMS)).resolves.toMatchObject({
      status: "not_reviewed",
      body: "Corpo",
    });
  });

  it("payload inesperado ou texto vazio: not_reviewed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { subject: "", body: "x", status: "approved" } }),
    }) as unknown as typeof fetch;
    expect((await requestEmailReview(PARAMS)).status).toBe("not_reviewed");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { subject: "a", body: "b", status: "bogus" } }),
    }) as unknown as typeof fetch;
    expect((await requestEmailReview(PARAMS)).status).toBe("not_reviewed");
  });
});
