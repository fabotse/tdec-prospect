"use client";

import { IntegrationCard } from "@/components/settings/IntegrationCard";
import { useIntegrationConfig } from "@/hooks/use-integration-config";

const integrations = [
  {
    name: "apollo" as const,
    displayName: "Apollo",
    icon: "🔗",
    description: "Busca de leads e enriquecimento de dados empresariais",
  },
  {
    name: "signalhire" as const,
    displayName: "SignalHire",
    icon: "📞",
    description: "Enriquecimento de telefones e dados de contato",
  },
  {
    name: "snovio" as const,
    displayName: "Snov.io",
    icon: "✉️",
    description: "Exportação de campanhas de email",
  },
  {
    name: "instantly" as const,
    displayName: "Instantly",
    icon: "⚡",
    description: "Exportação de campanhas de cold email",
  },
];

/**
 * Integrations settings page
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #2 - Cards for Apollo, SignalHire, Snov.io, Instantly
 * AC: #3 - API key input with mask/reveal
 * AC: #4 - Save button for each integration
 */
export default function IntegrationsPage() {
  const { configs, saveConfig } = useIntegrationConfig();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => {
          const config = configs[integration.name];

          return (
            <IntegrationCard
              key={integration.name}
              name={integration.name}
              displayName={integration.displayName}
              icon={integration.icon}
              description={integration.description}
              currentKey={config?.maskedKey}
              status={config?.status || "not_configured"}
              onSave={(key) => saveConfig(integration.name, key)}
            />
          );
        })}
      </div>
    </div>
  );
}
