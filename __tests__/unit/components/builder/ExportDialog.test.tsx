/**
 * ExportDialog Component Tests
 * Story 7.4: Export Dialog UI com Preview de Variaveis
 * Story 7.8: Advanced validation + ValidationSummaryPanel integration
 *
 * AC: #1 - Platform selection with status badges
 * AC: #3 - Lead selection with email validation
 * AC: #5 - Previous export indicator with re-export/update actions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock useSendingAccounts hook
vi.mock("@/hooks/use-sending-accounts", () => ({
  useSendingAccounts: () => ({
    accounts: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock child components to isolate ExportDialog tests
vi.mock("@/components/builder/ExportPreview", () => ({
  ExportPreview: ({ platform }: { platform: string }) => (
    <div data-testid="export-preview">ExportPreview: {platform}</div>
  ),
}));

vi.mock("@/components/builder/SendingAccountSelector", () => ({
  SendingAccountSelector: () => (
    <div data-testid="sending-account-selector">SendingAccountSelector</div>
  ),
}));

// Mock variable-registry for advanced validation
vi.mock("@/lib/export/variable-registry", () => ({
  getVariables: () => [
    { name: "first_name", label: "Nome", leadField: "firstName", template: "{{first_name}}", placeholderLabel: "" },
    { name: "company_name", label: "Empresa", leadField: "companyName", template: "{{company_name}}", placeholderLabel: "" },
    { name: "title", label: "Cargo", leadField: "title", template: "{{title}}", placeholderLabel: "" },
    { name: "ice_breaker", label: "Quebra-gelo", leadField: "icebreaker", template: "{{ice_breaker}}", placeholderLabel: "" },
  ],
}));

import { ExportDialog } from "@/components/builder/ExportDialog";
import type { ExportDialogPlatformOption, LeadExportSummary, ExportRecord } from "@/types/export";
import type { BuilderBlock } from "@/stores/use-builder-store";
import type { ExportLeadInfo } from "@/lib/export/validate-pre-deploy";

// ==============================================
// TEST FIXTURES
// ==============================================

const mockBlocks: BuilderBlock[] = [
  {
    id: "block-1",
    type: "email",
    position: 0,
    data: { subject: "Ola {{first_name}}", body: "Corpo do email" },
  },
];

const mockLeadSummary: LeadExportSummary = {
  totalLeads: 10,
  leadsWithEmail: 8,
  leadsWithoutEmail: 2,
  leadsWithoutIcebreaker: 1,
};

const mockLeadSummaryNoEmails: LeadExportSummary = {
  totalLeads: 5,
  leadsWithEmail: 0,
  leadsWithoutEmail: 5,
  leadsWithoutIcebreaker: 0,
};

// L3 fix: Clipboard is always configured/connected in production
const mockPlatformOptions: ExportDialogPlatformOption[] = [
  {
    platform: "instantly",
    displayName: "Instantly",
    configured: true,
    connectionStatus: "connected",
    exportRecord: null,
  },
  {
    platform: "snovio",
    displayName: "Snov.io",
    configured: false,
    connectionStatus: "not_configured",
    exportRecord: null,
  },
  {
    platform: "csv",
    displayName: "CSV",
    configured: true,
    connectionStatus: "connected",
    exportRecord: null,
  },
  {
    platform: "clipboard",
    displayName: "Clipboard",
    configured: true,
    connectionStatus: "connected",
    exportRecord: null,
  },
];

const mockPreviousExport: ExportRecord = {
  campaignId: "camp-1",
  externalCampaignId: "ext-123",
  exportPlatform: "instantly",
  exportedAt: "2026-01-15T14:30:00Z",
  exportStatus: "success",
};

// Story 7.8: Leads for advanced validation (all valid — no warnings)
const mockLeads: ExportLeadInfo[] = [
  { email: "lead1@test.com", icebreaker: "Nice post" },
  { email: "lead2@test.com", icebreaker: "Great work" },
  { email: "lead3@test.com", icebreaker: "Interesting article" },
  { email: "lead4@test.com", icebreaker: "Cool project" },
  { email: "lead5@test.com", icebreaker: "Good insights" },
  { email: "lead6@test.com", icebreaker: "Thanks for sharing" },
  { email: "lead7@test.com", icebreaker: "Well done" },
  { email: "lead8@test.com", icebreaker: "Impressive" },
];

const mockLeadsNoEmails: ExportLeadInfo[] = [
  { email: null },
  { email: null },
  { email: null },
  { email: null },
  { email: null },
];

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  campaignId: "camp-1",
  campaignName: "Minha Campanha Teste",
  blocks: mockBlocks,
  platformOptions: mockPlatformOptions,
  leadSummary: mockLeadSummary,
  leads: mockLeads,
  previousExport: null as ExportRecord | null,
  onExport: vi.fn(),
};

// ==============================================
// TESTS
// ==============================================

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog with title and description", () => {
    render(<ExportDialog {...defaultProps} />);

    expect(screen.getByText("Exportar Campanha")).toBeInTheDocument();
    expect(
      screen.getByText(/Selecione uma plataforma e revise o mapeamento de variáveis para/)
    ).toBeInTheDocument();
    expect(screen.getByText(/"Minha Campanha Teste"/)).toBeInTheDocument();
  });

  it("renders all 4 platform options", () => {
    render(<ExportDialog {...defaultProps} />);

    expect(screen.getByTestId("platform-option-instantly")).toBeInTheDocument();
    expect(screen.getByTestId("platform-option-snovio")).toBeInTheDocument();
    expect(screen.getByTestId("platform-option-csv")).toBeInTheDocument();
    expect(screen.getByTestId("platform-option-clipboard")).toBeInTheDocument();

    expect(screen.getByText("Instantly")).toBeInTheDocument();
    expect(screen.getByText("Snov.io")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("Clipboard")).toBeInTheDocument();
  });

  it("shows connection status badges (connected, not configured)", () => {
    render(<ExportDialog {...defaultProps} />);

    // Instantly, CSV, Clipboard are "connected"
    const connectedBadges = screen.getAllByText("Conectado");
    expect(connectedBadges).toHaveLength(3);

    // Snov.io is "not_configured"
    expect(screen.getByText("Não configurado")).toBeInTheDocument();
  });

  it("shows previous export indicator when previousExport is provided", () => {
    render(<ExportDialog {...defaultProps} previousExport={mockPreviousExport} />);

    const indicator = screen.getByTestId("previous-export-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent("Campanha já exportada para");
    expect(indicator).toHaveTextContent("Instantly");
  });

  it("does not show previous export indicator when previousExport is null", () => {
    render(<ExportDialog {...defaultProps} previousExport={null} />);

    expect(screen.queryByTestId("previous-export-indicator")).not.toBeInTheDocument();
  });

  // H2: Re-export/update actions on previous export indicator
  it("shows re-export and update buttons when previousExport is provided", () => {
    render(<ExportDialog {...defaultProps} previousExport={mockPreviousExport} />);

    expect(screen.getByTestId("previous-export-actions")).toBeInTheDocument();
    expect(screen.getByTestId("re-export-button")).toBeInTheDocument();
    expect(screen.getByTestId("update-export-button")).toBeInTheDocument();
    expect(screen.getByText("Re-exportar")).toBeInTheDocument();
    expect(screen.getByText("Atualizar")).toBeInTheDocument();
  });

  it("toggles export mode between re-export and update", () => {
    render(<ExportDialog {...defaultProps} previousExport={mockPreviousExport} />);

    const reExportBtn = screen.getByTestId("re-export-button");
    const updateBtn = screen.getByTestId("update-export-button");

    // Default is re-export when previousExport exists
    expect(reExportBtn.className).toContain("border-primary");

    // Click update
    fireEvent.click(updateBtn);
    expect(updateBtn.className).toContain("border-primary");
  });

  it("shows ExportPreview when a platform is selected", () => {
    render(<ExportDialog {...defaultProps} />);

    expect(screen.queryByTestId("export-preview")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("platform-option-instantly"));

    expect(screen.getByTestId("export-preview")).toBeInTheDocument();
    expect(screen.getByText("ExportPreview: instantly")).toBeInTheDocument();
  });

  // H1: Lead selection UI
  it("shows lead selection options when a platform is selected (AC #3)", () => {
    render(<ExportDialog {...defaultProps} />);

    // Lead selection not visible before platform selected
    expect(screen.queryByTestId("lead-selection")).not.toBeInTheDocument();

    // Select CSV
    fireEvent.click(screen.getByTestId("platform-option-csv"));

    // Lead selection should now be visible
    expect(screen.getByTestId("lead-selection")).toBeInTheDocument();
    expect(screen.getByTestId("lead-selection-all")).toBeInTheDocument();
    expect(screen.getByTestId("lead-selection-selected")).toBeInTheDocument();
    expect(screen.getByText("Todos os leads da campanha")).toBeInTheDocument();
    expect(screen.getByText("Selecionar leads")).toBeInTheDocument();
  });

  it("export button is disabled when no platform is selected", () => {
    render(<ExportDialog {...defaultProps} />);

    const exportButton = screen.getByText("Selecione uma plataforma");
    expect(exportButton.closest("button")).toBeDisabled();
  });

  it("export button is disabled when no leads with email (CSV)", () => {
    render(
      <ExportDialog
        {...defaultProps}
        leadSummary={mockLeadSummaryNoEmails}
        leads={mockLeadsNoEmails}
      />
    );

    fireEvent.click(screen.getByTestId("platform-option-csv"));

    // Button disabled because advanced validation returns valid=false (no valid emails)
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find((b) => b.textContent?.includes("Exportar"));
    expect(exportBtn).toBeDisabled();
  });

  // H1 fix: Clipboard should be enabled even without leads (AC #3 — template only)
  it("export button is enabled for clipboard even when no leads with email", () => {
    render(
      <ExportDialog
        {...defaultProps}
        leadSummary={mockLeadSummaryNoEmails}
        leads={mockLeadsNoEmails}
      />
    );

    fireEvent.click(screen.getByTestId("platform-option-clipboard"));

    // Clipboard with no leads: validation still valid (clipboard skips lead checks)
    // but no email blocks error may show — blocks have complete email so should be valid
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find((b) => b.textContent?.includes("Exportar"));
    expect(exportBtn).not.toBeDisabled();
  });

  it("calls onExport with correct config including campaignId and leadSelection", () => {
    const onExport = vi.fn();
    render(<ExportDialog {...defaultProps} onExport={onExport} />);

    fireEvent.click(screen.getByTestId("platform-option-csv"));

    const exportButton = screen.getByText("Exportar para CSV");
    expect(exportButton.closest("button")).not.toBeDisabled();

    fireEvent.click(exportButton);

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith({
      campaignId: "camp-1",
      platform: "csv",
      leadSelection: "all",
      exportMode: "new",
      csvMode: "resolved",
    });
  });

  it("includes exportMode in config when previous export exists", () => {
    const onExport = vi.fn();
    render(
      <ExportDialog
        {...defaultProps}
        previousExport={mockPreviousExport}
        onExport={onExport}
      />
    );

    // Click update mode
    fireEvent.click(screen.getByTestId("update-export-button"));

    // Select CSV and export
    fireEvent.click(screen.getByTestId("platform-option-csv"));
    fireEvent.click(screen.getByText("Exportar para CSV"));

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ exportMode: "update" })
    );
  });

  it("shows SendingAccountSelector when Instantly is selected", () => {
    render(<ExportDialog {...defaultProps} />);

    expect(screen.queryByTestId("sending-account-selector")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("platform-option-instantly"));

    expect(screen.getByTestId("sending-account-selector")).toBeInTheDocument();
  });

  it("does not show SendingAccountSelector for non-Instantly platforms", () => {
    render(<ExportDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId("platform-option-csv"));

    expect(screen.queryByTestId("sending-account-selector")).not.toBeInTheDocument();
  });

  it("export button is disabled when platform is not configured", () => {
    render(<ExportDialog {...defaultProps} />);

    // Select Snov.io (not configured in fixture)
    fireEvent.click(screen.getByTestId("platform-option-snovio"));

    // Button text may vary (with/without warnings), but it should be disabled
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find((b) => b.textContent?.includes("Exportar"));
    expect(exportBtn).toBeDisabled();
  });

  // Story 7.7 AC #2: CSV Mode Toggle
  describe("CSV mode toggle (Story 7.7)", () => {
    it("mostra toggle CSV mode quando plataforma CSV é selecionada", () => {
      render(<ExportDialog {...defaultProps} />);

      // Select CSV platform
      fireEvent.click(screen.getByTestId("platform-option-csv"));

      expect(screen.getByTestId("csv-mode-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("csv-mode-resolved")).toBeInTheDocument();
      expect(screen.getByTestId("csv-mode-with-variables")).toBeInTheDocument();
    });

    it("não mostra toggle CSV mode para outras plataformas", () => {
      render(<ExportDialog {...defaultProps} />);

      // Select Instantly platform
      fireEvent.click(screen.getByTestId("platform-option-instantly"));

      expect(screen.queryByTestId("csv-mode-toggle")).not.toBeInTheDocument();
    });

    it("inclui csvMode no config ao exportar CSV", () => {
      const onExport = vi.fn();
      render(<ExportDialog {...defaultProps} onExport={onExport} />);

      // Select CSV platform
      fireEvent.click(screen.getByTestId("platform-option-csv"));
      // Select "com variáveis" mode
      fireEvent.click(screen.getByTestId("csv-mode-with-variables"));
      // Click export button (use role to avoid title collision)
      const buttons = screen.getAllByRole("button");
      const exportBtn = buttons.find((b) => b.textContent?.includes("Exportar para CSV"));
      fireEvent.click(exportBtn!);

      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: "csv",
          csvMode: "with_variables",
        })
      );
    });
  });

  // ==============================================
  // Story 7.8: Advanced Validation Integration
  // ==============================================
  describe("Advanced validation (Story 7.8)", () => {
    it("shows ValidationSummaryPanel when platform is selected", () => {
      render(<ExportDialog {...defaultProps} />);

      // No panel before platform selection
      expect(screen.queryByTestId("validation-panel-success")).not.toBeInTheDocument();

      // Select CSV
      fireEvent.click(screen.getByTestId("platform-option-csv"));

      // Panel should appear (success since all data is valid)
      expect(screen.getByTestId("validation-panel-success")).toBeInTheDocument();
    });

    it("disables export button when validation has errors", () => {
      const blocksNoComplete: BuilderBlock[] = [
        { id: "b1", type: "email", position: 0, data: { subject: "Sub", body: "" } },
      ];
      render(
        <ExportDialog
          {...defaultProps}
          blocks={blocksNoComplete}
        />
      );

      fireEvent.click(screen.getByTestId("platform-option-csv"));

      // Should show error panel (no complete email blocks)
      expect(screen.getByTestId("validation-panel-error")).toBeInTheDocument();

      // Export button disabled
      const buttons = screen.getAllByRole("button");
      const exportBtn = buttons.find((b) => b.textContent?.includes("Exportar"));
      expect(exportBtn).toBeDisabled();
    });

    it("shows 'Exportar com avisos' label when validation has warnings", () => {
      // Leads without icebreaker generate warnings
      const leadsWithWarnings: ExportLeadInfo[] = [
        { email: "a@b.com" },
        { email: "c@d.com" },
      ];
      render(
        <ExportDialog
          {...defaultProps}
          leads={leadsWithWarnings}
          leadSummary={{ ...mockLeadSummary, leadsWithoutIcebreaker: 2 }}
        />
      );

      fireEvent.click(screen.getByTestId("platform-option-csv"));

      expect(screen.getByText("Exportar com avisos")).toBeInTheDocument();
    });

    it("clipboard does not validate leads", () => {
      render(
        <ExportDialog
          {...defaultProps}
          leads={mockLeadsNoEmails}
          leadSummary={mockLeadSummaryNoEmails}
        />
      );

      fireEvent.click(screen.getByTestId("platform-option-clipboard"));

      // Should show success panel (clipboard skips lead validation)
      expect(screen.getByTestId("validation-panel-success")).toBeInTheDocument();
    });

    it("shows warning panel for unknown template variables", () => {
      const blocksWithUnknown: BuilderBlock[] = [
        { id: "b1", type: "email", position: 0, data: { subject: "{{unknown_var}}", body: "body" } },
      ];
      render(
        <ExportDialog
          {...defaultProps}
          blocks={blocksWithUnknown}
        />
      );

      fireEvent.click(screen.getByTestId("platform-option-csv"));

      expect(screen.getByTestId("validation-panel-warning")).toBeInTheDocument();
    });
  });
});
