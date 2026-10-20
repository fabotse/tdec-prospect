/**
 * ProofsForm Component Tests
 * Story 24.7: Seção de Provas na Knowledge Base
 *
 * AC: #1 - lista com badge de autorização, criar (com switch) e excluir
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KnowledgeBaseProof } from "@/types/knowledge-base";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockCreateProof = vi.fn();
const mockUpdateProof = vi.fn();
const mockDeleteProof = vi.fn();

vi.mock("@/hooks/use-knowledge-base-proofs", () => ({
  useKnowledgeBaseProofs: vi.fn(),
}));

import { useKnowledgeBaseProofs } from "@/hooks/use-knowledge-base-proofs";
import { ProofsForm } from "@/components/settings/ProofsForm";

const authorizedProof: KnowledgeBaseProof = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "t1",
  proof_type: "case",
  text: "Acme reduziu 30% do retrabalho",
  sector: "Indústria",
  is_authorized: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const unauthorizedProof: KnowledgeBaseProof = {
  ...authorizedProof,
  id: "22222222-2222-4222-8222-222222222222",
  proof_type: "numero",
  text: "1.000 clientes atendidos",
  sector: null,
  is_authorized: false,
};

function mockHook(overrides: Partial<ReturnType<typeof useKnowledgeBaseProofs>> = {}) {
  vi.mocked(useKnowledgeBaseProofs).mockReturnValue({
    proofs: [],
    isLoading: false,
    error: null,
    createProof: mockCreateProof,
    updateProof: mockUpdateProof,
    deleteProof: mockDeleteProof,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    ...overrides,
  });
}

describe("ProofsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook();
  });

  it("renders empty state when there are no proofs", () => {
    render(<ProofsForm />);
    expect(screen.getByText("Nenhuma prova cadastrada")).toBeInTheDocument();
  });

  it("renders loading skeleton", () => {
    mockHook({ isLoading: true });
    render(<ProofsForm />);
    expect(screen.getByTestId("proofs-skeleton")).toBeInTheDocument();
  });

  it("renders error state", () => {
    mockHook({ error: "Erro ao buscar provas" });
    render(<ProofsForm />);
    expect(screen.getByRole("alert")).toHaveTextContent("Erro ao buscar provas");
  });

  it("lists proofs with type, sector and authorization badge", () => {
    mockHook({ proofs: [authorizedProof, unauthorizedProof] });
    render(<ProofsForm />);

    expect(screen.getByText("Acme reduziu 30% do retrabalho")).toBeInTheDocument();
    expect(screen.getByText("1.000 clientes atendidos")).toBeInTheDocument();
    expect(screen.getByText("Case")).toBeInTheDocument();
    expect(screen.getByText("Número")).toBeInTheDocument();
    expect(screen.getByText("Setor: Indústria")).toBeInTheDocument();
    expect(screen.getByText("Autorizado")).toBeInTheDocument();
    expect(screen.getByText("Não autorizado")).toBeInTheDocument();
  });

  it("creates a proof with the authorization switch turned on", async () => {
    const user = userEvent.setup();
    mockCreateProof.mockResolvedValue({ success: true, data: authorizedProof });
    render(<ProofsForm />);

    await user.click(screen.getByRole("button", { name: /Adicionar Prova/ }));

    const toggle = screen.getByRole("switch", { name: "Autorizado para uso" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.type(screen.getByLabelText("Texto da prova"), "Acme reduziu 30% do retrabalho");
    await user.type(screen.getByLabelText("Setor (opcional)"), "Indústria");
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => {
      expect(mockCreateProof).toHaveBeenCalledWith({
        proof_type: "case",
        text: "Acme reduziu 30% do retrabalho",
        sector: "Indústria",
        is_authorized: true,
      });
    });
  });

  it("does not submit an empty text", async () => {
    const user = userEvent.setup();
    render(<ProofsForm />);

    await user.click(screen.getByRole("button", { name: /Adicionar Prova/ }));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText("Texto da prova é obrigatório")).toBeInTheDocument();
    expect(mockCreateProof).not.toHaveBeenCalled();
  });

  it("edits a proof", async () => {
    const user = userEvent.setup();
    mockHook({ proofs: [authorizedProof] });
    mockUpdateProof.mockResolvedValue({ success: true, data: authorizedProof });
    render(<ProofsForm />);

    await user.click(screen.getByLabelText("Editar prova"));
    const textarea = screen.getByLabelText("Texto da prova");
    await user.clear(textarea);
    await user.type(textarea, "Texto atualizado");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(mockUpdateProof).toHaveBeenCalledWith(
        authorizedProof.id,
        expect.objectContaining({ text: "Texto atualizado", is_authorized: true })
      );
    });
  });

  it("deletes a proof after confirmation", async () => {
    const user = userEvent.setup();
    mockHook({ proofs: [authorizedProof] });
    mockDeleteProof.mockResolvedValue({ success: true });
    render(<ProofsForm />);

    await user.click(screen.getByLabelText("Excluir prova"));
    await user.click(screen.getByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(mockDeleteProof).toHaveBeenCalledWith(authorizedProof.id);
    });
  });
});
