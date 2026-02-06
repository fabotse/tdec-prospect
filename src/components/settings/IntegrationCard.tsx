"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ServiceName,
  IntegrationStatus,
  ConnectionStatus,
  TestConnectionResult,
} from "@/types/integration";

interface IntegrationCardProps {
  name: ServiceName;
  displayName: string;
  icon: React.ReactNode;
  description: string;
  maskedKey: string | null;
  updatedAt: string | null;
  status: IntegrationStatus;
  isSaving: boolean;
  onSave: (key: string) => Promise<boolean>;
  // Story 2.3 additions
  connectionStatus?: ConnectionStatus;
  lastTestResult?: TestConnectionResult | null;
  onTest?: () => Promise<void>;
}

const statusConfig: Record<
  IntegrationStatus,
  { label: string; variant: "outline" | "default" | "destructive" }
> = {
  not_configured: { label: "Não configurado", variant: "outline" },
  configured: { label: "Configurado", variant: "default" },
  loading: { label: "Carregando...", variant: "outline" },
  saving: { label: "Salvando...", variant: "outline" },
  error: { label: "Erro", variant: "destructive" },
};

/**
 * Format updatedAt timestamp for display
 */
function formatUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return "Nunca";

  try {
    const date = new Date(updatedAt);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Nunca";
  }
}

/**
 * Reusable integration configuration card
 * Story: 2.2 - API Keys Storage & Encryption
 * Story: 2.3 - Integration Connection Testing
 *
 * AC: #3 - Key never returned in plain text
 * AC: #4 - Only last 4 chars shown for verification
 * AC: 2.3#1 - Test connection with loading and result display
 */
export function IntegrationCard({
  name,
  displayName,
  icon,
  description,
  maskedKey,
  updatedAt,
  status,
  isSaving,
  onSave,
  // Story 2.3 additions
  connectionStatus = "untested",
  lastTestResult = null,
  onTest,
}: IntegrationCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const statusInfo = statusConfig[status] ?? statusConfig.not_configured;
  const isConfigured = status === "configured";
  const isTesting = connectionStatus === "testing";

  const handleSave = async () => {
    if (!apiKey.trim()) return;

    const success = await onSave(apiKey);
    if (success) {
      // Clear input after successful save
      setApiKey("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && apiKey.trim() && !isSaving) {
      handleSave();
    }
  };

  const handleTest = async () => {
    if (onTest && !isTesting) {
      await onTest();
    }
  };

  return (
    <Card className="bg-background-secondary border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <CardTitle className="text-h3">{displayName}</CardTitle>
        </div>
        <Badge variant={statusInfo.variant} className="text-caption">
          {statusInfo.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-small text-foreground-muted">{description}</p>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={`api-key-${name}`}
            className="block text-body-small font-medium text-foreground"
          >
            API Key
          </label>
          <div className="relative">
            <Input
              id={`api-key-${name}`}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConfigured && maskedKey ? maskedKey : "Insira sua API key"}
              disabled={isSaving}
              className="pr-10 bg-background border-border"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
              aria-label={showKey ? "Ocultar API key" : "Mostrar API key"}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-caption text-foreground-muted">
            Última atualização: {formatUpdatedAt(updatedAt)}
          </span>
          <div className="flex items-center gap-2">
            {/* Test Connection Button - Story 2.3 */}
            {isConfigured && onTest && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={isTesting || isSaving}
                data-testid={`test-connection-${name}`}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testando...
                  </>
                ) : (
                  "Testar Conexão"
                )}
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
              size="sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : isConfigured ? (
                "Atualizar"
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </div>

        {/* Test Result Display - Story 2.3 */}
        {lastTestResult && (
          <div
            className={cn(
              "flex items-center gap-2 text-body-small rounded-md p-2",
              lastTestResult.success
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            )}
            data-testid={`test-result-${name}`}
          >
            {lastTestResult.success ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{lastTestResult.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
