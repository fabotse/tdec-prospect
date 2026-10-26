/**
 * SuppressionList / SuppressionAddForm / SuppressionImportDialog tests
 * Story 23.5 - Lista de supressão: cadastro e import
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { SuppressionEntry } from "@/types/suppression";

const mockUseSuppressionList = vi.fn();
vi.mock("@/hooks/use-suppression-list", () => ({
  useSuppressionList: () => mockUseSuppressionList(),
}));

const mockUseUser = vi.fn();
vi.mock("@/hooks/use-user", () => ({
  useUser: () => mockUseUser(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { SuppressionList } from "@/components/settings/SuppressionList";
import { SuppressionImportDialog } from "@/components/settings/SuppressionImportDialog";

beforeAll(() => {
  // Radix Select no jsdom
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const refetch = vi.fn();
const addEntry = vi.fn();
const removeEntry = vi.fn();
const importEntries = vi.fn();

const entries: SuppressionEntry[] = [
  {
    id: "1",
    tenant_id: "t1",
    entry_type: "domain",
    value: "cliente.com.br",
    reason: "cliente",
    source: "manual",
    created_by: null,
    created_at: "2026-10-26T10:00:00Z",
  },
  {
    id: "2",
    tenant_id: "t1",
    entry_type: "email",
    value: "joao@rival.com",
    reason: "concorrente",
    source: "import_csv",
    created_by: null,
    created_at: "2026-10-25T10:00:00Z",
  },
];

function listState(overrides: Record<string, unknown> = {}) {
  return {
    entries,
    isLoading: false,
    error: null,
    refetch,
    addEntry,
    removeEntry,
    importEntries,
    isAdding: false,
    isRemoving: false,
    isImporting: false,
    ...overrides,
  };
}

function asRole(isAdmin: boolean) {
  mockUseUser.mockReturnValue({ isAdmin, isLoading: false, isProfileLoading: false });
}

describe("SuppressionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSuppressionList.mockReturnValue(listState());
    asRole(true);
  });

  it("loading", () => {
    mockUseSuppressionList.mockReturnValue(listState({ isLoading: true }));
    render(<SuppressionList />);
    expect(screen.getByTestId("suppression-loading")).toBeInTheDocument();
  });

  it("erro com Tentar novamente (tabela ausente)", () => {
    mockUseSuppressionList.mockReturnValue(
      listState({ error: "A lista de supressão ainda não está disponível neste ambiente" })
    );
    render(<SuppressionList />);
    expect(screen.getByText(/ainda não está disponível/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("suppression-retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("vazio", () => {
    mockUseSuppressionList.mockReturnValue(listState({ entries: [] }));
    render(<SuppressionList />);
    expect(screen.getByTestId("suppression-empty")).toBeInTheDocument();
  });

  it("gestor vê tabela, contador e ações de escrita", () => {
    render(<SuppressionList />);
    expect(screen.getByTestId("suppression-table")).toBeInTheDocument();
    const table = within(screen.getByTestId("suppression-table"));
    expect(table.getByText("cliente.com.br")).toBeInTheDocument();
    expect(table.getByText("Import CSV")).toBeInTheDocument();
    expect(table.getByText("Concorrente")).toBeInTheDocument();
    expect(screen.getByTestId("suppression-count")).toHaveTextContent("2 entradas");
    expect(screen.getByTestId("suppression-add-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /importar csv/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remover cliente.com.br/i })).toBeInTheDocument();
  });

  it("SDR vê tabela e busca, sem adicionar/importar/remover", () => {
    asRole(false);
    render(<SuppressionList />);
    expect(screen.getByTestId("suppression-table")).toBeInTheDocument();
    expect(screen.getByLabelText(/buscar na lista/i)).toBeInTheDocument();
    expect(screen.queryByTestId("suppression-add-form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /importar csv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remover/i })).not.toBeInTheDocument();
  });

  it("esconde a escrita enquanto o perfil carrega", () => {
    mockUseUser.mockReturnValue({ isAdmin: true, isLoading: false, isProfileLoading: true });
    render(<SuppressionList />);
    expect(screen.queryByTestId("suppression-add-form")).not.toBeInTheDocument();
  });

  it("busca filtra por valor e motivo", () => {
    render(<SuppressionList />);
    const search = screen.getByLabelText(/buscar na lista/i);

    fireEvent.change(search, { target: { value: "RIVAL" } });
    expect(screen.queryByText("cliente.com.br")).not.toBeInTheDocument();
    expect(screen.getByText("joao@rival.com")).toBeInTheDocument();
    expect(screen.getByTestId("suppression-count")).toHaveTextContent("1 de 2 entradas");

    fireEvent.change(search, { target: { value: "cliente" } });
    expect(screen.getByText("cliente.com.br")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nada-a-ver" } });
    expect(screen.getByTestId("suppression-no-results")).toBeInTheDocument();
  });

  it("busca ignora acentos (negociacao acha Negociação)", () => {
    mockUseSuppressionList.mockReturnValue(
      listState({
        entries: [...entries, { ...entries[0], id: "3", value: "deal.com", reason: "negociacao" }],
      })
    );
    render(<SuppressionList />);
    fireEvent.change(screen.getByLabelText(/buscar na lista/i), {
      target: { value: "negociacao" },
    });
    const table = within(screen.getByTestId("suppression-table"));
    expect(table.getByText("deal.com")).toBeInTheDocument();
    expect(table.queryByText("cliente.com.br")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/buscar na lista/i), {
      target: { value: "NEGOCIAÇÃO" },
    });
    expect(table.getByText("deal.com")).toBeInTheDocument();
  });

  it("remover pede confirmação", async () => {
    removeEntry.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SuppressionList />);

    await user.click(screen.getByRole("button", { name: /remover cliente.com.br/i }));
    expect(removeEntry).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: /^remover$/i }));

    await waitFor(() => expect(removeEntry).toHaveBeenCalledWith("1"));
    expect(toast.success).toHaveBeenCalled();
  });

  describe("adicionar", () => {
    async function fill(value: string) {
      const user = userEvent.setup();
      render(<SuppressionList />);
      await user.type(screen.getByLabelText(/domínio ou e-mail/i), value);
      await user.click(screen.getByRole("combobox", { name: /motivo/i }));
      await user.click(await screen.findByRole("option", { name: "Cliente" }));
      await user.click(screen.getByRole("button", { name: /^adicionar$/i }));
    }

    it("grava e avisa sucesso", async () => {
      addEntry.mockResolvedValue({ success: true, data: { duplicate: false } });
      await fill("empresa.com");
      await waitFor(() =>
        expect(addEntry).toHaveBeenCalledWith({ value: "empresa.com", reason: "cliente" })
      );
      expect(toast.success).toHaveBeenCalled();
    });

    it("duplicado → toast de aviso 'já está na lista'", async () => {
      addEntry.mockResolvedValue({ success: true, data: { duplicate: true } });
      await fill("empresa.com");
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/já está na lista/)));
    });

    it("valor inválido não chama a action", async () => {
      await fill("empresa");
      expect(await screen.findByText(/valor inválido/i)).toBeInTheDocument();
      expect(addEntry).not.toHaveBeenCalled();
    });
  });
});

describe("SuppressionImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderDialog() {
    render(
      <SuppressionImportDialog
        open
        onOpenChange={vi.fn()}
        onImport={importEntries}
        isImporting={false}
      />
    );
  }

  async function upload(content: string | Uint8Array, name = "lista.csv") {
    const input = screen.getByLabelText(/arquivo/i) as HTMLInputElement;
    const file = new File([content as BlobPart], name, { type: "text/csv" });
    await userEvent.upload(input, file);
    return input;
  }

  it("decodifica CSV Windows-1252 (Excel em português)", async () => {
    importEntries.mockResolvedValue({ success: true, data: { accepted: 1, skipped: [] } });
    renderDialog();
    // "Domínio;Motivo\na.com;Negociação" em Windows-1252
    const text = "Domínio;Motivo\na.com;Negociação";
    const bytes = Uint8Array.from(Array.from(text, (ch) => ch.charCodeAt(0)));
    await upload(bytes);

    await screen.findByText(/1 linha\(s\) para importar/);
    await userEvent.click(screen.getByRole("button", { name: /^importar$/i }));
    await waitFor(() =>
      expect(importEntries).toHaveBeenCalledWith([{ line: 2, value: "a.com", reason: "Negociação" }])
    );
  });

  it("limpa o input e as linhas do arquivo anterior ao escolher outro", async () => {
    renderDialog();
    const input = await upload("valor;motivo\na.com;cliente");
    await screen.findByText(/1 linha\(s\)/);
    expect(input.value).toBe("");

    await upload("nome;motivo\nfoo;cliente", "outro.csv");
    expect(await screen.findByRole("alert")).toHaveTextContent("coluna de domínio/e-mail não encontrada");
    expect(screen.queryByText(/linha\(s\) para importar/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^importar$/i })).toBeDisabled();
  });

  it("mostra o relatório com linha e motivo de cada ignorada", async () => {
    importEntries.mockResolvedValue({
      success: true,
      data: {
        accepted: 1,
        skipped: [
          { line: 3, value: "empresa", reason: "valor inválido" },
          { line: 4, value: "x.com", reason: "motivo desconhecido" },
        ],
      },
    });
    renderDialog();
    await upload("valor;motivo\na.com;cliente\nempresa;cliente\nx.com;outro");

    expect(await screen.findByText(/3 linha\(s\) para importar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^importar$/i }));

    const report = await screen.findByTestId("suppression-import-report");
    expect(importEntries).toHaveBeenCalledWith([
      { line: 2, value: "a.com", reason: "cliente" },
      { line: 3, value: "empresa", reason: "cliente" },
      { line: 4, value: "x.com", reason: "outro" },
    ]);
    expect(report).toHaveTextContent("1 aceitas, 2 ignoradas");
    expect(report).toHaveTextContent("Linha 3 (empresa): valor inválido");
    expect(report).toHaveTextContent("Linha 4 (x.com): motivo desconhecido");
  });

  it("CSV sem coluna de valor → erro, nada é enviado", async () => {
    renderDialog();
    await upload("nome;motivo\nfoo;cliente");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "coluna de domínio/e-mail não encontrada"
    );
    expect(screen.getByRole("button", { name: /^importar$/i })).toBeDisabled();
    expect(importEntries).not.toHaveBeenCalled();
  });

  it("erro da action aparece no dialog", async () => {
    importEntries.mockResolvedValue({ success: false, error: "Apenas gestores e diretores podem alterar a lista de supressão" });
    renderDialog();
    await upload("valor;motivo\na.com;cliente");
    await screen.findByText(/1 linha\(s\)/);
    await userEvent.click(screen.getByRole("button", { name: /^importar$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Apenas gestores/);
  });
});
