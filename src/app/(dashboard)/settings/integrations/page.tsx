"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IntegrationCard,
  type IntegrationField,
} from "@/components/settings/IntegrationCard";
import { useIntegrationConfig } from "@/hooks/use-integration-config";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiceName } from "@/types/integration";
import type { TheirStackCredits } from "@/types/theirstack";

interface IntegrationMeta {
  name: ServiceName;
  displayName: string;
  icon: string;
  description: string;
  fields?: IntegrationField[];
}

const integrations: IntegrationMeta[] = [
  {
    name: "apollo",
    displayName: "Apollo",
    icon: "🔗",
    description: "Busca de leads e enriquecimento de dados empresariais",
  },
  {
    name: "signalhire",
    displayName: "SignalHire",
    icon: "📞",
    description: "Enriquecimento de telefones e dados de contato",
  },
  {
    name: "snovio",
    displayName: "Snov.io",
    icon: "✉️",
    description: "Exportação de campanhas de email",
  },
  {
    name: "instantly",
    displayName: "Instantly",
    icon: "⚡",
    description: "Exportação de campanhas de cold email",
  },
  {
    name: "apify",
    displayName: "Apify",
    icon: "🔧",
    description: "Extracao de posts do LinkedIn para icebreakers personalizados",
  },
  {
    name: "zapi",
    displayName: "Z-API",
    icon: "📱",
    description: "Envio de mensagens WhatsApp via Z-API",
    fields: [
      {
        key: "instanceId",
        label: "Instance ID",
        placeholder: "Insira o Instance ID",
      },
      {
        key: "instanceToken",
        label: "Instance Token",
        placeholder: "Insira o Instance Token",
      },
      {
        key: "securityToken",
        label: "Security Token",
        placeholder: "Insira o Security Token",
      },
    ],
  },
  {
    name: "theirstack",
    displayName: "theirStack",
    icon: "🔍",
    description: "Prospecção tecnográfica — descubra empresas por stack tecnológico",
  },
];

/**
 * Credits badge for theirStack integration
 * Story 15.1: AC #3 - Display credits utilizados vs disponiveis
 */
export function TheirStackCreditsBadge({ isConfigured }: { isConfigured: boolean }) {
  const [credits, setCredits] = useState<TheirStackCredits | null>(null);

  useEffect(() => {
    if (!isConfigured) return;

    let active = true;

    fetch("/api/integrations/theirstack/credits")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && active) setCredits(json.data);
      })
      .catch(() => {
        // Silently fail — credits badge is informational
      });

    return () => {
      active = false;
    };
  }, [isConfigured]);

  if (!isConfigured || !credits) return null;

  const remaining = Math.max(0, credits.apiCredits - credits.usedApiCredits);
  const isLow = credits.apiCredits > 0 && remaining / credits.apiCredits < 0.2;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-caption",
        isLow && "border-destructive text-destructive"
      )}
    >
      {credits.usedApiCredits}/{credits.apiCredits} API credits
    </Badge>
  );
}

/**
 * Loading skeleton for integration cards
 */
function IntegrationCardSkeleton() {
  return (
    <Card className="bg-background-secondary border-border animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-foreground/10 rounded" />
          <div className="h-5 w-24 bg-foreground/10 rounded" />
        </div>
        <div className="h-5 w-20 bg-foreground/10 rounded" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-4 w-full bg-foreground/10 rounded" />
        <div className="space-y-2">
          <div className="h-4 w-16 bg-foreground/10 rounded" />
          <div className="h-10 w-full bg-foreground/10 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-foreground/10 rounded" />
          <div className="h-8 w-16 bg-foreground/10 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Integrations settings page
 * Story: 2.2 - API Keys Storage & Encryption
 * Story: 2.3 - Integration Connection Testing
 *
 * AC: #3 - Key never returned in plain text
 * AC: #4 - Only last 4 chars shown for verification
 * AC: 2.3#1 - Test connection functionality
 * AC: 2.3#2 - Status of each service
 */
export default function IntegrationsPage() {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useUser();
  const { configs, isLoading, saveConfig, testConnection } = useIntegrationConfig();

  // Redirect to login if not authenticated (after user loading completes)
  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [isUserLoading, user, router]);

  // Show loading while checking auth
  if (isUserLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map((integration) => (
            <IntegrationCardSkeleton key={integration.name} />
          ))}
        </div>
      </div>
    );
  }

  // If no user, show nothing (redirect will happen)
  if (!user) {
    return null;
  }

  // Show loading skeletons while fetching configs
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map((integration) => (
            <IntegrationCardSkeleton key={integration.name} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => {
          const config = configs[integration.name];
          const isConfigured = config?.status === "configured";

          return (
            <div key={integration.name} className="flex flex-col gap-2">
              <IntegrationCard
                name={integration.name}
                displayName={integration.displayName}
                icon={integration.icon}
                description={integration.description}
                maskedKey={config?.maskedKey ?? null}
                updatedAt={config?.updatedAt ?? null}
                status={config?.status ?? "not_configured"}
                isSaving={config?.isSaving ?? false}
                onSave={(key) => saveConfig(integration.name, key)}
                fields={integration.fields}
                // Story 2.3 additions
                connectionStatus={config?.connectionStatus ?? "untested"}
                lastTestResult={config?.lastTestResult ?? null}
                onTest={async () => {
                  await testConnection(integration.name);
                }}
              />
              {integration.name === "theirstack" && (
                <TheirStackCreditsBadge isConfigured={isConfigured} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
