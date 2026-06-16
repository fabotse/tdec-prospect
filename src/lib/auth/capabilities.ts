/**
 * Auth capabilities
 * Epic: 20 - Níveis de Acesso
 * Story: 20.1 - Modelo de três papéis (enum, migração e RLS)
 *
 * Fonte de verdade de capacidade administrativa (AD-2). Capacidade NUNCA deve
 * ser checada por `role === X` solto no código de aplicação — sempre via este helper.
 * Futuro Diretor (capacidade distinta) = nova função aqui, nunca um literal espalhado.
 */

import type { UserRole } from "@/types/database";

/** Papéis com acesso administrativo (hoje Gestor e Diretor são idênticos). */
export const ADMIN_ROLES = ["gestor", "diretor"] as const satisfies readonly UserRole[];

/**
 * TRUE se o papel tem acesso administrativo. Ponto único de mudança (futuro Diretor).
 * Derivado de ADMIN_ROLES para manter uma única fonte de verdade: adicionar um papel
 * admin-capaz ao array acima passa a valer aqui automaticamente (sem literal duplicado).
 */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role != null && (ADMIN_ROLES as readonly UserRole[]).includes(role);
}
