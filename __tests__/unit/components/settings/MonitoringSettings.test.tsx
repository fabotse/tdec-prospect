/**
 * Tests for MonitoringSettings Component
 * Story 13.8: Configuracoes de Monitoramento
 *
 * AC: #1, #2, #3, #4, #5, #6 - Full component rendering and interactions
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { MonitoringFrequency, MonitoringConfig } from "@/types/monitoring";

// Mock Radix Select to enable interaction testing in JSDOM
let capturedOnValueChange: ((value: string) => void) | null = null;
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }: { children: React.ReactNode; onValueChange?: (v: string) => void; value?: string }) => {
    capturedOnValueChange = onValueChange ?? null;
    return <div data-testid="mock-select-root" data-value={value}>{children}</div>;
  },
  SelectTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <button {...props}>{children}</button>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value} data-testid={`select-option-${value}`}>{children}</option>
  ),
  SelectValue: () => <span>value</span>,
}));

// ==============================================
// MOCKS
// ==============================================

const mockMutate = vi.fn();
const mockUpdateFrequency = {
  mutate: mockMutate,
  isPending: false,
};

const mockUseMonitoringConfig = vi.fn();
vi.mock("@/hooks/use-monitoring-config", () => ({
  useMonitoringConfig: () => mockUseMonitoringConfig(),
}));

const mockUseMonitoredCount = vi.fn();
vi.mock("@/hooks/use-lead-monitoring", () => ({
  useMonitoredCount: () => mockUseMonitoredCount(),
}));

import { MonitoringSettings } from "@/components/settings/MonitoringSettings";

// ==============================================
// HELPERS
// ==============================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

const MOCK_CONFIG: MonitoringConfig = {
  id: "config-1",
  tenantId: "tenant-1",
  frequency: "weekly",
  maxMonitoredLeads: 100,
  lastRunAt: "2026-02-28T10:00:00Z",
  nextRunAt: "2026-03-07T10:00:00Z",
  runStatus: "idle",
  runCursor: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-02-28T10:00:00Z",
};

function setupMocks(overrides?: {
  config?: Partial<MonitoringConfig> | null;
  configLoading?: boolean;
  countLoading?: boolean;
  monitoredCurrent?: number;
  monitoredMax?: number;
}) {
  const config =
    overrides?.config === null
      ? null
      : { ...MOCK_CONFIG, ...overrides?.config };

  mockUseMonitoringConfig.mockReturnValue({
    config,
    configExists: config !== null,
    isLoading: overrides?.configLoading ?? false,
    error: null,
    updateFrequency: mockUpdateFrequency,
  });

  mockUseMonitoredCount.mockReturnValue({
    data: {
      current: overrides?.monitoredCurrent ?? 50,
      max: overrides?.monitoredMax ?? 100,
    },
    isLoading: overrides?.countLoading ?? false,
  });
}

function renderComponent() {
  return render(<MonitoringSettings />, { wrapper: createWrapper() });
}

// ==============================================
// TESTS
// ==============================================

describe("MonitoringSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe("Loading State (AC: Task 4.6)", () => {
    it("renders skeleton when config is loading", () => {
      setupMocks({ configLoading: true });
      renderComponent();

      expect(screen.getByTestId("monitoring-skeleton")).toBeInTheDocument();
    });

    it("renders skeleton when count is loading", () => {
      setupMocks({ countLoading: true });
      renderComponent();

      expect(screen.getByTestId("monitoring-skeleton")).toBeInTheDocument();
    });
  });

  describe("Empty State (AC: Task 4.7)", () => {
    it("renders empty state when no leads monitored", () => {
      setupMocks({ monitoredCurrent: 0 });
      renderComponent();

      expect(screen.getByTestId("monitoring-empty-state")).toBeInTheDocument();
      expect(
        screen.getByText(/nenhum lead esta sendo monitorado/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/acesse.*meus leads/i)
      ).toBeInTheDocument();
    });
  });

  describe("Card 1: Configuracao (AC: #2)", () => {
    it("renders frequency select with current value", () => {
      renderComponent();

      expect(screen.getByTestId("config-card")).toBeInTheDocument();
      expect(screen.getByTestId("frequency-select")).toBeInTheDocument();
    });

    it("renders save button disabled when no changes", () => {
      renderComponent();

      const saveBtn = screen.getByTestId("save-frequency-btn");
      expect(saveBtn).toBeDisabled();
    });

    it("renders save button text as Salvar", () => {
      renderComponent();

      expect(screen.getByTestId("save-frequency-btn")).toHaveTextContent(
        "Salvar"
      );
    });

    it("shows Salvando... when mutation is pending", () => {
      mockUseMonitoringConfig.mockReturnValue({
        config: MOCK_CONFIG,
        configExists: true,
        isLoading: false,
        error: null,
        updateFrequency: { ...mockUpdateFrequency, isPending: true },
      });
      renderComponent();

      expect(screen.getByTestId("save-frequency-btn")).toHaveTextContent(
        "Salvando..."
      );
    });
  });

  describe("Card 2: Status do Monitoramento (AC: #3, #4, #5)", () => {
    it("renders monitored count as X/max", () => {
      renderComponent();

      expect(screen.getByTestId("monitored-count")).toHaveTextContent("50/100");
    });

    it("renders run status as Ocioso when idle", () => {
      renderComponent();

      expect(screen.getByTestId("run-status")).toHaveTextContent("Ocioso");
    });

    it("renders run status as Em execucao when running", () => {
      setupMocks({ config: { runStatus: "running" } });
      renderComponent();

      expect(screen.getByTestId("run-status")).toHaveTextContent(
        "Em execucao"
      );
    });

    it("renders last run date formatted in PT-BR", () => {
      renderComponent();

      const lastRun = screen.getByTestId("last-run");
      // Should format 2026-02-28T10:00:00Z in pt-BR
      expect(lastRun.textContent).toMatch(/28\/02\/2026/);
    });

    it("renders 'Nenhuma execucao realizada' when no last run", () => {
      setupMocks({ config: { lastRunAt: null } });
      renderComponent();

      expect(screen.getByTestId("last-run")).toHaveTextContent(
        "Nenhuma execucao realizada"
      );
    });

    it("renders next run date formatted in PT-BR", () => {
      renderComponent();

      const nextRun = screen.getByTestId("next-run");
      expect(nextRun.textContent).toMatch(/07\/03\/2026/);
    });

    it("renders 'Nao agendado' when no next run", () => {
      setupMocks({ config: { nextRunAt: null } });
      renderComponent();

      expect(screen.getByTestId("next-run")).toHaveTextContent("Nao agendado");
    });
  });

  describe("Card 3: Estimativa de Custo (AC: #6)", () => {
    it("renders cost card", () => {
      renderComponent();

      expect(screen.getByTestId("cost-card")).toBeInTheDocument();
    });

    it("calculates weekly cost correctly (50 leads * $0.005 * 4 = $1.00)", () => {
      renderComponent();

      expect(screen.getByTestId("estimated-cost")).toHaveTextContent(
        "$1.00/mes"
      );
    });

    it("calculates biweekly cost correctly (50 leads * $0.005 * 2 = $0.50)", () => {
      setupMocks({ config: { frequency: "biweekly" as MonitoringFrequency } });
      renderComponent();

      expect(screen.getByTestId("estimated-cost")).toHaveTextContent(
        "$0.50/mes"
      );
    });

    it("renders cost formula breakdown", () => {
      renderComponent();

      expect(
        screen.getByText(/50 leads.*\$0\.005.*4 execucoes/i)
      ).toBeInTheDocument();
    });

    it("renders Apify pricing info", () => {
      renderComponent();

      expect(
        screen.getByText(/estimativa baseada no preco publico do apify/i)
      ).toBeInTheDocument();
    });
  });

  describe("Error State (CR: H1)", () => {
    it("renders error state when config fetch fails", () => {
      mockUseMonitoringConfig.mockReturnValue({
        config: null,
        configExists: false,
        isLoading: false,
        error: new Error("Fetch failed"),
        updateFrequency: mockUpdateFrequency,
      });
      mockUseMonitoredCount.mockReturnValue({
        data: { current: 50, max: 100 },
        isLoading: false,
        error: null,
      });
      renderComponent();

      expect(screen.getByTestId("monitoring-error-state")).toBeInTheDocument();
      expect(
        screen.getByText(/erro ao carregar configuracoes/i)
      ).toBeInTheDocument();
    });

    it("renders error state when count fetch fails", () => {
      setupMocks();
      mockUseMonitoredCount.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error("Count failed"),
      });
      renderComponent();

      expect(screen.getByTestId("monitoring-error-state")).toBeInTheDocument();
    });
  });

  describe("Save Interaction (CR: M2, M3)", () => {
    it("calls mutate with biweekly when frequency changed and save clicked", () => {
      setupMocks(); // config.frequency = "weekly"
      renderComponent();

      // Simulate Select onValueChange (Radix Select doesn't work in JSDOM)
      expect(capturedOnValueChange).not.toBeNull();
      act(() => {
        capturedOnValueChange!("biweekly");
      });

      // Save should be enabled after frequency change
      const saveBtn = screen.getByTestId("save-frequency-btn");
      expect(saveBtn).not.toBeDisabled();

      // Click save
      fireEvent.click(saveBtn);

      // Verify mutate was called with "biweekly"
      expect(mockMutate).toHaveBeenCalledWith("biweekly", expect.any(Object));
    });

    it("save button remains disabled without frequency change", () => {
      setupMocks();
      renderComponent();

      const saveBtn = screen.getByTestId("save-frequency-btn");
      expect(saveBtn).toBeDisabled();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("save button remains disabled when selecting same frequency as current", () => {
      setupMocks(); // config.frequency = "weekly"
      renderComponent();

      // Select same value as current
      act(() => {
        capturedOnValueChange!("weekly");
      });

      const saveBtn = screen.getByTestId("save-frequency-btn");
      expect(saveBtn).toBeDisabled();
    });
  });

  describe("Header", () => {
    it("renders page title", () => {
      renderComponent();

      expect(screen.getByText("Monitoramento")).toBeInTheDocument();
    });

    it("renders page description", () => {
      renderComponent();

      expect(
        screen.getByText(
          /configure a frequencia de monitoramento/i
        )
      ).toBeInTheDocument();
    });
  });
});
