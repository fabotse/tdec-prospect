"use server";

/**
 * Server Actions: Integration Configurations
 * Story: 2.2 - API Keys Storage & Encryption
 *
 * AC: #1 - Key encrypted before storage
 * AC: #2 - Key stored with tenant_id
 * AC: #3 - Key never returned in plain text
 * AC: #4 - Only last 4 chars shown
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { encryptApiKey, maskApiKey, decryptApiKey } from "@/lib/crypto/encryption";
import { testConnection as testServiceConnection, ERROR_MESSAGES } from "@/lib/services";
import { z } from "zod";
import {
  SERVICE_NAMES,
  type ServiceName,
  type ApiConfigResponse,
  type TestConnectionResult,
} from "@/types/integration";

// ==============================================
// VALIDATION SCHEMAS
// ==============================================

const saveApiConfigSchema = z.object({
  serviceName: z.enum(SERVICE_NAMES, {
    message: "Serviço inválido. Valores permitidos: apollo, signalhire, snovio, instantly",
  }),
  apiKey: z
    .string()
    .min(8, "API key deve ter no mínimo 8 caracteres")
    .max(500, "API key excede o tamanho máximo"),
});

const deleteApiConfigSchema = z.object({
  serviceName: z.enum(SERVICE_NAMES, {
    message: "Serviço inválido",
  }),
});

// ==============================================
// RESULT TYPES
// ==============================================

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ==============================================
// GET CONFIGS ACTION
// ==============================================

/**
 * Get all integration configs for current tenant
 * Returns masked keys only (never plain text)
 */
export async function getApiConfigs(): Promise<
  ActionResult<ApiConfigResponse[]>
> {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 2. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem visualizar configurações",
      };
    }

    // 3. Fetch configs from database
    const supabase = await createClient();
    const { data: configs, error } = await supabase
      .from("api_configs")
      .select("service_name, key_suffix, updated_at")
      .eq("tenant_id", profile.tenant_id);

    if (error) {
      console.error("Error fetching api_configs:", error);
      return { success: false, error: "Erro ao buscar configurações" };
    }

    // 4. Build response with all services (configured or not)
    const configMap = new Map(
      configs?.map((c) => [c.service_name, c]) ?? []
    );

    const response: ApiConfigResponse[] = SERVICE_NAMES.map((serviceName) => {
      const config = configMap.get(serviceName);

      if (config) {
        // AC #4: Show last 4 chars for verification using stored key_suffix
        const maskedKey = config.key_suffix
          ? `••••••••${config.key_suffix}`
          : "••••••••••••";

        return {
          serviceName,
          isConfigured: true,
          maskedKey,
          updatedAt: config.updated_at,
        };
      }

      return {
        serviceName,
        isConfigured: false,
        maskedKey: null,
        updatedAt: null,
      };
    });

    return { success: true, data: response };
  } catch (error) {
    console.error("getApiConfigs error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// SAVE CONFIG ACTION
// ==============================================

interface SaveConfigResult {
  serviceName: string;
  maskedKey: string;
  updatedAt: string;
}

/**
 * Save or update an integration API key
 * Key is encrypted before storage
 */
export async function saveApiConfig(
  serviceName: ServiceName,
  apiKey: string
): Promise<ActionResult<SaveConfigResult>> {
  try {
    // 1. Validate input
    const validation = saveApiConfigSchema.safeParse({ serviceName, apiKey });
    if (!validation.success) {
      const message = validation.error.issues[0]?.message ?? "Dados inválidos";
      return { success: false, error: message };
    }

    // 2. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 3. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem configurar integrações",
      };
    }

    // 4. Encrypt the API key
    let encryptedKey: string;
    try {
      encryptedKey = encryptApiKey(apiKey);
    } catch (error) {
      console.error("Encryption error:", error);
      return { success: false, error: "Erro ao criptografar a chave" };
    }

    // 5. Extract last 4 chars for verification (AC #4)
    const keySuffix = apiKey.slice(-4);

    // 6. Upsert config (insert or update)
    const supabase = await createClient();
    const { data: savedConfig, error } = await supabase
      .from("api_configs")
      .upsert(
        {
          tenant_id: profile.tenant_id,
          service_name: serviceName,
          encrypted_key: encryptedKey,
          key_suffix: keySuffix,
        },
        {
          onConflict: "tenant_id,service_name",
        }
      )
      .select("service_name, updated_at")
      .single();

    if (error) {
      console.error("Error saving api_config:", error);
      return { success: false, error: "Erro ao salvar configuração" };
    }

    // 7. Return response with masked key (last 4 chars)
    const maskedKey = maskApiKey(apiKey, 4);

    return {
      success: true,
      data: {
        serviceName: savedConfig.service_name,
        maskedKey,
        updatedAt: savedConfig.updated_at,
      },
    };
  } catch (error) {
    console.error("saveApiConfig error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// DELETE CONFIG ACTION
// ==============================================

/**
 * Delete an integration API key
 */
export async function deleteApiConfig(
  serviceName: ServiceName
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    // 1. Validate input
    const validation = deleteApiConfigSchema.safeParse({ serviceName });
    if (!validation.success) {
      const message = validation.error.issues[0]?.message ?? "Dados inválidos";
      return { success: false, error: message };
    }

    // 2. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 3. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem remover configurações",
      };
    }

    // 4. Delete config
    const supabase = await createClient();
    const { error } = await supabase
      .from("api_configs")
      .delete()
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", serviceName);

    if (error) {
      console.error("Error deleting api_config:", error);
      return { success: false, error: "Erro ao remover configuração" };
    }

    return { success: true, data: { deleted: true } };
  } catch (error) {
    console.error("deleteApiConfig error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// TEST CONNECTION ACTION (Story 2.3)
// ==============================================

/**
 * Test connection to an external service
 * Story: 2.3 - Integration Connection Testing
 *
 * AC: #1 - Test request to API
 * AC: #2 - Status of each service
 */
export async function testApiConnection(
  serviceName: ServiceName
): Promise<ActionResult<TestConnectionResult>> {
  try {
    // 1. Validate input
    const validation = deleteApiConfigSchema.safeParse({ serviceName });
    if (!validation.success) {
      const message = validation.error.issues[0]?.message ?? "Dados inválidos";
      return { success: false, error: message };
    }

    // 2. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 3. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem testar conexões",
      };
    }

    // 4. Fetch encrypted key from database
    const supabase = await createClient();
    const { data: config, error: fetchError } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("tenant_id", profile.tenant_id)
      .eq("service_name", serviceName)
      .single();

    if (fetchError || !config) {
      return {
        success: false,
        error: "API key não configurada para este serviço",
      };
    }

    // 5. Decrypt API key
    let apiKey: string;
    try {
      apiKey = decryptApiKey(config.encrypted_key);
    } catch {
      return {
        success: false,
        error: "Erro ao descriptografar a API key. Reconfigure a chave.",
      };
    }

    // 6. Test connection using service
    const result = await testServiceConnection(serviceName, apiKey);

    // 7. Return result
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("testApiConnection error:", error);
    return {
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    };
  }
}
