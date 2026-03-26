/**
 * Shared utilities for pipeline steps
 */

import { decryptApiKey } from "@/lib/crypto/encryption";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch and decrypt API key from api_configs table.
 * Throws if not found.
 */
export async function getServiceApiKey(
  supabase: SupabaseClient,
  tenantId: string,
  serviceName: string
): Promise<string> {
  const { data: apiConfig } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("service_name", serviceName)
    .single();

  if (!apiConfig) {
    throw new Error(`API key do ${serviceName === "instantly" ? "Instantly" : serviceName} nao configurada`);
  }

  return decryptApiKey(apiConfig.encrypted_key);
}
