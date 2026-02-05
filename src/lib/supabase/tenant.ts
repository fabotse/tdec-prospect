import { createClient } from "./server";
import type { Profile } from "@/types/database";

/**
 * Server-side helpers for tenant context
 * Story: 1.5 - Multi-tenant Database Structure & RLS
 *
 * AC: #1 - queries automatically filtered by tenant_id
 * AC: #5 - RLS policies automatically filter by tenant_id
 */

/**
 * Get the current authenticated user's profile
 * Returns null if not authenticated or profile not found
 */
export async function getCurrentUserProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

/**
 * Get the current user's tenant_id
 * Returns null if not authenticated or profile not found
 *
 * AC: #1 - tenant_id used for filtering queries
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const profile = await getCurrentUserProfile();
  return profile?.tenant_id ?? null;
}

/**
 * Check if the current user has admin role
 * Returns false if not authenticated
 *
 * AC: #6 - Admin role differentiated from User role (FR37)
 */
export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentUserProfile();
  return profile?.role === "admin";
}

/**
 * Get the current user's role
 * Returns null if not authenticated
 */
export async function getCurrentUserRole(): Promise<string | null> {
  const profile = await getCurrentUserProfile();
  return profile?.role ?? null;
}

/**
 * Get the current user's tenant information
 * Returns null if not authenticated or tenant not found
 */
export async function getCurrentTenant() {
  const supabase = await createClient();
  const tenantId = await getCurrentTenantId();

  if (!tenantId) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();

  return tenant;
}
