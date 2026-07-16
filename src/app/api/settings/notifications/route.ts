/**
 * API Route: Notification Settings (Loop de Resposta)
 * Story: 21.7 - Notificações Proativas + Configurações (AC3)
 *
 * Writer de `notification_settings` (1 por tenant). Clona o padrão de settings per-tenant de
 * `api/settings/monitoring/route.ts`: auth → hasAdminAccess 403 → zod → upsert onConflict.
 *
 * GET: retorna a linha do tenant (ou DEFAULT_NOTIFICATION_SETTINGS quando PGRST116).
 * PUT: valida (E.164, canais, intents) e faz upsert onConflict: "tenant_id".
 *
 * Admin-only: o middleware já gateia /settings/* [middleware.ts], mas mantemos o check
 * explícito na rota (defesa em profundidade, padrão do projeto). O opt-in de WhatsApp p/
 * engajamento (AC5) vive no JSONB `channels.whatsapp_engagement` — ZERO migration.
 */

import { hasAdminAccess } from "@/lib/auth/capabilities";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { z } from "zod";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  isValidOpportunityIntent,
  toNotificationSettings,
  type NotificationSettingsRow,
  type OpportunityIntent,
} from "@/types/opportunity";

// ==============================================
// VALIDATION SCHEMA (camelCase de entrada; persiste snake_case)
// ==============================================

/** Sanitiza p/ dígitos (Z-API espera só dígitos, ex.: "5511999999999"). */
function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** E.164 sem o "+" após sanitizar: 10–15 dígitos. */
const E164_DIGITS = /^\d{10,15}$/;

const updateSettingsSchema = z.object({
  whatsappNumbers: z
    .array(z.string())
    .max(20, { message: "Máximo de 20 números de WhatsApp" })
    .default([]),
  channels: z.object({
    whatsapp: z.boolean(),
    inApp: z.boolean(),
    whatsappEngagement: z.boolean(),
  }),
  notifyIntents: z
    .array(z.string())
    .refine((arr) => arr.every((i) => isValidOpportunityIntent(i)), {
      message: "Intenção inválida em notify_intents",
    })
    .default([]),
});

// ==============================================
// ERROR RESPONSES
// ==============================================

function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

// ==============================================
// GET /api/settings/notifications
// ==============================================

export async function GET() {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return errorResponse("UNAUTHORIZED", "Não autenticado", 401);
    }
    if (!hasAdminAccess(profile.role)) {
      return errorResponse(
        "FORBIDDEN",
        "Apenas administradores podem visualizar configurações de notificações",
        403
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (error && error.code !== "PGRST116") {
      return errorResponse("INTERNAL_ERROR", "Erro ao buscar configurações de notificações", 500);
    }

    if (!data) {
      return NextResponse.json({
        data: {
          settings: {
            id: null,
            tenantId: profile.tenant_id,
            ...DEFAULT_NOTIFICATION_SETTINGS,
            createdAt: null,
            updatedAt: null,
          },
          exists: false,
        },
      });
    }

    return NextResponse.json({
      data: {
        settings: toNotificationSettings(data as NotificationSettingsRow),
        exists: true,
      },
    });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
}

// ==============================================
// PUT /api/settings/notifications
// ==============================================

export async function PUT(request: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();
    if (!profile) {
      return errorResponse("UNAUTHORIZED", "Não autenticado", 401);
    }
    if (!hasAdminAccess(profile.role)) {
      return errorResponse(
        "FORBIDDEN",
        "Apenas administradores podem alterar configurações de notificações",
        403
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Corpo da requisição inválido", 400);
    }

    const validation = updateSettingsSchema.safeParse(body);
    if (!validation.success) {
      const message = validation.error.issues[0]?.message ?? "Dados inválidos";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const { whatsappNumbers, channels, notifyIntents } = validation.data;

    // Sanitiza + valida cada número (E.164 em dígitos). Rejeita payload inválido com 400 pt-BR.
    const sanitizedNumbers: string[] = [];
    for (const raw of whatsappNumbers) {
      const sanitized = sanitizePhone(raw);
      if (!E164_DIGITS.test(sanitized)) {
        return errorResponse(
          "VALIDATION_ERROR",
          `Número de WhatsApp inválido: "${raw}". Use o formato E.164 (ex.: 5511999999999).`,
          400
        );
      }
      // Dedup silencioso (mantém a ordem).
      if (!sanitizedNumbers.includes(sanitized)) sanitizedNumbers.push(sanitized);
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notification_settings")
      .upsert(
        {
          tenant_id: profile.tenant_id,
          whatsapp_numbers: sanitizedNumbers,
          channels: {
            whatsapp: channels.whatsapp,
            in_app: channels.inApp,
            whatsapp_engagement: channels.whatsappEngagement,
          },
          notify_intents: notifyIntents as OpportunityIntent[],
        },
        { onConflict: "tenant_id" }
      )
      .select("*")
      .single();

    if (error) {
      return errorResponse("INTERNAL_ERROR", "Erro ao salvar configurações de notificações", 500);
    }

    return NextResponse.json({
      data: {
        settings: toNotificationSettings(data as NotificationSettingsRow),
        exists: true,
      },
    });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Erro interno do servidor", 500);
  }
}
