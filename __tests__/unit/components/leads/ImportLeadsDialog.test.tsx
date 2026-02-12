/**
 * Tests for ImportLeadsDialog Component
 * Story 12.2: Import Leads via CSV
 * Story 12.3: Apollo enrichment for imported leads
 *
 * AC: #1 - Dialog opens/closes
 * AC: #2 - CSV upload
 * AC: #3 - Paste data
 * AC: #4 - Column mapping with auto-detection
 * AC: #5 - Segment selection
 * AC: #7 - Import summary
 * AC: #8 - Download CSV template
 * Story 12.3 AC: #1 - Enrich button after import
 * Story 12.3 AC: #5 - Enrichment progress
 * Story 12.3 AC: #6 - Enrichment summary
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { createElement, type ReactNode } from "react";

// Mock sonner
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock Tabs to render all content (Radix Tabs doesn't switch properly in happy-dom)
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    React.createElement("div", { "data-testid": "tabs", ...props }, children),
  TabsList: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    React.createElement("div", props, children),
  TabsTrigger: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    React.createElement("button", props, children),
  TabsContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    React.createElement("div", props, children),
}));

// Mock useSegments
const mockSegments = [
  { id: "seg-1", tenantId: "t1", name: "Segmento A", description: null, createdAt: "", updatedAt: "", leadCount: 5 },
  { id: "seg-2", tenantId: "t1", name: "Segmento B", description: null, createdAt: "", updatedAt: "", leadCount: 3 },
];

const mockCreateSegmentMutateAsync = vi.fn();
vi.mock("@/hooks/use-segments", () => ({
  useSegments: () => ({ data: mockSegments, isLoading: false }),
  useCreateSegment: () => ({
    mutateAsync: mockCreateSegmentMutateAsync,
    isPending: false,
  }),
}));

// Mock useImportLeadsCsv
const mockImportMutateAsync = vi.fn();
vi.mock("@/hooks/use-import-leads-csv", () => ({
  useImportLeadsCsv: () => ({
    mutateAsync: mockImportMutateAsync,
    isPending: false,
  }),
}));

// Mock useBulkEnrichPersistedLeads (Story 12.3)
const mockEnrichMutateAsync = vi.fn();
vi.mock("@/hooks/use-enrich-persisted-lead", () => ({
  useBulkEnrichPersistedLeads: () => ({
    mutateAsync: mockEnrichMutateAsync,
    isPending: false,
  }),
}));

// Mock csv-parser
const mockParseCSVData = vi.fn();
const mockDetectLeadColumnMappings = vi.fn();
vi.mock("@/lib/utils/csv-parser", () => ({
  parseCSVData: (...args: unknown[]) => mockParseCSVData(...args),
  detectLeadColumnMappings: (...args: unknown[]) => mockDetectLeadColumnMappings(...args),
}));

import { ImportLeadsDialog } from "@/components/leads/ImportLeadsDialog";

// ==============================================
// HELPERS
// ==============================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderDialog(open = true) {
  const onOpenChange = vi.fn();
  const result = render(
    createElement(ImportLeadsDialog, { open, onOpenChange }),
    { wrapper: createWrapper() }
  );
  return { ...result, onOpenChange };
}

const PARSED_CSV = {
  headers: ["nome", "sobrenome", "email", "empresa", "cargo", "linkedin", "telefone"],
  rows: [
    ["João", "Silva", "joao@empresa.com", "ABC", "Diretor", "", "11999"],
    ["Maria", "Santos", "maria@empresa.com", "XYZ", "CTO", "", ""],
  ],
};

const AUTO_MAPPINGS = {
  nameColumn: 0,
  lastNameColumn: 1,
  emailColumn: 2,
  companyColumn: 3,
  titleColumn: 4,
  linkedinColumn: 5,
  phoneColumn: 6,
};

function setupCSVParsing() {
  mockParseCSVData.mockReturnValue(PARSED_CSV);
  mockDetectLeadColumnMappings.mockReturnValue(AUTO_MAPPINGS);
}

function setupCSVParsingUnrecognized() {
  mockParseCSVData.mockReturnValue({
    headers: ["foo", "bar"],
    rows: [["value1", "value2"]],
  });
  mockDetectLeadColumnMappings.mockReturnValue({
    nameColumn: null,
    lastNameColumn: null,
    emailColumn: null,
    companyColumn: null,
    titleColumn: null,
    linkedinColumn: null,
    phoneColumn: null,
  });
}

/** Navigate to mapping step via paste */
async function goToMapping() {
  setupCSVParsing();
  renderDialog();

  const textarea = screen.getByTestId("paste-textarea");
  fireEvent.change(textarea, { target: { value: "nome,email\nJoão,j@test.com" } });
  fireEvent.click(screen.getByTestId("process-paste-button"));

  await waitFor(() => {
    expect(screen.getByText("Mapeamento de colunas")).toBeInTheDocument();
  });
}

/** Navigate to segment step */
async function goToSegment() {
  await goToMapping();
  fireEvent.click(screen.getByTestId("mapping-next-button"));

  await waitFor(() => {
    expect(screen.getByTestId("segment-select")).toBeInTheDocument();
  });
}

// ==============================================
// TESTS
// ==============================================

describe("ImportLeadsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dialog rendering (AC #1)", () => {
    it("should render dialog when open", () => {
      renderDialog(true);
      expect(screen.getByText("Importar Leads via CSV")).toBeInTheDocument();
    });

    it("should not render content when closed", () => {
      renderDialog(false);
      expect(screen.queryByText("Importar Leads via CSV")).not.toBeInTheDocument();
    });

    it("should show upload and paste tabs (AC #2, #3)", () => {
      renderDialog();
      expect(screen.getByTestId("tab-upload")).toBeInTheDocument();
      expect(screen.getByTestId("tab-paste")).toBeInTheDocument();
    });

    it("should show download template button (AC #8)", () => {
      renderDialog();
      expect(screen.getByTestId("download-template-button")).toBeInTheDocument();
      expect(screen.getByText("Baixar modelo CSV")).toBeInTheDocument();
    });

    it("should show upload dropzone and paste textarea on input step", () => {
      renderDialog();
      expect(screen.getByTestId("upload-dropzone")).toBeInTheDocument();
      expect(screen.getByTestId("paste-textarea")).toBeInTheDocument();
    });
  });

  describe("Download template (AC #8)", () => {
    it("should call URL.createObjectURL when clicked", () => {
      const mockCreateObjectURL = vi.fn(() => "blob:test");
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      renderDialog();
      fireEvent.click(screen.getByTestId("download-template-button"));

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });

  describe("Paste data flow (AC #3)", () => {
    it("should disable process button when textarea is empty", () => {
      renderDialog();
      expect(screen.getByTestId("process-paste-button")).toBeDisabled();
    });

    it("should enable process button when text is entered", () => {
      renderDialog();
      const textarea = screen.getByTestId("paste-textarea");
      fireEvent.change(textarea, { target: { value: "nome\nJoão" } });
      expect(screen.getByTestId("process-paste-button")).not.toBeDisabled();
    });

    it("should parse pasted CSV and move to mapping step", async () => {
      setupCSVParsing();
      renderDialog();

      const textarea = screen.getByTestId("paste-textarea");
      fireEvent.change(textarea, { target: { value: "nome,email\nJoão,j@test.com" } });
      fireEvent.click(screen.getByTestId("process-paste-button"));

      await waitFor(() => {
        expect(screen.getByText("Mapeamento de colunas")).toBeInTheDocument();
      });

      expect(mockParseCSVData).toHaveBeenCalled();
      expect(mockDetectLeadColumnMappings).toHaveBeenCalledWith(PARSED_CSV.headers);
    });

    it("should show error for data with only headers", async () => {
      mockParseCSVData.mockReturnValue({ headers: ["nome"], rows: [] });

      renderDialog();
      const textarea = screen.getByTestId("paste-textarea");
      fireEvent.change(textarea, { target: { value: "nome" } });
      fireEvent.click(screen.getByTestId("process-paste-button"));

      await waitFor(() => {
        expect(screen.getByText(/Nenhuma linha de dados encontrada/)).toBeInTheDocument();
      });
    });

    it("should show error for empty parsed data", async () => {
      mockParseCSVData.mockReturnValue({ headers: [], rows: [] });

      renderDialog();
      const textarea = screen.getByTestId("paste-textarea");
      fireEvent.change(textarea, { target: { value: "x" } });
      fireEvent.click(screen.getByTestId("process-paste-button"));

      await waitFor(() => {
        expect(screen.getByText(/Nenhum dado encontrado/)).toBeInTheDocument();
      });
    });
  });

  describe("Column mapping (AC #4)", () => {
    it("should show all 7 field mapping selects", async () => {
      await goToMapping();

      expect(screen.getByTestId("mapping-nameColumn")).toBeInTheDocument();
      expect(screen.getByTestId("mapping-lastNameColumn")).toBeInTheDocument();
      expect(screen.getByTestId("mapping-emailColumn")).toBeInTheDocument();
      expect(screen.getByTestId("mapping-companyColumn")).toBeInTheDocument();
      expect(screen.getByTestId("mapping-titleColumn")).toBeInTheDocument();
      expect(screen.getByTestId("mapping-linkedinColumn")).toBeInTheDocument();
      expect(screen.getByTestId("mapping-phoneColumn")).toBeInTheDocument();
    });

    it("should show preview with mapped lead data", async () => {
      await goToMapping();

      // Preview shows leads as cards with mapped data
      expect(screen.getByText(/2 de 2 linhas/)).toBeInTheDocument();
      // Name + LastName combined on first line
      expect(screen.getByText(/João/)).toBeInTheDocument();
      expect(screen.getByText(/Maria/)).toBeInTheDocument();
    });

    it("should require Nome column to proceed", async () => {
      setupCSVParsingUnrecognized();
      renderDialog();

      const textarea = screen.getByTestId("paste-textarea");
      fireEvent.change(textarea, { target: { value: "foo,bar\nval1,val2" } });
      fireEvent.click(screen.getByTestId("process-paste-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mapping-next-button")).toBeInTheDocument();
      });

      expect(screen.getByTestId("mapping-next-button")).toBeDisabled();
    });

    it("should navigate back to input step", async () => {
      await goToMapping();

      fireEvent.click(screen.getByText("Voltar"));

      await waitFor(() => {
        expect(screen.getByTestId("tab-upload")).toBeInTheDocument();
      });
    });
  });

  describe("Segment selection (AC #5)", () => {
    it("should show segment selection step", async () => {
      await goToSegment();

      expect(screen.getByText("Segmento existente")).toBeInTheDocument();
      expect(screen.getByTestId("new-segment-input")).toBeInTheDocument();
    });

    it("should show import button with lead count", async () => {
      await goToSegment();

      expect(screen.getByTestId("import-button")).toBeInTheDocument();
      expect(screen.getByText("Importar 2 leads")).toBeInTheDocument();
    });

    it("should allow typing new segment name", async () => {
      await goToSegment();

      const input = screen.getByTestId("new-segment-input");
      await userEvent.type(input, "Novo Segmento");

      expect(input).toHaveValue("Novo Segmento");
    });

    it("should navigate back to mapping step", async () => {
      await goToSegment();

      fireEvent.click(screen.getByText("Voltar"));

      await waitFor(() => {
        expect(screen.getByText("Mapeamento de colunas")).toBeInTheDocument();
      });
    });
  });

  describe("Import processing (AC #6, #7)", () => {
    it("should call import mutation and show summary on success", async () => {
      mockImportMutateAsync.mockResolvedValue({
        imported: 2,
        existing: 0,
        errors: [],
        leads: [],
      });

      await goToSegment();
      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(screen.getByText(/2 leads importados/)).toBeInTheDocument();
      });

      expect(mockImportMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          leads: expect.arrayContaining([
            expect.objectContaining({ firstName: "João" }),
          ]),
        })
      );
    });

    it("should show singular form for 1 lead imported", async () => {
      mockImportMutateAsync.mockResolvedValue({
        imported: 1,
        existing: 0,
        errors: [],
        leads: [],
      });

      await goToSegment();
      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(screen.getByText(/1 lead importado(?!s)/)).toBeInTheDocument();
      });
    });

    it("should show duplicates in summary", async () => {
      mockImportMutateAsync.mockResolvedValue({
        imported: 1,
        existing: 1,
        errors: [],
        leads: [],
      });

      await goToSegment();
      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(screen.getByText(/1 lead importado/)).toBeInTheDocument();
        expect(screen.getByText(/1 duplicata ignorada/)).toBeInTheDocument();
      });
    });

    it("should show errors in summary", async () => {
      mockImportMutateAsync.mockResolvedValue({
        imported: 1,
        existing: 0,
        errors: ["Erro ao associar segmento"],
        leads: [],
      });

      await goToSegment();
      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(screen.getByText("1 erro")).toBeInTheDocument();
        expect(screen.getByText("Erro ao associar segmento")).toBeInTheDocument();
      });
    });

    it("should show error on import failure", async () => {
      mockImportMutateAsync.mockRejectedValue(new Error("Erro de rede"));

      await goToSegment();
      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(screen.getByText("Erro de rede")).toBeInTheDocument();
      });
    });

    it("should create new segment before importing", async () => {
      mockCreateSegmentMutateAsync.mockResolvedValue({
        id: "new-seg-id",
        name: "Novo",
        tenantId: "t1",
        description: null,
        createdAt: "",
        updatedAt: "",
        leadCount: 0,
      });
      mockImportMutateAsync.mockResolvedValue({
        imported: 2,
        existing: 0,
        errors: [],
        leads: [],
      });

      await goToSegment();

      const input = screen.getByTestId("new-segment-input");
      await userEvent.type(input, "Novo Segmento");

      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(mockCreateSegmentMutateAsync).toHaveBeenCalledWith({
          name: "Novo Segmento",
        });
        expect(mockImportMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ segmentId: "new-seg-id" })
        );
      });
    });

    it("should show close button in summary", async () => {
      mockImportMutateAsync.mockResolvedValue({
        imported: 1,
        existing: 0,
        errors: [],
        leads: [],
      });

      await goToSegment();
      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(screen.getByTestId("close-button")).toBeInTheDocument();
      });
    });
  });

  describe("State reset", () => {
    it("should reset state when dialog closes", () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        createElement(ImportLeadsDialog, { open: true, onOpenChange }),
        { wrapper: createWrapper() }
      );

      rerender(createElement(ImportLeadsDialog, { open: false, onOpenChange }));
      rerender(createElement(ImportLeadsDialog, { open: true, onOpenChange }));

      expect(screen.getByTestId("tab-upload")).toBeInTheDocument();
    });
  });

  describe("Apollo enrichment (Story 12.3)", () => {
    /** Navigate to summary step with imported leads that have IDs */
    async function goToSummaryWithLeads(leadIds: string[] = ["id-1", "id-2"]) {
      mockImportMutateAsync.mockResolvedValue({
        imported: leadIds.length,
        existing: 0,
        errors: [],
        leads: leadIds,
      });

      await goToSegment();
      fireEvent.click(screen.getByTestId("import-button"));

      await waitFor(() => {
        expect(screen.getByTestId("close-button")).toBeInTheDocument();
      });
    }

    it("should show enrich button after import with leads (AC #1)", async () => {
      await goToSummaryWithLeads();

      const enrichButton = screen.getByTestId("enrich-button");
      expect(enrichButton).toBeInTheDocument();
      expect(enrichButton).toHaveTextContent("Enriquecer com Apollo");
    });

    it("should NOT show enrich button when no leads imported", async () => {
      await goToSummaryWithLeads([]);

      expect(screen.queryByTestId("enrich-button")).not.toBeInTheDocument();
    });

    it("should show enrichment progress during enrichment (AC #5)", async () => {
      // Make enrichment hang (never resolve) to test running state
      mockEnrichMutateAsync.mockReturnValue(new Promise(() => {}));

      await goToSummaryWithLeads();
      fireEvent.click(screen.getByTestId("enrich-button"));

      await waitFor(() => {
        expect(screen.getByTestId("enrichment-progress")).toBeInTheDocument();
      });
      expect(screen.getByText(/Enriquecendo 2 leads com Apollo/)).toBeInTheDocument();
      // Enrich button should disappear during enrichment
      expect(screen.queryByTestId("enrich-button")).not.toBeInTheDocument();
    });

    it("should disable close button during enrichment", async () => {
      mockEnrichMutateAsync.mockReturnValue(new Promise(() => {}));

      await goToSummaryWithLeads();
      fireEvent.click(screen.getByTestId("enrich-button"));

      await waitFor(() => {
        expect(screen.getByTestId("enrichment-progress")).toBeInTheDocument();
      });
      expect(screen.getByTestId("close-button")).toBeDisabled();
    });

    it("should show enrichment summary after completion (AC #6)", async () => {
      mockEnrichMutateAsync.mockResolvedValue({
        enriched: 1,
        notFound: 1,
        failed: 0,
        leads: [],
      });

      await goToSummaryWithLeads();
      fireEvent.click(screen.getByTestId("enrich-button"));

      await waitFor(() => {
        expect(screen.getByTestId("enrichment-summary")).toBeInTheDocument();
      });
      expect(screen.getByText(/1 enriquecido/)).toBeInTheDocument();
      expect(screen.getByText(/1 não encontrado no Apollo/)).toBeInTheDocument();
    });

    it("should show all failures when enrichment throws", async () => {
      mockEnrichMutateAsync.mockRejectedValue(new Error("Network error"));

      await goToSummaryWithLeads(["id-1", "id-2", "id-3"]);
      fireEvent.click(screen.getByTestId("enrich-button"));

      await waitFor(() => {
        expect(screen.getByTestId("enrichment-summary")).toBeInTheDocument();
      });
      expect(screen.getByText(/3 erros/)).toBeInTheDocument();
    });

    it("should re-enable close button after enrichment completes", async () => {
      mockEnrichMutateAsync.mockResolvedValue({
        enriched: 2,
        notFound: 0,
        failed: 0,
        leads: [],
      });

      await goToSummaryWithLeads();
      fireEvent.click(screen.getByTestId("enrich-button"));

      await waitFor(() => {
        expect(screen.getByTestId("enrichment-summary")).toBeInTheDocument();
      });
      expect(screen.getByTestId("close-button")).not.toBeDisabled();
    });
  });
});
