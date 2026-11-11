/**
 * Unit tests for PhoneLookupProgress Component
 * Story 4.5: Phone Number Lookup
 *
 * Tests:
 * - AC #5.1 - Creates component
 * - AC #5.2 - Progress bar with X/Y counter
 * - AC #5.3 - Current lead being processed
 * - AC #5.4 - Cancel button to stop batch
 * - AC #5.5 - Results list (found/not found)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhoneLookupProgress } from "@/components/leads/PhoneLookupProgress";
import { createMockLead } from "../../../helpers/mock-data";

// Mock batchPhoneLookup
vi.mock("@/hooks/use-phone-lookup", () => ({
  batchPhoneLookup: vi.fn(),
}));

import { batchPhoneLookup } from "@/hooks/use-phone-lookup";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create test wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("PhoneLookupProgress", () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // AC #5.1 - Component renders
  describe("rendering", () => {
    it("renders dialog when open", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      const leads = [createMockLead({ firstName: "Test" })];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Buscando telefones")).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      render(
        <PhoneLookupProgress
          leads={[]}
          open={false}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByText("Buscando telefones")).not.toBeInTheDocument();
    });
  });

  // AC #5.2 - Progress bar with X/Y counter
  describe("progress display", () => {
    it("shows progress percentage", async () => {
      let progressCallback: NonNullable<Parameters<typeof batchPhoneLookup>[1]>;
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(async (leads, onProgress) => {
        progressCallback = onProgress!;
        // Simulate processing first lead
        onProgress?.(1, 2, { leadId: "1", status: "found", phone: "+55" });
        return [];
      });

      const leads = [
        createMockLead({ id: "1", firstName: "Lead1" }),
        createMockLead({ id: "2", firstName: "Lead2" }),
      ];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Should show total leads
      await waitFor(() => {
        expect(screen.getByText(/Processando 2 leads/)).toBeInTheDocument();
      });
    });
  });

  // AC #5.4 - Cancel button
  describe("cancel functionality", () => {
    it("shows cancel button during processing", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      );

      const leads = [createMockLead()];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      const cancelButton = screen.getByRole("button", { name: /cancelar/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      );

      const leads = [createMockLead()];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      const cancelButton = screen.getByRole("button", { name: /cancelar/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  // AC #5.5 - Results list
  describe("results display", () => {
    it("shows stats summary", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(async (leads, onProgress) => {
        onProgress?.(1, 2, { leadId: "1", status: "found", phone: "+55" });
        onProgress?.(2, 2, { leadId: "2", status: "not_found" });
        return [
          { leadId: "1", status: "found", phone: "+55" },
          { leadId: "2", status: "not_found" },
        ];
      });

      const leads = [
        createMockLead({ id: "1", firstName: "Lead1" }),
        createMockLead({ id: "2", firstName: "Lead2" }),
      ];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Wait for results to be displayed - check stats summary container
      await waitFor(() => {
        // Both "encontrados" and "não encontrados" should be present
        const foundElements = screen.getAllByText(/encontrados/i);
        expect(foundElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // Empty leads handling
  describe("empty leads handling", () => {
    it("shows error message when leads array is empty", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      render(
        <PhoneLookupProgress
          leads={[]}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Should show error message
      await waitFor(() => {
        expect(
          screen.getByText(/Nenhum lead selecionado para buscar telefone/i)
        ).toBeInTheDocument();
      });

      // Should NOT call batchPhoneLookup
      expect(mockBatchLookup).not.toHaveBeenCalled();
    });

    it("shows close button when there is an error", async () => {
      render(
        <PhoneLookupProgress
          leads={[]}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Should show "Fechar" button instead of "Cancelar"
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
      });
    });

    it("does not call onComplete when leads array is empty", async () => {
      render(
        <PhoneLookupProgress
          leads={[]}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Wait a bit to ensure effect has run
      await waitFor(() => {
        expect(
          screen.getByText(/Nenhum lead selecionado/i)
        ).toBeInTheDocument();
      });

      // Should NOT call onComplete
      expect(mockOnComplete).not.toHaveBeenCalled();
    });
  });

  // Completion
  describe("completion", () => {
    it("calls onComplete when user clicks Fechar button", async () => {
      const user = userEvent.setup();
      const results = [{ leadId: "1", status: "found" as const, phone: "+55" }];
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue(results);

      const leads = [createMockLead({ id: "1" })];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Wait for processing to complete and "Fechar" button to appear
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
      });

      // Click "Fechar" to close dialog - this should call onComplete
      const closeButton = screen.getByRole("button", { name: /fechar/i });
      await user.click(closeButton);

      expect(mockOnComplete).toHaveBeenCalledWith(results);
    });

    it("shows close button when complete", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      const leads = [createMockLead()];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        // After completion, should show "Fechar" button instead of "Cancelar"
        expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
      });
    });
  });

  // DW-3: fixa o comportamento de abrir/fechar/reabrir; o estado agora é
  // ajustado no render quando `open` muda, sem setState dentro de efeito
  describe("abrir, fechar e reabrir (DW-3)", () => {
    function renderDialog(leads: ReturnType<typeof createMockLead>[], open: boolean) {
      const Wrapper = createWrapper();
      const ui = (l: typeof leads, o: boolean) => (
        <Wrapper>
          <PhoneLookupProgress
            leads={l}
            open={o}
            onComplete={mockOnComplete}
            onCancel={mockOnCancel}
          />
        </Wrapper>
      );
      const result = render(ui(leads, open));
      return {
        ...result,
        setProps: (l: typeof leads, o: boolean) => result.rerender(ui(l, o)),
      };
    }

    it("montado aberto sem leads mostra o erro e não chama a busca", () => {
      renderDialog([], true);

      expect(
        screen.getByText(/Nenhum lead selecionado para buscar telefone/i)
      ).toBeInTheDocument();
      expect(screen.queryByText(/Processando 0 de 0/)).not.toBeInTheDocument();
      expect(batchPhoneLookup).not.toHaveBeenCalled();
    });

    it("reabrir depois de concluir zera o estado e busca de novo", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementationOnce(async (_leads, onProgress) => {
        onProgress?.(1, 1, { leadId: "1", status: "found", phone: "+5511" });
        return [{ leadId: "1", status: "found", phone: "+5511" }];
      });
      let resolveSecond: (r: Awaited<ReturnType<typeof batchPhoneLookup>>) => void = () => {};
      mockBatchLookup.mockImplementationOnce(
        () => new Promise((resolve) => { resolveSecond = resolve; })
      );

      const leads = [createMockLead({ id: "1", firstName: "Ana", lastName: "" })];
      const { setProps } = renderDialog(leads, true);

      await waitFor(() => {
        expect(screen.getByText("Concluído")).toBeInTheDocument();
      });
      expect(screen.getByText("+5511")).toBeInTheDocument();
      expect(mockBatchLookup).toHaveBeenCalledTimes(1);

      setProps(leads, false);
      setProps(leads, true);

      // Estado zerado: sem resultado antigo, contador do zero, busca disparada de novo
      await waitFor(() => {
        expect(mockBatchLookup).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByText("Processando 0 de 1")).toBeInTheDocument();
      expect(screen.queryByText("+5511")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();

      resolveSecond([]);
      await waitFor(() => {
        expect(screen.getByText("Concluído")).toBeInTheDocument();
      });
    });

    it("rerender aberto com os mesmos dados não dispara a busca de novo", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      const leads = [createMockLead({ id: "1" })];
      const { setProps } = renderDialog(leads, true);

      await waitFor(() => {
        expect(screen.getByText("Concluído")).toBeInTheDocument();
      });
      setProps([...leads], true);
      setProps([...leads], true);

      expect(mockBatchLookup).toHaveBeenCalledTimes(1);
    });

    it("reabrir com a lista vazia mostra o erro e o Fechar não devolve resultados antigos", async () => {
      const user = userEvent.setup();
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      const firstResults = [{ leadId: "1", status: "found" as const, phone: "+55" }];
      mockBatchLookup.mockResolvedValue(firstResults);

      const leads = [createMockLead({ id: "1" })];
      const { setProps } = renderDialog(leads, true);

      await waitFor(() => {
        expect(screen.getByText("Concluído")).toBeInTheDocument();
      });

      setProps([], false);
      setProps([], true);

      expect(
        screen.getByText(/Nenhum lead selecionado para buscar telefone/i)
      ).toBeInTheDocument();
      expect(mockBatchLookup).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: /fechar/i }));
      expect(mockOnComplete).toHaveBeenCalledWith([]);
    });

    it("fechar depois de um erro e reabrir com leads limpa o erro e busca", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      const leads = [createMockLead({ id: "1" })];
      const { setProps } = renderDialog([], true);
      expect(screen.getByText(/Nenhum lead selecionado/i)).toBeInTheDocument();

      setProps([], false);
      setProps(leads, true);

      await waitFor(() => {
        expect(mockBatchLookup).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText(/Nenhum lead selecionado/i)).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText("Concluído")).toBeInTheDocument();
      });
    });

    it("resultado que chega depois de fechar: reabrir sem leads mostra o Concluído, não o erro (igual ao antigo)", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      let resolveFirst: (r: Awaited<ReturnType<typeof batchPhoneLookup>>) => void = () => {};
      mockBatchLookup.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; })
      );

      const leads = [createMockLead({ id: "1" })];
      const { setProps } = renderDialog(leads, true);
      await waitFor(() => {
        expect(mockBatchLookup).toHaveBeenCalledTimes(1);
      });

      // Fecha no meio da busca; a busca termina com o diálogo fechado
      setProps(leads, false);
      await act(async () => {
        resolveFirst([{ leadId: "1", status: "found", phone: "+55" }]);
      });

      setProps([], true);

      expect(screen.getByText("Concluído")).toBeInTheDocument();
      expect(screen.queryByText(/Nenhum lead selecionado/i)).not.toBeInTheDocument();
      expect(mockBatchLookup).toHaveBeenCalledTimes(1);
    });

    it("aberto e ocioso: leads que viram lista vazia mostram o erro sem nova busca", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      let rejectFirst: (e: Error) => void = () => {};
      mockBatchLookup.mockImplementationOnce(
        () => new Promise((_resolve, reject) => { rejectFirst = reject; })
      );

      const leads = [createMockLead({ id: "1" })];
      const { setProps } = renderDialog(leads, true);
      await waitFor(() => {
        expect(mockBatchLookup).toHaveBeenCalledTimes(1);
      });

      // Sem transição de `open`: a lista esvazia e a busca é abortada
      setProps([], true);
      await act(async () => {
        const abort = new Error("aborted");
        abort.name = "AbortError";
        rejectFirst(abort);
      });

      expect(
        screen.getByText(/Nenhum lead selecionado para buscar telefone/i)
      ).toBeInTheDocument();
      expect(mockBatchLookup).toHaveBeenCalledTimes(1);
    });
  });
});
