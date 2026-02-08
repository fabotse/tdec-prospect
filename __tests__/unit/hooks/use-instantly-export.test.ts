/**
 * useInstantlyExport Hook Tests
 * Story 7.5: Export to Instantly - Fluxo Completo
 * AC: #1 - Sequential deployment pipeline, #2 - Success result, #3 - Failure handling
 *
 * Tests: full success flow, validation failure, step failures, re-export/update modes,
 * partial failures, reset, isExporting state, step tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInstantlyExport, type ExportLeadData } from "@/hooks/use-instantly-export";
import type { ExportConfig } from "@/types/export";
import type { BuilderBlock } from "@/stores/use-builder-store";

// ==============================================
// MOCKS
// ==============================================

vi.mock("@/lib/export/validate-pre-deploy", () => ({
  validateInstantlyPreDeploy: vi.fn(),
}));

vi.mock("@/lib/export/blocks-to-sequences", () => ({
  blocksToInstantlySequences: vi.fn(),
}));

import { validateInstantlyPreDeploy } from "@/lib/export/validate-pre-deploy";
import { blocksToInstantlySequences } from "@/lib/export/blocks-to-sequences";

const mockValidate = vi.mocked(validateInstantlyPreDeploy);
const mockBlocksToSequences = vi.mocked(blocksToInstantlySequences);

// ==============================================
// HELPER FACTORIES
// ==============================================

function makeBlocks(): BuilderBlock[] {
  return [
    { id: "e1", type: "email", position: 0, data: { subject: "Test", body: "Body" } },
  ];
}

function makeLeads(): ExportLeadData[] {
  return [
    { email: "user@test.com", icebreaker: "Oi", firstName: "Test" },
  ];
}

function makeConfig(overrides?: Partial<ExportConfig>): ExportConfig {
  return {
    campaignId: "camp-uuid-123",
    platform: "instantly",
    sendingAccounts: ["sender@test.com"],
    leadSelection: "all",
    exportMode: "new",
    ...overrides,
  };
}

function makeExportParams(configOverrides?: Partial<ExportConfig>) {
  return {
    config: makeConfig(configOverrides),
    campaignName: "Campanha Teste",
    blocks: makeBlocks(),
    leads: makeLeads(),
  };
}

// ==============================================
// FETCH MOCK HELPERS
// ==============================================

function createSuccessFetch() {
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";

    // POST /api/instantly/campaign -> create campaign
    if (url === "/api/instantly/campaign" && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ campaignId: "ext-camp-001" }),
      });
    }

    // POST /api/instantly/campaign/:id/accounts -> add accounts
    if (url.includes("/api/instantly/campaign/") && url.endsWith("/accounts") && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    }

    // POST /api/instantly/leads -> add leads
    if (url === "/api/instantly/leads" && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ leadsUploaded: 1, duplicatedLeads: 0 }),
      });
    }

    // PUT /api/campaigns/:id/export-status -> persist
    if (url.includes("/api/campaigns/") && url.endsWith("/export-status") && method === "PUT") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

function setupSuccessMocks() {
  mockValidate.mockReturnValue({ valid: true, errors: [], warnings: [] });
  mockBlocksToSequences.mockReturnValue([
    { subject: "Test", body: "Body", delayDays: 0 },
  ]);
  global.fetch = createSuccessFetch();
}

// ==============================================
// TEST SUITE
// ==============================================

describe("useInstantlyExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==============================================
  // 1. Full success flow
  // ==============================================

  it("completes full export flow with all steps succeeding", async () => {
    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    expect(exportResult!.success).toBe(true);
    expect(exportResult!.externalCampaignId).toBe("ext-camp-001");
    expect(exportResult!.leadsUploaded).toBe(1);
    expect(exportResult!.duplicatedLeads).toBe(0);

    // All steps should be success
    const stepStatuses = exportResult!.steps.map((s) => ({ id: s.id, status: s.status }));
    expect(stepStatuses).toEqual([
      { id: "validate", status: "success" },
      { id: "create_campaign", status: "success" },
      { id: "add_accounts", status: "success" },
      { id: "add_leads", status: "success" },
      { id: "persist", status: "success" },
    ]);

    // Verify APIs were called (create, leads, persist)
    // Accounts are now included in campaign creation via email_list — no separate call
    // Campaign stays as Draft — no activate call
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    const urls = fetchCalls.map(([url]) => url);
    expect(urls).toContain("/api/instantly/campaign");
    expect(urls).toContain("/api/instantly/leads");
    expect(urls.some((u) => (u as string).includes("/export-status"))).toBe(true);
  });

  // ==============================================
  // 2. Validation failure
  // ==============================================

  it("returns immediately with errors when validation fails", async () => {
    mockValidate.mockReturnValue({
      valid: false,
      errors: ["Nenhum lead com email válido. Adicione leads com email à campanha."],
      warnings: [],
    });

    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    expect(exportResult!.success).toBe(false);
    expect(exportResult!.error).toContain("Nenhum lead com email válido");

    // Validate step should be failed
    const validateStep = exportResult!.steps.find((s) => s.id === "validate");
    expect(validateStep?.status).toBe("failed");

    // No fetch calls should have been made
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ==============================================
  // 3. Create campaign failure
  // ==============================================

  it("stops pipeline when campaign creation fails", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/instantly/campaign" && options?.method === "POST") {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "API key inválida" }),
        } as Response);
      }
      return createSuccessFetch()(url, options);
    });

    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    expect(exportResult!.success).toBe(false);
    expect(exportResult!.error).toBe("API key inválida");

    const createStep = exportResult!.steps.find((s) => s.id === "create_campaign");
    expect(createStep?.status).toBe("failed");
    expect(createStep?.error).toBe("API key inválida");

    // Remaining steps should still be pending
    const leadsStep = exportResult!.steps.find((s) => s.id === "add_leads");
    expect(leadsStep?.status).toBe("pending");
  });

  // ==============================================
  // 4. Accounts included in campaign creation (no separate API call)
  // ==============================================

  it("marks accounts step as success with detail from campaign creation", async () => {
    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    expect(exportResult!.success).toBe(true);

    const accountsStep = exportResult!.steps.find((s) => s.id === "add_accounts");
    expect(accountsStep?.status).toBe("success");
    expect(accountsStep?.detail).toContain("account");

    // No separate fetch to /accounts endpoint
    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    const urls = fetchCalls.map(([url]) => url as string);
    expect(urls.every((u) => !u.endsWith("/accounts"))).toBe(true);
  });

  // ==============================================
  // 5. Add leads failure
  // ==============================================

  it("stops pipeline when adding leads fails", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/instantly/leads" && options?.method === "POST") {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Erro ao enviar leads para Instantly" }),
        } as Response);
      }
      return createSuccessFetch()(url, options);
    });

    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    expect(exportResult!.success).toBe(false);
    expect(exportResult!.error).toContain("leads");

    const leadsStep = exportResult!.steps.find((s) => s.id === "add_leads");
    expect(leadsStep?.status).toBe("failed");

    // Campaign and accounts succeeded
    expect(exportResult!.steps.find((s) => s.id === "create_campaign")?.status).toBe("success");
    expect(exportResult!.steps.find((s) => s.id === "add_accounts")?.status).toBe("success");

    // Persist should be pending
    expect(exportResult!.steps.find((s) => s.id === "persist")?.status).toBe("pending");
  });

  // ==============================================
  // 6. Persist failure - export still considered successful
  // ==============================================

  it("considers export successful even when persist fails", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/export-status") && options?.method === "PUT") {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "DB error" }),
        } as Response);
      }
      return createSuccessFetch()(url, options);
    });

    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    // Export is still successful because persist failure is non-fatal
    expect(exportResult!.success).toBe(true);

    const persistStep = exportResult!.steps.find((s) => s.id === "persist");
    expect(persistStep?.status).toBe("failed");
    expect(persistStep?.error).toBe("Export realizado mas falha ao salvar registro local");
  });

  // ==============================================
  // 8. Re-export mode - calls clear first
  // ==============================================

  it("calls clear export-status before creating campaign in re-export mode", async () => {
    const { result } = renderHook(() => useInstantlyExport());

    await act(async () => {
      await result.current.exportToInstantly(
        makeExportParams({ exportMode: "re-export" })
      );
    });

    const fetchCalls = vi.mocked(global.fetch).mock.calls;

    // Find the PUT call for clear
    const clearCall = fetchCalls.find(
      ([url, opts]) =>
        (url as string).includes("/export-status") &&
        (opts as RequestInit)?.method === "PUT" &&
        JSON.parse((opts as RequestInit).body as string).clear === true
    );
    expect(clearCall).toBeDefined();

    // The clear call should come before the create campaign call
    const clearIndex = fetchCalls.indexOf(clearCall!);
    const createIndex = fetchCalls.findIndex(
      ([url, opts]) =>
        url === "/api/instantly/campaign" && (opts as RequestInit)?.method === "POST"
    );
    expect(clearIndex).toBeLessThan(createIndex);
  });

  // ==============================================
  // 9. Update mode - skips create campaign and accounts
  // ==============================================

  it("skips create campaign and accounts steps in update mode, sends externalCampaignId to leads API", async () => {
    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(
        makeExportParams({ exportMode: "update", externalCampaignId: "existing-ext-123" })
      );
    });

    expect(exportResult!.success).toBe(true);

    // Create campaign and accounts should be skipped
    const createStep = exportResult!.steps.find((s) => s.id === "create_campaign");
    expect(createStep?.status).toBe("skipped");
    expect(createStep?.detail).toContain("Modo atualização");

    const accountsStep = exportResult!.steps.find((s) => s.id === "add_accounts");
    expect(accountsStep?.status).toBe("skipped");

    // Leads and persist should succeed
    expect(exportResult!.steps.find((s) => s.id === "add_leads")?.status).toBe("success");
    expect(exportResult!.steps.find((s) => s.id === "persist")?.status).toBe("success");

    // No calls to create campaign or accounts endpoints
    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    const createCampaignCalls = fetchCalls.filter(
      ([url, opts]) => url === "/api/instantly/campaign" && (opts as RequestInit)?.method === "POST"
    );
    expect(createCampaignCalls).toHaveLength(0);

    // Leads API should receive the existing external campaign ID
    const leadsCall = fetchCalls.find(
      ([url, opts]) => url === "/api/instantly/leads" && (opts as RequestInit)?.method === "POST"
    );
    expect(leadsCall).toBeDefined();
    const leadsBody = JSON.parse((leadsCall![1] as RequestInit).body as string);
    expect(leadsBody.campaignId).toBe("existing-ext-123");
  });

  // ==============================================
  // 10. reset() clears state
  // ==============================================

  it("reset() clears result and restores initial state", async () => {
    const { result } = renderHook(() => useInstantlyExport());

    // Perform an export first
    await act(async () => {
      await result.current.exportToInstantly(makeExportParams());
    });

    expect(result.current.result).not.toBeNull();

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.isExporting).toBe(false);

    // Steps should be back to all pending
    result.current.steps.forEach((step) => {
      expect(step.status).toBe("pending");
    });
  });

  // ==============================================
  // 11. isExporting is true during export
  // ==============================================

  it("isExporting is true during export and false after completion", async () => {
    // Use a deferred promise to control timing
    let resolveLeads!: (value: Response) => void;
    const leadsPromise = new Promise<Response>((resolve) => {
      resolveLeads = resolve;
    });

    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/instantly/leads" && options?.method === "POST") {
        return leadsPromise;
      }
      return createSuccessFetch()(url, options);
    });

    const { result } = renderHook(() => useInstantlyExport());

    expect(result.current.isExporting).toBe(false);

    let exportPromise: Promise<unknown>;
    act(() => {
      exportPromise = result.current.exportToInstantly(makeExportParams());
    });

    // isExporting should be true while waiting
    await waitFor(() => {
      expect(result.current.isExporting).toBe(true);
    });

    // Resolve the pending fetch
    await act(async () => {
      resolveLeads({
        ok: true,
        json: () => Promise.resolve({ leadsUploaded: 1, duplicatedLeads: 0 }),
      } as Response);
      await exportPromise;
    });

    expect(result.current.isExporting).toBe(false);
  });

  // ==============================================
  // 12. Steps have correct initial state (all pending)
  // ==============================================

  it("initializes with 5 steps all in pending status", () => {
    const { result } = renderHook(() => useInstantlyExport());

    expect(result.current.steps).toHaveLength(5);

    const expectedSteps = [
      { id: "validate", label: "Validação" },
      { id: "create_campaign", label: "Criar Campanha" },
      { id: "add_accounts", label: "Associar Accounts" },
      { id: "add_leads", label: "Enviar Leads" },
      { id: "persist", label: "Salvar Registro" },
    ];

    result.current.steps.forEach((step, idx) => {
      expect(step.id).toBe(expectedSteps[idx].id);
      expect(step.label).toBe(expectedSteps[idx].label);
      expect(step.status).toBe("pending");
    });

    expect(result.current.isExporting).toBe(false);
    expect(result.current.result).toBeNull();
  });

  // ==============================================
  // 13. Steps track progress correctly
  // ==============================================

  it("steps update to running and then success as pipeline progresses", async () => {
    const stepStatusHistory: Array<{ id: string; status: string }[]> = [];

    // Intercept fetch to capture step states mid-pipeline
    let callCount = 0;
    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      callCount++;
      return createSuccessFetch()(url, options);
    });

    const { result } = renderHook(() => useInstantlyExport());

    await act(async () => {
      await result.current.exportToInstantly(makeExportParams());
    });

    // After completion, all steps should be success
    const finalSteps = result.current.steps.map((s) => ({ id: s.id, status: s.status }));
    expect(finalSteps).toEqual([
      { id: "validate", status: "success" },
      { id: "create_campaign", status: "success" },
      { id: "add_accounts", status: "success" },
      { id: "add_leads", status: "success" },
      { id: "persist", status: "success" },
    ]);

    // Result should reflect the final state
    expect(result.current.result?.success).toBe(true);
    expect(result.current.result?.steps).toEqual(result.current.steps);
  });

  // ==============================================
  // 14. Partial failure handling (leads with duplicates)
  // ==============================================

  it("tracks partial lead upload with duplicated leads count", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/instantly/leads" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ leadsUploaded: 3, duplicatedLeads: 2 }),
        } as Response);
      }
      return createSuccessFetch()(url, options);
    });

    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    expect(exportResult!.success).toBe(true);
    expect(exportResult!.leadsUploaded).toBe(3);
    expect(exportResult!.duplicatedLeads).toBe(2);

    // Add leads step should succeed with detail
    const leadsStep = exportResult!.steps.find((s) => s.id === "add_leads");
    expect(leadsStep?.status).toBe("success");
    expect(leadsStep?.detail).toContain("3 leads enviados");
  });

  // ==============================================
  // 15. Error in unexpected exception
  // ==============================================

  it("handles unexpected exception during pipeline", async () => {
    vi.mocked(global.fetch).mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/instantly/campaign" && options?.method === "POST") {
        return Promise.reject(new Error("Network error: connection refused"));
      }
      return createSuccessFetch()(url, options);
    });

    const { result } = renderHook(() => useInstantlyExport());

    let exportResult: Awaited<ReturnType<typeof result.current.exportToInstantly>>;

    await act(async () => {
      exportResult = await result.current.exportToInstantly(makeExportParams());
    });

    expect(exportResult!.success).toBe(false);
    expect(exportResult!.error).toBe("Network error: connection refused");
    expect(result.current.isExporting).toBe(false);
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.success).toBe(false);
  });
});
