/**
 * Instantly Export Hook
 * Story 7.5: Export to Instantly - Fluxo Completo
 * AC: #1, #2, #3, #5 - Client-side orchestration of export pipeline
 *
 * Manages the sequential deployment steps:
 * 1. Validate pre-deploy conditions
 * 2. Create campaign in Instantly (Draft status)
 * 3. Associate sending accounts
 * 4. Add leads to campaign
 * 5. Persist export record
 *
 * Campaign is created as Draft — user activates manually in Instantly.
 * Tracks progress per step with status updates for UI feedback.
 */

"use client";

import { useState, useCallback } from "react";
import type { BuilderBlock } from "@/stores/use-builder-store";
import type {
  DeploymentStep,
  DeploymentResult,
  ExportConfig,
} from "@/types/export";
import { blocksToInstantlySequences } from "@/lib/export/blocks-to-sequences";
import { validateInstantlyPreDeploy } from "@/lib/export/validate-pre-deploy";
import { mapExportError } from "@/lib/export/error-messages";

// ==============================================
// TYPES
// ==============================================

/**
 * Lead data for export — extends ExportLeadInfo with full lead fields
 * so the hook can pass firstName, companyName, etc. to the Instantly API
 * without unsafe type casts.
 */
export interface ExportLeadData {
  email: string | null;
  icebreaker?: string | null;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  title?: string;
}

interface ExportParams {
  config: ExportConfig;
  campaignName: string;
  blocks: BuilderBlock[];
  leads: ExportLeadData[];
}

interface UseInstantlyExportReturn {
  steps: DeploymentStep[];
  isExporting: boolean;
  result: DeploymentResult | null;
  exportToInstantly: (params: ExportParams) => Promise<DeploymentResult>;
  reset: () => void;
}

// ==============================================
// INITIAL STEPS
// ==============================================

function createInitialSteps(): DeploymentStep[] {
  return [
    { id: "validate", label: "Validação", status: "pending" },
    { id: "create_campaign", label: "Criar Campanha", status: "pending" },
    { id: "add_accounts", label: "Associar Accounts", status: "pending" },
    { id: "add_leads", label: "Enviar Leads", status: "pending" },
    { id: "persist", label: "Salvar Registro", status: "pending" },
  ];
}

// ==============================================
// STEP HELPERS
// ==============================================

function updateStep(
  steps: DeploymentStep[],
  id: string,
  update: Partial<DeploymentStep>
): DeploymentStep[] {
  return steps.map((s) => (s.id === id ? { ...s, ...update } : s));
}

// ==============================================
// HOOK
// ==============================================

export function useInstantlyExport(): UseInstantlyExportReturn {
  const [steps, setSteps] = useState<DeploymentStep[]>(createInitialSteps);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<DeploymentResult | null>(null);

  const reset = useCallback(() => {
    setSteps(createInitialSteps());
    setIsExporting(false);
    setResult(null);
  }, []);

  const exportToInstantly = useCallback(
    async (params: ExportParams): Promise<DeploymentResult> => {
      const { config, campaignName, blocks, leads } = params;
      let currentSteps = createInitialSteps();
      setSteps(currentSteps);
      setIsExporting(true);
      setResult(null);

      let externalCampaignId: string | undefined;
      let leadsUploaded = 0;
      let duplicatedLeads = 0;

      try {
        // ============================
        // Step 1: Validate
        // ============================
        currentSteps = updateStep(currentSteps, "validate", { status: "running" });
        setSteps([...currentSteps]);

        const validation = validateInstantlyPreDeploy({
          blocks,
          leads,
          sendingAccounts: config.sendingAccounts ?? [],
        });

        if (!validation.valid) {
          currentSteps = updateStep(currentSteps, "validate", {
            status: "failed",
            error: validation.errors.join("; "),
          });
          setSteps([...currentSteps]);
          const failResult: DeploymentResult = {
            success: false,
            steps: currentSteps,
            error: validation.errors.join("; "),
          };
          setResult(failResult);
          setIsExporting(false);
          return failResult;
        }

        currentSteps = updateStep(currentSteps, "validate", {
          status: "success",
          detail: validation.warnings.length > 0
            ? validation.warnings.join("; ")
            : undefined,
        });
        setSteps([...currentSteps]);

        // For re-export mode: clear previous export status first
        if (config.exportMode === "re-export") {
          await fetch(`/api/campaigns/${config.campaignId}/export-status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clear: true }),
          });
        }

        // For update mode: skip campaign creation and accounts, go straight to leads
        const isUpdateMode = config.exportMode === "update";

        // ============================
        // Step 2: Create Campaign (skip in update mode)
        // ============================
        if (isUpdateMode) {
          currentSteps = updateStep(currentSteps, "create_campaign", {
            status: "skipped",
            detail: "Modo atualização: usando campanha existente",
          });
          currentSteps = updateStep(currentSteps, "add_accounts", {
            status: "skipped",
            detail: "Modo atualização: accounts já associadas",
          });
          setSteps([...currentSteps]);
        } else {
          currentSteps = updateStep(currentSteps, "create_campaign", { status: "running" });
          setSteps([...currentSteps]);

          const sequences = blocksToInstantlySequences(blocks);

          const createRes = await fetch("/api/instantly/campaign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: campaignName,
              sequences,
              sendingAccounts: config.sendingAccounts ?? [],
            }),
          });

          if (!createRes.ok) {
            const errorData = await createRes.json().catch(() => ({}));
            const errorMsg = errorData.error ?? "Erro ao criar campanha no Instantly";
            const errorInfo = mapExportError({ status: createRes.status, message: errorMsg }, "instantly");
            currentSteps = updateStep(currentSteps, "create_campaign", {
              status: "failed",
              error: errorInfo.message,
              errorInfo,
            });
            setSteps([...currentSteps]);
            const failResult: DeploymentResult = {
              success: false,
              steps: currentSteps,
              error: errorMsg,
            };
            setResult(failResult);
            setIsExporting(false);
            return failResult;
          }

          const createData = await createRes.json();
          externalCampaignId = createData.campaignId;

          currentSteps = updateStep(currentSteps, "create_campaign", {
            status: "success",
            detail: `ID: ${externalCampaignId}`,
          });
          setSteps([...currentSteps]);

          // ============================
          // Step 3: Accounts (included in campaign creation via email_list)
          // ============================
          const accountCount = (config.sendingAccounts ?? []).length;
          currentSteps = updateStep(currentSteps, "add_accounts", {
            status: "success",
            detail: accountCount > 0
              ? `${accountCount} account(s) vinculadas na criação`
              : "Nenhuma account selecionada",
          });
          setSteps([...currentSteps]);
        }

        // ============================
        // Step 4: Add Leads
        // ============================
        currentSteps = updateStep(currentSteps, "add_leads", { status: "running" });
        setSteps([...currentSteps]);

        // In update mode, use the previous campaign's external ID from config
        const targetCampaignId = isUpdateMode
          ? config.externalCampaignId
          : externalCampaignId;

        const leadsPayload = leads
          .filter((l) => l.email && l.email.trim() !== "")
          .map((l) => ({
            email: l.email,
            firstName: l.firstName ?? undefined,
            lastName: l.lastName ?? undefined,
            companyName: l.companyName ?? undefined,
            title: l.title ?? undefined,
            icebreaker: l.icebreaker ?? undefined,
          }));

        const leadsRes = await fetch("/api/instantly/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: targetCampaignId,
            leads: leadsPayload,
          }),
        });

        if (!leadsRes.ok) {
          const errorData = await leadsRes.json().catch(() => ({}));
          const errorMsg = errorData.error ?? "Erro ao enviar leads para Instantly";
          const leadsErrorInfo = mapExportError({ status: leadsRes.status, message: errorMsg }, "instantly");
          currentSteps = updateStep(currentSteps, "add_leads", {
            status: "failed",
            error: leadsErrorInfo.message,
            errorInfo: leadsErrorInfo,
          });
          setSteps([...currentSteps]);
          const failResult: DeploymentResult = {
            success: false,
            externalCampaignId,
            steps: currentSteps,
            error: errorMsg,
          };
          setResult(failResult);
          setIsExporting(false);
          return failResult;
        }

        const leadsData = await leadsRes.json();
        leadsUploaded = leadsData.leadsUploaded ?? 0;
        duplicatedLeads = leadsData.duplicatedLeads ?? 0;

        currentSteps = updateStep(currentSteps, "add_leads", {
          status: "success",
          detail: `${leadsUploaded} leads enviados`,
        });
        setSteps([...currentSteps]);

        // ============================
        // Step 5: Persist Export Record
        // ============================
        currentSteps = updateStep(currentSteps, "persist", { status: "running" });
        setSteps([...currentSteps]);

        const exportStatus = "success";

        const persistRes = await fetch(
          `/api/campaigns/${config.campaignId}/export-status`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              externalCampaignId: externalCampaignId ?? undefined,
              exportPlatform: "instantly",
              exportedAt: new Date().toISOString(),
              exportStatus,
            }),
          }
        );

        if (!persistRes.ok) {
          currentSteps = updateStep(currentSteps, "persist", {
            status: "failed",
            error: "Export realizado mas falha ao salvar registro local",
          });
          setSteps([...currentSteps]);
        } else {
          currentSteps = updateStep(currentSteps, "persist", { status: "success" });
          setSteps([...currentSteps]);
        }

        // ============================
        // Final Result
        // ============================
        const hasFailedStep = currentSteps.some(
          (s) =>
            s.status === "failed" &&
            s.id !== "persist" &&
            s.id !== "add_accounts"
        );

        const finalResult: DeploymentResult = {
          success: !hasFailedStep,
          externalCampaignId,
          leadsUploaded,
          duplicatedLeads,
          steps: currentSteps,
        };
        setResult(finalResult);
        setIsExporting(false);
        return finalResult;
      } catch (err) {
        const errorInfo = mapExportError(err, "instantly");
        const failResult: DeploymentResult = {
          success: false,
          externalCampaignId,
          leadsUploaded,
          duplicatedLeads,
          steps: currentSteps,
          error: errorInfo.message,
        };
        setResult(failResult);
        setIsExporting(false);
        return failResult;
      }
    },
    []
  );

  return { steps, isExporting, result, exportToInstantly, reset };
}
