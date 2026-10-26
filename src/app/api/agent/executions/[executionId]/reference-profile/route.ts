/**
 * API Route: POST /api/agent/executions/[executionId]/reference-profile
 * Story 24.18: Contas parecidas com os melhores clientes.
 *
 * So roda pelo clique em "Analisar" no card com o custo. Enriquece 3-5 empresas de
 * referencia na Apollo (Organization Enrichment, 1 credito por empresa encontrada) e
 * devolve o perfil comum derivado de forma deterministica (`deriveReferenceProfile`).
 * Loga 1 linha em `api_usage_logs` com tenant e execucao.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { getInjectableServiceApiKey } from "@/lib/agent/service-keys";
import { ApolloService } from "@/lib/services/apollo";
import { ExternalServiceError } from "@/lib/services/base-service";
import { CostEstimatorService } from "@/lib/services/agent-cost-estimator";
import { resolveUnitPrices } from "@/lib/agent/agent-pricing";
import { logAgentUsage } from "@/lib/agent/agent-usage";
import { normalizeDomain, TARGET_ACCOUNT_NAME_MAX } from "@/lib/agent/target-accounts";
import {
  REFERENCE_MAX,
  REFERENCE_MIN,
  deriveReferenceProfile,
  sizeBucketFor,
  type DerivedReferenceProfile,
} from "@/lib/agent/reference-accounts";
import type { ReferenceCompany } from "@/types/agent";
import type { ApolloEnrichedOrganization } from "@/types/apollo";

const requestSchema = z.object({
  references: z
    .array(
      z.object({
        name: z.string().max(TARGET_ACCOUNT_NAME_MAX).nullable().optional(),
        domain: z.string().refine((d) => normalizeDomain(d) !== null, "Dominio invalido"),
      })
    )
    .min(REFERENCE_MIN)
    .max(REFERENCE_MAX),
});

export type ReferenceProfileResponse = DerivedReferenceProfile;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function clip(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max).trim();
  return trimmed || null;
}

/** Empresa de referencia a partir da organizacao enriquecida (null = sem dados). */
function toReferenceCompany(
  reference: { name: string | null; domain: string },
  org: ApolloEnrichedOrganization | null
): ReferenceCompany {
  const employees =
    typeof org?.estimated_num_employees === "number" &&
    Number.isFinite(org.estimated_num_employees) &&
    org.estimated_num_employees >= 0
      ? Math.round(org.estimated_num_employees)
      : null;
  return {
    name: reference.name ?? clip(org?.name, TARGET_ACCOUNT_NAME_MAX),
    domain: reference.domain,
    industry: clip(org?.industry),
    employees,
    sizeBucket: sizeBucketFor(employees),
    city: clip(org?.city),
    state: clip(org?.state),
    country: clip(org?.country),
    technologies: Array.isArray(org?.technology_names)
      ? Array.from(
          new Set(
            org.technology_names
              .map((t) => clip(t))
              .filter((t): t is string => Boolean(t))
          )
        ).slice(0, 200)
      : [],
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) return errorResponse(401, "UNAUTHORIZED", "Nao autenticado");

  const { executionId } = await params;
  if (!z.string().uuid().safeParse(executionId).success) {
    return errorResponse(400, "VALIDATION_ERROR", "Execucao invalida");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "JSON invalido");
  }

  const validation = requestSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `Informe de ${REFERENCE_MIN} a ${REFERENCE_MAX} clientes de referencia com site valido.`
    );
  }

  // Dominios normalizados e sem duplicata (a 1a ocorrencia vence).
  const seen = new Set<string>();
  const references: Array<{ name: string | null; domain: string }> = [];
  for (const ref of validation.data.references) {
    const domain = normalizeDomain(ref.domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    references.push({ name: clip(ref.name, TARGET_ACCOUNT_NAME_MAX), domain });
  }
  if (references.length < REFERENCE_MIN) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `Informe de ${REFERENCE_MIN} a ${REFERENCE_MAX} clientes de referencia diferentes.`
    );
  }

  const supabase = await createClient();
  const { data: execution, error: execError } = await supabase
    .from("agent_executions")
    .select("id")
    .eq("id", executionId)
    .eq("tenant_id", profile.tenant_id)
    .single();
  if (execError || !execution) {
    return errorResponse(404, "EXECUTION_NOT_FOUND", "Execucao nao encontrada");
  }

  let apiKey: string | undefined;
  try {
    apiKey = await getInjectableServiceApiKey(profile.tenant_id, "apollo", "Apollo");
  } catch {
    return errorResponse(500, "API_KEY_ERROR", "Erro ao decriptar a chave da Apollo. Reconfigure em Integracoes.");
  }
  if (!apiKey) {
    return errorResponse(422, "API_KEY_MISSING", "Chave da Apollo nao configurada. Configure em Integracoes.");
  }

  const service = new ApolloService(profile.tenant_id, apiKey);
  const start = Date.now();
  const settled = await Promise.allSettled(
    references.map((ref) => service.enrichOrganization(ref.domain))
  );
  const durationMs = Date.now() - start;

  const organizations = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
  const found = organizations.filter(Boolean).length;
  const allFailed = settled.every((r) => r.status === "rejected");

  let apolloPrice = resolveUnitPrices(null).apollo;
  try {
    apolloPrice = resolveUnitPrices(await CostEstimatorService.getCostModels(supabase)).apollo;
  } catch {
    // preco default
  }

  const firstError = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
  await logAgentUsage({
    tenantId: profile.tenant_id,
    executionId,
    serviceName: "apollo",
    requestType: "organization_enrich",
    status: allFailed ? "failed" : "success",
    calls: references.length,
    durationMs,
    estimatedCost: found * apolloPrice,
    errorMessage: allFailed
      ? firstError?.reason instanceof Error
        ? firstError.reason.message
        : "Erro Apollo"
      : undefined,
    metadata: { found, domains: references.map((r) => r.domain) },
  });

  if (allFailed) {
    const reason = firstError?.reason;
    // Chave recusada pela Apollo vira 422 (401 nesta API = sem sessao); o resto, 502.
    if (
      reason instanceof ExternalServiceError &&
      (reason.statusCode === 401 || reason.statusCode === 403)
    ) {
      return errorResponse(
        422,
        "APOLLO_KEY_INVALID",
        "A chave da Apollo foi recusada. Confira a chave em Integracoes."
      );
    }
    const message =
      reason instanceof ExternalServiceError
        ? reason.userMessage
        : "Nao consegui consultar a Apollo agora. Tente novamente em alguns minutos.";
    return errorResponse(502, "APOLLO_ERROR", message);
  }

  const companies = references.map((ref, i) => toReferenceCompany(ref, organizations[i]));
  const derived: ReferenceProfileResponse = deriveReferenceProfile(companies, found);
  return NextResponse.json(derived);
}
