/**
 * IcebreakerExamplesForm Component Tests
 * Story 9.2: Exemplos de Referencia para Ice Breakers no Knowledge Base
 *
 * AC: #1 - Dedicated section for icebreaker examples
 * AC: #2 - CRUD UI with text + category
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the hook
const mockCreateExample = vi.fn();
const mockUpdateExample = vi.fn();
const mockDeleteExample = vi.fn();

vi.mock("@/hooks/use-icebreaker-examples", () => ({
  useIcebreakerExamples: vi.fn(() => ({
    examples: [],
    isLoading: false,
    error: null,
    createExample: mockCreateExample,
    updateExample: mockUpdateExample,
    deleteExample: mockDeleteExample,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  })),
}));

import { useIcebreakerExamples } from "@/hooks/use-icebreaker-examples";
import { IcebreakerExamplesForm } from "@/components/settings/IcebreakerExamplesForm";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("IcebreakerExamplesForm", () => {
  const mockExample = {
    id: "1",
    tenant_id: "t1",
    text: "Vi que a Acme Corp está expandindo para o mercado de SaaS.",
    category: "empresa" as const,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });
  });

  it("renders empty state when no examples", () => {
    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    expect(
      screen.getByText("Nenhum exemplo de Ice Breaker cadastrado")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Adicionar Exemplo de Ice Breaker")
    ).toBeInTheDocument();
  });

  it("renders loading skeleton when isLoading", () => {
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [],
      isLoading: true,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    const { container } = render(<IcebreakerExamplesForm />, {
      wrapper: createWrapper(),
    });

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state", () => {
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [],
      isLoading: false,
      error: "Erro ao buscar exemplos",
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Erro ao buscar exemplos")).toBeInTheDocument();
  });

  it("renders example cards when examples exist", () => {
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    expect(
      screen.getByText(
        "Vi que a Acme Corp está expandindo para o mercado de SaaS."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Empresa")).toBeInTheDocument();
  });

  it("renders category badge for examples with category", () => {
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    expect(screen.getByText("Empresa")).toBeInTheDocument();
  });

  it("does not render category badge for examples without category", () => {
    const exampleWithoutCategory = { ...mockExample, category: null };
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [exampleWithoutCategory],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    // The text should be there but no badge
    expect(
      screen.getByText(
        "Vi que a Acme Corp está expandindo para o mercado de SaaS."
      )
    ).toBeInTheDocument();
    // No "Empresa" badge should be rendered
    expect(screen.queryByText("Empresa")).not.toBeInTheDocument();
  });

  it("opens add dialog when add button clicked", async () => {
    const user = userEvent.setup();

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    await user.click(
      screen.getByText("Adicionar Exemplo de Ice Breaker")
    );

    expect(
      screen.getByText("Adicionar Exemplo de Ice Breaker", { selector: "h2" })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Texto do Ice Breaker")
    ).toBeInTheDocument();
  });

  it("opens edit dialog when edit button clicked", async () => {
    const user = userEvent.setup();

    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    await user.click(screen.getByLabelText("Editar exemplo"));

    expect(
      screen.getByText("Editar Exemplo de Ice Breaker")
    ).toBeInTheDocument();
  });

  it("opens delete confirmation dialog", async () => {
    const user = userEvent.setup();

    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    await user.click(screen.getByLabelText("Excluir exemplo"));

    expect(screen.getByText("Remover exemplo?")).toBeInTheDocument();
    expect(
      screen.getByText(/O exemplo de ice breaker será removido permanentemente/)
    ).toBeInTheDocument();
  });

  it("renders edit and delete buttons for each example", () => {
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    expect(screen.getByLabelText("Editar exemplo")).toBeInTheDocument();
    expect(screen.getByLabelText("Excluir exemplo")).toBeInTheDocument();
  });

  it("renders add button when examples exist", () => {
    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    expect(screen.getByText("Adicionar Exemplo")).toBeInTheDocument();
  });

  it("calls createExample with form data on add submit", async () => {
    const user = userEvent.setup();
    mockCreateExample.mockResolvedValue({ success: true, data: mockExample });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    // Open add dialog
    await user.click(screen.getByText("Adicionar Exemplo de Ice Breaker"));

    // Fill in text
    const textarea = screen.getByLabelText("Texto do Ice Breaker");
    await user.type(textarea, "Novo ice breaker de teste");

    // Submit form
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => {
      expect(mockCreateExample).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Novo ice breaker de teste",
        })
      );
    });
  });

  it("calls updateExample with form data on edit submit", async () => {
    const user = userEvent.setup();
    mockUpdateExample.mockResolvedValue({ success: true, data: { ...mockExample, text: "Atualizado" } });

    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    // Open edit dialog
    await user.click(screen.getByLabelText("Editar exemplo"));

    // Modify text
    const textarea = screen.getByLabelText("Texto do Ice Breaker");
    await user.clear(textarea);
    await user.type(textarea, "Texto atualizado");

    // Submit form
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(mockUpdateExample).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          text: "Texto atualizado",
        })
      );
    });
  });

  it("calls deleteExample on delete confirmation", async () => {
    const user = userEvent.setup();
    mockDeleteExample.mockResolvedValue({ success: true });

    vi.mocked(useIcebreakerExamples).mockReturnValue({
      examples: [mockExample],
      isLoading: false,
      error: null,
      createExample: mockCreateExample,
      updateExample: mockUpdateExample,
      deleteExample: mockDeleteExample,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(<IcebreakerExamplesForm />, { wrapper: createWrapper() });

    // Open delete dialog
    await user.click(screen.getByLabelText("Excluir exemplo"));

    // Confirm delete
    await user.click(screen.getByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(mockDeleteExample).toHaveBeenCalledWith("1");
    });
  });
});
