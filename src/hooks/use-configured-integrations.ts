"use client";

/**
 * useConfiguredIntegrations
 * Hotfix SDR: status de integracoes para o builder/export, disponivel a qualquer papel.
 *
 * Mesmo formato minimo que `useCampaignExport` consome (`status` + `connectionStatus`),
 * mas sem depender de `getApiConfigs` (admin-only), que para `sdr` falhava e marcava
 * Instantly/Snov.io como "Nao configurado" no dialogo de export.
 */

import { useEffect, useState } from "react";
import { getConfiguredIntegrations } from "@/actions/integration-status";
import type { IntegrationStatus, ConnectionStatus } from "@/types/integration";

interface IntegrationAvailability {
  status: IntegrationStatus;
  connectionStatus: ConnectionStatus;
}

export function useConfiguredIntegrations() {
  const [configs, setConfigs] = useState<Record<string, IntegrationAvailability>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    getConfiguredIntegrations()
      .then((result) => {
        if (!isMounted || !result.success) return;
        setConfigs(
          Object.fromEntries(
            result.data.map((service) => [
              service,
              { status: "configured", connectionStatus: "untested" },
            ])
          )
        );
      })
      .catch((error) => {
        console.error("[useConfiguredIntegrations] Error loading integrations:", error);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { configs, isLoading };
}
