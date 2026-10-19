/**
 * Review Email Client — Story 24.9
 *
 * Cliente da rota `POST /api/ai/review-email` (editor manual). Nunca lanca: qualquer
 * falha (rede, abort, nao-2xx, payload inesperado) devolve `not_reviewed` com o texto
 * enviado, para a geracao seguir igual.
 */

import { isCopyReviewStatus, type CopyReviewStatus } from "@/types/copy-review";

export interface RequestEmailReviewParams {
  subject: string;
  body: string;
  emailMode: "initial" | "follow-up";
  productId?: string | null;
  variables?: Record<string, string>;
  emailPosition?: number;
}

export interface EmailReviewOutcome {
  subject: string;
  body: string;
  status: CopyReviewStatus;
  reasons: string[];
}

export async function requestEmailReview(
  params: RequestEmailReviewParams,
  signal?: AbortSignal
): Promise<EmailReviewOutcome> {
  const fallback: EmailReviewOutcome = {
    subject: params.subject,
    body: params.body,
    status: "not_reviewed",
    reasons: [],
  };

  try {
    const response = await fetch("/api/ai/review-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
    if (!response.ok) return fallback;

    const json = (await response.json()) as { data?: Partial<EmailReviewOutcome> } | null;
    const data = json?.data;
    if (
      !data ||
      typeof data.subject !== "string" ||
      typeof data.body !== "string" ||
      !isCopyReviewStatus(data.status) ||
      !data.subject.trim() ||
      !data.body.trim()
    ) {
      return fallback;
    }

    return {
      subject: data.subject,
      body: data.body,
      status: data.status,
      reasons: Array.isArray(data.reasons)
        ? data.reasons.filter((r): r is string => typeof r === "string")
        : [],
    };
  } catch {
    return fallback;
  }
}
