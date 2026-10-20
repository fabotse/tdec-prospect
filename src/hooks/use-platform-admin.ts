/**
 * Platform Admin Hook
 * Story 23.3: só o operador da plataforma vê Configurações → Erros.
 *
 * TanStack Query hook para a RPC `is_platform_admin` (migration 00068). Fail-closed.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";

export const PLATFORM_ADMIN_KEY = ["auth", "platform-admin"];

export function usePlatformAdmin() {
  return useQuery({
    queryKey: PLATFORM_ADMIN_KEY,
    queryFn: () => isPlatformAdmin(createClient()),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
