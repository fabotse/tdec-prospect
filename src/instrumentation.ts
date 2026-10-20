/**
 * Next.js instrumentation
 * Story 23.3: exceções não capturadas em rotas, páginas e server actions vão para
 * `error_logs` (Configurações → Erros), além do log da Vercel.
 *
 * Só no runtime Node.js: o logger usa o client service-role do Supabase.
 */

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { logServerError } = await import("@/lib/services/error-logger");
    await logServerError({
      source: context.routeType === "route" ? "api" : "server",
      route: context.routePath || "desconhecida",
      error: err,
    });
  } catch (loggerError) {
    console.error("[instrumentation] onRequestError falhou:", loggerError);
  }
};
