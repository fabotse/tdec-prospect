"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type IntegrationStatus = "not_configured" | "configured" | "error";

interface IntegrationCardProps {
  name: "apollo" | "signalhire" | "snovio" | "instantly";
  displayName: string;
  icon: React.ReactNode;
  description: string;
  currentKey?: string;
  status: IntegrationStatus;
  onSave: (key: string) => Promise<void>;
}

const statusConfig: Record<IntegrationStatus, { label: string; variant: "outline" | "default" | "destructive" }> = {
  not_configured: { label: "Não configurado", variant: "outline" },
  configured: { label: "Configurado", variant: "default" },
  error: { label: "Erro", variant: "destructive" },
};

/**
 * Reusable integration configuration card
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #2 - Cards for Apollo, SignalHire, Snov.io, Instantly
 * AC: #3 - API key input with mask/reveal toggle
 * AC: #4 - Save button for each integration
 * AC: #6 - Dark mode design system styling
 */
export function IntegrationCard({
  name,
  displayName,
  icon,
  description,
  currentKey,
  status,
  onSave,
}: IntegrationCardProps) {
  const [apiKey, setApiKey] = useState(currentKey || "");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const statusInfo = statusConfig[status];

  const handleSave = async () => {
    if (!apiKey.trim()) return;

    setIsSaving(true);
    try {
      await onSave(apiKey);
    } catch (error) {
      toast.error("Erro ao salvar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && apiKey.trim()) {
      handleSave();
    }
  };

  return (
    <Card className="bg-background-secondary border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <CardTitle className="text-h3 font-medium">{displayName}</CardTitle>
        </div>
        <Badge variant={statusInfo.variant} className="text-caption">
          {statusInfo.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-small text-foreground-muted">{description}</p>

        <div className="space-y-2">
          <label
            htmlFor={`api-key-${name}`}
            className="text-body-small font-medium text-foreground"
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
              placeholder="Insira sua API key"
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
          {/* TODO Story 2.2: Replace with actual timestamp from database */}
          <span className="text-caption text-foreground-muted">
            Última atualização: {status === "not_configured" ? "Nunca" : "Sessão atual"}
          </span>
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
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
