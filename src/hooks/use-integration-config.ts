"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

type IntegrationName = "apollo" | "signalhire" | "snovio" | "instantly";
type IntegrationStatus = "not_configured" | "configured" | "error";

interface IntegrationConfig {
  maskedKey?: string;
  status: IntegrationStatus;
}

type IntegrationConfigs = Record<IntegrationName, IntegrationConfig>;

const initialConfigs: IntegrationConfigs = {
  apollo: { status: "not_configured" },
  signalhire: { status: "not_configured" },
  snovio: { status: "not_configured" },
  instantly: { status: "not_configured" },
};

/**
 * Hook for managing integration configuration state
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #4 - Save button functionality (simulated, actual persistence in Story 2.2)
 *
 * Uses React Hook Form + Zod pattern preparation for future validation
 */
export function useIntegrationConfig() {
  const [configs, setConfigs] = useState<IntegrationConfigs>(initialConfigs);

  const saveConfig = useCallback(async (name: IntegrationName, apiKey: string) => {
    // Validate minimum length
    if (apiKey.length < 10) {
      toast.error("API key muito curta", {
        description: "A API key deve ter pelo menos 10 caracteres.",
      });
      return;
    }

    // Simulate save delay (actual persistence in Story 2.2)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mask the key (show only last 4 chars)
    const maskedKey = `${"•".repeat(apiKey.length - 4)}${apiKey.slice(-4)}`;

    setConfigs((prev) => ({
      ...prev,
      [name]: {
        maskedKey,
        status: "configured" as IntegrationStatus,
      },
    }));

    toast.success("Configuração salva com sucesso", {
      description: `A API key do ${name} foi configurada.`,
    });
  }, []);

  return {
    configs,
    saveConfig,
  };
}
