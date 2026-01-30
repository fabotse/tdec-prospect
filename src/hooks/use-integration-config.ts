"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  saveApiConfig,
  getApiConfigs,
  deleteApiConfig,
  testApiConnection,
} from "@/actions/integrations";
import type {
  ServiceName,
  ApiConfigResponse,
  IntegrationStatus,
  ConnectionStatus,
  TestConnectionResult,
} from "@/types/integration";

/**
 * Timeout for API calls in milliseconds
 * Prevents infinite loading states if server doesn't respond
 */
const API_TIMEOUT_MS = 15000;

/**
 * Wrap a promise with a timeout
 * Rejects if the promise doesn't resolve within the timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Timeout: operação demorou muito para responder"));
    }, ms);

    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error("Operação cancelada"));
      });
    }

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Integration config state for a single service
 * Updated in Story 2.3 to include connection test state
 */
interface IntegrationConfigState {
  status: IntegrationStatus;
  maskedKey: string | null;
  updatedAt: string | null;
  isSaving: boolean;
  // Story 2.3 additions
  connectionStatus: ConnectionStatus;
  lastTestResult: TestConnectionResult | null;
}

/**
 * All integration configs
 */
type IntegrationConfigs = Record<ServiceName, IntegrationConfigState>;

const initialConfig: IntegrationConfigState = {
  status: "not_configured",
  maskedKey: null,
  updatedAt: null,
  isSaving: false,
  // Story 2.3 additions
  connectionStatus: "untested",
  lastTestResult: null,
};

const initialConfigs: IntegrationConfigs = {
  apollo: { ...initialConfig },
  signalhire: { ...initialConfig },
  snovio: { ...initialConfig },
  instantly: { ...initialConfig },
};

/**
 * Hook for managing integration configuration state
 * Story: 2.2 - API Keys Storage & Encryption
 *
 * AC: #3 - Key never returned in plain text (uses server actions)
 * AC: #4 - Only last 4 chars shown (masked key from server)
 */
export function useIntegrationConfig() {
  const [configs, setConfigs] = useState<IntegrationConfigs>(initialConfigs);
  const [isLoading, setIsLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Fetch configs on mount
   */
  useEffect(() => {
    console.log("[useIntegrationConfig] useEffect triggered - starting loadConfigs");
    // Cancel any previous pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    let isMounted = true;

    async function loadConfigs() {
      console.log("[useIntegrationConfig] loadConfigs() called");
      const startTime = Date.now();
      setIsLoading(true);
      try {
        console.log("[useIntegrationConfig] Calling getApiConfigs server action...");
        const result = await withTimeout(getApiConfigs(), API_TIMEOUT_MS, signal);
        console.log(`[useIntegrationConfig] getApiConfigs returned in ${Date.now() - startTime}ms`, {
          success: result.success,
          error: !result.success ? result.error : undefined
        });

        if (!isMounted || signal.aborted) {
          console.log("[useIntegrationConfig] Aborted or unmounted, ignoring result");
          return;
        }

        if (result.success) {
          console.log("[useIntegrationConfig] Success - updating configs");
          setConfigs((prev) => {
            const updated = { ...prev };
            result.data.forEach((config: ApiConfigResponse) => {
              updated[config.serviceName] = {
                status: config.isConfigured ? "configured" : "not_configured",
                maskedKey: config.maskedKey,
                updatedAt: config.updatedAt,
                isSaving: false,
                // Preserve connection test state
                connectionStatus: prev[config.serviceName]?.connectionStatus ?? "untested",
                lastTestResult: prev[config.serviceName]?.lastTestResult ?? null,
              };
            });
            return updated;
          });
        } else {
          // On error, keep initial state but don't show error toast
          // (user might not be admin or not authenticated yet)
          console.error("[useIntegrationConfig] Failed to load configs:", result.error);
        }
      } catch (error) {
        if (!isMounted || signal.aborted) {
          console.log("[useIntegrationConfig] Caught error but aborted/unmounted");
          return;
        }

        // Only log if not aborted
        if (error instanceof Error && error.message !== "Operação cancelada") {
          console.error("[useIntegrationConfig] Error loading configs:", error);
        }
      } finally {
        if (isMounted && !signal.aborted) {
          console.log(`[useIntegrationConfig] Setting isLoading=false (total: ${Date.now() - startTime}ms)`);
          setIsLoading(false);
        }
      }
    }

    loadConfigs();

    return () => {
      console.log("[useIntegrationConfig] Cleanup - aborting and unmounting");
      isMounted = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  /**
   * Save an API key configuration
   */
  const saveConfig = useCallback(
    async (name: ServiceName, apiKey: string): Promise<boolean> => {
      // Validate minimum length
      if (apiKey.length < 8) {
        toast.error("API key muito curta", {
          description: "A API key deve ter pelo menos 8 caracteres.",
        });
        return false;
      }

      // Set saving state
      setConfigs((prev) => ({
        ...prev,
        [name]: {
          ...prev[name],
          isSaving: true,
        },
      }));

      try {
        const result = await withTimeout(
          saveApiConfig(name, apiKey),
          API_TIMEOUT_MS
        );

        if (result.success) {
          setConfigs((prev) => ({
            ...prev,
            [name]: {
              status: "configured",
              maskedKey: result.data.maskedKey,
              updatedAt: result.data.updatedAt,
              isSaving: false,
              // Reset connection status when key changes
              connectionStatus: "untested",
              lastTestResult: null,
            },
          }));

          toast.success("Configuração salva com sucesso", {
            description: `A API key foi criptografada e armazenada.`,
          });

          return true;
        } else {
          setConfigs((prev) => ({
            ...prev,
            [name]: {
              ...prev[name],
              status: "error",
              isSaving: false,
            },
          }));

          toast.error("Erro ao salvar configuração", {
            description: result.error,
          });

          return false;
        }
      } catch (error) {
        console.error("Error saving config:", error);

        setConfigs((prev) => ({
          ...prev,
          [name]: {
            ...prev[name],
            status: "error",
            isSaving: false,
          },
        }));

        const message =
          error instanceof Error && error.message.includes("Timeout")
            ? "A operação demorou muito. Verifique sua conexão."
            : "Ocorreu um erro inesperado. Tente novamente.";

        toast.error("Erro ao salvar configuração", {
          description: message,
        });

        return false;
      }
    },
    []
  );

  /**
   * Delete an API key configuration
   */
  const removeConfig = useCallback(
    async (name: ServiceName): Promise<boolean> => {
      setConfigs((prev) => ({
        ...prev,
        [name]: {
          ...prev[name],
          isSaving: true,
        },
      }));

      try {
        const result = await withTimeout(
          deleteApiConfig(name),
          API_TIMEOUT_MS
        );

        if (result.success) {
          setConfigs((prev) => ({
            ...prev,
            [name]: {
              status: "not_configured",
              maskedKey: null,
              updatedAt: null,
              isSaving: false,
              // Reset connection status when key removed
              connectionStatus: "untested",
              lastTestResult: null,
            },
          }));

          toast.success("Configuração removida", {
            description: `A API key foi removida com sucesso.`,
          });

          return true;
        } else {
          setConfigs((prev) => ({
            ...prev,
            [name]: {
              ...prev[name],
              isSaving: false,
            },
          }));

          toast.error("Erro ao remover configuração", {
            description: result.error,
          });

          return false;
        }
      } catch (error) {
        console.error("Error removing config:", error);

        setConfigs((prev) => ({
          ...prev,
          [name]: {
            ...prev[name],
            isSaving: false,
          },
        }));

        const message =
          error instanceof Error && error.message.includes("Timeout")
            ? "A operação demorou muito. Verifique sua conexão."
            : "Ocorreu um erro inesperado. Tente novamente.";

        toast.error("Erro ao remover configuração", {
          description: message,
        });

        return false;
      }
    },
    []
  );

  /**
   * Refresh configs from server
   */
  const refreshConfigs = useCallback(async () => {
    // Cancel any previous pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsLoading(true);
    try {
      const result = await withTimeout(getApiConfigs(), API_TIMEOUT_MS, signal);

      if (signal.aborted) return;

      if (result.success) {
        setConfigs((prev) => {
          const updated = { ...prev };
          result.data.forEach((config: ApiConfigResponse) => {
            updated[config.serviceName] = {
              status: config.isConfigured ? "configured" : "not_configured",
              maskedKey: config.maskedKey,
              updatedAt: config.updatedAt,
              isSaving: false,
              // Preserve connection test state
              connectionStatus: prev[config.serviceName]?.connectionStatus ?? "untested",
              lastTestResult: prev[config.serviceName]?.lastTestResult ?? null,
            };
          });
          return updated;
        });
      }
    } catch (error) {
      if (signal.aborted) return;
      console.error("Error refreshing configs:", error);
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Test connection to a service
   * Story: 2.3 - Integration Connection Testing
   */
  const testConnection = useCallback(
    async (name: ServiceName): Promise<TestConnectionResult | null> => {
      // Set testing state
      setConfigs((prev) => ({
        ...prev,
        [name]: {
          ...prev[name],
          connectionStatus: "testing" as ConnectionStatus,
        },
      }));

      try {
        const result = await withTimeout(
          testApiConnection(name),
          API_TIMEOUT_MS
        );

        if (result.success) {
          const testResult = result.data;

          setConfigs((prev) => ({
            ...prev,
            [name]: {
              ...prev[name],
              connectionStatus: testResult.success ? "connected" : "error",
              lastTestResult: testResult,
            },
          }));

          if (testResult.success) {
            toast.success("Conexão estabelecida", {
              description: testResult.message,
            });
          } else {
            toast.error("Falha na conexão", {
              description: testResult.message,
            });
          }

          return testResult;
        } else {
          const errorResult: TestConnectionResult = {
            success: false,
            message: result.error,
            testedAt: new Date().toISOString(),
          };

          setConfigs((prev) => ({
            ...prev,
            [name]: {
              ...prev[name],
              connectionStatus: "error",
              lastTestResult: errorResult,
            },
          }));

          toast.error("Erro ao testar conexão", {
            description: result.error,
          });

          return errorResult;
        }
      } catch (error) {
        console.error("Error testing connection:", error);

        const message =
          error instanceof Error && error.message.includes("Timeout")
            ? "A operação demorou muito. Verifique sua conexão."
            : "Ocorreu um erro inesperado. Tente novamente.";

        const errorResult: TestConnectionResult = {
          success: false,
          message,
          testedAt: new Date().toISOString(),
        };

        setConfigs((prev) => ({
          ...prev,
          [name]: {
            ...prev[name],
            connectionStatus: "error",
            lastTestResult: errorResult,
          },
        }));

        toast.error("Erro ao testar conexão", {
          description: message,
        });

        return errorResult;
      }
    },
    []
  );

  return {
    configs,
    isLoading,
    saveConfig,
    removeConfig,
    refreshConfigs,
    testConnection,
  };
}
