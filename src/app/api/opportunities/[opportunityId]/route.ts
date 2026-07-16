import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { isValidOpportunityStatus, OPPORTUNITY_STATUS_CONFIG } from "@/types/opportunity";
import type { OpportunityStatus } from "@/types/opportunity";

/**
 * PATCH /api/opportunities/:opportunityId
 * Atualiza o status da oportunidade e aplica os efeitos da transição.
 *
 * Story 21.4: transição new→viewed (abrir card).
 * Story 21.5: efeitos de triagem —
 *  - guarda de state-machine: bloqueia regressões que ressuscitariam o card;
 *  - `meeting_booked` grava `meeting_booked_at` (atômico com o status);
 *  - `meeting_booked` promove o lead a 'oportunidade' (efeito secundário).
 *
 * Body: { status: OpportunityStatus }
 */

/**
 * Status terminais: o card já saiu do fluxo de triagem. Voltar deles para
 * `new`/`viewed` ressuscitaria o card no badge da sidebar — é o único caminho
 * bloqueado (409). Laterais entre terminais seguem livres: o usuário pode mudar
 * de ideia (contacted ↔ discarded, meeting_booked → discarded).
 */
const TERMINAL_STATUSES: readonly OpportunityStatus[] = [
  "contacted",
  "meeting_booked",
  "discarded",
];
const REOPENING_STATUSES: readonly OpportunityStatus[] = ["new", "viewed"];

function isRegression(current: OpportunityStatus, target: OpportunityStatus): boolean {
  return TERMINAL_STATUSES.includes(current) && REOPENING_STATUSES.includes(target);
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { opportunityId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser JSON valido" } },
      { status: 400 }
    );
  }

  // request.json() aceita `null`/primitivos (JSON válidos) sem lançar — o
  // destructure de null quebraria com 500; validar que é objeto antes.
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser um objeto JSON" } },
      { status: 400 }
    );
  }

  const { status } = body as Record<string, unknown>;

  if (typeof status !== "string" || !isValidOpportunityStatus(status)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Status invalido. Use: new, viewed, contacted, meeting_booked, discarded",
        },
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Estado atual: necessário para a guarda de transição e para conhecer o lead.
  const { data: current, error: loadError } = await supabase
    .from("opportunities")
    .select("status, lead_id")
    .eq("id", opportunityId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (loadError || !current) {
    if (loadError?.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Oportunidade nao encontrada" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao carregar oportunidade" } },
      { status: 500 }
    );
  }

  const currentStatus = current.status as OpportunityStatus;

  if (isRegression(currentStatus, status)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_TRANSITION",
          // Rótulos pt-BR: o `message` vai direto para o `toast.error` do hook
          // (use-opportunities.ts), e "contacted"/"new" são valores internos.
          message: `Nao e possivel voltar uma oportunidade de "${OPPORTUNITY_STATUS_CONFIG[currentStatus].label}" para "${OPPORTUNITY_STATUS_CONFIG[status].label}".`,
        },
      },
      { status: 409 }
    );
  }

  const isBookingMeeting = status === "meeting_booked";

  // O CARIMBO só é escrito ao ENTRAR em meeting_booked vindo de OUTRO status.
  // As Dev Notes exigem "uma vez": as laterais entre terminais são livres, então
  // `meeting_booked → discarded → meeting_booked` é alcançável pela UI e
  // reescreveria o carimbo original — o histórico serve o ROI (Epic 23).
  // A PROMOÇÃO do lead abaixo NÃO usa esta guarda: ela é idempotente e
  // promote-only, e re-marcar reunião deve reafirmar o status do lead.
  const shouldStampMeetingAt = isBookingMeeting && currentStatus !== "meeting_booked";

  const updatePayload: { status: OpportunityStatus; meeting_booked_at?: string } = {
    status,
  };
  if (shouldStampMeetingAt) {
    updatePayload.meeting_booked_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("opportunities")
    .update(updatePayload)
    .eq("id", opportunityId)
    .eq("tenant_id", profile.tenant_id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Oportunidade nao encontrada" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar oportunidade" } },
      { status: 500 }
    );
  }

  // AC4 — reunião marcada promove o lead. Efeito SECUNDÁRIO: a oportunidade já
  // foi atualizada; um erro aqui só loga (padrão do reply-classifier/import-results).
  // Idempotente e promote-only: nenhuma outra transição rebaixa o lead.
  // `leadPromoted` volta na resposta para o cliente não AFIRMAR uma promoção que
  // não aconteceu (oportunidade sem lead, ou update que falhou) — o toast do hook
  // é a única evidência que o usuário tem deste efeito invisível nesta tela.
  let leadPromoted = false;
  if (isBookingMeeting && current.lead_id) {
    try {
      const { error: leadError } = await supabase
        .from("leads")
        .update({ status: "oportunidade" })
        .eq("id", current.lead_id)
        .eq("tenant_id", profile.tenant_id);
      if (leadError) {
        console.error("[opportunities] falha ao promover lead a oportunidade:", leadError);
      } else {
        leadPromoted = true;
      }
    } catch (leadError) {
      console.error("[opportunities] falha ao promover lead a oportunidade:", leadError);
    }
  }

  // Envelope da 21.4 preservado (`{ data }`); `meta` é aditivo e opcional.
  return NextResponse.json({ data, meta: { leadPromoted } });
}
