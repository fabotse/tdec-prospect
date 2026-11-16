/**
 * KnownContactsList / KnownContactForm / LinkedinLookupDialog / KnownContactsImportDialog
 * Story 25.1 - Contatos conhecidos
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { KnownContact } from "@/types/known-contact";

const mockUseKnownContacts = vi.fn();
vi.mock("@/hooks/use-known-contacts", () => ({
  useKnownContacts: () => mockUseKnownContacts(),
}));

const mockUseUser = vi.fn();
vi.mock("@/hooks/use-user", () => ({
  useUser: () => mockUseUser(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { KnownContactsList } from "@/components/radar/KnownContactsList";
import { KnownContactsImportDialog } from "@/components/radar/KnownContactsImportDialog";

beforeAll(() => {
  // Radix Select no jsdom
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const refetch = vi.fn();
const addContact = vi.fn();
const updateContact = vi.fn();
const removeContact = vi.fn();
const importContacts = vi.fn();
const findLinkedin = vi.fn();

const base: Omit<KnownContact, "id" | "full_name"> = {
  tenant_id: "t1",
  title: "CTO",
  company_name: "Acme",
  company_domain: "acme.com",
  linkedin_url: null,
  relation_type: "cliente_atual",
  source: "manual",
  lead_id: null,
  created_by: null,
  created_at: "2026-11-16T10:00:00Z",
  updated_at: "2026-11-16T10:00:00Z",
};

const contacts: KnownContact[] = [
  { ...base, id: "1", full_name: "João Silva" },
  {
    ...base,
    id: "2",
    full_name: "Maria Souza",
    company_name: "Beta",
    linkedin_url: "https://www.linkedin.com/in/maria",
    relation_type: "reuniao_marcada",
    source: "oportunidade",
  },
];

function listState(overrides: Record<string, unknown> = {}) {
  return {
    contacts,
    isLoading: false,
    error: null,
    refetch,
    addContact,
    updateContact,
    removeContact,
    importContacts,
    findLinkedin,
    isAdding: false,
    isUpdating: false,
    isRemoving: false,
    isImporting: false,
    isLookingUp: false,
    ...overrides,
  };
}

function asRole(isAdmin: boolean) {
  mockUseUser.mockReturnValue({ isAdmin, isLoading: false, isProfileLoading: false });
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  fields: { name: string; company?: string; linkedin?: string }
) {
  await user.type(screen.getByLabelText("Nome"), fields.name);
  if (fields.company) await user.type(screen.getByLabelText("Empresa"), fields.company);
  if (fields.linkedin) await user.type(screen.getByLabelText("LinkedIn"), fields.linkedin);
  await user.click(screen.getByRole("combobox", { name: /relação/i }));
  await user.click(await screen.findByRole("option", { name: "Ex-cliente" }));
}

describe("KnownContactsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseKnownContacts.mockReturnValue(listState());
    asRole(true);
  });

  it("loading", () => {
    mockUseKnownContacts.mockReturnValue(listState({ isLoading: true }));
    render(<KnownContactsList />);
    expect(screen.getByTestId("known-contacts-loading")).toBeInTheDocument();
  });

  it("TABELA_AUSENTE: erro com Tentar novamente", async () => {
    mockUseKnownContacts.mockReturnValue(
      listState({ error: "Os contatos conhecidos ainda não estão disponíveis neste ambiente" })
    );
    render(<KnownContactsList />);
    expect(screen.getByText(/ainda não estão disponíveis/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("known-contacts-retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("vazio", () => {
    mockUseKnownContacts.mockReturnValue(listState({ contacts: [] }));
    render(<KnownContactsList />);
    expect(screen.getByTestId("known-contacts-empty")).toBeInTheDocument();
    expect(screen.getByTestId("known-contacts-count")).toHaveTextContent("0 contatos");
  });

  it("tabela com rótulos e busca sem acento", () => {
    render(<KnownContactsList />);
    const table = screen.getByTestId("known-contacts-table");
    expect(within(table).getByText("João Silva")).toBeInTheDocument();
    expect(within(table).getByText("Reunião marcada")).toBeInTheDocument();
    expect(within(table).getByText("Oportunidade")).toBeInTheDocument();
    expect(within(table).getAllByText("16/11/2026")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/buscar nos contatos/i), {
      target: { value: "reuniao" },
    });
    expect(screen.queryByText("João Silva")).not.toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByTestId("known-contacts-count")).toHaveTextContent("1 de 2 contatos");

    fireEvent.change(screen.getByLabelText(/buscar nos contatos/i), {
      target: { value: "zzz" },
    });
    expect(screen.getByTestId("known-contacts-no-results")).toBeInTheDocument();
  });

  it("SDR: vê a tabela e a busca, sem nenhum botão de escrita", () => {
    asRole(false);
    render(<KnownContactsList />);
    expect(screen.getByTestId("known-contacts-table")).toBeInTheDocument();
    expect(screen.getByLabelText(/buscar nos contatos/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adicionar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /importar csv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remover/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buscar linkedin/i })).not.toBeInTheDocument();
  });

  it("perfil carregando: esconde a escrita", () => {
    mockUseUser.mockReturnValue({ isAdmin: true, isLoading: false, isProfileLoading: true });
    render(<KnownContactsList />);
    expect(screen.queryByRole("button", { name: /adicionar/i })).not.toBeInTheDocument();
  });

  it("ADD_COM_LINKEDIN: salva direto, sem busca", async () => {
    const user = userEvent.setup();
    addContact.mockResolvedValue({ success: true, data: contacts[0] });
    render(<KnownContactsList />);

    await user.click(screen.getByRole("button", { name: /adicionar/i }));
    await fillForm(user, {
      name: "Ana",
      company: "Acme",
      linkedin: "https://br.linkedin.com/in/Ana/",
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() =>
      expect(addContact).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "Ana",
          companyName: "Acme",
          linkedinUrl: "https://br.linkedin.com/in/Ana/",
          relationType: "ex_cliente",
        })
      )
    );
    expect(findLinkedin).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId("known-contact-form")).not.toBeInTheDocument()
    );
  });

  it("SEM_EMPRESA e LINKEDIN_INVALIDO: mostra o erro e não grava", async () => {
    const user = userEvent.setup();
    render(<KnownContactsList />);
    await user.click(screen.getByRole("button", { name: /adicionar/i }));
    await fillForm(user, { name: "Ana" });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe a empresa ou o domínio");

    await user.type(screen.getByLabelText("Empresa"), "Acme");
    await user.type(screen.getByLabelText("LinkedIn"), "linkedin.com/company/x");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "URL do LinkedIn inválida (use linkedin.com/in/...)"
    );
    expect(addContact).not.toHaveBeenCalled();
    expect(findLinkedin).not.toHaveBeenCalled();
  });

  it("ADD_SEM_LINKEDIN: abre candidatos; 'Usar este' grava com a URL escolhida", async () => {
    const user = userEvent.setup();
    findLinkedin.mockResolvedValue({
      success: true,
      data: {
        candidates: [
          {
            url: "https://www.linkedin.com/in/ana-a",
            title: "Ana A - CTO",
            snippet: "CTO na Acme",
          },
          { url: "https://www.linkedin.com/in/ana-b", title: "Ana B", snippet: "" },
        ],
      },
    });
    addContact.mockResolvedValue({ success: true, data: contacts[0] });
    render(<KnownContactsList />);

    await user.click(screen.getByRole("button", { name: /adicionar/i }));
    await fillForm(user, { name: "Ana", company: "Acme" });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText("Ana A - CTO")).toBeInTheDocument();
    expect(screen.getByText("CTO na Acme")).toBeInTheDocument();
    expect(findLinkedin).toHaveBeenCalledTimes(1);
    expect(findLinkedin).toHaveBeenCalledWith({
      fullName: "Ana",
      companyName: "Acme",
      companyDomain: "",
    });
    expect(addContact).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Usar este: https://www.linkedin.com/in/ana-b" })
    );
    await waitFor(() =>
      expect(addContact).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "Ana",
          linkedinUrl: "https://www.linkedin.com/in/ana-b",
          relationType: "ex_cliente",
        })
      )
    );
    await waitFor(() =>
      expect(screen.queryByTestId("linkedin-lookup-dialog")).not.toBeInTheDocument()
    );
  });

  it("ADD_SEM_LINKEDIN: 'Salvar sem LinkedIn' grava sem URL", async () => {
    const user = userEvent.setup();
    findLinkedin.mockResolvedValue({
      success: true,
      data: { candidates: [{ url: "https://www.linkedin.com/in/x", title: "X", snippet: "" }] },
    });
    addContact.mockResolvedValue({ success: true, data: contacts[0] });
    render(<KnownContactsList />);

    await user.click(screen.getByRole("button", { name: /adicionar/i }));
    await fillForm(user, { name: "Ana", company: "Acme" });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    await screen.findByText("X");

    await user.click(screen.getByRole("button", { name: /salvar sem linkedin/i }));
    await waitFor(() =>
      expect(addContact).toHaveBeenCalledWith(expect.objectContaining({ linkedinUrl: "" }))
    );
  });

  it("LOOKUP_VAZIO_OU_FALHA: mostra o motivo e só oferece salvar sem / cancelar", async () => {
    const user = userEvent.setup();
    findLinkedin.mockResolvedValue({
      success: false,
      error: "Nenhum perfil do LinkedIn encontrado para esse nome e empresa.",
    });
    render(<KnownContactsList />);

    await user.click(screen.getByRole("button", { name: /adicionar/i }));
    await fillForm(user, { name: "Ana", company: "Acme" });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    const dialog = await screen.findByTestId("linkedin-lookup-dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Nenhum perfil/);
    expect(within(dialog).queryByRole("button", { name: /usar este/i })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /salvar sem linkedin/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^cancelar$/i })).toBeInTheDocument();
  });

  it("DUPLICADO: toast com a mensagem da action e o dialog fica aberto", async () => {
    const user = userEvent.setup();
    addContact.mockResolvedValue({
      success: false,
      error: "Já existe um contato com esse LinkedIn",
    });
    render(<KnownContactsList />);

    await user.click(screen.getByRole("button", { name: /adicionar/i }));
    await fillForm(user, { name: "Ana", company: "Acme", linkedin: "linkedin.com/in/maria" });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Já existe um contato com esse LinkedIn")
    );
    expect(screen.getByTestId("known-contact-form")).toBeInTheDocument();
  });

  it("EDITAR: abre preenchido e salva pelo id, sem busca", async () => {
    const user = userEvent.setup();
    updateContact.mockResolvedValue({ success: true, data: contacts[0] });
    render(<KnownContactsList />);

    await user.click(screen.getByRole("button", { name: "Editar João Silva" }));
    const title = screen.getByLabelText("Cargo");
    expect(title).toHaveValue("CTO");
    await user.clear(title);
    await user.type(title, "CEO");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() =>
      expect(updateContact).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({ title: "CEO", relationType: "cliente_atual" })
      )
    );
    expect(findLinkedin).not.toHaveBeenCalled();
  });

  it("BUSCAR_DEPOIS: 'Usar este' atualiza o contato; sem 'Salvar sem LinkedIn'", async () => {
    const user = userEvent.setup();
    findLinkedin.mockResolvedValue({
      success: true,
      data: { candidates: [{ url: "https://www.linkedin.com/in/joao", title: "João", snippet: "" }] },
    });
    updateContact.mockResolvedValue({ success: true, data: contacts[0] });
    render(<KnownContactsList />);

    // Só o contato sem LinkedIn tem o botão
    expect(screen.getAllByRole("button", { name: /buscar linkedin/i })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Buscar LinkedIn de João Silva" }));
    await screen.findByText("João");
    expect(screen.queryByRole("button", { name: /salvar sem linkedin/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /usar este/i }));
    await waitFor(() =>
      expect(updateContact).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          fullName: "João Silva",
          linkedinUrl: "https://www.linkedin.com/in/joao",
        })
      )
    );
  });

  it("remover pede confirmação", async () => {
    const user = userEvent.setup();
    removeContact.mockResolvedValue({ success: true });
    render(<KnownContactsList />);

    await user.click(screen.getByRole("button", { name: "Remover João Silva" }));
    expect(removeContact).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: /^remover$/i }));
    await waitFor(() => expect(removeContact).toHaveBeenCalledWith("1"));
    expect(toast.success).toHaveBeenCalled();
  });
});

describe("KnownContactsImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderDialog() {
    render(
      <KnownContactsImportDialog
        open
        onOpenChange={vi.fn()}
        onImport={importContacts}
        isImporting={false}
      />
    );
  }

  async function upload(content: string, name = "contatos.csv") {
    const input = screen.getByLabelText(/arquivo/i) as HTMLInputElement;
    await userEvent.upload(input, new File([content], name, { type: "text/csv" }));
    return input;
  }

  it("CSV_SEM_COLUNA: erro e nada é enviado", async () => {
    renderDialog();
    await upload("empresa;cargo\nAcme;CTO");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "colunas obrigatórias: nome e relação"
    );
    expect(screen.getByRole("button", { name: /^importar$/i })).toBeDisabled();
  });

  it("envia as linhas e mostra o relatório com linha e motivo", async () => {
    importContacts.mockResolvedValue({
      success: true,
      data: {
        accepted: 1,
        skipped: [{ line: 3, value: "Bia", reason: "relação desconhecida" }],
      },
    });
    renderDialog();
    await upload("nome;cargo;empresa;dominio;linkedin;relacao\nAna;CTO;Acme;;;cliente\nBia;;X;;;foo");
    await screen.findByText(/2 linha\(s\) para importar/);
    await userEvent.click(screen.getByRole("button", { name: /^importar$/i }));

    await waitFor(() => expect(importContacts).toHaveBeenCalledTimes(1));
    expect(importContacts.mock.calls[0][0][0]).toMatchObject({
      line: 2,
      fullName: "Ana",
      companyName: "Acme",
      relation: "cliente",
    });
    const report = await screen.findByTestId("known-contacts-import-report");
    expect(report).toHaveTextContent("1 aceitas");
    expect(report).toHaveTextContent("1 ignoradas");
    expect(report).toHaveTextContent("Linha 3 (Bia): relação desconhecida");
  });

  it("erro da action aparece no dialog", async () => {
    importContacts.mockResolvedValue({ success: false, error: "Apenas gestores e diretores…" });
    renderDialog();
    await upload("nome;relacao\nAna;cliente");
    await screen.findByText(/1 linha\(s\)/);
    await userEvent.click(screen.getByRole("button", { name: /^importar$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Apenas gestores/);
  });
});
