/**
 * Account Dossier Lookup API Route (somente leitura)
 * GET /api/account-dossiers/lookup?executionId=&leadId=&apolloId=&email=
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade
 *
 * Usa o client de SESSAO (RLS da 00073 e de agent_executions) + `.eq("tenant_id")`.
 * Nao grava nada, nao chama servico externo e nao registra custo.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { lookupAccountDossier } from "@/lib/agent/dossier/dossier-lookup";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_MAX = 320;
const APOLLO_ID_MAX = 100;

function validationError(message: string) {
  return NextResponse.json({ error: { code: "VALIDATION_ERROR", message } }, { status: 400 });
}

function internalError() {
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar o dossie" } },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
        { status: 401 }
      );
    }

    const search = request.nextUrl.searchParams;
    const executionId = search.get("executionId")?.trim() || null;
    const leadId = search.get("leadId")?.trim() || null;
    const apolloId = search.get("apolloId")?.trim() || null;
    const email = search.get("email")?.trim().toLowerCase() || null;

    if (!leadId && !apolloId && !email) {
      return validationError("Informe leadId, apolloId ou email");
    }
    if (executionId && !UUID_REGEX.test(executionId)) {
      return validationError("executionId deve ser um UUID valido");
    }
    if (leadId && !UUID_REGEX.test(leadId)) {
      return validationError("leadId deve ser um UUID valido");
    }
    if (email && email.length > EMAIL_MAX) {
      return validationError("email muito longo");
    }
    if (apolloId && apolloId.length > APOLLO_ID_MAX) {
      return validationError("apolloId muito longo");
    }

    const supabase = await createClient();
    const result = await lookupAccountDossier(supabase, profile.tenant_id, {
      executionId,
      leadId,
      apolloId,
      email,
    });

    if ("error" in result) {
      console.error("[account-dossiers/lookup] erro na leitura:", result.error);
      return internalError();
    }
    if (result.executionNotFound) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Execucao nao encontrada" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: result.view });
  } catch (error) {
    console.error("[account-dossiers/lookup] erro inesperado:", error);
    return internalError();
  }
}
