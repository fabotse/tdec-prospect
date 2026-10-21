/**
 * API Route: GET /api/agent/briefing/icp-proposal
 * Story: 24.14 - Briefing a partir do ICP
 *
 * Devolve a proposta de briefing montada a partir do ICP do tenant (ou `null` quando o
 * ICP nao tem cargos). Deterministico: sem LLM nem servico pago. O ICP e lido por
 * service-role (`readTenantICP`) porque o SDR nao le a `knowledge_base` por RLS.
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { readTenantICP } from "@/lib/agent/contextual-suggestions";
import { buildIcpProposal } from "@/lib/agent/icp-briefing";
import type { ParsedBriefing } from "@/types/agent";

export interface IcpProposalResponse {
  data: { proposal: ParsedBriefing | null };
}

export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Fail-open: leitura falha -> ICP vazio -> proposta null.
  const icp = await readTenantICP(profile.tenant_id);
  const body: IcpProposalResponse = { data: { proposal: buildIcpProposal(icp) } };
  return NextResponse.json(body);
}
