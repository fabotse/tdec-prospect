/**
 * POST /api/ai/review-email — Story 24.9
 *
 * Revisor automatico de copy para o editor manual. Recebe o e-mail recem-gerado,
 * revisa (e se preciso reescreve) e devolve o texto + status.
 *
 * Body: { subject, body, emailMode, productId?, variables?, emailPosition? }
 * Resposta: { data: { subject, body, status, reasons } }
 *
 * Fail-open: sem chave OpenAI -> 200 com `not_reviewed` e o texto enviado (sem chamada,
 * sem log). O revisor nunca lanca; falha dele tambem vira `not_reviewed`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { readServiceApiKey } from "@/lib/agent/service-keys";
import { createClient } from "@/lib/supabase/server";
import { reviewEmailCopy, logCopyReview } from "@/lib/ai/copy-reviewer";
import { transformProductRow, type ProductRow } from "@/types/product";
import type { APIErrorResponse } from "@/types/api";
import type { CopyReviewStatus } from "@/types/copy-review";

// Pior caso: 5 chamadas sequenciais com timeout interno de 20s cada (copy-review-config),
// ou seja ~100s. 60s cortaria a rota no meio e o cliente perderia o resultado.
export const maxDuration = 120;

const reviewEmailRequestSchema = z.object({
  subject: z.string().min(1).max(1000),
  body: z.string().min(1).max(20000),
  emailMode: z.enum(["initial", "follow-up"]),
  productId: z.string().nullable().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  emailPosition: z.number().int().min(0).optional(),
});

export interface ReviewEmailResponse {
  data: {
    subject: string;
    body: string;
    status: CopyReviewStatus;
    reasons: string[];
  };
}

async function getProductById(productId: string, tenantId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("tenant_id", tenantId)
      .single();
    if (error || !data) return null;
    return transformProductRow(data as ProductRow);
  } catch {
    return null;
  }
}

function readVar(variables: Record<string, unknown> | undefined, key: string): string {
  const value = variables?.[key];
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json<APIErrorResponse>(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }
  const tenantId = profile.tenant_id;
  if (!tenantId) {
    return NextResponse.json<APIErrorResponse>(
      { error: { code: "FORBIDDEN", message: "Tenant não encontrado" } },
      { status: 403 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json<APIErrorResponse>(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos." } },
      { status: 400 }
    );
  }

  const parsed = reviewEmailRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json<APIErrorResponse>(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos." } },
      { status: 400 }
    );
  }

  const { subject, body, emailMode, productId, variables, emailPosition } = parsed.data;

  const notReviewed = NextResponse.json<ReviewEmailResponse>({
    data: { subject, body, status: "not_reviewed", reasons: [] },
  });

  let lookup: Awaited<ReturnType<typeof readServiceApiKey>>;
  try {
    lookup = await readServiceApiKey(tenantId, "openai");
  } catch {
    return notReviewed;
  }
  if (lookup.status !== "ok") {
    return notReviewed;
  }

  let productName = readVar(variables, "product_name");
  let productDescription = readVar(variables, "product_description");
  if (productId) {
    const product = await getProductById(productId, tenantId);
    if (product) {
      productName = product.name;
      productDescription = product.description;
    }
  }

  const targetTitles = readVar(variables, "target_titles");
  const targetIndustries = readVar(variables, "target_industries");
  const audience = [
    targetTitles ? `Cargos: ${targetTitles}` : "",
    targetIndustries ? `Setores: ${targetIndustries}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const result = await reviewEmailCopy(
    {
      subject,
      body,
      emailMode,
      context: {
        audience,
        productName,
        productDescription,
        targetIndustries,
        painPoints: readVar(variables, "pain_points"),
        icpSummary: readVar(variables, "icp_summary"),
        authorizedProofs: readVar(variables, "authorized_proofs"),
      },
    },
    { apiKey: lookup.apiKey }
  );

  await logCopyReview(result, { tenantId, source: "manual", emailPosition: emailPosition ?? 0 });

  return NextResponse.json<ReviewEmailResponse>({
    data: {
      subject: result.subject,
      body: result.body,
      status: result.status,
      reasons: result.reasons,
    },
  });
}
