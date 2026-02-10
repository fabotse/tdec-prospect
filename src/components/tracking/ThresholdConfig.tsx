"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { OpportunityConfig, LeadTracking } from "@/types/tracking";
import {
  evaluateOpportunityWindow,
  getDefaultConfig,
  DEFAULT_MIN_OPENS,
  DEFAULT_PERIOD_DAYS,
} from "@/lib/services/opportunity-engine";

interface ThresholdConfigProps {
  config: OpportunityConfig | null;
  leads: LeadTracking[];
  onSave: (config: { minOpens: number; periodDays: number }) => void;
  isSaving: boolean;
}

export function ThresholdConfig({
  config,
  leads,
  onSave,
  isSaving,
}: ThresholdConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [minOpens, setMinOpens] = useState(
    config?.minOpens ?? DEFAULT_MIN_OPENS
  );
  const [periodDays, setPeriodDays] = useState(
    config?.periodDays ?? DEFAULT_PERIOD_DAYS
  );

  // Sync local state when config prop changes (React recommended pattern)
  const [prevConfig, setPrevConfig] = useState(config);
  if (config !== prevConfig) {
    setPrevConfig(config);
    if (config) {
      setMinOpens(config.minOpens);
      setPeriodDays(config.periodDays);
    }
  }

  const previewCount = useMemo(() => {
    const previewConfig = {
      ...getDefaultConfig(""),
      minOpens,
      periodDays,
    };
    return evaluateOpportunityWindow(leads, previewConfig).length;
  }, [leads, minOpens, periodDays]);

  const hasChanges =
    minOpens !== (config?.minOpens ?? DEFAULT_MIN_OPENS) ||
    periodDays !== (config?.periodDays ?? DEFAULT_PERIOD_DAYS);

  const handleSave = () => {
    onSave({ minOpens, periodDays });
  };

  return (
    <Card data-testid="threshold-config">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="threshold-header-toggle"
      >
        <div className="flex items-center gap-2">
          <CardTitle>Janela de Oportunidade</CardTitle>
          <span className="ml-auto">
            {isOpen ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" data-testid="threshold-chevron-up" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" data-testid="threshold-chevron-down" />
            )}
          </span>
        </div>
        <CardDescription>
          Configure o threshold para identificar leads de alto interesse
        </CardDescription>
      </CardHeader>
      {isOpen && (
        <CardContent data-testid="threshold-content">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="min-opens">Minimo de aberturas</Label>
                <Input
                  id="min-opens"
                  type="number"
                  min={1}
                  value={minOpens}
                  onChange={(e) =>
                    setMinOpens(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  data-testid="min-opens-input"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="period-days">Periodo em dias</Label>
                <Input
                  id="period-days"
                  type="number"
                  min={1}
                  value={periodDays}
                  onChange={(e) =>
                    setPeriodDays(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  data-testid="period-days-input"
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground" data-testid="preview-count">
              {previewCount} de {leads.length} leads se qualificam
            </p>

            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              data-testid="save-config-button"
              className="w-fit"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
